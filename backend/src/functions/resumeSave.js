const { CosmosClient } = require("@azure/cosmos");

function getSwaUser(req) {
  const header =
    req.headers["x-ms-client-principal"] ||
    req.headers["X-MS-CLIENT-PRINCIPAL"];

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

module.exports = async function (context, req) {
  // ✅ must be logged in via SWA
  const user = getSwaUser(req);
  if (!user) {
    context.res = { status: 401, jsonBody: { error: "Not authenticated" } };
    return;
  }

  const body = req.body || {};
  const fileName = body.fileName || "resume.pdf";
  const contentType = body.contentType || "application/pdf";
  const size = Number(body.size || 0);

  // ✅ where the file is stored in blob
  // you can also pass blobPath from client, but this keeps it consistent and safe
  const blobPath =
    body.blobPath ||
    `resumes/${safeUserId(user.userId)}/current.pdf`;

  const cosmos = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
  const container = cosmos
    .database(process.env.COSMOS_DB_NAME)
    .container(process.env.COSMOS_RESUMES_CONTAINER_NAME);

  // ✅ one resume per user (current)
  const doc = {
    id: "resume:current",
    userId: user.userId, // <-- partition key (/userId)
    email: user.email,
    blobPath,
    fileName,
    contentType,
    size,
    uploadedAt: new Date().toISOString()
  };

  await container.items.upsert(doc);

  context.res = { status: 200, jsonBody: { ok: true, resume: doc } };
};
