const { CosmosClient } = require("@azure/cosmos");
const jwt = require("jsonwebtoken");
const { createRemoteJWKSet, jwtVerify } = require("jose");

const COSMOS_DB = process.env.COSMOS_DB_NAME;
const USERS_CONTAINER = process.env.USERS_CONTAINER_NAME || "users";

// Remote JWKS (cached by jose internally) - optional if you use idToken verification
const microsoftJWKS = createRemoteJWKSet(
  new URL("https://login.microsoftonline.com/common/discovery/v2.0/keys")
);
const googleJWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

function bad(status, msg) {
  return {
    status,
    headers: { "Content-Type": "application/json" },
    jsonBody: { ok: false, error: msg }
  };
}

// ---- Cosmos connection string parsing (works with ALL @azure/cosmos versions)
function parseCosmosConnectionString(connStr) {
  if (!connStr) throw new Error("Missing COSMOS_CONNECTION_STRING");

  const parts = connStr.split(";").reduce((acc, part) => {
    const [k, ...rest] = part.split("=");
    const v = rest.join("=");
    if (k && v) acc[k] = v;
    return acc;
  }, {});

  if (!parts.AccountEndpoint || !parts.AccountKey) {
    throw new Error("Invalid COSMOS_CONNECTION_STRING format (needs AccountEndpoint and AccountKey)");
  }

  return { endpoint: parts.AccountEndpoint, key: parts.AccountKey };
}

function getCosmosClient() {
  const { endpoint, key } = parseCosmosConnectionString(process.env.COSMOS_CONNECTION_STRING);
  return new CosmosClient({ endpoint, key });
}

async function upsertUser(cosmos, { provider, sub, email, name }) {
  const db = cosmos.database(COSMOS_DB);
  const users = db.container(USERS_CONTAINER);

  // stable per provider
  const userId = `${provider}:${sub}`;

  const doc = {
    id: userId, // if your container uses /id as partition key, this is perfect
    userId,
    provider,
    providerSub: sub,
    email: email || null,
    name: name || null,
    updatedAt: Date.now()
  };

  await users.items.upsert(doc);
  return doc;
}

function signAppToken(user) {
  return jwt.sign(
    {
      uid: user.userId,
      email: user.email,
      provider: user.provider
    },
    process.env.APP_JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// ---- Optional: verify idTokens (only used if frontend sends idToken)
async function verifyMicrosoftIdToken(idToken) {
  const audience = process.env.ENTRA_CLIENT_ID;
  if (!audience) throw new Error("Missing ENTRA_CLIENT_ID env var on backend.");

  const { payload } = await jwtVerify(idToken, microsoftJWKS, {
    audience
    // issuer varies; omit strict issuer to avoid tenant issues for now
  });

  const email =
    payload.email ||
    payload.preferred_username ||
    (Array.isArray(payload.emails) ? payload.emails[0] : undefined);

  return { sub: payload.sub, email, name: payload.name || "" };
}

async function verifyGoogleIdToken(idToken) {
  const audience = process.env.GOOGLE_CLIENT_ID;
  if (!audience) throw new Error("Missing GOOGLE_CLIENT_ID env var on backend.");

  const { payload } = await jwtVerify(idToken, googleJWKS, {
    audience,
    issuer: ["https://accounts.google.com", "accounts.google.com"]
  });

  return { sub: payload.sub, email: payload.email, name: payload.name || "" };
}

module.exports.authExchange = async (req, context) => {
  try {
    // ✅ Force visibility into missing production settings
    const required = ["COSMOS_CONNECTION_STRING", "COSMOS_DB_NAME", "APP_JWT_SECRET"];
    for (const k of required) {
      if (!process.env[k]) return bad(500, `Missing env var: ${k}`);
    }

    const provider = String(req.body?.provider || "").toLowerCase().trim();

    // Two supported input modes:
    // A) SWA / client-side exchange: provider + providerId (+ email/name)
    const providerId = String(req.body?.providerId || "").trim();
    const email = String(req.body?.email || "").trim() || null;
    const name = String(req.body?.name || "").trim() || null;

    // B) Token verification mode: provider + idToken (optional)
    const idToken = String(req.body?.idToken || "").trim();

    if (!provider) return bad(400, "Missing provider");

    // Create cosmos client (safe for all SDK versions)
    const cosmos = getCosmosClient();

    let info = null;

    if (idToken) {
      // If you choose to send idToken later, we can verify it here
      if (provider === "microsoft") info = await verifyMicrosoftIdToken(idToken);
      else if (provider === "google") info = await verifyGoogleIdToken(idToken);
      else return bad(400, "Invalid provider (use 'google' or 'microsoft')");
    } else {
      // Current frontend path (what you’re doing now)
      if (!providerId) return bad(400, "Missing providerId (or send idToken)");
      info = { sub: providerId, email, name };
    }

    if (!COSMOS_DB) return bad(500, "Missing COSMOS_DB_NAME env var");
    if (!process.env.APP_JWT_SECRET) return bad(500, "Missing APP_JWT_SECRET env var");
    if (!info?.sub) return bad(401, "Invalid auth info (missing sub/providerId)");

    const user = await upsertUser(cosmos, {
      provider,
      sub: info.sub,
      email: info.email,
      name: info.name
    });

    const appToken = signAppToken(user);

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      jsonBody: {
        ok: true,
        appToken,
        user: { id: user.userId, email: user.email, provider: user.provider, name: user.name }
      }
    };
  } catch (e) {
    // ✅ IMPORTANT: return JSON so the browser shows the real error
    context?.log?.("authExchange error:", e);
    return bad(500, e?.message || "Auth exchange failed");
  }
};
