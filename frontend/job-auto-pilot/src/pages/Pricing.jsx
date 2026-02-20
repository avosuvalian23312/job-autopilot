// src/pages/Pricing.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Check, Sparkles, Rocket, HelpCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { pagesConfig } from "@/pages.config";
import { onboarding } from "@/lib/onboarding";

const plans = [
  {
    id: "starter",
    name: "Starter",
    price: 9,
    originalPrice: null,
    saveText: null,
    credits: 50,
    description: "Great for getting started",
    features: [
      "50 credits per month",
      "Resume generation",
      "Cover letter generation",
      "Basic support",
    ],
    popular: false,
    badges: [],
    cta: "Start Starter",
  },
  {
    id: "pro",
    name: "Pro",
    price: 14.99,
    originalPrice: 24.99,
    saveText: "Save 40%",
    credits: 150,
    description: "Best for active job hunters",
    features: [
      "150 credits per month",
      "Everything in Starter",
      "Priority generation",
      "Priority support",
    ],
    popular: true,
    badges: ["Most Popular"],
    limitedBadge: "Limited Time Offer",
    cta: "Start Pro",
  },
  {
    id: "team",
    name: "Team",
    price: 19.99,
    originalPrice: 34.99,
    saveText: "Save 43%",
    credits: 300,
    description: "Higher monthly limit for heavy usage",
    features: [
      "300 credits per month",
      "Everything in Pro",
      "Team sharing",
      "Higher monthly limit",
    ],
    popular: false,
    badges: ["Best Value"],
    limitedBadge: null,
    cta: "Start Team",
  },
];

function getSetupPath() {
  const Pages = pagesConfig?.Pages || {};
  const keys = Object.keys(Pages);
  const setupKey =
    keys.find((k) => k.toLowerCase() === "setup") ||
    keys.find((k) => k.toLowerCase() === "onboardingsetup") ||
    "setup";
  const p = `/${setupKey}`;
  return p.startsWith("/") ? p : "/setup";
}

function getCancelPath() {
  try {
    const p = window.location.pathname || "/Pricing";
    const s = window.location.search || "";
    const safe = p.startsWith("/") ? p : "/Pricing";
    return `${safe}${s}`;
  } catch {
    return "/Pricing";
  }
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

export default function Pricing() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [loadingPlan, setLoadingPlan] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const forceMode = useMemo(() => {
    try {
      const qs = new URLSearchParams(window.location.search);
      return qs.get("force") === "pricing";
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    try {
      const qs = new URLSearchParams(window.location.search);
      const sessionId = qs.get("session_id");
      if (!sessionId || forceMode) return;

      qc.invalidateQueries({ queryKey: ["onboarding:me"] });
      navigate(`${getSetupPath()}?session_id=${encodeURIComponent(sessionId)}`, {
        replace: true,
      });
    } catch {
      // no-op
    }
  }, [forceMode, navigate, qc]);

  const handleSelectPlan = async (plan) => {
    if (loadingPlan) return;

    setErrorMsg("");
    setLoadingPlan(plan.id);

    try {
      const successPath = getSetupPath();
      const cancelPath = getCancelPath();

      // Persist selected plan in backend profile (no local storage).
      if (typeof onboarding?.setSelectedPlan === "function") {
        await onboarding.setSelectedPlan(plan.id);
      }

      const resp = await postJson("/api/stripe/checkout", {
        planId: plan.id,
        successPath,
        cancelPath,
      });

      if (!resp.ok || !resp.data?.ok || !resp.data?.url) {
        const msg =
          resp.data?.error ||
          resp.data?.message ||
          resp.data?.detail ||
          `Checkout failed (HTTP ${resp.status})`;
        setErrorMsg(msg);
        setLoadingPlan(null);
        return;
      }

      window.location.assign(resp.data.url);
    } catch (e) {
      setErrorMsg(e?.message || "Checkout failed. Try again.");
      setLoadingPlan(null);
    }
  };

  const formatPrice = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value ?? "");
    return Number.isInteger(n) ? `${n}` : n.toFixed(2);
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(920px_500px_at_12%_-12%,rgba(139,92,246,0.2),transparent_60%),radial-gradient(780px_500px_at_95%_5%,rgba(6,182,212,0.14),transparent_62%),linear-gradient(180deg,hsl(222,28%,8%),hsl(228,27%,7%))]">
      <header className="border-b border-white/5 bg-[hsl(225,24%,8%)]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center">
              <Rocket className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white text-lg">Job Autopilot</span>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-16 md:py-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="text-center mb-10"
        >
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
            Choose your plan
          </h1>
          <p className="text-lg text-white/55 mb-2">
            Secure checkout via Stripe.
          </p>
          <p className="text-sm text-white/40 mb-6">
            Credits are granted from your active subscription plan.
          </p>
          <div className="mb-4 inline-flex items-center rounded-full border border-violet-300/25 bg-violet-500/10 px-4 py-1.5 text-sm text-violet-100/95">
            Trusted by 2,000+ job seekers
          </div>
          <p className="text-xs text-white/45">No hidden fees • Cancel anytime</p>

          {forceMode ? (
            <div className="max-w-xl mx-auto mb-6 px-4 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-sm text-amber-200">
              Test mode: opened via <span className="font-mono">?force=pricing</span>
            </div>
          ) : null}

          {errorMsg ? (
            <div className="max-w-xl mx-auto mb-6 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-sm text-red-200">
              {errorMsg}
            </div>
          ) : null}
        </motion.div>

        <div className="mx-auto mb-8 h-px max-w-5xl bg-gradient-to-r from-transparent via-white/15 to-transparent" />

        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.18, ease: "easeOut" }}
              className={`relative rounded-3xl p-8 overflow-hidden transform-gpu transition-all duration-150 ease-out hover:scale-[1.02] hover:-translate-y-0.5 ${
                plan.id === "pro"
                  ? "border border-violet-300/35 bg-[linear-gradient(180deg,rgba(139,92,246,0.16),rgba(10,10,16,0.72))] shadow-[0_20px_50px_rgba(139,92,246,0.22)]"
                  : plan.id === "team"
                  ? "border border-cyan-300/20 bg-[linear-gradient(180deg,rgba(56,189,248,0.1),rgba(10,10,16,0.72))] shadow-[0_18px_44px_rgba(6,182,212,0.1)]"
                  : "border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] opacity-[0.95] shadow-[0_16px_38px_rgba(0,0,0,0.34)]"
              }`}
            >
              {plan.id === "pro" ? (
                <div className="pointer-events-none absolute -inset-x-10 -top-20 h-56 rounded-full bg-[radial-gradient(circle_at_center,rgba(139,92,246,0.26),transparent_70%)] blur-2xl" />
              ) : null}

              {plan.badges?.length ? (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10 flex flex-wrap justify-center gap-2">
                  {plan.badges.map((badge) => (
                    <span
                      key={badge}
                      className={`shine-loop-container relative inline-flex items-center gap-1.5 overflow-hidden rounded-full border px-3 py-1 text-[11px] font-semibold tracking-[0.02em] ${
                        plan.id === "team"
                          ? "border-cyan-300/35 bg-gradient-to-r from-cyan-500/35 to-sky-500/25 text-cyan-100"
                          : "border-violet-300/35 bg-gradient-to-r from-violet-500/35 to-purple-500/25 text-violet-100"
                      }`}
                    >
                      <Sparkles className="w-3 h-3 relative z-[2]" />
                      <span className="relative z-[2]">{badge}</span>
                      <span aria-hidden className="shine-loop-overlay opacity-35" />
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="flex items-center gap-3 mb-4 mt-2">
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    plan.id === "pro"
                      ? "bg-violet-500/22 border border-violet-300/25"
                      : plan.id === "team"
                      ? "bg-cyan-500/18 border border-cyan-300/20"
                      : "bg-white/5 border border-white/10"
                  }`}
                >
                  <Rocket className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1.5 text-xs text-white/45 cursor-help">
                          <span>{plan.credits} credits/month</span>
                          <HelpCircle className="w-3 h-3" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">Credits are granted after successful payment events.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>

              <p className="text-sm text-white/50 mb-5">{plan.description}</p>

              <div className="relative mb-4">
                {plan.limitedBadge ? (
                  <div className="mb-1 inline-flex rounded-full border border-violet-300/35 bg-violet-500/18 px-2.5 py-0.5 text-[11px] font-semibold text-violet-100">
                    {plan.limitedBadge}
                  </div>
                ) : null}
                {plan.originalPrice != null ? (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.18 + i * 0.08, duration: 0.22, ease: "easeOut" }}
                    className="text-lg text-white/35 line-through decoration-2 decoration-white/45"
                  >
                    ${formatPrice(plan.originalPrice)}/month
                  </motion.p>
                ) : (
                  <div className="h-7" />
                )}

                {plan.originalPrice != null ? (
                  <div
                    className={`pointer-events-none absolute -left-3 -top-3 h-20 w-44 rounded-full blur-2xl ${
                      plan.id === "team" ? "bg-cyan-400/14" : "bg-violet-400/16"
                    }`}
                  />
                ) : null}

                <div className="relative z-[2] flex items-baseline gap-1">
                  <span
                    className={`font-black tracking-tight ${
                      plan.id === "starter"
                        ? "text-[2.35rem] text-white/95"
                        : "text-[2.6rem] text-white"
                    }`}
                  >
                    ${formatPrice(plan.price)}
                  </span>
                  <span className="text-white/50">/month</span>
                </div>
                {plan.saveText ? (
                  <p className="text-xs text-emerald-300/95 font-semibold mt-1">
                    {plan.saveText}
                  </p>
                ) : (
                  <p className="text-xs text-white/40 font-medium mt-1">Entry plan</p>
                )}
              </div>

              <Button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSelectPlan(plan);
                }}
                disabled={loadingPlan === plan.id}
                className={`w-full h-12 rounded-xl text-[0.95rem] font-semibold mb-2 transform-gpu transition-all duration-150 ease-out ${
                  plan.id === "pro"
                    ? "bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500 text-white shadow-[0_12px_30px_rgba(139,92,246,0.35)] hover:from-violet-400 hover:via-purple-400 hover:to-fuchsia-400 hover:shadow-[0_16px_36px_rgba(139,92,246,0.45)]"
                    : plan.id === "team"
                    ? "bg-gradient-to-r from-indigo-500/90 to-cyan-500/85 text-white border border-cyan-200/25 shadow-[0_10px_24px_rgba(6,182,212,0.24)] hover:from-indigo-400 hover:to-cyan-400"
                    : "bg-white/6 hover:bg-white/12 text-white border border-white/15"
                }`}
              >
                {loadingPlan === plan.id ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin inline" />
                    Redirecting...
                  </>
                ) : (
                  plan.cta
                )}
              </Button>
              <p className="text-center text-xs text-white/50 mb-1">Cancel anytime</p>
              <p className="text-center text-[11px] text-white/35 mb-5">
                Secure checkout via Stripe • Instant access
              </p>

              <ul className="space-y-3.5">
                {plan.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-3 text-sm text-white/60 text-left"
                  >
                    <Check className="w-4 h-4 text-violet-300 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{f}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        <div className="text-center">
          <p className="text-sm font-medium text-emerald-200/95 mb-1">
            30-day satisfaction guarantee
          </p>
          <p className="text-xs text-white/45">No hidden fees • Cancel anytime</p>
        </div>
      </div>
    </div>
  );
}
