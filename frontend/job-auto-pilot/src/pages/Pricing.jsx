// src/pages/Pricing.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Check, Sparkles, Rocket, HelpCircle, Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { pagesConfig } from "@/pages.config";
import { onboarding } from "@/lib/onboarding";
import { pricingPlans } from "@/lib/pricingPlans";

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

function getCurrentPath() {
  try {
    const p = window.location.pathname || "/Pricing";
    return p.startsWith("/") ? p : "/Pricing";
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
  const [confirmingSession, setConfirmingSession] = useState(false);
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
    let active = true;

    const confirmCheckout = async () => {
      try {
        const qs = new URLSearchParams(window.location.search);
        const sessionId = qs.get("session_id");
        if (!sessionId || forceMode) return;

        setErrorMsg("");
        setConfirmingSession(true);

        const resp = await postJson("/api/stripe/confirm-session", {
          session_id: sessionId,
        });

        if (!active) return;

        if (!resp.ok || !resp.data?.ok) {
          const msg =
            resp.data?.error ||
            resp.data?.message ||
            resp.data?.detail ||
            `Checkout confirmation failed (HTTP ${resp.status})`;
          setErrorMsg(msg);
          return;
        }

        onboarding.clearCache?.();
        await qc.invalidateQueries({ queryKey: ["onboarding:me"] });
        await qc.refetchQueries({ queryKey: ["onboarding:me"] });
        navigate(getSetupPath(), { replace: true });
      } catch (e) {
        if (!active) return;
        setErrorMsg(e?.message || "Checkout confirmation failed. Please refresh.");
      } finally {
        if (active) setConfirmingSession(false);
      }
    };

    confirmCheckout();

    return () => {
      active = false;
    };
  }, [forceMode, navigate, qc]);

  const handleSelectPlan = async (plan) => {
    if (loadingPlan || confirmingSession) return;

    setErrorMsg("");
    setLoadingPlan(plan.id);

    try {
      if (plan.id === "free") {
        if (typeof onboarding?.completePricing === "function") {
          await onboarding.completePricing("free");
        } else if (typeof onboarding?.setSelectedPlan === "function") {
          await onboarding.setSelectedPlan("free");
        }

        // Warm credits so free monthly allocation is immediately reflected.
        await fetch("/api/credits/me", {
          method: "GET",
          credentials: "include",
        }).catch(() => {});

        onboarding.clearCache?.();
        await qc.invalidateQueries({ queryKey: ["onboarding:me"] });
        navigate(getSetupPath());
        return;
      }

      const successPath = getCurrentPath();
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
    <div className="min-h-screen text-white bg-[radial-gradient(920px_500px_at_12%_-12%,rgba(139,92,246,0.2),transparent_60%),radial-gradient(780px_500px_at_95%_5%,rgba(6,182,212,0.14),transparent_62%),linear-gradient(180deg,hsl(222,28%,8%),hsl(228,27%,7%))]">
      <header className="border-b border-white/5 bg-[hsl(225,24%,8%)]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg border border-cyan-300/35 bg-gradient-to-br from-cyan-400/95 to-teal-400/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_10px_26px_rgba(6,182,212,0.32)]">
              <Zap className="h-4 w-4 text-slate-950" />
            </div>
            <span className="font-bold text-white text-lg">Job Autopilot</span>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-16 md:py-24 relative">
        <div className="pointer-events-none absolute left-1/2 top-20 h-60 w-[48rem] -translate-x-1/2 rounded-full bg-violet-500/12 blur-3xl" />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="text-center mb-10"
        >
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight drop-shadow-[0_2px_16px_rgba(255,255,255,0.14)]">
            Choose your plan
          </h1>
          <p className="text-lg text-white/85 mb-2">
            Secure checkout via Stripe.
          </p>
          <p className="text-sm text-white/70 mb-6">
            Credits are granted from your active subscription plan.
          </p>
          <div className="mb-4 inline-flex items-center rounded-full border border-violet-300/35 bg-violet-500/14 px-4 py-1.5 text-sm text-violet-100">
            Trusted by 2,000+ job seekers
          </div>
          <p className="text-xs text-white/70">No hidden fees | Cancel anytime</p>

          {forceMode ? (
            <div className="max-w-xl mx-auto mb-6 px-4 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-sm text-amber-200">
              Test mode: opened via <span className="font-mono">?force=pricing</span>
            </div>
          ) : null}

          {confirmingSession ? (
            <div className="max-w-xl mx-auto mb-6 px-4 py-3 rounded-2xl bg-cyan-500/10 border border-cyan-400/20 text-sm text-cyan-100">
              Confirming your Stripe checkout. Please wait...
            </div>
          ) : null}

          {errorMsg ? (
            <div className="max-w-xl mx-auto mb-6 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-sm text-red-200">
              {errorMsg}
            </div>
          ) : null}
        </motion.div>

        <div className="mx-auto mb-8 h-px max-w-5xl bg-gradient-to-r from-transparent via-white/25 to-transparent" />

        <div className="relative mb-12">
          <div className="pointer-events-none absolute left-[16%] top-20 h-72 w-72 rounded-full bg-violet-500/14 blur-3xl" />
          <div className="pointer-events-none absolute right-[12%] top-20 h-72 w-72 rounded-full bg-cyan-400/14 blur-3xl" />
          <div className="pointer-events-none absolute inset-x-[30%] bottom-[-2.5rem] h-24 rounded-full bg-indigo-400/10 blur-3xl" />
          <div className="grid md:grid-cols-3 gap-6 max-w-[1120px] mx-auto items-stretch">
            {pricingPlans.map((plan, i) => (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08, duration: 0.18, ease: "easeOut" }}
                className={`relative h-full rounded-3xl p-8 overflow-hidden transform-gpu transition-all duration-150 ease-out hover:scale-[1.02] hover:-translate-y-0.5 ${
                  plan.id === "pro"
                    ? "border border-violet-300/35 bg-[linear-gradient(180deg,rgba(139,92,246,0.16),rgba(10,10,16,0.72))] shadow-[0_20px_50px_rgba(139,92,246,0.22)]"
                    : plan.id === "team"
                    ? "border border-cyan-300/20 bg-[linear-gradient(180deg,rgba(56,189,248,0.1),rgba(10,10,16,0.72))] shadow-[0_18px_44px_rgba(6,182,212,0.1)]"
                    : "border border-white/20 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] opacity-[0.98] shadow-[0_16px_38px_rgba(0,0,0,0.34)]"
                }`}
              >
              <div className="pointer-events-none absolute inset-0 rounded-3xl bg-[linear-gradient(160deg,rgba(255,255,255,0.07),rgba(255,255,255,0)_42%)]" />
              {plan.id === "pro" ? (
                <div className="pointer-events-none absolute -inset-x-10 -top-20 h-56 rounded-full bg-[radial-gradient(circle_at_center,rgba(139,92,246,0.26),transparent_70%)] blur-2xl" />
              ) : null}

              {plan.badges?.length ? (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex flex-wrap justify-center gap-2">
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

              <div
                className={`relative z-[2] flex items-center gap-3 mb-4 ${
                  plan.badges?.length ? "mt-10" : "mt-2"
                }`}
              >
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
                        <div className="flex items-center gap-1.5 text-xs text-white/75 cursor-help">
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

              <p className="relative z-[2] text-sm text-white/75 mb-5">{plan.description}</p>

              <div className="relative z-[2] mb-4">
                {plan.limitedBadge ? (
                  <div className="mb-1 inline-flex rounded-full border border-violet-300/45 bg-violet-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-violet-100">
                    {plan.limitedBadge}
                  </div>
                ) : null}
                {plan.originalPrice != null ? (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.18 + i * 0.08, duration: 0.22, ease: "easeOut" }}
                    className="text-lg text-white/55 line-through decoration-2 decoration-white/60"
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
                  {plan.id === "free" ? (
                    <span className="font-black tracking-tight text-[2.15rem] text-white">
                      FREE
                    </span>
                  ) : (
                    <>
                      <span className="font-black tracking-tight text-[2.6rem] text-white">
                        ${formatPrice(plan.price)}
                      </span>
                      <span className="text-white/80">/month</span>
                    </>
                  )}
                </div>
                {plan.saveText ? (
                  <p className="text-xs text-emerald-300 font-semibold mt-1">
                    {plan.saveText}
                  </p>
                ) : (
                  <p className="text-xs text-white/70 font-medium mt-1">Entry plan</p>
                )}
              </div>

              <Button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSelectPlan(plan);
                }}
                disabled={loadingPlan === plan.id || confirmingSession}
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
              <p className="relative z-[2] text-center text-xs text-white/80 mb-1">Cancel anytime</p>
              <p className="relative z-[2] text-center text-[11px] text-white/70 mb-5">
                Secure checkout via Stripe | Instant access
              </p>

              <ul className="relative z-[2] space-y-3.5">
                {plan.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-3 text-sm text-white/85 text-left"
                  >
                    <Check className="w-4 h-4 text-violet-200 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{f}</span>
                  </li>
                ))}
              </ul>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="text-center">
          <p className="text-sm font-medium text-emerald-200/95 mb-1">
            30-day satisfaction guarantee
          </p>
          <p className="text-xs text-white/70">No hidden fees | Cancel anytime</p>
        </div>
      </div>
    </div>
  );
}

