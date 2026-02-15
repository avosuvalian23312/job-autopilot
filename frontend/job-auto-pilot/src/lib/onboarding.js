// src/lib/onboarding.js
// Cloud onboarding stored in Cosmos per SWA user via /api/profile

let _cache = null;
let _inflight = null;

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
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
    _cache = r.data.profile;
    _inflight = null;
    return _cache;
  })();

  return _inflight;
}

async function updateProfile(patch) {
  const r = await api("/api/profile", { method: "POST", body: patch });
  if (!r.ok || !r.data?.ok) throw new Error(r.data?.error || "Profile update failed");
  _cache = r.data.profile;
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

  async completePricing(planName = null) {
    await updateProfile({
      onboarding: { pricingDone: true, selectedPlan: planName || null },
    });
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
