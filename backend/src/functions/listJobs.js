const { CosmosClient } = require("@azure/cosmos");

const cosmos = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const container = cosmos
  .database(process.env.COSMOS_DB_NAME)
  .container(process.env.COSMOS_CONTAINER_NAME);

async function listJobs(request, context) {
  const query = {
    query: "SELECT * FROM c WHERE c.userId = @uid ORDER BY c.createdAt DESC",
    parameters: [{ name: "@uid", value: "demo" }]
  };

  const { resources } = await container.items
    .query(query)
    .fetchAll();

  return {
    status: 200,
    jsonBody: { jobs: resources }
  };
}

module.exports = { listJobs };
