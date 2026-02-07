const { CosmosClient } = require("@azure/cosmos");
const OpenAI = require("openai");
const crypto = require("crypto");

const cosmos = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const container = cosmos
  .database(process.env.COSMOS_DB_NAME)
  .container(process.env.COSMOS_CONTAINER_NAME);

async function generateDocuments(request, context) {
  let body = {};
  try {
    body = await request.json();
  } catch {}

  const { jobDescription, userProfile } = body;

  if (!jobDescription || !userProfile) {
    return {
      status: 400,
      jsonBody: { error: "Missing jobDescription or userProfile" }
    };
  }

  const client = new OpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT}`,
    defaultQuery: { "api-version": "2024-02-15-preview" },
    defaultHeaders: { "api-key": process.env.AZURE_OPENAI_API_KEY }
  });

  const prompt = `
Write a professional cover letter and 4 resume bullet points.
Do not invent experience.

JOB DESCRIPTION:
${jobDescription}

CANDIDATE:
Name: ${userProfile.name}
Experience: ${userProfile.experience.join(", ")}
Skills: ${userProfile.skills.join(", ")}
`;

  const aiResp = await client.chat.completions.create({
    model: process.env.AZURE_OPENAI_DEPLOYMENT,
    messages: [
      { role: "system", content: "You are a professional resume assistant." },
      { role: "user", content: prompt }
    ],
    temperature: 0.4
  });

  const content = aiResp.choices?.[0]?.message?.content || "";

  const jobDoc = {
    id: crypto.randomUUID(),
    userId: "demo",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    jobTitle: jobDescription.split("\n")[0].slice(0, 80),
    status: "generated",
    jobDescription,
    coverLetter: content,
    resumeBullets: content
      .split("\n")
      .filter(l => l.startsWith("-"))
      .map(l => l.replace(/^- /, ""))
      .slice(0, 4)
  };

  await container.items.create(jobDoc);

  return {
    status: 200,
    jsonBody: jobDoc
  };
}

module.exports = { generateDocuments };
