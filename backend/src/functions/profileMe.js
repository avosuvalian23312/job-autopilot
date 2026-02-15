"use strict";

const { getSwaUserId, getSwaUserDetails, getSwaIdentityProvider } = require("../lib/swaUser");

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
  // ✅ Your requirement: free allows 3 resume generations monthly
  if (plan === "pro") return 60;
  if (plan === "power") return 120;
  return 3; // free
}

function buildDefaultProfile({ userId, email, provider }) {
  const now = new Date().toISOString();
  return {
    id: userId,
    userId,
    email: email || null,
    provider: provider || null,
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
}

function normalizeMonthly(profile) {
  const cur = periodYYYYMM();
  profile.credits = profile.credits || {};
  if (profile.credits.monthlyPeriod !== cur) {
    profile.credits.monthlyPeriod = cur;
    profile.credits.monthlyUsed = 0;
  }
  profile.plan = profile.plan || "free";
  profile.credits.monthlyAllowance = allowanceForPlan(profile.plan);
}

module.exports = async (request, context) => {
  if (request.method === "OPTIONS") return { status: 204, headers: cors() };

  const userId = getSwaUserId(request);
  if (!userId) return json(401, { ok: false, error: "Not authenticated" });

  const email = getSwaUserDetails(request);
  const provider = getSwaIdentityProvider(request);

  const { profilesContainer } = await import("../lib/cosmosClient.js");

  const pk = userId;
  const id = userId;

  let profile = null;

  try {
    const read = await profilesContainer.item(id, pk).read();
    profile = read.resource;
  } catch (e) {
    // 404 -> create
  }

  if (!profile) {
    profile = buildDefaultProfile({ userId, email, provider });
    await profilesContainer.items.upsert(profile);
  } else {
    // keep identity fresh
    profile.email = profile.email || email || null;
    profile.provider = profile.provider || provider || null;
    normalizeMonthly(profile);
    profile.updatedAt = new Date().toISOString();
    await profilesContainer.items.upsert(profile);
  }

  return json(200, {
    ok: true,
    profile: {
      userId: profile.userId,
      email: profile.email,
      provider: profile.provider,
      plan: profile.plan,
      onboarding: profile.onboarding || { pricingDone: false, setupDone: false },
      credits: profile.credits || null,
      preferences: profile.preferences || {},
    },
  });
};
