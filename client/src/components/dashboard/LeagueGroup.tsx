import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { LeagueLogo } from "@/components/LeagueLogo";
import { cn } from "@/lib/utils";
import { PremiumFixtureCard } from "@/components/discovery/PremiumFixtureCard";

function toWAT(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("en-NG", {
      timeZone: "Africa/Lagos",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
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
  isPremium,
}: {
  tournament: string;
  tournamentId?: string | number | null;
  fixtures: any[];
  onSelectFixture: (id: string) => void;
  defaultOpen: boolean;
  isPremium: boolean;
}) {
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

  const liveCount = fixtures.filter((f: any) =>
    ["LIVE", "HT", "1H", "2H", "ET"].includes((f.match_status || "").toUpperCase())
  ).length;

  return (
    <div>
      {/* League header row */}
      <button
        className="group w-full flex items-center justify-between gap-3 px-2 py-2 text-left hover:bg-white/[0.02] rounded-lg transition-colors"
        onClick={handleToggle}
      >
        <div className="flex min-w-0 items-center gap-2">
          <LeagueLogo leagueId={leagueId} name={tournament} size="sm" />
          <h3 className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-white/40 group-hover:text-white/60 transition-colors">
            {tournament}
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {liveCount > 0 && (
            <span className="flex items-center gap-1 text-[9px] font-black text-red-400 uppercase tracking-wider">
              <span className="w-1 h-1 rounded-full bg-red-400 animate-pulse" />
              Live {liveCount > 1 ? `(${liveCount})` : ""}
            </span>
          )}
          <span className="text-[10px] font-bold text-white/18 tabular-nums">
            {fixtures.length}
          </span>
          <ChevronDown
            className={cn(
              "h-3 w-3 text-white/18 transition-transform duration-200",
              open && "rotate-180"
            )}
          />
        </div>
      </button>

      {/* Fixtures list */}
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.14 }}
          className="rounded-xl border border-white/[0.04] overflow-hidden bg-white/[0.01] divide-y divide-white/[0.035]"
        >
          {fixtures.map((fixture: any) => {
            const timeStr = toWAT(fixture.match_date);
            const statusUpper = (fixture.match_status || "").toUpperCase();
            const isLive = ["LIVE", "HT", "1H", "2H", "ET", "PEN"].includes(statusUpper);
            const isFinished = ["FT", "AET"].includes(statusUpper);

            return (
              <PremiumFixtureCard
                key={fixture.id}
                onClick={() => onSelectFixture(fixture.id)}
                homeTeam={fixture.home_team_name}
                awayTeam={fixture.away_team_name}
                homeLogo={fixture.home_team_logo}
                awayLogo={fixture.away_team_logo}
                timeLabel={timeStr}
                statusLabel={isLive ? "LIVE" : isFinished ? "FT" : null}
                liveMinuteLabel={
                  fixture.live_minute ? String(fixture.live_minute) : null
                }
                homeScore={fixture.home_score}
                awayScore={fixture.away_score}
                pickLabel={fixture.best_pick_selection}
                probabilityPct={
                  fixture.best_pick_probability != null
                    ? Number(fixture.best_pick_probability) * 100
                    : null
                }
                advisorStatus={fixture.advisor_status}
                valueTier={fixture.value_tier}
                ev={fixture.ev}
                isSafeBet={fixture.is_safe_bet}
                isValueBet={fixture.is_value_bet}
                isAccaEligible={fixture.is_acca_eligible}
                lineupIntelligence={fixture.lineup_intelligence}
                verdict={fixture.verdict}
                isPremium={isPremium}
                showPrediction={false}
              />
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
