import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Lock, CheckCircle2, AlertTriangle } from "lucide-react";
import { fetchApi } from "@/lib/api";

export default function ResetPassword() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const token = new URLSearchParams(search).get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);
  const [error, setError]       = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return setError("Password must be at least 6 characters");
    if (password !== confirm) return setError("Passwords don't match");
    setError(""); setLoading(true);
    try {
      await fetchApi("/auth/password/reset-confirm", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      setDone(true);
    } catch (err: any) {
      setError(err.message || "Reset failed. Link may have expired.");
    } finally { setLoading(false); }
  };

  if (!token) return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center">
        <AlertTriangle className="w-12 h-12 text-orange-400 mx-auto mb-4" />
        <p className="text-white font-semibold mb-4">Invalid reset link.</p>
        <button onClick={() => setLocation("/login")} className="text-primary text-sm hover:underline">Back to Sign In</button>
      </div>
    </div>
  );

  if (done) return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center">
        <CheckCircle2 className="w-12 h-12 text-primary mx-auto mb-4" />
        <h2 className="font-display text-3xl text-white mb-3">PASSWORD RESET</h2>
        <p className="text-muted-foreground mb-6">Your password has been updated.</p>
        <Button onClick={() => setLocation("/login")}>Sign In</Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl tracking-widest text-white mb-2">NEW PASSWORD</h1>
          <p className="text-muted-foreground">Enter your new password below.</p>
        </div>
        <Card className="p-8 bg-panel/60 border-white/10">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm text-center">{error}</div>}
            <div className="relative">
              <Lock className="absolute left-4 top-3.5 h-5 w-5 text-muted-foreground" />
              <Input type="password" placeholder="New password" className="pl-11" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
            </div>
            <div className="relative">
              <Lock className="absolute left-4 top-3.5 h-5 w-5 text-muted-foreground" />
              <Input type="password" placeholder="Confirm new password" className="pl-11" value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={6} />
            </div>
            <Button type="submit" className="w-full h-12" disabled={loading}>
              {loading ? "Updating..." : "Set New Password"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
