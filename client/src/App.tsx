import React, { Suspense, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";

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

import Landing from "@/pages/Landing";

function PageSpinner(){return(<div className="min-h-screen bg-background flex items-center justify-center"><div className="w-10 h-10 rounded-full border-4 border-primary/20 border-t-primary animate-spin" /></div>);}

const Login=React.lazy(()=>import("@/pages/Login"));
const Signup=React.lazy(()=>import("@/pages/Signup"));
const Dashboard=React.lazy(()=>import("@/pages/Dashboard"));
const Paywall=React.lazy(()=>import("@/pages/Paywall"));
const ResetPassword=React.lazy(()=>import("@/pages/ResetPassword"));
const Admin=React.lazy(()=>import("@/pages/Admin"));
const TrackRecord=React.lazy(()=>import("@/pages/TrackRecord"));
const TopPicksToday=React.lazy(()=>import("@/pages/TopPicksToday"));
const PredictionResults=React.lazy(()=>import("@/pages/PredictionResults"));
const LeagueFavorites=React.lazy(()=>import("@/pages/LeagueFavorites"));
const AccaCalculator=React.lazy(()=>import("@/pages/AccaCalculator"));
const Matches=React.lazy(()=>import("@/pages/Matches"));
const MatchCenter=React.lazy(()=>import("@/pages/MatchCenter"));
const Profile=React.lazy(()=>import("@/pages/Profile"));
const Terms=React.lazy(()=>import("@/pages/Terms"));
const VerifyEmail=React.lazy(()=>import("@/pages/VerifyEmail"));
const Privacy=React.lazy(()=>import("@/pages/Privacy"));
import { UpdateBanner } from "@/components/UpdateBanner";
import { NotificationPrompt } from "@/components/NotificationPrompt";
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

  if (isLoading) return <PageSpinner />;

  if (error || !user) {
    return <RedirectTo path="/login" />;
  }

  return <Component />;
}


function SmartRoot() {
  const hasToken = !!localStorage.getItem("sp_token");
  const { data: user, isLoading } = useAuth();
  if (!hasToken) return <Landing />;
  if (isLoading) return <PageSpinner />;
  if (!user) return <Landing />;
  return <Suspense fallback={<PageSpinner />}><Dashboard /></Suspense>;
}


// VerifyEmailHandler removed — Google Auth handles email verification

function GlassBubbles() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0" aria-hidden="true">
      <div className="absolute top-[-25%] left-[-15%] w-[70vw] h-[70vw] rounded-full" style={{ background: "radial-gradient(circle, rgba(16,231,116,0.07), transparent 70%)" }}/>
      <div className="absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] rounded-full" style={{ background: "radial-gradient(circle, rgba(59,130,246,0.05), transparent 70%)" }}/>
      <div className="absolute top-[50%] right-[5%] w-[35vw] h-[35vw] rounded-full" style={{ background: "radial-gradient(circle, rgba(16,231,116,0.03), transparent 70%)" }}/>
    </div>
  );
}

function Router() {
  const [loc] = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={loc} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18, ease: "easeOut" }}>
        <Suspense fallback={<PageSpinner />}>
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
      <Route path="/profile" component={() => <ProtectedRoute component={Profile} />} />
      <Route path="/" component={SmartRoot} />
      <Route component={SmartRoot} />
    </Switch>
        </Suspense>
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
          </WouterRouter>
          <Toaster />
          <UpdateBanner />
          <NotificationPrompt />
          <InstallPrompt />
          <BottomNav />
          {/* VerifyEmailHandler removed — Google Auth */}
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
