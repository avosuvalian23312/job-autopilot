// SocialProofToasts.jsx
// Bottom-left floating social-proof popup (single card) like the screenshot.
// Mock data only. Stays anchored while scrolling (position: fixed).
// Rotates every few seconds. Dismissible. Pauses on hover.

import React, { useEffect, useMemo, useRef, useState } from "react";

const MOCK = [
  {
    title: "Founder from AU Australia just joined",
    subtitle: "Secured lifetime access at Early Access price",
    timeAgo: "19 hours ago",
    badge: "Stripe verified",
  },
  {
    title: "Someone from DE Germany claimed their spot",
    subtitle: "Limited Early Access spots left!",
    timeAgo: "8 days ago",
    badge: "Stripe verified",
  },
  {
    title: "Developer from ID Indonesia",
    subtitle: "Just saved $1,188/year with lifetime access",
    timeAgo: "20 days ago",
    badge: "Stripe verified",
  },
];

function CheckIcon({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M7.5 12.3l2.7 2.7 6.3-6.7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShieldIcon({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2.5l7.5 3.5v6.1c0 5-3.2 8.2-7.5 10.1C7.7 20.3 4.5 17.1 4.5 12.1V6L12 2.5z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M9 12.2l2.1 2.1 4.5-4.7"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function SocialProofToasts({
  items = MOCK,
  intervalMs = 6500,
  bottom = 22, // px-ish spacing via inline style
  left = 22,
  // optional: hide on very small screens
  hideOnMobile = false,
}) {
  const list = useMemo(() => (Array.isArray(items) && items.length ? items : MOCK), [items]);

  const [idx, setIdx] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [animateKey, setAnimateKey] = useState(0);

  const timerRef = useRef(null);

  useEffect(() => {
    if (dismissed) return;
    if (paused) return;

    timerRef.current = setInterval(() => {
      setIdx((i) => (i + 1) % list.length);
      setAnimateKey((k) => k + 1); // re-trigger entrance anim
    }, intervalMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [dismissed, paused, intervalMs, list.length]);

  if (dismissed) return null;

  const current = list[idx];

  return (
    <div
      className={[
        "fixed z-[70] pointer-events-none",
        hideOnMobile ? "hidden sm:block" : "",
      ].join(" ")}
      style={{ bottom, left }}
      aria-label="Social proof"
    >
      <div
        className="pointer-events-auto w-[320px] max-w-[86vw]"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {/* Single popup card */}
        <div
          key={animateKey}
          className={[
            "relative overflow-hidden rounded-2xl border border-black/10",
            "bg-white shadow-[0_10px_30px_rgba(0,0,0,0.18)]",
            "animate-[toastIn_420ms_ease-out]",
          ].join(" ")}
        >
          {/* subtle top highlight like the screenshot */}
          <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-emerald-400/80 via-emerald-400/40 to-transparent" />

          <button
            type="button"
            className="absolute top-3 right-3 rounded-lg px-2 py-1 text-[12px] text-black/50 hover:text-black/80 hover:bg-black/5 transition"
            aria-label="Dismiss"
            title="Dismiss"
            onClick={() => setDismissed(true)}
          >
            ✕
          </button>

          <div className="p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <CheckIcon className="h-5 w-5" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-black/90 leading-snug">
                  {current.title}
                </div>

                <div className="mt-1 text-[12px] text-black/60 leading-snug">
                  {current.subtitle}
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <div className="text-[11px] text-black/40">{current.timeAgo}</div>

                  <div className="inline-flex items-center gap-1.5 text-[11px] text-black/55">
                    <ShieldIcon className="h-4 w-4 text-blue-600/70" />
                    {current.badge}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* soft edge shadow */}
          <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-black/5" />
        </div>

        {/* Tailwind can't define keyframes without config; using style tag for local keyframes */}
        <style>{`
          @keyframes toastIn {
            0% { transform: translateY(10px); opacity: 0; }
            100% { transform: translateY(0px); opacity: 1; }
          }
        `}</style>
      </div>
    </div>
  );
}
