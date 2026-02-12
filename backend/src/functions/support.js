"use strict";

const { json, noContent, readJson } = require("../lib/http");
const { requireUser } = require("../lib/swaAuth");
const { getContainer } = require("../lib/cosmosClient");
const { isConfigured, sendSupportEmail } = require("../lib/sendEmail");
const crypto = require("crypto");

const SUPPORT_CONTAINER = process.env.COSMOS_CONTAINER_SUPPORT || "supportTickets";

module.exports = async function supportHandler(request, context) {
  if (request.method === "OPTIONS") return noContent();

  const user = requireUser(request);
  if (!user) return json(401, { ok: false, error: "Unauthorized" });

  if (request.method !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  const body = await readJson(request);
  const message = String(body?.message || "").trim();
  const subject = String(body?.subject || "Support request").trim();

  if (!message) {
    return json(400, { ok: false, error: "Message is required" });
  }

  const ticketId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  // 1) Store ticket in Cosmos (always)
  try {
    const container = getContainer(SUPPORT_CONTAINER);

    await container.items.create(
      {
        id: ticketId,
        userId: user.userId,
        userEmail: user.email || "",
        subject,
        message,
        createdAt,
        status: "open",
      },
      { partitionKey: user.userId }
    );
  } catch (e) {
    context?.log?.error("support ticket store error:", e);
    return json(500, { ok: false, error: "Failed to create support ticket" });
  }

  // 2) Send email (best effort; if not configured, still return ok + ticketId)
  try {
    if (isConfigured()) {
      const emailText =
        `New support request\n\n` +
        `Ticket: ${ticketId}\n` +
        `UserId: ${user.userId}\n` +
        `User: ${user.email || "(unknown)"}\n` +
        `Provider: ${user.identityProvider || "(unknown)"}\n\n` +
        `Subject: ${subject}\n\n` +
        `Message:\n${message}\n`;

      await sendSupportEmail({
        subject: `Job Autopilot Support — ${subject} (${ticketId})`,
        text: emailText,
      });
    }
  } catch (e) {
    // Don’t fail the user if email fails; ticket is stored
    context?.log?.error("support email error:", e);
  }

  return json(200, { ok: true, ticketId });
};
