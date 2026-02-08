// src/functions/resumeUploadUrl.js
const {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
} = require("@azure/storage-blob");

const auth = require("../lib/auth");

// POST /api/resume/upload-url
// Body: { fileName, contentType }  (fileName required)
// Returns: { ok: true, blobName, uploadUrl, expiresInSeconds }
module.exports = async function resumeUploadUrl(req, context) {
  // CORS / preflight
  if (req.method === "OPTIONS") {
    return {
      status: 204,
      headers: corsHeaders(),
    };
  }

  try {
    // 1) Require your APP JWT (Authorization: Bearer <token>)
    const user = auth.requireAuth(req); // should return { userId, email, ... }
    const userId = user.userId || user.uid;
    if (!userId) {
      return json(401, { ok: false, error: "Unauthorized (missing userId)" });
    }

    // 2) Parse request
    const body = await safeJson(req);
    const fileName = (body?.fileName || "").trim();
    const contentType = (body?.contentType || "application/octet-stream").trim();

    if (!fileName) {
      return json(400, { ok: false, error: "fileName is required" });
    }

    // 3) Env vars
    const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const containerName = process.env.RESUME_CONTAINER || "resumes";

    if (!conn) {
      return json(500, {
        ok: false,
        error:
          "Missing AZURE_STORAGE_CONNECTION_STRING in backend Application Settings",
      });
    }

    // 4) Create blob name (unique, user-scoped)
    const ext = pickExtension(fileName);
    const safeUser = userId.replace(/[^a-zA-Z0-9:_-]/g, "_");
    const blobName = `${safeUser}/${Date.now()}${ext}`;

    // 5) Build Blob client (we need accountName/accountKey to generate SAS)
    const parsed = parseStorageConnectionString(conn);
    if (!parsed) {
      return json(500, {
        ok: false,
        error:
          "Could not parse AZURE_STORAGE_CONNECTION_STRING (expected AccountName/AccountKey)",
      });
    }

    const { accountName, accountKey } = parsed;
    const credential = new StorageSharedKeyCredential(accountName, accountKey);
    const serviceClient = new BlobServiceClient(
      `https://${accountName}.blob.core.windows.net`,
      credential
    );

    const containerClient = serviceClient.getContainerClient(containerName);

    // Optional: create container if missing (safe to keep)
    // If you prefer strict infra, delete this block.
    await containerClient.createIfNotExists();

    const blobClient = containerClient.getBlockBlobClient(blobName);

    // 6) Create SAS (write-only, short-lived)
    const expiresInSeconds = 10 * 60; // 10 minutes
    const startsOn = new Date(Date.now() - 60 * 1000);
    const expiresOn = new Date(Date.now() + expiresInSeconds * 1000);

    const sas = generateBlobSASQueryParameters(
      {
        containerName,
        blobName,
        permissions: BlobSASPermissions.parse("cw"), // create + write
        startsOn,
        expiresOn,
        contentType, // helps enforce expected content type
      },
      credential
    ).toString();

    const uploadUrl = `${blobClient.url}?${sas}`;

    return json(200, {
      ok: true,
      blobName,
      uploadUrl,
      expiresInSeconds,
    });
  } catch (err) {
    context?.log?.("resumeUploadUrl error", err);
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
    // Azure Functions node can provide req.json()
    if (typeof req.json === "function") return await req.json();
  } catch {}
  try {
    // fallback: sometimes body is already object/string
    if (!req.body) return {};
    if (typeof req.body === "string") return JSON.parse(req.body);
    return req.body;
  } catch {
    return {};
  }
}

function pickExtension(fileName) {
  const m = fileName.toLowerCase().match(/\.[a-z0-9]{1,8}$/);
  if (!m) return "";
  // allow only common resume extensions
  const ext = m[0];
  const allowed = new Set([".pdf", ".doc", ".docx", ".txt", ".rtf"]);
  return allowed.has(ext) ? ext : "";
}

// Parses AccountName + AccountKey out of a storage connection string
function parseStorageConnectionString(conn) {
  const parts = conn.split(";").map((p) => p.trim());
  let accountName = "";
  let accountKey = "";
  for (const p of parts) {
    const [k, v] = p.split("=", 2);
    if (k === "AccountName") accountName = v;
    if (k === "AccountKey") accountKey = v;
  }
  if (!accountName || !accountKey) return null;
  return { accountName, accountKey };
}
