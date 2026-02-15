"use strict";

const Stripe = require("stripe");
const { markEventOnce, setPlan, grantCredits } = require("../lib/billingStore.cjs");

function json(status, body) {
  return {
    status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

module.exports = async (request, context) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return json(500, { ok: false, error: "Missing STRIPE_SECRET_KEY" });
    }
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      return json(500, { ok: false, error: "Missing STRIPE_WEBHOOK_SECRET" });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20",
    });

    const sig = request.headers.get("stripe-signature");
    if (!sig) return json(400, { ok: false, error: "Missing stripe-signature" });

    // ✅ IMPORTANT: use raw bytes (not parsed JSON)
    const rawBody = Buffer.from(await request.arrayBuffer());

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      return json(400, { ok: false, error: "Webhook signature verification failed" });
    }

    // --- helper: idempotency (allow arbitrary keys, not only event.id) ---
    async function once(userId, key) {
      if (!userId || !key) return false;
      return markEventOnce(userId, String(key));
    }

    // 1) Checkout completed: activate plan + store Stripe IDs.
    // 🚫 Do NOT grant credits here (invoice.paid will handle it).
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const userId = session?.metadata?.userId || null;
      const planId = session?.metadata?.planId || null;

      if (!userId) return json(200, { ok: true, ignored: true });

      // idempotency for this session
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

    // 2) invoice.paid: grant monthly credits (covers initial + renewals)
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

      // ✅ idempotency per invoice (prevents double grants)
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

    // 3) Subscription canceled: downgrade to free
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
