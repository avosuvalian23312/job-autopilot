import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";

const StatCounter = ({ end, label, suffix = "" }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const duration = 2000;
    const steps = 60;
    const increment = end / steps;
    let current = 0;
    
    const timer = setInterval(() => {
      current += increment;
      if (current >= end) {
        setCount(end);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [end]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className="text-center"
    >
      <div className="text-5xl md:text-6xl font-bold text-white mb-2 animate-counter">
        {count.toLocaleString()}{suffix}
      </div>
      <div className="text-sm text-white/40 font-medium">{label}</div>
    </motion.div>
  );
};

export default function LiveStats() {
  return (
    <div className="py-20 px-4 border-y border-white/5">
      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12">
        <StatCounter end={24847} label="Applications Generated" suffix="+" />
        <StatCounter end={8392} label="Interviews Landed" suffix="+" />
        <StatCounter end={3241} label="Job Offers Received" suffix="+" />
      </div>
    </div>
  );
}