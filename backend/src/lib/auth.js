const jwt = require("jsonwebtoken");

function readHeader(req, name) {
  const lower = name.toLowerCase();
  const h = req?.headers;

  if (!h) return "";

  // Azure Functions sometimes provides Headers-like object
  if (typeof h.get === "function") {
    return h.get(name) || h.get(lower) || "";
  }

  // Plain object fallback
  return h[name] || h[lower] || "";
}

function requireAuth(req) {
  const raw = readHeader(req, "Authorization");
  if (!raw) {
    throw new Error("Missing Authorization header");
  }

  const token = raw.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    throw new Error("Missing bearer token");
  }

  const secret = process.env.APP_JWT_SECRET;
  if (!secret) {
    throw new Error("Missing APP_JWT_SECRET");
  }

  let payload;
  try {
    payload = jwt.verify(token, secret, {
      algorithms: ["HS256"],
      // ❌ DO NOT validate issuer/audience — you are not using APP_URL
    });
  } catch (e) {
    throw new Error(`JWT verification failed: ${e.message}`);
  }

  // ✅ ACCEPT ALL VALID USER ID CLAIMS
  const userId =
    payload.userId ||
    payload.id ||
    payload.uid ||
    payload.sub;

  if (!userId) {
    throw new Error("Token missing user identifier");
  }

  return {
    userId,
    email: payload.email || null,
    claims: payload,
  };
}


module.exports = { requireAuth };
