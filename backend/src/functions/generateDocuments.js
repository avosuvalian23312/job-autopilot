// src/functions/generateDocuments.js

const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

const JOBS_PATH = path.join(process.cwd(), "data", "jobs.json");

function readJobs() {
  try {
    const raw = fs.readFileSync(JOBS_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeJobs(jobs) {
  fs.writeFileSync(JOBS_PATH, JSON.stringify(jobs, null, 2), "utf8");
}

// Create client once (re-used across invocations)
const client = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT}`,
  defaultQuery: { "api-version": "2024-02-15-preview" },
  defaultHeaders: { "api-key": process.env.AZURE_OPENAI_API_KEY }
});

function normalizeString(v) {
  return typeof v === "string" ? v.trim() : "";
}

function ensureArray(v) {
  if (Array.isArray(v)) return v.filter(Boolean).map(String);
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

async function safeJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function generateDocuments(request, context) {
  // ---- 0) Basic config validation ----
  const endpoint = normalizeString(process.env.AZURE_OPENAI_ENDPOINT);
  const key = normalizeString(process.env.AZURE_OPENAI_API_KEY);
  const deployment = normalizeString(process.env.AZURE_OPENAI_DEPLOYMENT);

  if (!endpoint || !key || !deployment) {
    return {
      status: 500,
      jsonBody: {
        error:
          "Server misconfigured. Missing AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_API_KEY / AZURE_OPENAI_DEPLOYMENT."
      }
    };
  }

  // ---- 1) Read and validate input ----
  const body = await safeJson(request);
  const jobDescription = normalizeString(body.jobDescription);

  const userProfile = body.userProfile || {};
  const name = normalizeString(userProfile.name);
  const experience = ensureArray(userProfile.experience);
  const skills = ensureArray(userProfile.skills);

  if (!jobDescription) {
    return { status: 400, jsonBody: { error: "Missing jobDescription" } };
  }
  if (!name) {
    return { status: 400, jsonBody: { error: "Missing userProfile.name" } };
  }

  // ---- 2) Cover letter prompt (no placeholders) ----
  const coverPrompt = `
Write a concise, professional cover letter (150–220 words).

Rules:
- Start with: "Dear Hiring Manager,"
- End with: "Sincerely, ${name}"
- Do NOT include addresses, phone numbers, or placeholders like [Your Address]
- Do NOT invent experience, education, or certifications
- Focus on matching the candidate's real experience/skills to the job

JOB DESCRIPTION:
${jobDescription}

CANDIDATE INFO:
Name: ${name}
Experience: ${experience.length ? experience.join("; ") : "Not provided"}
Skills: ${skills.length ? skills.join(", ") : "Not provided"}
`.trim();

  // ---- 3) Resume bullets prompt (structured JSON) ----
  const bulletsPrompt = `
Create ATS-friendly resume bullets tailored to the job using ONLY the candidate info.

Return STRICT JSON ONLY in this exact shape:
{
  "jobTitle": "string (best guess from job description)",
  "bullets": ["bullet 1", "bullet 2", "bullet 3", "bullet 4"]
}

Rules:
- Exactly 4 bullets
- Use strong action verbs
- No fake metrics unless provided
- No invented tools/certs/experience
- Each bullet 1 line (no paragraphs)

JOB DESCRIPTION:
${jobDescription}

CANDIDATE INFO:
Name: ${name}
Experience: ${experience.length ? experience.join("; ") : "Not provided"}
Skills: ${skills.length ? skills.join(", ") : "Not provided"}
`.trim();

  try {
    // ---- 4) Call Azure OpenAI (cover letter) ----
    const coverResp = await client.chat.completions.create({
      model: deployment,
      messages: [
        {
          role: "system",
          content:
            "You write clear, honest cover letters. Follow instructions strictly and do not invent experience."
        },
        { role: "user", content: coverPrompt }
      ],
      temperature: 0.4
    });

    const coverLetter =
      coverResp.choices?.[0]?.message?.content?.trim() || "";

    // ---- 5) Call Azure OpenAI (resume bullets JSON) ----
    const bulletsResp = await client.chat.completions.create({
      model: deployment,
      messages: [
        {
          role: "system",
          content:
            "You are an ATS resume writer. Output STRICT JSON only. No markdown. No extra text."
        },
        { role: "user", content: bulletsPrompt }
      ],
      temperature: 0.2
    });

    const bulletsRaw =
      bulletsResp.choices?.[0]?.message?.content?.trim() || "";

    let jobTitle = "";
    let resumeBullets = [];

    // Try to parse strict JSON; fallback safely if model returns extra text
    try {
      const parsed = JSON.parse(bulletsRaw);
      jobTitle = normalizeString(parsed.jobTitle);
      resumeBullets = ensureArray(parsed.bullets).slice(0, 4);
    } catch {
      // fallback: treat as text, split lines into bullets
      resumeBullets = bulletsRaw
        .split("\n")
        .map((l) => l.replace(/^[-•\d.\)\s]+/, "").trim())
        .filter(Boolean)
        .slice(0, 4);
    }
const jobs = readJobs();

const newJob = {
  id: crypto.randomUUID(),
  createdAt: new Date().toISOString(),
  jobTitle,
  status: "generated", // generated | applied | interview | rejected | offer
  jobDescription,
  coverLetter,
  resumeBullets
};

jobs.unshift(newJob);
writeJobs(jobs);

    // ---- 6) Return ----
   return {
  status: 200,
  jsonBody: {
    id: newJob.id,
    jobTitle,
    coverLetter,
    resumeBullets
  }
};

  } catch (err) {
    // Keep errors clean (no secret leakage)
    context.log("OpenAI call failed:", err?.message || err);
    return {
      status: 500,
      jsonBody: {
        error: "AI generation failed",
        details: err?.message || "Unknown error"
      }
    };
  }
}

module.exports = { generateDocuments };
