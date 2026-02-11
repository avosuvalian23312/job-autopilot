"use strict";

const { CosmosClient } = require("@azure/cosmos");
const { getSwaUserId } = require("../lib/swaUser");

const cosmos = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const container = cosmos
  .database(process.env.COSMOS_DB_NAME)
  .container(process.env.COSMOS_CONTAINER_NAME);

async function updateJobStatus(request, context) {
  try {
    const jobId = request?.params?.jobId;
    if (!jobId) return { status: 400, jsonBody: { ok: false, error: "Missing jobId" } };

    // ✅ now a STRING
    const userId = getSwaUserId(request);
    if (!userId) return { status: 401, jsonBody: { ok: false, error: "Not authenticated" } };

    let body = {};
    try { body = await request.json(); } catch {}
const rawStatus = body?.status;

const normalizeStatus = (s) => {
  const v = String(s ?? "").trim().toLowerCase();
  if (!v) return null;

  // map older/alternate values -> UI values
  if (v === "created") return "generated";
  if (v === "complete" || v === "completed" || v === "done") return "generated";

  return v;
};

const allowed = new Set(["generated", "applied", "interview", "offer", "rejected"]);

const newStatus = normalizeStatus(rawStatus);

if (!newStatus) {
  return { status: 400, jsonBody: { ok: false, error: "Missing status" } };
}

if (!allowed.has(newStatus)) {
  return {
    status: 400,
    jsonBody: { ok: false, error: `Invalid status: ${newStatus}` },
  };
}


    // ✅ Cosmos throws on not found / wrong PK; handle 404 cleanly
    let job;
    try {
      const resp = await container.item(jobId, userId).read();
      job = resp.resource;
    } catch (e) {
      if (e.code === 404) {
        return { status: 404, jsonBody: { ok: false, error: "Job not found" } };
      }
      throw e;
    }

    job.status = newStatus;
    job.updatedAt = new Date().toISOString();

    const { resource: saved } = await container.item(job.id, userId).replace(job);

    return { status: 200, jsonBody: { ok: true, job: saved } };
  } catch (err) {
    context.error("updateJobStatus error:", err);
    return { status: 500, jsonBody: { ok: false, error: "Update failed", details: err?.message || "Unknown error" } };
  }
}

module.exports = { updateJobStatus };
