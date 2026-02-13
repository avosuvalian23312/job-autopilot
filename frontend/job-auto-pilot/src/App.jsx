// src/App.jsx
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
import ErrorBoundary from "@/components/app/ErrorBoundary";

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

  // Support both your old + new auth shapes
  const loading = !!auth?.isLoadingAuth || !!auth?.loading;

  const isAuthenticated = useMemo(() => {
    if (typeof auth?.isAuthenticated === "boolean") return auth.isAuthenticated;
    return !!auth?.user;
  }, [auth?.isAuthenticated, auth?.user]);

  const nextPath = useMemo(() => {
    if (loading) return null;
    if (!isAuthenticated) return "/Landing";

    const step = onboarding.getNextStep(); // pricing | setup | done
    if (step === "pricing") return "/Pricing";
    if (step === "setup") return "/Setup";
    return "/AppHome";
  }, [loading, isAuthenticated]);

  const Index = () => {
    if (loading) return <Spinner />;
    return <Navigate to={nextPath || "/Landing"} replace />;
  };

  const Gate = ({ pageName, children }) => {
    if (loading) return <Spinner />;

    // Landing: logged-out only
    if (pageName === "Landing") {
      if (isAuthenticated) return <Navigate to={nextPath || "/AppHome"} replace />;
      return <>{children}</>;
    }

    // Everything else requires auth
    if (!isAuthenticated) return <Navigate to="/Landing" replace />;

    // Onboarding enforcement
    const step = onboarding.getNextStep();

    if (step === "pricing" && pageName !== "Pricing") {
      return <Navigate to="/Pricing" replace />;
    }

    if (step === "setup" && pageName !== "Setup") {
      return <Navigate to="/Setup" replace />;
    }

    // Prevent skipping ordering
    if (pageName === "Setup" && step !== "setup") {
      return <Navigate to="/Pricing" replace />;
    }

    if (pageName === "Pricing" && step !== "pricing") {
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
          <ErrorBoundary>
            <AppRoutes />
          </ErrorBoundary>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}
