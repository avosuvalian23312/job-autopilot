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

  if (!body.status) {
    return {
      status: 400,
      jsonBody: { error: "Missing status" }
    };
  }

  const { resource } = await container.item(jobId, "demo").read();

  if (!resource) {
    return {
      status: 404,
      jsonBody: { error: "Job not found" }
    };
  }

  resource.status = body.status;
  resource.updatedAt = new Date().toISOString();

  await container.item(jobId, "demo").replace(resource);

  return {
    status: 200,
    jsonBody: resource
  };
}

module.exports = { updateJobStatus };
