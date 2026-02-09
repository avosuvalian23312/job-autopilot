// src/functions/updateJobStatus.js
const { CosmosClient } = require("@azure/cosmos");

const cosmos = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const container = cosmos
  .database(process.env.COSMOS_DB_NAME)
  .container(process.env.COSMOS_CONTAINER_NAME);

function getPartitionKey(item) {
  // Supports common choices. If your container PK is /id this works.
  return item.userId ?? item.partitionKey ?? item.id;
}

async function updateJobStatus(request, context) {
  const jobId = request?.params?.jobId || request?.params?.id;
  if (!jobId) {
    return { status: 400, jsonBody: { error: "Missing route param id" } };
  }

  let body = {};
  try {
    body = await request.json();
  } catch {}

  const newStatus = body?.status;
  if (!newStatus) {
    return { status: 400, jsonBody: { error: "Missing status" } };
  }

  try {
    // Find the item by id (works even if you don't know PK yet)
    const { resources } = await container.items
      .query({
        query: "SELECT * FROM c WHERE c.id = @id",
        parameters: [{ name: "@id", value: jobId }]
      })
      .fetchAll();

    const job = resources?.[0];
    if (!job) {
      return { status: 404, jsonBody: { error: "Job not found" } };
    }

    // Update fields
    job.status = newStatus;
    job.updatedAt = new Date().toISOString();


    
    // Replace using correct PK
    const pk = getPartitionKey(job);
    await container.item(job.id, pk).replace(job);

    return {
      status: 200,
      jsonBody: { ok: true, job }
    };
  } catch (err) {
    context.error("updateJobStatus error:", err);
    return {
      status: 500,
      jsonBody: { error: "Update failed", details: err?.message || "Unknown error" }
    };
  }
}

module.exports = { updateJobStatus };
