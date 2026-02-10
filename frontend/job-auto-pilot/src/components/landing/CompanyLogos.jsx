import React, { useMemo } from "react";
import { motion } from "framer-motion";

const companies = [
  { name: "Microsoft", logo: "/logos/64px-Microsoft_logo.svg.png" },
  { name: "Amazon", logo: "/logos/64px-Amazon_logo.svg.png" },
  { name: "Apple", logo: "/logos/64px-Apple_logo_black.svg.png" },
  { name: "Netflix", logo: "/logos/64px-Netflix_2015_logo.svg.png" },
  { name: "Stripe", logo: "/logos/64px-Stripe_logo_revised_2016.svg.png" },

  // ✅ FIX: you had Stripe duplicated here by accident
  { name: "Shopify", logo: "/logos/64px-Shopify_logo_2018svg.png" },

  { name: "LinkedIn", logo: "/logos/64px-LinkedIn_icon.svg.png" },
  { name: "Salesforce", logo: "/logos/64px-Salesforce.com_logo.svg.png" },
  { name: "Uber", logo: "/logos/64px-Uber_logo_2018.svg.png" },
  { name: "Airbnb", logo: "/logos/64px-Airbnb_Logo_Bélo.svg.png" },
  { name: "Adobe", logo: "/logos/adobe.svg.png" },
];

function LogoItem({ name, logo }) {
  return (
    <div className="mx-7 flex items-center justify-center opacity-75 hover:opacity-100 transition-opacity duration-300">
      <img
        src={logo}
        alt={name}
        loading="lazy"
        className="
          h-8 md:h-9 w-auto object-contain
          opacity-90 hover:opacity-100 transition
          grayscale hover:grayscale-0
          [filter:brightness(1.2)_contrast(1.1)]
        "
        onError={(e) => {
          // Fallback: show text if the image 404s
          e.currentTarget.style.display = "none";
          const fallback = e.currentTarget.nextSibling;
          if (fallback) fallback.style.display = "inline-flex";
        }}
      />
      <span
        style={{ display: "none" }}
        className="text-white/60 text-sm font-semibold tracking-wide"
      >
        {name}
      </span>
    </div>
  );
}

export default function CompanyLogos() {
  // Duplicate list for seamless infinite marquee
  const marquee = useMemo(() => [...companies, ...companies], []);

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
          <div className="marquee">
            <div className="marquee__track">
              {marquee.map((company, i) => (
                <LogoItem key={i} {...company} />
              ))}
            </div>
          </div>

          {/* edge fades */}
          <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-[hsl(240,10%,4%)] to-transparent pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-[hsl(240,10%,4%)] to-transparent pointer-events-none" />
        </div>
      </div>

      {/* ✅ NOT style jsx (Next-only) — plain style works everywhere */}
      <style>{`
        .marquee {
          overflow: hidden;
          width: 100%;
        }
        .marquee__track {
          display: flex;
          align-items: center;
          width: max-content;
          animation: marqueeScroll 30s linear infinite;
          will-change: transform;
        }
        .marquee:hover .marquee__track {
          animation-play-state: paused;
        }
        @keyframes marqueeScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </section>
  );
}
