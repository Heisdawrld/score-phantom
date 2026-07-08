import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, ChevronRight } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";
import { LeagueLogo } from "@/components/LeagueLogo";
import { cn } from "@/lib/utils";

function toWAT(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("en-NG", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return "";
  }
}

export function LeagueGroup({
  tournament,
  tournamentId,
  fixtures,
  onSelectFixture,
  defaultOpen = false,
}: {
  tournament: string;
  tournamentId?: string | number | null;
  fixtures: any[];
  onSelectFixture: (id: string) => void;
  defaultOpen: boolean;
  isPremium: boolean;
}) {
  // Derive league_id from the first fixture if not passed explicitly
  const leagueId = tournamentId || fixtures[0]?.tournament_id || null;
  const storageKey = `league-expanded-${tournament}`;
  const [open, setOpen] = useState(() => {
    const saved = sessionStorage.getItem(storageKey);
    if (saved !== null) return saved === "true";
    return defaultOpen;
  });

  const handleToggle = () => {
    setOpen((prev) => {
      const next = !prev;
      sessionStorage.setItem(storageKey, String(next));
      return next;
    });
  };

  const liveCount = fixtures.filter((f: any) => ["LIVE", "HT", "1H", "2H"].includes(f.match_status || "")).length;

  return (
    <div className="space-y-1.5">
      {/* League header */}
      <button
        className="group w-full flex items-center justify-between gap-3 px-1 py-1 text-left"
        onClick={handleToggle}
      >
        <div className="flex min-w-0 items-center gap-2">
          <LeagueLogo leagueId={leagueId} name={tournament} size="sm" />
          <h3 className="truncate text-xs font-bold uppercase tracking-wider text-white/55 group-hover:text-white/80 transition-colors">
            {tournament}
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {liveCount > 0 && <span className="text-2xs font-bold uppercase text-red-400">Live</span>}
          <span className="text-2xs font-bold text-white/30 tabular-nums">{fixtures.length}</span>
          <ChevronDown className={cn('h-3.5 w-3.5 text-white/20 transition-transform duration-200', open && 'rotate-180')} />
        </div>
      </button>

      {/* Fixture cards */}
      {open && (
        <motion.div className="space-y-1.5" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}>
          {fixtures.map((fixture: any) => {
            const timeStr = toWAT(fixture.match_date);
            const isLive = ["LIVE", "HT", "1H", "2H", "ET", "PEN"].includes(fixture.match_status || "");
            const isFinished = ["FT", "AET", "Pen"].includes(fixture.match_status || "");
            const hasScore = fixture.home_score != null && fixture.away_score != null;

            return (
              <button
                key={fixture.id}
                onClick={() => onSelectFixture(fixture.id)}
                className={cn(
                  "interactive-card group w-full text-left rounded-2xl border px-4 py-3 deco-corners deco-arc-double",
                  isLive ? "border-red-500/15 bg-red-500/[0.03] deco-live-scan" : "border-white/[0.04] bg-white/[0.02]"
                )}
              >
                <div className="flex items-center gap-3">
                  {/* Time / Status */}
                  <div className="w-11 shrink-0 text-center">
                    {isLive ? (
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-2xs font-black uppercase text-red-400 animate-pulse">Live</span>
                        {fixture.live_minute && <span className="text-2xs text-red-400/60 tabular-nums">{fixture.live_minute}'</span>}
                      </div>
                    ) : isFinished ? (
                      <span className="text-2xs font-bold uppercase text-white/30">FT</span>
                    ) : (
                      <span className="text-sm font-bold tabular-nums text-white/45">{timeStr}</span>
                    )}
                  </div>

                  {/* Teams */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <TeamLogo src={fixture.home_team_logo} name={fixture.home_team_name} teamId={fixture.home_team_id} size="sm" />
                      <span className="text-sm font-bold text-white truncate">{fixture.home_team_name}</span>
                      {hasScore && <span className="ml-auto text-base font-black tabular-nums text-white">{fixture.home_score}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <TeamLogo src={fixture.away_team_logo} name={fixture.away_team_name} teamId={fixture.away_team_id} size="sm" />
                      <span className="text-sm font-bold text-white/65 truncate">{fixture.away_team_name}</span>
                      {hasScore && <span className="ml-auto text-base font-black tabular-nums text-white/65">{fixture.away_score}</span>}
                    </div>
                  </div>

                  {/* Badges + Chevron */}
                  <div className="flex items-center gap-2 shrink-0">
                    {fixture.is_safe_bet && (
                      <span className="hidden sm:block text-2xs font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">Safe</span>
                    )}
                    {fixture.is_value_bet && (
                      <span className="hidden sm:block text-2xs font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase tracking-wider">Value</span>
                    )}
                    <ChevronRight className="w-3.5 h-3.5 text-white/15 group-hover:text-white/30 transition-colors" />
                  </div>
                </div>
              </button>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
