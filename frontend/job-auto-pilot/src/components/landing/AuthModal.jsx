import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Uses:
 *  - /public/config.json
 *    {
 *      "GOOGLE_CLIENT_ID": "...apps.googleusercontent.com",
 *      "API_BASE": "/api"
 *    }
 *
 * Backend endpoints expected:
 *  POST {API_BASE}/auth/google
 *    body: { credential: "<google_id_token>" }
 *    returns: { ok: true, token: "<app_jwt>", user: {...} }
 *
 *  POST {API_BASE}/auth/email/start
 *    body: { email }
 *    returns: { ok: true }
 *
 *  POST {API_BASE}/auth/email/verify
 *    body: { email, code }
 *    returns: { ok: true, token: "<app_jwt>", user: {...} }
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
  const [step, setStep] = useState("start"); // start | email_code
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const cfgRef = useRef(null);
  const googleReadyRef = useRef(false);

  const apiBase = useMemo(() => cfgRef.current?.API_BASE || "/api", []);

  const loadConfig = async () => {
    if (cfgRef.current) return cfgRef.current;
    const res = await fetch("/config.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`Missing /config.json (HTTP ${res.status})`);
    cfgRef.current = await res.json();
    return cfgRef.current;
  };

  const ensureGoogleReady = async () => {
    if (googleReadyRef.current) return true;

    const cfg = await loadConfig();
    const clientId = cfg.GOOGLE_CLIENT_ID;
    if (!clientId) throw new Error("Missing GOOGLE_CLIENT_ID in /config.json");

    await loadScriptOnce("https://accounts.google.com/gsi/client");

    if (!window.google?.accounts?.id) {
      throw new Error("Google Identity Services failed to load.");
    }

    // Initialize once (popup mode)
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async (resp) => {
        // resp.credential is a Google ID token (JWT)
        try {
          setErr("");
          setBusy(true);

          const r = await fetch(`${cfgRef.current?.API_BASE || "/api"}/auth/google`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ credential: resp.credential })
          });

          const data = await r.json().catch(() => ({}));
          if (!r.ok || !data?.ok) {
            throw new Error(data?.error || "Google login failed (server).");
          }

          // Store token (or you can rely on secure cookie instead)
          if (data.token) localStorage.setItem("APP_TOKEN", data.token);

          onComplete?.(data);
          onClose?.();
        } catch (e) {
          console.error(e);
          setErr(e?.message || "Google login failed.");
        } finally {
          setBusy(false);
        }
      },
      ux_mode: "popup",
      auto_select: false,
      // Helps in browsers moving to FedCM
      use_fedcm_for_prompt: true
    });

    googleReadyRef.current = true;
    return true;
  };

  // Reset modal state when opened/closed
  useEffect(() => {
    if (!open) {
      setEmail("");
      setCode("");
      setStep("start");
      setBusy(false);
      setErr("");
    }
  }, [open]);

  const startGoogle = async () => {
    try {
      setErr("");
      setBusy(true);
      await ensureGoogleReady();

      // This will open Google’s popup / account chooser
      window.google.accounts.id.prompt((notification) => {
        // If popup is blocked or not displayed, show a nicer error
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          setErr("Google popup was blocked or not shown. Allow popups and try again.");
        }
      });
    } catch (e) {
      console.error(e);
      setErr(e?.message || "Google sign-in failed to start.");
    } finally {
      setBusy(false);
    }
  };

  const startEmail = async () => {
    try {
      setErr("");
      setBusy(true);

      const em = email.trim().toLowerCase();
      if (!em) throw new Error("Enter your email first.");

      const cfg = await loadConfig();
      const r = await fetch(`${cfg.API_BASE || "/api"}/auth/email/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: em })
      });

      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.ok) throw new Error(data?.error || "Failed to send code.");

      setStep("email_code");
    } catch (e) {
      console.error(e);
      setErr(e?.message || "Email login failed to start.");
    } finally {
      setBusy(false);
    }
  };

  const verifyEmail = async () => {
    try {
      setErr("");
      setBusy(true);

      const em = email.trim().toLowerCase();
      const c = code.trim();
      if (!em) throw new Error("Missing email.");
      if (!c || c.length < 4) throw new Error("Enter the code you received.");

      const cfg = await loadConfig();
      const r = await fetch(`${cfg.API_BASE || "/api"}/auth/email/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: em, code: c })
      });

      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.ok) throw new Error(data?.error || "Invalid code.");

      if (data.token) localStorage.setItem("APP_TOKEN", data.token);

      onComplete?.(data);
      onClose?.();
    } catch (e) {
      console.error(e);
      setErr(e?.message || "Code verification failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={busy ? undefined : onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-50"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="bg-[#0E0E12] rounded-2xl p-8 max-w-md w-full border border-white/20 relative shadow-2xl">
              <button
                onClick={busy ? undefined : onClose}
                className="absolute top-4 right-4 text-white/40 hover:text-white/70 transition-colors disabled:opacity-40"
                disabled={busy}
              >
                <X className="w-5 h-5" />
              </button>

              <h2 className="text-2xl font-bold text-white mb-2">Get Started</h2>
              <p className="text-white/40 mb-6">Sign up to access your dashboard</p>

              <div className="space-y-3 mb-6">
                <Button
                  onClick={startGoogle}
                  disabled={busy}
                  className="w-full py-6 bg-white hover:bg-white/90 text-gray-900 rounded-xl font-semibold flex items-center justify-center gap-3"
                >
                  {busy ? "Opening Google..." : "Continue with Google"}
                </Button>
              </div>

              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/10"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 bg-[#0E0E12] text-white/30">
                    Or continue with email
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <Input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy || step === "email_code"}
                  className="bg-white/[0.05] border-white/10 text-white placeholder:text-white/40 py-5 rounded-xl focus:border-purple-500/50"
                />

                {step === "start" && (
                  <Button
                    onClick={startEmail}
                    disabled={busy}
                    className="w-full py-6 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-semibold"
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    Send Login Code
                  </Button>
                )}

                {step === "email_code" && (
                  <>
                    <Input
                      type="text"
                      inputMode="numeric"
                      placeholder="Enter the code"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      disabled={busy}
                      className="bg-white/[0.05] border-white/10 text-white placeholder:text-white/40 py-5 rounded-xl focus:border-purple-500/50"
                    />
                    <Button
                      onClick={verifyEmail}
                      disabled={busy}
                      className="w-full py-6 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-semibold"
                    >
                      Verify Code
                    </Button>

                    <button
                      className="text-xs text-white/40 hover:text-white/70"
                      disabled={busy}
                      onClick={() => {
                        setStep("start");
                        setCode("");
                      }}
                    >
                      Change email
                    </button>
                  </>
                )}
              </div>

              {err && (
                <div className="mt-5 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                  {err}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
