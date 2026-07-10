import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/api";
import { useAccess } from "@/hooks/use-access";
import { motion } from "framer-motion";
import { Search, ChevronRight, Zap, X, Sparkles, Filter } from "lucide-react";
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

// ── Game script metadata — canonical map of snake_case keys to labels ────────
// The engine stores script_primary as snake_case (e.g., "tight_low_event").
// This map converts to a human label + icon + color for both the card tag and
// the filter chips. Keeping the map in one place ensures the card tag and the
// filter chips stay in sync.
type ScriptMeta = { label: string; short: string; icon: string; color: string; chipActive: string };
const SCRIPT_META: Record<string, ScriptMeta> = {
  dominant_home_pressure: {
    label: "Dominant Home Pressure", short: "Home Pressure", icon: "🏠",
    color: "text-primary/80 bg-primary/8 border-primary/15",
    chipActive: "bg-primary/20 text-primary border-primary/40",
  },
  dominant_away_pressure: {
    label: "Dominant Away Pressure", short: "Away Pressure", icon: "✈️",
    color: "text-accent-blue/80 bg-accent-blue/8 border-accent-blue/15",
    chipActive: "bg-accent-blue/20 text-accent-blue border-accent-blue/40",
  },
  open_end_to_end: {
    label: "Open End-to-End", short: "Open", icon: "⚡",
    color: "text-primary/80 bg-primary/8 border-primary/15",
    chipActive: "bg-primary/20 text-primary border-primary/40",
  },
  tight_low_event: {
    label: "Tight Low Event", short: "Tight", icon: "🛡️",
    color: "text-amber-300/80 bg-amber-400/8 border-amber-400/15",
    chipActive: "bg-amber-400/20 text-amber-300 border-amber-400/40",
  },
  balanced_high_event: {
    label: "Balanced High Event", short: "Balanced", icon: "⚖️",
    color: "text-white/50 bg-white/6 border-white/10",
    chipActive: "bg-white/15 text-white/80 border-white/25",
  },
};
const DEFAULT_SCRIPT_META: ScriptMeta = {
  label: "Balanced", short: "Balanced", icon: "⚔️",
  color: "text-white/35 bg-white/5 border-white/8",
  chipActive: "bg-white/15 text-white/80 border-white/25",
};
function getScriptMeta(script?: string | null): ScriptMeta | null {
  if (!script) return null;
  return SCRIPT_META[script.toLowerCase()] || { ...DEFAULT_SCRIPT_META, label: script };
}

// ── Game script tag — compact contextual label for the engine's script ────────
// Maps the engine's script_primary (snake_case from DB) to a short tag with an
// icon + color. Helps users understand the match profile at a glance — even
// when no pick has been generated yet.
function ScriptTag({ script, size = "sm" }: { script?: string | null; size?: "sm" | "xs" }) {
  const meta = getScriptMeta(script);
  if (!meta) return null;
  const pad = size === "xs" ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-2xs";
  return (
    <span
      className={cn("inline-flex items-center gap-0.5 rounded border font-bold tabular-nums shrink-0", pad, meta.color)}
      title={meta.label}
    >
      <span className="text-[10px] leading-none">{meta.icon}</span>
      <span className="truncate max-w-[70px]">{meta.short}</span>
    </span>
  );
}

// ── Odds chip trio — compact 1X2 odds display ─────────────────────────────────
// Shows home/draw/away odds in a tight column on the right of each card. Only
// renders when at least the home + away odds exist (draw may be null for
// basketball or markets without a draw).
function OddsTrio({ home, draw, away }: { home?: number | null; draw?: number | null; away?: number | null }) {
  if (home == null && away == null) return null;
  const fmt = (v?: number | null) => (v != null && !isNaN(v)) ? v.toFixed(2) : "—";
  return (
    <div className="shrink-0 flex flex-col items-end gap-0.5 mr-1">
      <div className="flex items-center gap-1">
        <span className="text-2xs font-bold text-white/40 tabular-nums">{fmt(home)}</span>
        <span className="text-[8px] font-bold text-white/25 uppercase">1</span>
      </div>
      {draw != null && (
        <div className="flex items-center gap-1">
          <span className="text-2xs font-bold text-white/40 tabular-nums">{fmt(draw)}</span>
          <span className="text-[8px] font-bold text-white/25 uppercase">X</span>
        </div>
      )}
      <div className="flex items-center gap-1">
        <span className="text-2xs font-bold text-white/40 tabular-nums">{fmt(away)}</span>
        <span className="text-[8px] font-bold text-white/25 uppercase">2</span>
      </div>
    </div>
  );
}

export default function Matches() {
  const [, setLocation] = useLocation();
  const { isPremium } = useAccess();
  const todayIso = new Date().toLocaleDateString("en-CA",{timeZone:"Africa/Lagos"});
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [search, setSearch] = useState("");
  const [scriptFilter, setScriptFilter] = useState<string>("all"); // "all" | script key
  const dates = getDates();
  const { data, isLoading } = useQuery({
    queryKey: ["/api/fixtures", selectedDate],
    queryFn: () => fetchApi("/fixtures?date="+selectedDate),
    staleTime: 3 * 60 * 1000,
  });

  useScrollRestoration("matches_list", !isLoading);
  const allFixtures: any[] = (data as any)?.fixtures || [];

  // ── Build the list of script filters actually present in today's fixtures ──
  // Only show filter chips for scripts that exist on the selected date, so the
  // chip strip stays compact and relevant.
  const availableScripts = useMemo(() => {
    const set = new Set<string>();
    allFixtures.forEach(f => { if (f.pick_script) set.add(f.pick_script.toLowerCase()); });
    return Array.from(set);
  }, [allFixtures]);

  const filtered = useMemo(() => {
    let list = allFixtures;
    if (scriptFilter !== "all") {
      list = list.filter(f => (f.pick_script || "").toLowerCase() === scriptFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(f => (f.home_team_name + f.away_team_name + f.tournament_name).toLowerCase().includes(q));
    }
    return list;
  }, [allFixtures, search, scriptFilter]);

  const grouped: Record<string,any[]> = {};
  filtered.forEach(f => {
    const k = f.tournament_id || f.tournament_name || "Other";
    if (!grouped[k]) grouped[k] = [];
    grouped[k].push(f);
  });

  // ── Quick stats for the summary bar ─────────────────────────────────────────
  const stats = useMemo(() => {
    let withPick = 0, withEdge = 0, live = 0;
    allFixtures.forEach(f => {
      if (isPremium && f.best_pick_selection) withPick++;
      if (f.best_pick_edge != null && f.best_pick_edge > 0) withEdge++;
      if (f.match_status === "LIVE") live++;
    });
    return { total: allFixtures.length, withPick, withEdge, live };
  }, [allFixtures, isPremium]);

  return (
    <div className="flex flex-col min-h-screen bg-[#060a0e] text-white pb-24 selection:bg-primary/30 relative">
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80vw] h-[50vh] bg-primary/5 blur-[120px] opacity-50 rounded-full mix-blend-screen" />
      </div>

      {/* ── Sticky header: title · date pills · search · script filters ── */}
      <header className="sticky top-0 z-20 bg-[#060a0e]/95 backdrop-blur-xl border-b border-white/5">
        <div className="px-4 md:px-6 pt-4 pb-2 max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-2xl font-black text-white tracking-wide">Matches</h1>
            {/* ── Summary stats badge ── */}
            <div className="flex items-center gap-2 text-2xs">
              {stats.live > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse"/>
                  {stats.live} LIVE
                </span>
              )}
              {stats.withPick > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/8 border border-primary/15 text-primary font-bold">
                  <Zap size={9}/>
                  {stats.withPick} picks
                </span>
              )}
              {stats.withEdge > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-400/8 border border-amber-400/15 text-amber-300 font-bold">
                  +{stats.withEdge} edges
                </span>
              )}
            </div>
          </div>
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
          {/* ── Script filter chip strip (NEW) ── */}
          {availableScripts.length > 1 && (
            <div className="flex items-center gap-1.5 mt-2.5 overflow-x-auto hide-scrollbar touch-pan-x -mx-1 px-1">
              <Filter size={11} className="text-white/30 shrink-0 ml-0.5"/>
              <button
                onClick={()=>setScriptFilter("all")}
                aria-pressed={scriptFilter==="all"}
                className={cn("shrink-0 min-h-[28px] px-2.5 py-1 rounded-lg text-2xs font-bold border transition-all",
                  scriptFilter==="all"
                    ? "bg-white/15 text-white border-white/30"
                    : "bg-white/4 text-white/45 border-white/6 hover:text-white/70")}
              >
                All
              </button>
              {availableScripts.map(key => {
                const meta = getScriptMeta(key);
                if (!meta) return null;
                const active = scriptFilter === key;
                return (
                  <button
                    key={key}
                    onClick={()=>setScriptFilter(active ? "all" : key)}
                    aria-pressed={active}
                    className={cn("shrink-0 min-h-[28px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-2xs font-bold border transition-all",
                      active ? meta.chipActive : "bg-white/4 text-white/45 border-white/6 hover:text-white/70")}
                  >
                    <span className="text-[11px] leading-none">{meta.icon}</span>
                    {meta.short}
                  </button>
                );
              })}
            </div>
          )}
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
            <p className="text-sm mt-1">
              {scriptFilter !== "all" ? "No matches with this script — try another filter" : search ? "Try a different search" : "Check another date"}
            </p>
            {scriptFilter !== "all" && (
              <button onClick={()=>setScriptFilter("all")} className="mt-4 px-3 py-1.5 rounded-lg bg-white/8 text-white/70 text-xs font-bold hover:bg-white/12">
                Clear filter
              </button>
            )}
          </div>
        )}

        {!isLoading && Object.entries(grouped).map(([tourneyId, fixtures], groupIdx) => {
          const first = fixtures[0];
          const leagueName = first?.tournament_name || "Unknown League";
          const country = first?.category_name || "";
          return (
            <section key={tourneyId} className={cn(groupIdx > 0 && "pt-5 border-t border-white/6")}>
              <header className="flex items-center gap-2 px-1 mb-2.5">
                <img
                  src={`https://sports.bzzoiro.com/img/league/${tourneyId}/`}
                  className="w-4 h-4 rounded-sm object-contain"
                  onError={e=>{(e.currentTarget as HTMLImageElement).style.display="none";}}
                  alt={leagueName}
                />
                <span className="text-xs font-bold text-white/50 uppercase tracking-wider truncate flex-1">{leagueName}</span>
                {country && (
                  <span className="text-2xs font-semibold text-white/30 truncate hidden sm:inline">· {country}</span>
                )}
                <span className="text-2xs font-semibold text-white/25 tabular-nums shrink-0 ml-1">{fixtures.length}</span>
              </header>
              <div className="flex flex-col gap-2">
                {fixtures.map((f: any) => {
                  const isLive = f.match_status==="LIVE";
                  const isFT = f.match_status==="FT";
                  const hasPred = isPremium && f.best_pick_selection;
                  const prob = f.best_pick_probability ? Math.round(f.best_pick_probability * 100) : null;
                  const confStyle = getConfidenceStyle(f.pick_confidence_level);
                  const isHighProb = prob != null && prob >= 70;
                  const scriptMeta = getScriptMeta(f.pick_script);
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
                        <div className="mt-2 flex items-center gap-2 min-h-[20px] flex-wrap">
                          {hasPred ? (
                            <>
                              <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-2xs font-bold", confStyle.pill)}>
                                <Zap size={9} className="shrink-0"/>
                                {f.best_pick_selection}
                              </span>
                              {prob != null && (
                                <div className="flex items-center gap-1 flex-1 min-w-[40px]">
                                  <div className="flex-1 h-1 rounded-full bg-white/8 overflow-hidden min-w-[24px]">
                                    <div className={cn("h-full rounded-full transition-all", confStyle.bar)} style={{ width: `${prob}%` }}/>
                                  </div>
                                  <span className="text-2xs font-bold text-white/60 tabular-nums shrink-0">{prob}%</span>
                                </div>
                              )}
                              <ScriptTag script={f.pick_script} />
                              <EdgeBadge edge={f.best_pick_edge} />
                            </>
                          ) : (
                            <>
                              {/* Show script tag even without a pick — gives match-profile context */}
                              {scriptMeta ? (
                                <ScriptTag script={f.pick_script} />
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
                            </>
                          )}
                        </div>
                      </div>
                      {/* ── Odds trio on the right (compact) ── */}
                      {!isLive && !isFT && <OddsTrio home={f.odds_home} draw={f.odds_draw} away={f.odds_away} />}
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
