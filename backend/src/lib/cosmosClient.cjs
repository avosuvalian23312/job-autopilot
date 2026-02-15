"use strict";

const { CosmosClient } = require("@azure/cosmos");

function parseCosmosConnectionString(connStr) {
  const parts = String(connStr || "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const idx = part.indexOf("=");
      if (idx > -1) {
        const k = part.slice(0, idx).trim();
        const v = part.slice(idx + 1).trim();
        acc[k] = v;
      }
      return acc;
    }, {});

  return {
    endpoint: parts.AccountEndpoint,
    key: parts.AccountKey,
  };
}

function getCosmosConfig() {
  // Preferred: connection string
  const connStr = process.env.COSMOS_CONNECTION_STRING;

  if (connStr) {
    const { endpoint, key } = parseCosmosConnectionString(connStr);
    if (!endpoint || !key) throw new Error("Invalid COSMOS_CONNECTION_STRING");
    return { endpoint, key };
  }

  // Fallback: endpoint/key env vars
  const endpoint = process.env.COSMOS_ENDPOINT;
  const key = process.env.COSMOS_KEY;

  if (!endpoint || !key) {
    throw new Error(
      "Missing Cosmos env. Set COSMOS_CONNECTION_STRING (recommended) OR COSMOS_ENDPOINT + COSMOS_KEY."
    );
  }

  return { endpoint, key };
}

const { endpoint, key } = getCosmosConfig();

const client = new CosmosClient({ endpoint, key });

const dbName = process.env.COSMOS_DB_NAME || "jobautopilot";
const db = client.database(dbName);

// Container names (fallbacks so you don’t have to wire everything at once)
const PROFILES_CONTAINER =
  process.env.PROFILES_CONTAINER_NAME ||
  process.env.USERS_CONTAINER_NAME || // fallback
  "profiles";

const profilesContainer = db.container(PROFILES_CONTAINER);

module.exports = {
  cosmosClient: client,
  db,
  profilesContainer,
};
