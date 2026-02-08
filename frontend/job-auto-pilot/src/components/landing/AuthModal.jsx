import React, { useEffect, useMemo, useState } from "react";

/**
 * AuthModal.jsx
 * - Google button: redirects directly to Google (skips the Microsoft email screen) using Entra External ID
 *   by adding `idp=Google` (and domain_hint=google.com) on the /authorize URL.
 * - Email button: starts the same Entra External ID user flow without forcing an IdP (so users can use Email).
 *
 * IMPORTANT:
 * - This uses Entra External ID (CIAM). You do NOT put any Google client secret in the frontend.
 * - This only starts the auth redirect. Your app still needs to handle the returned `code` and exchange it
 *   for tokens (or use MSAL). This file focuses on fixing the “Google should go straight to Google picker” UX.
 */

function base64UrlEncode(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function sha256Base64Url(input) {
  const enc = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", enc);
  return base64UrlEncode(hash);
}

function randomString(length = 64) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, (x) => chars[x % chars.length]).join("");
}

export default function AuthModal({ open, onClose }) {
  const [config, setConfig] = useState(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Load config.json (served from the same origin)
  useEffect(() => {
    if (!open) return;
    setError("");
    setBusy(false);

    fetch("/config.json", { cache: "no-store" })
      .then((r) => r.json())
      .then((c) => setConfig(c))
      .catch((e) => setError("Failed to load /config.json: " + (e?.message || String(e))));
  }, [open]);

  const scopes = useMemo(() => {
    if (!config?.SCOPES?.length) return "openid profile email";
    return config.SCOPES.join(" ");
  }, [config]);

  async function startAuth({ forceGoogle, loginHint } = {}) {
    if (!config?.AUTHORITY || !config?.CLIENT_ID || !config?.REDIRECT_URI) {
      setError("Missing AUTHORITY / CLIENT_ID / REDIRECT_URI in config.json");
      return;
    }

    setBusy(true);
    setError("");

    try {
      // PKCE
      const verifier = randomString(64);
      const challenge = await sha256Base64Url(verifier);

      // store verifier for your token exchange step after redirect
      sessionStorage.setItem("pkce_code_verifier", verifier);

      const params = new URLSearchParams({
        client_id: config.CLIENT_ID,
        redirect_uri: config.REDIRECT_URI,
        response_type: "code",
        response_mode: "query",
        scope: scopes,
        nonce: randomString(16),
        code_challenge_method: "S256",
        code_challenge: challenge,
        prompt: "login",
      });

      if (loginHint) params.set("login_hint", loginHint);

      // Force direct Google redirect (skip the Microsoft email input screen)
      // Source: idp parameter works for Entra External ID federated auth flows
      // (commonly used as &idp=Google and optionally domain_hint=google.com)
      if (forceGoogle) {
        params.set("domain_hint", "google.com");
        params.set("idp", "Google");
      }

      const authority = config.AUTHORITY.replace(/\/+$/, "");
      const authUrl = `${authority}/oauth2/v2.0/authorize?${params.toString()}`;

      window.location.assign(authUrl);
    } catch (e) {
      setError(e?.message || String(e));
      setBusy(false);
    }
  }

  function onGoogle() {
    startAuth({ forceGoogle: true });
  }

  function onEmail() {
    const hint = email?.trim() ? email.trim() : undefined;
    startAuth({ forceGoogle: false, loginHint: hint });
  }

  if (!open) return null;

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.headerRow}>
          <div>
            <div style={styles.title}>Get Started</div>
            <div style={styles.subTitle}>Sign up to access your dashboard</div>
          </div>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <button style={{ ...styles.primaryBtn, opacity: busy ? 0.7 : 1 }} onClick={onGoogle} disabled={busy}>
          {busy ? "Opening Google…" : "Continue with Google"}
        </button>

        <div style={styles.dividerRow}>
          <div style={styles.divider} />
          <div style={styles.dividerText}>Or continue with email</div>
          <div style={styles.divider} />
        </div>

        <div style={styles.inputRow}>
          <span style={styles.mailIcon}>✉</span>
          <input
            style={styles.input}
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />
        </div>

        <button style={{ ...styles.emailBtn, opacity: busy ? 0.7 : 1 }} onClick={onEmail} disabled={busy}>
          Continue with Email
        </button>

        {error ? <div style={styles.errorBox}>{error}</div> : null}

        <div style={styles.hint}>
          Tip: Google uses a small “account chooser” popup sometimes — that’s normal and controlled by Google/Chrome.
        </div>
      </div>
    </div>
  );
}

const styles = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    padding: 20,
  },
  modal: {
    width: 420,
    maxWidth: "100%",
    background: "rgba(15, 17, 25, 0.92)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 16,
    padding: 18,
    boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
    color: "#fff",
    backdropFilter: "blur(14px)",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
  },
  title: { fontSize: 22, fontWeight: 700 },
  subTitle: { fontSize: 13, opacity: 0.75, marginTop: 4 },
  closeBtn: {
    border: "none",
    background: "transparent",
    color: "rgba(255,255,255,0.8)",
    fontSize: 22,
    cursor: "pointer",
    lineHeight: 1,
    padding: "2px 8px",
  },
  primaryBtn: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.10)",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 650,
    marginBottom: 12,
  },
  dividerRow: { display: "flex", alignItems: "center", gap: 10, margin: "10px 0 12px" },
  divider: { flex: 1, height: 1, background: "rgba(255,255,255,0.12)" },
  dividerText: { fontSize: 12, opacity: 0.7, whiteSpace: "nowrap" },
  inputRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.06)",
  },
  mailIcon: { opacity: 0.7 },
  input: {
    width: "100%",
    background: "transparent",
    border: "none",
    outline: "none",
    color: "#fff",
    fontSize: 14,
  },
  emailBtn: {
    width: "100%",
    marginTop: 12,
    padding: "12px 14px",
    borderRadius: 12,
    border: "none",
    background: "rgba(141, 53, 255, 0.85)",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 700,
  },
  errorBox: {
    marginTop: 12,
    padding: 10,
    borderRadius: 12,
    background: "rgba(255, 60, 60, 0.14)",
    border: "1px solid rgba(255, 60, 60, 0.28)",
    fontSize: 12,
    lineHeight: 1.35,
  },
  hint: { marginTop: 12, fontSize: 12, opacity: 0.65, lineHeight: 1.35 },
};
