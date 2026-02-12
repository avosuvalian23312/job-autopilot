// backend/index.js (Azure Functions v4 - code-first model)
console.log("✅ backend/index.js loaded");

"use strict";

const { app } = require("@azure/functions");

if (!app || typeof app.http !== "function") {
  throw new Error(
    "Azure Functions 'app' is undefined. Ensure @azure/functions v4 is installed in dependencies."
  );
}

// OPTIONS guard
const withOptions = (handler) => async (request, context) => {
  if (request.method === "OPTIONS") return { status: 204 };
  return handler(request, context);
};

// Pick an exported function reliably (supports multiple export styles)
function pickHandler(mod, exportName) {
  if (!mod) return null;

  // module.exports = function
  if (typeof mod === "function") return mod;

  // module.exports = { exportName: function }
  if (exportName && typeof mod[exportName] === "function") return mod[exportName];

  // module.exports = { default: function }
  if (typeof mod.default === "function") return mod.default;

  // fallback: first function export found
  for (const k of Object.keys(mod)) {
    if (typeof mod[k] === "function") return mod[k];
  }

  return null;
}

// Lazy loader so a single broken require/export doesn't kill ALL routes (global 404)
const lazy = (modulePath, exportName = null) =>
  withOptions(async (request, context) => {
    try {
      const mod = require(modulePath); // NOTE: exact casing + .js paths below
      const fn = pickHandler(mod, exportName);

      if (typeof fn !== "function") {
        return {
          status: 500,
          jsonBody: {
            ok: false,
            error: "Handler export mismatch",
            detail: `No function export found in ${modulePath} (expected ${exportName || "a function export"})`,
          },
        };
      }

      return await fn(request, context);
    } catch (err) {
      context?.log?.error?.(`Handler load/run failed: ${modulePath}`, err);
      return {
        status: 500,
        jsonBody: {
          ok: false,
          error: "Handler crashed",
          detail: err?.message || String(err),
        },
      };
    }
  });

// ========================
// Health
// ========================
app.http("health", {
  methods: ["GET", "OPTIONS"],
  route: "health",
  authLevel: "anonymous",
  handler: withOptions(async () => ({ status: 200, jsonBody: { ok: true } })),
});

// ========================
// Core APIs
// ========================

// ONE "jobs" route for GET + POST
app.http("jobs", {
  methods: ["GET", "POST", "OPTIONS"],
  route: "jobs",
  authLevel: "anonymous",
  handler: withOptions(async (request, context) => {
    if (request.method === "GET") {
      // src/functions/listJobs.js
      const mod = require("./src/functions/listJobs.js");
      const fn = pickHandler(mod, "listJobs");
      if (!fn) return { status: 500, jsonBody: { ok: false, error: "listJobs export missing" } };
      return fn(request, context);
    }

    if (request.method === "POST") {
      // src/functions/createJob.js
      const mod = require("./src/functions/createJob.js");
      const fn = pickHandler(mod, "createJob");
      if (!fn) return { status: 500, jsonBody: { ok: false, error: "createJob export missing" } };
      return fn(request, context);
    }

    return { status: 405, body: "Method not allowed" };
  }),
});

app.http("updateJobStatus", {
  methods: ["PUT", "PATCH", "OPTIONS"],
  route: "jobs/{jobId}/status",
  authLevel: "anonymous",
  handler: lazy("./src/functions/updateJobStatus.js", "updateJobStatus"),
});

// ========================
// Auth APIs
// ========================
app.http("authExchange", {
  methods: ["POST", "OPTIONS"],
  route: "auth/exchange",
  authLevel: "anonymous",
  handler: lazy("./src/functions/authExchange.js"), // file is authExchange.js
});

// ========================
// Resume APIs
// ========================
app.http("resumeUploadUrl", {
  methods: ["POST", "OPTIONS"],
  route: "resume/upload-url",
  authLevel: "anonymous",
  handler: lazy("./src/functions/resumeUploadUrl.js"),
});

app.http("resumeSave", {
  methods: ["POST", "OPTIONS"],
  route: "resume/save",
  authLevel: "anonymous",
  handler: lazy("./src/functions/resumeSave.js"),
});

app.http("resumeList", {
  methods: ["GET", "OPTIONS"],
  route: "resume/list",
  authLevel: "anonymous",
  handler: lazy("./src/functions/resumeList.js"),
});

app.http("resumeReadUrl", {
  methods: ["POST", "OPTIONS"],
  route: "resume/read-url",
  authLevel: "anonymous",
  handler: lazy("./src/functions/resumeReadUrl.js"),
});

app.http("resumeRename", {
  methods: ["POST", "OPTIONS"],
  route: "resume/rename",
  authLevel: "anonymous",
  handler: lazy("./src/functions/resumeRename.js"),
});

app.http("resumeDelete", {
  methods: ["POST", "OPTIONS"],
  route: "resume/delete",
  authLevel: "anonymous",
  handler: lazy("./src/functions/resumeDelete.js"),
});

app.http("resumeSetDefault", {
  methods: ["POST", "OPTIONS"],
  route: "resume/set-default",
  authLevel: "anonymous",
  handler: lazy("./src/functions/resumeSetDefault.js"),
});

app.http("resumeOptimize", {
  methods: ["POST", "OPTIONS"],
  route: "resume/optimize",
  authLevel: "anonymous",
  handler: lazy("./src/functions/resumeOptimize.js", "resumeOptimize"),
});

// ========================
// Job sub-routes
// ========================
app.http("generateJobDocuments", {
  methods: ["POST", "OPTIONS"],
  route: "jobs/{jobId}/generate",
  authLevel: "anonymous",
  handler: lazy("./src/functions/generateJobDocuments.js", "generateJobDocuments"),
});

app.http("getJob", {
  methods: ["GET", "OPTIONS"],
  route: "jobs/{jobId}",
  authLevel: "anonymous",
  handler: lazy("./src/functions/getJob.js", "getJob"),
});

app.http("extractJob", {
  methods: ["POST", "OPTIONS"],
  route: "jobs/extract",
  authLevel: "anonymous",
  handler: lazy("./src/functions/extractJob.js"),
});

app.http("previewJob", {
  methods: ["POST", "OPTIONS"],
  route: "jobs/preview",
  authLevel: "anonymous",
  handler: lazy("./src/functions/previewJob.js"),
});

// ========================
// Misc
// ========================
app.http("debugAuth", {
  methods: ["GET", "OPTIONS"],
  route: "debug/auth",
  authLevel: "anonymous",
  handler: lazy("./src/functions/debugAuth.js", "debugAuth"),
});

app.http("dashboard", {
  methods: ["GET", "OPTIONS"],
  route: "dashboard",
  authLevel: "anonymous",
  handler: lazy("./src/functions/dashboard.js", "dashboard"),
});

app.http("settings", {
  methods: ["GET", "POST", "OPTIONS"],
  route: "settings",
  authLevel: "anonymous",
  handler: withOptions(async (request, context) => {
    if (request.method === "GET") {
      const mod = require("./src/functions/settingsGet.js");
      const fn = pickHandler(mod, "settingsGet");
      if (!fn) return { status: 500, jsonBody: { ok: false, error: "settingsGet export missing" } };
      return fn(request, context);
    }

    if (request.method === "POST") {
      const mod = require("./src/functions/settingsSave.js");
      const fn = pickHandler(mod, "settingsSave");
      if (!fn) return { status: 500, jsonBody: { ok: false, error: "settingsSave export missing" } };
      return fn(request, context);
    }

    return { status: 405, body: "Method not allowed" };
  }),
});

app.http("supportCreate", {
  methods: ["POST", "OPTIONS"],
  route: "support",
  authLevel: "anonymous",
  handler: lazy("./src/functions/supportCreate.js", "supportCreate"),
});

app.http("userinfo", {
  methods: ["GET", "OPTIONS"],
  route: "userinfo",
  authLevel: "anonymous",
  handler: lazy("./src/functions/userinfo.js"),
});

// ========================
// Apply / Cover Letters (match EXACT file casing)
// Files in your folder: applyPrepare.js, coverLettersGet.js
// ========================
app.http("applyPrepare", {
  methods: ["POST", "OPTIONS"],
  route: "apply/prepare",
  authLevel: "anonymous",
  handler: lazy("./src/functions/applyPrepare.js", "applyPrepare"),
});

app.http("coverLettersGet", {
  methods: ["GET", "OPTIONS"],
  route: "coverletters/{id}",
  authLevel: "anonymous",
  handler: lazy("./src/functions/coverLettersGet.js", "coverLettersGet"),
});

// Optional (you have verifyEmailLogin.js in your folder)
app.http("verifyEmailLogin", {
  methods: ["POST", "OPTIONS"],
  route: "verify/email-login",
  authLevel: "anonymous",
  handler: lazy("./src/functions/verifyEmailLogin.js", "verifyEmailLogin"),
});
