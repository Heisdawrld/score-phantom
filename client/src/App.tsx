import React, { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";

import Login from "@/pages/Login";

// Global error boundary
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', background: '#080b10', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui' }}>
          <img src="/images/logo.png" alt="ScorePhantom" style={{ width: 120, marginBottom: 24, opacity: 0.8 }} />
          <p style={{ color: '#10e774', fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Something went wrong</p>
          <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24, textAlign: 'center' }}>Please refresh the page to continue.</p>
          <button
            onClick={() => window.location.reload()}
            style={{ background: '#10e774', color: '#000', fontWeight: 700, padding: '10px 24px', borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 14 }}
          >
            Refresh App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

import Signup from "@/pages/Signup";
import Dashboard from "@/pages/Dashboard";
import Paywall from "@/pages/Paywall";
import ResetPassword from "@/pages/ResetPassword";
import Admin from "@/pages/Admin";
import TrackRecord from "@/pages/TrackRecord";
import TopPicksToday from "@/pages/TopPicksToday";
import PredictionResults from "@/pages/PredictionResults";
import LeagueFavorites from "@/pages/LeagueFavorites";
import AccaCalculator from "@/pages/AccaCalculator";
import Landing from "@/pages/Landing";
import Terms from "@/pages/Terms";
import Privacy from "@/pages/Privacy";
import { UpdateBanner } from "@/components/UpdateBanner";
import { InstallPrompt } from "@/components/InstallPrompt";
import { BottomNav } from "@/components/layout/BottomNav";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function RedirectTo({ path }: { path: string }) {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation(path); }, [path, setLocation]);
  return null;
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { data: user, isLoading, error } = useAuth();
  // (Sign in required toast removed - redirect to login is sufficient UX)

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
      </div>
    );
  }

  if (error || !user) {
    return <RedirectTo path="/login" />;
  }

  return <Component />;
}


// VerifyEmailHandler removed — Google Auth handles email verification

function Router() {
  return (
    <Switch>
      <Route path="/home" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/signup" component={Signup} />
      <Route path="/terms" component={Terms} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/paywall" component={() => <ProtectedRoute component={Paywall} />} />
      <Route path="/admin" component={Admin} />
      <Route path="/track-record" component={() => <ProtectedRoute component={TrackRecord} />} />
      <Route path="/top-picks" component={() => <ProtectedRoute component={TopPicksToday} />} />
      <Route path="/results" component={() => <ProtectedRoute component={PredictionResults} />} />
      <Route path="/league-favorites" component={() => <ProtectedRoute component={LeagueFavorites} />} />
      <Route path="/acca-calculator" component={() => <ProtectedRoute component={AccaCalculator} />} />
      <Route path="/" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route component={() => <ProtectedRoute component={Dashboard} />} />
    </Switch>
  );
}

// Capture ?ref= param from URL and persist in localStorage for referral tracking
function ReferralCapture() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref && ref.trim()) {
      localStorage.setItem("sp_referral_code", ref.trim());
    }
  }, []);
  return null;
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <ReferralCapture />
            <Router />
          </WouterRouter>
          <Toaster />
          <UpdateBanner />
          <InstallPrompt />
          <BottomNav />
          {/* VerifyEmailHandler removed — Google Auth */}
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
