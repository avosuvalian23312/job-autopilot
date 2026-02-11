"use strict";

const crypto = require("crypto");
const { CosmosClient } = require("@azure/cosmos");
const { getSwaUserId } = require("../lib/swaUser");

const cosmos = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const container = cosmos
  .database(process.env.COSMOS_DB_NAME)
  .container(process.env.COSMOS_CONTAINER_NAME);

function toNumberOrNull(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string") {
    const cleaned = val.replace(/[^\d.]/g, "");
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizePeriod(val) {
  if (!val) return null;
  const p = String(val).trim().toLowerCase();
  if (["hour", "hourly", "hr", "/hr"].includes(p)) return "hourly";
  if (["year", "yearly", "yr", "annual", "annually", "/yr"].includes(p)) return "yearly";
  return p; // allow custom strings if you want (e.g., "monthly")
}

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

    // ✅ Pay support (either body.pay.* OR top-level payMin/payMax/etc)
    const payIn = body?.pay && typeof body.pay === "object" ? body.pay : {};
    const payMin = toNumberOrNull(payIn?.min ?? body?.payMin);
    const payMax = toNumberOrNull(payIn?.max ?? body?.payMax);
    const payPeriod = normalizePeriod(payIn?.period ?? body?.payPeriod);
    const payAnnualizedMin = toNumberOrNull(payIn?.annualizedMin ?? body?.payAnnualizedMin);
    const payAnnualizedMax = toNumberOrNull(payIn?.annualizedMax ?? body?.payAnnualizedMax);
    const payCurrency = (payIn?.currency ?? body?.payCurrency ?? "USD").toString().trim() || "USD";
    const payText =
      (typeof payIn?.text === "string" ? payIn.text.trim() : null) ||
      (typeof body?.payText === "string" ? body.payText.trim() : null);

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

      // ✅ Pay fields (top-level for easy frontend use)
      payMin,
      payMax,
      payPeriod,
      payAnnualizedMin,
      payAnnualizedMax,
      payCurrency,
      payText,

      // ✅ Also provide a single nested pay object (nice for the UI)
      pay: {
        min: payMin,
        max: payMax,
        period: payPeriod,
        annualizedMin: payAnnualizedMin,
        annualizedMax: payAnnualizedMax,
        currency: payCurrency,
        text: payText,
      },

      createdAt: now,
      updatedAt: now,
    };

    await container.items.create(doc, { partitionKey: userId });

    // ✅ JSON response now includes pay in job doc
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
