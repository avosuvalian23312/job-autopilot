const { CosmosClient } = require("@azure/cosmos");

const cosmos = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const container = cosmos
  .database(process.env.COSMOS_DB_NAME)
  .container(process.env.COSMOS_CONTAINER_NAME);

async function updateJobStatus(request, context) {
  const jobId = context.bindingData.id;

  let body = {};
  try {
    body = await request.json();
  } catch {}

  const newStatus = body.status;
  if (!newStatus) {
    return { status: 400, jsonBody: { error: "Missing status" } };
  }

  try {
    // 1) Find the item by id (works even if you don't know partition key yet)
    const { resources } = await container.items
      .query({
        query: "SELECT * FROM c WHERE c.id = @id",
        parameters: [{ name: "@id", value: jobId }]
      })
      .fetchAll();

    if (!resources || resources.length === 0) {
      return { status: 404, jsonBody: { error: "Job not found" } };
    }

    const job = resources[0];
    const pk = job.userId; // partition key value (you chose /userId)

    // 2) Update fields
    job.status = newStatus;
    job.updatedAt = new Date().toISOString();

    // 3) Replace using correct partition key
    const { resource: updated } = await container.item(jobId, pk).replace(job);

    return { status: 200, jsonBody: updated };
  } catch (err) {
    // Return useful error details (instead of mystery 500)
    return {
      status: 500,
      jsonBody: {
        error: "Failed to update job status",
        details: err?.message || String(err)
      }
    };
  }
}

module.exports = { updateJobStatus };
