"use strict";

const { json, noContent, readJson } = require("../lib/http");
const { requireUser } = require("../lib/swaAuth");
const { getContainer } = require("../lib/cosmosClient");

const SETTINGS_CONTAINER = process.env.COSMOS_CONTAINER_SETTINGS || "userSettings";

/**
 * Data model (recommended):
 * id = userId
 * partitionKey = userId
 * {
 *   id, userId,
 *   profile: { fullName, email, phone, location },
 *   links: { linkedin, portfolio },
 *   prefs: { targetRoles, seniority, locationPreference, preferredCity, tone },
 *   updatedAt
 * }
 */
module.exports = async function settingsHandler(request, context) {
  if (request.method === "OPTIONS") return noContent();

  const user = requireUser(request);
  if (!user) return json(401, { ok: false, error: "Unauthorized" });

  const container = getContainer(SETTINGS_CONTAINER);
  const id = user.userId;

  // GET /api/settings
  if (request.method === "GET") {
    try {
      const { resource } = await container.item(id, id).read();
      return json(200, { ok: true, settings: resource || null });
    } catch (e) {
      // If not found, return ok with null
      const code = e?.code || e?.statusCode;
      if (code === 404) return json(200, { ok: true, settings: null });
      context?.log?.error("settings GET error:", e);
      return json(500, { ok: false, error: "Failed to load settings" });
    }
  }

  // POST /api/settings
  if (request.method === "POST") {
    const body = await readJson(request);

    const profile = body?.profile || {};
    const links = body?.links || {};
    const prefs = body?.prefs || {};

    const doc = {
      id,
      userId: id,
      profile: {
        fullName: String(profile.fullName || ""),
        email: String(profile.email || ""),
        phone: String(profile.phone || ""),
        location: String(profile.location || ""),
      },
      links: {
        linkedin: String(links.linkedin || ""),
        portfolio: String(links.portfolio || ""),
      },
      prefs: {
        targetRoles: Array.isArray(prefs.targetRoles) ? prefs.targetRoles : [],
        seniority: String(prefs.seniority || ""),
        locationPreference: String(prefs.locationPreference || ""),
        preferredCity: String(prefs.preferredCity || ""),
        tone: String(prefs.tone || "Professional"),
      },
      updatedAt: new Date().toISOString(),
    };

    try {
      // Upsert = create if missing, update if exists
      await container.items.upsert(doc, { partitionKey: id });
      return json(200, { ok: true });
    } catch (e) {
      context?.log?.error("settings POST error:", e);
      return json(500, { ok: false, error: "Failed to save settings" });
    }
  }

  return json(405, { ok: false, error: "Method not allowed" });
};
module.exports = { settingsGet };