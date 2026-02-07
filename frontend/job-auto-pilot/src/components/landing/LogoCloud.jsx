import React from "react";
import { motion } from "framer-motion";

const companies = [
  "Google", "Microsoft", "Amazon", "Meta", "Apple",
  "Netflix", "Stripe", "Shopify", "Airbnb", "Uber",
  "Tesla", "Spotify", "LinkedIn", "Adobe", "Salesforce"
];

export default function LogoCloud() {
  return (
    <section className="py-20 px-4">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <p className="text-sm text-white/40 uppercase tracking-wider mb-4">Trusted by job seekers at</p>
        </motion.div>

        <div className="grid grid-cols-3 md:grid-cols-5 gap-6 md:gap-8">
          {companies.map((company, i) => (
            <motion.div
              key={company}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center justify-center"
            >
              <div className="text-white/20 font-bold text-lg md:text-xl hover:text-white/40 transition-colors cursor-default">
                {company}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}