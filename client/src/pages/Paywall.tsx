import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth, useInitPayment } from "@/hooks/use-auth";
import {
  Check, Crown, Zap, Shield, Loader2, ArrowLeft, Sparkles,
  TrendingUp, Bot, Target, ChevronRight, Lock, AlertCircle, Activity, Calculator,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ────────────────────────────────────────────────────────────
   Content — clear, specific, benefit-driven copy.
   No jargon. Every feature states a concrete value.
   ──────────────────────────────────────────────────────────── */
const FEATURES = [
  { icon: Target,     title: "80%+ Confidence Picks",     desc: "Daily top model predictions, filtered for the strongest edge" },
  { icon: Bot,        title: "Daily AI Match Analysis",   desc: "PhantomChat breaks down any fixture — form, xG, and value" },
  { icon: Calculator, title: "ACCA Calculator",           desc: "Smart accumulators with auto-built odds and risk scoring" },
  { icon: Activity,   title: "Real-Time Live Scores",     desc: "Live odds + value detection across football & basketball" },
  { icon: TrendingUp, title: "Basketball Predictions",    desc: "Hoops model included — NBA, Euroleague, and major leagues" },
  { icon: Shield,     title: "Verified Track Record",     desc: "Every pick tracked publicly — full transparency on results" },
];

/* Social proof — replaces vague "2 Sports / 24/7" with real numbers */
const SOCIAL_PROOF = [
  { value: "605+",   label: "Active Members" },
  { value: "65.6%",  label: "Hit Rate" },
  { value: "1,500+", label: "Picks Tracked" },
];

/* Trust badges — moved above the fold, near the CTAs */
const TRUST_BADGES = [
  { icon: Shield, label: "Secure Flutterwave" },
  { icon: Zap,    label: "Instant Activation" },
  { icon: Check,  label: "Cancel Anytime" },
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
        className="flex items-center gap-2 px-8 py-4 rounded-2xl font-black text-black text-lg w-full max-w-sm justify-center glow-primary-strong"
        style={{ background: "linear-gradient(135deg,#10e774,#0bc95f)" }}>
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

  // ── Payment handler — UNCHANGED. Preserves Flutterwave flow exactly. ──
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
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[50vh] bg-primary/10 blur-[120px] opacity-50 rounded-full mix-blend-screen" />
        <div className="absolute bottom-0 right-0 w-[50vw] h-[50vh] bg-blue-500/5 blur-[100px] rounded-full mix-blend-screen" />
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
          <div className="w-10" />
        </header>

        <AnimatePresence mode="wait">
          {paymentDone ? (
            <motion.div key="success" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col justify-center">
              <PaymentSuccess onContinue={() => setLocation("/")} />
            </motion.div>
          ) : (
            <motion.main key="paywall" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="flex-1 flex flex-col items-center px-4 pt-2 max-w-lg mx-auto w-full">

              {/* Hero — simplified, jargon-free subhead */}
              <div className="text-center mb-6 w-full">
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 mb-5">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  <span className="text-2xs font-black text-primary uppercase tracking-[0.2em]">Unlock Premium</span>
                </motion.div>

                <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                  className="text-3xl sm:text-4xl font-black text-white leading-[1.1] tracking-tight mb-3">
                  Stop Guessing.<br/>
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-emerald-300">Start Winning.</span>
                </motion.h1>

                <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                  className="text-white/55 text-sm max-w-sm mx-auto leading-relaxed">
                  Unlock high-accuracy predictions, AI match analysis, and exclusive value picks across football &amp; basketball.
                </motion.p>
              </div>

              {/* Social proof — real numbers, not vague claims */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
                className="flex items-stretch justify-center gap-2 mb-5 w-full">
                {SOCIAL_PROOF.map(({ value, label }) => (
                  <div key={label} className="flex-1 px-2 py-3 rounded-xl bg-white/[0.02] border border-white/[0.05] text-center">
                    <p className="text-xl font-black text-white tracking-tight leading-none">{value}</p>
                    <p className="text-2xs text-white/40 uppercase tracking-wider mt-1.5">{label}</p>
                  </div>
                ))}
              </motion.div>

              {/* Error Banner */}
              <AnimatePresence>
                {error && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="w-full overflow-hidden mb-4">
                    <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex items-center gap-3">
                      <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                      <p className="text-sm text-red-300">{error}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Pricing Card — aligned header, premium surface */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                className="w-full relative rounded-[2rem] p-1 overflow-hidden mb-4 glow-primary-strong"
                style={{ background: "linear-gradient(180deg, rgba(16,231,116,0.32) 0%, rgba(255,255,255,0.04) 100%)" }}>
                <div className="absolute inset-0 bg-primary/15 blur-2xl rounded-full opacity-40 pointer-events-none" />

                <div className="relative bg-[#0a110d] rounded-[1.85rem] p-6 sm:p-7 w-full border border-white/[0.05]">

                  {/* Plan header — properly aligned baseline */}
                  <div className="mb-6">
                    <div className="inline-flex items-center gap-1.5 mb-3">
                      <Crown className="w-3.5 h-3.5 text-primary" />
                      <span className="text-2xs font-black text-primary uppercase tracking-[0.18em]">Premium Plan</span>
                    </div>
                    <div className="flex items-end justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h2 className="text-xl font-black text-white leading-tight">Full Model Access</h2>
                        <p className="text-xs text-white/40 mt-1">One subscription. Every feature.</p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="flex items-baseline justify-end gap-0.5">
                          <span className="text-base font-bold text-white/55">₦</span>
                          <span className="text-4xl font-black text-white tracking-tight leading-none">3,000</span>
                        </div>
                        <p className="text-2xs text-white/40 uppercase tracking-widest mt-1.5">Per Month</p>
                      </div>
                    </div>
                  </div>

                  {/* Feature list — specific, concrete value */}
                  <div className="space-y-3.5 mb-5">
                    {FEATURES.map(({ icon: Icon, title, desc }, i) => (
                      <motion.div key={title} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + i * 0.04 }}
                        className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary/[0.08] border border-primary/15 flex items-center justify-center shrink-0">
                          <Icon className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white leading-tight">{title}</p>
                          <p className="text-xs text-white/45 mt-0.5 leading-snug">{desc}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  {/* Trust badges — above the fold, near CTAs */}
                  <div className="flex items-center justify-center gap-x-4 gap-y-2 mb-5 flex-wrap py-3 border-y border-white/[0.06]">
                    {TRUST_BADGES.map(({ icon: Icon, label }) => (
                      <span key={label} className="flex items-center gap-1.5 text-2xs text-white/55 font-semibold">
                        <Icon className="w-3 h-3 text-primary/80" />
                        {label}
                      </span>
                    ))}
                  </div>

                  {/* Primary CTA — green with glow */}
                  <button onClick={() => handleSubscribe('monthly')} disabled={initPayment.isPending}
                    className="group relative w-full h-14 rounded-2xl font-black text-black text-base overflow-hidden transition-all disabled:opacity-70 disabled:cursor-not-allowed glow-primary-strong mb-3"
                    style={{ background: "linear-gradient(135deg,#10e774 0%,#0bc95f 100%)" }}>
                    <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <span className="relative flex items-center justify-center gap-2 h-full">
                      {initPayment.isPending && loadingPlan === 'monthly' ? (
                        <><Loader2 className="w-5 h-5 animate-spin" /> Secure Checkout...</>
                      ) : (
                        <><Lock className="w-4 h-4" /> Get 1 Month Access</>
                      )}
                    </span>
                  </button>

                  {/* Secondary CTA — high-contrast, NOT green (white surface + blue price) */}
                  <button onClick={() => handleSubscribe('weekly')} disabled={initPayment.isPending}
                    className="w-full py-3.5 rounded-xl font-bold text-sm text-white bg-white/[0.05] border border-white/15 hover:bg-white/[0.09] hover:border-accent-blue/50 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                    {initPayment.isPending && loadingPlan === 'weekly' ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
                    ) : (
                      <>Get 1 Week for <span className="text-accent-blue font-black">₦1,000</span></>
                    )}
                  </button>
                </div>
              </motion.div>

              {/* Escape hatch — subtle, present */}
              <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
                onClick={() => setLocation("/")}
                className="text-2xs text-white/35 hover:text-white/65 uppercase tracking-widest font-medium transition-colors mt-3">
                Maybe later
              </motion.button>

            </motion.main>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
