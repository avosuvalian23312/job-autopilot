import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  Coins,
  Lock,
  HelpCircle,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

const STORAGE_KEY = "jobautopilot_profile_v1";

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

function FadeIn({ show, delay = 0, className = "", children }) {
  return (
    <div
      className={[
        "transition-all duration-500 will-change-transform",
        show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none",
        className,
      ].join(" ")}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
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

function Section({ title, subtitle, children, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
      <div className="flex items-start gap-3 mb-5">
        {Icon ? (
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/10 flex items-center justify-center">
            <Icon className="w-5 h-5 text-purple-300" />
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

  // tab animation staging
  const [stage, setStage] = useState(0);
  const stageTimers = useRef({ t1: null, t2: null });

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

  // Staged animation whenever tab changes or initial load completes
  useEffect(() => {
    if (stageTimers.current.t1) clearTimeout(stageTimers.current.t1);
    if (stageTimers.current.t2) clearTimeout(stageTimers.current.t2);

    setStage(0);
    stageTimers.current.t1 = setTimeout(() => setStage(1), 90);
    stageTimers.current.t2 = setTimeout(() => setStage(2), 220);

    return () => {
      if (stageTimers.current.t1) clearTimeout(stageTimers.current.t1);
      if (stageTimers.current.t2) clearTimeout(stageTimers.current.t2);
    };
  }, [tab, loading]);

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
    <div className="min-h-screen bg-[hsl(240,10%,4%)] relative overflow-hidden">
      {/* subtle background accents */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-44 left-1/2 -translate-x-1/2 w-[900px] h-[420px] rounded-full bg-purple-600/10 blur-3xl" />
        <div className="absolute -bottom-72 left-1/3 w-[760px] h-[420px] rounded-full bg-fuchsia-500/5 blur-3xl" />
      </div>

      <AppNav currentPage="Settings" />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white">Settings</h1>
            <p className="text-white/40 mt-1">
              Manage your profile, resume data, and billing
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

        {/* Tabs */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-xl">
          <Tabs value={tab} onValueChange={setTab}>
            <div className="px-4 sm:px-6 pt-4">
              <TabsList className="bg-transparent p-0 gap-1 sm:gap-2 flex flex-wrap">
                <TabsTrigger
                  value="profile"
                  className="rounded-xl px-4 py-2.5 text-sm data-[state=active]:bg-white/[0.04] data-[state=active]:text-white data-[state=active]:shadow-none text-white/60 hover:text-white/80"
                >
                  <User className="w-4 h-4 mr-2" />
                  Profile
                </TabsTrigger>

                <TabsTrigger
                  value="resume"
                  className="rounded-xl px-4 py-2.5 text-sm data-[state=active]:bg-white/[0.04] data-[state=active]:text-white data-[state=active]:shadow-none text-white/60 hover:text-white/80"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Resume
                </TabsTrigger>

                <TabsTrigger
                  value="billing"
                  className="rounded-xl px-4 py-2.5 text-sm data-[state=active]:bg-white/[0.04] data-[state=active]:text-white data-[state=active]:shadow-none text-white/60 hover:text-white/80"
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  Billing
                </TabsTrigger>

                <TabsTrigger
                  value="credits"
                  className="rounded-xl px-4 py-2.5 text-sm data-[state=active]:bg-white/[0.04] data-[state=active]:text-white data-[state=active]:shadow-none text-white/60 hover:text-white/80"
                >
                  <Coins className="w-4 h-4 mr-2" />
                  Credits
                </TabsTrigger>

                <TabsTrigger
                  value="security"
                  className="rounded-xl px-4 py-2.5 text-sm data-[state=active]:bg-white/[0.04] data-[state=active]:text-white data-[state=active]:shadow-none text-white/60 hover:text-white/80"
                >
                  <Lock className="w-4 h-4 mr-2" />
                  Security
                </TabsTrigger>

                <TabsTrigger
                  value="help"
                  className="rounded-xl px-4 py-2.5 text-sm data-[state=active]:bg-white/[0.04] data-[state=active]:text-white data-[state=active]:shadow-none text-white/60 hover:text-white/80"
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
                  subtitle="Manage your plan and payment method."
                  icon={CreditCard}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                      <div className="text-xs text-white/40">Current plan</div>
                      <div className="text-lg font-semibold text-white mt-1">
                        Credits-based
                      </div>
                      <div className="text-sm text-white/40 mt-2">
                        Credits are used when generating cover letters and bullet points.
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                      <div className="text-xs text-white/40">Payment method</div>
                      <div className="text-lg font-semibold text-white mt-1">
                        Not connected
                      </div>
                      <div className="text-sm text-white/40 mt-2">
                        Stripe integration placeholder.
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col sm:flex-row gap-3">
                    <Button
                      type="button"
                      variant="ghost"
                      className="border border-white/10 text-white/70 hover:text-white hover:bg-white/5 rounded-xl py-5 px-5"
                      onClick={() => toast.message("Billing UI placeholder (wire to Stripe).")}
                    >
                      <CreditCard className="w-4 h-4 mr-2" />
                      Manage billing
                    </Button>

                    <Button
                      type="button"
                      className="bg-purple-600 hover:bg-purple-500 text-white rounded-xl py-5 px-5 font-semibold"
                      onClick={() => toast.message("Upgrade UI placeholder.")}
                    >
                      Upgrade
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </Section>
              </FadeIn>

              <FadeIn show={stage >= 2} delay={80}>
                <Section
                  title="Invoices"
                  subtitle="Download invoices and view history (placeholder)."
                  icon={FileText}
                >
                  <div className="text-sm text-white/50">
                    Coming soon: invoice history, downloadable receipts, and billing email settings.
                  </div>
                </Section>
              </FadeIn>
            </TabsContent>

            {/* CREDITS (NEW TAB) */}
            <TabsContent value="credits" className="p-4 sm:p-6 space-y-6">
              <FadeIn show={stage >= 1} delay={0}>
                <Section
                  title="Credits"
                  subtitle="Buy and manage credits (filler for now)."
                  icon={Coins}
                >
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                      <div className="text-xs text-white/40">Current balance</div>
                      <div className="text-3xl font-bold text-white mt-1">87</div>
                      <div className="text-sm text-white/40 mt-2">
                        Used for document generation.
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/20 p-5 md:col-span-2">
                      <div className="text-xs text-white/40">How credits work</div>
                      <ul className="text-sm text-white/50 mt-3 space-y-2 list-disc pl-5">
                        <li>Generating a cover letter might cost 2–5 credits.</li>
                        <li>Generating bullets might cost 1–3 credits.</li>
                        <li>Exact pricing will be added when Stripe is wired.</li>
                      </ul>
                    </div>
                  </div>
                </Section>
              </FadeIn>

              <FadeIn show={stage >= 2} delay={80}>
                <Section
                  title="Buy credits"
                  subtitle="Checkout placeholder buttons (no real payment yet)."
                  icon={CreditCard}
                >
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                      { name: "Starter", credits: 50, price: "$9" },
                      { name: "Pro", credits: 200, price: "$29" },
                      { name: "Business", credits: 500, price: "$59" },
                    ].map((p) => (
                      <div
                        key={p.name}
                        className="rounded-2xl border border-white/10 bg-black/20 p-5"
                      >
                        <div className="text-white font-semibold">{p.name}</div>
                        <div className="text-2xl font-bold text-white mt-2">
                          {p.credits} <span className="text-sm font-medium text-white/50">credits</span>
                        </div>
                        <div className="text-sm text-white/40 mt-1">{p.price} / one-time</div>

                        <Button
                          type="button"
                          className="mt-4 w-full bg-purple-600 hover:bg-purple-500 text-white rounded-xl py-5 font-semibold"
                          onClick={() => toast.message(`Checkout placeholder: ${p.name}`)}
                        >
                          Buy {p.name}
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <div className="text-xs text-white/30 mt-4">
                    Next: wire these buttons to Stripe + your credits ledger API.
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
                  subtitle="Quick answers and tips (filler content)."
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
                      a="Credits are consumed when generating documents. Exact pricing will show here once Stripe + ledger logic is connected."
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
      </div>
    </div>
  );
}
