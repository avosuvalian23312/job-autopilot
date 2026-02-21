import React, { useState } from "react";
import { motion } from "framer-motion";

export default function BeforeAfter() {
  const [missingImages, setMissingImages] = useState({});

  return (
    <section className="py-24 px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-900/5 to-transparent" />

      <div className="max-w-[1320px] mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
            See the resume transformation
          </h2>
          <p className="text-lg text-white/40 max-w-2xl mx-auto">
            Before vs. after ATS optimization, side by side.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 items-stretch gap-5 md:grid-cols-[1fr_auto_1fr] md:gap-7">
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="group relative rounded-2xl border border-rose-300/20 bg-black/30 shadow-[0_18px_38px_rgba(0,0,0,0.35)]"
          >
            <div className="pointer-events-none absolute left-4 -top-3 z-20 rounded-full border border-rose-300/35 bg-[linear-gradient(135deg,rgba(37,14,25,0.95),rgba(28,11,19,0.9))] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-rose-100 shadow-[0_8px_22px_rgba(0,0,0,0.45)]">
              Resume Before
            </div>
            <div className="aspect-[16/11] w-full overflow-hidden rounded-[inherit]">
              {missingImages.before ? (
                <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(120%_120%_at_0%_0%,rgba(244,63,94,0.22),transparent_45%),linear-gradient(180deg,rgba(8,12,22,0.96),rgba(6,10,18,0.96))] px-8 text-center text-white/70">
                  Add
                  <code className="mx-1 rounded bg-white/10 px-1 py-0.5 text-xs">
                    resumebefore.jpg
                  </code>
                  in
                  <code className="ml-1 rounded bg-white/10 px-1 py-0.5 text-xs">
                    public/landing/previews
                  </code>
                </div>
              ) : (
                <img
                  src="/landing/previews/resumebefore.jpg"
                  alt="Resume before optimization"
                  loading="lazy"
                  onError={() => setMissingImages((prev) => ({ ...prev, before: true }))}
                  className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                />
              )}
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />
          </motion.div>

          <div className="relative flex items-center justify-center">
            <div className="h-px w-full bg-gradient-to-r from-rose-300/30 via-white/40 to-emerald-300/30 md:hidden" />
            <div className="hidden h-full w-px bg-gradient-to-b from-rose-300/35 via-cyan-300/60 to-emerald-300/35 md:block" />
            <div className="absolute rounded-full border border-white/25 bg-black/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200 shadow-[0_0_20px_rgba(56,189,248,0.25)]">
              vs
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="group relative rounded-2xl border border-emerald-300/25 bg-black/30 shadow-[0_18px_38px_rgba(0,0,0,0.35)]"
          >
            <div className="pointer-events-none absolute left-4 -top-3 z-20 rounded-full border border-emerald-300/35 bg-[linear-gradient(135deg,rgba(7,33,29,0.95),rgba(7,27,22,0.9))] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-100 shadow-[0_8px_22px_rgba(0,0,0,0.45)]">
              Resume After
            </div>
            <div className="aspect-[16/11] w-full overflow-hidden rounded-[inherit]">
              {missingImages.after ? (
                <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(120%_120%_at_100%_0%,rgba(16,185,129,0.22),transparent_45%),linear-gradient(180deg,rgba(8,12,22,0.96),rgba(6,10,18,0.96))] px-8 text-center text-white/70">
                  Add
                  <code className="mx-1 rounded bg-white/10 px-1 py-0.5 text-xs">
                    resumeafter.jpg
                  </code>
                  in
                  <code className="ml-1 rounded bg-white/10 px-1 py-0.5 text-xs">
                    public/landing/previews
                  </code>
                </div>
              ) : (
                <img
                  src="/landing/previews/resumeafter.jpg"
                  alt="Resume after optimization"
                  loading="lazy"
                  onError={() => setMissingImages((prev) => ({ ...prev, after: true }))}
                  className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                />
              )}
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
