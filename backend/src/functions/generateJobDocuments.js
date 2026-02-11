// backend/src/functions/generateJobDocuments.js
"use strict";

const { CosmosClient } = require("@azure/cosmos");
const { getSwaUserId } = require("../lib/swaUser"); // returns a STRING userId

const cosmos = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const container = cosmos
  .database(process.env.COSMOS_DB_NAME)
  .container(process.env.COSMOS_CONTAINER_NAME); // jobs container

function buildResumeText(job) {
  return `TAILORED RESUME (stub)
Role: ${job.jobTitle}
Company: ${job.company || "N/A"}
Keywords: ${(job.keywords || []).join(", ")}

- Updated bullets would go here based on job description.
`;
}

function buildCoverLetterText(job) {
  return `COVER LETTER (stub)

Dear Hiring Manager at ${job.company || "your company"},

I’m applying for the ${job.jobTitle} role. Based on the job description, I’m a strong match for: ${
    (job.keywords || []).join(", ") || "the role requirements"
  }.

Sincerely,
Applicant
`;
}

async function generateJobDocuments(request, context) {
  try {
    const jobId = request?.params?.jobId;
    if (!jobId) {
      return { status: 400, jsonBody: { ok: false, error: "Missing jobId" } };
    }

    // ✅ Get userId from SWA (do NOT accept from body/query)
    const userId = getSwaUserId(request);
    if (!userId) {
      return { status: 401, jsonBody: { ok: false, error: "Not authenticated" } };
    }

    // ✅ Read job (PK = userId)
    const { resource: job } = await container.item(jobId, userId).read();
    if (!job) {
      return { status: 404, jsonBody: { ok: false, error: "Job not found" } };
    }

    // Optional: prevent duplicate regen
    if (job.status === "completed" && job.outputs?.resume && job.outputs?.coverLetter) {
      return { status: 200, jsonBody: { ok: true, job, alreadyGenerated: true } };
    }

    // mark generating
    job.status = "generating";
    job.updatedAt = new Date().toISOString();
    await container.item(job.id, userId).replace(job);

    // generate (stub)
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

    await container.item(job.id, userId).replace(job);

    return { status: 200, jsonBody: { ok: true, job } };
  } catch (err) {
    context.error("generateJobDocuments error:", err);
    return {
      status: 500,
      jsonBody: { ok: false, error: "Generation failed", details: err?.message || "Unknown error" },
    };
  }
}

module.exports = { generateJobDocuments };
