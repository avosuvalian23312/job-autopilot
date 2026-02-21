"use strict";

const Stripe = require("stripe");
const { getSwaUserId } = require("../lib/swaUser");

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

// Works in both Azure Functions request styles
function getHeader(req, name) {
  if (req?.headers?.get) return req.headers.get(name);
  const h = req?.headers || {};
  return h[name] || h[name.toLowerCase()] || null;
}

function getOrigin(request) {
  // 1) direct origin (when browser sends it)
  const origin = getHeader(request, "origin");
  if (origin) return origin;

  // 2) forwarded host/proto (typical behind SWA)
  const proto = getHeader(request, "x-forwarded-proto") || "https";
  const host =
    getHeader(request, "x-forwarded-host") || getHeader(request, "host");
  if (host) return `${proto}://${host}`;

  // 3) explicit env fallback
  return process.env.APP_ORIGIN || process.env.SITE_ORIGIN || "";
}

async function readJsonBody(request) {
  if (typeof request?.json === "function") return await request.json();
  // classic model: body already parsed or rawBody exists
  if (request?.body && typeof request.body === "object") return request.body;
  if (request?.rawBody) {
    try {
      return JSON.parse(request.rawBody.toString("utf8"));
    } catch {}
  }
  return {};
}

function toPositiveInt(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

module.exports = async (request, context) => {
  try {
    // Preflight
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

    // Canonical plan map used by checkout + webhook metadata fallback
    const PLANS = {
      starter: {
        priceId: process.env.STRIPE_PRICE_STARTER || process.env.STRIPE_PRICE_BASIC,
        creditsPerMonth: Number(process.env.STARTER_CREDITS_PER_MONTH || process.env.BASIC_CREDITS_PER_MONTH || 50) || 50,
      },
      pro: {
        priceId: process.env.STRIPE_PRICE_PRO,
        creditsPerMonth: Number(process.env.PRO_CREDITS_PER_MONTH || 150) || 150,
      },
      team: {
        priceId: process.env.STRIPE_PRICE_TEAM || process.env.STRIPE_PRICE_POWER || process.env.STRIPE_PRICE_MAX,
        creditsPerMonth: Number(process.env.TEAM_CREDITS_PER_MONTH || process.env.POWER_CREDITS_PER_MONTH || process.env.MAX_CREDITS_PER_MONTH || 300) || 300,
      },
      max: {
        priceId: process.env.STRIPE_PRICE_MAX || process.env.STRIPE_PRICE_POWER || process.env.STRIPE_PRICE_TEAM,
        creditsPerMonth: Number(process.env.MAX_CREDITS_PER_MONTH || process.env.POWER_CREDITS_PER_MONTH || process.env.TEAM_CREDITS_PER_MONTH || 300) || 300,
      },
    };

    const body = await readJsonBody(request);

    const checkoutType = String(body.checkoutType || body.type || "").toLowerCase().trim();
    const planId = String(body.planId || "").toLowerCase().trim();
    const email = body.email ? String(body.email) : null;
    const creditsRequested = toPositiveInt(
      body.credits || body.creditAmount || body.packageCredits
    );

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20",
    });
    const stripeKeyMode = String(process.env.STRIPE_SECRET_KEY || "").startsWith("sk_live_")
      ? "live"
      : String(process.env.STRIPE_SECRET_KEY || "").startsWith("sk_test_")
      ? "test"
      : "unknown";

    const origin = getOrigin(request);
    if (!origin) {
      return json(500, {
        ok: false,
        error:
          "Could not determine site origin. Set APP_ORIGIN in SWA env vars (e.g. https://your-site.azurestaticapps.net).",
      });
    }

    const successPath = String(body.successPath || "/billing/success");
    const cancelPath = String(body.cancelPath || "/pricing");

    const normalizePath = (p) => (p.startsWith("/") ? p : `/${p}`);

    const creditPackages = {
      50: {
        credits: 50,
        amountCents: 499,
        priceId: process.env.STRIPE_PRICE_CREDITS_50 || "",
      },
      150: {
        credits: 150,
        amountCents: 1999,
        priceId: process.env.STRIPE_PRICE_CREDITS_150 || "",
      },
      300: {
        credits: 300,
        amountCents: 2999,
        priceId: process.env.STRIPE_PRICE_CREDITS_300 || "",
      },
      500: {
        credits: 500,
        amountCents: 3999,
        priceId: process.env.STRIPE_PRICE_CREDITS_500 || "",
      },
    };

    const isCreditsCheckout = checkoutType === "credits" || creditsRequested > 0;

    let session = null;

    if (isCreditsCheckout) {
      const pkg = creditPackages[creditsRequested];
      if (!pkg) {
        return json(400, {
          ok: false,
          error: "Invalid credits package",
          expected: Object.keys(creditPackages).map((k) => Number(k)),
          got: creditsRequested || null,
        });
      }

      const lineItem = pkg.priceId
        ? { price: pkg.priceId, quantity: 1 }
        : {
            price_data: {
              currency: "usd",
              unit_amount: pkg.amountCents,
              product_data: {
                name: `${pkg.credits} Credits Pack`,
                description: `One-time purchase of ${pkg.credits} Job Autopilot credits`,
              },
            },
            quantity: 1,
          };

      context?.log?.("stripeCheckout", {
        checkoutType: "credits",
        credits: pkg.credits,
        amountCents: pkg.amountCents,
        stripePriceId: pkg.priceId || null,
        stripeKeyMode,
        origin,
      });

      session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [lineItem],
        success_url: `${origin}${normalizePath(
          successPath
        )}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}${normalizePath(cancelPath)}?canceled=1`,
        customer_email: email || undefined,
        client_reference_id: authUserId || undefined,
        metadata: {
          userId: authUserId,
          checkoutType: "credits",
          credits: String(pkg.credits),
          amountCents: String(pkg.amountCents),
        },
        payment_intent_data: {
          metadata: {
            userId: authUserId,
            checkoutType: "credits",
            credits: String(pkg.credits),
          },
        },
      });
    } else {
      if (!planId || !PLANS[planId]) {
        return json(400, {
          ok: false,
          error: "Invalid planId",
          expected: Object.keys(PLANS),
          got: planId || null,
        });
      }

      const { priceId, creditsPerMonth } = PLANS[planId];
      if (!priceId) {
        return json(500, {
          ok: false,
          error: `Missing Stripe price id env var for plan '${planId}'`,
        });
      }

      context?.log?.("stripeCheckout", {
        checkoutType: "subscription",
        planId,
        priceId,
        stripeKeyMode,
        origin,
        hasEmail: !!email,
      });

      session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],

        success_url: `${origin}${normalizePath(
          successPath
        )}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}${normalizePath(cancelPath)}?canceled=1`,

        customer_email: email || undefined,
        client_reference_id: authUserId || undefined,

        metadata: { userId: authUserId, planId },

        subscription_data: {
          metadata: {
            userId: authUserId,
            planId,
            creditsPerMonth: String(creditsPerMonth || 0),
          },
        },
      });
    }

    return json(200, {
      ok: true,
      url: session.url,
      id: session.id,
      debug: {
        checkoutType: isCreditsCheckout ? "credits" : "subscription",
        planId: planId || null,
        credits: isCreditsCheckout ? creditsRequested : null,
        stripeKeyMode,
      },
    });
  } catch (e) {
    context?.log?.error?.("stripeCheckout failed", e);
    return json(500, { ok: false, error: e?.message || String(e) });
  }
};
