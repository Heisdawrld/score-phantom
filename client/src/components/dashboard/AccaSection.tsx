import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { ChevronRight, ChevronDown, ChevronUp, Trophy, Zap, Lock, AlertCircle, Flame, BarChart2, Activity, Star, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfidenceRing } from "@/components/ui/ConfidenceRing";
import { ConfidenceBadge } from "@/components/ui/ConfidenceBadge";
import { TeamLogo } from "@/components/TeamLogo";

function toWAT(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-NG', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', hour12: false });
  } catch { return ''; }
}

export function AccaSection({ isPremium }: { isPremium: boolean }) {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(true);
  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/acca'],
    queryFn: () => fetchApi('/acca'),
    enabled: isPremium && open,
    staleTime: 15 * 60 * 1000,
  });

  if (!isPremium) {
    return (
      <div className='rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/5 to-transparent p-4 flex items-center gap-4 cursor-pointer hover:bg-primary/8 transition-all' onClick={() => setLocation('/paywall')}>
        <div className='w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0'><Crown className='w-5 h-5 text-primary' /></div>
        <div className='flex-1'><p className='text-sm font-bold text-primary'>Daily ACCA Builder</p><p className='text-xs text-muted-foreground mt-0.5'>5-pick daily accumulator — Premium only</p></div>
        <Lock className='w-4 h-4 text-muted-foreground shrink-0' />
      </div>
    );
  }

  const picks = data?.picks || [];
  const combinedOdds = picks.reduce((acc: number, p: any) => {
    const realOdds = p.pickOdds || p.oddsHome || p.oddsAway || (100 / Math.max(p.probability, 1));
    return acc * parseFloat(realOdds);
  }, 1);

  return (
    <div className='rounded-2xl border border-primary/25 bg-gradient-to-b from-primary/[0.06] via-primary/[0.02] to-transparent overflow-hidden'>
      <button className='w-full flex items-center gap-3 px-4 py-3.5 hover:bg-primary/5 transition-all' onClick={() => setOpen(o => !o)}>
        <div className='w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0'><Zap className='w-4 h-4 text-primary' /></div>
        <div className='flex-1 text-left'>
          <p className='text-sm font-black text-primary tracking-wide'>Daily ACCA</p>
          <p className='text-[10px] text-white/35'>Smart auto-generated accumulator</p>
        </div>
        {picks.length > 0 && <span className='text-xs font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full'>{combinedOdds.toFixed(2)}x</span>}
        {open ? <ChevronUp className='w-4 h-4 text-primary shrink-0' /> : <ChevronDown className='w-4 h-4 text-primary shrink-0' />}
      </button>
      {open && (
        <div className='px-4 pb-4 space-y-3'>
          {isLoading && <div className='flex justify-center py-6'><div className='w-6 h-6 rounded-full border-2 border-primary/20 border-t-primary animate-spin' /></div>}
          {error && <p className='text-xs text-white/30 text-center py-4'>Could not load ACCA picks right now.</p>}
          {!isLoading && !error && picks.length === 0 && <p className='text-xs text-white/30 text-center py-4'>{data?.message || 'Building today ACCA — check back soon.'}</p>}
          {picks.length > 0 && (
            <div className='flex gap-2'>
              <div className='flex-1 bg-white/[0.04] rounded-xl p-2.5 border border-white/[0.06] text-center'><p className='text-[9px] text-white/35 mb-0.5'>Combined Odds</p><p className='text-sm font-black text-white'>{combinedOdds.toFixed(2)}x</p></div>
              <div className='flex-1 bg-primary/[0.06] rounded-xl p-2.5 border border-primary/15 text-center'><p className='text-[9px] text-white/35 mb-0.5'>NGN1k returns</p><p className='text-sm font-black text-primary'>NGN{Math.round(1000 * combinedOdds).toLocaleString()}</p></div>
            </div>
          )}
          {picks.map((pick: any, i: number) => {
            const realOdds = pick.pickOdds || pick.oddsHome || pick.oddsAway;
            const oddsFmt = realOdds ? parseFloat(realOdds).toFixed(2) : (100 / Math.max(pick.probability, 1)).toFixed(2);
            return (
              <div key={pick.fixtureId || i} className='flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]'>
                <span className='text-xs font-black text-white/25 w-5 shrink-0 pt-0.5'>#{i + 1}</span>
                <div className='flex-1 min-w-0'>
                  <p className='text-sm font-semibold truncate'>{pick.homeTeam} <span className='text-white/30 text-xs'>vs</span> {pick.awayTeam}</p>
                  <p className='text-[10px] text-white/30 truncate'>{pick.tournament}</p>
                  <p className='text-xs font-bold text-white mt-0.5'>{(pick.market || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())} — {pick.selection}</p>
                </div>
                <div className='text-right shrink-0 space-y-1'>
                  <p className='text-sm font-black text-primary'>{pick.probability?.toFixed(0)}%</p>
                  <p className='text-xs font-bold text-white/40 bg-white/[0.06] px-2 py-0.5 rounded border border-white/[0.06]'>{oddsFmt}</p>
                </div>
              </div>
            );
          })}
          {picks.length > 0 && <p className='text-[10px] text-white/15 text-center'>Odds shown are market odds · Always gamble responsibly</p>}
        </div>
      )}
    </div>
  );
}
