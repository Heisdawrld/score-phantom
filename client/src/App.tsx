import React, { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

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
  const { toast } = useToast();
  const [location] = useLocation();

  useEffect(() => {
    // Only toast if actually trying to access a protected page without auth
    if (!isLoading && (error || !user) && location !== "/login" && location !== "/signup") {
      toast({
        title: "Sign in required",
        description: "Please sign in to access ScorePhantom.",
        variant: "destructive",
        duration: 3000,
      });
    }
  }, [isLoading, error, user]);

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

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/signup" component={Signup} />
      <Route path="/paywall" component={() => <ProtectedRoute component={Paywall} />} />
      <Route path="/" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route component={() => <ProtectedRoute component={Dashboard} />} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
