import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { clearAppToken } from "@/lib/appSession";
import {
  Rocket,
  Home,
  FileText,
  BarChart3,
  Settings,
  LogOut,
  Coins,
} from "lucide-react";

const navItems = [
  { label: "Home", icon: Home, page: "AppHome" },
  { label: "Resumes", icon: FileText, page: "Resumes" },
  { label: "Applications", icon: FileText, page: "Applications" },
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
    clearAppToken();
    swaLogout(createPageUrl("Landing") || "/");
  };

  return (
    <nav className="border-b border-white/5 bg-[hsl(240,10%,4%)]/95 backdrop-blur-xl sticky top-0 z-40 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link
          to={createPageUrl("AppHome")}
          className="flex items-center gap-2.5"
        >
          <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center">
            <Rocket className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-white hidden sm:block">
            Job Autopilot
          </span>
        </Link>

        <div className="flex items-center gap-1">
          {navItems.map((item) => (
            <Link
              key={item.page}
              to={createPageUrl(item.page)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                currentPage === item.page
                  ? "bg-purple-600/20 text-purple-400"
                  : "text-white/40 hover:text-white/70 hover:bg-white/5"
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
            className="credits-pill group relative flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl border border-cyan-300/25 bg-[linear-gradient(150deg,rgba(19,34,61,0.95),rgba(54,30,94,0.9))] shadow-[inset_0_1px_0_rgba(255,255,255,0.24),0_10px_26px_rgba(10,32,90,0.36)] hover:border-cyan-200/40 hover:-translate-y-0.5 transition-all cursor-pointer"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-xl bg-[linear-gradient(180deg,rgba(255,255,255,0.24),rgba(255,255,255,0.09)_36%,rgba(255,255,255,0)_72%)]"
            />
            <span aria-hidden className="credits-pill-shine" />
            <span aria-hidden className="credits-pill-glow" />
            <Coins className="relative z-10 w-4 h-4 text-purple-100" />
            <span className="relative z-10 text-sm font-semibold text-purple-100">
              {displayCredits}
            </span>
            <span className="relative z-10 text-xs text-purple-100/65 hidden sm:inline">
              credits
            </span>
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/30 hover:text-white/60 hover:bg-white/5 transition-all"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden md:block">Logout</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
