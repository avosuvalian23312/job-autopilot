// backend/src/functions/authExchange.js
const { CosmosClient } = require("@azure/cosmos");
const jwt = require("jsonwebtoken");
const { createRemoteJWKSet, jwtVerify } = require("jose");

// ------------------------
// Response helpers (NEW MODEL friendly)
// ------------------------
function headers(extra = {}) {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    ...extra,
  };
}

function json(status, obj) {
  return {
    status,
    headers: headers(),
    jsonBody: obj, // Azure Functions v4 supports jsonBody
    body: JSON.stringify(obj), // also include body for compatibility
  };
}

// ------------------------
// Cosmos connection string parsing
// ------------------------
function parseCosmosConnectionString(connStr) {
  if (!connStr) throw new Error("Missing COSMOS_CONNECTION_STRING");

  const parts = connStr.split(";").reduce((acc, part) => {
    const [k, ...rest] = part.split("=");
    const v = rest.join("=");
    if (k && v) acc[k] = v;
    return acc;
  }, {});

  if (!parts.AccountEndpoint || !parts.AccountKey) {
    throw new Error("Invalid COSMOS_CONNECTION_STRING (needs AccountEndpoint and AccountKey)");
  }

  return { endpoint: parts.AccountEndpoint, key: parts.AccountKey };
}

function getCosmosClient() {
  const { endpoint, key } = parseCosmosConnectionString(process.env.COSMOS_CONNECTION_STRING);
  return new CosmosClient({ endpoint, key });
}

async function upsertUser(cosmos, { provider, sub, email, name }) {
  const COSMOS_DB = process.env.COSMOS_DB_NAME;
  const USERS_CONTAINER = process.env.USERS_CONTAINER_NAME || "users";
  if (!COSMOS_DB) throw new Error("Missing COSMOS_DB_NAME");

  const db = cosmos.database(COSMOS_DB);
  const users = db.container(USERS_CONTAINER);

  const userId = `${provider}:${sub}`;

  const doc = {
    id: userId,
    userId,
    provider,
    providerSub: sub,
    email: email || null,
    name: name || null,
    updatedAt: Date.now(),
  };

  await users.items.upsert(doc);
  return doc;
}

function signAppToken(user) {
  const secret = process.env.APP_JWT_SECRET;
  if (!secret) throw new Error("Missing APP_JWT_SECRET");

  return jwt.sign(
    { uid: user.userId, email: user.email, provider: user.provider },
    secret,
    { expiresIn: "7d" }
  );
}

// ------------------------
// Optional idToken verification (if you send idToken)
// ------------------------
let microsoftJWKS = null;
let googleJWKS = null;

function getMicrosoftJWKS() {
  if (!microsoftJWKS) {
    microsoftJWKS = createRemoteJWKSet(
      new URL("https://login.microsoftonline.com/common/discovery/v2.0/keys")
    );
  }
  return microsoftJWKS;
}

function getGoogleJWKS() {
  if (!googleJWKS) {
    googleJWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
  }
  return googleJWKS;
}

async function verifyMicrosoftIdToken(idToken) {
  const audience = process.env.ENTRA_CLIENT_ID;
  if (!audience) throw new Error("Missing ENTRA_CLIENT_ID");

  const { payload } = await jwtVerify(idToken, getMicrosoftJWKS(), { audience });

  const email =
    payload.email ||
    payload.preferred_username ||
    (Array.isArray(payload.emails) ? payload.emails[0] : undefined);

  return { sub: payload.sub, email, name: payload.name || "" };
}

async function verifyGoogleIdToken(idToken) {
  const audience = process.env.GOOGLE_CLIENT_ID;
  if (!audience) throw new Error("Missing GOOGLE_CLIENT_ID");

  const { payload } = await jwtVerify(idToken, getGoogleJWKS(), {
    audience,
    issuer: ["https://accounts.google.com", "accounts.google.com"],
  });

  return { sub: payload.sub, email: payload.email, name: payload.name || "" };
}

// ------------------------
// MAIN HANDLER (NEW Functions model)
// MUST return a response (or you'll get 204)
// ------------------------
async function authExchange(request, context) {
  const VERSION = "authExchange-return-response";

  try {
    const method = (request?.method || "").toUpperCase();

    if (method === "OPTIONS") {
      return json(200, { ok: true, version: VERSION });
    }

    // Parse JSON body safely
    let body = {};
    try {
      body = (await request.json()) || {};
    } catch (_) {
      // if request.json() fails, keep {}
      body = {};
    }

    const provider = String(body?.provider || "").toLowerCase().trim();
    const providerId = String(body?.providerId || "").trim();
    const email = String(body?.email || "").trim() || null;
    const name = String(body?.name || "").trim() || null;
    const idToken = String(body?.idToken || "").trim();

    if (!provider) return json(400, { ok: false, version: VERSION, error: "Missing provider" });

    // Required envs
    const required = ["COSMOS_CONNECTION_STRING", "COSMOS_DB_NAME", "APP_JWT_SECRET"];
    for (const k of required) {
      if (!process.env[k]) return json(500, { ok: false, version: VERSION, error: `Missing env var: ${k}` });
    }

    const cosmos = getCosmosClient();

    let info;
    if (idToken) {
      if (provider === "microsoft") info = await verifyMicrosoftIdToken(idToken);
      else if (provider === "google") info = await verifyGoogleIdToken(idToken);
      else return json(400, { ok: false, version: VERSION, error: "Invalid provider (google|microsoft)" });
    } else {
      if (!providerId) return json(400, { ok: false, version: VERSION, error: "Missing providerId (or send idToken)" });
      info = { sub: providerId, email, name };
    }

    if (!info?.sub) return json(401, { ok: false, version: VERSION, error: "Invalid auth info (missing sub/providerId)" });

    const user = await upsertUser(cosmos, {
      provider,
      sub: info.sub,
      email: info.email,
      name: info.name,
    });

    const appToken = signAppToken(user);

    return json(200, {
      ok: true,
      version: VERSION,
      token: appToken,      // keep both for frontend compatibility
      appToken,
      user: { id: user.userId, email: user.email, provider: user.provider, name: user.name },
    });
  } catch (e) {
    context?.log?.("authExchange error:", e);
    return json(500, { ok: false, version: VERSION, error: e?.message || "Auth exchange failed" });
  }
}

// Export BOTH ways so your index.js handler works no matter what
module.exports = authExchange;
module.exports.authExchange = authExchange;
