import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Activity, ChevronRight, RefreshCw, Search, Trophy } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { cn } from "@/lib/utils";

const LEAGUES = [
  { key: "all", label: "All" },
  { key: "nba", label: "NBA" },
  { key: "ncaab", label: "NCAAB" },
];

function timeLabel(value?: string | null) {
  if (!value) return "TBD";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "TBD";
  return d.toLocaleString("en-NG", {
    timeZone: "Africa/Lagos",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function statusLabel(status?: string | null) {
  const s = String(status || "scheduled").toLowerCase();
  if (s.includes("final") || s.includes("finished") || s === "ft") return "FT";
  if (s.includes("live") || s.includes("q") || s.includes("half") || s.includes("in play")) return "LIVE";
  return "UPCOMING";
}

function initials(name?: string) {
  if (!name) return "--";
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function rawOf(game: any) {
  return game?.raw || {};
}

function leagueMeta(game: any) {
  const raw = rawOf(game);
  const league = raw?.league || raw?.raw?.league || {};
  const country = raw?.country || raw?.raw?.country || {};
  const key = String(game?.league_key || "basketball");
  const isApiSports = key.startsWith("apisports_");
  return {
    key,
    name: game?.league_name || league?.name || (isApiSports ? "Global Basketball" : key.toUpperCase()),
    country: game?.league_country || country?.name || league?.country || null,
    logo: game?.league_logo || raw?.leagueLogo || league?.logo || null,
    flag: game?.country_flag || raw?.countryFlag || country?.flag || null,
  };
}

function teamLogo(game: any, side: "home" | "away") {
  const raw = rawOf(game);
  const teams = raw?.teams || raw?.raw?.teams || {};
  if (side === "home") return game?.home_team_logo || raw?.homeTeamLogo || teams?.home?.logo || null;
  return game?.away_team_logo || raw?.awayTeamLogo || teams?.away?.logo || null;
}

function groupGames(games: any[]) {
  const map = new Map<string, { meta: ReturnType<typeof leagueMeta>; games: any[] }>();
  for (const game of games) {
    const meta = leagueMeta(game);
    const id = `${meta.key}-${meta.name}`;
    if (!map.has(id)) map.set(id, { meta, games: [] });
    map.get(id)!.games.push(game);
  }
  return Array.from(map.values()).sort((a, b) => {
    const liveA = a.games.some((g) => statusLabel(g.status) === "LIVE") ? 1 : 0;
    const liveB = b.games.some((g) => statusLabel(g.status) === "LIVE") ? 1 : 0;
    if (liveA !== liveB) return liveB - liveA;
    return new Date(a.games[0]?.start_time || 0).getTime() - new Date(b.games[0]?.start_time || 0).getTime();
  });
}

function TeamAvatar({ name, logo, tone = "orange" }: { name: string; logo?: string | null; tone?: "orange" | "dark" }) {
  return (
    <div className={cn(
      "flex h-11 w-11 items-center justify-center rounded-2xl border overflow-hidden shrink-0",
      tone === "orange" ? "border-orange-300/15 bg-orange-400/10 text-orange-100" : "border-white/10 bg-white/[0.06] text-white"
    )}>
      {logo ? <img src={logo} alt="" className="h-full w-full object-contain p-1.5" loading="lazy" /> : <span className="text-xs font-black">{initials(name)}</span>}
    </div>
  );
}

function LeaguePill({ active, children, onClick }: { active: boolean; children: any; onClick: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={cn(
        "relative shrink-0 rounded-2xl px-5 py-3 text-[11px] font-black uppercase tracking-[0.16em] border transition-all overflow-hidden",
        active
          ? "bg-orange-400/15 border-orange-300/40 text-orange-100 shadow-[0_0_28px_rgba(251,146,60,0.16)]"
          : "bg-white/[0.03] border-white/[0.06] text-white/35 hover:text-white/70"
      )}
    >
      {active && <motion.span layoutId="hoops-pill" className="absolute inset-0 bg-orange-400/[0.08]" />}
      <span className="relative">{children}</span>
    </motion.button>
  );
}

function MiniStat({ label, value, tone = "green" }: { label: string; value: any; tone?: "green" | "orange" | "blue" }) {
  const toneClass = tone === "orange" ? "text-orange-200" : tone === "blue" ? "text-blue-300" : "text-primary";
  return (
    <div className="rounded-2xl border border-white/[0.055] bg-black/25 p-3">
      <p className="text-[9px] uppercase tracking-widest text-white/30 font-bold">{label}</p>
      <p className={cn("mt-1 text-lg font-black", toneClass)}>{value}</p>
    </div>
  );
}

function GameCard({ game, onOpen, index = 0 }: { game: any; onOpen: () => void; index?: number }) {
  const live = statusLabel(game.status) === "LIVE";
  const homeLogo = teamLogo(game, "home");
  const awayLogo = teamLogo(game, "away");
  const done = statusLabel(game.status) === "FT";
  const hasScore = game.home_score != null || game.away_score != null;

  return (
    <motion.button
      onClick={onOpen}
      className="w-full text-left group"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.018, 0.22) }}
      whileTap={{ scale: 0.985 }}
    >
      <div className="rounded-3xl border border-white/[0.06] bg-white/[0.025] p-4 transition-all group-hover:bg-white/[0.045] group-hover:border-orange-300/18">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex -space-x-3 shrink-0">
              <TeamAvatar name={game.home_team} logo={homeLogo} tone="orange" />
              <TeamAvatar name={game.away_team} logo={awayLogo} tone="dark" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={cn("text-[9px] font-black uppercase tracking-widest", live ? "text-red-400" : done ? "text-white/35" : "text-white/30")}>{live ? "● LIVE" : statusLabel(game.status)}</span>
              </div>
              <p className="mt-2 text-sm font-black text-white truncate">{game.home_team}</p>
              <p className="text-sm font-black text-white/70 truncate">{game.away_team}</p>
            </div>
          </div>
          <div className="text-right shrink-0">
            {hasScore ? (
              <p className="text-xl font-black text-white tabular-nums">{game.home_score ?? 0}-{game.away_score ?? 0}</p>
            ) : (
              <p className="text-xs font-bold text-white/40">{timeLabel(game.start_time)}</p>
            )}
            <ChevronRight className="ml-auto mt-2 h-4 w-4 text-white/25 transition-transform group-hover:translate-x-1" />
          </div>
        </div>
      </div>
    </motion.button>
  );
}

function LeagueGroup({ group, offset, openGame }: { group: any; offset: number; openGame: (game: any) => void }) {
  const { meta, games } = group;
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2 min-w-0">
          {meta.logo || meta.flag ? <img src={meta.logo || meta.flag} alt="" className="h-5 w-5 rounded-md object-contain" loading="lazy" /> : <span className="h-5 w-1 rounded-full bg-orange-300/70" />}
          <div className="min-w-0">
            <h3 className="text-[12px] font-black uppercase tracking-[0.18em] text-white/75 truncate">{meta.name}</h3>
            {meta.country && <p className="text-[10px] font-bold uppercase tracking-widest text-white/25 truncate">{meta.country}</p>}
          </div>
        </div>
        <span className="rounded-full border border-white/[0.06] bg-white/[0.04] px-2.5 py-1 text-[10px] font-black text-white/35">{games.length}</span>
      </div>
      <div className="grid gap-3">
        {games.map((game: any, i: number) => (
          <GameCard key={`${game.league_key}-${game.external_game_id || game.id}`} game={game} index={offset + i} onOpen={() => openGame(game)} />
        ))}
      </div>
    </section>
  );
}

export default function Basketball() {
  const [, setLocation] = useLocation();
  const [league, setLeague] = useState("all");
  const [query, setQuery] = useState("");
  const leagueParam = league === "all" ? "" : `?league=${league}`;

  const { data: health } = useQuery({
    queryKey: ["/api/basketball/health"],
    queryFn: () => fetchApi("/basketball/health"),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const { data: gamesData, isLoading: gamesLoading, isFetching: gamesFetching } = useQuery({
    queryKey: ["/api/basketball/games", league],
    queryFn: () => fetchApi(`/basketball/games${leagueParam}`),
    staleTime: 45_000,
    refetchInterval: 45_000,
  });

  const games = useMemo(() => {
    const all = (gamesData as any)?.games || [];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((g: any) => {
      const meta = leagueMeta(g);
      return String(g.home_team || "").toLowerCase().includes(q)
        || String(g.away_team || "").toLowerCase().includes(q)
        || String(meta.name || "").toLowerCase().includes(q)
        || String(meta.country || "").toLowerCase().includes(q);
    });
  }, [gamesData, query]);

  const grouped = useMemo(() => groupGames(games), [games]);
  const liveCount = games.filter((g: any) => statusLabel(g.status) === "LIVE").length;
  const leagueCount = new Set(games.map((g: any) => leagueMeta(g).key)).size;
  const degraded = (health as any)?.status === "degraded";
  const syncing = gamesFetching;

  const openGame = (game: any) => setLocation(`/basketball/games/${game.league_key}/${game.external_game_id || game.odds_event_id}`);

  return (
    <div className="min-h-screen bg-[#060a0e] text-white pb-28 relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none">
        <motion.div className="absolute -top-28 right-[-20%] h-[55vh] w-[80vw] rounded-full bg-orange-500/10 blur-[120px]" animate={{ scale: [1, 1.08, 1], opacity: [0.65, 0.95, 0.65] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }} />
        <div className="absolute top-[20%] left-[-30%] h-[45vh] w-[70vw] rounded-full bg-primary/7 blur-[100px]" />
      </div>

      <main className="relative z-10 mx-auto max-w-3xl px-4 pt-5 space-y-5">
        <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-[30px] border border-white/[0.06] bg-white/[0.025] p-5 overflow-hidden relative">
          <div className="absolute -right-10 -bottom-16 h-36 w-36 rounded-full bg-orange-400/10 blur-3xl" />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-200/65">ScorePhantom Hoops</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight">Basketball Games 🏀</h1>
              <p className="mt-1 text-xs text-white/45 leading-relaxed">Browse global basketball games. Open a matchup for full analysis.</p>
            </div>
            <motion.div animate={{ rotate: syncing ? 360 : 0 }} transition={{ duration: 1.2, repeat: syncing ? Infinity : 0, ease: "linear" }} className="h-12 w-12 rounded-2xl border border-orange-300/20 bg-orange-400/10 flex items-center justify-center shrink-0">
              <Activity className="h-6 w-6 text-orange-200" />
            </motion.div>
          </div>

          <div className="relative mt-5 grid grid-cols-3 gap-2">
            <MiniStat label="Games" value={games.length || "—"} tone="orange" />
            <MiniStat label="Live" value={liveCount} tone="blue" />
            <MiniStat label="Leagues" value={leagueCount || "—"} />
          </div>

          <div className="relative mt-4 flex items-center gap-2 rounded-2xl border border-white/[0.06] bg-black/25 px-3 py-2 text-xs text-white/35">
            <span className={cn("h-2 w-2 rounded-full", syncing ? "bg-orange-300 animate-pulse" : "bg-primary")} />
            <span>{syncing ? "Refreshing basketball games..." : "Games synced · auto-refresh active"}</span>
          </div>

          {degraded && (
            <div className="relative mt-3 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-3 text-xs text-amber-100/70">
              Basketball feed is warming up. More games may appear after the next sync.
            </div>
          )}
        </motion.section>

        <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
          {LEAGUES.map((l) => <LeaguePill key={l.key} active={league === l.key} onClick={() => setLeague(l.key)}>{l.label}</LeaguePill>)}
        </div>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-black uppercase tracking-widest text-white/80">Games</h2>
            </div>
            <div className="relative w-44 shrink-0">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/25" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="w-full rounded-xl border border-white/[0.06] bg-black/30 py-2 pl-8 pr-3 text-xs text-white outline-none placeholder:text-white/25 focus:border-orange-300/30" />
            </div>
          </div>

          {gamesLoading ? <div className="rounded-3xl border border-white/[0.06] bg-white/[0.025] p-5 text-sm text-white/40">Loading games...</div> : grouped.length ? (
            <div className="space-y-6">
              {grouped.map((group, i) => <LeagueGroup key={`${group.meta.key}-${group.meta.name}`} group={group} offset={i * 4} openGame={openGame} />)}
            </div>
          ) : (
            <div className="rounded-3xl border border-white/[0.06] bg-white/[0.025] p-6 text-center">
              <RefreshCw className="mx-auto h-6 w-6 text-white/20" />
              <p className="mt-3 text-sm font-bold text-white/45">No basketball games synced yet</p>
              <p className="mt-1 text-xs text-white/30">The feed may still be warming up. Check again shortly.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
