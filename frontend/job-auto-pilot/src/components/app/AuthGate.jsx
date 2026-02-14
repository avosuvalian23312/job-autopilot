// src/components/app/AuthGate.jsx
import React, { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

/**
 * mode:
 *  - "protected": requires login. if anonymous -> redirectTo
 *  - "publicOnly": only for logged-out pages. if authenticated -> redirectTo
 *  - "public": always render (no redirects)
 */
export default function AuthGate({
  mode = "protected",
  redirectTo = "/",
  loadingLabel = "Checking login…",
  children,
}) {
  const { status, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (status === "loading") return;
    if (mode === "public") return; // ✅ never redirect

    const shouldRedirectProtected = mode === "protected" && !isAuthenticated;
    const shouldRedirectPublicOnly = mode === "publicOnly" && isAuthenticated;

    if (shouldRedirectProtected || shouldRedirectPublicOnly) {
      if (location.pathname !== redirectTo) {
        navigate(redirectTo, { replace: true });
      }
    }
  }, [status, isAuthenticated, mode, redirectTo, navigate, location.pathname]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-white/10 border border-white/15">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-medium text-white/85">
            {loadingLabel}
          </span>
        </div>
      </div>
    );
  }

  if (mode === "public") return <>{children}</>;

  if (mode === "protected" && !isAuthenticated) return null;
  if (mode === "publicOnly" && isAuthenticated) return null;

  return <>{children}</>;
}
