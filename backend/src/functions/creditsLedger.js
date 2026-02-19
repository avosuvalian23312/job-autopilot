"use strict";

const { getSwaUserId } = require("../lib/swaUser");

async function getProfilesContainer() {
  const mod = require("../lib/cosmosClient.cjs");
  return mod.profilesContainer;
}

function cors(request) {
  const origin = request?.headers?.get?.("origin");
  const headers = {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
    headers["Vary"] = "Origin";
  } else {
    headers["Access-Control-Allow-Origin"] = "*";
  }
  return headers;
}

function json(request, status, body) {
  return {
    status,
    headers: { ...cors(request), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

module.exports = async (request) => {
  if (request.method === "OPTIONS") return { status: 204, headers: cors(request) };

  const userId = getSwaUserId(request);
  if (!userId) return json(request, 401, { ok: false, error: "Not authenticated" });

  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") || 50)));

  const c = await getProfilesContainer();

  const query = {
    query:
      "SELECT TOP @limit * FROM c WHERE c.userId = @userId AND c.type = 'credit_tx' ORDER BY c.createdAt DESC",
    parameters: [
      { name: "@userId", value: userId },
      { name: "@limit", value: limit },
    ],
  };

  const { resources } = await c.items.query(query, { partitionKey: userId }).fetchAll();

  return json(request, 200, { ok: true, items: resources || [] });
};
