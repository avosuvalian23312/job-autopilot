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

module.exports = async function (context, req) {
  try {
    // ✅ ENV checks MUST be inside the handler (context exists here)
    const COSMOS_CONNECTION_STRING = process.env.COSMOS_CONNECTION_STRING;
    const COSMOS_DB_NAME = process.env.COSMOS_DB_NAME;
    const COSMOS_RESUMES_CONTAINER_NAME = process.env.COSMOS_RESUMES_CONTAINER_NAME;

    if (!COSMOS_CONNECTION_STRING) {
      context.res = { status: 500, body: { ok: false, error: "Missing COSMOS_CONNECTION_STRING" } };
      return;
    }
    if (!COSMOS_DB_NAME) {
      context.res = { status: 500, body: { ok: false, error: "Missing COSMOS_DB_NAME" } };
      return;
    }
    if (!COSMOS_RESUMES_CONTAINER_NAME) {
      context.res = { status: 500, body: { ok: false, error: "Missing COSMOS_RESUMES_CONTAINER_NAME" } };
      return;
    }

    // Must be logged in via SWA
    const user = getSwaUser(req);
    if (!user) {
      context.res = { status: 401, body: { ok: false, error: "Not authenticated" } };
      return;
    }

    // In some setups req.body can be a string
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

    const blobName = body.blobName || body.blobPath || "";
    const originalName = body.originalName || body.fileName || "resume.pdf";
    const contentType = body.contentType || "application/octet-stream";
    const size = Number(body.size || 0);

    if (!blobName) {
      context.res = { status: 400, body: { ok: false, error: "Missing blobName" } };
      return;
    }

    const blobUrl = body.uploadUrl ? stripQuery(body.uploadUrl) : "";

    const cosmos = new CosmosClient(COSMOS_CONNECTION_STRING);
    const container = cosmos.database(COSMOS_DB_NAME).container(COSMOS_RESUMES_CONTAINER_NAME);

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

    // ✅ Partition key must match your container PK (you said it's /userId)
    await container.items.upsert(doc, { partitionKey: user.userId });

    context.res = { status: 200, body: { ok: true, resume: doc } };
  } catch (err) {
    // This will show in SWA/Functions logs
    context.log.error("resume/save failed:", err);

    context.res = {
      status: 500,
      body: {
        ok: false,
        error: "Internal Server Error",
        detail: err?.message || String(err),
      },
    };
  }
};
