import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Activity,
  ArrowUpRight,
  BarChart2,
  CheckCircle,
  Clock,
  Layers3,
  Shield,
  Target,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { fetchApi } from '@/lib/api';
import { cn } from '@/lib/utils';

const MARKET_LABELS: Record<string, string> = {
  over_2_5: 'Over 2.5', under_2_5: 'Under 2.5',
  over_1_5: 'Over 1.5', under_1_5: 'Under 1.5',
  over_3_5: 'Over 3.5', under_3_5: 'Under 3.5',
  btts_yes: 'BTTS Yes', btts_no: 'BTTS No',
  home_win: 'Home Win', away_win: 'Away Win', draw: 'Draw',
  double_chance: 'Double Chance', draw_no_bet: 'Draw No Bet',
  home_over_0_5: 'Home O0.5', away_over_0_5: 'Away O0.5',
  home_over_1_5: 'Home O1.5', away_over_1_5: 'Away O1.5',
};

function formatMarket(marketId: string) {
  if (!marketId) return '--';
  return MARKET_LABELS[marketId] || marketId.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function HitRateBar({ rate, color = 'bg-primary' }: { rate: number; color?: string }) {
  return (
    <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/5">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, rate * 100).toFixed(1)}%` }}
        transition={{ duration: 1, ease: 'easeOut' }}
        className={cn('h-full rounded-full', color)}
      />
    </div>
  );
}

export default function TrackRecord() {
  const [activeSport, setActiveSport] = useState<'football' | 'basketball'>('football');
  const [activeSource, setActiveSource] = useState<'live' | 'backtest'>('live');
  const effectiveSource = activeSport === 'basketball' ? 'live' : activeSource;
  const isBasketball = activeSport === 'basketball';

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['track-record-stats', activeSport],
    queryFn: () => fetchApi(`/track-record/stats?sport=${activeSport}`),
    staleTime: 5 * 60 * 1000,
  });

  const { data: recent, isLoading: recentLoading } = useQuery({
    queryKey: ['track-record-recent', activeSport, effectiveSource],
    queryFn: () => fetchApi(`/track-record/recent?limit=50&source=${effectiveSource}&sport=${activeSport}`),
    staleTime: 5 * 60 * 1000,
  });

  const overall = stats?.overall || {};
  const hasData = overall.total > 0;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#060a0e] pb-24">
      <div className="pointer-events-none fixed inset-0">
        <div
          className={cn(
            'absolute right-[-12%] top-[-16%] h-[44vh] w-[44vw] rounded-full blur-[120px]',
            isBasketball ? 'bg-orange-500/12' : 'bg-primary/10'
          )}
        />
        <div className="absolute bottom-[-14%] left-[-8%] h-[40vh] w-[38vw] rounded-full bg-cyan-500/8 blur-[120px]" />
      </div>
      <Header />

      <main className="relative z-10 mx-auto max-w-6xl space-y-6 px-4 pt-6">
        <section className="grid gap-4 xl:grid-cols-[1.55fr_0.85fr]">
          <div className="premium-surface relative overflow-hidden rounded-[34px] p-6 md:p-7">
            <div className={cn('absolute -right-10 -top-10 h-36 w-36 rounded-full blur-3xl', isBasketball ? 'bg-orange-400/18' : 'bg-primary/16')} />
            <div className="relative space-y-6">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    'rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]',
                    isBasketball ? 'border-orange-300/25 bg-orange-400/10 text-orange-200' : 'border-primary/20 bg-primary/10 text-primary'
                  )}
                >
                  {isBasketball ? 'Basketball Ledger' : 'Football Ledger'}
                </span>
                <span className="rounded-full border border-white/[0.08] bg-black/25 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/35">
                  {effectiveSource === 'live' ? 'Live Settlements' : 'Historical Backtest'}
                </span>
              </div>

              <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
                <div>
                  <div className="mb-4 inline-flex items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.04] p-3">
                    <Activity className={cn('h-7 w-7', isBasketball ? 'text-orange-200' : 'text-primary')} />
                  </div>
                  <h1 className="font-display text-4xl tracking-[0.14em] text-white md:text-5xl">
                    TRACK <span className={isBasketball ? 'text-orange-200' : 'text-primary'}>RECORD</span>
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/42 md:text-base">
                    Verifiable hit rates, separated by sport so football keeps its own truth and basketball can mature on a clean independent record.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="premium-stat">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/30">Total Picks</p>
                    <p className="mt-2 text-lg font-black text-white">{overall.total || 0}</p>
                    <p className="mt-1 text-xs text-white/35">Settled predictions.</p>
                  </div>
                  <div className="premium-stat">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/30">Win Rate</p>
                    <p className={cn('mt-2 text-lg font-black', isBasketball ? 'text-orange-200' : 'text-primary')}>
                      {overall.hitRate ? `${(overall.hitRate * 100).toFixed(0)}%` : '—'}
                    </p>
                    <p className="mt-1 text-xs text-white/35">Overall accuracy.</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-1 rounded-2xl border border-white/5 bg-white/5 p-1">
                  {(['football', 'basketball'] as const).map((sport) => (
                    <button
                      key={sport}
                      onClick={() => setActiveSport(sport)}
                      className={cn(
                        'rounded-xl px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] transition-all',
                        activeSport === sport
                          ? sport === 'basketball'
                            ? 'bg-orange-300 text-black'
                            : 'bg-primary text-black'
                          : 'text-white/40 hover:text-white/70'
                      )}
                    >
                      {sport}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1 rounded-2xl border border-white/5 bg-white/5 p-1">
                  {(['live', 'backtest'] as const).map((src) => (
                    <button
                      key={src}
                      onClick={() => activeSport === 'football' && setActiveSource(src)}
                      disabled={activeSport === 'basketball' && src === 'backtest'}
                      className={cn(
                        'rounded-xl px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] transition-all',
                        effectiveSource === src
                          ? isBasketball && src === 'live'
                            ? 'bg-orange-300 text-black'
                            : 'bg-primary text-black'
                          : 'text-white/40 hover:text-white/70',
                        activeSport === 'basketball' && src === 'backtest' && 'cursor-not-allowed opacity-35'
                      )}
                    >
                      {src === 'live' ? 'Live' : 'History'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {hasData && (
              <div className="grid grid-cols-3 gap-3 xl:grid-cols-1">
                <div className="premium-stat">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/30">Settled</p>
                  <p className="mt-2 text-2xl font-black text-white">{overall.total}</p>
                </div>
                <div className="premium-stat">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/30">Won</p>
                  <p className={cn('mt-2 text-2xl font-black', isBasketball ? 'text-orange-200' : 'text-primary')}>{overall.won || 0}</p>
                </div>
                <div className="premium-stat">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/30">Source</p>
                  <p className="mt-2 text-sm font-black uppercase tracking-[0.18em] text-white/72">{effectiveSource}</p>
                </div>
              </div>
            )}


          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            {statsLoading ? (
              <div className="glass-panel flex items-center justify-center rounded-[2rem] border border-white/5 p-8">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : hasData ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  'glass-panel relative overflow-hidden rounded-[2rem] p-6 shadow-[0_0_40px_rgba(16,231,116,0.1)]',
                  isBasketball ? 'border-orange-300/20 shadow-[0_0_40px_rgba(251,146,60,0.12)]' : 'border-primary/20'
                )}
              >
                <div
                  className={cn(
                    'absolute inset-0',
                    isBasketball
                      ? 'bg-[radial-gradient(ellipse_at_top,rgba(251,146,60,0.1),transparent_70%)]'
                      : 'bg-[radial-gradient(ellipse_at_top,rgba(16,231,116,0.1),transparent_70%)]'
                  )}
                />

                <div className="relative z-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
                  <div>
                    <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/50">
                      <Shield className="h-4 w-4" /> Overall Accuracy
                    </p>
                    <div className="text-6xl font-display text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
                      {((overall.hitRate || 0) * 100).toFixed(1)}<span className={cn('text-3xl', isBasketball ? 'text-orange-200' : 'text-primary')}>%</span>
                    </div>
                    <p className={cn('mt-3 text-sm font-medium tracking-wide', isBasketball ? 'text-orange-200/80' : 'text-primary/80')}>
                      {overall.won} Won / {overall.total} Total
                    </p>
                  </div>

                  <div className="grid flex-1 grid-cols-3 gap-3 lg:max-w-md">
                    <div className="rounded-2xl border border-white/[0.06] bg-black/30 p-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-white/28">Live</p>
                      <p className="mt-2 text-xl font-black text-white">{stats?.live?.total || 0}</p>
                    </div>
                    <div className="rounded-2xl border border-white/[0.06] bg-black/30 p-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-white/28">History</p>
                      <p className="mt-2 text-xl font-black text-white">{activeSport === 'football' ? stats?.historical?.total || 0 : 0}</p>
                    </div>
                    <div className="rounded-2xl border border-white/[0.06] bg-black/30 p-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-white/28">Wins</p>
                      <p className={cn('mt-2 text-xl font-black', isBasketball ? 'text-orange-200' : 'text-primary')}>{overall.won || 0}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="glass-panel rounded-[2rem] border border-white/5 p-8 text-center">
                <div className="mb-4 text-5xl">Track</div>
                <p className="font-medium text-white/50">Building Track Record</p>
                <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-white/30">
                  Predictions are evaluated automatically as matches finish. Check back tomorrow to see today&apos;s hit rate.
                </p>
              </div>
            )}

            {stats?.monthly && stats.monthly.length > 0 && (
              <div className="space-y-3">
                <h2 className="flex items-center gap-2 pl-1 text-xs font-black uppercase tracking-widest text-white/40">
                  <BarChart2 className="h-4 w-4" /> Monthly Performance
                </h2>
                <div className="glass-panel space-y-3 rounded-2xl border border-white/5 p-4">
                  {stats.monthly.map((m: any) => (
                    <div key={m.month}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-white/60">{m.month}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-white/30">{m.won}/{m.total}</span>
                          <span className={cn('text-sm font-display font-black', m.hitRate >= 0.6 ? 'text-primary' : m.hitRate >= 0.5 ? 'text-amber-400' : 'text-red-400')}>
                            {(m.hitRate * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                      <HitRateBar rate={m.hitRate} color={m.hitRate >= 0.6 ? 'bg-primary' : m.hitRate >= 0.5 ? 'bg-amber-400' : 'bg-red-500'} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-6">
            {stats?.byMarket && stats.byMarket.length > 0 && (
              <div className="space-y-3">
                <h2 className="flex items-center gap-2 pl-1 text-xs font-black uppercase tracking-widest text-white/40">
                  <Target className="h-4 w-4" /> Performance by Market
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {stats.byMarket.filter((m: any) => m.total >= 3).slice(0, 8).map((m: any) => (
                    <div key={m.market} className="glass-panel rounded-2xl border border-white/5 p-4">
                      <p className="mb-1 truncate text-[10px] font-bold uppercase tracking-wider text-white/50">{formatMarket(m.market)}</p>
                      <p className={cn('text-2xl font-display', m.hitRate >= 0.6 ? 'text-primary' : m.hitRate >= 0.5 ? 'text-amber-400' : 'text-white/70')}>
                        {(m.hitRate * 100).toFixed(1)}<span className="text-sm text-white/30">%</span>
                      </p>
                      <p className="mt-1 text-[10px] text-white/30">{m.won}W / {m.total - m.won}L</p>
                      <HitRateBar rate={m.hitRate} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {stats?.byConfidence && stats.byConfidence.length > 0 && (
              <div className="space-y-3">
                <h2 className="flex items-center gap-2 pl-1 text-xs font-black uppercase tracking-widest text-white/40">
                  <TrendingUp className="h-4 w-4" /> By Confidence Tier
                </h2>
                <div className="glass-panel space-y-3 rounded-2xl border border-white/5 p-4">
                  {stats.byConfidence.map((c: any) => (
                    <div key={c.confidence}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={cn('h-2 w-2 rounded-full', c.confidence === 'HIGH' ? 'bg-primary' : c.confidence === 'MEDIUM' ? 'bg-amber-400' : 'bg-white/30')} />
                          <span className="text-xs font-medium capitalize text-white/60">{(c.confidence || '?').toLowerCase()}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-white/30">{c.won}/{c.total}</span>
                          <span className={cn('text-sm font-display font-black', c.hitRate >= 0.6 ? 'text-primary' : c.hitRate >= 0.5 ? 'text-amber-400' : 'text-white/50')}>
                            {(c.hitRate * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                      <HitRateBar rate={c.hitRate} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 pl-1 text-xs font-black uppercase tracking-widest text-white/40">
              <Clock className="h-4 w-4" /> Recent Results
            </h2>
            <span className="hidden rounded-full border border-white/[0.08] bg-black/20 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/35 md:inline-flex">
              {recent?.results?.length || 0} settled views
            </span>
          </div>



          {recentLoading ? (
            <div className="flex justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : recent?.results?.length > 0 ? (
            <div className="grid gap-3 xl:grid-cols-2">
              {recent.results.map((r: any, i: number) => (
                <motion.div
                  key={r.fixture_id || i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="glass-panel relative overflow-hidden rounded-2xl border border-white/5 p-4"
                >
                  <div
                    className={cn(
                      'absolute bottom-0 left-0 top-0 w-1 rounded-l-2xl',
                      r.actual_result === 'WON'
                        ? 'bg-primary shadow-[0_0_10px_rgba(16,231,116,0.8)]'
                        : r.actual_result === 'LOST'
                          ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]'
                          : 'bg-white/20'
                    )}
                  />

                  <div className="mb-2 flex items-start justify-between pl-2">
                    <div className="mr-3 min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-white">{r.home_team} vs {r.away_team}</p>
                      <p className="mt-0.5 text-[10px] text-white/40">
                        {r.match_date ? new Date(r.match_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : ''}
                        {r.tournament ? ` · ${r.tournament}` : ''}
                      </p>
                    </div>
                    <div
                      className={cn(
                        'flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-black uppercase tracking-wider',
                        r.actual_result === 'WON'
                          ? 'border-primary/20 bg-primary/10 text-primary'
                          : r.actual_result === 'LOST'
                            ? 'border-red-500/20 bg-red-500/10 text-red-500'
                            : 'border-white/10 bg-white/5 text-white/30'
                      )}
                    >
                      {r.actual_result === 'WON' ? <CheckCircle className="h-3 w-3" /> : r.actual_result === 'LOST' ? <XCircle className="h-3 w-3" /> : <span>--</span>}
                      {r.actual_result}
                    </div>
                  </div>

                  <div className="flex items-end justify-between border-t border-white/5 pl-2 pt-2">
                    <div>
                      <p className="mb-0.5 text-[10px] uppercase text-white/30">Pick</p>
                      <p className="text-sm font-display text-white/80">{r.selection || formatMarket(r.top_prediction)}</p>
                    </div>
                    <div className="text-right">
                      <p className="mb-0.5 text-[10px] uppercase text-white/30">Score</p>
                      <p className="text-lg font-display text-white">{r.full_score || (r.home_goals != null ? `${r.home_goals}-${r.away_goals}` : '--')}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="glass-panel rounded-2xl border border-white/5 p-8 text-center">
              <p className="mb-3 text-4xl">Ledger</p>
              <p className="text-sm text-white/50">No results yet for this source.</p>
              <p className="mt-2 text-[10px] text-white/30">
                {effectiveSource === 'live' ? 'Live picks are evaluated automatically after matches end.' : 'Run the backtest script to populate historical data.'}
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
