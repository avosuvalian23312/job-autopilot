import { useEffect, useState } from "react";

const API = "http://localhost:7071/api";

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

export default function App() {
  const [jobDescription, setJobDescription] = useState("");
  const [name, setName] = useState("Avetis Suvalian");
  const [experience, setExperience] = useState("Walmart Auto Care\nAndy's Frozen Custard");
  const [skills, setSkills] = useState("Customer service\nTroubleshooting");

  const [result, setResult] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadJobs() {
    setError("");
    const r = await fetch(`${API}/listJobs`);
    if (!r.ok) throw new Error(`listJobs failed (${r.status})`);
    const data = await r.json();
    setJobs(data.jobs || []);
  }

  useEffect(() => {
    loadJobs().catch((e) => setError(e.message || "Failed to load jobs"));
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
      await loadJobs();
      // leave selectedJob as-is; user can click a job to open
    } catch (e) {
      setError(e.message || "Generate failed");
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id, status) {
    setError("");
    try {
      const r = await fetch(`${API}/jobs/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `update status failed (${r.status})`);

      await loadJobs();

      // keep the open panel synced if you updated the selected job
      if (selectedJob?.id === id) setSelectedJob(data.job || selectedJob);
    } catch (e) {
      setError(e.message || "Status update failed");
    }
  }

  // Show selected dashboard item first; otherwise show last generated result
  const shown = selectedJob || result;

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", fontFamily: "Arial" }}>
      <h1>Job Autopilot</h1>

      {error ? (
        <div style={{ marginBottom: 12, padding: 10, border: "1px solid #f5c2c7" }}>
          <strong>Error:</strong> {error}
        </div>
      ) : null}

      <h2>Generate</h2>
      <textarea
        rows={6}
        placeholder="Paste job description here..."
        value={jobDescription}
        onChange={(e) => setJobDescription(e.target.value)}
        style={{ width: "100%" }}
      />

      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" style={{ flex: 1 }} />
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        <textarea rows={4} value={experience} onChange={(e) => setExperience(e.target.value)} style={{ flex: 1 }} />
        <textarea rows={4} value={skills} onChange={(e) => setSkills(e.target.value)} style={{ flex: 1 }} />
      </div>

      <button onClick={generate} disabled={loading || !jobDescription.trim()} style={{ marginTop: 12 }}>
        {loading ? "Generating..." : "Generate Docs"}
      </button>

      {shown && (
        <div style={{ marginTop: 20, padding: 12, border: "1px solid #ddd" }}>
          <h3>{shown.jobTitle || "Result"}</h3>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <button onClick={() => copyText((shown.resumeBullets || []).join("\n"))} disabled={!shown.resumeBullets?.length}>
              Copy Bullets
            </button>

            <button onClick={() => copyText(shown.coverLetter || "")} disabled={!shown.coverLetter}>
              Copy Cover Letter
            </button>

            <button
              onClick={() => downloadText("resume-bullets.txt", (shown.resumeBullets || []).join("\n"))}
              disabled={!shown.resumeBullets?.length}
            >
              Download Bullets
            </button>

            <button onClick={() => downloadText("cover-letter.txt", shown.coverLetter || "")} disabled={!shown.coverLetter}>
              Download Cover Letter
            </button>
          </div>

          <h4>Resume Bullets</h4>
          <ul>
            {(shown.resumeBullets || []).map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>

          <h4>Cover Letter</h4>
          <pre style={{ whiteSpace: "pre-wrap" }}>{shown.coverLetter}</pre>
        </div>
      )}

      <h2 style={{ marginTop: 30 }}>Dashboard</h2>
      {jobs.length === 0 ? <div>No jobs saved yet.</div> : null}

      {jobs.map((job) => (
        <div key={job.id} style={{ border: "1px solid #eee", padding: 10, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <strong
              style={{
                cursor: "pointer",
                textDecoration: selectedJob?.id === job.id ? "underline" : "none",
              }}
              onClick={() => setSelectedJob(job)}
              title="Click to open"
            >
              {job.jobTitle}
            </strong>

            <select value={job.status} onChange={(e) => updateStatus(job.id, e.target.value)}>
              <option value="generated">generated</option>
              <option value="applied">applied</option>
              <option value="interview">interview</option>
              <option value="rejected">rejected</option>
              <option value="offer">offer</option>
            </select>
          </div>

          <small>{job.createdAt}</small>
        </div>
      ))}
    </div>
  );
}
