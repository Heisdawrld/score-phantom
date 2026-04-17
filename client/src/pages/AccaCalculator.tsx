import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Header } from '@/components/layout/Header';
import { fetchApi } from '@/lib/api';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { ChevronLeft, Zap, Crown, Lock, RefreshCw, Target, TrendingUp, AlertTriangle, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { ConfidenceRing } from '@/components/ui/ConfidenceRing';
import { ConfidenceBadge } from '@/components/ui/ConfidenceBadge';

function formatAccaMarket(key: string): string {
  const m: Record<string, string> = {
    home_win: "Home Win", away_win: "Away Win", draw: "Draw",
    over_15: "Over 1.5", over_25: "Over 2.5", over_35: "Over 3.5",
    under_15: "Under 1.5", under_25: "Under 2.5", under_35: "Under 3.5",
    btts_yes: "Both Teams Score", btts_no: "BTTS No",
    double_chance_home: "Home or Draw", double_chance_away: "Away or Draw",
    dnb_home: "Home Win (DNB)", dnb_away: "Away Win (DNB)",
    home_over_15: "Home Over 1.5", away_over_15: "Away Over 1.5",
    home_under_15: "Home Under 1.5", away_under_15: "Away Under 1.5",
  };
  return m[key] ?? (key || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
}

export default function DailyAcca() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading: authLoading } = useAuth();
  const isPremium = user?.access_status === 'active' || (user as any)?.subscription_active || (user as any)?.has_access;
  const [stake, setStake] = useState(1000);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['/api/acca'],
    queryFn: () => fetchApi('/acca'),
    enabled: !!isPremium && !authLoading,
    staleTime: 15 * 60 * 1000,
  });

  // ACCA win rate from track record
  const { data: trData } = useQuery({
    queryKey: ['/api/acca-results'],
    queryFn: () => fetchApi('/track-record?days=30'),
    enabled: !!isPremium,
    staleTime: 10 * 60 * 1000,
  });
  const accaStats = (trData as any)?.overallStats || null;

  if (authLoading) return <div className='min-h-screen bg-background' />;

  const picks = data?.picks || [];
  const combinedOdds = picks.reduce((acc: number, p: any) => {
    // If the API returned valid odds for this specific market, use them.
    // Otherwise, mathematically imply the true odds from the model's probability, 
    // applying a standard 5% bookmaker margin (0.95).
    const o = p.pickOdds || (100 / Math.max(p.probability, 1)) * 0.95;
    return acc * parseFloat(o);
  }, 1);
  const potentialReturn = stake * combinedOdds;
  const avgProb = picks.length > 0
    ? picks.reduce((s: number, p: any) => s + (p.probability || 0), 0) / picks.length
    : 0;

  // Find weakest + strongest links
  const sorted = [...picks].sort((a: any, b: any) => (a.probability || 0) - (b.probability || 0));
  const weakestLink = sorted[0] || null;
  const strongestLink = sorted[sorted.length - 1] || null;

  return (
    <div className='min-h-screen bg-background'>
      <Header />
      <div className='max-w-2xl mx-auto px-4 pb-24'>
        {/* ── Header ── */}
        <div className='flex items-center gap-3 pt-6 mb-6'>
          <button onClick={() => setLocation('/')} className='p-2 hover:bg-white/5 rounded-xl transition'>
            <ChevronLeft className='w-5 h-5' />
          </button>
          <div className='flex-1'>
            <h1 className='text-2xl font-black flex items-center gap-2'>
              <Zap className='w-6 h-6 text-primary drop-shadow-[0_0_8px_rgba(16,231,116,0.6)]' />
              Daily ACCA
            </h1>
            <p className='text-xs text-white/35 mt-0.5'>Smart auto-generated accumulator</p>
          </div>
          {isPremium && (
            <button onClick={() => refetch()} className='p-2 hover:bg-white/5 rounded-xl transition text-white/30 hover:text-white'>
              <RefreshCw className='w-4 h-4' />
            </button>
          )}
        </div>

        {/* ── Not Premium ── */}
        {!isPremium ? (
          <div className='flex flex-col items-center justify-center py-20 text-center gap-6'>
            <div className='w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center glow-primary'>
              <Crown className='w-10 h-10 text-primary' />
            </div>
            <div>
              <h2 className='text-xl font-black text-white mb-2'>Premium Feature</h2>
              <p className='text-white/40 text-sm max-w-xs'>Daily ACCA is available to premium subscribers only.</p>
            </div>
            <button onClick={() => setLocation('/paywall')} className='flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-black font-bold text-sm shadow-[0_0_20px_rgba(16,231,116,0.25)]'>
              <Lock className='w-4 h-4' /> Upgrade to Premium
            </button>
          </div>
        ) : isLoading ? (
          <div className='flex justify-center py-20'>
            <div className='w-10 h-10 rounded-full border-4 border-primary/20 border-t-primary animate-spin' />
          </div>
        ) : picks.length === 0 ? (
          <div className='text-center py-16'>
            <Zap className='w-12 h-12 text-white/15 mx-auto mb-4' />
            <p className='text-white/50 font-semibold'>No ACCA picks available yet.</p>
            <p className='text-white/25 text-sm mt-2'>Predictions are being built or there aren't enough high-confidence matches today. Check back later.</p>
          </div>
        ) : (
          <div className='space-y-4'>
            {/* ── Smart ACCA Summary ── */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-primary/25 overflow-hidden gradient-card-green"
            >
              <div className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Zap className="w-4 h-4 text-primary" />
                  <span className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Smart ACCA</span>
                  <span className="ml-auto text-[10px] text-white/25">{picks.length} picks</span>
                </div>

                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex-1">
                    <p className="text-4xl font-black text-white tabular-nums">{combinedOdds.toFixed(2)}x</p>
                    <p className="text-xs text-white/35 mt-0.5">Combined Odds</p>
                  </div>
                  <ConfidenceRing
                    value={avgProb}
                    size={64}
                    strokeWidth={4}
                    showLabel
                    label="AVG PROB"
                  />
                </div>

                {/* Stake selector */}
                <p className='text-[10px] text-white/30 mb-2 uppercase tracking-wider'>Stake (NGN)</p>
                <div className='flex gap-2 mb-4'>
                  {[500, 1000, 2000, 5000].map(s => (
                    <button key={s} onClick={() => setStake(s)}
                      className={cn(
                        'flex-1 py-2 rounded-xl text-xs font-bold border transition-all',
                        stake === s
                          ? 'bg-primary text-black border-primary shadow-[0_0_12px_rgba(16,231,116,0.3)]'
                          : 'bg-white/[0.03] text-white/40 border-white/[0.06] hover:bg-white/[0.06]'
                      )}>
                      {s >= 1000 ? s / 1000 + 'k' : s}
                    </button>
                  ))}
                </div>

                {/* Returns display */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3 text-center">
                    <p className="text-[9px] text-white/30 mb-1">Potential Return</p>
                    <p className="text-xl font-black text-primary tabular-nums">NGN{Math.round(potentialReturn).toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3 text-center">
                    <p className="text-[9px] text-white/30 mb-1">Potential Profit</p>
                    <p className="text-xl font-black text-emerald-400 tabular-nums">NGN{Math.round(potentialReturn - stake).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* ── ACCA Picks ── */}
            <div className='space-y-2'>
              {picks.map((pick: any, i: number) => {
                const o = pick.pickOdds || (100 / Math.max(pick.probability, 1)) * 0.95;
                const oddsFmt = parseFloat(o).toFixed(2);
                const prob = pick.probability || 0;

                return (
                  <motion.div
                    key={pick.fixtureId || i}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className='p-4 rounded-2xl glass-card'
                  >
                    <div className='flex items-start gap-3'>
                      {/* Rank number */}
                      <span className='w-8 h-8 rounded-full bg-primary/10 border border-primary/25 flex items-center justify-center text-xs font-black text-primary shrink-0'>
                        {i + 1}
                      </span>

                      {/* Pick details */}
                      <div className='flex-1 min-w-0'>
                        <p className='font-bold text-sm text-white truncate'>
                          {pick.homeTeam} <span className='text-white/30'>vs</span> {pick.awayTeam}
                        </p>
                        <p className='text-[10px] text-white/30 mt-0.5 truncate'>{pick.tournament}</p>
                        <div className='flex items-center gap-2 mt-2'>
                          <span className='inline-flex items-center gap-1 text-xs font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-lg'>
                            <Target className="w-3 h-3" />
                            {formatAccaMarket(pick.market)} — {pick.selection}
                          </span>
                        </div>
                      </div>

                      {/* Odds + Prob */}
                      <div className='text-right shrink-0'>
                        <p className='text-lg font-black text-white tabular-nums'>{oddsFmt}</p>
                        <ConfidenceBadge value={prob} size="sm" className="mt-1" />
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* ── ACCA Insights ── */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="rounded-2xl glass-card p-4"
            >
              <p className="text-[10px] font-black text-white/35 uppercase tracking-wider mb-3">ACCA Insights</p>
              <div className="flex flex-col gap-3">
                {strongestLink && (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                      <TrendingUp className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white/60">Strongest Link</p>
                      <p className="text-[11px] text-primary truncate">{strongestLink.homeTeam} vs {strongestLink.awayTeam} — {strongestLink.probability?.toFixed(0)}%</p>
                    </div>
                  </div>
                )}
                {weakestLink && (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white/60">Weakest Link</p>
                      <p className="text-[11px] text-amber-400 truncate">{weakestLink.homeTeam} vs {weakestLink.awayTeam} — {weakestLink.probability?.toFixed(0)}%</p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>

            {/* ── Disclaimer ── */}
            <div className='rounded-2xl glass-card p-4 text-center'>
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Shield className="w-3 h-3 text-white/15" />
                <p className='text-[10px] text-white/15'>Gamble responsibly</p>
              </div>
              <p className='text-[10px] text-white/10'>ScorePhantom predictions are for informational purposes only.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
