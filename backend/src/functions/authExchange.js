const { CosmosClient } = require("@azure/cosmos");
const jwt = require("jsonwebtoken");
const { createRemoteJWKSet, jwtVerify } = require("jose");

// ------------------------
// Helpers: runtime compatibility
// ------------------------
function isContext(obj) {
  // classic model has context.log + bindings
  return !!obj && (typeof obj.log === "function" || obj.bindings);
}

function isRequest(obj) {
  // could be classic req (has body/method) or new HttpRequest (has json()/method/url)
  return !!obj && (typeof obj.method === "string" || typeof obj.json === "function" || obj.body !== undefined);
}

async function readJsonBody(req) {
  try {
    // Classic model: req.body already parsed
    if (req && typeof req === "object" && req.body && typeof req.body === "object") return req.body;

    // Some setups provide rawBody
    if (req && typeof req.rawBody === "string") {
      return JSON.parse(req.rawBody);
    }

    // New model: request.json()
    if (req && typeof req.json === "function") {
      const j = await req.json();
      return (j && typeof j === "object") ? j : {};
    }

    // New model might expose text()
    if (req && typeof req.text === "function") {
      const t = await req.text();
      return t ? JSON.parse(t) : {};
    }
  } catch (_) {
    // ignore parse error and fall through
  }
  return {};
}

function withCommonHeaders(extra = {}) {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    // CORS: SWA usually handles, but this prevents weird browser cases
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    ...extra,
  };
}

function makeResponse(status, obj) {
  return {
    status,
    headers: withCommonHeaders(),
    jsonBody: obj,
    body: JSON.stringify(obj),
  };
}

function send(context, status, obj) {
  // Classic model
  context.res = {
    status,
    headers: withCommonHeaders(),
    body: obj,
  };
}

// ------------------------
// Cosmos connection string parsing (SDK-version-safe)
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
  return jwt.sign(
    {
      uid: user.userId,
      email: user.email,
      provider: user.provider,
    },
    process.env.APP_JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// ------------------------
// Optional idToken verification (only if you send idToken)
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
  if (!audience) throw new Error("Missing ENTRA_CLIENT_ID env var on backend.");

  const { payload } = await jwtVerify(idToken, getMicrosoftJWKS(), { audience });

  const email =
    payload.email ||
    payload.preferred_username ||
    (Array.isArray(payload.emails) ? payload.emails[0] : undefined);

  return { sub: payload.sub, email, name: payload.name || "" };
}

async function verifyGoogleIdToken(idToken) {
  const audience = process.env.GOOGLE_CLIENT_ID;
  if (!audience) throw new Error("Missing GOOGLE_CLIENT_ID env var on backend.");

  const { payload } = await jwtVerify(idToken, getGoogleJWKS(), {
    audience,
    issuer: ["https://accounts.google.com", "accounts.google.com"],
  });

  return { sub: payload.sub, email: payload.email, name: payload.name || "" };
}

// ------------------------
// MAIN HANDLER (supports both Azure Functions models)
// ------------------------
module.exports.authExchange = async function handler(a, b) {
  // Detect which arg is context/request in whichever order the runtime passes
  const context = isContext(a) ? a : isContext(b) ? b : null;
  const req = isRequest(a) && !isContext(a) ? a : isRequest(b) && !isContext(b) ? b : null;

  const VERSION = "authExchange-v4-compat";

  try {
    // Handle preflight
    const method = (req?.method || "").toUpperCase();
    if (method === "OPTIONS") {
      const ok = { ok: true, version: VERSION };
      if (context) {
        send(context, 200, ok);
        return;
      }
      return makeResponse(200, ok);
    }

    // Strong env checks with visible errors (this is the #1 cause of 500s)
    const required = ["COSMOS_CONNECTION_STRING", "COSMOS_DB_NAME", "APP_JWT_SECRET"];
    for (const k of required) {
      if (!process.env[k]) {
        const out = { ok: false, version: VERSION, error: `Missing env var: ${k}` };
        if (context) {
          send(context, 500, out);
          return;
        }
        return makeResponse(500, out);
      }
    }

    const body = await readJsonBody(req);

    const provider = String(body?.provider || "").toLowerCase().trim();
    const providerId = String(body?.providerId || "").trim();
    const email = String(body?.email || "").trim() || null;
    const name = String(body?.name || "").trim() || null;
    const idToken = String(body?.idToken || "").trim();

    if (!provider) {
      const out = { ok: false, version: VERSION, error: "Missing provider" };
      if (context) {
        send(context, 400, out);
        return;
      }
      return makeResponse(400, out);
    }

    const cosmos = getCosmosClient();

    let info = null;

    if (idToken) {
      if (provider === "microsoft") info = await verifyMicrosoftIdToken(idToken);
      else if (provider === "google") info = await verifyGoogleIdToken(idToken);
      else {
        const out = { ok: false, version: VERSION, error: "Invalid provider (google|microsoft)" };
        if (context) {
          send(context, 400, out);
          return;
        }
        return makeResponse(400, out);
      }
    } else {
      if (!providerId) {
        const out = { ok: false, version: VERSION, error: "Missing providerId (or send idToken)" };
        if (context) {
          send(context, 400, out);
          return;
        }
        return makeResponse(400, out);
      }
      info = { sub: providerId, email, name };
    }

    if (!info?.sub) {
      const out = { ok: false, version: VERSION, error: "Invalid auth info (missing sub/providerId)" };
      if (context) {
        send(context, 401, out);
        return;
      }
      return makeResponse(401, out);
    }

    const user = await upsertUser(cosmos, {
      provider,
      sub: info.sub,
      email: info.email,
      name: info.name,
    });

    const appToken = signAppToken(user);

    // IMPORTANT: return BOTH names so your frontend works without changes
    const out = {
      ok: true,
      version: VERSION,
      token: appToken,
      appToken,
      user: { id: user.userId, email: user.email, provider: user.provider, name: user.name },
    };

    if (context) {
      send(context, 200, out);
      return;
    }
    return makeResponse(200, out);
  } catch (e) {
    const msg = e?.message || "Auth exchange failed";
    const out = { ok: false, version: VERSION, error: msg };

    try {
      context?.log?.("authExchange error:", e);
    } catch (_) {}

    if (context) {
      send(context, 500, out);
      return;
    }
    return makeResponse(500, out);
  }
};
