import React from "react";
import { motion } from "framer-motion";
import { FileText, Sparkles, Send } from "lucide-react";

const steps = [
  {
    icon: FileText,
    title: "Paste Job Description",
    description: "Copy the job posting from any site. Just paste the description and add optional details like company name.",
    color: "from-purple-500 to-purple-600",
  },
  {
    icon: Sparkles,
    title: "AI Generates Documents",
    description: "Our AI analyzes the job requirements and tailors a cover letter + resume bullets specifically for that role.",
    color: "from-cyan-500 to-cyan-600",
  },
  {
    icon: Send,
    title: "Copy & Apply",
    description: "Review, copy, or download your documents. Track every application and watch your interview rate soar.",
    color: "from-emerald-500 to-emerald-600",
  },
];

export default function HowItWorks() {
  return (
    <section className="py-32 px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-purple-900/10 via-transparent to-transparent" />
      
      <div className="max-w-6xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-20"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
            How it works
          </h2>
          <p className="text-lg text-white/40 max-w-2xl mx-auto">
            From job posting to tailored application in under 30 seconds
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8 md:gap-12">
          {steps.map((step, i) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.2 }}
              className="relative"
            >
              <div className="glass-card rounded-2xl p-8 hover:bg-white/[0.04] transition-all duration-300 h-full">
                <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${step.color} flex items-center justify-center mb-6 glow-purple`}>
                  <step.icon className="w-8 h-8 text-white" />
                </div>
                <div className="text-2xl font-bold text-white mb-3">{step.title}</div>
                <p className="text-white/50 leading-relaxed">{step.description}</p>
              </div>
              {i < steps.length - 1 && (
                <div className="hidden md:block absolute top-1/2 -right-6 w-12 h-0.5 bg-gradient-to-r from-purple-500/50 to-transparent" />
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}