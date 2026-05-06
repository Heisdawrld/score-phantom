import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchApi } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Target, Shield, CheckCircle, XCircle, TrendingUp, BarChart2, Clock } from 'lucide-react';
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
  if (!marketId) return '—';
  return MARKET_LABELS[marketId] || marketId.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function HitRateBar({ rate, color = 'bg-primary' }: { rate: number; color?: string }) {
  return (
    <div className="h-1 bg-white/5 rounded-full overflow-hidden mt-2">
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
    <div className='min-h-screen bg-[#060a0e] pb-24 relative overflow-hidden'>
      <div className='fixed inset-0 pointer-events-none'>
        <div className={cn(
          'absolute top-[-16%] right-[-12%] h-[44vh] w-[44vw] rounded-full blur-[120px]',
          isBasketball ? 'bg-orange-500/12' : 'bg-primary/10'
        )} />
        <div className='absolute bottom-[-14%] left-[-8%] h-[40vh] w-[38vw] rounded-full bg-cyan-500/8 blur-[120px]' />
      </div>
      <Header />

      <main className='relative z-10 max-w-lg mx-auto px-4 pt-6 space-y-6'>

        {/* Header */}
        <div className='rounded-[30px] border border-white/[0.06] bg-white/[0.025] p-5 text-center space-y-4 mb-2 overflow-hidden relative'>
          <div className={cn(
            'absolute -right-8 -top-10 h-28 w-28 rounded-full blur-3xl',
            isBasketball ? 'bg-orange-400/18' : 'bg-primary/16'
          )} />
          <div className='relative inline-flex items-center justify-center p-3 rounded-full mb-1 bg-white/[0.04] border border-white/[0.06]'>
            <Activity className={cn('w-8 h-8', isBasketball ? 'text-orange-200' : 'text-primary')} />
          </div>
          <div className='relative flex items-center justify-center gap-2 flex-wrap'>
            <span className={cn(
              'rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]',
              isBasketball ? 'border-orange-300/25 bg-orange-400/10 text-orange-200' : 'border-primary/20 bg-primary/10 text-primary'
            )}>
              {isBasketball ? 'Basketball Ledger' : 'Football Ledger'}
            </span>
            <span className='rounded-full border border-white/[0.08] bg-black/25 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/35'>
              {effectiveSource === 'live' ? 'Live Settlements' : 'Historical Backtest'}
            </span>
          </div>
          <div className='relative'>
            <h1 className='text-3xl font-display tracking-widest text-white drop-shadow-md'>
              TRACK <span className={isBasketball ? 'text-orange-200' : 'text-primary'}>RECORD</span>
            </h1>
            <p className='text-white/40 text-sm px-4 mt-2 leading-relaxed'>
              Verifiable hit rates, separated by sport so football stays honest and basketball grows on its own track.
            </p>
          </div>
        </div>

        <div className='flex items-center justify-center'>
          <div className='flex items-center gap-1 p-1 bg-white/5 rounded-2xl border border-white/5'>
            {(['football', 'basketball'] as const).map((sport) => (
              <button
                key={sport}
                onClick={() => setActiveSport(sport)}
                className={cn(
                  'px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-[0.18em] transition-all',
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
        </div>

        {hasData && (
          <div className='grid grid-cols-3 gap-3'>
            <div className='rounded-2xl border border-white/[0.06] bg-black/25 p-4'>
              <p className='text-[10px] font-black uppercase tracking-[0.18em] text-white/30'>Settled</p>
              <p className='mt-2 text-2xl font-black text-white'>{overall.total}</p>
            </div>
            <div className='rounded-2xl border border-white/[0.06] bg-black/25 p-4'>
              <p className='text-[10px] font-black uppercase tracking-[0.18em] text-white/30'>Won</p>
              <p className={cn('mt-2 text-2xl font-black', isBasketball ? 'text-orange-200' : 'text-primary')}>{overall.won || 0}</p>
            </div>
            <div className='rounded-2xl border border-white/[0.06] bg-black/25 p-4'>
              <p className='text-[10px] font-black uppercase tracking-[0.18em] text-white/30'>Source</p>
              <p className='mt-2 text-sm font-black uppercase tracking-[0.18em] text-white/72'>{effectiveSource}</p>
            </div>
          </div>
        )}

        {/* Overall Hit Rate */}
        {statsLoading ? (
          <div className='glass-panel p-8 rounded-[2rem] border border-white/5 flex items-center justify-center'>
            <div className='w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin' />
          </div>
        ) : hasData ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              'glass-panel p-6 rounded-[2rem] shadow-[0_0_40px_rgba(16,231,116,0.1)] relative overflow-hidden',
              isBasketball ? 'border-orange-300/20 shadow-[0_0_40px_rgba(251,146,60,0.12)]' : 'border-primary/20'
            )}
          >
            <div className={cn(
              'absolute inset-0',
              isBasketball
                ? 'bg-[radial-gradient(ellipse_at_top,rgba(251,146,60,0.1),transparent_70%)]'
                : 'bg-[radial-gradient(ellipse_at_top,rgba(16,231,116,0.1),transparent_70%)]'
            )} />

            <div className='relative z-10 flex flex-col items-center justify-center py-2'>
              <p className='text-xs font-bold text-white/50 uppercase tracking-widest mb-2 flex items-center gap-2'>
                <Shield className='w-4 h-4' /> Overall Accuracy
              </p>
              <div className='text-6xl font-display text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]'>
                {((overall.hitRate || 0) * 100).toFixed(1)}<span className={cn('text-3xl', isBasketball ? 'text-orange-200' : 'text-primary')}>%</span>
              </div>
              <p className={cn('text-sm font-medium mt-3 tracking-wide', isBasketball ? 'text-orange-200/80' : 'text-primary/80')}>
                {overall.won} Won / {overall.total} Total
              </p>
              <div className='flex items-center gap-4 mt-4 text-[11px] text-white/30'>
                {stats?.live?.total > 0 && <span>{stats.live.total} live picks</span>}
                {activeSport === 'football' && stats?.historical?.total > 0 && <span>{stats.historical.total} historical</span>}
              </div>
            </div>
          </motion.div>
        ) : (
          <div className='glass-panel p-8 rounded-[2rem] border border-white/5 text-center'>
            <div className='text-5xl mb-4'>📊</div>
            <p className='text-white/50 font-medium'>Building Track Record</p>
            <p className='text-white/30 text-sm mt-2 max-w-xs mx-auto leading-relaxed'>
              Predictions are evaluated automatically as matches finish. Check back tomorrow to see today's hit rate.
            </p>
          </div>
        )}

        {/* Monthly Breakdown */}
        {stats?.monthly && stats.monthly.length > 0 && (
          <div className='space-y-3'>
            <h2 className='text-xs font-black text-white/40 uppercase tracking-widest pl-1 flex items-center gap-2'>
              <BarChart2 className='w-4 h-4' /> Monthly Performance
            </h2>
            <div className='glass-panel p-4 rounded-2xl border border-white/5 space-y-3'>
              {stats.monthly.map((m: any) => (
                <div key={m.month}>
                  <div className='flex justify-between items-center'>
                    <span className='text-xs text-white/60 font-medium'>{m.month}</span>
                    <div className='flex items-center gap-2'>
                      <span className='text-xs text-white/30'>{m.won}/{m.total}</span>
                      <span className={cn('text-sm font-display font-black',
                        m.hitRate >= 0.6 ? 'text-primary' : m.hitRate >= 0.5 ? 'text-amber-400' : 'text-red-400'
                      )}>
                        {(m.hitRate * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <HitRateBar
                    rate={m.hitRate}
                    color={m.hitRate >= 0.6 ? 'bg-primary' : m.hitRate >= 0.5 ? 'bg-amber-400' : 'bg-red-500'}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Market Performance Grid */}
        {stats?.byMarket && stats.byMarket.length > 0 && (
          <div className='space-y-3'>
            <h2 className='text-xs font-black text-white/40 uppercase tracking-widest pl-1 flex items-center gap-2'>
              <Target className='w-4 h-4' /> Performance by Market
            </h2>
            <div className='grid grid-cols-2 gap-3'>
              {stats.byMarket.filter((m: any) => m.total >= 3).slice(0, 8).map((m: any) => (
                <div key={m.market} className='glass-panel p-4 rounded-2xl border border-white/5'>
                  <p className='text-[10px] font-bold text-white/50 uppercase tracking-wider mb-1 truncate'>
                    {formatMarket(m.market)}
                  </p>
                  <p className={cn('text-2xl font-display',
                    m.hitRate >= 0.6 ? 'text-primary' : m.hitRate >= 0.5 ? 'text-amber-400' : 'text-white/70'
                  )}>
                    {(m.hitRate * 100).toFixed(1)}<span className='text-sm text-white/30'>%</span>
                  </p>
                  <p className='text-[10px] text-white/30 mt-1'>{m.won}W / {m.total - m.won}L</p>
                  <HitRateBar rate={m.hitRate} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Confidence Breakdown */}
        {stats?.byConfidence && stats.byConfidence.length > 0 && (
          <div className='space-y-3'>
            <h2 className='text-xs font-black text-white/40 uppercase tracking-widest pl-1 flex items-center gap-2'>
              <TrendingUp className='w-4 h-4' /> By Confidence Tier
            </h2>
            <div className='glass-panel p-4 rounded-2xl border border-white/5 space-y-3'>
              {stats.byConfidence.map((c: any) => (
                <div key={c.confidence}>
                  <div className='flex justify-between items-center'>
                    <div className='flex items-center gap-2'>
                      <div className={cn('w-2 h-2 rounded-full',
                        c.confidence === 'HIGH' ? 'bg-primary' :
                        c.confidence === 'MEDIUM' ? 'bg-amber-400' : 'bg-white/30'
                      )} />
                      <span className='text-xs text-white/60 font-medium capitalize'>{(c.confidence || '?').toLowerCase()}</span>
                    </div>
                    <div className='flex items-center gap-2'>
                      <span className='text-xs text-white/30'>{c.won}/{c.total}</span>
                      <span className={cn('text-sm font-display font-black',
                        c.hitRate >= 0.6 ? 'text-primary' : c.hitRate >= 0.5 ? 'text-amber-400' : 'text-white/50'
                      )}>
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

        {/* Recent Results Toggle */}
        <div className='space-y-3'>
          <div className='flex items-center justify-between'>
            <h2 className='text-xs font-black text-white/40 uppercase tracking-widest pl-1 flex items-center gap-2'>
              <Clock className='w-4 h-4' /> Recent Results
            </h2>
            <div className='flex items-center gap-1 p-1 bg-white/5 rounded-xl border border-white/5'>
              {(['live', 'backtest'] as const).map(src => (
                <button
                  key={src}
                  onClick={() => activeSport === 'football' && setActiveSource(src)}
                  disabled={activeSport === 'basketball' && src === 'backtest'}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all',
                    effectiveSource === src
                      ? isBasketball && src === 'live'
                        ? 'bg-orange-300 text-black'
                        : 'bg-primary text-black'
                      : 'text-white/40 hover:text-white/70',
                    activeSport === 'basketball' && src === 'backtest' && 'opacity-35 cursor-not-allowed'
                  )}
                >
                  {src === 'live' ? 'Live' : 'History'}
                </button>
              ))}
            </div>
          </div>

          {activeSport === 'basketball' && (
            <div className='rounded-2xl border border-orange-300/15 bg-orange-400/[0.06] px-4 py-3 text-[11px] text-orange-100/75'>
              Basketball uses live settlement only for now, so the record stays clean and separated from football backtests.
            </div>
          )}

          {recentLoading ? (
            <div className='flex justify-center py-8'>
              <div className='w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin' />
            </div>
          ) : recent?.results?.length > 0 ? (
            <div className='space-y-3'>
              {recent.results.map((r: any, i: number) => (
                <motion.div
                  key={r.fixture_id || i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className='glass-panel p-4 rounded-2xl border border-white/5 relative overflow-hidden'
                >
                  <div className={cn(
                    'absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl',
                    r.actual_result === 'WON' ? 'bg-primary shadow-[0_0_10px_rgba(16,231,116,0.8)]' :
                    r.actual_result === 'LOST' ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]' :
                    'bg-white/20'
                  )} />

                  <div className='flex justify-between items-start mb-2 pl-2'>
                    <div className='flex-1 min-w-0 mr-3'>
                      <p className='text-sm font-bold text-white truncate'>{r.home_team} vs {r.away_team}</p>
                      <p className='text-[10px] text-white/40 mt-0.5'>
                        {r.match_date ? new Date(r.match_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : ''}
                        {r.tournament ? ` · ${r.tournament}` : ''}
                      </p>
                    </div>
                    <div className={cn(
                      'flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-black tracking-wider uppercase border shrink-0',
                      r.actual_result === 'WON' ? 'bg-primary/10 text-primary border-primary/20' :
                      r.actual_result === 'LOST' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                      'bg-white/5 text-white/30 border-white/10'
                    )}>
                      {r.actual_result === 'WON' ? <CheckCircle className='w-3 h-3' /> :
                       r.actual_result === 'LOST' ? <XCircle className='w-3 h-3' /> :
                       <span>—</span>}
                      {r.actual_result}
                    </div>
                  </div>

                  <div className='flex justify-between items-end pl-2 pt-2 border-t border-white/5'>
                    <div>
                      <p className='text-[10px] uppercase text-white/30 mb-0.5'>Pick</p>
                      <p className='text-sm font-display text-white/80'>
                        {r.selection || formatMarket(r.top_prediction)}
                      </p>
                    </div>
                    <div className='text-right'>
                      <p className='text-[10px] uppercase text-white/30 mb-0.5'>Score</p>
                      <p className='text-lg font-display text-white'>
                        {r.full_score || (r.home_goals != null ? `${r.home_goals}-${r.away_goals}` : '—')}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className='glass-panel p-8 text-center rounded-2xl border border-white/5'>
              <p className='text-4xl mb-3'>🏆</p>
              <p className='text-white/50 text-sm'>No results yet for this source.</p>
              <p className='text-[10px] text-white/30 mt-2'>
                {effectiveSource === 'live'
                  ? 'Live picks are evaluated automatically after matches end.'
                  : 'Run the backtest script to populate historical data.'}
              </p>
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
