// src/App.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClientInstance } from "@/lib/query-client";
import NavigationTracker from "@/lib/NavigationTracker";
import { pagesConfig } from "./pages.config";
import {
  BrowserRouter as Router,
  Route,
  Routes,
  Navigate,
} from "react-router-dom";
import PageNotFound from "./lib/PageNotFound";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { onboarding } from "@/lib/onboarding";
import ErrorBoundary from "@/components/app/ErrorBoundary";

const { Pages, Layout } = pagesConfig;

const LayoutWrapper = ({ children, currentPageName }) =>
  Layout ? (
    <Layout currentPageName={currentPageName}>{children}</Layout>
  ) : (
    <>{children}</>
  );

const Spinner = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-black">
    <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-white/10 border border-white/15">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      <span className="text-sm font-medium text-white/85">Loading…</span>
    </div>
  </div>
);

// Safely read SWA auth state (works even if AuthContext is still a stub)
async function getSwaUserId() {
  try {
    const res = await fetch("/.auth/me", { credentials: "include" });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data) return null;

    const cp = Array.isArray(data) ? data?.[0]?.clientPrincipal : data?.clientPrincipal;
    return cp?.userId || null;
  } catch {
    return null;
  }
}

function AppRoutes() {
  const auth = useAuth();

  // SWA auth check (prevents "always Landing even when logged in")
  const [swaChecked, setSwaChecked] = useState(false);
  const [swaUserId, setSwaUserId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = await getSwaUserId();
      if (cancelled) return;
      setSwaUserId(id);
      setSwaChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Loading: SWA check + any AuthContext loading flag(s)
  const loading = useMemo(() => {
    const ctxLoading =
      !!auth?.loading ||
      !!auth?.isLoadingAuth ||
      !!auth?.isLoadingPublicSettings;
    return !swaChecked || ctxLoading;
  }, [swaChecked, auth?.loading, auth?.isLoadingAuth, auth?.isLoadingPublicSettings]);

  // Authenticated: prefer SWA result when available
  const isAuthenticated = useMemo(() => {
    if (swaChecked) return !!swaUserId;
    if (typeof auth?.isAuthenticated === "boolean") return auth.isAuthenticated;
    return !!auth?.user;
  }, [swaChecked, swaUserId, auth?.isAuthenticated, auth?.user]);

  // Onboarding step (pricing -> setup -> done)
  const step = useMemo(() => {
    if (!isAuthenticated) return "done";
    try {
      return onboarding.getNextStep(); // "pricing" | "setup" | "done"
    } catch {
      return "done";
    }
  }, [isAuthenticated]);

  const nextPath = useMemo(() => {
    if (loading) return null;
    if (!isAuthenticated) return "/Landing";
    if (step === "pricing") return "/Pricing";
    if (step === "setup") return "/Setup";
    return "/AppHome";
  }, [loading, isAuthenticated, step]);

  const Index = () => {
    if (loading) return <Spinner />;
    return <Navigate to={nextPath || "/Landing"} replace />;
  };

  const Gate = ({ pageName, children }) => {
    if (loading) return <Spinner />;

    // Landing is public-only (if already logged in, push forward)
    if (pageName === "Landing") {
      if (isAuthenticated) return <Navigate to={nextPath || "/AppHome"} replace />;
      return <>{children}</>;
    }

    // Everything else requires auth
    if (!isAuthenticated) return <Navigate to="/Landing" replace />;

    // Enforce onboarding order: Pricing -> Setup -> AppHome
    if (step === "pricing" && pageName !== "Pricing") {
      return <Navigate to="/Pricing" replace />;
    }
    if (step === "setup" && pageName !== "Setup") {
      return <Navigate to="/Setup" replace />;
    }

    return <>{children}</>;
  };

  return (
    <Routes>
      <Route path="/" element={<Index />} />

      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <Gate pageName={path}>
              <LayoutWrapper currentPageName={path}>
                <Page />
              </LayoutWrapper>
            </Gate>
          }
        />
      ))}

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <NavigationTracker />
          <ErrorBoundary
            fallback={
              <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
                <div className="max-w-md w-full rounded-2xl border border-white/10 bg-white/5 p-6">
                  <div className="text-xl font-semibold mb-2">Something crashed</div>
                  <div className="text-sm text-white/70 mb-4">
                    Open DevTools → Console to see the error. If this keeps happening,
                    refresh the page.
                  </div>
                  <button
                    className="px-4 py-2 rounded-xl bg-white/10 border border-white/15 hover:bg-white/15"
                    onClick={() => window.location.reload()}
                  >
                    Refresh
                  </button>
                </div>
              </div>
            }
          >
            <AppRoutes />
          </ErrorBoundary>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}
