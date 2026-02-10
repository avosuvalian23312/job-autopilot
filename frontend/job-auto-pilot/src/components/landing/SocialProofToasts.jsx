// SocialProofToasts.jsx
// Bottom-left floating social-proof popups (stack) for dark theme.
// - Generates randomized mock events every few seconds
// - When NOT hovering: only the newest card is visible (no overlap mess)
// - When hovering: expands into a stacked list (like the example screenshot)
// - Hover also pauses generation + adds a subtle zoom-in animation
// - Dismissible per-card, and "Clear" to remove all

import React, { useEffect, useMemo, useRef, useState } from "react";

const COUNTRIES = [
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "GB", name: "United Kingdom" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "NL", name: "Netherlands" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
  { code: "IN", name: "India" },
  { code: "SG", name: "Singapore" },
  { code: "ID", name: "Indonesia" },
  { code: "PH", name: "Philippines" },
  { code: "BR", name: "Brazil" },
  { code: "MX", name: "Mexico" },
  { code: "ZA", name: "South Africa" },
  { code: "KR", name: "South Korea" },
  { code: "JP", name: "Japan" },
];

const CITIES = [
  "Austin", "Dallas", "Seattle", "San Jose", "Toronto", "Vancouver", "London",
  "Berlin", "Munich", "Amsterdam", "Stockholm", "Oslo", "Madrid", "Milan",
  "Sydney", "Melbourne", "Auckland", "Singapore", "Bengaluru", "Hyderabad",
  "Jakarta", "Manila", "São Paulo", "Mexico City", "Cape Town", "Seoul", "Tokyo",
];

const FIRST_NAMES = [
  "Ava", "Noah", "Mia", "Ethan", "Liam", "Sophia", "Lucas", "Amelia",
  "Oliver", "Isla", "James", "Emma", "Leo", "Nora", "Kai", "Zoe",
  "Aria", "Henry", "Ivy", "Mason",
];

const LAST_NAMES = [
  "Chen", "Patel", "Kim", "Nguyen", "Garcia", "Smith", "Johnson", "Brown",
  "Martinez", "Singh", "Williams", "Jones", "Davis", "Miller", "Wilson",
  "Anderson", "Thomas", "Taylor", "Moore", "Jackson",
];

const JOB_TITLES = [
  "IT Help Desk", "Technical Support", "Customer Support", "Junior DevOps",
  "Frontend Engineer", "Backend Engineer", "Data Analyst", "QA Engineer",
  "Cloud Support", "Support Engineer", "Sales Engineer", "Product Support",
];

const EVENT_TEMPLATES = [
  {
    title: ({ city, countryCode }) => `Someone from ${city}, ${countryCode} generated a tailored resume`,
    subtitle: () => `ATS keywords + stronger bullets in under 60 seconds`,
    icon: "spark",
  },
  {
    title: ({ city, countryCode }) => `Candidate in ${city}, ${countryCode} landed an interview`,
    subtitle: ({ jobTitle }) => `Used Job Autopilot for ${jobTitle} prep + packet`,
    icon: "check",
  },
  {
    title: ({ city, countryCode }) => `New job packet created from ${city}, ${countryCode}`,
    subtitle: () => `Resume + cover letter + checklist ready to apply`,
    icon: "doc",
  },
  {
    title: ({ city, countryCode }) => `Someone from ${city}, ${countryCode} improved their callback rate`,
    subtitle: () => `Better targeting + cleaner bullets = more replies`,
    icon: "up",
  },
  {
    title: ({ city, countryCode }) => `Offer secured in ${city}, ${countryCode}`,
    subtitle: ({ jobTitle }) => `Final round prep for ${jobTitle} — nailed it`,
    icon: "star",
  },
];

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function timeAgoString(minutesAgo) {
  if (minutesAgo < 60) return `${minutesAgo} min ago`;
  const hours = Math.floor(minutesAgo / 60);
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return `${days} days ago`;
}

function makeEvent() {
  const country = pick(COUNTRIES);
  const city = pick(CITIES);
  const jobTitle = pick(JOB_TITLES);

  const template = pick(EVENT_TEMPLATES);

  const minutesAgo = randInt(2, 60 * 24 * 45); // up to ~45 days
  const person = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;

  return {
    id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
    person,
    city,
    countryCode: country.code,
    jobTitle,
    title: template.title({ city, countryCode: country.code }),
    subtitle: template.subtitle({ jobTitle }),
    timeAgo: timeAgoString(minutesAgo),
    badge: "Stripe verified",
    icon: template.icon,
  };
}

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

function SparkIcon({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2l1.2 5.1L18 9l-4.8 1.9L12 16l-1.2-5.1L6 9l4.8-1.9L12 2z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M19 13l.7 3 3 1.2-3 1.2-.7 3-.7-3-3-1.2 3-1.2.7-3z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DocIcon({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 3h7l3 3v15a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path d="M14 3v4a2 2 0 0 0 2 2h4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 13h8M8 17h8M8 9h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function UpIcon({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 17l4-4 3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 10V5h-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StarIcon({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.9 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9L12 2.5z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EventIcon({ kind }) {
  const common = "h-5 w-5";
  // Dark theme icon colors
  switch (kind) {
    case "spark":
      return <SparkIcon className={`${common} text-purple-300`} />;
    case "doc":
      return <DocIcon className={`${common} text-cyan-300`} />;
    case "up":
      return <UpIcon className={`${common} text-emerald-300`} />;
    case "star":
      return <StarIcon className={`${common} text-amber-300`} />;
    case "check":
    default:
      return <CheckIcon className={`${common} text-emerald-300`} />;
  }
}

export default function SocialProofToasts({
  intervalMs = 5200,
  bottom = 22,
  left = 22,
  hideOnMobile = false,
  maxItems = 6,
}) {
  const [items, setItems] = useState(() => {
    // Start with 2-3 pre-filled items so it looks alive
    const startCount = 3;
    const seed = Array.from({ length: startCount }, () => makeEvent());
    return seed;
  });

  const [dismissed, setDismissed] = useState(false);
  const [hovered, setHovered] = useState(false);

  const timerRef = useRef(null);

  useEffect(() => {
    if (dismissed) return;

    // Pause generation while hovered (so user can read)
    if (hovered) return;

    timerRef.current = setInterval(() => {
      setItems((prev) => {
        const next = [makeEvent(), ...prev];
        return next.slice(0, maxItems);
      });
    }, intervalMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [dismissed, hovered, intervalMs, maxItems]);

  const visible = useMemo(() => {
    // Not hovered: show only the newest card
    if (!hovered) return items.slice(0, 1);
    // Hovered: show the whole stack
    return items;
  }, [items, hovered]);

  if (dismissed) return null;

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
        className="pointer-events-auto w-[340px] max-w-[86vw]"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div className="relative">
          {/* Stack */}
          <div
            className={[
              "flex flex-col gap-3",
              "transition-all duration-300",
            ].join(" ")}
          >
            {visible.map((e, i) => {
              const isTop = i === 0;
              const collapsed = !hovered;

              // When hovered, show a neat vertical list.
              // When not hovered, only 1 item rendered so no overlap.
              return (
                <div
                  key={e.id}
                  className={[
                    "relative overflow-hidden rounded-2xl border",
                    "bg-[rgba(10,10,14,0.88)]",
                    "border-white/10",
                    "shadow-[0_12px_32px_rgba(0,0,0,0.45)]",
                    "backdrop-blur-xl",
                    // hover zoom effect (like your example)
                    "transition-transform duration-250",
                    hovered ? "hover:scale-[1.02]" : "",
                    // subtle entrance for new cards
                    "animate-[toastIn_420ms_ease-out]",
                  ].join(" ")}
                  style={{
                    // when expanded, keep full opacity
                    opacity: hovered ? 1 : 1,
                    // optional: slightly scale down lower items for depth
                    transform: hovered && !isTop ? `scale(${1 - Math.min(i, 4) * 0.01})` : undefined,
                  }}
                >
                  {/* top accent bar */}
                  <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-purple-500/70 via-cyan-400/35 to-transparent" />

                  {/* Dismiss (per card) */}
                  <button
                    type="button"
                    className={[
                      "absolute top-3 right-3 rounded-lg px-2 py-1 text-[12px]",
                      "text-white/50 hover:text-white/80 hover:bg-white/5 transition",
                      // don't show close button on collapsed? keep it on top item only for cleanliness
                      collapsed && !isTop ? "hidden" : "",
                    ].join(" ")}
                    aria-label="Dismiss"
                    title="Dismiss"
                    onClick={() => {
                      setItems((prev) => prev.filter((x) => x.id !== e.id));
                    }}
                  >
                    ✕
                  </button>

                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-white">
                        <EventIcon kind={e.icon} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold text-white/90 leading-snug">
                          {e.title}
                        </div>

                        <div className="mt-1 text-[12px] text-white/60 leading-snug">
                          {e.subtitle}
                        </div>

                        <div className="mt-3 flex items-center justify-between">
                          <div className="text-[11px] text-white/40">{e.timeAgo}</div>

                          <div className="inline-flex items-center gap-1.5 text-[11px] text-white/55">
                            <ShieldIcon className="h-4 w-4 text-blue-300/80" />
                            {e.badge}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* soft inner ring */}
                  <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-white/5" />
                </div>
              );
            })}
          </div>

          {/* Footer actions (only on hover, like a "panel") */}
          {hovered && items.length > 1 && (
            <div className="mt-2 flex items-center justify-between px-1">
              <div className="text-[11px] text-white/35">
                Live activity • updating every {Math.round(intervalMs / 1000)}s
              </div>

              <button
                type="button"
                className="text-[11px] text-white/50 hover:text-white/80 transition"
                onClick={() => setItems((prev) => prev.slice(0, 1))}
              >
                Clear
              </button>
            </div>
          )}
        </div>

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
