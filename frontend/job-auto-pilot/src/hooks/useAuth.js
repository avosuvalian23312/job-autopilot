import { useAuth as useAuthContext } from "@/lib/AuthContext";

/**
 * Compatibility hook:
 * Many pages/components may still import useAuth from "@/hooks/useAuth".
 * This wrapper keeps those imports working while using the real SWA auth.
 *
 * IMPORTANT: No JSX in here. Hooks must return data only.
 */
export function useAuth() {
  const ctx = useAuthContext();

  const status = ctx.loading
    ? "loading"
    : ctx.isAuthenticated
    ? "authenticated"
    : "anonymous";

  return {
    // new fields
    ...ctx,
    status,

    // old fields some of your code expects
    isLoadingAuth: ctx.loading,
    isLoadingPublicSettings: false,
    authError: null,
    navigateToLogin: ctx.navigateToLogin,
  };
}
