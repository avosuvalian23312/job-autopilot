// src/lib/auth.js
const jwt = require("jsonwebtoken");

function readHeader(req, name) {
  try {
    // Functions v4: req.headers is a Headers-like object with get()
    if (req?.headers && typeof req.headers.get === "function") {
      return req.headers.get(name) || req.headers.get(name.toLowerCase()) || null;
    }
  } catch {}

  try {
    // Fallback: plain object
    const h = req?.headers || {};
    return h[name] || h[name.toLowerCase()] || null;
  } catch {}

  return null;
}

function getBearerToken(req) {
  const raw = readHeader(req, "Authorization");
  if (!raw) return null;

  const m = String(raw).match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function requireAuth(req) {
  const token = getBearerToken(req);
  if (!token) {
    throw new Error("Unauthorized: missing bearer token");
  }

  const secret = process.env.APP_JWT_SECRET;
  if (!secret) {
    throw new Error("Server misconfigured: missing APP_JWT_SECRET");
  }

  let decoded;
  try {
    decoded = jwt.verify(token, secret);
  } catch {
    throw new Error("Unauthorized: invalid token");
  }

  const userId = decoded.userId || decoded.uid || null;
  if (!userId) throw new Error("Unauthorized (missing userId)");

  return {
    userId,
    uid: userId,
    email: decoded.email || null,
    provider: decoded.provider || null,
  };
}

module.exports = { requireAuth };
