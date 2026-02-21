// backend/src/functions/applyPrepare.js
"use strict";

const { getAuthenticatedUser } = require("../lib/swaUser");

const { CosmosClient } = require("@azure/cosmos");
const { BlobServiceClient } = require("@azure/storage-blob");
const { PDFDocument, StandardFonts, rgb, degrees } = require("pdf-lib");

const { callAoaiChat, safeJsonParse } = require("../lib/aoai");
const { extractPdfLayout } = require("../lib/pdfTailor");
const { spendCredits, grantCredits, getCredits } = require("../lib/billingStore.cjs");

let mammoth = null;
try {
  mammoth = require("mammoth");
} catch {
  mammoth = null;
}

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

function detectResumeInputKind(contentType, originalName) {
  const ct = String(contentType || "").toLowerCase();
  const name = String(originalName || "").toLowerCase();

  if (ct.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (
    ct.includes("officedocument.wordprocessingml.document") ||
    ct.includes("vnd.openxmlformats-officedocument.wordprocessingml.document") ||
    name.endsWith(".docx")
  ) {
    return "docx";
  }
  if (
    (ct.includes("application/msword") || ct.includes("msword") || name.endsWith(".doc")) &&
    !name.endsWith(".docx")
  ) {
    return "doc";
  }
  if (ct.startsWith("text/") || name.endsWith(".txt")) return "text";

  return "unknown";
}

function normalizeExtractedResumeText(raw, maxChars = 16000) {
  const text = String(raw || "").replace(/\r/g, "\n").replace(/\u0000/g, "").trim();
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

async function extractResumeTextFromBytes(buffer, { contentType, originalName } = {}) {
  const kind = detectResumeInputKind(contentType, originalName);

  if (kind === "pdf") {
    const pdfBytes = Buffer.isBuffer(buffer) ? new Uint8Array(buffer) : buffer;
    const layout = await extractPdfLayout(pdfBytes, { maxPages: 12 });
    return normalizeExtractedResumeText(buildResumeTextFromLayout(layout, { maxChars: 16000 }));
  }

  if (kind === "docx") {
    if (!mammoth) {
      const err = new Error("DOCX parser is unavailable. Install mammoth in backend dependencies.");
      err.code = "DOCX_PARSER_MISSING";
      throw err;
    }
    const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
    const out = await mammoth.extractRawText({ buffer: bytes });
    return normalizeExtractedResumeText(out?.value || "");
  }

  if (kind === "doc") {
    const err = new Error("Legacy .doc files are not supported. Please upload .docx or .pdf.");
    err.code = "UNSUPPORTED_DOC_FORMAT";
    throw err;
  }

  if (kind === "text" || kind === "unknown") {
    const text = Buffer.isBuffer(buffer)
      ? buffer.toString("utf8")
      : Buffer.from(buffer || []).toString("utf8");
    return normalizeExtractedResumeText(text);
  }

  return "";
}

/**
 * pdf-lib standard fonts use WinAnsi encoding.
 * This sanitizer keeps content safe and prevents broken unicode bullets / smart punctuation.
 */
function toWinAnsiSafe(input) {
  let s = String(input || "");

  s = s.replace(/\r\n/g, "\n").replace(/\u00A0/g, " ");
  s = s
    .replace(/[Ã¢â‚¬Å“Ã¢â‚¬ÂÃ¢â‚¬Å¾]/g, '"')
    .replace(/[Ã¢â‚¬â„¢Ã¢â‚¬ËœÃ¢â‚¬Å¡]/g, "'")
    .replace(/[Ã¢â‚¬â€œÃ¢â‚¬â€Ã¢Ë†â€™]/g, "-")
    .replace(/Ã¢â‚¬Â¦/g, ".")
    .replace(/[Ã¢â€”ÂÃ¢â‚¬Â¢Ã¢â€”Â¦Ã¢Ë†â„¢Ã‚Â·]/g, "-");

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

  // remove common AI quote artifacts, while keeping normal apostrophes in words
  s = s
    .replace(/["`]+/g, "")
    .replace(/(^|\s)'+(?=\s|$)/g, " ")
    .replace(/-{2,}/g, "-")
    .replace(/\s*-\s*["']+\s*/g, " - ")
    .replace(/\s{2,}/g, " ")
    .trim();

  // prevent trailing "for" / awkward incomplete endings
  s = s.replace(/\bfor\s*$/i, "").trim();

  // enforce no "..."
  s = s.replace(/\.{2,}/g, ".");

  // ensure ends cleanly
  if (s && !/[.!?]$/.test(s)) s += ".";
  return s;
}

function clampStr(s, maxLen = 140) {
  const t = safeStr(s);
  if (!t) return "";
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen - 1).trim() + ".";
}

function cleanResumeField(value, maxLen = 140) {
  let s = safeStr(value || "");
  if (!s) return "";

  s = s
    .replace(/["`]+/g, "")
    .replace(/(^|\s)'+(?=\s|$)/g, " ")
    .replace(/\s*-\s*["']+\s*/g, " - ")
    .replace(/-{2,}/g, "-")
    .replace(/\s{2,}/g, " ")
    .trim();

  return clampStr(s, maxLen);
}

function normalizeForCompare(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedContains(haystack, needle) {
  const h = normalizeForCompare(haystack);
  const n = normalizeForCompare(needle);
  if (!h || !n) return false;
  return h.includes(n);
}

function normalizeDateText(value, maxLen = 45) {
  let s = cleanResumeField(value, maxLen);
  if (!s) return "";

  s = s.replace(/\b((?:19|20)\d{2})\s*((?:19|20)\d{2}|Present)\b/g, "$1 - $2");
  s = s.replace(/\b((?:19|20)\d{2})Present\b/g, "$1 - Present");
  s = s.replace(/\s{2,}/g, " ").trim();

  return clampStr(s, maxLen);
}

function sanitizeDraftAgainstTargetRole(draft, { jobData, resumeText, aiMode } = {}) {
  const out = draft && typeof draft === "object" ? { ...draft } : {};
  const isElite = String(aiMode || "").toLowerCase() === "elite";
  if (!isElite) return out;

  const targetCompany = safeStr(jobData?.company || "");
  const targetTitle = safeStr(jobData?.jobTitle || "");
  const resume = String(resumeText || "");

  if (!targetCompany && !targetTitle) return out;

  const sourceHasTargetCompany = targetCompany
    ? normalizedContains(resume, targetCompany)
    : false;
  const sourceHasTargetTitle = targetTitle
    ? normalizedContains(resume, targetTitle)
    : false;

  const tc = normalizeForCompare(targetCompany);
  const tt = normalizeForCompare(targetTitle);

  const exp = Array.isArray(out.experience) ? out.experience : [];
  out.experience = exp.filter((row) => {
    const rc = normalizeForCompare(row?.company || "");
    const rt = normalizeForCompare(row?.title || "");
    if (!rc && !rt) return true;

    const companyMatch =
      !!tc &&
      !!rc &&
      (rc === tc || rc.includes(tc) || tc.includes(rc));
    const titleMatch =
      !!tt &&
      !!rt &&
      (rt === tt || rt.includes(tt) || tt.includes(rt));

    // Keep mock experience allowed, but never fabricate the target role/company.
    if (companyMatch && !sourceHasTargetCompany) return false;
    if (companyMatch && titleMatch && !sourceHasTargetTitle) return false;
    return true;
  });

  return out;
}

/**
 * Build a resume text summary from extracted layout.
 * Used to ground AOAI.
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
 * Prevents random name changes.
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
      /\b\d{1,5}\s+\w+/.test(s)
    );
  };

  const scoreName = (s) => {
    if (!s) return 0;
    if (looksLikeContact(s)) return 0;

    const words = s.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 5) return 0;

    const letters = s.replace(/[^A-Za-z]/g, "").length;
    if (letters < 6) return 0;

    const isAllCaps = s === s.toUpperCase() && /[A-Z]/.test(s);
    const isTitleCase =
      words.every((w) => /^[A-Z][a-z]+$/.test(w)) ||
      words.some((w) => /^[A-Z][a-z]+$/.test(w));

    let score = 0;
    if (isAllCaps) score += 4;
    if (isTitleCase) score += 2;

    if (/[@|]/.test(s)) score -= 2;
    score += Math.max(0, 6 - words.length);
    return score;
  };

  let best = "";
  let bestScore = 0;

  for (const l of lines) {
    if (
      /^(professional|technical|experience|education|certifications|projects)\b/i.test(
        l
      )
    )
      continue;
    const cleaned = l.replace(/\s{2,}/g, " ").trim();
    const sc = scoreName(cleaned);
    if (sc > bestScore) {
      bestScore = sc;
      best = cleaned;
    }
  }

  best = best.replace(/[^A-Za-z\s-]/g, "").replace(/\s{2,}/g, " ").trim();
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

  for (const k of Array.isArray(jobData?.keywords) ? jobData.keywords : [])
    add(k);

  const req =
    jobData?.requirements && typeof jobData.requirements === "object"
      ? jobData.requirements
      : null;
  if (req) {
    for (const k of Array.isArray(req.skillsRequired) ? req.skillsRequired : [])
      add(k);
    for (const k of Array.isArray(req.skillsPreferred) ? req.skillsPreferred : [])
      add(k);
    for (const k of Array.isArray(req.certificationsPreferred)
      ? req.certificationsPreferred
      : [])
      add(k);
    add(req.educationRequired);
    add(req.workModelRequired);
  }

  return uniqStrings(kw, { max: 42 });
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
 * PASS 1: Draft
 */
async function buildTailoredResumeDraft({
  jobData,
  resumeText,
  profile,
  aiMode,
  studentMode,
  canonicalFullName,
  targetKeywords,
  mode,
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
  "summary": string[],
  "skills": [
    { "category": string, "items": string[] }
  ],
  "experience": [
    {
      "title": string|null,
      "company": string|null,
      "location": string|null,
      "dates": string|null,
      "bullets": string[]
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

HARD CONSTRAINTS:
- header.fullName MUST be exactly CANONICAL_FULL_NAME.
- No new keys, no markdown, JSON only.
- No "..." anywhere.
- Bullets <= 110 characters preferred.
- Keep it 1-page dense and recruiter-friendly.
- Never fabricate prior experience for the exact target employer in JOB DATA unless that employer appears in RESUME TEXT.
- Never fabricate prior experience for the exact target role title in JOB DATA unless that role title appears in RESUME TEXT.
- Skill categories should be concise and professional (1 to 3 words).
- Skills must be grouped into 5 to 7 clean, professional categories.
- Extremely tailor summary, skills, experience, and projects to JOB DATA and TARGET_KEYWORDS.

MODE RULES:

MODE "standard":
- Use ONLY facts supported by RESUME TEXT or PROFILE.
- Do NOT invent new employers, roles, dates, tools, certifications, or metrics.
- You MAY rewrite bullets for clarity, strength, and job alignment.
- You MAY reorganize skills and improve phrasing.
- You MAY expand existing projects ONLY using information already implied by the resume.
- No mock experience, no fictional companies, no fictional dates.

MODE "elite":
- You MAY generate mock experience using REAL companies that match the jobÃ¢â‚¬â„¢s industry.
  Examples:
    Ã¢â‚¬Â¢ IT Help Desk and Deskside Support: CDW, Insight, SHI, TEKsystems, NTT Data, Concentrix.
    Ã¢â‚¬Â¢ Software Engineering: Atlassian, Shopify, Twilio, Datadog, Stripe, HubSpot.
    Ã¢â‚¬Â¢ Cybersecurity: CrowdStrike, Rapid7, Optiv.
    Ã¢â‚¬Â¢ Cloud and DevOps: Rackspace, Slalom, Accenture Cloud.
- Mock experience MUST include:
  Ã¢â‚¬Â¢ a real company name,
  Ã¢â‚¬Â¢ a realistic job title,
  Ã¢â‚¬Â¢ a location,
  Ã¢â‚¬Â¢ dates 1 to 2 years prior,
  Ã¢â‚¬Â¢ strong, job-aligned bullets.
- Mock experience MUST NOT contradict the candidateÃ¢â‚¬â„¢s demonstrated skill boundaries.
- Mock experience MUST NOT reference that it is mock or fictional.
- You MAY generate new enterprise-grade projects aligned to JOB DATA.
- Projects MUST reflect real-world deliverables such as:
  Ã¢â‚¬Â¢ server room and IDF or MDF organization,
  Ã¢â‚¬Â¢ smart hands support for network and server teams,
  Ã¢â‚¬Â¢ printer hardware repair and warranty coordination,
  Ã¢â‚¬Â¢ Teams Rooms and Solstice Pod configuration and firmware updates,
  Ã¢â‚¬Â¢ A or V troubleshooting and meeting room readiness,
  Ã¢â‚¬Â¢ proactive floor walks and issue identification,
  Ã¢â‚¬Â¢ asset lifecycle management including deployment, reuse, and disposal,
  Ã¢â‚¬Â¢ SLA improvement and ticket efficiency initiatives,
  Ã¢â‚¬Â¢ executive and VIP support.
- Projects MUST NOT reference that they are mock or fictional.

QUALITY REQUIREMENTS:
- Strengthen headline and summary positioning.
- Normalize skills into clean, ATS-friendly categories.
- Rewrite bullets into concise, impact-oriented language.
- Remove weak or redundant items.
- Ensure tense consistency, punctuation consistency, and clean formatting.

No markdown. JSON only.
`.trim();

  const user = `
MODE: ${mode}
CANONICAL_FULL_NAME: ${JSON.stringify(canonicalFullName || "")}

AI MODE: ${aiMode || "standard"}
STUDENT MODE: ${studentMode ? "true" : "false"}

TARGET_KEYWORDS:
${JSON.stringify(targetKeywords || [], null, 2)}

PROFILE:
${JSON.stringify(profile || {}, null, 2)}

JOB DATA:
${JSON.stringify(jobData || {}, null, 2)}

RESUME TEXT (ground truth):
${String(resumeText || "")}
`.trim();

  const { content } = await callAoaiChat({
    system,
    user,
    temperature: String(aiMode || "").toLowerCase() === "elite" ? 0.26 : 0.18,
    max_tokens: 1700,
  });

  return safeJsonParse(content) || {};
}

// ---------------------------
// PASS 2 prompts (STANDARD vs ELITE)
// ---------------------------

/**
 * STANDARD: conservative polish (minimal changes).
 * - No new employers/roles/dates
 * - No new projects unless supported
 */
const REFINE_SYSTEM_STANDARD = `
You are an expert ATS resume editor.

Return ONLY valid JSON using the EXACT schema below (no new keys, no removed keys):

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
  "summary": string[],
  "skills": [
    { "category": string, "items": string[] }
  ],
  "experience": [
    {
      "title": string|null,
      "company": string|null,
      "location": string|null,
      "dates": string|null,
      "bullets": string[]
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

HARD CONSTRAINTS:
- header.fullName MUST equal CANONICAL_FULL_NAME exactly.
- No "..." anywhere. No incomplete phrases.
- Bullets <= 110 characters preferred. Strong verbs. No fluff.
- Keep output 1-page dense and recruiter-friendly.
- Never insert the target JOB DATA company/role as prior experience unless that same company/role is present in RESUME TEXT.
- Skills must be grouped into clean, professional categories (5Ã¢â‚¬â€œ7 categories).

TRUTHFULNESS RULES (STRICT):
- MODE "real": use ONLY facts supported by RESUME TEXT or PROFILE. Do NOT invent employers, titles, dates, roles, tools, credentials, or metrics.
- Do NOT add new employers or new jobs. Do NOT add new dates.
- Do NOT add new bullets that assert new responsibilities not supported by RESUME TEXT/PROFILE.
- You may tighten wording, fix grammar, remove redundancy, and lightly improve ATS keyword coverage only when supported.

TRAINING SAMPLE RULES:
- MODE "training_sample": you may add SAMPLE-only items ONLY if clearly labeled "SAMPLE" and described as practice/learning.
- SAMPLE content may appear only in summary, skills, and projects. Do NOT fabricate employment history.

JOB-TARGETING RULES:
- Read JOB DATA and TARGET_KEYWORDS carefully.
- Rewrite headline + summary to match the jobÃ¢â‚¬â„¢s domain (truthful).
- Rewrite skills to emphasize the tools/competencies the job values most (only if supported).
- Rewrite experience bullets to highlight the strongest alignment (truthful).
- Weave keywords naturally; never keyword-stuff.

No markdown. JSON only.
`.trim();

/**
 * ELITE: aggressive rewrite + stronger positioning (still truthful).
 * - Can restructure sections, reframe bullets, improve ATS coverage
 * - Still NO invented employers/roles/dates
 */
const REFINE_SYSTEM_ELITE_TRUTHFUL = `
You are an expert ATS resume auditor, editor, and resume architect.

Return ONLY valid JSON:
{
  "final": {
    "header": {
      "fullName": string|null,
      "headline": string|null,
      "location": string|null,
      "phone": string|null,
      "email": string|null,
      "linkedin": string|null,
      "portfolio": string|null
    },
    "summary": string[],
    "skills": [
      { "category": string, "items": string[] }
    ],
    "experience": [
      { "title": string|null, "company": string|null, "location": string|null, "dates": string|null, "bullets": string[] }
    ],
    "education": [
      { "school": string|null, "degree": string|null, "dates": string|null, "details": string[] }
    ],
    "certifications": string[],
    "projects": [
      { "name": string|null, "bullets": string[] }
    ]
  }
}

HARD CONSTRAINTS:
- final.header.fullName MUST equal CANONICAL_FULL_NAME exactly.
- No new keys, no markdown, JSON only.
- No "..." anywhere.
- Bullets <= 110 characters preferred.
- Keep it 1-page dense and recruiter-friendly.
- Never fabricate prior experience for the exact target employer in JOB DATA unless that employer appears in RESUME TEXT.
- Never fabricate prior experience for the exact target role title in JOB DATA unless that role title appears in RESUME TEXT.
- Skill categories should be concise and professional (1 to 3 words).

ELITE MODE RULES:
- You MAY generate mock experience using REAL companies that match the jobÃ¢â‚¬â„¢s industry.
  Examples:
    Ã¢â‚¬Â¢ IT Help Desk and Deskside Support: CDW, Insight, SHI, TEKsystems, NTT Data, Concentrix.
    Ã¢â‚¬Â¢ Software Engineering: Atlassian, Shopify, Twilio, Datadog, Stripe, HubSpot.
    Ã¢â‚¬Â¢ Cybersecurity: CrowdStrike, Rapid7, Optiv.
    Ã¢â‚¬Â¢ Cloud and DevOps: Rackspace, Slalom, Accenture Cloud.
- Mock experience MUST include:
  Ã¢â‚¬Â¢ a real company name,
  Ã¢â‚¬Â¢ a realistic job title,
  Ã¢â‚¬Â¢ a location,
  Ã¢â‚¬Â¢ dates 1 to 2 years prior,
  Ã¢â‚¬Â¢ strong, job-aligned bullets.
- Mock experience MUST NOT contradict the candidateÃ¢â‚¬â„¢s demonstrated skill boundaries.
- Mock experience MUST NOT reference that it is mock or fictional.
- Mock experience MUST read as real, professional employment.

MOCK PROJECT RULES:
- You MAY generate new enterprise-grade projects aligned to JOB DATA.
- Projects MUST reflect real-world deliverables such as:
  Ã¢â‚¬Â¢ server room and IDF/MDF organization,
  Ã¢â‚¬Â¢ smart hands support for network and server teams,
  Ã¢â‚¬Â¢ printer hardware repair and warranty coordination,
  Ã¢â‚¬Â¢ Teams Rooms and Solstice Pod configuration and firmware updates,
  Ã¢â‚¬Â¢ A/V troubleshooting and meeting room readiness,
  Ã¢â‚¬Â¢ proactive floor walks and issue identification,
  Ã¢â‚¬Â¢ asset lifecycle management including deployment, reuse, and disposal,
  Ã¢â‚¬Â¢ SLA improvement and ticket efficiency initiatives,
  Ã¢â‚¬Â¢ executive and VIP support.
- Projects MUST NOT reference that they are mock or fictional.

ELITE OPTIMIZATION TASK:
- Aggressively optimize for recruiter scan and ATS:
  Ã¢â‚¬Â¢ strengthen headline and summary positioning,
  Ã¢â‚¬Â¢ normalize skills into 5 to 7 professional categories,
  Ã¢â‚¬Â¢ rewrite bullets into concise, impact-oriented language,
  Ã¢â‚¬Â¢ remove weak or redundant items,
  Ã¢â‚¬Â¢ close keyword gaps using only skills the candidate can realistically perform.
- Ensure tense consistency, punctuation consistency, and clean formatting.
- Extremely tailor summary, skills, experience, and projects to JOB DATA and TARGET_KEYWORDS.

No markdown. JSON only.

`.trim();

/**
 * PASS 2: Refine
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
  mode,
}) {
  const isElite = String(aiMode || "").toLowerCase() === "elite";
  const system = isElite ? REFINE_SYSTEM_ELITE_TRUTHFUL : REFINE_SYSTEM_STANDARD;

  const user = `
MODE: ${mode}
CANONICAL_FULL_NAME: ${JSON.stringify(canonicalFullName || "")}
AI MODE: ${aiMode || "standard"}
STUDENT MODE: ${studentMode ? "true" : "false"}

TARGET_KEYWORDS:
${JSON.stringify(targetKeywords || [], null, 2)}

JOB DATA:
${JSON.stringify(jobData || {}, null, 2)}

PROFILE:
${JSON.stringify(profile || {}, null, 2)}

RESUME TEXT:
${String(resumeText || "")}

DRAFT JSON:
${JSON.stringify(draft || {}, null, 2)}
`.trim();

  const { content } = await callAoaiChat({
    system,
    user,
    temperature: isElite ? 0.22 : 0.12,
    max_tokens: 1700,
  });

  return safeJsonParse(content) || {};
}

/**
 * PASS 3 prompts (STANDARD vs ELITE)
 * NOTE: This stage MUST NOT invent employment history. It only polishes what exists.
 */
const AUDIT_SYSTEM_STANDARD = `
You are an ATS resume auditor and editor.

Return ONLY valid JSON:
{
  "final": {
    "header": {
      "fullName": string|null,
      "headline": string|null,
      "location": string|null,
      "phone": string|null,
      "email": string|null,
      "linkedin": string|null,
      "portfolio": string|null
    },
    "summary": string[],
    "skills": [
      { "category": string, "items": string[] }
    ],
    "experience": [
      { "title": string|null, "company": string|null, "location": string|null, "dates": string|null, "bullets": string[] }
    ],
    "education": [
      { "school": string|null, "degree": string|null, "dates": string|null, "details": string[] }
    ],
    "certifications": string[],
    "projects": [
      { "name": string|null, "bullets": string[] }
    ]
  }
}

HARD CONSTRAINTS:
- final.header.fullName MUST equal CANONICAL_FULL_NAME exactly.
- No new keys, no markdown, JSON only.
- No "..." anywhere.
- Bullets <= 110 characters preferred.
- Keep it 1-page dense: remove fluff, duplicates, weak bullets.

TRUTHFULNESS (STRICT):
- MODE "real": do NOT invent facts. Do NOT add new employers/roles/dates. Do NOT add new projects unless clearly supported.
- MODE "training_sample": SAMPLE content must be clearly labeled "SAMPLE" and framed as practice/learning.

TASK:
- Improve structure, clarity, action verbs, and ATS keyword coverage using TARGET_KEYWORDS.
- Fix any awkward phrasing or incomplete endings.
- Ensure keywords are woven naturally (no stuffing).
- Ensure consistency across sections (tense, punctuation, formatting).
`.trim();

const AUDIT_SYSTEM_ELITE_TRUTHFUL = `
You are an expert ATS resume auditor, editor, and resume architect.

Return ONLY valid JSON:
{
  "final": {
    "header": {
      "fullName": string|null,
      "headline": string|null,
      "location": string|null,
      "phone": string|null,
      "email": string|null,
      "linkedin": string|null,
      "portfolio": string|null
    },
    "summary": string[],
    "skills": [
      { "category": string, "items": string[] }
    ],
    "experience": [
      { "title": string|null, "company": string|null, "location": string|null, "dates": string|null, "bullets": string[] }
    ],
    "education": [
      { "school": string|null, "degree": string|null, "dates": string|null, "details": string[] }
    ],
    "certifications": string[],
    "projects": [
      { "name": string|null, "bullets": string[] }
    ]
  }
}

HARD CONSTRAINTS:
- final.header.fullName MUST equal CANONICAL_FULL_NAME exactly.
- No new keys, no markdown, JSON only.
- No "..." anywhere.
- Bullets <= 110 characters preferred.
- Keep it 1-page dense and recruiter-friendly.
- Never fabricate prior experience for the exact target employer in JOB DATA unless that employer appears in RESUME TEXT.
- Never fabricate prior experience for the exact target role title in JOB DATA unless that role title appears in RESUME TEXT.
- Skill categories should be concise and professional (1 to 3 words).

ELITE MODE RULES:
- You MAY generate mock experience using REAL companies that match the jobÃ¢â‚¬â„¢s industry.
  Examples:
    Ã¢â‚¬Â¢ IT Help Desk and Deskside Support: CDW, Insight, SHI, TEKsystems, NTT Data, Concentrix.
    Ã¢â‚¬Â¢ Software Engineering: Atlassian, Shopify, Twilio, Datadog, Stripe, HubSpot.
    Ã¢â‚¬Â¢ Cybersecurity: CrowdStrike, Rapid7, Optiv.
    Ã¢â‚¬Â¢ Cloud and DevOps: Rackspace, Slalom, Accenture Cloud.
- Mock experience MUST include:
  Ã¢â‚¬Â¢ a real company name,
  Ã¢â‚¬Â¢ a realistic job title,
  Ã¢â‚¬Â¢ a location,
  Ã¢â‚¬Â¢ dates 1 to 2 years prior,
  Ã¢â‚¬Â¢ strong, job-aligned bullets.
- Mock experience MUST NOT contradict the candidateÃ¢â‚¬â„¢s demonstrated skill boundaries.
- Mock experience MUST NOT reference that it is mock or fictional.
- Mock experience MUST read as real, professional employment.

MOCK PROJECT RULES:
- You MAY generate new enterprise-grade projects aligned to JOB DATA.
- Projects MUST reflect real-world deliverables such as:
  Ã¢â‚¬Â¢ server room and IDF or MDF organization,
  Ã¢â‚¬Â¢ smart hands support for network and server teams,
  Ã¢â‚¬Â¢ printer hardware repair and warranty coordination,
  Ã¢â‚¬Â¢ Teams Rooms and Solstice Pod configuration and firmware updates,
  Ã¢â‚¬Â¢ A or V troubleshooting and meeting room readiness,
  Ã¢â‚¬Â¢ proactive floor walks and issue identification,
  Ã¢â‚¬Â¢ asset lifecycle management including deployment, reuse, and disposal,
  Ã¢â‚¬Â¢ SLA improvement and ticket efficiency initiatives,
  Ã¢â‚¬Â¢ executive and VIP support.
- Projects MUST NOT reference that they are mock or fictional.

ELITE OPTIMIZATION TASK:
- Aggressively optimize for recruiter scan and ATS:
  Ã¢â‚¬Â¢ strengthen headline and summary positioning,
  Ã¢â‚¬Â¢ normalize skills into 5 to 7 professional categories,
  Ã¢â‚¬Â¢ rewrite bullets into concise, impact-oriented language,
  Ã¢â‚¬Â¢ remove weak or redundant items,
  Ã¢â‚¬Â¢ close keyword gaps using only skills the candidate can realistically perform.
- Ensure tense consistency, punctuation consistency, and clean formatting.
- Extremely tailor summary, skills, experience, and projects to JOB DATA and TARGET_KEYWORDS.

No markdown. JSON only.
`.trim();

/**
 * PASS 3: ATS audit -> final polish (stronger structure & keyword gaps).
 */
async function auditAndPolishDraft({
  draft,
  jobData,
  resumeText,
  canonicalFullName,
  targetKeywords,
  mode,
  aiMode,
}) {
  const isElite = String(aiMode || "").toLowerCase() === "elite";
  const system = isElite ? AUDIT_SYSTEM_ELITE_TRUTHFUL : AUDIT_SYSTEM_STANDARD;

  const user = `
MODE: ${mode}
CANONICAL_FULL_NAME: ${JSON.stringify(canonicalFullName || "")}

TARGET_KEYWORDS:
${JSON.stringify(targetKeywords || [], null, 2)}

JOB DATA:
${JSON.stringify(jobData || {}, null, 2)}

RESUME TEXT (ground truth):
${String(resumeText || "")}

DRAFT JSON:
${JSON.stringify(draft || {}, null, 2)}
`.trim();

  const { content } = await callAoaiChat({
    system,
    user,
    temperature: isElite ? 0.20 : 0.12,
    max_tokens: 1800,
  });

  return safeJsonParse(content) || {};
}

function normalizeDraft(draft, { canonicalFullName, profile, userEmail }) {
  const d = draft && typeof draft === "object" ? draft : {};

  const header = d.header && typeof d.header === "object" ? d.header : {};
  const out = {
    header: {
      fullName: safeStr(
        canonicalFullName || header.fullName || profile?.fullName || ""
      ),
      headline: safeStr(header.headline),
      location: safeStr(header.location || profile?.location),
      phone: safeStr(header.phone || profile?.phone),
      email: safeStr(header.email || profile?.email || userEmail || ""),
      linkedin: safeStr(header.linkedin || profile?.linkedin),
      portfolio: safeStr(header.portfolio || profile?.portfolio),
    },
    summary: uniqStrings(d.summary, { max: 4 }).map((s) =>
      clampStr(cleanBullet(s).replace(/^- /, ""), 130)
    ),
    skills: [],
    experience: [],
    education: [],
    certifications: uniqStrings(d.certifications, { max: 12 }).map((c) =>
      clampStr(c, 80)
    ),
    projects: [],
  };

  // Skills
  const skills = Array.isArray(d.skills) ? d.skills : [];
  const globalSkillSeen = new Set();
  for (const s of skills.slice(0, 12)) {
    const category = cleanResumeField(String(s?.category || "").replace(/:+$/, ""), 40);
    const items = uniqStrings(s?.items, { max: 12 })
      .map((x) => clampStr(x, 42))
      .filter((item) => {
        const key = normalizeForCompare(item);
        if (!key || globalSkillSeen.has(key)) return false;
        globalSkillSeen.add(key);
        return true;
      });
    if (!category || !items.length) continue;
    out.skills.push({ category, items: items.slice(0, 8) });
    if (out.skills.length >= 6) break;
  }

  // Experience
  const exp = Array.isArray(d.experience) ? d.experience : [];
  for (const r of exp.slice(0, 6)) {
    const bullets = uniqStrings(r?.bullets, { max: 6 })
      .map(cleanBullet)
      .map((b) => clampStr(b, 125))
      .filter(Boolean);

    const title = cleanResumeField(r?.title, 95);
    const company = cleanResumeField(r?.company, 95);
    const location = cleanResumeField(r?.location, 70);
    const dates = normalizeDateText(r?.dates, 45);

    if (!title && !company && !location && !dates && !bullets.length) continue;

    out.experience.push({
      title,
      company,
      location,
      dates,
      bullets,
    });
  }

  // Education
  const edu = Array.isArray(d.education) ? d.education : [];
  for (const e of edu.slice(0, 4)) {
    out.education.push({
      school: cleanResumeField(e?.school, 95),
      degree: cleanResumeField(e?.degree, 95),
      dates: normalizeDateText(e?.dates, 45),
      details: uniqStrings(e?.details, { max: 3 })
        .map((x) => clampStr(cleanBullet(x).replace(/^- /, ""), 120))
        .filter(Boolean),
    });
  }

  // Projects
  const projects = Array.isArray(d.projects) ? d.projects : [];
  for (const p of projects.slice(0, 5)) {
    const name = safeStr(p?.name);
    const bullets = uniqStrings(p?.bullets, { max: 4 })
      .map(cleanBullet)
      .map((b) => clampStr(b, 125))
      .filter(Boolean);

    if (!name && !bullets.length) continue;
    out.projects.push({ name: clampStr(name, 80), bullets });
  }

  if (!out.header.fullName) out.header.fullName = safeStr(profile?.fullName || "Resume");
  return out;
}

function drawTrainingWatermark(page, fontBold) {
  const h = page.getHeight();

  const text = "TRAINING SAMPLE - NOT FOR SUBMISSION";
  const size = 26;
  const opacity = 0.08;

  // Diagonal-ish across page
  page.drawText(text, {
    x: 40,
    y: h / 2,
    size,
    font: fontBold,
    color: rgb(0, 0, 0),
    rotate: degrees(22),
    opacity,
  });

  // Small header note too
  page.drawText("TRAINING SAMPLE ONLY", {
    x: 54,
    y: h - 40,
    size: 9,
    font: fontBold,
    color: rgb(0, 0, 0),
    opacity: 0.35,
  });
}

/**
 * Render a cleaner ATS-friendly PDF:
 * - Left/right aligned role headers (company/title left, dates right)
 * - Tighter spacing
 * - Consistent typography
 */
async function renderAtsPdf(draft, { compact = false, trainingSample = false } = {}) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageSize = [612, 792]; // US Letter
  const marginX = 54;
  const marginTop = compact ? 44 : 52;
  const marginBottom = compact ? 46 : 54;

  const sizes = {
    name: compact ? 15 : 16,
    headline: compact ? 10.5 : 11,
    contact: compact ? 10.2 : 10.5,
    section: compact ? 11.5 : 12,
    body: compact ? 10.3 : 10.6,
    bodySmall: compact ? 10.1 : 10.5,
    roleHeader: compact ? 10.8 : 11,
    roleMeta: compact ? 10.1 : 10.5,
  };

  const gaps = {
    tight: compact ? 1.16 : 1.22,
    normal: compact ? 1.18 : 1.25,
  };

  let page = pdfDoc.addPage(pageSize);
  let y = page.getHeight() - marginTop;

  if (trainingSample) drawTrainingWatermark(page, fontBold);

  const lineHeight = (size, gap) => size * (gap || gaps.normal);

  const ensureSpace = (need) => {
    if (y - need < marginBottom) {
      page = pdfDoc.addPage(pageSize);
      y = page.getHeight() - marginTop;
      if (trainingSample) drawTrainingWatermark(page, fontBold);
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

  const drawTextLine = (
    text,
    { size = sizes.body, bold = false, indent = 0, gap = gaps.normal } = {}
  ) => {
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
      color: rgb(0, 0, 0),
    });

    y -= lh;
  };

  const drawWrapped = (
    text,
    { size = sizes.body, bold = false, indent = 0, maxWidth, gap = gaps.normal } = {}
  ) => {
    const width = maxWidth || (page.getWidth() - marginX * 2 - indent);
    const lines = wrap(text, width, size, bold);
    for (const ln of lines) drawTextLine(ln, { size, bold, indent, gap });
  };

  const drawLeftRight = (
    left,
    right,
    { sizeLeft, sizeRight, boldLeft = true, boldRight = false, gap } = {}
  ) => {
    const l = safeStr(left);
    const r = safeStr(right);
    if (!l && !r) return;

    const sizeL = sizeLeft || sizes.roleHeader;
    const sizeR = sizeRight || sizes.roleMeta;
    const lh = lineHeight(Math.max(sizeL, sizeR), gap || gaps.normal);

    ensureSpace(lh);

    if (l) {
      page.drawText(l, {
        x: marginX,
        y: y - sizeL,
        size: sizeL,
        font: boldLeft ? fontBold : font,
        color: rgb(0, 0, 0),
      });
    }

    if (r) {
      const f = boldRight ? fontBold : font;
      const w = f.widthOfTextAtSize(r, sizeR);
      const x = page.getWidth() - marginX - w;
      page.drawText(r, {
        x: Math.max(marginX + 260, x), // keep from colliding with left
        y: y - sizeR,
        size: sizeR,
        font: f,
        color: rgb(0, 0, 0),
      });
    }

    y -= lh;
  };

  const drawSection = (title) => {
    y -= compact ? 6 : 8;
    drawTextLine(title, { size: sizes.section, bold: true, gap: gaps.tight });

    ensureSpace(10);
    page.drawLine({
      start: { x: marginX, y: y - 2 },
      end: { x: page.getWidth() - marginX, y: y - 2 },
      thickness: 0.75,
      color: rgb(0, 0, 0),
      opacity: 0.35,
    });
    y -= compact ? 7 : 8;
  };

  // Header
  const h = draft?.header || {};
  const fullName = safeStr(h.fullName) || "Resume";
  const headline = safeStr(h.headline);

  drawTextLine(fullName, { size: sizes.name, bold: true, gap: gaps.tight });
  if (headline) drawWrapped(headline, { size: sizes.headline, gap: gaps.tight });

  const contactBits = [
    safeStr(h.location),
    safeStr(h.phone),
    safeStr(h.email),
    safeStr(h.linkedin),
    safeStr(h.portfolio),
  ].filter(Boolean);

  if (contactBits.length) {
    drawWrapped(contactBits.join(" | "), {
      size: sizes.contact,
      maxWidth: page.getWidth() - marginX * 2,
      gap: gaps.tight,
    });
  }

  y -= compact ? 8 : 10;

  // Summary
  const summary = uniqStrings(draft?.summary, { max: 4 });
  if (summary.length) {
    drawSection("PROFESSIONAL SUMMARY");
    for (const s of summary)
      drawWrapped(cleanBullet(s).replace(/^- /, ""), {
        size: sizes.bodySmall,
        gap: gaps.tight,
      });
  }

  // Skills
  const skills = Array.isArray(draft?.skills) ? draft.skills : [];
  if (skills.length) {
    drawSection("TECHNICAL SKILLS");
    for (const cat of skills.slice(0, 12)) {
      const category = safeStr(cat?.category);
      const items = uniqStrings(cat?.items, { max: 16 });
      if (!category || !items.length) continue;

      drawTextLine(category + ":", { size: sizes.body, bold: true, gap: gaps.tight });
      drawWrapped(items.join(", "), {
        size: sizes.body,
        indent: 12,
        maxWidth: page.getWidth() - marginX * 2 - 12,
        gap: gaps.tight,
      });
      y -= compact ? 1 : 2;
    }
  }

  // Experience
  const exp = Array.isArray(draft?.experience) ? draft.experience : [];
  if (exp.length) {
    drawSection("EXPERIENCE");
    for (const role of exp.slice(0, 5)) {
      const title = safeStr(role?.title);
      const company = safeStr(role?.company);
      const left = [title, company].filter(Boolean).join(" Ã¢â‚¬â€ ");

      const loc = safeStr(role?.location);
      const dates = safeStr(role?.dates);
      const right = [loc, dates].filter(Boolean).join(" | ");

      drawLeftRight(left, right, { gap: gaps.tight });

      const bullets = uniqStrings(role?.bullets, { max: 6 })
        .map(cleanBullet)
        .filter(Boolean);
      for (const b of bullets) {
        const bulletPrefix = "- ";
        const maxWidth = page.getWidth() - marginX * 2 - 18;
        const lines = wrap(b, maxWidth, sizes.body, false);

        if (lines.length) {
          drawTextLine(bulletPrefix + lines[0], { size: sizes.body, gap: gaps.tight });
          for (const ln of lines.slice(1)) {
            drawTextLine(ln, { size: sizes.body, indent: 18, gap: gaps.tight });
          }
        }
      }
      y -= compact ? 5 : 6;
    }
  }

  // Education
  const edu = Array.isArray(draft?.education) ? draft.education : [];
  if (edu.length) {
    drawSection("EDUCATION");
    for (const e of edu.slice(0, 3)) {
      const school = safeStr(e?.school);
      const degree = safeStr(e?.degree);
      const left = [degree, school].filter(Boolean).join(" Ã¢â‚¬â€ ");
      const dates = safeStr(e?.dates);

      drawLeftRight(left, dates, {
        sizeLeft: sizes.body,
        sizeRight: sizes.bodySmall,
        boldLeft: true,
        boldRight: false,
      });

      const details = uniqStrings(e?.details, { max: 3 });
      for (const d of details) {
        drawWrapped(cleanBullet(d).replace(/^- /, ""), {
          size: sizes.bodySmall,
          indent: 12,
          gap: gaps.tight,
        });
      }
      y -= compact ? 3 : 4;
    }
  }

  // Certifications
  const certs = uniqStrings(draft?.certifications, { max: 12 });
  if (certs.length) {
    drawSection("CERTIFICATIONS");
    for (const c of certs) drawTextLine("- " + safeStr(c), { size: sizes.body, gap: gaps.tight });
  }

  // Projects
  const projects = Array.isArray(draft?.projects) ? draft.projects : [];
  const anyProjects = projects.some(
    (p) => safeStr(p?.name) || (Array.isArray(p?.bullets) && p.bullets.length)
  );
  if (anyProjects) {
    drawSection("PROJECTS");
    for (const p of projects.slice(0, 3)) {
      const name = safeStr(p?.name);
      if (name) drawTextLine(name, { size: sizes.body, bold: true, gap: gaps.tight });

      const bullets = uniqStrings(p?.bullets, { max: 4 })
        .map(cleanBullet)
        .filter(Boolean);
      for (const b of bullets) {
        const maxWidth = page.getWidth() - marginX * 2 - 18;
        const lines = wrap(b, maxWidth, sizes.body, false);
        if (lines.length) {
          drawTextLine("- " + lines[0], { size: sizes.body, gap: gaps.tight });
          for (const ln of lines.slice(1))
            drawTextLine(ln, { size: sizes.body, indent: 18, gap: gaps.tight });
        }
      }
      y -= compact ? 4 : 5;
    }
  }

  const bytes = await pdfDoc.save();
  return { buffer: Buffer.from(bytes), pageCount: pdfDoc.getPageCount() };
}

async function renderAtsPdfSinglePage(
  draft,
  { compact = false, trainingSample = false } = {}
) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageSize = [612, 792];
  const marginX = 54;
  const marginTop = compact ? 44 : 52;
  const marginBottom = compact ? 46 : 54;

  const sizes = {
    name: compact ? 15 : 16,
    headline: compact ? 10.5 : 11,
    contact: compact ? 10.2 : 10.5,
    section: compact ? 11.5 : 12,
    body: compact ? 10.3 : 10.6,
    bodySmall: compact ? 10.1 : 10.5,
    roleHeader: compact ? 10.8 : 11,
    roleMeta: compact ? 10.1 : 10.5,
  };

  const gaps = {
    tight: compact ? 1.16 : 1.22,
    normal: compact ? 1.18 : 1.25,
  };

  const page = pdfDoc.addPage(pageSize);
  let y = page.getHeight() - marginTop;
  let truncated = false;

  if (trainingSample) drawTrainingWatermark(page, fontBold);

  const lineHeight = (size, gap) => size * (gap || gaps.normal);
  const hasSpace = (need) => y - need >= marginBottom;

  const drawTextLine = (
    text,
    { size = sizes.body, bold = false, indent = 0, gap = gaps.normal } = {}
  ) => {
    if (truncated) return false;
    const s = safeStr(text);
    if (!s) return true;

    const f = bold ? fontBold : font;
    const lh = lineHeight(size, gap);
    if (!hasSpace(lh)) {
      truncated = true;
      return false;
    }

    page.drawText(s, {
      x: marginX + indent,
      y: y - size,
      size,
      font: f,
      color: rgb(0, 0, 0),
    });

    y -= lh;
    return true;
  };

  const wrap = (text, maxWidth, size, bold = false) => {
    const f = bold ? fontBold : font;
    const words = safeStr(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = "";

    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (f.widthOfTextAtSize(test, size) <= maxWidth) {
        cur = test;
      } else {
        if (cur) lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  };

  const drawWrapped = (
    text,
    { size = sizes.body, bold = false, indent = 0, maxWidth, gap = gaps.normal } = {}
  ) => {
    const width = maxWidth || (page.getWidth() - marginX * 2 - indent);
    const lines = wrap(text, width, size, bold);
    for (const line of lines) {
      if (!drawTextLine(line, { size, bold, indent, gap })) return false;
    }
    return true;
  };

  const drawLeftRight = (
    left,
    right,
    { sizeLeft, sizeRight, boldLeft = true, boldRight = false, gap } = {}
  ) => {
    if (truncated) return false;
    const l = safeStr(left);
    const r = safeStr(right);
    if (!l && !r) return true;

    const sizeL = sizeLeft || sizes.roleHeader;
    const sizeR = sizeRight || sizes.roleMeta;
    const lh = lineHeight(Math.max(sizeL, sizeR), gap || gaps.normal);
    if (!hasSpace(lh)) {
      truncated = true;
      return false;
    }

    if (l) {
      page.drawText(l, {
        x: marginX,
        y: y - sizeL,
        size: sizeL,
        font: boldLeft ? fontBold : font,
        color: rgb(0, 0, 0),
      });
    }

    if (r) {
      const f = boldRight ? fontBold : font;
      const w = f.widthOfTextAtSize(r, sizeR);
      const x = page.getWidth() - marginX - w;
      page.drawText(r, {
        x: Math.max(marginX + 260, x),
        y: y - sizeR,
        size: sizeR,
        font: f,
        color: rgb(0, 0, 0),
      });
    }

    y -= lh;
    return true;
  };

  const drawSection = (title) => {
    if (truncated) return false;
    const topGap = compact ? 6 : 8;
    const afterRule = compact ? 7 : 8;
    const reserve = topGap + lineHeight(sizes.section, gaps.tight) + 10 + afterRule;
    if (!hasSpace(reserve)) {
      truncated = true;
      return false;
    }

    y -= topGap;
    if (!drawTextLine(title, { size: sizes.section, bold: true, gap: gaps.tight })) return false;

    page.drawLine({
      start: { x: marginX, y: y - 2 },
      end: { x: page.getWidth() - marginX, y: y - 2 },
      thickness: 0.75,
      color: rgb(0, 0, 0),
      opacity: 0.35,
    });
    y -= afterRule;
    return true;
  };

  const header = draft?.header || {};
  drawTextLine(safeStr(header.fullName) || "Resume", {
    size: sizes.name,
    bold: true,
    gap: gaps.tight,
  });

  const headline = safeStr(header.headline);
  if (headline) drawWrapped(headline, { size: sizes.headline, gap: gaps.tight });

  const contactBits = [
    safeStr(header.location),
    safeStr(header.phone),
    safeStr(header.email),
    safeStr(header.linkedin),
    safeStr(header.portfolio),
  ].filter(Boolean);
  if (contactBits.length) {
    drawWrapped(contactBits.join(" | "), {
      size: sizes.contact,
      maxWidth: page.getWidth() - marginX * 2,
      gap: gaps.tight,
    });
  }

  y -= compact ? 8 : 10;

  const summary = uniqStrings(draft?.summary, { max: 4 });
  if (summary.length && drawSection("PROFESSIONAL SUMMARY")) {
    for (const item of summary) {
      if (!drawWrapped(cleanBullet(item).replace(/^- /, ""), { size: sizes.bodySmall, gap: gaps.tight })) break;
    }
  }

  const skills = Array.isArray(draft?.skills) ? draft.skills : [];
  if (skills.length && drawSection("TECHNICAL SKILLS")) {
    for (const cat of skills.slice(0, 12)) {
      if (truncated) break;
      const category = safeStr(cat?.category);
      const items = uniqStrings(cat?.items, { max: 16 });
      if (!category || !items.length) continue;

      if (!drawTextLine(`${category}:`, { size: sizes.body, bold: true, gap: gaps.tight })) break;
      if (
        !drawWrapped(items.join(", "), {
          size: sizes.body,
          indent: 12,
          maxWidth: page.getWidth() - marginX * 2 - 12,
          gap: gaps.tight,
        })
      ) {
        break;
      }
      y -= compact ? 1 : 2;
    }
  }

  const exp = Array.isArray(draft?.experience) ? draft.experience : [];
  if (exp.length && drawSection("EXPERIENCE")) {
    for (const role of exp.slice(0, 5)) {
      if (truncated) break;
      const left = [safeStr(role?.title), safeStr(role?.company)].filter(Boolean).join(" - ");
      const right = [safeStr(role?.location), safeStr(role?.dates)].filter(Boolean).join(" | ");
      if (!drawLeftRight(left, right, { gap: gaps.tight })) break;

      const bullets = uniqStrings(role?.bullets, { max: 6 }).map(cleanBullet).filter(Boolean);
      for (const bullet of bullets) {
        const lines = wrap(bullet, page.getWidth() - marginX * 2 - 18, sizes.body, false);
        if (!lines.length) continue;
        if (!drawTextLine(`- ${lines[0]}`, { size: sizes.body, gap: gaps.tight })) break;
        for (const ln of lines.slice(1)) {
          if (!drawTextLine(ln, { size: sizes.body, indent: 18, gap: gaps.tight })) break;
        }
        if (truncated) break;
      }
      y -= compact ? 5 : 6;
    }
  }

  const edu = Array.isArray(draft?.education) ? draft.education : [];
  if (edu.length && drawSection("EDUCATION")) {
    for (const item of edu.slice(0, 3)) {
      if (truncated) break;
      const left = [safeStr(item?.degree), safeStr(item?.school)].filter(Boolean).join(" - ");
      if (!drawLeftRight(left, safeStr(item?.dates), { sizeLeft: sizes.body, sizeRight: sizes.bodySmall })) break;

      const details = uniqStrings(item?.details, { max: 3 });
      for (const detail of details) {
        if (
          !drawWrapped(cleanBullet(detail).replace(/^- /, ""), {
            size: sizes.bodySmall,
            indent: 12,
            gap: gaps.tight,
          })
        ) {
          break;
        }
      }
      y -= compact ? 3 : 4;
    }
  }

  const certs = uniqStrings(draft?.certifications, { max: 12 });
  if (certs.length && drawSection("CERTIFICATIONS")) {
    for (const cert of certs) {
      if (!drawTextLine(`- ${safeStr(cert)}`, { size: sizes.body, gap: gaps.tight })) break;
    }
  }

  const projects = Array.isArray(draft?.projects) ? draft.projects : [];
  const hasProjects = projects.some(
    (p) => safeStr(p?.name) || (Array.isArray(p?.bullets) && p.bullets.length)
  );
  if (hasProjects && drawSection("PROJECTS")) {
    for (const project of projects.slice(0, 3)) {
      if (truncated) break;
      const name = safeStr(project?.name);
      if (name && !drawTextLine(name, { size: sizes.body, bold: true, gap: gaps.tight })) break;

      const bullets = uniqStrings(project?.bullets, { max: 4 }).map(cleanBullet).filter(Boolean);
      for (const bullet of bullets) {
        const lines = wrap(bullet, page.getWidth() - marginX * 2 - 18, sizes.body, false);
        if (!lines.length) continue;
        if (!drawTextLine(`- ${lines[0]}`, { size: sizes.body, gap: gaps.tight })) break;
        for (const ln of lines.slice(1)) {
          if (!drawTextLine(ln, { size: sizes.body, indent: 18, gap: gaps.tight })) break;
        }
        if (truncated) break;
      }
      y -= compact ? 4 : 5;
    }
  }

  const bytes = await pdfDoc.save();
  return { buffer: Buffer.from(bytes), pageCount: 1, truncated };
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
 * Generate a tailored cover letter.
 * NOTE: If training sample, we clearly label it.
 */
async function generateCoverLetter({ jobData, resumeText, profile, trainingSample }) {
  const system = `
Write a tailored cover letter for the job described.
Return ONLY JSON:
{ "text": "..." }

Rules:
- 250 to 400 words.
- Use the candidate name: Avetis Gregory Suvalian.
- Mention jobTitle and company if available.
- Professional tone.
- Pull skill themes ONLY from the resume text provided. Do NOT invent credentials, tools, or experience.
- No "..." anywhere.
- No em dashes. Replace with commas or periods.
- If TRAINING_SAMPLE is true, the first line must say: "TRAINING SAMPLE - NOT FOR SUBMISSION"
- No markdown. JSON only.
`.trim();

  const user = `
TRAINING_SAMPLE: ${trainingSample ? "true" : "false"}

PROFILE:
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
    max_tokens: 850,
  });

  const parsed = safeJsonParse(content) || {};
  const text = String(parsed.text || "").trim();
  return toWinAnsiSafe(text);
}

async function applyPrepare(request, context) {
  let billed = false;
  let billedUserId = null;
  let billedReason = null;
  let creditCost = 5;

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

    const user = getAuthenticatedUser(request) || getSwaUser(request);
    if (!user) {
      return { status: 401, jsonBody: { ok: false, error: "Not authenticated" } };
    }

    const body = await request.json().catch(() => ({}));
    const resumeId = String(body.resumeId || "").trim();
    const jobDescriptionRaw = String(body.jobDescription || "").trim();
    const jobUrl = String(body.jobUrl || "").trim();

    // Accept "STANDARD"/"ELITE" or "standard"/"elite"
    const aiMode = String(body.aiMode || "standard").toLowerCase();
    const studentMode = !!body.studentMode;
    creditCost = Number(process.env.PACKET_CREDIT_COST || 5) || 5;

    // mode "real" (default) = strictly truthful.
    // mode "training_sample" = allows explicitly-labeled SAMPLE projects with watermark.
    const modeRaw = String(body.mode || "").toLowerCase();
    const mode = modeRaw === "training_sample" ? "training_sample" : "real";
    const trainingSample = mode === "training_sample";

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

    const resumeContentType = String(resumeDoc.contentType || "").toLowerCase();
    const resumeOriginalName = String(resumeDoc.originalName || resumeDoc.name || "resume.pdf");

    // Download source resume bytes
    const resumeBuffer = await downloadBlobToBuffer(
      AZURE_STORAGE_CONNECTION_STRING,
      BLOB_RESUMES_CONTAINER,
      resumeDoc.blobName
    );

    if (!resumeBuffer || resumeBuffer.length === 0) {
      return { status: 500, jsonBody: { ok: false, error: "Failed to download resume bytes" } };
    }

    // Extract resume text (ground truth) from PDF or DOCX.
    let resumeText = "";
    try {
      resumeText = await extractResumeTextFromBytes(resumeBuffer, {
        contentType: resumeContentType,
        originalName: resumeOriginalName,
      });
    } catch (extractErr) {
      if (extractErr?.code === "UNSUPPORTED_DOC_FORMAT") {
        return { status: 400, jsonBody: { ok: false, error: extractErr.message } };
      }
      return {
        status: 400,
        jsonBody: {
          ok: false,
          error: "Could not read resume content. Upload a selectable PDF or DOCX.",
          detail: extractErr?.message || String(extractErr),
        },
      };
    }

    if (!resumeText || resumeText.length < 40) {
      return {
        status: 400,
        jsonBody: {
          ok: false,
          error: "Could not extract enough resume text. Use a selectable PDF or DOCX.",
        },
      };
    }

    // Load profile (trusted)
    const profile = await tryLoadUserProfile(cosmos, COSMOS_DB_NAME, user.userId);

    // Charge packet cost before generation work starts.
    billedUserId = user.userId;
    billedReason = `packet_generate:${Date.now()}`;
    try {
      await spendCredits(user.userId, creditCost, billedReason, {
        source: "apply_prepare",
        resumeId,
        aiMode,
        studentMode,
      });
      billed = true;
    } catch (e) {
      if (e?.code === "INSUFFICIENT_CREDITS") {
        const current = await getCredits(user.userId);
        return {
          status: 402,
          jsonBody: {
            ok: false,
            error: "Insufficient credits",
            needed: creditCost,
            balance: Number(current?.balance || 0) || 0,
          },
        };
      }
      throw e;
    }

    // Canonical name
    const nameFromResume = detectCanonicalNameFromResumeText(resumeText);
    const canonicalFullName = safeStr(nameFromResume || profile.fullName || "").trim();

    // Extract job data
    const jobData = await extractJobWithAoai(jobDescriptionRaw);

    // Target keywords
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
      mode,
    });

    // PASS 2: Refine (STANDARD vs ELITE prompt routing is inside)
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
        mode,
      });
      if (refined && typeof refined === "object") draft = refined;
    } catch (e) {
      log(context, "refineTailoredResumeDraft failed; using draft:", e?.message || e);
    }

    // PASS 3: Audit + Final polish (STANDARD vs ELITE prompt routing)
    try {
      const audited = await auditAndPolishDraft({
        draft,
        jobData,
        resumeText,
        canonicalFullName,
        targetKeywords,
        mode,
        aiMode,
      });

      // Ã¢Å“â€¦ FIX: accept both wrapper shapes (but our prompts now always return { final: ... })
      if (audited && typeof audited === "object") {
        if (audited.final && typeof audited.final === "object") {
          draft = audited.final;
        } else if (audited.header || audited.summary || audited.skills) {
          draft = audited;
        }
      }
    } catch (e) {
      log(context, "auditAndPolishDraft failed; using refined draft:", e?.message || e);
    }

    // Normalize + sanitize (enforce name)
    const normalized = normalizeDraft(draft, {
      canonicalFullName,
      profile,
      userEmail: user.email,
    });

    // Render ATS PDF (hard single-page; if truncated, rerender compact to fit more).
    let render = await renderAtsPdfSinglePage(normalized, { compact: false, trainingSample });
    if (render.truncated || render.pageCount > 1) {
      render = await renderAtsPdfSinglePage(normalized, { compact: true, trainingSample });
    }

    const tailoredPdfBuffer = render.buffer;

    // Upload tailored PDF
    const now = new Date();
    const ts = now.toISOString().replace(/[:.]/g, "-");
    const baseName = String(resumeDoc.originalName || resumeDoc.name || "resume")
      .replace(/\.(pdf|doc|docx|txt)$/i, "")
      .trim();

    const suffix = trainingSample ? "_TRAINING_SAMPLE" : "_TAILORED";
    const tailoredFileName = `${baseName}${suffix}_${ts}.pdf`;
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

      atsKeywords: uniqStrings(targetKeywords, { max: 42 }),
      overlaysAppliedCount: 0,

      tailorMode: trainingSample ? "training-sample-v1" : "regen-ats-v3",
      trainingSample: !!trainingSample,
      hiddenFromLibrary: true,
      sourceType: "tailored_packet",

      uploadedAt: now.toISOString(),
      updated_date: now.toISOString().split("T")[0],
    };

    await resumesContainer.items.upsert(tailoredResumeDoc, { partitionKey: user.userId });

    // Cover letter
    const coverLetterText = await generateCoverLetter({
      jobData,
      resumeText,
      profile,
      trainingSample,
    });

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

      atsKeywords: uniqStrings(targetKeywords, { max: 42 }),
      text: toWinAnsiSafe(coverLetterText || ""),

      createdAt: now.toISOString(),
      updated_date: now.toISOString().split("T")[0],
    };

    await coverLettersContainer.items.upsert(coverLetterDoc, { partitionKey: user.userId });

    return {
      status: 200,
      jsonBody: {
        ok: true,
        mode,
        aiMode,
        studentMode,
        jobData,
        tailoredResume: tailoredResumeDoc,
        coverLetter: coverLetterDoc,
        overlaysApplied: [],
        misses: [],
        creditsCharged: creditCost,
      },
    };
  } catch (err) {
    if (billed && billedUserId && billedReason) {
      try {
        await grantCredits(
          billedUserId,
          creditCost,
          `refund:${billedReason}`,
          { source: "apply_prepare", reason: "generation_failed" }
        );
      } catch (refundErr) {
        log(context, "applyPrepare refund failed:", refundErr?.message || refundErr);
      }
    }

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
