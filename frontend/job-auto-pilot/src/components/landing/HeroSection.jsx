import React from "react";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function HeroSection({ onGetStarted }) {
  const scrollToFeatures = () => {
    document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden px-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[150px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[150px] animate-pulse" style={{ animationDelay: "1s" }} />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900/20 via-transparent to-transparent" />
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '50px 50px'
        }} />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card mb-8 text-sm text-purple-300 border border-purple-500/20">
            <Sparkles className="w-4 h-4" />
            <span>AI-Powered Job Application Assistant</span>
          </div>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="text-5xl md:text-7xl lg:text-8xl font-extrabold tracking-tight leading-[1.1] mb-8"
        >
          <span className="text-white">Land your</span>
          <br />
          <span className="bg-gradient-to-r from-purple-400 via-cyan-400 to-purple-400 bg-clip-text text-transparent animate-gradient bg-[length:200%_auto]">
            dream job
          </span>
          <br />
          <span className="text-white">on autopilot</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="text-lg md:text-xl text-white/60 max-w-3xl mx-auto mb-10 leading-relaxed font-medium"
        >
          Paste any job description and instantly generate tailored resumes, cover letters, and
          track every application — all in one place.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Button
            onClick={onGetStarted}
            size="lg"
            className="bg-purple-600 hover:bg-purple-500 text-white px-12 py-7 text-lg font-semibold rounded-xl glow-purple premium-button shadow-2xl hover:shadow-purple-500/40 transition-all duration-300 hover:scale-[1.02]"
          >
            Get Started Free
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
          <Button
            onClick={scrollToFeatures}
            size="lg"
            variant="outline"
            className="border-white/30 bg-white/5 text-white hover:text-white hover:bg-white/10 hover:border-white/40 px-8 py-7 text-base font-semibold rounded-xl premium-button transition-all"
          >
            <PlayCircle className="w-5 h-5 mr-2" />
            See How It Works
          </Button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.6 }}
          className="mt-20 flex flex-wrap items-center justify-center gap-8 md:gap-16 text-sm"
        >
          {[
            { label: "Applications Sent", value: "24,847+", tooltip: "Updated in real time" },
            { label: "Interviews Landed", value: "8,392+", tooltip: "Updated in real time" },
            { label: "Job Offers Received", value: "3,241+", tooltip: "Updated in real time" },
          ].map((s) => (
            <div key={s.label} className="text-center group cursor-help">
              <div className="text-3xl md:text-4xl font-bold text-white group-hover:text-purple-400 transition-colors">
                {s.value}
              </div>
              <div className="text-white/40 mt-1">{s.label}</div>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-purple-400 mt-1">
                {s.tooltip}
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}