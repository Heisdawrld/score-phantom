import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchApi } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { motion } from 'framer-motion';
import { Activity, Target, Shield, CheckCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function TrackRecord() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['track-record-stats'],
    queryFn: () => fetchApi('/track-record/stats')
  });

  const { data: recent, isLoading: recentLoading } = useQuery({
    queryKey: ['track-record-recent'],
    queryFn: () => fetchApi('/track-record/recent?limit=50')
  });

  const formatMarket = (marketId: string) => {
    return marketId.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  return (
    <div className='min-h-screen bg-background pb-24'>
      <Header />
      
      <main className='max-w-lg mx-auto px-4 pt-6 space-y-8'>
        
        {/* Header */}
        <div className='text-center space-y-2 mb-8'>
          <div className='inline-flex items-center justify-center p-3 bg-primary/10 rounded-full mb-2'>
            <Activity className='w-8 h-8 text-primary' />
          </div>
          <h1 className='text-3xl font-display tracking-widest text-white drop-shadow-md'>
            TRACK <span className='text-primary'>RECORD</span>
          </h1>
          <p className='text-muted text-sm px-4'>
            Verifiable, transparent historical hit rates across 58,000+ simulated past matches.
          </p>
        </div>

        {/* Global Stats Card */}
        {stats && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className='glass-panel p-6 rounded-[2rem] border border-primary/20 shadow-[0_0_40px_rgba(16,231,116,0.1)] relative overflow-hidden'
          >
            <div className='absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(16,231,116,0.1),transparent_70%)]' />
            
            <div className='relative z-10 flex flex-col items-center justify-center py-4'>
              <p className='text-xs font-bold text-white/50 uppercase tracking-widest mb-2 flex items-center gap-2'>
                <Shield className='w-4 h-4' /> Overall Accuracy
              </p>
              <div className='text-6xl font-display text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]'>
                {(stats.overall.hitRate * 100).toFixed(1)}<span className='text-3xl text-primary'>%</span>
              </div>
              <p className='text-sm text-primary/80 font-medium mt-3 tracking-wide'>
                {stats.overall.won} Won / {stats.overall.total} Total
              </p>
            </div>
          </motion.div>
        )}

        {/* Market Performance Grid */}
        {stats?.byMarket && stats.byMarket.length > 0 && (
          <div className='space-y-4'>
            <h2 className='text-xs font-black text-white/40 uppercase tracking-widest pl-2 flex items-center gap-2'>
              <Target className='w-4 h-4' /> Performance by Market
            </h2>
            <div className='grid grid-cols-2 gap-3'>
              {stats.byMarket.map((m: any) => (
                <div key={m.market} className='glass-panel p-4 rounded-2xl border border-white/5'>
                  <p className='text-[10px] font-bold text-white/50 uppercase tracking-wider mb-1 truncate'>
                    {formatMarket(m.market)}
                  </p>
                  <p className='text-2xl font-display text-white'>
                    {(m.hitRate * 100).toFixed(1)}<span className='text-sm text-primary'>%</span>
                  </p>
                  <p className='text-[10px] text-white/30 mt-1'>{m.total} matches</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Results Feed */}
        <div className='space-y-4 pt-4'>
          <h2 className='text-xs font-black text-white/40 uppercase tracking-widest pl-2'>
            Recent Simulations
          </h2>
          
          {recentLoading ? (
            <div className='flex justify-center py-8'>
              <img src="/images/logo.png" className="w-8 h-8 animate-spin opacity-50" alt="Loading" />
            </div>
          ) : recent?.results?.length > 0 ? (
            <div className='space-y-3'>
              {recent.results.map((r: any) => (
                <div key={r.fixture_id} className='glass-panel p-4 rounded-2xl border border-white/5 relative overflow-hidden'>
                  <div className={cn(
                    'absolute left-0 top-0 bottom-0 w-1',
                    r.actual_result === 'WON' ? 'bg-primary shadow-[0_0_10px_rgba(16,231,116,0.8)]' : 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]'
                  )} />
                  
                  <div className='flex justify-between items-start mb-3 pl-2'>
                    <div>
                      <p className='text-sm font-bold text-white'>{r.home_team} vs {r.away_team}</p>
                      <p className='text-[10px] text-white/40'>{new Date(r.match_date).toLocaleDateString()}</p>
                    </div>
                    <div className={cn(
                      'flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-black tracking-wider uppercase border',
                      r.actual_result === 'WON' ? 'bg-primary/10 text-primary border-primary/20' : 'bg-red-500/10 text-red-500 border-red-500/20'
                    )}>
                      {r.actual_result === 'WON' ? <CheckCircle className='w-3 h-3' /> : <XCircle className='w-3 h-3' />}
                      {r.actual_result}
                    </div>
                  </div>

                  <div className='flex justify-between items-end pl-2 pt-2 border-t border-white/5'>
                    <div>
                      <p className='text-[10px] uppercase text-white/40 mb-0.5'>Top Pick</p>
                      <p className='text-sm font-display text-white/90'>{formatMarket(r.top_prediction)}</p>
                    </div>
                    <div className='text-right'>
                      <p className='text-[10px] uppercase text-white/40 mb-0.5'>Actual Score</p>
                      <p className='text-lg font-display text-white'>{r.home_goals} - {r.away_goals}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className='glass-panel p-8 text-center rounded-2xl border border-white/5'>
              <p className='text-white/40 text-sm'>No backtest results found yet.</p>
              <p className='text-[10px] text-white/30 mt-2'>Run the CLI engine to populate data.</p>
            </div>
          )}
        </div>

      </main>
    </div>
  );
}