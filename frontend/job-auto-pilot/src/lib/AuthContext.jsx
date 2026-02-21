import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { clearAppToken, getAppToken } from "@/lib/appSession";

/**
 * Azure Static Web Apps auth context:
 * - Reads login state from /.auth/me (cookie-based)
 * - Provides login/logout helpers
 */

const AuthContext = createContext({
  user: null,
  isAuthenticated: false,
  loading: true,
  refreshAuth: async () => {},

  // helpers
  login: async (_provider) => {},
  logout: async () => {},
  navigateToLogin: (_provider) => {},
});

function parseClientPrincipal(data) {
  // SWA can return either:
  // 1) [{ clientPrincipal: {...} }]
  // 2) { clientPrincipal: {...} }
  const cp = Array.isArray(data) ? data?.[0]?.clientPrincipal : data?.clientPrincipal;
  if (!cp || !cp.userId) return null;
  return cp;
}

function normalizeTokenUser(data) {
  const u = data?.user;
  if (!u?.userId) return null;
  const email = String(u.email || "").trim() || null;
  const provider = String(u.provider || "email").trim() || "email";
  return {
    userId: u.userId,
    userDetails: email || u.userId,
    identityProvider: provider,
    claims: email ? [{ typ: "emails", val: email }] : [],
    authType: "appToken",
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshAuth = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/.auth/me", { credentials: "include" });

      // In local dev, /.auth/me often 404s -> treat as logged out
      if (res.ok) {
        const data = await res.json().catch(() => null);
        const cp = parseClientPrincipal(data);
        if (cp) {
          setUser({ ...cp, authType: "swa" });
          return;
        }
      }

      const appToken = getAppToken();
      if (!appToken) {
        setUser(null);
        return;
      }

      const who = await fetch("/api/userinfo", {
        method: "GET",
        credentials: "include",
      });

      if (!who.ok) {
        clearAppToken();
        setUser(null);
        return;
      }

      const whoData = await who.json().catch(() => null);
      const tokenUser = normalizeTokenUser(whoData);
      if (!tokenUser) {
        clearAppToken();
        setUser(null);
        return;
      }

      setUser(tokenUser);
    } catch (e) {
      console.error("Auth refresh failed:", e);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  const isAuthenticated = !!user;

  // Valid examples: "microsoft", "google", "aad", "github", "twitter"
  const getProvider = (override) =>
    override || import.meta.env.VITE_SWA_AUTH_PROVIDER || "microsoft";

  const navigateToLogin = useCallback((providerOverride) => {
    const provider = getProvider(providerOverride);
    const postLogin = `${window.location.origin}/`; // always come back to root
    const url = `/.auth/login/${encodeURIComponent(
      provider
    )}?post_login_redirect_uri=${encodeURIComponent(postLogin)}`;

    window.location.assign(url);
  }, []);

  const login = useCallback(async (providerOverride) => {
    navigateToLogin(providerOverride);
  }, [navigateToLogin]);

  const logout = useCallback(async () => {
    clearAppToken();
    const postLogout = `${window.location.origin}/`;
    if (user?.authType === "appToken") {
      setUser(null);
      setLoading(false);
      window.location.assign(postLogout);
      return;
    }
    const url = `/.auth/logout?post_logout_redirect_uri=${encodeURIComponent(postLogout)}`;
    window.location.assign(url);
  }, [user?.authType]);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated,
      loading,
      refreshAuth,
      login,
      logout,
      navigateToLogin,
    }),
    [user, isAuthenticated, loading, refreshAuth, login, logout, navigateToLogin]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
