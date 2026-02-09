// src/lib/auth.js
const jwt = require("jsonwebtoken");

function getBearerToken(req) {
  const h =
    (req.headers && (req.headers.authorization || req.headers.Authorization)) ||
    "";
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function requireAuth(req) {
  const token = getBearerToken(req);
  if (!token) throw new Error("Unauthorized: missing bearer token");

  const secret = process.env.APP_JWT_SECRET;
  if (!secret) throw new Error("Server misconfigured: missing APP_JWT_SECRET");

  let decoded;
  try {
    decoded = jwt.verify(token, secret);
  } catch (e) {
    throw new Error("Unauthorized: invalid token");
  }

  const userId = decoded.userId || decoded.uid || decoded.sub || null;

  if (!userId) {
    // This is the exact error you’re seeing
    throw new Error("Unauthorized (missing userId)");
  }

  return {
    userId,
    uid: userId,
    email: decoded.email || null,
    provider: decoded.provider || null,
    decoded, // optional debug
  };
}

module.exports = { requireAuth };
