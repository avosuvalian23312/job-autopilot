// src/lib/onboarding.js
// Local-only onboarding state (simple + reliable)

const KEY_PRICING = "onboarding_pricing_done_v1";
const KEY_SETUP = "onboarding_setup_done_v1";

const readBool = (key) => {
  try {
    return localStorage.getItem(key) === "1";
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

export const onboarding = {
  getState() {
    return {
      pricingDone: readBool(KEY_PRICING),
      setupDone: readBool(KEY_SETUP),
    };
  },

  getNextStep() {
    const s = this.getState();
    if (!s.pricingDone) return "pricing";
    if (!s.setupDone) return "setup";
    return "done";
  },

  completePricing() {
    writeBool(KEY_PRICING, true);
  },

  completeSetup() {
    writeBool(KEY_SETUP, true);
  },

  reset() {
    writeBool(KEY_PRICING, false);
    writeBool(KEY_SETUP, false);
  },
};
