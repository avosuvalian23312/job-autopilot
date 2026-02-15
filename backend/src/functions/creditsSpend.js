"use strict";

const { getSwaUserId } = require("../lib/swaUser");

async function getProfilesContainer() {
  const mod = await import("../lib/cosmosClient.js");
  return mod.profilesContainer;
}

function cors(request) {
  const origin = request?.headers?.get?.("origin");
  const headers = {
    "Access-Control-Allow-Headers": "Content-Type",
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
      monthlyCredits: 15,
      creditsBalance: 15,
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

  const userId = getSwaUserId(request);
  if (!userId) return json(request, 401, { ok: false, error: "Not authenticated" });

  const body = (await safeJson(request)) || {};
  const amount = Number(body.amount || 0);
  const reason = String(body.reason || "usage");
  const idempotencyKey = body.idempotencyKey ? String(body.idempotencyKey) : null;
  const meta = body.meta && typeof body.meta === "object" ? body.meta : null;

  if (!Number.isFinite(amount) || amount <= 0) {
    return json(request, 400, { ok: false, error: "amount must be > 0" });
  }
  if (!idempotencyKey) {
    return json(request, 400, { ok: false, error: "idempotencyKey is required" });
  }

  const c = await getProfilesContainer();

  // 1) Idempotency: if tx exists, return it (NO double-charge)
  try {
    const { resource: existingTx } = await c.item(idempotencyKey, userId).read();
    if (existingTx && existingTx.type === "credit_tx") {
      return json(request, 200, {
        ok: true,
        reused: true,
        balance: existingTx.balanceAfter ?? null,
        tx: existingTx,
      });
    }
  } catch {
    // doesn't exist -> continue
  }

  // 2) Deduct with optimistic concurrency (ETag)
  for (let attempt = 0; attempt < 5; attempt++) {
    const profile = await ensureProfile(c, userId);

    const balance = Number(profile.creditsBalance || 0);
    if (balance < amount) {
      return json(request, 402, {
        ok: false,
        error: "Insufficient credits",
        balance,
        needed: amount,
      });
    }

    const newBalance = balance - amount;
    const now = new Date().toISOString();

    const updatedProfile = {
      ...profile,
      creditsBalance: newBalance,
      updatedAt: now,
    };

    try {
      // Replace profile with ETag check to prevent races
      const { resource: saved } = await c
        .item(profile.id, userId)
        .replace(updatedProfile, {
          accessCondition: { type: "IfMatch", condition: profile._etag },
        });

      // 3) Write transaction log (same container, same partition)
      const tx = {
        id: idempotencyKey,
        userId,
        type: "credit_tx",
        direction: "debit",
        amount,
        reason,
        meta,
        createdAt: now,
        balanceAfter: saved.creditsBalance,
      };

      try {
        await c.items.create(tx);
      } catch (e) {
        // If create fails due to conflict, treat as idempotent success
        // (rare if two requests raced with same idempotencyKey)
      }

      return json(request, 200, {
        ok: true,
        balance: saved.creditsBalance,
        txId: idempotencyKey,
      });
    } catch (e) {
      // 412 = ETag mismatch, retry
      const status = e?.code || e?.statusCode;
      if (status === 412) continue;
      console.error("creditsSpend error:", e);
      return json(request, 500, { ok: false, error: "Failed to spend credits" });
    }
  }

  return json(request, 409, { ok: false, error: "Concurrent update, retry" });
};
