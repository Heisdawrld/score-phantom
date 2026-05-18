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

  const liveCount = fixtures.filter((f: any) => ["LIVE", "HT", "1H", "2H"].includes(f.match_status || "")).length;

  return (
    <div className="space-y-2">
      <button className="group w-full flex items-center justify-between gap-3 px-1 py-1 text-left" onClick={handleToggle}>
        <div className="flex min-w-0 items-center gap-2">
          <LeagueLogo leagueId={leagueId} name={tournament} size="sm" />
          <h3 className="truncate text-[11px] font-bold uppercase tracking-wider text-white/50 group-hover:text-white/70 transition-colors">
            {tournament}
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {liveCount > 0 && <span className="text-[9px] font-bold uppercase text-red-400">Live</span>}
          <span className="text-[10px] font-bold text-white/20">{fixtures.length}</span>
          <ChevronDown className={cn("h-3.5 w-3.5 text-white/20 transition-transform duration-200", open && "rotate-180")} />
        </div>
      </button>

      {open && (
        <motion.div className="space-y-2" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}>
          {fixtures.map((fixture: any) => {
            const timeStr = toWAT(fixture.match_date);
            const status = (fixture.match_status || "").toUpperCase();
            const isLive = ["LIVE", "HT", "1H", "2H", "ET", "PEN"].includes(status);
            const isFinished = ["FT", "AET", "PEN"].includes(status);

            return (
              <PremiumFixtureCard
                key={fixture.id}
                onClick={() => onSelectFixture(fixture.id)}
                homeTeam={fixture.home_team_name}
                awayTeam={fixture.away_team_name}
                homeLogo={fixture.home_team_logo}
                awayLogo={fixture.away_team_logo}
                timeLabel={timeStr}
                statusLabel={isLive ? 'LIVE' : isFinished ? 'FT' : null}
                liveMinuteLabel={fixture.live_minute ? String(fixture.live_minute) : null}
                homeScore={fixture.home_score}
                awayScore={fixture.away_score}
                pickLabel={fixture.best_pick_selection}
                probabilityPct={fixture.best_pick_probability != null ? Number(fixture.best_pick_probability) * 100 : null}
                advisorStatus={fixture.advisor_status}
                valueTier={fixture.value_tier}
                ev={fixture.ev}
                isSafeBet={fixture.is_safe_bet}
                isValueBet={fixture.is_value_bet}
                isAccaEligible={fixture.is_acca_eligible}
                lineupIntelligence={fixture.lineup_intelligence}
                verdict={fixture.verdict}
                isPremium={isPremium}
              />
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
