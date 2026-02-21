"use strict";

const { getAuthenticatedUser } = require("../lib/swaUser");

const { CosmosClient } = require("@azure/cosmos");
const {
  BlobServiceClient,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  StorageSharedKeyCredential,
} = require("@azure/storage-blob");

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

function parseAccountNameFromConnStr(connStr) {
  const m = /AccountName=([^;]+)/i.exec(connStr || "");
  return m ? m[1] : null;
}
function parseAccountKeyFromConnStr(connStr) {
  const m = /AccountKey=([^;]+)/i.exec(connStr || "");
  return m ? m[1] : null;
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

// Ã¢Å“â€¦ IMPORTANT: export ONLY the handler (index.js registers the route)
module.exports = async (request, context) => {
  try {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: cors() };
    }

    const user = getAuthenticatedUser(request) || getSwaUser(request);
    if (!user) return json(401, { ok: false });

    const body = await request.json().catch(() => ({}));
    const id = body?.id;
    if (!id) return json(400, { ok: false, error: "Missing id" });

    // Cosmos lookup
    const cosmosConn = process.env.COSMOS_CONNECTION_STRING;
    const dbName = process.env.COSMOS_DB_NAME;
    const containerName = process.env.COSMOS_RESUMES_CONTAINER_NAME;

    if (!cosmosConn || !dbName || !containerName) {
      return json(500, {
        ok: false,
        error: "Missing COSMOS env vars",
      });
    }

    const client = new CosmosClient(cosmosConn);
    const container = client.database(dbName).container(containerName);

    const query = {
      query: `SELECT TOP 1 * FROM c WHERE c.userId = @uid AND c.id = @id`,
      parameters: [
        { name: "@uid", value: user.userId },
        { name: "@id", value: id },
      ],
    };

    const { resources } = await container.items
      .query(query, { partitionKey: user.userId })
      .fetchAll();

    const doc = resources?.[0];
    if (!doc) return json(404, { ok: false, error: "Not found" });

    // If you store pasted text resumes as doc.content, return directly
    if (doc.content && String(doc.content).trim()) {
      return json(200, {
        ok: true,
        content: doc.content,
        contentType: doc.contentType || "text/plain",
        originalName:
          doc.originalName || doc.fileName || doc.name || "resume.txt",
      });
    }

    const blobName = doc.blobName;
    if (!blobName) {
      return json(400, { ok: false, error: "Missing blobName on resume doc" });
    }

    const storageConn = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const resumeContainer = process.env.RESUME_CONTAINER;

    if (!storageConn || !resumeContainer) {
      return json(500, {
        ok: false,
        error: "Missing AZURE_STORAGE_CONNECTION_STRING or RESUME_CONTAINER",
      });
    }

    // Build blob client
    const blobServiceClient = BlobServiceClient.fromConnectionString(storageConn);
    const blobClient = blobServiceClient
      .getContainerClient(resumeContainer)
      .getBlobClient(blobName);

    // Generate SAS
    const accountName = parseAccountNameFromConnStr(storageConn);
    const accountKey = parseAccountKeyFromConnStr(storageConn);
    if (!accountName || !accountKey) {
      return json(500, {
        ok: false,
        error:
          "Storage connection string missing AccountName/AccountKey; cannot generate SAS",
      });
    }

    const credential = new StorageSharedKeyCredential(accountName, accountKey);
    const expiresOn = new Date(Date.now() + 15 * 60 * 1000); // 15 min

    const sas = generateBlobSASQueryParameters(
      {
        containerName: resumeContainer,
        blobName,
        permissions: BlobSASPermissions.parse("r"),
        expiresOn,
      },
      credential
    ).toString();

    const url = `${blobClient.url}?${sas}`;

    return json(200, {
      ok: true,
      url,
      contentType: doc.contentType || "",
      originalName: doc.originalName || doc.fileName || doc.name || "",
    });
  } catch (err) {
    context.log.error(err);
    return json(500, { ok: false, error: "Server error" });
  }
};
