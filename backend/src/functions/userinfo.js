const { CosmosClient } = require("@azure/cosmos");
const { requireAuth } = require("../lib/auth");

function headers() {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
}

function parseConn(connStr) {
  const parts = String(connStr || "")
    .split(";")
    .reduce((acc, part) => {
      const [k, ...rest] = part.split("=");
      const v = rest.join("=");
      if (k && v) acc[k] = v;
      return acc;
    }, {});
  if (!parts.AccountEndpoint || !parts.AccountKey) throw new Error("Invalid COSMOS_CONNECTION_STRING");
  return { endpoint: parts.AccountEndpoint, key: parts.AccountKey };
}

function cosmos() {
  const { endpoint, key } = parseConn(process.env.COSMOS_CONNECTION_STRING);
  return new CosmosClient({ endpoint, key });
}

module.exports = async function userinfo(req, context) {
  if (String(req.method).toUpperCase() === "OPTIONS") {
    return { status: 200, headers: headers(), body: JSON.stringify({ ok: true }) };
  }

  const auth = requireAuth(req);
  if (!auth.ok) {
    return { status: auth.status, headers: headers(), body: JSON.stringify({ ok: false, error: auth.error }) };
  }

  const COSMOS_DB = process.env.COSMOS_DB_NAME;
  const USERS_CONTAINER = process.env.USERS_CONTAINER_NAME || "users";
  if (!COSMOS_DB) {
    return { status: 500, headers: headers(), body: JSON.stringify({ ok: false, error: "Missing COSMOS_DB_NAME" }) };
  }

  const client = cosmos();
  const container = client.database(COSMOS_DB).container(USERS_CONTAINER);

  // PK is /id, so partition key == id
  try {
    const { resource } = await container.item(auth.userId, auth.userId).read();

    return {
      status: 200,
      headers: headers(),
      body: JSON.stringify({
        ok: true,
        user: resource
          ? {
              id: resource.id,
              userId: resource.userId || resource.id,
              email: resource.email || null,
              provider: resource.provider || null,
              name: resource.name || null,
            }
          : { id: auth.userId },
        plan: null,
        onboardingComplete: false,
      }),
    };
  } catch (e) {
    context?.log?.("userinfo read error:", e?.message || e);
    return {
      status: 200,
      headers: headers(),
      body: JSON.stringify({ ok: true, user: { id: auth.userId }, plan: null }),
    };
  }
};
