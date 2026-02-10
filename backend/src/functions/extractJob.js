function parsePayFallback(text) {
  const t = String(text || "");

  // Normalize dashes
  const norm = t.replace(/[–—]/g, "-");

  // Common patterns:
  // $40/hr, $40 per hour, 40/hr, $85,000 - $105,000 a year, 85k-105k, $120k
  const money = /(\$|usd\s*)?\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{2,3})(?:\s*(k))?/gi;

  const periodHints = [
    { period: "hour", re: /(\/hr|per\s*hour|hourly)\b/i },
    { period: "year", re: /(\/yr|per\s*year|annually|annual|a\s*year)\b/i },
    { period: "month", re: /(\/mo|per\s*month|monthly)\b/i },
    { period: "week", re: /(\/wk|per\s*week|weekly)\b/i },
    { period: "day", re: /(\/day|per\s*day|daily)\b/i },
  ];

  // detect period
  let payPeriod = null;
  for (const p of periodHints) {
    if (p.re.test(norm)) { payPeriod = p.period; break; }
  }

  // Try to capture a nearby money range first
  // Examples: "$85k - $105k", "$85,000 - $105,000", "85-105k"
  const rangeRe = /(\$|usd\s*)?\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{2,3})(\s*k)?\s*-\s*(\$|usd\s*)?\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{2,3})(\s*k)?/i;
  const rangeM = norm.match(rangeRe);

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

  if (rangeM) {
    const minRaw = rangeM[2];
    const minK = !!rangeM[3] && /k/i.test(rangeM[3]);
    const maxRaw = rangeM[5];
    const maxK = !!rangeM[6] && /k/i.test(rangeM[6]);

    payMin = toNum(minRaw, minK);
    payMax = toNum(maxRaw, maxK);

    // Build a nice text
    const sym = "$";
    const fmt = (n) => (typeof n === "number" ? n.toLocaleString() : "");
    const suffix = payPeriod ? ({hour:"/hr",year:"/yr",month:"/mo",week:"/wk",day:"/day"}[payPeriod] || "") : "";
    if (payMin && payMax) payText = `${sym}${fmt(payMin)} – ${sym}${fmt(payMax)}${suffix}`;
  } else {
    // single value fallback
    const oneRe = /(\$|usd\s*)?\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{2,3})(\s*k)?/i;
    const oneM = norm.match(oneRe);
    if (oneM) {
      const vRaw = oneM[2];
      const vK = !!oneM[3] && /k/i.test(oneM[3]);
      const val = toNum(vRaw, vK);
      payMin = val;
      payMax = val;

      const sym = "$";
      const fmt = (n) => (typeof n === "number" ? n.toLocaleString() : "");
      const suffix = payPeriod ? ({hour:"/hr",year:"/yr",month:"/mo",week:"/wk",day:"/day"}[payPeriod] || "") : "";
      if (val) payText = `${sym}${fmt(val)}${suffix}`;
    }
  }

  // Confidence: how sure are we about period?
  // - if we saw explicit /hr or /yr -> high
  // - if we only saw money with no period -> low
  let payConfidence = 0.2;
  if (payText && payPeriod) payConfidence = 0.85;
  else if (payText && !payPeriod) payConfidence = 0.35;

  // Annualize estimates (common assumption)
  // hourly -> 2080 hrs, weekly -> 52, monthly -> 12, daily -> 260 (5d*52)
  const annualFactor =
    payPeriod === "hour" ? 2080 :
    payPeriod === "week" ? 52 :
    payPeriod === "month" ? 12 :
    payPeriod === "day" ? 260 :
    payPeriod === "year" ? 1 :
    null;

  const payAnnualizedMin = (annualFactor && typeof payMin === "number") ? Math.round(payMin * annualFactor) : null;
  const payAnnualizedMax = (annualFactor && typeof payMax === "number") ? Math.round(payMax * annualFactor) : null;

  // Percentile estimate (HEURISTIC, not real market data)
  // Uses a rough banding based on annualized pay.
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
    payPercentile, // 0-100 (heuristic)
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

  // Keywords (light)
  const skills = new Set();
  const commonSkills = ["React","Python","JavaScript","AWS","Docker","SQL","Node.js","Java","C++","TypeScript","Git","Azure"];
  for (const s of commonSkills) {
    const re = new RegExp(`\\b${s.replace("+","\\+")}\\b`, "i");
    if (re.test(text)) skills.add(s);
  }

  const pay = parsePayFallback(text);

  return {
    jobTitle: jobTitle || "Position",
    company: company || "Company",
    website,
    location,
    seniority,
    keywords: Array.from(skills).slice(0, 10),

    // ✅ NEW pay fields
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
jobTitle (string),
company (string),
website (string|null),
location (string|null),
seniority (string|null),
keywords (string[]),
payText (string|null),
payMin (number|null),
payMax (number|null),
payCurrency (string|null),        // ex: "USD"
payPeriod (string|null),          // one of: "hour","year","month","week","day"
payConfidence (number|null)       // 0..1 confidence about payPeriod
No markdown, no commentary, no extra keys.
If unknown: use null (or [] for keywords).
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
  jobTitle: typeof parsed?.jobTitle === "string" && parsed.jobTitle.trim() ? parsed.jobTitle.trim() : null,
  company: typeof parsed?.company === "string" && parsed.company.trim() ? parsed.company.trim() : null,
  website: typeof parsed?.website === "string" && parsed.website.trim() ? parsed.website.trim() : null,
  location: typeof parsed?.location === "string" && parsed.location.trim() ? parsed.location.trim() : null,
  seniority: typeof parsed?.seniority === "string" && parsed.seniority.trim() ? parsed.seniority.trim() : null,
  keywords: Array.isArray(parsed?.keywords) ? parsed.keywords.filter((k) => typeof k === "string" && k.trim()).slice(0, 12) : [],

  payText: typeof parsed?.payText === "string" && parsed.payText.trim() ? parsed.payText.trim() : null,
  payMin: typeof parsed?.payMin === "number" && Number.isFinite(parsed.payMin) ? parsed.payMin : null,
  payMax: typeof parsed?.payMax === "number" && Number.isFinite(parsed.payMax) ? parsed.payMax : null,
  payCurrency: typeof parsed?.payCurrency === "string" && parsed.payCurrency.trim() ? parsed.payCurrency.trim() : "USD",
  payPeriod: typeof parsed?.payPeriod === "string" && ["hour","year","month","week","day"].includes(parsed.payPeriod) ? parsed.payPeriod : null,
  payConfidence: typeof parsed?.payConfidence === "number" && Number.isFinite(parsed.payConfidence)
    ? Math.max(0, Math.min(1, parsed.payConfidence))
    : null,
};

// Annualize + Percentile (heuristic)
const annualFactor =
  safe.payPeriod === "hour" ? 2080 :
  safe.payPeriod === "week" ? 52 :
  safe.payPeriod === "month" ? 12 :
  safe.payPeriod === "day" ? 260 :
  safe.payPeriod === "year" ? 1 :
  null;

const payAnnualizedMin = (annualFactor && typeof safe.payMin === "number") ? Math.round(safe.payMin * annualFactor) : null;
const payAnnualizedMax = (annualFactor && typeof safe.payMax === "number") ? Math.round(safe.payMax * annualFactor) : null;

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

safe.payAnnualizedMin = payAnnualizedMin;
safe.payAnnualizedMax = payAnnualizedMax;
safe.payPercentile = payPercentile;
safe.payPercentileSource = payPercentile != null ? "heuristic-bands" : null;


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
      payMin: safe.payMin,
payMax: safe.payMax,
payCurrency: safe.payCurrency,
payPeriod: safe.payPeriod,
payConfidence: safe.payConfidence,
payAnnualizedMin: safe.payAnnualizedMin,
payAnnualizedMax: safe.payAnnualizedMax,
payPercentile: safe.payPercentile,
payPercentileSource: safe.payPercentileSource,
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
