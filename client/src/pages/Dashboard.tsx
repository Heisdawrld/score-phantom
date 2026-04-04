import { useState, useMemo, useEffect, useRef } from "react";
import { format, addDays, isSameDay } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { useFixtures } from "@/hooks/use-fixtures";
import { usePrediction } from "@/hooks/use-predictions";
import { Header } from "@/components/layout/Header";
import { PredictionPanel } from "@/components/prediction/PredictionPanel";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronRight, ChevronDown, ChevronUp, Search, Trophy,
  Crown, Zap, Lock, AlertCircle, Radio
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLocation, useSearch } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/api";

// ── Enrichment Badge ──────────────────────────────────────────────────────────
function EnrichmentBadge({ status }: { status?: string | null }) {
  const config: Record<string, { label: string; cls: string }> = {
    deep:    { label: "Deep",     cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
    basic:   { label: "Basic",    cls: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
    limited: { label: "Limited",  cls: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
    no_data: { label: "No Data",  cls: "bg-white/5 text-white/30 border-white/10" },
  };
  const c = config[status ?? "no_data"] ?? config["no_data"];
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider shrink-0 ${c.cls}`}>
      {c.label}
    </span>
  );
}


// ── Tournament ID → Country lookup ────────────────────────────────────────────
// Used to disambiguate leagues that share the same name (e.g. multiple "Ligue 1"
// or "Premier League" from different countries).
const TOURNAMENT_COUNTRY: Record<string, string> = {
  // Ligue 1/2
  '5': 'France', '35': 'Algeria', '84': 'Senegal', '42': 'Tunisia',
  '97': 'France', '229': 'Ivory Coast', '343': 'Morocco',
  // Premier League
  '7': 'England', '16': 'Scotland', '30': 'Russia', '36': 'Nigeria',
  '37': 'South Africa', '64': 'Bangladesh', '80': 'Tajikistan',
  '86': 'India', '91': 'Zambia', '183': 'Thailand', '238': 'Rwanda',
  '258': 'Uganda', '273': 'Gambia', '278': 'Ethiopia', '281': 'Iraq',
  '282': 'Jamaica', '287': 'Bahrain', '292': 'South Sudan',
  '313': 'Eswatini', '399': 'Liberia',
  // Primera Division
  '25': 'Uruguay', '46': 'Dominican Rep', '47': 'Cuba', '48': 'Paraguay',
  '52': 'Bolivia', '54': 'El Salvador',
  // Primera B
  '259': 'Ecuador', '265': 'Colombia',
  // Liga Nacional
  '55': 'Guatemala', '56': 'Honduras',
  // Super League
  '9': 'Greece', '15': 'Kosovo', '26': 'Switzerland', '63': 'China',
  '290': 'Egypt', '408': 'Bangladesh',
  // 1st League
  '72': 'Hungary', '138': 'Bosnia', '187': 'Moldova', '239': 'Armenia',
  // 1st Division
  '44': 'Andorra', '132': 'Lithuania', '147': 'Estonia',
  '216': 'Yemen', '327': 'South Africa',
  // 2nd Division
  '144': 'Croatia', '148': 'Denmark',
  // Cup
  '126': 'Serbia', '135': 'Turkmenistan', '190': 'Malta',
  '202': 'N. Macedonia', '272': 'Iceland', '295': 'Luxembourg', '434': 'Armenia',
  // Challenge League
  '191': 'Malta', '338': 'Switzerland',
  // Serie A/B/C
  '4': 'Brazil', '24': 'Brazil B', '95': 'Brazil Ser.B',
};

function getTournamentLabel(tournamentName: string, tournamentId: string | number | null | undefined): string {
  if (!tournamentId) return tournamentName;
  const country = TOURNAMENT_COUNTRY[String(tournamentId)];
  if (country) return tournamentName + ' (' + country + ')';
  return tournamentName;
}

// Live Scores Section
function LiveSection() {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["/api/live"],
    queryFn: () => fetchApi("/live"),
    enabled: open,
    refetchInterval: 60000,
    staleTime: 30000,
  });
  const matches = (data as any)?.matches || [];
  return (
    <div className="rounded-2xl border border-white/10 bg-panel/40 overflow-hidden">
      <button className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-all" onClick={() => setOpen((o) => !o)}>
        <div className="relative w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
          <Radio className="w-4 h-4 text-red-400" />
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
        </div>
        <div className="flex-1 text-left">
          <p className="text-sm font-bold tracking-wide">Live Scores</p>
          <p className="text-xs text-muted-foreground">Matches happening right now</p>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2">
          {isLoading && <div className="flex justify-center py-6"><div className="w-6 h-6 rounded-full border-2 border-red-500/20 border-t-red-400 animate-spin" /></div>}
          {!isLoading && matches.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No live matches right now.</p>}
          {matches.map((m: any) => (
            <div key={m.match_id} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/8 gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold text-red-400">{m.minute ? m.minute + "'" : "LIVE"}</span>
                  <span className="text-[10px] text-muted-foreground truncate">{m.competition_name}</span>
                </div>
                <p className="text-sm font-semibold truncate">{m.home_team_name}</p>
                <p className="text-sm font-semibold truncate">{m.away_team_name}</p>
              </div>
              <div className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 min-w-[52px] text-center">
                <p className="font-display text-lg font-bold">{m.score || "0 - 0"}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── ACCA Banner (premium only) ────────────────────────────────────────────────
function AccaSection({ isPremium }: { isPremium: boolean }) {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"safe" | "value">("safe");

  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/acca", mode],
    queryFn: () => fetchApi(`/acca?mode=${mode}`),
    enabled: isPremium && open,
    staleTime: 10 * 60 * 1000,
  });

  const riskColors: Record<string, string> = {
    SAFE:       "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    MODERATE:   "bg-orange-500/20 text-orange-400 border-orange-500/30",
    AGGRESSIVE: "bg-red-500/20 text-red-400 border-red-500/30",
    LOW:        "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    MEDIUM:     "bg-orange-500/20 text-orange-400 border-orange-500/30",
    HIGH:       "bg-red-500/20 text-red-400 border-red-500/30",
  };

  if (!isPremium) {
    return (
      <div
        className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/5 to-transparent p-4 flex items-center gap-4 cursor-pointer hover:bg-primary/10 transition-all"
        onClick={() => setLocation("/paywall")}
      >
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
          <Crown className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-primary tracking-wide">ACCA Builder</p>
          <p className="text-xs text-muted-foreground mt-0.5">Upgrade to Premium to unlock your daily accumulator</p>
        </div>
        <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-primary/30 bg-gradient-to-b from-primary/8 to-transparent overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center gap-3 p-4 hover:bg-primary/5 transition-all"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
          <Zap className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 text-left">
          <p className="text-sm font-bold text-primary tracking-wide">ACCA Builder</p>
          <p className="text-xs text-muted-foreground">Low-correlation, controlled-risk combinations</p>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-primary shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-primary shrink-0" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {/* Mode toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setMode("safe")}
              className={cn(
                "flex-1 py-1.5 rounded-lg text-xs font-bold tracking-wide transition-all border",
                mode === "safe"
                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                  : "bg-white/5 text-muted-foreground border-white/10 hover:bg-white/8"
              )}
            >
              ✅ SAFE ACCA
            </button>
            <button
              onClick={() => setMode("value")}
              className={cn(
                "flex-1 py-1.5 rounded-lg text-xs font-bold tracking-wide transition-all border",
                mode === "value"
                  ? "bg-orange-500/20 text-orange-400 border-orange-500/40"
                  : "bg-white/5 text-muted-foreground border-white/10 hover:bg-white/8"
              )}
            >
              ⚡ VALUE ACCA
            </button>
          </div>

          {/* Mode description */}
          <p className="text-[10px] text-muted-foreground">
            {mode === "safe"
              ? "3 picks · all ≥75% · low volatility · stable markets only"
              : "4–5 picks · ≥70% · allows 1 moderate risk pick · higher odds"}
          </p>

          {isLoading &&
            Array.from({ length: mode === "safe" ? 3 : 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}

          {error && (
            <p className="text-xs text-muted-foreground text-center py-4">
              Could not load ACCA picks right now.
            </p>
          )}

          {/* Combined confidence header */}
          {data?.picks?.length > 0 && (
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-primary/10 border border-primary/20">
              <div>
                <p className="text-xs font-bold text-primary">
                  {data.accaType ?? (mode === "safe" ? "SAFE ACCA" : "VALUE ACCA")}
                </p>
                <p className="text-[10px] text-muted-foreground">{data.totalMatches} matches</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Combined</p>
                <p className="text-sm font-bold text-primary">{data.combinedConfidence?.toFixed(1)}%</p>
              </div>
              {data.riskLevel && (
                <span className={cn(
                  "text-[10px] font-bold tracking-widest uppercase border px-2 py-0.5 rounded-full",
                  riskColors[data.riskLevel] ?? "bg-white/10 text-muted-foreground border-white/10"
                )}>
                  {data.riskLevel} RISK
                </span>
              )}
            </div>
          )}

          {(!data?.picks || data.picks.length === 0) && !isLoading && !error && (
            <p className="text-xs text-muted-foreground text-center py-4">
              {data?.message ?? "No picks available yet. Check back later today."}
            </p>
          )}

          {/* Combined odds + payout calculator */}
          {data?.picks?.length > 0 && (() => {
            const combinedOdds = data.picks.reduce(
              (acc: number, p: any) => acc * (100 / Math.max(p.probability, 1)), 1
            );
            return (
              <div className="flex gap-2">
                <div className="flex-1 bg-white/5 rounded-xl p-2.5 border border-white/8 text-center">
                  <p className="text-[10px] text-muted-foreground mb-0.5">Est. Odds</p>
                  <p className="text-sm font-bold text-white">{combinedOdds.toFixed(2)}×</p>
                </div>
                <div className="flex-1 bg-primary/8 rounded-xl p-2.5 border border-primary/15 text-center">
                  <p className="text-[10px] text-muted-foreground mb-0.5">₦1k returns</p>
                  <p className="text-sm font-bold text-primary">₦{Math.round(1000 * combinedOdds).toLocaleString()}</p>
                </div>
                <div className="flex-1 bg-primary/8 rounded-xl p-2.5 border border-primary/15 text-center">
                  <p className="text-[10px] text-muted-foreground mb-0.5">₦5k returns</p>
                  <p className="text-sm font-bold text-primary">₦{Math.round(5000 * combinedOdds).toLocaleString()}</p>
                </div>
              </div>
            );
          })()}

          {data?.picks?.map((pick: any, i: number) => (
            <div
              key={pick.fixtureId ?? i}
              className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/8"
            >
              <span className="text-xs font-bold text-muted-foreground w-5 shrink-0 pt-0.5">#{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">
                  {pick.homeTeam} <span className="text-muted-foreground text-xs">vs</span> {pick.awayTeam}
                </p>
                <p className="text-xs text-muted-foreground truncate">{pick.tournament}</p>
                <p className="text-xs font-bold text-white mt-0.5">{pick.selection || pick.market}</p>
              </div>
              <div className="text-right shrink-0 space-y-1">
                <p className="text-sm font-bold text-primary">{pick.probability?.toFixed(1)}%</p>
                {pick.riskLevel && (
                  <span className={cn(
                    "text-[10px] font-bold tracking-widest uppercase border px-1.5 py-0.5 rounded-full block",
                    riskColors[pick.riskLevel] ?? "bg-white/10 text-muted-foreground border-white/10"
                  )}>
                    {pick.riskLevel}
                  </span>
                )}
              </div>
            </div>
          ))}

          {data?.picks?.length > 0 && (
            <p className="text-[10px] text-muted-foreground text-center pt-1">
              Picks sourced from enriched fixtures only · Always gamble responsibly
            </p>
          )}
        </div>
      )}
    </div>
  );
}



// ── Value Bet of the Day Banner ───────────────────────────────────────────────
function ValueBetBanner({ isPremium }: { isPremium: boolean }) {
  const [, setLocation] = useLocation();

  const { data } = useQuery({
    queryKey: ["/api/value-bet-today"],
    queryFn: () => fetchApi("/api/value-bet-today"),
    enabled: isPremium,
    staleTime: 30 * 60 * 1000,
  });

  if (!isPremium) {
    return (
      <div
        className="rounded-2xl border border-yellow-500/20 bg-gradient-to-r from-yellow-500/5 to-transparent p-4 flex items-center gap-4 cursor-pointer hover:bg-yellow-500/10 transition-all"
        onClick={() => setLocation("/paywall")}
      >
        <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center shrink-0">
          <span className="text-lg">🔥</span>
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-yellow-400 tracking-wide">Value Bet of the Day</p>
          <p className="text-xs text-muted-foreground mt-0.5">Upgrade to see today's highest edge pick</p>
        </div>
        <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
      </div>
    );
  }

  if (!data?.found) return null;

  const fmt = (m: string) => (m || '').replace(/_/g, ' ').replace(/\w/g, c => c.toUpperCase());

  return (
    <div className="rounded-2xl border border-yellow-500/30 bg-gradient-to-r from-yellow-500/8 to-transparent p-4 space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">🔥</span>
        <p className="text-xs font-bold text-yellow-400 tracking-widest uppercase">Value Bet of the Day</p>
        {data.enrichmentStatus === 'deep' && (
          <span className="text-[9px] font-bold border border-primary/30 text-primary px-1.5 py-0.5 rounded-full ml-auto">DEEP DATA</span>
        )}
      </div>
      <p className="text-sm font-semibold text-white">{data.homeTeam} vs {data.awayTeam}</p>
      <p className="text-[11px] text-muted-foreground">{data.tournament}</p>
      <div className="flex items-center justify-between pt-1">
        <div>
          <p className="text-xs text-muted-foreground">Pick</p>
          <p className="text-sm font-bold text-white">{fmt(data.market)} — {data.selection}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Model Prob</p>
          <p className="text-sm font-bold text-primary">{data.probability?.toFixed(1)}%</p>
        </div>
        {data.edge !== null && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Edge</p>
            <p className="text-sm font-bold text-yellow-400">+{data.edge?.toFixed(1)}%</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── FIFA code → flag emoji helper ─────────────────────────────────────────────────────────────
function fifaToEmoji(fifaCode: string): string {
  if (!fifaCode) return '⚽';
  const code = fifaCode.replace('.png', '').toUpperCase().slice(0, 3);
  const FIFA_EMOJI: Record<string, string> = {
    'ENG': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    'ESP': '🇪🇸',
    'GER': '🇩🇪',
    'ITA': '🇮🇹',
    'FRA': '🇫🇷',
    'POR': '🇵🇹',
    'NED': '🇳🇱',
    'BEL': '🇧🇪',
    'SCO': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
    'TUR': '🇹🇷',
    'ARG': '🇦🇷',
    'BRA': '🇧🇷',
    'MEX': '🇲🇽',
    'USA': '🇺🇸',
    'AUS': '🇦🇺',
    'NGA': '🇳🇬',
    'GHA': '🇬🇭',
    'ZAF': '🇿🇦',
    'EGY': '🇪🇬',
    'MAR': '🇲🇦',
    'JPN': '🇯🇵',
    'KOR': '🇰🇷',
    'CHN': '🇨🇳',
    'GRE': '🇬🇷',
    'URU': '🇺🇾',
    'COL': '🇨🇴',
    'CHI': '🇨🇱',
    'PER': '🇵🇪',
    'GTM': '🇬🇹',
    'AUT': '🇦🇹',
    'CHE': '🇨🇭',
    'DNK': '🇩🇰',
    'SWE': '🇸🇪',
    'NOR': '🇳🇴',
    'POL': '🇵🇱',
    'CZE': '🇨🇿',
    'ROU': '🇷🇴',
    'RUS': '🇷🇺',
    'UKR': '🇺🇦',
    'HRV': '🇭🇷',
    'SRB': '🇷🇸',
    'SVK': '🇸🇰',
    'HUN': '🇭🇺',
    'ISR': '🇮🇱',
    'SAU': '🇸🇦',
    'ARE': '🇦🇪',
    'SGP': '🇸🇬',
    'IND': '🇮🇳',
  };
  return FIFA_EMOJI[code] || '⚽';
}

// ── Collapsible League Group ───────────────────────────────────────────────────
function LeagueGroup({
  tournament,
  fixtures,
  onSelectFixture,
  defaultOpen,
  isPremium,
}: {
  tournament: string;
  fixtures: any[];
  onSelectFixture: (id: string) => void;
  defaultOpen: boolean;
  isPremium: boolean;
}) {
  const countryFlag = fixtures[0]?.country_flag ? fifaToEmoji(fixtures[0].country_flag) : '⚽';
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="space-y-2">
      <button
        className="w-full flex items-center gap-2 px-2 py-1 rounded-xl hover:bg-white/5 transition-all"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="w-1 h-4 bg-primary rounded-full shrink-0" />
        <h3 className="text-sm font-bold tracking-wide text-white/90 flex-1 text-left">
          <span className="mr-1.5" aria-hidden="true">{countryFlag}</span>{tournament}
        </h3>
        <span className="text-xs text-muted-foreground">{fixtures.length}</span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="space-y-2">
          {fixtures.map((fixture: any) => {
            let time = "";
            try { time = format(new Date(fixture.match_date), "HH:mm"); } catch {}
            return (
              <button
                key={fixture.id}
                onClick={() => onSelectFixture(fixture.id)}
                className="w-full flex items-center justify-between p-4 rounded-2xl bg-panel/40 border border-white/5 hover:bg-white/5 hover:border-white/10 transition-all text-left group"
              >
                <div className="flex items-center gap-4">
                  <div className="text-xs font-bold text-muted-foreground w-12 text-center shrink-0">{time}</div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                      <span className="font-semibold text-sm">{fixture.home_team_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-accent-blue" />
                      <span className="font-semibold text-sm">{fixture.away_team_name}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <EnrichmentBadge status={fixture.enrichment_status} />
                  {/* Prediction confidence badge — shown when a pick is available */}
                  {fixture.best_pick_selection && fixture.best_pick_probability && (() => {
                    const pct = parseFloat(fixture.best_pick_probability) * 100;
                    const level = fixture.pick_confidence_level?.toUpperCase();
                    const colorClass =
                      level === "HIGH"   ? "bg-primary/15 text-primary border-primary/30" :
                      level === "MEDIUM" ? "bg-blue-500/15 text-blue-400 border-blue-500/30" :
                                          "bg-orange-500/15 text-orange-400 border-orange-500/30";
                    return isPremium ? (
                      <div className={`flex items-center gap-1 border rounded-full px-2 py-0.5 ${colorClass}`}>
                        <span className="text-[10px] font-bold">{pct.toFixed(0)}%</span>
                        <span className="text-[10px] opacity-70">·</span>
                        <span className="text-[10px] font-medium truncate max-w-[80px]">
                          {fixture.best_pick_selection}
                        </span>
                      </div>
                    ) : null;
                  })()}
                  {(fixture.odds_home || fixture.odds_draw || fixture.odds_away) && (
                    <div className="flex items-center gap-1">
                      {fixture.odds_home && <span className="text-[10px] text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded">{Number(fixture.odds_home).toFixed(2)}</span>}
                      {fixture.odds_draw && <span className="text-[10px] text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded">{Number(fixture.odds_draw).toFixed(2)}</span>}
                      {fixture.odds_away && <span className="text-[10px] text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded">{Number(fixture.odds_away).toFixed(2)}</span>}
                    </div>
                  )}
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────

// EmailVerifyGate removed — Google Auth handles email verification

function _unused_EmailVerifyGate_stub({ email, token }: { email: string; token: string }) {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [checking, setChecking] = useState(false);

  // Lock body scroll while gate is visible
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Auto-poll every 5s — if user verified in another tab, dismiss automatically
  useEffect(() => {
    const poll = setInterval(async () => {
      if (!token) return;
      try {
        const r = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok) return;
        const d = await r.json();
        const isVerified = d?.user?.email_verified === true || d?.user?.email_verified === 1;
        if (isVerified) {
          // Full reload — bypasses any stale React Query cache
          window.location.href = '/';
        }
      } catch {}
    }, 5000);
    return () => clearInterval(poll);
  }, [token]);

  const resend = async () => {
    setLoading(true); setErr('');
    try {
      const r = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to resend');
      setSent(true);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const checkNow = async () => {
    setChecking(true);
    try {
      const r = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) {
        const d = await r.json();
        const isVerified = d?.user?.email_verified === true || d?.user?.email_verified === 1;
        if (isVerified) {
          window.location.href = '/';
          return;
        }
      }
      setErr('Not verified yet — click the link in the email first, then tap here.');
    } catch {
      setErr('Could not check status. Try again.');
    } finally {
      setChecking(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('sp_token');
    window.location.href = '/login';
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background px-6 text-center">
      {/* Animated envelope icon */}
      <div className="relative w-20 h-20 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mb-6">
        <span className="text-4xl">✉️</span>
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full animate-pulse" />
      </div>

      <h2 className="font-display text-2xl font-bold text-white mb-3">Check your inbox</h2>
      <p className="text-muted-foreground text-sm leading-relaxed max-w-xs mb-1">
        We sent a verification link to
      </p>
      <p className="text-white font-semibold text-sm mb-4">{email}</p>

      <div className="max-w-xs w-full bg-white/5 border border-white/10 rounded-2xl p-4 mb-6 text-left space-y-2">
        <div className="flex items-center gap-2 text-xs text-white/70">
          <span className="text-primary font-bold">1.</span> Open the email from ScorePhantom
        </div>
        <div className="flex items-center gap-2 text-xs text-white/70">
          <span className="text-primary font-bold">2.</span> Click <strong className="text-white">"Verify my email"</strong>
        </div>
        <div className="flex items-center gap-2 text-xs text-white/70">
          <span className="text-primary font-bold">3.</span> You'll be redirected back here automatically
        </div>
      </div>

      <p className="text-xs text-white/30 mb-5">
        Can't find it? Check your spam / promotions folder.
      </p>

      {/* Primary CTA — check now */}
      <button
        onClick={checkNow}
        disabled={checking}
        className="w-full max-w-xs bg-primary text-black font-bold py-3 rounded-xl text-sm mb-3 disabled:opacity-60 transition-all active:scale-95"
      >
        {checking ? 'Checking...' : "I've verified my email →"}
      </button>

      {/* Resend */}
      {sent ? (
        <p className="text-primary text-sm font-semibold">✅ New email sent! Check your inbox.</p>
      ) : (
        <button
          onClick={resend}
          disabled={loading}
          className="text-sm text-white/40 hover:text-white/70 disabled:opacity-50 transition-colors underline underline-offset-2"
        >
          {loading ? 'Sending...' : 'Resend verification email'}
        </button>
      )}

      {err && <p className="text-orange-400 text-xs mt-3 max-w-xs">{err}</p>}

      {/* Escape hatch — always visible */}
      <button
        onClick={logout}
        className="mt-8 text-xs text-white/20 hover:text-white/50 transition-colors"
      >
        Log out & use a different account
      </button>
    </div>
  );
}

export default function Dashboard() {
  const { data: user, isLoading: authLoading, refetch: refetchAuth } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const queryClient = useQueryClient();

  // ── Payment success: refresh auth so premium status shows immediately ────
  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.get("payment") === "success") {
      // Force-invalidate the auth query so the user's new premium status loads
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      refetchAuth();
      // Clean the URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [search]);

  const dates = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => addDays(new Date(), i));
  }, []);

  const { toast } = useToast();
  const dateStripRef = useRef(null);

  // Trial countdown timer
  const [trialHoursRemaining, setTrialHoursRemaining] = useState<number | null>(null);
  const [trialTimeLabel, setTrialTimeLabel] = useState<string>("");
  useEffect(() => {
    if (!user?.trial_ends_at) {
      setTrialHoursRemaining(null);
      setTrialTimeLabel("");
      return;
    }
    
    const updateCountdown = () => {
      const now = new Date();
      const trialEnds = new Date((user as any).trial_ends_at);
      const msRemaining = trialEnds.getTime() - now.getTime();
      const totalHours = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60)));
      setTrialHoursRemaining(totalHours);
      // Format as "Xd Yh" or "Xh" when less than a day
      const days = Math.floor(totalHours / 24);
      const hours = totalHours % 24;
      if (totalHours <= 0) setTrialTimeLabel("Expires soon");
      else if (days > 0) setTrialTimeLabel(hours > 0 ? `${days}d ${hours}h left` : `${days}d left`);
      else setTrialTimeLabel(`${hours}h left`);
    };
    
    updateCountdown();
    const interval = setInterval(updateCountdown, 60000);
    return () => clearInterval(interval);
  }, [(user as any)?.trial_ends_at]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      toast({ title: '🎉 Payment confirmed!', description: 'ScorePhantom Premium is now active!', duration: 6000 });
      window.history.replaceState({}, '', '/');
    }
  }, []);

  const [selectedDate, setSelectedDate] = useState(dates[0]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(null);
  const [dailyLimitHit, setDailyLimitHit] = useState(false);

  const formattedDate = format(selectedDate, "yyyy-MM-dd");
  const { data, isLoading: fixturesLoading } = useFixtures(formattedDate);

  const isPremium = user?.access_status === "active" || (user as any)?.subscription_active;
  const isTrial = user?.access_status === "trial";
  const isExpired = user?.access_status === "expired";

  const { data: usageData } = useQuery({
    queryKey: ["/api/usage"],
    queryFn: () => fetchApi("/usage"),
    enabled: isTrial,
    refetchInterval: 30000, // refresh every 30s
    staleTime: 10000,
  });

  const isDailyLimitHit = dailyLimitHit || (!!usageData && (usageData as any).remaining === 0 && isTrial);

  const groupedFixtures = useMemo(() => {
    if (!data?.fixtures) return {};

    let filtered = data.fixtures;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (f) =>
          f.home_team_name.toLowerCase().includes(q) ||
          f.away_team_name.toLowerCase().includes(q) ||
          (f.tournament_name && f.tournament_name.toLowerCase().includes(q))
      );
    }

    return filtered.reduce((acc: any, fixture) => {
      // Use tournament_id as key so "Ligue 1 France" and "Ligue 1 Algeria"
      // don't get merged into the same group (they share tournament_name but have different IDs)
      const groupId = fixture.tournament_id
        ? String(fixture.tournament_id)
        : (fixture.tournament_name || "Other Competitions");
      const key = groupId;
      if (!acc[key]) acc[key] = { label: getTournamentLabel(fixture.tournament_name || "Other Competitions", fixture.tournament_id), fixtures: [] };
      acc[key].fixtures.push(fixture);
      return acc;
    }, {});
  }, [data?.fixtures, searchQuery]);

  if (authLoading) return <div className="min-h-screen bg-background" />;


  const handleSelectFixture = (id: string) => {
    setSelectedFixtureId(id);
  };

  const handlePredictionError = (code: string) => {
    if (code === "daily_limit_reached") {
      setDailyLimitHit(true);
      // Don't close the panel — PredictionPanel shows a blur overlay with upgrade CTA
    }
  };

  const leagues = Object.entries(groupedFixtures)
    .sort(([, a]: any, [, b]: any) => a.label.localeCompare(b.label));

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20">
      <Header />

      <main className="flex-1 container mx-auto max-w-3xl px-4 pt-6 space-y-5">

        {/* Expired trial FOMO banner — stay on dashboard, blur all predictions */}
        {isExpired && (
          <div
            className="flex items-center gap-3 p-3.5 rounded-2xl bg-gradient-to-r from-orange-500/10 to-orange-500/5 border border-orange-500/25 cursor-pointer hover:border-orange-500/40 transition-all"
            onClick={() => setLocation("/paywall")}
          >
            <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4 text-orange-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-orange-400 tracking-wide leading-none mb-0.5">Free Trial Expired</p>
              <p className="text-xs text-white/50">All predictions are blurred · Upgrade to unlock everything</p>
            </div>
            <span className="text-[11px] font-black text-black bg-primary px-3 py-1.5 rounded-xl shrink-0">Unlock All</span>
          </div>
        )}

        {/* Trial countdown banner */}
        {/* Unified free trial banner — one card only */}
        {isTrial && (
          <div
            className={`flex items-center gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all group ${
              isDailyLimitHit || (trialHoursRemaining !== null && trialHoursRemaining <= 2)
                ? 'bg-gradient-to-r from-red-500/10 to-red-500/5 border-red-500/25 hover:border-red-500/40'
                : 'bg-gradient-to-r from-primary/10 to-primary/5 border-primary/25 hover:border-primary/40'
            }`}
            onClick={() => setLocation("/paywall")}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
              isDailyLimitHit || (trialHoursRemaining !== null && trialHoursRemaining <= 2)
                ? 'bg-red-500/20' : 'bg-primary/20'
            }`}>
              {isDailyLimitHit
                ? <Zap className="w-4 h-4 text-red-400" />
                : <Crown className="w-4 h-4 text-primary" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-bold tracking-wide leading-none mb-0.5 ${
                isDailyLimitHit || (trialHoursRemaining !== null && trialHoursRemaining <= 2)
                  ? 'text-red-400' : 'text-primary'
              }`}>
                {isDailyLimitHit
                  ? "Predictions used up for today"
                  : "Free Trial Active"}
              </p>
              <p className="text-xs text-white/55 flex flex-wrap gap-x-1.5">
                {usageData && (
                  <span className={
                    usageData.remaining === 0 ? "text-red-400 font-semibold" :
                    usageData.remaining <= 1 ? "text-orange-400 font-semibold" :
                    "text-white/80 font-semibold"
                  }>
                    {usageData.remaining}/{usageData.limit} predictions left
                  </span>
                )}
                {usageData && <span>·</span>}
                {trialHoursRemaining !== null && (
                  <span className={trialHoursRemaining <= 24 ? "text-red-300" : "text-white/60"}>
                    {trialTimeLabel || "Trial active"}
                  </span>
                )}
                {trialHoursRemaining !== null && <span>·</span>}
                <span>3 predictions/day · upgrade for full access</span>
              </p>
            </div>
            <span className={`text-[11px] font-black text-black px-3 py-1.5 rounded-xl shrink-0 group-hover:opacity-90 transition-opacity ${
              isDailyLimitHit || (trialHoursRemaining !== null && trialHoursRemaining <= 2)
                ? 'bg-red-400' : 'bg-primary'
            }`}>
              {isDailyLimitHit ? "Unlock All" : "Upgrade"}
            </span>
          </div>
        )}

        {/* Live Scores */}
        <LiveSection />

        {/* Value Bet of the Day */}
        <ValueBetBanner isPremium={isPremium} />

        {/* ACCA Section */}
        <AccaSection isPremium={!!isPremium} />

        {/* Date Strip */}
        <div ref={dateStripRef} className="flex gap-2 overflow-x-auto hide-scrollbar pb-2 snap-x">
          {dates.map((date) => {
            const isSelected = isSameDay(date, selectedDate);
            return (
              <button
                key={date.toISOString()}
                onClick={() => setSelectedDate(date)}
                className={cn(
                  "snap-start shrink-0 min-w-[70px] flex flex-col items-center justify-center p-3 rounded-2xl border transition-all",
                  isSelected
                    ? "bg-gradient-to-b from-primary/20 to-primary/5 border-primary/30 text-primary shadow-[0_0_15px_rgba(16,231,116,0.1)]"
                    : "bg-panel/50 border-white/5 text-muted-foreground hover:bg-white/5"
                )}
              >
                <span className="text-[10px] font-bold tracking-widest uppercase mb-1">{format(date, "EEE")}</span>
                <span className="font-display text-2xl leading-none">{format(date, "dd")}</span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-4 top-3.5 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Search teams or leagues..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-11 h-12 bg-panel/50 border-white/10 rounded-2xl"
          />
        </div>

        {/* Enrichment count */}
        {data && ((data as any).total > 0 || (data as any).enrichedDeepCount > 0) && (
          <div className="flex items-center gap-2 px-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_5px_#34d399] shrink-0" />
            <span className="text-xs text-muted-foreground">
              <span className="text-emerald-400 font-semibold">{(data as any).enrichedDeepCount ?? 0}</span>
              {" "}deeply enriched fixtures today · {data.total} total
            </span>
          </div>
        )}

        {/* Fixtures List — Grouped & Collapsible */}
        <div className="space-y-4">
          {fixturesLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-20 w-full rounded-2xl" />
                <Skeleton className="h-20 w-full rounded-2xl" />
              </div>
            ))
          ) : leagues.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground space-y-3">
              <Trophy className="w-12 h-12 mx-auto opacity-20" />
              <p className="font-medium">No fixtures for {format(selectedDate, 'MMM d')}.</p>
              <p className="text-xs opacity-60">{isSameDay(selectedDate, dates[0]) ? 'Fixtures loading — check back soon.' : 'No matches scheduled.'}</p>
            </div>
          ) : (
            leagues.map(([groupId, group]: [string, any], idx) => (
              <LeagueGroup
                key={groupId}
                tournament={group.label}
                fixtures={group.fixtures}
                onSelectFixture={handleSelectFixture}
                defaultOpen={idx < 2}
                isPremium={isPremium}
              />
            ))
          )}
        </div>
      </main>

      <PredictionPanel
        fixtureId={selectedFixtureId}
        onClose={() => setSelectedFixtureId(null)}
        onError={handlePredictionError}
        limitReached={isDailyLimitHit}
      />
    </div>
  );
}
