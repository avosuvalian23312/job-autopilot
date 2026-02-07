import React from "react";
import { motion } from "framer-motion";

const CompanyBadge = ({ name }) => {
  return (
    <div className="px-4 py-2 rounded-full border border-white/15 bg-white/5 backdrop-blur-sm hover:bg-white/10 hover:border-white/25 transition-all duration-300">
      <span className="text-white/80 text-sm font-medium">{name}</span>
    </div>
  );
};

const companies = [
  "Microsoft", "Amazon", "Meta", "Apple", "Netflix", "Stripe",
  "Shopify", "LinkedIn", "Adobe", "Salesforce", "Uber", "Airbnb"
];

export default function CompanyLogos() {
  return (
    <section className="py-16 px-4 border-y border-white/5 overflow-hidden">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-10"
        >
          <p className="text-sm text-white/50 uppercase tracking-wider font-semibold">
            Trusted by job seekers at
          </p>
        </motion.div>

        <div className="relative">
          <div className="flex animate-scroll">
            {[...companies, ...companies].map((company, i) => (
              <div key={i} className="flex-shrink-0 mx-3">
                <CompanyBadge name={company} />
              </div>
            ))}
          </div>
          <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-[hsl(240,10%,4%)] to-transparent pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-[hsl(240,10%,4%)] to-transparent pointer-events-none" />
        </div>
      </div>

      <style jsx>{`
        @keyframes scroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        .animate-scroll {
          animation: scroll 30s linear infinite;
        }
        .animate-scroll:hover {
          animation-play-state: paused;
        }
      `}</style>
    </section>
  );
}