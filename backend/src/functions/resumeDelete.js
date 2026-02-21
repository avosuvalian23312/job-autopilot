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
    if (!user) return { status: 401, jsonBody: { ok: false, error: "Not authenticated" } };

    const body = (await request.json().catch(() => ({}))) || {};
    const id = body.id;

    if (!id) return { status: 400, jsonBody: { ok: false, error: "Missing id" } };

    const client = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
    const container = client
      .database(process.env.COSMOS_DB_NAME)
      .container(process.env.COSMOS_RESUMES_CONTAINER_NAME);

    // read first so we can know if it was default, etc.
    const { resource } = await container.item(id, user.userId).read();
    if (!resource) return { status: 404, jsonBody: { ok: false, error: "Not found" } };

    await container.item(id, user.userId).delete();

    // Optional: if they deleted default, you can set newest remaining as default (not required)
    // Keeping it minimal as requested.

    return { status: 200, jsonBody: { ok: true } };
  } catch (err) {
    context.log.error("resumeDelete error:", err);
    return {
      status: 500,
      jsonBody: { ok: false, error: "Internal Server Error", detail: err?.message || String(err) },
    };
  }
};
