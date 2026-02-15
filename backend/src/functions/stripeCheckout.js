"use strict";

const Stripe = require("stripe");

function json(status, body) {
  return {
    status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

module.exports = async (request, context) => {
  try {
    // Preflight (safe even if not needed)
    if (request.method === "OPTIONS") {
      return {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        body: "",
      };
    }

    if (request.method !== "POST") {
      return json(405, { ok: false, error: "Method not allowed" });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return json(500, { ok: false, error: "Missing STRIPE_SECRET_KEY" });
    }

    // ---- Plan map (ADD THESE ENV VARS in SWA settings) ----
    // STRIPE_PRICE_BASIC, STRIPE_PRICE_PRO, STRIPE_PRICE_MAX
    const PLANS = {
      basic: {
        priceId: process.env.STRIPE_PRICE_BASIC,
        creditsPerMonth: Number(process.env.BASIC_CREDITS_PER_MONTH || 0) || 0,
      },
      pro: {
        priceId: process.env.STRIPE_PRICE_PRO,
        creditsPerMonth: Number(process.env.PRO_CREDITS_PER_MONTH || 0) || 0,
      },
      max: {
        priceId: process.env.STRIPE_PRICE_MAX,
        creditsPerMonth: Number(process.env.MAX_CREDITS_PER_MONTH || 0) || 0,
      },
    };

    let body = {};
    try {
      body = await request.json();
    } catch {
      // If request body isn't JSON
      return json(400, { ok: false, error: "Invalid JSON body" });
    }

    const planId = String(body.planId || "").toLowerCase().trim();
    const userId = body.userId ? String(body.userId) : null;
    const email = body.email ? String(body.email) : null;

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
        error: `Missing env var for priceId (STRIPE_PRICE_${planId.toUpperCase()})`,
      });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20",
    });

    // Build absolute URLs Stripe requires
    const origin = (() => {
      try {
        return new URL(request.url).origin;
      } catch {
        return request.headers.get("origin") || "";
      }
    })();

    // You can override these from frontend if you want
    const successPath = body.successPath ? String(body.successPath) : "/billing/success";
    const cancelPath = body.cancelPath ? String(body.cancelPath) : "/pricing";

    if (!origin) {
      return json(500, { ok: false, error: "Could not determine request origin" });
    }

    // Debug (safe)
    context?.log?.("stripeCheckout", { planId, hasUserId: !!userId, hasEmail: !!email });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],

      success_url: `${origin}${successPath}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${cancelPath}?canceled=1`,

      // Optional (helps associate later)
      customer_email: email || undefined,
      client_reference_id: userId || undefined,

      // Session metadata (available in checkout.session.completed)
      metadata: {
        userId: userId || "",
        planId,
      },

      // IMPORTANT: put metadata on the subscription so invoice.paid can read it
      subscription_data: {
        metadata: {
          userId: userId || "",
          planId,
          creditsPerMonth: String(creditsPerMonth || 0),
        },
      },
    });

    return json(200, { ok: true, url: session.url, id: session.id });
  } catch (e) {
    context?.log?.error?.("stripeCheckout failed", e);
    return json(500, { ok: false, error: e?.message || String(e) });
  }
};
