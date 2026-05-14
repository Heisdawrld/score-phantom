import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";
import { LeagueLogo } from "@/components/LeagueLogo";

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

export function UpcomingFixtures({ fixtures, onSelect }: { fixtures: any[]; onSelect: (id: string) => void }) {
  if (!fixtures.length) return null;

  const upcoming = fixtures
    .filter((f: any) => !["LIVE", "HT", "FT", "AET", "Pen"].includes(f.match_status || ""))
    .slice(0, 10);

  if (!upcoming.length) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Upcoming Fixtures</span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {upcoming.map((f: any) => {
          const time = toWAT(f.match_date);
          const homeName = f.home_team_name || "Home";
          const awayName = f.away_team_name || "Away";
          const league = f.tournament_name || "Competition";
          const leagueId = f.bsd_league_id || f.tournament_id || null;

          return (
            <button
              key={f.id}
              onClick={() => onSelect(f.id)}
              className="premium-surface rounded-[24px] p-4 hover:bg-white/[0.05] transition-all group text-left"
            >
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">{time}</span>
                <ChevronRight className="w-4 h-4 text-white/15 group-hover:text-primary transition-colors" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <TeamLogo src={f.home_team_logo} name={homeName} teamId={f.home_team_id} />
                  <span className="text-sm font-black text-white truncate">{homeName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <TeamLogo src={f.away_team_logo} name={awayName} teamId={f.away_team_id} />
                  <span className="text-sm font-black text-white/78 truncate">{awayName}</span>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 min-w-0">
                  <LeagueLogo leagueId={leagueId} name={league} size="sm" />
                  <p className="text-[10px] text-white/30 uppercase tracking-wider truncate">{league}</p>
                </div>
                <span className="premium-chip text-primary border-primary/20 bg-primary/10">View</span>
              </div>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
