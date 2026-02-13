import React, { useMemo } from "react";
import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClientInstance } from "@/lib/query-client";
import NavigationTracker from "@/lib/NavigationTracker";
import { pagesConfig } from "./pages.config";
import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom";
import PageNotFound from "./lib/PageNotFound";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { onboarding } from "@/lib/onboarding";

const { Pages, Layout } = pagesConfig;

const LayoutWrapper = ({ children, currentPageName }) =>
  Layout ? <Layout currentPageName={currentPageName}>{children}</Layout> : <>{children}</>;

const Spinner = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
  </div>
);

function AppRoutes() {
  const auth = useAuth();
  const { isLoadingAuth, isLoadingPublicSettings, authError } = auth;

  const loading = isLoadingAuth || isLoadingPublicSettings;

  // treat auth_required as logged-out; user_not_registered is "logged in but not onboarded/registered"
  const isAuthenticated = useMemo(() => {
    if (authError?.type === "auth_required") return false;

    // if your AuthContext exposes a boolean, prefer it
    if (typeof auth.isAuthenticated === "boolean") return auth.isAuthenticated;

    // otherwise rely on your existing pattern (no auth_required => authenticated)
    return true;
  }, [authError?.type, auth.isAuthenticated]);

  const isNewUser = authError?.type === "user_not_registered";

  const nextPath = useMemo(() => {
    if (loading) return null;
    if (!isAuthenticated) return "/Landing";

    if (isNewUser) {
      const step = onboarding.getNextStep(); // pricing | setup | done
      if (step === "pricing") return "/Pricing";
      if (step === "setup") return "/Setup";
      return "/AppHome";
    }

    return "/AppHome";
  }, [loading, isAuthenticated, isNewUser]);

  // Root decision: "/" always routes to the correct place
  const Index = () => {
    if (loading) return <Spinner />;
    return <Navigate to={nextPath || "/Landing"} replace />;
  };

  // Gate wrapper per page
  const Gate = ({ pageName, children }) => {
    if (loading) return <Spinner />;

    // Landing is public-only: if logged in, push them forward
    if (pageName === "Landing") {
      if (isAuthenticated) return <Navigate to={nextPath || "/AppHome"} replace />;
      return <>{children}</>;
    }

    // everything else requires auth
    if (!isAuthenticated) return <Navigate to="/Landing" replace />;

    // onboarding enforcement for first-time users
    if (isNewUser) {
      const step = onboarding.getNextStep();
      const mustBe =
        step === "pricing" ? "Pricing" : step === "setup" ? "Setup" : null;

      if (mustBe && pageName !== mustBe) {
        return <Navigate to={mustBe === "Pricing" ? "/Pricing" : "/Setup"} replace />;
      }

      // additionally, don’t let them view Setup if Pricing not done
      if (pageName === "Setup" && step !== "setup") {
        return <Navigate to="/Pricing" replace />;
      }

      // don’t let them view Pricing if it’s already done
      if (pageName === "Pricing" && step !== "pricing") {
        return <Navigate to="/Setup" replace />;
      }
    }

    return <>{children}</>;
  };

  return (
    <Routes>
      {/* Smart root */}
      <Route path="/" element={<Index />} />

      {/* Auto routes for every page */}
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
          <AppRoutes />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}
