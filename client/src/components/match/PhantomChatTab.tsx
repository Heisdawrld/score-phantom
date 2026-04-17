import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchApi } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { X, Target, BarChart2, MessageCircle, Send, Bot, Zap, TrendingUp, Trophy, ChevronRight, Lock, Share2, Users, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfidenceRing } from "@/components/ui/ConfidenceRing";
import { ConfidenceBadge, getConfidenceTier } from "@/components/ui/ConfidenceBadge";
import { TeamLogo } from "@/components/TeamLogo";

const RISK_LABELS: Record<string, string> = {
  SAFE: 'Stable',
  MODERATE: 'Calculated',
  AGGRESSIVE: 'High Variance',
  VOLATILE: 'High Variance',
};
function riskColor(r: string) {
  const l = (r || '').toUpperCase();
  if (l === 'SAFE') return 'text-primary';
  if (l === 'AGGRESSIVE' || l === 'VOLATILE') return 'text-amber-400';
  return 'text-blue-400';
}

export function PhantomChatTab({ fixtureId, isPremium, setLocation }: any) {
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
        <Bot size={28} className="text-primary" />
      </div>
      <div className="text-center">
        <p className="font-bold text-white mb-1">PhantomChat</p>
        <p className="text-sm text-white/40">Deep match insights</p>
      </div>
      <button onClick={() => setLocation("/paywall")}
        className="px-8 py-3 rounded-xl bg-primary text-black font-black text-sm">
        Unlock PhantomChat
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
    <div className="rounded-2xl border border-white/[0.06] overflow-hidden flex flex-col bg-white/[0.01]" style={{ height: "480px" }}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.05] bg-primary/[0.04] shrink-0">
        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
          <Bot size={12} className="text-primary" />
        </div>
        <span className="text-xs font-black text-primary">PhantomChat</span>
        <span className="ml-auto text-[10px] text-white/20">ScorePhantom Analysis</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {msgs.map((m, i) => (
          <div key={i} className={cn("flex gap-2", m.role === "user" ? "flex-row-reverse" : "")}>
            <div className={cn("w-7 h-7 rounded-full flex items-center justify-center shrink-0", m.role === "user" ? "bg-white/10" : "bg-primary/15")}>
              {m.role === "user" ? <span className="text-[10px] font-black text-white/60">U</span> : <Bot size={11} className="text-primary" />}
            </div>
            <div className={cn("max-w-[82%] px-3 py-2.5 rounded-2xl text-sm leading-relaxed",
              m.role === "user" ? "bg-primary/15 text-white rounded-tr-none" : "bg-white/[0.04] text-white/80 rounded-tl-none")}>
              {m.content}
            </div>
          </div>
        ))}
        {msgs.length === 1 && !mutation.isPending && (
          <div className="flex flex-wrap gap-2 mt-3">
            {['Best pick here?', 'What could go wrong?', 'Safer angle?', 'Form analysis?', 'Is there value?'].map(chip => (
              <button key={chip} type="button" onClick={() => setInput(chip)}
                className="text-[11px] px-3 py-1.5 rounded-full border border-primary/25 text-primary/80 bg-primary/[0.04] hover:bg-primary/15 transition-all active:scale-95 shrink-0">{chip}</button>
            ))}
          </div>
        )}
        {mutation.isPending && (
          <div className="flex gap-2">
            <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center"><Bot size={11} className="text-primary" /></div>
            <div className="bg-white/[0.04] rounded-2xl rounded-tl-none px-3 py-2.5">
              <div className="flex gap-1">{[0, 1, 2].map(i => (<span key={i} className="w-1.5 h-1.5 rounded-full bg-white/30 animate-bounce" style={{ animationDelay: i * 0.15 + "s" }} />))}</div>
            </div>
          </div>
        )}
      </div>
      <form onSubmit={send} className="flex gap-2 p-3 border-t border-white/[0.05] shrink-0">
        <input value={input} onChange={e => setInput(e.target.value)}
          placeholder="Ask about this match..."
          className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-primary/40" />
        <button type="submit" disabled={mutation.isPending || !input.trim()}
          className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center disabled:opacity-40 shrink-0">
          <Send size={14} className="text-black" />
        </button>
      </form>
    </div>
  );
}
