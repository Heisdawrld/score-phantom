import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { fetchApi } from '@/lib/api';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Trophy, TrendingUp, Target, Crown, Flame, ShieldCheck, Activity, BarChart3, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─ Animated counter hook
function useCountUp(target: number, duration = 900, enabled = true) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    if (target === 0) { setValue(0); return; }
    let start: number | null = null;
    const step = (ts: number) => {
      if (!start) start = ts;
      const pct = Math.min((ts - start) / duration, 1);
      setValue(Math.round(pct * target));
      if (pct < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, enabled]);
  return value;
}

// ─ Animated ring
function WinRing({ pct, color }: { pct: number; color: string }) {
  const radius = 54;
  const circ = 2 * Math.PI * radius;
  const [dash, setDash] = useState(circ);
  useEffect(() => {
    const t = setTimeout(() => setDash(circ * (1 - pct / 100)), 120);
    return () => clearTimeout(t);
  }, [pct, circ]);
  return (
    <div className="relative flex items-center justify-center">
      <svg width="136" height="136" className="rotate-[-90deg]">
        <circle cx="68" cy="68" r={radius} stroke="rgba(255,255,255,0.04)" strokeWidth="10" fill="none" />
        <circle
          cx="68" cy="68" r={radius}
          stroke={color} strokeWidth="10" fill="none"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={dash}
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)', filter: 'drop-shadow(0 0 12px ' + color + '60)' }}
        />
      </svg>
      {/* Background glow behind ring */}
      <div className="absolute inset-0 rounded-full blur-[30px] opacity-10" style={{ backgroundColor: color }} />
    </div>
  );
}

// ─ Period pill
function PeriodPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-4 py-1.5 rounded-xl text-[11px] font-black transition-all uppercase tracking-widest border',
        active 
          ? 'bg-primary text-black border-primary shadow-[0_0_15px_rgba(16,231,116,0.3)]' 
          : 'text-white/25 border-white/[0.04] hover:text-white/50 hover:bg-white/[0.04]'
      )}
    >
      {label}
    </button>
  );
}

// ─ Premium gate (blurred teaser)
function PremiumGate({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <div className="relative mt-4">
      <div className="pointer-events-none select-none blur-md opacity-25 space-y-4">
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 flex items-center gap-5">
          <div className="w-[136px] h-[136px] rounded-full bg-emerald-500/20 shrink-0" />
          <div className="flex-1 grid grid-cols-2 gap-3">
            {['363', '162', '85', '116'].map((n, i) => (
              <div key={i} className="bg-white/4 rounded-xl p-3 text-center">
                <p className="text-2xl font-black text-white">{n}</p>
                <p className="text-[10px] text-white/40 uppercase">-—-</p>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 h-24" />
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 h-48" />
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-yellow-400/20 to-primary/20 border border-yellow-400/30 flex items-center justify-center glow-primary">
            <Crown className="w-8 h-8 text-yellow-400" />
          </div>
          <div className="space-y-1 px-4">
            <h2 className="text-xl font-black text-white">Unlock Deep Analytics</h2>
            <p className="text-white/40 text-sm max-w-xs leading-relaxed">
              Track win rates by market, historical accuracy trends, and elite performance spikes.
            </p>
          </div>
        </div>
        <button
          onClick={onUpgrade}
          className="flex items-center gap-2 px-8 py-3.5 rounded-xl bg-primary text-black font-black text-sm shadow-[0_0_30px_rgba(16,231,116,0.3)] hover:shadow-[0_0_40px_rgba(16,231,116,0.45)] transition-all active:scale-95 uppercase tracking-widest"
        >
          <Zap className="w-4 h-4 fill-current" />
          GO PREMIUM
        </button>
      </div>
    </div>
  );
}

// ─ Animated W/L bar
function AnimatedBar({ wins, losses, voids, total, settled }: { wins: number; losses: number; voids: number; total: number; settled: number; }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { const t = setTimeout(() => setReady(true), 150); return () => clearTimeout(t); }, []);
  const wPct = total > 0 ? (wins / total) * 100 : 0;
  const lPct = total > 0 ? (losses / total) * 100 : 0;
  const vPct = total > 0 ? (voids / total) * 100 : 0;
  
  return (
    <div className="space-y-4">
      <div className="flex rounded-full overflow-hidden h-7 bg-white/[0.03] p-1 border border-white/[0.05]">
        {wins > 0 && (
          <div 
            className="bg-primary h-full rounded-full flex items-center justify-center text-[10px] font-black text-black shadow-[0_0_10px_rgba(16,231,116,0.4)] transition-all duration-1000 ease-out"
            style={{ width: ready ? `${wPct}%` : '0%' }}
          >
            {settled > 0 && wPct > 15 ? ((wins / settled) * 100).toFixed(0) + '%' : ''}
          </div>
        )}
        {losses > 0 && (
          <div 
            className="bg-red-500/80 h-full rounded-full flex items-center justify-center text-[10px] font-black text-white ml-0.5 transition-all duration-1000 ease-out delay-100"
            style={{ width: ready ? `${lPct}%` : '0%' }}
          >
            {settled > 0 && lPct > 15 ? ((losses / settled) * 100).toFixed(0) + '%' : ''}
          </div>
        )}
        {voids > 0 && <div className="bg-white/10 h-full rounded-full ml-0.5 transition-all duration-1000 ease-out delay-200" style={{ width: ready ? `${vPct}%` : '0%' }} />}
      </div>
      <div className="flex flex-wrap items-center justify-between px-1 gap-2">
        <div className="flex items-center gap-3 text-[10px] font-bold tracking-widest uppercase">
          <span className="flex items-center gap-1 text-primary"><CheckCircle2 className="w-3 h-3"/> Wins ({wins})</span>
          <span className="flex items-center gap-1 text-red-400"><XCircle className="w-3 h-3"/> Losses ({losses})</span>
          {voids > 0 && <span className="flex items-center gap-1 text-white/30"><Clock className="w-3 h-3"/> Voids ({voids})</span>}
        </div>
        <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">{settled} SETTLED</p>
      </div>
    </div>
  );
}

// ─ Animated market row
function MarketRow({ market, index, label }: { market: any; index: number; label: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 200 + index * 60);
    return () => clearTimeout(t);
  }, [index]);
  const barColor = market.winRate >= 65 ? 'bg-primary' : market.winRate >= 50 ? 'bg-blue-400' : market.winRate >= 40 ? 'bg-amber-400' : 'bg-red-500/60';
  const rateClass = market.winRate >= 65 ? 'text-primary' : market.winRate >= 50 ? 'text-blue-400' : 'text-white/40';
  const barWidth = ready ? Math.max(4, market.winRate) + '%' : '0%';
  const barTransition = 'width 1s cubic-bezier(.16, 1, 0.3, 1) ' + (index * 0.05) + 's';
  
  return (
    <div className="group">
      <div className="flex flex-wrap items-center justify-between mb-2 gap-2">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
          <span className="text-xs font-bold text-white/70 group-hover:text-white transition-colors truncate">{label}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold text-white/20 tabular-nums">{market.wins}W <span className="text-white/10 mx-0.5">/</span> {market.losses}L</span>
          <span className={cn("text-xs font-black tabular-nums tracking-wider", rateClass)}>{market.winRate.toFixed(1)}%</span>
        </div>
      </div>
      <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full", barColor)} 
          style={{ width: barWidth, transition: barTransition, boxShadow: market.winRate >= 65 ? '0 0 10px rgba(16,231,116,0.3)' : 'none' }} />
      </div>
    </div>
  );
}

// ─ Main component
export default function TrackRecord() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading: authLoading } = useAuth();
  const [days, setDays] = useState(30);

  const isPremium = user?.access_status === 'active' || (user as any)?.subscription_active;

  const { data, isLoading } = useQuery({
    queryKey: ['track-record', days],
    queryFn: () => fetchApi('/track-record?days=' + days),
    enabled: !authLoading && !!isPremium,
    staleTime: 2 * 60 * 1000,
  });

  if (authLoading) return <div className="min-h-screen bg-background" />;

  const stats = data?.overallStats || { totalPicks: 0, wins: 0, losses: 0, voids: 0, winRate: 0 };
  const byMarket: any[] = data?.byMarket || [];

  const winPct = stats.winRate || 0;
  const settled = stats.wins + stats.losses;
  const ringColor = winPct >= 65 ? '#10e774' : winPct >= 50 ? '#3b82f6' : '#f59e0b';

  const animWins = useCountUp(stats.wins, 900, !isLoading);
  const animLosses = useCountUp(stats.losses, 900, !isLoading);
  const animTotal = useCountUp(stats.totalPicks, 900, !isLoading);
  const animRate = useCountUp(Math.round(winPct), 900, !isLoading);

  const topMarkets = [...byMarket]
    .filter(m => m.totalPicks >= 2)
    .sort((a, b) => b.winRate - a.winRate)
    .slice(0, 8);

  const marketLabel = (key: string) =>
    key.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());

  const variants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <Header />
      <div className="max-w-3xl mx-auto px-4">

        {/* ── Page Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-6 mb-8">
          <div className="flex items-center gap-3">
            <button onClick={() => setLocation('/')} className="w-10 h-10 flex items-center justify-center bg-white/[0.04] border border-white/[0.08] rounded-xl text-white/40 hover:text-white transition-all shrink-0">
              <ChevronLeft size={20} />
            </button>
            <div>
              <h1 className="text-2xl font-black flex items-center gap-3 tracking-tight">
                Track <span className="text-primary italic">Record</span>
                {isPremium && (
                  <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/25 uppercase tracking-[0.2em] animate-pulse">
                    LIVE
                  </span>
                )}
              </h1>
              <p className="text-[11px] font-black text-white/25 uppercase tracking-widest mt-0.5">
                {data?.period ? data.period.toUpperCase() : `LAST ${days} DAYS PERFORMANCE`}
              </p>
            </div>
          </div>
          
          {isPremium && (
            <div className="flex items-center gap-1.5 bg-white/[0.03] border border-white/[0.08] rounded-2xl p-1.5 self-start sm:self-center">
              {[7, 14, 30].map(d => (
                <PeriodPill key={d} label={d + 'D'} active={days === d} onClick={() => setDays(d)} />
              ))}
            </div>
          )}
        </div>

        {!isPremium ? (
          <PremiumGate onUpgrade={() => setLocation('/paywall')} />
        ) : isLoading ? (
          <div className="space-y-4">
            <div className="h-[200px] rounded-3xl sp-shimmer" />
            <div className="h-[120px] rounded-3xl sp-shimmer" />
            <div className="h-[400px] rounded-3xl sp-shimmer" />
          </div>
        ) : stats.totalPicks === 0 ? (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white/[0.02] border border-white/[0.06] rounded-3xl py-20 text-center">
            <Trophy className="w-16 h-16 text-white/10 mx-auto mb-4" />
            <p className="text-white/60 text-lg font-black uppercase tracking-tight">Zero Data Points</p>
            <p className="text-white/20 text-xs mt-1">Predictions are logged automatically after match settlement.</p>
          </motion.div>
        ) : (
          <motion.div
            initial="hidden" animate="show"
            variants={{ show: { transition: { staggerChildren: 0.1 } } }}
            className="space-y-6"
          >
            {/* ── Win Rate Hero ── */}
            <motion.div variants={variants} className="glass-card rounded-[2rem] p-6 sm:p-8 flex flex-col md:flex-row items-center gap-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4">
                <BarChart3 className="text-white/5 w-24 h-24 rotate-12" />
              </div>
              
              <div className="shrink-0 relative group">
                <WinRing pct={winPct} color={ringColor} />
                <div className="absolute inset-0 flex flex-col items-center justify-center pt-1">
                  <span className="text-3xl font-black tabular-nums leading-none" style={{ color: ringColor }}>
                    {animRate}%
                  </span>
                  <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest mt-1">SUCCESS</span>
                </div>
              </div>

              <div className="flex-1 w-full grid grid-cols-2 md:grid-cols-4 gap-3 relative z-10">
                {[
                  { val: animTotal,  label: "Total Picks", icon: Activity, color: "text-white" },
                  { val: animWins,   label: "Won",     icon: CheckCircle2, color: "text-primary" },
                  { val: animLosses, label: "Lost",    icon: XCircle, color: "text-red-400" },
                  { val: (stats.voids || 0),  label: "Void",    icon: Clock, color: "text-white/30" },
                ].map(({ val, label, color, icon: Icon }) => (
                  <div key={label} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 flex flex-col items-center justify-center group hover:bg-white/[0.06] transition-all">
                    <p className={cn("text-2xl sm:text-3xl font-black tabular-nums leading-none", color)}>{val}</p>
                    <div className="flex flex-col items-center gap-1.5 mt-2 opacity-40">
                      <Icon size={14} className={color}/>
                      <p className="text-[10px] font-black uppercase tracking-widest">{label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* ── Settlement Breakdown ── */}
            <motion.div variants={variants} className="glass-card rounded-[2rem] pl-6 pr-6 pt-6 pb-7">
              <h3 className="text-[11px] font-black text-white/30 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                <TrendingUp size={14} className="text-primary" /> Outcome Breakdown
              </h3>
              <AnimatedBar wins={stats.wins} losses={stats.losses} voids={stats.voids ?? 0} total={stats.totalPicks} settled={settled} />
            </motion.div>

            {/* ── Best Markets ── */}
            {topMarkets.length > 0 && (
              <motion.div variants={variants} className="glass-card rounded-[2rem] p-6 sm:p-8">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-[11px] font-black text-white/30 uppercase tracking-[0.2em] flex items-center gap-2">
                    <Target size={14} className="text-amber-400" /> Top Performing Markets
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                  {topMarkets.map((market, i) => (
                    <MarketRow key={market.market} market={market} index={i} label={marketLabel(market.market)} />
                  ))}
                </div>
              </motion.div>
            )}

            {/* ── Verified Badge ── */}
            <motion.div variants={variants} className="flex items-center gap-4 bg-primary/[0.04] border border-primary/20 rounded-3xl p-6">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 glow-primary">
                <ShieldCheck size={24} className="text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black text-white tracking-wide uppercase">Verified ScorePhantom Engine</p>
                <p className="text-xs text-white/35 mt-1 leading-relaxed">
                  Real-world accurate data tracked for {stats.totalPicks} predictions. Our model is updated daily based on actual settlement results.
                </p>
              </div>
            </motion.div>

          </motion.div>
        )}
      </div>
    </div>
  );
}
