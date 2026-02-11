"use strict";

function parseClientPrincipal(request) {
  const encoded = request?.headers?.get?.("x-ms-client-principal");
  if (!encoded) return null;

  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

// ✅ what Cosmos PK needs
function getSwaUserId(request) {
  const principal = parseClientPrincipal(request);
  return principal?.userId || null; // STRING
}

// ✅ optional helper for UI/logging
function getSwaUserDetails(request) {
  const principal = parseClientPrincipal(request);
  return principal?.userDetails || null;
}

function getSwaIdentityProvider(request) {
  const principal = parseClientPrincipal(request);
  return principal?.identityProvider || "unknown";
}

module.exports = {
  parseClientPrincipal,
  getSwaUserId,
  getSwaUserDetails,
  getSwaIdentityProvider,
};
