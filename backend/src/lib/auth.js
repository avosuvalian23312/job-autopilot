// src/lib/auth.js
"use strict";

const { getSwaUserId } = require("./swaUser");

function requireUser(request) {
  const u = getSwaUserId(request);
  if (!u?.userId) {
    return { ok: false, response: { status: 401, body: "Not authenticated" } };
  }
  return { ok: true, user: u };
}

module.exports = { requireUser };
