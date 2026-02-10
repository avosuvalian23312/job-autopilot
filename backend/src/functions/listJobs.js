// backend/src/functions/listJobs.js
"use strict";
const { CosmosClient } = require("@azure/cosmos");

const cosmos = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const container = cosmos
  .database(process.env.COSMOS_DB_NAME)
  .container(process.env.COSMOS_CONTAINER_NAME); // jobs container

async function listJobs(request, context) {
  try {
    // IMPORTANT: With PK=/userId, list should be user-scoped.
    // For now we accept userId via querystring (later derive from auth).
    const userId = request.query?.get?.("userId") || request.query?.userId;
    if (!userId) {
      return { status: 400, jsonBody: { error: "Missing userId" } };
    }

    const { resources } = await container.items
      .query({
        query: "SELECT * FROM c WHERE c.userId = @userId ORDER BY c.createdAt DESC",
        parameters: [{ name: "@userId", value: userId }],
      })
      .fetchAll();

    return { status: 200, jsonBody: { jobs: resources || [] } };
  } catch (err) {
    context.error("listJobs error:", err);
    return {
      status: 500,
      jsonBody: { error: "Failed to list jobs", details: err?.message || "Unknown error" },
    };
  }
}

module.exports = { listJobs };
