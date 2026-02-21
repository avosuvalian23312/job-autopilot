"use strict";

const jwt = require("jsonwebtoken");
const {
  getHeader,
  getCookie,
  getAppTokenFromRequest,
  parseClientPrincipal,
} = require("../lib/swaUser");

async function debugAuth(request, context) {
  const hasPrincipal = !!getHeader(request, "x-ms-client-principal");
  const hasIdToken = !!getHeader(request, "x-ms-token-aad-id-token");
  const hasAccessToken = !!getHeader(request, "x-ms-token-aad-access-token");
  const hasAuthorization = !!getHeader(request, "authorization");
  const hasXAppToken = !!getHeader(request, "x-app-token");
  const hasAppTokenCookie = !!getCookie(request, "jobautopilot_app_token");
  const token = getAppTokenFromRequest(request);
  const hasParsedAppToken = !!token;

  const principal = parseClientPrincipal(request);
  let tokenDebug = null;

  if (token) {
    const decoded = jwt.decode(token, { complete: true });
    const payload = decoded?.payload || {};
    const secret = process.env.APP_JWT_SECRET;
    let verifyOk = false;
    let verifyError = null;
    try {
      if (!secret) throw new Error("Missing APP_JWT_SECRET");
      jwt.verify(token, secret);
      verifyOk = true;
    } catch (e) {
      verifyError = e?.message || "verify_failed";
    }

    tokenDebug = {
      verifyOk,
      verifyError,
      hasUserId: !!(payload?.userId || payload?.uid || payload?.sub),
      typ: payload?.typ || null,
      provider: payload?.provider || null,
      hasEmail: !!payload?.email,
      payloadKeys: Object.keys(payload || {}),
    };
  }

  return {
    status: 200,
    headers: { "Content-Type": "application/json" },
    jsonBody: {
      ok: true,
      hasClientPrincipal: hasPrincipal,
      hasAadIdToken: hasIdToken,
      hasAadAccessToken: hasAccessToken,
      hasAuthorization,
      hasXAppToken,
      hasAppTokenCookie,
      hasParsedAppToken,
      tokenDebug,
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
