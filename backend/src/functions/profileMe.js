// backend/src/functions/profileMe.js
"use strict";

const { getSwaUserId } = require("../lib/swaUser");
const { profilesContainer } = require("../lib/cosmosClient.cjs"); // adjust if your export name differs

function json(status, body) {
  return { status, jsonBody: body };
}

function nowIso() {
  return new Date().toISOString();
}

module.exports = async (request, context) => {
  const userId = getSwaUserId(request);
  if (!userId) return json(401, { ok: false, error: "Not authenticated" });

  const id = userId; // ✅ id = userId
  const pk = userId; // ✅ pk = userId (assuming partition key is /userId)

  try {
    const { resource } = await profilesContainer.item(id, pk).read();

    // If doc exists but missing fields, normalize lightly (optional)
    const profile = resource || null;
    if (!profile) {
      return json(200, {
        ok: true,
        profile: {
          id,
          userId,
          onboarding: { pricingDone: false, setupDone: false },
          plan: { planId: "free", status: "active" },
          createdAt: nowIso(),
          updatedAt: nowIso(),
        },
      });
    }

    // Ensure required keys exist (non-destructive)
    profile.id = profile.id || id;
    profile.userId = profile.userId || userId;
    profile.onboarding = profile.onboarding || { pricingDone: false, setupDone: false };
    profile.plan = profile.plan || { planId: "free", status: "active" };
    profile.updatedAt = profile.updatedAt || nowIso();

    return json(200, { ok: true, profile });
  } catch (e) {
    const code = e?.code || e?.statusCode;

    // Not found -> create default profile (so future updates are easy)
    if (code === 404) {
      const profile = {
        id,
        userId,
        onboarding: { pricingDone: false, setupDone: false },
        plan: { planId: "free", status: "active" },
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };

      try {
        // Upsert so the doc exists from first login
        await profilesContainer.items.upsert(profile, { partitionKey: pk });
      } catch (upErr) {
        context?.log?.warn?.("profileMe: upsert default failed (continuing)", upErr);
      }

      return json(200, { ok: true, profile });
    }

    context?.log?.error?.("profileMe failed", e);
    return json(500, { ok: false, error: e?.message || String(e) });
  }
};
