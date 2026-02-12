"use strict";

const { CosmosClient } = require("@azure/cosmos");

function getSwaUser(request) {
  try {
    const mod = require("../lib/swaUser");
    if (typeof mod.getSwaUser === "function") return mod.getSwaUser(request);
    if (typeof mod.swaUser === "function") return mod.swaUser(request);
  } catch {}

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

async function coverLettersGet(request, context) {
  try {
    if (request.method === "OPTIONS") return { status: 204 };

    const COSMOS_CONNECTION_STRING = process.env.COSMOS_CONNECTION_STRING;
    const COSMOS_DB_NAME = process.env.COSMOS_DB_NAME;
    const COSMOS_COVERLETTERS_CONTAINER_NAME =
      process.env.COSMOS_COVERLETTERS_CONTAINER_NAME || "coverLetters";

    if (!COSMOS_CONNECTION_STRING || !COSMOS_DB_NAME) {
      return { status: 500, jsonBody: { ok: false, error: "Missing Cosmos env vars" } };
    }

    const user = getSwaUser(request);
    if (!user) return { status: 401, jsonBody: { ok: false, error: "Not authenticated" } };

    const id = request.params?.id;
    if (!id) return { status: 400, jsonBody: { ok: false, error: "Missing id" } };

    const cosmos = new CosmosClient(COSMOS_CONNECTION_STRING);
    const container = cosmos.database(COSMOS_DB_NAME).container(COSMOS_COVERLETTERS_CONTAINER_NAME);

    const read = await container.item(String(id), user.userId).read().catch(() => null);
    const doc = read?.resource || null;

    if (!doc) return { status: 404, jsonBody: { ok: false, error: "Not found" } };

    return { status: 200, jsonBody: { ok: true, coverLetter: doc } };
  } catch (err) {
    context.log.error("coverLettersGet error:", err);
    return { status: 500, jsonBody: { ok: false, error: err?.message || String(err) } };
  }
}

module.exports = { coverLettersGet };
