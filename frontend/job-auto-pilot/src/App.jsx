// src/App.jsx
import React, { useMemo } from "react";
import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { queryClientInstance } from "@/lib/query-client";
import NavigationTracker from "@/lib/NavigationTracker";
import { pagesConfig } from "./pages.config";
import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom";
import PageNotFound from "./lib/PageNotFound";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import ErrorBoundary from "@/components/app/ErrorBoundary";

const { Pages, Layout } = pagesConfig;

const LayoutWrapper = ({ children, currentPageName }) =>
  Layout ? <Layout currentPageName={currentPageName}>{children}</Layout> : <>{children}</>;

const Spinner = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
  </div>
);

async function fetchJson(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  return { ok: res.ok, status: res.status, data };
}

function extractSwaUserId(authMeData) {
  // SWA /.auth/me usually returns an array of identities
  if (Array.isArray(authMeData) && authMeData[0]?.userId) return authMeData[0].userId;

  // some wrappers return { clientPrincipal: { userId } }
  if (authMeData?.clientPrincipal?.userId) return authMeData.clientPrincipal.userId;

  return null;
}

function computeOnboardingStep({ isAuthenticated, authUserId, profile }) {
  if (!isAuthenticated) {
    return { step: "anon", pricingDone: false, setupDone: false, mismatch: false };
  }

  const profUserId = profile?.userId || profile?.id || null;
  const mismatch = !!(authUserId && profUserId && authUserId !== profUserId);

  // If mismatch, force onboarding (protects against “shared profile” Cosmos bug)
  if (mismatch) {
    return { step: "pricing", pricingDone: false, setupDone: false, mismatch: true };
  }

  const onboarding = profile?.onboarding || {};
  const pricingDone = !!onboarding.pricingDone;
  const setupDone = !!onboarding.setupDone;

  if (!pricingDone) return { step: "pricing", pricingDone, setupDone, mismatch: false };
  if (!setupDone) return { step: "setup", pricingDone, setupDone, mismatch: false };
  return { step: "done", pricingDone, setupDone, mismatch: false };
}

function AppRoutes() {
  const auth = useAuth();

  // Support both your old + new auth shapes
  const loadingAuth = !!auth?.isLoadingAuth || !!auth?.loading;

  const isAuthenticated = useMemo(() => {
    if (typeof auth?.isAuthenticated === "boolean") return auth.isAuthenticated;
    return !!auth?.user;
  }, [auth?.isAuthenticated, auth?.user]);

  // ✅ Debug override: /Pricing?force=pricing bypasses onboarding redirects
  const forcePricing = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get("force") === "pricing";
    } catch {
      return false;
    }
  }, []);

  // Cloud onboarding truth:
  // - /.auth/me -> auth userId
  // - /api/profile/me -> onboarding flags stored in Cosmos
  const onboardingQuery = useQuery({
    queryKey: ["onboarding:me"],
    enabled: !loadingAuth && isAuthenticated,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    queryFn: async () => {
      const [authMe, profMe] = await Promise.all([
        fetchJson("/.auth/me"),
        fetchJson("/api/profile/me"),
      ]);

      const authUserId = extractSwaUserId(authMe.data);

      // profile/me should return { ok:true, profile:{...} }
      const profile = profMe.ok && profMe.data?.ok ? (profMe.data.profile || null) : null;

      return {
        authUserId,
        profile,
        profStatus: profMe.status,
        profOk: profMe.ok,
      };
    },
  });

  const onboarding = useMemo(() => {
    if (!isAuthenticated) {
      return { step: "anon", pricingDone: false, setupDone: false, mismatch: false };
    }

    // While profile is loading, block routing with Spinner in Gate/Index
    if (onboardingQuery.isLoading) {
      return { step: "loading", pricingDone: false, setupDone: false, mismatch: false };
    }

    // If backend is down, default to pricing (safe)
    if (onboardingQuery.isError || !onboardingQuery.data) {
      return { step: "pricing", pricingDone: false, setupDone: false, mismatch: false };
    }

    return computeOnboardingStep({
      isAuthenticated,
      authUserId: onboardingQuery.data.authUserId,
      profile: onboardingQuery.data.profile,
    });
  }, [isAuthenticated, onboardingQuery.isLoading, onboardingQuery.isError, onboardingQuery.data]);

  const nextPath = useMemo(() => {
    if (loadingAuth) return null;
    if (!isAuthenticated) return "/Landing";
    if (onboarding.step === "loading") return null;
    if (onboarding.step === "pricing") return "/Pricing";
    if (onboarding.step === "setup") return "/Setup";
    return "/AppHome";
  }, [loadingAuth, isAuthenticated, onboarding.step]);

  const Index = () => {
    if (loadingAuth) return <Spinner />;
    if (isAuthenticated && onboarding.step === "loading") return <Spinner />;
    return <Navigate to={nextPath || "/Landing"} replace />;
  };

  const Gate = ({ pageName, children }) => {
    if (loadingAuth) return <Spinner />;

    // Landing: logged-out only
    if (pageName === "Landing") {
      if (isAuthenticated) {
        if (onboarding.step === "loading") return <Spinner />;
        return <Navigate to={nextPath || "/AppHome"} replace />;
      }
      return <>{children}</>;
    }

    // Everything else requires auth
    if (!isAuthenticated) return <Navigate to="/Landing" replace />;

    // Wait until we know onboarding state
    if (onboarding.step === "loading") return <Spinner />;

    // ✅ Allow forcing Pricing for Stripe testing (bypass onboarding redirects)
    if (pageName === "Pricing" && forcePricing) return <>{children}</>;

    // Enforce onboarding order (cloud truth)
    if (onboarding.step === "pricing" && pageName !== "Pricing") {
      return <Navigate to="/Pricing" replace />;
    }

    if (onboarding.step === "setup" && pageName !== "Setup") {
      return <Navigate to="/Setup" replace />;
    }

    // Prevent skipping / wrong ordering
    if (pageName === "Setup" && onboarding.step !== "setup") {
      return <Navigate to="/Pricing" replace />;
    }

    if (pageName === "Pricing" && onboarding.step !== "pricing") {
      // if pricing is done, send to Setup (or AppHome if setup also done)
      return <Navigate to={nextPath || "/AppHome"} replace />;
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
          <ErrorBoundary>
            <AppRoutes />
          </ErrorBoundary>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
  
}