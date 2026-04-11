import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Header } from '@/components/layout/Header';
import { fetchApi } from '@/lib/api';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { ChevronLeft, Zap, Crown, Lock, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

function formatAccaMarket(key: string): string { const m: Record<string,string> = { home_win:"Home Win", away_win:"Away Win", draw:"Draw", over_15:"Over 1.5", over_25:"Over 2.5", over_35:"Over 3.5", under_15:"Under 1.5", under_25:"Under 2.5", under_35:"Under 3.5", btts_yes:"Both Teams Score", btts_no:"BTTS No", double_chance_home:"Home or Draw", double_chance_away:"Away or Draw", dnb_home:"Home Win (DNB)", dnb_away:"Away Win (DNB)", home_over_15:"Home Over 1.5", away_over_15:"Away Over 1.5", home_under_15:"Home Under 1.5", away_under_15:"Away Under 1.5" }; return m[key] ?? (key||'').replace(/_/g,' ').replace(/\b\w/g,(c:string)=>c.toUpperCase()); }

function toWAT(dateStr: string) {
  try { return new Date(dateStr).toLocaleTimeString('en-NG', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', hour12: false }); } catch { return ''; }
}

export default function DailyAcca() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading: authLoading } = useAuth();
  const isPremium = user?.access_status === 'active' || (user as any)?.subscription_active;
  const [stake, setStake] = useState(1000);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['/api/acca'],
    queryFn: () => fetchApi('/acca'),
    enabled: !!isPremium && !authLoading,
    staleTime: 15 * 60 * 1000,
  });

  if (authLoading) return <div className='min-h-screen bg-background' />;

  const picks = data?.picks || [];
  const combinedOdds = picks.reduce((acc: number, p: any) => {
    const o = p.pickOdds || p.oddsHome || p.oddsAway || (100/Math.max(p.probability,1));
    return acc * parseFloat(o);
  }, 1);
  const potentialReturn = stake * combinedOdds;
  const profit = potentialReturn - stake;

  return (
    <div className='min-h-screen bg-background'>
      <Header />
      <div className='max-w-2xl mx-auto px-4 pb-24'>
        <div className='flex items-center gap-3 pt-6 mb-6'>
          <button onClick={() => setLocation('/')} className='p-2 hover:bg-white/5 rounded-xl transition'><ChevronLeft className='w-5 h-5' /></button>
          <div className='flex-1'>
            <h1 className='text-2xl font-black flex items-center gap-2'><Zap className='w-6 h-6 text-primary' />Daily ACCA</h1>
            <p className='text-xs text-muted-foreground mt-0.5'>Smart auto-generated accumulator</p>
          </div>
          {isPremium && <button onClick={() => refetch()} className='p-2 hover:bg-white/5 rounded-xl transition text-muted-foreground hover:text-white'><RefreshCw className='w-4 h-4' /></button>}
        </div>
        {!isPremium ? (
          <div className='flex flex-col items-center justify-center py-20 text-center gap-6'>
            <div className='w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center'><Crown className='w-10 h-10 text-primary' /></div>
            <div><h2 className='text-xl font-black text-white mb-2'>Premium Feature</h2><p className='text-white/50 text-sm max-w-xs'>Daily ACCA is available to premium subscribers only.</p></div>
            <button onClick={() => setLocation('/paywall')} className='flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-black font-bold text-sm'><Lock className='w-4 h-4' />Upgrade to Premium</button>
          </div>
        ) : isLoading ? (
          <div className='flex justify-center py-20'><div className='w-10 h-10 rounded-full border-4 border-primary/20 border-t-primary animate-spin' /></div>
        ) : picks.length === 0 ? (
          <div className='text-center py-16'><Zap className='w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-20' /><p className='text-white/60 font-semibold'>{data?.message || 'No ACCA picks available yet.'}</p><p className='text-white/30 text-sm mt-2'>Predictions are being built — check back in a few minutes.</p></div>
        ) : (
          <div className='space-y-4'>
            <div className='rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-5'>
              <p className='text-xs font-bold text-primary/70 uppercase tracking-widest mb-3'>Combined Odds Summary</p>
              <div className='grid grid-cols-3 gap-3'>
                <div className='bg-black/30 rounded-xl p-3 text-center border border-white/8'><p className='text-[10px] text-muted-foreground mb-1'>Odds</p><p className='text-xl font-black text-white'>{combinedOdds.toFixed(2)}x</p></div>
                <div className='bg-primary/10 rounded-xl p-3 text-center border border-primary/20'><p className='text-[10px] text-muted-foreground mb-1'>Stake</p><p className='text-xl font-black text-primary'>NGN{stake.toLocaleString()}</p></div>
                <div className='bg-primary/10 rounded-xl p-3 text-center border border-primary/20'><p className='text-[10px] text-muted-foreground mb-1'>Return</p><p className='text-xl font-black text-primary'>NGN{Math.round(potentialReturn).toLocaleString()}</p></div>
              </div>
              <div className='mt-3'>
                <p className='text-[10px] text-muted-foreground mb-1.5'>Stake (NGN)</p>
                <div className='flex gap-2'>
                  {[500,1000,2000,5000].map(s => <button key={s} onClick={() => setStake(s)} className={cn('flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all', stake===s ? 'bg-primary text-black border-primary' : 'bg-white/5 text-muted-foreground border-white/10 hover:bg-white/8')}>{s >= 1000 ? s/1000+'k' : s}</button>)}
                </div>
              </div>
            </div>
            <div className='space-y-2'>
              {picks.map((pick: any, i: number) => {
                const realOdds = pick.pickOdds || pick.oddsHome || pick.oddsAway;
                const oddsFmt = realOdds ? parseFloat(realOdds).toFixed(2) : (100/Math.max(pick.probability,1)).toFixed(2);
                return (
                  <motion.div key={pick.fixtureId || i} initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay: i*0.06 }}
                    className='p-4 rounded-2xl bg-white/4 border border-white/8'>
                    <div className='flex items-start gap-3'>
                      <span className='w-7 h-7 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center text-xs font-black text-primary shrink-0'>{i+1}</span>
                      <div className='flex-1 min-w-0'>
                        <p className='font-bold text-sm text-white'>{pick.homeTeam} <span className='text-white/40'>vs</span> {pick.awayTeam}</p>
                        <p className='text-[11px] text-muted-foreground mt-0.5'>{pick.tournament}</p>
                        <div className='flex items-center gap-2 mt-1.5'>
                          <span className='text-xs font-bold text-white bg-white/8 px-2 py-0.5 rounded border border-white/10'>{formatAccaMarket(pick.market)} — {pick.selection}</span>
                        </div>
                      </div>
                      <div className='text-right shrink-0'>
                        <p className='text-lg font-black text-white'>{oddsFmt}</p>
                        <p className='text-[10px] text-muted-foreground'>{pick.probability?.toFixed(0)}% prob</p>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
            <div className='bg-white/4 border border-white/8 rounded-2xl p-4 text-center'>
              <p className='text-emerald-400 text-2xl font-black'>NGN{Math.round(profit).toLocaleString()}</p>
              <p className='text-xs text-muted-foreground mt-1'>Potential profit on NGN{stake.toLocaleString()} stake</p>
              <p className='text-[10px] text-white/25 mt-2'>Gamble responsibly. ScorePhantom predictions are for informational purposes only.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
