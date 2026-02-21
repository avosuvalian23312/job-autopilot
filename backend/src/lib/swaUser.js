// backend/src/lib/swaUser.js
"use strict";

const jwt = require("jsonwebtoken");

function getHeader(request, name) {
  // Functions v4 Request headers is usually a Fetch Headers object
  if (request?.headers?.get) return request.headers.get(name);

  // fallback if headers is a plain object (some setups)
  const key = Object.keys(request?.headers || {}).find(
    (k) => k.toLowerCase() === name.toLowerCase()
  );
  return key ? request.headers[key] : undefined;
}

function parseBearerPrincipal(request) {
  const auth = getHeader(request, "authorization");
  if (!auth) return null;

  const match = String(auth).match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const secret = process.env.APP_JWT_SECRET;
  if (!secret) return null;

  try {
    const payload = jwt.verify(match[1], secret);
    const userId =
      payload?.userId || payload?.uid || payload?.sub || null;
    if (!userId) return null;

    const email = String(payload?.email || "").trim() || null;
    const provider = String(payload?.provider || "email").trim() || "email";

    return {
      userId: String(userId),
      userDetails: email || String(userId),
      identityProvider: provider,
      claims: email ? [{ typ: "emails", val: email }] : [],
    };
  } catch {
    return null;
  }
}

function parseClientPrincipal(request) {
  const encoded = getHeader(request, "x-ms-client-principal");
  if (encoded) {
    try {
      const decoded = Buffer.from(encoded, "base64").toString("utf8");
      const parsed = JSON.parse(decoded);
      if (parsed?.userId) return parsed;
    } catch {
      // ignore
    }
  }

  return parseBearerPrincipal(request);
}

// ✅ return STRING for Cosmos PK
function getSwaUserId(request) {
  const principal = parseClientPrincipal(request);
  return principal?.userId || null;
}

function getAuthenticatedUser(request) {
  const principal = parseClientPrincipal(request);
  if (!principal?.userId) return null;

  const email =
    principal?.userDetails ||
    principal?.claims?.find((c) => c.typ === "emails")?.val ||
    null;

  return {
    userId: principal.userId,
    email,
    provider: principal.identityProvider || "unknown",
    principal,
  };
}

// Optional helpers
function getSwaUserDetails(request) {
  const principal = parseClientPrincipal(request);
  return principal?.userDetails || null;
}

function getSwaIdentityProvider(request) {
  const principal = parseClientPrincipal(request);
  return principal?.identityProvider || "unknown";
}

module.exports = {
  getHeader,
  parseClientPrincipal,
  getSwaUserId,
  getAuthenticatedUser,
  getSwaUserDetails,
  getSwaIdentityProvider,
};
