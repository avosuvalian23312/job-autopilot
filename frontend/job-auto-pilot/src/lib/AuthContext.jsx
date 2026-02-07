import { createContext, useContext, useEffect, useState } from "react";

/**
 * Base44 fully removed.
 * This is a lightweight auth stub so the UI runs cleanly
 * on Azure Static Web Apps.
 */

const AuthContext = createContext({
  user: null,
  isAuthenticated: false,
  loading: false,
  login: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading] = useState(false);

  useEffect(() => {
    // No persisted auth (stub)
    setUser(null);
  }, []);

  const login = async () => {
    setUser({ role: "user" });
  };

  const logout = async () => {
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        loading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
