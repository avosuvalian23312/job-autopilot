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

module.exports = async function (request, context) {
  try {
    if (request.method === "OPTIONS") return { status: 204 };

    const user = getSwaUser(request);
    if (!user) return { status: 401, jsonBody: { ok: false } };

    const body = await request.json().catch(() => ({}));
    const id = body?.id;
    if (!id) return { status: 400, jsonBody: { ok: false, error: "Missing id" } };

    // Cosmos lookup (same container you already use)
    const client = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
    const container = client
      .database(process.env.COSMOS_DB_NAME)
      .container(process.env.COSMOS_RESUMES_CONTAINER_NAME);

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
    if (!doc) return { status: 404, jsonBody: { ok: false, error: "Not found" } };

    // If you ever store pasted text resumes as doc.content, return it directly
    if (doc.content && String(doc.content).trim()) {
      return {
        status: 200,
        jsonBody: {
          ok: true,
          content: doc.content,
          contentType: doc.contentType || "text/plain",
          originalName: doc.originalName || doc.fileName || doc.name || "resume.txt",
        },
      };
    }

    const blobName = doc.blobName;
    if (!blobName) {
      return { status: 400, jsonBody: { ok: false, error: "Missing blobName on resume doc" } };
    }

    const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const containerName = process.env.RESUME_CONTAINER;
    if (!connStr || !containerName) {
      return {
        status: 500,
        jsonBody: { ok: false, error: "Missing AZURE_STORAGE_CONNECTION_STRING or RESUME_CONTAINER" },
      };
    }

    // Build blob client
    const blobServiceClient = BlobServiceClient.fromConnectionString(connStr);
    const blobClient = blobServiceClient
      .getContainerClient(containerName)
      .getBlobClient(blobName);

    // Generate SAS (need account name + key for signing)
    const accountName = parseAccountNameFromConnStr(connStr);
    const accountKey = parseAccountKeyFromConnStr(connStr);
    if (!accountName || !accountKey) {
      return {
        status: 500,
        jsonBody: {
          ok: false,
          error: "Storage connection string missing AccountName/AccountKey; cannot generate SAS",
        },
      };
    }

    const credential = new StorageSharedKeyCredential(accountName, accountKey);
    const expiresOn = new Date(Date.now() + 15 * 60 * 1000); // 15 min

    const sas = generateBlobSASQueryParameters(
      {
        containerName,
        blobName,
        permissions: BlobSASPermissions.parse("r"),
        expiresOn,
      },
      credential
    ).toString();

    const url = `${blobClient.url}?${sas}`;

    return {
      status: 200,
      jsonBody: {
        ok: true,
        url,
        contentType: doc.contentType || "",
        originalName: doc.originalName || doc.fileName || doc.name || "",
      },
    };
  } catch (err) {
    context.log.error(err);
    return { status: 500, jsonBody: { ok: false, error: "Server error" } };
  }
};
