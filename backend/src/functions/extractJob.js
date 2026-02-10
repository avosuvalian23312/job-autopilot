// backend/src/functions/extractJob.js
"use strict";

/**
 * -----------------------------
 * Fallback parsers (no AI needed)
 * -----------------------------
 */

function parseEmploymentType(text) {
  const t = String(text || "");

  // order matters (more specific first)
  if (/(internship|intern\b|co-?op)/i.test(t)) return "Internship";
  if (/(part[-\s]?time|\bPT\b)/i.test(t)) return "Part-time";
  if (/(contract|contractor|1099|corp[-\s]?to[-\s]?corp|c2c|freelance)/i.test(t)) return "Contract";
  if (/(full[-\s]?time|\bFT\b|w2|permanent|salary position)/i.test(t)) return "Full-time";

  return null;
}

function parseWorkModel(text) {
  const t = String(text || "");

  // Hybrid first (often includes the word "remote" too)
  if (/\bhybrid\b/i.test(t)) return "Hybrid";

  // On-site patterns
  if (/(on[-\s]?site|onsite|in[-\s]?office|office[-\s]?based|must be on site)/i.test(t)) return "On-site";

  // Remote patterns
  if (/\bremote\b/i.test(t) || /(work from home|wfh)/i.test(t)) return "Remote";

  return null;
}

function parseExperience(text) {
  const t = String(text || "").replace(/[–—]/g, "-");

  // common patterns:
  // "3+ years", "5 years of experience", "2-4 years", "minimum 7 years"
  const range = t.match(/(\d{1,2})\s*-\s*(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b/i);
  const plus = t.match(/(\d{1,2})\s*\+\s*(?:years?|yrs?)\b/i);
  const min = t.match(/(?:minimum|min\.)\s*(\d{1,2})\s*(?:years?|yrs?)\b/i);
  const single = t.match(/(\d{1,2})\s*(?:years?|yrs?)\s+(?:of\s+)?experience\b/i);

  const pick = (n) => {
    const x = Number(n);
    return Number.isFinite(x) ? x : null;
  };

  let lo = null;
  let hi = null;

  if (range) {
    lo = pick(range[1]);
    hi = pick(range[2]);
  } else if (plus) {
    lo = pick(plus[1]);
    hi = null;
  } else if (min) {
    lo = pick(min[1]);
    hi = null;
  } else if (single) {
    lo = pick(single[1]);
    hi = null;
  }

  // Convert to a simple chip band
  // You asked: “0–2 yrs”, “3–5 yrs”, “5+ yrs”
  const years = lo;

  if (years == null) return null;
  if (years <= 2) return "0–2 yrs";
  if (years <= 5) return "3–5 yrs";
  return "5+ yrs";
}

function parseCompliance(text) {
  const t = String(text || "");
  const tags = new Set();

  // Sponsorship / visa
  if (/(no sponsorship|unable to sponsor|cannot sponsor|not able to sponsor|without sponsorship)/i.test(t)) {
    tags.add("No sponsorship");
  }
  if (/(sponsorship available|visa sponsorship|we sponsor visas|sponsor H-?1B|H-?1B sponsorship)/i.test(t)) {
    tags.add("Sponsorship available");
  }

  // US citizenship
  if (/(u\.?s\.?\s*citizen|us citizen|citizenship required|must be a citizen)/i.test(t)) {
    tags.add("US Citizen required");
  }

  // Clearance
  if (/(security clearance|clearance required|must have.*clearance|secret clearance|top secret|TS\/SCI|TS SCI)/i.test(t)) {
    tags.add("Clearance required");
  }

  // Background check (optional but helpful)
  if (/(background check|drug test|e-?verify)/i.test(t)) {
    tags.add("Background check");
  }

  return Array.from(tags);
}

/**
 * -----------------------------
 * Pay fallback (your existing logic)
 * -----------------------------
 */
function parsePayFallback(text) {
  const t = String(text || "");

  // Normalize dashes
  const norm = t.replace(/[–—]/g, "-");

  // period detection helpers
  const periodHints = [
    { period: "hour", re: /(\/hr|per\s*hour|hourly)\b/i },
    { period: "year", re: /(\/yr|per\s*year|annually|annual|a\s*year|salary)\b/i },
    { period: "month", re: /(\/mo|per\s*month|monthly)\b/i },
    { period: "week", re: /(\/wk|per\s*week|weekly)\b/i },
    { period: "day", re: /(\/day|per\s*day|daily)\b/i },
  ];

  let payPeriod = null;
  for (const p of periodHints) {
    if (p.re.test(norm)) { payPeriod = p.period; break; }
  }

  // Range patterns:
  // "$85k - $105k", "$85,000 - $105,000", "85k-105k", "85000-105000"
  const rangeRe =
    /(\$|usd\s*)?\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{2,3})(\s*k)?\s*-\s*(\$|usd\s*)?\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{2,3})(\s*k)?/i;

  // Single patterns:
  // "$120k", "$85,000", "85k"
  const oneRe = /(\$|usd\s*)?\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{2,3})(\s*k)?/i;

  const toNum = (raw, isK) => {
    if (!raw) return null;
    const n = Number(String(raw).replace(/,/g, ""));
    if (!Number.isFinite(n)) return null;
    return isK ? n * 1000 : n;
  };

  let payMin = null;
  let payMax = null;
  let payCurrency = "USD";
  let payText = null;

  const rangeM = norm.match(rangeRe);
  if (rangeM) {
    const minRaw = rangeM[2];
    const minK = !!rangeM[3] && /k/i.test(rangeM[3]);
    const maxRaw = rangeM[5];
    const maxK = !!rangeM[6] && /k/i.test(rangeM[6]);

    payMin = toNum(minRaw, minK);
    payMax = toNum(maxRaw, maxK);
  } else {
    const oneM = norm.match(oneRe);
    if (oneM) {
      const vRaw = oneM[2];
      const vK = !!oneM[3] && /k/i.test(oneM[3]);
      const val = toNum(vRaw, vK);
      payMin = val;
      payMax = val;
    }
  }

  // If we found numbers, build a nice text
  if (payMin != null || payMax != null) {
    const sym = "$";
    const fmt = (n) => (typeof n === "number" ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "");
    const suffix = payPeriod ? ({hour:"/hr",year:"/yr",month:"/mo",week:"/wk",day:"/day"}[payPeriod] || "") : "";

    if (payMin != null && payMax != null) {
      payText = payMin === payMax
        ? `${sym}${fmt(payMin)}${suffix}`
        : `${sym}${fmt(payMin)} – ${sym}${fmt(payMax)}${suffix}`;
    } else if (payMin != null) {
      payText = `${sym}${fmt(payMin)}${suffix}`;
    } else if (payMax != null) {
      payText = `${sym}${fmt(payMax)}${suffix}`;
    }
  }

  // Confidence
  let payConfidence = 0.2;
  if (payText && payPeriod) payConfidence = 0.85;
  else if (payText && !payPeriod) payConfidence = 0.35;

  // Annualize
  const annualFactor =
    payPeriod === "hour" ? 2080 :
    payPeriod === "week" ? 52 :
    payPeriod === "month" ? 12 :
    payPeriod === "day" ? 260 :
    payPeriod === "year" ? 1 :
    null;

  const payAnnualizedMin = (annualFactor && typeof payMin === "number") ? Math.round(payMin * annualFactor) : null;
  const payAnnualizedMax = (annualFactor && typeof payMax === "number") ? Math.round(payMax * annualFactor) : null;

  // Percentile heuristic
  const mid = (payAnnualizedMin && payAnnualizedMax)
    ? (payAnnualizedMin + payAnnualizedMax) / 2
    : (payAnnualizedMin || payAnnualizedMax || null);

  let payPercentile = null;
  if (typeof mid === "number") {
    if (mid < 45000) payPercentile = 20;
    else if (mid < 65000) payPercentile = 40;
    else if (mid < 85000) payPercentile = 55;
    else if (mid < 110000) payPercentile = 70;
    else if (mid < 140000) payPercentile = 82;
    else payPercentile = 90;
  }

  return {
    payText,
    payMin,
    payMax,
    payCurrency,
    payPeriod,
    payConfidence,
    payAnnualizedMin,
    payAnnualizedMax,
    payPercentile,
    payPercentileSource: payPercentile != null ? "heuristic-bands" : null,
  };
}

function fallbackExtract(description) {
  const text = String(description || "");

  // Title
  const titlePatterns = [
    /(?:position|role|job title|title):\s*([^\n]+)/i,
    /(?:hiring|seeking|looking for)\s+(?:a|an)?\s*([^\n,]+?)(?:\s+at|\s+to|\s+in|\s*\n)/i,
    /^([A-Z][^\n]{10,60}?)(?:\s+at|\s+-|\s*\n)/m,
  ];
  let jobTitle = null;
  for (const p of titlePatterns) {
    const m = text.match(p);
    if (m) { jobTitle = m[1].trim(); break; }
  }

  // Company
  const companyPatterns = [
    /(?:company|employer|organization):\s*([^\n]+)/i,
    /(?:at|@)\s+([A-Z][a-zA-Z0-9\s&.]+?)(?:\s+is|\s+we|\s+-|\s*\n)/,
    /About\s+([A-Z][a-zA-Z0-9\s&.]+?)(?:\s*\n|:)/i,
  ];
  let company = null;
  for (const p of companyPatterns) {
    const m = text.match(p);
    if (m) { company = m[1].trim(); break; }
  }

  // Website
  const urlMatch = text.match(/https?:\/\/[^\s]+/);
  let website = urlMatch ? urlMatch[0] : null;

  // Location
  const locPatterns = [
    /(?:location|based in|office in):\s*([^\n]+)/i,
    /(?:in|at)\s+([A-Z][a-z]+,\s*[A-Z]{2})/,
    /(?:Remote|Hybrid|On-site)(?:\s+in\s+)?([A-Z][a-z]+(?:,\s*[A-Z]{2})?)/,
  ];
  let location = null;
  for (const p of locPatterns) {
    const m = text.match(p);
    if (m) { location = m[1].trim(); break; }
  }

  // Seniority
  const seniorityMap = {
    Intern: /intern|internship|co-op/i,
    Junior: /junior|entry[-\s]?level|early[-\s]?career/i,
    "Mid-Level": /mid[-\s]?level|experienced|3\+?\s*years/i,
    Senior: /senior|lead|principal|staff|10\+?\s*years/i,
  };
  let seniority = null;
  for (const [lvl, re] of Object.entries(seniorityMap)) {
    if (re.test(text)) { seniority = lvl; break; }
  }

  // Keywords
  const skills = new Set();
  const commonSkills = ["React","Python","JavaScript","AWS","Docker","SQL","Node.js","Java","C++","TypeScript","Git","Azure"];
  for (const s of commonSkills) {
    const re = new RegExp(`\\b${s.replace("+","\\+")}\\b`, "i");
    if (re.test(text)) skills.add(s);
  }

  // NEW: chips
  const employmentType = parseEmploymentType(text);
  const workModel = parseWorkModel(text);
  const experienceLevel = parseExperience(text);
  const complianceTags = parseCompliance(text);

  // Pay
  const pay = parsePayFallback(text);

  return {
    jobTitle: jobTitle || "Position",
    company: company || "Company",
    website,
    location,
    seniority,
    keywords: Array.from(skills).slice(0, 10),

    employmentType,
    workModel,
    experienceLevel,
    complianceTags,

    ...pay,
  };
}

/**
 * -----------------------------
 * Azure Function handler
 * -----------------------------
 */
module.exports = async function (request, context) {
  try {
    if (request.method === "OPTIONS") return { status: 204 };

    const body = await request.json().catch(() => ({}));
    const jobDescription = (body?.jobDescription || "").trim();

    if (!jobDescription) {
      return { status: 400, jsonBody: { error: "Missing jobDescription" } };
    }

    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;

    // Hardcoded ok (you said you don't have apiVersion in env)
    const apiVersion = "2024-02-15-preview";

    if (!endpoint || !apiKey || !deployment) {
      return { status: 200, jsonBody: fallbackExtract(jobDescription) };
    }

    const url =
      `${endpoint.replace(/\/$/, "")}` +
      `/openai/deployments/${encodeURIComponent(deployment)}` +
      `/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;

    const system = `
You extract structured job posting fields from raw job descriptions.
Return ONLY valid JSON with EXACT keys:

jobTitle (string),
company (string),
website (string|null),
location (string|null),
seniority (string|null),
keywords (string[]),

employmentType (string|null),   // one of: "Full-time","Contract","Part-time","Internship"
workModel (string|null),        // one of: "Remote","Hybrid","On-site"
experienceLevel (string|null),  // one of: "0–2 yrs","3–5 yrs","5+ yrs"
complianceTags (string[]),      // examples: ["US Citizen required","Clearance required","No sponsorship"]

payText (string|null),
payMin (number|null),
payMax (number|null),
payCurrency (string|null),      // ex: "USD"
payPeriod (string|null),        // one of: "hour","year","month","week","day"
payConfidence (number|null)     // 0..1 confidence about payPeriod

No markdown, no commentary, no extra keys.
If unknown: use null (or [] for arrays).
`.trim();

    const user = `JOB DESCRIPTION:\n${jobDescription}`;

    const aoaiRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.1,
        max_tokens: 650,
      }),
    });

    if (!aoaiRes.ok) {
      const t = await aoaiRes.text().catch(() => "");
      context.error("AOAI extract non-200:", aoaiRes.status, t);
      return { status: 200, jsonBody: fallbackExtract(jobDescription) };
    }

    const data = await aoaiRes.json();
    const content = data?.choices?.[0]?.message?.content || "";

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      const start = content.indexOf("{");
      const end = content.lastIndexOf("}");
      if (start !== -1 && end !== -1 && end > start) {
        parsed = JSON.parse(content.slice(start, end + 1));
      } else {
        parsed = null;
      }
    }

    const allowedEmployment = new Set(["Full-time", "Contract", "Part-time", "Internship"]);
    const allowedWorkModel = new Set(["Remote", "Hybrid", "On-site"]);
    const allowedExperience = new Set(["0–2 yrs", "3–5 yrs", "5+ yrs"]);
    const allowedPeriods = new Set(["hour", "year", "month", "week", "day"]);

    const safe = {
      jobTitle: typeof parsed?.jobTitle === "string" && parsed.jobTitle.trim() ? parsed.jobTitle.trim() : null,
      company: typeof parsed?.company === "string" && parsed.company.trim() ? parsed.company.trim() : null,
      website: typeof parsed?.website === "string" && parsed.website.trim() ? parsed.website.trim() : null,
      location: typeof parsed?.location === "string" && parsed.location.trim() ? parsed.location.trim() : null,
      seniority: typeof parsed?.seniority === "string" && parsed.seniority.trim() ? parsed.seniority.trim() : null,
      keywords: Array.isArray(parsed?.keywords)
        ? parsed.keywords.filter((k) => typeof k === "string" && k.trim()).slice(0, 12)
        : [],

      employmentType: (typeof parsed?.employmentType === "string" && allowedEmployment.has(parsed.employmentType))
        ? parsed.employmentType
        : null,
      workModel: (typeof parsed?.workModel === "string" && allowedWorkModel.has(parsed.workModel))
        ? parsed.workModel
        : null,
      experienceLevel: (typeof parsed?.experienceLevel === "string" && allowedExperience.has(parsed.experienceLevel))
        ? parsed.experienceLevel
        : null,
      complianceTags: Array.isArray(parsed?.complianceTags)
        ? parsed.complianceTags.filter((x) => typeof x === "string" && x.trim()).slice(0, 6)
        : [],

      payText: typeof parsed?.payText === "string" && parsed.payText.trim() ? parsed.payText.trim() : null,
      payMin: (typeof parsed?.payMin === "number" && Number.isFinite(parsed.payMin)) ? parsed.payMin : null,
      payMax: (typeof parsed?.payMax === "number" && Number.isFinite(parsed.payMax)) ? parsed.payMax : null,
      payCurrency: typeof parsed?.payCurrency === "string" && parsed.payCurrency.trim() ? parsed.payCurrency.trim() : "USD",
      payPeriod: (typeof parsed?.payPeriod === "string" && allowedPeriods.has(parsed.payPeriod)) ? parsed.payPeriod : null,
      payConfidence: (typeof parsed?.payConfidence === "number" && Number.isFinite(parsed.payConfidence))
        ? Math.max(0, Math.min(1, parsed.payConfidence))
        : null,
    };

    // normalize pay range
    if (safe.payMin != null && safe.payMax == null) safe.payMax = safe.payMin;
    if (safe.payMax != null && safe.payMin == null) safe.payMin = safe.payMax;

    // If payPeriod missing but we have numbers, let fallback infer period/annualization/percentile
    const needPayFallback = (safe.payMin != null || safe.payMax != null) && !safe.payPeriod;

    const payFromFallback = needPayFallback
      ? parsePayFallback(jobDescription)
      : null;

    const mergedPay = {
      payText: safe.payText ?? payFromFallback?.payText ?? null,
      payMin: safe.payMin ?? payFromFallback?.payMin ?? null,
      payMax: safe.payMax ?? payFromFallback?.payMax ?? null,
      payCurrency: safe.payCurrency ?? payFromFallback?.payCurrency ?? "USD",
      payPeriod: safe.payPeriod ?? payFromFallback?.payPeriod ?? null,
      payConfidence: safe.payConfidence ?? payFromFallback?.payConfidence ?? null,
      payAnnualizedMin: payFromFallback?.payAnnualizedMin ?? null,
      payAnnualizedMax: payFromFallback?.payAnnualizedMax ?? null,
      payPercentile: payFromFallback?.payPercentile ?? null,
      payPercentileSource: payFromFallback?.payPercentileSource ?? null,
    };

    const isMostlyEmpty =
      !safe.jobTitle &&
      !safe.company &&
      !safe.website &&
      !safe.location &&
      !safe.seniority &&
      safe.keywords.length === 0 &&
      (mergedPay.payMin == null && mergedPay.payMax == null && !mergedPay.payText) &&
      !safe.employmentType &&
      !safe.workModel &&
      !safe.experienceLevel &&
      (!safe.complianceTags || safe.complianceTags.length === 0);

    const base = isMostlyEmpty
      ? fallbackExtract(jobDescription)
      : {
          jobTitle: safe.jobTitle || "Position",
          company: safe.company || "Company",
          website: safe.website,
          location: safe.location,
          seniority: safe.seniority,
          keywords: safe.keywords,

          employmentType: safe.employmentType,
          workModel: safe.workModel,
          experienceLevel: safe.experienceLevel,
          complianceTags: safe.complianceTags,

          ...mergedPay,
        };

    // If AI missed the chip fields, fallback-fill them (super helpful)
    if (!base.employmentType) base.employmentType = parseEmploymentType(jobDescription);
    if (!base.workModel) base.workModel = parseWorkModel(jobDescription);
    if (!base.experienceLevel) base.experienceLevel = parseExperience(jobDescription);
    if (!base.complianceTags || base.complianceTags.length === 0) base.complianceTags = parseCompliance(jobDescription);

    // If AI missed pay entirely, fallback-fill it
    if (!base.payText && base.payMin == null && base.payMax == null) {
      const p = parsePayFallback(jobDescription);
      base.payText = p.payText;
      base.payMin = p.payMin;
      base.payMax = p.payMax;
      base.payCurrency = p.payCurrency;
      base.payPeriod = p.payPeriod;
      base.payConfidence = p.payConfidence;
      base.payAnnualizedMin = p.payAnnualizedMin;
      base.payAnnualizedMax = p.payAnnualizedMax;
      base.payPercentile = p.payPercentile;
      base.payPercentileSource = p.payPercentileSource;
    }

    return { status: 200, jsonBody: base };
  } catch (err) {
    context.error("extractJob error:", err);
    let raw = "";
    try { raw = await request.text(); } catch {}
    return { status: 200, jsonBody: fallbackExtract(raw) };
  }
};
