import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Activity, ChevronDown, ChevronRight, RefreshCw, Search, Trophy } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { cn } from "@/lib/utils";

const DAY_MS = 24 * 60 * 60 * 1000;

const FILTERS = [
  { key: "all", label: "All" },
  { key: "live", label: "Live" },
  { key: "my", label: "My Leagues" },
];

const MY_LEAGUE_HINTS = ["nba", "ncaab", "euroleague", "champions", "basketball africa", "bbl", "acb", "liga", "higher league", "pba"];
const MAJOR_HINTS = ["nba", "wnba", "ncaab", "wncaab", "euroleague"];
const MAJOR_KEYS = new Set(["nba", "wnba", "ncaab", "ncaaw", "apisports_12", "apisports_120"]);

function lagosDate(offset = 0) {
  const d = new Date(Date.now() + offset * DAY_MS);
  return new Date(d.toLocaleString("en-US", { timeZone: "Africa/Lagos" }));
}

function dateKey(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
}

function buildDateTabs() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = lagosDate(i);
    return {
      key: d.toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" }),
      day: d.toLocaleDateString("en-NG", { weekday: "short", timeZone: "Africa/Lagos" }).toUpperCase(),
      date: d.toLocaleDateString("en-NG", { day: "2-digit", timeZone: "Africa/Lagos" }),
    };
  });
}

function timeLabel(value?: string | null) {
  if (!value) return "TBD";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "TBD";
  return d.toLocaleString("en-NG", {
    timeZone: "Africa/Lagos",
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

function isMyLeague(game: any) {
  const meta = leagueMeta(game);
  const haystack = `${meta.key} ${meta.name} ${meta.country || ""}`.toLowerCase();
  return MY_LEAGUE_HINTS.some((hint) => haystack.includes(hint));
}

function isMajorLeague(game: any) {
  const meta = leagueMeta(game);
  const key = String(meta.key || "").toLowerCase();
  if (MAJOR_KEYS.has(key)) return true;
  const haystack = `${meta.key} ${meta.name} ${meta.country || ""}`.toLowerCase();
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
    const liveA = a.games.some((g) => statusLabel(g.status) === "LIVE") ? 1 : 0;
    const liveB = b.games.some((g) => statusLabel(g.status) === "LIVE") ? 1 : 0;
    if (liveA !== liveB) return liveB - liveA;
    return new Date(a.games[0]?.start_time || 0).getTime() - new Date(b.games[0]?.start_time || 0).getTime();
  });
}

function TeamLogo({ name, logo }: { name: string; logo?: string | null }) {
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full overflow-hidden shrink-0 bg-white/[0.045] border border-white/[0.06]">
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
        "relative shrink-0 min-w-[78px] rounded-3xl border px-4 py-3 text-center transition-all overflow-hidden",
        active
          ? "border-primary/35 bg-primary/12 shadow-[0_0_34px_rgba(20,241,149,0.12)] text-primary"
          : "border-white/[0.06] bg-white/[0.025] text-white/35"
      )}
    >
      {active && <motion.span layoutId="hoops-date" className="absolute inset-0 bg-primary/[0.06]" />}
      <span className="relative block text-[10px] font-black uppercase tracking-widest">{tab.day}</span>
      <span className="relative block mt-1 text-2xl font-black tabular-nums">{tab.date}</span>
    </motion.button>
  );
}

function FilterPill({ active, children, onClick }: { active: boolean; children: any; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-2xl px-5 py-3 text-[11px] font-black uppercase tracking-[0.16em] transition-all",
        active ? "bg-white/[0.10] text-white" : "text-white/35 hover:text-white/70"
      )}
    >
      {children}
    </button>
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
  const done = statusLabel(game.status) === "FT";
  const hasScore = game.home_score != null || game.away_score != null;
  const homeLogo = teamLogo(game, "home");
  const awayLogo = teamLogo(game, "away");
  const oddsLive = String(game.source || "").toLowerCase() === "the_odds_api" || !!game.odds_event_id;
  const prediction = game.prediction_summary || null;
  const predictionBadge = prediction
    ? prediction.noClearEdge
      ? { label: "NO EDGE", className: "border-white/[0.08] bg-black/20 text-white/40" }
      : { label: "EDGE READY", className: "border-primary/20 bg-primary/10 text-primary" }
    : oddsLive
      ? { label: "LINES LIVE", className: "border-orange-300/20 bg-orange-400/10 text-orange-200" }
      : { label: "LINES PENDING", className: "border-white/[0.08] bg-black/20 text-white/35" };

  return (
    <motion.button
      onClick={onOpen}
      className="w-full text-left group"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.014, 0.18) }}
      whileTap={{ scale: 0.985 }}
    >
      <div className="rounded-3xl border border-white/[0.06] bg-white/[0.025] px-4 py-4 transition-all group-hover:bg-white/[0.045] group-hover:border-primary/15">
        <div className="grid grid-cols-[54px_1fr_auto_auto_20px] items-center gap-3">
          <div className="text-xs font-black tabular-nums text-white/35">
            {hasScore ? <span className={cn(live && "text-red-300")}>{done ? "FT" : live ? "LIVE" : ""}</span> : timeLabel(game.start_time)}
          </div>

          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2 min-w-0">
              <TeamLogo name={game.home_team} logo={homeLogo} />
              <p className="truncate text-sm font-black text-white">{game.home_team}</p>
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <TeamLogo name={game.away_team} logo={awayLogo} />
              <p className="truncate text-sm font-black text-white/72">{game.away_team}</p>
            </div>
          </div>

          <div className="text-right shrink-0">
            {hasScore ? (
              <p className="text-xl font-black text-white tabular-nums">{game.home_score ?? 0}-{game.away_score ?? 0}</p>
            ) : live ? (
              <p className="text-[10px] font-black uppercase tracking-widest text-red-300">● Live</p>
            ) : (
              <p className="text-[10px] font-black uppercase tracking-widest text-white/25">Upcoming</p>
            )}
          </div>

          <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
            <span className={cn("rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.22em]", predictionBadge.className)}>
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
  const liveCount = games.filter((g: any) => statusLabel(g.status) === "LIVE").length;

  return (
    <section className="space-y-3">
      <button onClick={onToggle} className="w-full flex items-center justify-between gap-3 px-1 py-1 text-left group">
        <div className="flex items-center gap-2 min-w-0">
          {meta.logo || meta.flag ? (
            <img src={meta.logo || meta.flag} alt="" className="h-6 w-6 rounded-md object-contain" loading="lazy" />
          ) : (
            <span className="text-lg">🏀</span>
          )}
          <span className="h-6 w-1 rounded-full bg-primary/75" />
          <div className="min-w-0">
            <h3 className="text-[12px] font-black uppercase tracking-[0.18em] text-white/72 truncate group-hover:text-white/90 transition-colors">{meta.name}</h3>
            {meta.country && <p className="text-[10px] font-bold uppercase tracking-widest text-white/25 truncate">{meta.country}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {liveCount > 0 && <span className="text-[9px] font-black uppercase tracking-widest text-red-300">● {liveCount}</span>}
          <span className="rounded-full border border-white/[0.06] bg-white/[0.04] px-2.5 py-1 text-[10px] font-black text-white/35">{games.length}</span>
          <ChevronDown className={cn("h-4 w-4 text-white/30 transition-transform duration-200", expanded && "rotate-180 text-primary")} />
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
  const [filter, setFilter] = useState("all");
  const [scope, setScope] = useState<"major" | "global">("major");
  const [selectedDate, setSelectedDate] = useState(() => buildDateTabs()[0].key);
  const [query, setQuery] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const dateTabs = useMemo(() => buildDateTabs(), []);

  const from = `${selectedDate}T00:00:00`;
  const to = `${selectedDate}T23:59:59`;

  const { data: health } = useQuery({
    queryKey: ["/api/basketball/health"],
    queryFn: () => fetchApi("/basketball/health"),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const { data: gamesData, isLoading: gamesLoading, isFetching: gamesFetching } = useQuery({
    queryKey: ["/api/basketball/games", selectedDate],
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
      if (scope === "major" && !isMajorLeague(g)) return false;
      if (filter === "live" && statusLabel(g.status) !== "LIVE") return false;
      if (filter === "my" && !isMyLeague(g)) return false;
      if (!q) return true;
      const meta = leagueMeta(g);
      return String(g.home_team || "").toLowerCase().includes(q)
        || String(g.away_team || "").toLowerCase().includes(q)
        || String(meta.name || "").toLowerCase().includes(q)
        || String(meta.country || "").toLowerCase().includes(q);
    });
  }, [allGamesForDay, filter, query, scope]);

  const grouped = useMemo(() => groupGames(games), [games]);
  const liveCount = allGamesForDay.filter((g: any) => statusLabel(g.status) === "LIVE").length;
  const leagueCount = new Set(allGamesForDay.map((g: any) => leagueMeta(g).key)).size;
  const edgeReadyCount = allGamesForDay.filter((g: any) => g.prediction_summary && !g.prediction_summary.noClearEdge).length;
  const degraded = (health as any)?.status === "degraded";
  const syncing = gamesFetching;

  const openGame = (game: any) => setLocation(`/basketball/games/${game.league_key}/${game.external_game_id || game.odds_event_id}`);
  const toggleGroup = (id: string) => setExpandedGroups((prev) => ({ ...prev, [id]: !prev[id] }));

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
              <p className="mt-1 text-xs text-white/45 leading-relaxed">Browse global basketball games. Edge appears only when bookmaker lines are available.</p>
            </div>
            <motion.div animate={{ rotate: syncing ? 360 : 0 }} transition={{ duration: 1.2, repeat: syncing ? Infinity : 0, ease: "linear" }} className="h-12 w-12 rounded-2xl border border-orange-300/20 bg-orange-400/10 flex items-center justify-center shrink-0">
              <Activity className="h-6 w-6 text-orange-200" />
            </motion.div>
          </div>

          <div className="relative mt-5 grid grid-cols-3 gap-2">
            <MiniStat label="Games" value={allGamesForDay.length || "—"} tone="orange" />
            <MiniStat label="Edge Ready" value={edgeReadyCount} tone="green" />
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

        <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-1 -mx-4 px-4">
          {dateTabs.map((tab) => <DateTab key={tab.key} tab={tab} active={selectedDate === tab.key} onClick={() => setSelectedDate(tab.key)} />)}
        </div>

        <div className="rounded-[22px] border border-white/[0.055] bg-black/25 p-2 flex items-center gap-1 overflow-x-auto hide-scrollbar">
          <FilterPill active={scope === "major"} onClick={() => setScope("major")}>Major (Edges)</FilterPill>
          <FilterPill active={scope === "global"} onClick={() => setScope("global")}>Global (All)</FilterPill>
        </div>

        <div className="rounded-[22px] border border-white/[0.055] bg-black/25 p-2 flex items-center gap-1 overflow-x-auto hide-scrollbar">
          {FILTERS.map((f) => <FilterPill key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}>{f.label}</FilterPill>)}
        </div>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-black uppercase tracking-widest text-white/80">Games</h2>
            </div>
            <div className="relative w-44 shrink-0">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/25" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="w-full rounded-xl border border-white/[0.06] bg-black/30 py-2 pl-8 pr-3 text-xs text-white outline-none placeholder:text-white/25 focus:border-primary/30" />
            </div>
          </div>

          <p className="text-xs text-white/35"><span className="text-primary">●</span> {games.length} fixture{games.length === 1 ? "" : "s"} on this tab</p>

          {gamesLoading ? <div className="rounded-3xl border border-white/[0.06] bg-white/[0.025] p-5 text-sm text-white/40">Loading games...</div> : grouped.length ? (
            <div className="space-y-5">
              {grouped.map((group, i) => (
                <LeagueGroup
                  key={group.id}
                  group={group}
                  offset={i * 4}
                  openGame={openGame}
                  expanded={!!expandedGroups[group.id]}
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
      </main>
    </div>
  );
}
