"use strict";

const { getSwaUserId } = require("../lib/swaUser");
const { profilesContainer } = require("../lib/cosmosClient.cjs");

function getHeader(req, name) {
  try {
    if (req?.headers?.get) return req.headers.get(name);
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

  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
    headers["Vary"] = "Origin";
  } else {
    headers["Access-Control-Allow-Origin"] = "*";
  }
  return headers;
}

function reply(request, status, jsonBody) {
  return {
    status,
    headers: { ...cors(request) },
    jsonBody,
  };
}

async function safeJson(request) {
  try {
    if (typeof request?.json === "function") return await request.json();
  } catch {
    // ignore
  }
  return {};
}

module.exports = async (request, context) => {
  try {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: cors(request) };
    }

    const userId = getSwaUserId(request);
    if (!userId) {
      return reply(request, 401, { ok: false, error: "Not authenticated" });
    }

    const body = (await safeJson(request)) || {};
    const patchOnboarding =
      body && typeof body === "object" && body.onboarding && typeof body.onboarding === "object"
        ? body.onboarding
        : {};
    const patchPreferences =
      body && typeof body === "object" && body.preferences && typeof body.preferences === "object"
        ? body.preferences
        : {};

    const now = new Date().toISOString();

    // Base profile shell (always defined)
    const base = {
      id: userId,
      userId,
      onboarding: { pricingDone: false, setupDone: false, selectedPlan: null },
      preferences: {},
      plan: { planId: "free", status: "active" },
      credits: { balance: 0, updatedAt: now },
      createdAt: now,
      updatedAt: now,
    };

    // Read existing (but guard against resource being undefined)
    let existing = null;
    try {
      const readRes = await profilesContainer.item(userId, userId).read();
      existing = readRes?.resource || null;
    } catch {
      existing = null;
    }

    const next = {
      ...base,
      ...(existing || {}),
      id: (existing && (existing.id || existing.userId)) || userId,
      userId: (existing && existing.userId) || userId,
      onboarding: {
        ...((existing && existing.onboarding) || base.onboarding),
        ...patchOnboarding,
      },
      preferences: {
        ...((existing && existing.preferences) || base.preferences),
        ...patchPreferences,
      },
      updatedAt: now,
      createdAt: (existing && existing.createdAt) || base.createdAt,
    };

    await profilesContainer.items.upsert(next);

    return reply(request, 200, { ok: true, profile: next });
  } catch (e) {
    context?.log?.error?.("profile update failed", e);
    return reply(request, 500, {
      ok: false,
      error: "Handler crashed",
      detail: e?.message || String(e),
    });
  }
};
