import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AuthModal({ open, onClose, onComplete }) {
  const [email, setEmail] = useState("");
  const [startingAuth, setStartingAuth] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [googleError, setGoogleError] = useState("");

  const cfgRef = useRef(null);
  const googleInitRef = useRef(false);
  const googleClientIdRef = useRef("");
  const hiddenGoogleBtnHostRef = useRef(null);

  async function loadConfig() {
    if (cfgRef.current) return cfgRef.current;

    const res = await fetch("/config.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`Missing /config.json (HTTP ${res.status})`);
    const cfg = await res.json();

    const GOOGLE_CLIENT_ID = cfg.GOOGLE_CLIENT_ID;
    if (!GOOGLE_CLIENT_ID) {
      throw new Error(
        "config.json missing GOOGLE_CLIENT_ID. Add it to /public/config.json."
      );
    }

    cfgRef.current = { GOOGLE_CLIENT_ID };
    return cfgRef.current;
  }

  function ensureGoogleScriptLoaded() {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.id) return resolve();

      // avoid adding multiple scripts
      const existing = document.querySelector('script[data-gis="true"]');
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () =>
          reject(new Error("Failed to load Google Identity script"))
        );
        return;
      }

      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.defer = true;
      s.dataset.gis = "true";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Failed to load Google Identity script"));
      document.head.appendChild(s);
    });
  }

  async function initGoogle() {
    if (googleInitRef.current) return;
    googleInitRef.current = true;

    try {
      setGoogleError("");

      const cfg = await loadConfig();
      googleClientIdRef.current = cfg.GOOGLE_CLIENT_ID;

      await ensureGoogleScriptLoaded();

      // Initialize Google Sign-In (returns an ID token in response.credential)
      window.google.accounts.id.initialize({
        client_id: cfg.GOOGLE_CLIENT_ID,
        callback: (response) => {
          // This is the Google ID token (JWT)
          // For now we just pass it to onComplete so you can wire backend later.
          // You do NOT store passwords anywhere.
          try {
            const token = response?.credential;
            if (!token) throw new Error("No credential returned from Google.");

            onComplete?.({
              provider: "google",
              idToken: token,
            });
          } catch (e) {
            console.error("[AuthModal] Google callback error:", e);
            setGoogleError("Google sign-in failed. Check console.");
          } finally {
            setStartingAuth(false);
          }
        },
        // Helps the picker behavior in many browsers
        use_fedcm_for_prompt: true,
      });

      // Render a real Google button off-screen; we will “click” it when user presses your button.
      if (hiddenGoogleBtnHostRef.current) {
        hiddenGoogleBtnHostRef.current.innerHTML = "";
        window.google.accounts.id.renderButton(hiddenGoogleBtnHostRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "signin_with",
          shape: "pill",
          width: 360, // Google controls the internal button width
        });
      }

      setGoogleReady(true);
    } catch (e) {
      console.error("[AuthModal] initGoogle error:", e);
      setGoogleError(e?.message || "Google init failed");
      setGoogleReady(false);
      setStartingAuth(false);
    }
  }

  // Initialize Google only when modal opens (saves load time)
  useEffect(() => {
    if (!open) return;
    initGoogle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function signInWithGoogle() {
    setStartingAuth(true);
    setGoogleError("");

    try {
      if (!googleReady) {
        await initGoogle();
      }

      // Try to click the hidden rendered Google button (most reliable picker)
      const host = hiddenGoogleBtnHostRef.current;
      const clickable =
        host?.querySelector('div[role="button"]') ||
        host?.querySelector("iframe") ||
        host?.firstElementChild;

      if (clickable && clickable.click) {
        clickable.click();
        return;
      }

      // Fallback: prompt (may show One Tap / account chooser depending on browser)
      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          console.warn("[AuthModal] Google prompt not displayed:", notification);
          setGoogleError(
            "Google prompt was blocked (pop-up/3rd party cookies). Try again or allow popups."
          );
          setStartingAuth(false);
        }
      });
    } catch (e) {
      console.error("[AuthModal] signInWithGoogle error:", e);
      setGoogleError(e?.message || "Google sign-in failed");
      setStartingAuth(false);
    }
  }

  function signInWithMicrosoft() {
    // You asked to remove External ID/Microsoft redirect flow for this approach.
    // Keeping the button but making it explicit.
    alert("Microsoft sign-in is disabled in the Google-only auth mode.");
  }

  function signInWithEmail() {
    // In this approach we do NOT store passwords.
    // If you want “email login” later, we can implement magic-link (no password).
    alert("Email sign-in not implemented yet (we can do passwordless magic-link next).");
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={startingAuth ? undefined : onClose}
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
                onClick={startingAuth ? undefined : onClose}
                className="absolute top-4 right-4 text-white/40 hover:text-white/70 transition-colors disabled:opacity-40"
                disabled={startingAuth}
              >
                <X className="w-5 h-5" />
              </button>

              <h2 className="text-2xl font-bold text-white mb-2">Get Started</h2>
              <p className="text-white/40 mb-8">Sign up to access your dashboard</p>

              {googleError ? (
                <div className="mb-4 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                  {googleError}
                </div>
              ) : null}

              <div className="space-y-3 mb-6">
                <Button
                  onClick={signInWithGoogle}
                  disabled={startingAuth}
                  className="w-full py-6 bg-white hover:bg-white/90 text-gray-900 rounded-xl font-semibold"
                >
                  {startingAuth ? "Opening Google..." : "Continue with Google"}
                </Button>

                <Button
                  onClick={signInWithMicrosoft}
                  disabled={startingAuth}
                  className="w-full py-6 bg-white/10 hover:bg-white/15 text-white rounded-xl font-semibold border border-white/20"
                >
                  Continue with Microsoft
                </Button>

                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/10"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="bg-[#0E0E12] px-4 text-white/30">
                      Or continue with email
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 text-white/30 w-5 h-5" />
                    <Input
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-12 py-6 bg-white/5 border border-white/10 text-white placeholder:text-white/30 rounded-xl focus:border-purple-500/50"
                      disabled={startingAuth}
                    />
                  </div>

                  <Button
                    onClick={signInWithEmail}
                    disabled={startingAuth}
                    className="w-full py-6 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold"
                  >
                    Continue with Email
                  </Button>
                </div>

                {/* Off-screen real Google button host (used to trigger true account picker) */}
                <div
                  ref={hiddenGoogleBtnHostRef}
                  style={{
                    position: "absolute",
                    left: "-9999px",
                    top: "-9999px",
                    width: "400px",
                    height: "80px",
                    overflow: "hidden",
                  }}
                />
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
