import React, { useState } from "react";
import { motion } from "framer-motion";

const featureImageCards = [
  {
    title: "Quickly Generate Tailored Resumes and Cover Letters",
    description:
      "Paste any job description and generate personalized documents in seconds.",
    image: "/landing/previews/feature-1.jpg",
  },
  {
    title: "Track Every Application Effortlessly",
    description:
      "Organize and monitor your progress from application to interview to offer.",
    image: "/landing/previews/feature-2.jpg",
  },
  {
    title: "Stay on Top of Your Job Search Stats",
    description:
      "Use real-time analytics to improve response rates and optimize strategy.",
    image: "/landing/previews/feature-3.jpg",
  },
  {
    title: "Never Miss Important Updates and Reminders",
    description:
      "Get useful alerts so your pipeline keeps moving forward every week.",
    image: "/landing/previews/feature-4.jpg",
  },
];

export default function FeatureCards() {
  const [missingImages, setMissingImages] = useState({});

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
            Visual workflows for resumes, tracking, analytics, and reminders
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-6">
          {featureImageCards.map((card, i) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-black/25 shadow-[0_16px_36px_rgba(0,0,0,0.32)] transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-300/35"
            >
              <div className="aspect-[16/10] w-full">
                {missingImages[i] ? (
                  <div className="relative h-full w-full bg-[radial-gradient(120%_140%_at_0%_0%,rgba(99,102,241,0.32),transparent_45%),radial-gradient(120%_140%_at_100%_100%,rgba(34,211,238,0.25),transparent_45%),linear-gradient(180deg,rgba(8,12,22,0.95),rgba(6,10,18,0.95))] p-6">
                    <div className="text-xl font-bold text-white">{card.title}</div>
                    <div className="mt-3 max-w-[34ch] text-sm text-white/70">
                      {card.description}
                    </div>
                  </div>
                ) : (
                  <img
                    src={card.image}
                    alt={card.title}
                    loading="lazy"
                    onError={() =>
                      setMissingImages((prev) => ({ ...prev, [i]: true }))
                    }
                    className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.035]"
                  />
                )}
              </div>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/65 to-transparent" />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
