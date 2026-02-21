import React, { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  DollarSign,
  ExternalLink,
  Globe,
  MapPin,
  MessageSquareText,
  Search,
  Trophy,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import AppNav from "@/components/app/AppNav";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_ORDER = ["generated", "applied", "interview", "offer", "rejected"];

const STATUS_META = {
  generated: {
    label: "Generated",
    summaryLabel: "Generated",
    icon: Briefcase,
    summaryBox: "border-white/12 bg-white/[0.03]",
    iconWrap: "border-white/15 bg-white/[0.04] text-white/70",
    chipActive: "border-slate-300/30 bg-slate-500/20 text-slate-100",
    cardBar: "bg-slate-300/70",
    selectTone:
      "border-slate-400/35 bg-slate-500/15 text-slate-100 hover:bg-slate-500/25",
    dotStrong: "bg-slate-300",
    dotSoft: "bg-slate-300/55",
  },
  applied: {
    label: "Applied",
    summaryLabel: "Applied",
    icon: CheckCircle2,
    summaryBox: "border-cyan-400/30 bg-cyan-500/[0.08]",
    iconWrap: "border-cyan-300/25 bg-cyan-500/20 text-cyan-200",
    chipActive: "border-cyan-300/30 bg-cyan-500/25 text-cyan-100",
    cardBar: "bg-cyan-300",
    selectTone:
      "border-cyan-400/40 bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/28",
    dotStrong: "bg-cyan-300",
    dotSoft: "bg-cyan-300/60",
  },
  interview: {
    label: "Interview",
    summaryLabel: "Interviews",
    icon: MessageSquareText,
    summaryBox: "border-amber-400/30 bg-amber-500/[0.08]",
    iconWrap: "border-amber-300/25 bg-amber-500/20 text-amber-200",
    chipActive: "border-amber-300/30 bg-amber-500/25 text-amber-100",
    cardBar: "bg-amber-300",
    selectTone:
      "border-amber-400/40 bg-amber-500/20 text-amber-100 hover:bg-amber-500/28",
    dotStrong: "bg-amber-300",
    dotSoft: "bg-amber-300/60",
  },
  offer: {
    label: "Offer",
    summaryLabel: "Offers",
    icon: Trophy,
    summaryBox: "border-emerald-400/30 bg-emerald-500/[0.08]",
    iconWrap: "border-emerald-300/25 bg-emerald-500/20 text-emerald-200",
    chipActive: "border-emerald-300/30 bg-emerald-500/25 text-emerald-100",
    cardBar: "bg-emerald-300",
    selectTone:
      "border-emerald-400/40 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/28",
    dotStrong: "bg-emerald-300",
    dotSoft: "bg-emerald-300/60",
  },
  rejected: {
    label: "Rejected",
    summaryLabel: "Rejected",
    icon: XCircle,
    summaryBox: "border-rose-500/30 bg-rose-500/[0.08]",
    iconWrap: "border-rose-400/25 bg-rose-500/20 text-rose-200",
    chipActive: "border-rose-400/30 bg-rose-500/25 text-rose-100",
    cardBar: "bg-rose-300",
    selectTone:
      "border-rose-500/40 bg-rose-500/20 text-rose-100 hover:bg-rose-500/28",
    dotStrong: "bg-rose-300",
    dotSoft: "bg-rose-300/60",
  },
};

function normalizeStatus(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "generated";
  if (raw === "completed" || raw === "complete" || raw === "done") {
    return "generated";
  }
  if (STATUS_ORDER.includes(raw)) return raw;
  return "generated";
}

function normalizeWebsite(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const hasScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(raw);
  const candidate = raw.startsWith("//")
    ? `https:${raw}`
    : hasScheme
    ? raw
    : `https://${raw}`;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function formatWebsiteLabel(website) {
  if (!website) return null;
  try {
    const parsed = new URL(website);
    const path = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "";
    return `${parsed.hostname}${path}`;
  } catch {
    return website;
  }
}

function normalizeJob(job) {
  const payObj = job?.pay && typeof job.pay === "object" ? job.pay : null;
  const website = normalizeWebsite(
    job?.website ?? job?.jobWebsite ?? job?.url ?? job?.link ?? null
  );

  return {
    ...job,
    id: job?.id ?? job?.jobId ?? job?._id ?? job?.job_id,
    job_title:
      job?.jobTitle ?? job?.job_title ?? job?.title ?? job?.position ?? "Position",
    company: job?.company ?? job?.companyName ?? job?.company_name ?? "Company",
    created_date:
      job?.createdAt ??
      job?.created_at ??
      job?.created_date ??
      job?.createdDate ??
      null,
    status: normalizeStatus(
      job?.status ?? job?.applicationStatus ?? job?.application_status ?? null
    ),
    website,
    websiteLabel: formatWebsiteLabel(website),
    location: job?.location ?? null,
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
    payPeriod: String(job?.payPeriod ?? job?.pay_period ?? payObj?.period ?? "")
      .trim()
      .toLowerCase(),
  };
}

function formatDate(value) {
  try {
    if (!value) return null;
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return null;
    return format(dt, "MMM d, yyyy");
  } catch {
    return null;
  }
}

function renderPay(job) {
  const cur = job?.payCurrency || "USD";
  const symbol = cur === "USD" ? "$" : `${cur} `;
  const suffixMap = {
    hour: "/hr",
    year: "/yr",
    month: "/mo",
    week: "/wk",
    day: "/day",
  };
  const suffix = suffixMap[job?.payPeriod] || "";

  const formatNum = (n) =>
    typeof n === "number"
      ? n.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : null;

  const min = formatNum(job?.payMin);
  const max = formatNum(job?.payMax);

  if (min && max) {
    return min === max
      ? `${symbol}${min}${suffix}`
      : `${symbol}${min} - ${symbol}${max}${suffix}`;
  }
  if (min) return `${symbol}${min}${suffix}`;
  if (max) return `${symbol}${max}${suffix}`;
  if (job?.payText) return String(job.payText);
  return "Pay not listed";
}

async function readJsonSafe(res) {
  const text = await res.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function apiFetch(path, options = {}) {
  const { body, headers, ...rest } = options;
  const isJsonObject =
    body != null && typeof body === "object" && !(body instanceof FormData);

  const res = await fetch(path, {
    ...rest,
    credentials: "include",
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
}

export default function Applications() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [applications, setApplications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadJobs = async () => {
    setIsLoading(true);
    try {
      const data = await apiFetch("/api/jobs", { method: "GET" });
      const list = Array.isArray(data) ? data : data?.jobs || data?.items || [];
      const normalized = (Array.isArray(list) ? list : [])
        .map(normalizeJob)
        .filter((x) => x?.id != null);
      setApplications(normalized);
    } catch (e) {
      if (e?.status === 401) {
        toast.error("Not authenticated. Please sign in again.");
      } else {
        toast.error(e?.message || "Failed to load applications.");
      }
      setApplications([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
  }, []);

  const counts = useMemo(() => {
    const next = {
      generated: 0,
      applied: 0,
      interview: 0,
      offer: 0,
      rejected: 0,
      total: applications.length,
    };
    for (const app of applications) {
      const key = normalizeStatus(app?.status);
      next[key] += 1;
    }
    return next;
  }, [applications]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return applications.filter((app) => {
      const matchesSearch =
        !q ||
        String(app?.job_title || "")
          .toLowerCase()
          .includes(q) ||
        String(app?.company || "")
          .toLowerCase()
          .includes(q);

      const matchesStatus =
        statusFilter === "all" || normalizeStatus(app?.status) === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [applications, search, statusFilter]);

  const updateStatus = async (id, status) => {
    const nextStatus = normalizeStatus(status);

    setApplications((prev) =>
      prev.map((app) => (app.id === id ? { ...app, status: nextStatus } : app))
    );

    try {
      await apiFetch(`/api/jobs/${encodeURIComponent(id)}/status`, {
        method: "PATCH",
        body: { status: nextStatus },
      });
    } catch {
      toast.error("Failed to update status.");
      loadJobs();
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(900px_520px_at_0%_-10%,rgba(6,182,212,0.10),transparent_60%),radial-gradient(900px_620px_at_100%_0%,rgba(16,185,129,0.07),transparent_62%),linear-gradient(180deg,#03060d_0%,#04070f_100%)] text-white">
      <AppNav currentPage="Applications" />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-6">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {STATUS_ORDER.map((status) => {
            const meta = STATUS_META[status];
            const Icon = meta.icon;
            return (
              <div
                key={status}
                className={`rounded-2xl border p-4 ${meta.summaryBox} shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_14px_30px_rgba(0,0,0,0.35)]`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`h-9 w-9 rounded-xl border grid place-items-center ${meta.iconWrap}`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-3xl leading-none font-bold tabular-nums">
                      {counts[status]}
                    </div>
                    <div className="mt-1 text-sm text-white/75">{meta.summaryLabel}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight">Applications</h1>
            <p className="mt-1 text-white/65">
              Track and manage your job application pipeline
            </p>
          </div>
          <div className="rounded-2xl border border-cyan-400/35 bg-cyan-500/10 px-5 py-3 text-cyan-200 shadow-[0_10px_25px_rgba(0,0,0,0.28)]">
            <span className="text-4xl font-black leading-none tabular-nums">
              {counts.total}
            </span>
            <span className="ml-2 text-base font-medium leading-none align-baseline text-cyan-100/80">
              total applications tracked
            </span>
          </div>
        </section>

        <section className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={[
              "rounded-xl border px-4 py-2 text-sm font-semibold transition-colors",
              statusFilter === "all"
                ? "border-cyan-300/35 bg-cyan-500/25 text-cyan-100"
                : "border-white/10 bg-white/[0.05] text-white/75 hover:bg-white/[0.09]",
            ].join(" ")}
          >
            All Status
            <span className="ml-2 rounded-lg bg-black/30 px-2 py-0.5 text-xs tabular-nums">
              {counts.total}
            </span>
          </button>

          {STATUS_ORDER.map((status) => {
            const meta = STATUS_META[status];
            return (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={[
                  "rounded-xl border px-4 py-2 text-sm font-semibold transition-colors",
                  statusFilter === status
                    ? meta.chipActive
                    : "border-white/10 bg-white/[0.05] text-white/75 hover:bg-white/[0.09]",
                ].join(" ")}
              >
                {meta.label}
                <span className="ml-2 rounded-lg bg-black/30 px-2 py-0.5 text-xs tabular-nums">
                  {counts[status]}
                </span>
              </button>
            );
          })}
        </section>

        <section className="grid gap-3 md:grid-cols-[1fr_220px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <Input
              placeholder="Search by role or company..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-12 rounded-xl border-white/10 bg-[#040912] pl-11 text-white placeholder:text-white/35 focus-visible:ring-cyan-300/35"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-12 rounded-xl border-white/10 bg-[#040912] text-white">
              {statusFilter === "all" ? "All Status" : STATUS_META[statusFilter]?.label}
            </SelectTrigger>
            <SelectContent className="border-white/10 bg-[#070d19] text-white">
              <SelectItem value="all">All Status</SelectItem>
              {STATUS_ORDER.map((status) => (
                <SelectItem key={status} value={status}>
                  {STATUS_META[status].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>

        <section className="space-y-3">
          {isLoading &&
            Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={`loading-${idx}`}
                className="rounded-2xl border border-white/10 bg-[#050b14] p-5"
              >
                <Skeleton className="h-7 w-2/5 bg-white/10" />
                <Skeleton className="mt-3 h-5 w-3/4 bg-white/10" />
                <Skeleton className="mt-4 h-10 w-full bg-white/10" />
              </div>
            ))}

          {!isLoading && filtered.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-[#050b14] p-10 text-center text-white/65">
              No applications found for this filter.
            </div>
          )}

          {!isLoading &&
            filtered.map((app) => {
              const status = normalizeStatus(app?.status);
              const meta = STATUS_META[status];
              const dateLabel = formatDate(app?.created_date);
              const payLabel = renderPay(app);

              return (
                <article
                  key={app.id}
                  className="relative rounded-2xl border border-white/10 bg-[#040a14]/90 px-6 py-6 shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
                >
                  <span
                    aria-hidden
                    className={`absolute left-0 top-0 h-full w-1 rounded-l-2xl ${meta.cardBar}`}
                  />

                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <h3 className="truncate text-2xl font-semibold leading-tight text-white md:text-[2rem]">
                        {app.job_title}
                      </h3>

                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/68 md:text-[1.05rem]">
                        <span className="inline-flex items-center gap-1.5">
                          <Building2 className="h-4 w-4 text-white/45" />
                          {app.company}
                        </span>
                        {dateLabel && (
                          <span className="inline-flex items-center gap-1.5">
                            <Calendar className="h-4 w-4 text-white/45" />
                            {dateLabel}
                          </span>
                        )}
                        {app.location && (
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin className="h-4 w-4 text-white/45" />
                            {app.location}
                          </span>
                        )}
                        {app.websiteLabel && (
                          <span className="inline-flex items-center gap-1.5">
                            <Globe className="h-4 w-4 text-white/45" />
                            {app.websiteLabel}
                          </span>
                        )}
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300/35 bg-emerald-500/20 px-3 py-1.5 text-sm font-semibold text-emerald-100">
                          <DollarSign className="h-3.5 w-3.5" />
                          {payLabel}
                        </span>

                        {app.website && (
                          <a
                            href={app.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-white/75 hover:bg-white/[0.09] hover:text-white"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Open website
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0">
                      <Select
                        value={status}
                        onValueChange={(value) => updateStatus(app.id, value)}
                      >
                        <SelectTrigger
                          className={`h-12 min-w-[170px] rounded-xl px-4 text-sm font-semibold ${meta.selectTone}`}
                        >
                          <span className="inline-flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${meta.dotStrong}`} />
                            <span className={`h-2 w-2 rounded-full ${meta.dotSoft}`} />
                            {meta.label}
                          </span>
                        </SelectTrigger>
                        <SelectContent className="border-white/10 bg-[#070d19] text-white">
                          {STATUS_ORDER.map((item) => (
                            <SelectItem key={item} value={item}>
                              {STATUS_META[item].label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </article>
              );
            })}
        </section>
      </main>
    </div>
  );
}
