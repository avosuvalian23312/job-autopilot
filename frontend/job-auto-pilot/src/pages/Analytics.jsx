import React from "react";
import { useEffect, useMemo, useState } from "react";
import AppNav from "@/components/app/AppNav";
import GoalProgress from "@/components/app/GoalProgress";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  TrendingUp,
  Target,
  MessageSquare,
  Trophy,
  FileText,
  BarChart3,
  Clock,
} from "lucide-react";
import { motion } from "framer-motion";

const COLORS = ["#8b5cf6", "#06b6d4", "#f59e0b", "#10b981", "#ef4444"];

export default function Analytics() {
  const [applications, setApplications] = useState([]);

  // ✅ Load real jobs/applications from your API (which reads Cosmos)
  useEffect(() => {
    let cancelled = false;

    const normalizeStatus = (s) => String(s || "generated").trim().toLowerCase();
    const toDate = (v) => {
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    };

    const load = async () => {
      try {
        // IMPORTANT: if your list endpoint differs, change ONLY this line
        const res = await fetch("/api/jobs", { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();

        // Support common shapes: [] or { jobs: [] } or { applications: [] } etc.
        const list = Array.isArray(data)
          ? data
          : data?.jobs || data?.applications || data?.items || [];

        const cleaned = (Array.isArray(list) ? list : []).map((a) => {
          const createdRaw =
            a?.created_date ?? a?.createdDate ?? a?.created_at ?? a?.createdAt ?? null;

          const updatedRaw =
            a?.status_updated_at ??
            a?.statusUpdatedAt ??
            a?.updated_date ??
            a?.updatedDate ??
            a?.updated_at ??
            a?.updatedAt ??
            null;

          return {
            ...a,
            status: normalizeStatus(a?.status ?? a?.job_status ?? a?.jobStatus),
            created_date: createdRaw,
            _createdDt: toDate(createdRaw),
            _updatedDt: toDate(updatedRaw),
          };
        });

        if (!cancelled) setApplications(cleaned);
      } catch (e) {
        console.error("Analytics load failed:", e);
        if (!cancelled) setApplications([]);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const statusCounts = {
    generated: applications.filter((a) => a.status === "generated").length,
    applied: applications.filter((a) => a.status === "applied").length,
    interview: applications.filter((a) => a.status === "interview").length,
    offer: applications.filter((a) => a.status === "offer").length,
    rejected: applications.filter((a) => a.status === "rejected").length,
  };

  const pieData = Object.entries(statusCounts)
    .filter(([_, v]) => v > 0)
    .map(([name, value]) => ({ name, value }));

  // ✅ Derived from real data (last 8 weeks, oldest -> newest)
  const weeklyData = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 56); // 8 weeks window

    const msDay = 86400000;
    const counts = Array(8).fill(0);

    for (const a of applications) {
      const dt = a?._createdDt instanceof Date ? a._createdDt : null;
      if (!dt) continue;

      const diffDays = Math.floor((dt - start) / msDay);
      if (diffDays < 0 || diffDays >= 56) continue;

      const idx = Math.floor(diffDays / 7);
      if (idx >= 0 && idx < 8) counts[idx] += 1;
    }

    return counts.map((n, i) => ({ week: `W${i + 1}`, applications: n }));
  }, [applications]);

  // ✅ Derived from real data (last 6 months response-rate trend)
  const responseData = useMemo(() => {
    const now = new Date();
    const months = [];

    const keyOf = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const labelOf = (d) => d.toLocaleString(undefined, { month: "short" });

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: keyOf(d), label: labelOf(d) });
    }

    const totals = Object.fromEntries(months.map((m) => [m.key, 0]));
    const responded = Object.fromEntries(months.map((m) => [m.key, 0]));

    // define “response” as anything beyond applied/generated
    const responseStatuses = new Set(["interview", "offer", "rejected"]);

    for (const a of applications) {
      const dt = a?._createdDt instanceof Date ? a._createdDt : null;
      if (!dt) continue;

      const k = keyOf(new Date(dt.getFullYear(), dt.getMonth(), 1));
      if (!(k in totals)) continue;

      totals[k] += 1;
      if (responseStatuses.has(String(a?.status || "").toLowerCase())) {
        responded[k] += 1;
      }
    }

    return months.map((m) => ({
      month: m.label,
      rate: totals[m.key] > 0 ? Math.round((responded[m.key] / totals[m.key]) * 100) : 0,
    }));
  }, [applications]);

  // ✅ Avg response time (uses status_updated_at/updated_at if present; else "—")
  const avgResponseTime = useMemo(() => {
    const msDay = 86400000;
    const diffs = [];

    const responseStatuses = new Set(["interview", "offer", "rejected"]);

    for (const a of applications) {
      if (!responseStatuses.has(String(a?.status || "").toLowerCase())) continue;

      const c = a?._createdDt instanceof Date ? a._createdDt : null;
      const u = a?._updatedDt instanceof Date ? a._updatedDt : null;
      if (!c || !u) continue;

      const d = (u - c) / msDay;
      if (Number.isFinite(d) && d >= 0) diffs.push(d);
    }

    if (!diffs.length) return "—";
    const avg = diffs.reduce((s, x) => s + x, 0) / diffs.length;
    return `${avg.toFixed(1)}d`;
  }, [applications]);

  const statCards = [
    {
      label: "Total Applications",
      value: applications.length,
      icon: FileText,
      color: "text-purple-400",
      bg: "bg-purple-500/10",
    },
    {
      label: "Interview Rate",
      value: `${
        applications.length > 0
          ? Math.round((statusCounts.interview / applications.length) * 100)
          : 0
      }%`,
      icon: MessageSquare,
      color: "text-cyan-400",
      bg: "bg-cyan-500/10",
    },
    {
      label: "Offer Rate",
      value: `${
        applications.length > 0
          ? Math.round((statusCounts.offer / applications.length) * 100)
          : 0
      }%`,
      icon: Trophy,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Avg. Response Time",
      value: avgResponseTime,
      icon: Clock,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
    },
  ];

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload?.length) {
      return (
        <div className="bg-[hsl(240,10%,8%)] border border-white/10 rounded-lg px-3 py-2 text-xs">
          <p className="text-white/40 mb-1">{label}</p>
          <p className="text-white font-medium">{payload[0].value}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-[hsl(240,10%,4%)]">
      <AppNav currentPage="Analytics" />
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.3 }}
        className="max-w-7xl mx-auto px-4 sm:px-6 py-8"
      >
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-white">Analytics</h1>
          <p className="text-white/40 mt-1">Track your job search performance</p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {statCards.map((s) => (
            <div key={s.label} className="glass-card rounded-2xl p-5">
              <div
                className={`w-9 h-9 rounded-xl ${s.bg} flex items-center justify-center mb-3`}
              >
                <s.icon className={`w-4.5 h-4.5 ${s.color}`} />
              </div>
              <div className="text-2xl font-bold text-white">{s.value}</div>
              <div className="text-xs text-white/30 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Charts column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Weekly applications */}
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-6">
                <BarChart3 className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-medium text-white/60">
                  Weekly Applications
                </h3>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={weeklyData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.04)"
                  />
                  <XAxis
                    dataKey="week"
                    tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar
                    dataKey="applications"
                    fill="#8b5cf6"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Response rate */}
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-6">
                <TrendingUp className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-medium text-white/60">
                  Response Rate Trend (%)
                </h3>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={responseData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.04)"
                  />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="rate"
                    stroke="#06b6d4"
                    strokeWidth={2}
                    dot={{ fill: "#06b6d4", r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            <GoalProgress applicationCount={applications.length} />

            {/* Status breakdown */}
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-6">
                <Target className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-medium text-white/60">
                  Status Breakdown
                </h3>
              </div>
              {pieData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 mt-4">
                    {pieData.map((d, i) => (
                      <div
                        key={d.name}
                        className="flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2.5 h-2.5 rounded-full"
                            style={{
                              background: COLORS[i % COLORS.length],
                            }}
                          />
                          <span className="text-white/50 capitalize">{d.name}</span>
                        </div>
                        <span className="text-white/70 font-medium">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <p className="text-white/20 text-sm">No data yet</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
