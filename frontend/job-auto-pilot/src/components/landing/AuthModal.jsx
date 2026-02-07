import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PublicClientApplication } from "@azure/msal-browser";

/**
 * Runtime config at /public/config.json
 *
 * ✅ For Microsoft Entra External ID (customers / CIAM) you MUST use *.ciamlogin.com (or your custom domain)
 * as the authority host — NOT login.microsoftonline.com.
 *
 * Example /public/config.json:
 * {
 *   "TENANT_ID": "65d1cd83-3b5d-40db-84e2-c80f5bd5e2c1",
 *   "CLIENT_ID": "33ddc64c-6c22-4e43-9364-0186576992b4",
 *   "AUTHORITY": "https://jobautopilotext.ciamlogin.com/65d1cd83-3b5d-40db-84e2-c80f5bd5e2c1/v2.0",
 *   "KNOWN_AUTHORITIES": ["jobautopilotext.ciamlogin.com"],
 *   "USER_FLOW": "signup_signin",
 *   "REDIRECT_URI": "https://red-beach-033073710.4.azurestaticapps.net",
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

        // User flow name you created in External ID (ex: signup_signin)
        const userFlow = cfg.USER_FLOW || cfg.userFlow || cfg.user_flow || "signup_signin";

        // CIAM/custom domains require knownAuthorities so MSAL trusts the host.
        let knownAuthorities = cfg.KNOWN_AUTHORITIES || cfg.knownAuthorities || null;
        if (!knownAuthorities && authority) {
          try {
            knownAuthorities = [new URL(authority).host];
          } catch {
            knownAuthorities = null;
          }
        }

        return { tenantId, clientId, authority, redirectUri, scopes, userFlow, knownAuthorities, raw: cfg };
      })
      .catch((err) => {
        console.error("[AuthModal] Failed to load /config.json:", err);
        return {
          tenantId: "",
          clientId: "",
          authority: "",
          redirectUri: window.location.origin,
          scopes: ["openid", "profile", "email"],
          userFlow: "signup_signin",
          knownAuthorities: null,
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
        console.error(
          "[AuthModal] AUTHORITY is login.microsoftonline.com. For External ID (customers) use *.ciamlogin.com (or custom domain)."
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

  const handleAuth = async (provider) => {
    setStartingAuth(true);

    const pca = await getInitializedPca();
    if (!pca) {
      setStartingAuth(false);
      return;
    }

    const { scopes, redirectUri, userFlow } = await loadRuntimeConfig();

    // IMPORTANT: avoids AADSTS1002014-like conflicts (domain_hint + opaque login_hint)
    try {
      pca.setActiveAccount(null);
    } catch {
      // ignore
    }

    // We force prompt="login" so Google shows the email/phone screen (not the account picker)
    // and to reduce extra account-selection screens.
    const request = {
      scopes,
      redirectUri,
      prompt: "login",
      extraQueryParameters: {
        // CIAM user flow
        p: userFlow,
      },
    };

    if (provider === "google") {
      // Best-effort to immediately route into Google.
      // If your tenant/user-flow has Google enabled, CIAM will bounce to Google.
      request.extraQueryParameters = {
        ...request.extraQueryParameters,
        domain_hint: "google.com",
      };
    } else if (provider === "microsoft") {
      // Route to Microsoft (work/school or Microsoft account depending on your tenant settings)
      request.extraQueryParameters = {
        ...request.extraQueryParameters,
        domain_hint: "microsoft.com",
      };
    } else if (provider === "email") {
      const loginHint = email?.trim();
      if (loginHint) request.loginHint = loginHint;
      // NOTE: do NOT set domain_hint here.
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
