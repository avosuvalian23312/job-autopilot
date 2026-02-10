// backend/src/functions/updateJobStatus.js
"use strict";
const { CosmosClient } = require("@azure/cosmos");

const cosmos = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const container = cosmos
  .database(process.env.COSMOS_DB_NAME)
  .container(process.env.COSMOS_CONTAINER_NAME); // jobs container

async function updateJobStatus(request, context) {
  const jobId = request?.params?.jobId;
  if (!jobId) return { status: 400, jsonBody: { error: "Missing jobId" } };

  let body = {};
  try { body = await request.json(); } catch {}

  const userId = body?.userId; // since PK=/userId we need it
  const newStatus = body?.status;

  if (!userId) return { status: 400, jsonBody: { error: "Missing userId" } };
  if (!newStatus) return { status: 400, jsonBody: { error: "Missing status" } };

  try {
    const { resource: job } = await container.item(jobId, userId).read();
    if (!job) return { status: 404, jsonBody: { error: "Job not found" } };

    job.status = newStatus;
    job.updatedAt = new Date().toISOString();

    await container.item(jobId, userId).replace(job);

    return { status: 200, jsonBody: { ok: true, job } };
  } catch (err) {
    context.error("updateJobStatus error:", err);
    return {
      status: 500,
      jsonBody: { error: "Update failed", details: err?.message || "Unknown error" },
    };
  }
}

module.exports = { updateJobStatus };
