import React, { useState } from "react";
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

  // ✅ Google -> Google chooser -> then go to /subscriptioninfo
  const startGoogle = async () => {
    if (busy) return;
    setErr("");
    setBusy(true);
    try {
      swaLogin("google", AFTER_LOGIN_PATH);
    } finally {
      setBusy(false);
    }
  };

  // ✅ Microsoft -> Microsoft chooser -> then go to /subscriptioninfo
  const startMicrosoft = async () => {
    if (busy) return;
    setErr("");
    setBusy(true);
    try {
      swaLogin("aad", AFTER_LOGIN_PATH);
    } finally {
      setBusy(false);
    }
  };

  // Email-code flow requires a separate provider + backend implementation.
  // UI unchanged; show message.
  const startEmail = async () => {
    if (busy) return;
    setErr("");
    setBusy(true);
    try {
      setErr("Email login is not enabled. Please use Google or Microsoft sign-in.");
      setStep("start");
    } finally {
      setBusy(false);
    }
  };

  const verifyEmail = async () => {
    if (busy) return;
    setErr("");
    setBusy(true);
    try {
      setErr("Email login is not enabled. Please use Google or Microsoft sign-in.");
      setStep("start");
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
                className="absolute top-4 right-4 text-white/70 hover:text-white"
                onClick={busy ? undefined : onClose}
              >
                <X className="w-5 h-5" />
              </button>

              <h2 className="text-2xl font-bold text-white mb-2">Sign in</h2>
              <p className="text-white/70 mb-6">Choose a provider to continue.</p>

              <div className="space-y-3">
                <Button onClick={startGoogle} disabled={busy} className="w-full">
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

              {err && <div className="mt-4 text-red-400 text-sm">{err}</div>}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
