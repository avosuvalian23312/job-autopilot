import React from "react";
import { motion } from "framer-motion";
import { Check, Sparkles, Zap, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";

const plans = [
  {
    name: "Free",
    price: 0,
    description: "Try it out",
    features: [
      "3 free document generations",
      "Track up to 10 applications",
      "Basic resume + cover letter generation"
    ],
    cta: "Continue with Free",
    highlighted: false,
    icon: Sparkles
  },
  {
    name: "Pro",
    price: 14.99,
    description: "Most popular",
    features: [
      "20 credits per month",
      "Unlimited application tracking",
      "Analytics dashboard",
      "Export to .docx"
    ],
    cta: "Start Pro Plan",
    highlighted: true,
    icon: Zap
  },
  {
    name: "Power",
    price: 19.99,
    description: "Best for heavy users",
    features: [
      "60 credits per month",
      "Everything in Pro",
      "Fastest AI generation",
      "Priority support"
    ],
    cta: "Start Power Plan",
    highlighted: false,
    icon: Crown
  },
];

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

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className={`glass-card rounded-2xl p-8 hover:bg-white/[0.04] transition-all ${
                plan.highlighted ? "border-2 border-purple-500/50 relative" : "border border-white/5"
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-purple-600 text-white text-xs font-semibold">
                  Most Popular
                </div>
              )}
              
              <div className="mb-6">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${
                  plan.name === "Free" ? "from-purple-500 to-purple-600" :
                  plan.name === "Pro" ? "from-cyan-500 to-cyan-600" :
                  "from-amber-500 to-amber-600"
                } flex items-center justify-center mb-4`}>
                  <plan.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-1">{plan.name}</h3>
                <p className="text-sm text-white/40">{plan.description}</p>
              </div>

              <div className="mb-8">
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-bold text-white">${plan.price}</span>
                  <span className="text-white/40">/month</span>
                </div>
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-purple-400" />
                    </div>
                    <span className="text-sm text-white/60 leading-relaxed">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                onClick={onSelect}
                className={`w-full py-6 rounded-xl text-base font-semibold transition-all ${
                  plan.highlighted
                    ? "bg-purple-600 hover:bg-purple-500 text-white glow-purple"
                    : "bg-white/5 hover:bg-white/10 text-white border border-white/10"
                }`}
              >
                {plan.cta}
              </Button>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="text-center mt-12"
        >
          <p className="text-sm text-white/30">
            All plans include secure payment processing • Cancel anytime • No hidden fees
          </p>
        </motion.div>
      </div>
    </section>
  );
}