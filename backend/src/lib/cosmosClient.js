// backend/src/lib/cosmosClient.js
import { CosmosClient } from "@azure/cosmos";

/**
 * Parse AccountEndpoint + AccountKey from connection string
 * Works on all @azure/cosmos versions
 */
function parseCosmosConnectionString(connStr) {
  if (!connStr) {
    throw new Error("Missing COSMOS_CONNECTION_STRING");
  }

  const parts = connStr.split(";").reduce((acc, part) => {
    const [key, value] = part.split("=");
    if (key && value) acc[key] = value;
    return acc;
  }, {});

  if (!parts.AccountEndpoint || !parts.AccountKey) {
    throw new Error("Invalid COSMOS_CONNECTION_STRING format");
  }

  return {
    endpoint: parts.AccountEndpoint,
    key: parts.AccountKey,
  };
}

const { endpoint, key } = parseCosmosConnectionString(
  process.env.COSMOS_CONNECTION_STRING
);

// ✅ Universal Cosmos client constructor
export const cosmosClient = new CosmosClient({ endpoint, key });

// Helpers
export const db = cosmosClient.database(process.env.COSMOS_DB_NAME);

export const jobsContainer = db.container(process.env.JOBS_CONTAINER_NAME);
export const usersContainer = db.container(process.env.USERS_CONTAINER_NAME);
