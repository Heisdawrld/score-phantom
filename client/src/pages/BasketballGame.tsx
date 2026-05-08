import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { AlertCircle, ArrowLeft, BarChart3, Clock, Sparkles, Target, TrendingUp } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { cn } from "@/lib/utils";

function pct(value?: number | null) {
  if (!value) return "—";
  return `${Math.round(value * 100)}%`;
}

function money(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2).replace(/\.00$/, "") : "—";
}

function timeLabel(value?: string | null) {
  if (!value) return "TBD";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "TBD";
  return d.toLocaleString("en-NG", {
    timeZone: "Africa/Lagos",
    weekday: "short",
    month: "short",
    day: "numeric",
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

function shortTeam(name?: string) {
  if (!name) return "—";
  return String(name)
    .replace("New York ", "NY ")
    .replace("Los Angeles ", "LA ")
    .replace("Golden State ", "GS ")
    .replace("Oklahoma City ", "OKC ")
    .replace("Philadelphia ", "PHI ");
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
  const rawJson = game?.raw_json;
  if (game?.raw) return game.raw;
  if (rawJson && typeof rawJson === "object") return rawJson;
  if (rawJson && typeof rawJson === "string") {
    try {
      return JSON.parse(rawJson);
    } catch {
      return {};
    }
  }
  return {};
}

function teamLogo(game: any, side: "home" | "away") {
  const raw = rawOf(game);
  const teams = raw?.teams || raw?.raw?.teams || {};
  if (side === "home") return game?.home_team_logo || raw?.homeTeamLogo || teams?.home?.logo || null;
  return game?.away_team_logo || raw?.awayTeamLogo || teams?.away?.logo || null;
}

function leagueMeta(game: any, prediction: any, leagueKey: string) {
  const raw = rawOf(game);
  const league = raw?.league || raw?.raw?.league || {};
  const country = raw?.country || raw?.raw?.country || {};
  return {
    name: prediction?.league?.label || game?.league_name || league?.name || String(leagueKey).replace("apisports_", "").toUpperCase(),
    country: game?.league_country || country?.name || league?.country || null,
    logo: game?.league_logo || raw?.leagueLogo || league?.logo || null,
    flag: game?.country_flag || raw?.countryFlag || country?.flag || null,
  };
}

function Metric({ label, value, sub }: { label: string; value: any; sub?: any }) {
  return (
    <div className="premium-stat min-h-[78px]">
      <p className="text-[9px] uppercase tracking-widest text-white/30 font-bold">{label}</p>
      <p className="mt-1 text-lg font-black text-white leading-tight">{value}</p>
      {sub && <p className="mt-1 text-[10px] text-white/30 leading-tight">{sub}</p>}
    </div>
  );
}

function TeamBadge({ name, logo }: { name: string; logo?: string | null }) {
  return (
    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl border border-orange-300/15 bg-orange-400/10 text-xl font-black text-orange-100 shadow-[0_0_30px_rgba(251,146,60,0.08)] overflow-hidden">
      {logo ? <img src={logo} alt="" className="h-full w-full object-contain p-2" loading="lazy" /> : initials(name)}
    </div>
  );
}

function cleanReason(reason: string) {
  const r = String(reason || "");
  const low = r.toLowerCase();
  if (low.includes("v1 confidence cap")) return null;
  if (low.includes("injuries")) return null;
  if (low.includes("player props")) return null;
  if (low.includes("starting lineup")) return null;
  if (low.includes("data coverage")) return null;
  if (low.includes("no basketball market passed")) return null;
  return r;
}

export default function BasketballGame() {
  const params = useParams();
  const league = params?.league || "nba";
  const externalId = params?.externalId || "";

  const { data: gameData } = useQuery({
    queryKey: ["/api/basketball/game", league, externalId],
    queryFn: () => fetchApi(`/basketball/games/${league}/${externalId}`),
    enabled: !!league && !!externalId,
    staleTime: 30_000,
    refetchInterval: 45_000,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/basketball/predict", league, externalId],
    queryFn: () => fetchApi(`/basketball/predict/${league}/${externalId}`),
    enabled: !!league && !!externalId,
    staleTime: 45_000,
    refetchInterval: 45_000,
  });

  const rawGame = (gameData as any)?.game || {};
  const predictionSummary = (gameData as any)?.predictionSummary || rawGame?.prediction_summary || null;
  const game = (data as any)?.game || rawGame || {};
  const rec = (data as any)?.recommendation || {};
  const projection = (data as any)?.projection || {};
  const intel = (data as any)?.intel || {};
  const candidates = (data as any)?.candidates || [];
  const cacheMeta = (data as any)?.cache || null;
  const odds = (gameData as any)?.odds || [];
  const hasBookLines = odds.length > 0 || Number(intel.bookmakerCount || 0) > 0 || !!rec.bookmakerPrice;
  const noEdge = rec.noClearEdge;
  const showNoLinesState = !isLoading && !error && data && !hasBookLines;
  const homeName = game.homeTeam || game.home_team;
  const awayName = game.awayTeam || game.away_team;
  const homeLogo = teamLogo(rawGame, "home");
  const awayLogo = teamLogo(rawGame, "away");
  const meta = leagueMeta(rawGame, data, league);
  const status = statusLabel(game.status || rawGame.status);
  const userReasons = (rec.reasons || []).map(cleanReason).filter(Boolean).slice(0, 3);
  const marketSignals = candidates.filter((c: any) => c.pick !== rec.pick).slice(0, 3);

  return (
    <div className="min-h-screen bg-[#060a0e] text-white pb-28 relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-28 right-[-20%] h-[55vh] w-[80vw] rounded-full bg-orange-500/10 blur-[120px]" />
        <div className="absolute top-[20%] left-[-30%] h-[45vh] w-[70vw] rounded-full bg-primary/7 blur-[100px]" />
      </div>

      <main className="relative z-10 mx-auto max-w-4xl px-4 pt-5 space-y-4">
        <button onClick={() => window.history.back()} className="flex items-center gap-2 text-xs font-bold text-white/45 hover:text-white transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <section className="premium-surface-orange rounded-[28px] p-5 overflow-hidden relative">
          <div className="absolute -right-12 -top-10 h-32 w-32 rounded-full bg-orange-400/12 blur-3xl" />
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="premium-chip border-orange-300/20 bg-orange-400/10 text-orange-200">Basketball</span>
              </div>
              <p className="mt-3 text-[10px] font-black uppercase tracking-[0.2em] text-orange-200/65 truncate">
                {String(meta.name || league).toUpperCase()} {meta.country ? `· ${String(meta.country).toUpperCase()}` : ""}
              </p>
              <div className="mt-2 flex items-center gap-2 text-xs text-white/35 flex-wrap">
                <Clock className="h-3.5 w-3.5" />
                <span>{timeLabel(game.startTime || game.start_time || rawGame.start_time)}</span>
                <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest", status === "LIVE" ? "bg-red-400/10 text-red-300" : "bg-white/[0.06] text-white/40")}>{status}</span>
                {predictionSummary && (
                  <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest", predictionSummary.noClearEdge ? "bg-white/[0.06] text-white/40" : "bg-primary/12 text-primary")}>
                    {predictionSummary.noClearEdge ? "No edge saved" : "Edge ready"}
                  </span>
                )}
              </div>
            </div>
            {(meta.logo || meta.flag) && <img src={meta.logo || meta.flag} alt="" className="h-9 w-9 rounded-xl object-contain" loading="lazy" />}
          </div>

          <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div className="text-center min-w-0">
              <TeamBadge name={homeName} logo={homeLogo} />
              <p className="mt-3 text-base font-black leading-tight text-white truncate">{shortTeam(homeName)}</p>
            </div>
            <div className="text-center text-white/25 font-black">VS</div>
            <div className="text-center min-w-0">
              <TeamBadge name={awayName} logo={awayLogo} />
              <p className="mt-3 text-base font-black leading-tight text-white truncate">{shortTeam(awayName)}</p>
            </div>
          </div>
        </section>

        {isLoading && <div className="rounded-3xl border border-white/[0.06] bg-white/[0.025] p-6 text-sm text-white/40">Checking match data...</div>}
        {error && <div className="rounded-3xl border border-red-400/20 bg-red-400/[0.06] p-6 text-sm text-red-100/70">{(error as any).message || "Basketball prediction failed"}</div>}

        {showNoLinesState && (
          <section className="premium-surface-orange rounded-[30px] p-5 overflow-hidden relative">
            <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-orange-400/10 blur-3xl" />
            <div className="relative flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-300/10 shrink-0">
                <AlertCircle className="h-5 w-5 text-amber-200" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-100/70">Lines not available yet</p>
                <h2 className="mt-2 text-2xl font-black leading-tight text-white">Fixture available, edge pending</h2>
                <p className="mt-2 text-sm leading-relaxed text-white/45">
                  ScorePhantom has the game schedule and team info, but no bookmaker line has been saved for this matchup yet. Value edge will appear when odds are available.
                </p>
              </div>
            </div>

            <div className="relative mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Metric label="Game Status" value={status} />
              <Metric label="Book Lines" value="Pending" sub="No odds saved" />
            </div>
          </section>
        )}

        {!isLoading && !error && data && !showNoLinesState && (
          <>
            <section className={cn("rounded-[30px] border p-5 overflow-hidden relative", noEdge ? "border-white/[0.06] bg-white/[0.025]" : "premium-surface-orange border-orange-300/20")}>
              <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-orange-400/10 blur-3xl" />
              <div className="relative flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-200/65">Recommended Play</p>
                  <h2 className={cn("mt-2 text-3xl font-black leading-tight", noEdge ? "text-white/55" : "text-orange-100")}>{rec.pick || "No Clear Edge"}</h2>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full border border-orange-300/20 bg-orange-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-orange-100">{rec.market || "Market"}</span>
                    <span className="rounded-full border border-white/[0.08] bg-black/25 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white/55">{rec.riskLevel || "HIGH"} Risk</span>
                    {rec.edgePoints != null && <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-primary">+{rec.edgePoints} Edge</span>}
                    {cacheMeta?.source && (
                      <span className="rounded-full border border-white/[0.08] bg-black/25 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white/55">
                        {cacheMeta.source === "cache" ? "Cached model" : "Fresh rebuild"}
                      </span>
                    )}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/[0.08] bg-black/30 px-4 py-3 text-center shrink-0">
                  <p className="text-[9px] uppercase tracking-widest text-white/35">Phantom</p>
                  <p className="text-2xl font-black text-primary">{rec.phantomScore || 0}</p>
                </div>
              </div>

              <div className="relative mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Metric label="Model" value={pct(rec.modelProbability)} />
                <Metric label="Line" value={rec.bookmakerLine ?? "—"} />
                <Metric label="Odds" value={money(rec.bookmakerPrice)} sub={rec.bookmakerTitle || "Book"} />
              </div>

              <div className="relative mt-4 space-y-2">
                {userReasons.map((reason: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-white/55">
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-300" />
                    <span>{reason}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="premium-surface rounded-3xl p-4">
              <div className="flex items-center gap-2 mb-3"><Target className="h-4 w-4 text-primary" /><h3 className="text-sm font-black uppercase tracking-widest">Game Projection</h3></div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Metric label="Projected Total" value={projection.total ?? "—"} />
                <Metric label="Model Favorite" value={projection.favorite ? `${shortTeam(projection.favorite)} by ${projection.favoriteSpread}` : "—"} />
                <Metric label="Home Points" value={projection.homePoints ?? "—"} />
                <Metric label="Away Points" value={projection.awayPoints ?? "—"} />
              </div>
            </section>

            {marketSignals.length > 0 && (
              <section className="premium-surface rounded-3xl p-4">
                <div className="flex items-center gap-2 mb-3"><TrendingUp className="h-4 w-4 text-orange-300" /><h3 className="text-sm font-black uppercase tracking-widest">Other Playable Angles</h3></div>
                <div className="space-y-2">
                  {marketSignals.map((c: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.05] bg-black/20 p-3">
                      <div>
                        <p className="text-sm font-bold text-white/85">{c.pick}</p>
                        <p className="text-[10px] text-white/35 uppercase tracking-widest">{c.bookmakerTitle || "book line"} @ {money(c.bookmakerPrice)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-primary">{c.phantomScore}</p>
                        <p className="text-[10px] text-white/35">{pct(c.modelProbability)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {!isLoading && !error && data && (
          <section className="premium-surface rounded-3xl p-4 opacity-90">
            <div className="flex items-center gap-2 mb-3"><BarChart3 className="h-4 w-4 text-primary" /><h3 className="text-sm font-black uppercase tracking-widest">Match Data</h3></div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Metric label="Coverage" value={`${intel.dataQuality ?? 0}%`} sub={intel.dataCoverageLabel || "data"} />
              <Metric label="Bookmakers" value={intel.bookmakerCount || 0} sub={hasBookLines ? "lines saved" : "pending lines"} />
              <Metric label="Home Form" value={`${intel.homeFormGames ?? 0} games`} />
              <Metric label="Away Form" value={`${intel.awayFormGames ?? 0} games`} sub={cacheMeta?.updatedAt ? `Updated ${timeLabel(cacheMeta.updatedAt)}` : undefined} />
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
