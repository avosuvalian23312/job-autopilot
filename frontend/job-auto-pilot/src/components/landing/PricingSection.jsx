import React from "react";
import { motion } from "framer-motion";
import { Check, Sparkles, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pricingPlans } from "@/lib/pricingPlans";

function formatPrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? "");
  return Number.isInteger(n) ? `${n}` : n.toFixed(2);
}

export default function PricingSection({ onSelect }) {
  return (
    <section className="py-32 px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-900/5 to-transparent" />

      <div className="max-w-6xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Simple, transparent pricing
          </h2>
          <p className="text-lg text-white/40 max-w-2xl mx-auto">
            Choose the plan that fits your job search needs
          </p>
        </motion.div>

        <div className="relative max-w-4xl mx-auto">
          <div className="pointer-events-none absolute left-[14%] top-16 h-64 w-64 rounded-full bg-violet-500/14 blur-3xl" />
          <div className="pointer-events-none absolute right-[12%] top-16 h-64 w-64 rounded-full bg-cyan-400/14 blur-3xl" />
          <div className="grid md:grid-cols-2 gap-6 items-stretch">
            {pricingPlans.map((plan, i) => (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className={`relative rounded-3xl p-8 overflow-hidden transition-all ${
                  plan.id === "pro"
                    ? "border border-violet-300/35 bg-[linear-gradient(180deg,rgba(139,92,246,0.14),rgba(10,10,16,0.74))] shadow-[0_20px_50px_rgba(139,92,246,0.22)]"
                    : plan.id === "team"
                    ? "border border-cyan-300/20 bg-[linear-gradient(180deg,rgba(56,189,248,0.1),rgba(10,10,16,0.74))] shadow-[0_18px_44px_rgba(6,182,212,0.1)]"
                    : "glass-card border border-white/15 hover:bg-white/[0.04]"
                }`}
              >
                <div className="pointer-events-none absolute inset-0 rounded-3xl bg-[linear-gradient(160deg,rgba(255,255,255,0.07),rgba(255,255,255,0)_42%)]" />
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
                  className={`relative z-[2] mb-5 ${
                    plan.badges?.length ? "mt-10" : "mt-1"
                  }`}
                >
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${
                      plan.id === "pro"
                        ? "bg-violet-500/22 border border-violet-300/25"
                        : plan.id === "team"
                        ? "bg-cyan-500/18 border border-cyan-300/20"
                        : "bg-white/5 border border-white/10"
                    }`}
                  >
                    <Rocket className="w-6 h-6 text-purple-300" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-1">{plan.name}</h3>
                  <p className="text-sm text-white/65">{plan.description}</p>
                  <p className="text-xs text-white/60 mt-1">{plan.credits} credits/month</p>
                </div>

                <div className="relative z-[2] mb-6">
                  {plan.limitedBadge ? (
                    <div className="mb-2 inline-flex rounded-full border border-violet-300/45 bg-violet-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-violet-100">
                      {plan.limitedBadge}
                    </div>
                  ) : null}
                  {plan.originalPrice != null ? (
                    <p className="text-base text-white/55 line-through decoration-2 decoration-white/60 mb-1">
                      ${formatPrice(plan.originalPrice)}/month
                    </p>
                  ) : (
                    <div className="h-6" />
                  )}
                  <div className="flex items-baseline gap-1">
                    <>
                      <span className="font-black tracking-tight text-[2.6rem] text-white">
                        ${formatPrice(plan.price)}
                      </span>
                      <span className="text-white/70">/month</span>
                    </>
                  </div>
                  <p className="text-xs text-emerald-300 font-semibold mt-1">
                    {plan.saveText || "Entry plan"}
                  </p>
                </div>

                <ul className="relative z-[2] space-y-3 mb-8">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-3 h-3 text-purple-300" />
                      </div>
                      <span className="text-sm text-white/75 leading-relaxed">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  onClick={() => onSelect?.(plan)}
                  className={`relative z-[2] w-full py-6 rounded-xl text-base font-semibold transition-all ${
                    plan.id === "pro"
                      ? "bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500 text-white glow-purple hover:from-violet-400 hover:via-purple-400 hover:to-fuchsia-400"
                      : plan.id === "team"
                      ? "bg-gradient-to-r from-indigo-500/90 to-cyan-500/85 text-white border border-cyan-200/25 hover:from-indigo-400 hover:to-cyan-400"
                      : "bg-white/5 hover:bg-white/10 text-white border border-white/10"
                  }`}
                >
                  {plan.cta}
                </Button>
              </motion.div>
            ))}
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="text-center mt-12"
        >
          <p className="text-sm text-white/30">
            All plans include secure payment processing | Cancel anytime | No hidden fees
          </p>
        </motion.div>
      </div>
    </section>
  );
}
