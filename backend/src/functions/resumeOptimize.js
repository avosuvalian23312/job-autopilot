// backend/src/functions/resumeOptimize.js
"use strict";

const { getAuthenticatedUser } = require("../lib/swaUser");

const { CosmosClient } = require("@azure/cosmos");
const { BlobServiceClient } = require("@azure/storage-blob");

// Optional deps (recommended):
// npm i pdf-parse mammoth
let pdfParse = null;
let mammoth = null;
try { pdfParse = require("pdf-parse"); } catch {}
try { mammoth = require("mammoth"); } catch {}

/**
 * SWA user (Static Web Apps auth)
 */
function getSwaUser(request) {
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

function safeUserId(userId) {
  return String(userId || "").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function uniqStrings(arr) {
  const seen = new Set();
  const out = [];
  for (const x of arr || []) {
    const s = String(x || "").replace(/\s+/g, " ").trim();
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

/**
 * Extract bullet lines from resume text.
 * Keeps order. We only rewrite these lines.
 */
function extractBulletLines(resumeText) {
  const lines = String(resumeText || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim());

  // bullet markers we accept
  const bulletRe = /^([Ã¢â‚¬Â¢Ã‚Â·Ã¢â€“ÂªÃ¢â€”ÂÃ¢â€”Â¦-]|(\d+\.))\s+/;

  // Keep bullets that look like real experience bullets (not headings)
  const bullets = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    if (bulletRe.test(line)) {
      const textOnly = line.replace(bulletRe, "").trim();

      // guard against junk tiny bullets
      if (textOnly.length < 8) continue;

      bullets.push({
        lineIndex: i,
        originalLine: line,
        originalBullet: textOnly,
      });
    }
  }

  return { lines, bullets };
}

/**
 * Download blob bytes by blobName
 */
async function downloadBlobBytes(storageConn, containerName, blobName) {
  const bsc = BlobServiceClient.fromConnectionString(storageConn);
  const container = bsc.getContainerClient(containerName);
  const blob = container.getBlobClient(blobName);

  const download = await blob.download();
  const chunks = [];
  for await (const chunk of download.readableStreamBody) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/**
 * Extract text from PDF/DOCX (basic)
 * NOTE: For "exact PDF layout editing" you need coordinates; this endpoint is Option B = bullets rewrite map.
 */
async function extractTextFromFileBytes(bytes, contentType, fileName) {
  const ct = String(contentType || "").toLowerCase();
  const name = String(fileName || "").toLowerCase();

  // PDF
  if (ct.includes("pdf") || name.endsWith(".pdf")) {
    if (!pdfParse) {
      throw new Error(
        "pdf-parse is not installed. Run: npm i pdf-parse"
      );
    }
    const out = await pdfParse(bytes);
    return String(out?.text || "").trim();
  }

  // DOCX
  if (ct.includes("word") || name.endsWith(".docx")) {
    if (!mammoth) {
      throw new Error(
        "mammoth is not installed. Run: npm i mammoth"
      );
    }
    const out = await mammoth.extractRawText({ buffer: bytes });
    return String(out?.value || "").trim();
  }

  // fallback
  return bytes.toString("utf8").trim();
}

/**
 * Build ATS keyword pool from extractJob output (your shape)
 */
function buildAtsKeywords(extracted) {
  const req = extracted?.requirements || {};
  const pool = [
    ...(extracted?.keywords || []),
    ...(req?.skillsRequired || []),
    ...(req?.skillsPreferred || []),
    ...(req?.certificationsPreferred || []),
  ];

  // clean + dedupe + trim
  const cleaned = uniqStrings(pool)
    .filter((s) => s.length >= 2)
    .slice(0, 30);

  return cleaned;
}

/**
 * Call Azure OpenAI Chat Completions (same pattern as your extractJob.js)
 */
async function callAzureOpenAI({ endpoint, apiKey, deployment, apiVersion, system, user }) {
  const url =
    `${String(endpoint || "").replace(/\/$/, "")}` +
    `/openai/deployments/${encodeURIComponent(deployment)}` +
    `/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
      max_tokens: 1400,
    }),
  });

  const txt = await res.text().catch(() => "");
  if (!res.ok) {
    const err = new Error(`AOAI HTTP ${res.status}`);
    err.detail = txt;
    throw err;
  }

  let data = null;
  try { data = JSON.parse(txt); } catch { data = null; }
  const content = data?.choices?.[0]?.message?.content || "";
  return content;
}

/**
 * Parse JSON safely from model output
 */
function safeJsonParse(content) {
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(content.slice(start, end + 1));
    }
    const s2 = content.indexOf("[");
    const e2 = content.lastIndexOf("]");
    if (s2 !== -1 && e2 !== -1 && e2 > s2) {
      return JSON.parse(content.slice(s2, e2 + 1));
    }
    return null;
  }
}

/**
 * MAIN HANDLER (exported)
 */
async function resumeOptimize(request, context) {
  try {
    if (request.method === "OPTIONS") return { status: 204 };
    if (request.method !== "POST") {
      return { status: 405, jsonBody: { ok: false, error: "Method not allowed" } };
    }

    const user = getAuthenticatedUser(request) || getSwaUser(request);
    if (!user) {
      return { status: 401, jsonBody: { ok: false, error: "Not authenticated" } };
    }

    const body = await request.json().catch(() => ({}));

    // You can send either:
    // - extracted: (output of /api/jobs/extract or stored extraction)
    // - OR jobExtracted: same
    const extracted = body?.extracted || body?.jobExtracted || null;

    // Required: resumeId so we can fetch resume doc -> blobName
    const resumeId = String(body?.resumeId || "").trim();
    if (!resumeId) {
      return { status: 400, jsonBody: { ok: false, error: "Missing resumeId" } };
    }
    if (!extracted || typeof extracted !== "object") {
      return { status: 400, jsonBody: { ok: false, error: "Missing extracted job data (extracted)" } };
    }

    // ENV
    const COSMOS_CONNECTION_STRING = process.env.COSMOS_CONNECTION_STRING;
    const COSMOS_DB_NAME = process.env.COSMOS_DB_NAME;
    const COSMOS_RESUMES_CONTAINER_NAME = process.env.COSMOS_RESUMES_CONTAINER_NAME;

    const AZURE_STORAGE_CONNECTION_STRING =
      process.env.AZURE_STORAGE_CONNECTION_STRING ||
      process.env.STORAGE_CONNECTION_STRING;

    const RESUME_BLOB_CONTAINER =
      process.env.RESUME_BLOB_CONTAINER ||
      process.env.BLOB_CONTAINER_NAME ||
      "resumes";

    if (!COSMOS_CONNECTION_STRING || !COSMOS_DB_NAME || !COSMOS_RESUMES_CONTAINER_NAME) {
      return {
        status: 500,
        jsonBody: { ok: false, error: "Missing Cosmos env vars (COSMOS_CONNECTION_STRING/COSMOS_DB_NAME/COSMOS_RESUMES_CONTAINER_NAME)" },
      };
    }
    if (!AZURE_STORAGE_CONNECTION_STRING) {
      return {
        status: 500,
        jsonBody: { ok: false, error: "Missing storage env var (AZURE_STORAGE_CONNECTION_STRING or STORAGE_CONNECTION_STRING)" },
      };
    }

    // Load resume doc from Cosmos
    const cosmos = new CosmosClient(COSMOS_CONNECTION_STRING);
    const resumesContainer = cosmos.database(COSMOS_DB_NAME).container(COSMOS_RESUMES_CONTAINER_NAME);

    let resumeDoc = null;
    try {
      const r = await resumesContainer.item(resumeId, user.userId).read();
      resumeDoc = r?.resource || null;
    } catch (e) {
      // some people store id with "resume:..." and pass full id - ok
      resumeDoc = null;
    }

    if (!resumeDoc) {
      return { status: 404, jsonBody: { ok: false, error: "Resume not found in Cosmos", resumeId } };
    }

    // Must belong to this user
    if (String(resumeDoc.userId || "") !== String(user.userId)) {
      return { status: 403, jsonBody: { ok: false, error: "Forbidden" } };
    }

    const blobName = String(resumeDoc.blobName || resumeDoc.blobPath || "").trim();
    const contentType = String(resumeDoc.contentType || "application/pdf");
    const originalName = String(resumeDoc.originalName || resumeDoc.name || "resume.pdf");

    if (!blobName) {
      return { status: 500, jsonBody: { ok: false, error: "Resume doc missing blobName" } };
    }

    // Download resume bytes
    const bytes = await downloadBlobBytes(
      AZURE_STORAGE_CONNECTION_STRING,
      RESUME_BLOB_CONTAINER,
      blobName
    );

    // Extract raw text
    const resumeText = await extractTextFromFileBytes(bytes, contentType, originalName);
    if (!resumeText || resumeText.length < 50) {
      return { status: 200, jsonBody: { ok: false, error: "Could not extract enough text from resume" } };
    }

    // Find bullet lines to rewrite
    const { lines, bullets } = extractBulletLines(resumeText);

    if (!bullets.length) {
      return {
        status: 200,
        jsonBody: {
          ok: true,
          resumeId,
          mode: "suggestions",
          message: "No bullet lines detected. (Upload DOCX or ensure resume has bullet markers like Ã¢â‚¬Â¢ or -)",
          detectedBullets: 0,
        },
      };
    }

    // Build ATS keyword pool
    const atsKeywords = buildAtsKeywords(extracted);

    // Azure OpenAI env (same as extractJob)
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
    const apiVersion = "2024-02-15-preview";

    // If no AOAI configured, return Ã¢â‚¬Å“safe fallbackÃ¢â‚¬Â (no rewriting)
    if (!endpoint || !apiKey || !deployment) {
      return {
        status: 200,
        jsonBody: {
          ok: true,
          resumeId,
          mode: "suggestions",
          usedAzureOpenAI: false,
          atsKeywords,
          detectedBullets: bullets.length,
          replacements: bullets.map((b) => ({
            lineIndex: b.lineIndex,
            original: b.originalLine,
            optimized: b.originalLine,
            note: "AOAI not configured; returned originals.",
          })),
        },
      };
    }

    // --------- AI PROMPT (HARDENED FOR Ã¢â‚¬Å“wrong role/websiteÃ¢â‚¬Â + Ã¢â‚¬Å“no hallucinationsÃ¢â‚¬Â) ----------
    // IMPORTANT: We DO NOT ask it to change structure. We only rewrite bullets 1:1.
    const system = `
You are an ATS resume bullet optimizer.

Goal:
Rewrite ONLY the provided resume bullets to better match the job, using ATS keywords when relevant.

Output rules (MANDATORY):
- Return ONLY valid JSON.
- Do NOT add or remove bullets.
- Keep bullets in the EXACT same order.
- Do NOT invent employers, titles, tools, dates, certifications, degrees, or metrics.
- If a bullet has numbers/metrics, keep them and do not fabricate new ones.
- Keep each bullet roughly the same length (within Ã‚Â±20% chars).
- Preserve tense and meaning, but improve ATS phrasing.
- Integrate job keywords naturally (not keyword-stuffing). Only add keywords that are truly compatible with the bullet.
- If a bullet cannot be improved without inventing, return it unchanged.

JSON shape (EXACT):
{
  "optimizedBullets": [
    { "index": number, "optimized": string }
  ]
}
`.trim();

    // Provide job extraction + keyword pool + bullets only (clean + constrained)
    const bulletPayload = bullets.map((b, idx) => ({
      index: idx,
      original: b.originalBullet,
    }));

    const userPrompt = `
JOB EXTRACT (reference only, do not invent facts):
${JSON.stringify(extracted, null, 2)}

ATS KEYWORDS (use selectively):
${JSON.stringify(atsKeywords, null, 2)}

RESUME BULLETS (rewrite 1:1):
${JSON.stringify(bulletPayload, null, 2)}
`.trim();

    const content = await callAzureOpenAI({
      endpoint,
      apiKey,
      deployment,
      apiVersion,
      system,
      user: userPrompt,
    });

    const parsed = safeJsonParse(content);

    const optimizedArr = Array.isArray(parsed?.optimizedBullets)
      ? parsed.optimizedBullets
      : null;

    if (!optimizedArr || optimizedArr.length !== bullets.length) {
      // Hard fail-safe: return originals, but still show why
      return {
        status: 200,
        jsonBody: {
          ok: true,
          resumeId,
          mode: "suggestions",
          usedAzureOpenAI: true,
          warning: "Model output invalid or wrong length. Returning original bullets.",
          atsKeywords,
          detectedBullets: bullets.length,
          replacements: bullets.map((b) => ({
            lineIndex: b.lineIndex,
            original: b.originalLine,
            optimized: b.originalLine,
          })),
        },
      };
    }

    // Apply replacements into the resume text (text-only preview)
    const updatedLines = [...lines];
    const replacements = [];

    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      const rec = optimizedArr[i];
      const optimized = String(rec?.optimized || "").trim();

      // If model gives empty, keep original
      const finalBulletText = optimized ? optimized : b.originalBullet;

      // Preserve the original bullet marker from the line
      const markerMatch = b.originalLine.match(/^([Ã¢â‚¬Â¢Ã‚Â·Ã¢â€“ÂªÃ¢â€”ÂÃ¢â€”Â¦-]|\d+\.)\s+/);
      const marker = markerMatch ? markerMatch[0] : "Ã¢â‚¬Â¢ ";

      const newLine = `${marker}${finalBulletText}`;

      updatedLines[b.lineIndex] = newLine;

      replacements.push({
        lineIndex: b.lineIndex,
        original: b.originalLine,
        optimized: newLine,
      });
    }

    const updatedText = updatedLines.filter(Boolean).join("\n");

    return {
      status: 200,
      jsonBody: {
        ok: true,
        resumeId,
        mode: "suggestions",
        usedAzureOpenAI: true,
        atsKeywords,
        detectedBullets: bullets.length,
        replacements,
        // Keep payload safe (donÃ¢â‚¬â„¢t return entire resume if huge)
        updatedTextPreview: updatedText.slice(0, 12000),
      },
    };
  } catch (err) {
    context.log.error("resumeOptimize error:", err);
    return {
      status: 500,
      jsonBody: {
        ok: false,
        error: "Internal Server Error",
        detail: err?.message || String(err),
      },
    };
  }
}

// Ã¢Å“â€¦ v4-friendly named export for index.js require(...).resumeOptimize
module.exports = { resumeOptimize };
