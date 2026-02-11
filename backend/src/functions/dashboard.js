"use strict";

const { CosmosClient } = require("@azure/cosmos");
const { getSwaUserId } = require("../lib/swaUser"); // MUST return STRING userId

const cosmos = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const container = cosmos
  .database(process.env.COSMOS_DB_NAME)
  .container(process.env.COSMOS_CONTAINER_NAME); // jobs container (PK=/userId)

function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function fmtTimeAgo(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hours ago`;
  const days = Math.floor(hrs / 24);
  return `${days} days ago`;
}

function normalizeStatus(s) {
  return String(s || "").toLowerCase();
}

// Derive “activity” without extra tables:
// - createdAt recent => job_added
// - outputs + completedAt recent => doc_generated
// - updatedAt recent and status exists => status_changed
function deriveActivity(job) {
  const createdAt = job?.createdAt || null;
  const updatedAt = job?.updatedAt || null;
  const completedAt = job?.completedAt || null;

  const status = normalizeStatus(job?.status);
  const title = job?.jobTitle || "Job";
  const company = job?.company || "Company";

  // choose the best timestamp for activity
  let ts = updatedAt || completedAt || createdAt;

  if (job?.outputs?.resume || job?.outputs?.coverLetter) {
    return {
      type: "doc_generated",
      text: `Generated documents for ${title} at ${company}`,
      time: fmtTimeAgo(completedAt || updatedAt || createdAt),
      ts: completedAt || updatedAt || createdAt || null,
      jobId: job?.id,
    };
  }

  // created very recently (or never updated) => job added
  if (createdAt && (!updatedAt || createdAt === updatedAt)) {
    return {
      type: "job_added",
      text: `Added ${title} at ${company}`,
      time: fmtTimeAgo(createdAt),
      ts: createdAt,
      jobId: job?.id,
    };
  }

  // otherwise treat as status change
  const statusLabel =
    status === "interview"
      ? "Interview"
      : status === "offer"
      ? "Offer"
      : status === "applied"
      ? "Applied"
      : status === "rejected"
      ? "Rejected"
      : status || "Updated";

  return {
    type: "status_changed",
    text: `Application updated to ${statusLabel} (${title} at ${company})`,
    time: fmtTimeAgo(updatedAt || createdAt),
    ts: updatedAt || createdAt,
    jobId: job?.id,
  };
}

async function dashboard(request, context) {
  try {
    const userId = getSwaUserId(request);
    if (!userId) {
      return { status: 401, jsonBody: { ok: false, error: "Not authenticated" } };
    }

    const since = isoDaysAgo(7);

    // Pull recent jobs (limit for speed)
    const { resources: jobs } = await container.items
      .query(
        {
          query:
            "SELECT TOP 50 * FROM c WHERE c.userId = @userId ORDER BY c.updatedAt DESC",
          parameters: [{ name: "@userId", value: userId }],
        },
        { partitionKey: userId }
      )
      .fetchAll();

    const safeJobs = Array.isArray(jobs) ? jobs : [];

    // Weekly metrics derived from createdAt + status
    const weekJobs = safeJobs.filter((j) => {
      const t = new Date(j?.createdAt || j?.updatedAt || 0).getTime();
      return Number.isFinite(t) && t >= new Date(since).getTime();
    });

    const metrics = {
      applications: weekJobs.length,
      interviews: weekJobs.filter((j) => normalizeStatus(j?.status) === "interview").length,
      offers: weekJobs.filter((j) => normalizeStatus(j?.status) === "offer").length,
    };

    // Recent activity derived from jobs
    const recentActivity = safeJobs
      .map(deriveActivity)
      .filter((a) => a?.ts)
      .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
      .slice(0, 10);

    return {
      status: 200,
      jsonBody: { ok: true, metrics, recentActivity },
    };
  } catch (err) {
    context.error("dashboard error:", err);
    return {
      status: 500,
      jsonBody: { ok: false, error: "Failed to load dashboard", details: err?.message || "Unknown error" },
    };
  }
}

module.exports = { dashboard };
