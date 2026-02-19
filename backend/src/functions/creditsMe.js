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
  if (plan === "starter") return 50;
  if (plan === "pro") return 150;
  if (plan === "team") return 300;
  if (plan === "power") return 300;
  if (plan === "max") return 300;
  return 3;
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
    profile = {
      id: userId,
      userId,
      plan: "free",
      onboarding: { pricingDone: false, setupDone: false },
      credits: {
        balance: 0,
        monthlyAllowance: allowanceForPlan("free"),
        monthlyUsed: 0,
        monthlyPeriod: periodYYYYMM(),
      },
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
  profile.plan = profile.plan || { planId: "free", status: "active" };
  profile.credits = profile.credits || {};
  if (profile.credits.monthlyPeriod !== periodYYYYMM()) {
    profile.credits.monthlyPeriod = periodYYYYMM();
    profile.credits.monthlyUsed = 0;
  }
  profile.credits.monthlyAllowance = allowanceForPlan(planId);
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
