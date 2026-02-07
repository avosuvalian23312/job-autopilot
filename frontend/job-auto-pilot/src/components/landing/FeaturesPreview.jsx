import React from "react";
import { motion } from "framer-motion";
import { Sparkles, FileText, BarChart3, Target, Zap, CheckCircle2 } from "lucide-react";

export default function FeaturesPreview() {
  return (
    <section className="py-32 px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-900/5 to-transparent" />
      
      <div className="max-w-7xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-20"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Everything you need in one place
          </h2>
          <p className="text-lg text-white/40 max-w-2xl mx-auto">
            From document generation to application tracking, all the tools you need to land your dream job
          </p>
        </motion.div>

        <div className="space-y-32">
          {/* Feature 1: Document Generation */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="grid md:grid-cols-2 gap-12 items-center"
          >
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-sm mb-6">
                <Sparkles className="w-4 h-4" />
                <span>AI-Powered Generation</span>
              </div>
              <h3 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Generate tailored documents in seconds
              </h3>
              <p className="text-white/50 text-lg mb-8 leading-relaxed">
                Simply paste a job description and our AI instantly creates a personalized cover letter and resume bullets that match the role perfectly.
              </p>
              <div className="space-y-4">
                {[
                  "ATS-optimized keyword matching",
                  "Metric-driven accomplishment bullets",
                  "Industry-specific language adaptation",
                  "One-click copy and export"
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-4 h-4 text-purple-400" />
                    </div>
                    <span className="text-white/60">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="glass-card rounded-2xl p-6 shadow-2xl border-2 border-white/10 glow-purple">
                <div className="flex items-center gap-2 mb-4 pb-4 border-b border-white/5">
                  <div className="w-8 h-8 rounded-lg bg-purple-600/20 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                  </div>
                  <span className="text-sm font-medium text-white/70">Generate Documents</span>
                </div>
                <div className="space-y-3 mb-4">
                  <div className="h-10 bg-white/[0.03] rounded-lg border border-white/5 flex items-center px-3">
                    <span className="text-xs text-white/30">Job Link (optional)</span>
                  </div>
                  <div className="h-10 bg-white/[0.03] rounded-lg border border-white/5 flex items-center px-3">
                    <span className="text-xs text-white/30">Job Title</span>
                  </div>
                  <div className="h-32 bg-white/[0.03] rounded-lg border border-white/5 p-3">
                    <span className="text-xs text-white/20">Paste job description here...</span>
                  </div>
                </div>
                <button className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Generate Documents
                </button>
              </div>
            </div>
          </motion.div>

          {/* Feature 2: Application Tracking */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="grid md:grid-cols-2 gap-12 items-center"
          >
            <div className="order-2 md:order-1 relative">
              <div className="glass-card rounded-2xl p-6 shadow-2xl border-2 border-white/10">
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/5">
                  <span className="text-sm font-medium text-white/70">Applications</span>
                  <span className="text-xs text-white/30">12 total</span>
                </div>
                <div className="space-y-2">
                  {[
                    { title: "Senior Frontend Engineer", company: "Stripe", status: "interview", color: "amber" },
                    { title: "Staff Software Engineer", company: "Vercel", status: "applied", color: "blue" },
                    { title: "Engineering Manager", company: "Notion", status: "offer", color: "emerald" },
                  ].map((app, i) => (
                    <div key={i} className="glass-card rounded-xl p-4 hover:bg-white/[0.04] transition-all">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-white truncate">{app.title}</div>
                          <div className="text-xs text-white/40 truncate">{app.company}</div>
                        </div>
                        <div className={`px-2 py-1 rounded-lg text-[10px] font-medium bg-${app.color}-500/10 text-${app.color}-400 border border-${app.color}-500/20 capitalize shrink-0`}>
                          {app.status}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="order-1 md:order-2">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-sm mb-6">
                <FileText className="w-4 h-4" />
                <span>Smart Tracking</span>
              </div>
              <h3 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Track every application effortlessly
              </h3>
              <p className="text-white/50 text-lg mb-8 leading-relaxed">
                Never lose track of where you applied. Organize applications by status, search instantly, and see all your generated documents in one place.
              </p>
              <div className="space-y-4">
                {[
                  "Status tracking (Applied → Interview → Offer)",
                  "Quick search and filtering",
                  "One-click access to all documents",
                  "Timeline view of your job search"
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-cyan-500/20 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                    </div>
                    <span className="text-white/60">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Feature 3: Analytics */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="grid md:grid-cols-2 gap-12 items-center"
          >
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm mb-6">
                <BarChart3 className="w-4 h-4" />
                <span>Performance Insights</span>
              </div>
              <h3 className="text-3xl md:text-4xl font-bold text-white mb-4">
                See what's working with analytics
              </h3>
              <p className="text-white/50 text-lg mb-8 leading-relaxed">
                Track your application metrics, response rates, and interview conversion. Make data-driven decisions to optimize your job search strategy.
              </p>
              <div className="space-y-4">
                {[
                  "Weekly application trends",
                  "Interview and offer rates",
                  "Response time tracking",
                  "Goal progress monitoring"
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    </div>
                    <span className="text-white/60">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="glass-card rounded-2xl p-6 shadow-2xl border-2 border-white/10">
                <div className="mb-6">
                  <div className="flex items-center justify-center mb-2">
                    <div className="relative w-32 h-32">
                      <svg className="w-full h-full -rotate-90">
                        <circle cx="64" cy="64" r="56" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                        <circle cx="64" cy="64" r="56" fill="none" stroke="url(#gradient)" strokeWidth="8" strokeLinecap="round" strokeDasharray="351.68" strokeDashoffset="87.92" />
                        <defs>
                          <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#8b5cf6" />
                            <stop offset="100%" stopColor="#06b6d4" />
                          </linearGradient>
                        </defs>
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-3xl font-bold text-white">75%</span>
                        <span className="text-[10px] text-white/30">Goal Progress</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Applied", value: "12", icon: Target },
                    { label: "Interviews", value: "5", icon: Zap },
                    { label: "Offers", value: "2", icon: CheckCircle2 },
                  ].map((stat, i) => (
                    <div key={i} className="text-center">
                      <stat.icon className="w-4 h-4 text-purple-400 mx-auto mb-1" />
                      <div className="text-lg font-bold text-white">{stat.value}</div>
                      <div className="text-[10px] text-white/30">{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}