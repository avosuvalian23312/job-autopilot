"use strict";

const { CosmosClient } = require("@azure/cosmos");
const { getSwaUserId } = require("../lib/swaUser"); // returns STRING userId

const cosmos = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const container = cosmos
  .database(process.env.COSMOS_DB_NAME)
  .container(process.env.COSMOS_CONTAINER_NAME); // jobs container (PK = /userId)

async function listJobs(request, context) {
  try {
    // ✅ SWA auth user (DO NOT accept userId from frontend)
    const userId = getSwaUserId(request); // STRING

    if (!userId) {
      return {
        status: 401,
        headers: { "Content-Type": "application/json" },
        jsonBody: { ok: false, error: "Not authenticated" },
      };
    }

    // 🔎 Debug logs (safe to remove later)
    context.log("Cosmos DB:", process.env.COSMOS_DB_NAME);
    context.log("Container:", process.env.COSMOS_CONTAINER_NAME);
    context.log("SWA userId:", userId);
    context.log(
      "Has principal header:",
      !!request?.headers?.get?.("x-ms-client-principal")
    );

    // ✅ Query within the correct partition
    const { resources } = await container.items
      .query(
        {
          query:
            "SELECT * FROM c WHERE c.userId = @userId ORDER BY c.createdAt DESC",
          parameters: [{ name: "@userId", value: userId }],
        },
        { partitionKey: userId }
      )
      .fetchAll();

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      jsonBody: { ok: true, jobs: resources || [] },
    };
  } catch (err) {
    context.error("listJobs error:", err);
    return {
      status: 500,
      headers: { "Content-Type": "application/json" },
      jsonBody: {
        ok: false,
        error: "Failed to list jobs",
        details: err?.message || "Unknown error",
      },
    };
  }
}

module.exports = { listJobs };
