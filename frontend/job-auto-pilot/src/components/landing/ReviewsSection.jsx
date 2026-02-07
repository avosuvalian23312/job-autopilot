import React from "react";
import { motion } from "framer-motion";
import { Star, Briefcase } from "lucide-react";

const reviews = [
  { name: "Sarah Chen", role: "Product Manager", company: "Stripe", outcome: "3 interviews in first week", text: "Job Autopilot cut my application time by 80%. The cover letters are indistinguishable from hand-written ones.", rating: 5 },
  { name: "Marcus Williams", role: "Software Engineer", company: "Meta", outcome: "Landed dream job", text: "Used this for my Meta application. The tailored bullets perfectly matched what the hiring manager wanted.", rating: 5 },
  { name: "Priya Patel", role: "Data Scientist", company: "Netflix", outcome: "Offer in 3 weeks", text: "I was skeptical about AI tools but this is genuinely incredible. Worth every penny.", rating: 5 },
  { name: "James O'Connor", role: "UX Designer", company: "Airbnb", outcome: "5 callbacks from 15 apps", text: "The tracking feature alone is worth it. Add the AI generation and it's a no-brainer.", rating: 5 },
  { name: "Elena Rodriguez", role: "Marketing Lead", company: "Shopify", outcome: "12 interviews in 2 weeks", text: "Applied to 50 positions in a week. Got 12 callbacks. The ROI is insane.", rating: 5 },
  { name: "David Kim", role: "DevOps Engineer", company: "AWS", outcome: "40% higher response rate", text: "My response rate literally doubled after switching to Job Autopilot.", rating: 5 },
  { name: "Lisa Anderson", role: "Product Designer", company: "Figma", outcome: "Offer with 30% raise", text: "Not only did I land the job, I negotiated a 30% raise using these materials.", rating: 5 },
  { name: "Michael Zhang", role: "Engineering Manager", company: "Uber", outcome: "Multiple offers", text: "Juggling multiple offers now. This tool made applying to senior roles actually manageable.", rating: 5 },
  { name: "Rachel Green", role: "Growth Marketer", company: "Notion", outcome: "Interview at dream company", text: "Finally landed an interview at my dream company after months of trying.", rating: 5 },
  { name: "Tom Bradley", role: "Backend Engineer", company: "Vercel", outcome: "8 interviews from 20 apps", text: "My interview rate went from 10% to 40%. Game changer.", rating: 5 },
];

export default function ReviewsSection() {
  return (
    <section className="py-32 px-4 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-purple-500/5 rounded-full blur-[150px]" />
      
      <div className="max-w-7xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-20"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Real results from real professionals
          </h2>
          <p className="text-lg text-white/40 max-w-2xl mx-auto">
            Join thousands who transformed their job search with Job Autopilot
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {reviews.map((review, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: (i % 3) * 0.1 }}
              className="glass-card rounded-2xl p-6 hover:bg-white/[0.04] transition-all duration-300"
            >
              <div className="flex gap-0.5 mb-4">
                {Array(review.rating).fill(0).map((_, j) => (
                  <Star key={j} className="w-4 h-4 fill-amber-400 text-amber-400" />
                ))}
              </div>

              <p className="text-white/70 text-sm leading-relaxed mb-6">
                "{review.text}"
              </p>

              <div className="flex items-start gap-3 pb-4 mb-4 border-b border-white/5">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center text-xs font-bold text-white shrink-0">
                  {review.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white truncate">{review.name}</div>
                  <div className="text-xs text-white/40 truncate">{review.role}</div>
                  <div className="text-xs text-white/30 truncate">{review.company}</div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <Briefcase className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400 font-medium">{review.outcome}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}