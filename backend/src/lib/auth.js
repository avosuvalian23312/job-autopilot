// src/lib/auth.js
// Static Web Apps auth: trust the platform header (no JWT secrets)

function readHeader(req, name) {
  const lower = name.toLowerCase();
  const h = req?.headers;
  if (!h) return "";

  // Azure Functions can provide a Headers-like object
  if (typeof h.get === "function") {
    return h.get(name) || h.get(lower) || "";
  }

  // Plain object fallback
  return h[name] || h[lower] || "";
}

function requireUser(req) {
  // Static Web Apps injects this after the user logs in
  const principal = readHeader(req, "x-ms-client-principal");
  if (!principal) {
    throw new Error("Not authenticated (missing x-ms-client-principal). Use /login and call through SWA.");
  }

  let decoded;
  try {
    decoded = Buffer.from(principal, "base64").toString("utf8");
  } catch {
    throw new Error("Invalid x-ms-client-principal (base64 decode failed).");
  }

  let user;
  try {
    user = JSON.parse(decoded);
  } catch {
    throw new Error("Invalid x-ms-client-principal (JSON parse failed).");
  }

  if (!user?.userId || !user?.identityProvider) {
    throw new Error("Invalid principal (missing userId/identityProvider).");
  }

  const id = `${user.identityProvider}:${user.userId}`;

  return {
    id, // stable unique key (recommended for Cosmos / paths)
    userId: user.userId,
    provider: user.identityProvider,
    email: user.userDetails || null,
    claims: user.claims || [],
    raw: user,
  };
}

module.exports = { requireUser };
