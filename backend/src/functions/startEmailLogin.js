const sgMail = require("@sendgrid/mail");
const crypto = require("crypto");
const { CosmosClient } = require("@azure/cosmos");

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

/**
 * Parse AccountEndpoint + AccountKey from COSMOS_CONNECTION_STRING
 * Works on ALL @azure/cosmos versions
 */
function parseCosmosConnectionString(connStr) {
  if (!connStr) throw new Error("Missing COSMOS_CONNECTION_STRING");

  const parts = connStr.split(";").reduce((acc, part) => {
    const [key, value] = part.split("=");
    if (key && value) acc[key] = value;
    return acc;
  }, {});

  if (!parts.AccountEndpoint || !parts.AccountKey) {
    throw new Error("Invalid COSMOS_CONNECTION_STRING format");
  }

  return {
    endpoint: parts.AccountEndpoint,
    key: parts.AccountKey,
  };
}

const { endpoint, key } = parseCosmosConnectionString(
  process.env.COSMOS_CONNECTION_STRING
);

// ✅ UNIVERSAL Cosmos client (no SDK version issues)
const client = new CosmosClient({ endpoint, key });

const container = client
  .database(process.env.COSMOS_DB_NAME || "jobautopilot")
  .container(process.env.EMAIL_OTPS_CONTAINER_NAME || "email_otps");

module.exports.startEmailLogin = async (req, context) => {
  const email = String(req.body?.email || "").toLowerCase().trim();
  if (!email) {
    return { status: 400, jsonBody: { ok: false, error: "Email required" } };
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const hash = crypto.createHash("sha256").update(code).digest("hex");

  await container.items.upsert({
    id: email,
    email,
    hash,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });

  await sgMail.send({
    to: email,
    from: process.env.EMAIL_FROM,
    subject: "Your Job Autopilot login code",
    text: `Your login code is ${code}. It expires in 10 minutes.`,
  });

  return { status: 200, jsonBody: { ok: true } };
};
