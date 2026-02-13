// src/lib/onboarding.js
const KEY = "jobautopilot_onboarding_v1";

const read = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") || {};
  } catch {
    return {};
  }
};

const write = (val) => {
  localStorage.setItem(KEY, JSON.stringify(val || {}));
};

export const onboarding = {
  getState() {
    const s = read();
    return {
      pricingDone: !!s.pricingDone,
      setupDone: !!s.setupDone,
    };
  },

  // Order matters: pricing -> setup -> done
  getNextStep() {
    const s = onboarding.getState();
    if (!s.pricingDone) return "pricing";
    if (!s.setupDone) return "setup";
    return "done";
  },

  setPricingDone(done = true) {
    const s = read();
    write({ ...s, pricingDone: !!done });
  },

  setSetupDone(done = true) {
    const s = read();
    write({ ...s, setupDone: !!done });
  },

  reset() {
    localStorage.removeItem(KEY);
  },
};
