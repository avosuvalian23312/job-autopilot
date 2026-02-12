"use strict";

function json(status, body, extraHeaders = {}) {
  return {
    status,
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify(body ?? {}),
  };
}

function noContent() {
  return { status: 204 };
}

async function readJson(request) {
  try {
    const raw = await request.text();
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

module.exports = { json, noContent, readJson };
