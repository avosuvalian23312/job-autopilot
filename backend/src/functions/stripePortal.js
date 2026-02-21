"use strict";

const Stripe = require("stripe");
const { getSwaUserId } = require("../lib/swaUser");
const { readProfile } = require("../lib/billingStore.cjs");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": process.env.CORS_ORIGIN || "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(status, body) {
  return {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    body: JSON.stringify(body),
  };
}

function getHeader(req, name) {
  if (req?.headers?.get) return req.headers.get(name);
  const h = req?.headers || {};
  return h[name] || h[name.toLowerCase()] || null;
}

function getOrigin(request) {
  const origin = getHeader(request, "origin");
  if (origin) return origin;

  const proto = getHeader(request, "x-forwarded-proto") || "https";
  const host =
    getHeader(request, "x-forwarded-host") || getHeader(request, "host");
  if (host) return `${proto}://${host}`;

  return process.env.APP_ORIGIN || process.env.SITE_ORIGIN || "";
}

function normalizePath(pathValue) {
  const p = String(pathValue || "/AppSettings");
  return p.startsWith("/") ? p : `/${p}`;
}

async function readJsonBody(request) {
  if (typeof request?.json === "function") return await request.json();
  if (request?.body && typeof request.body === "object") return request.body;
  if (request?.rawBody) {
    try {
      return JSON.parse(request.rawBody.toString("utf8"));
    } catch {}
  }
  return {};
}

async function stripePortal(request, context) {
  try {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: CORS_HEADERS, body: "" };
    }

    if (request.method !== "POST") {
      return json(405, { ok: false, error: "Method not allowed" });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return json(500, { ok: false, error: "Missing STRIPE_SECRET_KEY" });
    }

    const authUserId = getSwaUserId(request);
    if (!authUserId) {
      return json(401, { ok: false, error: "Not authenticated" });
    }

    const body = await readJsonBody(request);
    const returnPath = normalizePath(body.returnPath || "/AppSettings");
    const flow = String(body.flow || "").trim().toLowerCase();
    const wantsCancelFlow =
      flow === "cancel" ||
      flow === "subscription_cancel" ||
      flow === "cancel_subscription";

    const origin = getOrigin(request);
    if (!origin) {
      return json(500, {
        ok: false,
        error:
          "Could not determine site origin. Set APP_ORIGIN in SWA env vars.",
      });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20",
    });

    const profile = await readProfile(authUserId);
    const plan = profile?.plan && typeof profile.plan === "object"
      ? profile.plan
      : {};

    let stripeCustomerId = String(plan.stripeCustomerId || "");
    const stripeSubscriptionId = String(plan.stripeSubscriptionId || "");

    if (!stripeCustomerId && stripeSubscriptionId) {
      try {
        const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
        stripeCustomerId =
          (typeof sub?.customer === "string" && sub.customer) ||
          String(sub?.customer?.id || "");
      } catch (e) {
        context?.log?.("stripePortal: subscription lookup failed", e?.message);
      }
    }

    if (!stripeCustomerId) {
      return json(400, {
        ok: false,
        error:
          "No Stripe billing profile found for this account yet. Upgrade first.",
      });
    }

    const sessionParams = {
      customer: stripeCustomerId,
      return_url: `${origin}${returnPath}`,
    };

    if (wantsCancelFlow) {
      if (!stripeSubscriptionId) {
        return json(400, {
          ok: false,
          error:
            "No active Stripe subscription found to cancel for this account.",
        });
      }

      sessionParams.flow_data = {
        type: "subscription_cancel",
        subscription_cancel: {
          subscription: stripeSubscriptionId,
        },
        after_completion: {
          type: "redirect",
          redirect: { return_url: `${origin}${returnPath}` },
        },
      };
    }

    const session = await stripe.billingPortal.sessions.create(sessionParams);

    return json(200, {
      ok: true,
      url: session.url,
      id: session.id,
      customerId: stripeCustomerId,
      flow: wantsCancelFlow ? "subscription_cancel" : "portal",
    });
  } catch (e) {
    context?.log?.error?.("stripePortal failed", e);
    return json(500, { ok: false, error: e?.message || String(e) });
  }
}

module.exports = { stripePortal };
