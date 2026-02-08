import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function loadGoogleScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve(true);

    const existing = document.querySelector('script[data-google-gis="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(true));
      existing.addEventListener("error", () => reject(new Error("Google GIS failed to load")));
      return;
    }

    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.dataset.googleGis = "true";
    s.onload = () => resolve(true);
    s.onerror = () => reject(new Error("Google GIS failed to load"));
    document.head.appendChild(s);
  });
}

async function loadConfig() {
  const res = await fetch("/config.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`Could not load /config.json (HTTP ${res.status})`);
  const cfg = await res.json();

  if (!cfg.GOOGLE_CLIENT_ID || typeof cfg.GOOGLE_CLIENT_ID !== "string") {
    throw new Error("config.json missing GOOGLE_CLIENT_ID");
  }

  // Guard against hidden whitespace/newlines
  const cleaned = cfg.GOOGLE_CLIENT_ID.trim();
  if (!cleaned.endsWith(".apps.googleusercontent.com")) {
    throw new Error("GOOGLE_CLIENT_ID looks wrong (must end with .apps.googleusercontent.com)");
  }

  return { GOOGLE_CLIENT_ID: cleaned };
}

export default function AuthModal({ open, onClose, onComplete }) {
  const [email, setEmail] = useState("");
  const [startingAuth, setStartingAuth] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [error, setError] = useState("");

  const googleClientIdRef = useRef("");
  const googleInitRef = useRef(false);

  useEffect(() => {
    if (!open) return;

    (async () => {
      try {
        setError("");
        setGoogleReady(false);

        const cfg = await loadConfig();
        googleClientIdRef.current = cfg.GOOGLE_CLIENT_ID;

        await loadGoogleScript();

        // Initialize ONLY the GIS ID-token flow (no OAuth redirect windows)
        if (!googleInitRef.current) {
          googleInitRef.current = true;

          window.google.accounts.id.initialize({
            client_id: cfg.GOOGLE_CLIENT_ID,
            callback: (response) => {
              try {
                const idToken = response?.credential;
                if (!idToken) throw new Error("No ID token returned from Google");

                // Send token to parent (later we wire backend)
                onComplete?.({
                  provider: "google",
                  idToken,
                });

                setStartingAuth(false);
              } catch (e) {
                console.error("[Google callback error]", e);
                setError(e?.message || "Google sign-in failed");
                setStartingAuth(false);
              }
            },
            // Helps in Chrome with federated credential management
            use_fedcm_for_prompt: true,
          });
        }

        setGoogleReady(true);
      } catch (e) {
        console.error("[AuthModal init error]", e);
        setError(e?.message || "Failed to initialize Google sign-in");
        setGoogleReady(false);
        setStartingAuth(false);
      }
    })();
  }, [open, onComplete]);

  const signInWithGoogle = () => {
    setError("");
    setStartingAuth(true);

    try {
      if (!googleReady || !window.google?.accounts?.id) {
        setStartingAuth(false);
        setError("Google not ready yet — refresh and try again.");
        return;
      }

      // This should show Google account chooser / one-tap style UX.
      // If it’s blocked, we show a useful error.
      window.google.accounts.id.prompt((notification) => {
        // If user dismissed or browser blocked it, we handle it.
        if (notification.isNotDisplayed()) {
          console.warn("Google prompt not displayed:", notification.getNotDisplayedReason?.());
          setError(
            "Google prompt blocked. Try allowing popups, disabling strict tracking prevention, or use a different browser."
          );
          setStartingAuth(false);
        } else if (notification.isSkippedMoment()) {
          console.warn("Google prompt skipped:", notification.getSkippedReason?.());
          setError("Google prompt was skipped. Try again.");
          setStartingAuth(false);
        }
        // If it displays, Google will call our callback and we stop loading there.
      });
    } catch (e) {
      console.error("[signInWithGoogle error]", e);
      setError(e?.message || "Google sign-in failed");
      setStartingAuth(false);
    }
  };

  const signInWithMicrosoft = () => {
    alert("Microsoft sign-in disabled in Google-only mode.");
  };

  const signInWithEmail = () => {
    // We can do passwordless magic-link later (still no passwords stored)
    alert("Email sign-in not implemented yet. Next we can add passwordless magic-link.");
  };

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
              <p className="text-white/40 mb-6">Sign up to access your dashboard</p>

              {error ? (
                <div className="mb-4 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                  {error}
                </div>
              ) : null}

              <div className="space-y-3 mb-6">
                <Button
                  onClick={signInWithGoogle}
                  disabled={startingAuth || !googleReady}
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

                {/* Debug helper (remove later) */}
                <div className="text-xs text-white/30 pt-2">
                  Google ready: {googleReady ? "yes" : "no"} | client:{" "}
                  {googleClientIdRef.current ? "loaded" : "missing"}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
