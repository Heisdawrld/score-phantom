import { useQuery } from '@tanstack/react-query';
import { Header } from '@/components/layout/Header';
import { fetchApi } from '@/lib/api';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { ChevronLeft, CheckCircle2, XCircle, Clock, Minus, TrendingUp, BarChart2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

function fmtDate(d: string) { try { return new Date(d).toLocaleDateString('en-NG',{timeZone:'Africa/Lagos',day:'2-digit',month:'short',year:'numeric'}); } catch{return d;} }
function fmtMarket(m: string) { return (m||'').replace(/_/g,' ').replace(/\b\w/g, (c:string) => c.toUpperCase()); }

const OUTCOME_CONFIG = {
  win:     { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', label: 'Won' },
  correct: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', label: 'Won' },
  loss:    { icon: XCircle,       color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/20',         label: 'Lost' },
  wrong:   { icon: XCircle,       color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/20',         label: 'Lost' },
  void:    { icon: Minus,         color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/20',     label: 'Void' },
  pending: { icon: Clock,         color: 'text-blue-400',    bg: 'bg-blue-500/10 border-blue-500/20',       label: 'Pending' },
};

export default function PredictionResults() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading: authLoading } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['prediction-results'],
    queryFn: () => fetchApi('/prediction-results?limit=50&days=30'),
    enabled: !authLoading,
  });
  if (authLoading) return <div className='min-h-screen bg-background' />;
  const results = data?.results || [];
  const summary = data?.summary || { total:0, wins:0, losses:0, pending:0, voids:0 };
  const settled = summary.wins + summary.losses;
  const winRate = settled > 0 ? ((summary.wins / settled) * 100).toFixed(1) : '0.0';
  return (
    <div className='min-h-screen bg-background'>
      <Header />
      <div className='max-w-2xl mx-auto px-4 pb-24'>
        <div className='flex items-center gap-3 pt-6 mb-6'>
          <button onClick={() => setLocation('/')} className='p-2 hover:bg-white/5 rounded-xl transition'><ChevronLeft className='w-5 h-5' /></button>
          <div className='flex-1'><h1 className='text-2xl font-black flex items-center gap-2'><BarChart2 className='w-6 h-6 text-primary' />Results</h1><p className='text-xs text-muted-foreground mt-0.5'>Last 30 days of prediction outcomes</p></div>
        </div>
        <div className='grid grid-cols-4 gap-2 mb-5'>
          <div className='bg-white/5 border border-white/8 rounded-2xl p-3 text-center'><p className='text-xl font-black text-white'>{summary.total}</p><p className='text-[9px] text-muted-foreground uppercase tracking-wide mt-0.5'>Total</p></div>
          <div className='bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-3 text-center'><p className='text-xl font-black text-emerald-400'>{summary.wins}</p><p className='text-[9px] text-emerald-400/70 uppercase tracking-wide mt-0.5'>Wins</p></div>
          <div className='bg-red-500/10 border border-red-500/20 rounded-2xl p-3 text-center'><p className='text-xl font-black text-red-400'>{summary.losses}</p><p className='text-[9px] text-red-400/70 uppercase tracking-wide mt-0.5'>Losses</p></div>
          <div className='bg-primary/10 border border-primary/20 rounded-2xl p-3 text-center'><p className='text-xl font-black text-primary'>{winRate}%</p><p className='text-[9px] text-primary/70 uppercase tracking-wide mt-0.5'>Win Rate</p></div>
        </div>
        {isLoading ? (
          <div className='flex justify-center py-16'><div className='w-10 h-10 rounded-full border-4 border-primary/20 border-t-primary animate-spin' /></div>
        ) : results.length === 0 ? (
          <div className='text-center py-16 bg-white/4 border border-white/8 rounded-2xl'><TrendingUp className='w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-20' /><p className='text-white/60 font-semibold'>No results yet</p><p className='text-white/30 text-sm mt-2'>Your prediction outcomes will appear here as matches resolve.</p></div>
        ) : (
          <div className='space-y-2'>
            {results.map((result: any, i: number) => {
              const cfg = OUTCOME_CONFIG[result.outcome as keyof typeof OUTCOME_CONFIG] || OUTCOME_CONFIG.pending;
              const Icon = cfg.icon;
              return (
                <motion.div key={result.fixtureId || i} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:i*0.03}}
                  className={cn('border rounded-2xl p-4', cfg.bg)}>
                  <div className='flex items-start gap-3'>
                    <Icon className={cn('w-5 h-5 shrink-0 mt-0.5', cfg.color)} />
                    <div className='flex-1 min-w-0'>
                      <p className='font-bold text-sm text-white truncate'>{result.match}</p>
                      <p className='text-xs text-muted-foreground mt-0.5'>{fmtDate(result.date)}</p>
                      <div className='flex items-center gap-2 mt-1.5 flex-wrap'>
                        <span className='text-[10px] font-bold text-white bg-white/8 px-2 py-0.5 rounded border border-white/10'>{fmtMarket(result.market)}</span>
                        <span className='text-[10px] text-white/60'>→</span>
                        <span className='text-[10px] font-bold text-white/80'>{result.predicted}</span>
                      </div>
                    </div>
                    <div className='text-right shrink-0'>
                      <span className={cn('text-xs font-black px-2 py-1 rounded-lg', cfg.color, 'bg-black/20')}>{cfg.label}</span>
                      {result.actual && <p className='text-[10px] text-muted-foreground mt-1'>{result.actual}</p>}
                      <p className='text-[10px] text-muted-foreground mt-0.5'>{result.confidence?.toFixed(0)}% conf</p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
