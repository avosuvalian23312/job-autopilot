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

    const user = getSwaUser(request);
    if (!user) return { status: 401, jsonBody: { ok: false, error: "Not authenticated" } };

    const body = (await request.json().catch(() => ({}))) || {};
    const id = body.id;

    if (!id) return { status: 400, jsonBody: { ok: false, error: "Missing id" } };

    const client = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
    const container = client
      .database(process.env.COSMOS_DB_NAME)
      .container(process.env.COSMOS_RESUMES_CONTAINER_NAME);

    // Get all resumes for the user
    const query = {
      query: "SELECT * FROM c WHERE c.userId = @uid",
      parameters: [{ name: "@uid", value: user.userId }],
    };

    const { resources } = await container.items
      .query(query, { partitionKey: user.userId })
      .fetchAll();

    const items = resources || [];
    if (items.length === 0) return { status: 404, jsonBody: { ok: false, error: "No resumes found" } };

    // Ensure the target resume exists
    const target = items.find((r) => r.id === id);
    if (!target) return { status: 404, jsonBody: { ok: false, error: "Resume not found" } };

    const now = new Date().toISOString();

    // Update all docs (simple, safe)
    // (Cosmos has patch operations, but replace keeps this universally compatible.)
    const updatedDocs = [];
    for (const r of items) {
      const shouldDefault = r.id === id;
      if (Boolean(r.isDefault) !== shouldDefault) {
        r.isDefault = shouldDefault;
        r.updatedAt = now;
        r.updated_date = now.split("T")[0];
        const { resource: updated } = await container.item(r.id, user.userId).replace(r);
        updatedDocs.push(updated);
      } else {
        updatedDocs.push(r);
      }
    }

    return { status: 200, jsonBody: { ok: true } };
  } catch (err) {
    context.log.error("resumeSetDefault error:", err);
    return {
      status: 500,
      jsonBody: { ok: false, error: "Internal Server Error", detail: err?.message || String(err) },
    };
  }
};
