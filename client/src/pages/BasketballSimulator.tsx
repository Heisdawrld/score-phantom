import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Activity, ArrowRight, Gauge, RotateCcw, ShieldAlert } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  basketballDecision,
  basketballGameHref,
  basketballPercent,
  clampBasketball,
  type BasketballGame,
  type BasketballPrediction,
} from "@/lib/basketball-world";
import {
  BasketballEmptyState,
  BasketballMetric,
  BasketballWorldPage,
} from "@/components/basketball/BasketballWorld";

function gameId(game?: BasketballGame | null) {
  return game?.external_game_id || game?.odds_event_id || game?.id;
}

function RangeControl({ label, detail, value, min, max, suffix, onChange }: {
  label: string;
  detail: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block rounded-2xl border border-white/[0.055] bg-white/[0.022] p-4">
      <span className="flex items-start justify-between gap-4">
        <span>
          <strong className="block text-xs font-black text-white/75">{label}</strong>
          <small className="mt-1 block text-[9px] leading-4 text-white/25">{detail}</small>
        </span>
        <span className={cn("rounded-xl px-2.5 py-1 text-xs font-black tabular-nums", value === 0 ? "bg-white/[0.04] text-white/38" : value > 0 ? "bg-orange-400/10 text-orange-100" : "bg-cyan-400/10 text-cyan-100")}>{value > 0 ? "+" : ""}{value}{suffix}</span>
      </span>
      <input type="range" min={min} max={max} step={1} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-4 w-full accent-orange-300" />
      <span className="mt-1 flex justify-between text-[8px] font-bold text-white/18"><span>{min}{suffix}</span><span>BASE</span><span>+{max}{suffix}</span></span>
    </label>
  );
}

export default function BasketballSimulator() {
  const [, setLocation] = useLocation();
  const gamesQuery = useQuery({
    queryKey: ["basketball-simulator-games"],
    queryFn: () => fetchApi("/basketball/games?limit=160"),
    staleTime: 60_000,
  });
  const games = useMemo(() => (((gamesQuery.data as any)?.games || []) as BasketballGame[]).filter((game) => !String(game.status || "").toLowerCase().includes("final")), [gamesQuery.data]);
  const [selectedKey, setSelectedKey] = useState("");
  const [pace, setPace] = useState(0);
  const [homeEfficiency, setHomeEfficiency] = useState(0);
  const [awayEfficiency, setAwayEfficiency] = useState(0);
  const [homeCourt, setHomeCourt] = useState(0);

  useEffect(() => {
    if (selectedKey || !games.length) return;
    const preferred = games.find((game) => game.prediction_summary && !game.prediction_summary.noClearEdge) || games[0];
    setSelectedKey(`${preferred.league_key || "basketball"}:${gameId(preferred)}`);
  }, [games, selectedKey]);

  const selectedGame = games.find((game) => `${game.league_key || "basketball"}:${gameId(game)}` === selectedKey) || null;
  const selectedExternalId = gameId(selectedGame);
  const predictionQuery = useQuery({
    queryKey: ["basketball-simulation-prediction", selectedGame?.league_key, selectedExternalId],
    queryFn: () => fetchApi(`/basketball/predict/${encodeURIComponent(String(selectedGame?.league_key || "basketball"))}/${encodeURIComponent(String(selectedExternalId))}`),
    enabled: !!selectedGame && selectedExternalId != null,
    staleTime: 90_000,
  });
  const prediction = (predictionQuery.data || null) as BasketballPrediction | null;

  const scenario = useMemo(() => {
    const baseHome = Number(prediction?.projection?.homePoints || 0);
    const baseAway = Number(prediction?.projection?.awayPoints || 0);
    if (!baseHome && !baseAway) return null;
    const paceFactor = 1 + (pace / 100);
    const home = Math.max(40, (baseHome * paceFactor * (1 + homeEfficiency / 100)) + (homeCourt / 2));
    const away = Math.max(40, (baseAway * paceFactor * (1 + awayEfficiency / 100)) - (homeCourt / 2));
    const margin = home - away;
    const total = home + away;
    const marginVolatility = Math.max(6, Number(prediction?.projection?.marginVolatility || prediction?.intel?.volatility || 11));
    const homeWin = clampBasketball(1 / (1 + Math.exp(-margin / Math.max(3.5, marginVolatility * 0.72))), 0.03, 0.97);
    return {
      home,
      away,
      total,
      margin,
      homeWin,
      awayWin: 1 - homeWin,
      favorite: margin >= 0 ? prediction?.game?.homeTeam : prediction?.game?.awayTeam,
      favoriteMargin: Math.abs(margin),
      baseHome,
      baseAway,
      baseTotal: Number(prediction?.projection?.total || baseHome + baseAway),
      baseMargin: baseHome - baseAway,
    };
  }, [awayEfficiency, homeCourt, homeEfficiency, pace, prediction]);

  const reset = () => {
    setPace(0);
    setHomeEfficiency(0);
    setAwayEfficiency(0);
    setHomeCourt(0);
  };

  const recommendation = prediction?.recommendation;
  const marketRead = useMemo(() => {
    if (!scenario || !recommendation || recommendation.noClearEdge) return "No priced market currently clears the engine gate. Use the scenario to understand the matchup, not to force a pick.";
    if (recommendation.market === "total" && recommendation.bookmakerLine != null) {
      const delta = scenario.total - Number(recommendation.bookmakerLine);
      return `Scenario total is ${Math.abs(delta).toFixed(1)} points ${delta >= 0 ? "above" : "below"} the ${recommendation.bookmakerLine} market line.`;
    }
    if (recommendation.market === "spread" && recommendation.bookmakerLine != null) {
      return `${scenario.favorite} is projected by ${scenario.favoriteMargin.toFixed(1)} after your changes. Compare that margin with the ${recommendation.bookmakerLine} spread.`;
    }
    return `${scenario.favorite} holds ${basketballPercent(Math.max(scenario.homeWin, scenario.awayWin))} scenario win probability after your changes.`;
  }, [recommendation, scenario]);

  return (
    <BasketballWorldPage
      eyebrow="Basketball world · interactive model"
      title="Game Lab"
      subtitle="Stress-test a basketball projection by changing pace, efficiency and home-court conditions. This is a scenario layer over the engine—not a promise that the inputs will happen."
      action={(
        <button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-xl border border-orange-200/15 bg-orange-400/8 px-4 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-orange-100"><RotateCcw className="h-3.5 w-3.5" /> Reset scenario</button>
      )}
      wide
    >
      {gamesQuery.isError ? (
        <BasketballEmptyState title="Game feed unavailable" message="The simulator could not load the basketball schedule. Refresh the page after the data feed recovers." />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[22rem_minmax(0,1fr)]">
          <aside className="space-y-3">
            <div className="rounded-2xl border border-orange-200/12 bg-orange-400/[0.035] p-4">
              <label className="text-[9px] font-black uppercase tracking-[0.18em] text-orange-100/50" htmlFor="basketball-game-select">Choose matchup</label>
              <select id="basketball-game-select" value={selectedKey} onChange={(event) => { setSelectedKey(event.target.value); reset(); }} className="mt-2 w-full rounded-xl border border-white/[0.07] bg-[#111820] px-3 py-3 text-xs font-bold text-white outline-none focus:border-orange-300/30">
                {!games.length && <option value="">Loading games…</option>}
                {games.map((game) => {
                  const key = `${game.league_key || "basketball"}:${gameId(game)}`;
                  return <option key={key} value={key}>{game.home_team} vs {game.away_team}</option>;
                })}
              </select>
            </div>

            <RangeControl label="Pace shift" detail="Changes the scoring environment for both teams." value={pace} min={-10} max={10} suffix="%" onChange={setPace} />
            <RangeControl label="Home efficiency" detail="Stress-test the home offence versus baseline." value={homeEfficiency} min={-8} max={8} suffix="%" onChange={setHomeEfficiency} />
            <RangeControl label="Away efficiency" detail="Stress-test the away offence versus baseline." value={awayEfficiency} min={-8} max={8} suffix="%" onChange={setAwayEfficiency} />
            <RangeControl label="Home-court swing" detail="Adds or removes points from the venue advantage." value={homeCourt} min={-5} max={5} suffix=" pts" onChange={setHomeCourt} />
          </aside>

          <section className="min-w-0">
            {predictionQuery.isLoading || gamesQuery.isLoading ? (
              <div className="h-[34rem] animate-pulse rounded-3xl border border-white/[0.055] bg-white/[0.025]" />
            ) : predictionQuery.isError || !prediction || !scenario ? (
              <BasketballEmptyState title="Projection unavailable" message="This matchup has not produced a usable basketball projection yet. Choose another game or run the basketball prediction job from Admin." />
            ) : (
              <div className="space-y-4">
                <article className="relative overflow-hidden rounded-[2rem] border border-orange-200/13 bg-[#0b1016]/95 p-5 sm:p-7">
                  <div className="basketball-sim-court" aria-hidden="true" />
                  <div className="relative">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-orange-100/42">Scenario scoreboard</p>
                        <h2 className="mt-1 text-lg font-black">{prediction.game?.homeTeam} <span className="text-white/20">vs</span> {prediction.game?.awayTeam}</h2>
                      </div>
                      <span className={cn("rounded-full border px-3 py-1 text-[9px] font-black tracking-wider", basketballDecision(prediction) === "BET" ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-200" : "border-amber-300/20 bg-amber-400/10 text-amber-100")}>{basketballDecision(prediction)} BASELINE</span>
                    </div>

                    <div className="mt-8 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                      <div className="text-center sm:text-left">
                        <p className="truncate text-[10px] font-black uppercase tracking-wider text-white/35">{prediction.game?.homeTeam}</p>
                        <p className="mt-2 text-5xl font-black tabular-nums text-white sm:text-7xl">{scenario.home.toFixed(0)}</p>
                        <p className="mt-2 text-[10px] text-white/24">Base {scenario.baseHome.toFixed(1)}</p>
                      </div>
                      <div className="grid h-16 w-16 place-items-center rounded-full border border-orange-200/12 bg-orange-400/[0.04] text-[9px] font-black uppercase tracking-widest text-orange-100/45">VS</div>
                      <div className="text-center sm:text-right">
                        <p className="truncate text-[10px] font-black uppercase tracking-wider text-white/35">{prediction.game?.awayTeam}</p>
                        <p className="mt-2 text-5xl font-black tabular-nums text-white sm:text-7xl">{scenario.away.toFixed(0)}</p>
                        <p className="mt-2 text-[10px] text-white/24">Base {scenario.baseAway.toFixed(1)}</p>
                      </div>
                    </div>

                    <div className="mt-8 grid gap-3 sm:grid-cols-3">
                      <BasketballMetric label="Scenario total" value={scenario.total.toFixed(1)} detail={`${scenario.total - scenario.baseTotal >= 0 ? "+" : ""}${(scenario.total - scenario.baseTotal).toFixed(1)} vs base`} />
                      <BasketballMetric label="Projected margin" value={scenario.favoriteMargin.toFixed(1)} detail={scenario.favorite || "Even"} tone="violet" />
                      <BasketballMetric label="Model volatility" value={Number(prediction.intel?.volatility || 0).toFixed(1)} detail="Basketball variance" tone="cyan" />
                    </div>
                  </div>
                </article>

                <article className="rounded-3xl border border-white/[0.06] bg-white/[0.022] p-5">
                  <div className="flex items-center gap-2"><Gauge className="h-4 w-4 text-orange-200" /><h3 className="text-sm font-black">Scenario win split</h3></div>
                  <div className="mt-5 space-y-4">
                    <div>
                      <div className="mb-2 flex justify-between text-[10px] font-bold text-white/42"><span>{prediction.game?.homeTeam}</span><strong className="text-orange-100">{basketballPercent(scenario.homeWin)}</strong></div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/[0.04]"><div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-orange-200 transition-all duration-500" style={{ width: basketballPercent(scenario.homeWin) }} /></div>
                    </div>
                    <div>
                      <div className="mb-2 flex justify-between text-[10px] font-bold text-white/42"><span>{prediction.game?.awayTeam}</span><strong className="text-violet-100">{basketballPercent(scenario.awayWin)}</strong></div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/[0.04]"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-violet-200 transition-all duration-500" style={{ width: basketballPercent(scenario.awayWin) }} /></div>
                    </div>
                  </div>
                </article>

                <article className="grid gap-4 rounded-3xl border border-violet-300/10 bg-violet-400/[0.035] p-5 sm:grid-cols-[auto_1fr_auto] sm:items-center">
                  <div className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-400/10"><Activity className="h-5 w-5 text-violet-100" /></div>
                  <div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-violet-100/45">Market impact</p><p className="mt-1 text-xs leading-5 text-white/55">{marketRead}</p></div>
                  <button type="button" onClick={() => setLocation(basketballGameHref(prediction))} className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-200 px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-[#12071b]">Full intel <ArrowRight className="h-3.5 w-3.5" /></button>
                </article>
              </div>
            )}
          </section>
        </div>
      )}

      <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-300/12 bg-amber-400/[0.035] p-4 text-xs leading-5 text-white/36">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-200/60" /> Scenario controls are hypothetical. They help you understand sensitivity to pace and efficiency; they do not change the engine record or create a guaranteed prediction.
      </div>
    </BasketballWorldPage>
  );
}
