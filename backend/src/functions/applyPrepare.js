"use strict";

const { CosmosClient } = require("@azure/cosmos");
const { BlobServiceClient } = require("@azure/storage-blob");

const { callAoaiChat, safeJsonParse } = require("../lib/aoai");
const {
  extractPdfLinesWithBoxes,
  applyPdfReplacements,
  chunkText,
} = require("../lib/pdfTailor");

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
 * Extract job fields (strict) so you don't get "individuals" etc.
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

  const parsed = safeJsonParse(content) || {};
  return parsed;
}

/**
 * Ask AOAI to output bullet replacements using EXACT "from" lines from resumeText.
 */
async function planBulletReplacements({ resumeText, jobData }) {
  const system = `
You are a resume editor. Your task is to improve ATS alignment WITHOUT changing layout.
You MUST output ONLY JSON with this shape:

{
  "replacements": [
    { "from": "EXACT line copied from resume text", "to": "Improved replacement line" }
  ],
  "atsKeywords": ["..."]
}

Rules:
- "from" must be an EXACT full line copied from the provided RESUME TEXT (character-for-character except normal spaces).
- Only replace EXPERIENCE bullet lines. Do NOT touch headers, names, emails, dates, company names, or education.
- Keep meaning truthful. Do NOT invent new employers, degrees, tools you clearly don't have.
- Inject ATS keywords relevant to the JOB REQUIREMENTS (skillsRequired, jobTitle).
- Keep each "to" line roughly similar length to "from" (avoid huge wraps).
- Return 6–10 replacements. If you can't confidently match a line, don't include it.
No extra keys. No markdown.
`.trim();

  const user = `
JOB DATA (structured):
${JSON.stringify(jobData || {}, null, 2)}

RESUME TEXT (page-marked):
${resumeText}
`.trim();

  const { content } = await callAoaiChat({
    system,
    user,
    temperature: 0.2,
    max_tokens: 950,
  });

  const parsed = safeJsonParse(content) || {};
  const reps = Array.isArray(parsed.replacements) ? parsed.replacements : [];
  const ats = Array.isArray(parsed.atsKeywords) ? parsed.atsKeywords : [];

  // sanitize
  const cleanReps = reps
    .map((r) => ({
      from: String(r?.from || "").replace(/\s+/g, " ").trim(),
      to: String(r?.to || "").replace(/\s+/g, " ").trim(),
    }))
    .filter((r) => r.from && r.to)
    .slice(0, 12);

  const cleanAts = Array.from(new Set(ats.map((x) => String(x || "").trim()).filter(Boolean))).slice(0, 30);

  return { replacements: cleanReps, atsKeywords: cleanAts };
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
${resumeText}
`.trim();

  const { content } = await callAoaiChat({
    system,
    user,
    temperature: 0.4,
    max_tokens: 700,
  });

  const parsed = safeJsonParse(content) || {};
  const text = String(parsed.text || "").trim();
  return text;
}

async function tryLoadUserProfile(cosmos, dbName, userId) {
  // Optional: if you want profile info in cover letter.
  // If your settings schema differs, this safely returns {}.
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

    // handle either flat or nested
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

    const resumesContainer = cosmos
      .database(COSMOS_DB_NAME)
      .container(COSMOS_RESUMES_CONTAINER_NAME);

    const coverLettersContainer = cosmos
      .database(COSMOS_DB_NAME)
      .container(COSMOS_COVERLETTERS_CONTAINER_NAME);

    // Load selected resume doc
    const read = await resumesContainer.item(resumeId, user.userId).read().catch(() => null);
    const resumeDoc = read?.resource || null;

    if (!resumeDoc) {
      return { status: 404, jsonBody: { ok: false, error: "Resume not found" } };
    }
    if (!resumeDoc.blobName) {
      return { status: 400, jsonBody: { ok: false, error: "Resume doc missing blobName" } };
    }
    if (String(resumeDoc.contentType || "").toLowerCase() !== "application/pdf") {
      return { status: 400, jsonBody: { ok: false, error: "Only PDF resumes supported for layout-preserving tailoring." } };
    }

    // Download PDF bytes
    const pdfBuffer = await downloadBlobToBuffer(
      AZURE_STORAGE_CONNECTION_STRING,
      BLOB_RESUMES_CONTAINER,
      resumeDoc.blobName
    );

    // Extract resume text + line boxes
    const { pages, resumeText } = await extractPdfLinesWithBoxes(pdfBuffer, {
      maxPages: 12,
      yTolerance: 2.5,
    });

    // Extract job data (AOAI)
    // (you can also pass in pre-extracted jobData from frontend later if you want)
    const jobData = await extractJobWithAoai(jobDescriptionRaw);

    // Plan bullet replacements (AOAI)
    const planned = await planBulletReplacements({
      resumeText: chunkText(resumeText, 14000),
      jobData,
    });

    // Apply replacements to PDF while preserving layout
    const { pdfBytes: tailoredBytes, overlaysApplied, misses } = await applyPdfReplacements(
      pdfBuffer,
      pages,
      planned.replacements
    );

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
      Buffer.from(tailoredBytes)
    );

    // Create new resume doc in resumes container
    const tailoredResumeDoc = {
      id: `resume:${safeUserId(user.userId)}:${Date.now()}`,
      userId: user.userId,
      email: user.email,

      name: tailoredFileName,
      originalName: tailoredFileName,
      isDefault: false,

      // linkage
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
      size: Buffer.byteLength(tailoredBytes),

      atsKeywords: planned.atsKeywords || [],
      overlaysAppliedCount: overlaysApplied.length,

      uploadedAt: now.toISOString(),
      updated_date: now.toISOString().split("T")[0],
    };

    await resumesContainer.items.upsert(tailoredResumeDoc, { partitionKey: user.userId });

    // Optional: load settings/profile for better cover letter (safe)
    const profile = await tryLoadUserProfile(cosmos, COSMOS_DB_NAME, user.userId);

    // Generate cover letter text (AOAI)
    const coverLetterText = await generateCoverLetter({
      jobData,
      resumeText: chunkText(resumeText, 12000),
      profile,
    });

    // Save cover letter in Option 2 container
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
        misses,
      },
    };
  } catch (err) {
    context.log.error("applyPrepare error:", err);
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
