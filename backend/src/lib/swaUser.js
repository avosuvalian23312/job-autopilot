// backend/src/lib/swaUser.js
"use strict";

function getHeader(request, name) {
  // Functions v4 Request headers is usually a Fetch Headers object
  if (request?.headers?.get) return request.headers.get(name);

  // fallback if headers is a plain object (some setups)
  const key = Object.keys(request?.headers || {}).find(
    (k) => k.toLowerCase() === name.toLowerCase()
  );
  return key ? request.headers[key] : undefined;
}

function parseClientPrincipal(request) {
  const encoded = getHeader(request, "x-ms-client-principal");
  if (!encoded) return null;

  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

// ✅ return STRING for Cosmos PK
function getSwaUserId(request) {
  const principal = parseClientPrincipal(request);
  return principal?.userId || null;
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
  getSwaUserDetails,
  getSwaIdentityProvider,
};
