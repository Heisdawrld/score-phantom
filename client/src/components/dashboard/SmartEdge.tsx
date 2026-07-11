import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { fetchApi } from "@/lib/api";
import { motion } from "framer-motion";
import { Crosshair, ChevronRight, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { TeamLogo } from "@/components/TeamLogo";

/**
 * SmartEdge — "Model vs Market" value detector.
 *
 * Surfaces the top 5 picks ranked by EDGE (model probability − bookmaker implied
 * probability), NOT by composite score like TopPicks. This gives users a different
 * lens: "where does the ScorePhantom model think the bookmaker is most wrong?"
 *
 * High-edge picks are the purest form of value — the model disagrees with the
 * market by the widest margin. These are often the most profitable long-term
 * bets (assuming the model is well-calibrated, which the 65% track record supports).
 *
 * Displayed as a horizontal scroll strip on the Dashboard.
 */

interface TopPick {
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  homeLogo?: string;
  awayLogo?: string;
  pick: string;
  market: string;
  probability: number;      // 0-100
  odds?: number | null;     // decimal odds (e.g., 1.72)
  ev?: number | null;       // 0-1 decimal (e.g., 0.227) or already a percentage
  tournament: string;
  time?: string | null;
  advisor_status?: string;
  valueTier?: string;
  confidence?: number;
}

function toWAT(d: string) {
  try { return new Date(d).toLocaleTimeString("en-NG", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit", hour12: false }); } catch { return ""; }
}

/**
 * Compute edge from model probability + decimal odds.
 * edge = modelProb% − (1 / odds) × 100
 * e.g., 71.4% model prob at 1.72 odds → 71.4 − 58.1 = 13.3% edge
 */
function computeEdge(probPct: number, odds?: number | null): number | null {
  if (!odds || odds <= 1 || isNaN(odds)) return null;
  const impliedPct = (1 / odds) * 100;
  const edge = probPct - impliedPct;
  return isNaN(edge) ? null : edge;
}

/** Normalize EV to a 0-100 percentage (API may return 0.227 or 22.7) */
function normalizeEV(ev?: number | null): number | null {
  if (ev == null || isNaN(ev)) return null;
  return ev > 1 ? ev : ev * 100;
}

export function SmartEdge() {
  const [, setLocation] = useLocation();

  const { data, isLoading } = useQuery({
    queryKey: ["/api/top-picks-today", "smart-edge"],
    queryFn: () => fetchApi("/top-picks-today?limit=50"),
    staleTime: 5 * 60 * 1000,
  });

  const allPicks: TopPick[] = (data as any)?.picks || [];

  // Compute edge for each pick, filter positive edge, sort by edge descending.
  // Exclude AVOID/SKIP/JUNK — those are not value picks even if edge appears high.
  const valuePicks = allPicks
    .map(p => ({ ...p, _edge: computeEdge(p.probability, p.odds) }))
    .filter(p => p.advisor_status !== "AVOID" && p.advisor_status !== "SKIP")
    .filter(p => p.valueTier !== "JUNK" && p.valueTier !== "NEGATIVE_EV")
    .filter(p => p._edge != null && p._edge > 0)
    .sort((a, b) => (b._edge || 0) - (a._edge || 0))
    .slice(0, 5);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-0.5">
          <Crosshair className="w-3.5 h-3.5 text-accent-blue" />
          <SkeletonLine />
        </div>
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="shrink-0 w-[200px] h-[110px] rounded-2xl bg-white/4 sp-shimmer" />
          ))}
        </div>
      </div>
    );
  }

  if (valuePicks.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="space-y-2.5"
    >
      {/* ── Section header ── */}
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Crosshair className="w-3.5 h-3.5 text-accent-blue" />
            <div className="absolute inset-0 bg-accent-blue/30 blur-[4px] -z-10" />
          </div>
          <h2 className="text-sm font-black text-white tracking-wide uppercase">
            Smart Edge
          </h2>
          <span className="text-2xs font-bold text-accent-blue/70 bg-accent-blue/8 px-1.5 py-0.5 rounded-md border border-accent-blue/15">
            Model vs Market
          </span>
        </div>
        <span className="text-2xs text-white/30 font-medium">
          Top {valuePicks.length} disagreements
        </span>
      </div>

      {/* ── Horizontal scroll strip ── */}
      <div className="flex gap-2.5 overflow-x-auto hide-scrollbar touch-pan-x overscroll-x-contain -mx-1 px-1 pb-1">
        {valuePicks.map((pick, idx) => {
          const modelProb = pick.probability;
          const edgePct = Math.round(pick._edge || 0);
          const impliedProb = pick.odds ? (1 / pick.odds) * 100 : null;
          const evPct = normalizeEV(pick.ev);
          const isExtreme = edgePct >= 20;
          const isStrong = edgePct >= 10;

          return (
            <motion.button
              key={pick.fixtureId}
              whileTap={{ scale: 0.97 }}
              onClick={() => setLocation("/matches/" + pick.fixtureId)}
              className={cn(
                "interactive-card shrink-0 w-[210px] text-left rounded-2xl border p-3 transition-all relative overflow-hidden",
                isExtreme
                  ? "border-accent-blue/30 bg-accent-blue/[0.06]"
                  : isStrong
                  ? "border-accent-blue/20 bg-accent-blue/[0.04]"
                  : "border-white/8 bg-white/[0.025]"
              )}
            >
              {/* Rank badge */}
              <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-white/5 flex items-center justify-center">
                <span className="text-2xs font-black text-white/40">{idx + 1}</span>
              </div>

              {/* Match name + logos */}
              <div className="flex items-center gap-1.5 mb-2 min-w-0 pr-5">
                <TeamLogo src={pick.homeLogo} name={pick.homeTeam} size="xs" />
                <span className="text-2xs font-bold text-white/80 truncate">{pick.homeTeam}</span>
                <span className="text-2xs text-white/30 shrink-0">vs</span>
                <TeamLogo src={pick.awayLogo} name={pick.awayTeam} size="xs" />
                <span className="text-2xs font-bold text-white/80 truncate">{pick.awayTeam}</span>
              </div>

              {/* Pick + market */}
              <div className="mb-2.5">
                <p className="text-xs font-black text-white leading-tight truncate">{pick.pick}</p>
                <p className="text-2xs text-white/35 truncate">{pick.tournament}{pick.time ? ` · ${pick.time}` : ""}</p>
              </div>

              {/* ── Disagreement bar: model vs market ── */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-2xs">
                  <span className="text-white/40">Model</span>
                  <span className="font-bold text-accent-blue tabular-nums">{modelProb}%</span>
                </div>
                <div className="relative h-1.5 rounded-full bg-white/6 overflow-hidden">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-accent-blue/80" style={{ width: `${modelProb}%` }} />
                  {impliedProb != null && (
                    <div className="absolute top-0 bottom-0 w-0.5 bg-white/50" style={{ left: `${Math.min(100, impliedProb)}%` }} title="Bookmaker implied" />
                  )}
                </div>
                <div className="flex items-center justify-between text-2xs">
                  <span className="text-white/30">Bookmaker</span>
                  <span className="font-medium text-white/40 tabular-nums">{impliedProb != null ? `${Math.round(impliedProb)}%` : "—"}</span>
                </div>
              </div>

              {/* ── Edge + EV footer ── */}
              <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 text-accent-blue" />
                  <span className="text-2xs font-bold text-white/50">Edge</span>
                </div>
                <div className="flex items-center gap-2">
                  {evPct != null && (
                    <span className="text-2xs font-bold text-primary tabular-nums">EV +{Math.round(evPct)}%</span>
                  )}
                  <span className={cn(
                    "text-xs font-black tabular-nums px-1.5 py-0.5 rounded-md",
                    isExtreme ? "text-accent-blue bg-accent-blue/15" : "text-white/70 bg-white/8"
                  )}>
                    +{edgePct}%
                  </span>
                </div>
              </div>
            </motion.button>
          );
        })}

        {/* ── "View all" trailing card ── */}
        <button
          onClick={() => setLocation("/picks")}
          className="interactive-card shrink-0 w-[100px] rounded-2xl border border-white/6 bg-white/[0.02] flex flex-col items-center justify-center gap-1.5 text-white/40 hover:text-white/70 transition-all"
        >
          <ChevronRight className="w-4 h-4" />
          <span className="text-2xs font-bold">All Picks</span>
        </button>
      </div>
    </motion.div>
  );
}

function SkeletonLine() {
  return <div className="h-3.5 w-24 rounded bg-white/8 sp-shimmer" />;
}
