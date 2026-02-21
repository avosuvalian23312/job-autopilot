const { getAuthenticatedUser } = require("../lib/swaUser");
const { CosmosClient } = require("@azure/cosmos");

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

module.exports = async function (request, context) {
  try {
    if (request.method === "OPTIONS") return { status: 204 };

    const user = getAuthenticatedUser(request) || getSwaUser(request);
    if (!user) return { status: 401, jsonBody: { ok: false } };

    const client = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
    const container = client
      .database(process.env.COSMOS_DB_NAME)
      .container(process.env.COSMOS_RESUMES_CONTAINER_NAME);

    const query = {
      query: `
        SELECT * FROM c
        WHERE c.userId = @uid
          AND (NOT IS_DEFINED(c.hiddenFromLibrary) OR c.hiddenFromLibrary != true)
          AND (NOT IS_DEFINED(c.tailoredFor))
          AND (NOT IS_DEFINED(c.sourceResumeId))
          AND (NOT IS_DEFINED(c.sourceType) OR c.sourceType != "tailored_packet")
          AND (NOT IS_DEFINED(c.tailorMode) OR NOT STARTSWITH(c.tailorMode, "regen-ats"))
        ORDER BY c.uploadedAt DESC
      `,
      parameters: [{ name: "@uid", value: user.userId }],
    };

    const { resources } = await container.items
      .query(query, { partitionKey: user.userId })
      .fetchAll();

    return {
      status: 200,
      jsonBody: {
        ok: true,
        resumes: (resources || []).map(r => ({
          id: r.id,
          name: r.name || r.originalName,
          isDefault: Boolean(r.isDefault),
          updated_date: r.updated_date,
        })),
      },
    };
  } catch (err) {
    context.log.error(err);
    return { status: 500, jsonBody: { ok: false } };
  }
};
