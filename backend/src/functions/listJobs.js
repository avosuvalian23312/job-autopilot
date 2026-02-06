const fs = require("fs");
const path = require("path");

const JOBS_PATH = path.join(process.cwd(), "data", "jobs.json");

function readJobs() {
  try {
    const raw = fs.readFileSync(JOBS_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function listJobs(request, context) {
  return {
    status: 200,
    jsonBody: { jobs: readJobs() }
  };
}

module.exports = { listJobs };
