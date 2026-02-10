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
  handler: require("./src/functions/generateDocuments"),
});

// List jobs
app.http("listJobs", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: require("./src/functions/listJobs"),
});

// Update job status
app.http("updateJobStatus", {
  methods: ["PUT", "PATCH"],
  route: "jobs/{jobId}/status",
  authLevel: "anonymous",
  handler: require("./src/functions/updateJobStatus"),
});

// ========================
// Auth APIs
// ========================



// Provider token → app JWT
app.http("authExchange", {
  methods: ["POST", "OPTIONS"],
  route: "auth/exchange",
  authLevel: "anonymous",
  handler: require("./src/functions/authExchange"),
});
// Resume upload SAS
app.http("resumeUploadUrl", {
  methods: ["POST", "OPTIONS"],
  route: "resume/upload-url",
  authLevel: "anonymous",
  handler: require("./src/functions/resumeUploadUrl"),
});

// Save resume metadata to Cosmos user doc
app.http("resumeSave", {
  methods: ["POST", "OPTIONS"],
  route: "resume/save",
  authLevel: "anonymous",
  handler: require("./src/functions/resumeSave"),
});
// index.js
app.http("resumeList", {
  methods: ["GET", "OPTIONS"],
  route: "resume/list",
  authLevel: "anonymous",
  handler: require("./src/functions/resumeList"),
});

// User info (requires Authorization Bearer token)
app.http("userinfo", {
  methods: ["GET", "OPTIONS"],
  route: "userinfo",
  authLevel: "anonymous",
  handler: require("./src/functions/userinfo"),
});
app.http("resumeRename", {
  methods: ["POST", "OPTIONS"],
  route: "resume/rename",
  authLevel: "anonymous",
  handler: require("./src/functions/resumeRename"),
});

app.http("resumeDelete", {
  methods: ["POST", "OPTIONS"],
  route: "resume/delete",
  authLevel: "anonymous",
  handler: require("./src/functions/resumeDelete"),
});
app.http("resumeSetDefault", {
  methods: ["POST", "OPTIONS"],
  route: "resume/set-default",
  authLevel: "anonymous",
  handler: require("./src/functions/resumeSetDefault"),
});
