// src/functions/resumeUploadUrl.js (Azure Functions v4 - hardened, no requireUser dependency)



const {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
} = require("@azure/storage-blob");

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
    body: JSON.stringify(body),
  };
}

function getSwaUser(request) {
  const header =
    request.headers.get("x-ms-client-principal") ||
    request.headers.get("X-MS-CLIENT-PRINCIPAL");
  if (!header) return null;

  try {
    const decoded = Buffer.from(header, "base64").toString("utf8");
    const principal = JSON.parse(decoded);
    if (!principal?.userId) return null;
    return { userId: principal.userId };
  } catch {
    return null;
  }
}

async function safeJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function parseConn(c) {
  const m = {};
  String(c || "")
    .split(";")
    .forEach((p) => {
      const i = p.indexOf("=");
      if (i === -1) return;
      const k = p.slice(0, i);
      const v = p.slice(i + 1);
      m[k] = v;
    });
  return { accountName: m.AccountName || null, accountKey: m.AccountKey || null };
}

module.exports = async function resumeUploadUrl(request, context) {
  try {
    if (request.method === "OPTIONS") return { status: 204, headers: cors() };
    if (request.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

    // ✅ v4-safe SWA auth
    const user = getSwaUser(request);
    if (!user) {
      return json(401, {
        ok: false,
        error: "Unauthorized (missing x-ms-client-principal)",
        hint: "Make sure you are logged in through the SWA site and calling /api/* on the same domain.",
      });
    }

    const body = await safeJson(request);

    // ✅ accept multiple possible keys to avoid frontend mismatch
    const fileName =
      body?.fileName ||
      body?.originalName ||
      body?.name ||
      body?.filename ||
      "";

    if (!fileName) return json(400, { ok: false, error: "fileName required" });

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

    const safeFile = String(fileName).replace(/[^\w.\-()+ ]+/g, "_");
    const userFolder = String(user.userId).replace(/[^a-zA-Z0-9._-]+/g, "_");

    const blobName = `${userFolder}/${Date.now()}_${safeFile}`;
    const blob = container.getBlockBlobClient(blobName);

    const expiresOn = new Date(Date.now() + 10 * 60 * 1000);
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
    });
  } catch (e) {
    context.log("resumeUploadUrl error", e);
    return json(500, { ok: false, error: e?.message || "Server error" });
  }
};
