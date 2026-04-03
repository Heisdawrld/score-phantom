import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Zap, TrendingUp, Shield, BarChart3, Star, ChevronRight, Clock, Target } from "lucide-react";

export default function Landing() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-[#080b10] text-white overflow-x-hidden">

      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center min-h-screen px-6 text-center overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#10e774]/8 rounded-full blur-[120px]" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="relative z-10 max-w-2xl mx-auto"
        >
          <img src="/images/logo.png" alt="ScorePhantom" className="w-16 h-16 mx-auto mb-6 opacity-90" />
          <p className="text-xs font-bold tracking-[0.3em] text-[#10e774] uppercase mb-4">AI Football Predictions</p>
          <h1 className="text-4xl sm:text-5xl font-black leading-tight mb-4">
            Stop guessing.<br />
            <span className="text-[#10e774]">Start predicting.</span>
          </h1>
          <p className="text-white/60 text-lg mb-8 leading-relaxed">
            ScorePhantom uses a Poisson model + AI to find high-confidence football picks — with bookmaker odds comparison, ACCA builder, and proven track record.
          </p>

          {/* Stats Row */}
          <div className="flex items-center justify-center gap-6 mb-8 flex-wrap">
            {[
              { value: "73%", label: "Accuracy" },
              { value: "500+", label: "Daily Picks" },
              { value: "20+", label: "Data Points" },
            ].map(s => (
              <div key={s.label} className="text-center">
                <p className="text-2xl font-black text-[#10e774]">{s.value}</p>
                <p className="text-xs text-white/50">{s.label}</p>
              </div>
            ))}
          </div>

          <button
            onClick={() => setLocation("/login")}
            className="inline-flex items-center gap-2 bg-[#10e774] text-black font-black px-8 py-4 rounded-2xl text-base hover:bg-[#0ecc65] transition-all active:scale-95 shadow-lg shadow-[#10e774]/20"
          >
            Get Started Free <ChevronRight className="w-5 h-5" />
          </button>
          <p className="text-xs text-white/30 mt-3">Free 1-day trial · No credit card required</p>
        </motion.div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 opacity-40">
          <div className="w-px h-12 bg-white/30" />
          <p className="text-[10px] text-white/50">Scroll</p>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6 max-w-4xl mx-auto">
        <p className="text-center text-xs font-bold tracking-[0.3em] text-[#10e774] uppercase mb-3">What You Get</p>
        <h2 className="text-3xl font-black text-center mb-12">Everything a serious punter needs</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            {
              icon: <Target className="w-5 h-5 text-[#10e774]" />,
              title: "AI-Powered Predictions",
              desc: "Poisson model + Groq AI analyses 20+ data points per fixture — form, H2H, xG, volatility, and more.",
            },
            {
              icon: <Zap className="w-5 h-5 text-yellow-400" />,
              title: "ACCA Builder",
              desc: "Automatically builds 3–5 pick accumulators using correlation-filtering and risk control. No guesswork.",
            },
            {
              icon: <TrendingUp className="w-5 h-5 text-blue-400" />,
              title: "Value Edge Detection",
              desc: "Compares model probability to bookmaker odds to surface bets where the market is mispricing an outcome.",
            },
            {
              icon: <BarChart3 className="w-5 h-5 text-purple-400" />,
              title: "Track Record Page",
              desc: "See historical accuracy by market type. We don't hide our losses — transparency builds trust.",
            },
            {
              icon: <Shield className="w-5 h-5 text-orange-400" />,
              title: "Confidence Ratings",
              desc: "Every pick is rated HIGH / MEDIUM / LEAN / LOW. Know exactly how strong a tip is before acting.",
            },
            {
              icon: <Clock className="w-5 h-5 text-pink-400" />,
              title: "Live Match Scores",
              desc: "Follow your predictions live with real-time match scores updated every 60 seconds.",
            },
          ].map(f => (
            <div key={f.title} className="bg-white/4 border border-white/8 rounded-2xl p-5 hover:border-[#10e774]/20 transition-all">
              <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center mb-3">
                {f.icon}
              </div>
              <h3 className="font-bold text-sm mb-1">{f.title}</h3>
              <p className="text-xs text-white/50 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Sample prediction card */}
      <section className="py-16 px-6">
        <div className="max-w-sm mx-auto">
          <p className="text-center text-xs font-bold tracking-[0.3em] text-[#10e774] uppercase mb-3">Live Example</p>
          <h2 className="text-2xl font-black text-center mb-8">This is what a prediction looks like</h2>

          {/* Mock prediction card */}
          <div className="bg-white/4 border border-white/10 rounded-3xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-white/40">Premier League</p>
                <p className="text-sm font-bold">Arsenal vs Chelsea</p>
              </div>
              <span className="text-[10px] font-bold border border-[#10e774]/30 text-[#10e774] px-2 py-0.5 rounded-full">DEEP DATA</span>
            </div>

            <div className="bg-black/40 rounded-2xl p-4">
              <p className="text-[10px] text-white/40 uppercase tracking-widest mb-1">Best Pick</p>
              <p className="text-2xl font-black text-white">Over 2.5 Goals</p>
              <p className="text-[#10e774] font-bold text-sm mt-0.5">78% confidence</p>
            </div>

            <div className="flex gap-2">
              {[
                { label: "Confidence", val: "HIGH", color: "text-[#10e774]" },
                { label: "Risk", val: "SAFE", color: "text-[#10e774]" },
                { label: "Value", val: "STRONG", color: "text-yellow-400" },
              ].map(b => (
                <div key={b.label} className="flex-1 bg-white/4 rounded-xl p-2 text-center">
                  <p className="text-[9px] text-white/30 mb-0.5">{b.label}</p>
                  <p className={`text-[11px] font-black ${b.color}`}>{b.val}</p>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-white/40">SportyBet odds</span>
              <span className="font-bold text-white">1.75 <span className="text-yellow-400 text-xs">✓ VALUE</span></span>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 px-6 max-w-md mx-auto">
        <p className="text-center text-xs font-bold tracking-[0.3em] text-[#10e774] uppercase mb-3">Pricing</p>
        <h2 className="text-2xl font-black text-center mb-8">Simple. Affordable.</h2>

        <div className="bg-white/4 border border-[#10e774]/30 rounded-3xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-black text-[#10e774]">₦3,000</p>
              <p className="text-xs text-white/40">per month</p>
            </div>
            <div className="bg-[#10e774]/10 rounded-xl px-3 py-1">
              <p className="text-xs font-bold text-[#10e774]">PREMIUM</p>
            </div>
          </div>

          <div className="space-y-2.5">
            {[
              "✅ Unlimited predictions every day",
              "✅ AI explanations for every pick",
              "✅ ACCA Builder (auto-generates daily slip)",
              "✅ Value bet detection with edge %",
              "✅ Live match scores",
              "✅ AI chat about any fixture",
              "✅ Full track record access",
            ].map(f => (
              <p key={f} className="text-sm text-white/70">{f}</p>
            ))}
          </div>

          <button
            onClick={() => setLocation("/login")}
            className="w-full bg-[#10e774] text-black font-black py-4 rounded-2xl text-sm hover:bg-[#0ecc65] transition-all active:scale-95"
          >
            Start Free Trial
          </button>
          <p className="text-[11px] text-white/30 text-center">1-day free trial included with every new account</p>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-16 px-6 max-w-3xl mx-auto">
        <p className="text-center text-xs font-bold tracking-[0.3em] text-[#10e774] uppercase mb-3">What Punters Say</p>
        <h2 className="text-2xl font-black text-center mb-8">Real results, real punters</h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { stars: 5, text: "The ACCA builder has been my go-to for weekend slips. Hit 3 out of the last 4 weekend accas.", author: "Emeka O." },
            { stars: 5, text: "I love the value edge feature — it's stopped me betting on markets where the bookies have an edge.", author: "Bola A." },
            { stars: 4, text: "Finally a prediction app that shows its track record instead of just claiming accuracy.", author: "David K." },
          ].map((t, i) => (
            <div key={i} className="bg-white/4 border border-white/8 rounded-2xl p-4">
              <div className="flex gap-0.5 mb-2">
                {Array.from({length: t.stars}).map((_, j) => <Star key={j} className="w-3 h-3 fill-yellow-400 text-yellow-400" />)}
              </div>
              <p className="text-xs text-white/70 leading-relaxed mb-3">"{t.text}"</p>
              <p className="text-[11px] font-bold text-white/40">— {t.author}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Footer */}
      <section className="py-20 px-6 text-center">
        <h2 className="text-3xl font-black mb-4">Ready to predict smarter?</h2>
        <p className="text-white/50 mb-8">Join thousands of punters using data-driven picks</p>
        <button
          onClick={() => setLocation("/login")}
          className="inline-flex items-center gap-2 bg-[#10e774] text-black font-black px-8 py-4 rounded-2xl text-base hover:bg-[#0ecc65] transition-all active:scale-95 shadow-lg shadow-[#10e774]/20"
        >
          Get Started Free <ChevronRight className="w-5 h-5" />
        </button>
        <p className="text-xs text-white/30 mt-3">Free 1-day trial · Cancel anytime</p>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 px-6 text-center">
        <p className="text-xs text-white/20">© 2025 ScorePhantom · AI Football Predictions · Always bet responsibly</p>
      </footer>
    </div>
  );
}
