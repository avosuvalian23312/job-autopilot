// backend/index.js (Azure Functions v4)
// Single place to register ALL HTTP routes.

const { app } = require("@azure/functions");

// ========================
// Health (useful to confirm API is deployed)
// ========================
app.http("health", {
  methods: ["GET", "OPTIONS"],
  route: "health",
  authLevel: "anonymous",
  handler: async (request) => {
    if (request.method === "OPTIONS") return { status: 204 };
    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true }),
    };
  },
});

// ========================
// Core APIs
// ========================

// Generate documents
app.http("generateDocuments", {
  methods: ["POST", "OPTIONS"],
  route: "generate-documents",
  authLevel: "anonymous",
  handler: require("./src/functions/generateDocuments"),
});

// List jobs
app.http("listJobs", {
  methods: ["GET", "OPTIONS"],
  route: "jobs",
  authLevel: "anonymous",
  handler: require("./src/functions/listJobs"),
});

// Update job status
app.http("updateJobStatus", {
  methods: ["PUT", "PATCH", "OPTIONS"],
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

// ========================
// Resume APIs
// ========================

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

// List resumes
app.http("resumeList", {
  methods: ["GET", "OPTIONS"],
  route: "resume/list",
  authLevel: "anonymous",
  handler: require("./src/functions/resumeList"),
});

// Read resume content/SAS url
app.http("resumeReadUrl", {
  methods: ["POST", "OPTIONS"],
  route: "resume/read-url",
  authLevel: "anonymous",
  handler: require("./src/functions/resumeReadUrl"),
});

// Rename resume
app.http("resumeRename", {
  methods: ["POST", "OPTIONS"],
  route: "resume/rename",
  authLevel: "anonymous",
  handler: require("./src/functions/resumeRename"),
});

// Delete resume
app.http("resumeDelete", {
  methods: ["POST", "OPTIONS"],
  route: "resume/delete",
  authLevel: "anonymous",
  handler: require("./src/functions/resumeDelete"),
});

// Set default resume
app.http("resumeSetDefault", {
  methods: ["POST", "OPTIONS"],
  route: "resume/set-default",
  authLevel: "anonymous",
  handler: require("./src/functions/resumeSetDefault"),
});

// User info
app.http("userinfo", {
  methods: ["GET", "OPTIONS"],
  route: "userinfo",
  authLevel: "anonymous",
  handler: require("./src/functions/userinfo"),
});
