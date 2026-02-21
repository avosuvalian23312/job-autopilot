"use strict";

const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const sendgrid = require("@sendgrid/mail");
const { CosmosClient } = require("@azure/cosmos");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
}

function json(status, body) {
  return {
    status,
    headers: cors(),
    body: JSON.stringify(body),
  };
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
  return EMAIL_RE.test(normalizeEmail(value));
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashCode(email, code, secret) {
  return crypto
    .createHash("sha256")
    .update(`${normalizeEmail(email)}|${String(code)}|${String(secret)}`, "utf8")
    .digest("hex");
}

function maskEmail(email) {
  const raw = normalizeEmail(email);
  const at = raw.indexOf("@");
  if (at <= 1) return raw;
  const local = raw.slice(0, at);
  const domain = raw.slice(at + 1);
  return `${local[0]}***@${domain}`;
}

function signChallenge(email, code, secret) {
  return jwt.sign(
    {
      typ: "email_login_challenge",
      email: normalizeEmail(email),
      codeHash: hashCode(email, code, secret),
    },
    secret,
    { expiresIn: "12m" }
  );
}

function verifyChallenge(challengeToken, secret) {
  const payload = jwt.verify(String(challengeToken || ""), secret);
  if (payload?.typ !== "email_login_challenge") {
    throw new Error("Invalid challenge token type");
  }
  return payload;
}

function parseCosmosConnectionString(connStr) {
  if (!connStr) throw new Error("Missing COSMOS_CONNECTION_STRING");

  const parts = connStr.split(";").reduce((acc, part) => {
    const [k, ...rest] = part.split("=");
    const v = rest.join("=");
    if (k && v) acc[k] = v;
    return acc;
  }, {});

  if (!parts.AccountEndpoint || !parts.AccountKey) {
    throw new Error(
      "Invalid COSMOS_CONNECTION_STRING (needs AccountEndpoint and AccountKey)"
    );
  }

  return { endpoint: parts.AccountEndpoint, key: parts.AccountKey };
}

function getCosmosClient() {
  const { endpoint, key } = parseCosmosConnectionString(
    process.env.COSMOS_CONNECTION_STRING
  );
  return new CosmosClient({ endpoint, key });
}

async function upsertUser(cosmos, { email, name }) {
  const COSMOS_DB = process.env.COSMOS_DB_NAME;
  const USERS_CONTAINER = process.env.USERS_CONTAINER_NAME || "users";
  if (!COSMOS_DB) throw new Error("Missing COSMOS_DB_NAME");

  const db = cosmos.database(COSMOS_DB);
  const users = db.container(USERS_CONTAINER);

  const normalizedEmail = normalizeEmail(email);
  const userId = `email:${normalizedEmail}`;

  const doc = {
    id: userId,
    userId,
    provider: "email",
    providerSub: normalizedEmail,
    email: normalizedEmail,
    name: name || normalizedEmail.split("@")[0] || null,
    updatedAt: Date.now(),
  };

  await users.items.upsert(doc);
  return doc;
}

function signAppToken(user) {
  const secret = process.env.APP_JWT_SECRET;
  if (!secret) throw new Error("Missing APP_JWT_SECRET");

  return jwt.sign(
    {
      uid: user.userId,
      userId: user.userId,
      email: user.email,
      provider: user.provider || "email",
    },
    secret,
    { expiresIn: "7d" }
  );
}

async function sendCodeEmail({ to, code, context }) {
  const apiKey = process.env.SENDGRID_API_KEY || "";
  const from = process.env.SENDGRID_FROM_EMAIL || "";

  if (!apiKey || !from) {
    const allowNoEmail = String(process.env.EMAIL_LOGIN_ALLOW_NO_EMAIL || "")
      .trim()
      .toLowerCase();
    if (allowNoEmail === "1" || allowNoEmail === "true") {
      context?.log?.(`EMAIL LOGIN CODE for ${to}: ${code}`);
      return;
    }
    throw new Error(
      "Email login is not configured. Set SENDGRID_API_KEY and SENDGRID_FROM_EMAIL."
    );
  }

  sendgrid.setApiKey(apiKey);
  await sendgrid.send({
    to,
    from,
    subject: "Your Job Autopilot sign-in code",
    text: `Your sign-in code is ${code}. It expires in 12 minutes.`,
    html: `<p>Your sign-in code is <strong>${code}</strong>.</p><p>It expires in 12 minutes.</p>`,
  });
}

module.exports = async function verifyEmailLogin(request, context) {
  try {
    if (request.method === "OPTIONS") return { status: 204, headers: cors() };
    if (String(request.method || "").toUpperCase() !== "POST") {
      return json(405, { ok: false, error: "Method not allowed" });
    }

    const secret = process.env.APP_JWT_SECRET;
    if (!secret) {
      return json(500, { ok: false, error: "Missing APP_JWT_SECRET" });
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "").trim().toLowerCase();
    const email = normalizeEmail(body?.email);

    if (!action) return json(400, { ok: false, error: "Missing action" });
    if (!isValidEmail(email)) {
      return json(400, { ok: false, error: "Valid email is required" });
    }

    if (action === "send_code") {
      const code = generateCode();
      const challengeToken = signChallenge(email, code, secret);
      await sendCodeEmail({ to: email, code, context });

      const includeDebugCode =
        String(process.env.EMAIL_LOGIN_DEBUG_CODES || "").trim() === "1";

      return json(200, {
        ok: true,
        sent: true,
        maskedEmail: maskEmail(email),
        challengeToken,
        ...(includeDebugCode ? { debugCode: code } : {}),
      });
    }

    if (action === "verify_code") {
      const challengeToken = String(body?.challengeToken || "").trim();
      const code = String(body?.code || "").trim();
      if (!challengeToken || !code) {
        return json(400, { ok: false, error: "Missing code or challenge token" });
      }

      let challenge;
      try {
        challenge = verifyChallenge(challengeToken, secret);
      } catch {
        return json(400, { ok: false, error: "Invalid or expired challenge token" });
      }

      if (normalizeEmail(challenge?.email) !== email) {
        return json(400, { ok: false, error: "Email mismatch for challenge" });
      }

      const submittedHash = hashCode(email, code, secret);
      if (submittedHash !== challenge?.codeHash) {
        return json(401, { ok: false, error: "Invalid verification code" });
      }

      const cosmos = getCosmosClient();
      const user = await upsertUser(cosmos, { email });
      const appToken = signAppToken(user);

      return json(200, {
        ok: true,
        token: appToken,
        appToken,
        user: {
          userId: user.userId,
          email: user.email,
          provider: "email",
          name: user.name || null,
        },
      });
    }

    return json(400, { ok: false, error: "Unknown action" });
  } catch (err) {
    context?.log?.error?.("verifyEmailLogin error", err);
    return json(500, {
      ok: false,
      error: err?.message || "Email login failed",
    });
  }
};

module.exports.verifyEmailLogin = module.exports;
