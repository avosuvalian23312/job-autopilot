// backend/src/functions/applyPrepare.js
"use strict";

const { CosmosClient } = require("@azure/cosmos");
const { BlobServiceClient } = require("@azure/storage-blob");
const { PDFDocument, StandardFonts, rgb, degrees } = require("pdf-lib");

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

function clampStr(s, maxLen = 140) {
  const t = safeStr(s);
  if (!t) return "";
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen - 1).trim() + ".";
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
      words.every((w) => /^[A-Z][a-z]+$/.test(w)) || words.some((w) => /^[A-Z][a-z]+$/.test(w));

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
    if (/^(professional|technical|experience|education|certifications|projects)\b/i.test(l)) continue;
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

  for (const k of Array.isArray(jobData?.keywords) ? jobData.keywords : []) add(k);

  const req = jobData?.requirements && typeof jobData.requirements === "object" ? jobData.requirements : null;
  if (req) {
    for (const k of Array.isArray(req.skillsRequired) ? req.skillsRequired : []) add(k);
    for (const k of Array.isArray(req.skillsPreferred) ? req.skillsPreferred : []) add(k);
    for (const k of Array.isArray(req.certificationsPreferred) ? req.certificationsPreferred : []) add(k);
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
- header.fullName MUST be exactly CANONICAL_FULL_NAME. Never change the name.
- If MODE is "real": use ONLY facts supported by RESUME TEXT or PROFILE. Do NOT invent anything.
- If MODE is "training_sample": you MAY include SAMPLE projects/labs, but they MUST be clearly labeled "SAMPLE" and described as practice/learning, not real work.
- No "..." anywhere. No incomplete endings like "for".
- No fake metrics unless explicitly labeled SAMPLE and only in training_sample mode.
- Keep to 1 page: concise, no fluff.
- Bullets should be action-forward and <= 110 characters preferred.

MOCK DATA POLICY:
- MODE "real": You MUST NOT invent any facts. All experience, dates, employers, titles, tools, metrics, and education must come from RESUME TEXT or PROFILE.
- MODE "training_sample": You MAY generate SAMPLE bullets and SAMPLE projects/labs ONLY if:
  • They are clearly labeled "SAMPLE".
  • They are described as practice, training, or learning exercises.
  • They do NOT imply real employment, real clients, real companies, or real dates.
  • They stay within the candidate’s demonstrated skill boundaries.
- SAMPLE bullets MUST be framed as capabilities, practice tasks, or learning exercises—not real work.
- SAMPLE metrics are allowed ONLY in training_sample mode and MUST be labeled SAMPLE.
- SAMPLE content may appear ONLY in:
  • summary
  • skills
  • projects
  • experience.bullets (capability-style only, never implying new employment)
- Never create fake employers, fake dates, fake titles, or fake job history under any mode.

QUALITY:
- Extremely tailor to JOB DATA and TARGET_KEYWORDS (weave naturally).
- Use recruiter-friendly ordering: headline -> summary -> skills -> experience -> education -> certs -> projects.
- Skills must be grouped into clean categories (5–7 categories).
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
    temperature: aiMode === "elite" ? 0.27 : 0.22,
    max_tokens: 1700,
  });

  return safeJsonParse(content) || {};
}

// ---------------------------
// PASS 2 prompts (STANDARD vs ELITE)
// ---------------------------

/**
 * STANDARD: truthful-only resume refinement.
 * - No new employers/roles/dates
 * - No invented experience/projects
 * - In training_sample mode, SAMPLE content must be clearly labeled SAMPLE
 */
const REFINE_SYSTEM_STANDARD = `
You are an expert ATS resume editor and resume architect.

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
- Skills must be grouped into clean, professional categories (5–7 categories).

TRUTHFULNESS RULES (STRICT):
- MODE "real": use ONLY facts supported by RESUME TEXT or PROFILE. Do NOT invent employers, titles, dates, roles, tools, credentials, or metrics.
- Do NOT add new employers or new jobs. Do NOT add new dates.
- You may rewrite bullets, reorder sections, and improve clarity/impact as long as it stays true.
- If something is not supported by RESUME TEXT or PROFILE, omit it.

TRAINING SAMPLE RULES:
- MODE "training_sample": you may add SAMPLE-only items ONLY if clearly labeled "SAMPLE" and described as practice/learning.
- SAMPLE content may appear only in summary, skills, and projects. Do NOT fabricate employment history.

JOB-TARGETING RULES:
- Read JOB DATA and TARGET_KEYWORDS carefully.
- Rewrite headline + summary to match the job’s domain.
- Rewrite skills to emphasize the tools/competencies the job values most (only if supported).
- Rewrite experience bullets to highlight the strongest alignment to the job.
- Weave keywords naturally; never keyword-stuff.

No markdown. JSON only.
`.trim();

/**
 * ELITE: higher-impact refinement, still truthful.
 * - Stronger positioning, better framing, better keyword coverage
 * - Still NO invented employers/roles/dates
 * - In training_sample mode, SAMPLE content must be labeled SAMPLE
 */
const REFINE_SYSTEM_ELITE_TRUTHFUL = `
You are an expert ATS resume writer, resume editor, and resume architect.

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
- Skills must be grouped into clean, professional categories (5–7 categories).

TRUTHFULNESS RULES:
- MODE "real": use ONLY facts supported by RESUME TEXT or PROFILE. Do NOT invent employers, titles, dates, roles, tools, credentials, or metrics.
- Do NOT add new employers or new jobs. Do NOT add new dates.
- You MAY strengthen bullets by:
  • clarifying scope and outcomes if implied by the text,
  • consolidating duplicates,
  • rewriting to recruiter language,
  • adding missing but supported tools/keywords from RESUME TEXT/PROFILE.
- If a detail is not supported, omit it.

TRAINING SAMPLE RULES:
- MODE "training_sample": you may add SAMPLE-only items ONLY if clearly labeled "SAMPLE" and described as practice/learning.
- SAMPLE content may appear in summary, skills, projects, and (capability-style) bullets. Do NOT fabricate employment history.

JOB-TARGETING RULES:
- Read JOB DATA and TARGET_KEYWORDS carefully.
- Rewrite headline + summary to strongly match the job’s domain.
- Rewrite skills to emphasize the tools/competencies the job values most (only if supported).
- Rewrite experience bullets to highlight the strongest alignment to the job.
- Improve ATS keyword coverage naturally across summary/skills/bullets.
- Prioritize recruiter scanning order:
  1. headline
  2. summary
  3. skills
  4. experience
  5. education
  6. certifications
  7. projects

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
  // ✅ STANDARD vs ELITE prompt routing
  const system =
    String(aiMode || "").toLowerCase() === "elite"
      ? REFINE_SYSTEM_ELITE_TRUTHFUL
      : REFINE_SYSTEM_STANDARD;

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
    temperature: 0.20,
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
- header.fullName MUST be exactly CANONICAL_FULL_NAME. Never change the name.
- If MODE is "real": use ONLY facts supported by RESUME TEXT or PROFILE. Do NOT invent anything.
- If MODE is "training_sample": you MAY include SAMPLE projects/labs, but they MUST be clearly labeled "SAMPLE" and described as practice/learning, not real work.
- No "..." anywhere. No incomplete endings like "for".
- No fake metrics unless explicitly labeled SAMPLE and only in training_sample mode.
- Keep to 1 page: concise, no fluff.
- Bullets should be action-forward and <= 110 characters preferred.

MOCK DATA POLICY:
- MODE "real": You MUST NOT invent any facts. All experience, dates, employers, titles, tools, metrics, and education must come from RESUME TEXT or PROFILE.
- MODE "training_sample": You MAY generate SAMPLE bullets and SAMPLE projects/labs ONLY if:
  • They are clearly labeled "SAMPLE".
  • They are described as practice, training, or learning exercises.
  • They do NOT imply real employment, real clients, real companies, or real dates.
  • They stay within the candidate’s demonstrated skill boundaries.
- SAMPLE bullets MUST be framed as capabilities, practice tasks, or learning exercises—not real work.
- SAMPLE metrics are allowed ONLY in training_sample mode and MUST be labeled SAMPLE.
- SAMPLE content may appear ONLY in:
  • summary
  • skills
  • projects
  • experience.bullets (capability-style only, never implying new employment)
- Never create fake employers, fake dates, fake titles, or fake job history under any mode.



QUALITY:
- Extremely tailor to JOB DATA and TARGET_KEYWORDS (weave naturally).
- Use recruiter-friendly ordering: headline -> summary -> skills -> experience -> education -> certs -> projects.
- Skills must be grouped into clean categories (5–7 categories).
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
  aiMode, // ✅ added to support STANDARD vs ELITE routing
}) {
  const modeKey = String(aiMode || "").toLowerCase() === "elite" ? "elite" : "standard";
  const system = modeKey === "elite" ? AUDIT_SYSTEM_ELITE_TRUTHFUL : AUDIT_SYSTEM_STANDARD;

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
    temperature: 0.18,
    max_tokens: 1800,
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
    summary: uniqStrings(d.summary, { max: 4 }).map((s) => clampStr(cleanBullet(s).replace(/^- /, ""), 130)),
    skills: [],
    experience: [],
    education: [],
    certifications: uniqStrings(d.certifications, { max: 12 }).map((c) => clampStr(c, 80)),
    projects: [],
  };

  // Skills
  const skills = Array.isArray(d.skills) ? d.skills : [];
  for (const s of skills.slice(0, 12)) {
    const category = safeStr(s?.category);
    const items = uniqStrings(s?.items, { max: 14 }).map((x) => clampStr(x, 45));
    if (!category || !items.length) continue;
    out.skills.push({ category, items });
  }

  // Experience
  const exp = Array.isArray(d.experience) ? d.experience : [];
  for (const r of exp.slice(0, 6)) {
    const bullets = uniqStrings(r?.bullets, { max: 6 })
      .map(cleanBullet)
      .map((b) => clampStr(b, 125))
      .filter(Boolean);

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
  const w = page.getWidth();
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

  const drawTextLine = (text, { size = sizes.body, bold = false, indent = 0, gap = gaps.normal } = {}) => {
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

  const drawWrapped = (text, { size = sizes.body, bold = false, indent = 0, maxWidth, gap = gaps.normal } = {}) => {
    const width = maxWidth || (page.getWidth() - marginX * 2 - indent);
    const lines = wrap(text, width, size, bold);
    for (const ln of lines) drawTextLine(ln, { size, bold, indent, gap });
  };

  const drawLeftRight = (left, right, { sizeLeft, sizeRight, boldLeft = true, boldRight = false, gap } = {}) => {
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
    for (const s of summary) drawWrapped(cleanBullet(s).replace(/^- /, ""), { size: sizes.bodySmall, gap: gaps.tight });
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
      const left = [title, company].filter(Boolean).join(" — ");

      const loc = safeStr(role?.location);
      const dates = safeStr(role?.dates);
      const right = [loc, dates].filter(Boolean).join(" | ");

      drawLeftRight(left, right, { gap: gaps.tight });

      const bullets = uniqStrings(role?.bullets, { max: 6 }).map(cleanBullet).filter(Boolean);
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
      const left = [degree, school].filter(Boolean).join(" — ");
      const dates = safeStr(e?.dates);

      drawLeftRight(left, dates, { sizeLeft: sizes.body, sizeRight: sizes.bodySmall, boldLeft: true, boldRight: false });

      const details = uniqStrings(e?.details, { max: 3 });
      for (const d of details) {
        drawWrapped(cleanBullet(d).replace(/^- /, ""), { size: sizes.bodySmall, indent: 12, gap: gaps.tight });
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

      const bullets = uniqStrings(p?.bullets, { max: 4 }).map(cleanBullet).filter(Boolean);
      for (const b of bullets) {
        const maxWidth = page.getWidth() - marginX * 2 - 18;
        const lines = wrap(b, maxWidth, sizes.body, false);
        if (lines.length) {
          drawTextLine("- " + lines[0], { size: sizes.body, gap: gaps.tight });
          for (const ln of lines.slice(1)) drawTextLine(ln, { size: sizes.body, indent: 18, gap: gaps.tight });
        }
      }
      y -= compact ? 4 : 5;
    }
  }

  const bytes = await pdfDoc.save();
  return { buffer: Buffer.from(bytes), pageCount: pdfDoc.getPageCount() };
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

    // Accept "STANDARD"/"ELITE" or "standard"/"elite"
    const aiMode = String(body.aiMode || "standard").toLowerCase();
    const studentMode = !!body.studentMode;

    // NEW:
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

      if (audited?.final && typeof audited.final === "object") {
        draft = audited.final;
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

    // Render ATS PDF (try normal -> compact if spills to page 2)
    let render = await renderAtsPdf(normalized, { compact: false, trainingSample });
    if (render.pageCount > 1) {
      render = await renderAtsPdf(normalized, { compact: true, trainingSample });
    }

    const tailoredPdfBuffer = render.buffer;

    // Upload tailored PDF
    const now = new Date();
    const ts = now.toISOString().replace(/[:.]/g, "-");
    const baseName = String(resumeDoc.originalName || resumeDoc.name || "resume.pdf").replace(/\.pdf$/i, "");

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
        aiMode, // ✅ echo mode back to client if you want
        studentMode,
        jobData,
        tailoredResume: tailoredResumeDoc,
        coverLetter: coverLetterDoc,
        overlaysApplied: [],
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
