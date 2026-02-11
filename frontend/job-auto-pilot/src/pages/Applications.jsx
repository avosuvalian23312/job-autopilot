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

  // ✅ get SWA userId from /.auth/me (clientPrincipal)
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
const toTitle = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());

const normalizeEmploymentType = (t) => {
  const raw = String(t ?? "").trim();
  if (!raw) return null;

  const key = raw.toLowerCase().replace(/[_-]+/g, " ");

  const map = {
    "full time": "Full-time",
    "part time": "Part-time",
    contract: "Contract",
    contractor: "Contract",
    temporary: "Temporary",
    intern: "Internship",
    internship: "Internship",
    seasonal: "Seasonal",
  };

  return map[key] || toTitle(key);
};


const normalizeWorkModel = (v) => {
  if (v == null) return null;
  if (typeof v === "boolean") return v ? "Remote" : null;

  const t = String(v).trim().toLowerCase().replace(/[_-]+/g, " ");
  if (!t) return null;

  const map = {
    "remote": "Remote",
    "hybrid": "Hybrid",
    "on site": "On-site",
    "onsite": "On-site",
    "in person": "In-person",
    "in-person": "In-person",
  };
  return map[t] || toTitle(t);
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

  // ✅ allow nested pay object
  const payObj = job?.pay && typeof job.pay === "object" ? job.pay : null;

  // ✅ fix blank status + map created -> generated
  const rawStatus =
    job?.status ?? job?.applicationStatus ?? job?.application_status ?? null;

  let status = String(rawStatus ?? "").trim().toLowerCase();
 if (status === "completed" || status === "complete" || status === "done") {
  status = "generated";
}

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
   employmentType: normalizeEmploymentType(
  job?.employmentType ??
    job?.employment_type ??
    job?.jobType ??
    job?.job_type ??
    job?.employment ??
    job?.type ??
    job?.schedule ??
    null
),

workModel: normalizeWorkModel(
  job?.workModel ??
    job?.work_model ??
    job?.workplaceType ??
    job?.workplace_type ??
    job?.locationType ??
    job?.location_type ??
    job?.remote ??
    null
),


    experienceLevel: job?.experienceLevel ?? job?.experience_level ?? null,
    complianceTags: Array.isArray(job?.complianceTags)
      ? job.complianceTags
      : Array.isArray(job?.compliance_tags)
      ? job.compliance_tags
      : [],

    keywords: Array.isArray(job?.keywords) ? job.keywords : [],

    // ✅ pay (supports flat OR nested pay object)
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

    payCurrency: job?.payCurrency ?? job?.pay_currency ?? payObj?.currency ?? "USD",
    payPeriod: job?.payPeriod ?? job?.pay_period ?? payObj?.period ?? null,

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

    

    const data = await apiFetch("/api/jobs", { method: "GET" });

    const list = Array.isArray(data) ? data : data?.jobs || data?.items || [];
    const normalized = (Array.isArray(list) ? list : [])
      .map(normalizeJob)
      .filter((x) => x?.id != null);

    setApplications(normalized);
  } catch (e) {
    console.error(e);

    if (e?.status === 401) {
      toast.error("Not authorized — please sign in again.");
      setApplications([]);
      return;
    }

    toast.error(e?.message || "Failed to load applications.");
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
    const v = String(s || "").toLowerCase();
    if (v === "generated") return "Generated";
    if (v === "applied") return "Applied";
    if (v === "interview") return "Interview";
    if (v === "offer") return "Offer";
    if (v === "rejected") return "Rejected";
    return v ? v[0].toUpperCase() + v.slice(1) : "Generated";
  };

  const statusPill = (s) => {
    const v = String(s || "").toLowerCase();
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

  const fmtMoney = (n) =>
    typeof n === "number"
      ? n.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : null;

  const renderPayPrimary = (job) => {
    const cur = job?.payCurrency || "USD";
    const symbol = cur === "USD" ? "$" : `${cur} `;
    const periodMap = {
      hour: "/hr",
      year: "/yr",
      month: "/mo",
      week: "/wk",
      day: "/day",
    };
    const suffix = job?.payPeriod ? periodMap[job.payPeriod] || "" : "";

    const min = fmtMoney(job?.payMin);
    const max = fmtMoney(job?.payMax);

    if (min && max) {
      return min === max
        ? `${symbol}${min}${suffix}`
        : `${symbol}${min} – ${symbol}${max}${suffix}`;
    }
    if (job?.payText) return job.payText;
    return null;
  };

  const renderAnnual = (job) => {
  const period = String(job?.payPeriod || "").toLowerCase();

  // If already yearly AND min/max exist, don't show an "Est." annual pill
  const hasPrimaryRange = typeof job?.payMin === "number" || typeof job?.payMax === "number";
  if (period === "year" && hasPrimaryRange) return null;

  const min = fmtMoney(job?.payAnnualizedMin);
  const max = fmtMoney(job?.payAnnualizedMax);
  if (min && max) return `Est. $${min} – $${max} /yr`;
  if (min) return `Est. $${min} /yr`;
  if (max) return `Est. $${max} /yr`;
  return null;
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
  const pillGood =
    "px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/14 text-emerald-100 border border-emerald-400/25";
  const pillWarn =
    "px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-500/14 text-amber-100 border border-amber-400/25";

  return (
  <div className={`min-h-screen ${pageBg} text-white`}>
    <AppNav currentPage="Applications" />

    <motion.div
      initial={{ opacity: 0, x: 18 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -18 }}
      transition={{ duration: 0.28 }}
      className="max-w-7xl mx-auto px-4 sm:px-6 py-10"
    >
      <div className="mb-10 text-center">
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white mb-3">
          Applications
        </h1>
        <div className="flex items-center justify-center gap-2">
          <div className="w-9 h-9 rounded-full bg-violet-500/15 border border-violet-400/25 ring-1 ring-white/10 flex items-center justify-center shadow-[0_10px_35px_rgba(0,0,0,0.55)]">
            <span className="text-sm font-bold text-violet-100">
              {applications.length}
            </span>
          </div>
          <span className="text-white/45 text-sm">
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
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/35" />
          <Input
            placeholder="Search by role or company…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={[
              "pl-12 py-6 rounded-xl text-base",
              "bg-black/35 border-white/10",
              "!text-white !placeholder:text-white/35 caret-white",
              "selection:bg-violet-500/35 selection:text-white",
              "shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
              "hover:bg-white/[0.06] hover:border-violet-400/35 hover:shadow-lg hover:shadow-violet-500/10",
              "focus-visible:ring-2 focus-visible:ring-violet-400/35 focus-visible:ring-offset-0",
              "transition-all duration-200",
            ].join(" ")}
          />
        </motion.div>

        <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger
              className={[
                "w-48 rounded-xl py-6 text-base",
                "bg-black/35 border-white/10",
                "text-white/90",
                "shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
                "hover:bg-white/[0.06] hover:border-violet-400/35 hover:shadow-lg hover:shadow-violet-500/10",
                "focus-visible:ring-2 focus-visible:ring-violet-400/35 focus-visible:ring-offset-0",
                "transition-all duration-200",
              ].join(" ")}
            >
              <SelectValue placeholder="Status" />
            </SelectTrigger>

            <SelectContent
              position="popper"
              sideOffset={10}
              avoidCollisions
              className="z-[9999] bg-black/95 backdrop-blur-xl border border-white/12 ring-1 ring-white/10 text-white shadow-2xl rounded-xl p-1 max-h-[320px] overflow-auto"
            >
              <SelectItem
                value="all"
                className="rounded-lg cursor-pointer text-white/90 focus:bg-violet-500/20 focus:text-white data-[highlighted]:bg-violet-500/20 data-[highlighted]:text-white"
              >
                All Status
              </SelectItem>
              <SelectItem
                value="generated"
                className="rounded-lg cursor-pointer text-white/90 focus:bg-violet-500/20 focus:text-white data-[highlighted]:bg-violet-500/20 data-[highlighted]:text-white"
              >
                Generated
              </SelectItem>
              <SelectItem
                value="applied"
                className="rounded-lg cursor-pointer text-white/90 focus:bg-sky-500/20 focus:text-white data-[highlighted]:bg-sky-500/20 data-[highlighted]:text-white"
              >
                Applied
              </SelectItem>
              <SelectItem
                value="interview"
                className="rounded-lg cursor-pointer text-white/90 focus:bg-amber-500/20 focus:text-white data-[highlighted]:bg-amber-500/20 data-[highlighted]:text-white"
              >
                Interview
              </SelectItem>
              <SelectItem
                value="offer"
                className="rounded-lg cursor-pointer text-white/90 focus:bg-emerald-500/20 focus:text-white data-[highlighted]:bg-emerald-500/20 data-[highlighted]:text-white"
              >
                Offer
              </SelectItem>
              <SelectItem
                value="rejected"
                className="rounded-lg cursor-pointer text-white/90 focus:bg-rose-500/20 focus:text-white data-[highlighted]:bg-rose-500/20 data-[highlighted]:text-white"
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
              <p className="text-white/45 text-lg">No applications found</p>
            </div>
          ) : (
            filtered.map((app, index) => {
              const dateStr = formatDate(app.created_date);

              // ✅ ONE compensation pill only (prevents double money)
              const payPrimaryRaw = renderPayPrimary(app);
              const payAnnual = renderAnnual(app);
              const payPillText = payPrimaryRaw || payAnnual || "Pay not listed";
              const hasPay = Boolean(payPrimaryRaw || payAnnual);

              // ✅ Only show Full-time / Part-time (normalized)
              const jobType = (() => {
                const s = String(app?.employmentType || "").trim().toLowerCase();
                if (!s) return null;
                if (s.includes("full")) return "Full-time";
                if (s.includes("part")) return "Part-time";
                return String(app.employmentType || "").trim() || null;
              })();

              return (
                <motion.div
                  key={app.id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.02, duration: 0.22 }}
                  className={[
                    "px-6 py-5 bg-black/10",
                    "hover:bg-white/[0.035]",
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

                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/60">
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

                      {/* Pills row (ONLY: job type + pay) */}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {jobType && (
                          <span
                            className={`${pill} inline-flex items-center gap-2`}
                          >
                            <Briefcase className="w-3.5 h-3.5 text-white/60" />
                            {jobType}
                          </span>
                        )}

                        <span
                          className={`${
                            hasPay ? pillGood : pill
                          } inline-flex items-center gap-2`}
                        >
                          <DollarSign className="w-3.5 h-3.5" />
                          {payPillText}
                        </span>
                      </div>
                    </button>

                    {/* Right: Status dropdown (ONLY place status appears) */}
                    <div className="shrink-0">
                      <motion.div
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                      >
                        <Select
                          value={
                            app?.status
                              ? String(app.status).toLowerCase()
                              : "generated"
                          }
                          onValueChange={(v) => updateStatus(app.id, v)}
                        >
                          <SelectTrigger
                            className={[
                              "w-40 rounded-xl py-5 text-sm font-semibold",
                              "bg-black/45 border-white/10 text-white",
                              "shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
                              "hover:bg-white/[0.06] hover:border-violet-400/35",
                              "focus-visible:ring-2 focus-visible:ring-violet-400/35 focus-visible:ring-offset-0",
                              "transition-all",
                              statusPill(app.status),
                            ].join(" ")}
                          >
                            <SelectValue />
                          </SelectTrigger>

                          <SelectContent
                            position="popper"
                            sideOffset={10}
                            avoidCollisions
                            className="z-[9999] bg-black/95 backdrop-blur-xl border border-white/12 ring-1 ring-white/10 text-white shadow-2xl rounded-xl p-1 max-h-[320px] overflow-auto"
                          >
                            <SelectItem
                              value="generated"
                              className="rounded-lg cursor-pointer text-white/90 focus:bg-violet-500/20 focus:text-white data-[highlighted]:bg-violet-500/20 data-[highlighted]:text-white"
                            >
                              Generated
                            </SelectItem>
                            <SelectItem
                              value="applied"
                              className="rounded-lg cursor-pointer text-white/90 focus:bg-sky-500/20 focus:text-white data-[highlighted]:bg-sky-500/20 data-[highlighted]:text-white"
                            >
                              Applied
                            </SelectItem>
                            <SelectItem
                              value="interview"
                              className="rounded-lg cursor-pointer text-white/90 focus:bg-amber-500/20 focus:text-white data-[highlighted]:bg-amber-500/20 data-[highlighted]:text-white"
                            >
                              Interview
                            </SelectItem>
                            <SelectItem
                              value="offer"
                              className="rounded-lg cursor-pointer text-white/90 focus:bg-emerald-500/20 focus:text-white data-[highlighted]:bg-emerald-500/20 data-[highlighted]:text-white"
                            >
                              Offer
                            </SelectItem>
                            <SelectItem
                              value="rejected"
                              className="rounded-lg cursor-pointer text-white/90 focus:bg-rose-500/20 focus:text-white data-[highlighted]:bg-rose-500/20 data-[highlighted]:text-white"
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
      {selected &&
        (() => {
          // ✅ ONE compensation pill only in modal too
          const modalPayPrimary = renderPayPrimary(selected);
          const modalPayAnnual = renderAnnual(selected);
          const modalPayText = modalPayPrimary || modalPayAnnual || "Pay not listed";
          const modalHasPay = Boolean(modalPayPrimary || modalPayAnnual);

          // ✅ Only show Full-time / Part-time (normalized)
          const modalJobType = (() => {
            const s = String(selected?.employmentType || "").trim().toLowerCase();
            if (!s) return null;
            if (s.includes("full")) return "Full-time";
            if (s.includes("part")) return "Part-time";
            return String(selected.employmentType || "").trim() || null;
          })();

          return (
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

                  {/* Pills row (ONLY: job type + pay) */}
                  <div className="mt-5 flex flex-wrap gap-2">
                    <span
                      className={`${
                        modalHasPay ? pillGood : pill
                      } inline-flex items-center gap-2`}
                    >
                      <DollarSign className="w-3.5 h-3.5" />
                      {modalPayText}
                    </span>

                    {modalJobType && (
                      <span className={`${pill} inline-flex items-center gap-2`}>
                        <Briefcase className="w-3.5 h-3.5 text-white/60" />
                        {modalJobType}
                      </span>
                    )}
                  </div>

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
                        value={selected?.status ? String(selected.status).toLowerCase() : "generated"}
                        onValueChange={(v) => updateStatus(selected.id, v)}
                      >
                        <SelectTrigger
                          className={[
                            "w-48 rounded-xl py-5 text-sm font-semibold",
                            "bg-black/45 border-white/10 text-white",
                            "shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
                            "hover:bg-white/[0.06] hover:border-violet-400/35 transition-all",
                            "focus-visible:ring-2 focus-visible:ring-violet-400/35 focus-visible:ring-offset-0",
                            statusPill(selected.status),
                          ].join(" ")}
                        >
                          <SelectValue />
                        </SelectTrigger>

                        <SelectContent
                          position="popper"
                          sideOffset={10}
                          avoidCollisions
                          className="z-[9999] bg-black/95 backdrop-blur-xl border border-white/12 ring-1 ring-white/10 text-white shadow-2xl rounded-2xl p-1 max-h-[340px] overflow-auto"
                        >
                          <SelectItem
                            value="generated"
                            className="relative flex w-full cursor-pointer select-none items-center justify-between rounded-xl px-3 py-2 text-sm outline-none transition-colors text-white/90 data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-violet-500/25 data-[highlighted]:text-white data-[state=checked]:bg-violet-500/30"
                          >
                            <span className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-violet-300/80" />
                              Generated
                            </span>
                          </SelectItem>

                          <SelectItem
                            value="applied"
                            className="relative flex w-full cursor-pointer select-none items-center justify-between rounded-xl px-3 py-2 text-sm outline-none transition-colors text-white/90 data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-sky-500/25 data-[highlighted]:text-white data-[state=checked]:bg-sky-500/30"
                          >
                            <span className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-sky-300/80" />
                              Applied
                            </span>
                          </SelectItem>

                          <SelectItem
                            value="interview"
                            className="relative flex w-full cursor-pointer select-none items-center justify-between rounded-xl px-3 py-2 text-sm outline-none transition-colors text-white/90 data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-amber-500/25 data-[highlighted]:text-white data-[state=checked]:bg-amber-500/30"
                          >
                            <span className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-amber-300/80" />
                              Interview
                            </span>
                          </SelectItem>

                          <SelectItem
                            value="offer"
                            className="relative flex w-full cursor-pointer select-none items-center justify-between rounded-xl px-3 py-2 text-sm outline-none transition-colors text-white/90 data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-emerald-500/25 data-[highlighted]:text-white data-[state=checked]:bg-emerald-500/30"
                          >
                            <span className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-emerald-300/80" />
                              Offer
                            </span>
                          </SelectItem>

                          <SelectItem
                            value="rejected"
                            className="relative flex w-full cursor-pointer select-none items-center justify-between rounded-xl px-3 py-2 text-sm outline-none transition-colors text-white/90 data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-rose-500/25 data-[highlighted]:text-white data-[state=checked]:bg-rose-500/30"
                          >
                            <span className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-rose-300/80" />
                              Rejected
                            </span>
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
          );
        })()}
    </AnimatePresence>
  </div>
);

