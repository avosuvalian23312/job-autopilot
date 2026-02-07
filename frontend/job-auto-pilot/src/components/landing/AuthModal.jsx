// AuthModal.jsx
import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PublicClientApplication } from "@azure/msal-browser";

/**
 * External ID (Entra) runtime config:
 * Put config at:  frontend/job-auto-pilot/public/config.json
 * It will be served at: https://<your-site>/config.json
 *
 * Expected config.json (example):
 * {
 *   "TENANT_ID": "....",
 *   "CLIENT_ID": "....",
 *   "AUTHORITY": "https://login.microsoftonline.com/<TENANT_ID>",
 *   "REDIRECT_URI": "https://<your-site>",
 *   "SCOPES": ["openid","profile","email"]
 * }
 */

export default function AuthModal({ open, onClose, onComplete }) {
  const [email, setEmail] = useState("");
  const cfgPromiseRef = useRef(null);
  const msalPromiseRef = useRef(null);

  const loadRuntimeConfig = () => {
    if (cfgPromiseRef.current) return cfgPromiseRef.current;

    cfgPromiseRef.current = fetch("/config.json", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Missing /config.json (HTTP ${res.status})`);
        return res.json();
      })
      .then((cfg) => {
        const tenantId = cfg.TENANT_ID || cfg.tenantId || "";
        const clientId = cfg.CLIENT_ID || cfg.clientId || "";

        // Prefer explicit authority; otherwise build from tenantId
        const authority =
          cfg.AUTHORITY ||
          cfg.authority ||
          (tenantId ? `https://login.microsoftonline.com/${tenantId}` : "");

        const redirectUri =
          cfg.REDIRECT_URI || cfg.redirectUri || window.location.origin;

        let scopes = cfg.SCOPES || cfg.scopes || ["openid", "profile", "email"];
        if (typeof scopes === "string") scopes = scopes.split(/\s+/).filter(Boolean);

        return { tenantId, clientId, authority, redirectUri, scopes, raw: cfg };
      })
      .catch((err) => {
        console.error("[AuthModal] Failed to load /config.json:", err);
        return {
          tenantId: "",
          clientId: "",
          authority: "",
          redirectUri: window.location.origin,
          scopes: ["openid", "profile", "email"],
          raw: null,
        };
      });

    return cfgPromiseRef.current;
  };

  const getMsal = async () => {
    if (msalPromiseRef.current) return msalPromiseRef.current;

    msalPromiseRef.current = (async () => {
      const { clientId, authority, redirectUri } = await loadRuntimeConfig();

      if (!clientId || !authority) {
        console.error(
          "[AuthModal] Missing External ID config. Ensure /public/config.json contains CLIENT_ID and AUTHORITY (or TENANT_ID)."
        );
        alert(
          "Login is not configured yet. Missing External ID config in /config.json (CLIENT_ID / AUTHORITY or TENANT_ID)."
        );
        return null;
      }

      const pca = new PublicClientApplication({
        auth: {
          clientId,
          authority,
          redirectUri,
        },
        cache: {
          cacheLocation: "localStorage",
          storeAuthStateInCookie: false,
        },
      });

      return pca;
    })();

    return msalPromiseRef.current;
  };

  // Complete redirect flow if we got sent back with tokens
  useEffect(() => {
    (async () => {
      const pca = await getMsal();
      if (!pca) return;

      try {
        await pca.handleRedirectPromise();
      } catch (e) {
        console.error("[AuthModal] handleRedirectPromise error:", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAuth = async (provider) => {
    onComplete?.();

    const pca = await getMsal();
    if (!pca) return;

    const { scopes } = await loadRuntimeConfig();

    // External ID does NOT support B2C-style "idp=Google/Microsoft" forcing from the client.
    // Users choose provider on the Microsoft sign-in page based on the providers you enabled in External ID.
    // We'll still use the email field as a loginHint for the Email button.
    const loginHint = provider === "email" && email ? email.trim() : undefined;

    try {
      await pca.loginRedirect({
        scopes,
        prompt: "select_account",
        ...(loginHint ? { loginHint } : {}),
      });
    } catch (e) {
      console.error("[AuthModal] loginRedirect error:", e);
      alert("Login failed to start. Check console for details.");
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
            onClick={onClose}
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
                onClick={onClose}
                className="absolute top-4 right-4 text-white/40 hover:text-white/70 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <h2 className="text-2xl font-bold text-white mb-2">Get Started</h2>
              <p className="text-white/40 mb-8">Sign up to access your dashboard</p>

              <div className="space-y-3 mb-6">
                <Button
                  onClick={() => handleAuth("google")}
                  className="w-full py-6 bg-white hover:bg-white/90 text-gray-900 rounded-xl font-semibold flex items-center justify-center gap-3"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Continue with Google
                </Button>

                <Button
                  onClick={() => handleAuth("microsoft")}
                  className="w-full py-6 bg-[#2F2F2F] hover:bg-[#3F3F3F] text-white rounded-xl font-semibold flex items-center justify-center gap-3"
                >
                  <svg className="w-5 h-5" viewBox="0 0 23 23">
                    <path fill="#f3f3f3" d="M0 0h23v23H0z" />
                    <path fill="#f35325" d="M1 1h10v10H1z" />
                    <path fill="#81bc06" d="M12 1h10v10H12z" />
                    <path fill="#05a6f0" d="M1 12h10v10H1z" />
                    <path fill="#ffba08" d="M12 12h10v10H12z" />
                  </svg>
                  Continue with Microsoft
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
                  className="bg-white/[0.05] border-white/10 text-white placeholder:text-white/40 py-5 rounded-xl focus:border-purple-500/50"
                />
                <Button
                  onClick={() => handleAuth("email")}
                  className="w-full py-6 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-semibold"
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Continue with Email
                </Button>
              </div>

              <p className="text-xs text-white/20 text-center mt-6">
                By continuing, you agree to our{" "}
                <a href="#" className="text-purple-400 hover:text-purple-300">
                  Terms
                </a>{" "}
                and{" "}
                <a href="#" className="text-purple-400 hover:text-purple-300">
                  Privacy Policy
                </a>
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
