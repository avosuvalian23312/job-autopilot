// src/functions/userinfo.js
const auth = require("../lib/auth");

module.exports = async function userinfo(req, context) {
  if (req.method === "OPTIONS") {
    return { status: 204, headers: cors() };
  }

  let user;
  try {
    user = auth.requireAuth(req);
  } catch (e) {
    return json(401, { ok: false, error: e.message });
  }

  return json(200, {
    ok: true,
    user: {
      userId: user.userId,
      email: user.email,
      provider: user.provider,
    },
  });
};

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
}

function json(status, body) {
  return {
    status,
    headers: { ...cors(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
