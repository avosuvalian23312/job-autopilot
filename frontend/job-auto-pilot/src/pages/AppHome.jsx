// AppHome.jsx (single-file, production-polished, no “Last 7 days (applications added)” section)
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import AppNav from "@/components/app/AppNav";
import GoalProgress from "@/components/app/GoalProgress";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import {
  Plus,
  FileText,
  TrendingUp,
  Clock,
  Target,
  BarChart3,
  Trophy,
  Sparkles,
  CheckCircle2,
  Zap,
  Lightbulb,
  ListChecks,
  CalendarDays,
  Building2,
} from "lucide-react";

/* ---------------------------------------
   Config (env-safe)
---------------------------------------- */
const env =
  (typeof import.meta !== "undefined" && import.meta.env) ||
  (typeof process !== "undefined" && process.env) ||
  {};

const APP_GOAL = Number(env.VITE_APP_GOAL || env.REACT_APP_APP_GOAL || 200);
const RESUME_GOAL = Number(env.VITE_RESUME_GOAL || env.REACT_APP_RESUME_GOAL || 10);
const API_BASE = String(env.VITE_API_BASE || env.REACT_APP_API_BASE || "");

/* ---------------------------------------
   Small utilities
---------------------------------------- */
const cx = (...c) => c.filter(Boolean).join(" ");

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--ds-bg))]";

const apiFetch = async (path, options = {}, signal) => {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    signal,
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
};

const toDate = (v) => {
  if (v == null) return null;
  if (typeof v === "number") {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  const d = new Date(String(v));
  return Number.isFinite(d.getTime()) ? d : null;
};

const timeAgo = (date) => {
  const d = toDate(date);
  if (!d) return "";
  const diffMs = Date.now() - d.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 30) return "just now";
  if (sec < 60) return `${sec} seconds ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? "" : "s"} ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk} week${wk === 1 ? "" : "s"} ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo} month${mo === 1 ? "" : "s"} ago`;
  const yr = Math.floor(day / 365);
  return `${yr} year${yr === 1 ? "" : "s"} ago`;
};

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const normalizeStatus = (s) => String(s ?? "").trim().toLowerCase();
const titleCase = (s) => {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const normalizeJobsList = (jobs) =>
  Array.isArray(jobs) ? jobs : jobs?.jobs || jobs?.items || jobs?.resources || [];

const pickJobTitle = (job) => job?.job_title || job?.jobTitle || job?.title || job?.role || "Job";
const pickCompany = (job) => job?.company || job?.companyName || job?.employer || "Company";

const pickCreated = (job) =>
  job?.created_date || job?.createdAt || job?.created_at || job?.created || job?.timestamp;

const pickUpdated = (job) =>
  job?.status_updated_at ||
  job?.statusUpdatedAt ||
  job?.updated_date ||
  job?.updatedAt ||
  job?.updated_at ||
  job?.updated;

const pickDocsGenerated = (job) =>
  job?.docs_generated_at ||
  job?.docsGeneratedAt ||
  job?.packet_generated_at ||
  job?.packetGeneratedAt ||
  job?.generated_at ||
  job?.generatedAt;

const buildRecentActivityFromJobs = (jobs) => {
  const list = normalizeJobsList(jobs);
  const events = [];

  for (const job of list) {
    const role = pickJobTitle(job);
    const comp = pickCompany(job);

    const created = toDate(pickCreated(job));
    if (created) {
      events.push({
        type: "job_added",
        text: `Added ${role} at ${comp}`,
        time: timeAgo(created),
        ts: created.getTime(),
      });
    }

    const docsGen = toDate(pickDocsGenerated(job));
    if (docsGen) {
      events.push({
        type: "doc_generated",
        text: `Generated documents for ${role} at ${comp}`,
        time: timeAgo(docsGen),
        ts: docsGen.getTime(),
      });
    }

    const st = normalizeStatus(job?.status);
    const updated = toDate(pickUpdated(job));
    if (updated && st && st !== "generated") {
      events.push({
        type: "status_changed",
        text: `Application updated to ${titleCase(st)} (${role} at ${comp})`,
        time: timeAgo(updated),
        ts: updated.getTime(),
      });
    }
  }

  events.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return events.slice(0, 8).map((e, i) => ({
    id: `${e.type}-${e.ts || Date.now()}-${i}`,
    type: e.type,
    text: e.text,
    time: e.time,
  }));
};

const normalizeRecentActivityFromDashboard = (dash) => {
  const raw =
    dash?.recentActivity ||
    dash?.activity ||
    dash?.events ||
    dash?.recent_activity ||
    dash?.recent_activity_items;

  if (!Array.isArray(raw)) return [];

  const mapped = raw
    .map((x, i) => {
      const dt = toDate(
        x?.ts || x?.time || x?.date || x?.createdAt || x?.created_date
      );
      return {
        id: x?.id ?? `${i}`,
        type: x?.type || x?.kind || x?.eventType || "job_added",
        text: x?.text || x?.message || x?.title || "",
        time: x?.timeText || x?.relativeTime || (dt ? timeAgo(dt) : ""),
        ts: dt ? dt.getTime() : 0,
      };
    })
    .filter((x) => String(x.text || "").trim().length > 0);

  mapped.sort((a, b) => (b.ts || 0) - (a.ts || 0));

  return mapped.slice(0, 8).map((x, i) => ({
    id: x.id || `${x.type}-${x.ts}-${i}`,
    type: x.type,
    text: x.text,
    time: x.time,
  }));
};

const computeThisWeekMetricsFromJobs = (jobs) => {
  const list = normalizeJobsList(jobs);
  const now = new Date();
  const cutoff = startOfDay(now) - 6 * 24 * 60 * 60 * 1000;

  let apps = 0;
  let interviews = 0;
  let offers = 0;

  for (const job of list) {
    const created = toDate(pickCreated(job));
    const updated = toDate(pickUpdated(job));
    const st = normalizeStatus(job?.status);

    if (created && created.getTime() >= cutoff) apps += 1;

    const when = updated || created;
    if (when && when.getTime() >= cutoff) {
      if (st === "interview") interviews += 1;
      if (st === "offer") offers += 1;
    }
  }

  return { applications: apps, interviews, offers };
};

const buildLastNDaysSeries = (jobs, days = 7) => {
  const now = new Date();
  const start = startOfDay(now) - (days - 1) * 24 * 60 * 60 * 1000;

  const buckets = new Map();
  for (let i = 0; i < days; i++) {
    const t = start + i * 24 * 60 * 60 * 1000;
    buckets.set(t, 0);
  }

  const list = normalizeJobsList(jobs);
  for (const job of list) {
    const created = toDate(pickCreated(job));
    if (!created) continue;
    const key = startOfDay(created);
    if (key >= start && buckets.has(key)) buckets.set(key, (buckets.get(key) || 0) + 1);
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([ts, count]) => {
      const d = new Date(ts);
      const label = d.toLocaleDateString(undefined, { weekday: "short" });
      return { ts, label, value: count };
    });
};

const countStatusesAllTime = (jobs) => {
  const list = normalizeJobsList(jobs);
  const counts = {
    generated: 0,
    applied: 0,
    interview: 0,
    offer: 0,
    rejected: 0,
    other: 0,
  };

  for (const job of list) {
    const st = normalizeStatus(job?.status);
    if (!st) continue;
    if (counts[st] != null) counts[st] += 1;
    else counts.other += 1;
  }
  return counts;
};

const computeStreak = (dailySeries) => {
  const arr = Array.isArray(dailySeries) ? dailySeries : [];
  if (!arr.length) return 0;
  let streak = 0;
  for (let i = arr.length - 1; i >= 0; i--) {
    if ((arr[i]?.value || 0) > 0) streak += 1;
    else break;
  }
  return streak;
};

const buildMonthGrid = (year, monthIndex) => {
  const first = new Date(year, monthIndex, 1);
  const last = new Date(year, monthIndex + 1, 0);
  const start = new Date(year, monthIndex, 1 - first.getDay());
  const end = new Date(year, monthIndex, last.getDate() + (6 - last.getDay()));

  const cells = [];
  const cur = new Date(start);
  while (cur <= end) {
    cells.push({
      date: new Date(cur),
      inMonth: cur.getMonth() === monthIndex,
      key: `${cur.getFullYear()}-${cur.getMonth()}-${cur.getDate()}`,
    });
    cur.setDate(cur.getDate() + 1);
  }
  return cells;
};

/* ---------------------------------------
   Inline “component system” (in-file)
---------------------------------------- */
function Card({ as: Comp = "section", className, children, ...props }) {
  return (
    <Comp
      className={cx(
        "min-w-0 rounded-[var(--ds-radius-card)] border border-white/10 bg-white/[0.04]",
        "shadow-[var(--ds-shadow-card)]",
        className
      )}
      {...props}
    >
      {children}
    </Comp>
  );
}

function CardHeader({ title, description, action, className }) {
  return (
    <div className={cx("flex items-start justify-between gap-4 p-6 pb-0", className)}>
      <div className="min-w-0">
        {title ? (
          <h2 className="text-[length:var(--ds-h2)] font-semibold text-slate-100 leading-snug">
            {title}
          </h2>
        ) : null}
        {description ? (
          <div className="mt-1 text-[length:var(--ds-body)] text-slate-400 leading-relaxed">
            {description}
          </div>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function CardContent({ className, children }) {
  return <div className={cx("p-6", className)}>{children}</div>;
}

function Badge({ variant = "default", className, children, ...props }) {
  const styles = {
    default: "bg-white/5 text-slate-200 border-white/10",
    muted: "bg-white/5 text-slate-400 border-white/10",
    success: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
    info: "bg-cyan-500/10 text-cyan-300 border-cyan-500/20",
    warning: "bg-amber-500/10 text-amber-300 border-amber-500/20",
    purple: "bg-purple-500/10 text-purple-300 border-purple-500/20",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[length:var(--ds-caption)] font-medium",
        styles[variant] || styles.default,
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

function PrimaryButton({ className, ...props }) {
  return (
    <Button
      className={cx(
        "rounded-[var(--ds-radius-control)] bg-[hsl(var(--ds-accent))] text-white",
        "hover:bg-[hsl(var(--ds-accent))]/90 active:bg-[hsl(var(--ds-accent))]/85",
        "shadow-sm shadow-black/30",
        focusRing,
        className
      )}
      {...props}
    />
  );
}

function SecondaryButton({ className, variant = "outline", ...props }) {
  return (
    <Button
      variant={variant}
      className={cx(
        "rounded-[var(--ds-radius-control)] border-white/10 bg-white/[0.04] text-slate-100",
        "hover:bg-white/[0.07] active:bg-white/[0.09]",
        focusRing,
        className
      )}
      {...props}
    />
  );
}

const ringColors = {
  purple: "stroke-purple-500",
  cyan: "stroke-cyan-500",
  green: "stroke-emerald-500",
  amber: "stroke-amber-500",
};

const ProgressRing = React.memo(function ProgressRing({
  value = 0,
  max = 100,
  size = 92,
  stroke = 10,
  color = "purple",
  label,
  ariaLabel,
}) {
  const safeMax = Math.max(1, Number(max) || 1);
  const v = Math.max(0, Number(value) || 0);
  const pct = Math.min((v / safeMax) * 100, 100);

  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (pct / 100) * circumference;

  return (
    <div role="group" aria-label={ariaLabel || (label ? `${label}: ${v}` : undefined)} className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          className="block -rotate-90"
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          aria-hidden="true"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={stroke}
            fill="none"
            className="text-white/7"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={stroke}
            fill="none"
            className={ringColors[color] || ringColors.purple}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: "stroke-dashoffset 800ms ease" }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center leading-tight">
            <div className="text-xl font-semibold text-slate-100">{v}</div>
            <div className="text-[length:var(--ds-caption)] text-slate-500">this week</div>
          </div>
        </div>
      </div>
      {label ? (
        <div className="mt-2 text-[length:var(--ds-body)] font-medium text-slate-200">
          {label}
        </div>
      ) : null}
    </div>
  );
});

function StatCard({ label, value, icon: Icon, hint, className }) {
  return (
    <Card
      className={cx(
        "p-4 hover:bg-white/[0.055] transition-colors",
        className
      )}
      title={hint}
      aria-label={`${label}: ${value}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[length:var(--ds-caption)] text-slate-400">{label}</div>
          <div className="mt-1 text-2xl font-semibold text-slate-100">{value}</div>
        </div>
        {Icon ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2">
            <Icon className="h-4 w-4 text-slate-300" aria-hidden="true" />
          </div>
        ) : null}
      </div>
      {hint ? (
        <div className="mt-2 text-[length:var(--ds-caption)] text-slate-500">{hint}</div>
      ) : null}
    </Card>
  );
}

const CalendarDay = React.memo(function CalendarDay({
  date,
  inMonth,
  count = 0,
  isToday,
  isFuture,
}) {
  const day = date.getDate();
  const done = inMonth && !isFuture && count > 0;

  const label = inMonth
    ? `${date.toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      })}: ${done ? `${count} job${count === 1 ? "" : "s"} added` : "No jobs added"}${
        isToday ? " (Today)" : ""
      }${isFuture ? " (Future)" : ""}`
    : "";

  return (
    <div
      role="gridcell"
      aria-label={label}
      aria-disabled={!inMonth || isFuture}
      className={cx(
        "h-14 rounded-xl border border-white/10 bg-white/[0.035] p-2",
        "flex flex-col justify-between min-w-0 transition-colors",
        inMonth ? "opacity-100" : "opacity-35",
        isFuture ? "opacity-60" : "",
        isToday ? "ring-1 ring-purple-500/35" : ""
      )}
      title={label}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-medium text-slate-200">{day}</div>

        {inMonth ? (
          done ? (
            <Badge variant="success" className="px-2 py-0.5">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Done</span>
            </Badge>
          ) : (
            <Badge variant="muted" className="px-2 py-0.5">
              <span className="hidden sm:inline">—</span>
            </Badge>
          )
        ) : (
          <div className="h-5" />
        )}
      </div>

      <div className="flex items-end justify-between">
        <div className="text-[11px] text-slate-500 truncate">
          {done ? `${count} job${count === 1 ? "" : "s"}` : ""}
        </div>
        {isToday ? (
          <Badge variant="purple" className="px-2 py-0.5 text-[10px]">
            today
          </Badge>
        ) : null}
      </div>
    </div>
  );
});

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-7 space-y-6">
        <Card className="p-6">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="mt-3 h-4 w-72" />
          <div className="mt-4 grid grid-cols-7 gap-2">
            {Array.from({ length: 28 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        </Card>
        <Card className="p-6">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="mt-3 h-4 w-96" />
          <div className="mt-5 grid grid-cols-3 gap-3">
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </div>
        </Card>
        <Card className="p-6">
          <Skeleton className="h-6 w-52" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        </Card>
      </div>

      <div className="lg:col-span-5 space-y-6">
        <Card className="p-6">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="mt-4 h-24 rounded-2xl" />
          <Skeleton className="mt-4 h-24 rounded-2xl" />
        </Card>
        <Card className="p-6">
          <Skeleton className="h-5 w-28" />
          <div className="mt-4 grid grid-cols-3 gap-4">
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
          </div>
        </Card>
        <Card className="p-6">
          <Skeleton className="h-5 w-36" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function ErrorState({ title = "Something went wrong", message, onRetry }) {
  return (
    <Card>
      <CardHeader title={title} description={message} />
      <CardContent className="pt-4">
        {onRetry ? (
          <PrimaryButton onClick={onRetry} aria-label="Retry loading dashboard">
            Retry
          </PrimaryButton>
        ) : null}
      </CardContent>
    </Card>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    // Replace with your logging hook (Sentry/AppInsights/etc.)
    // eslint-disable-next-line no-console
    console.error("AppHome ErrorBoundary:", error, info);
  }
  render() {
    if (this.state.hasError) return this.props.fallback || null;
    return this.props.children;
  }
}

/* ---------------------------------------
   Page
---------------------------------------- */
export default function AppHome() {
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [recentActivity, setRecentActivity] = useState([]);
  const [weekApps, setWeekApps] = useState(0);
  const [weekInterviews, setWeekInterviews] = useState(0);
  const [weekOffers, setWeekOffers] = useState(0);

  const [totalApps, setTotalApps] = useState(0);
  const [resumeCount, setResumeCount] = useState(0);

  const [dailySeries, setDailySeries] = useState([]); // kept for streak (no chart shown)
  const [statusCounts, setStatusCounts] = useState({
    generated: 0,
    applied: 0,
    interview: 0,
    offer: 0,
    rejected: 0,
    other: 0,
  });

  const [jobsList, setJobsList] = useState([]);

  const handleNewJob = useCallback(() => {
    navigate(createPageUrl("NewJob"));
  }, [navigate]);

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");

    const controller = new AbortController();

    try {
      const [dashRes, jobsRes, resumesRes] = await Promise.allSettled([
        apiFetch("/api/dashboard", { method: "GET" }, controller.signal),
        apiFetch("/api/jobs", { method: "GET" }, controller.signal),
        apiFetch("/api/resume/list", { method: "GET" }, controller.signal),
      ]);

      const dash = dashRes.status === "fulfilled" ? dashRes.value : null;
      const jobs = jobsRes.status === "fulfilled" ? jobsRes.value : null;
      const resumes = resumesRes.status === "fulfilled" ? resumesRes.value : null;

      const dashActivity = dash ? normalizeRecentActivityFromDashboard(dash) : [];
      if (dashActivity.length) setRecentActivity(dashActivity);
      else if (jobs) setRecentActivity(buildRecentActivityFromJobs(jobs));
      else setRecentActivity([]);

      const wk =
        dash?.thisWeek ||
        dash?.week ||
        dash?.weekly ||
        dash?.stats?.thisWeek ||
        dash?.stats?.week ||
        dash?.metrics ||
        null;

      const wkAppsRaw =
        wk?.applications ?? wk?.apps ?? wk?.jobs ?? wk?.applicationsCount ?? wk?.totalApplications;
      const wkInterviewsRaw = wk?.interviews ?? wk?.interview ?? wk?.interviewsCount;
      const wkOffersRaw = wk?.offers ?? wk?.offer ?? wk?.offersCount;

      const hasDashWeek =
        typeof wkAppsRaw === "number" ||
        typeof wkInterviewsRaw === "number" ||
        typeof wkOffersRaw === "number";

      if (typeof wkAppsRaw === "number") setWeekApps(wkAppsRaw);
      if (typeof wkInterviewsRaw === "number") setWeekInterviews(wkInterviewsRaw);
      if (typeof wkOffersRaw === "number") setWeekOffers(wkOffersRaw);

      if (!hasDashWeek && jobs) {
        const w = computeThisWeekMetricsFromJobs(jobs);
        setWeekApps(w.applications);
        setWeekInterviews(w.interviews);
        setWeekOffers(w.offers);
      }

      if (jobs) {
        const list = normalizeJobsList(jobs);
        setJobsList(list);
        setTotalApps(list.length);
        setDailySeries(buildLastNDaysSeries(jobs, 7)); // streak only
        setStatusCounts(countStatusesAllTime(jobs));
      } else {
        setJobsList([]);
        setTotalApps(0);
      }

      if (resumes) {
        const items =
          resumes?.items ||
          resumes?.resumes ||
          resumes?.resources ||
          resumes?.files ||
          (Array.isArray(resumes) ? resumes : []);
        setResumeCount(Array.isArray(items) ? items.length : 0);
      } else {
        setResumeCount(0);
      }

      const allFailed =
        dashRes.status === "rejected" && jobsRes.status === "rejected" && resumesRes.status === "rejected";

      if (allFailed) {
        const msg =
          dashRes.reason?.message || jobsRes.reason?.message || resumesRes.reason?.message || "Failed to load dashboard.";
        setLoadError(msg);
      }
    } catch (err) {
      setLoadError(err?.message || "Failed to load dashboard.");
    } finally {
      setIsLoading(false);
    }

    return () => controller.abort();
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!mounted) return;
      await loadDashboard();
    })();
    return () => {
      mounted = false;
    };
  }, [loadDashboard]);

  const weekMax = useMemo(() => Math.max(20, weekApps, weekInterviews, weekOffers), [
    weekApps,
    weekInterviews,
    weekOffers,
  ]);

  const streak = useMemo(() => computeStreak(dailySeries), [dailySeries]);

  const topStatusRows = useMemo(() => {
    const entries = Object.entries(statusCounts || {});
    return entries
      .filter(([k]) => k !== "other")
      .sort((a, b) => (b[1] || 0) - (a[1] || 0))
      .slice(0, 5);
  }, [statusCounts]);

  const achievements = useMemo(() => {
    const hasApps = totalApps > 0;
    const hasResume = resumeCount > 0;
    const firstInterview = (statusCounts?.interview || 0) > 0;
    const firstOffer = (statusCounts?.offer || 0) > 0;

    const tiers = [
      { label: "First job added", done: hasApps, hint: "Add a job to start your pipeline." },
      { label: "First resume uploaded", done: hasResume, hint: "Upload a resume to generate docs faster." },
      { label: "10 applications", done: totalApps >= 10, hint: "Momentum beats intensity — stay consistent." },
      { label: "25 applications", done: totalApps >= 25, hint: "Nice volume — keep tracking clean." },
      { label: "First interview", done: firstInterview, hint: "Follow-ups + targeting are your levers." },
      { label: "First offer", done: firstOffer, hint: "Offers come from reps + iteration." },
      { label: "3-day streak", done: streak >= 3, hint: "Try 1 job/day to keep momentum." },
    ];

    const notDone = tiers.filter((t) => !t.done);
    const done = tiers.filter((t) => t.done);
    return [...notDone, ...done].slice(0, 5);
  }, [resumeCount, statusCounts, streak, totalApps]);

  const tips = useMemo(() => {
    const t = [];
    if (weekApps <= 2) t.push("Aim for 3–5 adds/week to keep your pipeline warm.");
    else t.push("Great weekly pace — consistency beats spikes.");

    if ((statusCounts?.applied || 0) > 0 && (statusCounts?.interview || 0) === 0) {
      t.push("Follow up 48 hours after applying — it increases reply rates.");
    } else if ((statusCounts?.interview || 0) > 0) {
      t.push("Log missed questions and improve one answer per interview.");
    }

    if (resumeCount === 0) t.push("Upload 1 baseline resume. Then clone per role type.");
    else if (resumeCount < 3) t.push("Maintain 2–3 resume variants by role.");

    t.push("Keep every job entry complete: title, company, link, and latest status date.");
    return t.slice(0, 4);
  }, [resumeCount, statusCounts, weekApps]);

  const checklist = useMemo(() => {
    return [
      { label: "Add 1–3 jobs today", done: streak > 0 },
      { label: "Generate docs for 1 job", done: (statusCounts?.generated || 0) > 0 },
      { label: "Follow up on 2 applications", done: weekApps > 0 },
      { label: "Upload / update a resume", done: resumeCount > 0 },
    ];
  }, [resumeCount, statusCounts, streak, weekApps]);

  const jobAddsByDay = useMemo(() => {
    const m = new Map();
    for (const job of jobsList || []) {
      const created = toDate(pickCreated(job));
      if (!created) continue;
      const key = startOfDay(created);
      m.set(key, (m.get(key) || 0) + 1);
    }
    return m;
  }, [jobsList]);

  const monthMeta = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const monthIndex = now.getMonth();
    const monthName = now.toLocaleDateString(undefined, { month: "long" });
    const cells = buildMonthGrid(year, monthIndex);

    const todayKey = startOfDay(now);
    let activeDays = 0;
    let jobsThisMonth = 0;

    for (const cell of cells) {
      if (!cell.inMonth) continue;
      const k = startOfDay(cell.date);
      const c = jobAddsByDay.get(k) || 0;
      if (c > 0) {
        activeDays += 1;
        jobsThisMonth += c;
      }
    }

    return { monthName, cells, todayKey, activeDays, jobsThisMonth };
  }, [jobAddsByDay]);

  const conversion = useMemo(() => {
    const applied = Number(statusCounts?.applied || 0);
    const interviews = Number(statusCounts?.interview || 0);
    const offers = Number(statusCounts?.offer || 0);

    const interviewRate = applied ? Math.round((interviews / applied) * 100) : 0;
    const offerFromInterview = interviews ? Math.round((offers / interviews) * 100) : 0;
    const offerFromApplied = applied ? Math.round((offers / applied) * 100) : 0;

    return { applied, interviews, offers, interviewRate, offerFromInterview, offerFromApplied };
  }, [statusCounts]);

  const topCompanies = useMemo(() => {
    const map = new Map();
    for (const job of jobsList || []) {
      const c = String(pickCompany(job) || "").trim();
      if (!c) continue;
      map.set(c, (map.get(c) || 0) + 1);
    }
    const rows = Array.from(map.entries())
      .sort((a, b) => (b[1] || 0) - (a[1] || 0))
      .slice(0, 5)
      .map(([company, count]) => ({ company, count }));

    const max = Math.max(1, ...rows.map((x) => x.count || 0));
    return { rows, max };
  }, [jobsList]);

  return (
    <div
      className="min-h-screen bg-[hsl(var(--ds-bg))] text-slate-100"
      style={{
        "--ds-bg": "240 10% 4%",
        "--ds-surface": "240 10% 8%",
        "--ds-border": "240 10% 18%",
        "--ds-fg": "0 0% 98%",
        "--ds-muted": "240 6% 72%",
        "--ds-muted-2": "240 5% 60%",
        "--ds-accent": "267 84% 64%",
        "--ds-accent-2": "198 92% 56%",
        "--ds-success": "142 71% 45%",
        "--ds-warning": "38 92% 50%",
        "--ds-radius-card": "16px",
        "--ds-radius-control": "12px",
        "--ds-shadow-card": "0 1px 0 rgba(255,255,255,.06), 0 12px 30px rgba(0,0,0,.35)",
        "--ds-h1": "24px",
        "--ds-h1-lg": "30px",
        "--ds-h2": "16px",
        "--ds-h3": "14px",
        "--ds-body": "14px",
        "--ds-caption": "12px",
      }}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-black"
      >
        Skip to content
      </a>

      <AppNav currentPage="AppHome" />

      <ErrorBoundary
        fallback={
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
            <ErrorState
              title="Dashboard crashed"
              message="A UI error occurred. Try refreshing."
              onRetry={() => window.location.reload()}
            />
          </div>
        }
      >
        <motion.main
          id="main"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="max-w-7xl mx-auto px-4 sm:px-6 py-8"
        >
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
            <div className="min-w-0">
              <h1 className="text-[length:var(--ds-h1)] sm:text-[length:var(--ds-h1-lg)] font-semibold tracking-tight text-slate-100">
                Dashboard
              </h1>
              <p className="mt-1 text-[length:var(--ds-body)] text-slate-400">
                All-time:{" "}
                <span className="text-slate-200 font-semibold">{totalApps}</span>{" "}
                applications •{" "}
                <span className="text-slate-200 font-semibold">{resumeCount}</span>{" "}
                resumes
              </p>
            </div>

            <div className="flex items-center gap-3">
              <PrimaryButton onClick={handleNewJob} aria-label="Create a new job">
                <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
                New Job
              </PrimaryButton>

              <SecondaryButton
                onClick={() => navigate(createPageUrl("Analytics"))}
                aria-label="Open analytics"
              >
                <BarChart3 className="w-4 h-4 mr-2" aria-hidden="true" />
                Analytics
              </SecondaryButton>
            </div>
          </div>

          {isLoading ? (
            <DashboardSkeleton />
          ) : loadError ? (
            <ErrorState title="Couldn’t load dashboard" message={loadError} onRetry={loadDashboard} />
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* LEFT */}
                <div className="lg:col-span-7 space-y-6">
                  {/* Calendar */}
                  <Card aria-label="Activity calendar">
                    <CardHeader
                      title={`${monthMeta.monthName} activity`}
                      description={
                        <span className="text-slate-400">
                          <span className="text-slate-200 font-semibold">{monthMeta.activeDays}</span>{" "}
                          active days •{" "}
                          <span className="text-slate-200 font-semibold">{monthMeta.jobsThisMonth}</span>{" "}
                          jobs added
                        </span>
                      }
                      action={<CalendarDays className="h-4 w-4 text-slate-400" aria-hidden="true" />}
                    />
                    <CardContent className="pt-5">
                      <div className="grid grid-cols-7 gap-2 text-[11px] text-slate-500 mb-2">
                        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                          <div key={d} className="text-center">
                            {d}
                          </div>
                        ))}
                      </div>

                      <div role="grid" aria-label="Monthly activity grid" className="grid grid-cols-7 gap-2">
                        {monthMeta.cells.map((cell) => {
                          const k = startOfDay(cell.date);
                          const count = jobAddsByDay.get(k) || 0;
                          const isFuture = k > monthMeta.todayKey;
                          const isToday = k === monthMeta.todayKey;

                          return (
                            <CalendarDay
                              key={cell.key}
                              date={cell.date}
                              inMonth={cell.inMonth}
                              count={count}
                              isFuture={isFuture}
                              isToday={isToday}
                            />
                          );
                        })}
                      </div>

                      <p className="mt-4 text-[length:var(--ds-caption)] text-slate-500">
                        Tip: keep momentum by adding{" "}
                        <span className="text-slate-200 font-medium">1 job/day</span>.
                      </p>
                    </CardContent>
                  </Card>

                  {/* New Job CTA (polished, subtle) */}
                  <Card
                    aria-label="New Job call to action"
                    className="border-purple-500/20 bg-gradient-to-b from-purple-500/10 to-white/[0.03]"
                  >
                    <CardContent className="p-6 sm:p-8">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                        <div className="min-w-0">
                          <h2 className="text-xl sm:text-2xl font-semibold text-slate-100">
                            Add a job to your pipeline
                          </h2>
                          <p className="mt-2 text-[length:var(--ds-body)] text-slate-400 max-w-xl">
                            Track statuses, generate documents, and keep your outreach consistent — all in one place.
                          </p>

                          <div className="mt-4 flex flex-wrap items-center gap-2">
                            <Badge variant="purple">Faster workflow</Badge>
                            <Badge variant="info">Cleaner tracking</Badge>
                            <Badge variant="success">Better follow-ups</Badge>
                          </div>

                          <div className="mt-6 flex flex-col sm:flex-row gap-3">
                            <PrimaryButton onClick={handleNewJob} aria-label="Add a new job">
                              <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
                              Add New Job
                            </PrimaryButton>
                            <SecondaryButton
                              onClick={() => navigate(createPageUrl("Applications"))}
                              aria-label="Go to applications"
                            >
                              <TrendingUp className="w-4 h-4 mr-2" aria-hidden="true" />
                              View Applications
                            </SecondaryButton>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 md:grid-cols-1 gap-3 w-full md:w-[220px]">
                          <StatCard label="This week" value={`${weekApps}`} icon={Clock} hint="Jobs added in last 7 days" />
                          <StatCard label="Streak" value={`${streak}d`} icon={Zap} hint="Days with at least 1 job added" />
                          <StatCard label="Offers" value={`${weekOffers}`} icon={Target} hint="Offers updated in last 7 days" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Insights (NOTE: Removed the entire “Last 7 days (applications added)” chart/labels) */}
                  <Card aria-label="Insights">
                    <CardHeader title="Insights" description="Status mix and weekly momentum at a glance." />
                    <CardContent className="pt-5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Card className="p-4" aria-label="Status breakdown">
                          <div className="flex items-center gap-2">
                            <Target className="h-4 w-4 text-cyan-300" aria-hidden="true" />
                            <div className="text-[length:var(--ds-h3)] font-semibold text-slate-200">
                              Status breakdown
                            </div>
                          </div>

                          <div className="mt-4 space-y-3">
                            {topStatusRows.map(([k, v]) => {
                              const pct = totalApps ? Math.round(((v || 0) / totalApps) * 100) : 0;
                              return (
                                <div key={k} className="flex items-center gap-3">
                                  <div className="w-24 text-[length:var(--ds-caption)] text-slate-400 capitalize">
                                    {k}
                                  </div>
                                  <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                                    <div
                                      className="h-2 rounded-full bg-white/20"
                                      style={{ width: `${pct}%` }}
                                      aria-hidden="true"
                                    />
                                  </div>
                                  <div className="w-10 text-right text-[length:var(--ds-caption)] text-slate-300">
                                    {v}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </Card>

                        <Card className="p-4" aria-label="This week metrics">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-slate-300" aria-hidden="true" />
                            <div className="text-[length:var(--ds-h3)] font-semibold text-slate-200">
                              This week
                            </div>
                          </div>

                          <div className="mt-4 grid grid-cols-3 gap-3">
                            <ProgressRing value={weekApps} max={weekMax} color="purple" label="Apps" ariaLabel="Applications this week" />
                            <ProgressRing value={weekInterviews} max={weekMax} color="cyan" label="Interviews" ariaLabel="Interviews this week" />
                            <ProgressRing value={weekOffers} max={weekMax} color="green" label="Offers" ariaLabel="Offers this week" />
                          </div>

                          <p className="mt-4 text-[length:var(--ds-caption)] text-slate-500">
                            Tip: consistency drives replies — keep adds steady and follow up regularly.
                          </p>
                        </Card>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Recent Activity */}
                  <Card aria-label="Recent activity">
                    <CardHeader title="Recent activity" action={<Clock className="h-4 w-4 text-slate-400" aria-hidden="true" />} />
                    <CardContent className="pt-5">
                      {recentActivity.length > 0 ? (
                        <ul className="space-y-3" role="list">
                          {recentActivity.map((activity) => (
                            <li
                              key={activity.id}
                              className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-4 hover:bg-white/[0.06] transition-colors"
                            >
                              <div
                                className={cx(
                                  "mt-0.5 grid place-items-center h-9 w-9 rounded-xl border border-white/10",
                                  activity.type === "job_added"
                                    ? "bg-purple-500/10"
                                    : activity.type === "doc_generated"
                                    ? "bg-cyan-500/10"
                                    : "bg-emerald-500/10"
                                )}
                                aria-hidden="true"
                              >
                                {activity.type === "job_added" && <Plus className="h-4 w-4 text-purple-300" />}
                                {activity.type === "doc_generated" && <FileText className="h-4 w-4 text-cyan-300" />}
                                {activity.type === "status_changed" && <TrendingUp className="h-4 w-4 text-emerald-300" />}
                              </div>

                              <div className="min-w-0 flex-1">
                                <p className="text-[length:var(--ds-body)] text-slate-200">{activity.text}</p>
                                <p className="mt-1 text-[length:var(--ds-caption)] text-slate-500">{activity.time}</p>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center">
                          <p className="text-slate-400">No activity yet.</p>
                          <div className="mt-4 flex justify-center">
                            <PrimaryButton onClick={handleNewJob} aria-label="Add your first job">
                              <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
                              Add your first job
                            </PrimaryButton>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* RIGHT */}
                <div className="lg:col-span-5 space-y-6">
                  {/* Goals */}
                  <Card aria-label="Goals">
                    <CardHeader title="Goals" description="Track progress across applications and resumes." />
                    <CardContent className="pt-5 space-y-4">
                      {/* Keep your existing donut chart component */}
                      <Card className="p-4">
                        <div className="text-[length:var(--ds-h3)] font-semibold text-slate-200 mb-3">
                          Goal progress
                        </div>
                        <GoalProgress applicationCount={totalApps} />
                      </Card>

                      {/* Applications goal */}
                      <Card className="p-4" aria-label="Applications goal progress">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="text-[length:var(--ds-caption)] text-slate-400">Applications goal</div>
                            <div className="mt-1 text-[length:var(--ds-h3)] font-semibold text-slate-200">
                              {totalApps} / {APP_GOAL}
                            </div>
                            <div className="mt-3 h-2 rounded-full bg-white/5 overflow-hidden">
                              <div
                                className="h-2 rounded-full bg-purple-500/40"
                                style={{
                                  width: `${Math.min((totalApps / Math.max(1, APP_GOAL)) * 100, 100)}%`,
                                }}
                                aria-hidden="true"
                              />
                            </div>
                            <div className="mt-2 text-[length:var(--ds-caption)] text-slate-500">
                              {Math.max(APP_GOAL - totalApps, 0)} to go
                            </div>
                          </div>

                          <Badge variant="purple">
                            {Math.round(Math.min((totalApps / Math.max(1, APP_GOAL)) * 100, 100))}%
                          </Badge>
                        </div>
                      </Card>

                      {/* Resumes goal */}
                      <Card className="p-4" aria-label="Resumes goal progress">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="text-[length:var(--ds-caption)] text-slate-400">Resumes goal</div>
                            <div className="mt-1 text-[length:var(--ds-h3)] font-semibold text-slate-200">
                              {resumeCount} / {RESUME_GOAL}
                            </div>
                            <div className="mt-3 h-2 rounded-full bg-white/5 overflow-hidden">
                              <div
                                className="h-2 rounded-full bg-cyan-500/40"
                                style={{
                                  width: `${Math.min((resumeCount / Math.max(1, RESUME_GOAL)) * 100, 100)}%`,
                                }}
                                aria-hidden="true"
                              />
                            </div>
                            <div className="mt-2 text-[length:var(--ds-caption)] text-slate-500">
                              {Math.max(RESUME_GOAL - resumeCount, 0)} to go
                            </div>
                          </div>

                          <Badge variant="info">
                            {Math.round(Math.min((resumeCount / Math.max(1, RESUME_GOAL)) * 100, 100))}%
                          </Badge>
                        </div>
                      </Card>
                    </CardContent>
                  </Card>

                  {/* Achievements */}
                  <Card aria-label="Achievements">
                    <CardHeader title="Achievements" description="Next milestones to unlock." action={<Trophy className="h-4 w-4 text-amber-300" aria-hidden="true" />} />
                    <CardContent className="pt-5 space-y-3">
                      {achievements.map((a) => (
                        <div
                          key={a.label}
                          className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-4"
                        >
                          <div className="mt-0.5" aria-hidden="true">
                            {a.done ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                            ) : (
                              <Sparkles className="h-4 w-4 text-purple-300" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="text-[length:var(--ds-body)] text-slate-200">{a.label}</div>
                            {!a.done ? (
                              <div className="mt-1 text-[length:var(--ds-caption)] text-slate-500">{a.hint}</div>
                            ) : null}
                          </div>

                          <Badge variant={a.done ? "success" : "muted"}>{a.done ? "done" : "next"}</Badge>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  {/* Quick Tips */}
                  <Card aria-label="Quick tips">
                    <CardHeader title="Quick tips" description="Small actions that move results." action={<Lightbulb className="h-4 w-4 text-cyan-300" aria-hidden="true" />} />
                    <CardContent className="pt-5">
                      <ul className="space-y-3" role="list">
                        {tips.map((t, i) => (
                          <li
                            key={`${i}-${t}`}
                            className="rounded-xl border border-white/10 bg-white/[0.035] p-4 text-[length:var(--ds-body)] text-slate-200"
                          >
                            {t}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>

                  {/* Next Actions */}
                  <Card aria-label="Next actions">
                    <CardHeader title="Next actions" description="Today’s checklist." action={<ListChecks className="h-4 w-4 text-purple-300" aria-hidden="true" />} />
                    <CardContent className="pt-5">
                      <div className="space-y-2">
                        {checklist.map((c) => (
                          <div
                            key={c.label}
                            className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-4"
                          >
                            <div className="text-[length:var(--ds-body)] text-slate-200">{c.label}</div>
                            <Badge variant={c.done ? "success" : "muted"}>{c.done ? "done" : "todo"}</Badge>
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 flex items-center gap-3">
                        <SecondaryButton
                          onClick={() => navigate(createPageUrl("Applications"))}
                          aria-label="Open Applications"
                          className="flex-1"
                        >
                          <TrendingUp className="w-4 h-4 mr-2" aria-hidden="true" />
                          Applications
                        </SecondaryButton>
                        <SecondaryButton
                          onClick={() => navigate(createPageUrl("Resumes"))}
                          aria-label="Open Resumes"
                          className="flex-1"
                        >
                          <FileText className="w-4 h-4 mr-2" aria-hidden="true" />
                          Resumes
                        </SecondaryButton>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Bottom: Conversion + Top Companies */}
              <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
                <Card className="lg:col-span-4" aria-label="Pipeline conversion">
                  <CardHeader title="Pipeline conversion" description="How your funnel is performing." action={<Target className="h-4 w-4 text-purple-300" aria-hidden="true" />} />
                  <CardContent className="pt-5">
                    <div className="grid grid-cols-3 gap-3">
                      <StatCard label="Applied" value={conversion.applied} icon={Target} />
                      <StatCard label="Interviews" value={conversion.interviews} icon={Clock} />
                      <StatCard label="Offers" value={conversion.offers} icon={Zap} />
                    </div>

                    <div className="mt-5 space-y-3 text-[length:var(--ds-body)]">
                      <div className="flex items-center justify-between">
                        <div className="text-slate-400">Interview rate</div>
                        <div className="text-slate-200 font-semibold">{conversion.interviewRate}%</div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-slate-400">Offer rate (from interviews)</div>
                        <div className="text-slate-200 font-semibold">{conversion.offerFromInterview}%</div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-slate-400">Offer rate (from applied)</div>
                        <div className="text-slate-200 font-semibold">{conversion.offerFromApplied}%</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="lg:col-span-8" aria-label="Top companies">
                  <CardHeader
                    title="Top companies"
                    description="Where you’ve applied most. Use this to diversify targeting."
                    action={<Building2 className="h-4 w-4 text-cyan-300" aria-hidden="true" />}
                  />
                  <CardContent className="pt-5">
                    {topCompanies.rows.length ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {topCompanies.rows.map((r) => {
                          const pct = Math.round(((r.count || 0) / topCompanies.max) * 100);
                          return (
                            <div
                              key={r.company}
                              className="rounded-xl border border-white/10 bg-white/[0.035] p-4"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-[length:var(--ds-body)] text-slate-200 truncate">
                                  {r.company}
                                </div>
                                <div className="text-[length:var(--ds-body)] text-slate-200 font-semibold">
                                  {r.count}
                                </div>
                              </div>
                              <div className="mt-3 h-2 rounded-full bg-white/5 overflow-hidden">
                                <div
                                  className="h-2 rounded-full bg-white/20"
                                  style={{ width: `${pct}%` }}
                                  aria-hidden="true"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-slate-400">
                        No company data yet — add a job to start tracking.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </motion.main>
      </ErrorBoundary>
    </div>
  );
}
