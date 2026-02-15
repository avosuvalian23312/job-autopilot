"use strict";

const { getSwaUserId } = require("../lib/swaUser");
const { profilesContainer } = require("../lib/cosmosClient.cjs");

module.exports = async (request, context) => {
  const userId = getSwaUserId(request);
  if (!userId) {
    return { status: 401, jsonBody: { ok: false, error: "Not authenticated" } };
  }

  const id = userId;
  const pk = userId;

  try {
    const { resource } = await profilesContainer.item(id, pk).read();

    return {
      status: 200,
      jsonBody: { ok: true, profile: resource },
    };
  } catch (e) {
    if (e.code === 404) {
      const ts = new Date().toISOString();
      return {
        status: 200,
        jsonBody: {
          ok: true,
          profile: {
            id,
            userId,
            onboarding: { pricingDone: false, setupDone: false },
            plan: { planId: "free", status: "active" },
            credits: { balance: 0, updatedAt: ts },
            creditsLedger: [],
            stripeEvents: [],
            createdAt: ts,
            updatedAt: ts,
          },
        },
      };
    }

    context?.log?.error?.("profileMe failed", e);
    return { status: 500, jsonBody: { ok: false, error: e?.message || String(e) } };
  }
};
