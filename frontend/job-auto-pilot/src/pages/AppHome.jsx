import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { createPageUrl } from "@/utils";
import AppNav from "@/components/app/AppNav";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  BarChart3,
  Briefcase,
  CheckCircle2,
  Coins,
  FileText,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
} from "lucide-react";

const STATUS_ORDER = ["generated", "applied", "interview", "offer", "rejected"];
const STATUS_CLASS = {
  generated: "from-slate-400 to-slate-500",
  applied: "from-violet-400 to-fuchsia-500",
  interview: "from-cyan-400 to-blue-500",
  offer: "from-emerald-400 to-green-500",
  rejected: "from-rose-400 to-red-500",
};

function toDate(v) {
  const d = v ? new Date(v) : null;
  return d && Number.isFinite(d.getTime()) ? d : null;
}

function pickJobDate(job) {
  return job?.updatedAt || job?.updated_at || job?.createdAt || job?.created_at || null;
}

function timeAgo(value) {
  const d = toDate(value);
  if (!d) return "-";
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

async function fetchJson(path) {
  const res = await fetch(path, { credentials: "include" });
  const text = await res.text().catch(() => "");
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) throw new Error(data?.error || data?.message || `Request failed (${res.status})`);
  return data;
}

function statValue(v, loading) {
  return loading ? "-" : v;
}

function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-white/45">{label}</div>
          <div className="mt-2 text-3xl font-semibold">{value}</div>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-black/20">
          <Icon className="h-5 w-5 text-white/80" />
        </div>
      </div>
      <div className="mt-3 text-sm text-white/55">{sub}</div>
    </div>
  );
}

export default function AppHome() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [resumes, setResumes] = useState([]);
  const [credits, setCredits] = useState(0);
  const [plan, setPlan] = useState("free");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const [jobsRes, resumesRes, creditsRes] = await Promise.all([
        fetchJson("/api/jobs"),
        fetchJson("/api/resume/list"),
        fetchJson("/api/credits/me"),
      ]);
      setJobs(Array.isArray(jobsRes?.jobs) ? jobsRes.jobs : []);
      setResumes(Array.isArray(resumesRes?.resumes) ? resumesRes.resumes : []);
      setCredits(Number(creditsRes?.credits?.balance || 0) || 0);
      setPlan(String(creditsRes?.plan || "free"));
    } catch (e) {
      setError(e?.message || "Failed to load dashboard.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const counts = STATUS_ORDER.reduce((acc, s) => ({ ...acc, [s]: 0 }), {});
    jobs.forEach((j) => {
      const s = String(j?.status || "generated").toLowerCase();
      counts[s] = Number(counts[s] || 0) + 1;
    });
    return {
      totalJobs: jobs.length,
      totalResumes: resumes.length,
      interviews: counts.interview || 0,
      offers: counts.offer || 0,
      counts,
    };
  }, [jobs, resumes.length]);

  const recentJobs = useMemo(
    () =>
      [...jobs]
        .sort((a, b) => (toDate(pickJobDate(b))?.getTime() || 0) - (toDate(pickJobDate(a))?.getTime() || 0))
        .slice(0, 6),
    [jobs]
  );

  return (
    <div className="min-h-screen bg-[#060b14] text-white">
      <div className="pointer-events-none fixed inset-0 -z-0">
        <div className="absolute -left-24 top-12 h-72 w-72 rounded-full bg-cyan-500/20 blur-[110px]" />
        <div className="absolute right-[-8%] top-[-10%] h-[26rem] w-[26rem] rounded-full bg-blue-500/20 blur-[130px]" />
      </div>

      <AppNav currentPage="AppHome" credits={credits} />

      <main className="relative z-10 min-h-[calc(100vh-64px)] w-full px-4 py-7 sm:px-6 lg:px-10 xl:px-14">
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid gap-4 xl:grid-cols-[1.65fr_1fr]">
          <div className="rounded-3xl border border-white/10 bg-[linear-gradient(130deg,rgba(12,20,34,0.95),rgba(8,12,24,0.80))] p-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-100">
              <Sparkles className="h-3.5 w-3.5" />
              AppHome
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">Professional Pipeline Workspace</h1>
            <p className="mt-2 max-w-2xl text-white/65">Manage job packets, resume assets, and credits in one full-screen command view.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button onClick={() => navigate(createPageUrl("NewJob"))} className="bg-cyan-400 text-slate-950 hover:bg-cyan-300 font-semibold">
                <Plus className="mr-2 h-4 w-4" />
                New Packet
              </Button>
              <Button onClick={() => navigate(createPageUrl("Analytics"))} variant="outline" className="border-white/15 bg-white/5 hover:bg-white/10 text-white">
                <BarChart3 className="mr-2 h-4 w-4" />
                Analytics
              </Button>
              <Button onClick={() => { if (!refreshing) { setRefreshing(true); load(); } }} variant="outline" className="border-white/15 bg-white/5 hover:bg-white/10 text-white">
                <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <div className="text-sm text-white/55">Current plan</div>
            <div className="mt-1 text-xl font-semibold uppercase">{plan}</div>
            <div className="mt-5 text-sm text-white/55">Available credits</div>
            <div className="mt-1 text-4xl font-semibold">{statValue(credits, loading)}</div>
            <Link to={createPageUrl("Credits")} className="mt-5 inline-flex items-center gap-1 text-sm text-cyan-200 hover:text-cyan-100">
              Open credits page
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </motion.section>

        <section className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Briefcase} label="Applications" value={statValue(stats.totalJobs, loading)} sub="All tracked applications" />
          <StatCard icon={FileText} label="Resumes" value={statValue(stats.totalResumes, loading)} sub="Resume assets in your library" />
          <StatCard icon={Target} label="Interviews" value={statValue(stats.interviews, loading)} sub={`${stats.offers} offers in pipeline`} />
          <StatCard icon={Coins} label="Credits" value={statValue(credits, loading)} sub="5 credits per packet generation" />
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-[1.9fr_1fr]">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <div className="mb-4 text-lg font-semibold">Pipeline Status</div>
            <div className="space-y-3">
              {STATUS_ORDER.map((status) => {
                const count = Number(stats.counts[status] || 0);
                const pct = stats.totalJobs > 0 ? Math.round((count / stats.totalJobs) * 100) : 0;
                return (
                  <div key={status}>
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <span className="capitalize text-white/70">{status}</span>
                      <span className="text-white/90">{count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/10">
                      <div className={`h-2 rounded-full bg-gradient-to-r ${STATUS_CLASS[status]}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {error ? <div className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div> : null}
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-lg font-semibold">Recent</div>
              <Link to={createPageUrl("Applications")} className="text-sm text-cyan-200 hover:text-cyan-100">View all</Link>
            </div>
            {recentJobs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/15 bg-black/20 px-4 py-8 text-center text-sm text-white/65">
                No applications yet. Create a new packet to get started.
              </div>
            ) : (
              <div className="space-y-2">
                {recentJobs.map((job, idx) => {
                  const title = job?.jobTitle || job?.job_title || job?.title || "Untitled role";
                  const company = job?.company || job?.companyName || "Unknown";
                  return (
                    <div key={job?.id || `${title}-${idx}`} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
                      <div className="truncate text-sm font-medium text-white/90">{title}</div>
                      <div className="mt-0.5 truncate text-xs text-white/55">{company}</div>
                      <div className="mt-1.5 text-xs text-white/45">{timeAgo(pickJobDate(job))}</div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-4 space-y-2">
              <Button className="w-full justify-start bg-white/5 hover:bg-white/10 border border-white/10 text-white" onClick={() => navigate(createPageUrl("NewJob"))}>
                <Plus className="mr-2 h-4 w-4" />
                Generate new packet
              </Button>
              <Button className="w-full justify-start bg-white/5 hover:bg-white/10 border border-white/10 text-white" onClick={() => navigate(createPageUrl("Applications"))}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Update statuses
              </Button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
