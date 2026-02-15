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
    if (!process.env.STRIPE_SECRET_KEY) return json(500, { ok: false, error: "Missing STRIPE_SECRET_KEY" });
    if (!process.env.STRIPE_WEBHOOK_SECRET) return json(500, { ok: false, error: "Missing STRIPE_WEBHOOK_SECRET" });

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

    const sig = request.headers.get("stripe-signature");
    if (!sig) return json(400, { ok: false, error: "Missing stripe-signature" });

    const raw = await request.text();
    let event;
    try {
      event = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      return json(400, { ok: false, error: "Webhook signature verification failed" });
    }

    // --- helper: idempotency per user ---
    async function once(userId) {
      if (!userId) return false;
      return markEventOnce(userId, event.id);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const userId = session?.metadata?.userId || null;
      const planId = session?.metadata?.planId || null;
      const creditsPerMonth = Number(session?.metadata?.creditsPerMonth || 0) || 0;

      if (!userId) return json(200, { ok: true, ignored: true });

      const first = await once(userId);
      if (!first) return json(200, { ok: true, duplicate: true });

      if (session.mode === "subscription") {
        await setPlan(userId, {
          planId,
          status: "active",
          stripeCustomerId: session.customer || null,
          stripeSubscriptionId: session.subscription || null,
        });

        // initial grant on first checkout
        if (creditsPerMonth > 0) {
          await grantCredits(userId, creditsPerMonth, `sub_start:${planId}`);
        }
      }

      return json(200, { ok: true });
    }

    if (event.type === "invoice.paid") {
      const invoice = event.data.object;
      const subId = invoice.subscription;

      if (!subId) return json(200, { ok: true, ignored: true });

      // Pull metadata from subscription (set during checkout)
      const subscription = await stripe.subscriptions.retrieve(subId);
      const meta = subscription?.metadata || {};
      const userId = meta.userId || null;
      const planId = meta.planId || null;
      const creditsPerMonth = Number(meta.creditsPerMonth || 0) || 0;

      if (!userId) return json(200, { ok: true, ignored: true });

      const first = await once(userId);
      if (!first) return json(200, { ok: true, duplicate: true });

      await setPlan(userId, {
        planId,
        status: "active",
        stripeCustomerId: subscription.customer || null,
        stripeSubscriptionId: subscription.id || null,
      });

      // monthly top-up on renewal
      // (Stripe may send invoice.paid for initial invoice too; idempotency prevents double grants)
      if (creditsPerMonth > 0) {
        await grantCredits(userId, creditsPerMonth, `sub_renew:${planId}:${invoice.id}`);
      }

      return json(200, { ok: true });
    }

    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object;
      const meta = sub?.metadata || {};
      const userId = meta.userId || null;

      if (!userId) return json(200, { ok: true, ignored: true });

      const first = await once(userId);
      if (!first) return json(200, { ok: true, duplicate: true });

      // downgrade
      await setPlan(userId, {
        planId: "free",
        status: "canceled",
        stripeCustomerId: sub.customer || null,
        stripeSubscriptionId: sub.id || null,
      });

      return json(200, { ok: true });
    }

    return json(200, { ok: true, ignored: true });
  } catch (e) {
    context?.log?.error?.("stripeWebhook failed", e);
    return json(500, { ok: false, error: e?.message || String(e) });
  }
};
