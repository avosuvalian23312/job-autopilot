import React from "react";
import { motion } from "framer-motion";
import { TrendingUp, Target, Award, BarChart3, Users, Clock } from "lucide-react";

const stats = [
  { icon: TrendingUp, label: "Avg. Interview Rate", value: "3.2x", sub: "higher than manual apps", color: "text-purple-400" },
  { icon: Target, label: "Application Match", value: "94%", sub: "relevance score", color: "text-cyan-400" },
  { icon: Award, label: "Time Saved", value: "12hrs", sub: "per week on average", color: "text-emerald-400" },
  { icon: BarChart3, label: "Response Rate", value: "47%", sub: "employer callback rate", color: "text-amber-400" },
  { icon: Users, label: "Active Users", value: "8,200+", sub: "professionals worldwide", color: "text-pink-400" },
  { icon: Clock, label: "Avg. Generation", value: "8sec", sub: "per application set", color: "text-violet-400" },
];

export default function StatsSection() {
  return (
    <section className="py-24 px-4">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Numbers that speak
          </h2>
          <p className="text-white/40 max-w-lg mx-auto">
            Real results from real users who switched to Job Autopilot
          </p>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="glass-card rounded-2xl p-6 hover:bg-white/[0.04] transition-all duration-300"
            >
              <stat.icon className={`w-5 h-5 ${stat.color} mb-4`} />
              <div className="text-3xl md:text-4xl font-bold text-white mb-1">{stat.value}</div>
              <div className="text-sm text-white/60 font-medium">{stat.label}</div>
              <div className="text-xs text-white/30 mt-1">{stat.sub}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}