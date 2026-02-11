// backend/index.js (Azure Functions v4 - code-first model)
// Single place to register ALL HTTP routes.
console.log("✅ backend/index.js loaded");

"use strict";

const { app } = require("@azure/functions");

if (!app || typeof app.http !== "function") {
  throw new Error(
    "Azure Functions 'app' is undefined. Ensure @azure/functions v4 is installed in dependencies."
  );
}

// ========================
// Health
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

// ✅ IMPORTANT:
// Register ONE "jobs" route for GET + POST and dispatch by method.
app.http("jobs", {
  methods: ["GET", "POST", "OPTIONS"],
  route: "jobs",
  authLevel: "anonymous",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") return { status: 204 };

    if (request.method === "GET") {
      // ✅ FIX: listJobs is exported as { listJobs }
      return require("./src/functions/listJobs.js").listJobs(request, context);
    }

    if (request.method === "POST") {
      return require("./src/functions/createJob.js").createJob(request, context);
    }

    return { status: 405, body: "Method not allowed" };
  },
});

app.http("updateJobStatus", {
  methods: ["PUT", "PATCH", "OPTIONS"],
  route: "jobs/{jobId}/status",
  authLevel: "anonymous",
  handler: require("./src/functions/updateJobStatus.js").updateJobStatus,

});

// ========================
// Auth APIs
// ========================
app.http("authExchange", {
  methods: ["POST", "OPTIONS"],
  route: "auth/exchange",
  authLevel: "anonymous",
  handler: require("./src/functions/authExchange.js"),
});

// ========================
// Resume APIs
// ========================

// ✅ FIX: route casing (use all-lowercase consistently)
app.http("resumeUploadUrl", {
  methods: ["POST", "OPTIONS"],
  route: "resume/upload-url",
  authLevel: "anonymous",
  handler: require("./src/functions/resumeUploadUrl.js"),
});

app.http("resumeSave", {
  methods: ["POST", "OPTIONS"],
  route: "resume/save",
  authLevel: "anonymous",
  handler: require("./src/functions/resumeSave.js"),
});

app.http("resumeList", {
  methods: ["GET", "OPTIONS"],
  route: "resume/list",
  authLevel: "anonymous",
  handler: require("./src/functions/resumeList.js"),
});

app.http("resumeReadUrl", {
  methods: ["POST", "OPTIONS"],
  route: "resume/read-url",
  authLevel: "anonymous",
  handler: require("./src/functions/resumeReadUrl.js"),
});

app.http("resumeRename", {
  methods: ["POST", "OPTIONS"],
  route: "resume/rename",
  authLevel: "anonymous",
  handler: require("./src/functions/resumeRename.js"),
});

app.http("resumeDelete", {
  methods: ["POST", "OPTIONS"],
  route: "resume/delete",
  authLevel: "anonymous",
  handler: require("./src/functions/resumeDelete.js"),
});

app.http("resumeSetDefault", {
  methods: ["POST", "OPTIONS"],
  route: "resume/set-default",
  authLevel: "anonymous",
  handler: require("./src/functions/resumeSetDefault.js"),
});

app.http("userinfo", {
  methods: ["GET", "OPTIONS"],
  route: "userinfo",
  authLevel: "anonymous",
  handler: require("./src/functions/userinfo.js"),
});

// ========================
// Job sub-routes
// ========================

app.http("generateJobDocuments", {
  methods: ["POST", "OPTIONS"],
  route: "jobs/{jobId}/generate",
  authLevel: "anonymous",
  handler: require("./src/functions/generateJobDocuments.js").generateJobDocuments,
});

app.http("getJob", {
  methods: ["GET", "OPTIONS"],
  route: "jobs/{jobId}",
  authLevel: "anonymous",
  handler: require("./src/functions/getJob.js").getJob,
});

app.http("extractJob", {
  methods: ["POST", "OPTIONS"],
  route: "jobs/extract",
  authLevel: "anonymous",
  handler: require("./src/functions/extractJob.js"),
});

app.http("previewJob", {
  methods: ["POST", "OPTIONS"],
  route: "jobs/preview",
  authLevel: "anonymous",
  handler: require("./src/functions/previewJob.js"),
});
