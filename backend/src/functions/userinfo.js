module.exports = async (request, context) => {
  if (request.method === "OPTIONS") {
    return { status: 204, headers: cors() };
  }

  const user = getSwaUser(request);
  if (!user) {
    return json(401, { ok: false, error: "Not authenticated" });
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

function getSwaUser(request) {
  const header =
    request.headers.get("x-ms-client-principal") ||
    request.headers.get("X-MS-CLIENT-PRINCIPAL");
  if (!header) return null;

  try {
    const decoded = Buffer.from(header, "base64").toString("utf8");
    const principal = JSON.parse(decoded);

    // principal.userId exists when logged in via SWA auth
    return {
      userId: principal.userId || null,
      email:
        principal.userDetails ||
        principal.claims?.find((c) => c.typ === "emails")?.val ||
        null,
      provider: principal.identityProvider || null,
    };
  } catch {
    return null;
  }
}

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
