import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import AppNav from "@/components/app/AppNav";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  User,
  FileText,
  CreditCard,
  Calendar,
  Mail,
  Link as LinkIcon,
  Phone,
  MapPin,
  LifeBuoy,
  ShieldCheck,
  ExternalLink,
  Save,
  ArrowRight,
  Send,
  X,
  Zap,
  Lock,
  HelpCircle,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

const STORAGE_KEY = "jobautopilot_profile_v1";

function formatDateShort(dateLike) {
  if (dateLike == null || dateLike === "") return "-";
  if (typeof dateLike === "number" && dateLike <= 0) return "-";
  if (typeof dateLike === "string" && /^0+$/.test(dateLike.trim())) return "-";
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

function renewsOnLabelFromPeriod(monthlyPeriod) {
  const m = String(monthlyPeriod || "").match(/^(\d{4})-(\d{2})$/);
  if (!m) return "-";
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return "-";
  // Use local date to avoid UTC timezone rollback (e.g. Mar 1 -> Feb 28 in US timezones).
  const renew = new Date(year, month, 1);
  return renew.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function statusLabel(value) {
  return String(value || "inactive")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function shortRef(value, head = 12, tail = 8) {
  const raw = String(value || "");
  if (!raw) return "-";
  if (raw.length <= head + tail + 3) return raw;
  return `${raw.slice(0, head)}...${raw.slice(-tail)}`;
}

/**
 * ✅ SWA auth (NO JWT):
 * Call your /api/* endpoints normally. SWA uses cookies and injects identity headers server-side.
 */
async function apiFetch(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };

  const res = await fetch(path, {
    method,
    headers,
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  return { ok: res.ok, status: res.status, data };
}

function FadeIn({ show = true, delay = 0, className = "", children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={show ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
      transition={{
        duration: 0.3,
        delay: Math.max(0, Number(delay || 0)) / 1000,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function SoftSkeleton({ className = "" }) {
  return (
    <div
      className={[
        "animate-pulse rounded-xl bg-white/[0.05] border border-white/10",
        className,
      ].join(" ")}
    />
  );
}

function Field({ label, icon: Icon, children, hint }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs sm:text-sm text-white/60 font-medium">
          {label}
        </label>
        {hint ? <span className="text-xs text-white/30">{hint}</span> : null}
      </div>
      <div className="relative">
        {Icon ? (
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/30">
            <Icon className="w-4 h-4" />
          </div>
        ) : null}
        <div className={Icon ? "pl-9" : ""}>{children}</div>
      </div>
    </div>
  );
}

function Section({ title, subtitle, children, icon: Icon, iconTheme = "purple" }) {
  const iconTone =
    iconTheme === "emerald"
      ? "bg-emerald-500/12 border-emerald-400/20 text-emerald-300"
      : "bg-purple-500/10 border-purple-500/10 text-purple-300";

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
      <div className="flex items-start gap-3 mb-5">
        {Icon ? (
          <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${iconTone}`}>
            <Icon className="w-5 h-5" />
          </div>
        ) : null}
        <div className="min-w-0">
          <h3 className="text-base sm:text-lg font-semibold text-white">
            {title}
          </h3>
          {subtitle ? (
            <p className="text-sm text-white/40 mt-1">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  );
}

function FAQItem({ q, a }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
          <HelpCircle className="w-4 h-4 text-white/70" />
        </div>
        <div className="min-w-0">
          <div className="text-white font-semibold">{q}</div>
          <div className="text-sm text-white/50 mt-2 leading-relaxed">{a}</div>
        </div>
      </div>
    </div>
  );
}

export default function Settings() {
  const navigate = useNavigate();

  const [tab, setTab] = useState("profile");

  // ladder animation gating (always "on", delays handle sequencing)
  const stage = 2;

  // global loading/saving
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Profile
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [portfolio, setPortfolio] = useState("");

  // Support
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportSubject, setSupportSubject] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  const [supportSending, setSupportSending] = useState(false);

  // Security (SWA identity)
  const [authLoading, setAuthLoading] = useState(false);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authProvider, setAuthProvider] = useState("");
  const [authUserId, setAuthUserId] = useState("");

  // Snapshot for dirty-checking
  const [initialLoaded, setInitialLoaded] = useState(null);

  // Billing/Credits (live backend values)
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingLoaded, setBillingLoaded] = useState(false);
  const [billingError, setBillingError] = useState("");
  const [creditsMe, setCreditsMe] = useState(null);
  const [billingProfile, setBillingProfile] = useState(null);
  const [stripeBilling, setStripeBilling] = useState(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalAction, setPortalAction] = useState("portal");

  // ✅ Make ALL inputs white text (including browser autofill)
  const inputBase =
    "bg-white/[0.03] border-white/10 !text-white caret-white placeholder:text-white/25 rounded-xl py-5 [color-scheme:dark] " +
    "[&:-webkit-autofill]:shadow-[0_0_0px_1000px_rgba(0,0,0,0.25)_inset] [&:-webkit-autofill]:[-webkit-text-fill-color:#fff] " +
    "focus-visible:ring-2 focus-visible:ring-purple-500/30 focus-visible:ring-offset-0";

  const textareaBase =
    "bg-white/[0.03] border-white/10 !text-white caret-white placeholder:text-white/25 rounded-2xl [color-scheme:dark] " +
    "[&:-webkit-autofill]:shadow-[0_0_0px_1000px_rgba(0,0,0,0.25)_inset] [&:-webkit-autofill]:[-webkit-text-fill-color:#fff] " +
    "focus-visible:ring-2 focus-visible:ring-purple-500/30 focus-visible:ring-offset-0";

  const loadFromLocalCache = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const writeLocalCache = (payload) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }
  };

  // ✅ Load from Cosmos via GET /api/settings (fallback to local cache)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const resp = await apiFetch("/api/settings", { method: "GET" });

        if (resp.ok && resp.data?.ok) {
          const s = resp.data?.settings || null;

          const snapshot = {
            fullName: String(s?.fullName || ""),
            email: String(s?.email || ""),
            phone: String(s?.phone || ""),
            location: String(s?.location || ""),
            linkedin: String(s?.linkedin || ""),
            portfolio: String(s?.portfolio || ""),
          };

          if (cancelled) return;

          setFullName(snapshot.fullName);
          setEmail(snapshot.email);
          setPhone(snapshot.phone);
          setLocation(snapshot.location);
          setLinkedin(snapshot.linkedin);
          setPortfolio(snapshot.portfolio);
          setInitialLoaded(snapshot);

          writeLocalCache({ ...snapshot, updatedAt: new Date().toISOString() });

          setLoading(false);
          return;
        }

        // fallback
        const cached = loadFromLocalCache();
        if (!cancelled) {
          if (resp.status === 401) toast.error("Please sign in again to load settings.");

          const fallback = cached
            ? {
                fullName: cached.fullName || "",
                email: cached.email || "",
                phone: cached.phone || "",
                location: cached.location || "",
                linkedin: cached.linkedin || "",
                portfolio: cached.portfolio || "",
              }
            : {
                fullName: "",
                email: "",
                phone: "",
                location: "",
                linkedin: "",
                portfolio: "",
              };

          setFullName(fallback.fullName);
          setEmail(fallback.email);
          setPhone(fallback.phone);
          setLocation(fallback.location);
          setLinkedin(fallback.linkedin);
          setPortfolio(fallback.portfolio);
          setInitialLoaded(fallback);
          setLoading(false);
        }
      } catch (err) {
        console.error(err);
        const cached = loadFromLocalCache();
        if (!cancelled) {
          const fallback = cached
            ? {
                fullName: cached.fullName || "",
                email: cached.email || "",
                phone: cached.phone || "",
                location: cached.location || "",
                linkedin: cached.linkedin || "",
                portfolio: cached.portfolio || "",
              }
            : {
                fullName: "",
                email: "",
                phone: "",
                location: "",
                linkedin: "",
                portfolio: "",
              };

          setFullName(fallback.fullName);
          setEmail(fallback.email);
          setPhone(fallback.phone);
          setLocation(fallback.location);
          setLinkedin(fallback.linkedin);
          setPortfolio(fallback.portfolio);
          setInitialLoaded(fallback);

          toast.error("Could not load settings from server. Using local cache.");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ✅ Load SWA identity for Security tab (only once, on-demand)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (tab !== "security") return;
      if (authLoaded || authLoading) return;

      setAuthLoading(true);
      try {
        const resp = await apiFetch("/api/userinfo", { method: "GET" });

        if (!resp.ok) {
          if (resp.status === 401) toast.error("Sign in again to view security info.");
          setAuthLoaded(true);
          setAuthLoading(false);
          return;
        }

        // Be robust to different shapes from your userinfo.js
        const d = resp.data || {};
        const cp = d.clientPrincipal || d.user || d;
        const provider =
          String(d.identityProvider || cp.identityProvider || cp.provider || "") || "";
        const emailGuess =
          String(
            cp.userDetails ||
              cp.email ||
              d.email ||
              d.userDetails ||
              d.userEmail ||
              ""
          ) || "";
        const uidGuess =
          String(cp.userId || d.userId || d.user_id || cp.user_id || "") || "";

        if (!cancelled) {
          setAuthProvider(provider || "Static Web Apps");
          setAuthEmail(emailGuess);
          setAuthUserId(uidGuess);
          setAuthLoaded(true);
          setAuthLoading(false);
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setAuthLoaded(true);
          setAuthLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tab, authLoaded, authLoading]);

  // Load billing + credits from backend when either tab is opened
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (tab !== "billing" && tab !== "credits") return;

      setBillingLoading(true);
      setBillingError("");

      try {
        const [creditsResp, profileResp, stripeResp] = await Promise.all([
          apiFetch("/api/credits/me", { method: "GET" }),
          apiFetch("/api/profile/me", { method: "GET" }),
          apiFetch("/api/stripe/billing-summary", { method: "GET" }),
        ]);

        if (cancelled) return;

        if (creditsResp.ok) {
          setCreditsMe(creditsResp.data || null);
        } else {
          setCreditsMe(null);
        }

        if (profileResp.ok && profileResp.data?.ok) {
          setBillingProfile(profileResp.data?.profile || null);
        } else {
          setBillingProfile(null);
        }

        if (stripeResp.ok && stripeResp.data?.ok) {
          setStripeBilling(stripeResp.data || null);
        } else {
          setStripeBilling(null);
        }

        if (!creditsResp.ok && !profileResp.ok && !stripeResp.ok) {
          const msg =
            creditsResp.data?.error ||
            profileResp.data?.error ||
            stripeResp.data?.error ||
            "Failed to load billing details.";
          setBillingError(String(msg));
        }
      } catch (e) {
        if (!cancelled) {
          setBillingError(e?.message || "Failed to load billing details.");
          setCreditsMe(null);
          setBillingProfile(null);
          setStripeBilling(null);
        }
      } finally {
        if (!cancelled) {
          setBillingLoading(false);
          setBillingLoaded(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tab]);

  const isDirty = useMemo(() => {
    const base = initialLoaded || {};
    return (
      (fullName || "") !== (base.fullName || "") ||
      (email || "") !== (base.email || "") ||
      (phone || "") !== (base.phone || "") ||
      (location || "") !== (base.location || "") ||
      (linkedin || "") !== (base.linkedin || "") ||
      (portfolio || "") !== (base.portfolio || "")
    );
  }, [initialLoaded, fullName, email, phone, location, linkedin, portfolio]);

  const billingPlanId = useMemo(() => {
    const raw =
      creditsMe?.plan ||
      billingProfile?.plan?.planId ||
      (typeof billingProfile?.plan === "string" ? billingProfile.plan : "free");
    return String(raw || "free").toLowerCase();
  }, [creditsMe, billingProfile]);

  const billingPlanStatus = String(
    stripeBilling?.subscriptionStatus || billingProfile?.plan?.status || "inactive"
  );
  const stripeCustomerId = String(
    stripeBilling?.customerId || billingProfile?.plan?.stripeCustomerId || ""
  );
  const stripeSubscriptionId = String(
    stripeBilling?.subscriptionId || billingProfile?.plan?.stripeSubscriptionId || ""
  );
  const paymentConnected =
    !!stripeBilling?.connected || !!stripeCustomerId || !!stripeSubscriptionId;
  const stripePaymentCard = stripeBilling?.paymentMethod || null;
  const stripePaymentMethodLabel = stripePaymentCard
    ? `${String(stripePaymentCard.brand || "CARD").toUpperCase()} **** ${
        stripePaymentCard.last4 || "----"
      }`
    : paymentConnected
    ? "No default card saved"
    : "No card on file";
  const stripePaymentExp =
    stripePaymentCard?.expMonth && stripePaymentCard?.expYear
      ? `${String(stripePaymentCard.expMonth).padStart(2, "0")}/${String(
          stripePaymentCard.expYear
        ).slice(-2)}`
      : "-";
  const stripeSubStatus = String(
    stripeBilling?.subscriptionStatus || billingPlanStatus || "inactive"
  );
  const isSubscriptionCanceled = ["canceled", "cancelled", "incomplete_expired"].includes(
    String(stripeSubStatus || "").toLowerCase()
  );
  const stripePeriodEndLabel = formatDateShort(stripeBilling?.currentPeriodEnd);
  const stripeCardBrand = String(stripePaymentCard?.brand || "Stripe").toUpperCase();
  const stripeCardLast4 = String(stripePaymentCard?.last4 || "----");
  const stripeCardMeta = [stripePaymentCard?.funding, stripePaymentCard?.country]
    .filter(Boolean)
    .join(" | ");
  const stripeMethodSource = String(stripeBilling?.paymentMethodSource || "");
  const stripeMissingReason = String(stripeBilling?.paymentMethodMissingReason || "");
  const stripePaymentMethodDisplay = stripePaymentCard
    ? `${stripeCardBrand} **** ${stripeCardLast4}`
    : stripePaymentMethodLabel;
  const stripeCardMetaDisplay = stripeCardMeta;
  const stripeCustomerShort = shortRef(stripeCustomerId, 10, 8);
  const stripeSubscriptionShort = shortRef(stripeSubscriptionId, 10, 8);

  const creditsBalance =
    Number(creditsMe?.credits?.balance ?? billingProfile?.credits?.balance ?? 0) ||
    0;
  const monthlyAllowance = Number(creditsMe?.credits?.monthlyAllowance || 0) || 0;
  const monthlyUsed = Number(creditsMe?.credits?.monthlyUsed || 0) || 0;
  const monthlyRemaining = Number(creditsMe?.credits?.monthlyRemaining || 0) || 0;
  const monthlyPeriod = String(creditsMe?.credits?.monthlyPeriod || "");
  const renewsOnLabel =
    stripePeriodEndLabel !== "-" ? stripePeriodEndLabel : renewsOnLabelFromPeriod(monthlyPeriod);

  const cycleUsedFromLedger = useMemo(() => {
    if (billingPlanId === "free") return null;
    const ledger = Array.isArray(billingProfile?.creditsLedger)
      ? billingProfile.creditsLedger
      : [];
    const paidGrant = ledger
      .filter((entry) => entry?.type === "grant" && String(entry?.reason || "").startsWith("sub_paid:"))
      .sort((a, b) => new Date(b?.ts || 0).getTime() - new Date(a?.ts || 0).getTime())[0];
    if (!paidGrant?.ts) return null;
    const cycleStart = new Date(paidGrant.ts).getTime();
    if (!Number.isFinite(cycleStart)) return null;

    return ledger.reduce((sum, entry) => {
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
  }, [billingPlanId, billingProfile]);

  const displayMonthlyUsed =
    Number.isFinite(Number(cycleUsedFromLedger)) && cycleUsedFromLedger != null
      ? Number(cycleUsedFromLedger)
      : monthlyUsed;
  const displayMonthlyRemaining =
    monthlyAllowance > 0
      ? Math.max(0, monthlyAllowance - displayMonthlyUsed)
      : monthlyRemaining;

  const billingHistory = useMemo(() => {
    const ledger = Array.isArray(billingProfile?.creditsLedger)
      ? billingProfile.creditsLedger
      : [];
    return ledger
      .filter((entry) => {
        const r = String(entry?.reason || "");
        return entry?.type === "grant" && r.startsWith("sub_paid:");
      })
      .slice(0, 8)
      .map((entry, i) => {
        const reason = String(entry?.reason || "");
        const planFromReason = reason.split(":")[1] || billingPlanId || "free";
        const amount = Number(entry?.delta || 0) || 0;
        return {
          id: entry?.id || `bill-${i}`,
          date: formatDateShort(entry?.ts),
          plan: planLabel(planFromReason),
          amount,
        };
      });
  }, [billingProfile, billingPlanId]);

  const creditsActivity = useMemo(() => {
    const ledger = Array.isArray(billingProfile?.creditsLedger)
      ? billingProfile.creditsLedger
      : [];
    return ledger.slice(0, 8).map((entry, i) => {
      const delta = Number(entry?.delta || 0) || 0;
      const reason = String(entry?.reason || "");
      return {
        id: entry?.id || `credit-${i}`,
        date: formatDateShort(entry?.ts),
        delta,
        reason: reason || (entry?.type === "grant" ? "grant" : "usage"),
      };
    });
  }, [billingProfile]);

  const openPricing = () => {
    const target = `${createPageUrl("Pricing")}?force=pricing&from=billing`;
    if (typeof window !== "undefined" && window.location?.assign) {
      window.location.assign(target);
      return;
    }
    navigate(target);
  };

  const openCreditsPage = () => {
    navigate(createPageUrl("Credits"));
  };

  const openStripePortal = async (flow = "portal") => {
    if (portalLoading) return;
    setPortalLoading(true);
    setPortalAction(flow);
    try {
      const resp = await apiFetch("/api/stripe/portal", {
        method: "POST",
        body: { returnPath: createPageUrl("AppSettings"), flow },
      });

      if (!resp.ok || !resp.data?.ok || !resp.data?.url) {
        const msg =
          resp.data?.error || `Failed to open billing portal (HTTP ${resp.status})`;
        throw new Error(msg);
      }

      window.location.assign(resp.data.url);
    } catch (e) {
      const msg = e?.message || "Could not open billing portal.";
      toast.error(msg);
      if (String(msg).toLowerCase().includes("no stripe billing profile")) {
        navigate(`${createPageUrl("Pricing")}?force=pricing`);
      }
    } finally {
      setPortalLoading(false);
      setPortalAction("portal");
    }
  };

  const openCancelSubscription = async () => {
    await openStripePortal("cancel");
  };

  const saveProfile = async () => {
    if (saving) return;

    const e = (email || "").trim();
    if (e && !/^\S+@\S+\.\S+$/.test(e)) {
      toast.error("Please enter a valid email address.");
      return;
    }

    setSaving(true);
    try {
      // ✅ matches backend settingsSave.js (flat fields)
      const payload = {
        fullName: fullName.trim(),
        email: e,
        phone: phone.trim(),
        location: location.trim(),
        linkedin: linkedin.trim(),
        portfolio: portfolio.trim(),
      };

      const resp = await apiFetch("/api/settings", {
        method: "POST",
        body: payload,
      });

      if (!resp.ok || !resp.data?.ok) {
        if (resp.status === 401) {
          toast.error("You're not logged in. Please sign in again.");
          return;
        }
        const msg = resp.data?.error || `Failed to save settings (HTTP ${resp.status})`;
        toast.error(msg);
        return;
      }

      const saved = resp.data?.settings || payload;

      const snapshot = {
        fullName: String(saved.fullName || payload.fullName || ""),
        email: String(saved.email || payload.email || ""),
        phone: String(saved.phone || payload.phone || ""),
        location: String(saved.location || payload.location || ""),
        linkedin: String(saved.linkedin || payload.linkedin || ""),
        portfolio: String(saved.portfolio || payload.portfolio || ""),
      };

      setInitialLoaded(snapshot);
      writeLocalCache({ ...snapshot, updatedAt: new Date().toISOString() });

      toast.success("Settings saved.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  const sendSupport = async () => {
    if (supportSending) return;

    const msg = (supportMessage || "").trim();
    if (!msg) {
      toast.error("Please enter a message.");
      return;
    }

    setSupportSending(true);
    try {
      const resp = await apiFetch("/api/support", {
        method: "POST",
        body: {
          subject: (supportSubject || "").trim(),
          message: msg,
        },
      });

      if (!resp.ok || !resp.data?.ok) {
        if (resp.status === 401) {
          toast.error("You're not logged in. Please sign in again.");
          return;
        }
        const errMsg =
          resp.data?.error || `Failed to send support request (HTTP ${resp.status})`;
        toast.error(errMsg);
        return;
      }

      toast.success("Support request sent.");
      setSupportSubject("");
      setSupportMessage("");
      setSupportOpen(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to send support request.");
    } finally {
      setSupportSending(false);
    }
  };

  return (
    <div className="settings-page min-h-screen bg-[hsl(240,10%,4%)] relative overflow-hidden">
      {/* subtle background accents */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[960px] h-[430px] rounded-full bg-sky-500/10 blur-3xl" />
        <div className="absolute top-40 -left-24 w-[520px] h-[320px] rounded-full bg-violet-500/10 blur-3xl" />
        <div className="absolute -bottom-72 left-1/3 w-[760px] h-[420px] rounded-full bg-fuchsia-500/8 blur-3xl" />
      </div>

      <AppNav currentPage="AppSettings" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <FadeIn show={stage >= 1} delay={0}>
          <div className="mb-6 rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] via-white/[0.03] to-transparent backdrop-blur-xl p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-white">Settings</h1>
                <p className="text-white/45 mt-1">
                  Manage your profile, resume data, billing, and account security.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {tab === "profile" && (
                  <Button
                    type="button"
                    onClick={saveProfile}
                    disabled={!isDirty || saving || loading}
                    className="bg-purple-600 hover:bg-purple-500 text-white rounded-xl px-5 py-5 font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {saving ? "Saving..." : loading ? "Loading..." : "Save changes"}
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/15 bg-black/25 px-3 py-1 text-xs font-medium text-white/80">
                Plan: {planLabel(billingPlanId)}
              </span>
              <span className="rounded-full border border-white/15 bg-black/25 px-3 py-1 text-xs font-medium text-white/80">
                Credits: {billingLoading && !billingLoaded ? "-" : creditsBalance}
              </span>
              <span className="rounded-full border border-white/15 bg-black/25 px-3 py-1 text-xs font-medium text-white/80">
                Billing: {statusLabel(stripeSubStatus)}
              </span>
            </div>
          </div>
        </FadeIn>

        {/* Tabs */}
        <FadeIn show={stage >= 1} delay={70}>
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-xl shadow-[0_24px_70px_rgba(0,0,0,0.35)]">
          <Tabs value={tab} onValueChange={setTab}>
            <div className="px-4 sm:px-6 pt-4">
              <TabsList className="bg-transparent p-0 gap-2 sm:gap-2.5 flex flex-wrap">
                <TabsTrigger
                  value="profile"
                  className="settings-tab-trigger rounded-xl px-4 py-2.5 text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-500/20 data-[state=active]:to-cyan-500/15 data-[state=active]:text-white data-[state=active]:shadow-none text-white/65 hover:text-white/90"
                >
                  <User className="w-4 h-4 mr-2" />
                  Profile
                </TabsTrigger>

                <TabsTrigger
                  value="resume"
                  className="settings-tab-trigger rounded-xl px-4 py-2.5 text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-500/20 data-[state=active]:to-cyan-500/15 data-[state=active]:text-white data-[state=active]:shadow-none text-white/65 hover:text-white/90"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Resume
                </TabsTrigger>

                <TabsTrigger
                  value="billing"
                  className="settings-tab-trigger rounded-xl px-4 py-2.5 text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-500/20 data-[state=active]:to-cyan-500/15 data-[state=active]:text-white data-[state=active]:shadow-none text-white/65 hover:text-white/90"
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  Billing
                </TabsTrigger>

                <TabsTrigger
                  value="credits"
                  className="settings-tab-trigger rounded-xl px-4 py-2.5 text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-500/20 data-[state=active]:to-cyan-500/15 data-[state=active]:text-white data-[state=active]:shadow-none text-white/65 hover:text-white/90"
                >
                  <Zap className="w-4 h-4 mr-2 text-emerald-300" />
                  Credits
                </TabsTrigger>

                <TabsTrigger
                  value="security"
                  className="settings-tab-trigger rounded-xl px-4 py-2.5 text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-500/20 data-[state=active]:to-cyan-500/15 data-[state=active]:text-white data-[state=active]:shadow-none text-white/65 hover:text-white/90"
                >
                  <Lock className="w-4 h-4 mr-2" />
                  Security
                </TabsTrigger>

                <TabsTrigger
                  value="help"
                  className="settings-tab-trigger rounded-xl px-4 py-2.5 text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-500/20 data-[state=active]:to-cyan-500/15 data-[state=active]:text-white data-[state=active]:shadow-none text-white/65 hover:text-white/90"
                >
                  <HelpCircle className="w-4 h-4 mr-2" />
                  Help
                </TabsTrigger>
              </TabsList>

              <div className="mt-4 h-px bg-white/10" />
            </div>

            {/* PROFILE */}
            <TabsContent value="profile" className="p-4 sm:p-6 space-y-6">
              {loading ? (
                <div className="space-y-6">
                  <SoftSkeleton className="h-28 rounded-2xl" />
                  <SoftSkeleton className="h-40 rounded-2xl" />
                  <SoftSkeleton className="h-36 rounded-2xl" />
                </div>
              ) : (
                <>
                  <FadeIn show={stage >= 1} delay={0}>
                    <Section
                      title="Personal Information"
                      subtitle="Used to personalize documents and application materials."
                      icon={ShieldCheck}
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="Full Name" icon={User}>
                          <Input
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder="e.g., Alex Johnson"
                            className={inputBase}
                          />
                        </Field>

                        <Field label="Email Address" icon={Mail}>
                          <Input
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="e.g., alex@example.com"
                            className={inputBase}
                          />
                        </Field>

                        <Field label="Phone Number" icon={Phone} hint="Optional">
                          <Input
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="e.g., +1 (555) 123-4567"
                            className={inputBase}
                          />
                        </Field>

                        <Field label="Location" icon={MapPin} hint="Optional">
                          <Input
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            placeholder="e.g., Dallas, TX"
                            className={inputBase}
                          />
                        </Field>
                      </div>
                    </Section>
                  </FadeIn>

                  <FadeIn show={stage >= 2} delay={60}>
                    <Section
                      title="Links"
                      subtitle="Optional links that can be referenced in cover letters."
                      icon={LinkIcon}
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="LinkedIn URL" icon={LinkIcon} hint="Optional">
                          <Input
                            value={linkedin}
                            onChange={(e) => setLinkedin(e.target.value)}
                            placeholder="linkedin.com/in/yourname"
                            className={inputBase}
                          />
                        </Field>

                        <Field label="Portfolio URL" icon={LinkIcon} hint="Optional">
                          <Input
                            value={portfolio}
                            onChange={(e) => setPortfolio(e.target.value)}
                            placeholder="yourdomain.dev"
                            className={inputBase}
                          />
                        </Field>
                      </div>

                      <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            const url = (linkedin || "").trim();
                            if (!url) return toast.error("Add a LinkedIn URL first.");
                            window.open(
                              url.startsWith("http") ? url : `https://${url}`,
                              "_blank",
                              "noopener,noreferrer"
                            );
                          }}
                          className="justify-center sm:justify-start border border-white/10 text-white/70 hover:text-white hover:bg-white/5 rounded-xl py-5"
                        >
                          <ExternalLink className="w-4 h-4 mr-2" />
                          Open LinkedIn
                        </Button>

                        <div className="text-xs text-white/30">
                          Tip: You can leave these blank—nothing breaks.
                        </div>
                      </div>
                    </Section>
                  </FadeIn>

                  <FadeIn show={stage >= 2} delay={120}>
                    <Section
                      title="Support"
                      subtitle="Send a message and we’ll get back to you."
                      icon={LifeBuoy}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="text-sm text-white/50">
                          Account, resume uploads, bugs, or billing questions.
                        </div>
                        <div className="flex items-center gap-2">
                          {!supportOpen ? (
                            <Button
                              type="button"
                              onClick={() => setSupportOpen(true)}
                              className="bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl py-5 px-5"
                            >
                              <Mail className="w-4 h-4 mr-2" />
                              Contact Support
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => setSupportOpen(false)}
                              className="border border-white/10 text-white/70 hover:text-white hover:bg-white/5 rounded-xl py-5 px-4"
                            >
                              <X className="w-4 h-4 mr-2" />
                              Close
                            </Button>
                          )}
                        </div>
                      </div>

                      {supportOpen && (
                        <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 sm:p-5 space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <div className="text-xs sm:text-sm text-white/60 font-medium">
                                Subject <span className="text-white/30">(optional)</span>
                              </div>
                              <Input
                                value={supportSubject}
                                onChange={(e) => setSupportSubject(e.target.value)}
                                placeholder="e.g., Resume upload issue"
                                className={inputBase}
                              />
                            </div>

                            <div className="space-y-2">
                              <div className="text-xs sm:text-sm text-white/60 font-medium">
                                Reply email <span className="text-white/30">(auto)</span>
                              </div>
                              <Input
                                value={(email || "").trim() || "Loaded from account via SWA"}
                                readOnly
                                className={[
                                  inputBase,
                                  "bg-white/[0.02] text-white/70 !text-white/70",
                                ].join(" ")}
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="text-xs sm:text-sm text-white/60 font-medium">
                                Message
                              </div>
                              <div className="text-xs text-white/30">
                                {(supportMessage || "").length}/4000
                              </div>
                            </div>
                            <Textarea
                              value={supportMessage}
                              onChange={(e) => setSupportMessage(e.target.value)}
                              placeholder="Describe your issue (steps to reproduce, what you expected, etc.)"
                              className={`min-h-[140px] ${textareaBase}`}
                              maxLength={4000}
                            />
                          </div>

                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => {
                                setSupportSubject("");
                                setSupportMessage("");
                                setSupportOpen(false);
                              }}
                              className="border border-white/10 text-white/70 hover:text-white hover:bg-white/5 rounded-xl py-5 px-5"
                              disabled={supportSending}
                            >
                              Cancel
                            </Button>

                            <Button
                              type="button"
                              onClick={sendSupport}
                              className="bg-purple-600 hover:bg-purple-500 text-white rounded-xl py-5 px-5 font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                              disabled={supportSending}
                            >
                              <Send className="w-4 h-4 mr-2" />
                              {supportSending ? "Sending..." : "Send message"}
                            </Button>
                          </div>
                        </div>
                      )}
                    </Section>
                  </FadeIn>

                  {/* mobile save */}
                  <FadeIn show={stage >= 2} delay={160} className="sm:hidden pt-2">
                    <Button
                      type="button"
                      onClick={saveProfile}
                      disabled={!isDirty || saving}
                      className="w-full bg-purple-600 hover:bg-purple-500 text-white rounded-xl py-5 font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {saving ? "Saving..." : "Save changes"}
                    </Button>
                  </FadeIn>
                </>
              )}
            </TabsContent>

            {/* RESUME */}
            <TabsContent value="resume" className="p-4 sm:p-6 space-y-6">
              <FadeIn show={stage >= 1} delay={0}>
                <Section
                  title="Resume Library"
                  subtitle="Manage uploads, defaults, and previews."
                  icon={FileText}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="text-sm text-white/50">
                      Upload and manage multiple resumes from the Resumes page.
                    </div>
                    <Button
                      type="button"
                      onClick={() => navigate(createPageUrl("Resumes"))}
                      className="bg-purple-600 hover:bg-purple-500 text-white rounded-xl py-5 px-5 font-semibold"
                    >
                      <ArrowRight className="w-4 h-4 mr-2" />
                      Go to Resumes
                    </Button>
                  </div>
                </Section>
              </FadeIn>

              <FadeIn show={stage >= 2} delay={70}>
                <Section
                  title="Best Practices"
                  subtitle="Best parsing results come from clean PDF/DOCX formatting."
                  icon={ShieldCheck}
                >
                  <ul className="text-sm text-white/50 space-y-2 list-disc pl-5">
                    <li>Use clear section headers (Experience, Education, Skills).</li>
                    <li>Avoid graphics-only resumes (images of text).</li>
                    <li>Keep filenames simple (e.g., “Avo_Suvalian_Resume.pdf”).</li>
                  </ul>
                </Section>
              </FadeIn>
            </TabsContent>

            {/* BILLING (NO SUPPORT here) */}
            <TabsContent value="billing" className="p-4 sm:p-6 space-y-6">
              <FadeIn show={stage >= 1} delay={0}>
                <Section
                  title="Billing"
                  subtitle="Live plan and payment status from your account."
                  icon={CreditCard}
                >
                  {billingError ? (
                    <div className="mb-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                      {billingError}
                    </div>
                  ) : null}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                      <div className="text-xs text-white/40">Current plan</div>
                      <div className="text-lg font-semibold text-white mt-1">
                        {billingLoading && !billingLoaded
                          ? "Loading..."
                          : planLabel(billingPlanId)}
                      </div>
                      <div className="text-sm text-white/40 mt-2">
                        Status: {statusLabel(billingPlanStatus)}.
                        {monthlyAllowance > 0
                          ? ` ${monthlyAllowance} credits / month.`
                          : " Free plan with limited credits."}
                      </div>
                      <div className="text-sm text-white/40 mt-2 flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-white/40" />
                        Renews on: {renewsOnLabel}
                      </div>
                    </div>

                    <div className="stripe-payment-card relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/90 via-indigo-950/60 to-slate-900/95 p-5">
                      <div className="stripe-payment-shine" aria-hidden />
                      <div className="relative z-10">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs uppercase tracking-[0.18em] text-white/50">
                            Payment Method
                          </div>
                          <div
                            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                              paymentConnected
                                ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                                : "border-rose-400/40 bg-rose-500/10 text-rose-200"
                            }`}
                          >
                            {paymentConnected ? "Connected" : "Missing"}
                          </div>
                        </div>

                        <div className="mt-4 flex items-end justify-between gap-3">
                          <div className="font-mono text-lg sm:text-xl tracking-[0.2em] text-white/95">
                            {paymentConnected
                              ? `**** **** **** ${stripeCardLast4}`
                              : "No card on file"}
                          </div>
                          <div className="text-sm font-semibold text-white/75">
                            {stripeCardBrand}
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-white/65">
                          <div>
                            <div className="uppercase tracking-[0.1em] text-white/40">
                              Expires
                            </div>
                            <div className="mt-1 text-sm text-white/90">
                              {stripePaymentExp}
                            </div>
                          </div>
                          <div>
                            <div className="uppercase tracking-[0.1em] text-white/40">
                              Subscription
                            </div>
                            <div className="mt-1 text-sm text-white/90">
                              {statusLabel(stripeSubStatus)}
                            </div>
                          </div>
                        </div>

                        {!stripePaymentCard && paymentConnected ? (
                          <div className="mt-3 rounded-lg border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                            {stripeMissingReason || "No default card is attached. Add one in Billing Portal > Payment methods."}
                          </div>
                        ) : null}

                        <div className="mt-4 border-t border-white/10 pt-3 text-xs text-white/50">
                          <div>{stripePaymentMethodDisplay}</div>
                          <div className="mt-1">
                            {stripeCardMetaDisplay || stripeMissingReason || "Card metadata unavailable"}
                          </div>
                          {stripeMethodSource ? (
                            <div className="mt-1">
                              Source: {stripeMethodSource}
                            </div>
                          ) : null}
                          <div className="mt-1" title={stripeCustomerId || undefined}>
                            {stripeCustomerId
                              ? `Customer: ${stripeCustomerShort}`
                              : "Customer: -"}
                          </div>
                          <div className="mt-1" title={stripeSubscriptionId || undefined}>
                            {stripeSubscriptionId
                              ? `Subscription: ${stripeSubscriptionShort}`
                              : "Subscription: -"}
                          </div>
                          <div className="mt-1">
                            {stripePeriodEndLabel !== "-"
                              ? `Current period ends ${stripePeriodEndLabel}`
                              : "No active renewal date"}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col sm:flex-row gap-3">
                    <Button
                      type="button"
                      variant="ghost"
                      className="border border-white/10 text-white/70 hover:text-white hover:bg-white/5 rounded-xl py-5 px-5"
                      onClick={openStripePortal}
                      disabled={portalLoading}
                    >
                      <CreditCard className="w-4 h-4 mr-2" />
                      {portalLoading && portalAction === "portal"
                        ? "Opening portal..."
                        : "Manage Billing Portal"}
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      className="border border-rose-400/30 bg-rose-500/10 text-rose-100 hover:text-rose-50 hover:bg-rose-500/18 rounded-xl py-5 px-5"
                      onClick={openCancelSubscription}
                      disabled={
                        portalLoading ||
                        !stripeSubscriptionId ||
                        isSubscriptionCanceled
                      }
                    >
                      <X className="w-4 h-4 mr-2" />
                      {portalLoading && portalAction === "cancel"
                        ? "Opening cancellation..."
                        : "Cancel Subscription"}
                    </Button>

                    <Button
                      type="button"
                      className="bg-purple-600 hover:bg-purple-500 text-white rounded-xl py-5 px-5 font-semibold"
                      onClick={openPricing}
                    >
                      {isSubscriptionCanceled ? "Resubscribe" : "Upgrade"}
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </Section>
              </FadeIn>

              <FadeIn show={stage >= 2} delay={80}>
                <Section
                  title="Invoices"
                  subtitle="Recent subscription credit events from your billing ledger."
                  icon={FileText}
                >
                  {billingLoading && !billingLoaded ? (
                    <div className="space-y-2">
                      <SoftSkeleton className="h-14 rounded-xl" />
                      <SoftSkeleton className="h-14 rounded-xl" />
                    </div>
                  ) : billingHistory.length === 0 ? (
                    <div className="text-sm text-white/50">
                      No subscription billing events yet. Upgrade on Pricing to
                      start recurring credits.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {billingHistory.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <div className="text-sm text-white font-medium">
                              {item.plan} plan credit
                            </div>
                            <div className="text-xs text-white/45">{item.date}</div>
                          </div>
                          <div className="text-sm font-semibold text-emerald-300">
                            +{item.amount} credits
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
              </FadeIn>
            </TabsContent>

            {/* CREDITS (NEW TAB) */}
            <TabsContent value="credits" className="p-4 sm:p-6 space-y-6">
              <FadeIn show={stage >= 1} delay={0}>
                <Section
                  title="Credits"
                  subtitle="Live balance and usage synced from your account."
                  icon={Zap}
                  iconTheme="emerald"
                >
                  {billingError ? (
                    <div className="mb-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                      {billingError}
                    </div>
                  ) : null}

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                      <div className="text-xs text-white/40">Current balance</div>
                      <div className="text-3xl font-bold text-white mt-1">
                        {billingLoading && !billingLoaded ? "-" : creditsBalance}
                      </div>
                      <div className="text-sm text-white/40 mt-2">
                        Available now.
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                      <div className="text-xs text-white/40">Monthly allowance</div>
                      <div className="text-3xl font-bold text-white mt-1">
                        {billingLoading && !billingLoaded ? "-" : monthlyAllowance}
                      </div>
                      <div className="text-sm text-white/40 mt-2">
                        Plan: {planLabel(billingPlanId)}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                      <div className="text-xs text-white/40">Used this period</div>
                      <div className="text-3xl font-bold text-white mt-1">
                        {billingLoading && !billingLoaded ? "-" : displayMonthlyUsed}
                      </div>
                      <div className="text-sm text-white/40 mt-2">
                        Period: {monthlyPeriod || "-"}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                      <div className="text-xs text-white/40">Remaining</div>
                      <div className="text-3xl font-bold text-white mt-1">
                        {billingLoading && !billingLoaded ? "-" : displayMonthlyRemaining}
                      </div>
                      <div className="text-sm text-white/40 mt-2">
                        Renews: {renewsOnLabel}
                      </div>
                    </div>
                  </div>
                </Section>
              </FadeIn>

              <FadeIn show={stage >= 2} delay={80}>
                <Section
                  title="Credit Activity"
                  subtitle="Recent grant/spend events from your credits ledger."
                  icon={CreditCard}
                >
                  {billingLoading && !billingLoaded ? (
                    <div className="space-y-2">
                      <SoftSkeleton className="h-14 rounded-xl" />
                      <SoftSkeleton className="h-14 rounded-xl" />
                    </div>
                  ) : creditsActivity.length === 0 ? (
                    <div className="text-sm text-white/50">
                      No credit activity yet. Generate packets or upgrade your
                      plan to see events here.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {creditsActivity.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <div className="text-sm text-white font-medium truncate">
                              {item.reason}
                            </div>
                            <div className="text-xs text-white/45">{item.date}</div>
                          </div>
                          <div
                            className={`text-sm font-semibold ${
                              item.delta >= 0 ? "text-emerald-300" : "text-white/80"
                            }`}
                          >
                            {item.delta >= 0 ? `+${item.delta}` : item.delta}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 flex flex-col sm:flex-row gap-3">
                    <Button
                      type="button"
                      className="bg-purple-600 hover:bg-purple-500 text-white rounded-xl py-5 px-5 font-semibold"
                      onClick={openPricing}
                    >
                      Upgrade Plan
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="border border-white/10 text-white/70 hover:text-white hover:bg-white/5 rounded-xl py-5 px-5"
                      onClick={openCreditsPage}
                    >
                      Open Full Credits Page
                    </Button>
                  </div>
                </Section>
              </FadeIn>
            </TabsContent>

            {/* SECURITY (NEW TAB) */}
            <TabsContent value="security" className="p-4 sm:p-6 space-y-6">
              <FadeIn show={stage >= 1} delay={0}>
                <Section
                  title="Security"
                  subtitle="Authentication details from Static Web Apps."
                  icon={Lock}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                      <div className="text-xs text-white/40">Signed in with</div>
                      <div className="text-lg font-semibold text-white mt-1">
                        {authLoading ? "Loading..." : authProvider || "—"}
                      </div>
                      <div className="text-sm text-white/40 mt-2">
                        Provider comes from SWA identity headers / your userinfo API.
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                      <div className="text-xs text-white/40">Account email</div>
                      <div className="text-lg font-semibold text-white mt-1 break-all">
                        {authLoading ? "Loading..." : authEmail || "—"}
                      </div>
                      <div className="text-sm text-white/40 mt-2">
                        This is the email you used to sign in (if available).
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/20 p-5 md:col-span-2">
                      <div className="text-xs text-white/40">User ID</div>
                      <div className="text-sm text-white/70 mt-2 break-all">
                        {authLoading ? "Loading..." : authUserId || "—"}
                      </div>
                      <div className="text-xs text-white/30 mt-3">
                        If you don’t see email/userId, update your userinfo function to return SWA
                        principal fields (clientPrincipal.userDetails / userId).
                      </div>
                    </div>
                  </div>
                </Section>
              </FadeIn>

              <FadeIn show={stage >= 2} delay={90}>
                <Section
                  title="Recommendations"
                  subtitle="Quick security checklist."
                  icon={ShieldCheck}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      "Use strong, unique password on your identity provider.",
                      "Enable MFA on Google/Microsoft login.",
                      "Avoid sharing resume links publicly.",
                      "Rotate any leaked keys (SAS, API keys) immediately.",
                    ].map((t) => (
                      <div
                        key={t}
                        className="rounded-2xl border border-white/10 bg-black/20 p-5 flex items-start gap-3"
                      >
                        <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5" />
                        <div className="text-sm text-white/60">{t}</div>
                      </div>
                    ))}
                  </div>
                </Section>
              </FadeIn>
            </TabsContent>

            {/* HELP (NEW TAB) */}
            <TabsContent value="help" className="p-4 sm:p-6 space-y-6">
              <FadeIn show={stage >= 1} delay={0}>
                <Section
                  title="Help Center"
                  subtitle="Quick answers and troubleshooting tips."
                  icon={HelpCircle}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FAQItem
                      q="Why is my resume upload failing?"
                      a="Usually it’s a file type or size issue. Try a clean PDF or DOCX and avoid scanned image-only resumes. If it still fails, contact support with the exact error."
                    />
                    <FAQItem
                      q="Why do I see 401 or 404 errors?"
                      a="401 means you’re not authenticated (or your SWA auth cookie expired). 404 typically means a route mismatch between /api/* and your Azure Functions routes."
                    />
                    <FAQItem
                      q="How do credits work?"
                      a="Credits are consumed when generating packets and documents. You can see your live balance, monthly allowance, and recent credit activity in the Credits tab."
                    />
                    <FAQItem
                      q="How do I change my default resume?"
                      a="Go to the Resumes page and set a default. The app uses the default resume for generating cover letters and bullet points."
                    />
                  </div>
                </Section>
              </FadeIn>

              <FadeIn show={stage >= 2} delay={80}>
                <Section
                  title="Contact"
                  subtitle="If you can’t find your answer, message support."
                  icon={LifeBuoy}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="text-sm text-white/50">
                      Use Support (Profile tab) to send us a message.
                    </div>
                    <Button
                      type="button"
                      onClick={() => {
                        setTab("profile");
                        setSupportOpen(true);
                        toast.message("Support opened in Profile tab.");
                      }}
                      className="bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl py-5 px-5"
                    >
                      <Mail className="w-4 h-4 mr-2" />
                      Message support
                    </Button>
                  </div>
                </Section>
              </FadeIn>
            </TabsContent>
          </Tabs>
        </div>
        </FadeIn>
      </div>
    </div>
  );
}



