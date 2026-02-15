"use strict";

const { getSwaUserId } = require("../lib/swaUser");

async function getProfilesContainer() {
  const mod = await import("../lib/cosmosClient.js");
  return mod.profilesContainer;
}

function cors(request) {
  const origin = request?.headers?.get?.("origin");
  const headers = {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
    headers["Vary"] = "Origin";
  } else {
    headers["Access-Control-Allow-Origin"] = "*";
  }
  return headers;
}

function json(request, status, body) {
  return {
    status,
    headers: { ...cors(request), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function safeJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

module.exports = async (request) => {
  if (request.method === "OPTIONS") return { status: 204, headers: cors(request) };

  const userId = getSwaUserId(request);
  if (!userId) return json(request, 401, { ok: false, error: "Not authenticated" });

  const body = (await safeJson(request)) || {};
  const c = await getProfilesContainer();
  const now = new Date().toISOString();

  // Load existing
  let existing = null;
  try {
    const { resource } = await c.item(userId, userId).read();
    existing = resource;
  } catch {
    existing = {
      id: userId,
      userId,
      onboarding: { pricingDone: false, setupDone: false, selectedPlan: null },
      preferences: {},
      createdAt: now,
      updatedAt: now,
    };
  }

  // Merge allowed fields
  const next = {
    ...existing,
    onboarding: { ...(existing.onboarding || {}), ...(body.onboarding || {}) },
    preferences: { ...(existing.preferences || {}), ...(body.preferences || {}) },
    updatedAt: now,
  };

  await c.items.upsert(next);
  return json(request, 200, { ok: true, profile: next });
};
