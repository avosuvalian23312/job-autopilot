import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

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

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshAuth = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/.auth/me", { credentials: "include" });

      // In local dev, /.auth/me often 404s -> treat as logged out
      if (!res.ok) {
        setUser(null);
        return;
      }

      const data = await res.json().catch(() => null);
      const cp = parseClientPrincipal(data);

      setUser(cp || null);
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
    const postLogout = `${window.location.origin}/`;
    const url = `/.auth/logout?post_logout_redirect_uri=${encodeURIComponent(postLogout)}`;
    window.location.assign(url);
  }, []);

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
