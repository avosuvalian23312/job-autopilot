// src/functions/resumeUploadUrl.js
const {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
} = require("@azure/storage-blob");

const auth = require("../lib/auth");

module.exports = async function resumeUploadUrl(req, context) {
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
    const fileName = body.fileName;
    if (!fileName) {
      return json(400, { ok: false, error: "fileName required" });
    }

    const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const containerName = process.env.RESUME_CONTAINER || "resumes";

    if (!conn) {
      return json(500, {
        ok: false,
        error: "Missing AZURE_STORAGE_CONNECTION_STRING",
      });
    }

    const { accountName, accountKey } = parseConn(conn);
    const cred = new StorageSharedKeyCredential(accountName, accountKey);
    const service = new BlobServiceClient(
      `https://${accountName}.blob.core.windows.net`,
      cred
    );

    const container = service.getContainerClient(containerName);
    await container.createIfNotExists();

    const blobName = `${user.userId}/${Date.now()}_${fileName}`;
    const blob = container.getBlockBlobClient(blobName);

    const expiresOn = new Date(Date.now() + 10 * 60 * 1000);
    const sas = generateBlobSASQueryParameters(
      {
        containerName,
        blobName,
        permissions: BlobSASPermissions.parse("cw"),
        expiresOn,
      },
      cred
    ).toString();

    return json(200, {
      ok: true,
      blobName,
      uploadUrl: `${blob.url}?${sas}`,
    });
  } catch (e) {
    context.log("resumeUploadUrl error", e);
    return json(500, { ok: false, error: e.message });
  }
};

function parseConn(c) {
  const m = {};
  c.split(";").forEach(p => {
    const [k, v] = p.split("=");
    m[k] = v;
  });
  return { accountName: m.AccountName, accountKey: m.AccountKey };
}

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
