import { useQuery } from '@tanstack/react-query';
import { Header } from '@/components/layout/Header';
import { fetchApi } from '@/lib/api';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { ChevronLeft, CheckCircle2, XCircle, Clock, Minus, BarChart2, Activity } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ConfidenceRing } from '@/components/ui/ConfidenceRing';

function fmtDate(d: string) { try { return new Date(d).toLocaleDateString('en-NG',{timeZone:'Africa/Lagos',day:'2-digit',month:'short',year:'numeric'}); } catch{return d;} }
function fmtMarket(m: string) { return (m||'').replace(/_/g,' ').replace(/\b\w/g, (c:string) => c.toUpperCase()); }

const OUTCOME_CONFIG = {
  win:     { icon: CheckCircle2, color: 'text-primary',   bg: 'bg-primary/5 border-primary/20',     cardTitle: 'Winning Pick', label: 'HIT'   },
  correct: { icon: CheckCircle2, color: 'text-primary',   bg: 'bg-primary/5 border-primary/20',     cardTitle: 'Winning Pick', label: 'HIT'   },
  loss:    { icon: XCircle,       color: 'text-red-400',   bg: 'bg-red-500/5 border-red-500/20',       cardTitle: 'Lost Pick',    label: 'MISS'  },
  wrong:   { icon: XCircle,       color: 'text-red-400',   bg: 'bg-red-500/5 border-red-500/20',       cardTitle: 'Lost Pick',    label: 'MISS'  },
  void:    { icon: Minus,         color: 'text-amber-400', bg: 'bg-amber-500/5 border-amber-500/20',   cardTitle: 'Voided Pick',  label: 'VOID'  },
  pending: { icon: Clock,         color: 'text-blue-400',  bg: 'bg-blue-500/5 border-blue-500/20',     cardTitle: 'In Progress',  label: 'PENDING'},
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
    <div className='min-h-screen bg-background pb-20'>
      <Header />
      <div className='max-w-3xl mx-auto px-4'>
        
        {/* ── Page Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-6 mb-8">
          <div className="flex items-center gap-3">
            <button onClick={() => setLocation('/')} className="w-10 h-10 flex items-center justify-center bg-white/[0.04] border border-white/[0.08] rounded-xl text-white/40 hover:text-white transition-all shrink-0">
              <ChevronLeft size={20} />
            </button>
            <div>
              <h1 className="text-2xl font-black flex items-center gap-3 tracking-tight">
                Results <span className="text-primary italic">Feed</span>
              </h1>
              <p className="text-[11px] font-black text-white/25 uppercase tracking-widest mt-0.5">
                Past 30 Days Sent Predictions
              </p>
            </div>
          </div>
        </div>

        {/* ── Summary Cards ── */}
        <div className='grid grid-cols-4 gap-2.5 mb-6'>
          <div className='glass-card rounded-2xl p-3 flex flex-col items-center justify-center'>
            <p className='text-2xl font-black text-white'>{summary.total}</p>
            <p className='text-[9px] font-black text-white/30 uppercase tracking-widest mt-0.5'>Total</p>
          </div>
          <div className='bg-primary/[0.05] border border-primary/20 rounded-2xl p-3 flex flex-col items-center justify-center'>
            <p className='text-2xl font-black text-primary'>{summary.wins}</p>
            <p className='text-[9px] font-black text-primary/40 uppercase tracking-widest mt-0.5'>Won</p>
          </div>
          <div className='bg-red-500/[0.05] border border-red-500/20 rounded-2xl p-3 flex flex-col items-center justify-center'>
            <p className='text-2xl font-black text-red-400'>{summary.losses}</p>
            <p className='text-[9px] font-black text-red-400/40 uppercase tracking-widest mt-0.5'>Lost</p>
          </div>
          <div className='bg-primary/10 border border-primary/30 rounded-2xl p-3 flex flex-col items-center justify-center glow-primary relative overflow-hidden'>
            <p className='text-2xl font-black text-primary'>{winRate}%</p>
            <p className='text-[9px] font-black text-primary uppercase tracking-widest mt-0.5'>Hit Rate</p>
          </div>
        </div>

        {/* ── Feed List ── */}
        {isLoading ? (
          <div className='space-y-3 mt-8'>
            {[...Array(6)].map((_, i) => (
              <div key={i} className='h-24 rounded-[1.5rem] sp-shimmer' style={{animationDelay: `${i * 0.1}s`}} />
            ))}
          </div>
        ) : results.length === 0 ? (
          <div className='glass-card rounded-3xl py-24 text-center mt-8 text-white/20'>
            <Activity className='w-16 h-16 mx-auto mb-4 opacity-50' />
            <p className='text-white/60 text-lg font-black uppercase tracking-tight'>No Results found</p>
            <p className='text-[11px] font-black text-white/20 uppercase tracking-widest mt-2'>Your past predictions will show here</p>
          </div>
        ) : (
          <div className='space-y-3'>
            {results.map((result: any, i: number) => {
              const cfg = OUTCOME_CONFIG[result.outcome as keyof typeof OUTCOME_CONFIG] || OUTCOME_CONFIG.pending;
              const Icon = cfg.icon;
              
              return (
                <motion.div 
                  key={result.fixtureId || i} 
                  initial={{opacity:0, y:12}} 
                  animate={{opacity:1, y:0}} 
                  transition={{delay: i * 0.04, duration: 0.3}}
                  className={cn('relative rounded-2xl p-4 transition-all glass-card border border-white/[0.04]')}
                >
                  <div className='flex items-center gap-4'>
                    
                    {/* Status indicator line */}
                    <div className={cn("absolute left-0 top-3 bottom-3 w-1 rounded-r-full", cfg.bg.split(' ')[0].replace('/5', ''))} />

                    <div className="flex-1 min-w-0 pl-1">
                      <div className="flex items-center gap-2 mb-1.5 opacity-60">
                         <Icon className={cn('w-3.5 h-3.5', cfg.color)} />
                         <span className={cn('text-[10px] font-black uppercase tracking-widest', cfg.color)}>{cfg.cardTitle}</span>
                      </div>
                      
                      <p className='font-bold text-sm text-white truncate leading-tight'>{result.match}</p>
                      
                      <div className='flex items-center gap-2 mt-2 flex-wrap'>
                        <span className='text-[10px] bg-white/[0.04] border border-white/[0.08] px-2 py-0.5 rounded uppercase tracking-wider text-white/70'>
                          {fmtMarket(result.market)}
                        </span>
                        <span className='text-[10px] font-black text-white/30'>→</span>
                        <span className='text-[10px] font-black bg-white/[0.08] text-white px-2 py-0.5 rounded'>
                          {result.predicted}
                        </span>
                      </div>
                    </div>
                    
                    <div className='shrink-0 flex flex-col items-end gap-2'>
                        {/* Status Stamp */}
                        <div className={cn('px-2.5 py-1 rounded text-[10px] font-black tracking-widest uppercase border', cfg.color, cfg.bg)}>
                          {cfg.label}
                        </div>
                        
                        <div className="flex items-center gap-2">
                           {result.actual && <p className='text-[10px] font-mono text-white/30'>{result.actual}</p>}
                           <ConfidenceRing value={result.confidence || 0} size={28} strokeWidth={2.5} />
                        </div>
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
