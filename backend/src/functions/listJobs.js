// backend/src/functions/listJobs.js
"use strict";

const { CosmosClient } = require("@azure/cosmos");
const { getSwaUserId } = require("../lib/swaUser"); // must match export

const cosmos = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const container = cosmos
  .database(process.env.COSMOS_DB_NAME)
  .container(process.env.COSMOS_CONTAINER_NAME); // jobs container

async function listJobs(request, context) {
  try {
    // ✅ SWA auth user (do NOT accept userId from query/body)
    const user = getSwaUserId(request);

    if (!user?.userId) {
      return {
        status: 401,
        headers: { "Content-Type": "application/json" },
        jsonBody: { ok: false, error: "Not authenticated" },
      };
    }

    const userId = user.userId;

    // (Optional but recommended) quick debug logs
    context.log("DB:", process.env.COSMOS_DB_NAME);
    context.log("Container:", process.env.COSMOS_CONTAINER_NAME);
    context.log("UserId:", userId);

    // ✅ If your container PK is /userId, pass partitionKey for speed + correctness
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
