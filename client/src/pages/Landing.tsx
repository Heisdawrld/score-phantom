import { useLocation } from "wouter";
import { motion, useInView, useScroll, useTransform } from "framer-motion";
import { useRef, useEffect, useState } from "react";
import {
  Zap, TrendingUp, Shield, BarChart3, Star, ChevronRight,
  Clock, Target, Check, Users, Trophy, ArrowRight, Activity, Lock
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Animated counter ─────────────────────────────────────── */
function Counter({ to, duration = 1.4 }: { to: number; duration?: number }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  
  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const step = to / (duration * 60);
    const id = setInterval(() => {
      start += step;
      if (start >= to) { setVal(to); clearInterval(id); } else setVal(Math.floor(start));
    }, 1000 / 60);
    return () => clearInterval(id);
  }, [inView, to, duration]);
  
  return <span ref={ref}>{val.toLocaleString()}</span>;
}

/* ─── Fade-in section wrapper ───────────────────────────────── */
function FadeIn({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 24 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }} className={className}>
      {children}
    </motion.div>
  );
}

export default function Landing() {
  const [, setLocation] = useLocation();
  const { scrollY } = useScroll();
  const heroOpacity = useTransform(scrollY, [0, 400], [1, 0]);
  const heroY = useTransform(scrollY, [0, 400], [0, 100]);

  return (
    <div className="min-h-screen bg-[#060a0e] text-white overflow-x-hidden selection:bg-primary/30">
      {/* Cinematic Global Background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[80vw] h-[60vh] bg-primary/10 blur-[120px] opacity-60 rounded-full mix-blend-screen" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vh] bg-blue-500/5 blur-[100px] rounded-full mix-blend-screen" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.apply/noise.svg')] opacity-[0.03] mix-blend-overlay" />
      </div>

      {/* ── NAV ─────────────────────────────────────────────── */}
      <nav className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#060a0e]/50 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Zap className="w-4 h-4 text-primary" />
          </div>
          <span className="font-black tracking-wide text-lg">ScorePhantom</span>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setLocation("/login")} className="text-sm font-semibold text-white/70 hover:text-white transition-colors">Log in</button>
          <button onClick={() => setLocation("/login")} className="px-4 py-2 rounded-full bg-white text-black text-sm font-black hover:scale-95 transition-transform">Get Started</button>
        </div>
      </nav>

      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="relative pt-40 pb-20 px-6 min-h-[90vh] flex flex-col items-center justify-center text-center">
        <motion.div style={{ opacity: heroOpacity, y: heroY }} className="relative z-10 max-w-4xl mx-auto w-full">
          
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.08] mb-8">
            <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span className="text-[11px] font-bold text-white/70 tracking-widest uppercase">The Next-Gen Betting Edge</span>
          </motion.div>

          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}
            className="text-5xl sm:text-7xl lg:text-[84px] font-black leading-[1.05] tracking-tight mb-6">
            Predict matches with<br className="hidden sm:block"/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-emerald-300"> mathematical precision.</span>
          </motion.h1>

          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}
            className="text-lg sm:text-xl text-white/50 mb-10 leading-relaxed max-w-2xl mx-auto font-medium">
            ScorePhantom ingests millions of data points to surface high-value betting edges, exact win probabilities, and smart accumulators.
          </motion.p>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <button onClick={() => setLocation("/login")}
              className="group relative h-14 px-8 rounded-full font-black text-black text-base overflow-hidden transition-all shadow-[0_8px_32px_rgba(16,231,116,0.25)] hover:shadow-[0_12px_40px_rgba(16,231,116,0.35)] hover:-translate-y-0.5"
              style={{ background: "linear-gradient(135deg,#10e774 0%,#0bc95f 100%)" }}>
              <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
              <span className="relative flex items-center gap-2">Start 7-Day Free Trial <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" /></span>
            </button>
            <button onClick={() => setLocation("/login")}
              className="h-14 px-8 rounded-full font-bold text-white bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.08] transition-colors flex items-center gap-2">
              View Track Record
            </button>
          </motion.div>

          {/* Hero Visual Teaser */}
          <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.5 }}
            className="mt-20 relative mx-auto max-w-4xl rounded-[2rem] p-1 overflow-hidden"
            style={{ background: "linear-gradient(180deg, rgba(16,231,116,0.15) 0%, rgba(255,255,255,0.02) 100%)" }}>
            <div className="absolute inset-0 bg-primary/10 blur-3xl rounded-full" />
            <div className="relative bg-[#060a0e] rounded-[1.85rem] border border-white/[0.05] p-6 sm:p-8 flex flex-col md:flex-row gap-8 items-center shadow-2xl">
              <div className="flex-1 space-y-4 text-left w-full">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-black px-2.5 py-1 rounded-full border border-primary/40 text-primary bg-primary/[0.08] uppercase tracking-widest">STRONG EDGE</span>
                </div>
                <h3 className="text-3xl font-black">Arsenal vs Chelsea</h3>
                <div className="flex gap-4 border-b border-white/5 pb-4">
                  <div><p className="text-[10px] text-white/40 uppercase tracking-widest mb-1">Pick</p><p className="text-lg font-bold text-white">Over 2.5 Goals</p></div>
                  <div><p className="text-[10px] text-primary/70 uppercase tracking-widest mb-1">Model Prob</p><p className="text-lg font-bold text-primary">78%</p></div>
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <Activity className="w-5 h-5 text-white/30" />
                  <p className="text-xs text-white/50 leading-relaxed">Arsenal enters on a 4-match win streak (xG 2.1). Chelsea concedes in 80% of away matches.</p>
                </div>
              </div>
              <div className="w-full md:w-64 shrink-0 bg-white/[0.02] border border-white/5 rounded-2xl p-5">
                <p className="text-[10px] text-white/40 uppercase tracking-widest mb-4 text-center">Market Comparison</p>
                <div className="space-y-3">
                  <div className="flex justify-between items-center"><span className="text-xs text-white/50">Our Model</span><span className="text-sm font-bold">1.28 odds</span></div>
                  <div className="flex justify-between items-center"><span className="text-xs text-white/50">Bookmaker</span><span className="text-sm font-bold text-primary">1.75 odds</span></div>
                </div>
                <div className="mt-4 pt-4 border-t border-white/5 text-center">
                  <span className="text-[10px] font-black text-primary bg-primary/10 px-3 py-1.5 rounded-full uppercase tracking-widest">+16% Value Edge</span>
                </div>
              </div>
            </div>
          </motion.div>

        </motion.div>
      </section>

      {/* ── METRICS ────────────────────────────────────────────── */}
      <section className="py-12 border-y border-white/5 bg-white/[0.01]">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8">
          {[
            { value: 68, suffix: "%", label: "Average Hit Rate" },
            { value: 500, suffix: "+", label: "Picks Analyzed Weekly" },
            { value: 20, suffix: "+", label: "Data Points Per Match" },
            { value: 24, suffix: "/7", label: "Live Market Scanning" },
          ].map((m, i) => (
            <FadeIn key={m.label} delay={i * 0.1} className="text-center md:text-left">
              <p className="text-3xl sm:text-4xl font-black text-white mb-1"><Counter to={m.value} />{m.suffix}</p>
              <p className="text-xs text-white/40 font-medium uppercase tracking-wider">{m.label}</p>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── FEATURES (Linear Style) ───────────────────────────── */}
      <section className="py-32 px-6 max-w-6xl mx-auto space-y-32">
        {/* Feature 1 */}
        <div className="flex flex-col md:flex-row items-center gap-16">
          <FadeIn className="flex-1 space-y-6">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-2">
              <BarChart3 className="w-6 h-6 text-primary" />
            </div>
            <h2 className="text-3xl sm:text-4xl font-black leading-tight">Poisson distribution, <br/>applied to the pitch.</h2>
            <p className="text-white/50 text-lg leading-relaxed max-w-md">
              We don't rely on gut feeling. Our engine calculates exact Expected Goals (xG) using Poisson probability models, factoring in team form, defensive leaks, and head-to-head momentum to generate precise scoreline matrices.
            </p>
          </FadeIn>
          <FadeIn delay={0.2} className="flex-1 w-full">
            <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 blur-[80px] rounded-full" />
              <div className="space-y-4 relative z-10">
                {[
                  { score: "2-1", prob: "18.4%" }, { score: "1-1", prob: "14.2%" }, { score: "2-0", prob: "11.8%" }
                ].map(s => (
                  <div key={s.score} className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/[0.05]">
                    <span className="font-black text-xl">{s.score}</span>
                    <span className="font-bold text-primary">{s.prob}</span>
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>
        </div>

        {/* Feature 2 */}
        <div className="flex flex-col md:flex-row-reverse items-center gap-16">
          <FadeIn className="flex-1 space-y-6">
            <div className="w-12 h-12 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center mb-2">
              <TrendingUp className="w-6 h-6 text-yellow-400" />
            </div>
            <h2 className="text-3xl sm:text-4xl font-black leading-tight">We find the edge. <br/>You place the bet.</h2>
            <p className="text-white/50 text-lg leading-relaxed max-w-md">
              Knowing the probability isn't enough. Our engine constantly compares its own calculated odds against live bookmaker markets. If the bookmaker prices an outcome too high, we flag it as a Value Edge.
            </p>
          </FadeIn>
          <FadeIn delay={0.2} className="flex-1 w-full">
            <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-8 relative overflow-hidden flex items-center justify-center min-h-[300px]">
               <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-yellow-500/10 blur-[60px] rounded-full" />
               <div className="text-center relative z-10">
                 <p className="text-[10px] text-white/40 uppercase tracking-widest mb-2">Market Inefficiency Detected</p>
                 <p className="text-6xl font-black text-yellow-400 mb-4">+14%</p>
                 <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm">
                   <span>Bookmaker: <strong className="text-white">35%</strong></span>
                   <span className="text-white/20">|</span>
                   <span>Model: <strong className="text-primary">49%</strong></span>
                 </div>
               </div>
            </div>
          </FadeIn>
        </div>

        {/* Feature 3 */}
        <div className="flex flex-col md:flex-row items-center gap-16">
          <FadeIn className="flex-1 space-y-6">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-2">
              <Zap className="w-6 h-6 text-blue-400" />
            </div>
            <h2 className="text-3xl sm:text-4xl font-black leading-tight">Instant ACCA Builder. <br/>Built on logic.</h2>
            <p className="text-white/50 text-lg leading-relaxed max-w-md">
              Stop guessing on weekend accumulators. Set your risk tolerance (Safe, Value, or High Risk), and the engine instantly compiles the highest-confidence picks into a single slip.
            </p>
          </FadeIn>
          <FadeIn delay={0.2} className="flex-1 w-full">
            <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-8 relative overflow-hidden">
               <div className="space-y-3 relative z-10">
                 {[1, 2, 3].map(i => (
                   <div key={i} className="flex items-center gap-4 p-3 border-b border-white/5 last:border-0">
                     <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-xs text-white/40">{i}</div>
                     <div><p className="text-sm font-bold">Over 1.5 Goals</p><p className="text-xs text-white/40">1.28 Odds</p></div>
                     <div className="ml-auto"><Check className="w-4 h-4 text-primary" /></div>
                   </div>
                 ))}
                 <div className="mt-4 pt-4 border-t border-white/10 flex justify-between items-center">
                   <span className="text-xs text-white/40 uppercase tracking-widest font-bold">Total Odds</span>
                   <span className="text-2xl font-black text-white">2.45</span>
                 </div>
               </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────── */}
      <section className="py-32 px-6 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-primary/10 rounded-full blur-[120px] mix-blend-screen" />
        </div>
        <FadeIn className="relative z-10 max-w-3xl mx-auto text-center">
          <div className="w-16 h-16 mx-auto bg-primary/10 border border-primary/20 rounded-2xl flex items-center justify-center mb-8">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-4xl sm:text-5xl font-black mb-6 leading-tight tracking-tight">
            Unlock the algorithm.
          </h2>
          <p className="text-white/50 mb-10 text-lg max-w-xl mx-auto">
            Join thousands of smart bettors. Get unlimited predictions, the ACCA builder, and deep AI match analysis for just ₦3,000/month.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <button onClick={() => setLocation("/login")}
              className="w-full sm:w-auto px-10 h-14 rounded-full font-black text-black text-base transition-all shadow-[0_8px_32px_rgba(16,231,116,0.25)] hover:shadow-[0_12px_40px_rgba(16,231,116,0.35)] hover:-translate-y-0.5"
              style={{ background: "linear-gradient(135deg,#10e774 0%,#0bc95f 100%)" }}>
              Start 7-Day Free Trial
            </button>
            <p className="text-xs text-white/30 sm:hidden">Cancel anytime. No card required.</p>
          </div>
        </FadeIn>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <footer className="border-t border-white/5 py-12 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            <span className="font-bold tracking-wide text-sm text-white/50">ScorePhantom © 2026</span>
          </div>
          <p className="text-xs text-white/30 text-center md:text-right max-w-sm">
            ScorePhantom provides statistical data and probabilities. We are not a bookmaker and do not accept bets. Always bet responsibly.
          </p>
        </div>
      </footer>
    </div>
  );
}
