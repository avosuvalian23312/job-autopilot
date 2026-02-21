"use strict";

const { getAuthenticatedUser } = require("../lib/swaUser");

const { CosmosClient } = require("@azure/cosmos");
const crypto = require("crypto");

function jsonResponse(status, payload) {
  return {
    status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}

async function readJsonSafe(request) {
  try {
    const text = await request.text();
    if (!text) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function getSwaUser(request) {
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
    } catch {}
  }

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
    process.env.COSMOS_SUPPORT_CONTAINER ||
    process.env.COSMOS_CONTAINER_SUPPORT ||
    "support";

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

async function getSupportContainer() {
  const { databaseId, containerId } = getCosmosConfig();
  const client = getClient();
  return client.database(databaseId).container(containerId);
}

function cleanStr(v, max = 2000) {
  const s = (v ?? "").toString().trim();
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}

function newId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

async function supportCreate(request, context) {
  try {
    const { userId, email } = getAuthenticatedUser(request) || getSwaUser(request);
    if (!userId) {
      return jsonResponse(401, { ok: false, error: "Not authenticated" });
    }

    const body = await readJsonSafe(request);
    if (!body || typeof body !== "object") {
      return jsonResponse(400, { ok: false, error: "Invalid JSON body" });
    }

    const subject = cleanStr(body.subject, 120);
    const message = cleanStr(body.message, 4000);

    if (!message) {
      return jsonResponse(400, { ok: false, error: "Message is required" });
    }

    const now = new Date().toISOString();
    const ticketId = newId();

    // Store a ticket in Cosmos (you can later add SendGrid after this works)
    const doc = {
      id: ticketId,
      userId,                 // partition key suggested: /userId
      type: "support_ticket",
      status: "open",
      subject: subject || "Support request",
      message,
      fromEmail: email || "",
      createdAt: now,
      updatedAt: now,
    };

    const container = await getSupportContainer();
    await container.items.create(doc);

    // Optional: log for debugging
    context?.log?.(`Ã¢Å“â€¦ Support ticket created: ${ticketId} (${userId})`);

    return jsonResponse(200, { ok: true, ticketId });
  } catch (err) {
    context?.log?.error?.("supportCreate error:", err);
    return jsonResponse(500, {
      ok: false,
      error: err?.message || "Server error",
    });
  }
}

module.exports = { supportCreate };
