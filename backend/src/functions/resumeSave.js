// src/functions/resumeSave.js
const auth = require("../lib/auth");

// EDIT HERE if your cosmos helper has different exports/names
const cosmos = require("../lib/cosmosClient");

// POST /api/resume/save
// Body: { blobName, originalName, contentType, size }
// Updates users container doc (id = userId)
module.exports = async function resumeSave(req, context) {
  // CORS / preflight
  if (req.method === "OPTIONS") {
    return {
      status: 204,
      headers: corsHeaders(),
    };
  }

  try {
    // 1) Require your APP JWT
    const user = auth.requireAuth(req);
    const userId = user.userId || user.uid;
    if (!userId) {
      return json(401, { ok: false, error: "Unauthorized (missing userId)" });
    }

    // 2) Parse body
    const body = await safeJson(req);
    const blobName = (body?.blobName || "").trim();
    const originalName = (body?.originalName || "").trim();
    const contentType = (body?.contentType || "application/octet-stream").trim();
    const size = Number(body?.size || 0);

    if (!blobName) {
      return json(400, { ok: false, error: "blobName is required" });
    }

    // 3) Write to Cosmos users container
    // Expect: users container partition key = /id
    // We store resume metadata on the user doc.

    // ---- EDIT HERE if your cosmosClient differs ----
    // Assumed API: cosmos.container("users") -> container client
    const usersContainer = cosmos.container("users");
    // -----------------------------------------------

    const now = Date.now();
    const userDocId = userId; // your pattern: id === userId (e.g. google:sub)

    // Read existing (optional, but nice)
    let existing = null;
    try {
      const read = await usersContainer.item(userDocId, userDocId).read();
      existing = read?.resource || null;
    } catch {
      existing = null;
    }

    const updated = {
      ...(existing || {}),
      id: userDocId,
      userId: userDocId,
      email: existing?.email || user.email || undefined,
      provider: existing?.provider || user.provider || undefined,
      resume: {
        blobName,
        originalName: originalName || null,
        contentType: contentType || null,
        size: Number.isFinite(size) ? size : null,
        uploadedAt: now,
      },
      updatedAt: now,
    };

    // Upsert by id + partition key
    await usersContainer.items.upsert(updated);

    return json(200, {
      ok: true,
      userId: userDocId,
      resume: updated.resume,
    });
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
