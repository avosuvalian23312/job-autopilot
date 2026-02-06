const fs = require("fs");
const path = require("path");

const JOBS_PATH = path.join(process.cwd(), "data", "jobs.json");

function readJobs() {
  try {
    return JSON.parse(fs.readFileSync(JOBS_PATH, "utf8"));
  } catch {
    return [];
  }
}

function writeJobs(jobs) {
  fs.writeFileSync(JOBS_PATH, JSON.stringify(jobs, null, 2), "utf8");
}

async function updateJobStatus(request, context) {
  const { id } = request.params;

  let body = {};
  try {
    body = await request.json();
  } catch {}

  const status = (body.status || "").trim();

  const allowed = new Set(["generated", "applied", "interview", "rejected", "offer"]);

  if (!id) {
    return { status: 400, jsonBody: { error: "Missing job id in URL" } };
  }
  if (!allowed.has(status)) {
    return {
      status: 400,
      jsonBody: { error: "Invalid status", allowed: Array.from(allowed) }
    };
  }

  const jobs = readJobs();
  const job = jobs.find(j => j.id === id);

  if (!job) {
    return { status: 404, jsonBody: { error: "Job not found" } };
  }

  job.status = status;
  job.updatedAt = new Date().toISOString();

  writeJobs(jobs);

  return { status: 200, jsonBody: { ok: true, job } };
}

module.exports = { updateJobStatus };
