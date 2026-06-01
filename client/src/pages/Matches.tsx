import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/api";
import { useAccess } from "@/hooks/use-access";
import { motion } from "framer-motion";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useScrollRestoration } from "@/hooks/use-scroll-restoration";
import { PremiumFixtureCard } from "@/components/discovery/PremiumFixtureCard";

function toWAT(d: string) {
  try { return new Date(d).toLocaleTimeString("en-NG", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit", hour12: false }); } catch { return ""; }
}

function getDates() {
  const dates = [];
  for (let i = -1; i <= 6; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const iso = d.toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
    const label = i === 0 ? "Today" : i === -1 ? "Yest" : i === 1 ? "Tom" : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });
    dates.push({ iso, label });
  }
  return dates;
}

export default function Matches() {
  const [, setLocation] = useLocation();
  const { isPremium } = useAccess();
  const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [search, setSearch] = useState("");
  const dates = getDates();

  const { data, isLoading } = useQuery({
    queryKey: ["/api/fixtures", selectedDate],
    queryFn: () => fetchApi("/fixtures?date=" + selectedDate),
    staleTime: 3 * 60 * 1000,
  });

  useScrollRestoration("matches_list", !isLoading);
  const allFixtures: any[] = (data as any)?.fixtures || [];
  const filtered = search.trim()
    ? allFixtures.filter(f => (f.home_team_name + f.away_team_name + f.tournament_name).toLowerCase().includes(search.toLowerCase()))
    : allFixtures;

  const grouped: Record<string, any[]> = {};
  filtered.forEach(f => {
    const k = f.tournament_id || f.tournament_name || "Other";
    if (!grouped[k]) grouped[k] = [];
    grouped[k].push(f);
  });

  return (
    <div className="flex flex-col min-h-screen bg-[#060a0e] text-white pb-24 selection:bg-primary/30 relative">
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80vw] h-[50vh] bg-primary/5 blur-[120px] opacity-50 rounded-full mix-blend-screen" />
      </div>

      <div className="sticky top-0 z-20 bg-[#060a0e]/95 backdrop-blur-xl border-b border-white/5 relative z-10">
        <div className="px-4 pt-4 pb-2">
          <h1 className="text-xl font-black text-white tracking-wide mb-3">Matches</h1>
          <p className="mb-3 text-xs text-white/35">Open any match to view its prediction panel and full match read.</p>
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar touch-pan-x overscroll-x-contain">
            {dates.map(d => (
              <button
                key={d.iso}
                onClick={() => setSelectedDate(d.iso)}
                className={cn(
                  "shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all",
                  selectedDate === d.iso ? "bg-primary text-black shadow-[0_0_12px_rgba(16,231,116,0.4)]" : "bg-white/6 text-white/50 hover:text-white/80"
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 bg-white/5 border border-white/8 rounded-xl px-3 py-2">
            <Search size={14} className="text-white/30 shrink-0" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search team or league..." className="flex-1 bg-transparent text-sm text-white placeholder:text-white/25 outline-none" />
          </div>
        </div>
      </div>

      <div className="flex-1 w-full max-w-3xl mx-auto px-3 py-4 flex flex-col gap-4 relative z-10">
        {isLoading && Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 rounded-3xl bg-white/4 animate-pulse" />
        ))}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-16 text-white/30">
            <p className="text-4xl mb-3">📅</p>
            <p className="font-semibold">No matches found</p>
            <p className="text-xs mt-1">{search ? "Try a different search" : "Check another date"}</p>
          </div>
        )}

        {!isLoading && Object.entries(grouped).map(([tourneyId, fixtures]) => {
          const first = fixtures[0];
          const leagueName = first?.tournament_name || "Unknown League";
          return (
            <div key={tourneyId} className="mb-1">
              <div className="flex items-center gap-2 px-1 mb-2">
                <img
                  src={`https://sports.bzzoiro.com/img/league/${tourneyId}/`}
                  className="w-4 h-4 rounded-sm object-contain"
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  alt={leagueName}
                />
                <span className="text-[11px] font-black text-white/50 uppercase tracking-wider truncate">{leagueName}</span>
              </div>

              <div className="flex flex-col gap-2">
                {fixtures.map((f: any) => {
                  const status = (f.match_status || "").toUpperCase();
                  const isLive = ["LIVE", "HT", "1H", "2H", "ET", "PEN"].includes(status);
                  const isFinished = ["FT", "AET", "PEN"].includes(status);

                  return (
                    <motion.div key={f.id} whileHover={{ y: -1 }} whileTap={{ scale: 0.99 }}>
                      <PremiumFixtureCard
                        onClick={() => setLocation(`/matches/${f.id}`)}
                        homeTeam={f.home_team_name}
                        awayTeam={f.away_team_name}
                        homeLogo={f.home_team_logo}
                        awayLogo={f.away_team_logo}
                        timeLabel={toWAT(f.match_date)}
                        statusLabel={isLive ? 'LIVE' : isFinished ? 'FT' : null}
                        liveMinuteLabel={f.live_minute ? String(f.live_minute) : null}
                        homeScore={f.home_score}
                        awayScore={f.away_score}
                        pickLabel={f.best_pick_selection}
                        probabilityPct={f.best_pick_probability != null ? Number(f.best_pick_probability) * 100 : null}
                        advisorStatus={f.advisor_status}
                        valueTier={f.value_tier}
                        ev={f.ev}
                        isSafeBet={f.is_safe_bet}
                        isValueBet={f.is_value_bet}
                        isAccaEligible={f.is_acca_eligible}
                        lineupIntelligence={f.lineup_intelligence}
                        verdict={f.verdict}
                        isPremium={isPremium}
                      />
                    </motion.div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
