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
  if (/(on[-\s]?site|onsite|in[-\s]?office|office[-\s]?based|must be on site|in person|in-person)/i.test(t))
    return "On-site";

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

  if (range) lo = pick(range[1]);
  else if (plus) lo = pick(plus[1]);
  else if (min) lo = pick(min[1]);
  else if (single) lo = pick(single[1]);

  // Convert to a simple chip band
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
  if (
    /(security clearance|clearance required|must have.*clearance|secret clearance|top secret|TS\/SCI|TS SCI)/i.test(t)
  ) {
    tags.add("Clearance required");
  }

  // Background check
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
    .replace(/&nbsp;/gi, " ")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isJunkSkillLine(s) {
  const t = String(s || "").trim();
  if (!t) return true;

  // ultra-short generic junk (drop "IT", "OK", etc.)
  const lower = t.toLowerCase();
  const shortOk = new Set(["c++", "c#", "go", "js", "ts", "ui", "ux", "qa", "pm"]);
  if (t.length <= 2 && !shortOk.has(lower)) return true;
  if (lower === "it") return true;

  // UI / scrape junk from job boards
  if (/^\+?\s*show\s+more$/i.test(t)) return true;
  if (/^(job details|pay|languages|benefits)$/i.test(t)) return true;
  if (/^here'?s how\b/i.test(t)) return true;
  if (/^do you have experience\b/i.test(t)) return true;
  if (/^do you know\b/i.test(t)) return true;
  if (/^&?nbsp;?$/i.test(t)) return true;

  // Questions / prompts
  if (/\?/.test(t)) return true;

  // Pay should NEVER be treated as a skill chip
  if (/\$/.test(t)) return true;
  if (/\b(per\s*hour|hourly|salary|compensation|pay range|\/hr|\/yr)\b/i.test(t)) return true;

  // Percentile / confidence UI labels
  if (/\b(top\s*\d+%|percentile|high confidence|medium confidence|low confidence)\b/i.test(t)) return true;

  return false;
}

function pickSectionLines(allLines, headerRegex, maxLines = 40) {
  // Find a header line, then collect subsequent bullet-ish lines until a blank-ish stop.
  const idx = allLines.findIndex((l) => headerRegex.test(l));
  if (idx === -1) return [];

  const out = [];
  for (let i = idx + 1; i < allLines.length && out.length < maxLines; i++) {
    const line = allLines[i];
    if (!line) break;

    // Stop if we hit another common header
    if (
      /^(benefits|job\s*type|location|work\s*location|position\s*overview|full\s*job\s*description|responsibilities|key\s*responsibilities|qualifications|requirements|education|experience|skills)\b[:]?$/i.test(
        line
      )
    ) {
      break;
    }

    // Skip junk lines commonly scraped from boards
    if (isJunkSkillLine(line)) continue;

    // Bullet-ish or short requirement-ish lines
    if (/^[-•·o]\s+/.test(line) || /required|preferred|experience|degree|cert/i.test(line)) {
      out.push(line.replace(/^[-•·o]\s+/, "").trim());
    } else {
      // also keep short lines right after header
      if (line.length <= 140) out.push(line);
    }
  }
  return out;
}

function uniqStrings(arr) {
  const seen = new Set();
  const out = [];
  for (const x of arr || []) {
    const s = String(x || "").trim();
    if (!s) continue;
    if (isJunkSkillLine(s)) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function parseRequirementsFallback(text) {
  const raw = String(text || "");
  const lines = splitLines(raw);

  const skillsRequired = [];
  const skillsPreferred = [];
  const certificationsPreferred = [];

  // 1) Try to read explicit Indeed-like “Skills” block
  const skillsBlock = pickSectionLines(lines, /^skills\b[:]?$/i, 30);
  for (const l of skillsBlock) {
    // Example: "VoIP (Required)" or "Salesforce (Required)"
    const m = l.match(/^(.+?)(?:\s*\((required|preferred)\))?$/i);
    if (!m) continue;
    const skill = String(m[1] || "").trim();
    const tag = String(m[2] || "").toLowerCase();
    if (!skill) continue;
    if (isJunkSkillLine(skill)) continue;

    if (tag === "preferred") skillsPreferred.push(skill);
    else skillsRequired.push(skill); // default to required when unclear in Skills block
  }

  // 2) Qualifications / Requirements sections
  const qualLines = [
    ...pickSectionLines(lines, /^qualifications\b[:]?$/i, 50),
    ...pickSectionLines(lines, /^requirements\b[:]?$/i, 50),
  ];

  // 3) Education required
  let educationRequired = null;
  // Pull from explicit Education header if present
  const eduLines = pickSectionLines(lines, /^education\b[:]?$/i, 20);
  const eduText = [...eduLines, ...qualLines].join(" \n ");

  if (/\b(bachelor|b\.?s\.?|ba\b|bs\b)\b/i.test(eduText)) {
    educationRequired = "Bachelor's degree (or equivalent experience)";
  } else if (/\bassociate\b/i.test(eduText)) {
    educationRequired = "Associate degree (or equivalent experience)";
  }

  // 4) Years experience min (prefer “Required/Qualifications”)
  let yearsExperienceMin = null;
  const yearsM =
    raw.replace(/[–—]/g, "-").match(/(\d{1,2})\+?\s*(?:years?|yrs?)\s*(?:of\s+)?experience\b/i) ||
    raw.replace(/[–—]/g, "-").match(/(?:experience|exp\.)\s*[:\-]?\s*(\d{1,2})\+?\s*(?:years?|yrs?)\b/i) ||
    raw.replace(/[–—]/g, "-").match(/(?:minimum|min\.)\s*(\d{1,2})\s*(?:years?|yrs?)\b/i);

  if (yearsM) {
    const n = Number(yearsM[1]);
    if (Number.isFinite(n)) yearsExperienceMin = n;
  }

  // 5) Certifications preferred
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
    if (m) {
      const hit = String(m[0] || "").trim();
      if (hit && !isJunkSkillLine(hit)) certificationsPreferred.push(hit);
    }
  }

  // 6) Work model required (strong phrasing)
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

  // 7) If skillsRequired still empty, infer from a small tech dictionary
  if (skillsRequired.length === 0) {
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
 * Pay fallback (HARDENED: prevents false positives)
 * -----------------------------
 */
function parsePayFallback(text) {
  const t = String(text || "");

  // Normalize dashes
  const norm = t.replace(/[–—]/g, "-");

  // 🚫 Common noise that should never be treated as pay
  const hasNoiseContext = /(out of 5 stars|stars\b|responded to\s*\d+%|typicall?y within|commute|minutes\b|job address|tx\s+\d{5}\b)/i.test(
    norm
  );

  // ✅ Strong pay hints
  const hasCurrency = /(\$|usd\b)/i.test(norm);
  const hasPayKeyword = /\b(pay|salary|compensation|pay range|salary range|hourly)\b/i.test(norm);

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
    if (p.re.test(norm)) {
      payPeriod = p.period;
      break;
    }
  }

  // If no currency and no pay keyword, do NOT parse numbers at all.
  if (!hasCurrency && !hasPayKeyword) {
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

  // Range patterns (2–3 digits or comma format)
  const rangeRe =
    /(\$|usd\s*)?\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{2,3})(\s*k)?\s*-\s*(\$|usd\s*)?\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{2,3})(\s*k)?/i;

  // Single patterns (2–3 digits or comma format)
  const oneRe = /(\$|usd\s*)\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{2,3})(\s*k)?/i;

  const toNum = (raw, isK) => {
    if (!raw) return null;
    const n = Number(String(raw).replace(/,/g, ""));
    if (!Number.isFinite(n)) return null;
    return isK ? n * 1000 : n;
  };

  let payMin = null;
  let payMax = null;
  const payCurrency = "USD";
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

  // Build nice text if we found numbers
  if (payMin != null || payMax != null) {
    const sym = "$";
    const fmt = (n) => (typeof n === "number" ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "");
    const suffix = payPeriod
      ? ({ hour: "/hr", year: "/yr", month: "/mo", week: "/wk", day: "/day" }[payPeriod] || "")
      : "";

    if (payMin != null && payMax != null) {
      payText = payMin === payMax ? `${sym}${fmt(payMin)}${suffix}` : `${sym}${fmt(payMin)} – ${sym}${fmt(payMax)}${suffix}`;
    } else if (payMin != null) {
      payText = `${sym}${fmt(payMin)}${suffix}`;
    } else if (payMax != null) {
      payText = `${sym}${fmt(payMax)}${suffix}`;
    }
  }

  // Confidence
  let payConfidence = 0.0;

  // strong: currency + period
  if (payText && payPeriod && hasCurrency) payConfidence = 0.9;
  // medium: currency + pay keyword, missing period
  else if (payText && hasCurrency && hasPayKeyword) payConfidence = 0.55;
  // weak: currency but noisy context => downgrade hard
  else if (payText && hasCurrency) payConfidence = hasNoiseContext ? 0.15 : 0.35;

  // Annualize
  const annualFactor =
    payPeriod === "hour" ? 2080 :
    payPeriod === "week" ? 52 :
    payPeriod === "month" ? 12 :
    payPeriod === "day" ? 260 :
    payPeriod === "year" ? 1 :
    null;

  const payAnnualizedMin = annualFactor && typeof payMin === "number" ? Math.round(payMin * annualFactor) : null;
  const payAnnualizedMax = annualFactor && typeof payMax === "number" ? Math.round(payMax * annualFactor) : null;

  // Percentile heuristic (only if annualized exists)
  const mid =
    payAnnualizedMin && payAnnualizedMax
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

/**
 * -----------------------------
 * Pay normalization helpers
 * -----------------------------
 */

// Treat AI "0" as placeholder unless the post explicitly says unpaid/volunteer.
function scrubZeroPlaceholderPay(pay, sourceText) {
  const p = { ...(pay || {}) };
  const raw = String(sourceText || "");
  const unpaid = /\bunpaid\b|\bvolunteer\b/i.test(raw);

  const hasMin = typeof p.payMin === "number" && Number.isFinite(p.payMin);
  const hasMax = typeof p.payMax === "number" && Number.isFinite(p.payMax);

  if (!unpaid) {
    // "0 - 18/hr" => treat 0 as unknown bound
    if (hasMin && p.payMin === 0 && hasMax && p.payMax > 0) p.payMin = null;
    if (hasMax && p.payMax === 0 && hasMin && p.payMin > 0) p.payMax = null;

    // "0 - 0" => garbage placeholder
    if (hasMin && hasMax && p.payMin === 0 && p.payMax === 0) {
      p.payText = null;
      p.payMin = null;
      p.payMax = null;
      p.payPeriod = null;
      p.payConfidence = 0.0;
      p.payAnnualizedMin = null;
      p.payAnnualizedMax = null;
      p.payPercentile = null;
      p.payPercentileSource = null;
    }

    // annualized placeholders
    if (typeof p.payAnnualizedMin === "number" && typeof p.payAnnualizedMax === "number") {
      if (p.payAnnualizedMin === 0 && p.payAnnualizedMax > 0) p.payAnnualizedMin = null;
      if (p.payAnnualizedMax === 0 && p.payAnnualizedMin > 0) p.payAnnualizedMax = null;
    }
  }

  // Ensure min <= max
  if (typeof p.payMin === "number" && typeof p.payMax === "number" && p.payMin > p.payMax) {
    const tmp = p.payMin;
    p.payMin = p.payMax;
    p.payMax = tmp;
  }

  return p;
}

function computeAnnualAndPercentile(pay) {
  const p = { ...(pay || {}) };

  const period = typeof p.payPeriod === "string" ? p.payPeriod : null;
  const min = typeof p.payMin === "number" && Number.isFinite(p.payMin) ? p.payMin : null;
  const max = typeof p.payMax === "number" && Number.isFinite(p.payMax) ? p.payMax : null;

  const annualFactor =
    period === "hour" ? 2080 :
    period === "week" ? 52 :
    period === "month" ? 12 :
    period === "day" ? 260 :
    period === "year" ? 1 :
    null;

  // Only fill annualized if missing
  if (annualFactor && p.payAnnualizedMin == null && min != null) p.payAnnualizedMin = Math.round(min * annualFactor);
  if (annualFactor && p.payAnnualizedMax == null && max != null) p.payAnnualizedMax = Math.round(max * annualFactor);

  // Percentile heuristic if missing and annualized exists
  if (p.payPercentile == null) {
    const aMin = typeof p.payAnnualizedMin === "number" ? p.payAnnualizedMin : null;
    const aMax = typeof p.payAnnualizedMax === "number" ? p.payAnnualizedMax : null;
    const mid = aMin && aMax ? (aMin + aMax) / 2 : (aMin || aMax || null);

    if (typeof mid === "number") {
      let pct = null;
      if (mid < 45000) pct = 20;
      else if (mid < 65000) pct = 40;
      else if (mid < 85000) pct = 55;
      else if (mid < 110000) pct = 70;
      else if (mid < 140000) pct = 82;
      else pct = 90;

      p.payPercentile = pct;
      p.payPercentileSource = p.payPercentileSource || "heuristic-bands";
    }
  }

  return p;
}

// Final guard: if pay isn’t confident enough, return Unknown
function normalizePayUnknown(basePay, minConfidence = 0.5) {
  const p = basePay || {};
  const conf = typeof p.payConfidence === "number" ? p.payConfidence : 0;

  // if we have *any* pay numbers but low confidence => wipe and mark unknown
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

  // if nothing found at all
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

  return p;
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
    if (m) {
      jobTitle = m[1].trim();
      break;
    }
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
    if (m) {
      company = m[1].trim();
      break;
    }
  }

  // Website
  const urlMatch = text.match(/https?:\/\/[^\s]+/);
  const website = urlMatch ? urlMatch[0] : null;

  // Location
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

  // Keywords
  const skills = new Set();
  const commonSkills = ["React", "Python", "JavaScript", "AWS", "Docker", "SQL", "Node.js", "Java", "C++", "TypeScript", "Git", "Azure"];
  for (const s of commonSkills) {
    const re = new RegExp(`\\b${s.replace("+", "\\+")}\\b`, "i");
    if (re.test(text)) skills.add(s);
  }

  // chips
  const employmentType = parseEmploymentType(text);
  const workModel = parseWorkModel(text);
  const experienceLevel = parseExperience(text);
  const complianceTags = parseCompliance(text);

  // Pay (hardened + unknown guard + scrub 0 placeholders)
  const payFallback = scrubZeroPlaceholderPay(parsePayFallback(text), text);
  const pay = normalizePayUnknown(computeAnnualAndPercentile(payFallback), 0.5);

  // Requirements
  const requirements = parseRequirementsFallback(text);

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

    requirements,

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

    // Hardcoded ok
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

requirements (object|null) with keys:
  skillsRequired (string[]),
  skillsPreferred (string[]),
  educationRequired (string|null),
  yearsExperienceMin (number|null),
  certificationsPreferred (string[]),
  workModelRequired (string|null) // "Remote"|"Hybrid"|"On-site"|null

payText (string|null),
payMin (number|null),
payMax (number|null),
payCurrency (string|null),      // ex: "USD"
payPeriod (string|null),        // one of: "hour","year","month","week","day"
payConfidence (number|null)     // 0..1 confidence about pay

Rules:
- Do NOT invent pay. If you do not see salary/compensation explicitly, set all pay fields null.
- NEVER use 0 as a placeholder. If only one bound is present (e.g., "up to $18/hr"), use payMax=18 and payMin=null.
- If unknown: use null (or [] for arrays).
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
        max_tokens: 850,
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

      const skillsRequired = Array.isArray(r.skillsRequired)
        ? r.skillsRequired
            .filter((x) => typeof x === "string" && x.trim())
            .map((x) => x.trim())
            .filter((x) => !isJunkSkillLine(x))
            .slice(0, 16)
        : [];

      const skillsPreferred = Array.isArray(r.skillsPreferred)
        ? r.skillsPreferred
            .filter((x) => typeof x === "string" && x.trim())
            .map((x) => x.trim())
            .filter((x) => !isJunkSkillLine(x))
            .slice(0, 12)
        : [];

      const certs = Array.isArray(r.certificationsPreferred)
        ? r.certificationsPreferred
            .filter((x) => typeof x === "string" && x.trim())
            .map((x) => x.trim())
            .filter((x) => !isJunkSkillLine(x))
            .slice(0, 12)
        : [];

      const edu = typeof r.educationRequired === "string" && r.educationRequired.trim() ? r.educationRequired.trim() : null;

      return {
        skillsRequired,
        skillsPreferred,
        educationRequired: edu,
        yearsExperienceMin: years,
        certificationsPreferred: certs,
        workModelRequired: wm,
      };
    })();

    const safe = {
      jobTitle: typeof parsed?.jobTitle === "string" && parsed.jobTitle.trim() ? parsed.jobTitle.trim() : null,
      company: typeof parsed?.company === "string" && parsed.company.trim() ? parsed.company.trim() : null,
      website: typeof parsed?.website === "string" && parsed.website.trim() ? parsed.website.trim() : null,
      location: typeof parsed?.location === "string" && parsed.location.trim() ? parsed.location.trim() : null,
      seniority: typeof parsed?.seniority === "string" && parsed.seniority.trim() ? parsed.seniority.trim() : null,
      keywords: Array.isArray(parsed?.keywords)
        ? parsed.keywords.filter((k) => typeof k === "string" && k.trim()).slice(0, 12)
        : [],

      employmentType: typeof parsed?.employmentType === "string" && allowedEmployment.has(parsed.employmentType) ? parsed.employmentType : null,
      workModel: typeof parsed?.workModel === "string" && allowedWorkModel.has(parsed.workModel) ? parsed.workModel : null,
      experienceLevel:
        typeof parsed?.experienceLevel === "string" && allowedExperience.has(parsed.experienceLevel) ? parsed.experienceLevel : null,
      complianceTags: Array.isArray(parsed?.complianceTags)
        ? parsed.complianceTags.filter((x) => typeof x === "string" && x.trim()).slice(0, 6)
        : [],

      requirements: safeReq,

      payText: typeof parsed?.payText === "string" && parsed.payText.trim() ? parsed.payText.trim() : null,
      payMin: typeof parsed?.payMin === "number" && Number.isFinite(parsed.payMin) ? parsed.payMin : null,
      payMax: typeof parsed?.payMax === "number" && Number.isFinite(parsed.payMax) ? parsed.payMax : null,
      payCurrency: typeof parsed?.payCurrency === "string" && parsed.payCurrency.trim() ? parsed.payCurrency.trim() : "USD",
      payPeriod: typeof parsed?.payPeriod === "string" && allowedPeriods.has(parsed.payPeriod) ? parsed.payPeriod : null,
      payConfidence:
        typeof parsed?.payConfidence === "number" && Number.isFinite(parsed.payConfidence)
          ? Math.max(0, Math.min(1, parsed.payConfidence))
          : null,
    };

    // normalize pay range (but do it AFTER we scrub zero placeholders below)
    // If payPeriod missing but we have numbers, let fallback infer period/annualization/percentile
    const needPayFallback = (safe.payMin != null || safe.payMax != null || safe.payText) && !safe.payPeriod;

    const payFromFallback = needPayFallback ? parsePayFallback(jobDescription) : null;

    const mergedPayRaw = {
      payText: safe.payText ?? payFromFallback?.payText ?? null,
      payMin: safe.payMin ?? payFromFallback?.payMin ?? null,
      payMax: safe.payMax ?? payFromFallback?.payMax ?? null,
      payCurrency: safe.payCurrency ?? payFromFallback?.payCurrency ?? "USD",
      payPeriod: safe.payPeriod ?? payFromFallback?.payPeriod ?? null,
      payConfidence: safe.payConfidence ?? payFromFallback?.payConfidence ?? 0.0,
      payAnnualizedMin: payFromFallback?.payAnnualizedMin ?? null,
      payAnnualizedMax: payFromFallback?.payAnnualizedMax ?? null,
      payPercentile: payFromFallback?.payPercentile ?? null,
      payPercentileSource: payFromFallback?.payPercentileSource ?? null,
    };

    // ✅ Kill "0 as placeholder" coming from AI or scraped boards
    const mergedPayScrubbed = scrubZeroPlaceholderPay(mergedPayRaw, jobDescription);

    // normalize pay range (after scrub)
    if (mergedPayScrubbed.payMin != null && mergedPayScrubbed.payMax == null) mergedPayScrubbed.payMax = mergedPayScrubbed.payMin;
    if (mergedPayScrubbed.payMax != null && mergedPayScrubbed.payMin == null) mergedPayScrubbed.payMin = mergedPayScrubbed.payMax;

    // Fill annualization + percentile from the final merged pay
    const mergedPayComputed = computeAnnualAndPercentile(mergedPayScrubbed);

    // ✅ Final pay truth: if not confident, make it Unknown
    const mergedPay = normalizePayUnknown(mergedPayComputed, 0.5);

    const isMostlyEmpty =
      !safe.jobTitle &&
      !safe.company &&
      !safe.website &&
      !safe.location &&
      !safe.seniority &&
      safe.keywords.length === 0 &&
      (!safe.employmentType && !safe.workModel && !safe.experienceLevel) &&
      (!safe.complianceTags || safe.complianceTags.length === 0) &&
      (!safe.requirements ||
        ((!safe.requirements.educationRequired) &&
          (!safe.requirements.yearsExperienceMin) &&
          (!safe.requirements.workModelRequired) &&
          (!safe.requirements.skillsRequired || safe.requirements.skillsRequired.length === 0) &&
          (!safe.requirements.certificationsPreferred || safe.requirements.certificationsPreferred.length === 0)));

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

          requirements: safe.requirements,

          ...mergedPay,
        };

    // If AI missed the chip fields, fallback-fill them
    if (!base.employmentType) base.employmentType = parseEmploymentType(jobDescription);
    if (!base.workModel) base.workModel = parseWorkModel(jobDescription);
    if (!base.experienceLevel) base.experienceLevel = parseExperience(jobDescription);
    if (!base.complianceTags || base.complianceTags.length === 0) base.complianceTags = parseCompliance(jobDescription);

    // If AI missed requirements, fallback-fill them
    if (!base.requirements) base.requirements = parseRequirementsFallback(jobDescription);

    // Final sanitize requirements lists (kills "+ show more", questions, pay chips, etc.)
    if (base.requirements && typeof base.requirements === "object") {
      base.requirements.skillsRequired = uniqStrings(base.requirements.skillsRequired || []).slice(0, 16);
      base.requirements.skillsPreferred = uniqStrings(base.requirements.skillsPreferred || []).slice(0, 12);
      base.requirements.certificationsPreferred = uniqStrings(base.requirements.certificationsPreferred || []).slice(0, 10);
    }

    // If pay is still missing, guarantee Unknown (but do NOT force numbers)
    base.payText = typeof base.payText === "string" && base.payText.trim() ? base.payText.trim() : "Unknown";

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
