import React, { useEffect, useMemo, useState } from "react";
import { PublicClientApplication, EventType } from "@azure/msal-browser";

/**
 * Reads /config.json from your Static Web App:
 * {
 *  "TENANT_ID": "...",
 *  "CLIENT_ID": "...",
 *  "AUTHORITY": "https://jobautopilotext.ciamlogin.com",
 *  "KNOWN_AUTHORITIES": ["jobautopilotext.ciamlogin.com"],
 *  "USER_FLOW": "signup_signin",
 *  "REDIRECT_URI": "https://red-beach-033073710.4.azurestaticapps.net",
 *  "SCOPES": ["openid","profile","email"]
 * }
 */

async function loadConfig() {
  const res = await fetch("/config.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load /config.json (${res.status})`);
  return res.json();
}

// IMPORTANT: For CIAM External ID, authority should be:
//   https://<tenant>.ciamlogin.com/<TENANT_ID>
// and the user flow is typically passed via ?p=<USER_FLOW>
function buildAuthority(authorityBase, tenantId) {
  const base = String(authorityBase || "").replace(/\/+$/, "");
  const tid = String(tenantId || "").trim();
  return `${base}/${tid}`;
}

export default function AuthModal({ open, onClose, onSignedIn }) {
  const [cfg, setCfg] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    loadConfig()
      .then((c) => alive && setCfg(c))
      .catch((e) => alive && setErr(String(e?.message || e)));
    return () => {
      alive = false;
    };
  }, []);

  const msal = useMemo(() => {
    if (!cfg) return null;

    const authority = buildAuthority(cfg.AUTHORITY, cfg.TENANT_ID);

    const msalConfig = {
      auth: {
        clientId: cfg.CLIENT_ID,
        authority,
        knownAuthorities: cfg.KNOWN_AUTHORITIES || [],
        redirectUri: cfg.REDIRECT_URI,
        navigateToLoginRequestUrl: false
      },
      cache: {
        cacheLocation: "localStorage",
        storeAuthStateInCookie: false
      },
      system: {
        // Keep MSAL quiet unless debugging
        loggerOptions: {
          piiLoggingEnabled: false
        }
      }
    };

    const instance = new PublicClientApplication(msalConfig);

    // If MSAL returns and sets an account, notify app
    instance.addEventCallback((event) => {
      if (event.eventType === EventType.LOGIN_SUCCESS && event.payload?.account) {
        onSignedIn?.(event.payload.account);
      }
    });

    return instance;
  }, [cfg, onSignedIn]);

  useEffect(() => {
    if (!msal) return;
    // Handle redirect responses once, on load
    msal
      .handleRedirectPromise()
      .then((result) => {
        if (result?.account) onSignedIn?.(result.account);
      })
      .catch((e) => setErr(String(e?.message || e)));
  }, [msal, onSignedIn]);

  if (!open) return null;

  const login = async (mode) => {
    if (!msal || !cfg) return;

    setErr("");
    setBusy(true);

    const baseRequest = {
      scopes: cfg.SCOPES || ["openid", "profile", "email"],
      // CIAM user flow passed as "p"
      extraQueryParameters: {
        p: cfg.USER_FLOW
      }
    };

    // Try to go straight to Google picker (if CIAM honors idp)
    if (mode === "google") {
      baseRequest.extraQueryParameters.idp = "google";
      // Optional: force account selection
      baseRequest.prompt = "select_account";
    }

    try {
      await msal.loginRedirect(baseRequest);
    } catch (e) {
      setErr(String(e?.message || e));
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 420,
          maxWidth: "90vw",
          background: "#111",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 16,
          padding: 18,
          boxShadow: "0 20px 80px rgba(0,0,0,0.6)",
          color: "#fff"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Get Started</div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(255,255,255,0.7)",
              fontSize: 18,
              cursor: "pointer"
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div style={{ marginTop: 6, color: "rgba(255,255,255,0.7)", fontSize: 13 }}>
          Sign up to access your dashboard.
        </div>

        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          <button
            disabled={!cfg || busy}
            onClick={() => login("google")}
            style={{
              height: 44,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              background: busy ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
              color: "#fff",
              cursor: busy ? "not-allowed" : "pointer",
              fontWeight: 600
            }}
          >
            {busy ? "Opening Google..." : "Continue with Google"}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 10, opacity: 0.75 }}>
            <div style={{ height: 1, flex: 1, background: "rgba(255,255,255,0.12)" }} />
            <div style={{ fontSize: 12 }}>Or continue with email</div>
            <div style={{ height: 1, flex: 1, background: "rgba(255,255,255,0.12)" }} />
          </div>

          <button
            disabled={!cfg || busy}
            onClick={() => login("email")}
            style={{
              height: 44,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(128,90,213,0.85)",
              color: "#fff",
              cursor: busy ? "not-allowed" : "pointer",
              fontWeight: 700
            }}
          >
            Continue with Email
          </button>

          {!!err && (
            <div
              style={{
                marginTop: 6,
                padding: 10,
                borderRadius: 12,
                background: "rgba(255,0,0,0.12)",
                border: "1px solid rgba(255,0,0,0.25)",
                color: "rgba(255,255,255,0.9)",
                fontSize: 12,
                whiteSpace: "pre-wrap"
              }}
            >
              {err}
            </div>
          )}

          {!cfg && !err && (
            <div style={{ marginTop: 6, color: "rgba(255,255,255,0.7)", fontSize: 12 }}>
              Loading auth config…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
