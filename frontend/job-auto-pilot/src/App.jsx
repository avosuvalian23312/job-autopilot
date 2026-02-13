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
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import UserNotRegisteredError from "@/components/UserNotRegisteredError";
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

// Your AuthContext already uses authError.type === 'auth_required' when not logged in.
// We'll treat anything that's NOT auth_required as "logged in" for routing purposes.
const useAuthStatus = () => {
  const { authError, isAuthenticated, user } = useAuth();

  const isAnonymous = authError?.type === "auth_required";

  // Prefer explicit boolean if your context provides it
  const authed =
    typeof isAuthenticated === "boolean" ? isAuthenticated : !!user || !isAnonymous;

  return { isAnonymous, authed };
};

// ✅ Root: decides where to go
const IndexRedirect = () => {
  const { isAnonymous } = useAuthStatus();

  if (isAnonymous) return <Navigate to="/Landing" replace />;

  const step = onboarding.getNextStep();
  if (step === "pricing") return <Navigate to="/Pricing" replace />;
  if (step === "setup") return <Navigate to="/Setup" replace />;
  return <Navigate to="/AppHome" replace />;
};

// ✅ Protect pages from anonymous users
const RequireAuth = ({ children }) => {
  const { isAnonymous } = useAuthStatus();
  if (isAnonymous) return <Navigate to="/Landing" replace />;
  return <>{children}</>;
};

// ✅ If user is logged in and onboarding done, don't allow going back to onboarding pages
const OnboardingOnly = ({ children }) => {
  const { isAnonymous } = useAuthStatus();
  if (isAnonymous) return <Navigate to="/Landing" replace />;

  const step = onboarding.getNextStep();
  if (step === "done") return <Navigate to="/AppHome" replace />;

  return <>{children}</>;
};

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) return <Spinner />;

  // Keep your existing gating for "user_not_registered"
  // If you want "new user" to go Pricing instead of error screen, tell me
  // and we'll replace this with Pricing+Setup flow.
  if (authError?.type === "user_not_registered") {
    return <UserNotRegisteredError />;
  }

  return (
    <Routes>
      {/* ✅ Smart root */}
      <Route path="/" element={<IndexRedirect />} />

      {/* ✅ Landing: always accessible (anonymous) but if logged in, jump to the correct place */}
      <Route
        path="/Landing"
        element={<IndexRedirect />}
      />

      {/* ✅ Pricing: only during onboarding */}
      <Route
        path="/Pricing"
        element={
          <OnboardingOnly>
            <LayoutWrapper currentPageName="Pricing">
              {Pages["Pricing"] ? <Pages["Pricing"] /> : <PageNotFound />}
            </LayoutWrapper>
          </OnboardingOnly>
        }
      />

      {/* ✅ Setup: only during onboarding */}
      <Route
        path="/Setup"
        element={
          <OnboardingOnly>
            <LayoutWrapper currentPageName="Setup">
              {Pages["Setup"] ? <Pages["Setup"] /> : <PageNotFound />}
            </LayoutWrapper>
          </OnboardingOnly>
        }
      />

      {/* ✅ Home: requires auth */}
      <Route
        path="/AppHome"
        element={
          <RequireAuth>
            <LayoutWrapper currentPageName="AppHome">
              {Pages["AppHome"] ? <Pages["AppHome"] /> : <PageNotFound />}
            </LayoutWrapper>
          </RequireAuth>
        }
      />

      {/* ✅ Everything else: requires auth by default */}
      {Object.entries(Pages).map(([path, Page]) => {
        if (["Landing", "Pricing", "Setup", "AppHome"].includes(path)) return null;

        return (
          <Route
            key={path}
            path={`/${path}`}
            element={
              <RequireAuth>
                <LayoutWrapper currentPageName={path}>
                  <Page />
                </LayoutWrapper>
              </RequireAuth>
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
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;
