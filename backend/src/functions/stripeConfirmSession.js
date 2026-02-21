"use strict";

const Stripe = require("stripe");
const { getSwaUserId } = require("../lib/swaUser");
const {
  readProfile,
  setPlan,
  setOnboarding,
  grantCredits,
} = require("../lib/billingStore.cjs");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": process.env.CORS_ORIGIN || "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(status, body) {
  return {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    body: JSON.stringify(body),
  };
}

async function readJsonBody(request) {
  if (typeof request?.json === "function") return await request.json();
  if (request?.body && typeof request.body === "object") return request.body;
  if (request?.rawBody) {
    try {
      return JSON.parse(request.rawBody.toString("utf8"));
    } catch {}
  }
  return {};
}

function getSessionIdFromRequest(request, body) {
  const b =
    body?.sessionId ||
    body?.session_id ||
    body?.checkoutSessionId ||
    body?.checkout_session_id ||
    null;
  if (b) return String(b).trim();

  try {
    const u = new URL(request.url);
    return (
      u.searchParams.get("session_id") ||
      u.searchParams.get("sessionId") ||
      ""
    ).trim();
  } catch {
    return "";
  }
}

function toStr(v) {
  return v == null ? "" : String(v);
}

function buildPlanMap() {
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
  const map = buildPlanMap();
  for (const [planId, cfg] of Object.entries(map)) {
    if (Array.isArray(cfg.priceIds) && cfg.priceIds.includes(priceId)) {
      return {
        planId,
        creditsPerMonth: Number(cfg.creditsPerMonth || 0) || 0,
      };
    }
  }
  return null;
}

function resolvePlanById(planId) {
  if (!planId) return null;
  const cfg = buildPlanMap()[String(planId).toLowerCase()] || null;
  if (!cfg) return null;
  return {
    planId: String(planId).toLowerCase(),
    creditsPerMonth: Number(cfg.creditsPerMonth || 0) || 0,
  };
}

async function hasGrantReason(userId, reason) {
  if (!userId || !reason) return false;
  const p = await readProfile(userId);
  return (
    Array.isArray(p?.creditsLedger) &&
    p.creditsLedger.some(
      (e) =>
        e &&
        e.type === "grant" &&
        e.reason === reason &&
        Number(e.delta || 0) > 0
    )
  );
}

async function resolveInitialPaidGrantDelta(userId, monthlyGrant) {
  const targetGrant = Number(monthlyGrant || 0) || 0;
  if (targetGrant <= 0) return 0;

  const profile = await readProfile(userId);
  const ledger = Array.isArray(profile?.creditsLedger) ? profile.creditsLedger : [];

  const hasAnyPaidGrant = ledger.some((entry) => {
    if (!entry || entry.type !== "grant") return false;
    if ((Number(entry.delta || 0) || 0) <= 0) return false;
    return String(entry.reason || "").startsWith("sub_paid:");
  });

  // After the first paid grant, preserve additive monthly behavior.
  if (hasAnyPaidGrant) return targetGrant;

  const currentBalance = Number(profile?.credits?.balance || 0) || 0;
  // First paid cycle: top-up to plan allowance (avoid free+paid stacking like 10 + 150).
  return Math.max(0, targetGrant - currentBalance);
}

async function stripeConfirmSession(request, context) {
  try {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: CORS_HEADERS, body: "" };
    }

    if (request.method !== "POST") {
      return json(405, { ok: false, error: "Method not allowed" });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return json(500, { ok: false, error: "Missing STRIPE_SECRET_KEY" });
    }

    const authUserId = getSwaUserId(request);
    if (!authUserId) {
      return json(401, { ok: false, error: "Not authenticated" });
    }

    const body = await readJsonBody(request);
    const sessionId = getSessionIdFromRequest(request, body);
    if (!sessionId) {
      return json(400, { ok: false, error: "Missing session_id" });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20",
    });

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!session) {
      return json(404, { ok: false, error: "Checkout session not found" });
    }
    const sessionMode = String(session.mode || "").toLowerCase();

    const sessionUserId =
      toStr(session?.metadata?.userId) ||
      toStr(session?.client_reference_id) ||
      "";

    if (sessionUserId && sessionUserId !== authUserId) {
      return json(403, { ok: false, error: "Session does not belong to current user" });
    }

    const paymentStatus = String(session.payment_status || "").toLowerCase();
    const checkoutStatus = String(session.status || "").toLowerCase();
    const paidOrComplete =
      paymentStatus === "paid" || checkoutStatus === "complete";
    if (!paidOrComplete) {
      return json(409, {
        ok: false,
        error: "Checkout is not completed yet",
        paymentStatus,
        checkoutStatus,
      });
    }

    if (sessionMode === "payment") {
      const purchasedCredits =
        Number(session?.metadata?.credits || session?.metadata?.creditAmount || 0) || 0;
      if (purchasedCredits <= 0) {
        return json(400, {
          ok: false,
          error: "Missing purchased credits metadata",
          sessionId,
        });
      }

      const grantReason = `credits_pack:${sessionId}:${purchasedCredits}`;
      const alreadyGranted = await hasGrantReason(authUserId, grantReason);

      let granted = false;
      let balanceAfter = null;
      if (!alreadyGranted) {
        const g = await grantCredits(authUserId, purchasedCredits, grantReason, {
          checkoutType: "credits",
          checkoutSessionId: sessionId,
        });
        granted = true;
        balanceAfter = Number(g?.balance || 0) || 0;
      }

      return json(200, {
        ok: true,
        confirmed: true,
        sessionId,
        mode: "payment",
        purchasedCredits,
        creditsGrantedNow: granted,
        duplicate: alreadyGranted,
        balanceAfter,
        paymentStatus,
        checkoutStatus,
      });
    }

    if (sessionMode !== "subscription") {
      return json(400, {
        ok: false,
        error: "Session mode not supported for confirmation",
        mode: sessionMode || null,
      });
    }

    const subscriptionId =
      toStr(
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id
      ) || "";

    if (!subscriptionId) {
      return json(409, { ok: false, error: "No subscription id on checkout session" });
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    const priceId = toStr(subscription?.items?.data?.[0]?.price?.id);
    const byPrice = resolvePlanByPriceId(priceId);
    const byId = resolvePlanById(
      toStr(session?.metadata?.planId) || toStr(subscription?.metadata?.planId)
    );

    const planId =
      (byPrice && byPrice.planId) ||
      toStr(session?.metadata?.planId) ||
      toStr(subscription?.metadata?.planId) ||
      (byId && byId.planId) ||
      "pro";

    const creditsPerMonth =
      (byPrice && Number(byPrice.creditsPerMonth || 0)) ||
      Number(subscription?.metadata?.creditsPerMonth || 0) ||
      (byId && Number(byId.creditsPerMonth || 0)) ||
      0;

    const stripeCustomerId =
      toStr(
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id
      ) ||
      toStr(
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer?.id
      ) ||
      "";

    await setPlan(authUserId, {
      planId,
      status: "active",
      stripeCustomerId: stripeCustomerId || null,
      stripeSubscriptionId: subscriptionId || null,
    });
    await setOnboarding(authUserId, {
      pricingDone: true,
      selectedPlan: planId || null,
    });

    let granted = false;
    let grantedDelta = 0;
    let balanceAfter = null;
    if (creditsPerMonth > 0) {
      const invoiceId = toStr(
        typeof subscription.latest_invoice === "string"
          ? subscription.latest_invoice
          : subscription.latest_invoice?.id
      );
      const grantReason = `sub_paid:${planId}:${invoiceId || sessionId}`;
      const alreadyGranted = await hasGrantReason(authUserId, grantReason);
      if (!alreadyGranted) {
        const delta = await resolveInitialPaidGrantDelta(authUserId, creditsPerMonth);
        if (delta > 0) {
          const g = await grantCredits(authUserId, delta, grantReason);
          granted = true;
          grantedDelta = delta;
          balanceAfter = Number(g?.balance || 0) || 0;
        }
      }
    }

    return json(200, {
      ok: true,
      confirmed: true,
      sessionId,
      planId,
      subscriptionId,
      customerId: stripeCustomerId || null,
      paymentStatus,
      checkoutStatus,
      creditsPerMonth,
      creditsGrantedNow: granted,
      creditsGrantedDelta: grantedDelta,
      balanceAfter,
    });
  } catch (e) {
    context?.log?.error?.("stripeConfirmSession failed", e);
    return json(500, { ok: false, error: e?.message || String(e) });
  }
}

module.exports = { stripeConfirmSession };
