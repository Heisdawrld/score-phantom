import React, { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
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
import Matches from "@/pages/Matches";
import MatchCenter from "@/pages/MatchCenter";
import Profile from "@/pages/Profile";
import PaymentBilling from "@/pages/PaymentBilling";
import BillingHistory from "@/pages/BillingHistory";
import Settings from "@/pages/Settings";
import Simulator from "@/pages/Simulator";
import Landing from "@/pages/Landing";
import Terms from "@/pages/Terms";
import VerifyEmail from "@/pages/VerifyEmail";
import Privacy from "@/pages/Privacy";
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


function SmartRoot() {
  const { data: user, isLoading } = useAuth();

  // Show landing page immediately — don't block on the auth check.
  // Once auth resolves, swap to Dashboard if the user is logged in.
  // This eliminates the cold-start spinner that made the landing look broken.
  if (isLoading) return <Landing />;
  if (!user) return <Landing />;
  return <Dashboard />;
}


// VerifyEmailHandler removed — Google Auth handles email verification

function GlassBubbles() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0" aria-hidden="true">
      <div className="absolute top-[-25%] left-[-15%] w-[70vw] h-[70vw] rounded-full" style={{ background: "radial-gradient(circle, rgba(16,231,116,0.07), transparent 70%)", filter: "blur(80px)" }}/>
      <div className="absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] rounded-full" style={{ background: "radial-gradient(circle, rgba(59,130,246,0.05), transparent 70%)", filter: "blur(90px)" }}/>
      <div className="absolute top-[50%] right-[5%] w-[35vw] h-[35vw] rounded-full" style={{ background: "radial-gradient(circle, rgba(16,231,116,0.03), transparent 70%)", filter: "blur(60px)" }}/>
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
      <Route path="/track-record" component={() => <ProtectedRoute component={TrackRecord} />} />
      <Route path="/top-picks" component={() => <ProtectedRoute component={TopPicksToday} />} />
      <Route path="/results" component={() => <ProtectedRoute component={PredictionResults} />} />
      <Route path="/league-favorites" component={() => <ProtectedRoute component={LeagueFavorites} />} />
      <Route path="/acca-calculator" component={() => <ProtectedRoute component={AccaCalculator} />} />
      <Route path="/matches" component={() => <ProtectedRoute component={Matches} />} />
      <Route path="/matches/:id" component={() => <ProtectedRoute component={MatchCenter} />} />
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
            <GlassBubbles />
            <ReferralCapture />
            <Router />
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
