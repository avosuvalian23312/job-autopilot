"use strict";

const crypto = require("crypto");
const { CosmosClient } = require("@azure/cosmos");
const { getSwaUserId } = require("../lib/swaUser");

const cosmos = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const container = cosmos
  .database(process.env.COSMOS_DB_NAME)
  .container(process.env.COSMOS_CONTAINER_NAME);

async function createJob(request, context) {
  try {
    // ✅ SWA auth userId from headers (STRING)
    const userId = getSwaUserId(request);
    if (!userId) {
      return { status: 401, jsonBody: { ok: false, error: "Not authenticated" } };
    }

    const body = await request.json().catch(() => ({}));

    const jobTitle = (body?.jobTitle || "").trim();
    const jobDescription = (body?.jobDescription || "").trim();

    if (!jobTitle || !jobDescription) {
      return {
        status: 400,
        jsonBody: { ok: false, error: "Missing required fields (jobTitle, jobDescription)" },
      };
    }

    const now = new Date().toISOString();

    const doc = {
      id: crypto.randomUUID(),
      userId, // ✅ always from SWA
      jobTitle,
      company: body?.company ?? "Not specified",
      website: body?.website ?? null,
      location: body?.location ?? null,
      seniority: body?.seniority ?? null,
      keywords: Array.isArray(body?.keywords) ? body.keywords : [],
      jobDescription,
      aiMode: body?.aiMode ?? "standard",
      studentMode: !!body?.studentMode,
      status: "created",
      createdAt: now,
      updatedAt: now,
    };

    await container.items.create(doc, { partitionKey: userId });

    return { status: 201, jsonBody: { ok: true, job: doc } };
  } catch (err) {
    context.error("createJob error:", err);
    return {
      status: 500,
      jsonBody: { ok: false, error: "Failed to create job", details: err?.message },
    };
  }
}

module.exports = { createJob };
