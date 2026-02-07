import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PublicClientApplication } from "@azure/msal-browser";

/**
 * Runtime config at /public/config.json
 *
 * Recommended config.json:
 * {
 *   "TENANT_ID": "...",
 *   "CLIENT_ID": "...",
 *   "AUTHORITY": "https://jobautopilotext.ciamlogin.com",   // OR full authority
 *   "KNOWN_AUTHORITIES": ["jobautopilotext.ciamlogin.com"],
 *   "USER_FLOW": "signup_signin",
 *   "REDIRECT_URI": "https://<your-static-app>",
 *   "SCOPES": ["openid","profile","email"]
 * }
 */

export default function AuthModal({ open, onClose, onComplete }) {
  const [email, setEmail] = useState("");
  const [startingAuth, setStartingAuth] = useState(false);

  const cfgPromiseRef = useRef(null);
  const pcaRef = useRef(null);
  const pcaInitPromiseRef = useRef(null);
  const didHandleRedirectRef = useRef(false);

  const normalizeAuthority = ({ authorityBase, tenantId, userFlow }) => {
    // If user provided a full authority that already contains /TENANT/FLOW, keep it.
    // Otherwise build: https://<host>/<TENANT_ID>/<USER_FLOW>
    try {
      const url = new URL(authorityBase);
      const path = (url.pathname || "").replace(/\/+$/, ""); // trim trailing /
      const looksLikeFull =
        path.split("/").filter(Boolean).length >= 2 && !path.endsWith("/v2.0");

      if (looksLikeFull) return `${url.origin}${path}`;

      const tid = tenantId?.trim();
      const flow = userFlow?.trim();
      if (!tid || !flow) return `${url.origin}${path || ""}`.replace(/\/+$/, "");

      return `${url.origin}/${tid}/${flow}`;
    } catch {
      return authorityBase;
    }
  };

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

        // Accept either a full AUTHORITY or a base host.
        // If you pass "https://.../v2.0" that is NOT what we want for user flows.
        const rawAuthority = cfg.AUTHORITY || cfg.authority || "";
        const userFlow = cfg.USER_FLOW || cfg.userFlow || "";

        const redirectUri =
          cfg.REDIRECT_URI || cfg.redirectUri || window.location.origin;

        let scopes = cfg.SCOPES || cfg.scopes || ["openid", "profile", "email"];
        if (typeof scopes === "string") scopes = scopes.split(/\s+/).filter(Boolean);

        let knownAuthorities = cfg.KNOWN_AUTHORITIES || cfg.knownAuthorities || null;
        if (!knownAuthorities && rawAuthority) {
          try {
            const host = new URL(rawAuthority).host;
            knownAuthorities = [host];
          } catch {
            knownAuthorities = null;
          }
        }

        // If rawAuthority ends with /v2.0, strip it (user flows are not /v2.0 endpoints)
        let authorityBase = rawAuthority;
        if (authorityBase.endsWith("/v2.0")) {
          authorityBase = authorityBase.replace(/\/v2\.0$/, "");
        }

        const authority = normalizeAuthority({ authorityBase, tenantId, userFlow });

        return {
          tenantId,
          clientId,
          authority,
          authorityBase,
          userFlow,
          redirectUri,
          scopes,
          knownAuthorities,
          raw: cfg,
        };
      })
      .catch((err) => {
        console.error("[AuthModal] Failed to load /config.json:", err);
        return {
          tenantId: "",
          clientId: "",
          authority: "",
          authorityBase: "",
          userFlow: "",
          redirectUri: window.location.origin,
          scopes: ["openid", "profile", "email"],
          knownAuthorities: null,
          raw: null,
        };
      });

    return cfgPromiseRef.current;
  };

  const getInitializedPca = async () => {
    if (pcaInitPromiseRef.current) return pcaInitPromiseRef.current;

    pcaInitPromiseRef.current = (async () => {
      const { clientId, authority, knownAuthorities, redirectUri } =
        await loadRuntimeConfig();

      if (!clientId || !authority) {
        console.error("[AuthModal] Missing config: CLIENT_ID or AUTHORITY/USER_FLOW");
        alert("Login not configured. Fix /config.json (CLIENT_ID / AUTHORITY / USER_FLOW).");
        return null;
      }

      if (authority.includes("login.microsoftonline.com")) {
        console.error(
          "[AuthModal] Wrong authority for External ID. Use *.ciamlogin.com"
        );
        alert("AUTHORITY is wrong. Use YOUR_TENANT.ciamlogin.com in /config.json.");
        return null;
      }

      if (!pcaRef.current) {
        pcaRef.current = new PublicClientApplication({
          auth: {
            clientId,
            authority,
            redirectUri,
            ...(knownAuthorities ? { knownAuthorities } : {}),
          },
          cache: { cacheLocation: "localStorage" },
        });
      }

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

  useEffect(() => {
    if (didHandleRedirectRef.current) return;
    didHandleRedirectRef.current = true;

    (async () => {
      const pca = await getInitializedPca();
      if (!pca) return;

      try {
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

  const startRedirect = async (pca, request) => {
    await pca.loginRedirect(request);
  };

  const handleAuth = async (provider) => {
    setStartingAuth(true);

    const pca = await getInitializedPca();
    if (!pca) {
      setStartingAuth(false);
      return;
    }

    const { scopes } = await loadRuntimeConfig();

    // Clear active account so we don't get "pick an account" / stale hints
    try {
      pca.setActiveAccount(null);
    } catch {
      // ignore
    }

    const baseRequest = {
      scopes,
      // Google: "login" tends to go straight to provider, less account-picker UX.
      // Microsoft/email: "select_account" is usually fine.
      prompt: provider === "google" ? "login" : provider === "email" ? "login" : "select_account",
    };

    try {
      if (provider === "google") {
        // Try provider hint first
        await startRedirect(pca, {
          ...baseRequest,
          extraQueryParameters: { provider: "google" },
        });
        return;
      }

      if (provider === "microsoft") {
        await startRedirect(pca, {
          ...baseRequest,
          extraQueryParameters: { provider: "microsoft" },
        });
        return;
      }

      if (provider === "email") {
        const loginHint = email?.trim();
        await startRedirect(pca, {
          ...baseRequest,
          ...(loginHint ? { loginHint } : {}),
        });
        return;
      }
    } catch (e1) {
      // Fallback for Google/Microsoft hint param name differences
      if (provider === "google") {
        try {
          await startRedirect(pca, {
            ...baseRequest,
            extraQueryParameters: { idp: "google" },
          });
          return;
        } catch (e2) {
          console.error("[AuthModal] google redirect failed:", e1, e2);
        }
      } else if (provider === "microsoft") {
        try {
          await startRedirect(pca, {
            ...baseRequest,
            extraQueryParameters: { idp: "microsoft" },
          });
          return;
        } catch (e2) {
          console.error("[AuthModal] microsoft redirect failed:", e1, e2);
        }
      } else {
        console.error("[AuthModal] loginRedirect error:", e1);
      }
    }

    setStartingAuth(false);
    alert("Login failed to start. Check console for details.");
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
                  onClick={() => handleAuth("google")}
                  disabled={startingAuth}
                  className="w-full py-6 bg-white hover:bg-white/90 text-gray-900 rounded-xl font-semibold flex items-center justify-center gap-3"
                >
                  Continue with Google
                </Button>

                <Button
                  onClick={() => handleAuth("microsoft")}
                  disabled={startingAuth}
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
                  disabled={startingAuth}
                  className="bg-white/[0.05] border-white/10 text-white placeholder:text-white/40 py-5 rounded-xl focus:border-purple-500/50"
                />
                <Button
                  onClick={() => handleAuth("email")}
                  disabled={startingAuth}
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
