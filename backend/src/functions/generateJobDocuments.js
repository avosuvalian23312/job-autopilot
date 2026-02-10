// backend/src/functions/generateJobDocuments.js
"use strict";
const { CosmosClient } = require("@azure/cosmos");

const cosmos = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const container = cosmos
  .database(process.env.COSMOS_DB_NAME)
  .container(process.env.COSMOS_CONTAINER_NAME); // jobs container

function buildResumeText(job) {
  // TODO: Replace with OpenAI output later
  return `TAILORED RESUME (stub)
Role: ${job.jobTitle}
Company: ${job.company || "N/A"}
Keywords: ${(job.keywords || []).join(", ")}

- Updated bullets would go here based on job description.
`;
}

function buildCoverLetterText(job) {
  // TODO: Replace with OpenAI output later
  return `COVER LETTER (stub)

Dear Hiring Manager at ${job.company || "your company"},

I’m applying for the ${job.jobTitle} role. Based on the job description, I’m a strong match for: ${(job.keywords || []).join(", ") || "the role requirements"}.

Sincerely,
Applicant
`;
}

async function generateJobDocuments(request, context) {
  const jobId = request?.params?.jobId;
  if (!jobId) return { status: 400, jsonBody: { error: "Missing jobId" } };

  let body = {};
  try { body = await request.json(); } catch {}

  const userId = body?.userId; // needed because PK=/userId
  if (!userId) return { status: 400, jsonBody: { error: "Missing userId" } };

  try {
    const { resource: job } = await container.item(jobId, userId).read();
    if (!job) return { status: 404, jsonBody: { error: "Job not found" } };

    // prevent duplicate regen if already completed (optional)
    if (job.status === "completed" && job.outputs?.resume && job.outputs?.coverLetter) {
      return { status: 200, jsonBody: { ok: true, job, alreadyGenerated: true } };
    }

    // mark generating
    job.status = "generating";
    job.updatedAt = new Date().toISOString();
    await container.item(job.id, job.userId).replace(job);

    // generate (stub for now)
    const resumeText = buildResumeText(job);
    const coverLetterText = buildCoverLetterText(job);

    job.outputs = {
      resume: {
        text: resumeText,
        fileName: `Resume - ${job.company || "Company"} - ${job.jobTitle}.txt`,
        generatedAt: new Date().toISOString(),
      },
      coverLetter: {
        text: coverLetterText,
        fileName: `Cover Letter - ${job.company || "Company"} - ${job.jobTitle}.txt`,
        generatedAt: new Date().toISOString(),
      },
    };

    job.status = "completed";
    job.completedAt = new Date().toISOString();
    job.updatedAt = new Date().toISOString();

    await container.item(job.id, job.userId).replace(job);

    return { status: 200, jsonBody: { ok: true, job } };
  } catch (err) {
    context.error("generateJobDocuments error:", err);
    return { status: 500, jsonBody: { error: "Generation failed", details: err?.message || "Unknown error" } };
  }
}

module.exports = { generateJobDocuments };
