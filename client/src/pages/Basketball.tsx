import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, ChevronRight, Clock, Flame, RefreshCw, Search, Sparkles, Trophy, Zap } from "lucide-react";
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
  if (s.includes("final")) return "FT";
  if (s.includes("live") || s.includes("q") || s.includes("half")) return "LIVE";
  return "UPCOMING";
}

function money(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2).replace(/\.00$/, "") : "—";
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

function shortTeam(name?: string) {
  if (!name) return "—";
  return String(name)
    .replace("New York ", "NY ")
    .replace("Los Angeles ", "LA ")
    .replace("Golden State ", "GS ")
    .replace("Oklahoma City ", "OKC ")
    .replace("Philadelphia ", "PHI ")
    .replace("Minnesota ", "MIN ");
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

function PickCard({ pick, onOpen, featured = false, index = 0 }: { pick: any; onOpen: () => void; featured?: boolean; index?: number }) {
  const rec = pick?.recommendation || {};
  const game = pick?.game || {};
  const projection = pick?.projection || {};
  const intel = pick?.intel || {};

  return (
    <motion.button
      onClick={onOpen}
      className="w-full text-left group"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      whileTap={{ scale: 0.985 }}
    >
      <div className={cn(
        "relative overflow-hidden rounded-[30px] border transition-all",
        featured
          ? "border-orange-300/25 bg-gradient-to-br from-orange-400/[0.16] via-white/[0.04] to-primary/[0.07] p-5 shadow-[0_0_50px_rgba(251,146,60,0.08)]"
          : "border-orange-300/14 bg-gradient-to-br from-white/[0.035] via-orange-400/[0.055] to-primary/[0.035] p-4 group-hover:border-orange-300/30"
      )}>
        <motion.div
          className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-orange-400/12 blur-3xl"
          animate={{ scale: [1, 1.12, 1], opacity: [0.5, 0.85, 0.5] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-orange-200/35 to-transparent" />

        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-orange-300/20 bg-orange-400/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-orange-100">
                <Flame className="h-3 w-3" /> {featured ? "Top Hoops Edge" : "Basketball Edge"}
              </span>
              <span className="rounded-full border border-white/[0.08] bg-black/25 px-2.5 py-1 text-[9px] font-black text-white/45 uppercase tracking-widest">{pick?.league?.label || "NBA"}</span>
            </div>
            <h3 className="mt-3 text-sm font-black text-white leading-tight">{shortTeam(game.homeTeam)} vs {shortTeam(game.awayTeam)}</h3>
            <p className={cn("mt-3 font-black text-orange-100 leading-tight", featured ? "text-3xl" : "text-2xl")}>{rec.pick || "No Clear Edge"}</p>
          </div>
          <div className={cn("rounded-2xl border border-orange-300/20 bg-black/30 text-center shrink-0", featured ? "px-4 py-3" : "px-3 py-2") }>
            <p className="text-[9px] uppercase tracking-widest text-white/35">Score</p>
            <p className={cn("font-black text-primary", featured ? "text-3xl" : "text-xl")}>{rec.phantomScore || 0}</p>
          </div>
        </div>

        <div className="relative mt-5 grid grid-cols-3 gap-2">
          <MiniStat label="Model" value={rec.modelProbability ? `${Math.round(rec.modelProbability * 100)}%` : "—"} />
          <MiniStat label="Line" value={rec.bookmakerLine ?? "—"} tone="orange" />
          <MiniStat label="Edge" value={rec.edgePoints != null ? `${rec.edgePoints > 0 ? "+" : ""}${rec.edgePoints}` : rec.edge ? `${(rec.edge * 100).toFixed(1)}%` : "—"} />
        </div>

        <div className="relative mt-3 flex items-center justify-between gap-3 rounded-2xl border border-white/[0.05] bg-black/20 p-3 text-[11px]">
          <div className="min-w-0">
            <p className="text-white/35">Bookmaker</p>
            <p className="font-black text-white/80 truncate">{rec.bookmakerTitle || "Market line"} @ {money(rec.bookmakerPrice)}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-white/35">Model total</p>
            <p className="font-black text-white">{projection.total || "—"}</p>
          </div>
        </div>

        <div className="relative mt-3 flex flex-wrap items-center gap-2 text-[11px] text-white/45">
          <Sparkles className="h-3.5 w-3.5 text-orange-300" />
          <span>{rec.riskLevel || "MEDIUM"} risk</span>
          <span>·</span>
          <span>{intel.bookmakerCount || 0} books tracked</span>
          <ChevronRight className="ml-auto h-4 w-4 text-white/25 transition-transform group-hover:translate-x-1" />
        </div>
      </div>
    </motion.button>
  );
}

function GameCard({ game, onOpen, index = 0 }: { game: any; onOpen: () => void; index?: number }) {
  const live = statusLabel(game.status) === "LIVE";
  return (
    <motion.button
      onClick={onOpen}
      className="w-full text-left group"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.025 }}
      whileTap={{ scale: 0.985 }}
    >
      <div className="rounded-3xl border border-white/[0.06] bg-white/[0.025] p-4 transition-all group-hover:bg-white/[0.045] group-hover:border-orange-300/18">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex -space-x-3 shrink-0">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-orange-300/15 bg-orange-400/10 text-xs font-black text-orange-100">{initials(game.home_team)}</div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-xs font-black text-white">{initials(game.away_team)}</div>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-orange-400/10 border border-orange-300/20 px-2 py-0.5 text-[9px] font-black text-orange-200 uppercase tracking-widest">{String(game.league_key || "NBA").toUpperCase()}</span>
                <span className={cn("text-[9px] font-black uppercase tracking-widest", live ? "text-red-400" : "text-white/30")}>{live ? "● LIVE" : statusLabel(game.status)}</span>
              </div>
              <p className="mt-2 text-sm font-black text-white truncate">{game.home_team}</p>
              <p className="text-sm font-black text-white/70 truncate">{game.away_team}</p>
            </div>
          </div>
          <div className="text-right shrink-0">
            {(game.home_score != null || game.away_score != null) ? (
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

  const { data: picksData, isLoading: picksLoading, isFetching: picksFetching } = useQuery({
    queryKey: ["/api/basketball/best-picks", league],
    queryFn: () => fetchApi(`/basketball/best-picks${leagueParam}`),
    staleTime: 45_000,
    refetchInterval: 45_000,
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
    return all.filter((g: any) => String(g.home_team || "").toLowerCase().includes(q) || String(g.away_team || "").toLowerCase().includes(q));
  }, [gamesData, query]);

  const picks = (picksData as any)?.picks || [];
  const topPick = picks[0];
  const restPicks = picks.slice(1, 4);
  const liveCount = games.filter((g: any) => statusLabel(g.status) === "LIVE").length;
  const degraded = (health as any)?.status === "degraded";
  const syncing = picksFetching || gamesFetching;

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
              <h1 className="mt-2 text-3xl font-black tracking-tight">Basketball Intelligence 🏀</h1>
              <p className="mt-1 text-xs text-white/45 leading-relaxed">Live market edges from model projection, bookmaker line and game pace.</p>
            </div>
            <motion.div animate={{ rotate: syncing ? 360 : 0 }} transition={{ duration: 1.2, repeat: syncing ? Infinity : 0, ease: "linear" }} className="h-12 w-12 rounded-2xl border border-orange-300/20 bg-orange-400/10 flex items-center justify-center shrink-0">
              <Activity className="h-6 w-6 text-orange-200" />
            </motion.div>
          </div>

          <div className="relative mt-5 grid grid-cols-3 gap-2">
            <MiniStat label="Edges" value={picks.length} tone="orange" />
            <MiniStat label="Games" value={games.length || "—"} />
            <MiniStat label="Live" value={liveCount} tone="blue" />
          </div>

          <div className="relative mt-4 flex items-center gap-2 rounded-2xl border border-white/[0.06] bg-black/25 px-3 py-2 text-xs text-white/35">
            <span className={cn("h-2 w-2 rounded-full", syncing ? "bg-orange-300 animate-pulse" : "bg-primary")} />
            <span>{syncing ? "Refreshing basketball markets..." : "Markets synced · auto-refresh active"}</span>
          </div>

          {degraded && (
            <div className="relative mt-3 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-3 text-xs text-amber-100/70">
              Basketball feed is warming up. Some markets may appear after the next sync.
            </div>
          )}
        </motion.section>

        <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
          {LEAGUES.map((l) => <LeaguePill key={l.key} active={league === l.key} onClick={() => setLeague(l.key)}>{l.label}</LeaguePill>)}
        </div>

        <AnimatePresence mode="popLayout">
          {topPick && !picksLoading && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-orange-300" />
                <h2 className="text-sm font-black uppercase tracking-widest text-white/80">Top Hoops Edge</h2>
              </div>
              <PickCard featured pick={topPick} onOpen={() => setLocation(`/basketball/games/${topPick?.league?.key || 'nba'}/${topPick?.game?.id}`)} />
            </section>
          )}
        </AnimatePresence>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-orange-300" />
              <h2 className="text-sm font-black uppercase tracking-widest text-white/80">Value Board</h2>
            </div>
            <span className="text-[10px] font-bold text-white/30">Line · Odds · Edge</span>
          </div>
          {picksLoading ? <div className="rounded-3xl border border-white/[0.06] bg-white/[0.025] p-5 text-sm text-white/40">Loading live basketball edges...</div> : restPicks.length ? (
            <div className="grid gap-3">
              {restPicks.map((pick: any, i: number) => <PickCard key={`${pick.game?.id}-${i}`} pick={pick} index={i} onOpen={() => setLocation(`/basketball/games/${pick?.league?.key || 'nba'}/${pick?.game?.id}`)} />)}
            </div>
          ) : !topPick ? (
            <div className="rounded-3xl border border-white/[0.06] bg-white/[0.025] p-5 text-sm text-white/40">
              No qualified basketball edges yet. ScorePhantom will not force weak markets.
            </div>
          ) : null}
        </section>

        <section className="space-y-3">
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

          {gamesLoading ? <div className="rounded-3xl border border-white/[0.06] bg-white/[0.025] p-5 text-sm text-white/40">Loading games...</div> : games.length ? (
            <div className="grid gap-3">
              {games.map((game: any, i: number) => (
                <GameCard key={`${game.league_key}-${game.external_game_id || game.id}`} game={game} index={i} onOpen={() => setLocation(`/basketball/games/${game.league_key}/${game.external_game_id || game.odds_event_id}`)} />
              ))}
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
