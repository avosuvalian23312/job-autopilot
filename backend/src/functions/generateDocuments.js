// backend/src/functions/generateDocuments.js
"use strict";

const crypto = require("crypto");
const { CosmosClient } = require("@azure/cosmos");

const client = new CosmosClient({
  connectionString: process.env.COSMOS_CONNECTION_STRING,
});

const database = client.database(process.env.COSMOS_DB_NAME);
const jobsContainer = database.container(process.env.JOBS_CONTAINER_NAME);

module.exports = async function (request, context) {
  try {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return { status: 204 };
    }

    const body = await request.json().catch(() => ({}));
    const { jobTitle, jobDescription, userId } = body;

    if (!jobTitle || !jobDescription || !userId) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing required fields" }),
      };
    }

    const doc = {
  id: crypto.randomUUID(),
  userId,
  jobTitle,
  company,
  website,
  location,
  seniority,
  keywords,
  jobDescription,
  aiMode,
  studentMode,
  status: "pending",
  createdAt: new Date().toISOString(),
  outputs: null
};


    await jobsContainer.items.create(doc);

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(doc),
    };
  } catch (err) {
    context?.error?.("generateDocuments error:", err);
    return {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Failed to generate document" }),
    };
  }
};
