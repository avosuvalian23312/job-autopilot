const jwt = require("jsonwebtoken");

function readHeader(req, name) {
  const lower = name.toLowerCase();
  const h = req?.headers;

  if (!h) return "";

  if (typeof h.get === "function") {
    return h.get(name) || h.get(lower) || "";
  }

  return h[name] || h[lower] || "";
}

function requireAuth(req) {
  const raw = readHeader(req, "Authorization");
  if (!raw) throw new Error("Missing Authorization header");

  const token = raw.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("Missing bearer token");

  const secret = process.env.APP_JWT_SECRET;
  if (!secret) throw new Error("Missing APP_JWT_SECRET");

  let payload;
  try {
    payload = jwt.verify(token, secret, {
      algorithms: ["HS256"],
      // IMPORTANT: allow issuer/audience from exchange
      issuer: process.env.APP_URL,
      audience: process.env.APP_URL,
    });
  } catch (e) {
    throw new Error(`JWT verification failed: ${e.message}`);
  }

  const userId = payload.userId || payload.sub;
  if (!userId) throw new Error("Token missing userId");

  return {
    userId,
    email: payload.email,
    claims: payload,
  };
}

module.exports = { requireAuth };
