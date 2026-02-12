"use strict";

const sgMail = require("@sendgrid/mail");

function isConfigured() {
  return Boolean(process.env.SENDGRID_API_KEY && process.env.SUPPORT_TO_EMAIL && process.env.SUPPORT_FROM_EMAIL);
}

async function sendSupportEmail({ subject, text }) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const to = process.env.SUPPORT_TO_EMAIL;
  const from = process.env.SUPPORT_FROM_EMAIL;

  if (!apiKey || !to || !from) {
    throw new Error("Email not configured. Set SENDGRID_API_KEY, SUPPORT_TO_EMAIL, SUPPORT_FROM_EMAIL.");
  }

  sgMail.setApiKey(apiKey);

  await sgMail.send({
    to,
    from,
    subject,
    text,
  });
}

module.exports = { isConfigured, sendSupportEmail };
