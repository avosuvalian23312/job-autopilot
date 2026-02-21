"use strict";

const { getSwaUserId } = require("../lib/swaUser");
const Stripe = require("stripe");
const { readProfile, setPlan } = require("../lib/billingStore.cjs");

module.exports = async (request, context) => {
  const userId = getSwaUserId(request);
  if (!userId) {
    return { status: 401, jsonBody: { ok: false, error: "Not authenticated" } };
  }

  try {
    const profile = await readProfile(userId);

    // Reconcile Stripe subscription status so profile reflects cancellation immediately.
    const stripeSubscriptionId = String(profile?.plan?.stripeSubscriptionId || "");
    if (stripeSubscriptionId && process.env.STRIPE_SECRET_KEY) {
      try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
          apiVersion: "2024-06-20",
        });
        const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
        const subStatus = String(subscription?.status || "").toLowerCase();
        const subCustomerId =
          (typeof subscription?.customer === "string" && subscription.customer) ||
          String(subscription?.customer?.id || "");

        const patch = {};
        if (subCustomerId && subCustomerId !== String(profile?.plan?.stripeCustomerId || "")) {
          patch.stripeCustomerId = subCustomerId;
        }

        if (["canceled", "incomplete_expired"].includes(subStatus)) {
          if (String(profile?.plan?.planId || "free") !== "free") {
            patch.planId = "free";
          }
          if (String(profile?.plan?.status || "") !== "canceled") {
            patch.status = "canceled";
          }
        } else if (subStatus && subStatus !== String(profile?.plan?.status || "")) {
          patch.status = subStatus;
        }

        if (Object.keys(patch).length > 0) {
          await setPlan(userId, patch);
          profile.plan = { ...(profile.plan || {}), ...patch };
        }
      } catch (e) {
        const msg = String(e?.message || "");
        if (/no such subscription/i.test(msg)) {
          const patch = { planId: "free", status: "canceled" };
          await setPlan(userId, patch);
          profile.plan = { ...(profile.plan || {}), ...patch };
        } else {
          context?.log?.("profileMe stripe reconcile skipped", msg);
        }
      }
    }

    return {
      status: 200,
      jsonBody: { ok: true, profile },
    };
  } catch (e) {
    context?.log?.error?.("profileMe failed", e);
    return { status: 500, jsonBody: { ok: false, error: e?.message || String(e) } };
  }
};
