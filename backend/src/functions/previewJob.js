// backend/src/functions/previewJob.js
"use strict";

/**
 * Job Autopilot — Preview Generator
 * Returns micro-previews for:
 * - Resume (2 blurred bullets)
 * - Cover letter (first sentence blurred)
 * - Checklist (2 next steps)
 *
 * Uses Azure OpenAI if configured; otherwise falls back to heuristic previews.
 */

function clampStr(x, max = 170) {
  const s = String(x || "").trim();
  if (!s) return "";
  return s.length > max ? s.slice(0, max - 1).trim() + "…" : s;
}

function uniq(arr) {
  return Array.from(
    new Set((arr || []).map((x) => String(x || "").trim()).filter(Boolean))
  );
}

function heuristicPreviews({ jobTitle, company, keywords, studentMode }) {
  const role = jobTitle || "this role";
  const org = company || "the company";
  const ks = uniq(keywords).slice(0, 6);

  const skillHint = ks.length ? ` (${ks.join(", ")})` : "";
  const studentHint = studentMode
    ? "projects, labs, and skills"
    : "experience, ownership, and measurable outcomes";

  return {
    estimatedSeconds: 15,
    resumePreview: {
      bullets: [
        clampStr(
          `Tailored bullets to ${role} at ${org}${skillHint}, emphasizing ATS coverage + impact.`
        ),
        clampStr(
          `Reordered highlights to surface the most relevant ${studentHint} first for recruiter scan.`
        ),
      ],
    },
    coverLetterPreview: {
      firstSentence: clampStr(
        `I’m excited to apply for the ${role} role at ${org} and contribute quickly with reliable execution.`
      ),
    },
    checklistPreview: {
      items: [
        clampStr(
          ks.length
            ? `Ensure top keywords appear in Skills + Experience: ${ks
                .slice(0, 4)
                .join(", ")}.`
            : "Ensure top keywords appear in Skills + Experience sections."
        ),
        clampStr(
          studentMode
            ? "Add 1–2 quantified project outcomes (latency, uptime, automation, tickets)."
            : "Add 1–2 quantified wins (time saved, incidents reduced, SLA improved)."
        ),
      ],
    },
  };
}

async function callAOAI({
  endpoint,
  apiKey,
  deployment,
  apiVersion,
  system,
  user,
  maxTokens = 420,
}) {
  const url =
    `${endpoint.replace(/\/$/, "")}` +
    `/openai/deployments/${encodeURIComponent(deployment)}` +
    `/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;

  const res = await fetch(url, {
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
      temperature: 0.2,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`AOAI preview failed (${res.status}): ${t}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "";
}

function safeParseJSON(content) {
  try {
    return JSON.parse(content);
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(content.slice(start, end + 1));
    }
    return null;
  }
}

module.exports = async function (request, context) {
  try {
    if (request.method === "OPTIONS") return { status: 204 };

    const body = await request.json().catch(() => ({}));

    const jobTitle = String(body?.jobTitle || "").trim();
    const company = String(body?.company || "").trim();
    const aiMode = String(body?.aiMode || "standard").trim();
    const studentMode = !!body?.studentMode;
    const keywords = Array.isArray(body?.keywords) ? body.keywords : [];
    const jobDescription = String(body?.jobDescription || "").trim();

    if (!jobDescription) {
      return { status: 400, jsonBody: { error: "Missing jobDescription" } };
    }

    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
    const apiVersion = "2024-02-15-preview";

    // No AOAI config => heuristic preview
    if (!endpoint || !apiKey || !deployment) {
      return {
        status: 200,
        jsonBody: heuristicPreviews({ jobTitle, company, keywords, studentMode }),
      };
    }

    const system = `
You are Job Autopilot. Generate SHORT micro-previews for an application packet.
Return ONLY valid JSON with EXACT keys:

estimatedSeconds (number),
resumePreview: { bullets: string[] },          // EXACTLY 2 bullets
coverLetterPreview: { firstSentence: string }, // EXACTLY 1 sentence
checklistPreview: { items: string[] }          // EXACTLY 2 items

Rules:
- Keep each bullet/item under 140 characters.
- Do NOT invent credentials, employers, degrees, certifications.
- Be ATS-safe and ethical.
- If studentMode=true, emphasize projects/skills.
- If aiMode="elite", be more aggressive in phrasing but still no fabrication.
- If unsure, keep wording generic.

No markdown, no commentary, no extra keys.
`.trim();

    const user = `
jobTitle: ${jobTitle || "Unknown"}
company: ${company || "Unknown"}
aiMode: ${aiMode}
studentMode: ${studentMode}
keywords: ${uniq(keywords).slice(0, 12).join(", ") || "None"}

JOB DESCRIPTION:
${jobDescription}
`.trim();

    const content = await callAOAI({
      endpoint,
      apiKey,
      deployment,
      apiVersion,
      system,
      user,
    });

    const parsed = safeParseJSON(content);

    const bullets = Array.isArray(parsed?.resumePreview?.bullets)
      ? parsed.resumePreview.bullets
          .filter((x) => typeof x === "string" && x.trim())
          .slice(0, 2)
      : [];

    const items = Array.isArray(parsed?.checklistPreview?.items)
      ? parsed.checklistPreview.items
          .filter((x) => typeof x === "string" && x.trim())
          .slice(0, 2)
      : [];

    const firstSentence =
      typeof parsed?.coverLetterPreview?.firstSentence === "string"
        ? parsed.coverLetterPreview.firstSentence.trim()
        : "";

    const estimatedSeconds =
      typeof parsed?.estimatedSeconds === "number" &&
      Number.isFinite(parsed.estimatedSeconds)
        ? Math.max(5, Math.min(45, Math.round(parsed.estimatedSeconds)))
        : 15;

    // If AI response is malformed, fallback
    if (bullets.length < 2 || items.length < 2 || !firstSentence) {
      return {
        status: 200,
        jsonBody: heuristicPreviews({ jobTitle, company, keywords, studentMode }),
      };
    }

    return {
      status: 200,
      jsonBody: {
        estimatedSeconds,
        resumePreview: { bullets: bullets.map((s) => clampStr(s, 170)) },
        coverLetterPreview: { firstSentence: clampStr(firstSentence, 180) },
        checklistPreview: { items: items.map((s) => clampStr(s, 170)) },
      },
    };
  } catch (err) {
    context.error("previewJob error:", err);
    return {
      status: 200,
      jsonBody: {
        estimatedSeconds: 15,
        resumePreview: {
          bullets: [
            "Tailored resume bullets to the role with ATS keywords + measurable impact.",
            "Reordered key highlights to match the job requirements and recruiter scanning.",
          ],
        },
        coverLetterPreview: {
          firstSentence:
            "I’m excited to apply for this role and contribute quickly with reliable execution.",
        },
        checklistPreview: {
          items: [
            "Ensure core role keywords appear in Skills + Experience sections.",
            "Add 1–2 quantified achievements (time saved, incidents reduced, SLA improved).",
          ],
        },
      },
    };
  }
};
