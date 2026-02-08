const jwt = require("jsonwebtoken");

function getBearerToken(req) {
  const h =
    (req?.headers?.get && req.headers.get("authorization")) ||
    req?.headers?.authorization ||
    req?.headers?.Authorization ||
    "";
  const s = String(h);
  if (!s.toLowerCase().startsWith("bearer ")) return null;
  return s.slice(7).trim();
}

function requireAuth(req) {
  const secret = process.env.APP_JWT_SECRET;
  if (!secret) {
    return { ok: false, status: 500, error: "Missing env var: APP_JWT_SECRET" };
  }

  const token = getBearerToken(req);
  if (!token) {
    return { ok: false, status: 401, error: "Missing Authorization: Bearer <token>" };
  }

  try {
    const payload = jwt.verify(token, secret);
    // payload.uid should be like "google:..." or "microsoft:..."
    if (!payload?.uid) {
      return { ok: false, status: 401, error: "Invalid token payload" };
    }
    return { ok: true, userId: payload.uid, payload };
  } catch (e) {
    return { ok: false, status: 401, error: "Invalid or expired token" };
  }
}

module.exports = { requireAuth };
