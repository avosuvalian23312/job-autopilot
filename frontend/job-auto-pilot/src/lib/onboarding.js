// src/lib/onboarding.js
// Local-only onboarding state (simple + reliable)

const KEY_PRICING = "onboarding_pricing_done_v1";
const KEY_SETUP = "onboarding_setup_done_v1";

// Backward-compat keys (so older code doesn't break)
const LEGACY_PRICING_KEYS = [
  "onboarding_pricing_done",
  "pricingDone",
  "onboarding_pricing_done_v0",
];
const LEGACY_SETUP_KEYS = [
  "onboarding_setup_done",
  "setupDone",
  "onboarding_setup_done_v0",
];

const readBoolAny = (keys) => {
  try {
    return keys.some((k) => {
      const v = localStorage.getItem(k);
      return v === "1" || v === "true";
    });
  } catch {
    return false;
  }
};

const writeBool = (key, val) => {
  try {
    if (val) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {
    // ignore
  }
};

// Mirror to legacy keys so any older checks still pass
const mirrorBool = (legacyKeys, val) => {
  try {
    legacyKeys.forEach((k) => {
      if (val) localStorage.setItem(k, "1");
      else localStorage.removeItem(k);
    });
  } catch {}
};

export const onboarding = {
  getState() {
    return {
      pricingDone: readBoolAny([KEY_PRICING, ...LEGACY_PRICING_KEYS]),
      setupDone: readBoolAny([KEY_SETUP, ...LEGACY_SETUP_KEYS]),
    };
  },

  getNextStep() {
    const s = this.getState();
    if (!s.pricingDone) return "pricing";
    if (!s.setupDone) return "setup";
    return "done";
  },

  // ✅ Canonical
  completePricing() {
    writeBool(KEY_PRICING, true);
    mirrorBool(LEGACY_PRICING_KEYS, true);
  },

  completeSetup() {
    writeBool(KEY_SETUP, true);
    mirrorBool(LEGACY_SETUP_KEYS, true);
  },

  // ✅ Aliases so your UI code doesn't crash
  setPricingDone(val = true) {
    writeBool(KEY_PRICING, !!val);
    mirrorBool(LEGACY_PRICING_KEYS, !!val);
  },

  setSetupDone(val = true) {
    writeBool(KEY_SETUP, !!val);
    mirrorBool(LEGACY_SETUP_KEYS, !!val);
  },

  reset() {
    writeBool(KEY_PRICING, false);
    writeBool(KEY_SETUP, false);
    mirrorBool(LEGACY_PRICING_KEYS, false);
    mirrorBool(LEGACY_SETUP_KEYS, false);
  },
};
