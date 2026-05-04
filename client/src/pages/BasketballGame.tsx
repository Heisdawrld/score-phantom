import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, BarChart2, Clock, ShieldAlert, Sparkles, Target, TrendingUp } from "lucide-react";
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
  return d.toLocaleString("en-NG", { timeZone: "Africa/Lagos", weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
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

function Metric({ label, value, sub }: { label: string; value: any; sub?: any }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-black/25 p-3 min-h-[82px]">
      <p className="text-[9px] uppercase tracking-widest text-white/30 font-bold">{label}</p>
      <p className="mt-1 text-lg font-black text-white leading-tight">{value}</p>
      {sub && <p className="mt-1 text-[10px] text-white/30 leading-tight">{sub}</p>}
    </div>
  );
}

export default function BasketballGame() {
  const params = useParams();
  const [, setLocation] = useLocation();
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

  const game = (data as any)?.game || (gameData as any)?.game || {};
  const rec = (data as any)?.recommendation || {};
  const projection = (data as any)?.projection || {};
  const intel = (data as any)?.intel || {};
  const candidates = (data as any)?.candidates || [];
  const rejected = (data as any)?.rejectedCandidates || [];
  const noEdge = rec.noClearEdge;

  return (
    <div className="min-h-screen bg-[#060a0e] text-white pb-28 relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-28 right-[-20%] h-[55vh] w-[80vw] rounded-full bg-orange-500/10 blur-[120px]" />
        <div className="absolute top-[20%] left-[-30%] h-[45vh] w-[70vw] rounded-full bg-primary/7 blur-[100px]" />
      </div>

      <main className="relative z-10 mx-auto max-w-3xl px-4 pt-5 space-y-4">
        <button onClick={() => setLocation("/basketball")} className="flex items-center gap-2 text-xs font-bold text-white/45 hover:text-white transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Basketball
        </button>

        <section className="rounded-[28px] border border-white/[0.06] bg-white/[0.025] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-200/65">{String((data as any)?.league?.label || league).toUpperCase()} Game</p>
              <h1 className="mt-2 text-2xl font-black leading-tight">{game.homeTeam || game.home_team} vs {game.awayTeam || game.away_team}</h1>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-white/40"><Clock className="h-3.5 w-3.5" /> {timeLabel(game.startTime || game.start_time)}</p>
            </div>
            <div className="h-12 w-12 rounded-2xl border border-orange-300/20 bg-orange-400/10 flex items-center justify-center">
              <Target className="h-6 w-6 text-orange-200" />
            </div>
          </div>
        </section>

        {isLoading && <div className="rounded-3xl border border-white/[0.06] bg-white/[0.025] p-6 text-sm text-white/40">Running basketball engine...</div>}
        {error && <div className="rounded-3xl border border-red-400/20 bg-red-400/[0.06] p-6 text-sm text-red-100/70">{(error as any).message || "Basketball prediction failed"}</div>}

        {!isLoading && !error && data && (
          <>
            <section className={cn("rounded-[30px] border p-5 overflow-hidden relative", noEdge ? "border-white/[0.06] bg-white/[0.025]" : "border-orange-300/20 bg-gradient-to-br from-orange-400/[0.12] via-white/[0.035] to-primary/[0.06]") }>
              <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-orange-400/10 blur-3xl" />
              <div className="relative flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/35">Recommendation</p>
                  <h2 className={cn("mt-2 text-3xl font-black leading-tight", noEdge ? "text-white/55" : "text-orange-100")}>{rec.pick || "No Clear Edge"}</h2>
                  <p className="mt-2 text-xs text-white/45">{rec.market || "Basketball"} · {rec.riskLevel || "HIGH"} risk</p>
                </div>
                <div className="rounded-2xl border border-white/[0.08] bg-black/30 px-4 py-3 text-center shrink-0">
                  <p className="text-[9px] uppercase tracking-widest text-white/35">Phantom</p>
                  <p className="text-2xl font-black text-primary">{rec.phantomScore || 0}</p>
                  {rec.betaCapped && <p className="mt-1 text-[8px] font-black text-orange-200/70">BETA CAP</p>}
                </div>
              </div>

              <div className="relative mt-5 grid grid-cols-3 gap-2">
                <Metric label="Model" value={pct(rec.modelProbability)} />
                <Metric label="Book Line" value={rec.bookmakerLine ?? "—"} />
                <Metric label="Edge" value={rec.edgePoints != null ? `${rec.edgePoints > 0 ? "+" : ""}${rec.edgePoints}` : rec.edge ? `${(rec.edge * 100).toFixed(1)}%` : "—"} />
              </div>

              <div className="relative mt-3 rounded-2xl border border-white/[0.06] bg-black/25 p-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-white/30 uppercase tracking-widest text-[9px] font-bold">Bookmaker</p>
                    <p className="mt-1 font-black text-white truncate">{rec.bookmakerTitle || "—"}</p>
                  </div>
                  <div>
                    <p className="text-white/30 uppercase tracking-widest text-[9px] font-bold">Odds</p>
                    <p className="mt-1 font-black text-white">{money(rec.bookmakerPrice)}</p>
                  </div>
                </div>
              </div>

              <div className="relative mt-4 space-y-2">
                {(rec.reasons || []).slice(0, 6).map((reason: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-white/55">
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-300" />
                    <span>{reason}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="grid grid-cols-2 gap-3">
              <Metric label="Projected Home" value={projection.homePoints ?? "—"} />
              <Metric label="Projected Away" value={projection.awayPoints ?? "—"} />
              <Metric label="Projected Total" value={projection.total ?? "—"} />
              <Metric label="Model Favorite" value={projection.favorite ? `${shortTeam(projection.favorite)} by ${projection.favoriteSpread}` : "—"} />
            </section>

            <section className="rounded-3xl border border-white/[0.06] bg-white/[0.025] p-4">
              <div className="flex items-center gap-2 mb-3"><BarChart2 className="h-4 w-4 text-primary" /><h3 className="text-sm font-black uppercase tracking-widest">Phantom Intel</h3></div>
              <div className="grid grid-cols-2 gap-2">
                <Metric label="Coverage" value={`${intel.dataQuality ?? 0}%`} sub={intel.dataCoverageLabel || "Beta"} />
                <Metric label="Odds" value={`${intel.oddsQuality ?? 0}%`} sub={`${intel.bookmakerCount || 0} books`} />
                <Metric label="Home Form" value={`${intel.homeFormGames ?? 0} games`} />
                <Metric label="Away Form" value={`${intel.awayFormGames ?? 0} games`} />
                <Metric label="Volatility" value={intel.volatility ?? "—"} />
                <Metric label="Rest" value={`${intel.homeRestDays ?? "—"}d / ${intel.awayRestDays ?? "—"}d`} />
              </div>
              {(intel.limitations || []).length > 0 && (
                <div className="mt-3 rounded-2xl border border-amber-400/15 bg-amber-400/[0.05] p-3">
                  <div className="flex items-center gap-2 text-xs font-black text-amber-100/80"><ShieldAlert className="h-4 w-4" /> Basketball V1 limits</div>
                  <div className="mt-2 space-y-1">
                    {(intel.limitations || []).slice(0, 3).map((item: string, i: number) => <p key={i} className="text-[11px] text-white/38">• {item}</p>)}
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-white/[0.06] bg-white/[0.025] p-4">
              <div className="flex items-center gap-2 mb-3"><TrendingUp className="h-4 w-4 text-orange-300" /><h3 className="text-sm font-black uppercase tracking-widest">Qualified Candidates</h3></div>
              <div className="space-y-2">
                {candidates.length ? candidates.slice(0, 6).map((c: any, i: number) => (
                  <div key={i} className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.05] bg-black/20 p-3">
                    <div>
                      <p className="text-sm font-bold text-white/85">{c.pick}</p>
                      <p className="text-[10px] text-white/35 uppercase tracking-widest">{c.market} · {c.bookmakerTitle || 'book line'} @ {money(c.bookmakerPrice)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-primary">{c.phantomScore}</p>
                      <p className="text-[10px] text-white/35">{pct(c.modelProbability)}</p>
                    </div>
                  </div>
                )) : <p className="text-xs text-white/35">No qualified candidates available.</p>}
              </div>
            </section>

            {rejected.length > 0 && (
              <section className="rounded-3xl border border-white/[0.06] bg-white/[0.018] p-4">
                <h3 className="text-sm font-black uppercase tracking-widest text-white/45">Rejected / weak sides</h3>
                <div className="mt-3 space-y-2">
                  {rejected.slice(0, 3).map((c: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.04] bg-black/15 p-3 opacity-70">
                      <div>
                        <p className="text-sm font-bold text-white/65">{c.pick}</p>
                        <p className="text-[10px] text-white/30 uppercase tracking-widest">{c.rejectionReason || 'Weak edge'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-white/35">{pct(c.modelProbability)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
