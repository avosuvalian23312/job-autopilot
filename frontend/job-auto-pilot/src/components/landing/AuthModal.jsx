import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  const googleReadyRef = useRef(false);

  const apiBase = useMemo(() => cfgRef.current?.API_BASE || "/api", []);

  const loadConfig = async () => {
    if (cfgRef.current) return cfgRef.current;
    const res = await fetch("/config.json", { cache: "no-store" });
    if (!res.ok) throw new Error("Missing /config.json");
    cfgRef.current = await res.json();
    return cfgRef.current;
  };

  const ensureGoogleReady = async () => {
    if (googleReadyRef.current) return;

    const cfg = await loadConfig();
    if (!cfg.GOOGLE_CLIENT_ID) {
      throw new Error("Missing GOOGLE_CLIENT_ID");
    }

    await loadScriptOnce("https://accounts.google.com/gsi/client");

    if (!window.google?.accounts?.id) {
      throw new Error("Google Identity Services failed to load");
    }

    window.google.accounts.id.initialize({
      client_id: cfg.GOOGLE_CLIENT_ID,
      ux_mode: "popup",

      // 🔴 FIX: Disable FedCM to stop popup rejection
      use_fedcm_for_prompt: false,

      callback: async (resp) => {
        try {
          setErr("");
          setBusy(true);

          const r = await fetch(`${apiBase}/auth/google`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ credential: resp.credential })
          });

          const data = await r.json();
          if (!r.ok || !data?.ok) {
            throw new Error(data?.error || "Google login failed");
          }

          if (data.token) {
            localStorage.setItem("APP_TOKEN", data.token);
          }

          onComplete?.(data);
          onClose?.();
        } catch (e) {
          setErr(e.message || "Google login failed");
        } finally {
          setBusy(false);
        }
      }
    });

    googleReadyRef.current = true;
  };

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
      await ensureGoogleReady();

      window.google.accounts.id.prompt((n) => {
        if (n.isNotDisplayed() || n.isSkippedMoment()) {
          setErr("Google popup was blocked. Allow popups and try again.");
        }
      });
    } catch (e) {
      setErr(e.message || "Google sign-in failed");
    }
  };

  const startEmail = async () => {
    try {
      setErr("");
      setBusy(true);

      const em = email.trim().toLowerCase();
      if (!em) throw new Error("Enter your email");

      const r = await fetch(`${apiBase}/auth/email/start`, {
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
      setErr(e.message || "Email login failed");
    } finally {
      setBusy(false);
    }
  };

  const verifyEmail = async () => {
    try {
      setErr("");
      setBusy(true);

      const r = await fetch(`${apiBase}/auth/email/verify`, {
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
      setErr(e.message || "Verification failed");
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
              >
                <X />
              </button>

              <h2 className="text-2xl text-white mb-4">Get Started</h2>

              <Button
                onClick={startGoogle}
                disabled={busy}
                className="w-full mb-4 bg-white text-black"
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
                  <Button onClick={verifyEmail} className="w-full mt-3">
                    Verify Code
                  </Button>
                </>
              )}

              {err && (
                <div className="mt-4 text-red-400 text-sm">{err}</div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
