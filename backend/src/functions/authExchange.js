const { CosmosClient } = require("@azure/cosmos");
const jwt = require("jsonwebtoken");
const { createRemoteJWKSet, jwtVerify } = require("jose");

const COSMOS_DB = process.env.COSMOS_DB_NAME;
const USERS_CONTAINER = process.env.USERS_CONTAINER_NAME || "users";

const cosmos = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);

// Remote JWKS (cached by jose internally)
const microsoftJWKS = createRemoteJWKSet(
  new URL("https://login.microsoftonline.com/common/discovery/v2.0/keys")
);
const googleJWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs")
);

function bad(status, msg) {
  return { status, jsonBody: { ok: false, error: msg } };
}

async function upsertUser({ provider, sub, email, name }) {
  const db = cosmos.database(COSMOS_DB);
  const users = db.container(USERS_CONTAINER);

  // User id stable per provider (later you can merge accounts by email)
  const userId = `${provider}:${sub}`;

  const doc = {
    id: userId,                 // partition key /id recommended
    userId,
    provider,
    providerSub: sub,
    email: email || null,
    name: name || null,
    updatedAt: Date.now()
  };

  // Upsert
  await users.items.upsert(doc);
  return doc;
}

function signAppToken(user) {
  // 7-day token
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

async function verifyMicrosoftIdToken(idToken) {
  // Aud must be your Entra client id
  const audience = process.env.ENTRA_CLIENT_ID || process.env.VITE_B2C_CLIENT_ID; // fallback if you use env
  if (!audience) throw new Error("Missing ENTRA_CLIENT_ID env var on backend (set it to your Entra client id).");

  const { payload } = await jwtVerify(idToken, microsoftJWKS, {
    audience,
    // issuer varies by tenant; allow v2 issuer pattern
    issuer: undefined
  });

  // personal accounts can come with email in different claims
  const email =
    payload.email ||
    payload.preferred_username ||
    (Array.isArray(payload.emails) ? payload.emails[0] : undefined);

  return {
    sub: payload.sub,
    email,
    name: payload.name || "",
    tid: payload.tid || ""
  };
}

async function verifyGoogleIdToken(idToken) {
  const audience = process.env.GOOGLE_CLIENT_ID;
  if (!audience) throw new Error("Missing GOOGLE_CLIENT_ID env var on backend.");

  const { payload } = await jwtVerify(idToken, googleJWKS, {
    audience,
    issuer: ["https://accounts.google.com", "accounts.google.com"]
  });

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name || ""
  };
}

module.exports.authExchange = async (req) => {
  try {
    const provider = String(req.body?.provider || "").toLowerCase().trim();
    const idToken = String(req.body?.idToken || "").trim();

    if (!provider || !idToken) return bad(400, "Missing provider or idToken");
    if (!COSMOS_DB) return bad(500, "Missing COSMOS_DB_NAME env var");
    if (!process.env.APP_JWT_SECRET) return bad(500, "Missing APP_JWT_SECRET env var");

    let info;
    if (provider === "microsoft") {
      info = await verifyMicrosoftIdToken(idToken);
    } else if (provider === "google") {
      info = await verifyGoogleIdToken(idToken);
    } else {
      return bad(400, "Invalid provider (use 'google' or 'microsoft')");
    }

    if (!info?.sub) return bad(401, "Invalid token (missing sub)");

    const user = await upsertUser({
      provider,
      sub: info.sub,
      email: info.email,
      name: info.name
    });

    const appToken = signAppToken(user);

    return {
      status: 200,
      jsonBody: {
        ok: true,
        appToken,
        user: { id: user.userId, email: user.email, provider: user.provider, name: user.name }
      }
    };
  } catch (e) {
    return bad(401, e?.message || "Auth exchange failed");
  }
};
