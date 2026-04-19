import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth, useInitPayment } from "@/hooks/use-auth";
import { Check, Crown, Zap, Shield, Loader2, ArrowLeft, Sparkles, TrendingUp, Bot, Target, ChevronRight, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

const FEATURES = [
  { icon: Target, title: "Top Picks & Edges", desc: "Our highest confidence model predictions" },
  { icon: Zap, title: "Daily ACCA Builder", desc: "Smart accumulators generated daily" },
  { icon: Bot, title: "PhantomChat", desc: "Deep match analysis for any game" },
  { icon: TrendingUp, title: "Real-Time Value", desc: "Detects mispriced bookmaker odds" },
  { icon: Shield, title: "Verified Track Record", desc: "Full transparency on all past picks" },
];

const PROOF_POINTS = [
  { value: "68%", label: "Avg Win Rate" },
  { value: "500+", label: "Weekly Picks" },
  { value: "24/7", label: "Live Analysis" },
];

function PaymentSuccess({ onContinue }: any) {
  return (
    <div className="relative flex flex-col items-center justify-center min-h-[80vh] text-center px-6">
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.45, delay: 0.1 }}
        className="relative w-32 h-32 rounded-full flex items-center justify-center mb-8"
        style={{ background: "radial-gradient(circle,rgba(16,231,116,0.2),transparent 70%)", boxShadow: "0 0 80px rgba(16,231,116,0.3)" }}>
        <div className="w-28 h-28 rounded-full border-4 border-primary flex items-center justify-center bg-[#080f0b]">
          <Check className="w-14 h-14 text-primary" strokeWidth={2.5} />
        </div>
      </motion.div>
      <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
        className="text-4xl font-black text-white mb-3 tracking-tight">
        Welcome to Premium
      </motion.h1>
      <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
        className="text-white/50 text-base leading-relaxed max-w-sm mx-auto mb-10">
        Your account is fully activated. You now have unlimited access to the prediction engine, ACCA Builder, and PhantomChat.
      </motion.p>
      <motion.button initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}
        onClick={onContinue} whileTap={{ scale: 0.97 }}
        className="flex items-center gap-2 px-8 py-4 rounded-2xl font-black text-black text-lg w-full max-w-sm justify-center"
        style={{ background: "linear-gradient(135deg,#10e774,#0bc95f)", boxShadow: "0 0 32px rgba(16,231,116,0.3)" }}>
        Start Winning <ChevronRight className="w-5 h-5" />
      </motion.button>
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
  const [paymentDone, setPaymentDone] = useState(paymentStatus === "success");
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  useEffect(() => {
    if (paymentStatus === "success") { setPaymentDone(true); refetch(); }
    if (paymentStatus === "failed") { setError("Payment failed or was cancelled. Please try again."); }
  }, [paymentStatus, refetch]);

  const handleSubscribe = (plan: string = 'monthly') => {
    setError(null);
    setLoadingPlan(plan);
    initPayment.mutate({ plan } as any, {
      onSuccess: (data: any) => {
        if (data?.link) {
          try {
            const url = new URL(data.link);
            if (!url.hostname.endsWith("flutterwave.com")) { setError("Invalid secure link."); setLoadingPlan(null); return; }
            window.location.href = data.link;
          } catch { setError("Secure connection failed."); setLoadingPlan(null); }
        } else { setError("Could not generate secure checkout."); setLoadingPlan(null); }
      },
      onError: (err: any) => { setError(err.message || "Checkout failed. Try again."); setLoadingPlan(null); },
    });
  };

  if (isLoading) return (
    <div className="min-h-screen bg-[#060a0e] flex items-center justify-center">
      <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#060a0e] relative text-white selection:bg-primary/30">
      {/* Cinematic Background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[100vw] h-[50vh] bg-primary/10 blur-[120px] opacity-50 rounded-full mix-blend-screen" />
        <div className="absolute bottom-0 right-0 w-[50vw] h-[50vh] bg-blue-500/5 blur-[100px] rounded-full mix-blend-screen" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.apply/noise.svg')] opacity-[0.03] mix-blend-overlay" />
      </div>

      <div className="relative z-10 flex flex-col min-h-screen pb-20">
        {/* Minimal Header */}
        <header className="px-6 py-6 flex items-center justify-between">
          <button onClick={() => setLocation("/")} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
            <ArrowLeft className="w-5 h-5 text-white/70" />
          </button>
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-primary" />
            <span className="font-black tracking-wide text-lg">ScorePhantom</span>
          </div>
          <div className="w-10" /> {/* Spacer */}
        </header>

        <AnimatePresence mode="wait">
          {paymentDone ? (
            <motion.div key="success" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col justify-center">
              <PaymentSuccess onContinue={() => setLocation("/")} />
            </motion.div>
          ) : (
            <motion.main key="paywall" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="flex-1 flex flex-col items-center px-4 pt-4 max-w-lg mx-auto w-full">
              
              {/* Hero Section */}
              <div className="text-center mb-10 w-full">
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 mb-6">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Unlock The Edge</span>
                </motion.div>
                
                <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                  className="text-4xl sm:text-5xl font-black text-white leading-[1.1] tracking-tight mb-4">
                  Stop Guessing.<br/>
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-emerald-300">Start Winning.</span>
                </motion.h1>
                
                <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                  className="text-white/50 text-base max-w-sm mx-auto leading-relaxed">
                  Join thousands of smart bettors using model-driven probabilities to beat the bookmakers every day.
                </motion.p>
              </div>

              {/* Proof Strip */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
                className="flex items-center justify-center gap-6 mb-10 w-full px-4 py-5 rounded-2xl bg-white/[0.02] border border-white/[0.05]">
                {PROOF_POINTS.map(({ value, label }, i) => (
                  <div key={label} className="text-center flex-1">
                    <p className="text-2xl font-black text-white tracking-tight">{value}</p>
                    <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">{label}</p>
                  </div>
                ))}
              </motion.div>

              {/* Error Banner */}
              <AnimatePresence>
                {error && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="w-full overflow-hidden mb-6">
                    <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex items-center gap-3">
                      <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                      <p className="text-sm text-red-300">{error}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Main Pricing Card */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                className="w-full relative rounded-[2rem] p-1 overflow-hidden mb-6"
                style={{ background: "linear-gradient(180deg, rgba(16,231,116,0.3) 0%, rgba(255,255,255,0.05) 100%)" }}>
                <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full opacity-50" />
                
                <div className="relative bg-[#0a110d] rounded-[1.85rem] p-6 sm:p-8 w-full border border-white/[0.05]">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h2 className="text-2xl font-black text-white">Premium</h2>
                      <p className="text-sm text-primary font-semibold mt-1">Full Model Access</p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-start justify-end gap-1">
                        <span className="text-xl font-bold text-white/40 mt-1">₦</span>
                        <span className="text-4xl font-black text-white tracking-tight">3,000</span>
                      </div>
                      <p className="text-[10px] text-white/30 uppercase tracking-widest mt-1">Per Month</p>
                    </div>
                  </div>

                  <div className="space-y-4 mb-8">
                    {FEATURES.map(({ icon: Icon, title, desc }, i) => (
                      <motion.div key={title} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + i * 0.05 }}
                        className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-full bg-white/[0.03] border border-white/[0.05] flex items-center justify-center shrink-0">
                          <Icon className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white">{title}</p>
                          <p className="text-xs text-white/40 mt-0.5 leading-relaxed">{desc}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  {/* Monthly Action */}
                  <button onClick={() => handleSubscribe('monthly')} disabled={initPayment.isPending}
                    className="group relative w-full h-14 rounded-2xl font-black text-black text-lg overflow-hidden transition-all disabled:opacity-70 disabled:cursor-not-allowed mb-4"
                    style={{ background: "linear-gradient(135deg,#10e774 0%,#0bc95f 100%)", boxShadow: "0 8px 32px rgba(16,231,116,0.25)" }}>
                    <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <span className="relative flex items-center justify-center gap-2 h-full">
                      {initPayment.isPending && loadingPlan === 'monthly' ? (
                        <><Loader2 className="w-5 h-5 animate-spin" /> Secure Checkout...</>
                      ) : (
                        <><Lock className="w-4 h-4" /> Get 1 Month Access</>
                      )}
                    </span>
                  </button>

                  {/* Weekly Alternative */}
                  <div className="text-center">
                    <p className="text-[11px] text-white/30 uppercase tracking-widest mb-3">Or try it out first</p>
                    <button onClick={() => handleSubscribe('weekly')} disabled={initPayment.isPending}
                      className="w-full py-3.5 rounded-xl font-bold text-sm text-primary bg-primary/[0.08] border border-primary/20 hover:bg-primary/[0.15] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                      {initPayment.isPending && loadingPlan === 'weekly' ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
                      ) : (
                        "Get 1 Week for ₦1,000"
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>

              {/* Trust Indicators */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
                className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-[11px] text-white/30 font-medium w-full">
                <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-primary/50" /> Secure Flutterwave Checkout</span>
                <span className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-primary/50" /> Instant Activation</span>
                <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-primary/50" /> Cancel Anytime</span>
              </motion.div>

            </motion.main>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
