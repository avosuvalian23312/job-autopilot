"use strict";

const Stripe = require("stripe");
const {
  markEventOnce,
  setPlan,
  setOnboarding,
  grantCredits,
  findUserIdByStripeRefs,
  readProfile,
} = require("../lib/billingStore.cjs");

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

    function planMap() {
      const pickNum = (...vals) => {
        for (const v of vals) {
          const n = Number(v || 0) || 0;
          if (n > 0) return n;
        }
        return 0;
      };

      return {
        starter: {
          priceIds: [
            process.env.STRIPE_PRICE_STARTER,
            process.env.STRIPE_PRICE_BASIC,
          ].filter(Boolean),
          creditsPerMonth: pickNum(
            process.env.STARTER_CREDITS_PER_MONTH,
            process.env.BASIC_CREDITS_PER_MONTH,
            50
          ),
        },
        pro: {
          priceIds: [process.env.STRIPE_PRICE_PRO].filter(Boolean),
          creditsPerMonth: pickNum(process.env.PRO_CREDITS_PER_MONTH, 150),
        },
        team: {
          priceIds: [
            process.env.STRIPE_PRICE_TEAM,
            process.env.STRIPE_PRICE_POWER,
            process.env.STRIPE_PRICE_MAX,
          ].filter(Boolean),
          creditsPerMonth: pickNum(
            process.env.TEAM_CREDITS_PER_MONTH,
            process.env.POWER_CREDITS_PER_MONTH,
            process.env.MAX_CREDITS_PER_MONTH,
            300
          ),
        },
        max: {
          priceIds: [
            process.env.STRIPE_PRICE_MAX,
            process.env.STRIPE_PRICE_POWER,
            process.env.STRIPE_PRICE_TEAM,
          ].filter(Boolean),
          creditsPerMonth: pickNum(
            process.env.MAX_CREDITS_PER_MONTH,
            process.env.POWER_CREDITS_PER_MONTH,
            process.env.TEAM_CREDITS_PER_MONTH,
            300
          ),
        },
      };
    }

    function resolvePlanByPriceId(priceId) {
      if (!priceId) return null;
      const entries = Object.entries(planMap());
      for (const [planId, cfg] of entries) {
        if (Array.isArray(cfg.priceIds) && cfg.priceIds.includes(priceId)) {
          return { planId, creditsPerMonth: Number(cfg.creditsPerMonth || 0) || 0 };
        }
      }
      return null;
    }

    function resolvePlanById(planId) {
      if (!planId) return null;
      const cfg = planMap()[String(planId).toLowerCase()] || null;
      if (!cfg) return null;
      return {
        planId: String(planId).toLowerCase(),
        creditsPerMonth: Number(cfg.creditsPerMonth || 0) || 0,
      };
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
        await setOnboarding(userId, { pricingDone: true, selectedPlan: planId || null });
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

      let userId = meta.userId || null;
      const priceId = subscription?.items?.data?.[0]?.price?.id || null;
      const byPrice = resolvePlanByPriceId(priceId);
      const planId = (byPrice && byPrice.planId) || meta.planId || null;
      const byPlan = resolvePlanById(planId);
      const creditsPerMonth =
        (byPrice && Number(byPrice.creditsPerMonth || 0)) ||
        Number(meta.creditsPerMonth || 0) ||
        (byPlan && Number(byPlan.creditsPerMonth || 0)) ||
        0;

      if (!userId) {
        userId = await findUserIdByStripeRefs({
          stripeCustomerId: invoice.customer || subscription.customer || null,
          stripeSubscriptionId: subId || subscription.id || null,
        });
      }

      if (!userId) {
        // Fallback: recover user from Checkout Session tied to this subscription.
        try {
          const sessList = await stripe.checkout.sessions.list({
            subscription: subId,
            limit: 1,
          });
          const s = Array.isArray(sessList?.data) ? sessList.data[0] : null;
          userId =
            s?.metadata?.userId ||
            s?.client_reference_id ||
            null;
        } catch (err) {
          context?.log?.("invoice.paid checkout session lookup failed", err?.message);
        }
      }

      // Do NOT acknowledge success if we cannot map invoice -> user.
      // Returning non-2xx lets Stripe retry later.
      if (!userId) {
        return json(500, {
          ok: false,
          error: "invoice.paid could not resolve userId",
          invoiceId: invoice.id || null,
          subscriptionId: subId || null,
        });
      }

      // Do NOT acknowledge success if credits cannot be resolved.
      if (creditsPerMonth <= 0) {
        return json(500, {
          ok: false,
          error: "invoice.paid resolved creditsPerMonth <= 0",
          invoiceId: invoice.id || null,
          subscriptionId: subId || null,
          planId: planId || null,
          priceId: priceId || null,
        });
      }

      const grantReason = `sub_paid:${planId}:${invoice.id}`;
      const first = await once(userId, `invoice:${invoice.id}`);
      if (!first) {
        // Self-heal: older runs may have marked invoice as processed without writing grant.
        const p = await readProfile(userId);
        const alreadyGranted =
          Array.isArray(p?.creditsLedger) &&
          p.creditsLedger.some(
            (e) =>
              e &&
              e.type === "grant" &&
              e.reason === grantReason &&
              Number(e.delta || 0) > 0
          );

        if (alreadyGranted) {
          return json(200, { ok: true, duplicate: true });
        }
      }

      await setPlan(userId, {
        planId,
        status: "active",
        stripeCustomerId: subscription.customer || null,
        stripeSubscriptionId: subscription.id || null,
      });
      await setOnboarding(userId, { pricingDone: true, selectedPlan: planId || null });

      await grantCredits(userId, creditsPerMonth, grantReason);

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
