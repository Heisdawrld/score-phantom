// v1
import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Zap, Lock, Crown, Microscope, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

function TeamLogo({ src, name, size=10 }: { src?: string; name: string; size?: number }) {
  const [err, setErr] = useState(false);
  const cls = "rounded-full object-contain bg-white/5 border border-white/10";
  if (src && !err) return <img src={src} alt={name} onError={()=>setErr(true)} className={cls} style={{width:size*4,height:size*4}} loading="lazy"/>;
  return <div className={cn(cls,"flex items-center justify-center font-black text-primary bg-primary/10")} style={{width:size*4,height:size*4,fontSize:size*1.2}}>{name.slice(0,2).toUpperCase()}</div>;
}

function StatBar({ label, home, away }: { label: string; home: number; away: number }) {
  const total = (home||0)+(away||0)||1;
  const hp = Math.round((home/total)*100);
  const ap = 100-hp;
  return (
    <div className="mb-3">
      <div className="flex justify-between text-[11px] text-white/50 mb-1">
        <span className="font-bold text-white">{home}</span>
        <span className="text-white/35 text-[10px]">{label}</span>
        <span className="font-bold text-white">{away}</span>
      </div>
      <div className="flex gap-0.5 h-1.5 rounded-full overflow-hidden">
        <div className="bg-primary rounded-full transition-all" style={{width:hp+"%"}}/>
        <div className="bg-white/20 rounded-full transition-all" style={{width:ap+"%"}}/>
      </div>
    </div>
  );
}

function OverviewTab({ stats, events, state }: any) {
  const statItems = (stats||[]).map((s: any) => ({ label: s.type?.name||s.name||"Stat", home: s.location==="home"?Number(s.data?.value||0):0, away: s.location==="away"?Number(s.data?.value||0):0 }));
  const merged: any[] = [];
  statItems.forEach((s: any) => {
    const ex = merged.find((m: any)=>m.label===s.label);
    if (ex) { ex.home+=s.home; ex.away+=s.away; } else merged.push({...s});
  });
  const goals = (events||[]).filter((e: any)=>(e.type?.developer_name||"").toLowerCase().includes("goal"));
  const cards = (events||[]).filter((e: any)=>(e.type?.developer_name||"").toLowerCase().includes("card"));
  return (
    <div className="flex flex-col gap-4">
      {goals.length>0 && <div className="rounded-2xl bg-white/4 border border-white/8 p-4">
        <p className="text-[11px] font-black text-white/40 uppercase tracking-wider mb-3">Goals</p>
        {goals.map((e: any,i: number)=>(
          <div key={i} className="flex items-center gap-2 py-1.5 border-b border-white/5 last:border-0">
            <span className="text-xs font-bold text-white/40 w-8">{e.minute||""}min</span>
            <span className="text-sm font-semibold text-white flex-1">{e.player?.name||"Unknown"}</span>
            <span className="text-[10px] text-white/30">{e.participant_id?"":"away"}</span>
          </div>
        ))}
      </div>}
      {merged.length>0 && <div className="rounded-2xl bg-white/4 border border-white/8 p-4">
        <p className="text-[11px] font-black text-white/40 uppercase tracking-wider mb-3">Stats</p>
        {merged.slice(0,8).map((s: any,i: number)=>(
          <StatBar key={i} label={s.label} home={s.home} away={s.away}/>
        ))}
      </div>}
      {merged.length===0&&goals.length===0&&<div className="text-center py-8 text-white/30"><p>No data yet</p></div>}
    </div>
  );
}

function LineupsTab({ lineups }: any) {
  const starters = (lineups||[]).filter((p: any)=>p.type?.developer_name==="starting-lineup"||p.type_id===11);
  const subs = (lineups||[]).filter((p: any)=>p.type?.developer_name==="bench"||p.type_id===12);
  const home = starters.filter((p: any)=>p.team_id===p.participant_id||(p.meta&&p.meta.location==="home"));
  const away = starters.filter((p: any)=>!(p.team_id===p.participant_id));
  const renderList = (players: any[], label: string) => (
    <div className="flex-1">
      <p className="text-[10px] font-black text-white/30 uppercase tracking-wider mb-2 text-center">{label}</p>
      {players.map((p: any,i: number)=>(
        <div key={i} className="flex items-center gap-2 py-1.5 border-b border-white/5 last:border-0">
          <span className="text-xs font-bold text-white/30 w-5">{p.jersey_number||i+1}</span>
          <span className="text-xs font-medium text-white truncate">{p.player?.short_name||p.player?.name||"Player"}</span>
        </div>
      ))}
    </div>
  );
  if (starters.length===0) return <div className="text-center py-8 text-white/30"><p>Lineups not available yet</p></div>;
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl bg-white/4 border border-white/8 p-4">
        <div className="flex gap-4">{renderList(starters.slice(0,11),"Home XI")}{renderList(away.length>0?away:starters.slice(11,22),"Away XI")}</div>
      </div>
      {subs.length>0&&<div className="rounded-2xl bg-white/4 border border-white/8 p-4">
        <p className="text-[10px] font-black text-white/30 uppercase tracking-wider mb-2">Substitutes</p>
        <div className="flex flex-wrap gap-2">{subs.map((p: any,i: number)=>(
          <span key={i} className="text-xs bg-white/5 border border-white/8 rounded-lg px-2 py-1 text-white/60">{p.player?.short_name||p.player?.name||"Sub"}</span>
        ))}</div>
      </div>}
    </div>
  );
}

function H2HTab({ h2h }: any) {
  const matches = Array.isArray(h2h) ? h2h : [];
  if (matches.length===0) return <div className="text-center py-8 text-white/30"><p>No H2H data available</p></div>;
  return (
    <div className="flex flex-col gap-2">
      {matches.slice(0,10).map((m: any,i: number)=>{
        const isNative = typeof m.home === "string";
        const homeTeam = isNative ? m.home : ((m.participants||[]).find((p: any)=>p.meta?.location==="home")||{}).name||"Home";
        const awayTeam = isNative ? m.away : ((m.participants||[]).find((p: any)=>p.meta?.location==="away")||{}).name||"Away";
        const score = isNative ? (m.score||"-") : (() => { const s = m.scores||[]; const h=s.find((x: any)=>x.description==="CURRENT"&&x.score?.participant==="home")?.score?.goals??"-"; const a=s.find((x: any)=>x.description==="CURRENT"&&x.score?.participant==="away")?.score?.goals??"-"; return h+"-"+a; })();
        const dt = isNative ? (m.date||"") : (m.starting_at?new Date(m.starting_at).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"2-digit"}):"")
        return (
          <div key={i} className="flex items-center gap-2 p-3 rounded-xl bg-white/4 border border-white/6">
            <span className="text-[10px] text-white/30 w-16 shrink-0">{dt}</span>
            <div className="flex-1 flex items-center gap-2 min-w-0">
              <span className="text-xs text-white truncate flex-1 text-right">{homeTeam}</span>
              <span className="text-sm font-black text-white bg-white/8 px-2 py-0.5 rounded shrink-0">{score}</span>
              <span className="text-xs text-white/60 truncate flex-1">{awayTeam}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OddsTab({ odds, isPremium, setLocation }: any) {
  if (!isPremium) return (
    <div className="flex flex-col items-center justify-center py-12 gap-4">
      <div className="w-14 h-14 rounded-2xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center"><Crown size={24} className="text-amber-400"/></div>
      <div className="text-center"><p className="font-bold text-white mb-1">Premium Feature</p><p className="text-sm text-white/40">Upgrade to see live odds from all markets</p></div>
      <button onClick={()=>setLocation("/paywall")} className="px-6 py-2.5 rounded-xl bg-amber-400 text-black font-bold text-sm">Upgrade Now</button>
    </div>
  );
  const isFlat = odds && typeof odds === "object" && !Array.isArray(odds) && odds.home;
  if (!odds || (!isFlat && (!Array.isArray(odds) || odds.length===0))) return <div className="text-center py-8 text-white/30"><p>No odds available</p></div>;
  if (isFlat) {
    const markets = [
      { label: "Match Result", items: [{label:"Home",val:odds.home},{label:"Draw",val:odds.draw},{label:"Away",val:odds.away}]},
      odds.over_under && { label: "Goals", items: [{label:"Over 2.5",val:""},{label:"Under 2.5",val:""}]},
      (odds.btts_yes||odds.btts_no) && { label: "Both Teams Score", items: [{label:"Yes",val:odds.btts_yes},{label:"No",val:odds.btts_no}]},
    ].filter(Boolean) as any[];
    return (
      <div className="flex flex-col gap-3">
        {markets.map((mkt: any,i: number)=>(
          <div key={i} className="rounded-2xl bg-white/4 border border-white/8 p-4">
            <p className="text-[11px] font-black text-white/40 uppercase tracking-wider mb-3">{mkt.label}</p>
            <div className="flex gap-2">{mkt.items.filter((o: any)=>o.val).map((o: any,j: number)=>(
              <div key={j} className="flex-1 text-center p-2 rounded-xl bg-white/5 border border-white/8">
                <p className="text-xs text-white/40">{o.label}</p>
                <p className="text-base font-black text-primary mt-0.5">{parseFloat(o.val).toFixed(2)}</p>
              </div>
            ))}</div>
          </div>
        ))}
      </div>
    );
  }
  const markets = (odds as any[]).slice(0,6);
  return (
    <div className="flex flex-col gap-3">
      {markets.map((mkt: any,i: number)=>(
        <div key={i} className="rounded-2xl bg-white/4 border border-white/8 p-4">
          <p className="text-[11px] font-black text-white/40 uppercase tracking-wider mb-3">{mkt.name||mkt.market_description||"Market"}</p>
          <div className="flex gap-2 flex-wrap">{(mkt.odds||[]).slice(0,4).map((o: any,j: number)=>(
            <div key={j} className="flex-1 min-w-[60px] text-center p-2 rounded-xl bg-white/5 border border-white/8">
              <p className="text-xs text-white/40 truncate">{o.label||o.description||o.name}</p>
              <p className="text-base font-black text-primary mt-0.5">{o.value||o.odds||"-"}</p>
            </div>
          ))}</div>
        </div>
      ))}
    </div>
  );
}

function PredictionTab({ fixtureId, isPremium, setLocation }: any) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/predict", fixtureId],
    queryFn: () => fetchApi("/predict/"+fixtureId),
    enabled: !!fixtureId && !!isPremium,
    staleTime: 5*60*1000,
  });
  if (!isPremium) return (
    <div className="flex flex-col items-center justify-center py-12 gap-4">
      <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center"><Zap size={24} className="text-primary"/></div>
      <div className="text-center"><p className="font-bold text-white mb-1">Trial or Premium Required</p><p className="text-sm text-white/40">Get predictions powered by our AI engine</p></div>
      <button onClick={()=>setLocation("/paywall")} className="px-6 py-2.5 rounded-xl bg-primary text-black font-bold text-sm">Get Access</button>
    </div>
  );
  if (isLoading) return <div className="flex justify-center py-12"><div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin"/></div>;
  if (error||!data) return <div className="text-center py-8 text-white/30"><p>Prediction not available</p></div>;
  const rec = (data as any)?.predictions?.recommendation||{};
  const conf = Math.round((rec.probability||0)*100);
  const confColor = conf>=75?"text-primary":conf>=60?"text-blue-400":"text-amber-400";
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/25 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Zap size={16} className="text-primary"/>
          <span className="text-[11px] font-black text-primary/70 uppercase tracking-wider">Our Pick</span>
        </div>
        <p className="text-2xl font-black text-white mb-1">{rec.pick||"No clear pick"}</p>
        <p className="text-sm text-white/40 mb-4">{rec.market||""}</p>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all" style={{width:conf+"%"}}/>
          </div>
          <span className={"text-xl font-black "+confColor}>{conf}%</span>
        </div>
        <div className="flex gap-2 mt-3">
          <span className={"text-[10px] font-bold px-2 py-1 rounded-full border "+
            (rec.modelConfidence==="high"?"bg-primary/10 border-primary/25 text-primary":"bg-white/5 border-white/10 text-white/40")}>Model: {rec.modelConfidence||"-"}</span>
          <span className="text-[10px] font-bold px-2 py-1 rounded-full border bg-white/5 border-white/10 text-white/40">Edge: {rec.edgeLabel||"-"}</span>
        </div>
      </div>
      {(data as any)?.predictions?.backup_picks?.length>0&&<div className="rounded-2xl bg-white/4 border border-white/8 p-4">
        <p className="text-[11px] font-black text-white/40 uppercase tracking-wider mb-3">Backup Picks</p>
        {(data as any).predictions.backup_picks.slice(0,3).map((p: any,i: number)=>(
          <div key={i} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
            <span className="text-sm font-semibold text-white flex-1">{p.pick}</span>
            <span className="text-xs text-white/40">{Math.round((p.probability||0)*100)}%</span>
          </div>
        ))}
      </div>}
    </div>
  );
}

const TABS = ["Overview","Stats","Lineups","H2H","Odds","Prediction"];

export default function MatchCenter() {
  const params = useParams();
  const fixtureId = params.id;
  const [, setLocation] = useLocation();
  const { data: user } = useAuth();
  const isPremium = (user as any)?.has_access;
  const [tab, setTab] = useState("Overview");

  const { data, isLoading } = useQuery({
    queryKey: ["/api/matches", fixtureId],
    queryFn: () => fetchApi("/matches/"+fixtureId),
    staleTime: 3*60*1000,
    enabled: !!fixtureId,
  });
  const d = data as any;
  const fix = d?.fixture||{};
  const isLive = fix.match_status==="LIVE";
  const isFT = fix.match_status==="FT";
  const stateLabel = isLive?"LIVE":isFT?"FT":"PRE";

  return (
    <div className="min-h-screen bg-[#090d13] pb-24">
      <div className="sticky top-0 z-20 bg-[#090d13]/95 backdrop-blur-xl border-b border-white/5 px-4 py-3 flex items-center gap-3">
        <button onClick={()=>setLocation("/matches")} className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center hover:bg-white/10 transition">
          <ArrowLeft size={16} className="text-white/70"/>
        </button>
        <div className="flex-1 text-center">
          {isLive&&<span className="text-xs font-black text-red-400 animate-pulse">LIVE {fix.live_minute||""}</span>}
          {isFT&&<span className="text-xs font-bold text-white/40">FULL TIME</span>}
          {!isLive&&!isFT&&<span className="text-xs text-white/40">{fix.tournament_name||""}</span>}
        </div>
        {isPremium&&<button onClick={()=>setLocation("/analysis/"+fixtureId)} className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center hover:bg-primary/20 transition">
          <Microscope size={14} className="text-primary"/>
        </button>}
      </div>

      {isLoading&&<div className="flex justify-center py-20"><div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin"/></div>}
      {!isLoading&&(
        <>
          <div className="px-6 py-6 flex flex-col items-center gap-3">
            <div className="flex items-center justify-between w-full max-w-xs">
              <div className="flex flex-col items-center gap-2 flex-1">
                <TeamLogo src={fix.home_team_logo} name={fix.home_team_name||"Home"} size={14}/>
                <span className="text-sm font-bold text-white text-center leading-tight">{fix.home_team_name||"Home"}</span>
              </div>
              <div className="flex flex-col items-center px-4">
                {(isLive||isFT)
                  ? <span className="text-4xl font-black text-white">{fix.home_score??0} - {fix.away_score??0}</span>
                  : <span className="text-base font-bold text-white/30">vs</span>}
                <span className={cn("text-[10px] font-black mt-1 px-2 py-0.5 rounded-full",
                  isLive?"bg-red-500/15 text-red-400":"text-white/30")}>{stateLabel}</span>
              </div>
              <div className="flex flex-col items-center gap-2 flex-1">
                <TeamLogo src={fix.away_team_logo} name={fix.away_team_name||"Away"} size={14}/>
                <span className="text-sm font-bold text-white/70 text-center leading-tight">{fix.away_team_name||"Away"}</span>
              </div>
            </div>
            <p className="text-[11px] text-white/30">{fix.tournament_name||""} {fix.category_name?("· "+fix.category_name):""}</p>
          </div>

          <div className="px-3 mb-4">
            <div className="flex gap-1 overflow-x-auto no-scrollbar bg-white/4 rounded-2xl p-1">
              {TABS.map(t=>(
                <button key={t} onClick={()=>setTab(t)}
                  className={cn("shrink-0 flex-1 min-w-[70px] py-2 px-2 rounded-xl text-[11px] font-bold transition-all",
                    tab===t?"bg-primary text-black shadow-sm":"text-white/40 hover:text-white/70")}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="px-3">
            <AnimatePresence mode="wait">
              <motion.div key={tab} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.15}}>
                {tab==="Overview"&&<OverviewTab stats={d?.meta?.matchStats||d?.statistics||[]} events={d?.meta?.matchEvents||d?.events||[]} state={d?.state}/>}
                {tab==="Stats"&&<OverviewTab stats={d?.meta?.matchStats||d?.statistics||[]} events={[]} state={d?.state}/>}
                {tab==="Lineups"&&<LineupsTab lineups={d?.meta?.lineups||d?.lineups||[]} homeTeam={d?.fixture?.home_team_name} awayTeam={d?.fixture?.away_team_name}/>}
                {tab==="H2H"&&<H2HTab h2h={d?.h2h}/>}
                {tab==="Odds"&&<OddsTab odds={d?.odds} isPremium={isPremium} setLocation={setLocation}/>}
                {tab==="Prediction"&&<PredictionTab fixtureId={fixtureId} isPremium={isPremium} setLocation={setLocation}/>}
              </motion.div>
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  );
}
