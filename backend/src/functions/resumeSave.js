// src/functions/resumeSave.js
const { CosmosClient } = require("@azure/cosmos");
const auth = require("../lib/auth");

// POST /api/resume/save
// Body: { blobName, originalName, contentType, size }
// Updates users container doc (id = userId, pk = /id)
module.exports = async function resumeSave(req, context) {
  if (req.method === "OPTIONS") {
    return { status: 204, headers: corsHeaders() };
  }

  try {
    const user = auth.requireAuth(req);
    const userId = user.userId || user.uid;
    if (!userId) return json(401, { ok: false, error: "Unauthorized" });

    const body = await safeJson(req);
    const blobName = (body?.blobName || "").trim();
    const originalName = (body?.originalName || "").trim();
    const contentType = (body?.contentType || "application/octet-stream").trim();
    const size = Number(body?.size || 0);

    if (!blobName) return json(400, { ok: false, error: "blobName is required" });

    // ---- Cosmos env vars (must exist in your backend settings) ----
    const COSMOS_ENDPOINT = process.env.COSMOS_ENDPOINT;
    const COSMOS_KEY = process.env.COSMOS_KEY;
    const COSMOS_DATABASE = process.env.COSMOS_DATABASE || "jobautopilot";
    const USERS_CONTAINER = process.env.USERS_CONTAINER || "users";
    // --------------------------------------------------------------

    if (!COSMOS_ENDPOINT || !COSMOS_KEY) {
      return json(500, {
        ok: false,
        error: "Missing COSMOS_ENDPOINT or COSMOS_KEY in backend settings",
      });
    }

    const client = new CosmosClient({ endpoint: COSMOS_ENDPOINT, key: COSMOS_KEY });
    const users = client.database(COSMOS_DATABASE).container(USERS_CONTAINER);

    const now = Date.now();
    const id = userId;

    // Read existing user doc (optional)
    let existing = null;
    try {
      const read = await users.item(id, id).read();
      existing = read?.resource || null;
    } catch {}

    const updated = {
      ...(existing || {}),
      id,
      userId: id,
      email: existing?.email || user.email || null,
      provider: existing?.provider || user.provider || null,
      resume: {
        blobName,
        originalName: originalName || null,
        contentType: contentType || null,
        size: Number.isFinite(size) ? size : null,
        uploadedAt: now,
      },
      updatedAt: now,
    };

    await users.items.upsert(updated);

    return json(200, { ok: true, userId: id, resume: updated.resume });
  } catch (err) {
    context?.log?.("resumeSave error", err);
    return json(500, { ok: false, error: err?.message || "Server error" });
  }
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(status, obj) {
  return {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  };
}

async function safeJson(req) {
  try {
    if (typeof req.json === "function") return await req.json();
  } catch {}
  try {
    if (!req.body) return {};
    if (typeof req.body === "string") return JSON.parse(req.body);
    return req.body;
  } catch {
    return {};
  }
}
