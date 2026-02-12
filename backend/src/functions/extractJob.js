// backend/src/functions/extractJob.js
"use strict";

/**
 * -----------------------------
 * Text cleanup for scraped job posts (Indeed/LinkedIn/etc.)
 * -----------------------------
 */

const HTML_ENTITY_MAP = {
  "&nbsp;": " ",
  "&#160;": " ",
  "&amp;": "&",
  "&quot;": '"',
  "&#34;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&lt;": "<",
  "&gt;": ">",
};
function isGenericJobTitle(title) {
  const t = String(title || "").trim().toLowerCase();
  if (!t) return true;

  // common junk titles that appear in job descriptions
  const bad = new Set([
    "individuals",
    "individual",
    "candidate",
    "candidates",
    "person",
    "people",
    "professional",
    "professionals",
    "team member",
    "team members",
    "employee",
    "employees",
    "role",
    "position",
    "opportunity",
  ]);

  if (bad.has(t)) return true;

  // too short or obviously not a title
  if (t.length < 4) return true;

  return false;
}

function cleanJobTitleCandidate(s) {
  let t = String(s || "").replace(/\s+/g, " ").trim();
  if (!t) return null;

  // remove Indeed suffix
  t = t.replace(/\s*-\s*job post\s*$/i, "").trim();

  // remove trailing separators
  t = t.replace(/[\-|–|—]\s*$/g, "").trim();

  if (isGenericJobTitle(t)) return null;
  return t;
}

function cleanUrl(u) {
  return String(u || "")
    .trim()
    .replace(/[)\],.;]+$/g, "") // strip trailing punctuation
    .trim();
}

function pickBestWebsite(text, company) {
  const raw = String(text || "");

  // 1) Prefer explicit "Website:" label
  const labeled = raw.match(/\bWebsite\s*:\s*(https?:\/\/[^\s)]+)/i);
  if (labeled?.[1]) return cleanUrl(labeled[1]);

  // 2) Collect all urls
  const urls = Array.from(raw.matchAll(/https?:\/\/[^\s)]+/gi)).map((m) => cleanUrl(m[0]));

  if (!urls.length) return null;

  // filter obvious non-company sites
  const isBad = (u) =>
    /(youtube\.com|youtu\.be|facebook\.com|twitter\.com|x\.com|linkedin\.com|instagram\.com|tiktok\.com|indeed\.com|glassdoor\.com)/i.test(
      u
    );

  const good = urls.filter((u) => !isBad(u));
  const pool = good.length ? good : urls;

  // 3) If company name exists, prefer domain containing a company token
  const tokens = String(company || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((x) => x.length >= 4 && !["inc", "llc", "corp", "company"].includes(x));

  if (tokens.length) {
    const match = pool.find((u) => tokens.some((tok) => u.toLowerCase().includes(tok)));
    if (match) return match;
  }

  // 4) fallback: first decent url
  return pool[0] || null;
}

function decodeHtmlEntities(input) {
  let s = String(input || "");
  for (const [k, v] of Object.entries(HTML_ENTITY_MAP)) s = s.split(k).join(v);
  s = s.replace(/\u00A0/g, " ");
  return s;
}

function normalizeJobText(input) {
  let s = decodeHtmlEntities(input);

  // normalize dashes + newlines
  s = s.replace(/[–—]/g, "-").replace(/\r/g, "\n");

  // remove common scraper UI junk (Indeed / similar)
  s = s
    .replace(/\+\s*show\s*more\b/gi, " ")
    .replace(/\bprofile\s+insights\b/gi, " ")
    .replace(/\bcompany\s+profile\s+insights\b/gi, " ")
    .replace(
      /\bhere'?s\s+how\s+the\s+job\s+(?:details|qualifications)\s+align\s+with\s+your\s+profile\.?/gi,
      " "
    )
    .replace(/\bdo\s+you\s+have\s+experience\s+in\b[^?]*\?/gi, " ")
    .replace(/\bdo\s+you\s+know\b[^?]*\?/gi, " ")
    .replace(/\bresponded\s+to\s+\d+%/gi, " ")
    .replace(/\btypically\s+responds?\s+within\b[^.\n]*/gi, " ");

  // remove star rating chunks like: "3.1 3.1 out of 5 stars 2711"
  s = s.replace(/\b\d(?:\.\d+)?\s*(?:out of 5 stars)\b[^\n]*/gi, " ");

  // Insert line breaks around common section headers (helps fallback parsers)
  const headers = [
    "Job details",
    "Pay",
    "Salary",
    "Compensation",
    "Job type",
    "Shift and schedule",
    "Schedule",
    "Location",
    "Work location",
    "Benefits",
    "Responsibilities",
    "Qualifications",
    "Requirements",
    "Education",
    "Skills",
    "Languages",
    "Company",
  ];

  for (const h of headers) {
    const re = new RegExp(
      `\\s*\\b${h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b\\s*`,
      "gi"
    );
    s = s.replace(re, `\n${h}\n`);
  }

  // Break tagged items onto lines: "Google Workspace (Required) Windows (Preferred)"
  s = s.replace(/\s+\((Required|Preferred)\)\s*/gi, " ($1)\n");

  // collapse whitespace but keep newlines meaningful
  s = s
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

  return s.trim();
}

function isWorkModelWord(s) {
  const t = String(s || "").trim().toLowerCase();
  return (
    t === "in person" ||
    t === "in-person" ||
    t === "onsite" ||
    t === "on-site" ||
    t === "on site" ||
    t === "remote" ||
    t === "hybrid"
  );
}

function normalizeLocationCandidate(loc) {
  const s = String(loc || "").trim();
  if (!s) return null;
  if (isWorkModelWord(s)) return null;

  if (/^estimated\s+commute\b/i.test(s)) return null;
  if (/^job\s+address\b/i.test(s)) return null;

  return s;
}

function isGenericCompanyName(name) {
  const s = String(name || "").trim().toLowerCase();
  if (!s) return true;
  return (
    s === "company" ||
    s === "employer" ||
    s === "organization" ||
    s === "unknown" ||
    s === "n/a"
  );
}

function isGenericJobTitle(title) {
  const s = String(title || "").trim().toLowerCase();
  if (!s) return true;
  return (
    s === "position" ||
    s === "job" ||
    s === "role" ||
    s === "opening" ||
    s === "opportunity"
  );
}

/**
 * -----------------------------
 * Fallback parsers (no AI needed)
 * -----------------------------
 */

function parseEmploymentType(text) {
  const t = String(text || "");
  if (/(internship|intern\b|co-?op)/i.test(t)) return "Internship";
  if (/(part[-\s]?time|\bPT\b)/i.test(t)) return "Part-time";
  if (/(contract|contractor|1099|corp[-\s]?to[-\s]?corp|c2c|freelance)/i.test(t))
    return "Contract";
  if (/(full[-\s]?time|\bFT\b|w2|permanent|salary position)/i.test(t))
    return "Full-time";
  return null;
}

function parseWorkModel(text) {
  const t = String(text || "");
  if (/\bhybrid\b/i.test(t)) return "Hybrid";
  if (
    /(on[-\s]?site|onsite|in[-\s]?office|office[-\s]?based|must be on site|in person|in-person)/i.test(
      t
    )
  )
    return "On-site";
  if (/\bremote\b/i.test(t) || /(work from home|wfh)/i.test(t)) return "Remote";
  return null;
}

function parseExperience(text) {
  const t = String(text || "").replace(/[–—]/g, "-");

  const range = t.match(/(\d{1,2})\s*-\s*(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b/i);
  const plus = t.match(/(\d{1,2})\s*\+\s*(?:years?|yrs?)\b/i);
  const min = t.match(/(?:minimum|min\.)\s*(\d{1,2})\s*(?:years?|yrs?)\b/i);
  const single = t.match(/(\d{1,2})\s*(?:years?|yrs?)\s+(?:of\s+)?experience\b/i);

  const pick = (n) => {
    const x = Number(n);
    return Number.isFinite(x) ? x : null;
  };

  let lo = null;
  if (range) lo = pick(range[1]);
  else if (plus) lo = pick(plus[1]);
  else if (min) lo = pick(min[1]);
  else if (single) lo = pick(single[1]);

  const years = lo;
  if (years == null) return null;
  if (years <= 2) return "0–2 yrs";
  if (years <= 5) return "3–5 yrs";
  return "5+ yrs";
}

function parseCompliance(text) {
  const t = String(text || "");
  const tags = new Set();

  if (
    /(no sponsorship|unable to sponsor|cannot sponsor|not able to sponsor|without sponsorship)/i.test(
      t
    )
  ) {
    tags.add("No sponsorship");
  }
  if (
    /(sponsorship available|visa sponsorship|we sponsor visas|sponsor H-?1B|H-?1B sponsorship)/i.test(
      t
    )
  ) {
    tags.add("Sponsorship available");
  }

  if (
    /(u\.?s\.?\s*citizen|us citizen|citizenship required|must be a citizen)/i.test(
      t
    )
  ) {
    tags.add("US Citizen required");
  }

  if (
    /(security clearance|clearance required|must have.*clearance|secret clearance|top secret|TS\/SCI|TS SCI)/i.test(
      t
    )
  ) {
    tags.add("Clearance required");
  }

  if (/(background check|drug test|e-?verify)/i.test(t)) {
    tags.add("Background check");
  }

  return Array.from(tags);
}

/**
 * -----------------------------
 * Requirements extraction (fallback)
 * -----------------------------
 */

function splitLines(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function pickSectionLines(allLines, headerRegex, maxLines = 40) {
  const idx = allLines.findIndex((l) => headerRegex.test(l));
  if (idx === -1) return [];

  const out = [];
  for (let i = idx + 1; i < allLines.length && out.length < maxLines; i++) {
    const line = allLines[i];
    if (!line) break;

    if (
      /^(benefits|job\s*type|location|work\s*location|position\s*overview|full\s*job\s*description|responsibilities|key\s*responsibilities|qualifications|requirements|education|experience|skills|languages|pay|salary|compensation)\b[:]?$/i.test(
        line
      )
    ) {
      break;
    }

    if (/^[-•·o]\s+/.test(line) || /required|preferred|experience|degree|cert/i.test(line)) {
      out.push(line.replace(/^[-•·o]\s+/, "").trim());
    } else {
      if (line.length <= 160) out.push(line);
    }
  }
  return out;
}

function isNoiseSkillLine(s) {
  const t = String(s || "").toLowerCase().trim();
  if (!t) return true;
  if (
    /(show more|job details|profile insights|here's how|align with your profile|estimated commute|job address)/i.test(
      t
    )
  )
    return true;
  if (
    /^(pay|salary|compensation|job type|shift and schedule|schedule|location|benefits|skills|languages)$/i.test(
      t
    )
  )
    return true;
  if (/^do you (have|know)\b/i.test(t)) return true;
  if (t.length <= 1) return true;
  return false;
}

function uniqStrings(arr) {
  const seen = new Set();
  const out = [];
  for (const x of arr || []) {
    const s = String(x || "").replace(/\s+/g, " ").trim();
    if (!s) continue;
    if (isNoiseSkillLine(s)) continue;

    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function parseInlineTaggedBlock(text, blockName, stopNames) {
  const raw = String(text || "");
  const stop =
    (stopNames || [])
      .map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|") || "$^";
  const re = new RegExp(
    `\\b${blockName}\\b\\s+([\\s\\S]{0,1200}?)(?=\\n\\b(?:${stop})\\b\\n|\\b(?:${stop})\\b\\n|$)`,
    "i"
  );
  const m = raw.match(re);
  if (!m) return [];

  const body = m[1]
    .replace(/\+\s*show\s*more\b/gi, " ")
    .replace(/\bdo\s+you\s+(have|know)[^?]*\?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const items = [];
  const itemRe = /([A-Za-z0-9][A-Za-z0-9+.#/&\-\s]{1,60}?)\s*\((Required|Preferred)\)/gi;
  let mm;
  while ((mm = itemRe.exec(body))) {
    const name = String(mm[1] || "").trim();
    const tag = String(mm[2] || "").trim().toLowerCase();
    if (!name) continue;
    if (isNoiseSkillLine(name)) continue;
    items.push({ name, tag });
  }

  return items;
}

function parseRequirementsFallback(text) {
  const raw = String(text || "");
  const lines = splitLines(raw);

  const skillsRequired = [];
  const skillsPreferred = [];
  const certificationsPreferred = [];

  const skillsBlock = pickSectionLines(lines, /^skills\b[:]?$/i, 40);
  for (const l of skillsBlock) {
    const m = l.match(/^(.+?)(?:\s*\((required|preferred)\))?$/i);
    if (!m) continue;
    const skill = m[1].trim();
    const tag = (m[2] || "").toLowerCase();
    if (!skill || isNoiseSkillLine(skill)) continue;
    if (tag === "preferred") skillsPreferred.push(skill);
    else skillsRequired.push(skill);
  }

  if (skillsRequired.length === 0 && skillsPreferred.length === 0) {
    const inlineSkills = parseInlineTaggedBlock(raw, "Skills", [
      "Languages",
      "Job details",
      "Pay",
      "Benefits",
      "Qualifications",
      "Requirements",
      "Education",
      "Responsibilities",
      "Location",
      "Job type",
    ]);
    for (const it of inlineSkills) {
      if (it.tag === "preferred") skillsPreferred.push(it.name);
      else skillsRequired.push(it.name);
    }
  }

  const inlineLang = parseInlineTaggedBlock(raw, "Languages", [
    "Job details",
    "Pay",
    "Benefits",
    "Qualifications",
    "Requirements",
    "Education",
    "Responsibilities",
    "Location",
    "Job type",
    "Skills",
  ]);
  for (const it of inlineLang) skillsRequired.push(it.name);

  const qualLines = [
    ...pickSectionLines(lines, /^qualifications\b[:]?$/i, 60),
    ...pickSectionLines(lines, /^requirements\b[:]?$/i, 60),
  ];

  let educationRequired = null;
  const eduLines = pickSectionLines(lines, /^education\b[:]?$/i, 25);
  const eduText = [...eduLines, ...qualLines].join(" \n ");

  if (/\b(bachelor|b\.?s\.?|ba\b|bs\b)\b/i.test(eduText)) {
    educationRequired = "Bachelor's degree (or equivalent experience)";
  } else if (/\bassociate\b/i.test(eduText)) {
    educationRequired = "Associate degree (or equivalent experience)";
  }

  let yearsExperienceMin = null;
  const yearsM =
    raw.match(/(\d{1,2})\+?\s*(?:years?|yrs?)\s*(?:of\s+)?experience\b/i) ||
    raw.match(/(?:experience|exp\.)\s*[:\-]?\s*(\d{1,2})\+?\s*(?:years?|yrs?)\b/i) ||
    raw.match(/(?:minimum|min\.)\s*(\d{1,2})\s*(?:years?|yrs?)\b/i);

  if (yearsM) {
    const n = Number(yearsM[1]);
    if (Number.isFinite(n)) yearsExperienceMin = n;
  }

  const certHints = [
    /CompTIA\s*(Network\+|Security\+|A\+)\b/i,
    /\bCCNA\b/i,
    /\bCCNP\b/i,
    /Microsoft\s+Certified/i,
    /\bMCSA\b/i,
    /\bMCSE\b/i,
  ];
  for (const re of certHints) {
    const m = raw.match(re);
    if (m) certificationsPreferred.push(m[0].trim());
  }

  let workModelRequired = null;
  if (
    /(100%\s*in\s*(office|offifce)|fully\s*on[-\s]?site|work\s*location:\s*in\s*person|\bin\s*person\b|on[-\s]?site|onsite)/i.test(
      raw
    )
  ) {
    workModelRequired = "On-site";
  } else if (/\bhybrid\b/i.test(raw)) {
    workModelRequired = "Hybrid";
  } else if (/\bremote\b/i.test(raw) || /(work from home|wfh)/i.test(raw)) {
    workModelRequired = "Remote";
  }

  const reqNow = uniqStrings(skillsRequired);
  if (reqNow.length === 0) {
    const tech = [
      "VoIP",
      "Salesforce",
      "Litify",
      "Windows",
      "Linux",
      "Networking",
      "Firewalls",
      "Antivirus",
      "Backups",
      "Cybersecurity",
      "Helpdesk",
      "Active Directory",
      "Office 365",
      "Microsoft 365",
      "Azure",
      "VPN",
      "Servers",
      "Google Workspace",
    ];
    for (const s of tech) {
      const re = new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (re.test(raw)) skillsRequired.push(s);
    }
  }

  return {
    skillsRequired: uniqStrings(skillsRequired).slice(0, 16),
    skillsPreferred: uniqStrings(skillsPreferred).slice(0, 12),
    educationRequired,
    yearsExperienceMin,
    certificationsPreferred: uniqStrings(certificationsPreferred).slice(0, 10),
    workModelRequired,
  };
}

/**
 * -----------------------------
 * Company / Title / Location (fallback helpers)
 * -----------------------------
 */

function parseCompanyFallback(text) {
  const raw = String(text || "");

  const jobPost = raw.match(
    /\bjob post\s+([A-Z][A-Za-z0-9&.,'’\-\s]{2,90}?)(?=\s+\d(?:\.\d+)?\s*$|\s+\d(?:\.\d+)?\s+out of 5|\s+\d{3,}\b|\s*\n|$)/i
  );
  if (jobPost && jobPost[1] && !isGenericCompanyName(jobPost[1])) return jobPost[1].trim();

  const lines = splitLines(raw);
  const idx = lines.findIndex((l) => /^company$/i.test(l));
  if (idx !== -1 && lines[idx + 1]) {
    const cand = lines[idx + 1].trim();
    if (cand && !isGenericCompanyName(cand)) return cand;
  }

  const labeled = raw.match(/(?:company|employer|organization)\s*:\s*([^\n]+)/i);
  if (labeled && labeled[1] && !isGenericCompanyName(labeled[1])) return labeled[1].trim();

  const ft = raw.match(
    /\b(full[-\s]?time|part[-\s]?time|contract)\b\s+([A-Z][A-Za-z0-9&.,'’\-\s]{2,90}?)(?=\s+\d{1,5}\b|\s+\$|\s*\n|$)/i
  );
  if (ft && ft[2] && !isGenericCompanyName(ft[2])) return ft[2].trim();

  const about = raw.match(/About\s+([A-Z][A-Za-z0-9&.,'’\-\s]{2,90}?)(?:\s*\n|:)/i);
  if (about && about[1] && !isGenericCompanyName(about[1])) return about[1].trim();

  const at = raw.match(
    /(?:\bat\b|@)\s+([A-Z][A-Za-z0-9&.,'’\-\s]{2,90}?)(?=\s+(?:is|are|we|you|located)\b|\s*-\s*|\s*\n|$)/i
  );
  if (at && at[1] && !isGenericCompanyName(at[1])) return at[1].trim();

  return null;
}

function parseLocationFallback(text) {
  const raw = String(text || "");

  const cityState = raw.match(/\b([A-Z][a-zA-Z.\- ]+),\s*([A-Z]{2})\b/);
  if (cityState) {
    return normalizeLocationCandidate(`${cityState[1].trim()}, ${cityState[2].trim()}`);
  }

  const labeled = raw.match(/\blocation\s*:\s*([^\n]+)/i);
  if (labeled && labeled[1]) return normalizeLocationCandidate(labeled[1].trim());

  return null;
}

/**
 * -----------------------------
 * Pay fallback (HARDENED)
 * -----------------------------
 */

function detectPayPeriod(text) {
  const t = String(text || "");
  const periodHints = [
    { period: "hour", re: /(\/hr|per\s*hour|an\s*hour|hourly)\b/i },
    { period: "year", re: /(\/yr|per\s*year|annually|annual|a\s*year|salary)\b/i },
    { period: "month", re: /(\/mo|per\s*month|monthly)\b/i },
    { period: "week", re: /(\/wk|per\s*week|weekly)\b/i },
    { period: "day", re: /(\/day|per\s*day|daily)\b/i },
  ];
  for (const p of periodHints) if (p.re.test(t)) return p.period;
  return null;
}

function computePayDerived(payMin, payMax, payPeriod) {
  const annualFactor =
    payPeriod === "hour"
      ? 2080
      : payPeriod === "week"
      ? 52
      : payPeriod === "month"
      ? 12
      : payPeriod === "day"
      ? 260
      : payPeriod === "year"
      ? 1
      : null;

  const payAnnualizedMin =
    annualFactor && typeof payMin === "number" ? Math.round(payMin * annualFactor) : null;
  const payAnnualizedMax =
    annualFactor && typeof payMax === "number" ? Math.round(payMax * annualFactor) : null;

  const mid =
    payAnnualizedMin && payAnnualizedMax
      ? (payAnnualizedMin + payAnnualizedMax) / 2
      : payAnnualizedMin || payAnnualizedMax || null;

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
    payAnnualizedMin,
    payAnnualizedMax,
    payPercentile,
    payPercentileSource: payPercentile != null ? "heuristic-bands" : null,
  };
}

function buildPayText(payMin, payMax, payPeriod) {
  if (payMin == null && payMax == null) return null;
  const sym = "$";
  const fmt = (n) =>
    typeof n === "number" ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "";
  const suffix = payPeriod
    ? { hour: "/hr", year: "/yr", month: "/mo", week: "/wk", day: "/day" }[payPeriod] || ""
    : "";

  if (payMin != null && payMax != null) {
    return payMin === payMax
      ? `${sym}${fmt(payMin)}${suffix}`
      : `${sym}${fmt(payMin)} – ${sym}${fmt(payMax)}${suffix}`;
  }
  if (payMin != null) return `${sym}${fmt(payMin)}${suffix}`;
  return `${sym}${fmt(payMax)}${suffix}`;
}

function parsePayFallback(text) {
  const full = String(text || "");
  const norm = full.replace(/[–—]/g, "-");

  const hasCurrencyAnywhere = /(\$|usd\b)/i.test(norm);
  const hasPayKeyword = /\b(pay|salary|compensation|pay range|salary range|hourly|rate)\b/i.test(
    norm
  );

  if (!hasCurrencyAnywhere && !hasPayKeyword) {
    return {
      payText: null,
      payMin: null,
      payMax: null,
      payCurrency: "USD",
      payPeriod: null,
      payConfidence: 0.0,
      payAnnualizedMin: null,
      payAnnualizedMax: null,
      payPercentile: null,
      payPercentileSource: null,
    };
  }

  let segment = norm;
  const kw = norm.search(/\b(pay|salary|compensation|rate)\b/i);
  if (kw !== -1) {
    const start = Math.max(0, kw - 200);
    const end = Math.min(norm.length, kw + 900);
    segment = norm.slice(start, end);
  } else if (hasCurrencyAnywhere) {
    const cur = norm.search(/\$/);
    if (cur !== -1) {
      const start = Math.max(0, cur - 120);
      const end = Math.min(norm.length, cur + 700);
      segment = norm.slice(start, end);
    }
  }

  const payCurrency = "USD";
  const payPeriod = detectPayPeriod(segment);

  const amountCore = String.raw`(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]{1,6})(?:\.[0-9]{1,2})?`;
  const rangeRe = new RegExp(
    String.raw`(\$|usd\s*)?\s*(${amountCore})\s*(k)?\s*(?:-|\bto\b)\s*(\$|usd\s*)?\s*(${amountCore})\s*(k)?`,
    "i"
  );

  const toNum = (rawNum, isK) => {
    if (!rawNum) return null;
    const n = Number(String(rawNum).replace(/,/g, ""));
    if (!Number.isFinite(n)) return null;
    return isK ? n * 1000 : n;
  };

  let payMin = null;
  let payMax = null;

  const rangeM = segment.match(rangeRe);
  if (rangeM) {
    const minRaw = rangeM[2];
    const minK = !!rangeM[3] && /k/i.test(rangeM[3]);
    const maxRaw = rangeM[5];
    const maxK = !!rangeM[6] && /k/i.test(rangeM[6]);
    payMin = toNum(minRaw, minK);
    payMax = toNum(maxRaw, maxK);
  } else {
    const oneM = segment.match(new RegExp(String.raw`(\$|usd\s*)\s*(${amountCore})\s*(k)?`, "i"));
    if (oneM) {
      const vRaw = oneM[2];
      const vK = !!oneM[3] && /k/i.test(oneM[3]);
      const val = toNum(vRaw, vK);
      payMin = val;
      payMax = val;
    } else if (hasPayKeyword && payPeriod) {
      const nums = segment.match(/\b\d{1,3}(?:\.\d{1,2})?\b/g) || [];
      const candidates = nums.map((x) => Number(x)).filter((n) => Number.isFinite(n));

      const plausible = candidates.filter((n) => {
        if (payPeriod === "hour") return n >= 5 && n <= 250;
        if (payPeriod === "year") return n >= 10000 && n <= 500000;
        if (payPeriod === "month") return n >= 800 && n <= 50000;
        if (payPeriod === "week") return n >= 100 && n <= 10000;
        if (payPeriod === "day") return n >= 50 && n <= 2000;
        return false;
      });

      if (plausible.length >= 2) {
        payMin = plausible[0];
        payMax = plausible[1];
      } else if (plausible.length === 1) {
        payMin = plausible[0];
        payMax = plausible[0];
      }
    }
  }

  if (payMin != null && payMax == null) payMax = payMin;
  if (payMax != null && payMin == null) payMin = payMax;
  if (typeof payMin === "number" && typeof payMax === "number" && payMin > payMax) {
    const tmp = payMin;
    payMin = payMax;
    payMax = tmp;
  }

  const explicitZero = /\$0\b/i.test(segment) || /\bunpaid\b/i.test(segment);
  if (
    !explicitZero &&
    typeof payMin === "number" &&
    payMin === 0 &&
    typeof payMax === "number" &&
    payMax > 0
  ) {
    payMin = null;
    payMax = null;
  }

  if (payPeriod === "hour") {
    if (typeof payMax === "number" && payMax > 500) {
      payMin = null;
      payMax = null;
    }
    if (!explicitZero && typeof payMin === "number" && payMin < 3) {
      payMin = null;
      payMax = null;
    }
  }
  if (payPeriod === "year") {
    if (typeof payMin === "number" && payMin < 5000) {
      payMin = null;
      payMax = null;
    }
  }

  const payText = buildPayText(payMin, payMax, payPeriod);

  let payConfidence = 0.0;
  const hasCurrencyInSegment = /(\$|usd\b)/i.test(segment);
  if (payText && payPeriod && (hasCurrencyInSegment || hasCurrencyAnywhere)) payConfidence = 0.9;
  else if (payText && hasPayKeyword && payPeriod) payConfidence = 0.65;
  else if (payText && (hasCurrencyInSegment || hasCurrencyAnywhere) && hasPayKeyword)
    payConfidence = 0.55;
  else if (payText && (hasCurrencyInSegment || hasCurrencyAnywhere)) payConfidence = 0.35;

  const derived = computePayDerived(payMin, payMax, payPeriod);

  return {
    payText,
    payMin,
    payMax,
    payCurrency,
    payPeriod,
    payConfidence,
    ...derived,
  };
}

function normalizePayUnknown(basePay, minConfidence = 0.5) {
  const p = basePay || {};
  const conf = typeof p.payConfidence === "number" ? p.payConfidence : 0;

  const hasNums = p.payMin != null || p.payMax != null;
  const hasText = typeof p.payText === "string" && p.payText.trim();

  if ((hasNums || hasText) && conf < minConfidence) {
    return {
      payText: "Unknown",
      payMin: null,
      payMax: null,
      payCurrency: "USD",
      payPeriod: null,
      payConfidence: 0.0,
      payAnnualizedMin: null,
      payAnnualizedMax: null,
      payPercentile: null,
      payPercentileSource: null,
    };
  }

  if (!hasNums && !hasText) {
    return {
      payText: "Unknown",
      payMin: null,
      payMax: null,
      payCurrency: "USD",
      payPeriod: null,
      payConfidence: 0.0,
      payAnnualizedMin: null,
      payAnnualizedMax: null,
      payPercentile: null,
      payPercentileSource: null,
    };
  }

  const derived = computePayDerived(p.payMin, p.payMax, p.payPeriod);
  const payText =
    typeof p.payText === "string" && p.payText.trim()
      ? p.payText.trim()
      : buildPayText(p.payMin, p.payMax, p.payPeriod);

  return {
    payText: payText || "Unknown",
    payMin: p.payMin ?? null,
    payMax: p.payMax ?? null,
    payCurrency: p.payCurrency || "USD",
    payPeriod: p.payPeriod ?? null,
    payConfidence: conf,
    payAnnualizedMin: p.payAnnualizedMin ?? derived.payAnnualizedMin ?? null,
    payAnnualizedMax: p.payAnnualizedMax ?? derived.payAnnualizedMax ?? null,
    payPercentile: p.payPercentile ?? derived.payPercentile ?? null,
    payPercentileSource: p.payPercentileSource ?? derived.payPercentileSource ?? null,
  };
}

function payValueAppearsInText(text, value, period) {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  const v = Math.round(value * 100) / 100;

  const raw = String(text || "");
  const valInt = String(Math.trunc(v));
  const valWithComma = Number.isFinite(v) ? Math.trunc(v).toLocaleString() : valInt;

  const periodRe =
    period === "hour"
      ? /(\/hr|per\s*hour|an\s*hour|hourly)\b/i
      : period === "year"
      ? /(\/yr|per\s*year|annually|annual|a\s*year)\b/i
      : period === "month"
      ? /(\/mo|per\s*month|monthly)\b/i
      : period === "week"
      ? /(\/wk|per\s*week|weekly)\b/i
      : period === "day"
      ? /(\/day|per\s*day|daily)\b/i
      : null;

  const dollarRe = new RegExp(
    String.raw`(\$|usd\s*)\s*(${valWithComma}|${valInt})(?:\.[0-9]{1,2})?`,
    "i"
  );
  if (dollarRe.test(raw)) return true;

  if (periodRe) {
    const perRe = new RegExp(
      String.raw`\b(${valInt})(?:\.[0-9]{1,2})?\s*${periodRe.source}`,
      "i"
    );
    if (perRe.test(raw)) return true;
  }

  return false;
}

function fallbackExtract(description) {
  const cleaned = normalizeJobText(description);
  const text = cleaned;

  // Title
  const titlePatterns = [
    /(?:position|role|job title|title):\s*([^\n]+)/i,
    /(?:hiring|seeking|looking for)\s+(?:a|an)?\s*([^\n,]+?)(?:\s+at|\s+to|\s+in|\s*\n)/i,
    /^([A-Z][^\n]{10,80}?)(?:\s+at|\s+-|\s*\n)/m,
  ];
    // Title (prefer top-of-post)
  let jobTitle = null;

  // 1) First non-empty line often contains the title (Indeed)
  const linesTop = splitLines(text).slice(0, 8);
  for (const line of linesTop) {
    const cand = cleanJobTitleCandidate(line);
    if (cand) {
      jobTitle = cand;
      break;
    }
  }

  // 2) Labeled title fields
  if (!jobTitle) {
    const m = text.match(/(?:position|role|job title|title):\s*([^\n]+)/i);
    jobTitle = cleanJobTitleCandidate(m?.[1]);
  }

  // 3) “Hiring for …” but reject generic captures
  if (!jobTitle) {
    const m = text.match(/(?:hiring|seeking|looking for)\s+(?:a|an)?\s*([^\n,]+?)(?:\s+at|\s+to|\s+in|\s*\n)/i);
    jobTitle = cleanJobTitleCandidate(m?.[1]);
  }

  // Company
  let company = parseCompanyFallback(text);

  // Website (better selection)
  const website = pickBestWebsite(text, company);


  // Location
  const location = parseLocationFallback(text);

  // Seniority
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

  // Keywords (small dictionary)
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
    "Windows",
    "Linux",
    "Active Directory",
    "Microsoft 365",
    "Office 365",
    "Google Workspace",
  ];
  for (const s of commonSkills) {
    const re = new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(text)) skills.add(s);
  }

  const employmentType = parseEmploymentType(text);
  const workModel = parseWorkModel(text);
  const experienceLevel = parseExperience(text);
  const complianceTags = parseCompliance(text);

  const pay = normalizePayUnknown(parsePayFallback(text), 0.5);
  const requirements = parseRequirementsFallback(text);

  return {
    jobTitle: jobTitle || "Position",
    company: company && !isGenericCompanyName(company) ? company : null,
    website,
    location,
    seniority,
    keywords: Array.from(skills).slice(0, 10),

    employmentType,
    workModel,
    experienceLevel,
    complianceTags,

    requirements,

    ...pay,
  };
}

function mergeRequirements(aiReq, fbReq) {
  const a = aiReq && typeof aiReq === "object" ? aiReq : null;
  const f = fbReq && typeof fbReq === "object" ? fbReq : null;
  if (!a && !f) return null;
  if (a && !f) return a;
  if (!a && f) return f;

  const skillsRequired = uniqStrings([...(a.skillsRequired || []), ...(f.skillsRequired || [])]).slice(
    0,
    16
  );
  const skillsPreferred = uniqStrings([...(a.skillsPreferred || []), ...(f.skillsPreferred || [])]).slice(
    0,
    12
  );

  return {
    skillsRequired,
    skillsPreferred,
    educationRequired: a.educationRequired || f.educationRequired || null,
    yearsExperienceMin:
      typeof a.yearsExperienceMin === "number"
        ? a.yearsExperienceMin
        : typeof f.yearsExperienceMin === "number"
        ? f.yearsExperienceMin
        : null,
    certificationsPreferred: uniqStrings([
      ...(a.certificationsPreferred || []),
      ...(f.certificationsPreferred || []),
    ]).slice(0, 12),
    workModelRequired: a.workModelRequired || f.workModelRequired || null,
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
    const jobDescriptionRaw = (body?.jobDescription || "").trim();

    if (!jobDescriptionRaw) {
      return { status: 400, jsonBody: { error: "Missing jobDescription" } };
    }

    // Always clean before any parsing/AI.
    const jobDescription = normalizeJobText(jobDescriptionRaw);

    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
    const apiVersion = "2024-02-15-preview";

    // Always compute fallback once (we'll use it as the baseline)
    const fb = fallbackExtract(jobDescription);

    if (!endpoint || !apiKey || !deployment) {
      return { status: 200, jsonBody: fb };
    }

    const url =
      `${endpoint.replace(/\/$/, "")}` +
      `/openai/deployments/${encodeURIComponent(deployment)}` +
      `/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;

    /**
     * ✅ KEY FIX: "Verify & correct" prompt instead of "extract from scratch"
     * - We pass FALLBACK_JSON and force the model to ONLY override when explicit.
     * - This reduces hallucinations + fixes “wrong company/pay/location”.
     */
   const system = `
You extract structured job posting fields from raw job descriptions.

Return ONLY valid JSON with EXACT keys:

jobTitle (string),
company (string|null),
website (string|null),
location (string|null),
seniority (string|null),
keywords (string[]),

employmentType (string|null),   // one of: "Full-time","Contract","Part-time","Internship"
workModel (string|null),        // one of: "Remote","Hybrid","On-site"
experienceLevel (string|null),  // one of: "0–2 yrs","3–5 yrs","5+ yrs"
complianceTags (string[]),

requirements (object|null) with keys:
  skillsRequired (string[]),
  skillsPreferred (string[]),
  educationRequired (string|null),
  yearsExperienceMin (number|null),
  certificationsPreferred (string[]),
  workModelRequired (string|null)

payText (string|null),
payMin (number|null),
payMax (number|null),
payCurrency (string|null),
payPeriod (string|null),
payConfidence (number|null)

CRITICAL RULES:
- jobTitle MUST be the actual role name (e.g. "Technical Support Engineer"), usually found at the very top.
- NEVER use generic words as jobTitle (reject: "individuals", "candidate", "person", "opportunity", "role", "position").
- website MUST be the company's primary website. Ignore social links (YouTube/Facebook/Twitter/LinkedIn).
  Prefer a link labeled "Website:"; otherwise choose the best company domain.
- Do NOT invent pay. If not explicitly stated, set payText/payMin/payMax/payPeriod/payConfidence = null.
- If unknown, use null (or [] for arrays). No extra keys. No markdown. No commentary.
`.trim();


    // Provide fallback JSON as baseline for the model to verify/correct
    const user = `JOB DESCRIPTION:\n${jobDescription}\n\nFALLBACK_JSON:\n${JSON.stringify(
      {
        jobTitle: fb.jobTitle,
        company: fb.company,
        website: fb.website,
        location: fb.location,
        seniority: fb.seniority,
        keywords: fb.keywords,
        employmentType: fb.employmentType,
        workModel: fb.workModel,
        experienceLevel: fb.experienceLevel,
        complianceTags: fb.complianceTags,
        requirements: fb.requirements,
        payText: fb.payText === "Unknown" ? null : fb.payText,
        payMin: fb.payMin,
        payMax: fb.payMax,
        payCurrency: fb.payCurrency,
        payPeriod: fb.payPeriod,
        payConfidence: fb.payConfidence,
      },
      null,
      2
    )}\n\nTASK:\nValidate FALLBACK_JSON against JOB DESCRIPTION. Only override fields when explicit evidence exists. Output JSON only.`;

    const aoaiRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      body: JSON.stringify({
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.0,
        max_tokens: 900,
      }),
    });

    if (!aoaiRes.ok) {
      const t = await aoaiRes.text().catch(() => "");
      context.error("AOAI extract non-200:", aoaiRes.status, t);
      return { status: 200, jsonBody: fb };
    }

    const data = await aoaiRes.json();
    const content = data?.choices?.[0]?.message?.content || "";

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      const start = content.indexOf("{");
      const end = content.lastIndexOf("}");
      if (start !== -1 && end !== -1 && end > start) parsed = JSON.parse(content.slice(start, end + 1));
      else parsed = null;
    }

    const allowedEmployment = new Set(["Full-time", "Contract", "Part-time", "Internship"]);
    const allowedWorkModel = new Set(["Remote", "Hybrid", "On-site"]);
    const allowedExperience = new Set(["0–2 yrs", "3–5 yrs", "5+ yrs"]);
    const allowedPeriods = new Set(["hour", "year", "month", "week", "day"]);

    const safeReq = (() => {
      const r = parsed?.requirements;
      if (!r || typeof r !== "object") return null;

      const wm =
        typeof r.workModelRequired === "string" && allowedWorkModel.has(r.workModelRequired)
          ? r.workModelRequired
          : null;

      const years =
        typeof r.yearsExperienceMin === "number" && Number.isFinite(r.yearsExperienceMin)
          ? Math.max(0, Math.min(60, Math.round(r.yearsExperienceMin)))
          : null;

      const skillsRequired = Array.isArray(r.skillsRequired) ? uniqStrings(r.skillsRequired).slice(0, 16) : [];
      const skillsPreferred = Array.isArray(r.skillsPreferred) ? uniqStrings(r.skillsPreferred).slice(0, 12) : [];
      const certs = Array.isArray(r.certificationsPreferred)
        ? uniqStrings(r.certificationsPreferred).slice(0, 12)
        : [];

      const edu =
        typeof r.educationRequired === "string" && r.educationRequired.trim()
          ? r.educationRequired.trim()
          : null;

      return {
        skillsRequired,
        skillsPreferred,
        educationRequired: edu,
        yearsExperienceMin: years,
        certificationsPreferred: certs,
        workModelRequired: wm,
      };
    })();

    let safeCompany =
      typeof parsed?.company === "string" && parsed.company.trim() ? parsed.company.trim() : null;
    if (safeCompany && isGenericCompanyName(safeCompany)) safeCompany = null;

    let safeLocation =
      typeof parsed?.location === "string" && parsed.location.trim() ? parsed.location.trim() : null;
    safeLocation = normalizeLocationCandidate(safeLocation);

    let safeTitle =
      typeof parsed?.jobTitle === "string" && parsed.jobTitle.trim() ? parsed.jobTitle.trim() : null;
    if (safeTitle && isGenericJobTitle(safeTitle)) safeTitle = null;

    const safe = {
      jobTitle: safeTitle,
      company: safeCompany,
      website: typeof parsed?.website === "string" && parsed.website.trim() ? parsed.website.trim() : null,
      location: safeLocation,
      seniority: typeof parsed?.seniority === "string" && parsed.seniority.trim() ? parsed.seniority.trim() : null,
      keywords: Array.isArray(parsed?.keywords) ? uniqStrings(parsed.keywords).slice(0, 12) : [],

      employmentType:
        typeof parsed?.employmentType === "string" && allowedEmployment.has(parsed.employmentType)
          ? parsed.employmentType
          : null,
      workModel:
        typeof parsed?.workModel === "string" && allowedWorkModel.has(parsed.workModel)
          ? parsed.workModel
          : null,
      experienceLevel:
        typeof parsed?.experienceLevel === "string" && allowedExperience.has(parsed.experienceLevel)
          ? parsed.experienceLevel
          : null,
      complianceTags: Array.isArray(parsed?.complianceTags) ? uniqStrings(parsed.complianceTags).slice(0, 6) : [],

      requirements: safeReq,

      payText: typeof parsed?.payText === "string" && parsed.payText.trim() ? parsed.payText.trim() : null,
      payMin: typeof parsed?.payMin === "number" && Number.isFinite(parsed.payMin) ? parsed.payMin : null,
      payMax: typeof parsed?.payMax === "number" && Number.isFinite(parsed.payMax) ? parsed.payMax : null,
      payCurrency:
        typeof parsed?.payCurrency === "string" && parsed.payCurrency.trim() ? parsed.payCurrency.trim() : "USD",
      payPeriod:
        typeof parsed?.payPeriod === "string" && allowedPeriods.has(parsed.payPeriod) ? parsed.payPeriod : null,
      payConfidence:
        typeof parsed?.payConfidence === "number" && Number.isFinite(parsed.payConfidence)
          ? Math.max(0, Math.min(1, parsed.payConfidence))
          : 0.0,
    };

    if (safe.payMin != null && safe.payMax == null) safe.payMax = safe.payMin;
    if (safe.payMax != null && safe.payMin == null) safe.payMin = safe.payMax;

    // Verify AI pay is supported by the text (prevents invented pay).
    const aiHasPayNums = safe.payMin != null || safe.payMax != null;
    if (aiHasPayNums) {
      const okMin =
        safe.payMin == null ? true : payValueAppearsInText(jobDescription, safe.payMin, safe.payPeriod);
      const okMax =
        safe.payMax == null ? true : payValueAppearsInText(jobDescription, safe.payMax, safe.payPeriod);

      const explicitZero = /\$0\b/i.test(jobDescription) || /\bunpaid\b/i.test(jobDescription);
      const suspiciousZero = !explicitZero && safe.payMin === 0 && typeof safe.payMax === "number" && safe.payMax > 0;

      if (!okMin || !okMax || suspiciousZero) {
        safe.payText = null;
        safe.payMin = null;
        safe.payMax = null;
        safe.payPeriod = null;
        safe.payConfidence = 0.0;
      }
    }

    // Always compute fallback pay too (robustness)
    const fbPayRaw = parsePayFallback(jobDescription);

    const aiPayRaw = {
      payText: safe.payText ?? buildPayText(safe.payMin, safe.payMax, safe.payPeriod),
      payMin: safe.payMin,
      payMax: safe.payMax,
      payCurrency: safe.payCurrency || "USD",
      payPeriod: safe.payPeriod,
      payConfidence: typeof safe.payConfidence === "number" ? safe.payConfidence : 0.0,
      ...computePayDerived(safe.payMin, safe.payMax, safe.payPeriod),
    };

    const bestPayCandidate =
      (aiPayRaw.payConfidence || 0) >= (fbPayRaw.payConfidence || 0) ? aiPayRaw : fbPayRaw;

    const mergedPay = normalizePayUnknown(bestPayCandidate, 0.5);

    // Merge fields: prefer AI-safe values, fill gaps with fallback
    const mergedKeywords = uniqStrings([
      ...(safe.keywords && safe.keywords.length ? safe.keywords : []),
      ...(fb.keywords || []),
    ]).slice(0, 12);

    const base = {
      jobTitle: safe.jobTitle || fb.jobTitle || "Position",
      company: safe.company || fb.company || null,
      website: safe.website || fb.website || null,
      location: safe.location || fb.location || null,
      seniority: safe.seniority || fb.seniority || null,
      keywords: mergedKeywords,

      employmentType: safe.employmentType || fb.employmentType || null,
      workModel: safe.workModel || fb.workModel || null,
      experienceLevel: safe.experienceLevel || fb.experienceLevel || null,
      complianceTags:
        safe.complianceTags && safe.complianceTags.length ? safe.complianceTags : fb.complianceTags || [],

      requirements: mergeRequirements(safe.requirements, fb.requirements),

      ...mergedPay,
    };

    // Extra fallback fill
    if (!base.employmentType) base.employmentType = parseEmploymentType(jobDescription);
    if (!base.workModel) base.workModel = parseWorkModel(jobDescription);
    if (!base.experienceLevel) base.experienceLevel = parseExperience(jobDescription);
    if (!base.complianceTags || base.complianceTags.length === 0) base.complianceTags = parseCompliance(jobDescription);

    if (!base.requirements) base.requirements = parseRequirementsFallback(jobDescription);

    base.location = normalizeLocationCandidate(base.location);

    // Guarantee pay Unknown is consistent
    if (String(base.payText || "").trim().toLowerCase() === "unknown") {
      base.payText = "Unknown";
      base.payMin = null;
      base.payMax = null;
      base.payPeriod = null;
      base.payConfidence = 0.0;
      base.payAnnualizedMin = null;
      base.payAnnualizedMax = null;
      base.payPercentile = null;
      base.payPercentileSource = null;
    } else {
      base.payText = typeof base.payText === "string" && base.payText.trim() ? base.payText.trim() : "Unknown";
    }

    // Final sanity
    if (base.company && isGenericCompanyName(base.company)) base.company = null;
    if (base.jobTitle && isGenericJobTitle(base.jobTitle)) base.jobTitle = fb.jobTitle || "Position";

    return { status: 200, jsonBody: base };
  } catch (err) {
    context.error("extractJob error:", err);
    let raw = "";
    try {
      raw = await request.text();
    } catch {}
    return { status: 200, jsonBody: fallbackExtract(raw) };
  }
};
