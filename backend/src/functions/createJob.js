// backend/src/functions/createJob.js
"use strict";
const crypto = require("crypto");
const { CosmosClient } = require("@azure/cosmos");

const cosmos = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const container = cosmos
  .database(process.env.COSMOS_DB_NAME)
  .container(process.env.COSMOS_CONTAINER_NAME); // jobs container

async function createJob(request, context) {
  try {
    if (request.method === "OPTIONS") return { status: 204 };

    const body = await request.json().catch(() => ({}));

    const {
      userId,
      jobTitle,
      company,
      website,
      location,
      seniority,
      keywords,
      jobDescription,
      aiMode,
      studentMode,
      resumeId, // optional, if you want to store which resume was used
    } = body;

    if (!userId || !jobTitle || !jobDescription) {
      return { status: 400, jsonBody: { error: "Missing required fields (userId, jobTitle, jobDescription)" } };
    }

    const now = new Date().toISOString();

    const job = {
      id: crypto.randomUUID(),
      userId, // PK
      jobTitle,
      company: company || null,
      website: website || null,
      location: location || null,
      seniority: seniority || null,
      keywords: Array.isArray(keywords) ? keywords : [],
      jobDescription,
      aiMode: aiMode || "standard",
      studentMode: !!studentMode,
      resumeId: resumeId || null,

      status: "queued", // queued -> generating -> completed/failed
      createdAt: now,
      updatedAt: now,

      outputs: {
        resume: null,       // { text, fileName, ... } later
        coverLetter: null,  // { text, fileName, ... } later
      },
    };

    await container.items.create(job);

    return { status: 200, jsonBody: job };
  } catch (err) {
    context.error("createJob error:", err);
    return { status: 500, jsonBody: { error: "Failed to create job", details: err?.message || "Unknown error" } };
  }
}

module.exports = { createJob };
