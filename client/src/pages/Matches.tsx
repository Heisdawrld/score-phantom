import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/api";
import { useAccess } from "@/hooks/use-access";
import { motion } from "framer-motion";
import { Search, ChevronRight, Zap, X, Sparkles } from "lucide-react";
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

// ── Confidence color mapping ──────────────────────────────────────────────────
// Returns tailwind classes for confidence pill + glow based on the engine's
// confidence_model (HIGH/MEDIUM/LOW/LEAN).
function getConfidenceStyle(level?: string) {
  switch ((level || "").toUpperCase()) {
    case "HIGH":   return { pill: "bg-primary/15 text-primary border-primary/25",  glow: "shadow-[0_0_12px_rgba(16,231,116,0.15)]", bar: "bg-primary" };
    case "MEDIUM": return { pill: "bg-amber-400/12 text-amber-300 border-amber-400/20", glow: "", bar: "bg-amber-400" };
    case "LOW":    return { pill: "bg-white/8 text-white/50 border-white/10", glow: "", bar: "bg-white/40" };
    case "LEAN":   return { pill: "bg-white/5 text-white/35 border-white/8", glow: "", bar: "bg-white/25" };
    default:       return { pill: "bg-primary/10 text-primary/80 border-primary/15", glow: "", bar: "bg-primary/70" };
  }
}

// ── Edge indicator — shows model vs market disagreement ──────────────────────
function EdgeBadge({ edge }: { edge?: number }) {
  if (edge == null || isNaN(edge)) return null;
  const pct = Math.round(edge * 100);
  if (pct <= 0) return null;
  const tier = pct >= 15 ? "text-primary" : pct >= 8 ? "text-amber-300" : "text-white/40";
  return (
    <span className={cn("text-2xs font-black tabular-nums", tier)}>
      +{pct}%
    </span>
  );
}

// ── Game script tag — compact contextual label for the engine's script ────────
// Maps the engine's script_primary (e.g., "Dominant Home Pressure") to a short
// tag with an icon + color. Helps users understand WHY a pick was made at a glance.
function ScriptTag({ script }: { script?: string }) {
  if (!script) return null;
  const s = script.toLowerCase();
  let icon = "⚔️";
  let color = "text-white/35 bg-white/5 border-white/8";
  if (s.includes("dominant") && s.includes("home")) { icon = "🏠"; color = "text-primary/80 bg-primary/8 border-primary/15"; }
  else if (s.includes("dominant") && s.includes("away")) { icon = "✈️"; color = "text-accent-blue/80 bg-accent-blue/8 border-accent-blue/15"; }
  else if (s.includes("tight") || s.includes("low event")) { icon = "🛡️"; color = "text-amber-300/80 bg-amber-400/8 border-amber-400/15"; }
  else if (s.includes("open") || s.includes("end-to-end") || s.includes("high event")) { icon = "⚡"; color = "text-primary/80 bg-primary/8 border-primary/15"; }
  else if (s.includes("balanced")) { icon = "⚖️"; color = "text-white/50 bg-white/6 border-white/10"; }
  return (
    <span className={cn("inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold border tabular-nums shrink-0", color)} title={script}>
      <span className="text-[10px] leading-none">{icon}</span>
      <span className="truncate max-w-[60px]">{script.replace(/^(Dominant|Tight|Open|Balanced)\s/, '').split(' ').slice(0,2).join(' ')}</span>
    </span>
  );
}

export default function Matches() {
  const [, setLocation] = useLocation();
  const { isPremium } = useAccess();
  const todayIso = new Date().toLocaleDateString("en-CA",{timeZone:"Africa/Lagos"});
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [search, setSearch] = useState("");
  const dates = getDates();
  const { data, isLoading } = useQuery({
    queryKey: ["/api/fixtures", selectedDate],
    queryFn: () => fetchApi("/fixtures?date="+selectedDate),
    staleTime: 3 * 60 * 1000,
  });

  useScrollRestoration("matches_list", !isLoading);
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

      {/* ── Sticky header: title · date pills · search ── */}
      <header className="sticky top-0 z-20 bg-[#060a0e]/95 backdrop-blur-xl border-b border-white/5">
        <div className="px-4 md:px-6 pt-4 pb-2 max-w-3xl mx-auto">
          <h1 className="text-2xl font-black text-white tracking-wide mb-3">Matches</h1>
          <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar touch-pan-x overscroll-x-contain -mx-1 px-1">
            {dates.map(d => (
              <button key={d.iso} onClick={()=>setSelectedDate(d.iso)}
                aria-pressed={selectedDate===d.iso}
                className={cn("shrink-0 min-w-[44px] min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold transition-all",
                  selectedDate===d.iso
                    ? "bg-accent-blue text-white border border-accent-blue/60 shadow-[0_0_18px_rgba(48,128,255,0.35)]"
                    : "bg-white/6 text-white/55 border border-white/5 hover:text-white/85 hover:bg-white/8")}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
        <div className="px-4 md:px-6 pb-3 max-w-3xl mx-auto">
          <div className="flex items-center gap-2.5 bg-white/5 border border-white/8 rounded-xl px-3.5 py-2.5 transition-colors focus-within:border-accent-blue/40">
            <Search size={16} className="text-white/40 shrink-0"/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search teams or leagues"
              className="flex-1 bg-transparent text-base text-white placeholder:text-white/30 outline-none"/>
            {search && (
              <button onClick={()=>setSearch("")} aria-label="Clear search"
                className="text-white/30 hover:text-white/70 transition-colors shrink-0 p-1 -mr-1">
                <X size={14}/>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Match list, grouped by league ── */}
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 md:px-6 py-4 flex flex-col gap-5 relative z-10">
        {isLoading && Array.from({length:6}).map((_,i)=>(
          <div key={i} className="h-[80px] rounded-2xl bg-white/4 sp-shimmer"/>
        ))}

        {!isLoading && filtered.length===0 && (
          <div className="text-center py-20 text-white/35">
            <p className="text-5xl mb-4">📅</p>
            <p className="font-bold text-white/55">No matches found</p>
            <p className="text-sm mt-1">{search ? "Try a different search" : "Check another date"}</p>
          </div>
        )}

        {!isLoading && Object.entries(grouped).map(([tourneyId, fixtures], groupIdx) => {
          const first = fixtures[0];
          const leagueName = first?.tournament_name || "Unknown League";
          return (
            <section key={tourneyId} className={cn(groupIdx > 0 && "pt-5 border-t border-white/6")}>
              <header className="flex items-center gap-2 px-1 mb-2.5">
                <img
                  src={`https://sports.bzzoiro.com/img/league/${tourneyId}/`}
                  className="w-4 h-4 rounded-sm object-contain"
                  onError={e=>{(e.currentTarget as HTMLImageElement).style.display="none";}}
                  alt={leagueName}
                />
                <span className="text-xs font-bold text-white/40 uppercase tracking-wider truncate flex-1">{leagueName}</span>
                <span className="text-2xs font-semibold text-white/25 tabular-nums">{fixtures.length}</span>
              </header>
              <div className="flex flex-col gap-2">
                {fixtures.map((f: any) => {
                  const isLive = f.match_status==="LIVE";
                  const isFT = f.match_status==="FT";
                  const hasPred = isPremium && f.best_pick_selection;
                  const prob = f.best_pick_probability ? Math.round(f.best_pick_probability * 100) : null;
                  const confStyle = getConfidenceStyle(f.pick_confidence_level);
                  const isHighProb = prob != null && prob >= 70;
                  return (
                    <motion.button key={f.id} whileTap={{scale:0.98}}
                      onClick={()=>setLocation("/matches/"+f.id)}
                      className={cn("interactive-card w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl border text-left transition-all",
                        isLive ? "border-red-500/30 bg-red-500/5" : hasPred && isHighProb ? cn("border-primary/15 bg-white/[0.03]", confStyle.glow) : "border-white/6 bg-white/3")}>
                      <div className="w-14 shrink-0 text-center">
                        {isLive
                          ? <span className="text-2xs font-black text-red-400 block leading-tight">
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse mr-1 align-middle"/>
                              LIVE<br/>{f.live_minute||""}
                            </span>
                          : isFT
                          ? <span className="text-xs font-bold text-white/40">FT</span>
                          : <span className="text-sm font-bold text-white/60 tabular-nums">{toWAT(f.match_date)}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <TeamLogo src={f.home_team_logo} name={f.home_team_name} size="sm"/>
                          <span className="text-sm font-semibold text-white truncate flex-1">{f.home_team_name}</span>
                          {(isLive||isFT) && <span className="text-base font-black text-white w-5 text-right tabular-nums">{f.home_score??0}</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <TeamLogo src={f.away_team_logo} name={f.away_team_name} size="sm"/>
                          <span className="text-sm font-semibold text-white/70 truncate flex-1">{f.away_team_name}</span>
                          {(isLive||isFT) && <span className="text-base font-black text-white/80 w-5 text-right tabular-nums">{f.away_score??0}</span>}
                        </div>
                        {/* ── Enhanced pick row: pill + probability bar + script + edge ── */}
                        <div className="mt-2 flex items-center gap-2 min-h-[20px]">
                          {hasPred ? (
                            <>
                              <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-2xs font-bold", confStyle.pill)}>
                                <Zap size={9} className="shrink-0"/>
                                {f.best_pick_selection}
                              </span>
                              {prob != null && (
                                <div className="flex items-center gap-1 flex-1 min-w-0">
                                  <div className="flex-1 h-1 rounded-full bg-white/8 overflow-hidden min-w-[24px]">
                                    <div className={cn("h-full rounded-full transition-all", confStyle.bar)} style={{ width: `${prob}%` }}/>
                                  </div>
                                  <span className="text-2xs font-bold text-white/60 tabular-nums shrink-0">{prob}%</span>
                                </div>
                              )}
                              <ScriptTag script={f.pick_script} />
                              <EdgeBadge edge={f.best_pick_edge} />
                            </>
                          ) : isPremium ? (
                            <span className="text-2xs font-medium text-white/20 flex items-center gap-1">
                              <span className="w-1 h-1 rounded-full bg-white/15"/>
                              No pick
                            </span>
                          ) : (
                            <span className="text-2xs font-medium text-white/20 flex items-center gap-1">
                              <Sparkles size={9} className="text-white/15"/>
                              Premium
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-white/25 shrink-0"/>
                    </motion.button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}
