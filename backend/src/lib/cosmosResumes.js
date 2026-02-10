// src/lib/cosmosResumes.js
const { CosmosClient } = require("@azure/cosmos");

function getResumesContainer() {
  const cs = process.env.COSMOS_CONNECTION_STRING;
  const db = process.env.COSMOS_DB_NAME;
  const cn = process.env.COSMOS_RESUMES_CONTAINER_NAME;

  if (!cs) throw new Error("Missing COSMOS_CONNECTION_STRING");
  if (!db) throw new Error("Missing COSMOS_DB_NAME");
  if (!cn) throw new Error("Missing COSMOS_RESUMES_CONTAINER_NAME");

  const client = new CosmosClient(cs);
  return client.database(db).container(cn);
}

module.exports = { getResumesContainer };
