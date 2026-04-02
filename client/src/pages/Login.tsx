import { useState } from "react";
import { Link } from "wouter";
import { useLogin } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Mail, Lock, ArrowLeft, CheckCircle2 } from "lucide-react";
import { fetchApi } from "@/lib/api";

type View = "login" | "forgot" | "forgot-sent";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("login");
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");
  const loginMutation = useLogin();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    loginMutation.mutate({ email, password }, {
      onError: (err: any) => setError(err.message || "Failed to login")
    });
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError("");
    setResetLoading(true);
    try {
      await fetchApi("/auth/password/reset-request", {
        method: "POST",
        body: JSON.stringify({ email: resetEmail }),
      });
      setView("forgot-sent");
    } catch (err: any) {
      setResetError(err.message || "Failed to send reset email");
    } finally {
      setResetLoading(false);
    }
  };

  // ── Forgot password sent confirmation ────────────────────────────────────
  if (view === "forgot-sent") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img src={`${import.meta.env.BASE_URL}images/auth-bg.png`} alt="Background" className="w-full h-full object-cover opacity-40 mix-blend-screen" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
        </div>
        <div className="relative z-10 w-full max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-primary/20 border border-primary/30 mx-auto flex items-center justify-center mb-6">
            <CheckCircle2 className="w-8 h-8 text-primary" />
          </div>
          <h1 className="font-display text-4xl tracking-widest mb-3 text-white">CHECK YOUR EMAIL</h1>
          <p className="text-muted-foreground mb-2">We sent a password reset link to</p>
          <p className="text-white font-semibold mb-8">{resetEmail}</p>
          <p className="text-xs text-muted-foreground mb-8">Didn't receive it? Check your spam folder or try again.</p>
          <button
            onClick={() => { setView("login"); setResetEmail(""); }}
            className="text-sm text-primary hover:text-primary/80 transition-colors font-medium"
          >
            ← Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  // ── Forgot password form ─────────────────────────────────────────────────
  if (view === "forgot") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img src={`${import.meta.env.BASE_URL}images/auth-bg.png`} alt="Background" className="w-full h-full object-cover opacity-40 mix-blend-screen" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
        </div>
        <div className="relative z-10 w-full max-w-md">
          <button
            onClick={() => { setView("login"); setResetError(""); }}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-white transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Sign In
          </button>
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-panel border border-primary/20 mx-auto flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(16,231,116,0.15)]">
              <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="ScorePhantom" className="w-10 h-10 object-contain" />
            </div>
            <h1 className="font-display text-4xl tracking-widest mb-2 text-white">RESET PASSWORD</h1>
            <p className="text-muted-foreground">Enter your email and we'll send you a reset link.</p>
          </div>
          <Card className="p-8 backdrop-blur-2xl bg-panel/60 border-white/10">
            <form onSubmit={handleForgot} className="space-y-5">
              {resetError && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm text-center">
                  {resetError}
                </div>
              )}
              <div className="relative">
                <Mail className="absolute left-4 top-3.5 h-5 w-5 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="Your email address"
                  className="pl-11"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full h-12 text-base" disabled={resetLoading}>
                {resetLoading ? "Sending..." : "Send Reset Link"}
              </Button>
            </form>
          </Card>
        </div>
      </div>
    );
  }

  // ── Main login form ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 z-0">
        <img src={`${import.meta.env.BASE_URL}images/auth-bg.png`} alt="Background" className="w-full h-full object-cover opacity-40 mix-blend-screen" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-panel border border-primary/20 mx-auto flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(16,231,116,0.15)]">
            <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="ScorePhantom" className="w-10 h-10 object-contain" />
          </div>
          <h1 className="font-display text-5xl tracking-widest mb-2 text-glow-primary text-white">WELCOME BACK</h1>
          <p className="text-muted-foreground">Sign in to access premium predictions.</p>
        </div>

        <Card className="p-8 backdrop-blur-2xl bg-panel/60 border-white/10">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm text-center">
                {error}
              </div>
            )}
            <div className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-4 top-3.5 h-5 w-5 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="Email address"
                  className="pl-11"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-4 top-3.5 h-5 w-5 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder="Password"
                  className="pl-11"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Forgot password link */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => { setView("forgot"); setResetEmail(email); setResetError(""); }}
                className="text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                Forgot password?
              </button>
            </div>

            <Button type="submit" className="w-full h-12 text-base" disabled={loginMutation.isPending}>
              {loginMutation.isPending ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          <div className="mt-6 space-y-3">
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10" />
              </div>
              <span className="relative bg-panel px-3 text-xs text-muted-foreground">or</span>
            </div>
            <Link href="/signup">
              <button type="button" className="w-full h-11 rounded-xl border border-primary/30 bg-primary/5 text-primary font-semibold text-sm hover:bg-primary/15 hover:border-primary/50 transition-all tracking-wide">
                🚀 Start Free Trial — 1 Day Free
              </button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
