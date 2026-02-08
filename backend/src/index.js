const { app } = require("@azure/functions");

/*
  RULES (important):
  - Do NOT destructure imports
  - Each function file must export the handler directly
  - All routes must be registered here with app.http()
*/

// ========================
// Core APIs
// ========================

// Generate documents
app.http("generateDocuments", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: require("./functions/generateDocuments"),
});

// List jobs
app.http("listJobs", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: require("./functions/listJobs"),
});

// Update job status
app.http("updateJobStatus", {
  methods: ["PUT", "PATCH"],
  route: "jobs/{jobId}/status",
  authLevel: "anonymous",
  handler: require("./functions/updateJobStatus"),
});

// ========================
// Auth APIs
// ========================

// Email login start
app.http("startEmailLogin", {
  methods: ["POST"],
  route: "auth/email/start",
  authLevel: "anonymous",
  handler: require("./functions/startEmailLogin"),
});

// Email login verify
app.http("verifyEmailLogin", {
  methods: ["POST"],
  route: "auth/email/verify",
  authLevel: "anonymous",
  handler: require("./functions/verifyEmailLogin"),
});

// Provider token → app JWT
app.http("authExchange", {
  methods: ["POST"],
  route: "auth/exchange",
  authLevel: "anonymous",
 handler: require("./functions/authExchange").authExchange
});
