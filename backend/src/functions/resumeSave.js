// backend/src/functions/resumeSave.js
const { CosmosClient } = require("@azure/cosmos");

function getSwaUser(req) {
  const header =
    req.headers["x-ms-client-principal"] || req.headers["X-MS-CLIENT-PRINCIPAL"];

  if (!header) return null;

  try {
    const decoded = Buffer.from(header, "base64").toString("utf8");
    const principal = JSON.parse(decoded);
    if (!principal?.userId) return null;

    const email =
      principal.claims?.find((c) => c.typ === "emails")?.val ||
      principal.userDetails ||
      "";

    return { userId: principal.userId, email };
  } catch {
    return null;
  }
}

function safeUserId(userId) {
  return String(userId || "").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function stripQuery(url) {
  if (!url) return "";
  try {
    const u = new URL(url);
    u.search = "";
    return u.toString();
  } catch {
    return String(url).split("?")[0];
  }
}

module.exports = async function resumeSave(req, context) {
  try {
    // Handle preflight (optional but safe)
    if (req.method === "OPTIONS") {
      return { status: 204, headers: { "Access-Control-Allow-Origin": "*" } };
    }

    // Validate env INSIDE the handler (context exists here)
    if (!process.env.COSMOS_CONNECTION_STRING) {
      return {
        status: 500,
        jsonBody: { ok: false, error: "Missing COSMOS_CONNECTION_STRING" },
      };
    }
    if (!process.env.COSMOS_DB_NAME) {
      return {
        status: 500,
        jsonBody: { ok: false, error: "Missing COSMOS_DB_NAME" },
      };
    }
    if (!process.env.COSMOS_RESUMES_CONTAINER_NAME) {
      return {
        status: 500,
        jsonBody: { ok: false, error: "Missing COSMOS_RESUMES_CONTAINER_NAME" },
      };
    }

    // Must be logged in via SWA
    const user = getSwaUser(req);
    if (!user) {
      return {
        status: 401,
        jsonBody: { ok: false, error: "Not authenticated" },
      };
    }

    const body = req.body || {};

    // Matches your FRONTEND payload (blobName/originalName/contentType/size)
    const blobName = body.blobName || body.blobPath || "";
    const originalName = body.originalName || body.fileName || "resume.pdf";
    const contentType = body.contentType || "application/octet-stream";
    const size = Number(body.size || 0);

    if (!blobName) {
      return {
        status: 400,
        jsonBody: { ok: false, error: "Missing blobName" },
      };
    }

    const blobUrl = body.uploadUrl ? stripQuery(body.uploadUrl) : "";

    const cosmos = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
    const container = cosmos
      .database(process.env.COSMOS_DB_NAME)
      .container(process.env.COSMOS_RESUMES_CONTAINER_NAME);

    // Deterministic "current resume" id per user (upsert overwrites)
    const doc = {
      id: `resume:current:${safeUserId(user.userId)}`,
      userId: user.userId, // PK is /userId
      email: user.email,

      blobName,
      blobUrl,
      originalName,
      contentType,
      size,

      uploadedAt: new Date().toISOString(),
    };

    await container.items.upsert(doc, { partitionKey: user.userId });

    return {
      status: 200,
      jsonBody: { ok: true, resume: doc },
    };
  } catch (err) {
    context?.log?.("resumeSave error:", err);
    return {
      status: 500,
      jsonBody: { ok: false, error: err?.message || String(err) },
    };
  }
};
