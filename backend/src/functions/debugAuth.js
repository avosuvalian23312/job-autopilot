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
  const xAppToken = String(getHeader(request, "x-app-token") || "").trim();
  const appTokenCookie = String(getCookie(request, "jobautopilot_app_token") || "").trim();
  const authHeader = String(getHeader(request, "authorization") || "").trim();
  const authBearer = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
  const hasXAppToken = !!xAppToken;
  const hasAppTokenCookie = !!appTokenCookie;
  const token = getAppTokenFromRequest(request);
  const hasParsedAppToken = !!token;

  const principal = parseClientPrincipal(request);
  let tokenDebug = null;

  if (token) {
    const secret = process.env.APP_JWT_SECRET;
    const candidates = [
      { source: "x-app-token", value: xAppToken },
      { source: "cookie", value: appTokenCookie },
      { source: "authorization-bearer", value: authBearer },
    ].filter((x) => !!x.value);

    const checks = candidates.map((item) => {
      const decoded = jwt.decode(item.value, { complete: true });
      const payload = decoded?.payload || {};
      let verifyOk = false;
      let verifyError = null;
      try {
        if (!secret) throw new Error("Missing APP_JWT_SECRET");
        jwt.verify(item.value, secret);
        verifyOk = true;
      } catch (e) {
        verifyError = e?.message || "verify_failed";
      }
      return {
        source: item.source,
        verifyOk,
        verifyError,
        hasUserId: !!(payload?.userId || payload?.uid || payload?.sub),
        typ: payload?.typ || null,
        provider: payload?.provider || null,
        hasEmail: !!payload?.email,
        payloadKeys: Object.keys(payload || {}),
      };
    });

    const primary = checks[0] || null;
    tokenDebug = {
      primary,
      checks,
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
