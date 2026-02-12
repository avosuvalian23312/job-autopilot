// backend/src/functions/applyPrepare.js
"use strict";

const { CosmosClient } = require("@azure/cosmos");
const { BlobServiceClient } = require("@azure/storage-blob");
const { PDFDocument, StandardFonts } = require("pdf-lib");

const { callAoaiChat, safeJsonParse } = require("../lib/aoai");
const { extractPdfLayout } = require("../lib/pdfTailor");

// ---------------------------
// Helpers
// ---------------------------
function log(context, ...args) {
  try {
    if (context && typeof context.log === "function") return context.log(...args);
  } catch {
    // ignore
  }
  // eslint-disable-next-line no-console
  console.log(...args);
}

function safeUserId(userId) {
  return String(userId || "").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function stripQuery(url) {
  if (!url) return "";
  try {
    const u = new URL(url);
    u.search = "";
    return u.toString();
  } catch {
    return String(url).split("?")[0];
  }
}

function getSwaUser(request) {
  // Try existing lib first
  try {
    const mod = require("../lib/swaUser");
    if (typeof mod.getSwaUser === "function") return mod.getSwaUser(request);
    if (typeof mod.swaUser === "function") return mod.swaUser(request);
  } catch {
    // ignore
  }

  const header =
    request.headers.get("x-ms-client-principal") ||
    request.headers.get("X-MS-CLIENT-PRINCIPAL");

  if (!header) return null;

  try {
    const decoded = Buffer.from(header, "base64").toString("utf8");
    const principal = JSON.parse(decoded);

    if (!principal?.userId) return null;

    const email =
      principal.claims?.find((c) => c.typ === "emails")?.val ||
      principal.userDetails ||
      "";

    return { userId: principal.userId, email };
  } catch {
    return null;
  }
}

async function downloadBlobToBuffer(connectionString, containerName, blobName) {
  const blobService = BlobServiceClient.fromConnectionString(connectionString);
  const container = blobService.getContainerClient(containerName);
  const blobClient = container.getBlobClient(blobName);

  const res = await blobClient.download();
  if (!res.readableStreamBody) return Buffer.from([]);

  const chunks = [];
  return await new Promise((resolve, reject) => {
    res.readableStreamBody.on("data", (d) => chunks.push(d));
    res.readableStreamBody.on("end", () => resolve(Buffer.concat(chunks)));
    res.readableStreamBody.on("error", reject);
  });
}

async function uploadPdfBuffer(connectionString, containerName, blobName, buffer) {
  const blobService = BlobServiceClient.fromConnectionString(connectionString);
  const container = blobService.getContainerClient(containerName);
  await container.createIfNotExists();

  const block = container.getBlockBlobClient(blobName);
  await block.uploadData(buffer, {
    blobHTTPHeaders: { blobContentType: "application/pdf" },
  });

  return stripQuery(block.url);
}

/**
 * pdf-lib standard fonts use WinAnsi encoding.
 * This sanitizer keeps content safe and prevents the broken "..." / unicode bullets.
 */
function toWinAnsiSafe(input) {
  let s = String(input || "");

  s = s.replace(/\r\n/g, "\n").replace(/\u00A0/g, " ");
  s = s
    .replace(/[“”„]/g, '"')
    .replace(/[’‘‚]/g, "'")
    .replace(/[–—−]/g, "-")
    .replace(/…/g, ".")
    .replace(/[●•◦∙·]/g, "-");

  // remove sequences like "..." which look like truncation
  s = s.replace(/\.{2,}/g, ".");

  // remove unsupported unicode (keep ASCII + Latin-1)
  s = s.replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");

  // collapse spaces
  s = s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

  return s;
}

function cleanBullet(b) {
  let s = toWinAnsiSafe(b);

  // remove leading bullet marks (we draw our own "- ")
  s = s.replace(/^[-*]\s+/, "").trim();

  // prevent trailing "for" / awkward incomplete endings
  s = s.replace(/\bfor\s*$/i, "").trim();

  // ensure ends cleanly
  if (s && !/[.!?]$/.test(s)) s += ".";
  return s;
}

/**
 * Build a resume text summary from extracted layout.
 * Used to ground AOAI (no hallucinations).
 */
function buildResumeTextFromLayout(layout, { maxChars = 16000 } = {}) {
  const parts = [];
  for (const pg of layout?.pages || []) {
    const lines = Array.isArray(pg.lines) ? pg.lines : [];
    for (const l of lines) {
      const t = String(l?.text || "").trim();
      if (t) parts.push(t);
    }
  }
  const full = parts.join("\n");
  if (full.length <= maxChars) return full;
  return full.slice(0, maxChars);
}

/**
 * Extract job fields (strict).
 */
async function extractJobWithAoai(jobDescriptionClean) {
  const system = `
You extract structured job posting fields from text.

Return ONLY valid JSON with EXACT keys:
jobTitle (string|null),
company (string|null),
website (string|null),
location (string|null),
seniority (string|null),
keywords (string[]),
requirements (object|null) with keys:
  skillsRequired (string[]),
  skillsPreferred (string[]),
  educationRequired (string|null),
  yearsExperienceMin (number|null),
  certificationsPreferred (string[]),
  workModelRequired (string|null)
payMin (number|null),
payMax (number|null),
payPeriod (string|null)
payCurrency (string|null)

Rules:
- jobTitle must be the actual role name. Never return generic words like "individuals".
- website must prefer an explicit "Website:" field or the company's official site. Do NOT pick social links.
- Do NOT invent pay. Only set pay fields if explicitly stated.
- Use null/[] when unknown.
No extra keys. No markdown.
`.trim();

  const user = `JOB DESCRIPTION:\n${jobDescriptionClean}`;

  const { content } = await callAoaiChat({
    system,
    user,
    temperature: 0.1,
    max_tokens: 900,
  });

  return safeJsonParse(content) || {};
}

/**
 * Build a structured, ATS-style resume draft from resume text + job data.
 * IMPORTANT: must be grounded in resume text; no hallucinations.
 */
async function buildTailoredResumeDraft({ jobData, resumeText, profile, aiMode, studentMode }) {
  const system = `
You are an expert ATS resume writer.

Return ONLY valid JSON with EXACT keys:
{
  "header": {
    "fullName": string|null,
    "headline": string|null,
    "location": string|null,
    "phone": string|null,
    "email": string|null,
    "linkedin": string|null,
    "portfolio": string|null
  },
  "summary": string[],                 // 3-4 lines max
  "skills": [
    { "category": string, "items": string[] }  // categories like "Support", "Microsoft 365", "Networking", etc.
  ],
  "experience": [
    {
      "title": string|null,
      "company": string|null,
      "location": string|null,
      "dates": string|null,
      "bullets": string[]              // 4-6 bullets max per role, grounded in resume text
    }
  ],
  "education": [
    { "school": string|null, "degree": string|null, "dates": string|null, "details": string[] }
  ],
  "certifications": string[],
  "projects": [
    { "name": string|null, "bullets": string[] }
  ]
}

RULES (VERY IMPORTANT):
- Use ONLY information supported by RESUME TEXT or PROFILE. Do NOT invent employers, dates, degrees, tools, certs, or achievements.
- You MAY rephrase bullets for clarity and ATS alignment, but keep them truthful.
- Do NOT use "..." anywhere.
- Bullets must be complete sentences or strong phrases; never end with "for" or incomplete fragments.
- Keep bullets concise: ideally <= 110 characters each.
- Prioritize skills/keywords that match JOB DATA.
- If studentMode is true, emphasize projects/coursework and reduce reliance on work experience claims.
- If aiMode is "elite", still do NOT invent facts.
No markdown. JSON only.
`.trim();

  const user = `
AI MODE: ${aiMode || "standard"}
STUDENT MODE: ${studentMode ? "true" : "false"}

PROFILE (trusted):
${JSON.stringify(profile || {}, null, 2)}

JOB DATA:
${JSON.stringify(jobData || {}, null, 2)}

RESUME TEXT (ground truth):
${String(resumeText || "")}
`.trim();

  const { content } = await callAoaiChat({
    system,
    user,
    temperature: 0.25,
    max_tokens: 1400,
  });

  const parsed = safeJsonParse(content) || {};
  return parsed;
}

function safeStr(x) {
  const s = toWinAnsiSafe(x);
  return s || "";
}

function uniqStrings(arr, { max = 30 } = {}) {
  const out = [];
  const seen = new Set();
  for (const v of Array.isArray(arr) ? arr : []) {
    const s = safeStr(v);
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Render an ATS-friendly PDF from the tailored resume draft.
 * Avoids broken in-place PDF overlays completely.
 */
async function renderAtsPdf(draft) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageSize = [612, 792]; // US Letter
  let page = pdfDoc.addPage(pageSize);

  const marginX = 54;
  const marginTop = 54;
  const marginBottom = 54;

  let y = page.getHeight() - marginTop;

  const drawLine = (text, { size = 11, bold = false, indent = 0, gap = 1.25 } = {}) => {
    const f = bold ? fontBold : font;
    const s = safeStr(text);
    if (!s) return;

    const lh = size * gap;

    if (y - lh < marginBottom) {
      page = pdfDoc.addPage(pageSize);
      y = page.getHeight() - marginTop;
    }

    page.drawText(s, {
      x: marginX + indent,
      y: y - size,
      size,
      font: f,
    });

    y -= lh;
  };

  const wrap = (text, maxWidth, size, bold = false) => {
    const f = bold ? fontBold : font;
    const words = safeStr(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = "";

    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      const width = f.widthOfTextAtSize(test, size);
      if (width <= maxWidth) {
        cur = test;
      } else {
        if (cur) lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  };

  const drawWrapped = (text, { size = 11, bold = false, indent = 0, maxWidth, gap = 1.25 } = {}) => {
    const width = maxWidth || (page.getWidth() - marginX * 2 - indent);
    const lines = wrap(text, width, size, bold);
    for (const ln of lines) drawLine(ln, { size, bold, indent, gap });
  };

  const drawSection = (title) => {
    y -= 6;
    drawLine(title, { size: 12, bold: true, gap: 1.1 });
    y -= 2;
  };

  const h = draft?.header || {};
  const fullName = safeStr(h.fullName) || "Resume";
  const headline = safeStr(h.headline);

  // Header
  drawLine(fullName, { size: 16, bold: true, gap: 1.15 });
  if (headline) drawLine(headline, { size: 11, bold: false, gap: 1.15 });

  const contactBits = [
    safeStr(h.location),
    safeStr(h.phone),
    safeStr(h.email),
    safeStr(h.linkedin),
    safeStr(h.portfolio),
  ].filter(Boolean);

  if (contactBits.length) {
    drawWrapped(contactBits.join(" | "), { size: 10.5, maxWidth: page.getWidth() - marginX * 2 });
  }

  y -= 8;

  // Summary
  const summary = uniqStrings(draft?.summary, { max: 4 });
  if (summary.length) {
    drawSection("PROFESSIONAL SUMMARY");
    for (const s of summary) drawWrapped(s, { size: 10.8, maxWidth: page.getWidth() - marginX * 2 });
  }

  // Skills
  const skills = Array.isArray(draft?.skills) ? draft.skills : [];
  if (skills.length) {
    drawSection("TECHNICAL SKILLS");
    for (const cat of skills.slice(0, 10)) {
      const category = safeStr(cat?.category);
      const items = uniqStrings(cat?.items, { max: 12 });
      if (!category || !items.length) continue;

      drawLine(category + ":", { size: 10.8, bold: true, gap: 1.2 });
      drawWrapped(items.join(", "), { size: 10.6, indent: 12, maxWidth: page.getWidth() - marginX * 2 - 12 });
      y -= 2;
    }
  }

  // Experience
  const exp = Array.isArray(draft?.experience) ? draft.experience : [];
  if (exp.length) {
    drawSection("EXPERIENCE");
    for (const role of exp.slice(0, 6)) {
      const title = safeStr(role?.title);
      const company = safeStr(role?.company);
      const loc = safeStr(role?.location);
      const dates = safeStr(role?.dates);

      const headerLeft = [title, company].filter(Boolean).join(" — ");
      const headerRight = [loc, dates].filter(Boolean).join(" | ");

      if (headerLeft) drawLine(headerLeft, { size: 11, bold: true, gap: 1.2 });
      if (headerRight) drawLine(headerRight, { size: 10.5, bold: false, gap: 1.2 });

      const bullets = uniqStrings(role?.bullets, { max: 6 }).map(cleanBullet).filter(Boolean);
      for (const b of bullets) {
        // bullet wrap: first line "- ", following lines indent
        const bulletPrefix = "- ";
        const maxWidth = page.getWidth() - marginX * 2 - 14;
        const lines = wrap(b, maxWidth, 10.6, false);

        if (lines.length) {
          drawLine(bulletPrefix + lines[0], { size: 10.6, indent: 0, gap: 1.25 });
          for (const ln of lines.slice(1)) {
            drawLine("  " + ln, { size: 10.6, indent: 14, gap: 1.25 });
          }
        }
      }
      y -= 4;
    }
  }

  // Education
  const edu = Array.isArray(draft?.education) ? draft.education : [];
  if (edu.length) {
    drawSection("EDUCATION");
    for (const e of edu.slice(0, 4)) {
      const school = safeStr(e?.school);
      const degree = safeStr(e?.degree);
      const dates = safeStr(e?.dates);

      const line = [degree, school].filter(Boolean).join(" — ");
      if (line) drawLine(line, { size: 10.8, bold: true, gap: 1.2 });
      if (dates) drawLine(dates, { size: 10.5, gap: 1.2 });

      const details = uniqStrings(e?.details, { max: 4 });
      for (const d of details) drawWrapped(d, { size: 10.5, indent: 12 });
      y -= 3;
    }
  }

  // Certifications
  const certs = uniqStrings(draft?.certifications, { max: 12 });
  if (certs.length) {
    drawSection("CERTIFICATIONS");
    for (const c of certs) drawLine("- " + safeStr(c), { size: 10.6, gap: 1.25 });
  }

  // Projects (optional)
  const projects = Array.isArray(draft?.projects) ? draft.projects : [];
  const anyProjects = projects.some((p) => safeStr(p?.name) || (Array.isArray(p?.bullets) && p.bullets.length));
  if (anyProjects) {
    drawSection("PROJECTS");
    for (const p of projects.slice(0, 4)) {
      const name = safeStr(p?.name);
      if (name) drawLine(name, { size: 10.8, bold: true, gap: 1.2 });

      const bullets = uniqStrings(p?.bullets, { max: 4 }).map(cleanBullet).filter(Boolean);
      for (const b of bullets) {
        const lines = wrap(b, page.getWidth() - marginX * 2 - 14, 10.6, false);
        if (lines.length) {
          drawLine("- " + lines[0], { size: 10.6, gap: 1.25 });
          for (const ln of lines.slice(1)) drawLine("  " + ln, { size: 10.6, indent: 14, gap: 1.25 });
        }
      }
      y -= 3;
    }
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

async function tryLoadUserProfile(cosmos, dbName, userId) {
  const containerName = process.env.COSMOS_USER_SETTINGS_CONTAINER_NAME || "userSettings";

  try {
    const container = cosmos.database(dbName).container(containerName);
    const q = {
      query: "SELECT TOP 1 * FROM c WHERE c.userId = @uid",
      parameters: [{ name: "@uid", value: userId }],
    };
    const { resources } = await container.items.query(q).fetchAll();
    const doc = resources?.[0] || null;
    if (!doc) return {};

    const profile = doc.profile && typeof doc.profile === "object" ? doc.profile : doc;
    const links = doc.links && typeof doc.links === "object" ? doc.links : doc;

    return {
      fullName: profile.fullName || doc.fullName || "",
      email: profile.email || doc.email || "",
      phone: profile.phone || doc.phone || "",
      location: profile.location || doc.location || "",
      linkedin: links.linkedin || doc.linkedin || "",
      portfolio: links.portfolio || doc.portfolio || "",
    };
  } catch {
    return {};
  }
}

/**
 * Generate a tailored cover letter (grounded).
 */
async function generateCoverLetter({ jobData, resumeText, profile }) {
  const system = `
Write a tailored cover letter for the job described.
Return ONLY JSON:
{ "text": "..." }

Rules:
- 250–400 words.
- Mention jobTitle and company if available.
- Professional tone.
- Pull skill themes from resume text; do NOT invent credentials.
- No markdown. JSON only.
`.trim();

  const user = `
PROFILE (trusted):
${JSON.stringify(profile || {}, null, 2)}

JOB DATA:
${JSON.stringify(jobData || {}, null, 2)}

RESUME TEXT:
${String(resumeText || "")}
`.trim();

  const { content } = await callAoaiChat({
    system,
    user,
    temperature: 0.35,
    max_tokens: 750,
  });

  const parsed = safeJsonParse(content) || {};
  return String(parsed.text || "").trim();
}

async function applyPrepare(request, context) {
  try {
    if (request.method === "OPTIONS") return { status: 204 };

    const COSMOS_CONNECTION_STRING = process.env.COSMOS_CONNECTION_STRING;
    const COSMOS_DB_NAME = process.env.COSMOS_DB_NAME;
    const COSMOS_RESUMES_CONTAINER_NAME = process.env.COSMOS_RESUMES_CONTAINER_NAME;
    const COSMOS_COVERLETTERS_CONTAINER_NAME =
      process.env.COSMOS_COVERLETTERS_CONTAINER_NAME || "coverLetters";

    const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const BLOB_RESUMES_CONTAINER = process.env.BLOB_RESUMES_CONTAINER || "resumes";

    if (!COSMOS_CONNECTION_STRING) {
      return { status: 500, jsonBody: { ok: false, error: "Missing COSMOS_CONNECTION_STRING" } };
    }
    if (!COSMOS_DB_NAME) {
      return { status: 500, jsonBody: { ok: false, error: "Missing COSMOS_DB_NAME" } };
    }
    if (!COSMOS_RESUMES_CONTAINER_NAME) {
      return { status: 500, jsonBody: { ok: false, error: "Missing COSMOS_RESUMES_CONTAINER_NAME" } };
    }
    if (!AZURE_STORAGE_CONNECTION_STRING) {
      return { status: 500, jsonBody: { ok: false, error: "Missing AZURE_STORAGE_CONNECTION_STRING" } };
    }

    const user = getSwaUser(request);
    if (!user) {
      return { status: 401, jsonBody: { ok: false, error: "Not authenticated" } };
    }

    const body = await request.json().catch(() => ({}));
    const resumeId = String(body.resumeId || "").trim();
    const jobDescriptionRaw = String(body.jobDescription || "").trim();
    const jobUrl = String(body.jobUrl || "").trim();

    // optional knobs from frontend (safe defaults)
    const aiMode = String(body.aiMode || "standard").toLowerCase();
    const studentMode = !!body.studentMode;

    if (!resumeId) return { status: 400, jsonBody: { ok: false, error: "Missing resumeId" } };
    if (!jobDescriptionRaw) return { status: 400, jsonBody: { ok: false, error: "Missing jobDescription" } };

    const cosmos = new CosmosClient(COSMOS_CONNECTION_STRING);

    const resumesContainer = cosmos.database(COSMOS_DB_NAME).container(COSMOS_RESUMES_CONTAINER_NAME);
    const coverLettersContainer = cosmos.database(COSMOS_DB_NAME).container(COSMOS_COVERLETTERS_CONTAINER_NAME);

    // Load selected resume doc
    const read = await resumesContainer.item(resumeId, user.userId).read().catch(() => null);
    const resumeDoc = read?.resource || null;

    if (!resumeDoc) return { status: 404, jsonBody: { ok: false, error: "Resume not found" } };
    if (!resumeDoc.blobName) return { status: 400, jsonBody: { ok: false, error: "Resume doc missing blobName" } };
    if (String(resumeDoc.contentType || "").toLowerCase() !== "application/pdf") {
      return {
        status: 400,
        jsonBody: { ok: false, error: "Only PDF resumes supported." },
      };
    }

    // Download PDF bytes
    const pdfBuffer = await downloadBlobToBuffer(
      AZURE_STORAGE_CONNECTION_STRING,
      BLOB_RESUMES_CONTAINER,
      resumeDoc.blobName
    );

    if (!pdfBuffer || pdfBuffer.length === 0) {
      return { status: 500, jsonBody: { ok: false, error: "Failed to download resume PDF bytes" } };
    }

    // Extract resume text (ground truth)
    const pdfBytesForExtract = Buffer.isBuffer(pdfBuffer) ? new Uint8Array(pdfBuffer) : pdfBuffer;
    const layout = await extractPdfLayout(pdfBytesForExtract, { maxPages: 12 });
    const resumeText = buildResumeTextFromLayout(layout, { maxChars: 16000 });

    // Extract job data
    const jobData = await extractJobWithAoai(jobDescriptionRaw);

    // Load profile (trusted)
    const profile = await tryLoadUserProfile(cosmos, COSMOS_DB_NAME, user.userId);

    // Build tailored ATS resume draft (JSON)
    let draft = await buildTailoredResumeDraft({
      jobData,
      resumeText,
      profile,
      aiMode,
      studentMode,
    });

    // Fill missing header values from profile if needed
    draft = draft && typeof draft === "object" ? draft : {};
    draft.header = draft.header && typeof draft.header === "object" ? draft.header : {};
    draft.header.fullName = draft.header.fullName || profile.fullName || "";
    draft.header.email = draft.header.email || profile.email || user.email || "";
    draft.header.phone = draft.header.phone || profile.phone || "";
    draft.header.location = draft.header.location || profile.location || "";
    draft.header.linkedin = draft.header.linkedin || profile.linkedin || "";
    draft.header.portfolio = draft.header.portfolio || profile.portfolio || "";

    // Render ATS PDF (no broken overlays)
    const tailoredPdfBuffer = await renderAtsPdf(draft);

    // Upload tailored PDF
    const now = new Date();
    const ts = now.toISOString().replace(/[:.]/g, "-");
    const baseName = String(resumeDoc.originalName || resumeDoc.name || "resume.pdf").replace(/\.pdf$/i, "");
    const tailoredFileName = `${baseName}_TAILORED_${ts}.pdf`;
    const tailoredBlobName = `${safeUserId(user.userId)}/${Date.now()}_${tailoredFileName}`;

    const tailoredBlobUrl = await uploadPdfBuffer(
      AZURE_STORAGE_CONNECTION_STRING,
      BLOB_RESUMES_CONTAINER,
      tailoredBlobName,
      tailoredPdfBuffer
    );

    // Save tailored resume doc
    const tailoredResumeDoc = {
      id: `resume:${safeUserId(user.userId)}:${Date.now()}`,
      userId: user.userId,
      email: user.email,

      name: tailoredFileName,
      originalName: tailoredFileName,
      isDefault: false,

      sourceResumeId: resumeId,
      tailoredFor: {
        jobTitle: jobData?.jobTitle || null,
        company: jobData?.company || null,
        website: jobData?.website || null,
        jobUrl: jobUrl || null,
      },

      blobName: tailoredBlobName,
      blobUrl: tailoredBlobUrl,
      contentType: "application/pdf",
      size: tailoredPdfBuffer.length,

      atsKeywords: uniqStrings(jobData?.keywords, { max: 30 }),
      overlaysAppliedCount: 0,

      tailorMode: "regen-ats",
      uploadedAt: now.toISOString(),
      updated_date: now.toISOString().split("T")[0],
    };

    await resumesContainer.items.upsert(tailoredResumeDoc, { partitionKey: user.userId });

    // Cover letter
    const coverLetterText = await generateCoverLetter({ jobData, resumeText, profile });

    const coverLetterDoc = {
      id: `cl:${safeUserId(user.userId)}:${Date.now()}`,
      userId: user.userId,
      email: user.email,

      jobUrl: jobUrl || null,
      jobTitle: jobData?.jobTitle || null,
      company: jobData?.company || null,
      website: jobData?.website || null,
      location: jobData?.location || null,

      sourceResumeId: resumeId,
      tailoredResumeId: tailoredResumeDoc.id,

      atsKeywords: uniqStrings(jobData?.keywords, { max: 30 }),
      text: toWinAnsiSafe(coverLetterText || ""),

      createdAt: now.toISOString(),
      updated_date: now.toISOString().split("T")[0],
    };

    await coverLettersContainer.items.upsert(coverLetterDoc, { partitionKey: user.userId });

    return {
      status: 200,
      jsonBody: {
        ok: true,
        jobData,
        tailoredResume: tailoredResumeDoc,
        coverLetter: coverLetterDoc,
        overlaysApplied: [], // kept for backward compatibility
        misses: [],
      },
    };
  } catch (err) {
    log(context, "applyPrepare error:", err);

    const code = err?.code || "UNKNOWN";
    return {
      status: 500,
      jsonBody: {
        ok: false,
        error: "Internal Server Error",
        code,
        detail: err?.message || String(err),
      },
    };
  }
}

module.exports = { applyPrepare };
