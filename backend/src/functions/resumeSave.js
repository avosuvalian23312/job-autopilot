// backend/src/functions/resumeSave.js
"use strict";

const { CosmosClient } = require("@azure/cosmos");
const crypto = require("crypto");

function safeUserId(userId) {
  return String(userId || "").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function stripQuery(url) {
  if (!url) return "";
  try {
    const u = new URL(url);
    u.search = "";
    return u.toString();
  } catch {
    return String(url).split("?")[0];
  }
}

function getSwaUser(request) {
  const header =
    request.headers.get("x-ms-client-principal") ||
    request.headers.get("X-MS-CLIENT-PRINCIPAL");

  if (!header) return null;

  try {
    const decoded = Buffer.from(header, "base64").toString("utf8");
    const principal = JSON.parse(decoded);

    if (!principal?.userId) return null;

    const email =
      principal.claims?.find((c) => c.typ === "emails")?.val ||
      principal.userDetails ||
      "";

    return { userId: principal.userId, email };
  } catch {
    return null;
  }
}

function normalizeResumeText(t) {
  // Keep it simple + stable for hashing
  const s = String(t || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((x) => x.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  return s.trim();
}

function sha256(s) {
  return crypto.createHash("sha256").update(String(s || ""), "utf8").digest("hex");
}

module.exports = async function (request, context) {
  try {
    if (request.method === "OPTIONS") {
      return {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST,OPTIONS",
          "Access-Control-Allow-Headers": "content-type",
        },
      };
    }

    const COSMOS_CONNECTION_STRING = process.env.COSMOS_CONNECTION_STRING;
    const COSMOS_DB_NAME = process.env.COSMOS_DB_NAME;
    const COSMOS_RESUMES_CONTAINER_NAME =
      process.env.COSMOS_RESUMES_CONTAINER_NAME;

    if (!COSMOS_CONNECTION_STRING) {
      return {
        status: 500,
        jsonBody: { ok: false, error: "Missing COSMOS_CONNECTION_STRING" },
      };
    }
    if (!COSMOS_DB_NAME) {
      return {
        status: 500,
        jsonBody: { ok: false, error: "Missing COSMOS_DB_NAME" },
      };
    }
    if (!COSMOS_RESUMES_CONTAINER_NAME) {
      return {
        status: 500,
        jsonBody: { ok: false, error: "Missing COSMOS_RESUMES_CONTAINER_NAME" },
      };
    }

    const user = getSwaUser(request);
    if (!user) {
      return { status: 401, jsonBody: { ok: false, error: "Not authenticated" } };
    }

    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const blobName = body.blobName || body.blobPath || "";
    const originalName = body.originalName || body.fileName || "resume.pdf";
    const contentType = body.contentType || "application/octet-stream";
    const size = Number(body.size || 0);

    if (!blobName) {
      return { status: 400, jsonBody: { ok: false, error: "Missing blobName" } };
    }

    const blobUrl = body.uploadUrl ? stripQuery(body.uploadUrl) : "";

    // ✅ Optional: accept extracted text from frontend or another step
    const incomingText = normalizeResumeText(body.text || body.resumeText || "");
    const hasText = !!incomingText;

    const now = new Date().toISOString();

    const doc = {
      id: `resume:${safeUserId(user.userId)}:${Date.now()}`,
      userId: user.userId,
      email: user.email,

      name: body.name || originalName,
      isDefault: body.isDefault ?? false,

      blobName,
      blobUrl,
      originalName,
      contentType,
      size,

      // ✅ NEW: text fields (critical for ATS tailoring)
      text: hasText ? incomingText : null,
      textHash: hasText ? sha256(incomingText) : null,
      textStatus: hasText ? "ready" : "pending", // pending until you parse it
      textUpdatedAt: hasText ? now : null,
      textError: null,

      uploadedAt: now,
      updated_date: now.split("T")[0],
    };

    const cosmos = new CosmosClient(COSMOS_CONNECTION_STRING);
    const container = cosmos.database(COSMOS_DB_NAME).container(COSMOS_RESUMES_CONTAINER_NAME);

    await container.items.upsert(doc, { partitionKey: user.userId });

    return { status: 200, jsonBody: { ok: true, resume: doc } };
  } catch (err) {
    context.log.error("resumeSave error:", err);
    return {
      status: 500,
      jsonBody: {
        ok: false,
        error: "Internal Server Error",
        detail: err?.message || String(err),
      },
    };
  }
};
