"use strict";

const { usersContainer } = require("./cosmos.cjs");

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function getOrCreateUserDoc(userId) {
  const c = usersContainer();
  const item = c.item(userId, userId);

  try {
    const { resource } = await item.read();
    if (resource) return resource;
  } catch (e) {
    // 404 -> create below
  }

  const now = new Date().toISOString();
  const base = {
    id: userId,
    userId,
    createdAt: now,
    billing: {
      planId: "free",
      status: "active",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      processedEventIds: [],
      updatedAt: now,
    },
    creditsBalance: 0,
    credits: 0,
    creditsUpdatedAt: now,
  };

  await c.items.create(base);
  return base;
}

function clampEventIds(arr, max = 50) {
  if (!Array.isArray(arr)) return [];
  if (arr.length <= max) return arr;
  return arr.slice(arr.length - max);
}

async function markEventOnce(userId, eventId) {
  const c = usersContainer();
  const doc = await getOrCreateUserDoc(userId);

  const processed = clampEventIds(doc?.billing?.processedEventIds || []);
  if (processed.includes(eventId)) return false;

  processed.push(eventId);

  const now = new Date().toISOString();
  const next = {
    ...doc,
    billing: {
      ...(doc.billing || {}),
      processedEventIds: processed,
      updatedAt: now,
    },
  };

  await c.item(userId, userId).replace(next);
  return true;
}

async function setPlan(userId, { planId, status, stripeCustomerId, stripeSubscriptionId }) {
  const c = usersContainer();
  const doc = await getOrCreateUserDoc(userId);

  const now = new Date().toISOString();
  const next = {
    ...doc,
    billing: {
      ...(doc.billing || {}),
      planId: planId || doc?.billing?.planId || "free",
      status: status || doc?.billing?.status || "active",
      stripeCustomerId: stripeCustomerId ?? doc?.billing?.stripeCustomerId ?? null,
      stripeSubscriptionId: stripeSubscriptionId ?? doc?.billing?.stripeSubscriptionId ?? null,
      updatedAt: now,
    },
    // also store flat fields for compatibility with any old code
    planId: planId || doc.planId || "free",
    plan: planId || doc.plan || "free",
  };

  await c.item(userId, userId).replace(next);
  return next;
}

async function grantCredits(userId, amount, reason = "grant") {
  const c = usersContainer();
  const doc = await getOrCreateUserDoc(userId);

  const add = Number(amount || 0);
  if (!Number.isFinite(add) || add <= 0) return doc;

  const now = new Date().toISOString();
  const cur = Number(doc.creditsBalance || doc.credits || 0) || 0;
  const nextBal = cur + add;

  const ledger = Array.isArray(doc.creditsLedger) ? doc.creditsLedger : [];
  ledger.push({ ts: now, type: "credit", amount: add, reason });
  while (ledger.length > 50) ledger.shift();

  const next = {
    ...doc,
    creditsBalance: nextBal,
    credits: nextBal,
    creditsAvailable: nextBal,
    creditsUpdatedAt: now,
    creditsLedger: ledger,
  };

  await c.item(userId, userId).replace(next);
  return next;
}

module.exports = {
  readJson,
  getOrCreateUserDoc,
  markEventOnce,
  setPlan,
  grantCredits,
};
