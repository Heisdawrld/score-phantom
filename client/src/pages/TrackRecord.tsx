import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  BadgeCheck,
  BarChart2,
  CheckCircle,
  Clock,
  Flame,
  Info,
  Layers,
  Shield,
  Target,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { fetchApi } from '@/lib/api';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────
interface OverallStats {
  total: number;
  won: number;
  lost: number;
  voided: number;
  hitRate: number;
  // ROI fields (from engine upgrade)
  totalStaked?: number;
  totalProfit?: number;
  roi?: number;
  avgOdds?: number;
  picksWithOdds?: number;
  oddsCoverage?: number;
}

interface MarketStat {
  market: string;
  total: number;
  won: number;
  lost: number;
  hitRate: number;
  staked?: number;
  profit?: number;
  roi?: number;
  avgOdds?: number;
}

interface ConfidenceStat {
  confidence: string;
  total: number;
  won: number;
  hitRate: number;
  staked?: number;
  profit?: number;
  roi?: number;
}

interface MonthlyStat {
  month: string; // 'YYYY-MM'
  total: number;
  won: number;
  hitRate: number;
  staked?: number;
  profit?: number;
  roi?: number;
}

interface OddsBandStat {
  band: string;
  total: number;
  won: number;
  hitRate: number;
  staked: number;
  profit: number;
  roi: number;
}

interface SharpStat {
  kind: string;
  total: number;
  won: number;
  hitRate: number;
  staked: number;
  profit: number;
  roi: number;
}

interface CalibrationStat {
  band: string;
  total: number;
  avgPredicted: number;
  won: number;
  actualWinRate: number;
  gap: number; // negative = overconfident
}

interface TrackRecordStats {
  sport: string;
  overall: OverallStats;
  live: { total: number; won: number };
  backtest: { total: number; won: number; note: string };
  byMarket: MarketStat[];
  byConfidence: ConfidenceStat[];
  monthly: MonthlyStat[];
  byOddsBand?: OddsBandStat[];
  bySharp?: SharpStat[];
  calibration?: CalibrationStat[];
}

type ActualResult = 'WON' | 'LOST' | 'VOID';

interface RecentResult {
  fixture_id: string | number;
  home_team: string;
  away_team: string;
  match_date: string;
  tournament?: string;
  top_prediction: string;
  selection?: string;
  confidence_score?: number;
  model_confidence?: string;
  home_goals?: number | null;
  away_goals?: number | null;
  full_score?: string;
  actual_result: ActualResult;
  _source: string;
  // ROI fields (from engine upgrade)
  best_pick_odds?: number | null;
  stake_units?: number | null;
  profit_units?: number | null;
  is_sharp_value?: number | null;
}

interface RecentResponse {
  results: RecentResult[];
  total: number;
  source: string;
  sport: string;
}

type ResultLimit = 10 | 25 | 50;
type StreakType = 'W' | 'L' | null;
interface StreakInfo {
  count: number;
  type: StreakType;
}
interface DateGroup {
  date: string;
  label: string;
  items: RecentResult[];
}

// ── Constants ──────────────────────────────────────────────────────────────
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

// ── Helpers ────────────────────────────────────────────────────────────────
function formatMarket(marketId: string): string {
  if (!marketId) return '--';
  return MARKET_LABELS[marketId]
    || marketId.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-');
  if (!y || !m) return ym;
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function rateTextColor(rate: number, isBasketball = false): string {
  if (isBasketball) {
    if (rate >= 0.6) return 'text-orange-200';
    if (rate >= 0.5) return 'text-amber-400';
    return 'text-red-400';
  }
  if (rate >= 0.6) return 'text-primary';
  if (rate >= 0.5) return 'text-amber-400';
  return 'text-red-400';
}

function rateBarColor(rate: number): string {
  if (rate >= 0.6) return 'bg-primary';
  if (rate >= 0.5) return 'bg-amber-400';
  return 'bg-red-500';
}

// Current streak: consecutive W or L from the most recent result, skipping VOIDs.
function computeStreak(results: RecentResult[]): StreakInfo {
  if (!results?.length) return { count: 0, type: null };
  let i = 0;
  while (i < results.length && results[i].actual_result === 'VOID') i++;
  if (i >= results.length) return { count: 0, type: null };
  const firstType = results[i].actual_result;
  const type: StreakType = firstType === 'WON' ? 'W' : 'L';
  let count = 0;
  for (let j = i; j < results.length; j++) {
    const r = results[j];
    if (r.actual_result === 'VOID') continue;
    if (r.actual_result === firstType) count++;
    else break;
  }
  return { count, type };
}

// Format ROI as a signed percentage (e.g. +2.1% or -0.5%)
function formatRoi(roi: number): string {
  return `${roi >= 0 ? '+' : ''}${(roi * 100).toFixed(1)}%`;
}

// ROI text color: green for positive, red for negative, muted for zero
function roiTextColor(roi: number): string {
  if (roi > 0.001) return 'text-primary';
  if (roi < -0.001) return 'text-red-400';
  return 'text-white/40';
}

function groupResultsByDate(results: RecentResult[]): DateGroup[] {
  const groups = new Map<string, RecentResult[]>();
  for (const r of results) {
    const d = r.match_date ? new Date(r.match_date) : null;
    const key = d ? d.toLocaleDateString('en-CA') : 'unknown';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  const today = new Date();
  const todayKey = today.toLocaleDateString('en-CA');
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toLocaleDateString('en-CA');
  return Array.from(groups.entries()).map(([date, items]) => {
    let label: string;
    if (date === 'unknown') label = 'Unscheduled';
    else if (date === todayKey) label = 'Today';
    else if (date === yesterdayKey) label = 'Yesterday';
    else label = new Date(date).toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short' });
    return { date, label, items };
  });
}

// ── Sub-components ─────────────────────────────────────────────────────────
function HitRateBar({ rate, color = 'bg-primary' }: { rate: number; color?: string }) {
  return (
    <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/5">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, rate * 100).toFixed(1)}%` }}
        transition={{ duration: 0.9, ease: 'easeOut' }}
        className={cn('h-full rounded-full', color)}
      />
    </div>
  );
}

function ResultCard({ r, index }: { r: RecentResult; index: number }) {
  const won = r.actual_result === 'WON';
  const lost = r.actual_result === 'LOST';
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index * 0.025, 0.3) }}
      className="glass-panel relative overflow-hidden rounded-2xl border border-white/5 p-4"
    >
      <div
        className={cn(
          'absolute bottom-0 left-0 top-0 w-1 rounded-l-2xl',
          won ? 'bg-primary shadow-[0_0_10px_rgba(16,231,116,0.8)]'
            : lost ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]'
              : 'bg-white/20'
        )}
      />
      <div className="mb-2 flex items-start justify-between pl-2">
        <div className="mr-3 min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">{r.home_team} vs {r.away_team}</p>
          <p className="mt-0.5 text-2xs text-white/40">
            {r.match_date ? new Date(r.match_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : ''}
            {r.tournament ? ` · ${r.tournament}` : ''}
          </p>
        </div>
        <div
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-2xs font-black uppercase tracking-wider',
            won ? 'border-primary/20 bg-primary/10 text-primary'
              : lost ? 'border-red-500/20 bg-red-500/10 text-red-500'
                : 'border-white/10 bg-white/5 text-white/30'
          )}
        >
          {won ? <CheckCircle className="h-3 w-3" /> : lost ? <XCircle className="h-3 w-3" /> : <span>--</span>}
          {r.actual_result}
        </div>
      </div>
      <div className="flex items-end justify-between border-t border-white/5 pl-2 pt-2">
        <div className="min-w-0">
          <p className="mb-0.5 text-2xs uppercase tracking-wider text-white/30">Pick</p>
          <p className="truncate text-sm font-display text-white/80">{r.selection || formatMarket(r.top_prediction)}</p>
        </div>
        <div className="text-right">
          <p className="mb-0.5 text-2xs uppercase tracking-wider text-white/30">Score</p>
          <p className="text-lg font-display text-white">{r.full_score || (r.home_goals != null ? `${r.home_goals}-${r.away_goals}` : '--')}</p>
        </div>
      </div>
    </motion.div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function TrackRecord() {
  const [activeSport, setActiveSport] = useState<'football' | 'basketball'>('football');
  const [activeSource, setActiveSource] = useState<'live' | 'backtest'>('live');
  const [resultLimit, setResultLimit] = useState<ResultLimit>(25);

  const effectiveSource = activeSport === 'basketball' ? 'live' : activeSource;
  const isBasketball = activeSport === 'basketball';

  const { data: stats, isLoading: statsLoading } = useQuery<TrackRecordStats>({
    queryKey: ['track-record-stats', activeSport],
    queryFn: () => fetchApi(`/track-record/stats?sport=${activeSport}`),
    staleTime: 5 * 60 * 1000,
  });

  const { data: recent, isLoading: recentLoading } = useQuery<RecentResponse>({
    queryKey: ['track-record-recent', activeSport, effectiveSource],
    queryFn: () => fetchApi(`/track-record/recent?limit=50&source=${effectiveSource}&sport=${activeSport}`),
    staleTime: 5 * 60 * 1000,
  });

  const overall = stats?.overall || { total: 0, won: 0, lost: 0, voided: 0, hitRate: 0 };
  const hasData = overall.total > 0;
  const realRoi = overall.roi ?? null;
  const totalProfit = overall.totalProfit ?? null;
  const oddsCoverage = overall.oddsCoverage ?? 0;
  const accentText = isBasketball ? 'text-orange-200' : 'text-primary';

  const streak = useMemo<StreakInfo>(
    () => computeStreak(recent?.results || []),
    [recent?.results]
  );

  const visibleResults = useMemo<RecentResult[]>(
    () => (recent?.results || []).slice(0, resultLimit),
    [recent?.results, resultLimit]
  );

  const groupedResults = useMemo<DateGroup[]>(
    () => groupResultsByDate(visibleResults),
    [visibleResults]
  );



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

      <main className="relative z-10 mx-auto max-w-5xl space-y-6 px-4 pt-4">

        {/* ── Page Header ── */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight text-white">Track Record</h1>
              <div
                className="flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5"
                title="Outcomes verified automatically against live match results"
              >
                <BadgeCheck className="h-3 w-3 text-primary" />
                <span className="text-2xs font-bold uppercase tracking-[0.16em] text-primary/80">Verified</span>
              </div>
            </div>
            <p className="mt-1 text-xs text-white/40">
              {hasData
                ? `${overall.total} settled picks · ${(overall.hitRate * 100).toFixed(1)}% win rate`
                : 'No picks settled yet'}
            </p>
          </div>
        </div>

        {/* ── Sport + Source Toggles ── */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-xl border border-white/[0.05] bg-white/[0.02] p-0.5">
            {(['football', 'basketball'] as const).map((sport) => (
              <button
                key={sport}
                onClick={() => setActiveSport(sport)}
                className={cn(
                  'px-3 py-1.5 rounded-[10px] text-2xs font-bold uppercase tracking-wider transition-all',
                  activeSport === sport
                    ? sport === 'basketball' ? 'bg-orange-400/12 text-orange-200' : 'bg-primary/12 text-primary'
                    : 'text-white/25 hover:text-white/50'
                )}
              >
                {sport === 'football' ? '⚽ Football' : '🏀 Basketball'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-0.5 rounded-xl border border-white/[0.05] bg-white/[0.02] p-0.5">
            {(['live', 'backtest'] as const).map((src) => (
              <button
                key={src}
                onClick={() => activeSport === 'football' && setActiveSource(src)}
                disabled={activeSport === 'basketball' && src === 'backtest'}
                className={cn(
                  'px-3 py-1.5 rounded-[10px] text-2xs font-bold uppercase tracking-wider transition-all',
                  effectiveSource === src ? 'bg-white/8 text-white' : 'text-white/25 hover:text-white/50',
                  activeSport === 'basketball' && src === 'backtest' && 'cursor-not-allowed opacity-25'
                )}
              >
                {src === 'live' ? 'Live' : 'History'}
              </button>
            ))}
          </div>
        </div>

        {/* ── Hero Stats Row ── */}
        {statsLoading ? (
          <div className="glass-panel flex items-center justify-center rounded-2xl border border-white/5 p-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : hasData ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-2 gap-3 lg:grid-cols-4"
          >
            {/* Accuracy */}
            <div className="interactive-card relative overflow-hidden rounded-2xl border border-white/[0.06] bg-surface-2 p-4 lg:p-5">
              <div className="flex items-start justify-between">
                <p className="text-2xs font-bold uppercase tracking-[0.18em] text-white/40">Accuracy</p>
                <Shield className="h-4 w-4 text-white/20" />
              </div>
              <p className="mt-3 text-4xl font-display leading-none text-white">
                {(overall.hitRate * 100).toFixed(1)}
                <span className={cn('ml-0.5 text-2xl', accentText)}>%</span>
              </p>
              <p className="mt-2 text-2xs text-white/40">
                {overall.won}W · {overall.lost}L{overall.voided > 0 ? ` · ${overall.voided}V` : ''}
              </p>
            </div>

            {/* ROI — now showing REAL ROI from bookmaker odds */}
            <div className="interactive-card relative overflow-hidden rounded-2xl border border-white/[0.06] bg-surface-2 p-4 lg:p-5">
              <div className="flex items-start justify-between">
                <p className="text-2xs font-bold uppercase tracking-[0.18em] text-white/40">ROI</p>
                <div className="group relative">
                  <Info className="h-4 w-4 cursor-help text-white/20" />
                  <div className="pointer-events-none absolute right-0 top-6 z-30 hidden w-56 rounded-lg border border-white/10 bg-surface-3 p-3 text-2xs leading-relaxed text-white/70 shadow-2xl group-hover:block">
                    <p className="mb-1 font-bold text-white/90">ROI (Yield)</p>
                    <p>Return on investment from flat-staking 1 unit on every pick. Based on {overall.picksWithOdds ?? 0} picks with recorded bookmaker odds ({(oddsCoverage * 100).toFixed(0)}% coverage). Net profit: <span className={totalProfit != null && totalProfit >= 0 ? 'font-bold text-primary' : 'font-bold text-red-400'}>{totalProfit != null ? `${totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(1)}u` : '—'}</span></p>
                  </div>
                </div>
              </div>
              <p className={cn('mt-3 text-4xl font-display leading-none', realRoi != null ? roiTextColor(realRoi) : 'text-white/40')}>
                {realRoi != null ? formatRoi(realRoi) : '—'}
              </p>
              <p className="mt-2 text-2xs text-white/40">
                {totalProfit != null ? `${totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(1)}u profit` : 'No odds data'}
              </p>
            </div>

            {/* Total Picks */}
            <div className="interactive-card relative overflow-hidden rounded-2xl border border-white/[0.06] bg-surface-2 p-4 lg:p-5">
              <div className="flex items-start justify-between">
                <p className="text-2xs font-bold uppercase tracking-[0.18em] text-white/40">Total Picks</p>
                <Layers className="h-4 w-4 text-white/20" />
              </div>
              <p className="mt-3 text-4xl font-display leading-none text-white">{overall.total}</p>
              <p className="mt-2 text-2xs text-white/40">
                {stats?.live?.total || 0} live{activeSport === 'football' && (stats?.backtest?.total || 0) > 0 ? ` · ${stats?.backtest?.total ?? 0} hist` : ''}
              </p>
            </div>

            {/* Current Streak */}
            <div className="interactive-card relative overflow-hidden rounded-2xl border border-white/[0.06] bg-surface-2 p-4 lg:p-5">
              <div className="flex items-start justify-between">
                <p className="text-2xs font-bold uppercase tracking-[0.18em] text-white/40">Streak</p>
                <Flame
                  className={cn(
                    'h-4 w-4',
                    streak.type === 'W' ? 'text-primary' : streak.type === 'L' ? 'text-red-500' : 'text-white/20'
                  )}
                />
              </div>
              <p
                className={cn(
                  'mt-3 text-4xl font-display leading-none',
                  streak.type === 'W' ? 'text-primary' : streak.type === 'L' ? 'text-red-500' : 'text-white/40'
                )}
              >
                {streak.count > 0 ? `${streak.type === 'W' ? '+' : '−'}${streak.count}` : '—'}
              </p>
              <p className="mt-2 text-2xs text-white/40">
                {streak.type === 'W' ? 'consecutive wins' : streak.type === 'L' ? 'consecutive losses' : 'no active streak'}
              </p>
            </div>
          </motion.div>
        ) : (
          <div className="glass-panel rounded-2xl border border-white/5 p-8 text-center">
            <div className="mb-3 text-4xl">📊</div>
            <p className="font-medium text-white/60">Building Track Record</p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-white/40">
              Predictions are evaluated automatically as matches finish. Check back tomorrow to see today&apos;s hit rate.
            </p>
          </div>
        )}

        {/* ── Charts & Breakdowns ── */}
        {hasData && (
          <section className="grid gap-6 lg:grid-cols-2">
            {/* Monthly Performance */}
            {stats?.monthly && stats.monthly.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between pl-1">
                  <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white/50">
                    <BarChart2 className="h-4 w-4" /> Monthly Performance
                  </h2>
                  <div className="hidden items-center gap-2.5 text-2xs text-white/40 sm:flex">
                    <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> ≥60%</span>
                    <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> 50–59%</span>
                    <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-red-500" /> &lt;50%</span>
                  </div>
                </div>
                <div className="glass-panel space-y-3 rounded-2xl border border-white/5 p-4">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2 text-2xs uppercase tracking-wider text-white/30">
                    <span>Month · Win Rate</span>
                    <span>Sample (W/T)</span>
                  </div>
                  {stats.monthly.map((m) => (
                    <div key={m.month}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-medium text-white/70">{formatMonth(m.month)}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-2xs text-white/40">{m.won}/{m.total}</span>
                          <span className={cn('w-12 text-right text-sm font-display font-black', rateTextColor(m.hitRate, isBasketball))}>
                            {(m.hitRate * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                      <HitRateBar rate={m.hitRate} color={rateBarColor(m.hitRate)} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* By Confidence Tier */}
            {stats?.byConfidence && stats.byConfidence.length > 0 && (
              <div className="space-y-3">
                <h2 className="flex items-center gap-2 pl-1 text-xs font-black uppercase tracking-widest text-white/50">
                  <TrendingUp className="h-4 w-4" /> By Confidence Tier
                </h2>
                <div className="glass-panel space-y-3 rounded-2xl border border-white/5 p-4">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2 text-2xs uppercase tracking-wider text-white/30">
                    <span>Tier · Win Rate</span>
                    <span>Sample (W/T)</span>
                  </div>
                  {stats.byConfidence.map((c) => (
                    <div key={c.confidence}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              'h-2 w-2 rounded-full',
                              c.confidence === 'HIGH' ? 'bg-primary'
                                : c.confidence === 'MEDIUM' ? 'bg-amber-400'
                                  : 'bg-white/30'
                            )}
                          />
                          <span className="text-xs font-medium capitalize text-white/70">
                            {(c.confidence || '?').toLowerCase()}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-2xs text-white/40">{c.won}/{c.total}</span>
                          <span className={cn('w-12 text-right text-sm font-display font-black', rateTextColor(c.hitRate, isBasketball))}>
                            {(c.hitRate * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                      <HitRateBar rate={c.hitRate} color={rateBarColor(c.hitRate)} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── Performance by Market (full width) ── */}
        {hasData && stats?.byMarket && stats.byMarket.length > 0 && (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 pl-1 text-xs font-black uppercase tracking-widest text-white/50">
              <Target className="h-4 w-4" /> Performance by Market
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {stats.byMarket.filter((m) => m.total >= 3).slice(0, 8).map((m) => (
                <div key={m.market} className="interactive-card glass-panel rounded-2xl border border-white/5 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-white/60">{formatMarket(m.market)}</p>
                    <span className="shrink-0 rounded-full border border-white/10 bg-black/30 px-1.5 py-0.5 text-2xs text-white/40">
                      n={m.total}
                    </span>
                  </div>
                  <p className={cn('mt-2 text-2xl font-display', rateTextColor(m.hitRate, isBasketball))}>
                    {(m.hitRate * 100).toFixed(1)}
                    <span className="text-sm text-white/30">%</span>
                  </p>
                  <p className="mt-1 text-2xs text-white/40">{m.won}W · {m.lost}L</p>
                  <HitRateBar rate={m.hitRate} color={rateBarColor(m.hitRate)} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Recent Results ── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 pl-1 text-xs font-black uppercase tracking-widest text-white/50">
              <Clock className="h-4 w-4" /> Recent Results
            </h2>
            <div className="flex items-center gap-0.5 rounded-xl border border-white/[0.05] bg-white/[0.02] p-0.5">
              {([10, 25, 50] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => setResultLimit(n)}
                  className={cn(
                    'px-2.5 py-1 rounded-[8px] text-2xs font-bold uppercase tracking-wider transition-all',
                    resultLimit === n ? 'bg-primary/12 text-primary' : 'text-white/25 hover:text-white/50'
                  )}
                >
                  {n === 50 ? 'All' : `Last ${n}`}
                </button>
              ))}
            </div>
          </div>

          {recentLoading ? (
            <div className="flex justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : visibleResults.length > 0 ? (
            <div className="space-y-5">
              {groupedResults.map((group) => (
                <div key={group.date} className="space-y-2">
                  <div className="flex items-center gap-2 pl-1">
                    <span className="text-2xs font-bold uppercase tracking-[0.18em] text-white/50">{group.label}</span>
                    <span className="text-2xs text-white/25">· {group.items.length}</span>
                    <div className="h-px flex-1 bg-white/5" />
                  </div>
                  <div className="grid gap-3 xl:grid-cols-2">
                    {group.items.map((r, i) => (
                      <ResultCard key={`${r.fixture_id}-${i}`} r={r} index={i} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="glass-panel rounded-2xl border border-white/5 p-8 text-center">
              <p className="mb-2 text-3xl">📝</p>
              <p className="text-sm text-white/60">No results yet for this source.</p>
              <p className="mt-2 text-2xs text-white/30">
                {effectiveSource === 'live'
                  ? 'Live picks are evaluated automatically after matches end.'
                  : 'Run the backtest script to populate historical data.'}
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
