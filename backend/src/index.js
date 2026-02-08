const { app } = require("@azure/functions");

const { generateDocuments } = require("./functions/generateDocuments");
const { listJobs } = require("./functions/listJobs");
const { updateJobStatus } = require("./functions/updateJobStatus");

const { startEmailLogin } = require("./functions/startEmailLogin");
const { verifyEmailLogin } = require("./functions/verifyEmailLogin");

const { authExchange } = require("./functions/authExchange");

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

// Update job status
app.http("updateJobStatus", {
  methods: ["PUT", "PATCH"],
  route: "jobs/{jobId}/status",
  authLevel: "anonymous",
  handler: updateJobStatus
});

// Email auth: send code
app.http("startEmailLogin", {
  methods: ["POST"],
  route: "auth/email/start",
  authLevel: "anonymous",
  handler: startEmailLogin
});

// Email auth: verify code
app.http("verifyEmailLogin", {
  methods: ["POST"],
  route: "auth/email/verify",
  authLevel: "anonymous",
  handler: verifyEmailLogin
});

// NEW: Provider token -> App token
app.http("authExchange", {
  methods: ["POST"],
  route: "auth/exchange",
  authLevel: "anonymous",
  handler: authExchange
});
