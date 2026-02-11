// src/lib/auth.js
"use strict";

const { getSwaUserId } = require("./swaUser");

/**
 * Enforces SWA auth for Azure Functions.
 * - getSwaUserId(request) must return a STRING userId (or null/undefined)
 * - Returns a consistent { ok, userId, response } object
 */
function requireUser(request) {
  const userId = getSwaUserId(request); // ✅ string

  if (!userId) {
    return {
      ok: false,
      response: {
        status: 401,
        jsonBody: { ok: false, error: "Not authenticated" },
      },
    };
  }

  return { ok: true, userId };
}

/**
 * Optional helper: same as requireUser but lets you customize the error message
 */
function requireUserOr(request, message = "Not authenticated") {
  const userId = getSwaUserId(request);
  if (!userId) {
    return {
      ok: false,
      response: { status: 401, jsonBody: { ok: false, error: message } },
    };
  }
  return { ok: true, userId };
}

module.exports = { requireUser, requireUserOr };
