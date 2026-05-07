import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import {
  Activity,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { fetchApi } from '@/lib/api';
import { cn } from '@/lib/utils';

const DAY_MS = 24 * 60 * 60 * 1000;

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'live', label: 'Live' },
  { key: 'my', label: 'My Leagues' },
];

const MY_LEAGUE_HINTS = ['nba', 'ncaab', 'euroleague', 'champions', 'basketball africa', 'bbl', 'acb', 'liga', 'higher league', 'pba'];
const MAJOR_HINTS = ['nba', 'wnba', 'ncaab', 'wncaab', 'euroleague'];
const MAJOR_KEYS = new Set(['nba', 'wnba', 'ncaab', 'ncaaw', 'apisports_12', 'apisports_120']);

function lagosDate(offset = 0) {
  const d = new Date(Date.now() + offset * DAY_MS);
  return new Date(d.toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
}

function dateKey(value?: string | null) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
}

function buildDateTabs() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = lagosDate(i);
    return {
      key: d.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }),
      day: d.toLocaleDateString('en-NG', { weekday: 'short', timeZone: 'Africa/Lagos' }).toUpperCase(),
      date: d.toLocaleDateString('en-NG', { day: '2-digit', timeZone: 'Africa/Lagos' }),
    };
  });
}

function timeLabel(value?: string | null) {
  if (!value) return 'TBD';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'TBD';
  return d.toLocaleString('en-NG', {
    timeZone: 'Africa/Lagos',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function statusLabel(status?: string | null) {
  const s = String(status || 'scheduled').toLowerCase();
  if (s.includes('final') || s.includes('finished') || s === 'ft') return 'FT';
  if (s.includes('live') || s.includes('q') || s.includes('half') || s.includes('in play')) return 'LIVE';
  return 'UPCOMING';
}

function initials(name?: string) {
  if (!name) return '--';
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

function pct(value?: number | null) {
  if (value == null) return '--';
  return `${Math.round(Number(value) * 100)}%`;
}

function rawOf(game: any) {
  return game?.raw || {};
}

function leagueMeta(game: any) {
  const raw = rawOf(game);
  const league = raw?.league || raw?.raw?.league || {};
  const country = raw?.country || raw?.raw?.country || {};
  const key = String(game?.league_key || 'basketball');
  const isApiSports = key.startsWith('apisports_');
  return {
    key,
    name: game?.league_name || league?.name || (isApiSports ? 'Global Basketball' : key.toUpperCase()),
    country: game?.league_country || country?.name || league?.country || null,
    logo: game?.league_logo || raw?.leagueLogo || league?.logo || null,
    flag: game?.country_flag || raw?.countryFlag || country?.flag || null,
  };
}

function teamLogo(game: any, side: 'home' | 'away') {
  const raw = rawOf(game);
  const teams = raw?.teams || raw?.raw?.teams || {};
  if (side === 'home') return game?.home_team_logo || raw?.homeTeamLogo || teams?.home?.logo || null;
  return game?.away_team_logo || raw?.awayTeamLogo || teams?.away?.logo || null;
}

function isMyLeague(game: any) {
  const meta = leagueMeta(game);
  const haystack = `${meta.key} ${meta.name} ${meta.country || ''}`.toLowerCase();
  return MY_LEAGUE_HINTS.some((hint) => haystack.includes(hint));
}

function isMajorLeague(game: any) {
  const meta = leagueMeta(game);
  const key = String(meta.key || '').toLowerCase();
  if (MAJOR_KEYS.has(key)) return true;
  const haystack = `${meta.key} ${meta.name} ${meta.country || ''}`.toLowerCase();
  return MAJOR_HINTS.some((hint) => haystack.includes(hint));
}

function groupGames(games: any[]) {
  const map = new Map<string, { id: string; meta: ReturnType<typeof leagueMeta>; games: any[] }>();
  for (const game of games) {
    const meta = leagueMeta(game);
    const id = `${meta.key}-${meta.name}`;
    if (!map.has(id)) map.set(id, { id, meta, games: [] });
    map.get(id)!.games.push(game);
  }
  return Array.from(map.values()).sort((a, b) => {
    const liveA = a.games.some((g) => statusLabel(g.status) === 'LIVE') ? 1 : 0;
    const liveB = b.games.some((g) => statusLabel(g.status) === 'LIVE') ? 1 : 0;
    if (liveA !== liveB) return liveB - liveA;
    return new Date(a.games[0]?.start_time || 0).getTime() - new Date(b.games[0]?.start_time || 0).getTime();
  });
}

function TeamLogo({ name, logo }: { name: string; logo?: string | null }) {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/[0.06] bg-white/[0.045]">
      {logo ? <img src={logo} alt="" className="h-full w-full object-contain p-1" loading="lazy" /> : <span className="text-[10px] font-black text-white/70">{initials(name)}</span>}
    </div>
  );
}

function DateTab({ tab, active, onClick }: { tab: any; active: boolean; onClick: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      className={cn(
        'relative min-w-[78px] shrink-0 overflow-hidden rounded-3xl border px-4 py-3 text-center transition-all',
        active
          ? 'border-primary/35 bg-primary/12 text-primary shadow-[0_0_34px_rgba(20,241,149,0.12)]'
          : 'border-white/[0.06] bg-white/[0.025] text-white/35'
      )}
    >
      {active && <motion.span layoutId="hoops-date" className="absolute inset-0 bg-primary/[0.06]" />}
      <span className="relative block text-[10px] font-black uppercase tracking-widest">{tab.day}</span>
      <span className="relative mt-1 block text-2xl font-black tabular-nums">{tab.date}</span>
    </motion.button>
  );
}

function FilterPill({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-2xl px-5 py-3 text-[11px] font-black uppercase tracking-[0.16em] transition-all',
        active ? 'bg-white/[0.10] text-white' : 'text-white/35 hover:text-white/70'
      )}
    >
      {children}
    </button>
  );
}

function MiniStat({ label, value, tone = 'green' }: { label: string; value: any; tone?: 'green' | 'orange' | 'blue' }) {
  const toneClass = tone === 'orange' ? 'text-orange-200' : tone === 'blue' ? 'text-blue-300' : 'text-primary';
  return (
    <div className="premium-stat">
      <p className="text-[9px] font-bold uppercase tracking-widest text-white/30">{label}</p>
      <p className={cn('mt-1 text-lg font-black', toneClass)}>{value}</p>
    </div>
  );
}

function GameCard({ game, onOpen, index = 0 }: { game: any; onOpen: () => void; index?: number }) {
  const live = statusLabel(game.status) === 'LIVE';
  const done = statusLabel(game.status) === 'FT';
  const hasScore = game.home_score != null || game.away_score != null;
  const homeLogo = teamLogo(game, 'home');
  const awayLogo = teamLogo(game, 'away');
  const oddsLive = String(game.source || '').toLowerCase() === 'the_odds_api' || !!game.odds_event_id;
  const prediction = game.prediction_summary || null;
  const predictionBadge = prediction
    ? prediction.noClearEdge
      ? { label: 'NO EDGE', className: 'border-white/[0.08] bg-black/20 text-white/40' }
      : { label: 'EDGE READY', className: 'border-primary/20 bg-primary/10 text-primary' }
    : oddsLive
      ? { label: 'LINES LIVE', className: 'border-orange-300/20 bg-orange-400/10 text-orange-200' }
      : { label: 'LINES PENDING', className: 'border-white/[0.08] bg-black/20 text-white/35' };

  return (
    <motion.button
      onClick={onOpen}
      className="group w-full text-left"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.014, 0.18) }}
      whileTap={{ scale: 0.985 }}
    >
      <div className="rounded-3xl border border-white/[0.06] bg-white/[0.025] px-4 py-4 transition-all group-hover:border-primary/15 group-hover:bg-white/[0.045]">
        <div className="grid grid-cols-[54px_1fr_auto_20px] items-center gap-3 sm:grid-cols-[54px_1fr_auto_auto_20px]">
          <div className="text-xs font-black tabular-nums text-white/35">
            {hasScore ? <span className={cn(live && 'text-red-300')}>{done ? 'FT' : live ? 'LIVE' : ''}</span> : timeLabel(game.start_time)}
          </div>

          <div className="min-w-0 space-y-2">
            <div className="flex min-w-0 items-center gap-2">
              <TeamLogo name={game.home_team} logo={homeLogo} />
              <p className="truncate text-sm font-black text-white">{game.home_team}</p>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <TeamLogo name={game.away_team} logo={awayLogo} />
              <p className="truncate text-sm font-black text-white/72">{game.away_team}</p>
            </div>
          </div>

          <div className="shrink-0 text-right">
            {hasScore ? (
              <p className="text-xl font-black tabular-nums text-white">{game.home_score ?? 0}-{game.away_score ?? 0}</p>
            ) : live ? (
              <p className="text-[10px] font-black uppercase tracking-widest text-red-300">Live</p>
            ) : (
              <p className="text-[10px] font-black uppercase tracking-widest text-white/25">Upcoming</p>
            )}
          </div>

          <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
            <span className={cn('rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.22em]', predictionBadge.className)}>
              {predictionBadge.label}
            </span>
          </div>

          <ChevronRight className="h-4 w-4 text-white/22 transition-transform group-hover:translate-x-1" />
        </div>
      </div>
    </motion.button>
  );
}

function LeagueGroup({
  group,
  offset,
  openGame,
  expanded,
  onToggle,
}: {
  group: any;
  offset: number;
  openGame: (game: any) => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { meta, games } = group;
  const liveCount = games.filter((g: any) => statusLabel(g.status) === 'LIVE').length;

  return (
    <section className="space-y-3">
      <button onClick={onToggle} className="group flex w-full items-center justify-between gap-3 px-1 py-1 text-left">
        <div className="flex min-w-0 items-center gap-2">
          {meta.logo || meta.flag ? (
            <img src={meta.logo || meta.flag} alt="" className="h-6 w-6 rounded-md object-contain" loading="lazy" />
          ) : (
            <span className="text-lg">B</span>
          )}
          <span className="h-6 w-1 rounded-full bg-primary/75" />
          <div className="min-w-0">
            <h3 className="truncate text-[12px] font-black uppercase tracking-[0.18em] text-white/72 transition-colors group-hover:text-white/90">{meta.name}</h3>
            {meta.country && <p className="truncate text-[10px] font-bold uppercase tracking-widest text-white/25">{meta.country}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {liveCount > 0 && <span className="text-[9px] font-black uppercase tracking-widest text-red-300">Live {liveCount}</span>}
          <span className="rounded-full border border-white/[0.06] bg-white/[0.04] px-2.5 py-1 text-[10px] font-black text-white/35">{games.length}</span>
          <ChevronDown className={cn('h-4 w-4 text-white/30 transition-transform duration-200', expanded && 'rotate-180 text-primary')} />
        </div>
      </button>

      {expanded && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="grid gap-3">
          {games.map((game: any, i: number) => (
            <GameCard key={`${game.league_key}-${game.external_game_id || game.id}`} game={game} index={offset + i} onOpen={() => openGame(game)} />
          ))}
        </motion.div>
      )}
    </section>
  );
}

export default function Basketball() {
  const [, setLocation] = useLocation();
  const [filter, setFilter] = useState('all');
  const [scope, setScope] = useState<'major' | 'global'>('major');
  const [selectedDate, setSelectedDate] = useState(() => buildDateTabs()[0].key);
  const [query, setQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const dateTabs = useMemo(() => buildDateTabs(), []);

  const from = `${selectedDate}T00:00:00`;
  const to = `${selectedDate}T23:59:59`;

  const { data: health } = useQuery({
    queryKey: ['/api/basketball/health'],
    queryFn: () => fetchApi('/basketball/health'),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const { data: gamesData, isLoading: gamesLoading, isFetching: gamesFetching } = useQuery({
    queryKey: ['/api/basketball/games', selectedDate],
    queryFn: () => fetchApi(`/basketball/games?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=500`),
    staleTime: 45_000,
    refetchInterval: 45_000,
  });

  const allGamesForDay = useMemo(() => {
    return ((gamesData as any)?.games || []).filter((g: any) => dateKey(g.start_time) === selectedDate || !g.start_time);
  }, [gamesData, selectedDate]);

  const games = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allGamesForDay.filter((g: any) => {
      if (scope === 'major' && !isMajorLeague(g)) return false;
      if (filter === 'live' && statusLabel(g.status) !== 'LIVE') return false;
      if (filter === 'my' && !isMyLeague(g)) return false;
      if (!q) return true;
      const meta = leagueMeta(g);
      return String(g.home_team || '').toLowerCase().includes(q)
        || String(g.away_team || '').toLowerCase().includes(q)
        || String(meta.name || '').toLowerCase().includes(q)
        || String(meta.country || '').toLowerCase().includes(q);
    });
  }, [allGamesForDay, filter, query, scope]);

  const grouped = useMemo(() => groupGames(games), [games]);
  const liveCount = allGamesForDay.filter((g: any) => statusLabel(g.status) === 'LIVE').length;
  const leagueCount = new Set(allGamesForDay.map((g: any) => leagueMeta(g).key)).size;
  const edgeReadyCount = allGamesForDay.filter((g: any) => g.prediction_summary && !g.prediction_summary.noClearEdge).length;
  const topEdgeGames = useMemo(() => {
    return [...allGamesForDay]
      .filter((g: any) => g.prediction_summary && !g.prediction_summary.noClearEdge)
      .sort((a: any, b: any) => (Number(b.prediction_summary?.phantomScore || 0) - Number(a.prediction_summary?.phantomScore || 0)))
      .slice(0, 3);
  }, [allGamesForDay]);
  const topLeagues = useMemo(() => grouped.slice(0, 5), [grouped]);
  const degraded = (health as any)?.status === 'degraded';
  const syncing = gamesFetching;

  const openGame = (game: any) => setLocation(`/basketball/games/${game.league_key}/${game.external_game_id || game.odds_event_id}`);
  const toggleGroup = (id: string) => setExpandedGroups((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#060a0e] pb-28 text-white">
      <div className="pointer-events-none fixed inset-0">
        <motion.div className="absolute -top-28 right-[-20%] h-[55vh] w-[80vw] rounded-full bg-orange-500/10 blur-[120px]" animate={{ scale: [1, 1.08, 1], opacity: [0.65, 0.95, 0.65] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }} />
        <div className="absolute left-[-30%] top-[20%] h-[45vh] w-[70vw] rounded-full bg-primary/7 blur-[100px]" />
      </div>

      <Header />

      <main className="relative z-10 mx-auto max-w-6xl space-y-5 px-4 pt-5">
        <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="premium-surface-orange relative overflow-hidden rounded-[30px] p-5">
          <div className="absolute -bottom-16 -right-10 h-36 w-36 rounded-full bg-orange-400/10 blur-3xl" />
          <div className="relative grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="premium-chip border-orange-300/20 bg-orange-400/10 text-orange-200">Hoops Board</span>
                <span className="premium-chip">Odds-Led Edge</span>
                <span className="premium-chip">Desktop + Mobile Ready</span>
              </div>
              <h1 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">Basketball Games</h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/45 md:text-base">
                Browse a cleaner major-first hoops desk with saved prediction summaries, live line awareness, and league grouping that does not bury the best slate.
              </p>

              <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                <MiniStat label="Games" value={allGamesForDay.length || '--'} tone="orange" />
                <MiniStat label="Edge Ready" value={edgeReadyCount} tone="green" />
                <MiniStat label="Live" value={liveCount} tone="blue" />
                <MiniStat label="Leagues" value={leagueCount || '--'} tone="orange" />
              </div>

              <div className="mt-4 flex items-center gap-2 rounded-2xl border border-white/[0.06] bg-black/25 px-3 py-2 text-xs text-white/35">
                <span className={cn('h-2 w-2 rounded-full', syncing ? 'animate-pulse bg-orange-300' : 'bg-primary')} />
                <span>{syncing ? 'Refreshing basketball games...' : 'Games synced · auto-refresh active'}</span>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-[26px] border border-white/[0.06] bg-black/25 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Feed Status</p>
                    <h2 className="mt-2 text-xl font-black text-white">{degraded ? 'Warm-up Mode' : 'Board Ready'}</h2>
                  </div>
                  <Activity className={cn('h-5 w-5 shrink-0', degraded ? 'text-amber-300' : 'text-orange-200')} />
                </div>
                <p className="mt-3 text-sm leading-relaxed text-white/45">
                  {degraded
                    ? 'Basketball feed is warming up. More games may appear after the next sync cycle.'
                    : 'Prediction summaries are cached first so the slate stays responsive even when the board is busy.'}
                </p>
              </div>

              <div className="rounded-[26px] border border-white/[0.06] bg-black/25 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">League Scope</p>
                    <h2 className="mt-2 text-xl font-black text-white">{scope === 'major' ? 'Major Slate' : 'Global Slate'}</h2>
                  </div>
                  <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
                </div>
                <p className="mt-3 text-sm leading-relaxed text-white/45">
                  Major mode keeps the first experience high-signal. Global mode opens the wider slate when users want broader coverage.
                </p>
              </div>
            </div>
          </div>
        </motion.section>

        <div className="hide-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
          {dateTabs.map((tab) => <DateTab key={tab.key} tab={tab} active={selectedDate === tab.key} onClick={() => setSelectedDate(tab.key)} />)}
        </div>

        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-4">
            <div className="rounded-[24px] border border-white/[0.055] bg-black/25 p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap gap-2">
                  <div className="flex items-center gap-1 overflow-x-auto rounded-[22px] border border-white/[0.055] bg-black/25 p-1 hide-scrollbar">
                    <FilterPill active={scope === 'major'} onClick={() => setScope('major')}>Major</FilterPill>
                    <FilterPill active={scope === 'global'} onClick={() => setScope('global')}>Global</FilterPill>
                  </div>
                  <div className="flex items-center gap-1 overflow-x-auto rounded-[22px] border border-white/[0.055] bg-black/25 p-1 hide-scrollbar">
                    {FILTERS.map((f) => <FilterPill key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}>{f.label}</FilterPill>)}
                  </div>
                </div>

                <div className="relative w-full lg:w-56 shrink-0">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/25" />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search teams or leagues" className="w-full rounded-xl border border-white/[0.06] bg-black/30 py-2 pl-8 pr-3 text-xs text-white outline-none placeholder:text-white/25 focus:border-primary/30" />
                </div>
              </div>
            </div>

            <section className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-black uppercase tracking-widest text-white/80">Games</h2>
                </div>
                <p className="text-xs text-white/35"><span className="text-primary">•</span> {games.length} fixture{games.length === 1 ? '' : 's'} on this tab</p>
              </div>

              {gamesLoading ? (
                <div className="rounded-3xl border border-white/[0.06] bg-white/[0.025] p-5 text-sm text-white/40">Loading games...</div>
              ) : grouped.length ? (
                <div className="space-y-5">
                  {grouped.map((group, i) => (
                    <LeagueGroup
                      key={group.id}
                      group={group}
                      offset={i * 4}
                      openGame={openGame}
                      expanded={expandedGroups[group.id] ?? i < 2}
                      onToggle={() => toggleGroup(group.id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-3xl border border-white/[0.06] bg-white/[0.025] p-6 text-center">
                  <RefreshCw className="mx-auto h-6 w-6 text-white/20" />
                  <p className="mt-3 text-sm font-bold text-white/45">No basketball games on this tab</p>
                  <p className="mt-1 text-xs text-white/30">Try another date or switch back to All.</p>
                </div>
              )}
            </section>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
            <div className="rounded-[28px] border border-white/[0.06] bg-black/25 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Top Saved Edges</p>
                  <h2 className="mt-2 text-2xl font-black text-white">Slate Radar</h2>
                </div>
                <Sparkles className="h-5 w-5 shrink-0 text-orange-200" />
              </div>
              <div className="mt-4 space-y-3">
                {topEdgeGames.length ? topEdgeGames.map((game: any) => {
                  const summary = game.prediction_summary || {};
                  return (
                    <button
                      key={`${game.league_key}-${game.external_game_id || game.id}-radar`}
                      onClick={() => openGame(game)}
                      className="w-full rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4 text-left transition-colors hover:border-orange-300/20 hover:bg-white/[0.04]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-white">{game.home_team} vs {game.away_team}</p>
                          <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-white/30">{summary.market || 'Market'} · {timeLabel(game.start_time)}</p>
                        </div>
                        <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-primary">
                          {pct(summary.modelProbability)}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                        <span className="font-black text-orange-100">{summary.selection || 'Saved edge'}</span>
                        <span className="text-white/35">{summary.edge != null ? `+${Number(summary.edge).toFixed(1)}` : '--'}</span>
                      </div>
                    </button>
                  );
                }) : (
                  <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4 text-sm text-white/40">
                    No edge-ready summaries saved yet for this date.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/[0.06] bg-black/25 p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Coverage</p>
              <h2 className="mt-2 text-2xl font-black text-white">League Board</h2>
              <div className="mt-4 space-y-3">
                {topLeagues.length ? topLeagues.map((group: any) => (
                  <div key={`${group.id}-coverage`} className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-white">{group.meta.name}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-white/30">{group.meta.country || 'Basketball'}</p>
                    </div>
                    <span className="rounded-full border border-white/[0.08] bg-black/25 px-2.5 py-1 text-[10px] font-black text-white/40">{group.games.length}</span>
                  </div>
                )) : (
                  <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4 text-sm text-white/40">
                    League coverage will appear here once the slate syncs.
                  </div>
                )}
              </div>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
