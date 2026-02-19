import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Check, Rocket } from "lucide-react";
import { toast } from "sonner";
import { onboarding } from "@/lib/onboarding";

const plans = [
  {
    id: "starter",
    name: "Starter",
    price: "$9",
    credits: 50,
    features: ["Resume generation", "Cover letter generation", "Basic support"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$24",
    credits: 150,
    features: ["Everything in Starter", "Priority generation", "Priority support"],
    popular: true,
  },
  {
    id: "team",
    name: "Team",
    price: "$45",
    credits: 300,
    features: ["Everything in Pro", "Higher monthly limit", "Team sharing"],
  },
];

export default function Pricing() {
  const [selectedPlanId, setSelectedPlanId] = useState(plans[1].id);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) || plans[0];

  const handleContinue = async () => {
    if (isSubmitting) return;
    try {
      setIsSubmitting(true);

      await onboarding.completePricing(selectedPlan.id);
      onboarding.clearCache();
      await qc.invalidateQueries({ queryKey: ["onboarding:me"] });
      await qc.refetchQueries({ queryKey: ["onboarding:me"] });

      navigate(createPageUrl("Setup"), { replace: true });
    } catch (error) {
      console.error(error);
      toast.error(error?.message || "Failed to complete pricing. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[hsl(240,10%,4%)] text-white">
      <header className="border-b border-white/10 bg-[hsl(240,10%,4%)]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/25">
            <Rocket className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="font-bold text-[15px]">Job Autopilot</div>
            <div className="text-[11px] text-white/50">Select a plan to continue</div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Choose your plan</h1>
          <p className="text-white/50 mt-3">Step 1 of 2: pricing before profile setup.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {plans.map((plan) => {
            const isSelected = selectedPlanId === plan.id;
            return (
              <button
                type="button"
                key={plan.id}
                onClick={() => setSelectedPlanId(plan.id)}
                className={`text-left rounded-2xl border p-6 transition-all ${
                  isSelected
                    ? "border-purple-500 bg-purple-500/10"
                    : "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]"
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold">{plan.name}</h2>
                  {plan.popular ? (
                    <span className="text-xs px-2 py-1 rounded-full bg-purple-600 text-white">Popular</span>
                  ) : null}
                </div>
                <div className="text-3xl font-bold">{plan.price}</div>
                <div className="text-sm text-white/60 mb-4">{plan.credits} credits</div>
                <div className="space-y-2">
                  {plan.features.map((feature) => (
                    <div key={feature} className="flex items-center gap-2 text-sm text-white/80">
                      <Check className="w-4 h-4 text-purple-300" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="text-sm text-white/60">Selected plan</div>
            <div className="text-lg font-semibold">
              {selectedPlan.name} - {selectedPlan.price}
            </div>
          </div>
          <Button
            onClick={handleContinue}
            disabled={isSubmitting}
            className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl px-6"
          >
            {isSubmitting ? "Saving..." : "Continue to setup"}
          </Button>
        </div>
      </main>
    </div>
  );
}
