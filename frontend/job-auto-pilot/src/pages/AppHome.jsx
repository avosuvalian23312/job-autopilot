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
    purple: { stroke: "stroke-purple-500", badge: "bg-purple-500/10 text-purple-300" },
    cyan: { stroke: "stroke-cyan-500", badge: "bg-cyan-500/10 text-cyan-300" },
    green: { stroke: "stroke-green-500", badge: "bg-green-500/10 text-green-300" },
    amber: { stroke: "stroke-amber-500", badge: "bg-amber-500/10 text-amber-300" },
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

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
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

  const out = Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([ts, count]) => {
      const d = new Date(ts);
      const label = d.toLocaleDateString(undefined, { weekday: "short" });
      return { ts, label, value: count };
    });

  return out;
};

const countStatusesAllTime = (jobs) => {
  const list = normalizeJobsList(jobs);
  const counts = { generated: 0, applied: 0, interview: 0, offer: 0, rejected: 0, other: 0 };

  for (const job of list) {
    const st = normalizeStatus(job?.status);
    if (!st) continue;
    if (counts[st] != null) counts[st] += 1;
    else counts.other += 1;
  }

  return counts;
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

      // --- Totals + Charts (from jobs) ---
      if (jobs) {
        const list = normalizeJobsList(jobs);
        setTotalApps(list.length);

        setDailySeries(buildLastNDaysSeries(jobs, 7));
        setStatusCounts(countStatusesAllTime(jobs));
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
    const m = Math.max(1, ...dailySeries.map((d) => d.value || 0));
    return m;
  }, [dailySeries]);

  const topStatusRows = useMemo(() => {
    const entries = Object.entries(statusCounts || {});
    const keep = entries
      .filter(([k]) => k !== "other")
      .sort((a, b) => (b[1] || 0) - (a[1] || 0));
    return keep.slice(0, 5);
  }, [statusCounts]);

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
              All-time: <span className="text-white/70 font-semibold">{totalApps}</span>{" "}
              applications • <span className="text-white/70 font-semibold">{resumeCount}</span>{" "}
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

        {/* TOP GRID (fills the screen more) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT: New Job + Momentum */}
          <div className="lg:col-span-7 space-y-6">
            {/* Main Hero Action (smaller, less empty space) */}
            <button
              onClick={handleNewJob}
              className="relative w-full rounded-3xl bg-gradient-to-br from-purple-600/20 to-purple-600/5 border-2 border-purple-500/30 hover:border-purple-500/50 hover:shadow-2xl hover:shadow-purple-500/20 hover:-translate-y-1 transition-all group overflow-hidden"
            >
              <div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer"
                style={{ backgroundSize: "200% 100%" }}
              />
              <div className="relative flex flex-col sm:flex-row items-center justify-between gap-8 p-10 sm:p-12">
                <div className="flex items-center gap-5">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-purple-600 flex items-center justify-center group-hover:scale-105 transition-transform shadow-2xl shadow-purple-500/40">
                    <Plus className="w-10 h-10 sm:w-12 sm:h-12 text-white" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-2xl sm:text-3xl font-bold text-white mb-2">
                      New Job
                    </h3>
                    <p className="text-white/45 text-sm sm:text-base">
                      Add a job and generate tailored documents
                    </p>
                  </div>
                </div>

                <div className="hidden md:flex items-center gap-3">
                  <div className="rounded-2xl bg-white/5 border border-white/10 px-4 py-3">
                    <div className="text-xs text-white/35">This week</div>
                    <div className="text-lg font-bold text-white">{weekApps} apps</div>
                  </div>
                  <div className="rounded-2xl bg-white/5 border border-white/10 px-4 py-3">
                    <div className="text-xs text-white/35">Offers</div>
                    <div className="text-lg font-bold text-white">{weekOffers}</div>
                  </div>
                </div>
              </div>
            </button>

            {/* Momentum / Last 7 days chart */}
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-purple-400" />
                  <h2 className="text-sm font-medium text-white/60">
                    Last 7 days (applications added)
                  </h2>
                </div>
                <span className="text-xs text-white/30">
                  from Cosmos (jobs.createdAt)
                </span>
              </div>

              {/* Bars */}
              <div className="grid grid-cols-7 gap-3 items-end h-28">
                {(dailySeries.length ? dailySeries : Array.from({ length: 7 }).map((_, i) => ({ label: "", value: 0, ts: i }))).map(
                  (d, i) => {
                    const h = Math.round(((d.value || 0) / dailyMax) * 100);
                    return (
                      <div key={d.ts || i} className="flex flex-col items-center gap-2">
                        <div className="w-full h-20 rounded-xl bg-white/5 border border-white/10 overflow-hidden flex items-end">
                          <div
                            className="w-full bg-white/20"
                            style={{ height: `${Math.max(6, h)}%` }}
                          />
                        </div>
                        <div className="text-[11px] text-white/35">{d.label || "—"}</div>
                      </div>
                    );
                  }
                )}
              </div>

              {/* Status quick breakdown */}
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
                      const pct = totalApps ? Math.round(((v || 0) / totalApps) * 100) : 0;
                      return (
                        <div key={k} className="flex items-center gap-3">
                          <div className="w-20 text-xs text-white/45 capitalize">{k}</div>
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
                    <TrendingUp className="w-4 h-4 text-green-400" />
                    <div className="text-sm font-semibold text-white/75">Momentum</div>
                  </div>
                  <div className="text-xs text-white/40">
                    Keep the graph “warm” by adding 1–3 jobs/day. It makes your pipeline
                    predictable (and your stats climb faster).
                  </div>

                  <div className="mt-3 flex items-center gap-3">
                    <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2">
                      <div className="text-[11px] text-white/35">This week</div>
                      <div className="text-lg font-bold text-white">{weekApps}</div>
                    </div>
                    <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2">
                      <div className="text-[11px] text-white/35">Interviews</div>
                      <div className="text-lg font-bold text-white">{weekInterviews}</div>
                    </div>
                    <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2">
                      <div className="text-[11px] text-white/35">Offers</div>
                      <div className="text-lg font-bold text-white">{weekOffers}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: Goals + This Week */}
          <div className="lg:col-span-5 space-y-6">
            {/* Goals card */}
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-purple-400" />
                  <h2 className="text-sm font-medium text-white/60">Goals</h2>
                </div>
                <span className="text-xs text-white/30">custom</span>
              </div>

              <div className="space-y-4">
                {/* Existing component (kept) */}
                <GoalProgress applicationCount={totalApps} />

                {/* New goal rings (fills UI) */}
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

            {/* This Week card */}
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-white/50" />
                  <h2 className="text-sm font-medium text-white/60">This Week</h2>
                </div>
                <span className="text-xs text-white/30">last 7 days</span>
              </div>

              <div className="grid grid-cols-3 gap-6">
                <CircularMetric value={weekApps} label="Applications" color="purple" max={weekMax} />
                <CircularMetric value={weekInterviews} label="Interviews" color="cyan" max={weekMax} />
                <CircularMetric value={weekOffers} label="Offers" color="green" max={weekMax} />
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity (full width so the page looks “complete”) */}
        <div className="mt-6">
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
      </motion.div>
    </div>
  );
}
