// AppHome.jsx (single-file, production-polished, no “Last 7 days (applications added)” section)
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import AppNav from "@/components/app/AppNav";
import GoalProgress from "@/components/app/GoalProgress";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "framer-motion";
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
  Check,
  Zap,
  Lightbulb,
  ListChecks,
  CalendarDays,
  Building2,
  ChevronLeft,
  ChevronRight,
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
const DAY_MS = 24 * 60 * 60 * 1000;

const addMonths = (date, delta) => {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
};

const isSameMonth = (a, b) => {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth();
};

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
      const dt = toDate(x?.ts || x?.time || x?.date || x?.createdAt || x?.created_date);
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
  const cutoff = startOfDay(now) - 6 * DAY_MS;

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
  const start = startOfDay(now) - (days - 1) * DAY_MS;

  const buckets = new Map();
  for (let i = 0; i < days; i++) {
    const t = start + i * DAY_MS;
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
    <div
      role="group"
      aria-label={ariaLabel || (label ? `${label}: ${v}` : undefined)}
      className="flex flex-col items-center"
    >
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
      className={cx("p-4 hover:bg-white/[0.055] transition-colors", className)}
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

/* UPDATED: left-aligned date number (week pills) */
const WeekDayPill = React.memo(function WeekDayPill({
  weekday,
  dayNum,
  isToday,
  isPast,
  hasActivity,
}) {
  const label = `${weekday} ${dayNum}${isToday ? " (Today)" : ""}${hasActivity ? " (Done)" : ""}`;

  return (
    <div className="min-w-0">
      <div
        className={cx(
          "text-center text-[12px] font-medium leading-none",
          isPast ? "text-slate-600" : "text-slate-400"
        )}
      >
        {weekday}
      </div>

      <div
        role="group"
        aria-label={label}
        title={label}
        className={cx(
          "relative mt-2 h-12 rounded-xl border border-white/10 bg-white/[0.035]",
          "flex items-center px-4",
          "transition-colors duration-150",
          "hover:bg-white/[0.055] hover:border-white/15",
          isPast ? "opacity-45" : "",
          isToday ? "ring-1 ring-purple-500/35 border-purple-500/25 bg-purple-500/10" : "",
          focusRing,
          "focus-visible:ring-purple-500/35"
        )}
      >
        <div
          className={cx(
            "text-[14px] font-semibold tabular-nums",
            isPast ? "text-slate-500" : "text-slate-200"
          )}
          aria-hidden="true"
        >
          {dayNum}
        </div>

        {hasActivity ? (
          <Check
            className={cx(
              "absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5",
              isPast ? "text-slate-500" : "text-emerald-300"
            )}
            aria-hidden="true"
          />
        ) : null}
      </div>
    </div>
  );
});

function MiniStat({ label, value, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[12px] font-medium text-slate-400">{label}</div>
        {Icon ? <Icon className="h-4 w-4 text-slate-400" aria-hidden="true" /> : null}
      </div>
      <div className="mt-1 text-lg font-semibold text-slate-100 tabular-nums">{value}</div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-7 space-y-6">
        <Card className="p-6">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="mt-3 h-4 w-72" />
          <div className="mt-4 grid grid-cols-7 gap-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
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

  // Monthly calendar preview (CLICK ONLY)
  const [monthPreviewOpen, setMonthPreviewOpen] = useState(false);
  const [monthCursor, setMonthCursor] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );

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
        dashRes.status === "rejected" &&
        jobsRes.status === "rejected" &&
        resumesRes.status === "rejected";

      if (allFailed) {
        const msg =
          dashRes.reason?.message ||
          jobsRes.reason?.message ||
          resumesRes.reason?.message ||
          "Failed to load dashboard.";
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
      {
        label: "First resume uploaded",
        done: hasResume,
        hint: "Upload a resume to generate docs faster.",
      },
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

  // Small calendar: current week (Sun-Sat)
  const weekMeta = useMemo(() => {
    const now = new Date();
    const todayKey = startOfDay(now);
    const startKey = todayKey - now.getDay() * DAY_MS;

    const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const days = labels.map((weekday, i) => {
      const key = startKey + i * DAY_MS;
      const d = new Date(key);
      const count = jobAddsByDay.get(key) || 0;
      return {
        key,
        weekday,
        dayNum: d.getDate(),
        hasActivity: count > 0,
        isToday: key === todayKey,
        isPast: key < todayKey,
      };
    });

    const activeDays = days.reduce((acc, x) => acc + (x.hasActivity ? 1 : 0), 0);
    const jobsThisWeek = days.reduce((acc, x) => acc + (jobAddsByDay.get(x.key) || 0), 0);

    return { days, activeDays, jobsThisWeek };
  }, [jobAddsByDay]);

  // Month preview grid
  const monthPreview = useMemo(() => {
    const today = new Date();
    const todayKey = startOfDay(today);

    const cursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
    const y = cursor.getFullYear();
    const m = cursor.getMonth();

    const first = new Date(y, m, 1);
    const firstDow = first.getDay(); // 0 Sun
    const gridStart = new Date(y, m, 1 - firstDow);

    const days = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
      const key = startOfDay(d);
      const inMonth = d.getMonth() === m;
      const count = jobAddsByDay.get(key) || 0;
      days.push({
        key,
        date: d,
        dayNum: d.getDate(),
        inMonth,
        hasActivity: count > 0,
        count,
        isToday: key === todayKey,
        isPast: key < todayKey,
      });
    }

    const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    const weekLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    const canGoNext = !isSameMonth(cursor, new Date(today.getFullYear(), today.getMonth(), 1));
    return { monthLabel, weekLabels, days, canGoNext };
  }, [jobAddsByDay, monthCursor]);

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

  // CLICK ONLY open/close
  const toggleMonthPreview = useCallback(() => setMonthPreviewOpen((v) => !v), []);
  const closeMonthPreview = useCallback(() => setMonthPreviewOpen(false), []);

  const goPrevMonth = useCallback(() => setMonthCursor((d) => addMonths(d, -1)), []);
  const goNextMonth = useCallback(() => {
    setMonthCursor((d) => {
      const today = new Date();
      const cur = new Date(d.getFullYear(), d.getMonth(), 1);
      const next = addMonths(cur, 1);
      const max = new Date(today.getFullYear(), today.getMonth(), 1);
      if (next.getTime() > max.getTime()) return cur;
      return next;
    });
  }, []);

  // Keep cursor from drifting into the future if user refreshes/loads later
  useEffect(() => {
    const today = new Date();
    const max = new Date(today.getFullYear(), today.getMonth(), 1);
    setMonthCursor((d) => {
      const cur = new Date(d.getFullYear(), d.getMonth(), 1);
      return cur.getTime() > max.getTime() ? max : cur;
    });
  }, []);

  // ESC closes month preview (no extra polling / no network)
  useEffect(() => {
    if (!monthPreviewOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") closeMonthPreview();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [monthPreviewOpen, closeMonthPreview]);

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
                <span className="text-slate-200 font-semibold">{totalApps}</span> applications •{" "}
                <span className="text-slate-200 font-semibold">{resumeCount}</span> resumes
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
                  {/* Small Calendar (7 days) + CLICK-only month preview */}
                  <Card aria-label="Weekly activity calendar" className="relative">
                    <CardHeader
                      className="items-center pb-4"
                      title="This week"
                      description={
                        <span className="text-slate-400">
                          <span className="text-slate-200 font-semibold">{weekMeta.activeDays}</span>{" "}
                          active days •{" "}
                          <span className="text-slate-200 font-semibold">{weekMeta.jobsThisWeek}</span>{" "}
                          jobs added
                        </span>
                      }
                      action={
                        <button
                          type="button"
                          onClick={toggleMonthPreview}
                          aria-label="Toggle month preview"
                          aria-expanded={monthPreviewOpen}
                          className={cx(
                            "rounded-xl border border-white/10 bg-white/[0.04] p-2",
                            "hover:bg-white/[0.07] active:bg-white/[0.09]",
                            focusRing
                          )}
                        >
                          <CalendarDays className="h-4 w-4 text-slate-300" aria-hidden="true" />
                        </button>
                      }
                    />

                    <CardContent className="pt-0">
                      <div className="grid grid-cols-7 gap-2">
                        {weekMeta.days.map((d) => (
                          <WeekDayPill
                            key={d.key}
                            weekday={d.weekday}
                            dayNum={d.dayNum}
                            isToday={d.isToday}
                            isPast={d.isPast}
                            hasActivity={d.hasActivity}
                          />
                        ))}
                      </div>
                    </CardContent>

                    {/* Click preview: full month calendar with month picker */}
                    <AnimatePresence>
                      {monthPreviewOpen ? (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 8 }}
                          transition={{ duration: 0.16 }}
                          className={cx("absolute left-0 top-full mt-3 z-50", "w-full sm:w-[560px]")}
                        >
                          <div className="rounded-2xl border border-white/10 bg-[hsl(var(--ds-bg))] shadow-[0_20px_60px_rgba(0,0,0,.6)] overflow-hidden">
                            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10 bg-white/[0.03]">
                              <div className="min-w-0">
                                <div className="text-[12px] text-slate-400">Monthly preview</div>
                                <div className="text-base font-semibold text-slate-100 truncate">
                                  {monthPreview.monthLabel}
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={goPrevMonth}
                                  className={cx(
                                    "h-9 w-9 grid place-items-center rounded-xl border border-white/10 bg-white/[0.04]",
                                    "hover:bg-white/[0.07] active:bg-white/[0.09]",
                                    focusRing
                                  )}
                                  aria-label="Previous month"
                                >
                                  <ChevronLeft className="h-4 w-4 text-slate-200" aria-hidden="true" />
                                </button>

                                <button
                                  type="button"
                                  onClick={goNextMonth}
                                  disabled={!monthPreview.canGoNext}
                                  className={cx(
                                    "h-9 w-9 grid place-items-center rounded-xl border border-white/10 bg-white/[0.04]",
                                    "hover:bg-white/[0.07] active:bg-white/[0.09]",
                                    !monthPreview.canGoNext ? "opacity-40 cursor-not-allowed" : "",
                                    focusRing
                                  )}
                                  aria-label="Next month"
                                >
                                  <ChevronRight className="h-4 w-4 text-slate-200" aria-hidden="true" />
                                </button>
                              </div>
                            </div>

                            <div className="p-5">
                              {/* Weekday headers */}
                              <div className="grid grid-cols-7 gap-2">
                                {monthPreview.weekLabels.map((w) => (
                                  <div
                                    key={w}
                                    className="text-center text-[12px] font-medium text-slate-500"
                                  >
                                    {w}
                                  </div>
                                ))}
                              </div>

                              {/* Month grid */}
                              <div className="mt-2 grid grid-cols-7 gap-2">
                                {monthPreview.days.map((d) => {
                                  const label = `${d.date.toLocaleDateString(undefined, {
                                    weekday: "long",
                                    month: "long",
                                    day: "numeric",
                                    year: "numeric",
                                  })}${d.hasActivity ? ` — ${d.count} job(s) added` : ""}`;

                                  return (
                                    <div
                                      key={d.key}
                                      title={label}
                                      aria-label={label}
                                      className={cx(
                                        "relative h-12 rounded-xl border border-white/10 bg-white/[0.03]",
                                        "grid place-items-center select-none transition-colors",
                                        d.inMonth
                                          ? "hover:bg-white/[0.06] hover:border-white/15"
                                          : "opacity-30",
                                        d.isToday
                                          ? "ring-1 ring-purple-500/35 border-purple-500/25 bg-purple-500/10"
                                          : ""
                                      )}
                                    >
                                      <div
                                        className={cx(
                                          "text-[13px] font-semibold tabular-nums",
                                          d.inMonth ? "text-slate-200" : "text-slate-500"
                                        )}
                                        aria-hidden="true"
                                      >
                                        {d.dayNum}
                                      </div>

                                      {d.hasActivity ? (
                                        <Check
                                          className="absolute inset-0 m-auto h-5 w-5 text-emerald-300"
                                          aria-hidden="true"
                                        />
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>

                              <div className="mt-4 flex items-center justify-between gap-3 text-[12px] text-slate-500">
                                <div className="flex items-center gap-2">
                                  <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400/80" />
                                  Days you added jobs
                                </div>
                                <div className="text-slate-600">Press Esc to close</div>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </Card>

                  {/* UPDATED: New Job CTA — BIG PURPLE + only, high-contrast border */}
                  <Card
                    as="button"
                    type="button"
                    aria-label="Create a new job"
                    onClick={handleNewJob}
                    className={cx(
                      "w-full relative overflow-hidden min-h-[220px]",
                      "border-2 border-purple-500/70 ring-1 ring-purple-500/35",
                      "bg-gradient-to-b from-purple-500/18 via-purple-500/[0.06] to-white/[0.03]",
                      "shadow-[0_0_0_1px_rgba(168,85,247,0.35),0_30px_90px_rgba(168,85,247,0.14)]",
                      "hover:border-purple-400/85 hover:ring-purple-400/45 hover:bg-white/[0.05]",
                      "transition-colors",
                      focusRing
                    )}
                  >
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute -top-24 -left-24 h-64 w-64 rounded-full bg-purple-500/18 blur-3xl"
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute -bottom-28 -right-28 h-72 w-72 rounded-full bg-purple-500/14 blur-3xl"
                    />

                    <CardContent className="p-10 sm:p-12 grid place-items-center">
                      <motion.div
                        initial={{ scale: 1 }}
                        animate={{ scale: [1, 1.03, 1] }}
                        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                        className="grid place-items-center"
                      >
                        <Plus
                          className="h-24 w-24 sm:h-28 sm:w-28 text-purple-300 drop-shadow-[0_18px_55px_rgba(168,85,247,0.35)]"
                          aria-hidden="true"
                        />
                        <span className="sr-only">New Job</span>
                      </motion.div>
                    </CardContent>
                  </Card>

                  {/* Insights */}
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
                            <ProgressRing
                              value={weekApps}
                              max={weekMax}
                              color="purple"
                              label="Apps"
                              ariaLabel="Applications this week"
                            />
                            <ProgressRing
                              value={weekInterviews}
                              max={weekMax}
                              color="cyan"
                              label="Interviews"
                              ariaLabel="Interviews this week"
                            />
                            <ProgressRing
                              value={weekOffers}
                              max={weekMax}
                              color="green"
                              label="Offers"
                              ariaLabel="Offers this week"
                            />
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
                    <CardHeader
                      title="Recent activity"
                      action={<Clock className="h-4 w-4 text-slate-400" aria-hidden="true" />}
                    />
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
                                {activity.type === "job_added" && (
                                  <Plus className="h-4 w-4 text-purple-300" />
                                )}
                                {activity.type === "doc_generated" && (
                                  <FileText className="h-4 w-4 text-cyan-300" />
                                )}
                                {activity.type === "status_changed" && (
                                  <TrendingUp className="h-4 w-4 text-emerald-300" />
                                )}
                              </div>

                              <div className="min-w-0 flex-1">
                                <p className="text-[length:var(--ds-body)] text-slate-200">
                                  {activity.text}
                                </p>
                                <p className="mt-1 text-[length:var(--ds-caption)] text-slate-500">
                                  {activity.time}
                                </p>
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
                    <CardHeader
                      className="items-center pb-4"
                      title="Goals"
                      description="Track progress across applications and resumes."
                    />
                    <CardContent className="pt-0 space-y-4">
                      <Card className="p-4">
                        <div className="text-[length:var(--ds-h3)] font-semibold text-slate-200 mb-3">
                          Goal progress
                        </div>
                        <GoalProgress applicationCount={totalApps} />
                      </Card>

                      <Card className="p-4" aria-label="Applications goal progress">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="text-[length:var(--ds-caption)] text-slate-400">
                              Applications goal
                            </div>
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

                      <Card className="p-4" aria-label="Resumes goal progress">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="text-[length:var(--ds-caption)] text-slate-400">
                              Resumes goal
                            </div>
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
                    <CardHeader
                      title="Achievements"
                      description="Next milestones to unlock."
                      action={<Trophy className="h-4 w-4 text-amber-300" aria-hidden="true" />}
                    />
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
                              <div className="mt-1 text-[length:var(--ds-caption)] text-slate-500">
                                {a.hint}
                              </div>
                            ) : null}
                          </div>

                          <Badge variant={a.done ? "success" : "muted"}>{a.done ? "done" : "next"}</Badge>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  {/* Quick Tips */}
                  <Card aria-label="Quick tips">
                    <CardHeader
                      title="Quick tips"
                      description="Small actions that move results."
                      action={<Lightbulb className="h-4 w-4 text-cyan-300" aria-hidden="true" />}
                    />
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
                    <CardHeader
                      title="Next actions"
                      description="Today’s checklist."
                      action={<ListChecks className="h-4 w-4 text-purple-300" aria-hidden="true" />}
                    />
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
                  <CardHeader
                    title="Pipeline conversion"
                    description="How your funnel is performing."
                    action={<Target className="h-4 w-4 text-purple-300" aria-hidden="true" />}
                  />
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
