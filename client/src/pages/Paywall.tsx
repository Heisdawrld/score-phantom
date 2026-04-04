import { useAuth } from "@/hooks/use-auth";
import { useInitPayment } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check, ShieldCheck, Loader2, Crown, Zap, ArrowLeft } from "lucide-react";
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
  const paymentStatus = params.get("payment");

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (paymentStatus === "success") {
      refetch().then(() => setLocation("/"));
    }
  }, [paymentStatus]);

  const handleSubscribe = () => {
    setError(null);
    initPayment.mutate(undefined, {
      onSuccess: (data: any) => {
        if (data?.link) {
          try {
            const url = new URL(data.link);
            if (!url.hostname.endsWith('flutterwave.com')) {
              setError("Invalid payment link. Please try again.");
              return;
            }
            window.location.href = data.link;
          } catch {
            setError("Invalid payment link. Please try again.");
          }
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
        <div className="max-w-4xl w-full">

          {/* Back button */}
          <button
            onClick={() => setLocation("/")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-white transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </button>

          <div className="grid md:grid-cols-2 gap-8 items-center">
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
                  : "Your free trial has ended. Subscribe now for full model-powered match predictions."}
              </p>
              <ul className="space-y-4 pt-4">
                {[
                  "Unlimited daily match predictions",
                  "Model explanations & PhantomChat",
                  "ACCA Builder — Safe & Value daily picks",
                  "Best Tips Today — multi-factor top picks",
                  "Value Bet of the Day — highest edge picks",
                  "League Favorites — personalized picks",
                  "Track Record — backtesting & accuracy stats",
                  "xG, form trends, H2H statistical analysis",
                ].map((feature, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                      <Check className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <span className="text-white/90">{feature}</span>
                  </li>
                ))}
              </ul>

              {/* Accuracy stats */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 mt-6">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">
                  📊 Proven Track Record
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center">
                    <p className="text-primary font-black text-lg">73%</p>
                    <p className="text-xs text-muted-foreground">BTTS Accuracy</p>
                  </div>
                  <div className="text-center border-l border-r border-white/10">
                    <p className="text-primary font-black text-lg">68%</p>
                    <p className="text-xs text-muted-foreground">Over 2.5 Goals</p>
                  </div>
                  <div className="text-center">
                    <p className="text-primary font-black text-lg">500+</p>
                    <p className="text-xs text-muted-foreground">Picks/Week</p>
                  </div>
                </div>
              </div>

              {/* Testimonial */}
              <div className="border-l-2 border-primary/40 pl-4 mt-6">
                <p className="text-sm text-white/80 italic leading-relaxed">
                  "The predictions are insanely accurate. I've made back my subscription fee in the first week."
                </p>
                <p className="text-xs text-muted-foreground mt-2 font-semibold">
                  — Chukwu, Lagos
                </p>
              </div>
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

                {/* Continue with trial — only once, only for trial users */}
                {user?.access_status === "trial" && (
                  <button
                    onClick={() => setLocation("/")}
                    className="w-full text-center text-xs text-muted-foreground hover:text-white/70 transition-colors"
                  >
                    Continue with free trial →
                  </button>
                )}

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
        </div>
      </main>
    </div>
  );
}
