"use strict";

/**
 * Shared Azure OpenAI chat helper (SWA backend, Node 18+ fetch).
 */

function getAoaiConfig() {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview";

  return { endpoint, apiKey, deployment, apiVersion };
}

function buildAoaiUrl({ endpoint, deployment, apiVersion }) {
  return (
    `${String(endpoint || "").replace(/\/$/, "")}` +
    `/openai/deployments/${encodeURIComponent(deployment)}` +
    `/chat/completions?api-version=${encodeURIComponent(apiVersion)}`
  );
}

async function callAoaiChat({
  system,
  user,
  temperature = 0.1,
  max_tokens = 900,
}) {
  const cfg = getAoaiConfig();
  if (!cfg.endpoint || !cfg.apiKey || !cfg.deployment) {
    const missing = [
      !cfg.endpoint ? "AZURE_OPENAI_ENDPOINT" : null,
      !cfg.apiKey ? "AZURE_OPENAI_API_KEY" : null,
      !cfg.deployment ? "AZURE_OPENAI_DEPLOYMENT" : null,
    ].filter(Boolean);
    const err = new Error(`Azure OpenAI not configured. Missing: ${missing.join(", ")}`);
    err.code = "AOAI_NOT_CONFIGURED";
    throw err;
  }

  const url = buildAoaiUrl(cfg);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": cfg.apiKey,
    },
    body: JSON.stringify({
      messages: [
        { role: "system", content: String(system || "") },
        { role: "user", content: String(user || "") },
      ],
      temperature,
      max_tokens,
    }),
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    const err = new Error(`AOAI HTTP ${res.status}: ${text.slice(0, 500)}`);
    err.code = "AOAI_HTTP_ERROR";
    err.status = res.status;
    throw err;
  }

  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  const content =
    json?.choices?.[0]?.message?.content ??
    "";

  return { raw: json, content };
}

function safeJsonParse(maybeJsonText) {
  const s = String(maybeJsonText || "");
  if (!s.trim()) return null;

  try {
    return JSON.parse(s);
  } catch {
    // Try to slice first {...} block
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(s.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

module.exports = { callAoaiChat, safeJsonParse };
