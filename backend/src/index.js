const { app } = require("@azure/functions");

const { generateDocuments } = require("./functions/generateDocuments");
const { listJobs } = require("./functions/listJobs");
const { updateJobStatus } = require("./functions/updateJobStatus");

// Generate docs
app.http("generateDocuments", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: generateDocuments
});

// List jobs
app.http("listJobs", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: listJobs
});

// Update job status (THIS WAS THE PROBLEM)
app.http("updateJobStatus", {
  methods: ["PUT"],
  route: "jobs/{id}/status",
  authLevel: "anonymous",
  handler: updateJobStatus
});
