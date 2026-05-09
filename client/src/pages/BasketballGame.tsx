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

        {/* Error state */}
        {error && !isLoading && (
          <div className="relative rounded-2xl overflow-hidden p-6 text-center">
            <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 via-transparent to-transparent" />
            <div className="relative z-10">
              <AlertCircle className="w-10 h-10 text-red-400/60 mx-auto mb-3" />
              <p className="text-sm font-bold text-white/60 mb-1">Prediction Unavailable</p>
              <p className="text-xs text-white/30 max-w-[240px] mx-auto">
                This fixture may not be synced yet. Try again shortly or check back closer to tip-off.
              </p>
              <button onClick={() => window.history.back()} className="mt-4 px-4 py-2 rounded-xl bg-white/[0.06] text-xs font-bold text-white/50 hover:bg-white/10 transition-all">
                Go Back
              </button>
            </div>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
            <p className="text-xs text-white/30">Loading prediction…</p>
          </div>
        )}

        {/* Game not found */}
        {!isLoading && !error && !gameData && (
          <div className="relative rounded-2xl overflow-hidden p-6 text-center">
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent" />
            <div className="relative z-10">
              <AlertCircle className="w-10 h-10 text-white/20 mx-auto mb-3" />
              <p className="text-sm font-bold text-white/40 mb-1">Game Not Found</p>
              <p className="text-xs text-white/25 max-w-[240px] mx-auto">
                This fixture isn't in our database yet. Try again after the next sync.
              </p>
              <button onClick={() => window.history.back()} className="mt-4 px-4 py-2 rounded-xl bg-white/[0.06] text-xs font-bold text-white/50 hover:bg-white/10 transition-all">
                Go Back
              </button>
            </div>
          </div>
        )}

        {/* Main content – only render when we have game data */}
        {!isLoading && !error && gameData && (
          <>
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
            <section className="relative rounded-2xl overflow-hidden mb-4">
              {/* Cinematic green glow backdrop */}
              <div className="absolute inset-0 z-0">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent" />
                {/* Diagonal light streaks */}
                <div className="absolute -top-10 -right-10 w-[200%] h-[200%] opacity-[0.07]" style={{
                  background: 'repeating-linear-gradient(135deg, transparent, transparent 40px, rgba(16,231,116,0.3) 40px, rgba(16,231,116,0.3) 42px)',
                }} />
                <div className="absolute bottom-0 left-0 w-[60%] h-[80%] bg-primary/10 blur-[60px] rounded-full" />
                <div className="absolute top-0 right-[20%] w-[40%] h-[60%] bg-primary/8 blur-[50px] rounded-full" />
              </div>

              <div className="relative z-10 p-5 border border-primary/15 rounded-2xl backdrop-blur-sm">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-primary text-sm">🎯</span>
                    <span className="text-[10px] font-black text-primary/70 uppercase tracking-[0.2em]">Recommendation</span>
                  </div>
                </div>

                {/* Match Pick & Ring */}
                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1 mt-2">Our Best Bet</p>
                <div className="flex items-center justify-between gap-4 mb-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="text-2xl font-black text-white uppercase leading-tight">
                      {rec.pick || "No Clear Edge"}
                    </p>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-sm font-bold text-white/90">
                      {rec.pick || "No Clear Edge"}
                      <ChevronRight className="w-3.5 h-3.5 text-white/40" />
                    </div>
                  </div>

                  {/* Large circular confidence gauge */}
                  <div className="shrink-0 flex flex-col items-center">
                    <div className="relative w-[80px] h-[80px]">
                      {/* Background ring */}
                      <svg className="w-full h-full -rotate-90" viewBox="0 0 72 72">
                        <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4.5" />
                        <circle
                          cx="36" cy="36" r="30" fill="none"
                          stroke="url(#confGradBB)"
                          strokeWidth="4.5"
                          strokeLinecap="round"
                          strokeDasharray={`${((rec.phantomScore || 0) / 100) * 188.5} 188.5`}
                        />
                        <defs>
                          <linearGradient id="confGradBB" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#10e774" />
                            <stop offset="100%" stopColor="#0bc95f" />
                          </linearGradient>
                        </defs>
                      </svg>
                      {/* Center text */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-xl font-black text-white leading-none">{rec.phantomScore || 0}%</span>
                      </div>
                    </div>
                    <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest mt-1">PHANTOM SCORE</span>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-primary">{rec.market || "Market"}</span>
                  <span className="rounded-full border border-white/[0.08] bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white/70">{rec.riskLevel || "HIGH RISK"}</span>
                  {rec.edgePoints != null && <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-primary">+{rec.edgePoints} Edge</span>}
                  {cacheMeta?.source && (
                    <span className="rounded-full border border-white/[0.08] bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white/55">
                      {cacheMeta.source === "cache" ? "Cached" : "Fresh"}
                    </span>
                  )}
                </div>

              <div className="relative mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Metric label="Model" value={pct(rec.modelProbability)} />
                <Metric label="Line" value={rec.bookmakerLine ?? "—"} />
                <Metric label="Odds" value={money(rec.bookmakerPrice)} sub={rec.bookmakerTitle || "Book"} />
              </div>

              <div className="relative mt-4 space-y-2">
                {userReasons.map((reason: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-white/70">
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <span>{reason}</span>
                  </div>
                ))}
              </div>
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
          </>
        )}
      </main>
    </div>
  );
}
