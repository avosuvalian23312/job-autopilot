"use strict";

const { CosmosClient } = require("@azure/cosmos");
const { getSwaUserId } = require("../lib/swaUser"); // must return STRING

const cosmos = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const container = cosmos
  .database(process.env.COSMOS_DB_NAME)
  .container(process.env.COSMOS_CONTAINER_NAME); // jobs container (PK=/userId)

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

    // ✅ SWA userId (string)
    const userId = getSwaUserId(request);
    if (!userId) {
      return { status: 401, jsonBody: { ok: false, error: "Not authenticated" } };
    }

    // Debug (safe to remove later)
    context.log("generateJobDocuments jobId:", jobId);
    context.log("generateJobDocuments userId:", userId);
    context.log(
      "has principal header:",
      !!request?.headers?.get?.("x-ms-client-principal")
    );

    // ✅ Read job (Cosmos throws on 404 / wrong PK)
    let job;
    try {
      const resp = await container.item(jobId, userId).read();
      job = resp.resource;
    } catch (e) {
      if (e?.code === 404) {
        return { status: 404, jsonBody: { ok: false, error: "Job not found" } };
      }
      throw e;
    }

    // Optional: prevent duplicate regen
    if (job?.status === "completed" && job?.outputs?.resume && job?.outputs?.coverLetter) {
      return { status: 200, jsonBody: { ok: true, job, alreadyGenerated: true } };
    }

    // mark generating
    const now = new Date().toISOString();

    // ✅ Use patch to avoid replacing full doc (safer)
    try {
      await container.item(jobId, userId).patch([
        { op: "add", path: "/status", value: "generating" },
        { op: "add", path: "/updatedAt", value: now },
      ]);
    } catch (e) {
      if (e?.code === 404) {
        return { status: 404, jsonBody: { ok: false, error: "Job not found" } };
      }
      throw e;
    }

    // generate (stub)
    const resumeText = buildResumeText(job);
    const coverLetterText = buildCoverLetterText(job);

    const outputs = {
      resume: {
        text: resumeText,
        fileName: `Resume - ${job.company || "Company"} - ${job.jobTitle}.txt`,
        generatedAt: now,
      },
      coverLetter: {
        text: coverLetterText,
        fileName: `Cover Letter - ${job.company || "Company"} - ${job.jobTitle}.txt`,
        generatedAt: now,
      },
    };

    // mark completed + save outputs
    const completedAt = new Date().toISOString();

    try {
      await container.item(jobId, userId).patch([
        { op: "add", path: "/outputs", value: outputs },
        { op: "add", path: "/status", value: "completed" },
        { op: "add", path: "/completedAt", value: completedAt },
        { op: "add", path: "/updatedAt", value: completedAt },
      ]);
    } catch (e) {
      if (e?.code === 404) {
        return { status: 404, jsonBody: { ok: false, error: "Job not found" } };
      }
      throw e;
    }

    // read back the saved job (optional, but useful for frontend)
    const { resource: saved } = await container.item(jobId, userId).read();

    return { status: 200, jsonBody: { ok: true, job: saved } };
  } catch (err) {
    context.error("generateJobDocuments error:", err);
    return {
      status: 500,
      jsonBody: {
        ok: false,
        error: "Generation failed",
        details: err?.message || "Unknown error",
      },
    };
  }
}

module.exports = { generateJobDocuments };
