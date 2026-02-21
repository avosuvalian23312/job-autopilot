import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";

export default function PageLoadingOverlay({ show, label = "Loading..." }) {
  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          key="page-loading-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30 backdrop-blur-md"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex items-center gap-3 rounded-2xl border border-cyan-300/25 bg-[linear-gradient(140deg,rgba(4,13,24,0.94),rgba(6,18,28,0.94))] px-5 py-3.5 text-sm text-white shadow-[0_20px_45px_rgba(0,0,0,0.45)]">
            <Loader2 className="h-4.5 w-4.5 animate-spin text-cyan-200" />
            <span className="font-medium tracking-[0.01em]">{label}</span>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
