const { CosmosClient } = require("@azure/cosmos");


if (!process.env.COSMOS_CONNECTION_STRING) {
  context.res = { status: 500, jsonBody: { error: "Missing COSMOS_CONNECTION_STRING" } };
  return;
}
if (!process.env.COSMOS_DB_NAME) {
  context.res = { status: 500, jsonBody: { error: "Missing COSMOS_DB_NAME" } };
  return;
}
if (!process.env.COSMOS_RESUMES_CONTAINER_NAME) {
  context.res = { status: 500, jsonBody: { error: "Missing COSMOS_RESUMES_CONTAINER_NAME" } };
  return;
}




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
  // Must be logged in via SWA
  const user = getSwaUser(req);
  if (!user) {
    context.res = { status: 401, jsonBody: { ok: false, error: "Not authenticated" } };
    return;
  }

  const body = req.body || {};

  // ✅ Match your FRONTEND payload
  const blobName = body.blobName || body.blobPath || "";
  const originalName = body.originalName || body.fileName || "resume.pdf";
  const contentType = body.contentType || "application/octet-stream";
  const size = Number(body.size || 0);

  if (!blobName) {
    context.res = {
      status: 400,
      jsonBody: { ok: false, error: "Missing blobName" },
    };
    return;
  }

  // Optional: if you pass uploadUrl from step 1, store a clean blob URL (no SAS)
  const blobUrl = body.uploadUrl ? stripQuery(body.uploadUrl) : "";

  const cosmos = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
  const container = cosmos
    .database(process.env.COSMOS_DB_NAME)
    .container(process.env.COSMOS_RESUMES_CONTAINER_NAME);

  // One "current" resume per user, deterministic id per user
  // (Upsert overwrites same user's current resume)
  const doc = {
    id: `resume:current:${safeUserId(user.userId)}`,
    userId: user.userId, // PK is /userId
    email: user.email,

    blobName,      // <-- EXACT blob path you uploaded to (matches storage)
    blobUrl,       // optional (no SAS)
    originalName,
    contentType,
    size,

    uploadedAt: new Date().toISOString(),
  };

  // ✅ IMPORTANT: pass partitionKey explicitly (PK = /userId)
  await container.items.upsert(doc, { partitionKey: user.userId });

  context.res = { status: 200, jsonBody: { ok: true, resume: doc } };
};
