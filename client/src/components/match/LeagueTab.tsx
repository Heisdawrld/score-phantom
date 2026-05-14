import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { LeagueLogo } from "@/components/LeagueLogo";

export function LeagueTab({ d }: any) {
  const st = Array.isArray(d?.standings) && d.standings.length ? d.standings : Array.isArray(d?.meta?.standings) ? d.meta.standings : [];
  const fix = d?.fixture || {};
  const leagueId = fix.bsd_league_id || fix.tournament_id || null;

  if (!st.length) return (
    <div className="text-center py-12 text-white/25">
      <Trophy className="w-10 h-10 mx-auto mb-3 opacity-30" />
      <p>League standings not available</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="relative rounded-2xl overflow-hidden mb-2">
        {/* Cinematic green glow backdrop */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent" />
          <div className="absolute -top-10 -right-10 w-[200%] h-[200%] opacity-[0.07]" style={{ background: 'repeating-linear-gradient(135deg, transparent, transparent 40px, rgba(16,231,116,0.3) 40px, rgba(16,231,116,0.3) 42px)' }} />
          <div className="absolute bottom-0 left-0 w-[60%] h-[80%] bg-primary/10 blur-[60px] rounded-full" />
          <div className="absolute top-0 right-[20%] w-[40%] h-[60%] bg-primary/8 blur-[50px] rounded-full" />
        </div>
        <div className="relative z-10 border border-primary/15 p-4 backdrop-blur-sm h-full">
        <p className="text-[10px] font-black text-white/40 uppercase tracking-wider mb-3 flex items-center gap-2">
          <LeagueLogo leagueId={leagueId} name={fix.tournament_name || "League"} size="sm" />
          {fix.tournament_name || "League"} Table
        </p>
        {/* Table header */}
        <div className="flex text-[9px] text-white/25 font-bold px-2 mb-1 gap-0">
          <span className="w-5">#</span>
          <span className="flex-1">Club</span>
          <span className="w-5 text-center">P</span>
          <span className="w-5 text-center">W</span>
          <span className="w-5 text-center">D</span>
          <span className="w-5 text-center">L</span>
          <span className="w-7 text-center">GD</span>
          <span className="w-7 text-right">Pts</span>
        </div>
        <div className="flex flex-col gap-0.5">
          {st.slice(0, 20).map((r: any, i: number) => {
            const hi = [fix.home_team_name, fix.away_team_name].some((n: string) => (n || "").toLowerCase().includes((r.team || "").toLowerCase().split(" ")[0]));
            const gd = r.goal_difference ?? r.gd ?? null; const gdN = Number(gd);
            const gdStr = gd !== null ? (gdN > 0 ? "+" + gd : String(gd)) : "-";
            return (
              <div key={i} className={cn("flex items-center gap-0 px-2 py-1.5 rounded-lg text-xs", hi ? "bg-primary/10 border border-primary/20" : "")}>
                <span className={cn("w-5 font-bold shrink-0", hi ? "text-primary" : "text-white/30")}>{r.position}</span>
                <span className={cn("flex-1 font-semibold truncate mr-1", hi ? "text-primary" : "text-white/65")}>{r.team}</span>
                <span className="w-5 text-center text-white/35">{r.played ?? "-"}</span>
                <span className="w-5 text-center text-white/35">{r.won ?? "-"}</span>
                <span className="w-5 text-center text-white/35">{r.drawn ?? "-"}</span>
                <span className="w-5 text-center text-white/35">{r.lost ?? "-"}</span>
                <span className={cn("w-7 text-center font-bold", gdN > 0 ? "text-primary/60" : gdN < 0 ? "text-red-400/60" : "text-white/25")}>{gdStr}</span>
                <span className={cn("w-7 text-right font-black", hi ? "text-primary" : "text-white")}>{r.points ?? "-"}</span>
              </div>
            );
          })}
        </div>
      </div>
      </div>

      {/* Team position highlight */}
      {[fix.home_team_name, fix.away_team_name].filter(Boolean).map((team: string) => {
        const row = st.find((r: any) => (r.team || "").toLowerCase().includes(team.toLowerCase().split(" ")[0]));
        if (!row) return null;
        return (
          <div key={team} className="relative rounded-2xl overflow-hidden mb-2">
            {/* Cinematic green glow backdrop */}
            <div className="absolute inset-0 z-0 pointer-events-none">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent" />
              <div className="absolute -top-10 -right-10 w-[200%] h-[200%] opacity-[0.07]" style={{ background: 'repeating-linear-gradient(135deg, transparent, transparent 40px, rgba(16,231,116,0.3) 40px, rgba(16,231,116,0.3) 42px)' }} />
              <div className="absolute bottom-0 left-0 w-[60%] h-[80%] bg-primary/10 blur-[60px] rounded-full" />
              <div className="absolute top-0 right-[20%] w-[40%] h-[60%] bg-primary/8 blur-[50px] rounded-full" />
            </div>
            <div className="relative z-10 border border-primary/15 p-4 backdrop-blur-sm h-full">
            <p className="text-[10px] font-black text-white/40 uppercase tracking-wider mb-2">{team}</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center">
                <p className="text-2xl font-black text-primary">{row.position}</p>
                <p className="text-[9px] text-white/30 uppercase">Position</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-black text-white">{row.points}</p>
                <p className="text-[9px] text-white/30 uppercase">Points</p>
                <p className="text-[8px] text-white/20">{row.played} matches played</p>
              </div>
              <div className="text-center">
                <p className={cn("text-2xl font-black tabular-nums", (Number(row.goal_difference ?? row.gd ?? 0) >= 0) ? "text-primary" : "text-red-400")}>
                  {Number(row.goal_difference ?? row.gd ?? 0) >= 0 ? "+" : ""}{row.goal_difference ?? row.gd ?? 0}
                </p>
                <p className="text-[9px] text-white/30 uppercase">Goal Diff</p>
              </div>
            </div>
          </div>
          </div>
        );
      })}
    </div>
  );
}
