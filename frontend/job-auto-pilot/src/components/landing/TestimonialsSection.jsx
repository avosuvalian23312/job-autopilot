import React from "react";
import { motion } from "framer-motion";
import { Star } from "lucide-react";

const testimonials = [
  {
    name: "Sarah Chen",
    role: "Product Manager at Stripe",
    avatar: "SC",
    text: "Job Autopilot cut my application time by 80%. I went from 2 interviews a month to 8. Absolutely game-changing.",
    stars: 5,
  },
  {
    name: "Marcus Williams",
    role: "Software Engineer at Meta",
    avatar: "MW",
    text: "The cover letters it generates are indistinguishable from hand-written ones. Recruiters consistently compliment how tailored my applications are.",
    stars: 5,
  },
  {
    name: "Priya Patel",
    role: "Data Scientist at Netflix",
    avatar: "PP",
    text: "I landed my dream role in 3 weeks. The resume bullets matched exactly what the hiring manager was looking for.",
    stars: 5,
  },
  {
    name: "James O'Connor",
    role: "UX Designer at Airbnb",
    avatar: "JO",
    text: "Tracking all my applications in one place with auto-generated documents? This is what job hunting should feel like.",
    stars: 5,
  },
  {
    name: "Elena Rodriguez",
    role: "Marketing Lead at Shopify",
    avatar: "ER",
    text: "I was skeptical about AI writing tools but Job Autopilot nails the tone every time. Worth every penny of the Pro plan.",
    stars: 5,
  },
  {
    name: "David Kim",
    role: "DevOps Engineer at AWS",
    avatar: "DK",
    text: "Applied to 50 positions in a week with personalized materials for each. Got 12 callbacks. The ROI is insane.",
    stars: 5,
  },
];

export default function TestimonialsSection() {
  return (
    <section className="py-24 px-4 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-purple-500/5 rounded-full blur-[120px]" />
      <div className="max-w-6xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Loved by professionals
          </h2>
          <p className="text-white/40 max-w-lg mx-auto">
            Join thousands who landed their dream roles with Job Autopilot
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {testimonials.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="glass-card rounded-2xl p-6 hover:bg-white/[0.04] transition-all duration-300"
            >
              <div className="flex gap-1 mb-4">
                {Array(t.stars).fill(0).map((_, j) => (
                  <Star key={j} className="w-4 h-4 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="text-white/70 text-sm leading-relaxed mb-6">"{t.text}"</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center text-xs font-bold text-white">
                  {t.avatar}
                </div>
                <div>
                  <div className="text-sm font-medium text-white">{t.name}</div>
                  <div className="text-xs text-white/40">{t.role}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}