// backend/src/functions/extractJob.js
"use strict";

function fallbackExtract(description) {
  const text = String(description || "");

  // -------------------------
  // Title
  // -------------------------
  const titlePatterns = [
    /(?:position|role|job title|title):\s*([^\n]+)/i,
    /(?:hiring|seeking|looking for)\s+(?:a|an)?\s*([^\n,]+?)(?:\s+at|\s+to|\s+in|\s*\n)/i,
    /^([A-Z][^\n]{10,60}?)(?:\s+at|\s+-|\s*\n)/m,
  ];
  let jobTitle = null;
  for (const p of titlePatterns) {
    const m = text.match(p);
    if (m) {
      jobTitle = m[1].trim();
      break;
    }
  }

  // -------------------------
  // Company
  // -------------------------
  const companyPatterns = [
    /(?:company|employer|organization):\s*([^\n]+)/i,
    /(?:at|@)\s+([A-Z][a-zA-Z0-9\s&.]+?)(?:\s+is|\s+we|\s+-|\s*\n)/,
    /About\s+([A-Z][a-zA-Z0-9\s&.]+?)(?:\s*\n|:)/i,
  ];
  let company = null;
  for (const p of companyPatterns) {
    const m = text.match(p);
    if (m) {
      company = m[1].trim();
      break;
    }
  }

  // -------------------------
  // Website
  // -------------------------
  const urlMatch = text.match(/https?:\/\/[^\s]+/);
  let website = urlMatch ? urlMatch[0] : null;

  // -------------------------
  // Location
  // -------------------------
  const locPatterns = [
    /(?:location|based in|office in):\s*([^\n]+)/i,
    /(?:in|at)\s+([A-Z][a-z]+,\s*[A-Z]{2})/,
    /(?:Remote|Hybrid|On-site)(?:\s+in\s+)?([A-Z][a-z]+(?:,\s*[A-Z]{2})?)/,
  ];
  let location = null;
  for (const p of locPatterns) {
    const m = text.match(p);
    if (m) {
      location = m[1].trim();
      break;
    }
  }

  // -------------------------
  // Seniority
  // -------------------------
  const seniorityMap = {
    Intern: /intern|internship|co-op/i,
    Junior: /junior|entry[-\s]?level|early[-\s]?career/i,
    "Mid-Level": /mid[-\s]?level|experienced|3\+?\s*years/i,
    Senior: /senior|lead|principal|staff|10\+?\s*years/i,
  };
  let seniority = null;
  for (const [lvl, re] of Object.entries(seniorityMap)) {
    if (re.test(text)) {
      seniority = lvl;
      break;
    }
  }

  // -------------------------
  // Keywords (light)
  // -------------------------
  const skills = new Set();
  const commonSkills = [
    "React",
    "Python",
    "JavaScript",
    "AWS",
    "Docker",
    "SQL",
    "Node.js",
    "Java",
    "C++",
    "TypeScript",
    "Git",
    "Azure",
  ];
  for (const s of commonSkills) {
    const re = new RegExp(`\\b${s.replace("+", "\\+")}\\b`, "i");
    if (re.test(text)) skills.add(s);
  }

  // -------------------------
  // Pay extraction (fallback)
  // -------------------------
  const parseNum = (s) => {
    if (s == null) return null;
    const n = Number(String(s).replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  };

  const pay = (() => {
    // Examples:
    // $20/hr, $20 per hour, $20 hourly, $20 - $28/hr
    const hourly =
      text.match(
        /\$\s?(\d{1,3}(?:,\d{3})?)(?:\.\d{1,2})?\s*(?:-|to)?\s*\$?\s?(\d{1,3}(?:,\d{3})?)?(?:\.\d{1,2})?\s*(?:\/\s?(?:hr|hour)|per\s+hour|hourly)\b/i
      ) ||
      text.match(
        /\b(\d{1,3}(?:\.\d{1,2})?)\s*(?:-|to)\s*(\d{1,3}(?:\.\d{1,2})?)\s*(?:\/\s?(?:hr|hour)|per\s+hour|hourly)\b/i
      );

    // $80,000 - $120,000, $80k-$120k, $120k, 120k-140k salary
    const yearly =
      text.match(
        /\$\s?(\d{2,3}(?:,\d{3})?|\d{2,3})\s*(k|K)?\s*(?:-|to)\s*\$?\s?(\d{2,3}(?:,\d{3})?|\d{2,3})\s*(k|K)?\s*(?:\/\s?(?:yr|year)|per\s+year|annually|annual|salary)?/i
      ) ||
      text.match(
        /\$\s?(\d{2,3}(?:,\d{3})?|\d{2,3})\s*(k|K)?\s*(?:\/\s?(?:yr|year)|per\s+year|annually|annual|salary)\b/i
      ) ||
      text.match(
        /\b(\d{2,3})\s*(k|K)\s*(?:-|to)\s*(\d{2,3})\s*(k|K)\s*(?:salary|annually|annual|per\s+year|\/\s?(?:yr|year))?\b/i
      );

    // Detect currency quickly ($ = USD assumption for fallback)
    const payCurrency = "USD";

    if (hourly) {
      const min = parseNum(hourly[1]);
      const max = parseNum(hourly[2]) ?? min;
      if (min != null) {
        return {
          payMin: min,
          payMax: max,
          payCurrency,
          payPeriod: "hour",
          payText: hourly[0],
        };
      }
    }

    if (yearly) {
      const n1 = parseNum(yearly[1]);
      const k1 = yearly[2] ? true : false;
      const n2 = parseNum(yearly[3]);
      const k2 = yearly[4] ? true : false;

      const min = n1 != null ? (k1 ? n1 * 1000 : n1) : null;
      const max = n2 != null ? (k2 ? n2 * 1000 : n2) : min;

      if (min != null) {
        return {
          payMin: min,
          payMax: max,
          payCurrency,
          payPeriod: "year",
          payText: yearly[0],
        };
      }
    }

    return {
      payMin: null,
      payMax: null,
      payCurrency: "USD",
      payPeriod: null,
      payText: null,
    };
  })();

  return {
    jobTitle: jobTitle || "Position",
    company: company || "Company",
    website,
    location,
    seniority,
    keywords: Array.from(skills).slice(0, 10),
    ...pay,
  };
}

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

    // NOTE: you said you don't have apiVersion in env — this hardcoded one is fine
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
jobTitle (string), company (string), website (string|null),
location (string|null), seniority (string|null), keywords (string[]),
payMin (number|null), payMax (number|null), payCurrency (string|null), payPeriod (string|null), payText (string|null).

Rules:
- payPeriod must be one of: "hour","year","month","week","day" or null.
- If only a single pay value exists: payMin=payMax.
- If pay is present but not numeric: set payMin/payMax null, but set payText if possible.
- If unknown: use null (or [] for keywords).
No markdown, no commentary, no extra keys.
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
        max_tokens: 450,
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

    const toNum = (v) => {
      if (typeof v === "number" && Number.isFinite(v)) return v;
      if (typeof v === "string") {
        const n = Number(v.replace(/,/g, "").trim());
        if (Number.isFinite(n)) return n;
      }
      return null;
    };

    const allowedPeriods = new Set(["hour", "year", "month", "week", "day"]);

    const safe = {
      jobTitle:
        typeof parsed?.jobTitle === "string" && parsed.jobTitle.trim()
          ? parsed.jobTitle.trim()
          : null,
      company:
        typeof parsed?.company === "string" && parsed.company.trim()
          ? parsed.company.trim()
          : null,
      website:
        typeof parsed?.website === "string" && parsed.website.trim()
          ? parsed.website.trim()
          : null,
      location:
        typeof parsed?.location === "string" && parsed.location.trim()
          ? parsed.location.trim()
          : null,
      seniority:
        typeof parsed?.seniority === "string" && parsed.seniority.trim()
          ? parsed.seniority.trim()
          : null,
      keywords: Array.isArray(parsed?.keywords)
        ? parsed.keywords
            .filter((k) => typeof k === "string" && k.trim())
            .slice(0, 12)
        : [],

      payMin: toNum(parsed?.payMin),
      payMax: toNum(parsed?.payMax),
      payCurrency:
        typeof parsed?.payCurrency === "string" && parsed.payCurrency.trim()
          ? parsed.payCurrency.trim()
          : null,
      payPeriod:
        typeof parsed?.payPeriod === "string" && allowedPeriods.has(parsed.payPeriod.trim())
          ? parsed.payPeriod.trim()
          : null,
      payText:
        typeof parsed?.payText === "string" && parsed.payText.trim()
          ? parsed.payText.trim()
          : null,
    };

    // Normalize pay: if one exists, set both
    if (safe.payMin != null && safe.payMax == null) safe.payMax = safe.payMin;
    if (safe.payMax != null && safe.payMin == null) safe.payMin = safe.payMax;

    const isMostlyEmpty =
      !safe.jobTitle &&
      !safe.company &&
      !safe.website &&
      !safe.location &&
      !safe.seniority &&
      safe.keywords.length === 0 &&
      safe.payMin == null &&
      safe.payMax == null &&
      !safe.payText;

    const base = isMostlyEmpty ? fallbackExtract(jobDescription) : {
      jobTitle: safe.jobTitle || "Position",
      company: safe.company || "Company",
      website: safe.website,
      location: safe.location,
      seniority: safe.seniority,
      keywords: safe.keywords,
      payMin: safe.payMin,
      payMax: safe.payMax,
      payCurrency: safe.payCurrency || "USD",
      payPeriod: safe.payPeriod,
      payText: safe.payText,
    };

    return { status: 200, jsonBody: base };
  } catch (err) {
    context.error("extractJob error:", err);
    // super-safe fallback
    let raw = "";
    try { raw = await request.text(); } catch {}
    return { status: 200, jsonBody: fallbackExtract(raw) };
  }
};
