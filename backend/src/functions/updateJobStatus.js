// backend/src/functions/updateJobStatus.js
"use strict";

const { CosmosClient } = require("@azure/cosmos");
const { getSwaUserId } = require("../lib/swaUser"); // returns STRING userId

const cosmos = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const container = cosmos
  .database(process.env.COSMOS_DB_NAME)
  .container(process.env.COSMOS_CONTAINER_NAME); // jobs container (PK=/userId)

async function updateJobStatus(request, context) {
  try {
    const jobId = request?.params?.jobId;
    if (!jobId) return { status: 400, jsonBody: { ok: false, error: "Missing jobId" } };

    // ✅ userId from SWA only
    const userId = getSwaUserId(request);
    if (!userId) return { status: 401, jsonBody: { ok: false, error: "Not authenticated" } };

    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const newStatus = body?.status;
    if (!newStatus) return { status: 400, jsonBody: { ok: false, error: "Missing status" } };

    // ✅ read with PK=userId
    const { resource: job } = await container.item(jobId, userId).read();
    if (!job) return { status: 404, jsonBody: { ok: false, error: "Job not found" } };

    job.status = newStatus;
    job.updatedAt = new Date().toISOString();

    // ✅ replace with correct id + PK
    const { resource: saved } = await container.item(job.id, userId).replace(job);

    return { status: 200, jsonBody: { ok: true, job: saved } };
  } catch (err) {
    context.error("updateJobStatus error:", err);
    return {
      status: 500,
      jsonBody: { ok: false, error: "Update failed", details: err?.message || "Unknown error" },
    };
  }
}

module.exports = { updateJobStatus };
