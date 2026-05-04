import { Brain, ShieldAlert, Users, CloudSun, MapPin, Sparkles, Activity, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

function num(value: any, fallback: number | null = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function fmt(value: any, digits = 2) {
  const n = num(value, null);
  return n == null ? "—" : n.toFixed(digits);
}

function hasAny(...values: any[]) {
  return values.some((v) => {
    if (Array.isArray(v)) return v.length > 0;
    if (v && typeof v === "object") return Object.keys(v).length > 0;
    return v !== undefined && v !== null && v !== "";
  });
}

function IntelMetric({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "good" | "warn" | "hot" }) {
  return (
    <div className={cn(
      "rounded-2xl border p-3 bg-white/[0.025]",
      tone === "good" ? "border-primary/20" : tone === "warn" ? "border-amber-400/20" : tone === "hot" ? "border-red-400/20" : "border-white/[0.06]"
    )}>
      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/30 mb-1">{label}</p>
      <p className={cn(
        "text-sm font-black tabular-nums",
        tone === "good" ? "text-primary" : tone === "warn" ? "text-amber-300" : tone === "hot" ? "text-red-300" : "text-white/80"
      )}>{value}</p>
    </div>
  );
}

function CorePlayers({ title, players }: { title: string; players: any[] }) {
  if (!Array.isArray(players) || players.length === 0) return null;
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-3">
      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/30 mb-2">{title}</p>
      <div className="space-y-2">
        {players.slice(0, 3).map((p, i) => (
          <div key={`${p.playerId || p.name || i}`} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-white/75 truncate">{p.name || "Core player"}</p>
              <p className="text-[9px] text-white/30">Career GC/90 {fmt(p.career?.goalContributionRate, 2)} · Rating {fmt(p.career?.avgRating, 2)}</p>
            </div>
            <span className="text-[10px] font-black text-primary tabular-nums">{fmt(p.liveScore, 2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PhantomIntelPanel({ matchData }: { matchData: any }) {
  const meta = matchData?.meta || {};
  const fixture = matchData?.fixture || {};
  const deepPlayerIntel = meta.deepPlayerIntel || null;
  const refereeVolatility = meta.refereeVolatility || null;
  const metadataInsights = meta.metadataInsights || null;
  const eventContext = meta.eventContext || meta.event_context || null;
  const venue = meta.venue || null;
  const completeness = meta.completeness || null;
  const homeManager = meta.homeManager || meta.home_manager || null;
  const awayManager = meta.awayManager || meta.away_manager || null;
  const standings = Array.isArray(meta.standings) ? meta.standings : [];
  const homeName = fixture.home_team_name || "Home";
  const awayName = fixture.away_team_name || "Away";

  const playerSummary = deepPlayerIntel?.summary || null;
  const coreGap = num(playerSummary?.corePlayerGap, 0) || 0;
  const playerTone = coreGap > 0.35 ? "good" : coreGap < -0.35 ? "warn" : "default";
  const refChaos = num(refereeVolatility?.chaos, null);
  const refStrict = num(refereeVolatility?.strictness, null);
  const facts = Array.isArray(metadataInsights?.facts) ? metadataInsights.facts : [];
  const reasonCodes = Array.isArray(metadataInsights?.reasonCodes) ? metadataInsights.reasonCodes : [];

  const homeStanding = standings.find((r: any) => String(r.team || r.team_name || "").toLowerCase().includes(String(homeName).toLowerCase().split(" ")[0]));
  const awayStanding = standings.find((r: any) => String(r.team || r.team_name || "").toLowerCase().includes(String(awayName).toLowerCase().split(" ")[0]));
  const xgGap = num(homeStanding?.xgd, null) != null && num(awayStanding?.xgd, null) != null
    ? (num(homeStanding?.xgd, 0)! - num(awayStanding?.xgd, 0)!)
    : null;

  const showPanel = hasAny(deepPlayerIntel, refereeVolatility, metadataInsights, eventContext, venue, completeness, homeManager, awayManager, standings);
  if (!showPanel) return null;

  return (
    <div className="mb-4 rounded-3xl border border-primary/15 bg-gradient-to-br from-primary/[0.08] via-white/[0.025] to-black/30 p-4 overflow-hidden relative">
      <div className="absolute -top-16 -right-16 w-40 h-40 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-2xl bg-primary/10 border border-primary/25 flex items-center justify-center">
            <Brain className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-black text-white">Phantom Intel</p>
            <p className="text-[10px] text-white/35">BSD v2 context layer powering this match</p>
          </div>
        </div>
        {completeness?.tier && (
          <span className="text-[9px] font-black px-2.5 py-1 rounded-full border border-primary/20 bg-primary/10 text-primary uppercase tracking-wider">
            {String(completeness.tier).toUpperCase()}
          </span>
        )}
      </div>

      <div className="relative grid grid-cols-2 gap-2 mb-3">
        {playerSummary && (
          <IntelMetric
            label="Core Player Edge"
            value={`${coreGap >= 0 ? homeName.slice(0, 3).toUpperCase() : awayName.slice(0, 3).toUpperCase()} ${Math.abs(coreGap).toFixed(2)}`}
            tone={playerTone as any}
          />
        )}
        {(refChaos != null || refStrict != null) && (
          <IntelMetric
            label="Referee Volatility"
            value={`Chaos ${fmt(refChaos, 2)} · Strict ${fmt(refStrict, 2)}`}
            tone={(refChaos || 0) >= 0.72 ? "hot" : (refStrict || 0) >= 0.75 ? "warn" : "default"}
          />
        )}
        {xgGap != null && (
          <IntelMetric
            label="xG Table Gap"
            value={`${xgGap >= 0 ? homeName.slice(0, 3).toUpperCase() : awayName.slice(0, 3).toUpperCase()} ${Math.abs(xgGap).toFixed(2)}`}
            tone={Math.abs(xgGap) >= 3 ? "good" : "default"}
          />
        )}
        {hasAny(eventContext?.travel_distance_km, eventContext?.is_neutral_ground, eventContext?.is_local_derby) && (
          <IntelMetric
            label="Context"
            value={eventContext?.is_local_derby ? "Local derby" : eventContext?.is_neutral_ground ? "Neutral ground" : `${Math.round(num(eventContext?.travel_distance_km, 0) || 0)}km travel`}
            tone={eventContext?.is_local_derby ? "warn" : "default"}
          />
        )}
      </div>

      {playerSummary && (
        <div className="relative grid grid-cols-2 gap-2 mb-3">
          <CorePlayers title={`${homeName.slice(0, 3).toUpperCase()} Core`} players={deepPlayerIntel?.home || []} />
          <CorePlayers title={`${awayName.slice(0, 3).toUpperCase()} Core`} players={deepPlayerIntel?.away || []} />
        </div>
      )}

      <div className="relative space-y-2">
        {(homeManager || awayManager) && (
          <div className="flex items-start gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3">
            <Trophy className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <p className="text-[11px] text-white/55 leading-relaxed">
              Manager layer: {homeManager?.name || homeManager?.short_name || "Home coach"} vs {awayManager?.name || awayManager?.short_name || "Away coach"}. Tactical style and formation are included in the prediction context.
            </p>
          </div>
        )}

        {(refereeVolatility?.cardsWarning || refereeVolatility?.redCardWarning) && (
          <div className="flex items-start gap-2 rounded-2xl border border-amber-400/15 bg-amber-400/[0.04] p-3">
            <ShieldAlert className="w-4 h-4 text-amber-300 mt-0.5 shrink-0" />
            <p className="text-[11px] text-amber-100/70 leading-relaxed">
              Referee history flags {refereeVolatility.redCardWarning ? "above-normal red-card risk" : "a strict card profile"}. ScorePhantom treats this as volatility, not blind confidence.
            </p>
          </div>
        )}

        {hasAny(eventContext?.weather, eventContext?.pitch_condition, venue?.name) && (
          <div className="flex items-start gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3">
            {venue?.name ? <MapPin className="w-4 h-4 text-blue-300 mt-0.5 shrink-0" /> : <CloudSun className="w-4 h-4 text-blue-300 mt-0.5 shrink-0" />}
            <p className="text-[11px] text-white/55 leading-relaxed">
              {venue?.name ? `Venue: ${venue.name}. ` : ""}
              {eventContext?.weather ? `Weather: ${typeof eventContext.weather === "string" ? eventContext.weather : JSON.stringify(eventContext.weather)}. ` : ""}
              {eventContext?.pitch_condition ? `Pitch: ${eventContext.pitch_condition}.` : ""}
            </p>
          </div>
        )}

        {(facts.length > 0 || reasonCodes.length > 0 || metadataInsights?.preview) && (
          <div className="rounded-2xl border border-primary/10 bg-primary/[0.035] p-3">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary/70">BSD Match Facts</p>
            </div>
            <div className="space-y-2">
              {reasonCodes.slice(0, 3).map((code: string) => (
                <p key={code} className="text-[11px] text-white/60 leading-snug">• {code.replace(/_/g, " ")}</p>
              ))}
              {facts.slice(0, 3).map((fact: string, i: number) => (
                <p key={`${fact}-${i}`} className="text-[11px] text-white/55 leading-snug">• {fact}</p>
              ))}
              {metadataInsights?.preview && (
                <p className="text-[11px] text-white/45 leading-snug line-clamp-3">{metadataInsights.preview}</p>
              )}
            </div>
          </div>
        )}

        {completeness?.score != null && (
          <div className="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-black/20 p-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">Data Coverage</span>
            </div>
            <span className="text-xs font-black text-white/75 tabular-nums">{Math.round(Number(completeness.score) * 100)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default PhantomIntelPanel;
