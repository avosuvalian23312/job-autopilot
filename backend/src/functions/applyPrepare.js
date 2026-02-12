// backend/src/functions/applyPrepare.js
"use strict";

const { CosmosClient } = require("@azure/cosmos");
const { BlobServiceClient } = require("@azure/storage-blob");

const { callAoaiChat, safeJsonParse } = require("../lib/aoai");
const {
  extractPdfLayout,
  extractBulletBlocks,
  applyBulletEdits,
} = require("../lib/pdfTailor");

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
  // Try your existing lib first
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
 * WinAnsi cannot encode Unicode bullets like ● or •, and some smart punctuation.
 * This sanitizer maps common problem characters -> safe ASCII/Latin-1 and strips the rest.
 */
function toWinAnsiSafe(input) {
  let s = String(input || "");

  // normalize whitespace
  s = s.replace(/\r\n/g, "\n").replace(/\u00A0/g, " ");

  // common typography -> ASCII
  s = s
    .replace(/[“”„]/g, '"')
    .replace(/[’‘‚]/g, "'")
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/→/g, "->");

  // bullets -> hyphen
  s = s.replace(/[●•◦∙·]/g, "-");

  // remove any remaining unsupported unicode (keep ASCII + Latin-1)
  s = s.replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");

  // collapse spaces
  s = s.replace(/\s+/g, " ").trim();

  return s;
}

/**
 * Build a reasonably-sized resume text summary from extracted layout.
 * Used for cover letter + keyword grounding.
 */
function buildResumeTextFromLayout(layout, { maxChars = 14000 } = {}) {
  const parts = [];
  for (const pg of layout?.pages || []) {
    parts.push(`\n--- Page ${pg.pageIndex + 1} ---\n`);
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
  workModelRequired (string|null) // "Remote"|"Hybrid"|"On-site"|null
payMin (number|null),
payMax (number|null),
payPeriod (string|null) // "hour","year","month","week","day"
payCurrency (string|null) // "USD"
Rules:
- jobTitle must be the actual role name (e.g. "Technical Support Engineer"). Never return generic words like "individuals".
- If the text contains a line like "<ROLE> - job post", use <ROLE>.
- website must prefer an explicit "Website:" field or the company's official site. Do NOT pick social links (YouTube/Twitter/Facebook).
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
 * Plan bullet edits using bulletIds + rawText from extracted bullet blocks.
 * IMPORTANT: For pdf-lib standard fonts, output must be WinAnsi-safe (NO ●/•, no fancy unicode).
 */
async function planBulletEdits({ bulletBlocks, jobData }) {
  const bulletsForModel = (bulletBlocks || [])
    .slice(0, 40)
    .map((b) => ({
      bulletId: String(b.id),
      text: String(b.rawText || "").trim(),
      lineCount: b.lineCount || 1,
    }))
    .filter((b) => b.bulletId && b.text);

  const system = `
You are a resume bullet editor.
Your goal: improve ATS alignment WITHOUT changing layout.

Return ONLY JSON in this exact shape:
{
  "edits": [
    { "bulletId": "b0", "to": "Improved bullet text" }
  ],
  "atsKeywords": ["..."]
}

Rules:
- "bulletId" MUST be one of the provided bulletIds.
- Only edit experience-style bullets. Skip education, contact info, headings.
- Keep claims truthful. Do NOT invent employers, degrees, certifications, or tools not supported by the resume text.
- Keep each "to" about the SAME length as the original bullet (avoid very long rewrites).
- DO NOT include any bullet symbols like "•" or "●". Do NOT start lines with bullets.
- Use plain ASCII text and standard punctuation only (no smart quotes, no em dashes).
- Produce 6–10 edits maximum.
- Output MUST be valid JSON only. No markdown.
`.trim();

  const user = `
JOB DATA (structured):
${JSON.stringify(jobData || {}, null, 2)}

RESUME BULLETS (edit only these; keep length similar):
${JSON.stringify(bulletsForModel, null, 2)}
`.trim();

  const { content } = await callAoaiChat({
    system,
    user,
    temperature: 0.2,
    max_tokens: 950,
  });

  const parsed = safeJsonParse(content) || {};
  const edits = Array.isArray(parsed.edits) ? parsed.edits : [];
  const ats = Array.isArray(parsed.atsKeywords) ? parsed.atsKeywords : [];

  const validIds = new Set(bulletsForModel.map((b) => b.bulletId));

  const cleanEdits = [];
  const seen = new Set();

  for (const e of edits) {
    const bulletId = String(e?.bulletId || "").trim();
    if (!bulletId || !validIds.has(bulletId)) continue;

    // sanitize to WinAnsi-safe
    let to = toWinAnsiSafe(e?.to);
    if (!to) continue;

    // extra: strip any accidental leading bullet-ish markers
    to = to.replace(/^[-*]\s+/, "").trim();
    to = toWinAnsiSafe(to);

    const key = `${bulletId}::${to.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    cleanEdits.push({ bulletId, text: to });
    if (cleanEdits.length >= 10) break;
  }

  const cleanAts = Array.from(
    new Set(ats.map((x) => toWinAnsiSafe(String(x || "")).trim()).filter(Boolean))
  ).slice(0, 30);

  return { edits: cleanEdits, atsKeywords: cleanAts };
}

/**
 * Generate a tailored cover letter (Option 2 container).
 */
async function generateCoverLetter({ jobData, resumeText, profile }) {
  const system = `
Write a tailored cover letter for the job described.
Return ONLY JSON:
{ "text": "..." }

Rules:
- 250–400 words.
- Mention jobTitle and company if available.
- Use a professional tone.
- Pull skill themes from resume text; do NOT invent credentials.
- End with a clear call-to-action and a professional close.
No markdown. No extra keys.
`.trim();

  const user = `
PROFILE (if present):
${JSON.stringify(profile || {}, null, 2)}

JOB DATA:
${JSON.stringify(jobData || {}, null, 2)}

RESUME (summary text):
${String(resumeText || "")}
`.trim();

  const { content } = await callAoaiChat({
    system,
    user,
    temperature: 0.4,
    max_tokens: 700,
  });

  const parsed = safeJsonParse(content) || {};
  return String(parsed.text || "").trim();
}

async function tryLoadUserProfile(cosmos, dbName, userId) {
  const containerName =
    process.env.COSMOS_USER_SETTINGS_CONTAINER_NAME || "userSettings";

  try {
    const container = cosmos.database(dbName).container(containerName);
    const q = {
      query: "SELECT TOP 1 * FROM c WHERE c.userId = @uid",
      parameters: [{ name: "@uid", value: userId }],
    };
    const { resources } = await container.items.query(q).fetchAll();
    const doc = resources?.[0] || null;
    if (!doc) return {};

    const profile =
      doc.profile && typeof doc.profile === "object" ? doc.profile : doc;
    const links =
      doc.links && typeof doc.links === "object" ? doc.links : doc;

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
        jsonBody: { ok: false, error: "Only PDF resumes supported for layout-preserving tailoring." },
      };
    }

    // Download PDF bytes (Buffer)
    const pdfBuffer = await downloadBlobToBuffer(
      AZURE_STORAGE_CONNECTION_STRING,
      BLOB_RESUMES_CONTAINER,
      resumeDoc.blobName
    );

    if (!pdfBuffer || pdfBuffer.length === 0) {
      return { status: 500, jsonBody: { ok: false, error: "Failed to download resume PDF bytes" } };
    }

    // pdfjs-dist v5 expects Uint8Array (not Buffer) for getDocument
    const pdfBytesForExtract = Buffer.isBuffer(pdfBuffer) ? new Uint8Array(pdfBuffer) : pdfBuffer;

    // Extract PDF layout + bullet blocks (Option B)
    const layout = await extractPdfLayout(pdfBytesForExtract, { maxPages: 12 });
    const bulletBlocks = extractBulletBlocks(layout, { maxBullets: 60 });

    if (!bulletBlocks.length) {
      return {
        status: 400,
        jsonBody: {
          ok: false,
          error:
            "Could not detect bullets in this PDF. (If it's scanned/images, Option B cannot extract text layout.)",
        },
      };
    }

    const resumeText = buildResumeTextFromLayout(layout, { maxChars: 14000 });

    // AOAI
    const jobData = await extractJobWithAoai(jobDescriptionRaw);
    const planned = await planBulletEdits({ bulletBlocks, jobData });

    // extra safety: sanitize again right before drawing
    const safeEdits = (planned.edits || []).map((e) => ({
      bulletId: e.bulletId,
      text: toWinAnsiSafe(e.text),
    })).filter((e) => e.bulletId && e.text);

    // Apply edits as overlays
    const tailoredBytes = await applyBulletEdits(
      pdfBuffer,
      bulletBlocks,
      safeEdits,
      {
        defaultFontSize: 10,
        lineGap: 1.15,
      }
    );

    const tailoredBytesBuf = Buffer.isBuffer(tailoredBytes) ? tailoredBytes : Buffer.from(tailoredBytes);

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
      tailoredBytesBuf
    );

    const overlaysApplied = safeEdits.map((e) => ({ bulletId: e.bulletId, to: e.text }));

    // Create new resume doc in resumes container
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
      size: tailoredBytesBuf.length,

      atsKeywords: planned.atsKeywords || [],
      overlaysAppliedCount: overlaysApplied.length,

      uploadedAt: now.toISOString(),
      updated_date: now.toISOString().split("T")[0],
    };

    await resumesContainer.items.upsert(tailoredResumeDoc, { partitionKey: user.userId });

    // Optional: load settings/profile for cover letter
    const profile = await tryLoadUserProfile(cosmos, COSMOS_DB_NAME, user.userId);

    // Cover letter text
    const coverLetterText = await generateCoverLetter({ jobData, resumeText, profile });

    // Save cover letter
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

      atsKeywords: planned.atsKeywords || [],
      text: coverLetterText || "",

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
        overlaysApplied,
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
