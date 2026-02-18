// src/lib/onboarding.js
// Cloud onboarding stored in Cosmos per SWA user via /api/profile

let _cache = null;
let _inflight = null;

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  return { ok: res.ok, status: res.status, data };
}

function extractError(r) {
  return (
    r?.data?.error ||
    r?.data?.detail ||
    r?.data?.message ||
    (typeof r?.data === "string" ? r.data : null) ||
    `Request failed (HTTP ${r?.status || "?"})`
  );
}

async function fetchProfile(force = false) {
  if (!force && _cache) return _cache;
  if (!force && _inflight) return _inflight;

  _inflight = (async () => {
    const r = await api("/api/profile/me");
    if (!r.ok || !r.data?.ok) {
      _cache = null;
      _inflight = null;
      return null;
    }
    _cache = r.data.profile || null;
    _inflight = null;
    return _cache;
  })();

  return _inflight;
}

async function updateProfile(patch) {
  const safePatch = patch && typeof patch === "object" ? patch : {};
  const r = await api("/api/profile", { method: "POST", body: safePatch });

  if (!r.ok || !r.data?.ok) {
    if (r.status === 401) {
      _cache = null;
      _inflight = null;
    }
    throw new Error(extractError(r));
  }

  _cache = r.data.profile || null;
  return _cache;
}

export const onboarding = {
  async getState(force = false) {
    const p = await fetchProfile(force);
    const ob = p?.onboarding || {};
    return {
      pricingDone: !!ob.pricingDone,
      setupDone: !!ob.setupDone,
      selectedPlan: ob.selectedPlan || null,
    };
  },

  async getNextStep(force = false) {
    const s = await this.getState(force);
    if (!s.pricingDone) return "pricing";
    if (!s.setupDone) return "setup";
    return "done";
  },

  // ✅ store plan choice in Cosmos (NO localStorage)
  async setSelectedPlan(planId) {
    if (!planId) return await fetchProfile(true);
    return await updateProfile({ onboarding: { selectedPlan: planId } });
  },

  // ✅ mark pricing complete in Cosmos
  async completePricing(planId) {
    const patch = { onboarding: { pricingDone: true } };
    // only write selectedPlan if explicitly provided
    if (planId !== undefined && planId !== null) {
      patch.onboarding.selectedPlan = planId;
    }
    await updateProfile(patch);
  },

  async completeSetup(preferences = null) {
    const patch = { onboarding: { setupDone: true } };
    if (preferences) patch.preferences = preferences;
    await updateProfile(patch);
  },

  clearCache() {
    _cache = null;
    _inflight = null;
  },
};
