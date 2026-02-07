import React, { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

export default function BeforeAfter() {
  const [side, setSide] = useState("before");

  const before = [
    "• Worked on web applications",
    "• Managed a team",
    "• Improved system performance",
    "• Helped with customer issues",
  ];

  const after = [
    "• Led cross-functional team of 8 engineers to deliver mission-critical platform redesign, resulting in 40% improvement in user engagement and 25% reduction in churn",
    "• Architected and implemented scalable microservices infrastructure handling 10M+ daily requests with 99.97% uptime SLA",
    "• Reduced infrastructure costs by 35% through strategic migration to containerized architecture and optimized resource allocation",
    "• Drove product strategy for key revenue stream generating $2.4M ARR through data-driven A/B testing",
  ];

  return (
    <section className="py-32 px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-900/5 to-transparent" />
      
      <div className="max-w-5xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Transform your resume bullets
          </h2>
          <p className="text-lg text-white/40 max-w-2xl mx-auto">
            Generic bullets vs. ATS-optimized, metric-driven accomplishments
          </p>
        </motion.div>

        <div className="flex justify-center mb-8">
          <div className="inline-flex p-1 bg-white/5 rounded-xl border border-white/5">
            <button
              onClick={() => setSide("before")}
              className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${
                side === "before"
                  ? "bg-red-500/20 text-red-400"
                  : "text-white/40 hover:text-white/60"
              }`}
            >
              ❌ Before
            </button>
            <button
              onClick={() => setSide("after")}
              className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${
                side === "after"
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "text-white/40 hover:text-white/60"
              }`}
            >
              ✅ After
            </button>
          </div>
        </div>

        <motion.div
          key={side}
          initial={{ opacity: 0, x: side === "before" ? -20 : 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="glass-card rounded-2xl p-8 md:p-12"
        >
          <div className="space-y-4">
            {(side === "before" ? before : after).map((bullet, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className={`text-sm md:text-base leading-relaxed ${
                  side === "before" ? "text-white/40" : "text-white/70"
                }`}
              >
                {bullet}
              </motion.div>
            ))}
          </div>

          {side === "before" && (
            <div className="mt-8 pt-8 border-t border-white/5 flex items-center justify-center gap-3 text-white/30">
              <span className="text-sm">See the difference?</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          )}
        </motion.div>
      </div>
    </section>
  );
}