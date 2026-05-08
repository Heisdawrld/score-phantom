import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import {
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Search,
  Trophy,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { fetchApi } from '@/lib/api';
import { cn } from '@/lib/utils';

const DAY_MS = 24 * 60 * 60 * 1000;

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'live', label: 'Live' },
  { key: 'my', label: 'Fav' },
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
      day: i === 0 ? 'TODAY' : d.toLocaleDateString('en-NG', { weekday: 'short', timeZone: 'Africa/Lagos' }).toUpperCase(),
      date: d.toLocaleDateString('en-NG', { day: '2-digit', timeZone: 'Africa/Lagos' }),
    };
  });
}

function timeLabel(value?: string | null) {
  if (!value) return 'TBD';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'TBD';
  return d.toLocaleString('en-NG', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', hour12: false });
}

function statusLabel(status?: string | null) {
  const s = String(status || 'scheduled').toLowerCase();
  if (s.includes('final') || s.includes('finished') || s === 'ft') return 'FT';
  if (s.includes('live') || s.includes('q') || s.includes('half') || s.includes('in play')) return 'LIVE';
  return 'UPCOMING';
}

function initials(name?: string) {
  if (!name) return '--';
  return String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
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

// ── Tiny Components ─────────────────────────────────────────────────────────

function TeamBadge({ name, logo }: { name: string; logo?: string | null }) {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/[0.06] bg-white/[0.04]">
      {logo ? <img src={logo} alt="" className="h-full w-full object-contain p-1" loading="lazy" /> : <span className="text-[9px] font-black text-white/50">{initials(name)}</span>}
    </div>
  );
}

function GameCard({ game, onOpen, index = 0 }: { game: any; onOpen: () => void; index?: number }) {
  const live = statusLabel(game.status) === 'LIVE';
  const done = statusLabel(game.status) === 'FT';
  const hasScore = game.home_score != null || game.away_score != null;
  const homeLogo = teamLogo(game, 'home');
  const awayLogo = teamLogo(game, 'away');
  const prediction = game.prediction_summary || null;
  const hasEdge = prediction && !prediction.noClearEdge;

  return (
    <motion.button
      onClick={onOpen}
      className="group w-full text-left"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.02, 0.15) }}
      whileTap={{ scale: 0.985 }}
    >
      <div className={cn(
        "rounded-2xl border px-4 py-3.5 transition-all",
        live ? "border-red-500/15 bg-red-500/[0.03]" : "border-white/[0.04] bg-white/[0.02]",
        "group-hover:border-primary/12 group-hover:bg-white/[0.04]"
      )}>
        <div className="flex items-center gap-3">
          {/* Time / Status */}
          <div className="w-11 shrink-0 text-center">
            {live ? (
              <span className="text-[10px] font-black uppercase text-red-400 animate-pulse">Live</span>
            ) : done ? (
              <span className="text-[10px] font-black uppercase text-white/25">FT</span>
            ) : (
              <span className="text-xs font-bold tabular-nums text-white/30">{timeLabel(game.start_time)}</span>
            )}
          </div>

          {/* Teams */}
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2">
              <TeamBadge name={game.home_team} logo={homeLogo} />
              <p className="text-xs font-bold text-white truncate">{game.home_team}</p>
              {hasScore && <span className="ml-auto text-sm font-black tabular-nums text-white">{game.home_score ?? 0}</span>}
            </div>
            <div className="flex items-center gap-2">
              <TeamBadge name={game.away_team} logo={awayLogo} />
              <p className="text-xs font-bold text-white/60 truncate">{game.away_team}</p>
              {hasScore && <span className="ml-auto text-sm font-black tabular-nums text-white/60">{game.away_score ?? 0}</span>}
            </div>
          </div>

          {/* Edge badge + chevron */}
          <div className="flex items-center gap-2 shrink-0">
            {hasEdge && (
              <span className="hidden sm:block rounded-lg border border-primary/15 bg-primary/8 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-primary">
                Edge
              </span>
            )}
            <ChevronRight className="w-3.5 h-3.5 text-white/15 group-hover:text-white/30 transition-colors" />
          </div>
        </div>
      </div>
    </motion.button>
  );
}

function LeagueGroup({ group, offset, openGame, expanded, onToggle }: {
  group: any; offset: number; openGame: (game: any) => void; expanded: boolean; onToggle: () => void;
}) {
  const { meta, games } = group;
  const liveCount = games.filter((g: any) => statusLabel(g.status) === 'LIVE').length;

  return (
    <section className="space-y-2">
      <button onClick={onToggle} className="group flex w-full items-center justify-between gap-3 px-1 py-1 text-left">
        <div className="flex min-w-0 items-center gap-2">
          {meta.logo || meta.flag ? (
            <img src={meta.logo || meta.flag} alt="" className="h-5 w-5 rounded object-contain" loading="lazy" />
          ) : (
            <span className="text-sm">🏀</span>
          )}
          <div className="min-w-0">
            <h3 className="truncate text-[11px] font-bold uppercase tracking-wider text-white/50 group-hover:text-white/70 transition-colors">{meta.name}</h3>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {liveCount > 0 && <span className="text-[9px] font-bold uppercase text-red-400">Live</span>}
          <span className="text-[10px] font-bold text-white/20">{games.length}</span>
          <ChevronDown className={cn('h-3.5 w-3.5 text-white/20 transition-transform duration-200', expanded && 'rotate-180')} />
        </div>
      </button>

      {expanded && (
        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
          {games.map((game: any, i: number) => (
            <GameCard key={`${game.league_key}-${game.external_game_id || game.id}`} game={game} index={offset + i} onOpen={() => openGame(game)} />
          ))}
        </motion.div>
      )}
    </section>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

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

  const openGame = (game: any) => setLocation(`/basketball/games/${game.league_key}/${game.external_game_id || game.odds_event_id}`);
  const toggleGroup = (id: string) => setExpandedGroups((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#060a0e] pb-28 text-white">
      <div className="pointer-events-none fixed inset-0">
        <motion.div className="absolute -top-28 right-[-20%] h-[55vh] w-[80vw] rounded-full bg-orange-500/8 blur-[120px]" animate={{ scale: [1, 1.06, 1], opacity: [0.5, 0.75, 0.5] }} transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }} />
      </div>

      <Header />

      <main className="relative z-10 mx-auto max-w-2xl space-y-5 px-4 pt-4">

        {/* ── Welcome Strip ── */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-black text-white tracking-tight">
                🏀 <span className="text-orange-200">Basketball</span>
              </h1>
              <p className="text-xs text-white/35 mt-0.5">
                {allGamesForDay.length} games today{liveCount > 0 ? ` · ${liveCount} live` : ''}
                {gamesFetching && ' · syncing…'}
              </p>
            </div>
          </div>
        </motion.div>

        {/* ── Date Strip ── */}
        <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1 -mx-1 px-1">
          {dateTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setSelectedDate(tab.key)}
              className={cn(
                'snap-start shrink-0 min-w-[60px] flex flex-col items-center justify-center py-2.5 px-3 rounded-xl border transition-all',
                selectedDate === tab.key
                  ? 'bg-orange-400/10 border-orange-300/20 text-orange-200'
                  : 'bg-white/[0.02] border-white/[0.04] text-white/30 hover:bg-white/[0.04]'
              )}
            >
              <span className="text-[9px] font-bold tracking-widest uppercase">{tab.day}</span>
              <span className="text-lg font-black leading-none mt-0.5">{tab.date}</span>
            </button>
          ))}
        </div>

        {/* ── Search + Filter ── */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/20" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search teams or leagues..."
              className="w-full rounded-xl border border-white/[0.05] bg-white/[0.03] py-2.5 pl-8 pr-3 text-xs text-white outline-none placeholder:text-white/20 focus:border-orange-300/25 transition-all"
            />
          </div>
          <div className="flex items-center gap-0.5 rounded-xl border border-white/[0.05] bg-white/[0.02] p-0.5 shrink-0">
            <button
              onClick={() => setScope(scope === 'major' ? 'global' : 'major')}
              className={cn(
                "px-2.5 py-1.5 rounded-[10px] text-[10px] font-bold uppercase tracking-wider transition-all",
                scope === 'global' ? "bg-orange-400/10 text-orange-200" : "text-white/25 hover:text-white/50"
              )}
            >
              {scope === 'major' ? 'Major' : 'Global'}
            </button>
            <span className="w-px h-4 bg-white/[0.06]" />
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "px-2.5 py-1.5 rounded-[10px] text-[10px] font-bold uppercase tracking-wider transition-all",
                  filter === f.key
                    ? f.key === 'live' ? "bg-red-500/15 text-red-400" : "bg-white/8 text-white"
                    : "text-white/25 hover:text-white/50"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Fixture Count ── */}
        <div className="flex items-center gap-2 px-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-300 shadow-[0_0_6px_rgba(251,191,36,0.4)] shrink-0" />
          <span className="text-[10px] text-white/25">
            <span className="text-orange-200 font-semibold">{games.length}</span> fixtures
          </span>
        </div>

        {/* ── Games by League ── */}
        <div className="space-y-4">
          {gamesLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 rounded-2xl bg-white/[0.02] border border-white/[0.04] animate-pulse" />
              ))}
            </div>
          ) : grouped.length ? (
            grouped.map((group, i) => (
              <LeagueGroup
                key={group.id}
                group={group}
                offset={i * 4}
                openGame={openGame}
                expanded={expandedGroups[group.id] ?? i < 3}
                onToggle={() => toggleGroup(group.id)}
              />
            ))
          ) : (
            <div className="text-center py-16 text-white/20 space-y-3">
              <Trophy className="w-10 h-10 mx-auto opacity-20" />
              <p className="text-sm font-medium">No basketball games</p>
              <p className="text-xs opacity-50">Try another date or switch to Global.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
