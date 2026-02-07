import React from "react";
import { motion } from "framer-motion";
import { Sparkles, Target, FileText, BarChart3, Coins, Zap } from "lucide-react";

const features = [
  {
    icon: Sparkles,
    title: "AI Resume & Cover Letter Generator",
    description: "Instantly create tailored documents for any job posting",
    color: "from-purple-500 to-purple-600"
  },
  {
    icon: Target,
    title: "ATS Keyword Matching",
    description: "Pass applicant tracking systems with optimized content",
    color: "from-cyan-500 to-cyan-600"
  },
  {
    icon: FileText,
    title: "Application Tracker",
    description: "Never lose track of where you applied and when",
    color: "from-emerald-500 to-emerald-600"
  },
  {
    icon: BarChart3,
    title: "Interview & Offer Analytics",
    description: "Track your success rate and optimize your strategy",
    color: "from-amber-500 to-amber-600"
  },
  {
    icon: Coins,
    title: "Credit-Based Usage Control",
    description: "Pay only for what you use with flexible credit packages",
    color: "from-pink-500 to-pink-600"
  },
  {
    icon: Zap,
    title: "Lightning Fast Generation",
    description: "Get your documents in under 10 seconds, every time",
    color: "from-violet-500 to-violet-600"
  },
];

export default function FeatureCards() {
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
            Everything you need to succeed
          </h2>
          <p className="text-lg text-white/40 max-w-2xl mx-auto">
            All the tools professional job seekers use to land offers faster
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="glass-card rounded-2xl p-6 hover:bg-white/[0.04] transition-all duration-300 hover:scale-[1.02] group cursor-pointer"
            >
              <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform`}>
                <feature.icon className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-lg font-bold text-white mb-3 group-hover:text-purple-400 transition-colors">
                {feature.title}
              </h3>
              <p className="text-white/60 text-sm leading-relaxed line-clamp-2">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}