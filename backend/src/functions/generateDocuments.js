// src/functions/generateDocuments.js
const OpenAI = require("openai");
const { CosmosClient } = require("@azure/cosmos");

const client = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT}`,
  defaultQuery: { "api-version": "2024-02-15-preview" },
  defaultHeaders: { "api-key": process.env.AZURE_OPENAI_API_KEY }
});

const cosmos = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const container = cosmos
  .database(process.env.COSMOS_DB_NAME)
  .container(process.env.COSMOS_CONTAINER_NAME);

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
  const body = await safeJson(request);

  const jobDescription = normalizeString(body.jobDescription);
  const userProfile = body.userProfile || {};

  const name = normalizeString(userProfile.name);
  const experience = ensureArray(userProfile.experience);
  const skills = ensureArray(userProfile.skills);

  if (!jobDescription || !name) {
    return {
      status: 400,
      jsonBody: { error: "Missing jobDescription or userProfile.name" }
    };
  }

  try {
    const prompt = `
Return JSON only with keys:
- jobTitle (string)
- coverLetter (string)
- resumeBullets (array of 4-6 strings)

Rules:
- Be honest. Do NOT invent experience.
- Use the candidate info exactly as given.

JOB DESCRIPTION:
${jobDescription}

CANDIDATE:
Name: ${name}
Experience: ${experience.join(", ")}
Skills: ${skills.join(", ")}
`;

    const aiResp = await client.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT,
      messages: [
        { role: "system", content: "You produce strict JSON. No markdown. No extra keys." },
        { role: "user", content: prompt }
      ],
      temperature: 0.4
    });

    const raw = aiResp.choices?.[0]?.message?.content || "{}";

    // Parse model output safely
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { status: 500, jsonBody: { error: "AI returned non-JSON output", raw } };
    }

    const job = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "generated",
      jobDescription,
      jobTitle: normalizeString(parsed.jobTitle) || "Untitled",
      coverLetter: normalizeString(parsed.coverLetter) || "",
      resumeBullets: Array.isArray(parsed.resumeBullets) ? parsed.resumeBullets : [],
      // If your Cosmos container uses /id as PK, you’re good.
      // If you later add auth, add userId here and use PK /userId.
    };

    await container.items.create(job);

    return { status: 200, jsonBody: job };
  } catch (err) {
    context.error("generateDocuments error:", err);
    return {
      status: 500,
      jsonBody: { error: "AI generation failed", details: err?.message || "Unknown error" }
    };
  }
}

module.exports = { generateDocuments };
