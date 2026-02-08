const { CosmosClient } = require("@azure/cosmos");

const client = new CosmosClient({
  connectionString: process.env.COSMOS_CONNECTION_STRING
});

const database = client.database(process.env.COSMOS_DB_NAME);
const jobsContainer = database.container(process.env.JOBS_CONTAINER_NAME);

module.exports = async function (context, req) {
  try {
    const { jobTitle, jobDescription, userId } = req.body;

    if (!jobTitle || !jobDescription || !userId) {
      context.res = {
        status: 400,
        body: { error: "Missing required fields" }
      };
      return;
    }

    const doc = {
      id: crypto.randomUUID(),
      userId,
      jobTitle,
      jobDescription,
      status: "pending",
      createdAt: new Date().toISOString()
    };

    await jobsContainer.items.create(doc);

    context.res = {
      status: 200,
      body: doc
    };
  } catch (err) {
    console.error("generateDocuments error:", err);
    context.res = {
      status: 500,
      body: { error: "Failed to generate document" }
    };
  }
};
