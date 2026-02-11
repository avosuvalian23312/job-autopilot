// src/lib/swaUser.js
"use strict";

function parseClientPrincipal(request) {
  // In Functions v4 code-first, request.headers.get(...) is available
  const encoded = request?.headers?.get?.("x-ms-client-principal");
  if (!encoded) return null;

  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function getSwaUserId(request) {
  const principal = parseClientPrincipal(request);

  // SWA provides these fields commonly:
  const userId = principal?.userId;
  const identityProvider = principal?.identityProvider;

  if (!userId) return null;

  return {
    userId,
    identityProvider: identityProvider || "unknown",
    principal,
  };
}

module.exports = { getSwaUserId };
