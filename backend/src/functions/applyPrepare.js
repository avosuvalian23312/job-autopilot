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
 * This sanitizer keeps content safe and prevents broken unicode bullets / smart punctuation.
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

  // collapse spaces (but keep line breaks)
  s = s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

  return s;
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

function cleanBullet(b) {
  let s = toWinAnsiSafe(b);

  // remove leading bullet marks (we draw our own "- ")
  s = s.replace(/^[-*]\s+/, "").trim();

  // prevent trailing "for" / awkward incomplete endings
  s = s.replace(/\bfor\s*$/i, "").trim();

  // enforce no "..."
  s = s.replace(/\.{2,}/g, ".");

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
 * Extract a canonical full name from the source resume text.
 * This prevents the model from randomly changing the name (e.g., "Gavin").
 */
function detectCanonicalNameFromResumeText(resumeText) {
  const text = String(resumeText || "");
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 40);

  const looksLikeContact = (s) => {
    const t = s.toLowerCase();
    return (
      t.includes("@") ||
      t.includes("linkedin") ||
      t.includes("github") ||
      t.includes("portfolio") ||
      /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(s) ||
      /\b\d{1,5}\s+\w+/.test(s) // address-ish
    );
  };

  const scoreName = (s) => {
    // Prefer all-caps multi-word names, not too long, not contact-ish
    if (!s) return 0;
    if (looksLikeContact(s)) return 0;

    const words = s.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 5) return 0;

    // must mostly be letters
    const letters = s.replace(/[^A-Za-z]/g, "").length;
    if (letters < 6) return 0;

    const isAllCaps = s === s.toUpperCase() && /[A-Z]/.test(s);
    const isTitleCase =
      words.every((w) => /^[A-Z][a-z]+$/.test(w)) || words.some((w) => /^[A-Z][a-z]+$/.test(w));

    let score = 0;
    if (isAllCaps) score += 4;
    if (isTitleCase) score += 2;

    // penalize weird punctuation
    if (/[@|]/.test(s)) score -= 2;

    // shorter is usually better
    score += Math.max(0, 6 - words.length);

    return score;
  };

  let best = "";
  let bestScore = 0;

  for (const l of lines) {
    // ignore lines that are obviously headings (SUMMARY, SKILLS, etc.)
    if (/^(professional|technical|experience|education|certifications|projects)\b/i.test(l)) continue;

    const cleaned = l.replace(/\s{2,}/g, " ").trim();
    const sc = scoreName(cleaned);
    if (sc > bestScore) {
      bestScore = sc;
      best = cleaned;
    }
  }

  // normalize spacing and keep letters/spaces only (but preserve hyphen)
  best = best.replace(/[^A-Za-z\s-]/g, "").replace(/\s{2,}/g, " ").trim();

  // last sanity check
  if (best.split(/\s+/).length >= 2 && best.length >= 6) return best;
  return "";
}

function buildTargetKeywords(jobData) {
  const kw = [];
  const add = (v) => {
    const s = safeStr(v);
    if (!s) return;
    if (s.length > 40) return;
    kw.push(s);
  };

  for (const k of Array.isArray(jobData?.keywords) ? jobData.keywords : []) add(k);

  const req = jobData?.requirements && typeof jobData.requirements === "object" ? jobData.requirements : null;
  if (req) {
    for (const k of Array.isArray(req.skillsRequired) ? req.skillsRequired : []) add(k);
    for (const k of Array.isArray(req.skillsPreferred) ? req.skillsPreferred : []) add(k);
    for (const k of Array.isArray(req.certificationsPreferred) ? req.certificationsPreferred : []) add(k);
    add(req.educationRequired);
    add(req.workModelRequired);
  }

  // Deduplicate + cap
  return uniqStrings(kw, { max: 36 });
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
 *
 * This is PASS 1 (Draft).
 */
async function buildTailoredResumeDraft({
  jobData,
  resumeText,
  profile,
  aiMode,
  studentMode,
  canonicalFullName,
  targetKeywords,
}) {
  const system = `
You are an expert ATS resume writer and resume architect.

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

HARD CONSTRAINTS (DO NOT VIOLATE):
- The candidate's name MUST be exactly: CANONICAL_FULL_NAME (case preserved). Do NOT change it to another name.
- Use ONLY facts supported by RESUME TEXT or PROFILE. Do NOT invent employers, dates, degrees, tools, certs, titles, metrics, or achievements.
- No "..." anywhere. No truncations. No incomplete endings like "for".
- Bullets must be strong, complete phrases or sentences; action verb first; keep them tight.
- If you include metrics, they MUST be present in RESUME TEXT (no made-up numbers).
- Keep output designed to fit on 1 page (concise, no fluff).

QUALITY GOAL:
- Make the resume EXTREMELY tailored to JOB DATA.
- Weave TARGET_KEYWORDS naturally into Summary/Skills/Experience where truthful.
- Prioritize what recruiters scan: headline, summary, skills categories, then experience bullets.

AI MODE:
- If aiMode is "elite", you may rewrite more aggressively for impact, but still cannot add facts.
- If studentMode is true, emphasize projects/coursework and reduce reliance on work experience claims.

No markdown. JSON only.
`.trim();

  const user = `
CANONICAL_FULL_NAME: ${JSON.stringify(canonicalFullName || "")}

AI MODE: ${aiMode || "standard"}
STUDENT MODE: ${studentMode ? "true" : "false"}

TARGET_KEYWORDS (prioritize weaving these in naturally when truthful):
${JSON.stringify(targetKeywords || [], null, 2)}

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
    temperature: 0.28,
    max_tokens: 1600,
  });

  return safeJsonParse(content) || {};
}

/**
 * PASS 2 (Refine): make it more "experimental" / best possible:
 * - Stronger wording
 * - Better keyword coverage
 * - Cleaner categories
 * - Removes weak/filler bullets
 * Still grounded (no new facts).
 */
async function refineTailoredResumeDraft({
  draft,
  jobData,
  resumeText,
  profile,
  aiMode,
  studentMode,
  canonicalFullName,
  targetKeywords,
}) {
  const system = `
You are an expert resume editor and ATS optimizer.

You will receive:
- A draft resume JSON (same schema)
- JOB DATA and TARGET_KEYWORDS
- RESUME TEXT (ground truth)

Task:
Improve the draft to be the BEST possible resume for this specific job:
- Maximize relevance & ATS alignment
- Strengthen bullet verbs and specificity
- Remove fluff and redundancy
- Reorder content to match the job's priorities
- Ensure no broken/truncated phrases
- Ensure candidate name stays EXACT

Return ONLY JSON in the SAME schema as the draft.
Do NOT add new keys.

HARD CONSTRAINTS:
- header.fullName MUST equal CANONICAL_FULL_NAME exactly.
- Use ONLY facts supported by RESUME TEXT or PROFILE.
- No "..." anywhere. No incomplete "for".
- Bullets <= 110 characters preferred.
- Bullets must be complete and end cleanly (period is fine).
- Keep to 1 page: be concise.

No markdown. JSON only.
`.trim();

  const user = `
CANONICAL_FULL_NAME: ${JSON.stringify(canonicalFullName || "")}
AI MODE: ${aiMode || "standard"}
STUDENT MODE: ${studentMode ? "true" : "false"}

TARGET_KEYWORDS:
${JSON.stringify(targetKeywords || [], null, 2)}

JOB DATA:
${JSON.stringify(jobData || {}, null, 2)}

PROFILE (trusted):
${JSON.stringify(profile || {}, null, 2)}

RESUME TEXT (ground truth):
${String(resumeText || "")}

DRAFT JSON (to refine):
${JSON.stringify(draft || {}, null, 2)}
`.trim();

  const { content } = await callAoaiChat({
    system,
    user,
    temperature: 0.22,
    max_tokens: 1700,
  });

  return safeJsonParse(content) || {};
}

function normalizeDraft(draft, { canonicalFullName, profile, userEmail }) {
  const d = draft && typeof draft === "object" ? draft : {};

  const header = d.header && typeof d.header === "object" ? d.header : {};
  const out = {
    header: {
      fullName: safeStr(canonicalFullName || header.fullName || profile?.fullName || ""),
      headline: safeStr(header.headline),
      location: safeStr(header.location || profile?.location),
      phone: safeStr(header.phone || profile?.phone),
      email: safeStr(header.email || profile?.email || userEmail || ""),
      linkedin: safeStr(header.linkedin || profile?.linkedin),
      portfolio: safeStr(header.portfolio || profile?.portfolio),
    },
    summary: uniqStrings(d.summary, { max: 4 }).map((s) => cleanBullet(s).replace(/^- /, "")),
    skills: [],
    experience: [],
    education: [],
    certifications: uniqStrings(d.certifications, { max: 12 }),
    projects: [],
  };

  // Skills
  const skills = Array.isArray(d.skills) ? d.skills : [];
  for (const s of skills.slice(0, 12)) {
    const category = safeStr(s?.category);
    const items = uniqStrings(s?.items, { max: 14 });
    if (!category || !items.length) continue;
    out.skills.push({ category, items });
  }

  // Experience
  const exp = Array.isArray(d.experience) ? d.experience : [];
  for (const r of exp.slice(0, 6)) {
    const bullets = uniqStrings(r?.bullets, { max: 6 }).map(cleanBullet).filter(Boolean);
    out.experience.push({
      title: safeStr(r?.title),
      company: safeStr(r?.company),
      location: safeStr(r?.location),
      dates: safeStr(r?.dates),
      bullets,
    });
  }

  // Education
  const edu = Array.isArray(d.education) ? d.education : [];
  for (const e of edu.slice(0, 4)) {
    out.education.push({
      school: safeStr(e?.school),
      degree: safeStr(e?.degree),
      dates: safeStr(e?.dates),
      details: uniqStrings(e?.details, { max: 4 }).map((x) => cleanBullet(x).replace(/^- /, "")),
    });
  }

  // Projects
  const projects = Array.isArray(d.projects) ? d.projects : [];
  for (const p of projects.slice(0, 5)) {
    const name = safeStr(p?.name);
    const bullets = uniqStrings(p?.bullets, { max: 4 }).map(cleanBullet).filter(Boolean);
    if (!name && !bullets.length) continue;
    out.projects.push({ name, bullets });
  }

  // Final safety: ensure name never becomes empty if we have any profile/name data
  if (!out.header.fullName) out.header.fullName = safeStr(profile?.fullName || "Resume");

  return out;
}

/**
 * Render an ATS-friendly PDF from the tailored resume draft.
 * Single-column, clean wrap, consistent spacing.
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

  const lineHeight = (size, gap) => size * (gap || 1.25);

  const ensureSpace = (need) => {
    if (y - need < marginBottom) {
      page = pdfDoc.addPage(pageSize);
      y = page.getHeight() - marginTop;
    }
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

  const drawTextLine = (text, { size = 11, bold = false, indent = 0, gap = 1.25 } = {}) => {
    const s = safeStr(text);
    if (!s) return;

    const f = bold ? fontBold : font;
    const lh = lineHeight(size, gap);

    ensureSpace(lh);

    page.drawText(s, {
      x: marginX + indent,
      y: y - size,
      size,
      font: f,
    });

    y -= lh;
  };

  const drawWrapped = (text, { size = 11, bold = false, indent = 0, maxWidth, gap = 1.25 } = {}) => {
    const width = maxWidth || (page.getWidth() - marginX * 2 - indent);
    const lines = wrap(text, width, size, bold);
    for (const ln of lines) drawTextLine(ln, { size, bold, indent, gap });
  };

  const drawSection = (title) => {
    y -= 8;
    drawTextLine(title, { size: 12, bold: true, gap: 1.05 });
    // thin divider
    ensureSpace(8);
    page.drawLine({
      start: { x: marginX, y: y - 2 },
      end: { x: page.getWidth() - marginX, y: y - 2 },
      thickness: 0.75,
    });
    y -= 8;
  };

  const h = draft?.header || {};
  const fullName = safeStr(h.fullName) || "Resume";
  const headline = safeStr(h.headline);

  // Header
  drawTextLine(fullName, { size: 16, bold: true, gap: 1.15 });
  if (headline) drawWrapped(headline, { size: 11, gap: 1.15 });

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

  y -= 10;

  // Summary
  const summary = uniqStrings(draft?.summary, { max: 4 });
  if (summary.length) {
    drawSection("PROFESSIONAL SUMMARY");
    for (const s of summary) drawWrapped(cleanBullet(s).replace(/^- /, ""), { size: 10.8 });
  }

  // Skills
  const skills = Array.isArray(draft?.skills) ? draft.skills : [];
  if (skills.length) {
    drawSection("TECHNICAL SKILLS");
    for (const cat of skills.slice(0, 12)) {
      const category = safeStr(cat?.category);
      const items = uniqStrings(cat?.items, { max: 14 });
      if (!category || !items.length) continue;

      drawTextLine(category + ":", { size: 10.8, bold: true, gap: 1.2 });
      drawWrapped(items.join(", "), {
        size: 10.6,
        indent: 12,
        maxWidth: page.getWidth() - marginX * 2 - 12,
        gap: 1.25,
      });
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

      if (headerLeft) drawTextLine(headerLeft, { size: 11, bold: true, gap: 1.15 });
      if (headerRight) drawTextLine(headerRight, { size: 10.5, gap: 1.15 });

      const bullets = uniqStrings(role?.bullets, { max: 6 }).map(cleanBullet).filter(Boolean);
      for (const b of bullets) {
        const bulletPrefix = "- ";
        const maxWidth = page.getWidth() - marginX * 2 - 18;
        const lines = wrap(b, maxWidth, 10.6, false);

        if (lines.length) {
          drawTextLine(bulletPrefix + lines[0], { size: 10.6, gap: 1.22 });
          for (const ln of lines.slice(1)) {
            drawTextLine(ln, { size: 10.6, indent: 18, gap: 1.22 });
          }
        }
      }
      y -= 6;
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
      if (line) drawTextLine(line, { size: 10.8, bold: true, gap: 1.15 });
      if (dates) drawTextLine(dates, { size: 10.5, gap: 1.15 });

      const details = uniqStrings(e?.details, { max: 4 });
      for (const d of details) drawWrapped(cleanBullet(d).replace(/^- /, ""), { size: 10.5, indent: 12, gap: 1.2 });
      y -= 4;
    }
  }

  // Certifications
  const certs = uniqStrings(draft?.certifications, { max: 12 });
  if (certs.length) {
    drawSection("CERTIFICATIONS");
    for (const c of certs) drawTextLine("- " + safeStr(c), { size: 10.6, gap: 1.2 });
  }

  // Projects
  const projects = Array.isArray(draft?.projects) ? draft.projects : [];
  const anyProjects = projects.some(
    (p) => safeStr(p?.name) || (Array.isArray(p?.bullets) && p.bullets.length)
  );
  if (anyProjects) {
    drawSection("PROJECTS");
    for (const p of projects.slice(0, 5)) {
      const name = safeStr(p?.name);
      if (name) drawTextLine(name, { size: 10.8, bold: true, gap: 1.15 });

      const bullets = uniqStrings(p?.bullets, { max: 4 }).map(cleanBullet).filter(Boolean);
      for (const b of bullets) {
        const maxWidth = page.getWidth() - marginX * 2 - 18;
        const lines = wrap(b, maxWidth, 10.6, false);
        if (lines.length) {
          drawTextLine("- " + lines[0], { size: 10.6, gap: 1.22 });
          for (const ln of lines.slice(1)) drawTextLine(ln, { size: 10.6, indent: 18, gap: 1.22 });
        }
      }
      y -= 5;
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
- No "..." anywhere.
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
    temperature: 0.32,
    max_tokens: 800,
  });

  const parsed = safeJsonParse(content) || {};
  const text = String(parsed.text || "").trim();
  return toWinAnsiSafe(text);
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
      return { status: 400, jsonBody: { ok: false, error: "Only PDF resumes supported." } };
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

    // Load profile (trusted)
    const profile = await tryLoadUserProfile(cosmos, COSMOS_DB_NAME, user.userId);

    // Canonical name (prevents random name changes)
    const nameFromResume = detectCanonicalNameFromResumeText(resumeText);
    const canonicalFullName = safeStr(nameFromResume || profile.fullName || "").trim();

    // Extract job data
    const jobData = await extractJobWithAoai(jobDescriptionRaw);

    // Target keywords for ATS weaving (more aggressive)
    const targetKeywords = buildTargetKeywords(jobData);

    // PASS 1: Draft
    let draft = await buildTailoredResumeDraft({
      jobData,
      resumeText,
      profile,
      aiMode,
      studentMode,
      canonicalFullName,
      targetKeywords,
    });

    // PASS 2: Refine (more experimental / best possible)
    try {
      const refined = await refineTailoredResumeDraft({
        draft,
        jobData,
        resumeText,
        profile,
        aiMode,
        studentMode,
        canonicalFullName,
        targetKeywords,
      });
      if (refined && typeof refined === "object") draft = refined;
    } catch (e) {
      log(context, "refineTailoredResumeDraft failed; using draft:", e?.message || e);
    }

    // Normalize + sanitize output (and enforce name)
    const normalized = normalizeDraft(draft, {
      canonicalFullName,
      profile,
      userEmail: user.email,
    });

    // Render ATS PDF
    const tailoredPdfBuffer = await renderAtsPdf(normalized);

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

      atsKeywords: uniqStrings(targetKeywords, { max: 36 }),
      overlaysAppliedCount: 0,

      tailorMode: "regen-ats-v2",
      uploadedAt: now.toISOString(),
      updated_date: now.toISOString().split("T")[0],
    };

    await resumesContainer.items.upsert(tailoredResumeDoc, { partitionKey: user.userId });

    // Cover letter (grounded)
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

      atsKeywords: uniqStrings(targetKeywords, { max: 36 }),
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
