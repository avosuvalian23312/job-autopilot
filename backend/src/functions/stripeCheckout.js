"use strict";

const Stripe = require("stripe");
const { getSwaUserId, parseClientPrincipal } = require("../lib/swaUser");
const { setPlan, grantCredits, readJson } = require("../lib/billingStore.cjs");

function json(status, body) {
  return { status, jsonBody: body };
}

// Server-truth plan config (DON’T trust client for credits)
const PLAN_CONFIG = {
  free: { mode: "free", creditsPerMonth: 3 },     // your “3 resumes monthly”
  pro: { mode: "subscription", creditsPerMonth: 20, priceEnv: "STRIPE_PRICE_PRO" },
  power: { mode: "subscription", creditsPerMonth: 60, priceEnv: "STRIPE_PRICE_POWER" },
};

function addQueryParam(url, key, value) {
  const u = new URL(url);
  u.searchParams.set(key, value);
  return u.toString();
}

module.exports = async (request, context) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return json(500, { ok: false, error: "Missing STRIPE_SECRET_KEY" });
    }

    const userId = getSwaUserId(request);
    if (!userId) return json(401, { ok: false, error: "Not authenticated" });

    const body = await readJson(request);
    const planIdRaw = String(body.planId || body.plan || body.planName || "free");
    const planId = planIdRaw.toLowerCase();

    const successPath = body.successPath || "/Setup";
    const cancelPath = body.cancelPath || "/Pricing";

    const origin = new URL(request.url).origin;
    const successUrl = addQueryParam(origin + successPath, "src", "stripe");
    const cancelUrl = origin + cancelPath;

    const plan = PLAN_CONFIG[planId];
    if (!plan) return json(400, { ok: false, error: "Invalid planId" });

    // FREE: no Stripe, just set plan + grant credits immediately
    if (plan.mode === "free") {
      await setPlan(userId, { planId: "free", status: "active" });
      await grantCredits(userId, plan.creditsPerMonth, "free_month_grant");
      return json(200, { ok: true, url: origin + successPath });
    }

    // Paid plans → Stripe Checkout (subscription)
    const priceId = process.env[plan.priceEnv];
    if (!priceId) {
      return json(500, { ok: false, error: `Missing ${plan.priceEnv}` });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20",
    });

    // nice-to-have email
    const principal = parseClientPrincipal(request);
    const maybeEmail = principal?.userDetails && String(principal.userDetails).includes("@")
      ? String(principal.userDetails)
      : null;

    // mark user as "pending" plan locally in Cosmos (optional but helpful)
    await setPlan(userId, { planId, status: "pending" });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: addQueryParam(successUrl, "session_id", "{CHECKOUT_SESSION_ID}"),
      cancel_url: cancelUrl,
      client_reference_id: userId,
      customer_email: maybeEmail || undefined,

      // Put metadata on BOTH session + subscription so invoice.paid can read it
      metadata: {
        userId,
        planId,
        creditsPerMonth: String(plan.creditsPerMonth),
      },
      subscription_data: {
        metadata: {
          userId,
          planId,
          creditsPerMonth: String(plan.creditsPerMonth),
        },
      },
      allow_promotion_codes: true,
    });

    return json(200, { ok: true, url: session.url });
  } catch (e) {
    context?.log?.error?.("stripeCheckout failed", e);
    return json(500, { ok: false, error: e?.message || String(e) });
  }
};
