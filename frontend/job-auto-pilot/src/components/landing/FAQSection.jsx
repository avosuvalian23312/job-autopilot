import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

const faqs = [
  {
    q: "How does Job Autopilot generate tailored documents?",
    a: "Our AI analyzes the job description you paste, identifies key requirements, skills, and company culture cues, then generates a cover letter and resume bullets that directly address those points using your profile data.",
  },
  {
    q: "Is the 7-day free trial really free?",
    a: "Yes — no credit card required. You get full access to your selected plan for 7 days. Cancel anytime before the trial ends and you won't be charged.",
  },
  {
    q: "Can I edit the generated content?",
    a: "Absolutely. All generated cover letters and resume bullets are fully editable. We recommend reviewing and personalizing the output before sending.",
  },
  {
    q: "What file formats can I export?",
    a: "Starter plan supports .txt export. Pro plan adds .docx export so you can download professional Word documents ready to attach to applications.",
  },
  {
    q: "How is my data stored and protected?",
    a: "Your data is encrypted at rest and in transit. We never share your personal information or job application data with third parties. You can delete your account and data at any time.",
  },
  {
    q: "Can I track my job applications?",
    a: "Yes! Every generated application is automatically saved to your tracker. You can update statuses (applied, interview, offer, rejected), search, filter, and view analytics on your progress.",
  },
];

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState(null);

  return (
    <section className="py-24 px-4">
      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Frequently asked questions
          </h2>
          <p className="text-white/40">Everything you need to know</p>
        </motion.div>

        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="glass-card rounded-xl overflow-hidden"
            >
              <button
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full flex items-center justify-between p-5 text-left hover:bg-white/[0.02] transition-colors"
              >
                <span className="text-sm font-medium text-white/80 pr-4">{faq.q}</span>
                <ChevronDown
                  className={`w-4 h-4 text-white/40 shrink-0 transition-transform duration-200 ${
                    openIndex === i ? "rotate-180" : ""
                  }`}
                />
              </button>
              <AnimatePresence>
                {openIndex === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="px-5 pb-5 text-sm text-white/50 leading-relaxed">
                      {faq.a}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}