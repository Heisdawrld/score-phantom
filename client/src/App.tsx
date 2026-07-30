import React, { lazy, Suspense, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";

const Login = lazy(() => import("@/pages/Login"));
const Signup = lazy(() => import("@/pages/Signup"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Basketball = lazy(() => import("@/pages/Basketball"));
const BasketballGame = lazy(() => import("@/pages/BasketballGame"));
const BasketballAdmin = lazy(() => import("@/pages/BasketballAdmin"));
const Paywall = lazy(() => import("@/pages/Paywall"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const Admin = lazy(() => import("@/pages/Admin"));
const TrackRecord = lazy(() => import("@/pages/TrackRecord"));
const TopPicksToday = lazy(() => import("@/pages/TopPicksToday"));
const PredictionResults = lazy(() => import("@/pages/PredictionResults"));
const LeagueFavorites = lazy(() => import("@/pages/LeagueFavorites"));
const AccaCalculator = lazy(() => import("@/pages/AccaCalculator"));
const Matches = lazy(() => import("@/pages/Matches"));
const MatchCenter = lazy(() => import("@/pages/MatchCenter"));
const Profile = lazy(() => import("@/pages/Profile"));
const PaymentBilling = lazy(() => import("@/pages/PaymentBilling"));
const BillingHistory = lazy(() => import("@/pages/BillingHistory"));
const Settings = lazy(() => import("@/pages/Settings"));
const Simulator = lazy(() => import("@/pages/Simulator"));
const Landing = lazy(() => import("@/pages/Landing"));
const Terms = lazy(() => import("@/pages/Terms"));
const VerifyEmail = lazy(() => import("@/pages/VerifyEmail"));
const Privacy = lazy(() => import("@/pages/Privacy"));

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
          <img src="/images/logo.png" alt="ScorePhantom" className="animate-logo-glow" style={{ width: 120, marginBottom: 24 }} />
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

import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { UpdateBanner } from "@/components/UpdateBanner";
import { NotificationPrompt } from '@/components/NotificationPrompt';
import { InstallPrompt } from "@/components/InstallPrompt";
import { ContactSupport } from "@/components/ContactSupport";
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

function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <Header />
      <div className="app-page" data-app-page>
        {children}
      </div>
    </div>
  );
}

function RouteLoadingFallback() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
        <img src="/images/logo.png" alt="" className="w-16 opacity-50" />
      </div>
    </div>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { data: user, isLoading, error } = useAuth();

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

  return (
    <AppFrame>
      <Component />
    </AppFrame>
  );
}

function SmartRoot() {
  const { data: user, isLoading } = useAuth();

  // Show a minimal loading state during auth check to prevent the
  // Landing → Dashboard flash that authenticated users would otherwise see.
  // The spinner disappears in <1s once the JWT is verified.
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
          <img src="/images/logo.png" alt="ScorePhantom" className="w-16 opacity-50" />
        </div>
      </div>
    );
  }
  if (!user) return <Landing />;
  return (
    <AppFrame>
      <Dashboard />
    </AppFrame>
  );
}


// VerifyEmailHandler removed — Google Auth handles email verification

function MatchdayBackdrop() {
  return (
    <div className="sp-world" aria-hidden="true">
      <div className="sp-world__grid" />
      <div className="sp-world__stadium" />
      <div className="sp-world__orb sp-world__orb--green" />
      <div className="sp-world__orb sp-world__orb--blue" />
      <div className="sp-world__scan" />
    </div>
  );
}

function Router() {
  const [loc] = useLocation();
  
  return (
    <AnimatePresence mode="wait" initial={false} onExitComplete={() => window.scrollTo(0, 0)}>
      <motion.div key={loc} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18, ease: "easeOut" }}>
        <Switch>
      <Route path="/home" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/signup" component={Signup} />
      <Route path="/verify-email" component={VerifyEmail} />
      <Route path="/terms" component={Terms} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/paywall" component={() => <ProtectedRoute component={Paywall} />} />
      <Route path="/admin" component={Admin} />
      <Route path="/admin/basketball" component={BasketballAdmin} />
      <Route path="/track-record" component={() => <ProtectedRoute component={TrackRecord} />} />
      <Route path="/top-picks" component={() => <ProtectedRoute component={TopPicksToday} />} />
      <Route path="/results" component={() => <ProtectedRoute component={PredictionResults} />} />
      <Route path="/league-favorites" component={() => <ProtectedRoute component={LeagueFavorites} />} />
      <Route path="/acca-calculator" component={() => <ProtectedRoute component={AccaCalculator} />} />
      <Route path="/matches" component={() => <ProtectedRoute component={Matches} />} />
      <Route path="/matches/:id" component={() => <ProtectedRoute component={MatchCenter} />} />
      <Route path="/basketball" component={() => <ProtectedRoute component={Basketball} />} />
      <Route path="/basketball/games/:league/:externalId" component={() => <ProtectedRoute component={BasketballGame} />} />
      <Route path="/picks" component={() => <ProtectedRoute component={TopPicksToday} />} />
      <Route path="/acca" component={() => <ProtectedRoute component={AccaCalculator} />} />
      <Route path="/simulator" component={() => <ProtectedRoute component={Simulator} />} />
      <Route path="/profile" component={() => <ProtectedRoute component={Profile} />} />
      <Route path="/billing" component={() => <ProtectedRoute component={PaymentBilling} />} />
      <Route path="/billing/history" component={() => <ProtectedRoute component={BillingHistory} />} />
      <Route path="/settings" component={() => <ProtectedRoute component={Settings} />} />
      <Route path="/" component={SmartRoot} />
      <Route component={SmartRoot} />
    </Switch>
      </motion.div>
    </AnimatePresence>
  );
}

// Capture ?ref= param from URL and persist in localStorage for referral tracking
function ReferralCapture() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref && ref.trim()) {
      localStorage.setItem("sp_referral_code", ref.trim().toUpperCase());
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
            <MatchdayBackdrop />
            <ReferralCapture />
            {/* Flex-col min-h-screen wrapper enables sticky footer (mt-auto on Footer) */}
            <div className="relative z-10 min-h-screen flex flex-col">
              <div className="flex-1">
                <Suspense fallback={<RouteLoadingFallback />}>
                  <Router />
                </Suspense>
              </div>
              <Footer />
            </div>
            <BottomNav />
          </WouterRouter>
          <Toaster />
          <UpdateBanner />
          <NotificationPrompt />
          <InstallPrompt />
          <ContactSupport />
          {/* VerifyEmailHandler removed — Google Auth */}
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
