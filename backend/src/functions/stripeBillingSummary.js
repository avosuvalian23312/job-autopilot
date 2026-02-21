"use strict";

const Stripe = require("stripe");
const { getSwaUserId } = require("../lib/swaUser");
const { readProfile, setPlan } = require("../lib/billingStore.cjs");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": process.env.CORS_ORIGIN || "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(status, body) {
  return {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    body: JSON.stringify(body),
  };
}

function toIso(tsSeconds) {
  const n = Number(tsSeconds || 0);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

function cardSnippetFromPm(pm) {
  const c = pm?.card || null;
  if (!c) return null;
  return {
    id: String(pm?.id || ""),
    brand: String(c.brand || "").toUpperCase(),
    last4: String(c.last4 || ""),
    expMonth: Number(c.exp_month || 0) || null,
    expYear: Number(c.exp_year || 0) || null,
    funding: String(c.funding || ""),
    country: String(c.country || ""),
  };
}

function cardSnippetFromSourceCard(card, idHint = "") {
  if (!card) return null;
  return {
    id: String(card?.id || idHint || ""),
    brand: String(card?.brand || "").toUpperCase(),
    last4: String(card?.last4 || ""),
    expMonth: Number(card?.exp_month || 0) || null,
    expYear: Number(card?.exp_year || 0) || null,
    funding: String(card?.funding || ""),
    country: String(card?.country || ""),
  };
}

function cardSnippetFromCharge(charge) {
  const c = charge?.payment_method_details?.card || null;
  if (!c) return null;
  return {
    id: String(charge?.payment_method || charge?.id || ""),
    brand: String(c.brand || "").toUpperCase(),
    last4: String(c.last4 || ""),
    expMonth: Number(c.exp_month || 0) || null,
    expYear: Number(c.exp_year || 0) || null,
    funding: String(c.funding || ""),
    country: String(c.country || ""),
  };
}

function isNoSuchCustomerError(err) {
  return /no such customer/i.test(String(err?.message || ""));
}

function isNoSuchSubscriptionError(err) {
  return /no such subscription/i.test(String(err?.message || ""));
}

async function deriveCustomerIdFromSubscription(stripe, subscriptionId, context) {
  if (!subscriptionId) return "";
  try {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    return (
      (typeof sub?.customer === "string" && sub.customer) ||
      String(sub?.customer?.id || "")
    );
  } catch (e) {
    context?.log?.("stripeBillingSummary: derive customer from sub failed", e?.message);
    return "";
  }
}

async function stripeBillingSummary(request, context) {
  try {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: CORS_HEADERS, body: "" };
    }
    if (request.method !== "GET") {
      return json(405, { ok: false, error: "Method not allowed" });
    }

    const authUserId = getSwaUserId(request);
    if (!authUserId) {
      return json(401, { ok: false, error: "Not authenticated" });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return json(500, { ok: false, error: "Missing STRIPE_SECRET_KEY" });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20",
    });

    const profile = await readProfile(authUserId);
    const plan =
      profile?.plan && typeof profile.plan === "object" ? profile.plan : {};

    let stripeCustomerId = String(plan.stripeCustomerId || "");
    const stripeSubscriptionId = String(plan.stripeSubscriptionId || "");
    let subscription = null;
    let customer = null;
    let subscriptionMissing = false;

    if (stripeSubscriptionId) {
      try {
        subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
          expand: [
            "default_payment_method",
            "latest_invoice.payment_intent.payment_method",
            "latest_invoice.charge",
          ],
        });
      } catch (e) {
        if (isNoSuchSubscriptionError(e)) {
          subscriptionMissing = true;
        }
        context?.log?.("stripeBillingSummary: sub lookup failed", e?.message);
      }
    }

    if (!stripeCustomerId && subscription?.customer) {
      stripeCustomerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : String(subscription.customer.id || "");
    }

    const subscriptionStatus = String(subscription?.status || plan.status || "inactive").toLowerCase();
    const reconciledPlanId =
      subscriptionMissing || ["canceled", "incomplete_expired"].includes(subscriptionStatus)
        ? "free"
        : String(plan.planId || "free");
    const reconciledStatus =
      subscriptionMissing
        ? "canceled"
        : String(subscriptionStatus || plan.status || "inactive");

    const reconcilePatch = {};
    if (reconciledPlanId !== String(plan.planId || "free")) {
      reconcilePatch.planId = reconciledPlanId;
    }
    if (reconciledStatus && reconciledStatus !== String(plan.status || "")) {
      reconcilePatch.status = reconciledStatus;
    }
    if (stripeCustomerId && stripeCustomerId !== String(plan.stripeCustomerId || "")) {
      reconcilePatch.stripeCustomerId = stripeCustomerId;
    }
    if (stripeSubscriptionId && stripeSubscriptionId !== String(plan.stripeSubscriptionId || "")) {
      reconcilePatch.stripeSubscriptionId = stripeSubscriptionId;
    }
    if (Object.keys(reconcilePatch).length > 0) {
      await setPlan(authUserId, reconcilePatch);
    }

    if (stripeSubscriptionId) {
      const subCustomerId = await deriveCustomerIdFromSubscription(
        stripe,
        stripeSubscriptionId,
        context
      );
      if (subCustomerId && subCustomerId !== stripeCustomerId) {
        stripeCustomerId = subCustomerId;
        await setPlan(authUserId, { stripeCustomerId: subCustomerId });
      }
    }

    if (stripeCustomerId) {
      try {
        customer = await stripe.customers.retrieve(stripeCustomerId, {
          expand: ["invoice_settings.default_payment_method", "default_source"],
        });
      } catch (e) {
        if (isNoSuchCustomerError(e) && stripeSubscriptionId) {
          const recoveredCustomerId = await deriveCustomerIdFromSubscription(
            stripe,
            stripeSubscriptionId,
            context
          );
          if (recoveredCustomerId) {
            stripeCustomerId = recoveredCustomerId;
            await setPlan(authUserId, { stripeCustomerId: recoveredCustomerId });
            try {
              customer = await stripe.customers.retrieve(stripeCustomerId, {
                expand: ["invoice_settings.default_payment_method", "default_source"],
              });
            } catch (retryErr) {
              context?.log?.(
                "stripeBillingSummary: customer retry lookup failed",
                retryErr?.message
              );
            }
          } else {
            context?.log?.(
              "stripeBillingSummary: stale customer id with no recoverable subscription customer",
              e?.message
            );
          }
        } else {
          context?.log?.("stripeBillingSummary: customer lookup failed", e?.message);
        }
      }
    }

    let paymentMethod = null;
    let paymentMethodSource = "";

    function setPayment(snippet, source) {
      if (paymentMethod || !snippet) return;
      paymentMethod = snippet;
      paymentMethodSource = String(source || "");
    }

    // 1) Subscription default payment method (best source for active plans)
    if (subscription?.default_payment_method) {
      if (typeof subscription.default_payment_method === "object") {
        setPayment(
          cardSnippetFromPm(subscription.default_payment_method),
          "subscription.default_payment_method"
        );
      } else {
        try {
          const pm = await stripe.paymentMethods.retrieve(
            String(subscription.default_payment_method)
          );
          setPayment(cardSnippetFromPm(pm), "subscription.default_payment_method");
        } catch {}
      }
    }

    // 2) Latest invoice payment intent method
    if (
      !paymentMethod &&
      subscription?.latest_invoice?.payment_intent?.payment_method
    ) {
      const piMethod = subscription.latest_invoice.payment_intent.payment_method;
      if (typeof piMethod === "object") {
        setPayment(cardSnippetFromPm(piMethod), "latest_invoice.payment_intent");
      } else {
        try {
          const pm = await stripe.paymentMethods.retrieve(String(piMethod));
          setPayment(cardSnippetFromPm(pm), "latest_invoice.payment_intent");
        } catch {}
      }
    }

    // 3) Customer invoice settings default payment method
    if (!paymentMethod && customer?.invoice_settings?.default_payment_method) {
      const defaultPm = customer.invoice_settings.default_payment_method;
      if (typeof defaultPm === "object") {
        setPayment(cardSnippetFromPm(defaultPm), "customer.invoice_settings.default");
      } else {
        const pmId = String(defaultPm);
        try {
          const pm = await stripe.paymentMethods.retrieve(pmId);
          setPayment(cardSnippetFromPm(pm), "customer.invoice_settings.default");
        } catch {}
      }
    }

    // 4) Legacy customer default source card
    if (!paymentMethod && customer?.default_source) {
      const source = customer.default_source;
      if (typeof source === "object") {
        setPayment(
          cardSnippetFromSourceCard(source, source?.id || ""),
          "customer.default_source"
        );
      } else if (stripeCustomerId) {
        try {
          const src = await stripe.customers.retrieveSource(
            stripeCustomerId,
            String(source)
          );
          setPayment(
            cardSnippetFromSourceCard(src, String(source)),
            "customer.default_source"
          );
        } catch {}
      }
    }

    // 5) Charge-level card details fallback
    if (!paymentMethod && subscription?.latest_invoice?.charge) {
      const ch = subscription.latest_invoice.charge;
      if (typeof ch === "object") {
        setPayment(cardSnippetFromCharge(ch), "latest_invoice.charge");
      } else {
        try {
          const charge = await stripe.charges.retrieve(String(ch));
          setPayment(cardSnippetFromCharge(charge), "latest_invoice.charge");
        } catch {}
      }
    }

    // 6) Fallback to first saved payment method card
    if (!paymentMethod && stripeCustomerId) {
      try {
        const pms = await stripe.paymentMethods.list({
          customer: stripeCustomerId,
          type: "card",
          limit: 1,
        });
        const pm = Array.isArray(pms?.data) ? pms.data[0] : null;
        if (pm) {
          setPayment(cardSnippetFromPm(pm), "customer.payment_methods.list");
        }
      } catch {}
    }

    // 7) Fallback to first legacy source card
    if (!paymentMethod && stripeCustomerId) {
      try {
        const cards = await stripe.customers.listSources(stripeCustomerId, {
          object: "card",
          limit: 1,
        });
        const card = Array.isArray(cards?.data) ? cards.data[0] : null;
        if (card) {
          setPayment(cardSnippetFromSourceCard(card), "customer.sources.list");
        }
      } catch {}
    }

    let paymentMethodMissingReason = "";
    if (!paymentMethod) {
      const subStatus = String(subscription?.status || plan.status || "").toLowerCase();
      if (subStatus === "trialing") {
        paymentMethodMissingReason =
          "No card is attached yet (subscription is trialing).";
      } else if (stripeCustomerId) {
        paymentMethodMissingReason =
          "No default card was found on this Stripe customer.";
      } else {
        paymentMethodMissingReason =
          "No Stripe customer is linked to this account yet.";
      }
    }

    return json(200, {
      ok: true,
      connected: !!stripeCustomerId,
      customerId: stripeCustomerId || null,
      subscriptionId: stripeSubscriptionId || null,
      subscriptionStatus: String(reconciledStatus || "inactive"),
      currentPeriodEnd: toIso(subscription?.current_period_end),
      planId: String(reconciledPlanId || "free"),
      paymentMethod,
      paymentMethodSource: paymentMethodSource || null,
      paymentMethodMissingReason: paymentMethod ? null : paymentMethodMissingReason,
    });
  } catch (e) {
    context?.log?.error?.("stripeBillingSummary failed", e);
    return json(500, { ok: false, error: e?.message || String(e) });
  }
}

module.exports = { stripeBillingSummary };
