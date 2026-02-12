import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import AppNav from "@/components/app/AppNav";
import GoalProgress from "@/components/app/GoalProgress";
import { Button } from "@/components/ui/button";
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
  Square,
  CalendarDays,
  Building2,
  ArrowUpRight,
} from "lucide-react";
import { motion } from "framer-motion";

const APP_GOAL = 200;
const RESUME_GOAL = 10;

const CircularMetric = ({ value, label, color = "purple", max = 20 }) => {
  const safeMax = Math.max(1, Number(max) || 20);
  const percentage = Math.min((Number(value || 0) / safeMax) * 100, 100);
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const colorClasses = {
    purple: {
      stroke: "stroke-purple-500",
      text: "text-purple-400",
      bg: "bg-purple-500/10",
    },
    cyan: {
      stroke: "stroke-cyan-500",
      text: "text-cyan-400",
      bg: "bg-cyan-500/10",
    },
    green: {
      stroke: "stroke-green-500",
      text: "text-green-400",
      bg: "bg-green-500/10",
    },
  };

  const colors = colorClasses[color] || colorClasses.purple;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-32 h-32">
        <svg className="w-32 h-32 transform -rotate-90">
          <circle
            cx="64"
            cy="64"
            r="45"
            stroke="currentColor"
            strokeWidth="8"
            fill="none"
            className="text-white/5"
          />
          <circle
            cx="64"
            cy="64"
            r="45"
            stroke="currentColor"
            strokeWidth="8"
            fill="none"
            className={colors.stroke}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 900ms ease-out" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-3xl font-bold text-white">{value}</span>
        </div>
      </div>
      <p className="text-sm text-white/60 mt-3">{label}</p>
      <p className="text-xs text-white/30 mt-1">vs last week</p>
    </div>
  );
};

const GoalRing = ({ value = 0, goal = 100, label, color = "purple" }) => {
  const v = Math.max(0, Number(value) || 0);
  const g = Math.max(1, Number(goal) || 1);
  const pct = Math.min((v / g) * 100, 100);

  const circumference = 2 * Math.PI * 42;
  const strokeDashoffset = circumference - (pct / 100) * circumference;

  const colorClasses = {
    purple: {
      stroke: "stroke-purple-500",
      badge: "bg-purple-500/10 text-purple-300",
    },
    cyan: {
      stroke: "stroke-cyan-500",
      badge: "bg-cyan-500/10 text-cyan-300",
    },
    green: {
      stroke: "stroke-green-500",
      badge: "bg-green-500/10 text-green-300",
    },
    amber: {
      stroke: "stroke-amber-500",
      badge: "bg-amber-500/10 text-amber-300",
    },
  };

  const c = colorClasses[color] || colorClasses.purple;

  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-white/80">{label}</div>
        <span className={`text-xs px-2 py-1 rounded-lg ${c.badge}`}>
          {Math.round(pct)}%
        </span>
      </div>

      <div className="mt-3 flex items-center gap-4">
        <div className="relative w-24 h-24 shrink-0">
          <svg className="w-24 h-24 transform -rotate-90">
            <circle
              cx="48"
              cy="48"
              r="42"
              stroke="currentColor"
              strokeWidth="8"
              fill="none"
              className="text-white/5"
            />
            <circle
              cx="48"
              cy="48"
              r="42"
              stroke="currentColor"
              strokeWidth="8"
              fill="none"
              className={c.stroke}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              style={{ transition: "stroke-dashoffset 900ms ease-out" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="text-lg font-bold text-white">{v}</div>
              <div className="text-[11px] text-white/35">/ {g}</div>
            </div>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-xs text-white/40">Progress</div>
          <div className="mt-2 h-2 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-2 rounded-full bg-white/20"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-2 text-xs text-white/35">
            {g - v > 0 ? `${g - v} to go` : "Goal hit 🎉"}
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------
// Helpers (data only)
// ---------------------------
const apiFetch = async (path, options = {}) => {
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

const startOfDay = (d) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const normalizeStatus = (s) => String(s ?? "").trim().toLowerCase();

const titleCase = (s) => {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const normalizeJobsList = (jobs) =>
  Array.isArray(jobs) ? jobs : jobs?.jobs || jobs?.items || jobs?.resources || [];

const pickJobTitle = (job) =>
  job?.job_title || job?.jobTitle || job?.title || job?.role || "Job";

const pickCompany = (job) =>
  job?.company || job?.companyName || job?.employer || "Company";

const pickCreated = (job) =>
  job?.created_date ||
  job?.createdAt ||
  job?.created_at ||
  job?.created ||
  job?.timestamp;

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
  const todayStart = startOfDay(now);
  const cutoff = todayStart - 6 * 24 * 60 * 60 * 1000;

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
  const list = normalizeJobsList(jobs);
  const now = new Date();
  const start = startOfDay(now) - (days - 1) * 24 * 60 * 60 * 1000;

  const buckets = new Map();
  for (let i = 0; i < days; i++) {
    const t = start + i * 24 * 60 * 60 * 1000;
    buckets.set(t, 0);
  }

  for (const job of list) {
    const created = toDate(pickCreated(job));
    if (!created) continue;
    const key = startOfDay(created);
    if (key >= start && buckets.has(key)) {
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }
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
  // Sunday-based week grid
  const first = new Date(year, monthIndex, 1);
  const last = new Date(year, monthIndex + 1, 0);
  const start = new Date(year, monthIndex, 1 - first.getDay()); // start Sunday
  const end = new Date(year, monthIndex, last.getDate() + (6 - last.getDay())); // end Saturday

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

export default function AppHome() {
  const navigate = useNavigate();

  const [recentActivity, setRecentActivity] = useState([]);

  const [weekApps, setWeekApps] = useState(0);
  const [weekInterviews, setWeekInterviews] = useState(0);
  const [weekOffers, setWeekOffers] = useState(0);

  const [totalApps, setTotalApps] = useState(0);
  const [resumeCount, setResumeCount] = useState(0);

  const [dailySeries, setDailySeries] = useState([]);
  const [statusCounts, setStatusCounts] = useState({
    generated: 0,
    applied: 0,
    interview: 0,
    offer: 0,
    rejected: 0,
    other: 0,
  });

  // store normalized list for real-data UI panels (calendar + insights)
  const [jobsList, setJobsList] = useState([]);

  const handleNewJob = () => {
    navigate(createPageUrl("NewJob"));
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const [dashRes, jobsRes, resumesRes] = await Promise.allSettled([
        apiFetch("/api/dashboard", { method: "GET" }),
        apiFetch("/api/jobs", { method: "GET" }),
        apiFetch("/api/resume/list", { method: "GET" }),
      ]);

      if (cancelled) return;

      const dash = dashRes.status === "fulfilled" ? dashRes.value : null;
      const jobs = jobsRes.status === "fulfilled" ? jobsRes.value : null;
      const resumes = resumesRes.status === "fulfilled" ? resumesRes.value : null;

      // --- Recent Activity ---
      const dashActivity = dash ? normalizeRecentActivityFromDashboard(dash) : [];
      if (dashActivity.length) setRecentActivity(dashActivity);
      else if (jobs) setRecentActivity(buildRecentActivityFromJobs(jobs));
      else setRecentActivity([]);

      // --- Week Metrics ---
      const wk =
        dash?.thisWeek ||
        dash?.week ||
        dash?.weekly ||
        dash?.stats?.thisWeek ||
        dash?.stats?.week ||
        dash?.metrics ||
        null;

      const wkAppsRaw =
        wk?.applications ??
        wk?.apps ??
        wk?.jobs ??
        wk?.applicationsCount ??
        wk?.totalApplications;
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

      // --- Totals + Charts (from jobs) ---
      if (jobs) {
        const list = normalizeJobsList(jobs);
        setJobsList(list);
        setTotalApps(list.length);
        setDailySeries(buildLastNDaysSeries(jobs, 7));
        setStatusCounts(countStatusesAllTime(jobs));
      } else {
        setJobsList([]);
      }

      // --- Resume count ---
      if (resumes) {
        const items =
          resumes?.items ||
          resumes?.resumes ||
          resumes?.resources ||
          resumes?.files ||
          (Array.isArray(resumes) ? resumes : []);
        setResumeCount(Array.isArray(items) ? items.length : 0);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const weekMax = useMemo(() => {
    return Math.max(20, weekApps, weekInterviews, weekOffers);
  }, [weekApps, weekInterviews, weekOffers]);

  const dailyMax = useMemo(() => {
    const m = Math.max(1, ...(dailySeries || []).map((d) => d.value || 0));
    return m;
  }, [dailySeries]);

  const topStatusRows = useMemo(() => {
    const entries = Object.entries(statusCounts || {});
    const keep = entries
      .filter(([k]) => k !== "other")
      .sort((a, b) => (b[1] || 0) - (a[1] || 0));
    return keep.slice(0, 5);
  }, [statusCounts]);

  const streak = useMemo(() => computeStreak(dailySeries), [dailySeries]);

  const achievements = useMemo(() => {
    const hasApps = totalApps > 0;
    const hasResume = resumeCount > 0;
    const firstInterview = (statusCounts?.interview || 0) > 0;
    const firstOffer = (statusCounts?.offer || 0) > 0;

    const tiers = [
      {
        label: "First job added",
        done: hasApps,
        hint: "Add a job to start your pipeline.",
      },
      {
        label: "First resume uploaded",
        done: hasResume,
        hint: "Upload a resume to generate docs faster.",
      },
      {
        label: "10 applications",
        done: totalApps >= 10,
        hint: "Momentum beats intensity — keep it consistent.",
      },
      {
        label: "25 applications",
        done: totalApps >= 25,
        hint: "Nice volume — keep your tracking clean.",
      },
      {
        label: "First interview",
        done: firstInterview,
        hint: "Interviews come from follow-ups + volume.",
      },
      {
        label: "First offer",
        done: firstOffer,
        hint: "Offers come from reps + tight targeting.",
      },
      {
        label: "3-day streak",
        done: streak >= 3,
        hint: "Try 1 job/day — consistency wins.",
      },
    ];

    const notDone = tiers.filter((t) => !t.done);
    const done = tiers.filter((t) => t.done);
    return [...notDone, ...done].slice(0, 5);
  }, [resumeCount, statusCounts, streak, totalApps]);

  const tips = useMemo(() => {
    const t = [];

    if (weekApps <= 2) t.push("Aim for 3–5 adds/week to keep your pipeline warm.");
    else t.push("Great weekly pace — keep it consistent, not spiky.");

    if ((statusCounts?.applied || 0) > 0 && (statusCounts?.interview || 0) === 0) {
      t.push("Add a simple follow-up 48h after applying — it boosts replies.");
    } else if ((statusCounts?.interview || 0) > 0) {
      t.push("Track questions you missed + improve one answer per interview.");
    }

    if (resumeCount === 0) t.push("Upload 1 strong baseline resume. Then clone per role type.");
    else if (resumeCount < 3) t.push("Create 2–3 resume variants by role (Help Desk, DevOps, SWE).");

    t.push("Keep every job entry clean: title, company, link, and status date.");

    return t.slice(0, 4);
  }, [resumeCount, statusCounts, weekApps]);

  const checklist = useMemo(() => {
    const items = [
      { label: "Add 1–3 jobs today", done: streak > 0 },
      { label: "Generate docs for 1 job", done: (statusCounts?.generated || 0) > 0 },
      { label: "Follow up on 2 applications", done: weekApps > 0 },
      { label: "Upload / update a resume", done: resumeCount > 0 },
    ];
    return items.slice(0, 4);
  }, [resumeCount, statusCounts, streak, weekApps]);

  // --- Calendar + bottom insights (real data derived from jobsList) ---
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

    return {
      year,
      monthIndex,
      monthName,
      cells,
      todayKey,
      activeDays,
      jobsThisMonth,
    };
  }, [jobAddsByDay]);

  const last30 = useMemo(() => {
    const now = new Date();
    const cutoff = startOfDay(now) - 29 * 24 * 60 * 60 * 1000;
    let adds = 0;
    const uniqueDays = new Set();
    const dayCounts = new Map();

    for (const job of jobsList || []) {
      const created = toDate(pickCreated(job));
      if (!created) continue;
      const k = startOfDay(created);
      if (k < cutoff) continue;
      adds += 1;
      uniqueDays.add(k);
      dayCounts.set(k, (dayCounts.get(k) || 0) + 1);
    }

    let bestDayTs = null;
    let bestDayCount = 0;
    for (const [k, c] of dayCounts.entries()) {
      if (c > bestDayCount) {
        bestDayCount = c;
        bestDayTs = k;
      }
    }

    const bestDayLabel = bestDayTs
      ? new Date(bestDayTs).toLocaleDateString(undefined, { month: "short", day: "numeric" })
      : "—";

    const activeDays = uniqueDays.size;
    const avg = activeDays ? (adds / activeDays).toFixed(1) : "0.0";

    return { adds, activeDays, avg, bestDayLabel, bestDayCount };
  }, [jobsList]);

  const conversion = useMemo(() => {
    const applied = Number(statusCounts?.applied || 0);
    const interviews = Number(statusCounts?.interview || 0);
    const offers = Number(statusCounts?.offer || 0);

    const interviewRate = applied ? Math.round((interviews / applied) * 100) : 0;
    const offerFromInterview = interviews ? Math.round((offers / interviews) * 100) : 0;
    const offerFromApplied = applied ? Math.round((offers / applied) * 100) : 0;

    return {
      applied,
      interviews,
      offers,
      interviewRate,
      offerFromInterview,
      offerFromApplied,
    };
  }, [statusCounts]);

  const topCompanies = useMemo(() => {
    const map = new Map();
    for (const job of jobsList || []) {
      const c = String(pickCompany(job) || "").trim();
      if (!c) continue;
      map.set(c, (map.get(c) || 0) + 1);
    }
    const arr = Array.from(map.entries())
      .sort((a, b) => (b[1] || 0) - (a[1] || 0))
      .slice(0, 5)
      .map(([company, count]) => ({ company, count }));

    const max = Math.max(1, ...arr.map((x) => x.count || 0));
    return { rows: arr, max };
  }, [jobsList]);

  return (
    <div className="min-h-screen bg-[hsl(240,10%,4%)]">
      <AppNav currentPage="AppHome" />

      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.3 }}
        className="max-w-7xl mx-auto px-4 sm:px-6 py-8"
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-white">Dashboard</h1>
            <p className="text-white/35 mt-1 text-sm">
              All-time:{" "}
              <span className="text-white/70 font-semibold">{totalApps}</span>{" "}
              applications •{" "}
              <span className="text-white/70 font-semibold">{resumeCount}</span>{" "}
              resumes
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleNewJob}
              className="bg-purple-600 hover:bg-purple-500 text-white rounded-xl"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Job
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate(createPageUrl("Analytics"))}
              className="rounded-xl border-white/10 bg-white/[0.04] text-white/80 hover:bg-white/[0.08]"
            >
              <BarChart3 className="w-4 h-4 mr-2" />
              Analytics
            </Button>
          </div>
        </div>

        {/* MAIN GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT COLUMN */}
          <div className="lg:col-span-7 space-y-6">
            {/* Calendar ABOVE New Job */}
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-white/50" />
                  <div className="text-sm font-semibold text-white/75">
                    {monthMeta.monthName} activity
                  </div>
                </div>
                <div className="text-xs text-white/35">
                  <span className="text-white/70 font-semibold">
                    {monthMeta.activeDays}
                  </span>{" "}
                  active days •{" "}
                  <span className="text-white/70 font-semibold">
                    {monthMeta.jobsThisMonth}
                  </span>{" "}
                  jobs added
                </div>
              </div>

              {/* weekday header */}
              <div className="grid grid-cols-7 gap-2 text-[11px] text-white/30 mb-2">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div key={d} className="text-center">
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-2">
                {monthMeta.cells.map((cell) => {
                  const k = startOfDay(cell.date);
                  const count = jobAddsByDay.get(k) || 0;
                  const isFuture = k > monthMeta.todayKey;
                  const isToday = k === monthMeta.todayKey;

                  const base =
                    "rounded-xl border border-white/10 bg-white/5 p-2 h-[54px] flex flex-col justify-between";
                  const muted = !cell.inMonth ? "opacity-35" : "";
                  const future = isFuture ? "opacity-60" : "";
                  const todayRing = isToday ? "ring-1 ring-purple-500/35" : "";

                  const done = count > 0 && cell.inMonth && !isFuture;

                  return (
                    <div
                      key={cell.key}
                      className={`${base} ${muted} ${future} ${todayRing}`}
                      title={
                        cell.inMonth
                          ? done
                            ? `${count} job${count === 1 ? "" : "s"} added`
                            : "No job added"
                          : ""
                      }
                    >
                      <div className="flex items-start justify-between">
                        <div className="text-xs text-white/70">
                          {cell.date.getDate()}
                        </div>

                        {cell.inMonth ? (
                          done ? (
                            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-green-500/10 text-green-300 text-[11px]">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Done</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 text-white/35 text-[11px]">
                              <Square className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">—</span>
                            </div>
                          )
                        ) : (
                          <div className="h-6" />
                        )}
                      </div>

                      <div className="flex items-end justify-between">
                        <div className="text-[11px] text-white/35">
                          {done ? `${count} job${count === 1 ? "" : "s"}` : ""}
                        </div>
                        {isToday && (
                          <div className="text-[10px] px-2 py-1 rounded-lg bg-purple-500/10 text-purple-300">
                            today
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 text-xs text-white/35">
                Tip: keep a streak by adding at least{" "}
                <span className="text-white/70 font-semibold">1 job/day</span>.
              </div>
            </div>

            {/* BIGGER New Job Hero */}
            <button
              onClick={handleNewJob}
              className="relative w-full rounded-[28px] bg-gradient-to-br from-purple-600/25 to-purple-600/5 border-2 border-purple-500/35 hover:border-purple-500/55 hover:shadow-2xl hover:shadow-purple-500/25 hover:-translate-y-1 transition-all group overflow-hidden"
            >
              <div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer"
                style={{ backgroundSize: "200% 100%" }}
              />
              <div className="relative flex flex-col md:flex-row items-center justify-between gap-10 p-12 sm:p-14 md:p-16 min-h-[240px]">
                <div className="flex items-center gap-6 w-full">
                  <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-purple-600 flex items-center justify-center group-hover:scale-105 transition-transform shadow-2xl shadow-purple-500/40">
                    <Plus className="w-12 h-12 sm:w-14 sm:h-14 text-white" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-3xl sm:text-4xl font-extrabold text-white mb-2">
                      New Job
                    </h3>
                    <p className="text-white/50 text-sm sm:text-base max-w-xl">
                      Add a job, then generate tailored documents and track status changes.
                    </p>

                    <div className="mt-5 flex flex-wrap items-center gap-2">
                      <span className="text-xs px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-white/60">
                        Faster pipeline
                      </span>
                      <span className="text-xs px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-white/60">
                        Clean tracking
                      </span>
                      <span className="text-xs px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-white/60">
                        Better follow-ups
                      </span>
                    </div>
                  </div>
                </div>

                <div className="w-full md:w-auto flex md:flex-col items-center md:items-end gap-3">
                  <div className="grid grid-cols-3 md:grid-cols-1 gap-3 w-full md:w-[180px]">
                    <div className="rounded-2xl bg-white/5 border border-white/10 px-4 py-3">
                      <div className="text-xs text-white/35">This week</div>
                      <div className="text-xl font-bold text-white">{weekApps} apps</div>
                    </div>
                    <div className="rounded-2xl bg-white/5 border border-white/10 px-4 py-3">
                      <div className="text-xs text-white/35">Streak</div>
                      <div className="text-xl font-bold text-white">{streak}d</div>
                    </div>
                    <div className="rounded-2xl bg-white/5 border border-white/10 px-4 py-3">
                      <div className="text-xs text-white/35">Offers</div>
                      <div className="text-xl font-bold text-white">{weekOffers}</div>
                    </div>
                  </div>

                  <div className="hidden md:flex items-center gap-2 text-xs text-white/40 mt-1">
                    <span className="px-2 py-1 rounded-lg bg-purple-500/10 text-purple-200">
                      click to add
                    </span>
                    <ArrowUpRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            </button>

            {/* Activity Graph + Breakdown */}
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-purple-400" />
                  <h2 className="text-sm font-medium text-white/60">
                    Last 7 days (applications added)
                  </h2>
                </div>
                {/* removed "from Cosmos (jobs.createdAt)" */}
              </div>

              <div className="grid grid-cols-7 gap-3 items-end h-28">
                {(dailySeries.length
                  ? dailySeries
                  : Array.from({ length: 7 }).map((_, i) => ({
                      label: "—",
                      value: 0,
                      ts: i,
                    }))
                ).map((d, i) => {
                  const h = Math.round(((d.value || 0) / dailyMax) * 100);
                  return (
                    <div
                      key={d.ts || i}
                      className="flex flex-col items-center gap-2"
                    >
                      <div className="w-full h-20 rounded-xl bg-white/5 border border-white/10 overflow-hidden flex items-end">
                        <div
                          className="w-full bg-white/20"
                          style={{ height: `${Math.max(6, h)}%` }}
                        />
                      </div>
                      <div className="text-[11px] text-white/35">
                        {d.label || "—"}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Target className="w-4 h-4 text-cyan-400" />
                    <div className="text-sm font-semibold text-white/75">
                      Status breakdown
                    </div>
                  </div>

                  <div className="space-y-2">
                    {topStatusRows.map(([k, v]) => {
                      const pct = totalApps
                        ? Math.round(((v || 0) / totalApps) * 100)
                        : 0;
                      return (
                        <div key={k} className="flex items-center gap-3">
                          <div className="w-20 text-xs text-white/45 capitalize">
                            {k}
                          </div>
                          <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                            <div
                              className="h-2 bg-white/20 rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="w-10 text-right text-xs text-white/45">
                            {v}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="w-4 h-4 text-green-400" />
                    <div className="text-sm font-semibold text-white/75">
                      Momentum
                    </div>
                  </div>
                  <div className="text-xs text-white/40">
                    Keep the graph “warm” by adding 1–3 jobs/day. It makes your
                    pipeline predictable (and your stats climb faster).
                  </div>

                  <div className="mt-3 flex items-center gap-3">
                    <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2">
                      <div className="text-[11px] text-white/35">This week</div>
                      <div className="text-lg font-bold text-white">{weekApps}</div>
                    </div>
                    <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2">
                      <div className="text-[11px] text-white/35">Interviews</div>
                      <div className="text-lg font-bold text-white">
                        {weekInterviews}
                      </div>
                    </div>
                    <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2">
                      <div className="text-[11px] text-white/35">Offers</div>
                      <div className="text-lg font-bold text-white">{weekOffers}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="glass-card rounded-2xl p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">Recent Activity</h2>
                <Clock className="w-5 h-5 text-white/40" />
              </div>

              {recentActivity.length > 0 ? (
                <div className="space-y-4">
                  {recentActivity.map((activity) => (
                    <div
                      key={activity.id}
                      className="flex items-start gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
                    >
                      <div
                        className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          activity.type === "job_added"
                            ? "bg-purple-500/10"
                            : activity.type === "doc_generated"
                            ? "bg-cyan-500/10"
                            : "bg-green-500/10"
                        }`}
                      >
                        {activity.type === "job_added" && (
                          <Plus className="w-5 h-5 text-purple-400" />
                        )}
                        {activity.type === "doc_generated" && (
                          <FileText className="w-5 h-5 text-cyan-400" />
                        )}
                        {activity.type === "status_changed" && (
                          <TrendingUp className="w-5 h-5 text-green-400" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-white/80">{activity.text}</p>
                        <p className="text-xs text-white/40 mt-1">{activity.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-white/40 mb-4">No activity yet</p>
                  <Button
                    onClick={handleNewJob}
                    className="bg-purple-600 hover:bg-purple-500 text-white rounded-xl"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Your First Job
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="lg:col-span-5 space-y-6">
            {/* Goals */}
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-purple-400" />
                  <h2 className="text-sm font-medium text-white/60">Goals</h2>
                </div>
                <span className="text-xs text-white/30">custom</span>
              </div>

              <div className="space-y-4">
                <GoalProgress applicationCount={totalApps} />
                <GoalRing
                  value={totalApps}
                  goal={APP_GOAL}
                  label={`Applications goal (${APP_GOAL})`}
                  color="purple"
                />
                <GoalRing
                  value={resumeCount}
                  goal={RESUME_GOAL}
                  label={`Resumes goal (${RESUME_GOAL})`}
                  color="cyan"
                />
              </div>
            </div>

            {/* This Week */}
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-white/50" />
                  <h2 className="text-sm font-medium text-white/60">This Week</h2>
                </div>
                <span className="text-xs text-white/30">last 7 days</span>
              </div>

              <div className="grid grid-cols-3 gap-6">
                <CircularMetric
                  value={weekApps}
                  label="Apps"
                  color="purple"
                  max={weekMax}
                />
                <CircularMetric
                  value={weekInterviews}
                  label="Interviews"
                  color="cyan"
                  max={weekMax}
                />
                <CircularMetric
                  value={weekOffers}
                  label="Offers"
                  color="green"
                  max={weekMax}
                />
              </div>
            </div>

            {/* Achievements */}
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-300" />
                  <h2 className="text-sm font-medium text-white/60">Achievements</h2>
                </div>
                <span className="text-xs text-white/30">progress</span>
              </div>

              <div className="space-y-3">
                {achievements.map((a) => (
                  <div
                    key={a.label}
                    className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/10"
                  >
                    <div className="mt-0.5">
                      {a.done ? (
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                      ) : (
                        <Sparkles className="w-4 h-4 text-purple-300" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-white/80">{a.label}</div>
                      {!a.done && (
                        <div className="text-xs text-white/35 mt-0.5">{a.hint}</div>
                      )}
                    </div>
                    <div
                      className={`text-[11px] px-2 py-1 rounded-lg ${
                        a.done
                          ? "bg-green-500/10 text-green-300"
                          : "bg-white/5 text-white/45"
                      }`}
                    >
                      {a.done ? "done" : "next"}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Tips */}
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-cyan-300" />
                  <h2 className="text-sm font-medium text-white/60">Quick Tips</h2>
                </div>
                <span className="text-xs text-white/30">today</span>
              </div>

              <div className="space-y-3">
                {tips.map((t, i) => (
                  <div
                    key={`${i}-${t}`}
                    className="p-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white/75"
                  >
                    {t}
                  </div>
                ))}
              </div>
            </div>

            {/* Next Actions */}
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <ListChecks className="w-4 h-4 text-purple-300" />
                  <h2 className="text-sm font-medium text-white/60">Next Actions</h2>
                </div>
                <span className="text-xs text-white/30">checklist</span>
              </div>

              <div className="space-y-2">
                {checklist.map((c) => (
                  <div
                    key={c.label}
                    className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10"
                  >
                    <div className="text-sm text-white/80">{c.label}</div>
                    <span
                      className={`text-[11px] px-2 py-1 rounded-lg ${
                        c.done
                          ? "bg-green-500/10 text-green-300"
                          : "bg-white/5 text-white/45"
                      }`}
                    >
                      {c.done ? "done" : "todo"}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center gap-2">
                <Button
                  onClick={() => navigate(createPageUrl("Applications"))}
                  variant="outline"
                  className="flex-1 rounded-xl border-white/10 bg-white/[0.04] text-white/80 hover:bg-white/[0.08]"
                >
                  <TrendingUp className="w-4 h-4 mr-2" />
                  Applications
                </Button>
                <Button
                  onClick={() => navigate(createPageUrl("Resumes"))}
                  variant="outline"
                  className="flex-1 rounded-xl border-white/10 bg-white/[0.04] text-white/80 hover:bg-white/[0.08]"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Resumes
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM: more real-data filler */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Pipeline Conversion */}
          <div className="lg:col-span-4 glass-card rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-purple-300" />
                <h3 className="text-sm font-medium text-white/70">Pipeline conversion</h3>
              </div>
              <span className="text-xs text-white/30">all-time</span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <div className="text-xs text-white/35">Applied</div>
                <div className="text-2xl font-bold text-white mt-1">{conversion.applied}</div>
              </div>
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <div className="text-xs text-white/35">Interviews</div>
                <div className="text-2xl font-bold text-white mt-1">{conversion.interviews}</div>
              </div>
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <div className="text-xs text-white/35">Offers</div>
                <div className="text-2xl font-bold text-white mt-1">{conversion.offers}</div>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <div className="text-white/60">Interview rate (interviews / applied)</div>
                <div className="text-white/85 font-semibold">{conversion.interviewRate}%</div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="text-white/60">Offer rate (offers / interviews)</div>
                <div className="text-white/85 font-semibold">{conversion.offerFromInterview}%</div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="text-white/60">Offer rate (offers / applied)</div>
                <div className="text-white/85 font-semibold">{conversion.offerFromApplied}%</div>
              </div>
            </div>
          </div>

          {/* Last 30 Days Summary */}
          <div className="lg:col-span-4 glass-card rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-white/50" />
                <h3 className="text-sm font-medium text-white/70">Last 30 days</h3>
              </div>
              <span className="text-xs text-white/30">real totals</span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <div className="text-xs text-white/35">Jobs added</div>
                <div className="text-2xl font-bold text-white mt-1">{last30.adds}</div>
              </div>
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <div className="text-xs text-white/35">Active days</div>
                <div className="text-2xl font-bold text-white mt-1">{last30.activeDays}</div>
              </div>
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <div className="text-xs text-white/35">Avg / active day</div>
                <div className="text-2xl font-bold text-white mt-1">{last30.avg}</div>
              </div>
            </div>

            <div className="mt-5 rounded-2xl bg-white/5 border border-white/10 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-white/70">Best day</div>
                <div className="text-sm text-white/85 font-semibold">
                  {last30.bestDayLabel} • {last30.bestDayCount || 0} job
                  {(last30.bestDayCount || 0) === 1 ? "" : "s"}
                </div>
              </div>
              <div className="text-xs text-white/35 mt-2">
                Keep this steady—consistency is what turns into interviews.
              </div>
            </div>
          </div>

          {/* Top Companies */}
          <div className="lg:col-span-4 glass-card rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-cyan-300" />
                <h3 className="text-sm font-medium text-white/70">Top companies</h3>
              </div>
              <span className="text-xs text-white/30">by count</span>
            </div>

            {topCompanies.rows.length ? (
              <div className="space-y-3">
                {topCompanies.rows.map((r) => {
                  const pct = Math.round(((r.count || 0) / topCompanies.max) * 100);
                  return (
                    <div key={r.company} className="rounded-2xl bg-white/5 border border-white/10 p-4">
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-white/80 truncate pr-3">{r.company}</div>
                        <div className="text-sm text-white/70 font-semibold">{r.count}</div>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-white/5 overflow-hidden">
                        <div className="h-2 rounded-full bg-white/20" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
                <div className="text-xs text-white/35">
                  If one company dominates, consider widening targets to increase reply rate.
                </div>
              </div>
            ) : (
              <div className="text-sm text-white/40">
                No company data yet—add a job to start tracking.
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
