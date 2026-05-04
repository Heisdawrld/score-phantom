import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Activity, ChevronRight, RefreshCw, Search, ShieldCheck, Sparkles, Trophy, Zap } from "lucide-react";
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

function LeaguePill({ active, children, onClick }: { active: boolean; children: any; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] border transition-all",
        active
          ? "bg-orange-400/15 border-orange-300/40 text-orange-200 shadow-[0_0_24px_rgba(251,146,60,0.14)]"
          : "bg-white/[0.03] border-white/[0.06] text-white/35 hover:text-white/70"
      )}
    >
      {children}
    </button>
  );
}

function PickCard({ pick, onOpen }: { pick: any; onOpen: () => void }) {
  const rec = pick?.recommendation || {};
  const game = pick?.game || {};
  const projection = pick?.projection || {};
  const intel = pick?.intel || {};
  const capped = rec.betaCapped;
  return (
    <button onClick={onOpen} className="w-full text-left group">
      <motion.div whileTap={{ scale: 0.99 }} className="relative overflow-hidden rounded-[28px] border border-orange-300/20 bg-gradient-to-br from-orange-400/[0.12] via-white/[0.035] to-primary/[0.06] p-4 transition-all group-hover:border-orange-300/35">
        <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-orange-400/10 blur-3xl" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-200/70">Basketball Edge</p>
              <span className="rounded-full border border-white/[0.08] bg-black/25 px-2 py-0.5 text-[9px] font-black text-white/45 uppercase tracking-widest">{pick?.league?.label || "NBA"}</span>
            </div>
            <h3 className="mt-2 text-sm font-black text-white leading-tight">{game.homeTeam} vs {game.awayTeam}</h3>
            <p className="mt-3 text-2xl font-black text-orange-100 leading-tight">{rec.pick || "No Clear Edge"}</p>
          </div>
          <div className="rounded-2xl border border-orange-300/20 bg-black/30 px-3 py-2 text-center shrink-0">
            <p className="text-[9px] uppercase tracking-widest text-white/35">Score</p>
            <p className="text-xl font-black text-primary">{rec.phantomScore || 0}</p>
            {capped && <p className="mt-0.5 text-[8px] font-black text-orange-200/70">CAPPED</p>}
          </div>
        </div>

        <div className="relative mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-black/25 border border-white/[0.05] p-2">
            <p className="text-[9px] text-white/35 uppercase font-bold">Model</p>
            <p className="text-sm font-black text-white">{rec.modelProbability ? `${Math.round(rec.modelProbability * 100)}%` : "—"}</p>
          </div>
          <div className="rounded-2xl bg-black/25 border border-white/[0.05] p-2">
            <p className="text-[9px] text-white/35 uppercase font-bold">Book Line</p>
            <p className="text-sm font-black text-white">{rec.bookmakerLine ?? "—"}</p>
          </div>
          <div className="rounded-2xl bg-black/25 border border-white/[0.05] p-2">
            <p className="text-[9px] text-white/35 uppercase font-bold">Edge</p>
            <p className="text-sm font-black text-white">{rec.edgePoints != null ? `${rec.edgePoints > 0 ? "+" : ""}${rec.edgePoints}` : rec.edge ? `${(rec.edge * 100).toFixed(1)}%` : "—"}</p>
          </div>
        </div>

        <div className="relative mt-3 rounded-2xl border border-white/[0.05] bg-black/20 p-3">
          <div className="flex items-center justify-between gap-3 text-[11px]">
            <span className="text-white/38">Model total</span>
            <span className="font-black text-white">{projection.total || "—"}</span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3 text-[11px]">
            <span className="text-white/38">Bookmaker</span>
            <span className="font-black text-white/75 truncate">{rec.bookmakerTitle || "Market line"} @ {money(rec.bookmakerPrice)}</span>
          </div>
        </div>

        <div className="relative mt-3 flex flex-wrap items-center gap-2 text-[11px] text-white/45">
          <Sparkles className="h-3.5 w-3.5 text-orange-300" />
          <span>{rec.riskLevel || "MEDIUM"} risk</span>
          <span>·</span>
          <span>{intel.dataCoverageLabel || "GOOD"} coverage</span>
          <span>·</span>
          <span>{intel.bookmakerCount || 0} books</span>
        </div>
      </motion.div>
    </button>
  );
}

function GameCard({ game, onOpen }: { game: any; onOpen: () => void }) {
  const live = statusLabel(game.status) === "LIVE";
  return (
    <button onClick={onOpen} className="w-full rounded-3xl border border-white/[0.06] bg-white/[0.025] p-4 text-left hover:bg-white/[0.045] transition-all">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-orange-400/10 border border-orange-300/20 px-2 py-0.5 text-[9px] font-black text-orange-200 uppercase tracking-widest">{String(game.league_key || "NBA").toUpperCase()}</span>
            <span className={cn("text-[9px] font-black uppercase tracking-widest", live ? "text-red-400" : "text-white/30")}>{live ? "● LIVE" : statusLabel(game.status)}</span>
          </div>
          <p className="mt-2 text-sm font-black text-white">{game.home_team}</p>
          <p className="text-sm font-black text-white/75">{game.away_team}</p>
        </div>
        <div className="text-right">
          {(game.home_score != null || game.away_score != null) ? (
            <p className="text-xl font-black text-white tabular-nums">{game.home_score ?? 0}-{game.away_score ?? 0}</p>
          ) : (
            <p className="text-xs font-bold text-white/40">{timeLabel(game.start_time)}</p>
          )}
          <ChevronRight className="ml-auto mt-2 h-4 w-4 text-white/25" />
        </div>
      </div>
    </button>
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

  const { data: picksData, isLoading: picksLoading } = useQuery({
    queryKey: ["/api/basketball/best-picks", league],
    queryFn: () => fetchApi(`/basketball/best-picks${leagueParam}`),
    staleTime: 45_000,
    refetchInterval: 45_000,
  });

  const { data: gamesData, isLoading: gamesLoading } = useQuery({
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
  const degraded = (health as any)?.status === "degraded";

  const overCluster = useMemo(() => {
    const top = picks.slice(0, 5);
    if (top.length < 3) return false;
    const overs = top.filter((p: any) => p?.recommendation?.marketDirection === "total_over").length;
    return overs / top.length >= 0.7;
  }, [picks]);

  return (
    <div className="min-h-screen bg-[#060a0e] text-white pb-28 relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-28 right-[-20%] h-[55vh] w-[80vw] rounded-full bg-orange-500/10 blur-[120px]" />
        <div className="absolute top-[20%] left-[-30%] h-[45vh] w-[70vw] rounded-full bg-primary/7 blur-[100px]" />
      </div>

      <main className="relative z-10 mx-auto max-w-3xl px-4 pt-5 space-y-5">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-[28px] border border-white/[0.06] bg-white/[0.025] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-200/65">ScorePhantom Basketball Beta</p>
              <h1 className="mt-2 text-2xl font-black tracking-tight">Basketball Intelligence 🏀</h1>
              <p className="mt-1 text-xs text-white/45 leading-relaxed">Real bookmaker lines, projected score, spread and total edges. Beta scores are capped until injuries/player layers are added.</p>
            </div>
            <div className="h-12 w-12 rounded-2xl border border-orange-300/20 bg-orange-400/10 flex items-center justify-center">
              <Activity className="h-6 w-6 text-orange-200" />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-2xl border border-white/[0.05] bg-black/20 p-2">
              <p className="text-[9px] uppercase tracking-widest text-white/30">Auto Sync</p>
              <p className="text-xs font-black text-primary">Active</p>
            </div>
            <div className="rounded-2xl border border-white/[0.05] bg-black/20 p-2">
              <p className="text-[9px] uppercase tracking-widest text-white/30">Status</p>
              <p className="text-xs font-black text-white">{(health as any)?.status || "checking"}</p>
            </div>
            <div className="rounded-2xl border border-white/[0.05] bg-black/20 p-2">
              <p className="text-[9px] uppercase tracking-widest text-white/30">Mode</p>
              <p className="text-xs font-black text-orange-200">Beta V1</p>
            </div>
          </div>
          {degraded && (
            <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-3 text-xs text-amber-100/70">
              Basketball API is degraded. Confirm BALLDONTLIE_API_KEY and THE_ODDS_API_KEY on Render.
            </div>
          )}
        </motion.div>

        <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
          {LEAGUES.map((l) => <LeaguePill key={l.key} active={league === l.key} onClick={() => setLeague(l.key)}>{l.label}</LeaguePill>)}
        </div>

        {overCluster && (
          <div className="rounded-3xl border border-orange-300/20 bg-orange-400/[0.07] p-4 text-xs text-orange-100/75">
            <div className="flex items-center gap-2 font-black text-orange-100"><ShieldCheck className="h-4 w-4" /> Market cluster detected</div>
            <p className="mt-1 leading-relaxed">Most top basketball edges currently lean Over. ScorePhantom is showing them because they clear the line-edge gates, but confidence remains beta-capped.</p>
          </div>
        )}

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-orange-300" />
              <h2 className="text-sm font-black uppercase tracking-widest text-white/80">Best Edges</h2>
            </div>
            <span className="text-[10px] font-bold text-white/30">Book line · Model edge</span>
          </div>
          {picksLoading ? <div className="rounded-3xl border border-white/[0.06] bg-white/[0.025] p-5 text-sm text-white/40">Loading live basketball edges...</div> : picks.length ? (
            <div className="grid gap-3">
              {picks.slice(0, 4).map((pick: any, i: number) => <PickCard key={`${pick.game?.id}-${i}`} pick={pick} onOpen={() => setLocation(`/basketball/games/${pick?.league?.key || 'nba'}/${pick?.game?.id}`)} />)}
            </div>
          ) : (
            <div className="rounded-3xl border border-white/[0.06] bg-white/[0.025] p-5 text-sm text-white/40">
              No qualified basketball edges yet. The engine will not force weak markets.
            </div>
          )}
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
              {games.map((game: any) => (
                <GameCard key={`${game.league_key}-${game.external_game_id || game.id}`} game={game} onOpen={() => setLocation(`/basketball/games/${game.league_key}/${game.external_game_id || game.odds_event_id}`)} />
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-white/[0.06] bg-white/[0.025] p-6 text-center">
              <RefreshCw className="mx-auto h-6 w-6 text-white/20" />
              <p className="mt-3 text-sm font-bold text-white/45">No basketball games synced yet</p>
              <p className="mt-1 text-xs text-white/30">Auto-sync may still be warming up. You can also run Full Basketball Setup from Admin.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
