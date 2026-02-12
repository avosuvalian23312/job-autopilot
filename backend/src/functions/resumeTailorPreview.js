// backend/src/functions/resumeTailorPreview.js
"use strict";

const { CosmosClient } = require("@azure/cosmos");

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

function jsonFromModel(content) {
  const s = String(content || "").trim();
  try {
    return JSON.parse(s);
  } catch {
    const a = s.indexOf("{");
    const b = s.lastIndexOf("}");
    if (a !== -1 && b !== -1 && b > a) return JSON.parse(s.slice(a, b + 1));
    return null;
  }
}

async function aoaiChat({ system, user }) {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;

  // Same version style you used
  const apiVersion = "2024-02-15-preview";

  if (!endpoint || !apiKey || !deployment) {
    return { ok: false, error: "AOAI not configured" };
  }

  const url =
    `${endpoint.replace(/\/$/, "")}` +
    `/openai/deployments/${encodeURIComponent(deployment)}` +
    `/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": apiKey },
    body: JSON.stringify({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
      max_tokens: 1400,
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { ok: false, error: `AOAI HTTP ${res.status}`, detail: t };
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || "";
  const parsed = jsonFromModel(content);
  if (!parsed) return { ok: false, error: "Model returned non-JSON", raw: content };
  return { ok: true, data: parsed };
}

module.exports = async function (request, context) {
  try {
    if (request.method === "OPTIONS") {
      return {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST,OPTIONS",
          "Access-Control-Allow-Headers": "content-type",
        },
      };
    }

    const user = getSwaUser(request);
    if (!user) return { status: 401, jsonBody: { ok: false, error: "Not authenticated" } };

    const COSMOS_CONNECTION_STRING = process.env.COSMOS_CONNECTION_STRING;
    const COSMOS_DB_NAME = process.env.COSMOS_DB_NAME;
    const COSMOS_RESUMES_CONTAINER_NAME = process.env.COSMOS_RESUMES_CONTAINER_NAME;
    const COSMOS_JOBS_CONTAINER_NAME = process.env.COSMOS_JOBS_CONTAINER_NAME;
    const COSMOS_USERDATA_CONTAINER_NAME = process.env.COSMOS_USERDATA_CONTAINER_NAME;

    if (!COSMOS_CONNECTION_STRING || !COSMOS_DB_NAME || !COSMOS_RESUMES_CONTAINER_NAME || !COSMOS_JOBS_CONTAINER_NAME || !COSMOS_USERDATA_CONTAINER_NAME) {
      return { status: 500, jsonBody: { ok: false, error: "Missing Cosmos env vars (DB/container names)" } };
    }

    let body = {};
    try { body = await request.json(); } catch { body = {}; }

    const resumeId = String(body.resumeId || "").trim();
    const jobId = String(body.jobId || "").trim();

    if (!resumeId || !jobId) {
      return { status: 400, jsonBody: { ok: false, error: "Missing resumeId or jobId" } };
    }

    const cosmos = new CosmosClient(COSMOS_CONNECTION_STRING);
    const db = cosmos.database(COSMOS_DB_NAME);

    const resumes = db.container(COSMOS_RESUMES_CONTAINER_NAME);
    const jobs = db.container(COSMOS_JOBS_CONTAINER_NAME);
    const userData = db.container(COSMOS_USERDATA_CONTAINER_NAME);

    // ✅ point reads by id + partitionKey (/userId)
    const resumeResp = await resumes.item(resumeId, user.userId).read().catch(() => null);
    const jobResp = await jobs.item(jobId, user.userId).read().catch(() => null);

    const resumeDoc = resumeResp?.resource || null;
    const jobDoc = jobResp?.resource || null;

    if (!resumeDoc) return { status: 404, jsonBody: { ok: false, error: "Resume not found" } };
    if (!jobDoc) return { status: 404, jsonBody: { ok: false, error: "Job not found" } };

    const resumeText = String(resumeDoc.text || "").trim();
    if (!resumeText) {
      return {
        status: 400,
        jsonBody: {
          ok: false,
          error: "Resume text missing. Parse the resume and store resumes.text first.",
          hint: "Update upload flow to send body.text, or add a backend parse step that fills resumes.text.",
        },
      };
    }

    const extracted = jobDoc.extracted || jobDoc.extraction || null;
    if (!extracted || typeof extracted !== "object") {
      return {
        status: 400,
        jsonBody: {
          ok: false,
          error: "Job extraction missing. Ensure jobs.extracted is saved (output of extractJob.js).",
        },
      };
    }

    const jobTitle = String(extracted.jobTitle || jobDoc.jobTitle || "").trim();
    const company = String(extracted.company || jobDoc.company || "").trim();
    const location = String(extracted.location || jobDoc.location || "").trim();

    const system = `
You are an ATS resume tailoring engine.

INPUTS:
- Resume text (from the user's existing resume)
- Job extraction JSON (trusted but may be incomplete)

OUTPUT:
Return ONLY valid JSON with EXACT keys:

draftResume: object with keys:
  headline (string|null)
  summary (string|null)                  // 2-4 lines, ATS-friendly, no fluff
  skills (string[])                      // hard skills + tools, deduped
  experience (array) items:
    sectionTitle (string)                // keep original employer/role if present
    bullets (string[])                   // 3-6 bullets, rewritten to match job using ATS terms
  projects (array) items:
    name (string)
    bullets (string[])
  education (string|null)
  certifications (string[])

ats: object:
  keywordsUsed (string[])                // keywords injected from job extraction
  keywordsMissing (string[])             // relevant job keywords not present in resume
  matchScore (number)                    // 0-100 heuristic estimate

rules (object):
  changesMade (string[])                 // short list of transformations
  warnings (string[])                    // if resume missing required skills, etc.

CRITICAL RULES:
- DO NOT invent employers, dates, degrees, or certifications.
- Only rewrite/reshape using facts already in the resume text.
- You MAY add ATS synonyms (e.g., "ticketing systems" for "Jira") but do not claim tools the resume never indicates.
- If something is unknown, set null or [].
No markdown. No extra keys.
`.trim();

    const userMsg = `
JOB CONTEXT:
jobTitle: ${jobTitle || "(unknown)"}
company: ${company || "(unknown)"}
location: ${location || "(unknown)"}

JOB EXTRACTION JSON:
${JSON.stringify(extracted, null, 2)}

RESUME TEXT:
${resumeText}
`.trim();

    const ai = await aoaiChat({ system, user: userMsg });

    // If AOAI not configured, return a safe fallback so UI doesn't break
    if (!ai.ok) {
      return {
        status: 200,
        jsonBody: {
          ok: true,
          draftId: null,
          draft: {
            draftResume: {
              headline: jobTitle || null,
              summary: null,
              skills: Array.isArray(extracted.keywords) ? extracted.keywords.slice(0, 18) : [],
              experience: [],
              projects: [],
              education: null,
              certifications: [],
            },
            ats: { keywordsUsed: [], keywordsMissing: [], matchScore: 0 },
            rules: { changesMade: ["AOAI not configured"], warnings: [ai.error] },
          },
        },
      };
    }

    const draft = ai.data;

    // ✅ store draft in usersData
    const now = new Date().toISOString();
    const draftDoc = {
      id: `draft:${user.userId}:${Date.now()}`,
      userId: user.userId,
      type: "resumeDraft",
      resumeId,
      jobId,
      createdAt: now,
      promptVersion: "tailor_v1",
      output: draft,
    };

    await userData.items.upsert(draftDoc, { partitionKey: user.userId });

    return {
      status: 200,
      jsonBody: { ok: true, draftId: draftDoc.id, draft },
    };
  } catch (err) {
    context.log.error("resumeTailorPreview error:", err);
    return {
      status: 500,
      jsonBody: { ok: false, error: "Internal Server Error", detail: err?.message || String(err) },
    };
  }
};
