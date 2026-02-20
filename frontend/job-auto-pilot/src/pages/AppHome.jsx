import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { createPageUrl } from "@/utils";
import AppNav from "@/components/app/AppNav";
import { Button } from "@/components/ui/button";
import {
  Award,
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
  Trophy,
  Zap,
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

function StatCard({ icon: Icon, label, value, sub, featured = false }) {
  return (
    <div
      className={[
        "relative overflow-hidden rounded-2xl border p-5 shadow-[0_12px_34px_rgba(0,0,0,0.26)] backdrop-blur-sm",
        "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(0,0,0,0.35)]",
        featured
          ? "shine-loop-container border-cyan-300/20 bg-[linear-gradient(150deg,rgba(34,211,238,0.16),rgba(255,255,255,0.03))]"
          : "border-white/10 bg-[linear-gradient(150deg,rgba(255,255,255,0.075),rgba(255,255,255,0.025))]",
      ].join(" ")}
    >
      {featured && <span aria-hidden className="shine-loop-overlay opacity-70" />}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-[linear-gradient(180deg,rgba(255,255,255,0.14),rgba(255,255,255,0))]"
      />
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-white/45">{label}</div>
          <div className="relative z-10 mt-2 text-3xl font-semibold">{value}</div>
        </div>
        <div className="relative z-10 flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-black/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          <Icon className={`h-5 w-5 ${featured ? "text-cyan-100" : "text-white/80"}`} />
        </div>
      </div>
      <div className="relative z-10 mt-3 text-sm text-white/55">{sub}</div>
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

  const interactiveButtonFx =
    "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(0,0,0,0.30)] active:scale-[0.98]";
  const interactiveLinkFx =
    "transition-all duration-200 hover:-translate-y-0.5 hover:text-white";

  const achievements = useMemo(
    () => [
      {
        title: "Resume Uploaded",
        detail: "Add at least one resume asset",
        unlocked: stats.totalResumes > 0,
        Icon: FileText,
      },
      {
        title: "First Packet",
        detail: "Generate your first job packet",
        unlocked: stats.totalJobs > 0,
        Icon: Zap,
      },
      {
        title: "Interview Ready",
        detail: "Move one job to interview stage",
        unlocked: stats.interviews > 0,
        Icon: Trophy,
      },
      {
        title: "Credit Stack",
        detail: "Keep 100+ credits available",
        unlocked: credits >= 100,
        Icon: Award,
      },
    ],
    [credits, stats.interviews, stats.totalJobs, stats.totalResumes]
  );

  const pipelineFocus = useMemo(() => {
    if (stats.totalJobs === 0) {
      return {
        title: "Build your first packet",
        detail: "Create one packet to unlock status tracking and automation workflows.",
      };
    }
    if (stats.interviews === 0) {
      return {
        title: "Push to interview stage",
        detail: "Use tailored bullets and cover letters to move at least one role to interview.",
      };
    }
    if (stats.offers === 0) {
      return {
        title: "Convert interviews to offers",
        detail: "Prioritize the most recent interview opportunities and tighten follow-ups.",
      };
    }
    return {
      title: "Maintain high pipeline velocity",
      detail: "Keep applying while your active interviews progress toward final rounds.",
    };
  }, [stats.interviews, stats.offers, stats.totalJobs]);

  const momentum = useMemo(() => {
    const score = Math.min(
      100,
      Math.round(stats.totalJobs * 8 + stats.interviews * 18 + stats.offers * 24 + stats.totalResumes * 6)
    );
    return {
      score,
      label: score >= 70 ? "High" : score >= 40 ? "Building" : "Early",
    };
  }, [stats.interviews, stats.offers, stats.totalJobs, stats.totalResumes]);

  return (
    <div className="min-h-screen bg-[#060b14] text-white">
      <div className="pointer-events-none fixed inset-0 -z-0">
        <div className="absolute -left-24 top-12 h-72 w-72 rounded-full bg-cyan-500/20 blur-[110px]" />
        <div className="absolute right-[-8%] top-[-10%] h-[26rem] w-[26rem] rounded-full bg-blue-500/20 blur-[130px]" />
        <div className="absolute left-[28%] top-[24%] h-56 w-56 rounded-full bg-violet-500/10 blur-[120px]" />
      </div>

      <AppNav currentPage="AppHome" credits={credits} />

      <main className="relative z-10 min-h-[calc(100vh-64px)] w-full px-4 py-7 sm:px-6 lg:px-10 xl:px-14">
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="grid gap-4 xl:grid-cols-[1.65fr_1fr]"
        >
          <div className="relative overflow-hidden rounded-3xl border border-white/12 bg-[linear-gradient(130deg,rgba(14,24,40,0.96),rgba(8,12,24,0.84))] p-7 shadow-[0_16px_48px_rgba(0,0,0,0.34)] backdrop-blur-sm">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-[linear-gradient(180deg,rgba(255,255,255,0.14),rgba(255,255,255,0))]" />
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-100">
              <Sparkles className="h-3.5 w-3.5" />
              AppHome
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">
              Professional Pipeline Workspace
            </h1>
            <p className="mt-2 max-w-2xl text-white/65">
              Manage job packets, resume assets, and credits in one full-screen
              command view.
            </p>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button
                  onClick={() => navigate(createPageUrl("NewJob"))}
                  className={`apphome-primary-cta shine-loop-container relative isolate h-12 px-6 text-base font-bold text-slate-950 bg-gradient-to-r from-cyan-300 via-cyan-400 to-sky-300 ring-2 ring-cyan-100/55 shadow-[0_14px_36px_rgba(6,182,212,0.35)] hover:from-cyan-200 hover:via-cyan-300 hover:to-sky-200 ${interactiveButtonFx}`}
                >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_0%,rgba(255,255,255,0.35),rgba(255,255,255,0)_60%)]"
                />
                <span aria-hidden className="shine-loop-overlay opacity-80" />
                <Plus className="relative z-10 mr-2 h-4 w-4" />
                <span className="relative z-10">Create New Packet</span>
              </Button>

              <Button
                onClick={() => navigate(createPageUrl("Analytics"))}
                variant="outline"
                className={`border-white/15 bg-white/5 hover:bg-white/10 text-white ${interactiveButtonFx}`}
              >
                <BarChart3 className="mr-2 h-4 w-4" />
                Analytics
              </Button>

              <Button
                onClick={() => {
                  if (!refreshing) {
                    setRefreshing(true);
                    load();
                  }
                }}
                variant="outline"
                className={`border-white/15 bg-white/5 hover:bg-white/10 text-white ${interactiveButtonFx}`}
              >
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
            </div>

            <p className="mt-3 text-xs text-cyan-100/80">
              Start here: create a packet first, then track status in Applications.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-white/12 bg-white/[0.03] p-3">
                <div className="text-[11px] uppercase tracking-[0.12em] text-white/45">Pipeline</div>
                <div className="mt-1 text-2xl font-semibold">{statValue(stats.totalJobs, loading)}</div>
                <div className="mt-1 text-xs text-white/55">active opportunities</div>
              </div>
              <div className="rounded-xl border border-white/12 bg-white/[0.03] p-3">
                <div className="text-[11px] uppercase tracking-[0.12em] text-white/45">Interviews</div>
                <div className="mt-1 text-2xl font-semibold">{statValue(stats.interviews, loading)}</div>
                <div className="mt-1 text-xs text-white/55">roles in interview stage</div>
              </div>
              <div className="rounded-xl border border-white/12 bg-white/[0.03] p-3">
                <div className="text-[11px] uppercase tracking-[0.12em] text-white/45">Resumes</div>
                <div className="mt-1 text-2xl font-semibold">{statValue(stats.totalResumes, loading)}</div>
                <div className="mt-1 text-xs text-white/55">assets ready to deploy</div>
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-cyan-300/20 bg-[linear-gradient(145deg,rgba(34,211,238,0.14),rgba(34,211,238,0.03))] p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-cyan-50">Execution Momentum</div>
                <div className="inline-flex items-center rounded-full border border-cyan-200/30 px-2 py-0.5 text-xs text-cyan-100">
                  {momentum.label}
                </div>
              </div>
              <div className="mt-2 h-2 rounded-full bg-black/30">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-cyan-300 via-sky-300 to-blue-300 transition-all duration-500"
                  style={{ width: `${momentum.score}%` }}
                />
              </div>
              <div className="mt-2 text-xs text-white/65">{pipelineFocus.title}: {pipelineFocus.detail}</div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-3xl border border-white/12 bg-[linear-gradient(150deg,rgba(255,255,255,0.09),rgba(255,255,255,0.03))] p-6 shadow-[0_16px_46px_rgba(0,0,0,0.3)] backdrop-blur-sm">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-[linear-gradient(180deg,rgba(255,255,255,0.14),rgba(255,255,255,0))]" />
              <div className="text-sm text-white/55">Current plan</div>
              <div className="mt-1 text-xl font-semibold uppercase">{plan}</div>
              <div className="mt-5 text-sm text-white/55">Available credits</div>
              <div className="mt-1 text-4xl font-semibold">{statValue(credits, loading)}</div>
              <div className="mt-3 rounded-xl border border-white/12 bg-black/25 px-3 py-2 text-xs text-white/65">
                Keep at least 20 credits to avoid blocking packet generation during peak usage.
              </div>
              <Link
                to={createPageUrl("Credits")}
                className={`mt-5 inline-flex items-center gap-1 text-sm text-cyan-200 hover:text-cyan-100 ${interactiveLinkFx}`}
              >
                Open credits page
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="rounded-3xl border border-white/10 bg-[linear-gradient(155deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-5 shadow-[0_12px_34px_rgba(0,0,0,0.26)]">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold tracking-wide text-white/85">
                  Achievements
                </div>
                <Trophy className="h-4 w-4 text-amber-200" />
              </div>

              <div className="space-y-2.5">
                {achievements.map((item) => (
                  <div
                    key={item.title}
                    className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
                      item.unlocked
                        ? "border-emerald-300/25 bg-emerald-500/10"
                        : "border-white/10 bg-black/20"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                          item.unlocked
                            ? "bg-emerald-400/20 text-emerald-100"
                            : "bg-white/10 text-white/65"
                        }`}
                      >
                        <item.Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white/90">
                          {item.title}
                        </div>
                        <div className="text-xs text-white/55">{item.detail}</div>
                      </div>
                    </div>
                    <div
                      className={`text-xs font-semibold ${
                        item.unlocked ? "text-emerald-200" : "text-white/45"
                      }`}
                    >
                      {item.unlocked ? "Unlocked" : "Locked"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          <StatCard icon={Briefcase} label="Applications" value={statValue(stats.totalJobs, loading)} sub="All tracked applications" />
          <StatCard icon={FileText} label="Resumes" value={statValue(stats.totalResumes, loading)} sub="Resume assets in your library" />
          <StatCard icon={Target} label="Interviews" value={statValue(stats.interviews, loading)} sub={`${stats.offers} offers in pipeline`} />
          <StatCard
            icon={Coins}
            label="Credits"
            value={statValue(credits, loading)}
            sub="5 credits per packet generation"
            featured
          />
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.14, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="mt-4 grid gap-4 xl:grid-cols-[1.9fr_1fr]"
        >
          <div className="rounded-3xl border border-white/10 bg-[linear-gradient(155deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] p-6 shadow-[0_12px_34px_rgba(0,0,0,0.26)]">
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

          <div className="rounded-3xl border border-white/10 bg-[linear-gradient(155deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] p-6 shadow-[0_12px_34px_rgba(0,0,0,0.26)]">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-lg font-semibold">Recent</div>
              <Link
                to={createPageUrl("Applications")}
                className={`text-sm text-cyan-200 hover:text-cyan-100 ${interactiveLinkFx}`}
              >
                View all
              </Link>
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
              <Button
                className={`w-full justify-start bg-white/5 hover:bg-white/10 border border-white/10 text-white ${interactiveButtonFx}`}
                onClick={() => navigate(createPageUrl("NewJob"))}
              >
                <Plus className="mr-2 h-4 w-4" />
                Generate new packet
              </Button>
              <Button
                className={`w-full justify-start bg-white/5 hover:bg-white/10 border border-white/10 text-white ${interactiveButtonFx}`}
                onClick={() => navigate(createPageUrl("Applications"))}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Update statuses
              </Button>
            </div>
          </div>
        </motion.section>
      </main>
    </div>
  );
}
