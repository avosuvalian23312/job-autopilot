// src/pages/Pricing.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Check, Sparkles, Zap, Rocket, HelpCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { pagesConfig } from "@/pages.config";

const plans = [
  {
    id: "free",
    name: "Free",
    price: 0,
    credits: 3,
    description: "Try it out (no card needed)",
    features: [
      "3 credits per month (3 generations)",
      "Basic application tracking",
      "Resume bullet suggestions",
      "Cover letter generation",
      "Email support",
    ],
    icon: Zap,
    popular: false,
    cta: "Continue Free",
  },
  {
    id: "pro",
    name: "Pro",
    price: 14.99,
    credits: 20,
    description: "Best for active job hunters",
    features: [
      "20 credits per month",
      "Unlimited application tracking",
      "Analytics dashboard",
      "Export to .docx",
      "Priority generation",
      "Email support",
    ],
    icon: Sparkles,
    popular: true,
    cta: "Start Pro",
  },
  {
    // IMPORTANT: backend checkout expects "max" (your earlier plan map uses basic/pro/max)
    id: "max",
    name: "Power",
    price: 19.99,
    credits: 60,
    description: "Best for heavy users",
    features: [
      "60 credits per month",
      "Everything in Pro",
      "Fastest AI generation",
      "Custom resume templates",
      "Priority support",
    ],
    icon: Rocket,
    popular: false,
    cta: "Start Power",
  },
];

function getSetupPath() {
  const Pages = pagesConfig?.Pages || {};
  const keys = Object.keys(Pages);
  const setupKey =
    keys.find((k) => k.toLowerCase() === "setup") ||
    keys.find((k) => k.toLowerCase() === "onboardingsetup") ||
    "Setup";
  return `/${setupKey}`;
}

async function postJson(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body || {}),
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

function currentPathWithSearch() {
  try {
    const p = window.location.pathname || "/pricing";
    const s = window.location.search || "";
    const safeP = p.startsWith("/") ? p : "/pricing";
    return `${safeP}${s}`;
  } catch {
    return "/pricing";
  }
}

// Attempt to get a stable user identity for Stripe metadata.
// Works across different response shapes.
function extractUserId(me) {
  if (!me) return null;
  return (
    me.userId ||
    me.id ||
    me.sub ||
    me.user?.id ||
    me.user?.userId ||
    me.profile?.id ||
    me.profile?.userId ||
    null
  );
}

function extractEmail(me) {
  if (!me) return null;
  return (
    me.email ||
    me.mail ||
    me.user?.email ||
    me.user?.mail ||
    me.profile?.email ||
    null
  );
}

async function fetchMe() {
  const candidates = ["/api/profile/me", "/api/userinfo"];

  for (const url of candidates) {
    try {
      const res = await fetch(url, { method: "GET", credentials: "include" });
      if (!res.ok) continue;

      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }

      // accept common shapes
      if (!data) continue;
      if (data.ok === false) continue;

      // If the endpoint wraps the user:
      const maybe =
        data.profile || data.user || data.me || data.account || data;

      // require *some* identity field
      if (extractUserId(maybe) || extractEmail(maybe)) return maybe;
      // still return it if it looks like a user object
      if (typeof maybe === "object") return maybe;
    } catch {
      // ignore and try next
    }
  }

  return null;
}

export default function Pricing() {
  const navigate = useNavigate();
  const [loadingPlan, setLoadingPlan] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [me, setMe] = useState(null);
  const [meLoading, setMeLoading] = useState(true);

  const forceMode = useMemo(() => {
    try {
      const qs = new URLSearchParams(window.location.search);
      return qs.get("force") === "pricing";
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setMeLoading(true);
      const user = await fetchMe();
      if (!alive) return;
      setMe(user);
      setMeLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const handleSelectPlan = async (plan) => {
    if (loadingPlan) return;
    setErrorMsg("");
    setLoadingPlan(plan.id);

    await new Promise((r) => setTimeout(r, 150));

    const successPath = getSetupPath();
    const cancelPath = currentPathWithSearch();

    // Free never calls Stripe
    if (plan.id === "free") {
      setLoadingPlan(null);
      navigate(successPath, { replace: true });
      return;
    }

    // Require identity for paid plans so webhooks can grant credits correctly
    const userId = extractUserId(me);
    const email = extractEmail(me);

    if (!userId && !email) {
      setLoadingPlan(null);
      setErrorMsg("Please sign in before upgrading so we can attach the subscription to your account.");
      // Kick them to setup/login flow
      navigate(successPath, { replace: true });
      return;
    }

    try {
      // IMPORTANT: matches backend/index.js route: route: "stripe/checkout"
      const resp = await postJson("/api/stripe/checkout", {
        planId: plan.id, // pro | max
        successPath,     // server builds full URL
        cancelPath,
        userId,
        email,
      });

      if (!resp.ok || !resp.data?.ok || !resp.data?.url) {
        console.error("Checkout failed:", resp);
        setLoadingPlan(null);

        const msg =
          resp.data?.error ||
          resp.data?.message ||
          `Checkout failed (HTTP ${resp.status})`;

        // If you haven't set STRIPE_PRICE_MAX yet, you'll see a "missing env var" error here.
        setErrorMsg(msg);
        return;
      }

      window.location.assign(resp.data.url);
    } catch (e) {
      console.error(e);
      setLoadingPlan(null);
      setErrorMsg(e?.message || "Checkout failed. Try again.");
    }
  };

  return (
    <div className="min-h-screen bg-[hsl(240,10%,4%)]">
      <header className="border-b border-white/5 bg-[hsl(240,10%,4%)]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center">
              <Rocket className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white text-lg">Job Autopilot</span>
          </div>

          <div className="text-xs text-white/40">
            {meLoading ? "Checking session..." : me ? "Signed in" : "Not signed in"}
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-16 md:py-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Choose your plan
          </h1>
          <p className="text-lg text-white/50 mb-2">Start free. Upgrade anytime.</p>
          <p className="text-sm text-white/30 mb-6">
            Secure checkout via Stripe. Cancel anytime.
          </p>

          {forceMode ? (
            <div className="max-w-xl mx-auto mb-6 px-4 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-sm text-amber-200">
              Test mode: opened via{" "}
              <span className="font-mono">?force=pricing</span> (bypassing onboarding
              redirect)
            </div>
          ) : null}

          {errorMsg ? (
            <div className="max-w-xl mx-auto mb-6 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-sm text-red-200">
              {errorMsg}
            </div>
          ) : null}

          <Button
            onClick={() => handleSelectPlan(plans[0])}
            disabled={loadingPlan === "free"}
            className="bg-white/10 hover:bg-white/15 text-white border border-white/20 px-8 py-3 rounded-xl text-base font-medium mb-8"
          >
            {loadingPlan === "free" ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin inline" />
                Starting...
              </>
            ) : (
              "Continue Free"
            )}
          </Button>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {plans.map((plan, i) => {
            // If you haven't configured STRIPE_PRICE_MAX yet, Power will error.
            // We keep it enabled but you can flip this to true to hard-disable until ready.
            const comingSoon = false;

            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className={`relative rounded-2xl p-8 ${
                  plan.popular
                    ? "bg-gradient-to-b from-purple-500/10 to-transparent border-2 border-purple-500/30"
                    : "glass-card"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-purple-600 text-white text-xs font-medium flex items-center gap-1.5 z-10">
                    <Sparkles className="w-3 h-3" />
                    Most Popular
                  </div>
                )}

                <div className="flex items-center gap-3 mb-4">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      plan.popular ? "bg-purple-600/20" : "bg-white/5"
                    }`}
                  >
                    <plan.icon className="w-6 h-6 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1.5 text-xs text-white/40 cursor-help">
                            <span>{plan.credits} credits/month</span>
                            <HelpCircle className="w-3 h-3" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">1 credit = 1 AI generation</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>

                <p className="text-sm text-white/40 mb-6">{plan.description}</p>

                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-4xl font-bold text-white">${plan.price}</span>
                  <span className="text-white/40">/month</span>
                </div>

                <Button
                  onClick={() => handleSelectPlan(plan)}
                  disabled={loadingPlan === plan.id || plan.id === "free" || comingSoon}
                  className={`w-full py-6 rounded-xl text-base font-medium mb-6 transition-all ${
                    plan.popular
                      ? "bg-purple-600 hover:bg-purple-500 text-white shadow-lg hover:shadow-purple-500/50 hover:scale-[1.02]"
                      : "bg-white/5 hover:bg-white/10 text-white border border-white/10"
                  }`}
                >
                  {comingSoon ? (
                    "Coming soon"
                  ) : loadingPlan === plan.id ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin inline" />
                      Redirecting...
                    </>
                  ) : (
                    plan.cta
                  )}
                </Button>

                <ul className="space-y-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-sm text-white/60">
                      <Check className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            );
          })}
        </div>

        <div className="glass-card rounded-2xl p-6 text-center">
          <p className="text-white/60 text-sm mb-2">
            Credit packs are coming next (one-time purchases).
          </p>
          <p className="text-white/30 text-xs">
            Subscriptions grant monthly credits automatically via Stripe webhooks.
          </p>
        </div>
      </div>
    </div>
  );
}
