// src/lib/swaUser.js
function getSwaUser(request) {
  const header =
    request.headers.get("x-ms-client-principal") ||
    request.headers.get("X-MS-CLIENT-PRINCIPAL");

  if (!header) return null;

  try {
    const decoded = Buffer.from(header, "base64").toString("utf8");
    const principal = JSON.parse(decoded);
    if (!principal?.userId) return null;

    const email =
      principal.claims?.find((c) => c.typ === "emails")?.val ||
      principal.userDetails ||
      "";

    return { userId: principal.userId, email };
  } catch {
    return null;
  }
}

module.exports = { getSwaUser };
