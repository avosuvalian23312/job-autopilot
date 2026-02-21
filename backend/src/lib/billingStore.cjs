"use strict";

const { profilesContainer } = require("./cosmos.cjs");

// -------- helpers --------
async function readJson(request) {
  try {
    return await request.json();
  } catch {
    const t = await request.text();
    if (!t) return {};
    try {
      return JSON.parse(t);
    } catch {
      return {};
    }
  }
}

function nowIso() {
  return new Date().toISOString();
}

function periodYYYYMM(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function defaultProfile(userId) {
  const ts = nowIso();
  return {
    id: userId,
    userId,
    onboarding: { pricingDone: false, setupDone: false },
    plan: { planId: "free", status: "active" },
    credits: { balance: 0, monthlyUsed: 0, monthlyPeriod: periodYYYYMM(), updatedAt: ts },
    creditsLedger: [], // most recent first
    stripeEvents: [], // processed Stripe event ids (idempotency)
    createdAt: ts,
    updatedAt: ts,
  };
}

async function readProfile(userId) {
  try {
    const { resource } = await profilesContainer.item(userId, userId).read();
    if (resource) return resource;
  } catch (e) {
    if (e.code !== 404) throw e;
  }

  // Not found -> create a default profile doc
  const prof = defaultProfile(userId);
  await profilesContainer.items.upsert(prof);
  return prof;
}

async function replaceWithRetry(userId, mutator, maxRetries = 5) {
  let lastErr = null;

  for (let i = 0; i < maxRetries; i++) {
    const { resource, etag } = await profilesContainer.item(userId, userId).read();

    const next = mutator(resource || defaultProfile(userId));
    next.updatedAt = nowIso();
    if (!next.id) next.id = userId;
    if (!next.userId) next.userId = userId;

    try {
      const resp = await profilesContainer.item(userId, userId).replace(next, {
        accessCondition: { type: "IfMatch", condition: etag },
      });
      return resp.resource;
    } catch (e) {
      lastErr = e;
      // 412 = precondition failed (etag mismatch) -> retry
      if (e.code === 412) continue;
      throw e;
    }
  }

  throw lastErr || new Error("Failed to update profile (etag retries exceeded)");
}

function pushLedger(profile, entry) {
  const arr = Array.isArray(profile.creditsLedger) ? profile.creditsLedger : [];
  arr.unshift(entry);
  // cap to prevent infinite growth
  profile.creditsLedger = arr.slice(0, 200);
}

// -------- API --------
async function setPlan(userId, patch) {
  return replaceWithRetry(userId, (p) => {
    p.plan = { ...(p.plan || {}), ...(patch || {}) };
    return p;
  });
}

async function setOnboarding(userId, patch) {
  return replaceWithRetry(userId, (p) => {
    p.onboarding = { ...(p.onboarding || {}), ...(patch || {}) };
    return p;
  });
}

async function getCredits(userId) {
  const p = await readProfile(userId);
  return {
    balance: Number(p?.credits?.balance || 0) || 0,
    plan: p.plan || null,
    onboarding: p.onboarding || null,
  };
}

async function grantCredits(userId, amount, reason, meta) {
  const delta = Number(amount || 0) || 0;
  if (delta <= 0) return getCredits(userId);

  const ts = nowIso();
  const currentPeriod = periodYYYYMM(new Date(ts));

  const updated = await replaceWithRetry(userId, (p) => {
    const credits = p?.credits && typeof p.credits === "object" ? p.credits : {};
    const cur = Number(credits.balance || 0) || 0;
    const monthlyUsed =
      String(credits.monthlyPeriod || "") === currentPeriod
        ? Number(credits.monthlyUsed || 0) || 0
        : 0;

    p.credits = {
      ...credits,
      balance: cur + delta,
      monthlyPeriod: currentPeriod,
      monthlyUsed,
      updatedAt: ts,
    };

    pushLedger(p, {
      id: `led_${ts}_${Math.random().toString(16).slice(2)}`,
      ts,
      type: "grant",
      delta,
      reason: reason || "grant",
      meta: meta || null,
    });

    return p;
  });

  return { balance: updated.credits.balance };
}

async function spendCredits(userId, amount, reason, meta) {
  const delta = Number(amount || 0) || 0;
  if (delta <= 0) return getCredits(userId);

  const ts = nowIso();
  const currentPeriod = periodYYYYMM(new Date(ts));

  const updated = await replaceWithRetry(userId, (p) => {
    const credits = p?.credits && typeof p.credits === "object" ? p.credits : {};
    const cur = Number(credits.balance || 0) || 0;
    if (cur < delta) {
      const err = new Error("Insufficient credits");
      err.code = "INSUFFICIENT_CREDITS";
      throw err;
    }

    const monthlyUsedBase =
      String(credits.monthlyPeriod || "") === currentPeriod
        ? Number(credits.monthlyUsed || 0) || 0
        : 0;

    p.credits = {
      ...credits,
      balance: cur - delta,
      monthlyPeriod: currentPeriod,
      monthlyUsed: monthlyUsedBase + delta,
      updatedAt: ts,
    };

    pushLedger(p, {
      id: `led_${ts}_${Math.random().toString(16).slice(2)}`,
      ts,
      type: "spend",
      delta: -delta,
      reason: reason || "spend",
      meta: meta || null,
    });

    return p;
  });

  return { balance: updated.credits.balance };
}

async function listLedger(userId, limit = 50) {
  const p = await readProfile(userId);
  const arr = Array.isArray(p.creditsLedger) ? p.creditsLedger : [];
  return arr.slice(0, Math.max(1, Math.min(200, Number(limit) || 50)));
}

async function findUserIdByStripeRefs({ stripeCustomerId = null, stripeSubscriptionId = null } = {}) {
  const subId = stripeSubscriptionId ? String(stripeSubscriptionId) : null;
  const custId = stripeCustomerId ? String(stripeCustomerId) : null;
  if (!subId && !custId) return null;

  const parameters = [];
  const clauses = [];

  if (subId) {
    clauses.push("c.plan.stripeSubscriptionId = @subId");
    parameters.push({ name: "@subId", value: subId });
  }
  if (custId) {
    clauses.push("c.plan.stripeCustomerId = @custId");
    parameters.push({ name: "@custId", value: custId });
  }

  const query = {
    query: `SELECT TOP 1 c.userId FROM c WHERE ${clauses.join(" OR ")}`,
    parameters,
  };

  const { resources } = await profilesContainer.items.query(query).fetchAll();
  return resources?.[0]?.userId || null;
}

// Idempotency: record Stripe event id once per user
async function markEventOnce(userId, stripeEventId) {
  if (!userId || !stripeEventId) return false;

  const updated = await replaceWithRetry(userId, (p) => {
    const ev = Array.isArray(p.stripeEvents) ? p.stripeEvents : [];
    if (ev.includes(stripeEventId)) {
      p.stripeEvents = ev;
      p.__alreadyProcessed = true; // internal flag
      return p;
    }
    ev.unshift(stripeEventId);
    p.stripeEvents = ev.slice(0, 500); // cap
    return p;
  });

  return !updated.__alreadyProcessed;
}

module.exports = {
  readJson,
  readProfile,
  setPlan,
  setOnboarding,
  getCredits,
  grantCredits,
  spendCredits,
  listLedger,
  findUserIdByStripeRefs,
  markEventOnce,
};
