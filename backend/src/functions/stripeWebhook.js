"use strict";

const Stripe = require("stripe");
const { markEventOnce, setPlan, grantCredits } = require("../lib/billingStore.cjs");

function withHeaders(extra = {}) {
  return {
    "Content-Type": "application/json",
    ...extra,
  };
}

function json(status, body, extraHeaders) {
  return {
    status,
    headers: withHeaders(extraHeaders),
    body: JSON.stringify(body),
  };
}

// Azure Functions request headers can be:
// - Fetch Headers (has .get())
// - plain object
function getHeader(req, name) {
  try {
    if (req?.headers?.get) return req.headers.get(name);
  } catch {}
  const h = req?.headers || {};
  return h[name] || h[name.toLowerCase()] || null;
}

async function getRawBody(req) {
  // Preferred: exact bytes
  if (typeof req?.arrayBuffer === "function") {
    const ab = await req.arrayBuffer();
    return Buffer.from(ab);
  }

  // Some Azure setups expose rawBody
  if (req?.rawBody) {
    return Buffer.isBuffer(req.rawBody)
      ? req.rawBody
      : Buffer.from(String(req.rawBody), "utf8");
  }

  // Fallback: text (still usually ok if not transformed)
  if (typeof req?.text === "function") {
    const t = await req.text();
    return Buffer.from(t, "utf8");
  }

  return Buffer.from("");
}

module.exports = async (request, context) => {
  try {
    // Stripe will POST, not OPTIONS, but keep it safe
    if (request.method === "OPTIONS") return { status: 204, body: "" };
    if (request.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

    if (!process.env.STRIPE_SECRET_KEY) {
      return json(500, { ok: false, error: "Missing STRIPE_SECRET_KEY" });
    }
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      return json(500, { ok: false, error: "Missing STRIPE_WEBHOOK_SECRET" });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20",
    });

    const sig =
      getHeader(request, "stripe-signature") ||
      getHeader(request, "Stripe-Signature");

    if (!sig) {
      // This should ONLY happen if you hit the webhook from a browser / wrong endpoint
      return json(400, { ok: false, error: "Missing stripe-signature" });
    }

    const rawBody = await getRawBody(request);

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      context?.log?.("Webhook signature verification failed", err?.message);
      return json(400, { ok: false, error: "Webhook signature verification failed" });
    }

    async function once(userId, key) {
      if (!userId || !key) return false;
      return markEventOnce(userId, String(key));
    }

    // 1) checkout.session.completed -> activate plan + store stripe IDs
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const userId = session?.metadata?.userId || null;
      const planId = session?.metadata?.planId || null;

      if (!userId) return json(200, { ok: true, ignored: true });

      const first = await once(userId, `checkout:${session.id}`);
      if (!first) return json(200, { ok: true, duplicate: true });

      if (session.mode === "subscription") {
        await setPlan(userId, {
          planId,
          status: "active",
          stripeCustomerId: session.customer || null,
          stripeSubscriptionId: session.subscription || null,
        });
      }

      return json(200, { ok: true });
    }

    // 2) invoice.paid -> grant monthly credits (initial + renewals)
    if (event.type === "invoice.paid") {
      const invoice = event.data.object;
      const subId = invoice.subscription;

      if (!subId) return json(200, { ok: true, ignored: true });

      const subscription = await stripe.subscriptions.retrieve(subId);
      const meta = subscription?.metadata || {};

      const userId = meta.userId || null;
      const planId = meta.planId || null;
      const creditsPerMonth = Number(meta.creditsPerMonth || 0) || 0;

      if (!userId) return json(200, { ok: true, ignored: true });

      const first = await once(userId, `invoice:${invoice.id}`);
      if (!first) return json(200, { ok: true, duplicate: true });

      await setPlan(userId, {
        planId,
        status: "active",
        stripeCustomerId: subscription.customer || null,
        stripeSubscriptionId: subscription.id || null,
      });

      if (creditsPerMonth > 0) {
        await grantCredits(userId, creditsPerMonth, `sub_paid:${planId}:${invoice.id}`);
      }

      return json(200, { ok: true });
    }

    // 3) customer.subscription.deleted -> downgrade to free
    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object;
      const meta = sub?.metadata || {};
      const userId = meta.userId || null;

      if (!userId) return json(200, { ok: true, ignored: true });

      const first = await once(userId, `sub_deleted:${sub.id}`);
      if (!first) return json(200, { ok: true, duplicate: true });

      await setPlan(userId, {
        planId: "free",
        status: "canceled",
        stripeCustomerId: sub.customer || null,
        stripeSubscriptionId: sub.id || null,
      });

      return json(200, { ok: true });
    }

    return json(200, { ok: true, ignored: true, type: event.type });
  } catch (e) {
    context?.log?.error?.("stripeWebhook failed", e);
    return json(500, { ok: false, error: e?.message || String(e) });
  }
};
