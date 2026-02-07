import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PublicClientApplication } from "@azure/msal-browser";

export default function AuthModal({ open, onClose, onComplete }) {
  const [email, setEmail] = useState("");
  const [startingAuth, setStartingAuth] = useState(false);

  const cfgRef = useRef(null);
  const pcaRef = useRef(null);
  const handledRedirectRef = useRef(false);

  const loadConfig = async () => {
    if (cfgRef.current) return cfgRef.current;

    const res = await fetch("/config.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`Missing /config.json (HTTP ${res.status})`);
    const cfg = await res.json();

    const CLIENT_ID = cfg.CLIENT_ID;
    const AUTHORITY = (cfg.AUTHORITY || "").replace(/\/v2\.0$/, ""); // should include /<TENANT_GUID>
    const REDIRECT_URI = cfg.REDIRECT_URI || window.location.origin;
    const SCOPES = cfg.SCOPES || ["openid", "profile", "email"];

    const KNOWN_AUTHORITIES =
      cfg.KNOWN_AUTHORITIES ||
      (AUTHORITY ? [new URL(AUTHORITY).host] : []);

    if (!CLIENT_ID || !AUTHORITY) {
      throw new Error("config.json missing CLIENT_ID or AUTHORITY");
    }

    // Guard: prevent accidental Microsoft login authority
    if (AUTHORITY.includes("login.microsoftonline.com")) {
      throw new Error("AUTHORITY must be *.ciamlogin.com/<TENANT_GUID> for your setup");
    }

    cfgRef.current = {
      CLIENT_ID,
      AUTHORITY,
      REDIRECT_URI,
      SCOPES,
      KNOWN_AUTHORITIES,
    };
    return cfgRef.current;
  };

  const getPca = async () => {
    if (pcaRef.current) return pcaRef.current;

    const cfg = await loadConfig();

    pcaRef.current = new PublicClientApplication({
      auth: {
        clientId: cfg.CLIENT_ID,
        authority: cfg.AUTHORITY,
        redirectUri: cfg.REDIRECT_URI,
        knownAuthorities: cfg.KNOWN_AUTHORITIES,
      },
      cache: { cacheLocation: "localStorage" },
    });

    await pcaRef.current.initialize();
    return pcaRef.current;
  };

  useEffect(() => {
    if (handledRedirectRef.current) return;
    handledRedirectRef.current = true;

    (async () => {
      try {
        const pca = await getPca();
        const result = await pca.handleRedirectPromise();
        if (result?.account) {
          pca.setActiveAccount(result.account);
          onComplete?.(result);
        }
      } catch (e) {
        console.error("[AuthModal] handleRedirectPromise error:", e);
      } finally {
        setStartingAuth(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (provider) => {
    setStartingAuth(true);

    try {
      const pca = await getPca();
      const cfg = await loadConfig();

      // Clear any active account so hints don’t get ignored
      try {
        pca.setActiveAccount(null);
      } catch {
        // ignore
      }

      const baseRequest = {
        scopes: cfg.SCOPES,
        // For “go straight to provider” UX, login is better than select_account
        prompt: provider === "google" ? "login" : "select_account",
      };

      if (provider === "google") {
        /**
         * Try to FORCE Google:
         * - idp=google.com (commonly used in B2C-style federation)
         * - domain_hint=google.com (AAD/CIAM sometimes honors)
         *
         * If CIAM ignores these, the fallback is it will still land on the CIAM page,
         * but in many tenants this does jump directly to Google.
         */
        await pca.loginRedirect({
          ...baseRequest,
          extraQueryParameters: {
            idp: "google.com",
            domain_hint: "google.com",
          },
        });
        return;
      }

      if (provider === "microsoft") {
        await pca.loginRedirect({
          ...baseRequest,
          extraQueryParameters: {
            domain_hint: "organizations",
          },
        });
        return;
      }

      if (provider === "email") {
        const hint = email.trim();
        await pca.loginRedirect({
          ...baseRequest,
          prompt: "login",
          ...(hint ? { loginHint: hint } : {}),
        });
        return;
      }
    } catch (e) {
      console.error("[AuthModal] loginRedirect error:", e);
      alert("Login failed to start. Check console errors.");
      setStartingAuth(false);
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

              <div className="space-y-3 mb-6">
                <Button
                  onClick={() => login("google")}
                  disabled={startingAuth}
                  className="w-full py-6 bg-white hover:bg-white/90 text-gray-900 rounded-xl font-semibold"
                >
                  Continue with Google
                </Button>

                <Button
                  onClick={() => login("microsoft")}
                  disabled={startingAuth}
                  className="w-full py-6 bg-white/10 hover:bg-white/15 text-white rounded-xl font-semibold border border-white/20"
                >
                  Continue with Microsoft
                </Button>
              </div>

              <div className="flex items-center gap-3 my-6">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-white/30 text-sm">Or continue with email</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              <div className="space-y-3">
                <div className="relative">
                  <Mail className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    className="pl-10 h-12 bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-xl"
                    disabled={startingAuth}
                  />
                </div>

                <Button
                  onClick={() => login("email")}
                  disabled={startingAuth}
                  className="w-full py-6 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold"
                >
                  Continue with Email
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
