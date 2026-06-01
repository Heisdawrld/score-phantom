import { useEffect, lazy, Suspense, useMemo, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/api";
import { useAccess } from "@/hooks/use-access";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  BarChart2,
  Clock3,
  Info,
  Lock,
  Map,
  MessageCircle,
  Radio,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfidenceRing } from "@/components/ui/ConfidenceRing";
import { normalizeStatus } from "@/components/ui/ModelAdvisorBadge";
import { TeamLogo } from "@/components/TeamLogo";

const PredictionTab = lazy(() => import("@/components/match/PredictionTab").then(m => ({ default: m.PredictionTab })));
const StatsTab = lazy(() => import("@/components/match/StatsTab").then(m => ({ default: m.StatsTab })));
const LeagueTab = lazy(() => import("@/components/match/LeagueTab").then(m => ({ default: m.LeagueTab })));
const PitchTab = lazy(() => import("@/components/match/PitchTab").then(m => ({ default: m.PitchTab })));
const LineupsTab = lazy(() => import("@/components/match/LineupsTab").then(m => ({ default: m.LineupsTab })));
const PhantomChatTab = lazy(() => import("@/components/match/PhantomChatTab").then(m => ({ default: m.PhantomChatTab })));

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (v >= 11 && v <= 13 ? s[0] : s[v % 10] || s[0]);
}

function certaintyTone(label?: string | null) {
  if (label === "confirmed") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-300";
  if (label === "predicted") return "border-amber-400/20 bg-amber-400/10 text-amber-300";
  return "border-white/[0.08] bg-white/[0.03] text-white/45";
}

function advisorTone(statusRaw?: string | null) {
  const status = normalizeStatus(statusRaw || "ACCA");
  if (status === "BET") {
    return {
      label: "Single-ready",
      chip: "BET",
      className: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
    };
  }
  if (status === "SKIP") {
    return {
      label: "Pass",
      chip: "SKIP",
      className: "border-red-500/20 bg-red-500/10 text-red-300",
    };
  }
  return {
    label: "Accumulator",
    chip: "ACCA",
    className: "border-cyan-400/20 bg-cyan-400/10 text-cyan-300",
  };
}

const TABS = [
  { key: "Prediction", label: "Model", Icon: Target },
  { key: "Stats", label: "Stats", Icon: BarChart2 },
  { key: "Pitch", label: "Pitch", Icon: Map },
  { key: "Lineups", label: "Lineups", Icon: Users },
  { key: "League", label: "League", Icon: Trophy },
  { key: "PhantomChat", label: "Chat", Icon: MessageCircle },
];

export default function MatchCenter() {
  const params = useParams();
  const fixtureId = params?.id;
  const [, setLocation] = useLocation();
  const { isPremium, isLoading: authLoading } = useAccess();
  const [tab, setTab] = useState("Prediction");

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/matches", fixtureId],
    queryFn: () => fetchApi("/matches/" + fixtureId),
    staleTime: 30 * 1000,
    refetchInterval: (query) => {
      const d = query?.state?.data as any;
      const status = String(d?.fixture?.match_status || "").toUpperCase();
      return ["LIVE", "HT", "1H", "2H", "ET", "PEN"].includes(status) ? 30000 : false;
    },
    enabled: !!fixtureId,
  });

  const { data: predictionData, isLoading: predictionLoading } = useQuery({
    queryKey: ["/api/predict", fixtureId],
    queryFn: () => fetchApi("/predict/" + fixtureId),
    enabled: !!fixtureId && !!isPremium && !authLoading,
    staleTime: 5 * 60 * 1000,
  });

  const d = data as any;
  const fix = d?.fixture || {};
  const statusUpper = String(fix.match_status || "").toUpperCase();
  const isLive = ["LIVE", "HT", "1H", "2H", "ET", "PEN"].includes(statusUpper);
  const isFT = ["FT", "AET", "PEN_FT", "PENS"].includes(statusUpper) || (statusUpper === "PEN" && String(fix.match_status || "") === "Pen");
  const kickOffTime = fix.match_date
    ? new Date(fix.match_date).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : "";
  const kickOffDate = fix.match_date
    ? new Date(fix.match_date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    : "";

  const { homePos, awayPos } = useMemo(() => {
    const standings = Array.isArray(d?.standings)
      ? d.standings
      : Array.isArray(d?.meta?.standings)
        ? d.meta.standings
        : [];

    const home = standings.find((row: any) =>
      (row.team || "").toLowerCase().includes((fix.home_team_name || "").toLowerCase().split(" ")[0])
    );
    const away = standings.find((row: any) =>
      (row.team || "").toLowerCase().includes((fix.away_team_name || "").toLowerCase().split(" ")[0])
    );

    return { homePos: home, awayPos: away };
  }, [d?.standings, d?.meta?.standings, fix.home_team_name, fix.away_team_name]);

  const recommendation = (predictionData as any)?.predictions?.recommendation || null;
  const verdict = recommendation?.verdict || null;
  const lineupIntel = recommendation?.lineupIntelligence || d?.meta?.lineupIntelligence || null;
  const confidencePct = recommendation?.probability_pct ?? Math.round((recommendation?.probability || 0) * 100);
  const advisorMeta = advisorTone(recommendation?.advisor_status);
  const verdictHeadline = verdict?.headline || verdict?.thesis || recommendation?.analystSummary || null;
  const cautionLine = Array.isArray(verdict?.cautions) ? verdict.cautions[0] : null;
  const supportLine = Array.isArray(verdict?.support) ? verdict.support[0] : null;
  const liveXgHome = d?.meta?.matchStats?.home_xg_live;
  const liveXgAway = d?.meta?.matchStats?.away_xg_live;

  return (
    <div className="min-h-screen bg-[#060a0e] pb-24 text-white selection:bg-primary/30">
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(circle_at_top,rgba(16,231,116,0.12),transparent_58%)]" />
        <div className="absolute left-0 top-[20%] h-72 w-72 rounded-full bg-primary/6 blur-[140px]" />
        <div className="absolute right-0 top-[10%] h-72 w-72 rounded-full bg-cyan-400/6 blur-[160px]" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-6xl px-4 pt-5">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3.5 py-2 text-xs font-bold text-white/65 transition hover:border-white/[0.14] hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>

          <button
            onClick={() => setLocation("/matches")}
            className="inline-flex items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03] p-2.5 text-white/45 transition hover:border-white/[0.14] hover:text-white"
            aria-label="Close match center"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 overflow-hidden rounded-[32px] border border-white/[0.08] bg-[linear-gradient(155deg,rgba(255,255,255,0.035),rgba(255,255,255,0.015))] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.28)] sm:p-6">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/42">
            <span className={cn("rounded-full border px-2.5 py-1", isLive ? "border-red-500/20 bg-red-500/10 text-red-300" : isFT ? "border-white/[0.08] bg-white/[0.04] text-white/55" : "border-primary/15 bg-primary/10 text-primary") }>
              {isLive ? `Live${fix.live_minute ? ` · ${fix.live_minute}'` : ""}` : isFT ? "Full time" : kickOffDate || "Match day"}
            </span>
            {fix.tournament_name && (
              <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-white/42">
                {fix.tournament_id && (
                  <img
                    src={`https://sports.bzzoiro.com/img/league/${fix.tournament_id}/`}
                    className="h-3.5 w-3.5 rounded-sm object-contain"
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    alt={fix.tournament_name || ""}
                  />
                )}
                {fix.tournament_name}
              </span>
            )}
            {kickOffTime && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-white/42">
                <Clock3 className="h-3 w-3" /> {kickOffTime}
              </span>
            )}
            {lineupIntel?.certaintyLabel && (
              <span className={cn("rounded-full border px-2.5 py-1", certaintyTone(lineupIntel.certaintyLabel))}>
                {lineupIntel.certaintyLabel} lineups
              </span>
            )}
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_360px]">
            <div className="rounded-[28px] border border-white/[0.06] bg-black/20 p-4 sm:p-5">
              <div className="grid items-center gap-5 md:grid-cols-[1fr_auto_1fr]">
                <div className="text-center md:text-left">
                  <div className="flex justify-center md:justify-start">
                    <TeamLogo src={fix.home_team_logo} name={fix.home_team_name || "Home"} size="xl" />
                  </div>
                  <p className="mt-3 text-xl font-black leading-tight text-white sm:text-2xl">{fix.home_team_name || "Home"}</p>
                  {homePos ? (
                    <p className="mt-1 text-xs text-white/42">{ordinal(homePos.position)} in the table · {homePos.points} pts</p>
                  ) : (
                    <p className="mt-1 text-xs text-white/32">Home side</p>
                  )}
                </div>

                <div className="text-center">
                  {(isLive || isFT) ? (
                    <>
                      <p className="text-4xl font-black tabular-nums text-white sm:text-5xl">{fix.home_score ?? 0} <span className="text-white/35">–</span> {fix.away_score ?? 0}</p>
                      <div className="mt-3 flex flex-col items-center gap-2">
                        <span className={cn(
                          "rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em]",
                          isLive ? "border-red-500/20 bg-red-500/10 text-red-300" : "border-white/[0.08] bg-white/[0.03] text-white/45"
                        )}>
                          {isLive ? `Live${fix.live_minute ? ` · ${fix.live_minute}'` : ""}` : "Finished"}
                        </span>
                        {isLive && liveXgHome != null && (
                          <p className="text-[11px] text-white/45">Live xG · {Number(liveXgHome).toFixed(2)} - {Number(liveXgAway ?? 0).toFixed(2)}</p>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/35">Kickoff</p>
                      <p className="mt-2 text-3xl font-black text-white sm:text-4xl">{kickOffTime || "Soon"}</p>
                      <p className="mt-2 text-xs text-white/38">{kickOffDate || "Match day"}</p>
                    </>
                  )}
                </div>

                <div className="text-center md:text-right">
                  <div className="flex justify-center md:justify-end">
                    <TeamLogo src={fix.away_team_logo} name={fix.away_team_name || "Away"} size="xl" />
                  </div>
                  <p className="mt-3 text-xl font-black leading-tight text-white sm:text-2xl">{fix.away_team_name || "Away"}</p>
                  {awayPos ? (
                    <p className="mt-1 text-xs text-white/42">{ordinal(awayPos.position)} in the table · {awayPos.points} pts</p>
                  ) : (
                    <p className="mt-1 text-xs text-white/32">Away side</p>
                  )}
                </div>
              </div>

              {(supportLine || cautionLine) && (
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {supportLine && (
                    <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.06] px-4 py-3">
                      <div className="flex items-start gap-2">
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-200/72">Core support</p>
                          <p className="mt-1 text-sm leading-relaxed text-emerald-100/78">{supportLine}</p>
                        </div>
                      </div>
                    </div>
                  )}
                  {cautionLine && (
                    <div className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.06] px-4 py-3">
                      <div className="flex items-start gap-2">
                        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200/72">Watchout</p>
                          <p className="mt-1 text-sm leading-relaxed text-amber-100/78">{cautionLine}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-[28px] border border-white/[0.06] bg-[linear-gradient(155deg,rgba(16,231,116,0.08),rgba(255,255,255,0.02))] p-4 sm:p-5">
              {isPremium ? (
                predictionLoading ? (
                  <div className="flex min-h-[240px] items-center justify-center">
                    <div className="h-10 w-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                  </div>
                ) : recommendation ? (
                  <div className="flex h-full flex-col">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary/70">Phantom read</p>
                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                          <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]", advisorMeta.className)}>{advisorMeta.chip}</span>
                          {verdict?.marketFamilyLabel && (
                            <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">
                              {verdict.marketFamilyLabel}
                            </span>
                          )}
                        </div>
                      </div>
                      <ConfidenceRing value={confidencePct || 0} size={76} strokeWidth={4} showLabel label="Model" />
                    </div>

                    <div className="mt-5 rounded-[24px] border border-white/[0.06] bg-black/20 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/35">Verdict</p>
                      <p className="mt-2 text-[28px] font-black leading-tight text-white">{recommendation.pick || "No clear angle"}</p>
                      {verdictHeadline && <p className="mt-3 text-sm leading-relaxed text-white/68">{verdictHeadline}</p>}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/48">
                        {advisorMeta.label}
                      </span>
                      {lineupIntel?.certaintyLabel && (
                        <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em]", certaintyTone(lineupIntel.certaintyLabel))}>
                          {lineupIntel.certaintyLabel} lineups
                        </span>
                      )}
                    </div>

                    {cautionLine && (
                      <div className="mt-4 rounded-2xl border border-amber-400/15 bg-amber-400/[0.05] px-4 py-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200/75">Caution</p>
                        <p className="mt-1 text-sm leading-relaxed text-amber-100/76">{cautionLine}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex h-full min-h-[240px] flex-col justify-between rounded-[24px] border border-white/[0.06] bg-black/20 p-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/35">Phantom read</p>
                      <p className="mt-3 text-2xl font-black text-white">Model still settling</p>
                      <p className="mt-2 text-sm leading-relaxed text-white/58">We could not resolve a premium verdict for this fixture yet. Open the tabs below for live stats, lineups, and context while the board updates.</p>
                    </div>
                    <div className="mt-4 flex items-center gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-sm text-white/52">
                      <Sparkles className="h-4 w-4 text-primary" /> Match Center still shows every non-premium signal in context.
                    </div>
                  </div>
                )
              ) : (
                <div className="flex h-full min-h-[240px] flex-col justify-between rounded-[24px] border border-white/[0.06] bg-black/20 p-4">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
                      <Lock className="h-3.5 w-3.5" /> Premium verdict
                    </div>
                    <p className="mt-4 text-2xl font-black text-white">Unlock the model thesis</p>
                    <p className="mt-2 text-sm leading-relaxed text-white/58">See the exact market angle, confidence, and trust notes that drive the pick on this match.</p>
                  </div>
                  <button
                    onClick={() => setLocation("/paywall")}
                    className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-black text-black transition hover:brightness-110"
                  >
                    Upgrade to Premium
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-bold transition",
                tab === key
                  ? "border-primary/18 bg-primary/10 text-primary"
                  : "border-white/[0.08] bg-white/[0.03] text-white/42 hover:border-white/[0.14] hover:text-white/78"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {isLoading && (
          <div className="flex justify-center py-20">
            <div className="h-10 w-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
          </div>
        )}

        {!isLoading && (
          <div className="relative z-10 mt-5">
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <Suspense fallback={<div className="flex justify-center py-20"><div className="h-10 w-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" /></div>}>
                  {tab === "Prediction" && (
                    <>
                      {isFT && (
                        <div className="mb-4 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-3 flex items-start gap-2">
                          <Info className="w-4 h-4 text-amber-300 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-[11px] font-black text-amber-200 uppercase tracking-[0.14em]">Match completed</p>
                            <p className="text-[11px] text-amber-100/60 leading-snug mt-1">Prediction is shown for review only. This is not an active pick.</p>
                          </div>
                        </div>
                      )}
                      <PredictionTab fixtureId={fixtureId} isPremium={isPremium} setLocation={setLocation} matchData={d} predictionData={predictionData} />
                    </>
                  )}
                  {tab === "Stats" && <StatsTab d={d} />}
                  {tab === "Pitch" && <PitchTab matchData={d} />}
                  {tab === "Lineups" && <LineupsTab matchData={d} fixtureId={fixtureId} />}
                  {tab === "League" && <LeagueTab d={d} />}
                  {tab === "PhantomChat" && <PhantomChatTab fixtureId={fixtureId} isPremium={isPremium} setLocation={setLocation} />}
                </Suspense>
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </div>

      {isLive && (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-20 -translate-x-1/2">
          <div className="inline-flex items-center gap-2 rounded-full border border-red-500/18 bg-[#0b1116]/90 px-3 py-2 shadow-[0_14px_34px_rgba(0,0,0,0.35)] backdrop-blur-xl">
            <Radio className="h-4 w-4 text-red-400" />
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-red-300">Live match center</span>
          </div>
        </div>
      )}
    </div>
  );
}
