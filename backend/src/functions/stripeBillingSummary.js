"use strict";

const Stripe = require("stripe");
const { getSwaUserId } = require("../lib/swaUser");
const { readProfile } = require("../lib/billingStore.cjs");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": process.env.CORS_ORIGIN || "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(status, body) {
  return {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    body: JSON.stringify(body),
  };
}

function toIso(tsSeconds) {
  const n = Number(tsSeconds || 0);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

function cardSnippetFromPm(pm) {
  const c = pm?.card || null;
  if (!c) return null;
  return {
    id: String(pm?.id || ""),
    brand: String(c.brand || "").toUpperCase(),
    last4: String(c.last4 || ""),
    expMonth: Number(c.exp_month || 0) || null,
    expYear: Number(c.exp_year || 0) || null,
    funding: String(c.funding || ""),
    country: String(c.country || ""),
  };
}

async function stripeBillingSummary(request, context) {
  try {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: CORS_HEADERS, body: "" };
    }
    if (request.method !== "GET") {
      return json(405, { ok: false, error: "Method not allowed" });
    }

    const authUserId = getSwaUserId(request);
    if (!authUserId) {
      return json(401, { ok: false, error: "Not authenticated" });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return json(500, { ok: false, error: "Missing STRIPE_SECRET_KEY" });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20",
    });

    const profile = await readProfile(authUserId);
    const plan =
      profile?.plan && typeof profile.plan === "object" ? profile.plan : {};

    let stripeCustomerId = String(plan.stripeCustomerId || "");
    const stripeSubscriptionId = String(plan.stripeSubscriptionId || "");
    let subscription = null;
    let customer = null;

    if (stripeSubscriptionId) {
      try {
        subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
          expand: ["default_payment_method"],
        });
      } catch (e) {
        context?.log?.("stripeBillingSummary: sub lookup failed", e?.message);
      }
    }

    if (!stripeCustomerId && subscription?.customer) {
      stripeCustomerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : String(subscription.customer.id || "");
    }

    if (stripeCustomerId) {
      try {
        customer = await stripe.customers.retrieve(stripeCustomerId);
      } catch (e) {
        context?.log?.("stripeBillingSummary: customer lookup failed", e?.message);
      }
    }

    let paymentMethod = null;

    // 1) Subscription default payment method (best source for active plans)
    if (subscription?.default_payment_method) {
      if (typeof subscription.default_payment_method === "object") {
        paymentMethod = cardSnippetFromPm(subscription.default_payment_method);
      } else {
        try {
          const pm = await stripe.paymentMethods.retrieve(
            String(subscription.default_payment_method)
          );
          paymentMethod = cardSnippetFromPm(pm);
        } catch {}
      }
    }

    // 2) Customer invoice settings default payment method
    if (!paymentMethod && customer?.invoice_settings?.default_payment_method) {
      const pmId = String(customer.invoice_settings.default_payment_method);
      try {
        const pm = await stripe.paymentMethods.retrieve(pmId);
        paymentMethod = cardSnippetFromPm(pm);
      } catch {}
    }

    // 3) Fallback to first saved card
    if (!paymentMethod && stripeCustomerId) {
      try {
        const pms = await stripe.paymentMethods.list({
          customer: stripeCustomerId,
          type: "card",
          limit: 1,
        });
        const pm = Array.isArray(pms?.data) ? pms.data[0] : null;
        if (pm) paymentMethod = cardSnippetFromPm(pm);
      } catch {}
    }

    return json(200, {
      ok: true,
      connected: !!stripeCustomerId,
      customerId: stripeCustomerId || null,
      subscriptionId: stripeSubscriptionId || null,
      subscriptionStatus: String(subscription?.status || plan.status || "inactive"),
      currentPeriodEnd: toIso(subscription?.current_period_end),
      planId: String(plan.planId || "free"),
      paymentMethod,
    });
  } catch (e) {
    context?.log?.error?.("stripeBillingSummary failed", e);
    return json(500, { ok: false, error: e?.message || String(e) });
  }
}

module.exports = { stripeBillingSummary };

