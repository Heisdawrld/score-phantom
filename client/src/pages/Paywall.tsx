import { useAuth } from "@/hooks/use-auth";
import { useRequestPayment, useConfirmPayment } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check, ShieldAlert, Copy, MessageCircle, Loader2, Crown } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { useState } from "react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

function Badge({ className, children, ...props }: any) {
  return <div className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${className}`} {...props}>{children}</div>;
}

type FlowStep = "idle" | "details" | "confirming" | "done";

export default function Paywall() {
  const { data: user, isLoading } = useAuth();
  const requestPayment = useRequestPayment();
  const confirmPayment = useConfirmPayment();
  const [, setLocation] = useLocation();

  const [step, setStep] = useState<FlowStep>("idle");
  const [paymentData, setPaymentData] = useState<any>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGetDetails = () => {
    setError(null);
    requestPayment.mutate(undefined, {
      onSuccess: (data) => {
        setPaymentData(data);
        setStep("details");
      },
      onError: (err: any) => setError(err.message || "Failed to initialize payment"),
    });
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleIPaid = () => {
    if (!paymentData?.reference) return;

    // Open WhatsApp IMMEDIATELY — must be in the direct click handler, not in a callback,
    // or browsers will block it as a popup.
    const waText = encodeURIComponent(
      `Hi, I just paid for ScorePhantom Premium.\n\nUser Email: ${user?.email || "N/A"}\nUser ID: ${user?.id || "N/A"}\nReference: ${paymentData.reference}\n\nHere is my payment receipt:`
    );
    const waUrl = `https://wa.me/2348117024699?text=${waText}`;
    // Use location.href as a fallback if window.open is blocked
    const opened = window.open(waUrl, "_blank");
    if (!opened) {
      window.location.href = waUrl;
    }

    // Then confirm with backend in parallel
    setStep("confirming");
    confirmPayment.mutate(paymentData.reference, {
      onSuccess: () => {
        setStep("done");
      },
      onError: (err: any) => {
        setStep("details");
        setError(err.message || "Failed to confirm. Please try again.");
      },
    });
  };

  if (isLoading) return <div className="min-h-screen bg-background" />;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-4xl w-full grid md:grid-cols-2 gap-8 items-center">

          {/* Left — features */}
          <div className="space-y-6">
            <Badge className="bg-primary/10 text-primary border-primary/20">PREMIUM ACCESS</Badge>
            <h1 className="font-display text-5xl sm:text-6xl tracking-wide leading-none">
              UNLOCK THE <br/>
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

            {step === "done" ? (
              <div className="text-center py-8 space-y-4">
                <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto">
                  <MessageCircle className="w-8 h-8 text-primary" />
                </div>
                <h3 className="font-display text-2xl text-primary">Receipt Sent!</h3>
                <p className="text-muted-foreground text-sm">
                  Your WhatsApp has opened. Send your payment receipt and we'll activate your account within minutes.
                </p>
                <Button variant="outline" className="w-full mt-4" onClick={() => setLocation("/")}>
                  Back to Dashboard
                </Button>
              </div>

            ) : step === "confirming" ? (
              <div className="text-center py-12 space-y-4">
                <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
                <h3 className="font-display text-2xl">Confirming...</h3>
              </div>

            ) : step === "details" && paymentData ? (
              <div className="space-y-6">
                <div className="text-center">
                  <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase mb-1">Transfer to this account</p>
                  <div className="flex items-start justify-center gap-1">
                    <span className="text-2xl mt-1 text-muted-foreground">₦</span>
                    <span className="font-display text-5xl tracking-wider">3,000</span>
                    <span className="text-muted-foreground self-end mb-2">/mo</span>
                  </div>
                </div>

                {/* Bank details */}
                <div className="bg-white/5 rounded-2xl p-4 border border-white/10 space-y-3">
                  {[
                    { label: "Bank", value: "OPay" },
                    { label: "Account Name", value: "David .C (SCOREPHANTOM)" },
                    { label: "Account Number", value: "8117024699", copyKey: "acct" },
                    { label: "Amount", value: "₦3,000" },
                    { label: "Reference", value: paymentData.reference, copyKey: "ref" },
                  ].map(({ label, value, copyKey }) => (
                    <div key={label} className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-semibold text-right truncate">{value}</span>
                        {copyKey && (
                          <button onClick={() => handleCopy(value, copyKey)} className="shrink-0">
                            <Copy className={cn("w-3.5 h-3.5", copied === copyKey ? "text-primary" : "text-muted-foreground")} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <p className="text-xs text-muted-foreground text-center">
                  Include your reference when transferring. Then click below.
                </p>

                {error && <p className="text-xs text-destructive text-center">{error}</p>}

                <Button size="lg" className="w-full h-14 text-base" onClick={handleIPaid}>
                  <MessageCircle className="w-5 h-5 mr-2" />
                  I Have Paid — Send Receipt
                </Button>
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

                {error && <p className="text-xs text-destructive text-center">{error}</p>}

                <Button
                  size="lg"
                  className="w-full text-lg h-14"
                  onClick={handleGetDetails}
                  disabled={requestPayment.isPending}
                >
                  {requestPayment.isPending ? (
                    <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Loading...</>
                  ) : (
                    <><Crown className="w-5 h-5 mr-2" />Subscribe Now</>
                  )}
                </Button>

                <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <ShieldAlert className="w-3 h-3" /> Manual verification via WhatsApp · Activated within minutes
                </p>
              </div>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}
