import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * IMPORTANT:
 * In /config.json, GOOGLE_CLIENT_ID MUST be the FULL value (no "..." anywhere),
 * e.g. "811442229724-xxxxx.apps.googleusercontent.com"
 * If it's truncated/has "...", Google will throw "The given client ID is not found."
 */

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
  const [step, setStep] = useState("start");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const cfgRef = useRef(null);
  const apiBaseRef = useRef("/api");

  // Google popup (OAuth token client)
  const googleReadyRef = useRef(false);
  const tokenClientRef = useRef(null);

  const loadConfig = async () => {
    if (cfgRef.current) return cfgRef.current;
    const res = await fetch("/config.json", { cache: "no-store" });
    if (!res.ok) throw new Error("Missing /config.json");
    cfgRef.current = await res.json();
    apiBaseRef.current = cfgRef.current?.API_BASE || "/api";
    return cfgRef.current;
  };

  const preloadGoogle = async () => {
    if (googleReadyRef.current) return;

    const cfg = await loadConfig();
    const clientId = (cfg?.GOOGLE_CLIENT_ID || "").trim();

    if (!clientId || clientId.includes("...")) {
      throw new Error(
        "Invalid GOOGLE_CLIENT_ID in /config.json. Paste the full client ID (no '...')."
      );
    }

    await loadScriptOnce("https://accounts.google.com/gsi/client");

    if (!window.google?.accounts?.oauth2?.initTokenClient) {
      throw new Error("Google Identity Services failed to load");
    }

    tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      // Keep this minimal; we fetch userinfo after token is returned
      scope: "openid profile email",
      callback: async (resp) => {
        try {
          setErr("");
          setBusy(true);

          if (!resp?.access_token) {
            throw new Error(resp?.error_description || "Google sign-in failed");
          }

          // Get profile (email/name/picture) using the access token
          const u = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: { Authorization: `Bearer ${resp.access_token}` }
          });

          if (!u.ok) {
            throw new Error("Failed to fetch Google profile");
          }

          const profile = await u.json();

          // If you have a backend that issues your own app token, try to exchange:
          // (Optional: if endpoint doesn't exist, we still proceed with profile)
          let appData = null;
          try {
            const r = await fetch(`${apiBaseRef.current}/auth/google/token`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                access_token: resp.access_token,
                profile
              })
            });
            const data = await r.json().catch(() => null);
            if (r.ok && data?.ok) appData = data;
          } catch {
            // ignore
          }

          const payload =
            appData ||
            ({
              ok: true,
              provider: "google",
              user: profile,
              access_token: resp.access_token
            });

          // If your backend returned a token, store it
          if (payload?.token) {
            localStorage.setItem("APP_TOKEN", payload.token);
          }

          onComplete?.(payload);
          onClose?.();
        } catch (e) {
          setErr(e?.message || "Google sign-in failed");
        } finally {
          setBusy(false);
        }
      }
    });

    googleReadyRef.current = true;
  };

  // Preload GIS so the click can open a popup immediately (avoids popup blockers)
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!open) return;
      try {
        setErr("");
        await preloadGoogle();
      } catch (e) {
        if (!cancelled) setErr(e?.message || "Google sign-in setup failed");
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

  const startGoogle = () => {
    try {
      setErr("");

      const tc = tokenClientRef.current;
      if (!tc) {
        setErr("Google sign-in is not ready yet. Refresh and try again.");
        return;
      }

      // MUST be called directly from the click handler to avoid popup blocking
      tc.requestAccessToken({
        prompt: "select_account" // change to "consent" if you always want consent screen
      });
    } catch (e) {
      setErr(e?.message || "Google sign-in failed");
    }
  };

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
        body: JSON.stringify({ email: em })
      });

      const data = await r.json();
      if (!r.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to send code");
      }

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

      const r = await fetch(`${apiBaseRef.current}/auth/email/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code })
      });

      const data = await r.json();
      if (!r.ok || !data?.ok) {
        throw new Error(data?.error || "Invalid code");
      }

      if (data.token) {
        localStorage.setItem("APP_TOKEN", data.token);
      }

      onComplete?.(data);
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

              <Button
                onClick={startGoogle}
                disabled={busy}
                className="w-full mb-4 bg-white text-black hover:bg-white/90"
              >
                Continue with Google
              </Button>

              <Input
                placeholder="Enter your email"
                value={email}
                disabled={busy || step === "email_code"}
                onChange={(e) => setEmail(e.target.value)}
              />

              {step === "start" && (
                <Button
                  onClick={startEmail}
                  disabled={busy}
                  className="w-full mt-3"
                >
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

              {err && <div className="mt-4 text-red-400 text-sm">{err}</div>}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
