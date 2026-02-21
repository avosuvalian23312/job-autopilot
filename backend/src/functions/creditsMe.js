"use strict";

const { getSwaUserId } = require("../lib/swaUser");

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  };
}
function json(status, body) {
  return { status, headers: { ...cors(), "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
function periodYYYYMM(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
function allowanceForPlan(plan) {
  if (plan && typeof plan === "object") {
    return allowanceForPlan(plan.planId || "free");
  }
  if (plan === "free") return 10;
  if (plan === "starter") return 10; // legacy alias
  if (plan === "pro") return 150;
  if (plan === "team") return 300;
  if (plan === "power") return 300;
  if (plan === "max") return 300;
  return 10;
}

function monthlySpentFromLedger(ledger, period) {
  const target = String(period || "");
  if (!target || !Array.isArray(ledger)) return 0;

  let total = 0;
  for (const entry of ledger) {
    const ts = entry?.ts ? new Date(entry.ts) : null;
    if (!ts || !Number.isFinite(ts.getTime())) continue;
    if (periodYYYYMM(ts) !== target) continue;

    const type = String(entry?.type || "").toLowerCase();
    const delta = Number(entry?.delta || 0) || 0;
    const isSpend = type === "spend" || type === "debit" || delta < 0;
    if (!isSpend) continue;

    total += Math.abs(delta);
  }
  return total;
}

module.exports = async (request, context) => {
  if (request.method === "OPTIONS") return { status: 204, headers: cors() };

  const userId = getSwaUserId(request);
  if (!userId) return json(401, { ok: false, error: "Not authenticated" });

  const { profilesContainer } = require("../lib/cosmosClient.cjs");

  const pk = userId;
  const id = userId;

  let profile = null;
  try {
    const read = await profilesContainer.item(id, pk).read();
    profile = read.resource;
  } catch {}

  if (!profile) {
    const now = new Date().toISOString();
    const firstPeriod = periodYYYYMM();
    const firstReason = `free_monthly:${firstPeriod}`;
    const firstAllowance = allowanceForPlan("free");
    profile = {
      id: userId,
      userId,
      plan: { planId: "free", status: "active" },
      onboarding: { pricingDone: false, setupDone: false },
      credits: {
        balance: firstAllowance,
        monthlyAllowance: firstAllowance,
        monthlyUsed: 0,
        monthlyPeriod: firstPeriod,
      },
      creditsLedger: [
        {
          id: `led_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          ts: now,
          type: "grant",
          delta: firstAllowance,
          reason: firstReason,
          meta: { planId: "free", period: firstPeriod },
        },
      ],
      preferences: {},
      createdAt: now,
      updatedAt: now,
    };
    await profilesContainer.items.upsert(profile);
  }

  const planId =
    typeof profile.plan === "string"
      ? profile.plan
      : (profile.plan && profile.plan.planId) || "free";
  profile.plan =
    typeof profile.plan === "string"
      ? { planId: profile.plan, status: "active" }
      : profile.plan || { planId: "free", status: "active" };
  profile.credits = profile.credits || {};
  const legacyBalance = Number(profile.creditsBalance);
  if (!Number.isFinite(Number(profile.credits.balance)) && Number.isFinite(legacyBalance)) {
    profile.credits.balance = legacyBalance;
  }
  if (!Number.isFinite(Number(profile.credits.balance))) {
    profile.credits.balance = 0;
  }

  const currentPeriod = periodYYYYMM();
  if (profile.credits.monthlyPeriod !== currentPeriod) {
    profile.credits.monthlyPeriod = currentPeriod;
    profile.credits.monthlyUsed = 0;
  }
  profile.credits.monthlyAllowance = allowanceForPlan(planId);

  // Free plan should auto-grant monthly credits without requiring Stripe.
  if (planId === "free") {
    const grantReason = `free_monthly:${currentPeriod}`;
    const ledger = Array.isArray(profile.creditsLedger) ? profile.creditsLedger : [];
    const alreadyGranted = ledger.some((entry) => entry?.reason === grantReason);

    if (!alreadyGranted) {
      const delta = allowanceForPlan("free");
      const now = new Date().toISOString();
      const curBalance = Number(profile.credits.balance || 0) || 0;
      profile.credits.balance = curBalance + delta;

      ledger.unshift({
        id: `led_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        ts: now,
        type: "grant",
        delta,
        reason: grantReason,
        meta: { planId: "free", period: currentPeriod },
      });
      profile.creditsLedger = ledger.slice(0, 200);
    }
  }

  const ledgerSpend = monthlySpentFromLedger(profile.creditsLedger, currentPeriod);
  const currentUsed = Number(profile.credits.monthlyUsed || 0) || 0;
  profile.credits.monthlyUsed = Math.max(currentUsed, ledgerSpend);

  profile.updatedAt = new Date().toISOString();
  await profilesContainer.items.upsert(profile);

  const monthlyRemaining = Math.max(0, (profile.credits.monthlyAllowance || 0) - (profile.credits.monthlyUsed || 0));

  return json(200, {
    ok: true,
    plan: planId,
    credits: {
      balance: profile.credits.balance || 0,
      monthlyAllowance: profile.credits.monthlyAllowance || 0,
      monthlyUsed: profile.credits.monthlyUsed || 0,
      monthlyRemaining,
      monthlyPeriod: profile.credits.monthlyPeriod,
    },
    onboarding: profile.onboarding || { pricingDone: false, setupDone: false },
  });
};
