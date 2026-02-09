// src/functions/resumeUploadUrl.js
const {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
} = require("@azure/storage-blob");

const { requireUser } = require("../lib/auth");

module.exports = async function resumeUploadUrl(req, context) {
  if (req.method === "OPTIONS") {
    return { status: 204, headers: cors() };
  }

  // --- AUTH: SWA principal header (no JWT) ---
  let user;
  try {
    user = requireUser(req);
  } catch (e) {
    return json(401, {
      ok: false,
      error: e.message,
      hint:
        "Make sure you are logged in via Static Web Apps auth and call /api/* through the SWA site (not direct func host).",
    });
  }

  // --- MAIN LOGIC ---
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
    if (!accountName || !accountKey) {
      return json(500, {
        ok: false,
        error:
          "Invalid AZURE_STORAGE_CONNECTION_STRING (missing AccountName/AccountKey)",
      });
    }

    const cred = new StorageSharedKeyCredential(accountName, accountKey);
    const service = new BlobServiceClient(
      `https://${accountName}.blob.core.windows.net`,
      cred
    );

    const container = service.getContainerClient(containerName);
    await container.createIfNotExists();

    // Safe naming
    const safeFile = String(fileName).replace(/[^\w.\-()+ ]+/g, "_");

    // Use stable user id; make it path-safe
    const userFolder = String(user.id).replace(/[^a-zA-Z0-9._-]+/g, "_");

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
      userId: user.id, // helpful for debugging
    });
  } catch (e) {
    context.log("resumeUploadUrl error", e);
    return json(500, { ok: false, error: e.message });
  }
};

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
    // remove Authorization since we don't use it anymore
    "Access-Control-Allow-Headers": "Content-Type",
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
