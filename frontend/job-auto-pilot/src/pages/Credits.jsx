import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Zap,
  TrendingUp,
  Calendar,
  Download,
  Plus,
  Sparkles,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

const packages = [
  { credits: 50, oldPrice: 9, price: 4.99, popular: false, save: "44%" },
  { credits: 150, oldPrice: 24, price: 19.99, popular: true, save: "17%" },
  { credits: 300, oldPrice: 45, price: 29.99, popular: false, save: "33%" },
  { credits: 500, oldPrice: 69, price: 39.99, popular: false, save: "42%" },
];

const PENDING_CREDITS_SESSION_KEY = "jobautopilot_pending_credits_session_id";

function formatPrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? "");
  return n.toFixed(2);
}

function getCurrentPath() {
  try {
    const p = window.location.pathname || "/Credits";
    return p.startsWith("/") ? p : "/Credits";
  } catch {
    return "/Credits";
  }
}

function readPendingCreditsSessionId() {
  try {
    return String(window.sessionStorage.getItem(PENDING_CREDITS_SESSION_KEY) || "").trim();
  } catch {
    return "";
  }
}

function writePendingCreditsSessionId(sessionId) {
  try {
    const val = String(sessionId || "").trim();
    if (!val) return;
    window.sessionStorage.setItem(PENDING_CREDITS_SESSION_KEY, val);
  } catch {
    // no-op
  }
}

function clearPendingCreditsSessionId() {
  try {
    window.sessionStorage.removeItem(PENDING_CREDITS_SESSION_KEY);
  } catch {
    // no-op
  }
}

function clearCheckoutQueryParams() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete("session_id");
    url.searchParams.delete("canceled");
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, "", next);
  } catch {
    // no-op
  }
}

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
  if (r.startsWith("credits_pack:")) return "Credits Pack Purchase";
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
  const [stripeBilling, setStripeBilling] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmingCheckout, setConfirmingCheckout] = useState(false);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  const selectedPkg = packages[selectedPackage] || packages[0];

  useEffect(() => {
    let active = true;

    const confirmCheckout = async () => {
      try {
        const qs = new URLSearchParams(window.location.search);
        const canceled = qs.get("canceled") === "1";
        const sessionIdFromUrl = String(qs.get("session_id") || "").trim();
        if (sessionIdFromUrl) {
          writePendingCreditsSessionId(sessionIdFromUrl);
        }
        const sessionId = sessionIdFromUrl || readPendingCreditsSessionId();

        if (canceled) {
          clearPendingCreditsSessionId();
          clearCheckoutQueryParams();
          return;
        }
        if (!sessionId) return;

        setErrorMsg("");
        setConfirmingCheckout(true);
        await apiFetch("/api/stripe/confirm-session", {
          method: "POST",
          body: JSON.stringify({ session_id: sessionId }),
        });
        if (!active) return;
        clearPendingCreditsSessionId();
        clearCheckoutQueryParams();
        setRefreshKey((v) => v + 1);
      } catch (e) {
        if (!active) return;
        setErrorMsg(e?.message || "Failed to confirm checkout.");
      } finally {
        if (active) setConfirmingCheckout(false);
      }
    };

    confirmCheckout();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setErrorMsg("");

        const [creditsData, profileData, stripeData] = await Promise.all([
          apiFetch("/api/credits/me"),
          apiFetch("/api/profile/me"),
          apiFetch("/api/stripe/billing-summary").catch(() => null),
        ]);

        if (cancelled) return;
        setCreditsMe(creditsData || null);
        setStripeBilling(stripeData?.ok ? stripeData : null);

        const profile = profileData?.profile || null;
        const entries = Array.isArray(profile?.creditsLedger)
          ? profile.creditsLedger
          : [];
        setLedger(entries);
      } catch (e) {
        if (cancelled) return;
        setErrorMsg(e?.message || "Failed to load credits.");
        setCreditsMe(null);
        setStripeBilling(null);
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
  }, [refreshKey]);

  const balance = Number(creditsMe?.credits?.balance || 0) || 0;
  const monthlyAllowance = Number(creditsMe?.credits?.monthlyAllowance || 0) || 0;
  const monthlyUsed = Number(creditsMe?.credits?.monthlyUsed || 0) || 0;
  const monthlyRemaining = Number(creditsMe?.credits?.monthlyRemaining || 0) || 0;
  const monthlyPeriod = String(creditsMe?.credits?.monthlyPeriod || "");
  const plan = String(creditsMe?.plan || "free");
  const stripePeriodEnd = String(stripeBilling?.currentPeriodEnd || "");

  const ledgerMonthSpend = useMemo(() => {
    if (!monthlyPeriod || !Array.isArray(ledger)) return 0;
    return ledger.reduce((sum, entry) => {
      const ts = entry?.ts ? new Date(entry.ts) : null;
      if (!ts || !Number.isFinite(ts.getTime())) return sum;
      const period = `${ts.getUTCFullYear()}-${String(ts.getUTCMonth() + 1).padStart(2, "0")}`;
      if (period !== monthlyPeriod) return sum;

      const type = String(entry?.type || "").toLowerCase();
      const delta = Number(entry?.delta || 0) || 0;
      const isSpend = type === "spend" || type === "debit" || delta < 0;
      if (!isSpend) return sum;
      return sum + Math.abs(delta);
    }, 0);
  }, [ledger, monthlyPeriod]);

  const displayMonthlyUsed = Math.max(monthlyUsed, ledgerMonthSpend);

  const cycleUsedFromLedger = useMemo(() => {
    if (plan === "free") return null;
    const paidGrant = (Array.isArray(ledger) ? ledger : [])
      .filter((entry) => entry?.type === "grant" && String(entry?.reason || "").startsWith("sub_paid:"))
      .sort((a, b) => new Date(b?.ts || 0).getTime() - new Date(a?.ts || 0).getTime())[0];
    if (!paidGrant?.ts) return null;
    const cycleStart = new Date(paidGrant.ts).getTime();
    if (!Number.isFinite(cycleStart)) return null;

    return (Array.isArray(ledger) ? ledger : []).reduce((sum, entry) => {
      const ts = entry?.ts ? new Date(entry.ts).getTime() : NaN;
      if (!Number.isFinite(ts) || ts < cycleStart) return sum;
      const type = String(entry?.type || "").toLowerCase();
      const reason = String(entry?.reason || "");
      if (reason.startsWith("adjust_remove_free:")) return sum;
      const delta = Number(entry?.delta || 0) || 0;
      const isSpend = type === "spend" || type === "debit" || delta < 0;
      if (!isSpend) return sum;
      return sum + Math.abs(delta);
    }, 0);
  }, [ledger, plan]);

  const effectiveMonthlyUsed =
    Number.isFinite(Number(cycleUsedFromLedger)) && cycleUsedFromLedger != null
      ? Number(cycleUsedFromLedger)
      : displayMonthlyUsed;

  const displayMonthlyRemaining =
    monthlyAllowance > 0 ? Math.max(0, monthlyAllowance - effectiveMonthlyUsed) : monthlyRemaining;

  const renewsOnLabel = useMemo(() => {
    if (stripePeriodEnd) {
      const d = new Date(stripePeriodEnd);
      if (Number.isFinite(d.getTime())) {
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      }
    }
    const m = monthlyPeriod.match(/^(\d{4})-(\d{2})$/);
    if (!m) return "-";
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (!Number.isFinite(year) || !Number.isFinite(month)) return "-";
    // Use local date to avoid UTC timezone rollback (e.g. Mar 1 showing as Feb 28).
    const renew = new Date(year, month, 1);
    return renew.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }, [monthlyPeriod, stripePeriodEnd]);

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

  const handleBuyCredits = async () => {
    if (purchaseLoading || confirmingCheckout) return;
    const pkg = packages[selectedPackage];
    if (!pkg) return;

    setErrorMsg("");
    setPurchaseLoading(true);
    try {
      const successPath = getCurrentPath();
      const cancelPath = getCurrentPath();
      const resp = await apiFetch("/api/stripe/checkout", {
        method: "POST",
        body: JSON.stringify({
          checkoutType: "credits",
          credits: pkg.credits,
          successPath,
          cancelPath,
        }),
      });

      if (!resp?.url) {
        throw new Error(resp?.error || "Checkout URL missing.");
      }
      if (resp?.id) {
        writePendingCreditsSessionId(resp.id);
      }
      window.location.assign(resp.url);
    } catch (e) {
      setErrorMsg(e?.message || "Unable to start checkout.");
      setPurchaseLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[hsl(240,10%,4%)]">
      <header className="border-b border-white/5 bg-[hsl(240,10%,4%)]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to={createPageUrl("AppHome")} className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg border border-cyan-300/35 bg-gradient-to-br from-cyan-400/95 to-teal-400/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_10px_26px_rgba(6,182,212,0.32)]">
              <Zap className="h-4 w-4 text-slate-950" />
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
          {confirmingCheckout ? (
            <p className="text-sm text-cyan-300 mt-3">Confirming checkout and applying purchased credits...</p>
          ) : null}
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
                <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-400/25 flex items-center justify-center">
                  <Zap className="w-6 h-6 text-emerald-300" />
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
                <div className="text-3xl font-bold text-white">{loading ? "-" : effectiveMonthlyUsed}</div>
              </div>
            </div>
            <div className="text-xs text-white/30 mb-3">Credits Used</div>
            <p className="text-sm text-white/40">{displayMonthlyRemaining} credits remaining this period</p>
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
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm text-white/45 line-through decoration-white/45">
                    ${formatPrice(pkg.oldPrice)}
                  </span>
                </div>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-2xl font-bold text-white">${formatPrice(pkg.price)}</span>
                  <span className="text-white/40 text-sm">one-time</span>
                </div>
                {pkg.save ? (
                  <div className="text-xs text-emerald-400 font-medium">Save {pkg.save}</div>
                ) : null}
              </div>
            ))}
          </div>
          <Button
            type="button"
            onClick={handleBuyCredits}
            disabled={purchaseLoading || confirmingCheckout}
            className="w-full mt-6 py-6 bg-purple-600 hover:bg-purple-500 disabled:opacity-60 text-white rounded-xl text-base font-semibold premium-button"
          >
            {purchaseLoading ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Redirecting to checkout...
              </>
            ) : (
              <>
                <Plus className="w-5 h-5 mr-2" />
                Purchase {selectedPkg.credits} Credits for ${formatPrice(selectedPkg.price)}
              </>
            )}
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
