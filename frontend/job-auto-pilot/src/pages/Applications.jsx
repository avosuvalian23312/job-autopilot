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

  const redirectToSwaLogin = (provider = "google") => {
    const returnTo =
      window.location.pathname +
      window.location.search +
      window.location.hash;
    const url = `/.auth/login/${provider}?post_login_redirect_uri=${encodeURIComponent(
      returnTo
    )}`;
    window.location.assign(url);
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

    const status =
      job?.status ??
      job?.applicationStatus ??
      job?.application_status ??
      "generated";

    return {
      ...job,
      id,
      job_title: jobTitle,
      company,
      created_date: created,
      status: String(status || "generated").toLowerCase(),
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

      // pay
      payText: job?.payText ?? job?.pay_text ?? null,
      payMin:
        typeof job?.payMin === "number"
          ? job.payMin
          : typeof job?.pay_min === "number"
          ? job.pay_min
          : null,
      payMax:
        typeof job?.payMax === "number"
          ? job.payMax
          : typeof job?.pay_max === "number"
          ? job.pay_max
          : null,
      payCurrency: job?.payCurrency ?? job?.pay_currency ?? "USD",
      payPeriod: job?.payPeriod ?? job?.pay_period ?? null,
      payConfidence:
        typeof job?.payConfidence === "number"
          ? job.payConfidence
          : typeof job?.pay_confidence === "number"
          ? job.pay_confidence
          : null,
      payAnnualizedMin:
        typeof job?.payAnnualizedMin === "number"
          ? job.payAnnualizedMin
          : typeof job?.pay_annualized_min === "number"
          ? job.pay_annualized_min
          : null,
      payAnnualizedMax:
        typeof job?.payAnnualizedMax === "number"
          ? job.payAnnualizedMax
          : typeof job?.pay_annualized_max === "number"
          ? job.pay_annualized_max
          : null,
      payPercentile:
        typeof job?.payPercentile === "number"
          ? job.payPercentile
          : typeof job?.pay_percentile === "number"
          ? job.pay_percentile
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
        redirectToSwaLogin("google"); // change to "aad" if you use Microsoft login
        return;
      }

      const data = await apiFetch("/api/jobs", { method: "GET" });
      const list = Array.isArray(data) ? data : data?.jobs || data?.items || [];
      const normalized = list.map(normalizeJob).filter((x) => x?.id != null);
      setApplications(normalized);
    } catch (e) {
      console.error(e);

      // If your API returns 401, also send them through SWA login
      if (e?.status === 401) {
        toast.error("Not authorized — please sign in again.");
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

  // ---------------------------
  // Status meta + UI helpers
  // ---------------------------
  const STATUS_META = {
    all: {
      label: "All Status",
      dot: "bg-white/45",
      itemHover:
        "hover:bg-white/[0.06] hover:border-white/18 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.08)]",
      itemFocus:
        "data-[highlighted]:bg-white/[0.08] data-[highlighted]:border-white/20 data-[highlighted]:shadow-[0_0_0_1px_rgba(255,255,255,0.10)]",
    },
    generated: {
      label: "Generated",
      dot: "bg-violet-400",
      itemHover:
        "hover:bg-violet-500/12 hover:border-violet-300/25 hover:shadow-[0_0_0_1px_rgba(167,139,250,0.20)]",
      itemFocus:
        "data-[highlighted]:bg-violet-500/20 data-[highlighted]:border-violet-300/30 data-[highlighted]:shadow-[0_0_0_1px_rgba(167,139,250,0.22)]",
    },
    applied: {
      label: "Applied",
      dot: "bg-sky-400",
      itemHover:
        "hover:bg-sky-500/12 hover:border-sky-300/25 hover:shadow-[0_0_0_1px_rgba(125,211,252,0.18)]",
      itemFocus:
        "data-[highlighted]:bg-sky-500/20 data-[highlighted]:border-sky-300/30 data-[highlighted]:shadow-[0_0_0_1px_rgba(125,211,252,0.20)]",
    },
    interview: {
      label: "Interview",
      dot: "bg-amber-400",
      itemHover:
        "hover:bg-amber-500/12 hover:border-amber-300/25 hover:shadow-[0_0_0_1px_rgba(252,211,77,0.18)]",
      itemFocus:
        "data-[highlighted]:bg-amber-500/20 data-[highlighted]:border-amber-300/30 data-[highlighted]:shadow-[0_0_0_1px_rgba(252,211,77,0.20)]",
    },
    offer: {
      label: "Offer",
      dot: "bg-emerald-400",
      itemHover:
        "hover:bg-emerald-500/12 hover:border-emerald-300/25 hover:shadow-[0_0_0_1px_rgba(110,231,183,0.18)]",
      itemFocus:
        "data-[highlighted]:bg-emerald-500/20 data-[highlighted]:border-emerald-300/30 data-[highlighted]:shadow-[0_0_0_1px_rgba(110,231,183,0.20)]",
    },
    rejected: {
      label: "Rejected",
      dot: "bg-rose-400",
      itemHover:
        "hover:bg-rose-500/12 hover:border-rose-300/25 hover:shadow-[0_0_0_1px_rgba(251,113,133,0.18)]",
      itemFocus:
        "data-[highlighted]:bg-rose-500/20 data-[highlighted]:border-rose-300/30 data-[highlighted]:shadow-[0_0_0_1px_rgba(251,113,133,0.20)]",
    },
  };

  const statusLabel = (s) => {
    const v = String(s || "").toLowerCase();
    if (STATUS_META[v]?.label) return STATUS_META[v].label;
    return v ? v[0].toUpperCase() + v.slice(1) : "Generated";
  };

  const statusPill = (s) => {
    const v = String(s || "").toLowerCase();
    if (v === "interview")
      return [
        "bg-amber-500/14 text-amber-100 border border-amber-300/25",
        "shadow-[0_0_0_1px_rgba(252,211,77,0.12),0_14px_45px_rgba(0,0,0,0.45)]",
      ].join(" ");
    if (v === "applied")
      return [
        "bg-sky-500/14 text-sky-100 border border-sky-300/25",
        "shadow-[0_0_0_1px_rgba(125,211,252,0.12),0_14px_45px_rgba(0,0,0,0.45)]",
      ].join(" ");
    if (v === "offer")
      return [
        "bg-emerald-500/14 text-emerald-100 border border-emerald-300/25",
        "shadow-[0_0_0_1px_rgba(110,231,183,0.12),0_14px_45px_rgba(0,0,0,0.45)]",
      ].join(" ");
    if (v === "rejected")
      return [
        "bg-rose-500/14 text-rose-100 border border-rose-300/25",
        "shadow-[0_0_0_1px_rgba(251,113,133,0.12),0_14px_45px_rgba(0,0,0,0.45)]",
      ].join(" ");
    return [
      "bg-violet-500/15 text-violet-100 border border-violet-300/25",
      "shadow-[0_0_0_1px_rgba(167,139,250,0.12),0_14px_45px_rgba(0,0,0,0.45)]",
    ].join(" ");
  };

  const dropdownContentClass = [
    "z-50",
    "rounded-2xl p-2",
    "bg-black/55 backdrop-blur-xl",
    "border border-white/12",
    "ring-1 ring-violet-400/25",
    "shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_22px_70px_rgba(0,0,0,0.80)]",
  ].join(" ");

  const dropdownItemBase = [
    "relative",
    "flex cursor-default select-none items-center gap-2",
    "rounded-xl px-3 py-2 text-sm",
    "outline-none",
    "border border-transparent",
    "transition-all duration-150",
    "hover:scale-[1.03]",
  ].join(" ");

  const StatusSelectItem = ({ value }) => {
    const meta = STATUS_META[value] || STATUS_META.generated;
    return (
      <SelectItem
        value={value}
        className={[dropdownItemBase, meta.itemHover, meta.itemFocus].join(" ")}
      >
        <span
          className={[
            "inline-block w-2.5 h-2.5 rounded-full",
            meta.dot,
            "shadow-[0_0_0_1px_rgba(255,255,255,0.14)]",
          ].join(" ")}
        />
        <span className="text-white/90">{meta.label}</span>
      </SelectItem>
    );
  };

  const StatusTriggerInner = ({ value, showTag = true }) => {
    const v = String(value || "").toLowerCase();
    return (
      <span className="inline-flex items-center gap-2 min-w-0">
        {showTag ? (
          <Tag className="w-3.5 h-3.5 text-white/75 shrink-0" />
        ) : null}
        <span className="truncate">{statusLabel(v)}</span>
      </span>
    );
  };

  // ---------------------------
  // Pay formatting (never blank pill)
  // ---------------------------
  const fmtMoney = (n) =>
    typeof n === "number"
      ? n.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : null;

  const periodSuffix = (p) => {
    const v = String(p || "").trim().toLowerCase();
    if (!v) return "";
    // prioritize the two requested (hour/year) but keep safe extras
    if (v === "hour" || v === "hr" || v === "hourly") return "/hr";
    if (v === "year" || v === "yr" || v === "yearly" || v === "annual")
      return "/yr";
    if (v === "month" || v === "mo" || v === "monthly") return "/mo";
    if (v === "week" || v === "wk" || v === "weekly") return "/wk";
    if (v === "day" || v === "daily") return "/day";
    return "";
  };

  const renderPayPillText = (job) => {
    // 1️⃣ payMin/payMax + payPeriod
    const cur = String(job?.payCurrency || "USD").toUpperCase();
    const symbol = cur === "USD" ? "$" : `${cur} `;
    const suffix = periodSuffix(job?.payPeriod);

    const minRaw = typeof job?.payMin === "number" ? job.payMin : null;
    const maxRaw = typeof job?.payMax === "number" ? job.payMax : null;
    const min = fmtMoney(minRaw);
    const max = fmtMoney(maxRaw);

    if (suffix && (min || max)) {
      const a = min || max;
      const b = max || min;
      if (a && b && a !== b) return `${symbol}${a} – ${symbol}${b}${suffix}`;
      return `${symbol}${a}${suffix}`;
    }

    // 2️⃣ payAnnualizedMin/payAnnualizedMax
    const aminRaw =
      typeof job?.payAnnualizedMin === "number" ? job.payAnnualizedMin : null;
    const amaxRaw =
      typeof job?.payAnnualizedMax === "number" ? job.payAnnualizedMax : null;
    const amin = fmtMoney(aminRaw);
    const amax = fmtMoney(amaxRaw);

    if (amin || amax) {
      const a = amin || amax;
      const b = amax || amin;
      if (a && b && a !== b) return `Est. ${symbol}${a} – ${symbol}${b} /yr`;
      return `Est. ${symbol}${a} /yr`;
    }

    // 3️⃣ payText
    const txt =
      typeof job?.payText === "string" ? job.payText.trim() : "";
    if (txt) return txt;

    // 4️⃣ fallback (must render for newly generated packets)
    return "Pay: Not provided";
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
    const nextStatus = String(status || "").toLowerCase();

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
  const pillWarn =
    "px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-500/14 text-amber-100 border border-amber-400/25";

  // ✅ Pay pill (emerald tint, always renders)
  const pillPay =
    "px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/14 text-emerald-100 border border-emerald-400/25 shadow-[0_0_0_1px_rgba(110,231,183,0.10),0_14px_45px_rgba(0,0,0,0.45)]";

  // ✅ Status pill + trigger unification
  const statusPillBase =
    "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md";
  const statusTriggerBase =
    "w-44 h-11 rounded-full px-3 text-xs font-semibold backdrop-blur-md transition-all duration-200 hover:brightness-110 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_18px_55px_rgba(0,0,0,0.65)]";

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
              <SelectTrigger
                className={[
                  "w-52 h-12 rounded-full px-4",
                  "bg-black/35 border border-white/12 text-white/85",
                  "backdrop-blur-md",
                  "hover:bg-white/[0.05] hover:border-violet-300/35",
                  "shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_14px_45px_rgba(0,0,0,0.55)]",
                  "transition-all duration-200",
                ].join(" ")}
              >
                <span className="inline-flex items-center gap-2 min-w-0">
                  <Tag className="w-4 h-4 text-white/70 shrink-0" />
                  <span className="truncate">
                    {STATUS_META[statusFilter]?.label || "All Status"}
                  </span>
                </span>
                <SelectValue className="hidden" placeholder="Status" />
              </SelectTrigger>

              <SelectContent className={dropdownContentClass}>
                <StatusSelectItem value="all" />
                <StatusSelectItem value="generated" />
                <StatusSelectItem value="applied" />
                <StatusSelectItem value="interview" />
                <StatusSelectItem value="offer" />
                <StatusSelectItem value="rejected" />
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
                const payPillText = renderPayPillText(app);
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
                          {/* ✅ Row status pill matches trigger styling */}
                          <span
                            className={[
                              statusPillBase,
                              statusPill(app.status),
                            ].join(" ")}
                          >
                            <Tag className="w-3.5 h-3.5 text-white/80" />
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

                          {/* ✅ Pay pill (always renders; never blank/undefined) */}
                          <span
                            className={`${pillPay} inline-flex items-center gap-2`}
                          >
                            <DollarSign className="w-3.5 h-3.5" />
                            {payPillText}
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
                            value={app.status}
                            onValueChange={(v) => updateStatus(app.id, v)}
                          >
                            <SelectTrigger
                              className={[
                                statusTriggerBase,
                                statusPill(app.status),
                              ].join(" ")}
                            >
                              <StatusTriggerInner value={app.status} />
                            </SelectTrigger>

                            <SelectContent className={dropdownContentClass}>
                              <StatusSelectItem value="generated" />
                              <StatusSelectItem value="applied" />
                              <StatusSelectItem value="interview" />
                              <StatusSelectItem value="offer" />
                              <StatusSelectItem value="rejected" />
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
                  {/* ✅ Modal status pill matches trigger styling */}
                  <span
                    className={[statusPillBase, statusPill(selected.status)].join(
                      " "
                    )}
                  >
                    <Tag className="w-3.5 h-3.5 text-white/80" />
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

                  {/* ✅ Modal pay pill (always renders; never blank/undefined) */}
                  <span className={`${pillPay} inline-flex items-center gap-2`}>
                    <DollarSign className="w-3.5 h-3.5" />
                    {renderPayPillText(selected)}
                  </span>

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
                      value={selected.status}
                      onValueChange={(v) => updateStatus(selected.id, v)}
                    >
                      <SelectTrigger
                        className={[
                          "w-52 h-12 rounded-full px-3 text-xs font-semibold backdrop-blur-md transition-all duration-200 hover:brightness-110 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_18px_55px_rgba(0,0,0,0.65)]",
                          statusPill(selected.status),
                        ].join(" ")}
                      >
                        <StatusTriggerInner value={selected.status} />
                      </SelectTrigger>
                      <SelectContent className={dropdownContentClass}>
                        <StatusSelectItem value="generated" />
                        <StatusSelectItem value="applied" />
                        <StatusSelectItem value="interview" />
                        <StatusSelectItem value="offer" />
                        <StatusSelectItem value="rejected" />
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
