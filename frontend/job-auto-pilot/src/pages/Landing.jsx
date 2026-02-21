import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
//dff
import SocialProofToasts from "@/components/landing/SocialProofToasts";

import HeroSection from "@/components/landing/HeroSection";
import CompanyLogos from "@/components/landing/CompanyLogos";
import HowItWorks from "@/components/landing/HowItWorks";
import FeatureCards from "@/components/landing/FeatureCards";
import BeforeAfter from "@/components/landing/BeforeAfter";
import StatsSection from "@/components/landing/StatsSection";
import ReviewsSection from "@/components/landing/ReviewsSection";
import PricingSection from "@/components/landing/PricingSection";
import FAQSection from "@/components/landing/FAQSection";
import FooterSection from "@/components/landing/FooterSection";
import AuthModal from "@/components/landing/AuthModal";

export default function Landing() {
  const [authOpen, setAuthOpen] = useState(false);
  const navigate = useNavigate();
  const navTabClass =
    "rounded-lg border border-white/10 px-3 py-2 text-white/60 cursor-pointer " +
    "transition-all duration-200 shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_0_16px_rgba(59,130,246,0.14)] " +
    "hover:text-white hover:bg-white/[0.06] hover:border-blue-300/50 hover:shadow-[0_0_0_1px_rgba(96,165,250,0.58),0_0_24px_rgba(59,130,246,0.34)]";

  const handleAuthComplete = () => {
    setAuthOpen(false);
    navigate(createPageUrl("Pricing"));
  };

  return (
    <div className="min-h-screen bg-[hsl(240,10%,4%)]">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 border-b border-white/5 bg-[hsl(240,10%,4%)]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg border border-cyan-300/35 bg-gradient-to-br from-cyan-400/95 to-teal-400/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_10px_26px_rgba(6,182,212,0.32)]">
              <Zap className="h-4 w-4 text-slate-950" />
            </div>
            <span className="font-bold text-white text-lg">Job Autopilot</span>
          </div>

          <nav className="hidden md:flex items-center gap-1.5 text-sm font-medium">
            <a
              href="#pricing"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
              }}
              className={navTabClass}
            >
              Pricing
            </a>

            <a
              href="#features"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
              }}
              className={navTabClass}
            >
              Features
            </a>

            <a
              href="#reviews"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById("reviews")?.scrollIntoView({ behavior: "smooth" });
              }}
              className={navTabClass}
            >
              Reviews
            </a>

            <a
              onClick={() => navigate(createPageUrl("Blog"))}
              className={navTabClass}
            >
              Blog
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              onClick={() => setAuthOpen(true)}
              className="text-white/60 hover:text-white hover:bg-white/5 text-sm font-medium"
            >
              Sign in
            </Button>

            <Button
              onClick={() => setAuthOpen(true)}
              className="bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium px-5 py-2 rounded-lg premium-button shadow-lg hover:shadow-purple-500/25"
            >
              Get Started Free
            </Button>
          </div>
        </div>
      </header>

      <main className="pt-16">
        <HeroSection onGetStarted={() => setAuthOpen(true)} />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <CompanyLogos />
        </motion.div>

        <motion.div
          id="how-it-works"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <HowItWorks />
        </motion.div>

        <div id="features">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <FeatureCards />
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <BeforeAfter />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <StatsSection />
        </motion.div>

        <motion.div
          id="reviews"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <ReviewsSection />
        </motion.div>

        <motion.div
          id="pricing"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <PricingSection onSelect={() => setAuthOpen(true)} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <FAQSection />
        </motion.div>
      </main>

      <FooterSection />

      {/* ✅ Bottom-left popup social proof (single card) */}
      {!authOpen && <SocialProofToasts intervalMs={6500} hideOnMobile={false} />}

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onComplete={handleAuthComplete}
      />
    </div>
  );
}
