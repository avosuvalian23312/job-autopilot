import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Azure Static Web Apps auth (NO JWT):
 * - Redirect to /.auth/login/{provider}
 * - Use a RELATIVE post_login_redirect_uri so it returns to your app page correctly.
 * - Do NOT hit the identity.* domain directly.
 */
function swaLogin(provider, redirectPath) {
  const path =
    redirectPath ||
    `${window.location.pathname}${window.location.search}${window.location.hash}`;

  const safe = path && path.startsWith("/") ? path : "/";
  window.location.href = `/.auth/login/${provider}?post_login_redirect_uri=${encodeURIComponent(
    safe
  )}`;
}

export default function AuthModal({ open, onClose, onComplete }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState("start"); // start | email_code
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // ✅ Where you want users to land after login
  // IMPORTANT: must start with "/"
  const AFTER_LOGIN_PATH = "/pricing";

  // --- Zoom / popup effect controller (triggers whenever modal opens OR a login starts) ---
  const [pulse, setPulse] = useState(0);
  const pulseTimer = useRef(null);

  const triggerPulse = () => {
    setPulse((p) => p + 1);
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    // (optional) you can add more delayed pulses here if you want a double-pop
  };

  useEffect(() => {
    if (open) {
      // reset modal state on open + do a soft "zoom-in"
      setErr("");
      setBusy(false);
      setStep("start");
      setCode("");
      setEmail("");
      triggerPulse();
    }
    return () => {
      if (pulseTimer.current) clearTimeout(pulseTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ✅ Google -> Google chooser -> then go to AFTER_LOGIN_PATH
  const startGoogle = async () => {
    if (busy) return;
    setErr("");
    setBusy(true);

    // UI zoom/popup effect right before redirect
    triggerPulse();

    // tiny delay so animation is visible before redirect
    setTimeout(() => {
      swaLogin("google", AFTER_LOGIN_PATH);
    }, 220);
  };

  // ✅ Microsoft -> Microsoft chooser -> then go to AFTER_LOGIN_PATH
  const startMicrosoft = async () => {
    if (busy) return;
    setErr("");
    setBusy(true);

    // UI zoom/popup effect right before redirect
    triggerPulse();

    // tiny delay so animation is visible before redirect
    setTimeout(() => {
      swaLogin("aad", AFTER_LOGIN_PATH);
    }, 220);
  };

  // Email-code flow requires a separate provider + backend implementation.
  // UI unchanged; show message.
  const startEmail = async () => {
    if (busy) return;
    setErr("");
    setBusy(true);

    // pulse so users get feedback that something happened
    triggerPulse();

    setTimeout(() => {
      setErr("Email login is not enabled. Please use Google or Microsoft sign-in.");
      setStep("start");
      setBusy(false);
    }, 180);
  };

  const verifyEmail = async () => {
    if (busy) return;
    setErr("");
    setBusy(true);

    triggerPulse();

    setTimeout(() => {
      setErr("Email login is not enabled. Please use Google or Microsoft sign-in.");
      setStep("start");
      setBusy(false);
    }, 180);
  };

  // --- Animations ---
  const overlayVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
    exit: { opacity: 0 },
  };

  // modal "zoom-in" + slight bounce, and a micro "pulse" keyframe when pulse changes
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

  // This runs when pulse changes (open OR provider click) and gives a quick "pop"
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
              key={`auth-modal-${pulse}`} // forces micro re-animation on pulse
              variants={modalVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              // pulse effect on top of the base animation
              whileHover={!busy ? { scale: 1.005 } : undefined}
              // run pulse keyframes whenever pulse increments
              {...(pulse > 0 ? { animate: ["visible", pulseKeyframes] } : {})}
              className="bg-[#0E0E12] p-8 rounded-2xl max-w-md w-full relative border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.55)]"
            >
              {/* soft gradient glow */}
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
                    className="w-full"
                  >
                    Continue with Google
                  </Button>

                  <Button
                    onClick={startMicrosoft}
                    disabled={busy}
                    className="w-full"
                    variant="secondary"
                  >
                    Continue with Microsoft
                  </Button>
                </div>

                <div className="mt-6 border-t border-white/10 pt-6">
                  <div className="text-white/70 text-sm mb-3">
                    Or sign in with email
                  </div>

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
                      <Button
                        onClick={verifyEmail}
                        className="w-full mt-3"
                        disabled={busy}
                      >
                        Verify Code
                      </Button>
                    </>
                  )}
                </div>

                {err && (
                  <div className="mt-4 text-red-400 text-sm">{err}</div>
                )}

                {busy && (
                  <div className="mt-4 text-white/50 text-xs">
                    Redirecting…
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
