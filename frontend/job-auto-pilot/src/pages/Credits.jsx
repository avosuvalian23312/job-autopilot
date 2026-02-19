import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Rocket,
  Coins,
  TrendingUp,
  Calendar,
  Download,
  Plus,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

const packages = [
  { credits: 50, price: 9, popular: false },
  { credits: 150, price: 24, popular: true, save: "20%" },
  { credits: 300, price: 45, popular: false, save: "25%" },
  { credits: 500, price: 69, popular: false, save: "30%" },
];

function formatDate(dateLike) {
  const d = new Date(dateLike);
  if (!Number.isFinite(d.getTime())) return "-";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function planLabel(plan) {
  const p = String(plan || "free").toLowerCase();
  if (p === "starter") return "Starter";
  if (p === "pro") return "Pro";
  if (p === "team" || p === "max" || p === "power") return "Team";
  return "Free";
}

function reasonLabel(reason, type) {
  const r = String(reason || "");
  if (!r) return type === "grant" ? "Credit Grant" : "Credit Spend";
  if (r.startsWith("sub_paid:")) {
    const parts = r.split(":");
    const plan = planLabel(parts[1] || "");
    return `${plan} subscription credit`;
  }
  if (r.includes("resume")) return "Resume Generation";
  if (r.includes("cover")) return "Cover Letter";
  return type === "grant" ? "Credit Grant" : "Credit Spend";
}

async function apiFetch(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await res.text().catch(() => "");
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const msg =
      data?.error ||
      data?.message ||
      data?.detail ||
      (typeof data?.raw === "string" ? data.raw : "") ||
      text ||
      `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return data;
}

export default function Credits() {
  const [selectedPackage, setSelectedPackage] = useState(1);
  const [creditsMe, setCreditsMe] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setErrorMsg("");

        const [creditsData, profileData] = await Promise.all([
          apiFetch("/api/credits/me"),
          apiFetch("/api/profile/me"),
        ]);

        if (cancelled) return;
        setCreditsMe(creditsData || null);

        const profile = profileData?.profile || null;
        const entries = Array.isArray(profile?.creditsLedger)
          ? profile.creditsLedger
          : [];
        setLedger(entries);
      } catch (e) {
        if (cancelled) return;
        setErrorMsg(e?.message || "Failed to load credits.");
        setCreditsMe(null);
        setLedger([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const balance = Number(creditsMe?.credits?.balance || 0) || 0;
  const monthlyAllowance = Number(creditsMe?.credits?.monthlyAllowance || 0) || 0;
  const monthlyUsed = Number(creditsMe?.credits?.monthlyUsed || 0) || 0;
  const monthlyRemaining = Number(creditsMe?.credits?.monthlyRemaining || 0) || 0;
  const monthlyPeriod = String(creditsMe?.credits?.monthlyPeriod || "");
  const plan = String(creditsMe?.plan || "free");

  const renewsOnLabel = useMemo(() => {
    const m = monthlyPeriod.match(/^(\d{4})-(\d{2})$/);
    if (!m) return "-";
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (!Number.isFinite(year) || !Number.isFinite(month)) return "-";
    const renew = new Date(Date.UTC(year, month, 1));
    return renew.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }, [monthlyPeriod]);

  const progressPct = useMemo(() => {
    if (!monthlyAllowance) return 0;
    const pct = Math.round((Math.min(balance, monthlyAllowance) / monthlyAllowance) * 100);
    return Math.max(0, Math.min(100, pct));
  }, [balance, monthlyAllowance]);

  const usageHistory = useMemo(() => {
    return (Array.isArray(ledger) ? ledger : [])
      .slice(0, 12)
      .map((entry, i) => {
        const delta = Number(entry?.delta || 0) || 0;
        return {
          id: entry?.id || `usage-${i}`,
          date: formatDate(entry?.ts),
          type: reasonLabel(entry?.reason, entry?.type),
          credits: delta,
          reason: String(entry?.reason || ""),
        };
      });
  }, [ledger]);

  const billingHistory = useMemo(() => {
    return (Array.isArray(ledger) ? ledger : [])
      .filter((entry) => {
        const r = String(entry?.reason || "");
        return entry?.type === "grant" && r.startsWith("sub_paid:");
      })
      .slice(0, 12)
      .map((entry, i) => {
        const r = String(entry?.reason || "");
        const parts = r.split(":");
        const p = planLabel(parts[1] || "");
        const amount = Number(entry?.delta || 0) || 0;
        return {
          id: entry?.id || `bill-${i}`,
          date: formatDate(entry?.ts),
          description: `${p} Plan Subscription`,
          amount: `+${amount} credits`,
          status: "Applied",
        };
      });
  }, [ledger]);

  return (
    <div className="min-h-screen bg-[hsl(240,10%,4%)]">
      <header className="border-b border-white/5 bg-[hsl(240,10%,4%)]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to={createPageUrl("AppHome")} className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center">
              <Rocket className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white text-lg">Job Autopilot</span>
          </Link>
          <Link to={createPageUrl("AppHome")}>
            <Button className="bg-white/5 hover:bg-white/10 text-white border border-white/10 text-sm font-medium px-5 py-2 rounded-lg">
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12"
        >
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Credits & Billing</h1>
          <p className="text-white/40">Manage your credits, purchase more, and view usage history</p>
          {errorMsg ? (
            <p className="text-sm text-rose-300 mt-3">{errorMsg}</p>
          ) : null}
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-6 mb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass-card rounded-2xl p-8"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <Coins className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <div className="text-sm text-white/40">Current Balance</div>
                <div className="text-3xl font-bold text-white">{loading ? "-" : balance}</div>
              </div>
            </div>
            <div className="text-xs text-white/30 mb-3">Credits</div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden mb-4">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-cyan-500 rounded-full"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-sm text-white/40">
              From your {planLabel(plan)} plan ({monthlyAllowance} credits/month)
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass-card rounded-2xl p-8"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-cyan-400" />
              </div>
              <div>
                <div className="text-sm text-white/40">This Month</div>
                <div className="text-3xl font-bold text-white">{loading ? "-" : monthlyUsed}</div>
              </div>
            </div>
            <div className="text-xs text-white/30 mb-3">Credits Used</div>
            <p className="text-sm text-white/40">{monthlyRemaining} credits remaining this period</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass-card rounded-2xl p-8"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <Calendar className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <div className="text-sm text-white/40">Renews On</div>
                <div className="text-xl font-bold text-white">{loading ? "-" : renewsOnLabel}</div>
              </div>
            </div>
            <div className="text-xs text-white/30 mb-3">Next Billing Date</div>
            <p className="text-sm text-white/40">+{monthlyAllowance} credits on renewal</p>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mb-12"
        >
          <h2 className="text-2xl font-bold text-white mb-6">Buy More Credits</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {packages.map((pkg, i) => (
              <div
                key={i}
                onClick={() => setSelectedPackage(i)}
                className={`glass-card rounded-2xl p-6 cursor-pointer transition-all ${
                  selectedPackage === i
                    ? "border-2 border-purple-500/50 bg-purple-500/10"
                    : "border border-white/5 hover:bg-white/[0.04]"
                } ${pkg.popular ? "relative" : ""}`}
              >
                {pkg.popular ? (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-purple-600 text-white text-xs font-medium">
                    Best Value
                  </div>
                ) : null}
                <div className="text-4xl font-bold text-white mb-2">{pkg.credits}</div>
                <div className="text-sm text-white/40 mb-4">Credits</div>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-2xl font-bold text-white">${pkg.price}</span>
                  <span className="text-white/40 text-sm">one-time</span>
                </div>
                {pkg.save ? (
                  <div className="text-xs text-emerald-400 font-medium">Save {pkg.save}</div>
                ) : null}
              </div>
            ))}
          </div>
          <Button className="w-full mt-6 py-6 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-base font-semibold premium-button">
            <Plus className="w-5 h-5 mr-2" />
            Purchase {packages[selectedPackage].credits} Credits for ${packages[selectedPackage].price}
          </Button>
          <p className="text-xs text-white/20 text-center mt-3">Credits never expire. Secure payment via Stripe.</p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="glass-card rounded-2xl p-6"
          >
            <h3 className="text-lg font-bold text-white mb-6">Credit Usage History</h3>
            <div className="space-y-3">
              {usageHistory.length === 0 ? (
                <div className="text-sm text-white/40">No credit activity yet.</div>
              ) : (
                usageHistory.map((item) => (
                  <div key={item.id} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
                    <div>
                      <div className="text-sm text-white/70">{item.type}</div>
                      <div className="text-xs text-white/30">{item.date}</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-semibold ${item.credits > 0 ? "text-emerald-400" : "text-white/60"}`}>
                        {item.credits > 0 ? "+" : ""}
                        {item.credits}
                      </div>
                      <div className="text-xs text-white/30">{item.reason || "-"}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="glass-card rounded-2xl p-6"
          >
            <h3 className="text-lg font-bold text-white mb-6">Billing History</h3>
            <div className="space-y-3">
              {billingHistory.length === 0 ? (
                <div className="text-sm text-white/40">No subscription billing records yet.</div>
              ) : (
                billingHistory.map((item) => (
                  <div key={item.id} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
                    <div className="flex-1">
                      <div className="text-sm text-white/70">{item.description}</div>
                      <div className="text-xs text-white/30">{item.date}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-white">{item.amount}</span>
                      <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400">{item.status}</span>
                      <button className="text-xs text-purple-400 hover:text-purple-300" type="button" aria-label="download invoice placeholder">
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="glass-card rounded-2xl p-6 mt-6"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center shrink-0">
              <Sparkles className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white mb-2">How Credits Work</h3>
              <ul className="space-y-2 text-sm text-white/50">
                <li>Resume generation typically uses around 1-2 credits.</li>
                <li>Cover letter generation typically uses around 1-2 credits.</li>
                <li>Credits are granted by your active subscription and webhook events.</li>
                <li>Current plan: {planLabel(plan)}.</li>
              </ul>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
