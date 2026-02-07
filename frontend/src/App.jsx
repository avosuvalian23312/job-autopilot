import { useEffect, useMemo, useState } from "react";

const API = "/api";

function copyText(text) {
  if (!text) return;
  navigator.clipboard.writeText(text);
}

function downloadText(filename, text) {
  const blob = new Blob([text || ""], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function fmt(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function normalizeJobResponse(data) {
  // supports: updatedJob OR { job: updatedJob }
  if (!data) return null;
  return data.job && typeof data.job === "object" ? data.job : data;
}

const STATUS_OPTIONS = ["generated", "applied", "interview", "offer", "rejected"];

function StatusPill({ status }) {
  const s = (status || "generated").toLowerCase();
  const map = {
    generated: "bg-slate-700/50 text-slate-200 border-slate-600/40",
    applied: "bg-blue-500/15 text-blue-200 border-blue-400/30",
    interview: "bg-yellow-500/15 text-yellow-200 border-yellow-400/30",
    offer: "bg-emerald-500/15 text-emerald-200 border-emerald-400/30",
    rejected: "bg-rose-500/15 text-rose-200 border-rose-400/30",
  };
  const cls = map[s] || map.generated;

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {s}
    </span>
  );
}

function TopNav({ onRefresh, savingCount = 0 }) {
  return (
    <div className="sticky top-0 z-20 border-b border-white/10 bg-black/30 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500/60 to-cyan-400/40" />
          <div>
            <div className="text-base font-black tracking-tight text-white">Job Autopilot</div>
            <div className="text-xs text-white/60">Generate docs + track applications</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
            <span className="h-2 w-2 rounded-full bg-emerald-400/80" />
            Online
          </div>

          <div className="hidden md:flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
            Saved: <span className="font-bold text-white">{savingCount}</span>
          </div>

          <button
            onClick={onRefresh}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}

function SidebarFilters({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  sortOrder,
  onSortOrderChange,
  jobCounts,
}) {
  return (
    <aside className="hidden w-72 shrink-0 border-r border-white/10 bg-white/[0.02] p-4 lg:block">
      <div className="text-xs font-semibold text-white/70">Filters</div>

      <div className="mt-3 space-y-3">
        <input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search title / company..."
          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30"
        />

        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
        >
          <option value="all">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          value={sortOrder}
          onChange={(e) => onSortOrderChange(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
        </select>
      </div>

      <div className="mt-6 space-y-2">
        <div className="text-xs font-semibold text-white/70">Overview</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-xs text-white/60">Total</div>
            <div className="text-lg font-black text-white">{jobCounts.total}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-xs text-white/60">Applied</div>
            <div className="text-lg font-black text-white">{jobCounts.applied}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-xs text-white/60">Interview</div>
            <div className="text-lg font-black text-white">{jobCounts.interview}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-xs text-white/60">Offer</div>
            <div className="text-lg font-black text-white">{jobCounts.offer}</div>
          </div>
        </div>
      </div>

      <div className="mt-6 text-xs text-white/40">
        Tip: click a job to preview bullets + cover letter.
      </div>
    </aside>
  );
}

function MobileFilters({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  sortOrder,
  onSortOrderChange,
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-white/10 bg-white/[0.02] p-3 lg:hidden">
      <input
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search title / company..."
        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30"
      />

      <div className="grid grid-cols-2 gap-2">
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
        >
          <option value="all">All</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          value={sortOrder}
          onChange={(e) => onSortOrderChange(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
        </select>
      </div>
    </div>
  );
}

function JobCard({ job, isSelected, onSelect, onStatusChange }) {
  const title = job.jobTitle || job.title || "(untitled)";
  const company = job.company || job.companyName || "";
  const status = job.status || "generated";

  return (
    <div
      className={`rounded-2xl border p-3 transition ${
        isSelected
          ? "border-indigo-400/30 bg-indigo-500/10"
          : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
      }`}
      onClick={() => onSelect(job.id)}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-extrabold text-white">{title}</div>
          <div className="truncate text-xs text-white/60">{company}</div>
          <div className="mt-2 flex items-center gap-2 text-[11px] text-white/45">
            <span>Created: {fmt(job.createdAt)}</span>
            {job.updatedAt ? <span>• Updated: {fmt(job.updatedAt)}</span> : null}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <StatusPill status={status} />
          <select
            value={status}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation();
              onStatusChange(job.id, e.target.value);
            }}
            className="rounded-xl border border-white/10 bg-black/30 px-2 py-1 text-xs text-white outline-none"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

function PreviewPanel({ job }) {
  if (!job) {
    return (
      <div className="flex h-full items-center justify-center rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-center">
        <div>
          <div className="text-sm font-semibold text-white/70">Preview</div>
          <div className="mt-2 text-xs text-white/50">
            Click a job on the left to preview bullets + cover letter.
          </div>
        </div>
      </div>
    );
  }

  const title = job.jobTitle || job.title || "(untitled)";
  const bullets = job.resumeBullets || [];
  const cover = job.coverLetter || "";

  return (
    <div className="h-full overflow-auto rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-base font-black text-white">{title}</div>
          <div className="mt-1 text-xs text-white/50">
            {job.status ? `Status: ${job.status}` : ""}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => copyText(bullets.join("\n"))}
            disabled={!bullets.length}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-40"
          >
            Copy Bullets
          </button>
          <button
            onClick={() => copyText(cover)}
            disabled={!cover}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-40"
          >
            Copy Letter
          </button>
          <button
            onClick={() => downloadText("resume-bullets.txt", bullets.join("\n"))}
            disabled={!bullets.length}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-40"
          >
            Download Bullets
          </button>
          <button
            onClick={() => downloadText("cover-letter.txt", cover)}
            disabled={!cover}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-40"
          >
            Download Letter
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-4">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-xs font-bold text-white/70">Resume Bullets</div>
          {bullets.length ? (
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-white/85">
              {bullets.map((b, i) => (
                <li key={i} className="leading-relaxed">
                  {b}
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-2 text-xs text-white/50">No bullets.</div>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-xs font-bold text-white/70">Cover Letter</div>
          <pre className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/85">
            {cover || "No cover letter."}
          </pre>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  // Generate form (keep simple, still included on top of dashboard)
  const [jobDescription, setJobDescription] = useState("");
  const [name, setName] = useState("Avetis Suvalian");
  const [experience, setExperience] = useState("Walmart Auto Care\nAndy's Frozen Custard");
  const [skills, setSkills] = useState("Customer service\nTroubleshooting");

  // Data
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [result, setResult] = useState(null);


  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("newest");

  // UX
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadJobs() {
    setError("");
    const r = await fetch(`${API}/listJobs`);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || `listJobs failed (${r.status})`);

    const list = Array.isArray(data.jobs) ? data.jobs : [];
    setJobs(list.filter((j) => j && j.id));
  }

  useEffect(() => {
    loadJobs().catch((e) => setError(e.message || "Failed to load jobs"));
  }, []);

  const filteredJobs = useMemo(() => {
    let result = [...jobs];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((job) => {
        const title = (job.jobTitle || job.title || "").toLowerCase();
        const company = (job.company || job.companyName || "").toLowerCase();
        return title.includes(q) || company.includes(q);
      });
    }

    if (statusFilter !== "all") {
      result = result.filter((job) => (job.status || "generated") === statusFilter);
    }

    result.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
    });

    return result;
  }, [jobs, searchQuery, statusFilter, sortOrder]);

  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? null;

  const jobCounts = useMemo(() => {
    return {
      total: jobs.length,
      generated: jobs.filter((j) => (j.status || "generated") === "generated").length,
      applied: jobs.filter((j) => j.status === "applied").length,
      interview: jobs.filter((j) => j.status === "interview").length,
      offer: jobs.filter((j) => j.status === "offer").length,
      rejected: jobs.filter((j) => j.status === "rejected").length,
    };
  }, [jobs]);

  async function generate() {
    setLoading(true);
    setError("");
    setResult(null);

    const body = {
      jobDescription,
      userProfile: {
        name,
        experience: experience.split("\n").map((s) => s.trim()).filter(Boolean),
        skills: skills.split("\n").map((s) => s.trim()).filter(Boolean),
      },
    };

    try {
      const r = await fetch(`${API}/generateDocuments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `generateDocuments failed (${r.status})`);

      setResult(data);
      setJobDescription("");
      await loadJobs();
    } catch (e) {
      setError(e.message || "Generate failed");
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id, status) {
    setError("");

    if (!id) {
      setError("Missing job id (refresh the page).");
      return;
    }

    // Optimistic UI update
    const optimisticUpdatedAt = new Date().toISOString();
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, status, updatedAt: optimisticUpdatedAt } : j)));

    try {
      const r = await fetch(`${API}/jobs/${id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `update status failed (${r.status})`);

      const updated = normalizeJobResponse(data);
      if (!updated?.id) throw new Error("Backend returned unexpected response (missing id).");

      // Replace with server truth (prevents id becoming undefined later)
      setJobs((prev) => prev.map((j) => (j.id === id ? updated : j)));
    } catch (e) {
      setError(e.message || "Status update failed");
      // rollback by reloading
      await loadJobs().catch(() => {});
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#070814] to-black text-white">
      <TopNav onRefresh={() => loadJobs().catch((e) => setError(e.message))} savingCount={jobs.length} />

      {error ? (
        <div className="mx-auto max-w-7xl px-4 pt-4">
          <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm">
            <span className="font-extrabold text-rose-200">Error:</span>{" "}
            <span className="text-white/90">{error}</span>
          </div>
        </div>
      ) : null}

      <div className="mx-auto max-w-7xl px-4 py-4">
        {/* Generate block */}
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="text-sm font-extrabold text-white/90">Generate</div>
              <div className="mt-1 text-xs text-white/50">
                Paste a job description, generate bullets + cover letter, and it saves to the dashboard.
              </div>
            </div>

            <button
              onClick={generate}
              disabled={loading || !jobDescription.trim()}
              className="w-full rounded-2xl bg-gradient-to-r from-indigo-500/70 to-cyan-400/40 px-4 py-2 text-sm font-black text-white shadow-lg shadow-indigo-500/10 hover:opacity-95 disabled:opacity-40 lg:w-auto"
            >
              {loading ? "Generating..." : "Generate Docs"}
            </button>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <div className="lg:col-span-3">
              <textarea
                rows={6}
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Paste job description here..."
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none placeholder:text-white/30"
              />
            </div>

            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none placeholder:text-white/30"
              placeholder="Name"
            />

            <textarea
              rows={3}
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none placeholder:text-white/30"
              placeholder="Experience (one per line)"
            />

            <textarea
              rows={3}
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none placeholder:text-white/30"
              placeholder="Skills (one per line)"
            />
          </div>

          {result ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => copyText((result.resumeBullets || []).join("\n"))}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
                >
                  Copy Latest Bullets
                </button>
                <button
                  onClick={() => copyText(result.coverLetter || "")}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
                >
                  Copy Latest Letter
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {/* Dashboard */}
        <div className="mt-4 flex min-h-[70vh] overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur">
          <SidebarFilters
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            sortOrder={sortOrder}
            onSortOrderChange={setSortOrder}
            jobCounts={jobCounts}
          />

          <main className="flex flex-1 flex-col overflow-hidden">
            <MobileFilters
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              sortOrder={sortOrder}
              onSortOrderChange={setSortOrder}
            />

            <div className="flex flex-1 overflow-hidden">
              {/* Left list */}
              <div className="w-full border-r border-white/10 lg:w-[420px]">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <h2 className="text-sm font-extrabold text-white/90">Applications</h2>
                  <span className="rounded-xl border border-white/10 bg-white/5 px-2 py-1 text-xs font-bold text-white/70">
                    {filteredJobs.length}
                  </span>
                </div>

                <div className="h-full overflow-auto p-3">
                  <div className="flex flex-col gap-2">
                    {filteredJobs.length === 0 ? (
                      <div className="flex flex-col items-center py-12 text-center">
                        <p className="text-sm text-white/70">No jobs found</p>
                        <p className="mt-1 text-xs text-white/50">Try adjusting your filters</p>
                      </div>
                    ) : (
                      filteredJobs.map((job) => (
                        <JobCard
                          key={job.id}
                          job={job}
                          isSelected={selectedJobId === job.id}
                          onSelect={setSelectedJobId}
                          onStatusChange={updateStatus}
                        />
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Right preview */}
              <div className="hidden flex-1 p-3 md:block">
                <PreviewPanel job={selectedJob} />
              </div>
            </div>
          </main>
        </div>

        <div className="mt-4 text-center text-xs text-white/35">
          Built with Azure Static Web Apps + Azure Functions + Cosmos DB.
        </div>
      </div>
    </div>
  );
}
