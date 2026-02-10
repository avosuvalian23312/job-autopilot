// backend/src/functions/extractJob.js
"use strict";

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

  return {
    jobTitle: jobTitle || "Position",
    company: company || "Company",
    website,
    location,
    seniority,
    keywords: Array.from(skills).slice(0, 10),
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
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-02-15-preview";

    if (!endpoint || !apiKey || !deployment) {
      // still return something usable
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
location (string|null), seniority (string|null), keywords (string[]).
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
        max_tokens: 300,
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
      // sometimes model returns JSON wrapped in text — attempt to salvage
      const start = content.indexOf("{");
      const end = content.lastIndexOf("}");
      if (start !== -1 && end !== -1 && end > start) {
        parsed = JSON.parse(content.slice(start, end + 1));
      } else {
        parsed = null;
      }
    }

    const safe = {
      jobTitle: typeof parsed?.jobTitle === "string" && parsed.jobTitle.trim() ? parsed.jobTitle.trim() : null,
      company: typeof parsed?.company === "string" && parsed.company.trim() ? parsed.company.trim() : null,
      website: typeof parsed?.website === "string" && parsed.website.trim() ? parsed.website.trim() : null,
      location: typeof parsed?.location === "string" && parsed.location.trim() ? parsed.location.trim() : null,
      seniority: typeof parsed?.seniority === "string" && parsed.seniority.trim() ? parsed.seniority.trim() : null,
      keywords: Array.isArray(parsed?.keywords) ? parsed.keywords.filter((k) => typeof k === "string" && k.trim()).slice(0, 12) : [],
    };

    // If model came back empty, fallback
    const isMostlyEmpty =
      !safe.jobTitle && !safe.company && !safe.website && !safe.location && !safe.seniority && safe.keywords.length === 0;

    return {
      status: 200,
      jsonBody: isMostlyEmpty ? fallbackExtract(jobDescription) : {
        jobTitle: safe.jobTitle || "Position",
        company: safe.company || "Company",
        website: safe.website,
        location: safe.location,
        seniority: safe.seniority,
        keywords: safe.keywords,
      },
    };
  } catch (err) {
    context.error("extractJob error:", err);
    return { status: 200, jsonBody: fallbackExtract((await request.text().catch(()=> "")) || "") };
  }
};
