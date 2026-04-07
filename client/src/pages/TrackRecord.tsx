import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { fetchApi } from '@/lib/api';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Trophy, TrendingUp, Target, Crown, Flame, ShieldCheck } from 'lucide-react';
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
    <svg width="136" height="136" className="rotate-[-90deg]">
      <circle cx="68" cy="68" r={radius} stroke="rgba(255,255,255,0.06)" strokeWidth="11" fill="none" />
      <circle
        cx="68" cy="68" r={radius}
        stroke={color} strokeWidth="11" fill="none"
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={dash}
        style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(.4,0,.2,1)', filter: 'drop-shadow(0 0 10px ' + color + '90)' }}
      />
    </svg>
  );
}

// ─ Period pill
function PeriodPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3 py-1 rounded-full text-xs font-bold transition-all',
        active ? 'bg-primary text-black shadow-[0_0_12px_rgba(16,231,116,0.4)]' : 'text-white/40 hover:text-white/70'
      )}
    >
      {label}
    </button>
  );
}

// ─ Premium gate (blurred teaser)
function PremiumGate({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <div className="relative">
      <div className="pointer-events-none select-none blur-sm opacity-35 space-y-4">
        <div className="bg-white/4 border border-white/8 rounded-2xl p6 flex items-center gap-5">
          <div className="w-[136px] h-[136px] rounded-full bg-emerald-500/20 shrink-0" />
          <div className="flex-1 grid grid-cols-2 gap-3">
            {['363', '162', '85', '116'].map((n, i) => (
              <div key={i} className="bg-white/4 rounded-xl p3 text-center">
                <p className="text-2xl font-black text-white">{n}</p>
                <p className="text-[10px] text-white/40 uppercase">-—-</p>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white/4 border border-white/8 rounded-2xl p5 h24" />
        <div className="bg-white/4 border border-white/8 rounded-2xl p5 h-48" />
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-5">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-yellow-400/20 to-primary/20 border border-yellow-400/30 flex items-center justify-center">
            <Crown className="w8 h-8 text-yellow-400" />
          </div>
          <h2 className="text-xl font-black text-white">Premium Feature</h2>
          <p className="text-white/50 text-sm max-w-xs leading-relaxed">
            Unlock your full prediction Track Record — win rates by market, historical accuracy, and performance trends.
          </p>
        </div>
        <button
          onClick={onUpgrade}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-black font-bold text-sm shadow-[0_0_24px_rgba(16,231,116,0.35)] hover:shadow-[0_0_32px_rgba(16,231,116,0.5)] transition-all active:scale-95"
        >
          <Flame className="w4 h-4" />
          Upgrade to Premium
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
  const wStyle = { width: ready ? wPct + '%' : '0%', transition: 'width 1s cubic-bezier(.4,0,.2,1)' };
  const lStyle = { width: ready ? lPct + '%' : '0%', transition: 'width 1s cubic-bezier(.4,0,.2,1) 0.05s' };
  const vStyle = { width: ready ? vPct + '%' : '0%', transition: 'width 1s cubic-bezier(.4,0,.2,1) 0.1s' };
  return (
    <>
      <div className="flex rounded-full overflow-hidden h-6 bg-white/5">
        {wins > 0 && <div className="bg-emerald-500 h-full flex items-center justify-center text-[9px] font-bold text-black" style={wStyle}>{settled > 0 ? ((wins / settled) * 100).toFixed(0) : 0}%</div>}
        {losses > 0 && <div className="bg-red-500 h-full flex items-center justify-center text-[9px] font-bold text-white" style={lStyle}>{settled > 0 ? ((losses / settled) * 100).toFixed(0) : 0}%</div>}
        {voids > 0 && <div className="bg-white/15 h-full" style={vStyle} />}
      </div>
      <div className="flex items-center gap-4 mt-2.5 text-[10px] text-white/40">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Wins ({wins})</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Losses ({losses})</span>
        {voids > 0 && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-white/20 inline-block" /> Voids ({voids})</span>}
      </div>
    </>
  );
}

// ─ Animated market row
function MarketRow({ market, index, label }: { market: any; index: number; label: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 200 + index * 60);
    return () => clearTimeout(t);
  }, [index]);
  const barColor = market.winRate >= 60 ? 'bg-primary' : market.winRate >= 50 ? 'bg-blue-500' : market.winRate >= 40 ? 'bg-yellow-500' : 'bg-red-500/70';
  const rateClass = market.winRate >= 60 ? 'text-primary bg-primary/10' : market.winRate >= 50 ? 'text-blue-400 bg-blue-500/10' : 'text-white/50 bg-white/5';
  const glow = market.winRate >= 60 ? '0 0 8px rgba(16,231,116,0.4)' : 'none';
  const barWidth = ready ? Math.max(4, market.winRate) + '%' : '0%';
  const barTransition = 'width 0.8s cubic-bezier(.4,0,.2,1) ' + (index * 0.06) + 's';
  return (
    <div className="group">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-white/80 group-hover:text-white transition-colors">{label}</span>
        <div className="flex items-center gap-2 text-[10px]">
          <span className={"font-bold px-1.5 py-0.5 rounded " + rateClass}>{market.winRate.toFixed(1)}%</span>
        </div>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div className={"h-full rounded-full " + barColor} style={{ width: barWidth, transition: barTransition, boxShadow: glow }} />
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
  const ringColor = winPct >= 60 ? '#10e774' : winPct >= 45 ? '#3b82f6' : '#f59e0b';

  const animWins = useCountUp(stats.wins, 900, !isLoading);
  const animLosses = useCountUp(stats.losses, 900, !isLoading);
  const animVoids = useCountUp(stats.voids ?? 0, 900, !isLoading);
  const animTotal = useCountUp(stats.totalPicks, 900, !isLoading);
  const animRate = useCountUp(Math.round(winPct), 900, !isLoading);

  const topMarkets = [...byMarket]
    .filter(m => m.totalPicks >= 1)
    .sort((a, b) => b.winRate - a.winRate)
    .slice(0, 8);

  const marketLabel = (key: string) =>
    key.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());

  const fade = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="max-w-2xl mx-auto px-4 pb-10">

        {/* Page header */}
        <div className="flex items-center gap-3 pt-6 mb-6">
          <button onClick={() => setLocation('/')} className="p-2 hover:bg-white/5 rounded-xl transition shrink-0">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-black flex items-center gap-2">
              <Trophy className="w6 h-6 text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]" />
              Track Record
              {isPremium && (
                <span className="ml-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/25 uppercase tracking-wide">
                  Premium
                </span>
              )}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">{data?.period ?? ('Last ' + days + ' days')} of prediction history</p>
          </div>
          {isPremium && (
            <div className="flex items-center gap-1 bg-white/4 border border-white/8 rounded-full px-1 py-1">
              {[7, 14, 30].map(d => (
                <PeriodPill key={d} label={d + 'd'} active={days === d} onClick={() => setDays(d)} />
              ))}
            </div>
          )}
        </div>

        {!isPremium ? (
          <PremiumGate onUpgrade={() => setLocation('/paywall')} />
        ) : isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-32 rounded-2xl bg-white/5 animate-pulse" style={{ animationDelay: (i * 0.1) + 's' }} />
            ))}
          </div>
        ) : stats.totalPicks === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white/4 border border-white/8 rounded-2xl p-12 text-center">
            <Trophy className="w-12 h-12 text-white/20 mx-auto mb-4" />
            <p className="text-white/60 mb-2 font-semibold">No predictions tracked yet</p>
            <p className="text-white/30 text-sm">Predictions are logged automatically. Check back after matches!</p>
          </motion.div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={days}
              variants={{ show: { transition: { staggerChildren: 0.07 } } }}
              initial="hidden" animate="show"
              className="space-y-4"
            >
              {/* Win rate hero */}
              <motion.div variants={fade} className="bg-white/4 border border-white/8 rounded-2xl p-6 flex items-center gap-5">
                <div className="shrink-0 relative">
                  <WinRing pct={winPct} color={ringColor} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-black tabular-nums" style={{ color: ringColor }}>
                      {animRate}%
                    </span>
                    <span className="text-[9px] text-white/40 uppercase tracking-wider">Win Rate</span>
                    <span className="text-[8px] text-white/25 mt-0.5">settled only</span>
                  </div>
                </div>
              </motion.div>


              {/* Market breakdown */}
              {topMarkets.length > 0 && (
                <motion.div variants={fade} className="bg-white/4 border border-white/8 rounded-2xl p-5">
                  <h3 className="text-sm font-bold mb-5 flex items-center gap-2">
                    <Target className="w-4 h-4 text-primary" /> Best Markets
                  </h3>
                  <div className="space-y-4">
                    {topMarkets.map((market, i) => (
                      <MarketRow key={market.market} market={market} index={i} label={marketLabel(market.market)} />
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Verified badge */}
              <motion.div variants={fade} className="flex items-center gap-3 px-5 py-4 bg-white/4 border border-white/8 rounded-2xl">
                <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
                <div>
                  <p className="text-xs font-bold text-white/80">Verified Performance</p>
                  <p className="text-[11px] text-white/40 mt-0.5">Win rate is calculated from settled matches only.</p>
                </div>
              </motion.div>

            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
