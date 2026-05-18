import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/api";
import { AlertCircle, ShieldCheck, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfidenceRing } from "@/components/ui/ConfidenceRing";

function getPlayerName(player: any) {
  return player?.name || player?.player_name || player?.player?.name || player?.short_name || "Unknown player";
}

function getMissingReason(player: any) {
  return player?.reason || player?.status || player?.type || "Unavailable";
}

function certaintyTone(status?: string | null) {
  const low = String(status || "").toLowerCase();
  if (low === "confirmed") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-300";
  if (low === "predicted") return "border-amber-400/20 bg-amber-400/10 text-amber-300";
  return "border-white/[0.08] bg-white/[0.03] text-white/45";
}

function absenceTone(score?: number | null) {
  const value = Number(score || 0);
  if (value >= 0.55) return "border-red-500/18 bg-red-500/10 text-red-300";
  if (value >= 0.25) return "border-amber-400/18 bg-amber-400/10 text-amber-300";
  return "border-emerald-400/18 bg-emerald-400/10 text-emerald-300";
}

function MetricTile({ label, value, note, tone = "default" }: { label: string; value: string; note?: string | null; tone?: "default" | "primary" | "amber" | "red"; }) {
  const classes = {
    default: "border-white/[0.08] bg-black/20 text-white",
    primary: "border-primary/16 bg-primary/10 text-primary",
    amber: "border-amber-400/18 bg-amber-400/10 text-amber-300",
    red: "border-red-500/18 bg-red-500/10 text-red-300",
  }[tone];

  return (
    <div className={cn("rounded-2xl border px-3.5 py-3", classes)}>
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">{label}</p>
      <p className="mt-2 text-2xl font-black leading-none">{value}</p>
      {note && <p className="mt-1.5 text-xs leading-relaxed text-white/52">{note}</p>}
    </div>
  );
}

function TeamLineupPanel({
  teamName,
  formation,
  starters,
  substitutes,
  unavailable,
  intelligence,
}: {
  teamName: string;
  formation?: string | null;
  starters: any[];
  substitutes: any[];
  unavailable: any[];
  intelligence?: any;
}) {
  const confidencePct = intelligence?.confidence != null ? Math.round(Number(intelligence.confidence) * 100) : null;
  const absenceScorePct = intelligence?.weightedAbsenceScore != null ? Math.round(Number(intelligence.weightedAbsenceScore) * 100) : null;
  const startersList = starters.slice(0, 11);
  const keyReasons = Array.isArray(intelligence?.keyAbsenceReasons) ? intelligence.keyAbsenceReasons.slice(0, 2) : [];
  const missingList = unavailable.slice(0, 4);

  return (
    <div className="rounded-[28px] border border-white/[0.08] bg-[linear-gradient(155deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.18)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-black text-white">{teamName}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {formation && (
              <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/42">
                {formation}
              </span>
            )}
            {intelligence?.status && (
              <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]", certaintyTone(intelligence.status))}>
                {intelligence.status}
              </span>
            )}
          </div>
        </div>

        {confidencePct != null ? (
          <ConfidenceRing value={confidencePct} size={72} strokeWidth={4} showLabel label="Trust" />
        ) : (
          <div className="rounded-2xl border border-white/[0.08] bg-black/20 px-4 py-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Status</p>
            <p className="mt-2 text-lg font-black text-white/65">Waiting</p>
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <MetricTile label="Starters" value={String(starters.length)} note="Expected XI count" />
        <MetricTile label="Bench" value={String(substitutes.length)} note="Listed substitutes" />
        <MetricTile
          label="Absence load"
          value={absenceScorePct != null ? `${absenceScorePct}%` : `${unavailable.length}`}
          note={absenceScorePct != null ? "Weighted impact score" : "Unavailable players listed"}
          tone={absenceScorePct != null ? (absenceScorePct >= 55 ? "red" : absenceScorePct >= 25 ? "amber" : "primary") : unavailable.length > 2 ? "amber" : "default"}
        />
      </div>

      <div className="mt-4 rounded-[24px] border border-white/[0.06] bg-black/20 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Projected XI</p>
          {confidencePct != null && <p className="text-[11px] text-white/42">{confidencePct}% confidence</p>}
        </div>

        {startersList.length > 0 ? (
          <div className="mt-3 space-y-2">
            {startersList.map((player: any, index: number) => (
              <div key={`${getPlayerName(player)}-${index}`} className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white/88">{getPlayerName(player)}</p>
                  <p className="mt-0.5 text-[11px] text-white/38">#{player.jersey_number || "—"}</p>
                </div>
                <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">
                  {player.position || "Role"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-4 text-sm text-white/48">
            The full starting XI has not been published yet.
          </div>
        )}
      </div>

      {(missingList.length > 0 || keyReasons.length > 0) && (
        <div className="mt-4 rounded-[24px] border border-white/[0.06] bg-black/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Absence watch</p>
            {absenceScorePct != null && (
              <span className={cn("rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em]", absenceTone(intelligence?.weightedAbsenceScore))}>
                {absenceScorePct}% impact
              </span>
            )}
          </div>

          {keyReasons.length > 0 && (
            <div className="mt-3 space-y-2">
              {keyReasons.map((reason: string, index: number) => (
                <div key={`${reason}-${index}`} className="flex items-start gap-2.5 rounded-2xl border border-amber-400/16 bg-amber-400/[0.05] px-3 py-2.5">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                  <p className="text-sm leading-relaxed text-amber-100/78">{reason}</p>
                </div>
              ))}
            </div>
          )}

          {missingList.length > 0 && (
            <div className="mt-3 space-y-2">
              {missingList.map((player: any, index: number) => (
                <div key={`${getPlayerName(player)}-${index}`} className="rounded-2xl border border-red-500/14 bg-red-500/[0.05] px-3 py-2.5">
                  <p className="text-sm font-semibold text-white/85">{getPlayerName(player)}</p>
                  <p className="mt-1 text-[11px] text-red-200/72">{getMissingReason(player)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function LineupsTab({ matchData, fixtureId }: { matchData?: any; fixtureId?: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["predicted-lineup", fixtureId],
    queryFn: async () => {
      if (!fixtureId) return null;
      return fetchApi(`/predicted-lineup/${fixtureId}/`);
    },
    enabled: !!fixtureId,
  });

  const isLiveFormat = Array.isArray(matchData?.meta?.lineups);

  let homeLineup: any[] = [];
  let awayLineup: any[] = [];
  let homeSubs: any[] = [];
  let awaySubs: any[] = [];
  let homeUnavailable: any[] = [];
  let awayUnavailable: any[] = [];
  let homeFormation = null;
  let awayFormation = null;
  const lineupIntel = data?.lineupIntelligence || matchData?.meta?.lineupIntelligence || null;

  if (isLiveFormat) {
    const allPlayers = matchData.meta.lineups || [];
    homeLineup = allPlayers.filter((player: any) => player.is_home);
    awayLineup = allPlayers.filter((player: any) => !player.is_home);
  } else if (data && data.lineups) {
    homeLineup = data.lineups.home?.starters || data.lineups.home?.players || data.lineups.home?.lineup || [];
    awayLineup = data.lineups.away?.starters || data.lineups.away?.players || data.lineups.away?.lineup || [];
    homeSubs = data.lineups.home?.substitutes || [];
    awaySubs = data.lineups.away?.substitutes || [];
    homeUnavailable = data.lineups.home?.unavailable || [];
    awayUnavailable = data.lineups.away?.unavailable || [];
    homeFormation = data.lineups.home?.predicted_formation || data.lineups.home?.formation;
    awayFormation = data.lineups.away?.predicted_formation || data.lineups.away?.formation;
  } else {
    homeLineup = matchData?.meta?.lineups?.home?.players || matchData?.meta?.lineups?.home?.lineup || [];
    awayLineup = matchData?.meta?.lineups?.away?.players || matchData?.meta?.lineups?.away?.lineup || [];
    homeSubs = matchData?.meta?.lineups?.home?.substitutes || [];
    awaySubs = matchData?.meta?.lineups?.away?.substitutes || [];
    homeFormation = matchData?.meta?.lineups?.home?.formation || null;
    awayFormation = matchData?.meta?.lineups?.away?.formation || null;
  }

  if (homeUnavailable.length === 0) homeUnavailable = matchData?.meta?.injuries?.home || [];
  if (awayUnavailable.length === 0) awayUnavailable = matchData?.meta?.injuries?.away || [];

  const hasLineups = homeLineup.length > 0 || awayLineup.length > 0;
  const certaintyPct = lineupIntel?.certaintyScore != null ? Math.round(Number(lineupIntel.certaintyScore) * 100) : null;
  const homeConfidencePct = lineupIntel?.home?.confidence != null ? Math.round(Number(lineupIntel.home.confidence) * 100) : null;
  const awayConfidencePct = lineupIntel?.away?.confidence != null ? Math.round(Number(lineupIntel.away.confidence) * 100) : null;

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-10 w-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[28px] border border-white/[0.08] bg-[linear-gradient(155deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.18)] sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
              <Users className="h-3.5 w-3.5 text-primary" /> Lineup trust
            </div>
            <h3 className="mt-3 text-xl font-black text-white">Starting XIs and absence pressure</h3>
            <p className="mt-1 text-sm leading-relaxed text-white/55">
              {lineupIntel?.note || (hasLineups ? "Projected lineups are available for both sides." : "Waiting for lineup publication closer to kick-off.")}
            </p>
          </div>

          {certaintyPct != null ? (
            <ConfidenceRing value={certaintyPct} size={84} strokeWidth={4.5} showLabel label="Certainty" />
          ) : (
            <div className="rounded-2xl border border-white/[0.08] bg-black/20 px-4 py-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Status</p>
              <p className="mt-2 text-lg font-black text-white/65">Waiting</p>
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <MetricTile label="Certainty" value={certaintyPct != null ? `${certaintyPct}%` : "—"} note={lineupIntel?.certaintyLabel || "No read yet"} tone={certaintyPct != null ? "primary" : "default"} />
          <MetricTile label="Home trust" value={homeConfidencePct != null ? `${homeConfidencePct}%` : "—"} note={lineupIntel?.home?.status || "Waiting"} tone={homeConfidencePct != null ? "primary" : "default"} />
          <MetricTile label="Away trust" value={awayConfidencePct != null ? `${awayConfidencePct}%` : "—"} note={lineupIntel?.away?.status || "Waiting"} tone={awayConfidencePct != null ? "primary" : "default"} />
        </div>

        {!hasLineups && (
          <div className="mt-4 rounded-[24px] border border-white/[0.06] bg-black/20 p-4">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-sm leading-relaxed text-white/58">
                We will keep showing absence and certainty signals here even before the final XI is published, so the trust level is still explicit.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <TeamLineupPanel
          teamName={matchData?.fixture?.home_team_name || "Home"}
          formation={homeFormation}
          starters={homeLineup}
          substitutes={homeSubs}
          unavailable={homeUnavailable}
          intelligence={lineupIntel?.home}
        />

        <TeamLineupPanel
          teamName={matchData?.fixture?.away_team_name || "Away"}
          formation={awayFormation}
          starters={awayLineup}
          substitutes={awaySubs}
          unavailable={awayUnavailable}
          intelligence={lineupIntel?.away}
        />
      </div>
    </div>
  );
}
