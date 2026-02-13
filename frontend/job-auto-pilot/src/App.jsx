import React from "react";
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
import { AuthProvider } from "@/lib/AuthContext";
import AuthGate from "@/components/app/AuthGate";
import { useAuth } from "@/hooks/useAuth";
import { onboarding } from "@/lib/onboarding";

const { Pages, Layout } = pagesConfig;

const LayoutWrapper = ({ children, currentPageName }) =>
  Layout ? (
    <Layout currentPageName={currentPageName}>{children}</Layout>
  ) : (
    <>{children}</>
  );

const Spinner = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
  </div>
);

// Decides where "/" should go
const IndexRedirect = () => {
  const { status, nextRoute } = useAuth();

  if (status === "loading") return <Spinner />;
  return <Navigate to={nextRoute || "/Landing"} replace />;
};

// Blocks skipping steps (Pricing -> Setup -> AppHome)
const OnboardingGate = ({ step, children }) => {
  const { status, isAuthenticated, isNewUser } = useAuth();

  if (status === "loading") return <Spinner />;
  if (!isAuthenticated) return <Navigate to="/Landing" replace />;

  // If backend says new user, always force pricing first
  if (isNewUser) {
    if (step !== "pricing") return <Navigate to="/Pricing" replace />;
    return <>{children}</>;
  }

  const next = onboarding.getNextStep(); // "pricing" | "setup" | "done"

  if (next === "done") return <Navigate to="/AppHome" replace />;
  if (next !== step) {
    return <Navigate to={next === "pricing" ? "/Pricing" : "/Setup"} replace />;
  }

  return <>{children}</>;
};

const AppRoutes = () => {
  const { status, isAuthenticated, nextRoute } = useAuth();

  if (status === "loading") return <Spinner />;

  const LandingPage = Pages["Landing"];
  const PricingPage = Pages["Pricing"];
  const SetupPage = Pages["Setup"];
  const HomePage = Pages["AppHome"];

  return (
    <Routes>
      {/* Smart root */}
      <Route path="/" element={<IndexRedirect />} />

      {/* Landing is public, but if authed -> send them onward */}
      <Route
        path="/Landing"
        element={
          isAuthenticated ? (
            <Navigate to={nextRoute || "/AppHome"} replace />
          ) : LandingPage ? (
            <LayoutWrapper currentPageName="Landing">
              <LandingPage />
            </LayoutWrapper>
          ) : (
            <PageNotFound />
          )
        }
      />

      {/* Pricing: must be logged in + must be correct onboarding step */}
      <Route
        path="/Pricing"
        element={
          <OnboardingGate step="pricing">
            <LayoutWrapper currentPageName="Pricing">
              {PricingPage ? <PricingPage /> : <PageNotFound />}
            </LayoutWrapper>
          </OnboardingGate>
        }
      />

      {/* Setup: must be logged in + must be correct onboarding step */}
      <Route
        path="/Setup"
        element={
          <OnboardingGate step="setup">
            <LayoutWrapper currentPageName="Setup">
              {SetupPage ? <SetupPage /> : <PageNotFound />}
            </LayoutWrapper>
          </OnboardingGate>
        }
      />

      {/* AppHome (and everything else): requires login */}
      <Route
        path="/AppHome"
        element={
          <AuthGate mode="protected" redirectTo="/Landing">
            <LayoutWrapper currentPageName="AppHome">
              {HomePage ? <HomePage /> : <PageNotFound />}
            </LayoutWrapper>
          </AuthGate>
        }
      />

      {/* All other pages are protected by default */}
      {Object.entries(Pages).map(([path, Page]) => {
        if (["Landing", "Pricing", "Setup", "AppHome"].includes(path)) return null;

        return (
          <Route
            key={path}
            path={`/${path}`}
            element={
              <AuthGate mode="protected" redirectTo="/Landing">
                <LayoutWrapper currentPageName={path}>
                  <Page />
                </LayoutWrapper>
              </AuthGate>
            }
          />
        );
      })}

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
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

export default App;
