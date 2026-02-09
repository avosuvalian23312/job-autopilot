// src/functions/resumeUploadUrl.js
const {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
} = require("@azure/storage-blob");

const jwt = require("jsonwebtoken");
const auth = require("../lib/auth");

module.exports = async function resumeUploadUrl(req, context) {
  if (req.method === "OPTIONS") {
    return { status: 204, headers: cors() };
  }

  // ---- AUTH (with TEMP debug) ----
  let user;
  try {
    user = auth.requireAuth(req);
  } catch (e) {
    // TEMP DEBUG: helps confirm env mismatch (remove after fixing)
    const rawAuth =
      (req?.headers && typeof req.headers.get === "function"
        ? req.headers.get("Authorization") || req.headers.get("authorization")
        : (req?.headers?.Authorization || req?.headers?.authorization)) || "";

    const token = String(rawAuth).replace(/^Bearer\s+/i, "").trim();

    let alg = null;
    let decodedPayload = null;
    try {
      const decoded = jwt.decode(token, { complete: true });
      alg = decoded?.header?.alg || null;
      decodedPayload = decoded?.payload || null;
    } catch {}

    return json(401, {
      ok: false,
      error: e.message,
      debug: {
        hasAppJwtSecret: !!process.env.APP_JWT_SECRET,
        appJwtSecretLen: (process.env.APP_JWT_SECRET || "").length,
        authHeaderPresent: !!rawAuth,
        tokenLooksJwt: token.split(".").length === 3,
        alg,
        // safe-ish: shows claims without verifying (remove after fixing)
        payload: decodedPayload,
      },
    });
  }

  // ---- MAIN LOGIC ----
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
        error: "Invalid AZURE_STORAGE_CONNECTION_STRING (missing AccountName/AccountKey)",
      });
    }

    const cred = new StorageSharedKeyCredential(accountName, accountKey);
    const service = new BlobServiceClient(
      `https://${accountName}.blob.core.windows.net`,
      cred
    );

    const container = service.getContainerClient(containerName);
    await container.createIfNotExists();

    const safeFile = String(fileName).replace(/[^\w.\-()+ ]+/g, "_");
    const blobName = `${user.userId}/${Date.now()}_${safeFile}`;
    const blob = container.getBlockBlobClient(blobName);

    const expiresOn = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
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
