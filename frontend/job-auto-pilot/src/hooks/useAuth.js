// src/hooks/useAuth.js
import { useMemo } from "react";
import { useAuth as useAuthContext } from "@/lib/AuthContext";
import { onboarding } from "@/lib/onboarding";

export const useAuth = () => {
  const ctx = useAuthContext();
  const { isLoadingAuth, isLoadingPublicSettings, authError } = ctx;

  const status = useMemo(() => {
    if (isLoadingAuth || isLoadingPublicSettings) return "loading";
    if (authError?.type === "auth_required") return "anonymous";
    return "authenticated";
  }, [isLoadingAuth, isLoadingPublicSettings, authError?.type]);

  const isAuthenticated = status === "authenticated";
  const isNewUser = isAuthenticated && authError?.type === "user_not_registered";

  const nextRoute = useMemo(() => {
    if (status === "loading") return null;
    if (!isAuthenticated) return "/Landing";

    // first-time login flow
    if (isNewUser) {
      const step = onboarding.getNextStep();
      if (step === "pricing") return "/Pricing";
      if (step === "setup") return "/Setup";
      return "/AppHome";
    }

    // already onboarded
    return "/AppHome";
  }, [status, isAuthenticated, isNewUser]);

  return {
    ...ctx,
    status,
    isAuthenticated,
    isNewUser,
    nextRoute,
  };
};
