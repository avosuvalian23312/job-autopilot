const { CosmosClient } = require("@azure/cosmos");

function getContainer() {
  const cs = process.env.COSMOS_CONNECTION_STRING;
  const dbName = process.env.COSMOS_DB_NAME;
  const containerName = process.env.COSMOS_CONTAINER_NAME;

  if (!cs || !dbName || !containerName) {
    throw new Error(
      `Missing env vars: COSMOS_CONNECTION_STRING=${!!cs}, COSMOS_DB_NAME=${!!dbName}, COSMOS_CONTAINER_NAME=${!!containerName}`
    );
  }

  const client = new CosmosClient(cs);
  return client.database(dbName).container(containerName);
}

async function updateJobStatus(request, context) {
  const jobId = context.bindingData.id;

  let body;
  try {
    body = await request.json();
  } catch {
    return { status: 400, jsonBody: { error: "Invalid JSON body" } };
  }

  const newStatus = body?.status;
  if (!newStatus) {
    return { status: 400, jsonBody: { error: "Missing status" } };
  }

  try {
    const container = getContainer();

    // Find item by id across partitions
    const { resources } = await container.items
      .query(
        {
          query: "SELECT * FROM c WHERE c.id = @id",
          parameters: [{ name: "@id", value: jobId }]
        },
        { enableCrossPartitionQuery: true }
      )
      .fetchAll();

    if (!resources || resources.length === 0) {
      return { status: 404, jsonBody: { error: "Job not found" } };
    }

    const job = resources[0];

    // Your container uses partition key /userId
    const pk = job.userId;
    if (!pk) {
      return {
        status: 500,
        jsonBody: {
          error: "Job is missing partition key field 'userId'",
          jobId
        }
      };
    }

    job.status = newStatus;
    job.updatedAt = new Date().toISOString();

    const { resource: updated } = await container.item(jobId, pk).replace(job);

    // Return the updated job directly
    return { status: 200, jsonBody: updated };
  } catch (err) {
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
