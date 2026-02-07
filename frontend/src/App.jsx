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

function statusPillStyle(status) {
  const s = (status || "").toLowerCase();
  const base = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
  };

  const map = {
    generated: { borderColor: "rgba(255,255,255,0.15)" },
    applied: { borderColor: "rgba(0, 200, 255, 0.25)" },
    interview: { borderColor: "rgba(255, 200, 0, 0.25)" },
    offer: { borderColor: "rgba(0, 255, 140, 0.25)" },
    rejected: { borderColor: "rgba(255, 80, 80, 0.25)" },
  };

  return { ...base, ...(map[s] || {}) };
}

function dotStyle(status) {
  const s = (status || "").toLowerCase();
  const base = {
    width: 8,
    height: 8,
    borderRadius: 999,
    background: "rgba(255,255,255,0.35)",
  };
  const map = {
    generated: { background: "rgba(255,255,255,0.45)" },
    applied: { background: "rgba(0, 200, 255, 0.7)" },
    interview: { background: "rgba(255, 200, 0, 0.75)" },
    offer: { background: "rgba(0, 255, 140, 0.75)" },
    rejected: { background: "rgba(255, 80, 80, 0.75)" },
  };
  return { ...base, ...(map[s] || {}) };
}

export default function App() {
  const [jobDescription, setJobDescription] = useState("");
  const [name, setName] = useState("Avetis Suvalian");
  const [experience, setExperience] = useState("Walmart Auto Care\nAndy's Frozen Custard");
  const [skills, setSkills] = useState("Customer service\nTroubleshooting");

  const [result, setResult] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState(null;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // UI upgrades
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest"); // newest|oldest|title
  const [toast, setToast] = useState(null);

  const toastTimer = useRef(null);

  function showToast(message, kind = "info") {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, kind });
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }

  async function loadJobs() {
    setError("");
    const r = await fetch(`${API}/listJobs`);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || `listJobs failed (${r.status})`);
    setJobs(data.jobs || []);
  }

  useEffect(() => {
    loadJobs().catch((e) => setError(e.message || "Failed to load jobs"));
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

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
    } catch (e) {
      setError(e.message || "Generate failed");
    } finally {
      setLoading(false);
    }
  }

  // Optimistic status updates
  async function updateStatus(jobId, newStatus) {
    setError("");

    // optimistic UI: update immediately
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, status: newStatus, updatedAt: new Date().toISOString() } : j))
    );

    try {
      const r = await fetch(`${API}/jobs/${jobId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `update status failed (${r.status})`);

      // server truth: patch local list
      setJobs((prev) => prev.map((j) => (j.id === jobId ? data : j)));
      showToast(`Status updated → ${newStatus}`, "success");
    } catch (e) {
      // rollback: reload from server to be safe
      setError(e.message || "Status update failed");
      showToast("Status update failed (rolled back)", "error");
      await loadJobs().catch(() => {});
    }
  }

  const selectedJob = useMemo(
    () => jobs.find((j) => j.id === selectedJobId) || null,
    [jobs, selectedJobId]
  );

  const shown = selectedJob || result;

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
          j.jobDescription,
          j.status,
          j.userId,
          j.createdAt,
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

  const pageStyle = {
    minHeight: "100vh",
    color: "rgba(255,255,255,0.92)",
    background:
      "radial-gradient(1200px 700px at 10% 10%, rgba(120, 90, 255, 0.18), transparent 55%)," +
      "radial-gradient(900px 600px at 90% 20%, rgba(0, 200, 255, 0.12), transparent 60%)," +
      "linear-gradient(180deg, #0b0c10 0%, #0a0b12 60%, #070812 100%)",
    padding: 24,
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
  };

  const shellStyle = {
    maxWidth: 1100,
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 18,
  };

  const cardStyle = {
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.04)",
    backdropFilter: "blur(10px)",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
  };

  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.25)",
    color: "rgba(255,255,255,0.92)",
    outline: "none",
  };

  const textareaStyle = {
    ...inputStyle,
    minHeight: 110,
    resize: "vertical",
  };

  const buttonStyle = (variant = "primary") => {
    const base = {
      borderRadius: 12,
      padding: "10px 12px",
      border: "1px solid rgba(255,255,255,0.12)",
      cursor: "pointer",
      fontWeight: 600,
      color: "rgba(255,255,255,0.92)",
      background: "rgba(255,255,255,0.06)",
    };
    if (variant === "primary") {
      return {
        ...base,
        background: "linear-gradient(90deg, rgba(120,90,255,0.6), rgba(0,200,255,0.35))",
        border: "1px solid rgba(120,90,255,0.25)",
      };
    }
    if (variant === "danger") {
      return { ...base, border: "1px solid rgba(255,80,80,0.25)" };
    }
    return base;
  };

  return (
    <div style={pageStyle}>
      <div style={shellStyle}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: -0.6 }}>Job Autopilot</div>
            <div style={{ opacity: 0.75, marginTop: 4 }}>
              Generate tailored bullets + cover letters, then track applications.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={statusPillStyle("generated")}>
              <span style={dotStyle("generated")} />
              Saved: {jobs.length}
            </div>
            <button
              style={buttonStyle("secondary")}
              onClick={() => {
                setSelectedJobId(null);
                setResult(null);
                setError("");
                showToast("Cleared preview", "info");
              }}
            >
              Clear Preview
            </button>
          </div>
        </div>

        {/* Toast */}
        {toast ? (
          <div
            style={{
              position: "fixed",
              right: 18,
              bottom: 18,
              padding: "10px 12px",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(0,0,0,0.55)",
              color: "rgba(255,255,255,0.92)",
              boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
              maxWidth: 360,
              zIndex: 9999,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 2 }}>
              {toast.kind === "success" ? "✅" : toast.kind === "error" ? "⚠️" : "ℹ️"}{" "}
              {toast.kind === "success" ? "Done" : toast.kind === "error" ? "Problem" : "Info"}
            </div>
            <div style={{ opacity: 0.9 }}>{toast.message}</div>
          </div>
        ) : null}

        {/* Error */}
        {error ? (
          <div style={{ ...cardStyle, borderColor: "rgba(255,80,80,0.25)" }}>
            <strong style={{ color: "rgba(255,160,160,0.95)" }}>Error:</strong>{" "}
            <span style={{ opacity: 0.95 }}>{error}</span>
          </div>
        ) : null}

        {/* Generate */}
        <div style={{ ...cardStyle, display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 14 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Generate</div>

            <textarea
              rows={6}
              placeholder="Paste job description here..."
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              style={textareaStyle}
            />

            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, marginTop: 10 }}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" style={inputStyle} />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <textarea
                  rows={4}
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                  style={{ ...textareaStyle, minHeight: 110 }}
                />
                <textarea
                  rows={4}
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                  style={{ ...textareaStyle, minHeight: 110 }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
              <button onClick={generate} disabled={loading || !jobDescription.trim()} style={buttonStyle("primary")}>
                {loading ? "Generating..." : "Generate Docs"}
              </button>

              <button
                style={buttonStyle("secondary")}
                onClick={() => {
                  setJobDescription("");
                  showToast("Cleared job description", "info");
                }}
              >
                Clear JD
              </button>

              <div style={{ opacity: 0.7, fontSize: 12 }}>
                Tip: after generating, pick a job on the right to preview + copy.
              </div>
            </div>
          </div>

          {/* Preview */}
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Preview</div>

            {!shown ? (
              <div style={{ opacity: 0.75, fontSize: 14, lineHeight: 1.5 }}>
                No preview yet. Generate docs or click a job from the dashboard.
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.2 }}>
                    {shown.jobTitle || "Result"}
                    {shown.status ? (
                      <span style={{ marginLeft: 10, ...statusPillStyle(shown.status) }}>
                        <span style={dotStyle(shown.status)} />
                        {shown.status}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                  <button
                    style={buttonStyle("secondary")}
                    onClick={() => {
                      copyText((shown.resumeBullets || []).join("\n"));
                      showToast("Copied bullets", "success");
                    }}
                    disabled={!shown.resumeBullets?.length}
                  >
                    Copy Bullets
                  </button>

                  <button
                    style={buttonStyle("secondary")}
                    onClick={() => {
                      copyText(shown.coverLetter || "");
                      showToast("Copied cover letter", "success");
                    }}
                    disabled={!shown.coverLetter}
                  >
                    Copy Cover Letter
                  </button>

                  <button
                    style={buttonStyle("secondary")}
                    onClick={() => {
                      downloadText("resume-bullets.txt", (shown.resumeBullets || []).join("\n"));
                      showToast("Downloaded bullets", "success");
                    }}
                    disabled={!shown.resumeBullets?.length}
                  >
                    Download Bullets
                  </button>

                  <button
                    style={buttonStyle("secondary")}
                    onClick={() => {
                      downloadText("cover-letter.txt", shown.coverLetter || "");
                      showToast("Downloaded cover letter", "success");
                    }}
                    disabled={!shown.coverLetter}
                  >
                    Download Cover Letter
                  </button>
                </div>

                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, opacity: 0.85, marginBottom: 6 }}>Resume Bullets</div>
                  <div
                    style={{
                      border: "1px solid rgba(255,255,255,0.10)",
                      borderRadius: 14,
                      padding: 12,
                      background: "rgba(0,0,0,0.20)",
                    }}
                  >
                    {(shown.resumeBullets || []).length ? (
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {(shown.resumeBullets || []).map((b, i) => (
                          <li key={i} style={{ marginBottom: 6, lineHeight: 1.5 }}>
                            {b}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div style={{ opacity: 0.75 }}>No bullets yet.</div>
                    )}
                  </div>
                </div>

                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, opacity: 0.85, marginBottom: 6 }}>Cover Letter</div>
                  <div
                    style={{
                      border: "1px solid rgba(255,255,255,0.10)",
                      borderRadius: 14,
                      padding: 12,
                      background: "rgba(0,0,0,0.20)",
                      whiteSpace: "pre-wrap",
                      lineHeight: 1.55,
                      maxHeight: 240,
                      overflow: "auto",
                    }}
                  >
                    {shown.coverLetter || <span style={{ opacity: 0.75 }}>No cover letter yet.</span>}
                  </div>
                </div>

                <div style={{ marginTop: 10, fontSize: 12, opacity: 0.65 }}>
                  Created: {formatDate(shown.createdAt)} {shown.updatedAt ? `• Updated: ${formatDate(shown.updatedAt)}` : ""}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Dashboard */}
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Dashboard</div>
              <div style={{ opacity: 0.7, marginTop: 4, fontSize: 13 }}>
                Search, filter, sort, and update status instantly.
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <input
                placeholder="Search jobs..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ ...inputStyle, width: 240 }}
              />

              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...inputStyle, width: 160 }}>
                <option value="all">All statuses</option>
                <option value="generated">generated</option>
                <option value="applied">applied</option>
                <option value="interview">interview</option>
                <option value="offer">offer</option>
                <option value="rejected">rejected</option>
              </select>

              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ ...inputStyle, width: 160 }}>
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="title">Title (A-Z)</option>
              </select>

              <button
                style={buttonStyle("secondary")}
                onClick={() => loadJobs().then(() => showToast("Refreshed jobs", "success")).catch((e) => setError(e.message))}
              >
                Refresh
              </button>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            {filteredJobs.length === 0 ? (
              <div style={{ opacity: 0.75 }}>No jobs match your filters yet.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {filteredJobs.map((job) => (
                  <div
                    key={job.id}
                    style={{
                      border: "1px solid rgba(255,255,255,0.10)",
                      borderRadius: 14,
                      padding: 12,
                      background:
                        selectedJobId === job.id ? "rgba(120, 90, 255, 0.10)" : "rgba(0,0,0,0.18)",
                      cursor: "pointer",
                      transition: "background 120ms ease",
                    }}
                    onClick={() => setSelectedJobId(job.id)}
                    title="Click to preview"
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <div style={{ fontWeight: 800, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis" }}>
                            {job.jobTitle}
                          </div>

                          <span style={statusPillStyle(job.status)}>
                            <span style={dotStyle(job.status)} />
                            {job.status}
                          </span>
                        </div>

                        <div style={{ marginTop: 6, opacity: 0.65, fontSize: 12 }}>
                          Created: {formatDate(job.createdAt)}
                          {job.updatedAt ? ` • Updated: ${formatDate(job.updatedAt)}` : ""}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <select
                          value={job.status}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            e.stopPropagation();
                            updateStatus(job.id, e.target.value);
                          }}
                          style={{ ...inputStyle, width: 160 }}
                        >
                          <option value="generated">generated</option>
                          <option value="applied">applied</option>
                          <option value="interview">interview</option>
                          <option value="rejected">rejected</option>
                          <option value="offer">offer</option>
                        </select>

                        <button
                          style={buttonStyle("secondary")}
                          onClick={(e) => {
                            e.stopPropagation();
                            copyText(job.jobTitle || "");
                            showToast("Copied job title", "success");
                          }}
                        >
                          Copy Title
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ opacity: 0.55, fontSize: 12, textAlign: "center", marginTop: 4 }}>
          Built with Azure Static Web Apps + Azure Functions + Cosmos DB.
        </div>
      </div>
    </div>
  );
}
