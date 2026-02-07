const { CosmosClient } = require("@azure/cosmos");

function getContainer() {
  const cs = process.env.COSMOS_CONNECTION_STRING;
  const db = process.env.COSMOS_DB_NAME;
  const ctn = process.env.COSMOS_CONTAINER_NAME;

  if (!cs || !db || !ctn) {
    throw new Error(
      `Missing env vars: COSMOS_CONNECTION_STRING=${!!cs}, COSMOS_DB_NAME=${!!db}, COSMOS_CONTAINER_NAME=${!!ctn}`
    );
  }

  const client = new CosmosClient(cs);
  return client.database(db).container(ctn);
}

async function updateJobStatus(request, context) {
  // catch absolutely everything (including weird runtime errors)
  try {
    const jobId = context?.bindingData?.jobId;
    context.log("updateJobStatus called", { jobId, method: request.method });

    if (!jobId) {
      return { status: 400, jsonBody: { error: "Missing route param id" } };
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      context.log("Invalid JSON body", e?.message || e);
      return { status: 400, jsonBody: { error: "Invalid JSON body" } };
    }

    const newStatus = body?.status;
    if (!newStatus) {
      return { status: 400, jsonBody: { error: "Missing status" } };
    }

    const container = getContainer();

    // CROSS-PARTITION query explicitly enabled
    const querySpec = {
      query: "SELECT * FROM c WHERE c.id = @id",
      parameters: [{ name: "@id", value: jobId }]
    };

    const { resources } = await container.items
      .query(querySpec, { enableCrossPartitionQuery: true })
      .fetchAll();

    context.log("query result count", resources?.length || 0);

    if (!resources?.length) {
      return { status: 404, jsonBody: { error: "Job not found" } };
    }

    const job = resources[0];
    const pk = job.userId;

    if (!pk) {
      // this is the classic partition key bug
      return {
        status: 500,
        jsonBody: { error: "Job missing partition key userId", jobId }
      };
    }

    job.status = newStatus;
    job.updatedAt = new Date().toISOString();

    const { resource: updated } = await container.item(jobId, pk).replace(job);

    return { status: 200, jsonBody: updated };
  } catch (err) {
    // this ensures you NEVER get content-length: 0 again
    context.log("FATAL updateJobStatus error:", err);
    return {
      status: 500,
      jsonBody: {
        error: "Unhandled error in updateJobStatus",
        details: err?.message || String(err)
      }
    };
  }
}

module.exports = { updateJobStatus };
