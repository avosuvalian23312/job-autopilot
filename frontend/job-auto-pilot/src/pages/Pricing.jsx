import React, { useState } from "react";
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
import { onboarding } from "@/lib/onboarding";
import { pagesConfig } from "@/pages.config";

const plans = [
  {
    name: "Free",
    price: 0,
    credits: 10,
    description: "Perfect for trying out the platform",
    features: [
      "10 credits total (3 generations)",
      "Basic application tracking (limit 10)",
      "Resume bullet suggestions",
      "Cover letter generation",
      "Email support",
    ],
    icon: Zap,
    popular: false,
    cta: "Continue with Free Plan",
  },
  {
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

export default function Pricing() {
  const navigate = useNavigate();
  const [loadingPlan, setLoadingPlan] = useState(null);

  const handleSelectPlan = async (planName) => {
    setLoadingPlan(planName);
    await new Promise((resolve) => setTimeout(resolve, 800));

    // ✅ mark pricing done using your onboarding lib
    try {
      if (typeof onboarding?.completePricing === "function") onboarding.completePricing();
      else if (typeof onboarding?.setPricingDone === "function") onboarding.setPricingDone(true);
    } catch {}

    // Optional: remember selected plan locally
    try {
      localStorage.setItem("selectedPlan", planName);
    } catch {}

    // ✅ navigate to the actual Setup route key
    navigate(getSetupPath(), { replace: true });
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
          <p className="text-lg text-white/50 mb-2">
            Start with 3 free credits. No credit card required.
          </p>
          <p className="text-sm text-white/30 mb-8">
            No credit card for Free. Cancel anytime.
          </p>

          <Button
            onClick={() => handleSelectPlan("Free")}
            disabled={loadingPlan === "Free"}
            className="bg-white/10 hover:bg-white/15 text-white border border-white/20 px-8 py-3 rounded-xl text-base font-medium mb-8"
          >
            {loadingPlan === "Free" ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin inline" />
                Starting...
              </>
            ) : (
              "Continue with Free Plan"
            )}
          </Button>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`relative rounded-2xl p-8 ${
                plan.popular
                  ? "bg-gradient-to-b from-purple-500/10 to-transparent border-2 border-purple-500/30 popular-card popular-card-shimmer popular-card-hover"
                  : "glass-card"
              }`}
              style={plan.popular ? { animation: "float 6s ease-in-out infinite" } : {}}
            >
              {plan.popular && (
                <>
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-purple-600 text-white text-xs font-medium flex items-center gap-1.5 z-10">
                    <Sparkles className="w-3 h-3" />
                    Most Popular
                  </div>
                  <div className="absolute inset-0 rounded-2xl popular-glow" />
                </>
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
                          <span>
                            {plan.credits} credits{plan.name === "Free" ? " total" : "/month"}
                          </span>
                          <HelpCircle className="w-3 h-3" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">
                          {plan.name === "Free"
                            ? "Limited total credits for trying out"
                            : "Monthly credits: 1 credit = 1 AI generation"}
                        </p>
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
                onClick={() => handleSelectPlan(plan.name)}
                disabled={loadingPlan === plan.name}
                className={`w-full py-6 rounded-xl text-base font-medium premium-button mb-6 transition-all relative ${
                  plan.popular
                    ? "bg-purple-600 hover:bg-purple-500 text-white shadow-lg hover:shadow-purple-500/50 hover:scale-105"
                    : "bg-white/5 hover:bg-white/10 text-white border border-white/10"
                }`}
              >
                {loadingPlan === plan.name ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin inline" />
                    Starting...
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
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass-card rounded-2xl p-6 text-center"
        >
          <p className="text-white/60 text-sm mb-2">
            Need more credits?{" "}
            <span className="text-purple-400 font-medium">Top-up anytime: $5 for 20 credits</span>
          </p>
          <p className="text-white/30 text-xs">Credits never expire</p>
        </motion.div>
      </div>
    </div>
  );
}
