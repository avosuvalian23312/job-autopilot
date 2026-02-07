import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PublicClientApplication } from "@azure/msal-browser";

export default function AuthModal({ open, onClose, onComplete }) {
  const [email, setEmail] = useState("");
  const [startingAuth, setStartingAuth] = useState(false);

  const cfgPromiseRef = useRef(null);
  const pcaRef = useRef(null);
  const pcaInitPromiseRef = useRef(null);
  const didHandleRedirectRef = useRef(false);

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
        const authority = cfg.AUTHORITY || cfg.authority || "";
        const redirectUri = cfg.REDIRECT_URI || cfg.redirectUri || window.location.origin;

        let scopes = cfg.SCOPES || cfg.scopes || ["openid", "profile", "email"];
        if (typeof scopes === "string") scopes = scopes.split(/\s+/).filter(Boolean);

        const userFlow = cfg.USER_FLOW || cfg.userFlow || cfg.user_flow || "signup_signin";

        let knownAuthorities = cfg.KNOWN_AUTHORITIES || cfg.knownAuthorities || null;
        if (!knownAuthorities && authority) {
          try {
            knownAuthorities = [new URL(authority).host];
          } catch {
            knownAuthorities = null;
          }
        }

        return { tenantId, clientId, authority, redirectUri, scopes, knownAuthorities, userFlow, raw: cfg };
      })
      .catch((err) => {
        console.error("[AuthModal] Failed to load /config.json:", err);
        return {
          tenantId: "",
          clientId: "",
          authority: "",
          redirectUri: window.location.origin,
          scopes: ["openid", "profile", "email"],
          knownAuthorities: null,
          userFlow: "signup_signin",
          raw: null,
        };
      });

    return cfgPromiseRef.current;
  };

  const getInitializedPca = async () => {
    if (pcaInitPromiseRef.current) return pcaInitPromiseRef.current;

    pcaInitPromiseRef.current = (async () => {
      const { clientId, authority, redirectUri, knownAuthorities } = await loadRuntimeConfig();

      if (!clientId || !authority) {
        console.error("[AuthModal] Missing config: CLIENT_ID or AUTHORITY in /config.json");
        alert("Login not configured. Fix /config.json (CLIENT_ID / AUTHORITY).");
        return null;
      }

      if (authority.includes("login.microsoftonline.com")) {
        console.error("[AuthModal] Wrong AUTHORITY. Use *.ciamlogin.com/<TENANT_ID>/v2.0 for External ID.");
        alert("AUTHORITY is wrong. Use <tenant>.ciamlogin.com/<TENANT_ID>/v2.0 in /config.json.");
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

  const handleAuth = async (provider) => {
    setStartingAuth(true);

    const pca = await getInitializedPca();
    if (!pca) {
      setStartingAuth(false);
      return;
    }

    const { scopes, redirectUri, userFlow } = await loadRuntimeConfig();

    // Reduce hint conflicts
    try {
      pca.setActiveAccount(null);
    } catch {
      // ignore
    }

    const request = {
      scopes,
      redirectUri,
      prompt: provider === "email" ? "login" : "select_account",
      extraQueryParameters: {
        p: userFlow, // CIAM user flow
      },
    };

    if (provider === "google") {
      // Most reliable way to auto-route to Google in CIAM
      request.extraQueryParameters = {
        ...request.extraQueryParameters,
        domain_hint: "google.com",
      };
    } else if (provider === "microsoft") {
      request.extraQueryParameters = {
        ...request.extraQueryParameters,
        domain_hint: "microsoft.com",
      };
    } else if (provider === "email") {
      const loginHint = email?.trim();
      if (loginHint) request.loginHint = loginHint;
    }

    try {
      await pca.loginRedirect(request);
    } catch (e) {
      console.error("[AuthModal] loginRedirect error:", e);
      setStartingAuth(false);
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
                  <span className="px-2 bg-[#0E0E12] text-white/30">Or continue with email</span>
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
