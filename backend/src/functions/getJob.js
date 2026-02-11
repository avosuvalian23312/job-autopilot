"use strict";

const { CosmosClient } = require("@azure/cosmos");
const { getSwaUserId } = require("../lib/swaUser");

const cosmos = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const container = cosmos
  .database(process.env.COSMOS_DB_NAME)
  .container(process.env.COSMOS_CONTAINER_NAME);

async function getJob(request, context) {
  try {
    const jobId = request?.params?.jobId;
    if (!jobId) {
      return { status: 400, jsonBody: { ok: false, error: "Missing jobId" } };
    }

    const userId = getSwaUserId(request); // ✅ string
    if (!userId) {
      return { status: 401, jsonBody: { ok: false, error: "Not authenticated" } };
    }

    const { resource } = await container.item(jobId, userId).read();

    if (!resource) {
      return { status: 404, jsonBody: { ok: false, error: "Job not found" } };
    }

    return { status: 200, jsonBody: { ok: true, job: resource } };
  } catch (err) {
    if (err?.code === 404) {
      return { status: 404, jsonBody: { ok: false, error: "Job not found" } };
    }
    context.error("getJob error:", err);
    return { status: 500, jsonBody: { ok: false, error: "Failed to read job" } };
  }
}

module.exports = { getJob };
