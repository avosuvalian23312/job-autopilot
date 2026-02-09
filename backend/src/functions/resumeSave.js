// src/functions/resumeSave.js
const { CosmosClient } = require("@azure/cosmos");
const auth = require("../lib/auth");

module.exports = async function resumeSave(req, context) {
  if (req.method === "OPTIONS") {
    return { status: 204, headers: cors() };
  }

  let user;
  try {
    user = auth.requireAuth(req);
  } catch (e) {
    return json(401, { ok: false, error: e.message });
  }

  try {
    const body = typeof req.json === "function" ? await req.json() : {};
    if (!body.blobName) {
      return json(400, { ok: false, error: "blobName required" });
    }

    const client = new CosmosClient({
      endpoint: process.env.COSMOS_ENDPOINT,
      key: process.env.COSMOS_KEY,
    });

    const db = client.database(process.env.COSMOS_DATABASE || "jobautopilot");
    const users = db.container(process.env.USERS_CONTAINER || "users");

    const id = user.userId;
    const now = Date.now();

    let existing = {};
    try {
      const r = await users.item(id, id).read();
      existing = r.resource || {};
    } catch {}

    await users.items.upsert({
      ...existing,
      id,
      userId: id,
      resume: {
        blobName: body.blobName,
        originalName: body.originalName || null,
        size: body.size || null,
        uploadedAt: now,
      },
      updatedAt: now,
    });

    return json(200, { ok: true });
  } catch (e) {
    context.log("resumeSave error", e);
    return json(500, { ok: false, error: e.message });
  }
};

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(status, body) {
  return {
    status,
    headers: { ...cors(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
