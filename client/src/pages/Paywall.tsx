import { useAuth, useInitPayment, useVerifyPayment } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check, ShieldAlert, Zap } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";

export default function Paywall() {
  const { data: user, isLoading } = useAuth();
  const initPayment = useInitPayment();
  const verifyPayment = useVerifyPayment();
  const [location] = useLocation();
  const [verificationStatus, setVerificationStatus] = useState<"idle" | "verifying" | "success" | "error">("idle");

  // Check URL for Paystack reference on return
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get("reference");
    
    if (reference && verificationStatus === "idle") {
      setVerificationStatus("verifying");
      verifyPayment.mutate(reference, {
        onSuccess: () => setVerificationStatus("success"),
        onError: () => setVerificationStatus("error")
      });
    }
  }, [location, verificationStatus, verifyPayment]);

  const handleSubscribe = () => {
    initPayment.mutate(undefined, {
      onSuccess: (data) => {
        if (data.authorization_url) {
          window.location.href = data.authorization_url;
        }
      }
    });
  };

  if (isLoading) return <div className="min-h-screen bg-background" />;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-4xl w-full grid md:grid-cols-2 gap-8 items-center">
          
          <div className="space-y-6">
            <Badge className="bg-primary/10 text-primary border-primary/20">PREMIUM ACCESS</Badge>
            <h1 className="font-display text-5xl sm:text-6xl tracking-wide leading-none">
              UNLOCK THE <br/>
              <span className="text-glow-primary text-primary">ALGORITHM</span>
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Your free trial has ended. Subscribe now to get full access to AI-driven match predictions, value bets, and detailed statistical analysis.
            </p>
            
            <ul className="space-y-4 pt-4">
              {[
                "Unlimited daily match predictions",
                "AI-powered bet explanations",
                "Interactive chat for every fixture",
                "Advanced statistical modeling & xG"
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

          <Card className="p-8 border-primary/20 bg-gradient-to-b from-panel-light to-panel relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />
            
            {verificationStatus === "verifying" ? (
              <div className="text-center py-12 space-y-4">
                <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin mx-auto" />
                <h3 className="font-display text-2xl">Verifying Payment...</h3>
              </div>
            ) : verificationStatus === "success" ? (
              <div className="text-center py-12 space-y-4">
                <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
                  <Check className="w-8 h-8 text-primary" />
                </div>
                <h3 className="font-display text-3xl text-primary">Payment Successful!</h3>
                <p className="text-muted-foreground">Your premium access is now active.</p>
                <Button className="w-full mt-4" onClick={() => window.location.href = "/"}>Go to Dashboard</Button>
              </div>
            ) : (
              <div className="space-y-8">
                <div className="text-center">
                  <p className="text-sm font-bold tracking-widest text-muted-foreground uppercase mb-2">Monthly Plan</p>
                  <div className="flex items-start justify-center gap-1">
                    <span className="text-2xl mt-1 text-muted-foreground">₦</span>
                    <span className="font-display text-6xl tracking-wider">3,000</span>
                    <span className="text-muted-foreground self-end mb-2">/mo</span>
                  </div>
                </div>

                <Button 
                  size="lg" 
                  className="w-full text-lg h-14" 
                  onClick={handleSubscribe}
                  disabled={initPayment.isPending}
                >
                  {initPayment.isPending ? "Initializing..." : "Subscribe with Paystack"}
                </Button>

                <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <ShieldAlert className="w-3 h-3" /> Secure payment processing
                </p>
              </div>
            )}
          </Card>

        </div>
      </main>

      {/* Helper Badge to show exact status during dev */}
      {user && (
        <div className="fixed bottom-4 right-4 bg-black/80 p-2 rounded text-xs text-white border border-white/10">
          Status: {user.access_status}
        </div>
      )}
    </div>
  );
}

// Minimal Badge definition here since it wasn't exported in the previous block correctly
function Badge({ className, children, ...props }: any) {
  return <div className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${className}`} {...props}>{children}</div>
}
