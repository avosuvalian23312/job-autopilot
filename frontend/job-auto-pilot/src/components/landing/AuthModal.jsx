import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PublicClientApplication } from "@azure/msal-browser";

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) return resolve();

    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function normalizeToken(raw) {
  if (!raw || typeof raw !== "string") return null;
  let t = raw.trim();

  // Remove accidental JSON quotes
  t = t.replace(/^"|"$/g, "");

  // If token was stored with Bearer prefix, strip it
  t = t.replace(/^Bearer\s+/i, "");

  // If whitespace snuck in, take first chunk
  if (t.includes(" ")) t = t.split(/\s+/)[0];

  return t || null;
}

export default function AuthModal({ open, onClose, onComplete }) {
  const [tab, setTab] = useState("oauth");
  const [email, setEmail] = useState("");
  const [magicSent, setMagicSent] = useState(false);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const cfgRef = useRef(null);
  const apiBaseRef = useRef("/api");
  const msalRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        // If you have a /config.json in your public root, this will load it
        const r = await fetch("/config.json", { cache: "no-store" });
        if (r.ok) {
          const cfg = await r.json();
          cfgRef.current = cfg;
          apiBaseRef.current = cfgRef.current?.API_BASE || "/api";
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  const exchangeWithBackend = async (payload) => {
    const r = await fetch(`${apiBaseRef.current}/auth/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    let data = null;
    try {
      data = await r.json();
    } catch {
      // ignore
    }

    if (!r.ok) {
      const msg = data?.error || `Auth exchange failed (${r.status})`;
      throw new Error(msg);
    }

    // If backend returns a token in JSON, store it (cookie-based auth is also fine)
    if (data.token) {
      const t = normalizeToken(data.token);
      if (t) {
        localStorage.setItem("APP_TOKEN", t);
        // Optional aliases for other parts of the app
        localStorage.setItem("appToken", t);
        localStorage.setItem("authToken", t);
      }
    }

    return data; // { ok, token?, user? ... }
  };

  // GOOGLE: GIS token popup
  const handleGoogle = async () => {
    setErr("");
    setLoading(true);
    try {
      await loadScriptOnce("https://accounts.google.com/gsi/client");

      const clientId =
        cfgRef.current?.GOOGLE_CLIENT_ID || import.meta.env.VITE_GOOGLE_CLIENT_ID;

      if (!clientId) {
        throw new Error(
          "Missing GOOGLE_CLIENT_ID. Set VITE_GOOGLE_CLIENT_ID or /config.json GOOGLE_CLIENT_ID."
        );
      }

      // Request an access token (not an id_token) via GIS token client
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "openid email profile",
        callback: async (resp) => {
          try {
            if (!resp?.access_token) {
              throw new Error("Google auth failed: missing access_token");
            }

            // Get profile (email/name/picture/sub) using the access token
            const pr = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
              headers: { Authorization: `Bearer ${resp.access_token}` },
            });
            const profile = await pr.json();

            // ✅ EXCHANGE with your backend to get YOUR per-user token (for Stripe/credits/etc)
            const exchanged = await exchangeWithBackend({
              provider: "google",
              providerProfile: profile,
              // optional: send provider token for server-side verification if you implement it
              providerAccessToken: resp.access_token,
            });

            onComplete?.({
              ok: true,
              provider: "google",
              providerProfile: profile,
              exchange: exchanged,
            });
          } catch (e) {
            setErr(e?.message || "Google login failed");
          } finally {
            setLoading(false);
          }
        },
      });

      tokenClient.requestAccessToken({ prompt: "consent" });
    } catch (e) {
      setErr(e?.message || "Google login failed");
      setLoading(false);
    }
  };

  // MICROSOFT: MSAL popup
  const handleMicrosoft = async () => {
    setErr("");
    setLoading(true);
    try {
      const tenantId =
        cfgRef.current?.TENANT_ID || import.meta.env.VITE_TENANT_ID;
      const clientId =
        cfgRef.current?.CLIENT_ID || import.meta.env.VITE_CLIENT_ID;

      if (!tenantId || !clientId) {
        throw new Error(
          "Missing Microsoft config. Set VITE_TENANT_ID + VITE_CLIENT_ID or /config.json."
        );
      }

      const authority =
        cfgRef.current?.AUTHORITY ||
        `https://login.microsoftonline.com/${tenantId}`;

      const redirectUri =
        cfgRef.current?.REDIRECT_URI ||
        import.meta.env.VITE_REDIRECT_URI ||
        window.location.origin;

      const scopes =
        cfgRef.current?.SCOPES || ["openid", "profile", "email"];

      if (!msalRef.current) {
        msalRef.current = new PublicClientApplication({
          auth: {
            clientId,
            authority,
            redirectUri,
          },
          cache: { cacheLocation: "localStorage", storeAuthStateInCookie: false },
        });
        await msalRef.current.initialize();
      }

      const loginResp = await msalRef.current.loginPopup({
        scopes,
        prompt: "select_account",
      });

      const account = loginResp?.account;
      if (!account) throw new Error("Microsoft login failed: missing account");

      const tokenResp = await msalRef.current.acquireTokenSilent({
        scopes,
        account,
      });

      // Build a stable profile object for your backend
      const providerProfile = {
        name: account.name,
        username: account.username,
        homeAccountId: account.homeAccountId,
        tenantId: account.tenantId,
        localAccountId: account.localAccountId,
      };

      // ✅ EXCHANGE with your backend to get YOUR per-user token (for Stripe/credits/etc)
      const exchanged = await exchangeWithBackend({
        provider: "microsoft",
        providerProfile,
        providerAccessToken: tokenResp?.accessToken, // optional for server-side verification
        providerIdToken: tokenResp?.idToken, // optional for server-side verification
      });

      onComplete?.({
        ok: true,
        provider: "microsoft",
        providerProfile,
        exchange: exchanged,
      });
    } catch (e) {
      setErr(e?.message || "Microsoft login failed");
    } finally {
      setLoading(false);
    }
  };

  // EMAIL MAGIC LINK + CODE
  const sendMagic = async () => {
    setErr("");
    setLoading(true);
    try {
      if (!email.trim()) throw new Error("Enter your email");

      const r = await fetch(`${apiBaseRef.current}/auth/email/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      let data = null;
      try {
        data = await r.json();
      } catch {
        // ignore
      }

      if (!r.ok) {
        throw new Error(data?.error || `Failed to send code (${r.status})`);
      }

      setMagicSent(true);
    } catch (e) {
      setErr(e?.message || "Failed to send code");
    } finally {
      setLoading(false);
    }
  };

  const verifyMagic = async () => {
    setErr("");
    setLoading(true);
    try {
      if (!email.trim()) throw new Error("Enter your email");
      if (!code.trim()) throw new Error("Enter the code");

      const r = await fetch(`${apiBaseRef.current}/auth/email/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });

      let data = null;
      try {
        data = await r.json();
      } catch {
        // ignore
      }

      if (!r.ok) {
        throw new Error(data?.error || `Invalid code (${r.status})`);
      }

      // If verify endpoint already returns a token, keep it
      if (data?.token) {
        const t = normalizeToken(data.token);
        if (t) {
          localStorage.setItem("APP_TOKEN", t);
          localStorage.setItem("appToken", t);
          localStorage.setItem("authToken", t);
        }
      }

      // Otherwise, exchange to get YOUR token
      const exchanged = await exchangeWithBackend({
        provider: "email",
        providerProfile: { email: email.trim() },
        email: email.trim(),
        code: code.trim(),
      });

      onComplete?.({ ok: true, provider: "email", exchange: exchanged });
    } catch (e) {
      setErr(e?.message || "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="w-full max-w-lg rounded-2xl border border-white/10 bg-[hsl(240,10%,6%)] shadow-2xl overflow-hidden"
          initial={{ scale: 0.96, y: 20, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.98, y: 10, opacity: 0 }}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <div>
              <div className="text-white font-semibold text-lg">Sign in</div>
              <div className="text-white/60 text-sm">
                Continue to your dashboard
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/5 text-white/70 hover:text-white"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-5 pt-4">
            <div className="flex gap-2 bg-white/5 rounded-xl p-1 border border-white/10">
              <button
                onClick={() => setTab("oauth")}
                className={`flex-1 text-sm py-2 rounded-lg ${
                  tab === "oauth" ? "bg-white/10 text-white" : "text-white/70"
                }`}
              >
                Google / Microsoft
              </button>
              <button
                onClick={() => setTab("email")}
                className={`flex-1 text-sm py-2 rounded-lg ${
                  tab === "email" ? "bg-white/10 text-white" : "text-white/70"
                }`}
              >
                Email code
              </button>
            </div>

            {err ? (
              <div className="mt-3 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                {err}
              </div>
            ) : null}

            <div className="mt-4 pb-5">
              {tab === "oauth" ? (
                <div className="space-y-3">
                  <Button
                    className="w-full justify-center gap-2"
                    variant="secondary"
                    onClick={handleGoogle}
                    disabled={loading}
                  >
                    Continue with Google
                  </Button>

                  <Button
                    className="w-full justify-center gap-2"
                    variant="secondary"
                    onClick={handleMicrosoft}
                    disabled={loading}
                  >
                    Continue with Microsoft
                  </Button>

                  <div className="text-xs text-white/50 leading-relaxed pt-2">
                    We’ll exchange your provider login for an app token used to access
                    your account APIs.
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-sm text-white/70">
                    Enter your email and we’ll send a code.
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-white/70 text-sm">
                      <Mail className="w-4 h-4" /> Email
                    </div>
                    <Input
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/40"
                    />
                  </div>

                  {!magicSent ? (
                    <Button
                      className="w-full"
                      onClick={sendMagic}
                      disabled={loading}
                    >
                      Send code
                    </Button>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <div className="text-white/70 text-sm">Code</div>
                        <Input
                          value={code}
                          onChange={(e) => setCode(e.target.value)}
                          placeholder="123456"
                          className="bg-white/5 border-white/10 text-white placeholder:text-white/40"
                        />
                      </div>
                      <Button
                        className="w-full"
                        onClick={verifyMagic}
                        disabled={loading}
                      >
                        Verify & continue
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
