"use strict";

const { getAuthenticatedUser } = require("../lib/swaUser");

const { CosmosClient } = require("@azure/cosmos");

function jsonResponse(status, payload) {
  return {
    status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}

function getSwaUser(request) {
  // SWA injects identity headers. Prefer x-ms-client-principal (base64 JSON).
  const h = request.headers;
  const b64 = h.get("x-ms-client-principal");

  if (b64) {
    try {
      const raw = Buffer.from(b64, "base64").toString("utf8");
      const principal = JSON.parse(raw);

      const userId =
        principal?.userId ||
        principal?.principalId ||
        principal?.claims?.find((c) => c.typ === "http://schemas.microsoft.com/identity/claims/objectidentifier")
          ?.val ||
        principal?.userDetails ||
        null;

      const email =
        principal?.userDetails ||
        principal?.claims?.find((c) => c.typ === "preferred_username")?.val ||
        principal?.claims?.find((c) => c.typ === "emails")?.val ||
        null;

      return { userId, email, principal };
    } catch {
      // fall through
    }
  }

  // Fallback headers sometimes present
  const userId =
    h.get("x-ms-client-principal-id") ||
    h.get("x-ms-client-principal-name") ||
    null;

  const email = h.get("x-ms-client-principal-name") || null;

  return { userId, email, principal: null };
}

function getCosmosConfig() {
  const conn =
    process.env.COSMOS_CONNECTION_STRING ||
    process.env.AZURE_COSMOS_CONNECTION_STRING ||
    "";

  const endpoint =
    process.env.COSMOS_ENDPOINT ||
    process.env.COSMOS_DB_ENDPOINT ||
    process.env.AZURE_COSMOS_ENDPOINT ||
    "";

  const key =
    process.env.COSMOS_KEY ||
    process.env.COSMOS_DB_KEY ||
    process.env.AZURE_COSMOS_KEY ||
    "";

  const databaseId =
    process.env.COSMOS_DATABASE_ID ||
    process.env.COSMOS_DB_DATABASE ||
    process.env.COSMOS_DB_NAME ||
    "jobautopilot";

  const containerId =
    process.env.COSMOS_SETTINGS_CONTAINER ||
    process.env.COSMOS_CONTAINER_SETTINGS ||
    "settings";

  return { conn, endpoint, key, databaseId, containerId };
}

let _cosmosClient = null;
function getClient() {
  if (_cosmosClient) return _cosmosClient;

  const { conn, endpoint, key } = getCosmosConfig();
  if (conn) {
    _cosmosClient = new CosmosClient(conn);
    return _cosmosClient;
  }
  if (!endpoint || !key) {
    throw new Error(
      "Cosmos is not configured. Set COSMOS_CONNECTION_STRING or (COSMOS_ENDPOINT + COSMOS_KEY)."
    );
  }
  _cosmosClient = new CosmosClient({ endpoint, key });
  return _cosmosClient;
}

async function getSettingsContainer() {
  const { databaseId, containerId } = getCosmosConfig();
  const client = getClient();
  return client.database(databaseId).container(containerId);
}

async function settingsGet(request, context) {
  try {
    const { userId } = getAuthenticatedUser(request) || getSwaUser(request);
    if (!userId) {
      return jsonResponse(401, { ok: false, error: "Not authenticated" });
    }

    const container = await getSettingsContainer();

    // Convention: id=userId, partitionKey=userId (container partition path should be /userId)
    try {
      const { resource } = await container.item(userId, userId).read();

      // If you stored extra fields, return them safely
      return jsonResponse(200, {
        ok: true,
        settings: resource
          ? {
              fullName: resource.fullName || "",
              email: resource.email || "",
              phone: resource.phone || "",
              location: resource.location || "",
              linkedin: resource.linkedin || "",
              portfolio: resource.portfolio || "",
              updatedAt: resource.updatedAt || "",
            }
          : null,
      });
    } catch (err) {
      // 404 is normal if first time
      const code = err?.code || err?.statusCode;
      if (code === 404) {
        return jsonResponse(200, { ok: true, settings: null });
      }
      throw err;
    }
  } catch (err) {
    context?.log?.error?.("settingsGet error:", err);
    return jsonResponse(500, {
      ok: false,
      error: err?.message || "Server error",
    });
  }
}

module.exports = { settingsGet };
