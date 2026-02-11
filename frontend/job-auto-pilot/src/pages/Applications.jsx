import React, { useEffect, useMemo, useRef, useState } from "react";
import AppNav from "@/components/app/AppNav";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  FileText,
  Building2,
  Calendar,
  MapPin,
  Globe,
  Tag,
  DollarSign,
  Percent,
  Briefcase,
  Clock,
  ShieldCheck,
  X,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

export default function Applications() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState(null);

  const [applications, setApplications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // ✅ cache SWA userId (so we don't hit /.auth/me repeatedly)
  const swaUserIdRef = useRef(null);

  const readJsonSafe = async (res) => {
    const text = await res.text().catch(() => "");
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  };

  // ✅ SWA-safe fetch helper (cookies included)
  const apiFetch = async (path, options = {}) => {
    const { body, headers, ...rest } = options;

    const isJsonObject =
      body != null && typeof body === "object" && !(body instanceof FormData);

    const res = await fetch(path, {
      ...rest,
      credentials: "include", // ✅ REQUIRED for SWA auth cookies
      headers: {
        ...(isJsonObject ? { "Content-Type": "application/json" } : {}),
        ...(headers || {}),
      },
      body: body == null ? undefined : isJsonObject ? JSON.stringify(body) : body,
    });

    const data = await readJsonSafe(res);

    if (!res.ok) {
      const msg =
        data?.error ||
        data?.message ||
        data?.detail ||
        data?.raw ||
        `Request failed (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data;
  };

  // ✅ get SWA userId from /.auth/me (treat empty/failed as logged out)
  const getSwaUserId = async () => {
    if (swaUserIdRef.current) return swaUserIdRef.current;

    try {
      const me = await apiFetch("/.auth/me", { method: "GET" });

      // SWA /.auth/me returns an ARRAY: [ { clientPrincipal: {...} } ] OR []
      const entry = Array.isArray(me) ? me[0] : null;
      const cp = entry?.clientPrincipal || null;

      const userId = cp?.userId || null;
      if (userId) {
        swaUserIdRef.current = String(userId);
        return swaUserIdRef.current;
      }
    } catch {
      // ignore
    }

    return null; // ✅ logged out (no fake ids)
  };

  

  const normalizeJob = (job) => {
    const id = job?.id ?? job?.jobId ?? job?._id ?? job?.job_id;

    const jobTitle =
      job?.jobTitle ??
      job?.job_title ??
      job?.title ??
      job?.position ??
      "Position";

    const company =
      job?.company ?? job?.companyName ?? job?.company_name ?? "Company";

    const created =
      job?.createdAt ??
      job?.created_at ??
      job?.created_date ??
      job?.createdDate ??
      null;

    const payObj =
      job?.pay && typeof job.pay === "object" ? job.pay : null;

    // ✅ FIX: status sometimes comes back as "created" or empty -> show "generated"
    const rawStatus =
      job?.status ?? job?.applicationStatus ?? job?.application_status ?? null;

    let status = String(rawStatus || "").trim().toLowerCase();
    if (!status) status = "generated";
    if (status === "created") status = "generated"; // backend createJob uses "created"

    return {
      ...job,
      id,
      job_title: jobTitle,
      company,
      created_date: created,
      status,
      website: job?.website ?? job?.jobWebsite ?? job?.url ?? job?.link ?? null,
      location: job?.location ?? null,
      seniority:
        job?.seniority ??
        job?.experienceLevel ??
        job?.experience_level ??
        null,

      // extra pills (if available)
      employmentType: job?.employmentType ?? job?.employment_type ?? null,
      workModel: job?.workModel ?? job?.work_model ?? null,
      experienceLevel: job?.experienceLevel ?? job?.experience_level ?? null,
      complianceTags: Array.isArray(job?.complianceTags)
        ? job.complianceTags
        : Array.isArray(job?.compliance_tags)
        ? job.compliance_tags
        : [],

      keywords: Array.isArray(job?.keywords) ? job.keywords : [],

      // Pay (supports both top-level + nested pay object)
      payText: job?.payText ?? job?.pay_text ?? payObj?.text ?? null,

      payMin:
        typeof job?.payMin === "number"
          ? job.payMin
          : typeof job?.pay_min === "number"
          ? job.pay_min
          : typeof payObj?.min === "number"
          ? payObj.min
          : null,

      payMax:
        typeof job?.payMax === "number"
          ? job.payMax
          : typeof job?.pay_max === "number"
          ? job.pay_max
          : typeof payObj?.max === "number"
          ? payObj.max
          : null,

      payCurrency:
        job?.payCurrency ?? job?.pay_currency ?? payObj?.currency ?? "USD",

      payPeriod:
        job?.payPeriod ?? job?.pay_period ?? payObj?.period ?? null,

      payConfidence:
        typeof job?.payConfidence === "number"
          ? job.payConfidence
          : typeof job?.pay_confidence === "number"
          ? job.pay_confidence
          : typeof payObj?.confidence === "number"
          ? payObj.confidence
          : null,

      payAnnualizedMin:
        typeof job?.payAnnualizedMin === "number"
          ? job.payAnnualizedMin
          : typeof job?.pay_annualized_min === "number"
          ? job.pay_annualized_min
          : typeof payObj?.annualizedMin === "number"
          ? payObj.annualizedMin
          : null,

      payAnnualizedMax:
        typeof job?.payAnnualizedMax === "number"
          ? job.payAnnualizedMax
          : typeof job?.pay_annualized_max === "number"
          ? job.pay_annualized_max
          : typeof payObj?.annualizedMax === "number"
          ? payObj.annualizedMax
          : null,

      payPercentile:
        typeof job?.payPercentile === "number"
          ? job.payPercentile
          : typeof job?.pay_percentile === "number"
          ? job.pay_percentile
          : typeof payObj?.percentile === "number"
          ? payObj.percentile
          : null,

      jobDescription: job?.jobDescription ?? job?.job_description ?? null,
    };
  };

  const loadJobs = async () => {
    setIsLoading(true);
    try {
      const userId = await getSwaUserId();

      // If logged out (or SWA not seeing auth), go to SWA login properly
      if (!userId) {
        toast.error("Session expired — please sign in.");
        setIsLoading(false);
        redirectToSwaLogin("google"); // change to "aad" if you use Microsoft login
        return;
      }

      const data = await apiFetch("/api/jobs", { method: "GET" });
      const list = Array.isArray(data) ? data : data?.jobs || data?.items || [];
      const normalized = list.map(normalizeJob).filter((x) => x?.id != null);
      setApplications(normalized);
    } catch (e) {
      console.error(e);

      if (e?.status === 401) {
        toast.error("Not authorized — please sign in again.");
        setIsLoading(false);
        redirectToSwaLogin("google");
        return;
      }

      toast.error("Failed to load applications.");
      setApplications([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusLabel = (s) => {
    const v = String(s || "").trim().toLowerCase();
    if (!v) return "Generated";
    if (v === "generated") return "Generated";
    if (v === "applied") return "Applied";
    if (v === "interview") return "Interview";
    if (v === "offer") return "Offer";
    if (v === "rejected") return "Rejected";
    if (v === "created") return "Generated"; // safety
    return v[0].toUpperCase() + v.slice(1);
  };

  const statusPill = (s) => {
    const v = String(s || "").trim().toLowerCase();
    if (v === "interview")
      return "bg-amber-500/14 text-amber-100 border border-amber-400/25";
    if (v === "applied")
      return "bg-sky-500/14 text-sky-100 border border-sky-400/25";
    if (v === "offer")
      return "bg-emerald-500/14 text-emerald-100 border border-emerald-400/25";
    if (v === "rejected")
      return "bg-rose-500/14 text-rose-100 border border-rose-400/25";
    return "bg-violet-500/15 text-violet-100 border border-violet-400/25";
  };

  // ✅ Pay pill helpers (always render a pay pill)
  const fmtMoney = (n, currency = "USD") => {
    if (typeof n !== "number" || !Number.isFinite(n)) return null;
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(n);
    } catch {
      return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    }
  };

  const getPayPill = (job) => {
    const currency = job?.payCurrency || "USD";

    const min =
      typeof job?.payMin === "number" && Number.isFinite(job.payMin)
        ? job.payMin
        : null;
    const max =
      typeof job?.payMax === "number" && Number.isFinite(job.payMax)
        ? job.payMax
        : null;

    const aMin =
      typeof job?.payAnnualizedMin === "number" &&
      Number.isFinite(job.payAnnualizedMin)
        ? job.payAnnualizedMin
        : null;
    const aMax =
      typeof job?.payAnnualizedMax === "number" &&
      Number.isFinite(job.payAnnualizedMax)
        ? job.payAnnualizedMax
        : null;

    const payText = (job?.payText || "").trim();

    const pRaw = job?.payPeriod ? String(job.payPeriod).toLowerCase() : "";
    const periodSuffix =
      pRaw.includes("hour") || pRaw === "hr" || pRaw === "hourly"
        ? "/hr"
        : pRaw.includes("year") || pRaw === "yr" || pRaw.includes("annual") || pRaw === "yearly"
        ? "/yr"
        : pRaw.includes("month")
        ? "/mo"
        : pRaw.includes("week")
        ? "/wk"
        : pRaw.includes("day")
        ? "/day"
        : pRaw
        ? `/${pRaw}`
        : "";

    // 1️⃣ min/max first
    if (min != null || max != null) {
      const sMin = min != null ? fmtMoney(min, currency) : null;
      const sMax = max != null ? fmtMoney(max, currency) : null;

      if (sMin && sMax) {
        return {
          text: sMin === sMax ? `${sMin}${periodSuffix}` : `${sMin} – ${sMax}${periodSuffix}`,
          hasValue: true,
          source: "range",
        };
      }
      if (sMin) return { text: `${sMin}${periodSuffix}`, hasValue: true, source: "range" };
      if (sMax) return { text: `${sMax}${periodSuffix}`, hasValue: true, source: "range" };
    }

    // 2️⃣ annualized fallback
    if (aMin != null || aMax != null) {
      const sMin = aMin != null ? fmtMoney(aMin, currency) : null;
      const sMax = aMax != null ? fmtMoney(aMax, currency) : null;

      if (sMin && sMax) return { text: `Est. ${sMin} – ${sMax}/yr`, hasValue: true, source: "annual" };
      if (sMin) return { text: `Est. ${sMin}/yr`, hasValue: true, source: "annual" };
      if (sMax) return { text: `Est. ${sMax}/yr`, hasValue: true, source: "annual" };
    }

    // 3️⃣ text fallback
    if (payText) return { text: payText, hasValue: true, source: "text" };

    // ✅ always render a pill
    return { text: "Pay not listed", hasValue: false, source: "none" };
  };

  const renderConfidence = (job) => {
    if (typeof job?.payConfidence !== "number") return null;
    const c = job.payConfidence;
    if (c >= 0.8) return "High confidence";
    if (c >= 0.5) return "Medium confidence";
    return "Low confidence";
  };

  const renderTopPay = (job) => {
    if (typeof job?.payPercentile !== "number") return null;
    const top = Math.round(100 - job.payPercentile);
    return `Top ${top}% pay`;
  };

  const formatDate = (d) => {
    try {
      if (!d) return null;
      const dt = new Date(d);
      if (Number.isNaN(dt.getTime())) return null;
      return format(dt, "MMM d, yyyy");
    } catch {
      return null;
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return applications.filter((app) => {
      const matchesSearch =
        !q ||
        app.job_title?.toLowerCase().includes(q) ||
        app.company?.toLowerCase().includes(q);
      const matchesStatus =
        statusFilter === "all" || app.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [applications, search, statusFilter]);

  const updateStatus = async (id, status) => {
    const nextStatus = String(status || "").trim().toLowerCase() || "generated";

    // optimistic update
    setApplications((prev) =>
      prev.map((app) => (app.id === id ? { ...app, status: nextStatus } : app))
    );
    if (selected?.id === id) setSelected((s) => ({ ...s, status: nextStatus }));

    try {
      // route: "jobs/{jobId}/status" methods: PUT,PATCH
      await apiFetch(`/api/jobs/${encodeURIComponent(id)}/status`, {
        method: "PATCH",
        body: { status: nextStatus },
      });
    } catch (e) {
      console.error(e);
      toast.error("Failed to update status in cloud.");
      loadJobs();
    }
  };

  // ---------------------------
  // Brand system (match NewJob look)
  // ---------------------------
  const pageBg =
    "bg-[radial-gradient(1100px_700px_at_10%_-10%,rgba(99,102,241,0.22),transparent_55%),radial-gradient(900px_600px_at_95%_0%,rgba(34,211,238,0.16),transparent_60%),radial-gradient(900px_650px_at_50%_110%,rgba(168,85,247,0.18),transparent_55%),linear-gradient(180deg,hsl(240,10%,6%),hsl(240,12%,5%))]";
  const surface =
    "bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.02))]";
  const edge = "border border-white/10 ring-1 ring-white/5";
  const brandRing = "ring-1 ring-violet-400/20 border-violet-400/20";
  const ambient =
    "shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_18px_55px_rgba(0,0,0,0.60)]";
  const cardShadow = "shadow-[0_18px_60px_rgba(0,0,0,0.55)]";
  const neonLine =
    "bg-gradient-to-r from-cyan-400/70 via-violet-400/55 to-indigo-400/70";

  const pill =
    "px-3 py-1.5 rounded-full text-xs font-medium bg-white/[0.06] text-white/85 border border-white/10";
  const pillBrand =
    "px-3 py-1.5 rounded-full text-xs font-semibold bg-violet-500/15 text-violet-100 border border-violet-400/25";
  const pillGood =
    "px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/14 text-emerald-100 border border-emerald-400/25";
  const pillWarn =
    "px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-500/14 text-amber-100 border border-amber-400/25";

  return (
    <div className={`min-h-screen ${pageBg}`}>
      <AppNav currentPage="Applications" />

      <motion.div
        initial={{ opacity: 0, x: 18 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -18 }}
        transition={{ duration: 0.28 }}
        className="max-w-7xl mx-auto px-4 sm:px-6 py-8"
      >
        <div className="mb-8 text-center">
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-3">
            Applications
          </h1>
          <div className="flex items-center justify-center gap-2">
            <div className="w-8 h-8 rounded-full bg-purple-600/20 border border-purple-500/30 flex items-center justify-center">
              <span className="text-sm font-bold text-purple-200">
                {applications.length}
              </span>
            </div>
            <span className="text-white/40 text-sm">
              total applications tracked
            </span>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <motion.div
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            className="relative flex-1"
          >
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
            <Input
              placeholder="Search by role or company…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-black/30 border-white/10 text-white placeholder:text-white/30 pl-12 py-6 rounded-xl text-base hover:bg-white/[0.05] hover:border-violet-400/40 hover:shadow-lg hover:shadow-violet-500/10 transition-all duration-200"
            />
          </motion.div>

          <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48 bg-black/30 border-white/10 text-white/80 rounded-xl py-6 text-base hover:bg-white/[0.05] hover:border-violet-400/40 hover:shadow-lg hover:shadow-violet-500/10 transition-all duration-200">
                <SelectValue placeholder="Status" />
              </SelectTrigger>

              <SelectContent className="bg-black border border-white/10 text-white shadow-2xl">
                <SelectItem
                  value="all"
                  className="text-white/90 focus:bg-violet-500/20 focus:text-white data-[highlighted]:bg-violet-500/20 data-[highlighted]:text-white"
                >
                  All Status
                </SelectItem>
                <SelectItem
                  value="generated"
                  className="text-white/90 focus:bg-violet-500/20 focus:text-white data-[highlighted]:bg-violet-500/20 data-[highlighted]:text-white"
                >
                  Generated
                </SelectItem>
                <SelectItem
                  value="applied"
                  className="text-white/90 focus:bg-sky-500/20 focus:text-white data-[highlighted]:bg-sky-500/20 data-[highlighted]:text-white"
                >
                  Applied
                </SelectItem>
                <SelectItem
                  value="interview"
                  className="text-white/90 focus:bg-amber-500/20 focus:text-white data-[highlighted]:bg-amber-500/20 data-[highlighted]:text-white"
                >
                  Interview
                </SelectItem>
                <SelectItem
                  value="offer"
                  className="text-white/90 focus:bg-emerald-500/20 focus:text-white data-[highlighted]:bg-emerald-500/20 data-[highlighted]:text-white"
                >
                  Offer
                </SelectItem>
                <SelectItem
                  value="rejected"
                  className="text-white/90 focus:bg-rose-500/20 focus:text-white data-[highlighted]:bg-rose-500/20 data-[highlighted]:text-white"
                >
                  Rejected
                </SelectItem>
              </SelectContent>
            </Select>
          </motion.div>
        </div>

        {/* List */}
        <div
          className={[
            "rounded-2xl overflow-hidden",
            surface,
            edge,
            brandRing,
            ambient,
          ].join(" ")}
        >
          <div className={`h-1.5 ${neonLine}`} />

          <div className="divide-y divide-white/10">
            {isLoading ? (
              <div className="p-6 space-y-4">
                {Array(6)
                  .fill(0)
                  .map((_, i) => (
                    <div
                      key={i}
                      className="rounded-xl p-4 bg-black/25 border border-white/10"
                    >
                      <Skeleton className="h-5 w-64 bg-white/5 mb-3" />
                      <Skeleton className="h-4 w-40 bg-white/5" />
                    </div>
                  ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-16 text-center">
                <FileText className="w-14 h-14 text-white/10 mx-auto mb-4" />
                <p className="text-white/40 text-lg">No applications found</p>
              </div>
            ) : (
              filtered.map((app, index) => {
                const dateStr = formatDate(app.created_date);
                const pay = getPayPill(app);
                const payConf = renderConfidence(app);
                const topPay = renderTopPay(app);

                return (
                  <motion.div
                    key={app.id}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.02, duration: 0.22 }}
                    className={[
                      "px-6 py-5 bg-black/10",
                      "hover:bg-white/[0.03]",
                      "transition-colors",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-6">
                      {/* Left */}
                      <button
                        onClick={() => setSelected(app)}
                        className="text-left flex-1 min-w-0 group"
                      >
                        <div className="text-white font-semibold text-lg leading-tight group-hover:text-white">
                          {app.job_title}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/55">
                          <span className="inline-flex items-center gap-1.5">
                            <Building2 className="w-4 h-4" />
                            {app.company}
                          </span>
                          {dateStr && (
                            <span className="inline-flex items-center gap-1.5">
                              <Calendar className="w-4 h-4" />
                              {dateStr}
                            </span>
                          )}
                          {app.location && (
                            <span className="inline-flex items-center gap-1.5">
                              <MapPin className="w-4 h-4" />
                              {app.location}
                            </span>
                          )}
                          {app.website && (
                            <span className="inline-flex items-center gap-1.5 truncate">
                              <Globe className="w-4 h-4" />
                              <span className="truncate max-w-[360px]">
                                {app.website}
                              </span>
                            </span>
                          )}
                        </div>

                        {/* Pills row */}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span
                            className={`${pillBrand} inline-flex items-center gap-2`}
                          >
                            <Tag className="w-3.5 h-3.5" />
                            {statusLabel(app.status)}
                          </span>

                          {app.employmentType && (
                            <span
                              className={`${pill} inline-flex items-center gap-2`}
                            >
                              <Briefcase className="w-3.5 h-3.5 text-white/60" />
                              {app.employmentType}
                            </span>
                          )}

                          {app.workModel && (
                            <span
                              className={`${pill} inline-flex items-center gap-2`}
                            >
                              <Building2 className="w-3.5 h-3.5 text-white/60" />
                              {app.workModel}
                            </span>
                          )}

                          {app.experienceLevel && (
                            <span
                              className={`${pill} inline-flex items-center gap-2`}
                            >
                              <Clock className="w-3.5 h-3.5 text-white/60" />
                              {app.experienceLevel}
                            </span>
                          )}

                          {/* ✅ Pay pill ALWAYS renders */}
                          <span
                            className={`${(pay?.hasValue ? pillGood : pill)} inline-flex items-center gap-2`}
                          >
                            <DollarSign className="w-3.5 h-3.5" />
                            {pay?.text || "Pay not listed"}
                          </span>

                          {payConf && <span className={pill}>{payConf}</span>}

                          {topPay && (
                            <span
                              className={`${pillBrand} inline-flex items-center gap-2`}
                            >
                              <Percent className="w-3.5 h-3.5" />
                              {topPay}
                            </span>
                          )}

                          {Array.isArray(app.complianceTags) &&
                            app.complianceTags.slice(0, 3).map((t, i) => (
                              <span
                                key={`${app.id}-ct-${i}`}
                                className={`${pillBrand} inline-flex items-center gap-2`}
                              >
                                <ShieldCheck className="w-3.5 h-3.5" />
                                {t}
                              </span>
                            ))}
                        </div>

                        {/* Keywords mini row */}
                        {Array.isArray(app.keywords) &&
                          app.keywords.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {app.keywords.slice(0, 6).map((k, i) => (
                                <span key={`${app.id}-kw-${i}`} className={pill}>
                                  {k}
                                </span>
                              ))}
                            </div>
                          )}
                      </button>

                      {/* Right: Status dropdown */}
                      <div className="shrink-0">
                        <motion.div
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                        >
                          <Select
                            value={app.status || "generated"}
                            onValueChange={(v) => updateStatus(app.id, v)}
                          >
                            <SelectTrigger
                              className={[
                                "w-40 rounded-xl py-5 text-sm font-semibold",
                                "bg-black/40 border-white/10",
                                "text-white",
                                "hover:bg-white/[0.05] hover:border-violet-400/40",
                                "transition-all",
                                statusPill(app.status),
                              ].join(" ")}
                            >
                              <SelectValue />
                            </SelectTrigger>

                            <SelectContent className="bg-black border border-white/10 text-white shadow-2xl">
                              <SelectItem
                                value="generated"
                                className="text-white/90 focus:bg-violet-500/20 focus:text-white data-[highlighted]:bg-violet-500/20 data-[highlighted]:text-white"
                              >
                                Generated
                              </SelectItem>
                              <SelectItem
                                value="applied"
                                className="text-white/90 focus:bg-sky-500/20 focus:text-white data-[highlighted]:bg-sky-500/20 data-[highlighted]:text-white"
                              >
                                Applied
                              </SelectItem>
                              <SelectItem
                                value="interview"
                                className="text-white/90 focus:bg-amber-500/20 focus:text-white data-[highlighted]:bg-amber-500/20 data-[highlighted]:text-white"
                              >
                                Interview
                              </SelectItem>
                              <SelectItem
                                value="offer"
                                className="text-white/90 focus:bg-emerald-500/20 focus:text-white data-[highlighted]:bg-emerald-500/20 data-[highlighted]:text-white"
                              >
                                Offer
                              </SelectItem>
                              <SelectItem
                                value="rejected"
                                className="text-white/90 focus:bg-rose-500/20 focus:text-white data-[highlighted]:bg-rose-500/20 data-[highlighted]:text-white"
                              >
                                Rejected
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </motion.div>
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>
      </motion.div>

      {/* Popup */}
      <AnimatePresence>
        {selected && (
          <motion.div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-md px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setSelected(null);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 10 }}
              transition={{ duration: 0.22 }}
              className={[
                "w-full max-w-2xl rounded-2xl overflow-hidden",
                surface,
                edge,
                brandRing,
                cardShadow,
              ].join(" ")}
            >
              <div className={`h-1.5 ${neonLine}`} />
              <div className="p-6 md:p-7">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-white font-bold text-2xl leading-tight">
                      {selected.job_title}
                    </div>
                    <div className="mt-2 text-white/70 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="inline-flex items-center gap-1.5">
                        <Building2 className="w-4 h-4 text-white/55" />
                        {selected.company}
                      </span>
                      {formatDate(selected.created_date) && (
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar className="w-4 h-4 text-white/55" />
                          {formatDate(selected.created_date)}
                        </span>
                      )}
                      {selected.location && (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="w-4 h-4 text-white/55" />
                          {selected.location}
                        </span>
                      )}
                    </div>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelected(null)}
                    className="w-10 h-10 rounded-xl bg-black/30 border border-white/10 text-white/70 hover:text-white hover:bg-white/5 flex items-center justify-center"
                    aria-label="Close"
                  >
                    <X className="w-5 h-5" />
                  </motion.button>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <span className={`${pillBrand} inline-flex items-center gap-2`}>
                    <Tag className="w-3.5 h-3.5" />
                    {statusLabel(selected.status)}
                  </span>

                  {selected.employmentType && (
                    <span className={`${pill} inline-flex items-center gap-2`}>
                      <Briefcase className="w-3.5 h-3.5 text-white/60" />
                      {selected.employmentType}
                    </span>
                  )}

                  {selected.workModel && (
                    <span className={`${pill} inline-flex items-center gap-2`}>
                      <Building2 className="w-3.5 h-3.5 text-white/60" />
                      {selected.workModel}
                    </span>
                  )}

                  {selected.experienceLevel && (
                    <span className={`${pill} inline-flex items-center gap-2`}>
                      <Clock className="w-3.5 h-3.5 text-white/60" />
                      {selected.experienceLevel}
                    </span>
                  )}

                  {/* ✅ Pay pill ALWAYS renders in modal */}
                  {(() => {
                    const pay = getPayPill(selected);
                    return (
                      <span
                        className={`${(pay?.hasValue ? pillGood : pill)} inline-flex items-center gap-2`}
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                        {pay?.text || "Pay not listed"}
                      </span>
                    );
                  })()}

                  {renderConfidence(selected) && (
                    <span className={pill}>{renderConfidence(selected)}</span>
                  )}
                  {renderTopPay(selected) && (
                    <span className={`${pillBrand} inline-flex items-center gap-2`}>
                      <Percent className="w-3.5 h-3.5" />
                      {renderTopPay(selected)}
                    </span>
                  )}

                  {Array.isArray(selected.complianceTags) &&
                    selected.complianceTags.slice(0, 6).map((t, i) => (
                      <span
                        key={`sel-ct-${i}`}
                        className={`${pillBrand} inline-flex items-center gap-2`}
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        {t}
                      </span>
                    ))}
                </div>

                {Array.isArray(selected.keywords) && selected.keywords.length > 0 && (
                  <div className="mt-4">
                    <div className="text-xs uppercase tracking-wide text-white/50 mb-2">
                      Key skills
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selected.keywords.slice(0, 16).map((k, i) => (
                        <span key={`sel-kw-${i}`} className={pill}>
                          {k}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selected.website && (
                  <div className="mt-5 flex items-center justify-between gap-3 rounded-xl bg-black/25 border border-white/10 px-4 py-3">
                    <div className="min-w-0">
                      <div className="text-xs text-white/50 mb-1">Job link</div>
                      <div className="text-sm text-white/85 truncate">
                        {selected.website}
                      </div>
                    </div>
                    <motion.a
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      href={selected.website}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.06] border border-white/10 text-white/85 hover:bg-white/[0.10] hover:border-violet-400/25"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Open
                    </motion.a>
                  </div>
                )}

                {selected.jobDescription && (
                  <div className="mt-5">
                    <div className="text-xs uppercase tracking-wide text-white/50 mb-2">
                      Job description (saved)
                    </div>
                    <div className="rounded-xl bg-black/25 border border-white/10 p-4 max-h-[240px] overflow-auto text-sm text-white/70 leading-relaxed">
                      {String(selected.jobDescription)}
                    </div>
                  </div>
                )}

                <div className="mt-6 flex items-center justify-between gap-3">
                  <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                    <Select
                      value={selected.status || "generated"}
                      onValueChange={(v) => updateStatus(selected.id, v)}
                    >
                      <SelectTrigger
                        className={[
                          "w-48 rounded-xl py-5 text-sm font-semibold",
                          "bg-black/40 border-white/10 text-white",
                          "hover:bg-white/[0.05] hover:border-violet-400/40 transition-all",
                          statusPill(selected.status),
                        ].join(" ")}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-black border border-white/10 text-white shadow-2xl">
                        <SelectItem
                          value="generated"
                          className="text-white/90 focus:bg-violet-500/20 focus:text-white data-[highlighted]:bg-violet-500/20 data-[highlighted]:text-white"
                        >
                          Generated
                        </SelectItem>
                        <SelectItem
                          value="applied"
                          className="text-white/90 focus:bg-sky-500/20 focus:text-white data-[highlighted]:bg-sky-500/20 data-[highlighted]:text-white"
                        >
                          Applied
                        </SelectItem>
                        <SelectItem
                          value="interview"
                          className="text-white/90 focus:bg-amber-500/20 focus:text-white data-[highlighted]:bg-amber-500/20 data-[highlighted]:text-white"
                        >
                          Interview
                        </SelectItem>
                        <SelectItem
                          value="offer"
                          className="text-white/90 focus:bg-emerald-500/20 focus:text-white data-[highlighted]:bg-emerald-500/20 data-[highlighted]:text-white"
                        >
                          Offer
                        </SelectItem>
                        <SelectItem
                          value="rejected"
                          className="text-white/90 focus:bg-rose-500/20 focus:text-white data-[highlighted]:bg-rose-500/20 data-[highlighted]:text-white"
                        >
                          Rejected
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </motion.div>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelected(null)}
                    className={[
                      "px-4 py-3 rounded-xl text-sm font-semibold",
                      "bg-white/[0.06] border border-white/10 text-white/85",
                      "hover:bg-white/[0.10] hover:border-violet-400/25",
                      "transition-all",
                    ].join(" ")}
                  >
                    Done
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
