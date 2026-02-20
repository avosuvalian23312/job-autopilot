// src/components/landing/AuthModal.jsx
import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Azure Static Web Apps auth (NO JWT):
 * - Redirect to /.auth/login/{provider}
 * - Use a relative post_login_redirect_uri so it returns to your app page correctly.
 * - Do not hit the identity.* domain directly.
 */
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

export default function AuthModal({ open, onClose, onComplete }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  /**
   * Always return to "/" after login so App routing decides onboarding.
   */
  const AFTER_LOGIN_PATH = "/";
  const MICROSOFT_PROVIDER =
    import.meta.env.VITE_SWA_MICROSOFT_PROVIDER || "microsoft";
  const EMAIL_PROVIDER =
    import.meta.env.VITE_SWA_EMAIL_PROVIDER || MICROSOFT_PROVIDER;

  // Public logos (must exist in /public/logos/)
  const GOOGLE_LOGO = "/logos/google-logo-9808.png";
  const MICROSOFT_LOGO = "/logos/64px-Microsoft_logo.svg.png";

  // Zoom/popup effect controller.
  const [pulse, setPulse] = useState(0);
  const pulseTimer = useRef(null);

  const triggerPulse = () => {
    setPulse((p) => p + 1);
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
  };

  useEffect(() => {
    if (open) {
      setErr("");
      setBusy(false);
      setEmail("");
      triggerPulse();
    }
    return () => {
      if (pulseTimer.current) clearTimeout(pulseTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const startGoogle = async () => {
    if (busy) return;
    setErr("");
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
    setErr("");
    setBusy(true);
    triggerPulse();

    const emailHint = String(email || "").trim();
    const hasEmailHint = /^\S+@\S+\.\S+$/.test(emailHint);

    try {
      onComplete?.({ provider: "email" });
    } catch {
      // ignore
    }

    setTimeout(() => {
      swaLogin(
        EMAIL_PROVIDER,
        AFTER_LOGIN_PATH,
        hasEmailHint ? { login_hint: emailHint } : {}
      );
    }, 220);
  };

  const humanProviderName = (provider) => {
    const value = String(provider || "").trim();
    if (!value) return "identity provider";
    if (value.toLowerCase() === "aad") return "Microsoft";
    return value;
  };

  const microsoftName = humanProviderName(MICROSOFT_PROVIDER);
  const emailName = humanProviderName(EMAIL_PROVIDER);
  const microsoftButtonLabel =
    microsoftName.toLowerCase() === "microsoft"
      ? "Continue with Microsoft"
      : `Continue with ${microsoftName}`;
  const emailButtonLabel =
    emailName.toLowerCase() === "microsoft"
      ? "Continue with Email (Microsoft)"
      : `Continue with Email (${emailName})`;
  const emailHelpText =
    emailName.toLowerCase() === "microsoft"
      ? "Uses your Microsoft/Entra sign-in flow."
      : `Uses your configured "${emailName}" identity provider.`;

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
                      <span>{microsoftButtonLabel}</span>
                    </span>
                  </Button>
                </div>

                <div className="mt-6 border-t border-white/10 pt-6">
                  <div className="text-white/70 text-sm mb-3">
                    Or sign in with email
                  </div>

                  <Input
                    placeholder="you@company.com (optional)"
                    value={email}
                    disabled={busy}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <p className="mt-2 text-xs text-white/55">{emailHelpText}</p>

                  <Button
                    onClick={startEmail}
                    disabled={busy}
                    className="w-full mt-3"
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    {emailButtonLabel}
                  </Button>
                </div>

                {err && <div className="mt-4 text-red-400 text-sm">{err}</div>}

                {busy && (
                  <div className="mt-4 text-white/50 text-xs">
                    Redirecting to sign-in...
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
