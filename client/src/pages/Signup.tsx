import { useState } from "react";
import { Link } from "wouter";
import { useSignup } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Mail, Lock, Zap, Check, X } from "lucide-react";

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const checks = [
    { label: "At least 6 characters", ok: password.length >= 6 },
    { label: "Contains a number", ok: /\d/.test(password) },
    { label: "Contains a letter", ok: /[a-zA-Z]/.test(password) },
  ];
  const score = checks.filter((c) => c.ok).length;
  const bar = ["bg-red-500", "bg-orange-400", "bg-yellow-400", "bg-primary"][score] ?? "bg-white/10";
  const label = ["Weak", "Weak", "Fair", "Strong"][score] ?? "";

  return (
    <div className="space-y-2 pt-1">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${i < score ? bar : "bg-white/10"}`} />
        ))}
      </div>
      <p className={`text-xs ${ score >= 3 ? "text-primary" : score >= 2 ? "text-yellow-400" : "text-muted-foreground" }`}>
        {label}
      </p>
      <div className="space-y-1">
        {checks.map((c) => (
          <div key={c.label} className="flex items-center gap-1.5">
            {c.ok
              ? <Check className="w-3 h-3 text-primary" />
              : <X className="w-3 h-3 text-white/20" />}
            <span className={`text-[11px] ${c.ok ? "text-white/60" : "text-white/30"}`}>{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Signup() {
  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [confirm, setConfirm]       = useState("");
  const [error, setError]           = useState("");
  const signupMutation = useSignup();

  const passwordsMatch = confirm === "" || password === confirm;
  const canSubmit = password.length >= 6 && password === confirm && !signupMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) { setError("Passwords don't match"); return; }
    signupMutation.mutate({ email, password }, {
      onError: (err: any) => setError(err.message || "Failed to create account")
    });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 z-0">
        <img src={`${import.meta.env.BASE_URL}images/auth-bg.png`} alt="Background" className="w-full h-full object-cover opacity-40 mix-blend-screen" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-semibold mb-6">
            <Zap className="w-4 h-4" /> 3-Day Free Trial
          </div>
          <h1 className="font-display text-5xl tracking-widest mb-2 text-white">JOIN THE PHANTOM</h1>
          <p className="text-muted-foreground">Get AI-driven football predictions today.</p>
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
                  placeholder="Create a password"
                  className="pl-11"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>

              <PasswordStrength password={password} />

              <div className="relative">
                <Lock className="absolute left-4 top-3.5 h-5 w-5 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder="Confirm password"
                  className={`pl-11 ${
                    confirm && !passwordsMatch
                      ? "border-destructive/60 focus-visible:ring-destructive/40"
                      : confirm && passwordsMatch
                      ? "border-primary/40"
                      : ""
                  }`}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
                {confirm && (
                  <span className="absolute right-4 top-3.5">
                    {passwordsMatch
                      ? <Check className="w-5 h-5 text-primary" />
                      : <X className="w-5 h-5 text-destructive" />}
                  </span>
                )}
              </div>
              {confirm && !passwordsMatch && (
                <p className="text-xs text-destructive">Passwords don't match</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full h-12 text-base"
              disabled={!canSubmit}
            >
              {signupMutation.isPending ? "Creating Account..." : "Start Free Trial"}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-white hover:text-primary font-medium transition-colors">
              Sign In
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
