import { useAuth } from "@/hooks/use-auth";
import { useInitPayment } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check, ShieldCheck, Loader2, Crown, Zap } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";

function Badge({ className, children, ...props }: any) {
  return (
    <div
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export default function Paywall() {
  const { data: user, isLoading, refetch } = useAuth();
  const initPayment = useInitPayment();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const paymentStatus = params.get("payment"); // 'success' | 'failed' | 'error'

  const [error, setError] = useState<string | null>(null);

  // If Flutterwave redirected back with ?payment=success, refresh user and go to dashboard
  useEffect(() => {
    if (paymentStatus === "success") {
      refetch().then(() => setLocation("/"));
    }
  }, [paymentStatus]);

  const handleSubscribe = () => {
    setError(null);
    initPayment.mutate(undefined, {
      onSuccess: (data: any) => {
        // Redirect user to Flutterwave hosted checkout
        if (data?.link) {
          window.location.href = data.link;
        } else {
          setError("Payment link not returned. Please try again.");
        }
      },
      onError: (err: any) =>
        setError(err.message || "Failed to initialize payment. Please try again."),
    });
  };

  if (isLoading || paymentStatus === "success") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-4xl w-full grid md:grid-cols-2 gap-8 items-center">

          {/* Left — features */}
          <div className="space-y-6">
            <Badge className="bg-primary/10 text-primary border-primary/20">PREMIUM ACCESS</Badge>
            <h1 className="font-display text-5xl sm:text-6xl tracking-wide leading-none">
              UNLOCK THE <br />
              <span className="text-glow-primary text-primary">ALGORITHM</span>
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              {user?.access_status === "trial"
                ? "You're on a free trial. Subscribe now to keep access after your trial ends."
                : "Your free trial has ended. Subscribe now for full AI-driven match predictions."}
            </p>
            <ul className="space-y-4 pt-4">
              {[
                "Unlimited daily match predictions",
                "AI-powered bet explanations & chat",
                "ACCA — 5 best picks daily",
                "Advanced statistical modeling & xG",
              ].map((feature, i) => (
                <li key={i} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <Check className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <span className="text-white/90">{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Right — payment card */}
          <Card className="p-8 border-primary/20 bg-gradient-to-b from-panel-light to-panel relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />

            <div className="space-y-8">
              {/* Price */}
              <div className="text-center">
                <p className="text-sm font-bold tracking-widest text-muted-foreground uppercase mb-2">
                  Monthly Plan
                </p>
                <div className="flex items-start justify-center gap-1">
                  <span className="text-2xl mt-1 text-muted-foreground">₦</span>
                  <span className="font-display text-6xl tracking-wider">3,000</span>
                  <span className="text-muted-foreground self-end mb-2">/mo</span>
                </div>
              </div>

              {/* Payment failed banner */}
              {(paymentStatus === "failed" || paymentStatus === "error") && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-3 text-center">
                  <p className="text-sm text-destructive font-medium">
                    Payment was not completed. Please try again.
                  </p>
                </div>
              )}

              {error && (
                <p className="text-xs text-destructive text-center">{error}</p>
              )}

              {/* Subscribe button */}
              <Button
                size="lg"
                className="w-full text-lg h-14"
                onClick={handleSubscribe}
                disabled={initPayment.isPending}
              >
                {initPayment.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Redirecting to payment...
                  </>
                ) : (
                  <>
                    <Crown className="w-5 h-5 mr-2" />
                    Pay with Flutterwave
                  </>
                )}
              </Button>

              {/* Trust badges */}
              <div className="space-y-2">
                <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                  Secured by Flutterwave — Card, Bank Transfer, USSD
                </p>
                <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-primary" />
                  Account activated instantly after payment
                </p>
              </div>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
