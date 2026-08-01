import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AlertTriangle, Layers3, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  basketballGameHref,
  basketballPercent,
  clampBasketball,
  type BasketballPrediction,
} from "@/lib/basketball-world";
import {
  BasketballEmptyState,
  BasketballIntegrityNote,
  BasketballLoadingGrid,
  BasketballSignalCard,
  BasketballWorldPage,
} from "@/components/basketball/BasketballWorld";

type BuildMode = "safer" | "balanced" | "edge";

function pickId(pick: BasketballPrediction) {
  return `${pick.league?.key || "basketball"}:${pick.game?.id || "unknown"}`;
}

function edgeStrength(pick: BasketballPrediction) {
  const rec = pick.recommendation;
  return rec?.edgePoints != null ? Number(rec.edgePoints) / 20 : Number(rec?.edge || 0);
}

function rankPicks(picks: BasketballPrediction[], mode: BuildMode) {
  return [...picks].sort((a, b) => {
    if (mode === "safer") {
      const safeA = (Number(a.intel?.dataQuality || 0) * 0.55) + (Number(a.recommendation?.modelProbability || 0) * 100 * 0.45);
      const safeB = (Number(b.intel?.dataQuality || 0) * 0.55) + (Number(b.recommendation?.modelProbability || 0) * 100 * 0.45);
      return safeB - safeA;
    }
    if (mode === "edge") return edgeStrength(b) - edgeStrength(a);
    return Number(b.recommendation?.phantomScore || 0) - Number(a.recommendation?.phantomScore || 0);
  });
}

export default function BasketballAcca() {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<BuildMode>("safer");
  const [targetLegs, setTargetLegs] = useState(2);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [slipLocked, setSlipLocked] = useState(false);
  const query = useQuery({
    queryKey: ["basketball-best-picks", 14],
    queryFn: () => fetchApi("/basketball/best-picks?days=14"),
    staleTime: 90_000,
  });

  const picks = useMemo(() => (((query.data as any)?.picks || []) as BasketballPrediction[]), [query.data]);
  const ranked = useMemo(() => rankPicks(picks, mode), [mode, picks]);

  useEffect(() => {
    setSelectedIds(ranked.slice(0, targetLegs).map(pickId));
    setSlipLocked(false);
  }, [mode, ranked, targetLegs]);

  const selected = ranked.filter((pick) => selectedIds.includes(pickId(pick)));
  const combinedOdds = selected.reduce((total, pick) => total * Math.max(1, Number(pick.recommendation?.bookmakerPrice || 1)), 1);
  const combinedModel = selected.reduce((total, pick) => total * clampBasketball(Number(pick.recommendation?.modelProbability || 0)), 1);
  const marketProbability = selected.reduce((total, pick) => total * clampBasketball(Number(pick.recommendation?.impliedProbability || 0)), 1);
  const averageCoverage = selected.length
    ? selected.reduce((total, pick) => total + Number(pick.intel?.dataQuality || 0), 0) / selected.length
    : 0;
  const averageScore = selected.length
    ? selected.reduce((total, pick) => total + Number(pick.recommendation?.phantomScore || 0), 0) / selected.length
    : 0;
  const slipCall = selected.length < 2 ? "NOT READY" : averageCoverage >= 60 && averageScore >= 70 ? "BET" : "WATCH";

  const togglePick = (id: string) => {
    setSlipLocked(false);
    setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  };

  return (
    <BasketballWorldPage
      eyebrow="Basketball world · parlay intelligence"
      title="Parlay Lab"
      subtitle="Build basketball combinations from independently qualified games. The lab refuses duplicate match exposure and never adds a weak leg just to reach an odds target."
      wide
    >
      <section className="mb-5 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="flex flex-wrap gap-2 rounded-2xl border border-white/[0.055] bg-white/[0.022] p-2">
          {([
            { value: "safer", label: "Safer", detail: "Coverage first" },
            { value: "balanced", label: "Balanced", detail: "Best signal score" },
            { value: "edge", label: "Max edge", detail: "Price gap first" },
          ] as { value: BuildMode; label: string; detail: string }[]).map((item) => (
            <button key={item.value} type="button" onClick={() => setMode(item.value)} className={cn("min-w-[8rem] flex-1 rounded-xl px-4 py-2.5 text-left transition", mode === item.value ? "bg-orange-300 text-[#180b02]" : "bg-white/[0.025] text-white/42 hover:text-white")}>
              <strong className="block text-[10px] font-black uppercase tracking-wider">{item.label}</strong>
              <small className={cn("mt-0.5 block text-[9px]", mode === item.value ? "text-black/50" : "text-white/22")}>{item.detail}</small>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-2xl border border-white/[0.055] bg-white/[0.022] p-2">
          <span className="px-2 text-[9px] font-black uppercase tracking-wider text-white/25">Legs</span>
          {[2, 3, 4, 5].map((legs) => (
            <button key={legs} type="button" onClick={() => setTargetLegs(legs)} className={cn("grid h-9 w-9 place-items-center rounded-xl text-xs font-black transition", targetLegs === legs ? "bg-violet-300 text-[#140720]" : "text-white/35 hover:bg-white/[0.04] hover:text-white")}>{legs}</button>
          ))}
        </div>
      </section>

      {picks.length > 0 && picks.length < targetLegs && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-300/15 bg-amber-400/[0.05] p-4 text-xs leading-5 text-amber-100/70">
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" /> Only {picks.length} basketball markets currently qualify. The lab will not pad this slip to {targetLegs} legs.
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section>
          {query.isLoading ? (
            <BasketballLoadingGrid count={3} />
          ) : query.isError ? (
            <BasketballEmptyState title="Parlay data unavailable" message="Premium access or the basketball prediction feed is unavailable. Restore access, then refresh the lab." />
          ) : ranked.length ? (
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-1">
              {ranked.map((pick, index) => {
                const id = pickId(pick);
                return <BasketballSignalCard key={id} prediction={pick} index={index} compact selected={selectedIds.includes(id)} onSelect={() => togglePick(id)} onOpen={() => setLocation(basketballGameHref(pick))} />;
              })}
            </div>
          ) : (
            <BasketballEmptyState title="No parlay-worthy legs" message="No basketball market currently clears the price and evidence gates. A blank slip is a valid decision." />
          )}
        </section>

        <aside className="h-fit rounded-3xl border border-orange-200/12 bg-[#0b1016]/95 p-5 shadow-[0_28px_90px_rgba(0,0,0,.35)] xl:sticky xl:top-24">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-orange-200/45">Phantom slip</p>
              <h2 className="mt-1 text-xl font-black">{selected.length} selections</h2>
            </div>
            <span className={cn("rounded-full border px-3 py-1 text-[9px] font-black tracking-wider", slipCall === "BET" ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-200" : slipCall === "WATCH" ? "border-amber-300/20 bg-amber-400/10 text-amber-100" : "border-white/10 bg-white/[0.03] text-white/35")}>{slipCall}</span>
          </div>

          <div className="mt-5 space-y-2">
            {selected.map((pick, index) => (
              <div key={pickId(pick)} className="flex items-start gap-3 rounded-2xl bg-white/[0.025] p-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-orange-400/10 text-[10px] font-black text-orange-100">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10px] font-bold text-white/45">{pick.game?.homeTeam} vs {pick.game?.awayTeam}</p>
                  <p className="mt-0.5 truncate text-xs font-black text-white">{pick.recommendation?.pick}</p>
                </div>
                <span className="text-xs font-black text-orange-100">{Number(pick.recommendation?.bookmakerPrice || 1).toFixed(2)}</span>
              </div>
            ))}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-3">
              <p className="text-[8px] font-black uppercase tracking-wider text-white/24">Combined odds</p>
              <p className="mt-1 text-2xl font-black text-orange-100">{selected.length ? combinedOdds.toFixed(2) : "—"}</p>
            </div>
            <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-3">
              <p className="text-[8px] font-black uppercase tracking-wider text-white/24">Joint model</p>
              <p className="mt-1 text-2xl font-black text-violet-100">{selected.length ? basketballPercent(combinedModel) : "—"}</p>
            </div>
          </div>

          <div className="mt-4 space-y-2 text-[10px] text-white/34">
            <div className="flex items-center justify-between"><span>Market joint probability</span><strong className="text-white/60">{selected.length ? basketballPercent(marketProbability) : "—"}</strong></div>
            <div className="flex items-center justify-between"><span>Average coverage</span><strong className="text-white/60">{Math.round(averageCoverage)}%</strong></div>
            <div className="flex items-center justify-between"><span>Average signal score</span><strong className="text-white/60">{Math.round(averageScore)}</strong></div>
          </div>

          <div className={cn("mt-5 flex items-start gap-2 rounded-2xl p-3 text-[10px] leading-4", slipCall === "BET" ? "bg-emerald-400/[0.06] text-emerald-100/60" : "bg-amber-400/[0.06] text-amber-100/60")}>
            {slipCall === "BET" ? <ShieldCheck className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
            {slipCall === "BET" ? "Evidence and coverage clear the conservative parlay gate." : "Treat this as a watchlist. Current basketball coverage is too thin for an aggressive combined stake."}
          </div>

          <button type="button" onClick={() => setSlipLocked(true)} disabled={selected.length < 2} className={cn("mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-[10px] font-black uppercase tracking-[0.16em] disabled:cursor-not-allowed disabled:opacity-30", slipLocked ? "bg-emerald-300 text-[#04130b]" : "bg-orange-300 text-[#180b02]")}>
            {slipLocked ? <ShieldCheck className="h-4 w-4" /> : <Layers3 className="h-4 w-4" />} {slipLocked ? "Research slip locked" : "Lock research slip"} {!slipLocked && <Sparkles className="h-3.5 w-3.5" />}
          </button>
          <p className="mt-3 text-center text-[9px] leading-4 text-white/22">Research tool only. ScorePhantom never places a wager or guarantees an outcome.</p>
        </aside>
      </div>

      <div className="mt-5"><BasketballIntegrityNote /></div>
    </BasketballWorldPage>
  );
}
