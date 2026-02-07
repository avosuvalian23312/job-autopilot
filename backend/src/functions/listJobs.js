// src/functions/listJobs.js
const { CosmosClient } = require("@azure/cosmos");

const cosmos = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const container = cosmos
  .database(process.env.COSMOS_DB_NAME)
  .container(process.env.COSMOS_CONTAINER_NAME);

async function listJobs(request, context) {
  try {
    const { resources } = await container.items
      .query({
        query: "SELECT * FROM c ORDER BY c.createdAt DESC"
      })
      .fetchAll();

    return { status: 200, jsonBody: { jobs: resources || [] } };
  } catch (err) {
    context.error("listJobs error:", err);
    return {
      status: 500,
      jsonBody: { error: "Failed to list jobs", details: err?.message || "Unknown error" }
    };
  }
}

module.exports = { listJobs };
