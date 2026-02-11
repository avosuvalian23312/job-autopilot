// backend/src/lib/swaUser.js
"use strict";

function getHeader(req, name) {
  // Azure Functions request headers can be a Headers instance OR a plain object
  const h = req?.headers;
  if (!h) return null;

  if (typeof h.get === "function") return h.get(name) || h.get(name.toLowerCase()) || null;

  return h[name] || h[name.toLowerCase()] || null;
}

function getClientPrincipal(req) {
  const encoded = getHeader(req, "x-ms-client-principal");
  if (!encoded) return null;

  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

// ✅ Return STRING userId only
function getSwaUserId(req) {
  const cp = getClientPrincipal(req);
  return typeof cp?.userId === "string" && cp.userId.trim() ? cp.userId : null;
}

// (optional) if you want email too
function getSwaUserEmail(req) {
  const cp = getClientPrincipal(req);
  return typeof cp?.userDetails === "string" ? cp.userDetails : null;
}

module.exports = { getSwaUserId, getSwaUserEmail };
