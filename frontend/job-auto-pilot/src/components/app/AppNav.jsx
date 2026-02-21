import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { clearAppToken, getAppToken } from "@/lib/appSession";
import {
  Zap,
  Home,
  FileText,
  Briefcase,
  BarChart3,
  Settings,
  LogOut,
} from "lucide-react";

const navItems = [
  { label: "Home", icon: Home, page: "AppHome" },
  { label: "Resumes", icon: FileText, page: "Resumes" },
  { label: "Applications", icon: Briefcase, page: "Applications" },
  { label: "Analytics", icon: BarChart3, page: "Analytics" },
  { label: "Settings", icon: Settings, page: "AppSettings" },
];

// âœ… Azure Static Web Apps logout helper (REAL logout)
function swaLogout(redirectPath = "/") {
  const safe =
    redirectPath && String(redirectPath).startsWith("/")
      ? String(redirectPath)
      : "/";
  window.location.assign(
    `/.auth/logout?post_logout_redirect_uri=${encodeURIComponent(safe)}`
  );
}

export default function AppNav({ currentPage, credits }) {
  const [liveCredits, setLiveCredits] = useState(null);

  useEffect(() => {
    let active = true;

    const parseCredits = (data) => {
      const raw =
        data?.credits?.balance ??
        data?.balance ??
        data?.creditsBalance ??
        null;
      const n = Number(raw);
      return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
    };

    const loadCredits = async () => {
      try {
        const res = await fetch("/api/credits/me", {
          method: "GET",
          credentials: "include",
        });
        if (!res.ok) return;

        const text = await res.text();
        let data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = null;
        }

        const parsed = parseCredits(data);
        if (active && parsed !== null) setLiveCredits(parsed);
      } catch {
        // no-op
      }
    };

    loadCredits();
    const onFocus = () => loadCredits();
    const intervalId = window.setInterval(loadCredits, 30000);
    window.addEventListener("focus", onFocus);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const displayCredits =
    typeof credits === "number" ? credits : liveCredits ?? 0;

  const handleLogout = () => {
    const landingPath = createPageUrl("Landing") || "/";
    const hadAppToken = !!getAppToken();
    clearAppToken();
    if (hadAppToken) {
      window.location.assign(landingPath);
      return;
    }
    swaLogout(landingPath);
  };

  return (
    <nav className="sticky top-0 z-40 border-b border-white/10 bg-[linear-gradient(180deg,rgba(4,9,16,0.96),rgba(4,9,16,0.92))] backdrop-blur-xl shadow-[0_10px_24px_rgba(0,0,0,0.35)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link
          to={createPageUrl("AppHome")}
          className="flex items-center gap-2.5"
        >
          <div className="grid h-9 w-9 place-items-center rounded-xl border border-cyan-300/35 bg-gradient-to-br from-cyan-400/95 to-teal-400/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_10px_26px_rgba(6,182,212,0.32)]">
            <Zap className="h-4 w-4 text-slate-950" />
          </div>
          <span className="hidden font-bold text-white sm:block">
            Job Autopilot
          </span>
        </Link>

        <div className="flex items-center gap-1.5">
          {navItems.map((item) => (
            <Link
              key={item.page}
              to={createPageUrl(item.page)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                currentPage === item.page
                  ? "border border-emerald-300/25 bg-emerald-500/15 text-emerald-200"
                  : "border border-transparent text-white/55 hover:text-white/85 hover:bg-white/[0.06]"
              }`}
            >
              <item.icon className="w-4 h-4" />
              <span className="hidden md:block">{item.label}</span>
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link
            to={createPageUrl("Credits")}
            className="credits-pill group relative flex cursor-pointer items-center gap-2.5 rounded-xl border border-emerald-300/30 bg-[linear-gradient(140deg,rgba(0,58,55,0.95),rgba(1,39,53,0.94))] px-3.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_10px_22px_rgba(0,0,0,0.35)] transition-all hover:-translate-y-0.5 hover:border-emerald-200/40"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-xl bg-[linear-gradient(180deg,rgba(255,255,255,0.24),rgba(255,255,255,0.09)_36%,rgba(255,255,255,0)_72%)]"
            />
            <span aria-hidden className="credits-pill-shine" />
            <span aria-hidden className="credits-pill-glow" />
            <Zap className="relative z-10 h-4 w-4 text-emerald-100" />
            <span className="relative z-10 text-sm font-semibold text-emerald-100">
              {displayCredits}
            </span>
            <span className="relative z-10 hidden text-xs text-emerald-100/65 sm:inline">
              credits
            </span>
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/45 transition-all hover:bg-white/[0.06] hover:text-white/80"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden md:block">Logout</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
