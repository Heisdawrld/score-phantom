import { useState, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchApi } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Zap, Send, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
function TeamLogo({ src, name, size=12 }: { src?: string; name: string; size?: number }) {
  const [err, setErr] = useState(false);
  if (src && !err) return <img src={src} alt={name} onError={()=>setErr(true)} className="rounded-full object-contain bg-white/5 border border-white/10" style={{width:size*4,height:size*4}} loading="lazy"/>;
  return <div className="rounded-full bg-primary/10 border border-white/10 flex items-center justify-center font-black text-primary" style={{width:size*4,height:size*4,fontSize:size*1.4}}>{(name||"?").slice(0,2).toUpperCase()}</div>;
}

function PredictionTab({ fixtureId, isPremium, setLocation }: any) {
  const { data, isLoading, error } = useQuery({ queryKey: ["/api/predict", fixtureId], queryFn: () => fetchApi("/predict/"+fixtureId), enabled: !!fixtureId && !!isPremium, staleTime: 5*60*1000 });
  if (!isPremium) return (<div className="flex flex-col items-center justify-center py-16 gap-4"><div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center"><Zap size={28} className="text-primary"/></div><div className="text-center"><p className="font-bold text-white mb-1">Trial or Premium Required</p><p className="text-sm text-white/40">AI predictions for this match</p></div><button onClick={()=>setLocation("/paywall")} className="px-8 py-3 rounded-xl bg-primary text-black font-black text-sm">Get Access</button></div>);
  if (isLoading) return <div className="flex justify-center py-16"><div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin"/></div>;
  if (error||!data) return <div className="text-center py-12 text-white/30"><p>Prediction not available</p></div>;
  const rec = (data as any)?.predictions?.recommendation||{};
  const conf = Math.round((rec.probability||0)*100);
  const confColor = conf>=75?"text-primary":conf>=60?"text-blue-400":"text-amber-400";
  const backups = (data as any)?.predictions?.backup_picks||[];
  return (<div className="flex flex-col gap-4"><div className="rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/25 p-5"><div className="flex items-center gap-2 mb-4"><Zap size={14} className="text-primary"/><span className="text-[10px] font-black text-primary/60 uppercase tracking-widest">Phantom Pick</span></div><p className="text-2xl font-black text-white mb-1">{rec.pick||"No clear pick"}</p><p className="text-sm text-white/40 mb-4">{(rec.market||"").replace(/_/g," ")}</p><div className="flex items-center gap-3 mb-3"><div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full rounded-full bg-primary transition-all" style={{width:conf+"%"}}/></div><span className={"text-2xl font-black "+confColor}>{conf}%</span></div><div className="flex gap-2 flex-wrap"><span className={"text-[10px] font-bold px-2 py-1 rounded-full border "+(rec.modelConfidence==="high"?"bg-primary/10 border-primary/25 text-primary":"bg-white/5 border-white/10 text-white/40")}>Model: {rec.modelConfidence||"-"}</span><span className="text-[10px] font-bold px-2 py-1 rounded-full border bg-white/5 border-white/10 text-white/40">Edge: {rec.edgeLabel||"-"}</span></div></div>{backups.length>0&&<div className="rounded-2xl bg-white/4 border border-white/8 p-4"><p className="text-[10px] font-black text-white/40 uppercase tracking-wider mb-3">Backup Picks</p>{backups.slice(0,3).map((p: any,i: number)=>(<div key={i} className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0"><div className="flex-1 min-w-0"><p className="text-sm font-semibold text-white">{p.pick}</p><p className="text-[11px] text-white/35">{(p.market||"").replace(/_/g," ")}</p></div><span className="text-sm font-bold text-white/50">{Math.round((p.probability||0)*100)}%</span></div>))}</div>}</div>);
}

function StatsTab({ d }: any) {
  const h2h = Array.isArray(d?.h2h)?d.h2h:[], hf = Array.isArray(d?.homeForm)?d.homeForm:[], af = Array.isArray(d?.awayForm)?d.awayForm:[], st = Array.isArray(d?.standings)?d.standings:[], fix = d?.fixture||{};
  const dot = (m: any, t: string) => { if (!m?.score) return "bg-white/20"; const [h,a] = (m.score).split("-").map(Number); const home = (m.home||"").toLowerCase().includes((t||"").toLowerCase().split(" ")[0]); return (home?(h>a):(a>h))?"bg-primary":h===a?"bg-amber-400":"bg-red-500"; };
  return (<div className="flex flex-col gap-4">
    {hf.length>0&&<div className="rounded-2xl bg-white/4 border border-white/8 p-4"><p className="text-[10px] font-black text-white/40 uppercase tracking-wider mb-3">{fix.home_team_name||"Home"} — Last 5</p><div className="flex gap-2">{hf.slice(0,5).map((m: any,i: number)=><div key={i} className={"w-9 h-9 rounded-xl "+dot(m,fix.home_team_name||"")}/>)}</div></div>}
    {af.length>0&&<div className="rounded-2xl bg-white/4 border border-white/8 p-4"><p className="text-[10px] font-black text-white/40 uppercase tracking-wider mb-3">{fix.away_team_name||"Away"} — Last 5</p><div className="flex gap-2">{af.slice(0,5).map((m: any,i: number)=><div key={i} className={"w-9 h-9 rounded-xl "+dot(m,fix.away_team_name||"")}/>)}</div></div>}
    {h2h.length>0&&<div className="rounded-2xl bg-white/4 border border-white/8 p-4"><p className="text-[10px] font-black text-white/40 uppercase tracking-wider mb-3">Head to Head</p><div className="flex flex-col gap-1.5">{h2h.slice(0,8).map((m: any,i: number)=>(<div key={i} className="flex items-center gap-2 py-1.5 border-b border-white/5 last:border-0"><span className="text-[10px] text-white/25 w-14 shrink-0">{m.date?new Date(m.date).toLocaleDateString("en-GB",{day:"2-digit",month:"short"}):""}</span><span className="text-xs text-white/70 truncate flex-1 text-right">{m.home}</span><span className="text-xs font-black text-white bg-white/8 px-2 py-0.5 rounded shrink-0">{m.score||"-"}</span><span className="text-xs text-white/40 truncate flex-1">{m.away}</span></div>))}</div></div>}
    {st.length>0&&<div className="rounded-2xl bg-white/4 border border-white/8 p-4"><p className="text-[10px] font-black text-white/40 uppercase tracking-wider mb-3">League Table</p><div className="flex flex-col gap-0.5">{st.slice(0,8).map((r: any,i: number)=>{ const hi=[fix.home_team_name,fix.away_team_name].some(n=>(n||"").toLowerCase().includes((r.team||"").toLowerCase().split(" ")[0])); return <div key={i} className={"flex items-center gap-2 py-1.5 px-2 rounded-lg text-xs "+(hi?"bg-primary/8 border border-primary/20":"")}><span className="w-5 text-white/30 font-bold">{r.position}</span><span className={"flex-1 font-semibold truncate "+(hi?"text-primary":"text-white/70")}>{r.team}</span><span className="w-5 text-center text-white/40">{r.played}</span><span className={"w-6 text-center font-black "+(hi?"text-primary":"text-white")}>{r.points}</span></div>; })}</div></div>}
    {h2h.length===0&&hf.length===0&&<div className="text-center py-12 text-white/30"><p className="text-4xl mb-3">📊</p><p>Stats loading — check back soon</p></div>}
  </div>);
}

function PhantomAITab({ fixtureId, isPremium, setLocation }: any) {
  const [msgs, setMsgs] = useState<{role:string;content:string}[]>([{role:"assistant",content:"I have analysed this match. What would you like to know? Ask about form, tactics, injuries or value."}]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const mutation = useMutation({ mutationFn: (body: any) => fetchApi("/chat/"+fixtureId, {method:"POST",body:JSON.stringify(body)}) });
  useEffect(()=>{ if(scrollRef.current) scrollRef.current.scrollTop=scrollRef.current.scrollHeight; },[msgs]);
  if (!isPremium) return (<div className="flex flex-col items-center justify-center py-16 gap-4"><div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center"><Bot size={28} className="text-blue-400"/></div><div className="text-center"><p className="font-bold text-white mb-1">Phantom AI</p><p className="text-sm text-white/40">Ask anything about this match</p></div><button onClick={()=>setLocation("/paywall")} className="px-8 py-3 rounded-xl bg-primary text-black font-black text-sm">Unlock AI Chat</button></div>);
  const send = (e: React.FormEvent) => { e.preventDefault(); if (!input.trim()||mutation.isPending) return; const msg = input.trim(); setInput(""); const next = [...msgs,{role:"user",content:msg}]; setMsgs(next); mutation.mutate({message:msg,history:msgs.slice(1)},{onSuccess:(r:any)=>setMsgs([...next,{role:"assistant",content:r.reply||"No response"}]),onError:()=>setMsgs([...next,{role:"assistant",content:"Sorry, I cannot analyse that right now."}])}); };
  return (<div className="flex flex-col rounded-2xl bg-white/4 border border-white/8 overflow-hidden" style={{height:"520px"}}><div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-blue-500/5 shrink-0"><Bot size={14} className="text-blue-400"/><span className="text-xs font-bold text-blue-400">Phantom AI</span><span className="ml-auto text-[10px] text-white/25">Groq LLM</span></div><div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">{msgs.map((m,i)=>(<div key={i} className={"flex gap-2 "+(m.role==="user"?"flex-row-reverse":"")}><div className={"w-6 h-6 rounded-full flex items-center justify-center shrink-0 "+(m.role==="user"?"bg-primary/20":"bg-blue-500/20")}>{m.role==="user"?<span className="text-[10px] font-black text-primary">U</span>:<Bot size={10} className="text-blue-400"/>}</div><div className={"max-w-[82%] px-3 py-2 rounded-2xl text-sm leading-relaxed "+(m.role==="user"?"bg-primary/15 text-white rounded-tr-none":"bg-white/5 text-white/80 rounded-tl-none")}>{m.content}</div></div>))}{mutation.isPending&&<div className="flex gap-2"><div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center"><Bot size={10} className="text-blue-400"/></div><div className="bg-white/5 rounded-2xl rounded-tl-none px-3 py-2"><div className="flex gap-1">{[0,1,2].map(i=><span key={i} className="w-1.5 h-1.5 rounded-full bg-white/30 animate-bounce" style={{animationDelay:i*0.15+"s"}}/>)}</div></div></div>}</div><form onSubmit={send} className="flex gap-2 p-3 border-t border-white/5 shrink-0"><input value={input} onChange={e=>setInput(e.target.value)} placeholder="Ask about this match..." className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:border-primary/30 transition"/><button type="submit" disabled={mutation.isPending||!input.trim()} className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center disabled:opacity-40 shrink-0"><Send size={14} className="text-black"/></button></form></div>);
}

const TABS = ["Prediction","Stats","Phantom AI"];
export default function MatchCenter() {
  const params = useParams();
  const fixtureId = params.id;
  const [, setLocation] = useLocation();
  const { data: user } = useAuth();
  const isPremium = (user as any)?.has_access;
  const [tab, setTab] = useState("Prediction");
  const { data, isLoading } = useQuery({ queryKey: ["/api/matches", fixtureId], queryFn: () => fetchApi("/matches/"+fixtureId), staleTime: 3*60*1000, enabled: !!fixtureId });
  const d = data as any;
  const fix = d?.fixture||{};
  const isLive = ["LIVE","HT","1H","2H"].includes(fix.match_status||"");
  const isFT = ["FT","AET","Pen"].includes(fix.match_status||"");
  return (<div className="min-h-screen bg-[#090d13] pb-24">
    <div className="sticky top-0 z-20 bg-[#090d13]/95 backdrop-blur-xl border-b border-white/5 px-4 py-3 flex items-center gap-3">
      <button onClick={()=>setLocation("/")} className="w-9 h-9 rounded-xl bg-white/6 flex items-center justify-center hover:bg-white/10 transition shrink-0"><ArrowLeft size={16} className="text-white/60"/></button>
      <div className="flex-1 min-w-0 text-center">{isLive&&<span className="text-xs font-black text-red-400 animate-pulse">● LIVE {fix.live_minute||""}</span>}{isFT&&<span className="text-xs font-bold text-white/40">FULL TIME</span>}{!isLive&&!isFT&&<span className="text-xs text-white/40 truncate block">{fix.tournament_name||"Match Detail"}</span>}</div>
    </div>
    {isLoading&&<div className="flex justify-center py-20"><div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin"/></div>}
    {!isLoading&&(<>
      <div className="px-6 pt-6 pb-4 flex flex-col items-center gap-3">
        <div className="flex items-center justify-between w-full max-w-xs">
          <div className="flex flex-col items-center gap-2 flex-1"><TeamLogo src={fix.home_team_logo} name={fix.home_team_name||"Home"} size={14}/><span className="text-sm font-bold text-white text-center leading-tight">{fix.home_team_name||"Home"}</span></div>
          <div className="flex flex-col items-center px-4 gap-1">{(isLive||isFT)?<span className="text-4xl font-black text-white tabular-nums">{fix.home_score??0} - {fix.away_score??0}</span>:<span className="text-xl font-bold text-white/25">vs</span>}{isLive&&<span className="text-[10px] font-black text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full animate-pulse">LIVE</span>}{isFT&&<span className="text-[10px] font-bold text-white/30">FT</span>}</div>
          <div className="flex flex-col items-center gap-2 flex-1"><TeamLogo src={fix.away_team_logo} name={fix.away_team_name||"Away"} size={14}/><span className="text-sm font-bold text-white/70 text-center leading-tight">{fix.away_team_name||"Away"}</span></div>
        </div>
        <p className="text-[11px] text-white/25">{fix.tournament_name||""}{ fix.category_name?" · "+fix.category_name:""}</p>
      </div>
      <div className="px-4 mb-5"><div className="flex gap-0 bg-white/4 rounded-2xl p-1">{TABS.map(t=>(<button key={t} onClick={()=>setTab(t)} className={cn("flex-1 py-2.5 rounded-xl text-xs font-bold transition-all",tab===t?"bg-primary text-black shadow-sm":"text-white/40 hover:text-white/70")}>{t}</button>))}</div></div>
      <div className="px-4"><AnimatePresence mode="wait"><motion.div key={tab} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.15}}>{tab==="Prediction"&&<PredictionTab fixtureId={fixtureId} isPremium={isPremium} setLocation={setLocation}/>}{tab==="Stats"&&<StatsTab d={d}/>}{tab==="Phantom AI"&&<PhantomAITab fixtureId={fixtureId} isPremium={isPremium} setLocation={setLocation}/>}</motion.div></AnimatePresence></div>
    </>)}
  </div>);
}
