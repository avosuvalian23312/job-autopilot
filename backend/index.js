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

// Small helper so OPTIONS never accidentally hits your real handlers
const withOptions = (handler) => async (request, context) => {
  if (request.method === "OPTIONS") return { status: 204 };
  return handler(request, context);
};

// ========================
// Health
// ========================
app.http(
  "health",
  {
    methods: ["GET", "OPTIONS"],
    route: "health",
    authLevel: "anonymous",
    handler: async (request) => {
      if (request.method === "OPTIONS") return { status: 204 };
      return {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: true })
      };
    }
  }
);

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
      return require("./src/functions/listJobs.js").listJobs(request, context);
    }

    if (request.method === "POST") {
      return require("./src/functions/createJob.js").createJob(request, context);
    }

    return { status: 405, body: "Method not allowed" };
  }
});

app.http("updateJobStatus", {
  methods: ["PUT", "PATCH", "OPTIONS"],
  route: "jobs/{jobId}/status",
  authLevel: "anonymous",
  handler: withOptions(require("./src/functions/updateJobStatus.js").updateJobStatus)
});

// ========================
// Auth APIs
// ========================
app.http("authExchange", {
  methods: ["POST", "OPTIONS"],
  route: "auth/exchange",
  authLevel: "anonymous",
  handler: withOptions(require("./src/functions/authExchange.js"))
});

// ========================
// Resume APIs
// ========================

app.http("resumeUploadUrl", {
  methods: ["POST", "OPTIONS"],
  route: "resume/upload-url",
  authLevel: "anonymous",
  handler: withOptions(require("./src/functions/resumeUploadUrl.js"))
});

app.http("resumeSave", {
  methods: ["POST", "OPTIONS"],
  route: "resume/save",
  authLevel: "anonymous",
  handler: withOptions(require("./src/functions/resumeSave.js"))
});

app.http("resumeList", {
  methods: ["GET", "OPTIONS"],
  route: "resume/list",
  authLevel: "anonymous",
  handler: withOptions(require("./src/functions/resumeList.js"))
});

app.http("resumeReadUrl", {
  methods: ["POST", "OPTIONS"],
  route: "resume/read-url",
  authLevel: "anonymous",
  handler: withOptions(require("./src/functions/resumeReadUrl.js"))
});

app.http("resumeRename", {
  methods: ["POST", "OPTIONS"],
  route: "resume/rename",
  authLevel: "anonymous",
  handler: withOptions(require("./src/functions/resumeRename.js"))
});

app.http("resumeDelete", {
  methods: ["POST", "OPTIONS"],
  route: "resume/delete",
  authLevel: "anonymous",
  handler: withOptions(require("./src/functions/resumeDelete.js"))
});

app.http("resumeSetDefault", {
  methods: ["POST", "OPTIONS"],
  route: "resume/set-default",
  authLevel: "anonymous",
  handler: withOptions(require("./src/functions/resumeSetDefault.js"))
});

app.http("userinfo", {
  methods: ["GET", "OPTIONS"],
  route: "userinfo",
  authLevel: "anonymous",
  handler: withOptions(require("./src/functions/userinfo.js"))
});

// ========================
// Job sub-routes
// ========================

app.http("generateJobDocuments", {
  methods: ["POST", "OPTIONS"],
  route: "jobs/{jobId}/generate",
  authLevel: "anonymous",
  handler: withOptions(
    require("./src/functions/generateJobDocuments.js").generateJobDocuments
  )
});

app.http("getJob", {
  methods: ["GET", "OPTIONS"],
  route: "jobs/{jobId}",
  authLevel: "anonymous",
  handler: withOptions(require("./src/functions/getJob.js").getJob)
});

app.http("extractJob", {
  methods: ["POST", "OPTIONS"],
  route: "jobs/extract",
  authLevel: "anonymous",
  handler: withOptions(require("./src/functions/extractJob.js"))
});

app.http("previewJob", {
  methods: ["POST", "OPTIONS"],
  route: "jobs/preview",
  authLevel: "anonymous",
  handler: withOptions(require("./src/functions/previewJob.js"))
});

app.http("debugAuth", {
  methods: ["GET", "OPTIONS"],
  route: "debug/auth",
  authLevel: "anonymous",
  handler: withOptions(require("./src/functions/debugAuth.js").debugAuth)
});

app.http("dashboard", {
  methods: ["GET", "OPTIONS"],
  route: "dashboard",
  authLevel: "anonymous",
  handler: withOptions(require("./src/functions/dashboard.js").dashboard)
});
app.http("settings", {
  methods: ["GET", "POST", "OPTIONS"],
  route: "settings",
  authLevel: "anonymous",
  handler: async (request, context) => {
    if (request.method === "OPTIONS") return { status: 204 };

    if (request.method === "GET") {
      return require("./src/functions/settingsGet.js").settingsGet(request, context);
    }

    if (request.method === "POST") {
      return require("./src/functions/settingsSave.js").settingsSave(request, context);
    }

    return { status: 405, body: "Method not allowed" };
  },
});
app.http("supportCreate", {
  methods: ["POST", "OPTIONS"],
  route: "support",
  authLevel: "anonymous",
  handler: withOptions(
    require("./src/functions/supportCreate.js").supportCreate
  ),
});
app.http("resumeOptimize", {
  methods: ["POST", "OPTIONS"],
  route: "resume/optimize",
  authLevel: "anonymous",
  handler: withOptions(require("./src/functions/resumeOptimize.js").resumeOptimize),
});
const { applyPrepare } = require("./src/functions/applyPrepare");
const { coverLettersGet } = require("./src/functions/coverLettersGet");




app.http("applyPrepare", {
  methods: ["POST", "OPTIONS"],
  route: "apply/prepare",
  authLevel: "anonymous",
  handler: applyPrepare,
});




app.http("coverLettersGet", {
  methods: ["GET", "OPTIONS"],
  route: "coverletters/{id}",
  authLevel: "anonymous",
  handler: coverLettersGet,
});