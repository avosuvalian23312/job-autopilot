"use strict";

const { getSwaUserId } = require("../lib/swaUser");
const { profilesContainer } = require("../lib/cosmosClient.cjs");

function getHeader(req, name) {
  try {
    if (req?.headers?.get) return req.headers.get(name);
    // fallback if headers is a plain object
    return req?.headers?.[name] || req?.headers?.[name?.toLowerCase()] || null;
  } catch {
    return null;
  }
}

function cors(request) {
  const origin = getHeader(request, "origin");
  const headers = {
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
  };

  // Same-origin SWA calls don’t need this, but leaving it safe/compatible.
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
    if (typeof request?.json === "function") return await request.json();
  } catch {
    // ignore
  }
  try {
    // fallback if body is already an object/string
    const b = request?.body;
    if (!b) return null;
    if (typeof b === "object") return b;
    if (typeof b === "string") return JSON.parse(b);
  } catch {
    // ignore
  }
  return null;
}

module.exports = async (request, context) => {
  try {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: cors(request) };
    }

    const userId = getSwaUserId(request);
    if (!userId) {
      return json(request, 401, { ok: false, error: "Not authenticated" });
    }

    const body = (await safeJson(request)) || {};
    const now = new Date().toISOString();

    // Load existing profile or create a base shell
    let existing = null;
    try {
      const { resource } = await profilesContainer.item(userId, userId).read();
      existing = resource;
    } catch (e) {
      existing = {
        id: userId,
        userId,
        onboarding: { pricingDone: false, setupDone: false, selectedPlan: null },
        preferences: {},
        plan: { planId: "free", status: "active" },
        credits: { balance: 0, updatedAt: now },
        createdAt: now,
        updatedAt: now,
      };
    }

    // Merge ONLY what you allow clients to update
    const next = {
      ...existing,
      id: existing?.id || userId,
      userId: existing?.userId || userId,
      onboarding: { ...(existing.onboarding || {}), ...(body.onboarding || {}) },
      preferences: { ...(existing.preferences || {}), ...(body.preferences || {}) },
      updatedAt: now,
    };

    await profilesContainer.items.upsert(next);

    return json(request, 200, { ok: true, profile: next });
  } catch (e) {
    context?.log?.error?.("profile update failed", e);
    return json(request, 500, {
      ok: false,
      error: "Handler crashed",
      detail: e?.message || String(e),
    });
  }
};
