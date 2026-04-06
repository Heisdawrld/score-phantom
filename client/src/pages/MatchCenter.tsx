import { useState, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchApi } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { motion, AnimatePresence } from "framer-motion";
import { X, Target, BarChart2, MessageCircle, Send, Bot, Zap, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

function SpiralWatermark() {
  return (
    <svg width="110" height="110" viewBox="0 0 110 110" fill="none"
      className="absolute top-3 right-3 opacity-[0.08] pointer-events-none text-primary">
      <circle cx="55" cy="55" r="50" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="55" cy="55" r="38" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="55" cy="55" r="27" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="55" cy="55" r="16" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="55" cy="55" r="6" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="55" cy="55" r="2" fill="currentColor"/>
    </svg>
  );
}

const TABS = [
  { key: "Prediction", label: "Prediction", Icon: Target },
  { key: "Stats", label: "Stats", Icon: BarChart2 },
  { key: "PhantomChat", label: "PhantomChat", Icon: MessageCircle },
];

function riskColor(r: string) {
  const l = (r || "").toLowerCase();
  if (l.includes("low")) return "text-primary";
  if (l.includes("high")) return "text-red-400";
  return "text-amber-400";
}

function confBadgeStyle(c: string) {
  const l = (c || "").toLowerCase();
  if (l === "high") return "bg-primary/15 border-primary/40 text-primary";
  if (l === "low") return "bg-red-500/10 border-red-500/30 text-red-400";
  return "bg-white/8 border-white/15 text-white/60";
}

function PredictionTab({ fixtureId, isPremium, setLocation, matchData }: any) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/predict", fixtureId],
    queryFn: () => fetchApi("/predict/" + fixtureId),
    enabled: !!fixtureId && !!isPremium,
    staleTime: 5 * 60 * 1000,
  });

  if (!isPremium) return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
        <Zap size={28} className="text-primary"/>
      </div>
      <div className="text-center">
        <p className="font-bold text-white mb-1">Trial or Premium Required</p>
        <p className="text-sm text-white/40">AI predictions for this match</p>
      </div>
      <button onClick={() => setLocation("/paywall")}
        className="px-8 py-3 rounded-xl bg-primary text-black font-black text-sm">
        Get Access
      </button>
    </div>
  );

  if (isLoading) return (
    <div className="flex justify-center py-16">
      <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin"/>
    </div>
  );

  if (error || !data) return (
    <div className="text-center py-12 text-white/30">
      <p className="text-4xl mb-3">🔮</p>
      <p>Prediction not available</p>
    </div>
  );

  const rec = (data as any)?.predictions?.recommendation || {};
  const conf = Math.round((rec.probability || 0) * 100);
  const backups = (data as any)?.predictions?.backup_picks || [];
  const reasonCodes: string[] = rec.reasons || rec.reasonCodes || rec.reason_codes || [];
  const oddsData = (data as any)?.odds ?? null;
  const homeNm = matchData?.fixture?.home_team_name || (data as any)?.fixture?.homeTeam || "";
  const pickLo = (rec.pick || "").toLowerCase();
  const ouRaw = oddsData?.over_under || {};
  const odds = !oddsData ? null
    : pickLo.includes("both teams to score") ? oddsData.btts_yes
    : pickLo.includes("not to score") ? oddsData.btts_no
    : pickLo === "draw" ? oddsData.draw
    : pickLo.includes("over 3.5") ? ouRaw.over_3_5
    : pickLo.includes("over 2.5") ? ouRaw.over_2_5
    : pickLo.includes("over 1.5") ? ouRaw.over_1_5
    : pickLo.includes("under 3.5") ? ouRaw.under_3_5
    : pickLo.includes("under 2.5") ? ouRaw.under_2_5
    : pickLo.includes("under 1.5") ? ouRaw.under_1_5
    : pickLo.includes("win") && homeNm && pickLo.includes(homeNm.split(" ")[0].toLowerCase()) ? oddsData.home
    : pickLo.includes("win") ? oddsData.away
    : null;
  const impliedPct = odds ? Math.round((1 / Number(odds)) * 100)
    : rec.impliedProb != null ? Math.round(rec.impliedProb * 100) : null;
  const hasValue = impliedPct != null && conf > impliedPct + 2;
  const betLink = oddsData?.betLinkSportybet || null;
  const gameScript = (data as any)?.gameScript;
  const scriptLabel = gameScript?.label || null;
  const scriptVol = gameScript?.volatility || null;
  const riskLabel = rec.risk || rec.riskLevel || (conf >= 75 ? "LOW RISK" : conf >= 60 ? "MODERATE RISK" : "HIGH RISK");
  const marketLabel = rec.marketLabel || (rec.market || "").replace(/_/g, " ");
  const edgeLabel = rec.edgeLabel || (conf >= 75 ? "STRONG EDGE (AGGRESSIVE)" : conf >= 60 ? "GOOD EDGE" : "MARGINAL EDGE");
  const confLevel = (rec.modelConfidence || (conf >= 75 ? "high" : conf >= 60 ? "medium" : "low")).toUpperCase();

  return (
    <div className="flex flex-col gap-4">
      <div className="relative rounded-2xl overflow-hidden border border-[#1e4030]"
        style={{ background: "linear-gradient(135deg, #0a2018 0%, #061510 100%)" }}>
        <SpiralWatermark/>
        <div className="relative p-5">
          <p className="text-[10px] font-black text-primary/70 uppercase tracking-[0.15em] mb-3">
            Best Bet Angle
          </p>
          <div className="flex flex-wrap gap-2 mb-2">
            <span className={cn("text-[11px] font-black px-3 py-1 rounded-full border uppercase tracking-wide", confBadgeStyle(confLevel))}>
              {confLevel}
            </span>
            <span className="text-[11px] font-black px-3 py-1 rounded-full border border-primary/50 text-primary bg-primary/8 uppercase tracking-wide">
              {edgeLabel}
            </span>
          </div>
          <p className={cn("text-[11px] font-black uppercase tracking-widest mb-2", riskColor(riskLabel))}>
            {riskLabel}
          </p>
          {scriptLabel && (
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[9px] text-white/25 uppercase tracking-widest">Script:</span>
              <span className="text-[10px] font-bold text-amber-300/70">{scriptLabel}</span>
              {scriptVol && <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-bold", scriptVol === "HIGH" ? "bg-red-500/10 text-red-400" : scriptVol === "LOW" ? "bg-primary/10 text-primary" : "bg-white/5 text-white/25")}>{scriptVol}</span>}
            </div>
          )}
          <div className="flex items-start justify-between gap-3 mb-5">
            <div className="flex-1">
              <p className="text-[11px] text-white/40 mb-1 capitalize">{marketLabel}</p>
              <p className="text-2xl font-black text-white uppercase leading-tight">
                {rec.pick || "No clear pick"}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-4xl font-black text-primary leading-none">{conf}%</p>
              <p className="text-[10px] text-white/35 uppercase tracking-wider mt-1">Model Prob.</p>
            </div>
          </div>
          {reasonCodes.length > 0 && (
            <div className="border-t border-white/8 pt-4 mb-4">
              <div className="flex flex-col gap-2.5">
                {reasonCodes.slice(0, 5).map((r: string, i: number) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="w-4 h-4 rounded-full border-2 border-primary/70 flex items-center justify-center shrink-0 mt-0.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary"/>
                    </div>
                    <p className="text-[12px] text-white/65 leading-snug">{r}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(odds || oddsData?.home) && (
            <div className="border-t border-white/8 pt-4">
              <p className="text-[10px] font-black text-white/35 uppercase tracking-widest mb-3">
                {oddsData ? "SportyBet Odds" : "Sportybet Odds"}
              </p>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="rounded-xl p-3 text-center bg-[#0d1e17] border border-white/8">
                  <p className="text-[10px] text-white/40 mb-1">Odds</p>
                  <p className="text-lg font-black text-white">{odds}</p>
                </div>
                <div className="rounded-xl p-3 text-center bg-[#0d1e17] border border-white/8">
                  <p className="text-[10px] text-white/40 mb-1">Implied</p>
                  <p className="text-lg font-black text-white">{impliedPct}%</p>
                </div>
                <div className={cn("rounded-xl p-3 text-center", hasValue ? "bg-primary" : "bg-white/5 border border-white/8")}>
                  <p className={cn("text-[10px] mb-1", hasValue ? "text-black/60" : "text-white/40")}>Value</p>
                  <p className={cn("text-xl font-black", hasValue ? "text-black" : "text-white/30")}>
                    {hasValue ? "✓" : "✗"}
                  </p>
                </div>
              </div>
              {hasValue && (
                <div className="flex items-center gap-1.5">
                  <TrendingUp size={12} className="text-primary"/>
                  <p className="text-[11px] text-primary font-semibold">Value bet — bookmaker underpricing this outcome</p>
                </div>
              )}
              {oddsData?.home && (
                <div className="mt-3 grid grid-cols-3 gap-1.5">
                  <div className="rounded-xl p-2 text-center bg-[#0d1e17] border border-white/5">
                    <p className="text-[9px] text-white/25 mb-0.5">1 (H)</p>
                    <p className="text-sm font-black text-white">{oddsData.home?.toFixed(2)}</p>
                  </div>
                  <div className="rounded-xl p-2 text-center bg-[#0d1e17] border border-white/5">
                    <p className="text-[9px] text-white/25 mb-0.5">X</p>
                    <p className="text-sm font-black text-white">{oddsData.draw?.toFixed(2) || "-"}</p>
                  </div>
                  <div className="rounded-xl p-2 text-center bg-[#0d1e17] border border-white/5">
                    <p className="text-[9px] text-white/25 mb-0.5">2 (A)</p>
                    <p className="text-sm font-black text-white">{oddsData.away?.toFixed(2)}</p>
                  </div>
                </div>
              )}
              {betLink && (
                <a href={betLink} target="_blank" rel="noopener noreferrer"
                  className="mt-3 flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-primary text-black font-black text-xs shadow-[0_0_16px_rgba(16,231,116,0.3)] hover:brightness-110 transition-all">
                  Bet on SportyBet →
                </a>
              )}
            </div>
          )}
        </div>
      </div>
      {backups.length > 0 && (
        <div className="rounded-2xl border border-white/8 p-4 bg-[#0c1810]">
          <p className="text-[10px] font-black text-white/35 uppercase tracking-wider mb-3">Backup Picks</p>
          <div className="flex flex-col gap-2">
            {backups.slice(0, 3).map((p: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                <div>
                  <p className="text-sm font-bold text-white/80">{p.pick || p.market}</p>
                  <p className="text-[10px] text-white/35">{(p.market || "").replace(/_/g, " ")}</p>
                </div>
                <span className="text-sm font-black text-primary">{Math.round((p.probability || 0) * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatsTab({ d }: any) {
  const h2h = Array.isArray(d?.h2h) && d.h2h.length ? d.h2h : Array.isArray(d?.meta?.h2h) ? d.meta.h2h : [];
  const hf = Array.isArray(d?.homeForm) && d.homeForm.length ? d.homeForm : Array.isArray(d?.meta?.homeForm) ? d.meta.homeForm : [];
  const af = Array.isArray(d?.awayForm) && d.awayForm.length ? d.awayForm : Array.isArray(d?.meta?.awayForm) ? d.meta.awayForm : [];
  const st = Array.isArray(d?.standings) && d.standings.length ? d.standings : Array.isArray(d?.meta?.standings) ? d.meta.standings : [];
  const fix = d?.fixture || {};
  const parseScore = (m: any) => { const parts = String(m.score || "0-0").split("-").map(Number); return { h: parts[0] || 0, a: parts[1] || 0 }; };
  const isHome = (m: any, t: string) => (m.home || "").toLowerCase().includes((t || "").toLowerCase().split(" ")[0]);
  const resultOf = (m: any, t: string) => { const { h, a } = parseScore(m); const home = isHome(m, t); const sc = home ? h : a; const conc = home ? a : h; return sc > conc ? "W" : sc === conc ? "D" : "L"; };
  const dotColor = (m: any, t: string) => { if (!m?.score) return "bg-white/15"; const r = resultOf(m, t); return r === "W" ? "bg-primary" : r === "D" ? "bg-amber-400" : "bg-red-500"; };
  const rColor = (r: string) => r === "W" ? "text-primary" : r === "D" ? "text-amber-400" : "text-red-400";
  const formAnalysis = (form: any[], teamName: string) => {
    if (!form.length) return null;
    const items = form.slice(0, 5).map((m: any) => {
      const { h, a } = parseScore(m); const home = isHome(m, teamName);
      const sc = home ? h : a; const cc = home ? a : h;
      return { result: sc > cc ? "W" : sc === cc ? "D" : "L", sc, cc, score: m.score };
    });
    const n = items.length;
    return { items, n,
      wins: items.filter(i => i.result === "W").length,
      draws: items.filter(i => i.result === "D").length,
      losses: items.filter(i => i.result === "L").length,
      avgSc: (items.reduce((s, i) => s + i.sc, 0) / n).toFixed(1),
      avgCc: (items.reduce((s, i) => s + i.cc, 0) / n).toFixed(1),
      cs: items.filter(i => i.cc === 0).length,
      btts: items.filter(i => i.sc > 0 && i.cc > 0).length,
    };
  };
  const h2hSum = () => {
    const sl = h2h.slice(0, 5); if (!sl.length) return null;
    let hw = 0, aw = 0, dr = 0;
    sl.forEach((m: any) => { const { h, a } = parseScore(m); if (h > a) hw++; else if (a > h) aw++; else dr++; });
    return { hw, aw, dr };
  };
  const homeF = formAnalysis(hf, fix.home_team_name || "");
  const awayF = formAnalysis(af, fix.away_team_name || "");
  const h2hS = h2hSum();
  return (
    <div className="flex flex-col gap-4">
      {[
        { label: fix.home_team_name || "Home", form: hf, fa: homeF },
        { label: fix.away_team_name || "Away", form: af, fa: awayF },
      ].map(({ label, form, fa }) => !fa ? null : (
        <div key={label} className="rounded-2xl border border-white/8 p-4 bg-[#0c1810]">
          <p className="text-[10px] font-black text-white/40 uppercase tracking-wider mb-2">{label} — Form</p>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex gap-2">
              {fa.items.map((it, i) => (
                <span key={i} className={cn("text-base font-black tracking-wider", rColor(it.result))}>{it.result}</span>
              ))}
            </div>
            <span className="text-[10px] text-white/30 ml-1">{fa.wins}W {fa.draws}D {fa.losses}L</span>
          </div>
          <div className="flex gap-2 mb-4">
            {form.slice(0, 5).map((m: any, i: number) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs", dotColor(m, label))}>
                  <span className="text-black/80">{resultOf(m, label)}</span>
                </div>
                <span className="text-[9px] text-white/25">{m.score || "-"}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-1 pt-3 border-t border-white/6">
            <div className="text-center"><p className="text-sm font-black text-white">{fa.avgSc}</p><p className="text-[9px] text-white/35 mt-0.5">Avg Scored</p></div>
            <div className="text-center"><p className="text-sm font-black text-white">{fa.avgCc}</p><p className="text-[9px] text-white/35 mt-0.5">Avg Conc.</p></div>
            <div className="text-center"><p className="text-sm font-black text-primary">{Math.round((fa.cs / fa.n) * 100)}%</p><p className="text-[9px] text-white/35 mt-0.5">Clean Sh.</p></div>
            <div className="text-center"><p className="text-sm font-black text-amber-400">{Math.round((fa.btts / fa.n) * 100)}%</p><p className="text-[9px] text-white/35 mt-0.5">BTTS</p></div>
          </div>
        </div>
      ))}
      {h2h.length > 0 && (
        <div className="rounded-2xl border border-white/8 p-4 bg-[#0c1810]">
          <p className="text-[10px] font-black text-white/40 uppercase tracking-wider mb-2">Head to Head</p>
          {h2hS && (
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="rounded-xl bg-primary/10 border border-primary/20 p-2.5 text-center"><p className="text-xl font-black text-primary">{h2hS.hw}</p><p className="text-[9px] text-white/40 truncate">{(fix.home_team_name || "Home").split(" ")[0]}</p></div>
              <div className="rounded-xl bg-white/5 border border-white/10 p-2.5 text-center"><p className="text-xl font-black text-white/50">{h2hS.dr}</p><p className="text-[9px] text-white/40">Draw</p></div>
              <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 p-2.5 text-center"><p className="text-xl font-black text-blue-400">{h2hS.aw}</p><p className="text-[9px] text-white/40 truncate">{(fix.away_team_name || "Away").split(" ")[0]}</p></div>
            </div>
          )}
          <div className="flex flex-col">
            {h2h.slice(0, 6).map((m: any, i: number) => (
              <div key={i} className="flex items-center gap-2 py-2 border-b border-white/5 last:border-0">
                <span className="text-[10px] text-white/25 w-14 shrink-0">{m.date ? new Date(m.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : ""}</span>
                <span className="text-xs text-white/65 truncate flex-1 text-right">{m.home}</span>
                <span className="text-xs font-black text-white bg-white/8 px-2 py-0.5 rounded shrink-0">{m.score || "-"}</span>
                <span className="text-xs text-white/40 truncate flex-1">{m.away}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {st.length > 0 && (
        <div className="rounded-2xl border border-white/8 p-4 bg-[#0c1810]">
          <p className="text-[10px] font-black text-white/40 uppercase tracking-wider mb-2">League Table</p>
          <div className="flex text-[9px] text-white/25 font-bold px-2 mb-1 gap-0"><span className="w-5">#</span><span className="flex-1">Club</span><span className="w-5 text-center">P</span><span className="w-5 text-center">W</span><span className="w-5 text-center">D</span><span className="w-5 text-center">L</span><span className="w-7 text-center">GD</span><span className="w-7 text-right">Pts</span></div>
          <div className="flex flex-col gap-0.5">
            {st.slice(0, 12).map((r: any, i: number) => {
              const hi = [fix.home_team_name, fix.away_team_name].some(n => (n || "").toLowerCase().includes((r.team || "").toLowerCase().split(" ")[0]));
              const gd = r.goal_difference ?? r.gd ?? null; const gdN = Number(gd);
              const gdStr = gd !== null ? (gdN > 0 ? "+" + gd : String(gd)) : "-";
              return (
                <div key={i} className={cn("flex items-center gap-0 px-2 py-1.5 rounded-lg text-xs", hi ? "bg-primary/10 border border-primary/20" : "")}>
                  <span className={cn("w-5 font-bold shrink-0", hi ? "text-primary" : "text-white/30")}>{r.position}</span>
                  <span className={cn("flex-1 font-semibold truncate mr-1", hi ? "text-primary" : "text-white/70")}>{r.team}</span>
                  <span className="w-5 text-center text-white/40">{r.played ?? "-"}</span>
                  <span className="w-5 text-center text-white/40">{r.won ?? "-"}</span>
                  <span className="w-5 text-center text-white/40">{r.drawn ?? "-"}</span>
                  <span className="w-5 text-center text-white/40">{r.lost ?? "-"}</span>
                  <span className={cn("w-7 text-center font-bold", gdN > 0 ? "text-primary/70" : gdN < 0 ? "text-red-400/70" : "text-white/30")}>{gdStr}</span>
                  <span className={cn("w-7 text-right font-black", hi ? "text-primary" : "text-white")}>{r.points ?? "-"}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {h2h.length === 0 && hf.length === 0 && (
        <div className="text-center py-12 text-white/30"><p className="text-4xl mb-3">📊</p><p>Stats loading — check back soon</p></div>
      )}
    </div>
  );
}

function PhantomChatTab({ fixtureId, isPremium, setLocation }: any) {
  const [msgs, setMsgs] = useState<{ role: string; content: string }[]>([
    { role: "assistant", content: "I have analysed this match. Ask me about form, tactics, value bets, or anything you want to know." }
  ]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const mutation = useMutation({
    mutationFn: (body: any) => fetchApi("/predict/" + fixtureId + "/chat", { method: "POST", body: JSON.stringify(body) }),
  });
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs]);
  if (!isPremium) return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
        <Bot size={28} className="text-primary"/>
      </div>
      <div className="text-center">
        <p className="font-bold text-white mb-1">Phantom AI Chat</p>
        <p className="text-sm text-white/40">Ask anything about this match</p>
      </div>
      <button onClick={() => setLocation("/paywall")}
        className="px-8 py-3 rounded-xl bg-primary text-black font-black text-sm">
        Unlock AI Chat
      </button>
    </div>
  );
  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || mutation.isPending) return;
    const msg = input.trim();
    setInput("");
    const next = [...msgs, { role: "user", content: msg }];
    setMsgs(next);
    mutation.mutate(
      { message: msg, history: msgs.slice(1) },
      {
        onSuccess: (r: any) => setMsgs([...next, { role: "assistant", content: r.reply || "No response" }]),
        onError: () => setMsgs([...next, { role: "assistant", content: "Sorry, I cannot analyse that right now." }]),
      }
    );
  };
  return (
    <div className="rounded-2xl border border-white/8 overflow-hidden flex flex-col bg-[#0c1810]" style={{ height: "480px" }}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/6 bg-primary/5 shrink-0">
        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
          <Bot size={12} className="text-primary"/>
        </div>
        <span className="text-xs font-black text-primary">Phantom AI</span>
        <span className="ml-auto text-[10px] text-white/25">Powered by Groq</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {msgs.map((m, i) => (
          <div key={i} className={cn("flex gap-2", m.role === "user" ? "flex-row-reverse" : "")}>
            <div className={cn("w-7 h-7 rounded-full flex items-center justify-center shrink-0",
              m.role === "user" ? "bg-white/10" : "bg-primary/15")}>
              {m.role === "user"
                ? <span className="text-[10px] font-black text-white/60">U</span>
                : <Bot size={11} className="text-primary"/>}
            </div>
            <div className={cn("max-w-[82%] px-3 py-2.5 rounded-2xl text-sm leading-relaxed",
              m.role === "user"
                ? "bg-primary/15 text-white rounded-tr-none"
                : "bg-white/5 text-white/80 rounded-tl-none")}>
              {m.content}
            </div>
          </div>
        ))}
        {mutation.isPending && (
          <div className="flex gap-2">
            <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center">
              <Bot size={11} className="text-primary"/>
            </div>
            <div className="bg-white/5 rounded-2xl rounded-tl-none px-3 py-2.5">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full bg-white/30 animate-bounce"
                    style={{ animationDelay: i * 0.15 + "s" }}/>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      <form onSubmit={send} className="flex gap-2 p-3 border-t border-white/6 shrink-0">
        <input value={input} onChange={e => setInput(e.target.value)}
          placeholder="Ask about this match..."
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-primary/40"/>
        <button type="submit" disabled={mutation.isPending || !input.trim()}
          className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center disabled:opacity-40 shrink-0">
          <Send size={14} className="text-black"/>
        </button>
      </form>
    </div>
  );
}

export default function MatchCenter() {
  const params = useParams();
  const fixtureId = params.id;
  const [, setLocation] = useLocation();
  const { data: user } = useAuth();
  const isPremium = (user as any)?.has_access;
  const [tab, setTab] = useState("Prediction");
  const { data, isLoading } = useQuery({
    queryKey: ["/api/matches", fixtureId],
    queryFn: () => fetchApi("/matches/" + fixtureId),
    staleTime: 3 * 60 * 1000,
    enabled: !!fixtureId,
  });
  const d = data as any;
  const fix = d?.fixture || {};
  const isLive = ["LIVE", "HT", "1H", "2H"].includes(fix.match_status || "");
  const isFT = ["FT", "AET", "Pen"].includes(fix.match_status || "");
  const matchTime = fix.match_date
    ? new Date(fix.match_date).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : "";
  return (
    <div className="min-h-screen pb-28" style={{ background: "#080f0b" }}>
      <div className="sticky top-0 z-20 px-4 pt-5 pb-0" style={{ background: "#080f0b" }}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 pr-4">
            <h1 className="text-xl font-black text-white leading-tight">
              {fix.home_team_name || "Home"}{" "}
              <span className="text-white/40 font-normal text-lg">vs</span>{" "}
              {fix.away_team_name || "Away"}
            </h1>
            <p className="text-[10px] font-black text-primary/60 uppercase tracking-[0.2em] mt-0.5">
              ScorePhantom Analysis
            </p>
          </div>
          <button onClick={() => setLocation("/")}
            className="w-8 h-8 rounded-full bg-white/8 border border-white/10 flex items-center justify-center shrink-0">
            <X size={14} className="text-white/50"/>
          </button>
        </div>
        {(isLive || isFT) && (
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl font-black text-white tabular-nums">
              {fix.home_score ?? 0} - {fix.away_score ?? 0}
            </span>
            {isLive && <span className="text-xs font-black text-red-400 bg-red-500/10 px-2 py-1 rounded-full animate-pulse">● LIVE</span>}
            {isFT && <span className="text-xs font-bold text-white/30 bg-white/5 px-2 py-1 rounded-full">FT</span>}
          </div>
        )}
        {!isLive && !isFT && (
          <p className="text-[11px] text-white/25 mb-3">{fix.tournament_name || ""}{matchTime ? " · " + matchTime : ""}</p>
        )}
        <div className="flex border-b border-white/8">
          {TABS.map(({ key, label, Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className={cn("flex items-center gap-1.5 px-4 py-3 text-sm font-bold transition-all border-b-2 -mb-px",
                tab === key ? "text-primary border-primary" : "text-white/35 border-transparent hover:text-white/55")}>
              <Icon size={13}/>
              {label}
            </button>
          ))}
        </div>
      </div>
      {isLoading && (
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin"/>
        </div>
      )}
      {!isLoading && (
        <div className="px-4 pt-5">
          <AnimatePresence mode="wait">
            <motion.div key={tab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}>
              {tab === "Prediction" && <PredictionTab fixtureId={fixtureId} isPremium={isPremium} setLocation={setLocation} matchData={d}/>}
              {tab === "Stats" && <StatsTab d={d}/>}
              {tab === "PhantomChat" && <PhantomChatTab fixtureId={fixtureId} isPremium={isPremium} setLocation={setLocation}/>}
            </motion.div>
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}