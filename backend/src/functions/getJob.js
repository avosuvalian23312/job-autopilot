// backend/src/functions/getJob.js
"use strict";
const { CosmosClient } = require("@azure/cosmos");

const cosmos = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const container = cosmos
  .database(process.env.COSMOS_DB_NAME)
  .container(process.env.COSMOS_CONTAINER_NAME); // jobs container

async function getJob(request, context) {
  const jobId = request?.params?.jobId;
  if (!jobId) return { status: 400, jsonBody: { error: "Missing jobId" } };

  // PK is /userId, so we need userId to read item(jobId, userId)
  const userId = request.query?.get?.("userId") || request.query?.userId;
  if (!userId) return { status: 400, jsonBody: { error: "Missing userId" } };

  try {
    const { resource: job } = await container.item(jobId, userId).read();
    if (!job) return { status: 404, jsonBody: { error: "Job not found" } };

    return { status: 200, jsonBody: job };
  } catch (err) {
    context.error("getJob error:", err);
    return {
      status: 500,
      jsonBody: { error: "Failed to get job", details: err?.message || "Unknown error" },
    };
  }
}

module.exports = { getJob };
