// src/components/landing/AuthModal.jsx
import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clearAppToken, setAppToken } from "@/lib/appSession";

function swaLogin(provider, redirectPath, extraParams = {}) {
  const path =
    redirectPath ||
    `${window.location.pathname}${window.location.search}${window.location.hash}`;

  const safe = path && path.startsWith("/") ? path : "/";
  const query = new URLSearchParams({
    post_login_redirect_uri: safe,
  });

  Object.entries(extraParams || {}).forEach(([key, value]) => {
    if (value == null) return;
    const v = String(value).trim();
    if (!v) return;
    query.set(key, v);
  });

  window.location.href = `/.auth/login/${encodeURIComponent(provider)}?${query.toString()}`;
}

async function postJson(path, body) {
  const res = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });

  const text = await res.text().catch(() => "");
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}

export default function AuthModal({ open, onClose, onComplete }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState("start"); // start | verify
  const [challengeToken, setChallengeToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  const AFTER_LOGIN_PATH = "/";
  const MICROSOFT_PROVIDER =
    import.meta.env.VITE_SWA_MICROSOFT_PROVIDER || "microsoft";

  const GOOGLE_LOGO = "/logos/google-logo-9808.png";
  const MICROSOFT_LOGO = "/logos/64px-Microsoft_logo.svg.png";

  const [pulse, setPulse] = useState(0);
  const pulseTimer = useRef(null);

  const triggerPulse = () => {
    setPulse((p) => p + 1);
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
  };

  useEffect(() => {
    if (open) {
      setErr("");
      setInfo("");
      setBusy(false);
      setEmail("");
      setCode("");
      setStep("start");
      setChallengeToken("");
      triggerPulse();
    }
    return () => {
      if (pulseTimer.current) clearTimeout(pulseTimer.current);
    };
  }, [open]);

  const startGoogle = async () => {
    if (busy) return;
    setErr("");
    setInfo("");
    clearAppToken();
    setBusy(true);
    triggerPulse();

    try {
      onComplete?.({ provider: "google" });
    } catch {
      // ignore
    }

    setTimeout(() => {
      swaLogin("google", AFTER_LOGIN_PATH);
    }, 220);
  };

  const startMicrosoft = async () => {
    if (busy) return;
    setErr("");
    setInfo("");
    clearAppToken();
    setBusy(true);
    triggerPulse();

    try {
      onComplete?.({ provider: "microsoft" });
    } catch {
      // ignore
    }

    setTimeout(() => {
      swaLogin(MICROSOFT_PROVIDER, AFTER_LOGIN_PATH);
    }, 220);
  };

  const startEmail = async () => {
    if (busy) return;
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setErr("Enter a valid email address.");
      return;
    }

    setErr("");
    setInfo("");
    setBusy(true);
    triggerPulse();

    try {
      const res = await postJson("/api/verify/email-login", {
        action: "send_code",
        email: normalizedEmail,
      });

      if (!res.ok || !res.data?.challengeToken) {
        setErr(res.data?.error || "Could not send login code.");
        return;
      }

      setChallengeToken(String(res.data.challengeToken));
      setStep("verify");
      const debugCode = String(res.data?.debugCode || "").trim();
      setInfo(
        debugCode
          ? `Code sent to ${res.data?.maskedEmail || normalizedEmail}. Debug code: ${debugCode}`
          : `Code sent to ${res.data?.maskedEmail || normalizedEmail}.`
      );
    } catch {
      setErr("Could not send login code.");
    } finally {
      setBusy(false);
    }
  };

  const verifyEmailCode = async () => {
    if (busy) return;
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedCode = String(code || "").trim();

    if (!normalizedCode) {
      setErr("Enter the 6-digit code.");
      return;
    }
    if (!challengeToken) {
      setErr("Session expired. Please request a new code.");
      setStep("start");
      return;
    }

    setErr("");
    setInfo("");
    setBusy(true);
    triggerPulse();

    try {
      const res = await postJson("/api/verify/email-login", {
        action: "verify_code",
        email: normalizedEmail,
        code: normalizedCode,
        challengeToken,
      });

      if (!res.ok || !res.data?.appToken) {
        setErr(res.data?.error || "Invalid code.");
        return;
      }

      const saved = setAppToken(String(res.data.appToken));
      if (!saved) {
        setErr("Sign-in token was invalid. Please request a new code.");
        return;
      }
      try {
        onComplete?.({ provider: "email" });
      } catch {
        // ignore
      }
      window.location.assign(AFTER_LOGIN_PATH);
    } catch {
      setErr("Could not verify code.");
    } finally {
      setBusy(false);
    }
  };

  const overlayVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
    exit: { opacity: 0 },
  };

  const modalVariants = {
    hidden: { opacity: 0, scale: 0.92, y: 10, filter: "blur(3px)" },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      filter: "blur(0px)",
      transition: { type: "spring", stiffness: 420, damping: 28 },
    },
    exit: {
      opacity: 0,
      scale: 0.96,
      y: 8,
      filter: "blur(2px)",
      transition: { duration: 0.16 },
    },
  };

  const pulseKeyframes = {
    scale: [1, 1.03, 0.995, 1],
    transition: { duration: 0.32, ease: "easeOut" },
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/80 z-50"
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={busy ? undefined : onClose}
          />

          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              key={`auth-modal-${pulse}`}
              variants={modalVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              whileHover={!busy ? { scale: 1.005 } : undefined}
              {...(pulse > 0 ? { animate: ["visible", pulseKeyframes] } : {})}
              className="bg-[#0E0E12] p-8 rounded-2xl max-w-md w-full relative border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.55)]"
            >
              <div className="pointer-events-none absolute inset-0 rounded-2xl">
                <div className="absolute -top-10 -left-10 h-24 w-24 rounded-full bg-purple-500/20 blur-2xl" />
                <div className="absolute -bottom-10 -right-10 h-24 w-24 rounded-full bg-cyan-400/10 blur-2xl" />
              </div>

              <button
                className="absolute top-4 right-4 text-white/70 hover:text-white transition"
                onClick={busy ? undefined : onClose}
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="relative">
                <h2 className="text-2xl font-bold text-white mb-2">Sign in</h2>
                <p className="text-white/70 mb-6">
                  Choose a provider to continue.
                </p>

                <div className="space-y-3">
                  <Button
                    onClick={startGoogle}
                    disabled={busy}
                    className="w-full bg-black text-white border border-white/10 hover:bg-black/90"
                  >
                    <span className="flex items-center justify-center gap-2">
                      <img
                        src={GOOGLE_LOGO}
                        alt="Google"
                        className="h-5 w-5 object-contain"
                        loading="lazy"
                      />
                      <span>Continue with Google</span>
                    </span>
                  </Button>

                  <Button
                    onClick={startMicrosoft}
                    disabled={busy}
                    className="w-full bg-black text-white border border-white/10 hover:bg-black/90 hover:text-white"
                  >
                    <span className="flex items-center justify-center gap-2">
                      <img
                        src={MICROSOFT_LOGO}
                        alt="Microsoft"
                        className="h-5 w-5 object-contain"
                        loading="lazy"
                      />
                      <span>Continue with Microsoft</span>
                    </span>
                  </Button>
                </div>

                <div className="mt-6 border-t border-white/10 pt-6">
                  <div className="text-white/70 text-sm mb-3">
                    Or sign in with email code
                  </div>

                  <Input
                    placeholder="you@company.com"
                    value={email}
                    disabled={busy || step === "verify"}
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

                  {step === "verify" && (
                    <>
                      <Input
                        placeholder="Enter 6-digit code"
                        value={code}
                        disabled={busy}
                        onChange={(e) => setCode(e.target.value)}
                        className="mt-3"
                      />
                      <Button
                        onClick={verifyEmailCode}
                        disabled={busy}
                        className="w-full mt-3"
                      >
                        Verify Code
                      </Button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setStep("start");
                          setCode("");
                          setChallengeToken("");
                          setInfo("");
                          setErr("");
                        }}
                        className="w-full mt-2 text-xs text-white/60 hover:text-white/85 disabled:opacity-50"
                      >
                        Use a different email
                      </button>
                    </>
                  )}
                </div>

                {err && <div className="mt-4 text-red-400 text-sm">{err}</div>}
                {info && <div className="mt-4 text-emerald-300 text-sm">{info}</div>}

                {busy && (
                  <div className="mt-4 text-white/50 text-xs">
                    {step === "verify" ? "Verifying..." : "Processing..."}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
