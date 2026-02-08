const sgMail = require("@sendgrid/mail");
const crypto = require("crypto");
const { CosmosClient } = require("@azure/cosmos");

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const client = new CosmosClient({
  endpoint: process.env.COSMOS_ENDPOINT,
  key: process.env.COSMOS_KEY
});

const container = client
  .database("jobautopilot")
  .container("email_otps");

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
    expiresAt: Date.now() + 10 * 60 * 1000
  });

  await sgMail.send({
    to: email,
    from: process.env.EMAIL_FROM,
    subject: "Your Job Autopilot login code",
    text: `Your login code is ${code}. It expires in 10 minutes.`
  });

  return { status: 200, jsonBody: { ok: true } };
};
