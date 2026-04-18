import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import { Search, ChevronRight, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

import { useScrollRestoration } from "@/hooks/use-scroll-restoration";
import { TeamLogo } from "@/components/TeamLogo";

function toWAT(d: string) {
  try { return new Date(d).toLocaleTimeString("en-NG",{timeZone:"Africa/Lagos",hour:"2-digit",minute:"2-digit",hour12:false}); } catch { return ""; }
}
function getDates() {
  const dates = [];
  for (let i=-1; i<=6; i++) {
    const d = new Date(); d.setDate(d.getDate()+i);
    const iso = d.toLocaleDateString("en-CA",{timeZone:"Africa/Lagos"});
    const label = i===0?"Today":i===-1?"Yest":i===1?"Tom":d.toLocaleDateString("en-GB",{weekday:"short",day:"numeric"});
    dates.push({ iso, label });
  }
  return dates;
}

export default function Matches() {
  const { data: user } = useAuth();
  const [, setLocation] = useLocation();
  const isPremium = (user as any)?.has_access;
  const todayIso = new Date().toLocaleDateString("en-CA",{timeZone:"Africa/Lagos"});
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [search, setSearch] = useState("");
  const dates = getDates();
  const { data, isLoading } = useQuery({
    queryKey: ["/api/fixtures", selectedDate],
    queryFn: () => fetchApi("/fixtures?date="+selectedDate),
    staleTime: 3 * 60 * 1000,
  });

  useScrollRestoration("matches_list");
  const allFixtures: any[] = (data as any)?.fixtures || [];
  const filtered = search.trim()
    ? allFixtures.filter(f => (f.home_team_name+f.away_team_name+f.tournament_name).toLowerCase().includes(search.toLowerCase()))
    : allFixtures;
  const grouped: Record<string,any[]> = {};
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
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar touch-pan-x overscroll-x-contain">
            {dates.map(d => (
              <button key={d.iso} onClick={()=>setSelectedDate(d.iso)}
                className={cn("shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all",
                  selectedDate===d.iso?"bg-primary text-black shadow-[0_0_12px_rgba(16,231,116,0.4)]":"bg-white/6 text-white/50 hover:text-white/80")}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 bg-white/5 border border-white/8 rounded-xl px-3 py-2">
            <Search size={14} className="text-white/30 shrink-0"/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search team or league..." className="flex-1 bg-transparent text-sm text-white placeholder:text-white/25 outline-none"/>
          </div>
        </div>
      </div>
      <div className="flex-1 w-full max-w-lg mx-auto px-3 py-3 flex flex-col gap-3 relative z-10">
        {isLoading && Array.from({length:6}).map((_,i)=>(
          <div key={i} className="h-16 rounded-2xl bg-white/4 animate-pulse"/>
        ))}
        {!isLoading && filtered.length===0 && (
          <div className="text-center py-16 text-white/30">
            <p className="text-4xl mb-3">📅</p>
            <p className="font-semibold">No matches found</p>
            <p className="text-xs mt-1">{search?"Try a different search":"Check another date"}</p>
          </div>
        )}
        {!isLoading && Object.entries(grouped).map(([tourneyId, fixtures]) => {
          const first = fixtures[0];
          const leagueName = first?.tournament_name || "Unknown League";
          const flag = first?.country_flag;
          return (
            <div key={tourneyId} className="mb-1">
              <div className="flex items-center gap-2 px-1 mb-1.5">
                {flag
                  ? <img src={flag} className="w-4 h-4 rounded-sm object-contain" onError={e=>{(e.currentTarget as HTMLImageElement).style.display="none";}}/>
                  : <span className="text-sm">🏆</span>}
                <span className="text-[11px] font-black text-white/50 uppercase tracking-wider truncate">{leagueName}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {fixtures.map((f: any) => {
                  const isLive = f.match_status==="LIVE";
                  const isFT = f.match_status==="FT";
                  const hasPred = isPremium && f.best_pick_selection;
                  return (
                    <motion.button key={f.id} whileTap={{scale:0.98}}
                      onClick={()=>setLocation("/matches/"+f.id)}
                      className={cn("w-full flex items-center gap-3 px-3 py-3 rounded-2xl border transition-all text-left",
                        isLive?"border-red-500/30 bg-red-500/5":"border-white/6 bg-white/3 hover:bg-white/6")}>
                      <div className="w-12 shrink-0 text-center">
                        {isLive
                          ? <span className="text-[10px] font-black text-red-400 animate-pulse block leading-tight">LIVE<br/>{f.live_minute||""}</span>
                          : isFT
                          ? <span className="text-[10px] font-bold text-white/40">FT</span>
                          : <span className="text-[11px] font-bold text-white/60">{toWAT(f.match_date)}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <TeamLogo src={f.home_team_logo} name={f.home_team_name}/>
                          <span className="text-sm font-semibold text-white truncate flex-1">{f.home_team_name}</span>
                          {(isLive||isFT) && <span className="text-base font-black text-white w-5 text-right">{f.home_score??0}</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <TeamLogo src={f.away_team_logo} name={f.away_team_name}/>
                          <span className="text-sm font-semibold text-white/60 truncate flex-1">{f.away_team_name}</span>
                          {(isLive||isFT) && <span className="text-base font-black text-white/70 w-5 text-right">{f.away_score??0}</span>}
                        </div>
                        {hasPred && (
                          <div className="mt-1.5 flex items-center gap-1.5">
                            <Zap size={9} className="text-primary"/>
                            <span className="text-[10px] font-bold text-primary">{f.best_pick_selection}</span>
                            {f.best_pick_probability && <span className="text-[10px] text-white/35">{Math.round(f.best_pick_probability*100)}%</span>}
                          </div>
                        )}
                      </div>
                      <ChevronRight size={14} className="text-white/20 shrink-0"/>
                    </motion.button>
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
