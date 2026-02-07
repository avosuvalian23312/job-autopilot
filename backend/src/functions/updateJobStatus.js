const { CosmosClient } = require("@azure/cosmos");

const client = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const container = client
  .database(process.env.COSMOS_DB_NAME)
  .container(process.env.COSMOS_CONTAINER_NAME);

async function updateJobStatus(request, context) {
  const jobId = context.bindingData.id;

  let body;
  try {
    body = await request.json();
  } catch {
    return { status: 400, jsonBody: { error: "Invalid JSON body" } };
  }

  if (!body?.status) {
    return { status: 400, jsonBody: { error: "Missing status" } };
  }

  try {
    const { resources } = await container.items
      .query(
        {
          query: "SELECT * FROM c WHERE c.id = @id",
          parameters: [{ name: "@id", value: jobId }]
        },
        { enableCrossPartitionQuery: true }
      )
      .fetchAll();

    if (!resources?.length) {
      return { status: 404, jsonBody: { error: "Job not found" } };
    }

    const job = resources[0];

    if (!job.userId) {
      return {
        status: 500,
        jsonBody: { error: "Job missing partition key (userId)" }
      };
    }

    job.status = body.status;
    job.updatedAt = new Date().toISOString();

    const { resource: updated } = await container
      .item(jobId, job.userId)
      .replace(job);

    return { status: 200, jsonBody: updated };
  } catch (err) {
    return {
      status: 500,
      jsonBody: {
        error: "Failed to update job status",
        details: err.message
      }
    };
  }
}

module.exports = { updateJobStatus };
