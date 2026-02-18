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

function json(request, status, body) {
  return {
    status,
    headers: { ...cors(request) },
    jsonBody: body,
  };
}

async function safeJson(request) {
  try {
    if (typeof request?.json === "function") {
      const j = await request.json();
      return j && typeof j === "object" ? j : {};
    }
  } catch {
    // ignore
  }
  return {};
}

function isPlainObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

async function readProfileOrNull(userId) {
  try {
    const resp = await profilesContainer.item(userId, userId).read();

    // IMPORTANT: sometimes this can be undefined without throwing
    const resource = resp?.resource || null;
    if (!resource) return null;

    return resource;
  } catch (e) {
    // Not found => treat as null
    if (e?.code === 404 || e?.statusCode === 404) return null;
    throw e;
  }
}

async function upsertProfile(doc) {
  return profilesContainer.items.upsert(doc);
}

// ✅ export name MUST match backend/index.js lazy(..., "profileUpdate")
async function profileUpdate(request, context) {
  try {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: cors(request) };
    }

    const userId = getSwaUserId(request);
    if (!userId) {
      return json(request, 401, { ok: false, error: "Not authenticated" });
    }

    const body = await safeJson(request);

    const patchOnboarding = isPlainObject(body.onboarding) ? body.onboarding : {};
    const patchPreferences = isPlainObject(body.preferences) ? body.preferences : {};

    const now = new Date().toISOString();

    // Base shell (always defined)
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

    const existing = await readProfileOrNull(userId);

    const next = {
      ...base,
      ...(existing || {}),
      id: (existing && (existing.id || existing.userId)) || userId,
      userId: (existing && existing.userId) || userId,
      onboarding: {
        ...base.onboarding,
        ...((existing && existing.onboarding) || {}),
        ...patchOnboarding,
      },
      preferences: {
        ...base.preferences,
        ...((existing && existing.preferences) || {}),
        ...patchPreferences,
      },
      createdAt: (existing && existing.createdAt) || base.createdAt,
      updatedAt: now,
    };

    await upsertProfile(next);

    return json(request, 200, { ok: true, profile: next });
  } catch (err) {
    context?.log?.error?.("profileUpdate crashed", err);
    return json(request, 500, {
      ok: false,
      error: "Handler crashed",
      detail: err?.message || String(err),
    });
  }
}

module.exports = { profileUpdate };
