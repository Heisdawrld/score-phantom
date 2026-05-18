import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/api";
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  BarChart2,
  DollarSign,
  Lock,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { cn, getOddsForPick } from "@/lib/utils";
import { ConfidenceRing } from "@/components/ui/ConfidenceRing";
import { ConfidenceBadge, getConfidenceTier } from "@/components/ui/ConfidenceBadge";
import { normalizeStatus } from "@/components/ui/ModelAdvisorBadge";

type Tone = "default" | "primary" | "amber";

type SectionProps = {
  eyebrow: string;
  title: string;
  icon: LucideIcon;
  description?: string | null;
  tone?: Tone;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
};

const RISK_LABELS: Record<string, string> = {
  SAFE: "Stable",
  MODERATE: "Calculated",
  AGGRESSIVE: "High variance",
};

const VALUE_TIER_CONFIG: Record<string, { label: string; className: string }> = {
  STRONG: { label: "Strong", className: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" },
  VALUE: { label: "Value", className: "border-blue-400/20 bg-blue-400/10 text-blue-300" },
  SHARP: { label: "Sharp", className: "border-purple-400/20 bg-purple-400/10 text-purple-300" },
  ACCUMULATOR: { label: "ACCA", className: "border-cyan-400/20 bg-cyan-400/10 text-cyan-300" },
  MARGINAL: { label: "Marginal", className: "border-white/[0.08] bg-white/[0.03] text-white/45" },
  JUNK: { label: "Junk", className: "border-red-500/20 bg-red-500/10 text-red-300" },
  NEGATIVE_EV: { label: "-EV", className: "border-red-500/20 bg-red-500/10 text-red-300" },
  UNPRICED: { label: "Unpriced", className: "border-white/[0.08] bg-white/[0.03] text-white/45" },
};

function advisorMeta(statusRaw?: string | null) {
  const status = normalizeStatus(statusRaw || "ACCA");
  if (status === "BET") {
    return {
      chip: "BET",
      label: "Single-ready",
      className: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
    };
  }
  if (status === "SKIP") {
    return {
      chip: "SKIP",
      label: "Pass",
      className: "border-red-500/20 bg-red-500/10 text-red-300",
    };
  }
  return {
    chip: "ACCA",
    label: "Accumulator",
    className: "border-cyan-400/20 bg-cyan-400/10 text-cyan-300",
  };
}

function certaintyTone(label?: string | null) {
  if (label === "confirmed") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-300";
  if (label === "predicted") return "border-amber-400/20 bg-amber-400/10 text-amber-300";
  return "border-white/[0.08] bg-white/[0.03] text-white/45";
}

function sectionTone(tone: Tone = "default") {
  if (tone === "primary") {
    return "border-primary/16 bg-[linear-gradient(155deg,rgba(16,231,116,0.1),rgba(255,255,255,0.02))]";
  }
  if (tone === "amber") {
    return "border-amber-400/18 bg-[linear-gradient(155deg,rgba(245,158,11,0.08),rgba(255,255,255,0.02))]";
  }
  return "border-white/[0.08] bg-white/[0.025]";
}

function formatPct(value: number | null | undefined, decimals = 0) {
  if (value == null || Number.isNaN(Number(value))) return null;
  return `${Number(value).toFixed(decimals)}%`;
}

function formatOdds(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return null;
  return Number(value).toFixed(2);
}

function uniqueStrings(items: any[]) {
  return Array.from(new Set((items || []).filter(Boolean).map((item) => String(item))));
}

function Section({ eyebrow, title, icon: Icon, description, tone = "default", aside, children, className }: SectionProps) {
  return (
    <div className={cn("rounded-[28px] border p-4 shadow-[0_18px_40px_rgba(0,0,0,0.18)] sm:p-5", sectionTone(tone), className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
            <Icon className="h-3.5 w-3.5 text-primary" />
            {eyebrow}
          </div>
          <h3 className="mt-3 text-xl font-black text-white">{title}</h3>
          {description && <p className="mt-1 text-sm leading-relaxed text-white/55">{description}</p>}
        </div>
        {aside}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function MetricTile({ label, value, note, accent = "default" }: { label: string; value: string; note?: string | null; accent?: "default" | "primary" | "amber" | "red"; }) {
  const tone = {
    default: "border-white/[0.08] bg-black/20 text-white",
    primary: "border-primary/16 bg-primary/10 text-primary",
    amber: "border-amber-400/18 bg-amber-400/10 text-amber-300",
    red: "border-red-500/18 bg-red-500/10 text-red-300",
  }[accent];

  return (
    <div className={cn("rounded-2xl border px-3.5 py-3", tone)}>
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">{label}</p>
      <p className="mt-2 text-2xl font-black leading-none">{value}</p>
      {note && <p className="mt-1.5 text-xs leading-relaxed text-white/52">{note}</p>}
    </div>
  );
}

export function PredictionTab({ fixtureId, isPremium, setLocation, matchData, predictionData }: any) {
  const shouldFetch = !!fixtureId && !!isPremium && !predictionData;
  const { data: fetchedData, isLoading, error } = useQuery({
    queryKey: ["/api/predict", fixtureId],
    queryFn: () => fetchApi("/predict/" + fixtureId),
    enabled: shouldFetch,
    staleTime: 5 * 60 * 1000,
  });
  const data = predictionData || fetchedData;

  if (!isPremium) {
    return (
      <div className="rounded-[28px] border border-white/[0.08] bg-[linear-gradient(155deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.2)]">
        <div className="rounded-[24px] border border-white/[0.08] bg-black/20 p-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
            <Lock className="h-3.5 w-3.5" /> Premium verdict
          </div>
          <h3 className="mt-4 text-2xl font-black text-white">Unlock the thesis, not just the pick</h3>
          <p className="mt-2 text-sm leading-relaxed text-white/58">
            See the exact market angle, confidence, ranked ladder, and trust notes that explain why the model likes — or skips — this match.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <MetricTile label="Verdict" value="Locked" note="Single, acca, or pass" />
            <MetricTile label="Trust" value="Lineups" note="Confirmation and absences" />
            <MetricTile label="Board" value="Ladder" note="Ranked market options" />
          </div>

          <button
            onClick={() => setLocation("/paywall")}
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-black text-black transition hover:brightness-110"
          >
            Upgrade to Premium
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-10 w-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    const errorMsg = error instanceof Error ? error.message : "Prediction not available";
    return (
      <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.025] p-6 text-center shadow-[0_18px_40px_rgba(0,0,0,0.2)]">
        <p className="text-4xl">🔮</p>
        <p className="mt-3 text-sm font-medium text-white/58">{errorMsg}</p>
        {errorMsg.toLowerCase().includes("trial") && (
          <button
            onClick={() => setLocation("/paywall")}
            className="mt-6 rounded-2xl border border-primary/20 bg-primary/10 px-5 py-2.5 text-sm font-bold text-primary transition hover:bg-primary/15"
          >
            Get premium access
          </button>
        )}
      </div>
    );
  }

  const rec = (data as any)?.predictions?.recommendation || {};
  const backups = Array.isArray((data as any)?.predictions?.backup_picks) ? (data as any).predictions.backup_picks : [];
  const oddsData = (data as any)?.odds ?? null;
  const matchResult = (data as any)?.predictions?.match_result;
  const model = (data as any)?.model;
  const gameScript = (data as any)?.gameScript;
  const narrative = (data as any)?.narrative || null;
  const verdict = rec.verdict || null;
  const marketLadder = Array.isArray((data as any)?.predictions?.market_ladder) ? (data as any).predictions.market_ladder : [];
  const lineupIntel = rec.lineupIntelligence || (data as any)?.features?.lineupIntelligence || null;
  const homeTeam = matchData?.fixture?.home_team_name || (data as any)?.fixture?.homeTeam || "Home";
  const awayTeam = matchData?.fixture?.away_team_name || (data as any)?.fixture?.awayTeam || "Away";
  const displayConfidence = rec.probability_pct ?? Math.round((rec.probability || 0) * 100);
  const confidenceTier = getConfidenceTier(displayConfidence);
  const oddsPick = getOddsForPick(oddsData, rec.pick || "", rec.market || "");
  const odds = oddsPick?.value ?? null;
  const impliedPct = odds ? Math.round((1 / Number(odds)) * 100) : rec.impliedProb != null ? Math.round(rec.impliedProb * 100) : null;
  const edgePct = impliedPct != null ? displayConfidence - impliedPct : null;
  const hasValue = edgePct != null && edgePct > 2;
  const advisorStatusRaw = rec.advisor_status || "ACCA";
  const normalizedStatus = normalizeStatus(advisorStatusRaw);
  const isAvoidedPick = rec.isAvoidedPick === true;
  const isNoPick = rec.no_edge === true || isAvoidedPick || normalizedStatus === "SKIP";
  const riskLabel = (rec.riskLevel || "MODERATE").toUpperCase();
  const betLink = oddsData?.betLinkSportybet || null;
  const valueTier = rec.valueTier || null;
  const valueMeta = valueTier ? VALUE_TIER_CONFIG[valueTier] || VALUE_TIER_CONFIG.MARGINAL : null;
  const ev = rec.ev != null ? rec.ev : null;
  const engineOdds = rec.odds || null;
  const isSharpValue = rec.isSharpValue === true;
  const isAccaEligible = rec.isAccaEligible === true;
  const tacticalMatchup = (data as any)?.features?.tacticalMatchup || rec?.tacticalMatchup || null;
  const homeManager = (data as any)?.features?.homeManager || null;
  const awayManager = (data as any)?.features?.awayManager || null;
  const sharp1x2 = (data as any)?.features?.polymarketOdds?.odds?.["1x2"] || null;
  const hasSharpMoney1x2 = !!sharp1x2 && ["home", "draw", "away"].some((key) => {
    const value = sharp1x2?.[key];
    return typeof value === "number" && Number.isFinite(value) && value > 0;
  });
  const priceLabel = formatOdds(odds ?? engineOdds);
  const verdictHeadline = verdict?.headline || verdict?.thesis || rec.analystSummary || rec.reasonCodes?.[0] || rec.reasons?.[0] || null;
  const supportLines = uniqueStrings(verdict?.support || []);
  const cautionLines = uniqueStrings(verdict?.cautions || []);
  const reasonLines = uniqueStrings([...(rec.reasons || rec.reasonCodes || rec.reason_codes || []), ...(narrative?.narrativeReasons || [])]).filter(
    (line) => !supportLines.includes(line) && !cautionLines.includes(line)
  );
  const metaStatus = advisorMeta(advisorStatusRaw);
  const consistencyLabel = RISK_LABELS[riskLabel] || riskLabel;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_320px]">
      <div className="space-y-4">
        <Section
          eyebrow="Phantom verdict"
          title={isNoPick ? "No active bet on this board" : (rec.pick || "No clear pick")}
          description={verdictHeadline}
          icon={Target}
          tone={isNoPick ? "amber" : "primary"}
          aside={<ConfidenceRing value={displayConfidence || 0} size={88} strokeWidth={4.5} showLabel label="Model" />}
        >
          <div className="flex flex-wrap gap-2">
            <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]", metaStatus.className)}>{metaStatus.chip}</span>
            <ConfidenceBadge value={displayConfidence || 0} />
            {valueMeta && valueTier !== "MARGINAL" && valueTier !== "UNPRICED" && (
              <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em]", valueMeta.className)}>{valueMeta.label}</span>
            )}
            {verdict?.marketFamilyLabel && (
              <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/48">{verdict.marketFamilyLabel}</span>
            )}
            {lineupIntel?.certaintyLabel && (
              <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em]", certaintyTone(lineupIntel.certaintyLabel))}>{lineupIntel.certaintyLabel} lineups</span>
            )}
            {isSharpValue && (
              <span className="rounded-full border border-[#E5F522]/30 bg-[#E5F522]/12 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#E5F522]">Market gap</span>
            )}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricTile label="Model probability" value={formatPct(displayConfidence, 0) || "—"} note={`${confidenceTier.label} confidence`} accent="primary" />
            <MetricTile label="Book price" value={priceLabel || "Model only"} note={priceLabel ? "Best available read" : "No live bookmaker quote"} />
            <MetricTile label="Edge" value={edgePct != null ? `${edgePct >= 0 ? "+" : ""}${edgePct.toFixed(1)}pp` : "No board"} note={hasValue ? "Model above the market" : "No clean value gap"} accent={hasValue ? "primary" : "default"} />
            <MetricTile label="Risk profile" value={consistencyLabel} note={metaStatus.label} accent={normalizedStatus === "SKIP" ? "amber" : "default"} />
          </div>

          {isNoPick ? (
            <div className="mt-4 rounded-2xl border border-amber-400/18 bg-amber-400/[0.07] p-4">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                <div>
                  <p className="text-sm font-semibold text-amber-100">Skip this match for now</p>
                  <p className="mt-1 text-sm leading-relaxed text-amber-100/75">
                    {rec.avoidReason || cautionLines[0] || reasonLines[0] || "The model does not see enough value or clarity to justify a bet here."}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              {Array.isArray(supportLines) && supportLines.length > 0 && (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {supportLines.slice(0, 2).map((item, index) => (
                    <div key={`${item}-${index}`} className="rounded-2xl border border-emerald-400/14 bg-emerald-400/[0.06] px-4 py-3">
                      <div className="flex items-start gap-2.5">
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                        <p className="text-sm leading-relaxed text-emerald-100/78">{item}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {cautionLines[0] && (
                <div className="mt-4 rounded-2xl border border-amber-400/16 bg-amber-400/[0.05] px-4 py-3">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                    <p className="text-sm leading-relaxed text-amber-100/75">{cautionLines[0]}</p>
                  </div>
                </div>
              )}
            </>
          )}
        </Section>

        {(supportLines.length > 0 || cautionLines.length > 0 || reasonLines.length > 0) && (
          <Section
            eyebrow="Why it rates"
            title="Evidence behind the angle"
            description="The support case is separated from the watchouts so the thesis stays clear instead of noisy."
            icon={ShieldCheck}
          >
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_0.9fr]">
              <div className="rounded-[24px] border border-white/[0.06] bg-black/20 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Support</p>
                <div className="mt-3 space-y-3">
                  {supportLines.length > 0 ? supportLines.slice(0, 4).map((item, index) => (
                    <div key={`${item}-${index}`} className="flex items-start gap-2.5">
                      <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      <p className="text-sm leading-relaxed text-white/68">{item}</p>
                    </div>
                  )) : (
                    <p className="text-sm leading-relaxed text-white/52">No explicit support notes were attached to this call.</p>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-[24px] border border-amber-400/14 bg-amber-400/[0.05] p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200/70">Watchouts</p>
                  <div className="mt-3 space-y-3">
                    {cautionLines.length > 0 ? cautionLines.slice(0, 3).map((item, index) => (
                      <div key={`${item}-${index}`} className="flex items-start gap-2.5">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                        <p className="text-sm leading-relaxed text-amber-100/75">{item}</p>
                      </div>
                    )) : (
                      <p className="text-sm leading-relaxed text-amber-100/65">No explicit caution flag was attached to this market.</p>
                    )}
                  </div>
                </div>

                {reasonLines.length > 0 && (
                  <div className="rounded-[24px] border border-white/[0.06] bg-black/20 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Extra signals</p>
                    <div className="mt-3 space-y-2.5">
                      {reasonLines.slice(0, 4).map((line, index) => (
                        <div key={`${line}-${index}`} className="flex items-start gap-2.5">
                          <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white/30" />
                          <p className="text-sm leading-relaxed text-white/58">{line}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Section>
        )}

        {marketLadder.length > 0 && !isNoPick && (
          <Section
            eyebrow="Board view"
            title="Ranked market ladder"
            description={verdict?.ladderSummary || "The top of the board is ranked by model probability, fit, and value context."}
            icon={BarChart2}
          >
            <div className="space-y-3">
              {marketLadder.slice(0, 5).map((entry: any) => {
                const ladderStatus = advisorMeta(entry.advisor_status || advisorStatusRaw);
                return (
                  <div
                    key={`${entry.marketKey || entry.pick}-${entry.rank}`}
                    className={cn(
                      "rounded-[24px] border p-4",
                      entry.isPrimary ? "border-primary/16 bg-primary/[0.07]" : "border-white/[0.06] bg-black/20"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn(
                            "inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-black",
                            entry.isPrimary ? "bg-primary text-black" : "bg-white/[0.06] text-white/55"
                          )}>
                            {entry.rank}
                          </span>
                          <p className="text-base font-black text-white">{entry.pick}</p>
                          <span className={cn("rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em]", ladderStatus.className)}>{ladderStatus.chip}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/42">
                          {entry.marketFamilyLabel && <span>{entry.marketFamilyLabel}</span>}
                          {entry.rationaleTag && <span className="text-primary/85">• {entry.rationaleTag}</span>}
                          {entry.cautionTag && <span className="text-amber-300/75">• {entry.cautionTag}</span>}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="text-lg font-black text-white">{formatPct(entry.probability_pct, 0) || "—"}</p>
                        <p className="text-[11px] text-white/35">{entry.odds ? `${Number(entry.odds).toFixed(2)} odds` : "model only"}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {backups.length > 0 && !isNoPick && (
          <Section
            eyebrow="Secondary angles"
            title="Other liveable options"
            description="These sit behind the primary pick on the ladder, but they are still viable if you want an alternate route."
            icon={Sparkles}
          >
            <div className="space-y-3">
              {backups.slice(0, 3).map((pick: any, index: number) => {
                const backupConf = pick.probability_pct ?? Math.round((pick.probability || 0) * 100);
                const tier = getConfidenceTier(backupConf);
                return (
                  <div key={`${pick.pick || pick.market}-${index}`} className="flex items-center justify-between gap-3 rounded-[24px] border border-white/[0.06] bg-black/20 px-4 py-3.5">
                    <div className="min-w-0">
                      <p className="text-base font-bold text-white">{pick.pick || pick.market}</p>
                      <p className="mt-1 text-[11px] text-white/40">{(pick.marketLabel || pick.market || "").replace(/_/g, " ")}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-lg font-black text-white">{formatPct(backupConf, 0)}</p>
                      <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em]", tier.cls)}>{tier.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        )}
      </div>

      <div className="space-y-4">
        {lineupIntel && (
          <Section
            eyebrow="Trust input"
            title="Lineup intelligence"
            description={lineupIntel.note || "Lineup clarity changes how much conviction the model can responsibly take."}
            icon={ShieldCheck}
          >
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                {[{ team: homeTeam, side: lineupIntel.home }, { team: awayTeam, side: lineupIntel.away }].map(({ team, side }) => (
                  <div key={team} className="rounded-[22px] border border-white/[0.06] bg-black/20 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-white">{team}</p>
                        <p className="mt-1 text-xs text-white/42">{side?.status || "unknown"}</p>
                      </div>
                      {side?.status && (
                        <span className={cn("rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em]", certaintyTone(side.status))}>
                          {side.status}
                        </span>
                      )}
                    </div>
                    {side?.confidence != null && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-[11px] text-white/40">
                          <span>Confidence</span>
                          <span>{formatPct(Number(side.confidence) * 100, 0)}</span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, Number(side.confidence) * 100))}%` }} />
                        </div>
                      </div>
                    )}
                    {Array.isArray(side?.keyAbsenceReasons) && side.keyAbsenceReasons[0] && (
                      <p className="mt-3 text-sm leading-relaxed text-amber-100/72">{side.keyAbsenceReasons[0]}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </Section>
        )}

        <Section
          eyebrow="Pricing"
          title="Price and edge"
          description="Model confidence matters most when you can compare it to the board."
          icon={DollarSign}
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <MetricTile label="Best price" value={priceLabel || "Model only"} note={priceLabel ? "Unified odds lookup" : "No live board price for this market"} accent={priceLabel ? "default" : "amber"} />
            <MetricTile label="Implied" value={impliedPct != null ? `${impliedPct}%` : "—"} note="What the board is pricing" />
            <MetricTile label="Edge" value={edgePct != null ? `${edgePct >= 0 ? "+" : ""}${edgePct.toFixed(1)}pp` : "—"} note={hasValue ? "Model over market" : "Thin or no value gap"} accent={hasValue ? "primary" : "default"} />
            <MetricTile label="EV" value={ev != null ? `${ev >= 0 ? "+" : ""}${(ev * 100).toFixed(1)}%` : "—"} note={isAccaEligible ? "Also fits accumulator use" : "Expected value estimate"} accent={ev != null && ev >= 0 ? "primary" : ev != null ? "red" : "default"} />
          </div>

          {oddsData?.home && (
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                { label: "1", value: oddsData.home },
                { label: "X", value: oddsData.draw },
                { label: "2", value: oddsData.away },
              ].map((entry) => (
                <div key={entry.label} className="rounded-2xl border border-white/[0.06] bg-black/20 px-3 py-3 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">{entry.label}</p>
                  <p className="mt-2 text-lg font-black text-white">{formatOdds(entry.value) || "—"}</p>
                </div>
              ))}
            </div>
          )}

          {betLink && !isNoPick && (
            <a
              href={betLink}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-black text-black transition hover:brightness-110"
            >
              Bet on SportyBet <ArrowUpRight className="h-4 w-4" />
            </a>
          )}
        </Section>

        {(gameScript?.label || matchResult) && (
          <Section
            eyebrow="Game script"
            title="Decision stack"
            description="How ScorePhantom sees the shape of the match underneath the pick."
            icon={Activity}
          >
            <div className="space-y-4">
              {gameScript?.label && (
                <div className="rounded-[24px] border border-white/[0.06] bg-black/20 p-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-black text-white">{gameScript.label}</p>
                    {gameScript?.volatility && (
                      <span className={cn(
                        "rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em]",
                        gameScript.volatility === "HIGH"
                          ? "border-red-500/18 bg-red-500/10 text-red-300"
                          : gameScript.volatility === "LOW"
                            ? "border-emerald-400/18 bg-emerald-400/10 text-emerald-300"
                            : "border-white/[0.08] bg-white/[0.03] text-white/45"
                      )}>
                        {gameScript.volatility}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {matchResult && (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: homeTeam, value: matchResult.home, accent: "text-primary" },
                    { label: "Draw", value: matchResult.draw, accent: "text-white/65" },
                    { label: awayTeam, value: matchResult.away, accent: "text-blue-400" },
                  ].map((entry) => (
                    <div key={entry.label} className="rounded-2xl border border-white/[0.06] bg-black/20 px-3 py-3 text-center">
                      <p className={cn("text-xl font-black", entry.accent)}>{formatPct(entry.value, 0) || "—"}</p>
                      <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">{entry.label}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>
        )}

        {(hasSharpMoney1x2 || tacticalMatchup || homeManager || awayManager || rec.analystSummary) && (
          <Section
            eyebrow="Context"
            title="External and tactical context"
            description="These inputs add texture, but they do not replace the model's core thesis."
            icon={TrendingUp}
          >
            <div className="space-y-4">
              {hasSharpMoney1x2 && (
                <div className="rounded-[24px] border border-white/[0.06] bg-black/20 p-4">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-black text-white">External market check</p>
                    {isSharpValue && <span className="rounded-full border border-[#E5F522]/30 bg-[#E5F522]/12 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#E5F522]">Mismatch</span>}
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {[
                      { label: "Home", value: sharp1x2.home },
                      { label: "Draw", value: sharp1x2.draw },
                      { label: "Away", value: sharp1x2.away },
                    ].map((entry) => (
                      <div key={entry.label} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-3 text-center">
                        <p className="text-lg font-black text-white">{formatPct(Number(entry.value) * 100, 0) || "—"}</p>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">{entry.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {tacticalMatchup?.summary && (
                <div className="rounded-[24px] border border-white/[0.06] bg-black/20 p-4">
                  <p className="text-sm font-black text-white">Tactical read</p>
                  <p className="mt-2 text-sm leading-relaxed text-white/60">{tacticalMatchup.summary}</p>
                </div>
              )}

              {(homeManager || awayManager) && (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  {[homeManager, awayManager].filter(Boolean).map((manager: any) => (
                    <div key={manager.id || manager.name} className="rounded-[24px] border border-white/[0.06] bg-black/20 p-4">
                      <p className="text-sm font-black text-white">{manager.short_name || manager.name}</p>
                      <p className="mt-1 text-xs text-white/40 uppercase tracking-[0.18em]">{manager.preferred_formation || "Unknown shape"}</p>
                      {manager.tactical_styles?.[0] && (
                        <p className="mt-3 text-sm text-white/58">{manager.tactical_styles[0].emoji} {manager.tactical_styles[0].name}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {rec.analystSummary && (
                <div className="rounded-[24px] border border-white/[0.06] bg-black/20 p-4">
                  <p className="text-sm font-black text-white">Analyst summary</p>
                  <p className="mt-2 text-sm leading-relaxed text-white/60">{rec.analystSummary}</p>
                </div>
              )}
            </div>
          </Section>
        )}

        {model && (
          <Section
            eyebrow="Model strip"
            title="Quick numbers"
            description="A fast scan of the underlying outputs that support the verdict."
            icon={Activity}
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
              <MetricTile label="Total xG" value={model.totalXg != null ? Number(model.totalXg).toFixed(1) : "—"} />
              <MetricTile label="BTTS yes" value={(data as any)?.predictions?.btts ? `${Math.round((((data as any).predictions.btts?.yes || 0) * 100))}%` : "—"} />
              <MetricTile label="Risk" value={consistencyLabel} note={metaStatus.label} />
              <MetricTile label="EV" value={ev != null ? `${ev >= 0 ? "+" : ""}${(ev * 100).toFixed(1)}%` : "—"} accent={ev != null && ev >= 0 ? "primary" : ev != null ? "red" : "default"} />
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
