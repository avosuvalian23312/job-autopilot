const { app } = require("@azure/functions");

/*
  IMPORTANT RULE:
  - Do NOT destructure imports
  - Each function file must export the handler directly
*/

// ===== Core app APIs =====

// Generate documents
app.http("generateDocuments", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: require("./functions/generateDocuments")
});

// List jobs
app.http("listJobs", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: require("./functions/listJobs")
});

// Update job status
app.http("updateJobStatus", {
  methods: ["PUT", "PATCH"],
  route: "jobs/{jobId}/status",
  authLevel: "anonymous",
  handler: require("./functions/updateJobStatus")
});

// ===== Auth APIs =====

// Email login: send code
app.http("startEmailLogin", {
  methods: ["POST"],
  route: "auth/email/start",
  authLevel: "anonymous",
  handler: require("./functions/startEmailLogin")
});

// Email login: verify code
app.http("verifyEmailLogin", {
  methods: ["POST"],
  route: "auth/email/verify",
  authLevel: "anonymous",
  handler: require("./functions/verifyEmailLogin")
});

// Provider token -> app JWT
app.http("authExchange", {
  methods: ["POST"],
  route: "auth/exchange",
  authLevel: "anonymous",
  handler: require("./functions/authExchange")
});
