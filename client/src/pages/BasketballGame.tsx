import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Clock, Sparkles, Target, TrendingUp } from "lucide-react";
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

function Metric({ label, value, sub }: { label: string; value: any; sub?: any }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-black/25 p-3 min-h-[78px]">
      <p className="text-[9px] uppercase tracking-widest text-white/30 font-bold">{label}</p>
      <p className="mt-1 text-lg font-black text-white leading-tight">{value}</p>
      {sub && <p className="mt-1 text-[10px] text-white/30 leading-tight">{sub}</p>}
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
  return r;
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
  const noEdge = rec.noClearEdge;
  const homeName = game.homeTeam || game.home_team;
  const awayName = game.awayTeam || game.away_team;
  const userReasons = (rec.reasons || []).map(cleanReason).filter(Boolean).slice(0, 3);
  const marketSignals = candidates.filter((c: any) => c.pick !== rec.pick).slice(0, 3);

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
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-200/65">{String((data as any)?.league?.label || league).toUpperCase()} · {timeLabel(game.startTime || game.start_time)}</p>
          <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl border border-orange-300/15 bg-orange-400/10 text-xl font-black text-orange-100 shadow-[0_0_30px_rgba(251,146,60,0.08)]">{initials(homeName)}</div>
              <p className="mt-3 text-base font-black leading-tight text-white">{shortTeam(homeName)}</p>
            </div>
            <div className="text-center text-white/25 font-black">VS</div>
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl border border-orange-300/15 bg-orange-400/10 text-xl font-black text-orange-100 shadow-[0_0_30px_rgba(251,146,60,0.08)]">{initials(awayName)}</div>
              <p className="mt-3 text-base font-black leading-tight text-white">{shortTeam(awayName)}</p>
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
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-200/65">Recommended Play</p>
                  <h2 className={cn("mt-2 text-3xl font-black leading-tight", noEdge ? "text-white/55" : "text-orange-100")}>{rec.pick || "No Clear Edge"}</h2>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full border border-orange-300/20 bg-orange-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-orange-100">{rec.market || "Market"}</span>
                    <span className="rounded-full border border-white/[0.08] bg-black/25 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white/55">{rec.riskLevel || "HIGH"} Risk</span>
                    {rec.edgePoints != null && <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-primary">+{rec.edgePoints} Edge</span>}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/[0.08] bg-black/30 px-4 py-3 text-center shrink-0">
                  <p className="text-[9px] uppercase tracking-widest text-white/35">Phantom</p>
                  <p className="text-2xl font-black text-primary">{rec.phantomScore || 0}</p>
                </div>
              </div>

              <div className="relative mt-5 grid grid-cols-3 gap-2">
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

            <section className="rounded-3xl border border-white/[0.06] bg-white/[0.025] p-4">
              <div className="flex items-center gap-2 mb-3"><Target className="h-4 w-4 text-primary" /><h3 className="text-sm font-black uppercase tracking-widest">Game Projection</h3></div>
              <div className="grid grid-cols-2 gap-3">
                <Metric label="Projected Total" value={projection.total ?? "—"} />
                <Metric label="Model Favorite" value={projection.favorite ? `${shortTeam(projection.favorite)} by ${projection.favoriteSpread}` : "—"} />
                <Metric label="Home Points" value={projection.homePoints ?? "—"} />
                <Metric label="Away Points" value={projection.awayPoints ?? "—"} />
              </div>
            </section>

            {marketSignals.length > 0 && (
              <section className="rounded-3xl border border-white/[0.06] bg-white/[0.025] p-4">
                <div className="flex items-center gap-2 mb-3"><TrendingUp className="h-4 w-4 text-orange-300" /><h3 className="text-sm font-black uppercase tracking-widest">Other Playable Angles</h3></div>
                <div className="space-y-2">
                  {marketSignals.map((c: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.05] bg-black/20 p-3">
                      <div>
                        <p className="text-sm font-bold text-white/85">{c.pick}</p>
                        <p className="text-[10px] text-white/35 uppercase tracking-widest">{c.bookmakerTitle || 'book line'} @ {money(c.bookmakerPrice)}</p>
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

            <section className="rounded-3xl border border-white/[0.045] bg-white/[0.015] p-4 opacity-80">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Match Data</p>
                  <p className="mt-1 text-xs text-white/35">Coverage {intel.dataQuality ?? 0}% · {intel.bookmakerCount || 0} books · Form {intel.homeFormGames ?? 0}/{intel.awayFormGames ?? 0}</p>
                </div>
                <div className="text-right text-xs text-white/35">
                  <p>Rest</p>
                  <p className="font-black text-white/55">{intel.homeRestDays ?? "—"}d / {intel.awayRestDays ?? "—"}d</p>
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
