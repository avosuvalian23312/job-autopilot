import { useEffect, useMemo, useRef, useState } from "react";

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

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function normalizeJobResponse(data) {
  // Supports both: updatedJob OR { job: updatedJob }
  if (!data) return null;
  return data.job && typeof data.job === "object" ? data.job : data;
}

export default function App() {
  // Tabs: "dashboard" | "generate" | "jobs"
  const [tab, setTab] = useState("dashboard");

  // Generate form
  const [jobDescription, setJobDescription] = useState("");
  const [name, setName] = useState("Avetis Suvalian");
  const [experience, setExperience] = useState("Walmart Auto Care\nAndy's Frozen Custard");
  const [skills, setSkills] = useState("Customer service\nTroubleshooting");

  // Data
  const [jobs, setJobs] = useState([]);
  const [result, setResult] = useState(null);
  const [selectedJobId, setSelectedJobId] = useState(null);

  // Dashboard controls
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  // UX state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  function showToast(message, kind = "info") {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, kind });
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }

  async function loadJobs() {
    setError("");
    const r = await fetch(`${API}/listJobs`);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || `listJobs failed (${r.status})`);
    const list = Array.isArray(data.jobs) ? data.jobs : [];
    // Defensive: ensure every job has an id (don’t crash UI)
    setJobs(list.filter((j) => j && j.id));
  }

  useEffect(() => {
    loadJobs().catch((e) => setError(e.message || "Failed to load jobs"));
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const selectedJob = useMemo(() => {
    if (!selectedJobId) return null;
    return jobs.find((j) => j.id === selectedJobId) || null;
  }, [jobs, selectedJobId]);

  const preview = selectedJob || result;

  const filteredJobs = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = [...jobs];

    if (statusFilter !== "all") {
      out = out.filter((j) => (j.status || "").toLowerCase() === statusFilter);
    }

    if (q) {
      out = out.filter((j) => {
        const hay = [
          j.jobTitle,
          j.status,
          j.userId,
          j.jobDescription,
          j.createdAt,
          j.updatedAt,
          j.id,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    if (sortBy === "title") {
      out.sort((a, b) => (a.jobTitle || "").localeCompare(b.jobTitle || ""));
    } else if (sortBy === "oldest") {
      out.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    } else {
      out.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    }

    return out;
  }, [jobs, query, statusFilter, sortBy]);

  const stats = useMemo(() => {
    const counts = { total: jobs.length, generated: 0, applied: 0, interview: 0, offer: 0, rejected: 0 };
    for (const j of jobs) {
      const s = (j.status || "generated").toLowerCase();
      if (counts[s] !== undefined) counts[s] += 1;
    }
    return counts;
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
      showToast("Generated docs + saved job", "success");
      await loadJobs();
      setTab("dashboard");
    } catch (e) {
      setError(e.message || "Generate failed");
      showToast("Generate failed", "error");
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(jobId, newStatus) {
    setError("");

    if (!jobId) {
      setError("Missing job id in UI (refresh jobs list).");
      showToast("Missing job id (refresh)", "error");
      return;
    }

    // Optimistic update
    const optimisticUpdatedAt = new Date().toISOString();
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, status: newStatus, updatedAt: optimisticUpdatedAt } : j))
    );

    try {
      const r = await fetch(`${API}/jobs/${jobId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `update status failed (${r.status})`);

      const updatedJob = normalizeJobResponse(data);
      if (!updatedJob?.id) {
        // Don’t corrupt state if backend returns unexpected shape
        throw new Error("Backend returned an unexpected response (missing id).");
      }

      // Replace with server truth (THIS FIXES THE undefined bug)
      setJobs((prev) => prev.map((j) => (j.id === jobId ? updatedJob : j)));
      showToast(`Status → ${newStatus}`, "success");
    } catch (e) {
      setError(e.message || "Status update failed");
      showToast("Status update failed (rolled back)", "error");
      // Rollback by reloading
      await loadJobs().catch(() => {});
    }
  }

  const styles = {
    page: {
      minHeight: "100vh",
      display: "flex",
      background:
        "radial-gradient(1200px 700px at 10% 10%, rgba(120, 90, 255, 0.18), transparent 55%)," +
        "radial-gradient(900px 600px at 90% 20%, rgba(0, 200, 255, 0.12), transparent 60%)," +
        "linear-gradient(180deg, #0b0c10 0%, #0a0b12 60%, #070812 100%)",
      color: "rgba(255,255,255,0.92)",
      fontFamily:
        'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
    },
    sidebar: {
      width: 260,
      padding: 16,
      borderRight: "1px solid rgba(255,255,255,0.10)",
      background: "rgba(0,0,0,0.20)",
      backdropFilter: "blur(10px)",
      position: "sticky",
      top: 0,
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      gap: 12,
    },
    main: {
      flex: 1,
      padding: 18,
      display: "grid",
      gridTemplateColumns: "1.05fr 0.95fr",
      gap: 16,
      alignItems: "start",
    },
    card: {
      border: "1px solid rgba(255,255,255,0.10)",
      background: "rgba(255,255,255,0.04)",
      borderRadius: 16,
      padding: 16,
      boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
      backdropFilter: "blur(10px)",
    },
    btn: (active = false) => ({
      width: "100%",
      padding: "10px 12px",
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.12)",
      background: active
        ? "linear-gradient(90deg, rgba(120,90,255,0.55), rgba(0,200,255,0.28))"
        : "rgba(255,255,255,0.06)",
      color: "rgba(255,255,255,0.92)",
      fontWeight: 800,
      cursor: "pointer",
      textAlign: "left",
    }),
    input: {
      width: "100%",
      padding: "10px 12px",
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(0,0,0,0.25)",
      color: "rgba(255,255,255,0.92)",
      outline: "none",
    },
    textarea: {
      width: "100%",
      padding: "10px 12px",
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(0,0,0,0.25)",
      color: "rgba(255,255,255,0.92)",
      outline: "none",
      resize: "vertical",
      minHeight: 130,
    },
    pill: {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "6px 10px",
      borderRadius: 999,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.06)",
      fontSize: 12,
      fontWeight: 700,
    },
    toast: {
      position: "fixed",
      right: 18,
      bottom: 18,
      padding: "10px 12px",
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(0,0,0,0.55)",
      boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
      maxWidth: 360,
      zIndex: 9999,
    },
  };

  const DashboardPanel = () => (
    <div style={{ ...styles.card, height: "calc(100vh - 36px)", overflow: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Dashboard</div>
          <div style={{ opacity: 0.7, marginTop: 4, fontSize: 13 }}>Search, filter, sort, and update status.</div>
        </div>
        <button
          style={{ ...styles.input, width: "auto", cursor: "pointer", fontWeight: 800 }}
          onClick={() => loadJobs().then(() => showToast("Refreshed jobs", "success")).catch((e) => setError(e.message))}
        >
          Refresh
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 180px 160px", gap: 10, marginTop: 14 }}>
        <input placeholder="Search jobs..." value={query} onChange={(e) => setQuery(e.target.value)} style={styles.input} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={styles.input}>
          <option value="all">All statuses</option>
          <option value="generated">generated</option>
          <option value="applied">applied</option>
          <option value="interview">interview</option>
          <option value="offer">offer</option>
          <option value="rejected">rejected</option>
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={styles.input}>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="title">Title (A-Z)</option>
        </select>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
        <span style={styles.pill}>Total: {stats.total}</span>
        <span style={styles.pill}>Applied: {stats.applied}</span>
        <span style={styles.pill}>Interview: {stats.interview}</span>
        <span style={styles.pill}>Offer: {stats.offer}</span>
        <span style={styles.pill}>Rejected: {stats.rejected}</span>
      </div>

      <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
        {filteredJobs.length === 0 ? (
          <div style={{ opacity: 0.75 }}>No jobs match your filters.</div>
        ) : (
          filteredJobs.map((job) => (
            <div
              key={job.id}
              onClick={() => setSelectedJobId(job.id)}
              style={{
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 14,
                padding: 12,
                background: selectedJobId === job.id ? "rgba(120, 90, 255, 0.10)" : "rgba(0,0,0,0.18)",
                cursor: "pointer",
              }}
              title="Click to preview"
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ minWidth: 260 }}>
                  <div style={{ fontWeight: 900, fontSize: 15 }}>
                    {job.jobTitle || "(untitled job)"}
                  </div>
                  <div style={{ opacity: 0.65, marginTop: 6, fontSize: 12 }}>
                    Created: {formatDate(job.createdAt)} {job.updatedAt ? `• Updated: ${formatDate(job.updatedAt)}` : ""}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <select
                    value={job.status || "generated"}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      e.stopPropagation();
                      updateStatus(job.id, e.target.value);
                    }}
                    style={{ ...styles.input, width: 160 }}
                  >
                    <option value="generated">generated</option>
                    <option value="applied">applied</option>
                    <option value="interview">interview</option>
                    <option value="rejected">rejected</option>
                    <option value="offer">offer</option>
                  </select>

                  <button
                    style={{ ...styles.input, width: "auto", cursor: "pointer", fontWeight: 800 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      copyText(job.jobTitle || "");
                      showToast("Copied title", "success");
                    }}
                  >
                    Copy Title
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const GeneratePanel = () => (
    <div style={{ ...styles.card, height: "calc(100vh - 36px)", overflow: "auto" }}>
      <div style={{ fontSize: 18, fontWeight: 900 }}>Generate</div>
      <div style={{ opacity: 0.7, marginTop: 4, fontSize: 13 }}>
        Paste a job description, generate bullets + cover letter, then track status.
      </div>

      <div style={{ marginTop: 14 }}>
        <textarea
          rows={8}
          placeholder="Paste job description here..."
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          style={styles.textarea}
        />
      </div>

      <div style={{ marginTop: 10 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" style={styles.input} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <textarea rows={5} value={experience} onChange={(e) => setExperience(e.target.value)} style={{ ...styles.textarea, minHeight: 120 }} />
        <textarea rows={5} value={skills} onChange={(e) => setSkills(e.target.value)} style={{ ...styles.textarea, minHeight: 120 }} />
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <button
          style={{ ...styles.input, width: "auto", cursor: "pointer", fontWeight: 900 }}
          disabled={loading || !jobDescription.trim()}
          onClick={generate}
        >
          {loading ? "Generating..." : "Generate Docs"}
        </button>

        <button
          style={{ ...styles.input, width: "auto", cursor: "pointer", fontWeight: 900 }}
          onClick={() => {
            setJobDescription("");
            showToast("Cleared job description", "info");
          }}
        >
          Clear JD
        </button>
      </div>
    </div>
  );

  const PreviewPanel = () => (
    <div style={{ ...styles.card, height: "calc(100vh - 36px)", overflow: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <div style={{ fontSize: 18, fontWeight: 900 }}>Preview</div>
        <button
          style={{ ...styles.input, width: "auto", cursor: "pointer", fontWeight: 900 }}
          onClick={() => {
            setSelectedJobId(null);
            setResult(null);
            showToast("Cleared preview", "info");
          }}
        >
          Clear
        </button>
      </div>

      {!preview ? (
        <div style={{ opacity: 0.75, marginTop: 10 }}>
          No preview yet. Click a job on the dashboard or generate docs.
        </div>
      ) : (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 900 }}>
            {preview.jobTitle || "Result"}
          </div>
          <div style={{ opacity: 0.7, fontSize: 12, marginTop: 6 }}>
            Created: {formatDate(preview.createdAt)} {preview.updatedAt ? `• Updated: ${formatDate(preview.updatedAt)}` : ""}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            <button
              style={{ ...styles.input, width: "auto", cursor: "pointer", fontWeight: 900 }}
              disabled={!preview.resumeBullets?.length}
              onClick={() => {
                copyText((preview.resumeBullets || []).join("\n"));
                showToast("Copied bullets", "success");
              }}
            >
              Copy Bullets
            </button>

            <button
              style={{ ...styles.input, width: "auto", cursor: "pointer", fontWeight: 900 }}
              disabled={!preview.coverLetter}
              onClick={() => {
                copyText(preview.coverLetter || "");
                showToast("Copied cover letter", "success");
              }}
            >
              Copy Cover Letter
            </button>

            <button
              style={{ ...styles.input, width: "auto", cursor: "pointer", fontWeight: 900 }}
              disabled={!preview.resumeBullets?.length}
              onClick={() => {
                downloadText("resume-bullets.txt", (preview.resumeBullets || []).join("\n"));
                showToast("Downloaded bullets", "success");
              }}
            >
              Download Bullets
            </button>

            <button
              style={{ ...styles.input, width: "auto", cursor: "pointer", fontWeight: 900 }}
              disabled={!preview.coverLetter}
              onClick={() => {
                downloadText("cover-letter.txt", preview.coverLetter || "");
                showToast("Downloaded cover letter", "success");
              }}
            >
              Download Cover Letter
            </button>
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 900, marginBottom: 6, opacity: 0.85 }}>Resume Bullets</div>
            <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 14, padding: 12, background: "rgba(0,0,0,0.18)" }}>
              {(preview.resumeBullets || []).length ? (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {(preview.resumeBullets || []).map((b, i) => (
                    <li key={i} style={{ marginBottom: 6, lineHeight: 1.5 }}>{b}</li>
                  ))}
                </ul>
              ) : (
                <div style={{ opacity: 0.75 }}>No bullets.</div>
              )}
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 900, marginBottom: 6, opacity: 0.85 }}>Cover Letter</div>
            <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 14, padding: 12, background: "rgba(0,0,0,0.18)", whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
              {preview.coverLetter || <span style={{ opacity: 0.75 }}>No cover letter.</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div style={styles.page}>
      {/* Sidebar */}
      <div style={styles.sidebar}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 1000, letterSpacing: -0.5 }}>Job Autopilot</div>
          <div style={{ opacity: 0.7, marginTop: 6, fontSize: 13 }}>
            Generate docs + track your pipeline.
          </div>
        </div>

        <button style={styles.btn(tab === "dashboard")} onClick={() => setTab("dashboard")}>
          📊 Dashboard
        </button>
        <button style={styles.btn(tab === "generate")} onClick={() => setTab("generate")}>
          ✍️ Generate
        </button>
        <button style={styles.btn(tab === "jobs")} onClick={() => setTab("jobs")}>
          🗂️ Jobs (list)
        </button>

        <div style={{ marginTop: 6, display: "grid", gap: 8 }}>
          <div style={styles.pill}>Saved: {jobs.length}</div>
          <div style={styles.pill}>Applied: {stats.applied}</div>
          <div style={styles.pill}>Interview: {stats.interview}</div>
        </div>

        <div style={{ marginTop: "auto", opacity: 0.55, fontSize: 12, lineHeight: 1.4 }}>
          Built with Azure Static Web Apps + Functions + Cosmos.
        </div>
      </div>

      {/* Main */}
      <div style={styles.main}>
        {/* Left main content */}
        <div>
          {error ? (
            <div style={{ ...styles.card, borderColor: "rgba(255,80,80,0.25)" }}>
              <strong style={{ color: "rgba(255,160,160,0.95)" }}>Error:</strong>{" "}
              <span style={{ opacity: 0.95 }}>{error}</span>
            </div>
          ) : null}

          {tab === "dashboard" ? <DashboardPanel /> : null}
          {tab === "generate" ? <GeneratePanel /> : null}

          {tab === "jobs" ? (
            <div style={{ ...styles.card, height: "calc(100vh - 36px)", overflow: "auto" }}>
              <div style={{ fontSize: 18, fontWeight: 900 }}>Jobs</div>
              <div style={{ opacity: 0.7, marginTop: 4, fontSize: 13 }}>
                Raw list (click any job to preview).
              </div>

              <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                {jobs.length === 0 ? (
                  <div style={{ opacity: 0.75 }}>No jobs yet.</div>
                ) : (
                  jobs.map((job) => (
                    <div
                      key={job.id}
                      style={{
                        border: "1px solid rgba(255,255,255,0.10)",
                        borderRadius: 14,
                        padding: 12,
                        background: "rgba(0,0,0,0.18)",
                        cursor: "pointer",
                      }}
                      onClick={() => setSelectedJobId(job.id)}
                    >
                      <div style={{ fontWeight: 900 }}>{job.jobTitle || "(untitled job)"}</div>
                      <div style={{ opacity: 0.65, marginTop: 6, fontSize: 12 }}>
                        {job.id} • {job.status} • {formatDate(job.createdAt)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </div>

        {/* Right preview */}
        <div>
          <PreviewPanel />
        </div>
      </div>

      {/* Toast */}
      {toast ? (
        <div style={styles.toast}>
          <div style={{ fontWeight: 900, marginBottom: 2 }}>
            {toast.kind === "success" ? "✅" : toast.kind === "error" ? "⚠️" : "ℹ️"}{" "}
            {toast.kind === "success" ? "Done" : toast.kind === "error" ? "Problem" : "Info"}
          </div>
          <div style={{ opacity: 0.92 }}>{toast.message}</div>
        </div>
      ) : null}
    </div>
  );
}
