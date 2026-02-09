import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PublicClientApplication } from "@azure/msal-browser";

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) return resolve(true);

    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve(true);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export default function AuthModal({ open, onClose, onComplete }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState("start"); // "start" | "email_code"
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const cfgRef = useRef(null);
  const apiBaseRef = useRef("/api");

  // Google GIS popup
  const googleReadyRef = useRef(false);
  const googleTokenClientRef = useRef(null);

  // Microsoft MSAL popup
  const msalReadyRef = useRef(false);
  const msalRef = useRef(null);

  const loadConfig = async () => {
    if (cfgRef.current) return cfgRef.current;
    const res = await fetch("/config.json", { cache: "no-store" });
    if (!res.ok) throw new Error("Missing /config.json");
    cfgRef.current = await res.json();
    apiBaseRef.current = cfgRef.current?.API_BASE || "/api";
    return cfgRef.current;
  };

  // ---------------------------
  // APP TOKEN EXCHANGE (YOUR backend)
  // ---------------------------
  const exchangeWithBackend = async (payload) => {
    await loadConfig();

    const r = await fetch(`${apiBaseRef.current}/auth/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      body: JSON.stringify(payload),
    });

    const data = await r.json().catch(() => null);

    if (!r.ok || !data?.ok) {
      const msg =
        data?.error ||
        `Auth exchange failed (${r.status})`;
      throw new Error(msg);
    }

   // ✅ ONLY store your backend-issued app JWT.
// Never store generic `data.token` (could be provider token / temp token).
const t = data.appToken;

if (t) {
  // normalize accidental quotes / Bearer prefix
  const clean = String(t).replace(/^Bearer\s+/i, "").replace(/^"|"$/g, "").trim();

  // store under both keys for compatibility across your app
  localStorage.setItem("APP_TOKEN", clean);
  localStorage.setItem("appToken", clean);
}



    return data; // { ok, token?, user? ... }
  };

  // ---------------------------
  // GOOGLE: GIS token popup
  // ---------------------------
  const preloadGoogle = async () => {
    if (googleReadyRef.current) return;

    const cfg = await loadConfig();
    const clientId = (cfg?.GOOGLE_CLIENT_ID || "").trim();

    if (!clientId || clientId.includes("...")) {
      throw new Error("Invalid GOOGLE_CLIENT_ID in /config.json (must be full value, no '...').");
    }

    await loadScriptOnce("https://accounts.google.com/gsi/client");

    if (!window.google?.accounts?.oauth2?.initTokenClient) {
      throw new Error("Google Identity Services failed to load.");
    }

    googleTokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "openid profile email",
      callback: async (resp) => {
        try {
          setErr("");
          setBusy(true);

          if (!resp?.access_token) {
            throw new Error(resp?.error_description || "Google sign-in failed");
          }

          // Get profile (email/name/picture/sub) using the access token
          const u = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: { Authorization: `Bearer ${resp.access_token}` },
          });

          if (!u.ok) throw new Error("Failed to fetch Google profile");

          const profile = await u.json();

          // ✅ EXCHANGE with your backend to get YOUR per-user token (for Stripe/credits/etc)
          const exchanged = await exchangeWithBackend({
            provider: "google",
            email: profile.email,
            providerId: profile.sub || profile.email, // stable unique ID preferred
            // optional: send provider token for server-side verification if you implement it
            providerAccessToken: resp.access_token,
          });

          onComplete?.({
            ok: true,
            provider: "google",
            user: {
              email: profile.email,
              name: profile.name,
              picture: profile.picture,
            },
            exchange: exchanged,
          });

          onClose?.();
        } catch (e) {
          setErr(e?.message || "Google sign-in failed");
        } finally {
          setBusy(false);
        }
      },
    });

    googleReadyRef.current = true;
  };

  const startGoogle = () => {
    try {
      setErr("");
      const tc = googleTokenClientRef.current;
      if (!tc) {
        setErr("Google sign-in not ready yet. Refresh and try again.");
        return;
      }
      // Must be called directly from click handler to avoid popup blocking
      tc.requestAccessToken({ prompt: "select_account" });
    } catch (e) {
      setErr(e?.message || "Google sign-in failed");
    }
  };

  // ---------------------------
  // MICROSOFT: MSAL popup
  // ---------------------------
  const preloadMicrosoft = async () => {
    if (msalReadyRef.current) return;

    const cfg = await loadConfig();

    const clientId = (cfg?.ENTRA_CLIENT_ID || "").trim();
    const authority = (cfg?.ENTRA_AUTHORITY || "https://login.microsoftonline.com/common").trim();
    const redirectUri = (cfg?.ENTRA_REDIRECT_URI || window.location.origin + "/").trim();

    if (!clientId) throw new Error("Missing ENTRA_CLIENT_ID in /config.json");
    if (!authority.startsWith("https://login.microsoftonline.com/")) {
      throw new Error("ENTRA_AUTHORITY must be a login.microsoftonline.com URL");
    }

    const msalInstance = new PublicClientApplication({
      auth: { clientId, authority, redirectUri },
      cache: { cacheLocation: "localStorage", storeAuthStateInCookie: false },
    });

    await msalInstance.initialize();

    msalRef.current = msalInstance;
    msalReadyRef.current = true;
  };

  const startMicrosoft = async () => {
    try {
      setErr("");
      setBusy(true);

      const msal = msalRef.current;
      if (!msal) throw new Error("Microsoft sign-in not ready yet.");

      const loginResp = await msal.loginPopup({
        scopes: ["openid", "profile", "email"],
        prompt: "select_account",
      });

      const account = loginResp?.account || msal.getAllAccounts()?.[0];
      if (!account) throw new Error("No Microsoft account returned.");

      const claims = account.idTokenClaims || {};
      const email =
        account.username ||
        claims.preferred_username ||
        claims.email ||
        "";

      const providerId =
        // AAD usually provides oid (object id) which is stable per tenant
        claims.oid ||
        claims.sub ||
        account.homeAccountId ||
        account.localAccountId ||
        email;

      // ✅ EXCHANGE with your backend to get YOUR per-user token (for Stripe/credits/etc)
      const exchanged = await exchangeWithBackend({
        provider: "microsoft",
        email,
        providerId,
        tenantId: claims.tid || account.tenantId || "",
      });

      onComplete?.({
        ok: true,
        provider: "microsoft",
        user: {
          email,
          name: account.name || "",
          tenantId: claims.tid || account.tenantId || "",
        },
        microsoft: {
          homeAccountId: account.homeAccountId,
          localAccountId: account.localAccountId,
        },
        exchange: exchanged,
      });

      onClose?.();
    } catch (e) {
      setErr(e?.message || "Microsoft sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  // Preload both providers when modal opens so popup won’t be blocked
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!open) return;
      try {
        setErr("");
        await Promise.all([preloadGoogle(), preloadMicrosoft()]);
      } catch (e) {
        if (!cancelled) setErr(e?.message || "Auth setup failed");
      }
    };

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) {
      setEmail("");
      setCode("");
      setStep("start");
      setBusy(false);
      setErr("");
    }
  }, [open]);

  // ---------------------------
  // EMAIL OTP flow
  // ---------------------------
  const startEmail = async () => {
    try {
      setErr("");
      setBusy(true);

      const em = email.trim().toLowerCase();
      if (!em) throw new Error("Enter your email");

      await loadConfig();

      const r = await fetch(`${apiBaseRef.current}/auth/email/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: em }),
      });

      const data = await r.json().catch(() => null);
      if (!r.ok || !data?.ok) throw new Error(data?.error || "Failed to send code");

      setStep("email_code");
    } catch (e) {
      setErr(e?.message || "Email login failed");
    } finally {
      setBusy(false);
    }
  };

  const verifyEmail = async () => {
    try {
      setErr("");
      setBusy(true);

      await loadConfig();

      const em = email.trim().toLowerCase();
      if (!em) throw new Error("Enter your email");
      if (!code.trim()) throw new Error("Enter the code");

      const r = await fetch(`${apiBaseRef.current}/auth/email/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: em, code: code.trim() }),
      });

      const data = await r.json().catch(() => null);
      if (!r.ok || !data?.ok) throw new Error(data?.error || "Invalid code");

      // If verify endpoint already returns a token, keep it
      // If backend returns a token in JSON, store it (cookie-based auth is also fine)
if (data.token) {
  // normalize accidental "Bearer " prefix
  const clean = String(data.token).replace(/^Bearer\s+/i, "").trim();

  // store under both keys so all parts of the app (and your debugging snippet) can find it
  localStorage.setItem("APP_TOKEN", clean);
  localStorage.setItem("appToken", clean);
}


      // Otherwise, exchange to get YOUR token
      const exchanged = await exchangeWithBackend({
        provider: "email",
        email: em,
        providerId: em, // stable enough for email auth
      });

      onComplete?.({ ok: true, provider: "email", exchange: exchanged });
      onClose?.();
    } catch (e) {
      setErr(e?.message || "Verification failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/80 z-50"
            onClick={busy ? undefined : onClose}
          />
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="bg-[#0E0E12] p-8 rounded-2xl max-w-md w-full relative">
              <button
                className="absolute top-4 right-4"
                onClick={onClose}
                disabled={busy}
                aria-label="Close"
              >
                <X />
              </button>

              <h2 className="text-2xl text-white mb-4">Get Started</h2>

              <div className="space-y-3">
                <Button
                  onClick={startMicrosoft}
                  disabled={busy}
                  className="w-full bg-[#1f2937] text-white hover:bg-[#111827]"
                >
                  Continue with Microsoft
                </Button>

                <Button
                  onClick={startGoogle}
                  disabled={busy}
                  className="w-full bg-white text-black hover:bg-white/90"
                >
                  Continue with Google
                </Button>
              </div>

              {/* Optional: keep your email-code login */}
              <div className="mt-4">
                <Input
                  placeholder="Enter your email"
                  value={email}
                  disabled={busy || step === "email_code"}
                  onChange={(e) => setEmail(e.target.value)}
                />

                {step === "start" && (
                  <Button onClick={startEmail} disabled={busy} className="w-full mt-3">
                    <Mail className="mr-2 h-4 w-4" />
                    Send Login Code
                  </Button>
                )}

                {step === "email_code" && (
                  <>
                    <Input
                      placeholder="Enter code"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      className="mt-3"
                    />
                    <Button onClick={verifyEmail} className="w-full mt-3" disabled={busy}>
                      Verify Code
                    </Button>
                  </>
                )}
              </div>

              {err && <div className="mt-4 text-red-400 text-sm">{err}</div>}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
