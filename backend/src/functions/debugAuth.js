"use strict";

const { getHeader, parseClientPrincipal } = require("../lib/swaUser");

async function debugAuth(request, context) {
  const hasPrincipal = !!getHeader(request, "x-ms-client-principal");
  const hasIdToken = !!getHeader(request, "x-ms-token-aad-id-token");
  const hasAccessToken = !!getHeader(request, "x-ms-token-aad-access-token");

  const principal = parseClientPrincipal(request);

  return {
    status: 200,
    headers: { "Content-Type": "application/json" },
    jsonBody: {
      ok: true,
      hasClientPrincipal: hasPrincipal,
      hasAadIdToken: hasIdToken,
      hasAadAccessToken: hasAccessToken,
      principalPreview: principal
        ? {
            identityProvider: principal.identityProvider,
            userId: principal.userId,
            userDetails: principal.userDetails,
            // don't dump claims unless you need them
            claimsCount: Array.isArray(principal.claims) ? principal.claims.length : 0,
          }
        : null,
    },
  };
}

module.exports = { debugAuth };
