"use strict";

const { getSwaUserId } = require("../lib/swaUser");

async function getProfilesContainer() {
  const mod = require("../lib/cosmosClient.cjs");
  return mod.profilesContainer;
}

function cors(request) {
  const origin = request?.headers?.get?.("origin");
  const headers = {
    "Access-Control-Allow-Headers": "Content-Type, x-admin-secret",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
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

async function safeJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function ensureProfile(c, userId) {
  try {
    const { resource } = await c.item(userId, userId).read();
    return resource;
  } catch {
    const now = new Date().toISOString();
    const profile = {
      id: userId,
      userId,
      type: "profile",
      plan: "free",
      monthlyCredits: 10,
      creditsBalance: 0,
      pricingDone: false,
      setupDone: false,
      createdAt: now,
      updatedAt: now,
    };
    await c.items.upsert(profile);
    return profile;
  }
}

module.exports = async (request) => {
  if (request.method === "OPTIONS") return { status: 204, headers: cors(request) };

  const secret = request.headers.get("x-admin-secret");
  if (!secret || secret !== process.env.CREDITS_ADMIN_SECRET) {
    return json(request, 401, { ok: false, error: "Unauthorized" });
  }

  const body = (await safeJson(request)) || {};
  const amount = Number(body.amount || 0);
  const reason = String(body.reason || "grant");
  const idempotencyKey = body.idempotencyKey ? String(body.idempotencyKey) : null;
  const meta = body.meta && typeof body.meta === "object" ? body.meta : null;

  // allow granting to arbitrary userId (webhook will pass it)
  const targetUserId = body.userId ? String(body.userId) : getSwaUserId(request);
  if (!targetUserId) return json(request, 400, { ok: false, error: "userId required" });

  if (!Number.isFinite(amount) || amount <= 0) {
    return json(request, 400, { ok: false, error: "amount must be > 0" });
  }
  if (!idempotencyKey) {
    return json(request, 400, { ok: false, error: "idempotencyKey is required" });
  }

  const c = await getProfilesContainer();

  // Idempotency: already granted?
  try {
    const { resource: existingTx } = await c.item(idempotencyKey, targetUserId).read();
    if (existingTx && existingTx.type === "credit_tx") {
      return json(request, 200, {
        ok: true,
        reused: true,
        balance: existingTx.balanceAfter ?? null,
        tx: existingTx,
      });
    }
  } catch {}

  for (let attempt = 0; attempt < 5; attempt++) {
    const profile = await ensureProfile(c, targetUserId);
    const balance = Number(profile.creditsBalance || 0);
    const newBalance = balance + amount;
    const now = new Date().toISOString();

    const updatedProfile = { ...profile, creditsBalance: newBalance, updatedAt: now };

    try {
      const { resource: saved } = await c
        .item(profile.id, targetUserId)
        .replace(updatedProfile, {
          accessCondition: { type: "IfMatch", condition: profile._etag },
        });

      const tx = {
        id: idempotencyKey,
        userId: targetUserId,
        type: "credit_tx",
        direction: "credit",
        amount,
        reason,
        meta,
        createdAt: now,
        balanceAfter: saved.creditsBalance,
      };

      try {
        await c.items.create(tx);
      } catch {}

      return json(request, 200, {
        ok: true,
        balance: saved.creditsBalance,
        txId: idempotencyKey,
      });
    } catch (e) {
      const status = e?.code || e?.statusCode;
      if (status === 412) continue;
      console.error("creditsGrant error:", e);
      return json(request, 500, { ok: false, error: "Failed to grant credits" });
    }
  }

  return json(request, 409, { ok: false, error: "Concurrent update, retry" });
};
