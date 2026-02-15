"use strict";

const { getSwaUserId } = require("../lib/swaUser");

// NOTE: your cosmosClient.js is ESM, so from CommonJS function code we use dynamic import.
async function getProfilesContainer() {
  const mod = await import("../lib/cosmosClient.js");
  return mod.profilesContainer;
}

function cors(request) {
  const origin = request?.headers?.get?.("origin");
  // In SWA production this is same-origin, so CORS usually doesn't matter,
  // but this keeps local-dev + OPTIONS happy.
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

module.exports = async (request) => {
  if (request.method === "OPTIONS") return { status: 204, headers: cors(request) };

  const userId = getSwaUserId(request);
  if (!userId) return json(request, 401, { ok: false, error: "Not authenticated" });

  const c = await getProfilesContainer();
  const now = new Date().toISOString();

  // Read by (id, pk) if container pk is /userId and id==userId
  try {
    const { resource } = await c.item(userId, userId).read();
    return json(request, 200, { ok: true, profile: resource });
  } catch {
    // Create default profile on first login
    const doc = {
      id: userId,
      userId,
      onboarding: { pricingDone: false, setupDone: false, selectedPlan: null },
      preferences: {
        targetRoles: [],
        seniority: "",
        locationPreference: "",
        preferredCity: "",
        tone: "Professional",
      },
      createdAt: now,
      updatedAt: now,
    };

    await c.items.upsert(doc);
    return json(request, 200, { ok: true, profile: doc });
  }
};
