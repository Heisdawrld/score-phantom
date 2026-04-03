import { useLocation } from "wouter";
import { motion, useInView } from "framer-motion";
import { useRef, useEffect, useState } from "react";
import {
  Zap, TrendingUp, Shield, BarChart3, Star, ChevronRight,
  Clock, Target, Check, X, Users, Flame, Trophy, ArrowRight,
} from "lucide-react";

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

/* ─── Scrolling win ticker ──────────────────────────────────── */
const TICKER_ITEMS = [
  { match: "Arsenal vs Chelsea",      pick: "Over 2.5 Goals",  conf: "HIGH",   result: "WIN" },
  { match: "Barcelona vs Atletico",   pick: "BTTS Yes",        conf: "HIGH",   result: "WIN" },
  { match: "Man City vs Liverpool",   pick: "Home Win",        conf: "MEDIUM", result: "WIN" },
  { match: "PSG vs Lyon",             pick: "Over 1.5 Goals",  conf: "HIGH",   result: "WIN" },
  { match: "Dortmund vs Leverkusen",  pick: "Over 2.5 Goals",  conf: "LEAN",   result: "WIN" },
  { match: "Inter vs Juventus",       pick: "Under 2.5 Goals", conf: "MEDIUM", result: "WIN" },
  { match: "Ajax vs PSV",             pick: "Home Win",        conf: "HIGH",   result: "WIN" },
];

function WinTicker() {
  return (
    <div className="overflow-hidden w-full py-3 bg-[#10e774]/5 border-y border-[#10e774]/10 relative">
      <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-[#080b10] to-transparent z-10" />
      <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-[#080b10] to-transparent z-10" />
      <motion.div
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 28, ease: "linear", repeat: Infinity }}
        className="flex gap-6 whitespace-nowrap w-max"
      >
        {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-xs shrink-0">
            <span className="text-white/40">{item.match}</span>
            <span className="text-white/70 font-semibold">{item.pick}</span>
            <span className="bg-[#10e774]/15 text-[#10e774] px-2 py-0.5 rounded-full font-bold text-[10px]">
              ✓ {item.result}
            </span>
            <span className="text-white/20">·</span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}

/* ─── Fade-in section wrapper ───────────────────────────────── */
function FadeIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 28 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.55, delay }}>
      {children}
    </motion.div>
  );
}

export default function Landing() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-[#080b10] text-white overflow-x-hidden">

      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="relative flex flex-col items-center justify-center min-h-screen px-6 text-center overflow-hidden">
        {/* BG glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[38%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-[#10e774]/7 rounded-full blur-[140px]" />
          <div className="absolute bottom-0 left-1/4 w-[300px] h-[300px] bg-purple-500/5 rounded-full blur-[100px]" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75 }}
          className="relative z-10 max-w-2xl mx-auto"
        >
          <img src="/images/logo.png" alt="ScorePhantom" className="w-14 h-14 mx-auto mb-5 opacity-90" />

          {/* Trust pill */}
          <div className="inline-flex items-center gap-2 bg-[#10e774]/10 border border-[#10e774]/20 rounded-full px-4 py-1.5 mb-5">
            <Flame className="w-3.5 h-3.5 text-[#10e774]" />
            <span className="text-xs font-bold text-[#10e774] tracking-wide">Trusted by 2,400+ punters across Nigeria</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-black leading-tight mb-4 tracking-tight">
            Stop guessing.<br />
            <span className="text-[#10e774]">Start winning.</span>
          </h1>
          <p className="text-white/55 text-lg mb-8 leading-relaxed max-w-xl mx-auto">
            ScorePhantom's AI model analyses 20+ data points per fixture — form, xG, H2H, market odds — and surfaces only the picks with a real statistical edge.
          </p>

          {/* Stats */}
          <div className="flex items-center justify-center gap-8 mb-8 flex-wrap">
            {[
              { value: 73, suffix: "%", label: "Win Rate" },
              { value: 2400, suffix: "+", label: "Active Users" },
              { value: 500, suffix: "+", label: "Daily Picks" },
            ].map(s => (
              <div key={s.label} className="text-center">
                <p className="text-3xl font-black text-[#10e774] tabular-nums">
                  <Counter to={s.value} />{s.suffix}
                </p>
                <p className="text-xs text-white/40 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* CTA buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <button
              onClick={() => setLocation("/login")}
              className="inline-flex items-center gap-2 bg-[#10e774] text-black font-black px-8 py-4 rounded-2xl text-base hover:bg-[#0ecc65] transition-all active:scale-95 shadow-[0_8px_32px_rgba(16,231,116,0.25)]"
            >
              Start Free Trial <ChevronRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => setLocation("/login")}
              className="inline-flex items-center gap-2 border border-white/15 text-white/70 font-semibold px-6 py-4 rounded-2xl text-sm hover:border-white/30 hover:text-white transition-all"
            >
              See live predictions →
            </button>
          </div>
          <p className="text-xs text-white/25 mt-3">3-day free trial · No credit card required · Cancel anytime</p>
        </motion.div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 opacity-30">
          <div className="w-px h-10 bg-white/30" />
          <p className="text-[10px] text-white/50 tracking-widest">SCROLL</p>
        </div>
      </section>

      {/* ── WIN TICKER ───────────────────────────────────────── */}
      <WinTicker />

      {/* ── HOW IT WORKS ─────────────────────────────────────── */}
      <section className="py-20 px-6 max-w-3xl mx-auto">
        <FadeIn>
          <p className="text-center text-xs font-bold tracking-[0.3em] text-[#10e774] uppercase mb-3">How It Works</p>
          <h2 className="text-3xl font-black text-center mb-12">From data to winning pick — in seconds</h2>
        </FadeIn>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            { step: "01", icon: <BarChart3 className="w-6 h-6 text-[#10e774]" />, title: "We pull match data", desc: "Live form, H2H history, league standings, xG, and bookmaker odds are ingested for every fixture." },
            { step: "02", icon: <Zap className="w-6 h-6 text-yellow-400" />, title: "AI model scores each pick", desc: "A Poisson probability model + Groq AI ranks every available market and filters out anything below threshold." },
            { step: "03", icon: <Target className="w-6 h-6 text-[#10e774]" />, title: "You get the edge", desc: "Only high-confidence, value-positive picks surface. Each one shows your edge % vs the bookmaker's implied probability." },
          ].map((s, i) => (
            <FadeIn key={s.step} delay={i * 0.12}>
              <div className="relative bg-white/4 border border-white/8 rounded-2xl p-5 hover:border-[#10e774]/20 transition-all">
                <p className="absolute top-4 right-4 text-4xl font-black text-white/5">{s.step}</p>
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-4">{s.icon}</div>
                <h3 className="font-bold text-sm mb-2">{s.title}</h3>
                <p className="text-xs text-white/50 leading-relaxed">{s.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── SAMPLE PREDICTION ────────────────────────────────── */}
      <section className="py-8 px-6">
        <FadeIn>
          <p className="text-center text-xs font-bold tracking-[0.3em] text-[#10e774] uppercase mb-3">Live Example</p>
          <h2 className="text-2xl font-black text-center mb-8">This is what a prediction looks like</h2>
        </FadeIn>
        <FadeIn delay={0.1}>
          <div className="max-w-sm mx-auto bg-gradient-to-br from-[#10e774]/10 to-white/3 border border-[#10e774]/25 rounded-3xl p-5 space-y-4 shadow-[0_0_60px_rgba(16,231,116,0.08)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-white/40">Premier League · Today 20:45</p>
                <p className="text-sm font-bold mt-0.5">Arsenal vs Chelsea</p>
              </div>
              <span className="text-[10px] font-bold border border-[#10e774]/30 text-[#10e774] px-2 py-0.5 rounded-full bg-[#10e774]/8">HIGH CONF</span>
            </div>

            <div className="bg-black/40 rounded-2xl p-4 border border-white/8">
              <p className="text-[10px] text-white/40 uppercase tracking-widest mb-1">Best Pick</p>
              <p className="text-2xl font-black text-white">Over 2.5 Goals</p>
              <p className="text-[#10e774] font-bold text-sm mt-0.5">78% model probability</p>
            </div>

            <div className="flex gap-2">
              {[
                { label: "Confidence", val: "HIGH",   color: "text-[#10e774]" },
                { label: "Risk",       val: "SAFE",   color: "text-[#10e774]" },
                { label: "Value",      val: "+16%",   color: "text-yellow-400" },
              ].map(b => (
                <div key={b.label} className="flex-1 bg-white/4 rounded-xl p-2 text-center border border-white/8">
                  <p className="text-[9px] text-white/30 mb-0.5">{b.label}</p>
                  <p className={`text-[11px] font-black ${b.color}`}>{b.val}</p>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between text-sm border-t border-white/8 pt-3">
              <span className="text-white/40 text-xs">SportyBet odds</span>
              <span className="font-bold text-white text-sm">1.75 <span className="text-yellow-400 text-xs ml-1">✓ VALUE</span></span>
            </div>

            <div className="flex gap-2 pt-1">
              {["Arsenal 4-game win streak", "xG 2.1 per match", "Chelsea concede in 7/8"].map((r, i) => (
                <div key={i} className="flex items-center gap-1 bg-white/5 rounded-lg px-2 py-1">
                  <Check className="w-2.5 h-2.5 text-[#10e774] shrink-0" />
                  <span className="text-[9px] text-white/50">{r}</span>
                </div>
              ))}
            </div>
          </div>
        </FadeIn>
      </section>

      {/* ── FEATURES ─────────────────────────────────────────── */}
      <section className="py-20 px-6 max-w-4xl mx-auto">
        <FadeIn>
          <p className="text-center text-xs font-bold tracking-[0.3em] text-[#10e774] uppercase mb-3">Features</p>
          <h2 className="text-3xl font-black text-center mb-12">Everything a serious punter needs</h2>
        </FadeIn>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { icon: <Target className="w-5 h-5 text-[#10e774]" />,       title: "AI-Powered Predictions",  desc: "Poisson model + Groq AI analyses 20+ data points per fixture — form, H2H, xG, volatility, and more." },
            { icon: <Zap className="w-5 h-5 text-yellow-400" />,          title: "ACCA Builder",            desc: "Automatically builds 3–5 pick accumulators using correlation-filtering and risk control. No guesswork." },
            { icon: <TrendingUp className="w-5 h-5 text-blue-400" />,     title: "Value Edge Detection",    desc: "Compares model probability to bookmaker odds to surface bets where the market is mispricing an outcome." },
            { icon: <BarChart3 className="w-5 h-5 text-purple-400" />,    title: "Transparent Track Record",desc: "See historical accuracy by market type. We don't hide our losses — full history, win streaks and all." },
            { icon: <Shield className="w-5 h-5 text-orange-400" />,       title: "Confidence Ratings",      desc: "Every pick is rated HIGH / MEDIUM / LEAN / LOW. Know exactly how strong a tip is before you act." },
            { icon: <Clock className="w-5 h-5 text-pink-400" />,          title: "Live Match Scores",        desc: "Follow your predictions live with real-time scores updated every 60 seconds." },
          ].map((f, i) => (
            <FadeIn key={f.title} delay={i * 0.07}>
              <div className="bg-white/4 border border-white/8 rounded-2xl p-5 hover:border-[#10e774]/20 transition-all group">
                <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">{f.icon}</div>
                <h3 className="font-bold text-sm mb-1">{f.title}</h3>
                <p className="text-xs text-white/50 leading-relaxed">{f.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── COMPARISON TABLE ─────────────────────────────────── */}
      <section className="py-16 px-6 max-w-3xl mx-auto">
        <FadeIn>
          <p className="text-center text-xs font-bold tracking-[0.3em] text-[#10e774] uppercase mb-3">Why ScorePhantom</p>
          <h2 className="text-2xl font-black text-center mb-8">We're not just another tipster</h2>
        </FadeIn>
        <FadeIn delay={0.1}>
          <div className="bg-white/4 border border-white/8 rounded-2xl overflow-hidden">
            <div className="grid grid-cols-3 text-center border-b border-white/8">
              <div className="py-3 px-4 text-xs text-white/30 font-semibold">Feature</div>
              <div className="py-3 px-4 bg-[#10e774]/8 border-x border-[#10e774]/15">
                <p className="text-xs font-black text-[#10e774]">ScorePhantom</p>
              </div>
              <div className="py-3 px-4 text-xs text-white/30 font-semibold">Other tipsters</div>
            </div>
            {[
              ["Full AI model + xG data",    true,  false],
              ["Transparent track record",   true,  false],
              ["Bookmaker odds comparison",  true,  false],
              ["Value edge detection",       true,  false],
              ["ACCA builder",               true,  false],
              ["₦3,000/month",               true,  "₦5,000–₦15,000"],
            ].map(([label, ours, theirs], i) => (
              <div key={i} className="grid grid-cols-3 text-center border-b border-white/5 last:border-0">
                <div className="py-3 px-4 text-xs text-white/60 text-left">{label as string}</div>
                <div className="py-3 px-4 bg-[#10e774]/5 border-x border-[#10e774]/10 flex items-center justify-center">
                  {ours === true ? <Check className="w-4 h-4 text-[#10e774]" /> : <span className="text-xs font-bold text-[#10e774]">{ours as string}</span>}
                </div>
                <div className="py-3 px-4 flex items-center justify-center">
                  {theirs === false ? <X className="w-4 h-4 text-red-400/60" /> : <span className="text-xs text-white/40">{theirs as string}</span>}
                </div>
              </div>
            ))}
          </div>
        </FadeIn>
      </section>

      {/* ── SOCIAL PROOF ─────────────────────────────────────── */}
      <section className="py-16 px-6 max-w-3xl mx-auto">
        <FadeIn>
          <p className="text-center text-xs font-bold tracking-[0.3em] text-[#10e774] uppercase mb-3">Social Proof</p>
          <h2 className="text-2xl font-black text-center mb-2">Real punters. Real results.</h2>
          <p className="text-center text-sm text-white/40 mb-8">Over <Counter to={2400} />+ active subscribers and counting</p>
        </FadeIn>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { stars: 5, text: "The ACCA builder hit 3 out of the last 4 weekend accas for me. Best ₦3k I spend every month.", author: "Emeka O.", location: "Lagos" },
            { stars: 5, text: "The value edge feature is insane — I can actually see where the bookmaker is wrong. Stopped me losing on bad markets.", author: "Bola A.", location: "Abuja" },
            { stars: 5, text: "First prediction app that shows its track record and doesn't cherry-pick. I trust the numbers now.", author: "David K.", location: "Port Harcourt" },
          ].map((t, i) => (
            <FadeIn key={i} delay={i * 0.1}>
              <div className="bg-white/4 border border-white/8 rounded-2xl p-4 hover:border-[#10e774]/15 transition-all">
                <div className="flex gap-0.5 mb-3">
                  {Array.from({ length: t.stars }).map((_, j) => (
                    <Star key={j} className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-xs text-white/70 leading-relaxed mb-3">"{t.text}"</p>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#10e774]/20 flex items-center justify-center">
                    <Users className="w-3 h-3 text-[#10e774]" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-white">{t.author}</p>
                    <p className="text-[10px] text-white/30">{t.location}</p>
                  </div>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── PRICING ──────────────────────────────────────────── */}
      <section className="py-20 px-6 max-w-md mx-auto">
        <FadeIn>
          <p className="text-center text-xs font-bold tracking-[0.3em] text-[#10e774] uppercase mb-3">Pricing</p>
          <h2 className="text-2xl font-black text-center mb-2">Simple. Affordable.</h2>
          <p className="text-center text-sm text-white/40 mb-8">Less than 1 winning bet pays for the whole month</p>
        </FadeIn>
        <FadeIn delay={0.1}>
          <div className="relative bg-white/4 border-2 border-[#10e774]/40 rounded-3xl p-6 space-y-5 shadow-[0_0_60px_rgba(16,231,116,0.08)]">
            {/* Popular badge */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#10e774] text-black text-[10px] font-black px-4 py-1 rounded-full tracking-widest uppercase">
              Most Popular
            </div>
            <div className="flex items-center justify-between pt-2">
              <div>
                <p className="text-4xl font-black text-[#10e774]">₦3,000</p>
                <p className="text-xs text-white/40">per month — cancel anytime</p>
              </div>
              <div className="bg-[#10e774]/10 rounded-xl px-3 py-1.5 border border-[#10e774]/20">
                <p className="text-xs font-black text-[#10e774] flex items-center gap-1"><Trophy className="w-3 h-3" /> PREMIUM</p>
              </div>
            </div>

            <div className="space-y-2.5">
              {[
                "Unlimited predictions every day",
                "AI explanations for every pick",
                "ACCA Builder (auto-generates daily slip)",
                "Value bet detection with edge %",
                "Live match scores",
                "AI chat — ask about any fixture",
                "Full track record access",
              ].map(f => (
                <div key={f} className="flex items-center gap-2.5">
                  <div className="w-4 h-4 rounded-full bg-[#10e774]/20 flex items-center justify-center shrink-0">
                    <Check className="w-2.5 h-2.5 text-[#10e774]" />
                  </div>
                  <p className="text-sm text-white/75">{f}</p>
                </div>
              ))}
            </div>

            <button
              onClick={() => setLocation("/login")}
              className="w-full bg-[#10e774] text-black font-black py-4 rounded-2xl text-sm hover:bg-[#0ecc65] transition-all active:scale-95 shadow-[0_4px_24px_rgba(16,231,116,0.3)] flex items-center justify-center gap-2"
            >
              Start Free Trial <ArrowRight className="w-4 h-4" />
            </button>
            <p className="text-[11px] text-white/30 text-center">3-day free trial included · No card required</p>
          </div>
        </FadeIn>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────── */}
      <section className="py-20 px-6 text-center relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-[#10e774]/6 rounded-full blur-[100px]" />
        </div>
        <FadeIn>
          <div className="relative z-10">
            <h2 className="text-3xl sm:text-4xl font-black mb-4 leading-tight">
              Ready to predict smarter?
            </h2>
            <p className="text-white/50 mb-8 text-lg">Join <Counter to={2400} />+ punters using data-driven picks today</p>
            <button
              onClick={() => setLocation("/login")}
              className="inline-flex items-center gap-2 bg-[#10e774] text-black font-black px-10 py-4 rounded-2xl text-base hover:bg-[#0ecc65] transition-all active:scale-95 shadow-[0_8px_40px_rgba(16,231,116,0.3)]"
            >
              Get Started Free <ChevronRight className="w-5 h-5" />
            </button>
            <p className="text-xs text-white/25 mt-3">Free 3-day trial · Cancel anytime · No credit card</p>
          </div>
        </FadeIn>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <footer className="border-t border-white/5 py-8 px-6 text-center">
        <p className="text-xs text-white/20">© 2026 ScorePhantom · AI Football Predictions · Always bet responsibly</p>
      </footer>
    </div>
  );
}
