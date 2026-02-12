import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import AppNav from "@/components/app/AppNav";
import GoalProgress from "@/components/app/GoalProgress";
import { Button } from "@/components/ui/button";
import { Plus, FileText, TrendingUp, Clock } from "lucide-react";
import { motion } from "framer-motion";

const CircularMetric = ({ value, label, color = "purple" }) => {
  const percentage = Math.min((value / 20) * 100, 100); // Max out at 20 for visual purposes
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const colorClasses = {
    purple: {
      stroke: "stroke-purple-500",
      text: "text-purple-400",
      bg: "bg-purple-500/10",
    },
    cyan: { stroke: "stroke-cyan-500", text: "text-cyan-400", bg: "bg-cyan-500/10" },
    green: { stroke: "stroke-green-500", text: "text-green-400", bg: "bg-green-500/10" },
  };

  const colors = colorClasses[color];

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
            style={{ transition: "stroke-dashoffset 1s ease-out" }}
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

// ---------------------------
// Helpers (no UI changes)
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

const withinLastDays = (dateVal, days) => {
  const d = toDate(dateVal);
  if (!d) return false;
  const now = Date.now();
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  return d.getTime() >= cutoff;
};

const normalizeStatus = (s) => String(s ?? "").trim().toLowerCase();

const titleCase = (s) => {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.charAt(0).toUpperCase() + t.slice(1);
};

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
  const list = Array.isArray(jobs) ? jobs : jobs?.jobs || jobs?.items || [];
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
        text: `Generated documents for ${role} role`,
        time: timeAgo(docsGen),
        ts: docsGen.getTime(),
      });
    }

    const st = normalizeStatus(job?.status);
    const updated = toDate(pickUpdated(job));
    if (updated && st && st !== "generated") {
      events.push({
        type: "status_changed",
        text: `Application status updated to ${titleCase(st)}`,
        time: timeAgo(updated),
        ts: updated.getTime(),
      });
    }
  }

  // newest first + cap
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
  const list = Array.isArray(jobs) ? jobs : jobs?.jobs || jobs?.items || [];
  const now = new Date();
  const todayStart = startOfDay(now);

  // last 7 days (including today)
  const cutoff = todayStart - 6 * 24 * 60 * 60 * 1000;

  let apps = 0;
  let interviews = 0;
  let offers = 0;

  for (const job of list) {
    const created = toDate(pickCreated(job));
    const updated = toDate(pickUpdated(job));
    const st = normalizeStatus(job?.status);

    if (created && created.getTime() >= cutoff) apps += 1;

    // Prefer status-updated timestamp if you have it
    const when = updated || created;

    if (when && when.getTime() >= cutoff) {
      if (st === "interview") interviews += 1;
      if (st === "offer") offers += 1;
    }
  }

  return { applications: apps, interviews, offers };
};

export default function AppHome() {
  const navigate = useNavigate();

  // ✅ real activity from Cosmos via API
  const [recentActivity, setRecentActivity] = useState([]);

  // ✅ real week metrics (fallback computed from jobs)
  const [weekApps, setWeekApps] = useState(0);
  const [weekInterviews, setWeekInterviews] = useState(0);
  const [weekOffers, setWeekOffers] = useState(0);

  const handleNewJob = () => {
    navigate(createPageUrl("NewJob"));
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        // 1) Try dashboard first (best place for recent activity if you already aggregate)
        const dash = await apiFetch("/api/dashboard", { method: "GET" });

        if (cancelled) return;

        const dashActivity = normalizeRecentActivityFromDashboard(dash);
        if (dashActivity.length) setRecentActivity(dashActivity);

        // If dashboard provides week stats, use them (support a few common shapes)
        const wk =
          dash?.thisWeek ||
          dash?.week ||
          dash?.weekly ||
          dash?.stats?.thisWeek ||
          dash?.stats?.week ||
          null;

        const wkApps =
          wk?.applications ?? wk?.apps ?? wk?.jobs ?? wk?.applicationsCount ?? wk?.totalApplications;
        const wkInterviews = wk?.interviews ?? wk?.interview ?? wk?.interviewsCount;
        const wkOffers = wk?.offers ?? wk?.offer ?? wk?.offersCount;

        // Only set if dashboard actually has numbers
        if (typeof wkApps === "number") setWeekApps(wkApps);
        if (typeof wkInterviews === "number") setWeekInterviews(wkInterviews);
        if (typeof wkOffers === "number") setWeekOffers(wkOffers);

        // If dashboard didn't include activity or week numbers, fall back to /api/jobs
        const needsActivity = !dashActivity.length;
        const needsWeekNums =
          typeof wkApps !== "number" || typeof wkInterviews !== "number" || typeof wkOffers !== "number";

        if (needsActivity || needsWeekNums) {
          const jobs = await apiFetch("/api/jobs", { method: "GET" });
          if (cancelled) return;

          if (needsActivity) setRecentActivity(buildRecentActivityFromJobs(jobs));

          if (needsWeekNums) {
            const w = computeThisWeekMetricsFromJobs(jobs);
            setWeekApps(w.applications);
            setWeekInterviews(w.interviews);
            setWeekOffers(w.offers);
          }
        }
      } catch (e) {
        console.error(e);

        // Final fallback: derive everything from /api/jobs
        try {
          const jobs = await apiFetch("/api/jobs", { method: "GET" });
          if (cancelled) return;

          setRecentActivity(buildRecentActivityFromJobs(jobs));

          const w = computeThisWeekMetricsFromJobs(jobs);
          setWeekApps(w.applications);
          setWeekInterviews(w.interviews);
          setWeekOffers(w.offers);
        } catch (e2) {
          console.error(e2);
          // leave empty (UI already handles "No activity yet")
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

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
        <div className="flex items-center justify-between mb-12">
          <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        </div>

        {/* Main Hero Action */}
        <div className="max-w-4xl mx-auto mb-32">
          <button
            onClick={handleNewJob}
            className="relative w-full p-20 rounded-3xl bg-gradient-to-br from-purple-600/20 to-purple-600/5 border-2 border-purple-500/30 hover:border-purple-500/50 hover:shadow-2xl hover:shadow-purple-500/20 hover:-translate-y-2 transition-all group overflow-hidden"
          >
            <div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer"
              style={{ backgroundSize: "200% 100%" }}
            />
            <div className="relative flex flex-col items-center gap-8">
              <div className="w-40 h-40 rounded-3xl bg-purple-600 flex items-center justify-center group-hover:scale-110 transition-transform shadow-2xl shadow-purple-500/40">
                <Plus className="w-20 h-20 text-white" />
              </div>
              <div>
                <h3 className="text-4xl font-bold text-white mb-4">New Job</h3>
                <p className="text-white/50 text-lg">Add a job and generate tailored documents</p>
              </div>
            </div>
          </button>
        </div>

        {/* Analytics Section - Below the fold */}
        <div className="max-w-5xl mx-auto mt-24">
          <div className="glass-card rounded-2xl p-12">
            <h2 className="text-2xl font-bold text-white mb-12 text-center">This Week</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
              <CircularMetric value={weekApps} label="Applications" color="purple" />
              <CircularMetric value={weekInterviews} label="Interviews" color="cyan" />
              <CircularMetric value={weekOffers} label="Offers" color="green" />
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="max-w-5xl mx-auto mt-12">
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
                      {activity.type === "job_added" && <Plus className="w-5 h-5 text-purple-400" />}
                      {activity.type === "doc_generated" && <FileText className="w-5 h-5 text-cyan-400" />}
                      {activity.type === "status_changed" && <TrendingUp className="w-5 h-5 text-green-400" />}
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
                <Button onClick={handleNewJob} className="bg-purple-600 hover:bg-purple-500 text-white">
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
