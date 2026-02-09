const { CosmosClient } = require("@azure/cosmos");
const jwt = require("jsonwebtoken");
const { createRemoteJWKSet, jwtVerify } = require("jose");

// ------------------------
// Helpers
// ------------------------
function withCommonHeaders(extra = {}) {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    ...extra,
  };
}

function jsonString(obj) {
  return JSON.stringify(obj);
}

function setClassicResponse(context, status, obj) {
  context.res = {
    status,
    headers: withCommonHeaders(),
    body: jsonString(obj),
  };
}

function isClassicContext(x) {
  // classic model typically has bindings + res usage; v4 context does not use context.res
  return !!x && ("bindings" in x) && ("log" in x);
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

const secret = String(process.env.APP_JWT_SECRET || "").trim();
if (!secret) {
  throw new Error("Missing APP_JWT_SECRET");
}

const userId = user.userId; // already like "google:123..." or "microsoft:abc..."

return jwt.sign(
  {
    uid: userId,        // <-- REQUIRED
    userId: userId,     // <-- REQUIRED (redundant on purpose)
    email: user.email,
    provider: user.provider,
  },
  secret,
  { expiresIn: "7d" }
);



// ------------------------
// OPTIONAL: verify idToken if you send it (recommended for real auth)
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
  if (!audience) throw new Error("Missing ENTRA_CLIENT_ID on backend.");

  const { payload } = await jwtVerify(idToken, getMicrosoftJWKS(), { audience });

  const email =
    payload.email ||
    payload.preferred_username ||
    (Array.isArray(payload.emails) ? payload.emails[0] : undefined);

  return { sub: payload.sub, email, name: payload.name || "" };
}

async function verifyGoogleIdToken(idToken) {
  const audience = process.env.GOOGLE_CLIENT_ID;
  if (!audience) throw new Error("Missing GOOGLE_CLIENT_ID on backend.");

  const { payload } = await jwtVerify(idToken, getGoogleJWKS(), {
    audience,
    issuer: ["https://accounts.google.com", "accounts.google.com"],
  });

  return { sub: payload.sub, email: payload.email, name: payload.name || "" };
}

async function readBody(req) {
  // v4 HttpRequest has json()
  if (req && typeof req.json === "function") {
    try {
      const j = await req.json();
      return j && typeof j === "object" ? j : {};
    } catch {
      return {};
    }
  }

  // classic: req.body already parsed
  if (req && typeof req === "object" && req.body && typeof req.body === "object") return req.body;
  if (req && typeof req.rawBody === "string") {
    try { return JSON.parse(req.rawBody); } catch { return {}; }
  }

  return {};
}

// ------------------------
// MAIN HANDLER
// Works for BOTH:
// - v4: (request, context) => MUST return response object
// - classic: (context, req) => MUST set context.res
// ------------------------
async function handler(arg1, arg2) {
  const VERSION = "authExchange-v4-fixed";

  const classic = isClassicContext(arg1) ? { context: arg1, req: arg2 } : null;
  const modern = !classic ? { req: arg1, context: arg2 } : null;

  const context = classic?.context || modern?.context || null;
  const req = classic?.req || modern?.req || null;

  const reply = (status, obj) => {
    if (classic?.context) {
      setClassicResponse(classic.context, status, obj);
      return; // classic returns undefined intentionally
    }
    // v4 MUST return a value
    return { status, headers: withCommonHeaders(), body: jsonString(obj) };
  };

  try {
    const method = String(req?.method || "").toUpperCase();

    if (method === "OPTIONS") {
      return reply(200, { ok: true, version: VERSION });
    }

    const required = ["COSMOS_CONNECTION_STRING", "COSMOS_DB_NAME", "APP_JWT_SECRET"];
    for (const k of required) {
      if (!process.env[k]) {
        return reply(500, { ok: false, version: VERSION, error: `Missing env var: ${k}` });
      }
    }

    const body = await readBody(req);

    const provider = String(body?.provider || "").toLowerCase().trim();
    const providerId = String(body?.providerId || "").trim();
    const email = String(body?.email || "").trim() || null;
    const name = String(body?.name || "").trim() || null;
    const idToken = String(body?.idToken || "").trim();

    if (!provider) {
      return reply(400, { ok: false, version: VERSION, error: "Missing provider" });
    }

    const cosmos = getCosmosClient();

    let info;
    if (idToken) {
      if (provider === "microsoft") info = await verifyMicrosoftIdToken(idToken);
      else if (provider === "google") info = await verifyGoogleIdToken(idToken);
      else return reply(400, { ok: false, version: VERSION, error: "Invalid provider (google|microsoft)" });
    } else {
      if (!providerId) {
        return reply(400, { ok: false, version: VERSION, error: "Missing providerId (or send idToken)" });
      }
      info = { sub: providerId, email, name };
    }

    const user = await upsertUser(cosmos, {
      provider,
      sub: info.sub,
      email: info.email,
      name: info.name,
    });

    const appToken = signAppToken(user);

    return reply(200, {
      ok: true,
      version: VERSION,
      token: appToken,
      appToken,
      user: { id: user.userId, email: user.email, provider: user.provider, name: user.name },
    });
  } catch (e) {
    try { context?.log?.("authExchange error:", e); } catch {}
    return reply(500, { ok: false, version: VERSION, error: e?.message || "Auth exchange failed" });
  }
}

module.exports = handler;
module.exports.authExchange = handler;
