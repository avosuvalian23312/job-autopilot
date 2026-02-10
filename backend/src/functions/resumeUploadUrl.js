// src/functions/resumeUploadUrl.js (Azure Functions v4)
const {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
} = require("@azure/storage-blob");

const { requireUser } = require("../lib/auth");

module.exports = async function resumeUploadUrl(request, context) {
  // NOTE: v4 uses `request`, not old-style `req`
  if (request.method === "OPTIONS") {
    return { status: 204, headers: cors() };
  }

  // --- AUTH: SWA principal header ---
  let user;
  try {
    // requireUser MUST read headers via request.headers.get(...)
    user = requireUser(request);
  } catch (e) {
    return json(401, {
      ok: false,
      error: e.message,
      hint:
        "Make sure you are logged in via Static Web Apps auth and call /api/* through the SWA site.",
    });
  }

  try {
    const body = await safeJson(request);
    const fileName = body?.fileName;

    if (!fileName) {
      return json(400, { ok: false, error: "fileName required" });
    }

    const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const containerName = process.env.RESUME_CONTAINER || "resumes";

    if (!conn) {
      return json(500, { ok: false, error: "Missing AZURE_STORAGE_CONNECTION_STRING" });
    }

    const { accountName, accountKey } = parseConn(conn);
    if (!accountName || !accountKey) {
      return json(500, {
        ok: false,
        error: "Invalid AZURE_STORAGE_CONNECTION_STRING (missing AccountName/AccountKey)",
      });
    }

    const cred = new StorageSharedKeyCredential(accountName, accountKey);
    const service = new BlobServiceClient(`https://${accountName}.blob.core.windows.net`, cred);

    const container = service.getContainerClient(containerName);
    await container.createIfNotExists();

    // Safe naming
    const safeFile = String(fileName).replace(/[^\w.\-()+ ]+/g, "_");
    const userFolder = String(user.id || user.userId || user.sub || "user").replace(
      /[^a-zA-Z0-9._-]+/g,
      "_"
    );

    const blobName = `${userFolder}/${Date.now()}_${safeFile}`;
    const blob = container.getBlockBlobClient(blobName);

    const expiresOn = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    const sas = generateBlobSASQueryParameters(
      {
        containerName,
        blobName,
        permissions: BlobSASPermissions.parse("cw"), // create + write
        expiresOn,
      },
      cred
    ).toString();

    return json(200, {
      ok: true,
      blobName,
      uploadUrl: `${blob.url}?${sas}`,
      userId: user.id || user.userId || null,
    });
  } catch (e) {
    context.log("resumeUploadUrl error", e);
    return json(500, { ok: false, error: e?.message || "Server error" });
  }
};

async function safeJson(request) {
  try {
    // v4 request.json() throws if body empty or invalid
    return await request.json();
  } catch {
    return {};
  }
}

function parseConn(c) {
  const m = {};
  String(c)
    .split(";")
    .forEach((p) => {
      const i = p.indexOf("=");
      if (i === -1) return;
      const k = p.slice(0, i);
      const v = p.slice(i + 1);
      m[k] = v;
    });
  return { accountName: m.AccountName, accountKey: m.AccountKey };
}

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(status, body) {
  return {
    status,
    headers: { ...cors(), "Content-Type": "application/json" },
    // Azure Functions v4 supports BOTH `body` (string) and `jsonBody` (object).
    // Using `body` keeps your style consistent.
    body: JSON.stringify(body),
  };
}
