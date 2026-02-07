import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PublicClientApplication } from "@azure/msal-browser";

/**
 * External ID runtime config:
 * Put config at:  frontend/job-auto-pilot/public/config.json
 * Served at:      https://<your-site>/config.json
 *
 * Example config.json:
 * {
 *   "TENANT_ID": "...",
 *   "CLIENT_ID": "...",
 *   "AUTHORITY": "https://login.microsoftonline.com/<TENANT_ID>",
 *   "REDIRECT_URI": "https://<your-site>",
 *   "SCOPES": ["openid","profile","email"]
 * }
 */

export default function AuthModal({ open, onClose, onComplete }) {
  const [email, setEmail] = useState("");

  const cfgPromiseRef = useRef(null);
  const pcaRef = useRef(null);
  const pcaInitPromiseRef = useRef(null);

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

  const getInitializedPca = async () => {
    if (pcaInitPromiseRef.current) return pcaInitPromiseRef.current;

    pcaInitPromiseRef.current = (async () => {
      const { clientId, authority, redirectUri } = await loadRuntimeConfig();

      if (!clientId || !authority) {
        console.error(
          "[AuthModal] Missing External ID config. /config.json must include CLIENT_ID and AUTHORITY (or TENANT_ID)."
        );
        alert("Login not configured. Fix /config.json (CLIENT_ID / AUTHORITY).");
        return null;
      }

      // Create once
      if (!pcaRef.current) {
        pcaRef.current = new PublicClientApplication({
          auth: { clientId, authority, redirectUri },
          cache: { cacheLocation: "localStorage" },
        });
      }

      // MSAL v3 requires initialize()
      try {
        await pcaRef.current.initialize();
      } catch (e) {
        console.error("[AuthModal] MSAL initialize() failed:", e);
        return null;
      }

      return pcaRef.current;
    })();

    return pcaInitPromiseRef.current;
  };

  // Handle redirect response once (after initialization)
  useEffect(() => {
    (async () => {
      const pca = await getInitializedPca();
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

    const pca = await getInitializedPca();
    if (!pca) return;

    const { scopes } = await loadRuntimeConfig();

    // External ID: no B2C-style idp forcing. Email button can provide loginHint.
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
                  Continue with Google
                </Button>

                <Button
                  onClick={() => handleAuth("microsoft")}
                  className="w-full py-6 bg-[#2F2F2F] hover:bg-[#3F3F3F] text-white rounded-xl font-semibold flex items-center justify-center gap-3"
                >
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
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
