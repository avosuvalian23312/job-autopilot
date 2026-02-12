// backend/src/functions/resumeSas.js
"use strict";

const { CosmosClient } = require("@azure/cosmos");
const {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
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

    const email =
      principal.claims?.find((c) => c.typ === "emails")?.val ||
      principal.userDetails ||
      "";

    return { userId: principal.userId, email };
  } catch {
    return null;
  }
}

function parseStorageConnString(cs) {
  const parts = {};
  String(cs || "")
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean)
    .forEach((kv) => {
      const i = kv.indexOf("=");
      if (i === -1) return;
      const k = kv.slice(0, i);
      const v = kv.slice(i + 1);
      parts[k] = v;
    });

  return {
    accountName: parts.AccountName,
    accountKey: parts.AccountKey,
  };
}

async function resumeSas(request, context) {
  try {
    if (request.method === "OPTIONS") return { status: 204 };

    const user = getSwaUser(request);
    if (!user) return { status: 401, jsonBody: { ok: false, error: "Not authenticated" } };

    const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const COSMOS_CONNECTION_STRING = process.env.COSMOS_CONNECTION_STRING;
    const COSMOS_DB_NAME = process.env.COSMOS_DB_NAME;
    const COSMOS_RESUMES_CONTAINER_NAME = process.env.COSMOS_RESUMES_CONTAINER_NAME;
    const BLOB_RESUMES_CONTAINER = process.env.BLOB_RESUMES_CONTAINER || "resumes";

    if (!AZURE_STORAGE_CONNECTION_STRING) {
      return { status: 500, jsonBody: { ok: false, error: "Missing AZURE_STORAGE_CONNECTION_STRING" } };
    }

    const url = new URL(request.url);
    const resumeId = url.searchParams.get("resumeId");
    const blobNameParam = url.searchParams.get("blobName");

    let blobName = blobNameParam ? String(blobNameParam) : "";
    let fileName = "resume.pdf";

    // Prefer resumeId (safer): ensures the user owns the resume in Cosmos
    if (resumeId) {
      if (!COSMOS_CONNECTION_STRING || !COSMOS_DB_NAME || !COSMOS_RESUMES_CONTAINER_NAME) {
        return { status: 500, jsonBody: { ok: false, error: "Cosmos env not configured for resume lookup" } };
      }

      const cosmos = new CosmosClient(COSMOS_CONNECTION_STRING);
      const resumes = cosmos.database(COSMOS_DB_NAME).container(COSMOS_RESUMES_CONTAINER_NAME);

      const read = await resumes.item(String(resumeId), user.userId).read().catch(() => null);
      const doc = read?.resource || null;

      if (!doc?.blobName) return { status: 404, jsonBody: { ok: false, error: "Resume not found" } };

      blobName = String(doc.blobName);
      fileName = String(doc.originalName || doc.name || fileName);
    }

    if (!blobName) return { status: 400, jsonBody: { ok: false, error: "Missing resumeId or blobName" } };

    // Basic ownership guard if blobName provided directly
    if (!blobName.startsWith(`${user.userId}/`)) {
      return { status: 403, jsonBody: { ok: false, error: "Forbidden" } };
    }

    const { accountName, accountKey } = parseStorageConnString(AZURE_STORAGE_CONNECTION_STRING);
    if (!accountName || !accountKey) {
      return { status: 500, jsonBody: { ok: false, error: "Could not parse storage connection string" } };
    }

    const sharedKey = new StorageSharedKeyCredential(accountName, accountKey);
    const blobService = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
    const container = blobService.getContainerClient(BLOB_RESUMES_CONTAINER);
    const blobClient = container.getBlobClient(blobName);

    const expiresOn = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    const sas = generateBlobSASQueryParameters(
      {
        containerName: BLOB_RESUMES_CONTAINER,
        blobName,
        permissions: BlobSASPermissions.parse("r"),
        expiresOn,
        contentDisposition: `attachment; filename="${fileName.replace(/"/g, "")}"`,
        contentType: "application/pdf",
      },
      sharedKey
    ).toString();

    return {
      status: 200,
      jsonBody: {
        ok: true,
        url: `${blobClient.url}?${sas}`,
        fileName,
        expiresInSeconds: 300,
      },
    };
  } catch (e) {
    context?.log?.("resumeSas error:", e);
    return { status: 500, jsonBody: { ok: false, error: "Internal Server Error", detail: String(e?.message || e) } };
  }
}

module.exports = { resumeSas };
