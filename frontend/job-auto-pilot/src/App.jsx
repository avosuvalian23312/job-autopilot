// src/App.jsx
import React, { useEffect, useMemo } from "react";
import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { queryClientInstance } from "@/lib/query-client";
import NavigationTracker from "@/lib/NavigationTracker";
import { pagesConfig } from "./pages.config";
import {
  BrowserRouter as Router,
  Route,
  Routes,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
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

function resolvePath(target) {
  const keys = Object.keys(Pages || {});
  const key = keys.find((k) => k.toLowerCase() === String(target).toLowerCase());
  const p = `/${key || target}`;
  return p.startsWith("/") ? p : `/${p}`;
}

const LANDING_PATH = resolvePath("Landing");
const PRICING_PATH = resolvePath("Pricing");
const SETUP_PATH = resolvePath("Setup");
const APPHOME_PATH = resolvePath("AppHome");

/**
 * Normalizes trailing slashes:
 *   /Setup/  -> /Setup
 *   /Pricing/ -> /Pricing
 * Avoids route mismatches + accidental redirects.
 */
function TrailingSlashNormalizer() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const { pathname, search, hash } = location;
    if (pathname.length > 1 && pathname.endsWith("/")) {
      const nextPath = pathname.replace(/\/+$/, "") || "/";
      navigate(`${nextPath}${search}${hash}`, { replace: true });
    }
  }, [location.pathname, location.search, location.hash, navigate]);

  return null;
}

function AppRoutes() {
  const auth = useAuth();
  const location = useLocation();

  // Support both your old + new auth shapes
  const loadingAuth = !!auth?.isLoadingAuth || !!auth?.loading;

  const isAuthenticated = useMemo(() => {
    if (typeof auth?.isAuthenticated === "boolean") return auth.isAuthenticated;
    return !!auth?.user;
  }, [auth?.isAuthenticated, auth?.user]);

  // ✅ Debug override: /Pricing?force=pricing bypasses onboarding redirects
  const forcePricing = useMemo(() => {
    try {
      return new URLSearchParams(location.search).get("force") === "pricing";
    } catch {
      return false;
    }
  }, [location.search]);

  // Stripe return info (ONLY from URL, no localStorage)
  const stripeSessionId = useMemo(() => {
    try {
      return new URLSearchParams(location.search).get("session_id");
    } catch {
      return null;
    }
  }, [location.search]);

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

  const effectiveOnboarding = onboarding;

  // Optional: if Stripe returned with session_id, trigger a one-time refetch
  useEffect(() => {
    if (!stripeSessionId) return;
    if (!isAuthenticated) return;
    if (loadingAuth) return;
    if (typeof onboardingQuery.refetch === "function") onboardingQuery.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripeSessionId, isAuthenticated, loadingAuth]);

  const nextPath = useMemo(() => {
    if (loadingAuth) return null;
    if (!isAuthenticated) return LANDING_PATH;
    if (effectiveOnboarding.step === "loading") return null;
    if (effectiveOnboarding.step === "pricing") return PRICING_PATH;
    if (effectiveOnboarding.step === "setup") return SETUP_PATH;
    return APPHOME_PATH;
  }, [loadingAuth, isAuthenticated, effectiveOnboarding.step]);

  const Index = () => {
    if (loadingAuth) return <Spinner />;
    if (isAuthenticated && effectiveOnboarding.step === "loading") return <Spinner />;
    return <Navigate to={nextPath || LANDING_PATH} replace />;
  };

  const Gate = ({ pageName, children }) => {
    const page = String(pageName || "");
    const pageLower = page.toLowerCase();

    if (loadingAuth) return <Spinner />;

    // Landing: logged-out only
    if (pageLower === "landing") {
      if (isAuthenticated) {
        if (effectiveOnboarding.step === "loading") return <Spinner />;
        return <Navigate to={nextPath || APPHOME_PATH} replace />;
      }
      return <>{children}</>;
    }

    // Everything else requires auth
    if (!isAuthenticated) return <Navigate to={LANDING_PATH} replace />;

    // Wait until we know onboarding state
    if (effectiveOnboarding.step === "loading") return <Spinner />;

    // ✅ Allow forcing Pricing for testing (bypass onboarding redirects)
    if (pageLower === "pricing" && forcePricing) return <>{children}</>;

    // If we're in setup step, keep user in setup until done
    if (effectiveOnboarding.step === "setup" && pageLower !== "setup") {
      const qs = stripeSessionId ? `?session_id=${encodeURIComponent(stripeSessionId)}` : "";
      return <Navigate to={`${SETUP_PATH}${qs}`} replace />;
    }

    // Enforce onboarding order (cloud truth)
    if (effectiveOnboarding.step === "pricing" && pageLower !== "pricing") {
      return <Navigate to={PRICING_PATH} replace />;
    }

    // If user tries to visit Pricing after pricing is complete, bounce forward
    if (pageLower === "pricing" && effectiveOnboarding.step !== "pricing") {
      if (effectiveOnboarding.step === "setup") {
        const qs = stripeSessionId ? `?session_id=${encodeURIComponent(stripeSessionId)}` : "";
        return <Navigate to={`${SETUP_PATH}${qs}`} replace />;
      }
      return <Navigate to={nextPath || APPHOME_PATH} replace />;
    }

    // If onboarding is already complete, do not allow staying on Setup.
    if (pageLower === "setup" && effectiveOnboarding.step === "done") {
      return <Navigate to={nextPath || APPHOME_PATH} replace />;
    }

    return <>{children}</>;
  };

  return (
    <>
      <TrailingSlashNormalizer />
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
    </>
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
