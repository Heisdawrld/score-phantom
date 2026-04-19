import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Header } from '@/components/layout/Header';
import { fetchApi } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { ChevronLeft, Zap, Target, TrendingUp, AlertTriangle, Shield, SlidersHorizontal, CloudRain } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { ConfidenceBadge } from '@/components/ui/ConfidenceBadge';
import { useLocation } from 'wouter';

export default function Simulator() {
  const [, setLocation] = useLocation();
  const { data: user } = useAuth();
  const isPremium = user?.access_status === 'active' || (user as any)?.subscription_active || (user as any)?.is_admin;

  const [homeTeamId, setHomeTeamId] = useState('42'); // Arsenal
  const [awayTeamId, setAwayTeamId] = useState('33'); // Man U
  
  const [modifiers, setModifiers] = useState({
    homeMotivation: 0,
    awayMotivation: 0,
    homeInjuries: 0,
    awayInjuries: 0,
    weather: 'normal'
  });

  const { data: simulation, isPending, mutate } = useMutation({
    mutationFn: async () => {
      return fetchApi('/simulator/run', {
        method: 'POST',
        body: JSON.stringify({
          home_team_id: homeTeamId,
          away_team_id: awayTeamId,
          modifiers
        })
      });
    }
  });

  if (!isPremium) {
    return (
      <div className='min-h-screen bg-background pb-20'>
        <Header />
        <main className='max-w-lg mx-auto px-4 pt-6'>
          <div className='glass-panel p-8 rounded-2xl text-center space-y-4'>
            <Shield className='w-12 h-12 text-primary mx-auto opacity-50' />
            <h2 className='text-xl font-bold text-white'>Premium Feature</h2>
            <p className='text-muted'>The Interactive Match Simulator is only available to Premium members.</p>
            <button onClick={() => setLocation('/premium')} className='w-full py-3 bg-primary text-primary-foreground font-bold rounded-xl'>Upgrade Now</button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-background pb-20'>
      <Header />
      
      <main className='max-w-lg mx-auto px-4 pt-6 space-y-6'>
        {/* Header */}
        <div className='flex items-center gap-3'>
          <button onClick={() => setLocation('/')} className='w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/70 hover:text-white transition-colors'>
            <ChevronLeft className='w-5 h-5' />
          </button>
          <div>
            <h1 className='font-display text-2xl tracking-wider text-white'>MATCH <span className='text-primary'>SIMULATOR</span></h1>
            <p className='text-sm text-muted'>Test variables against the AI Engine</p>
          </div>
        </div>

        {/* Controls */}
        <div className='glass-panel p-5 rounded-2xl space-y-6'>
          <div className='flex items-center justify-between gap-4'>
            <div className='flex-1'>
              <label className='text-xs font-medium text-muted uppercase tracking-wider mb-2 block'>Home Team ID</label>
              <input type="text" value={homeTeamId} onChange={e => setHomeTeamId(e.target.value)} className='w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white text-center' />
            </div>
            <div className='flex-1'>
              <label className='text-xs font-medium text-muted uppercase tracking-wider mb-2 block'>Away Team ID</label>
              <input type="text" value={awayTeamId} onChange={e => setAwayTeamId(e.target.value)} className='w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white text-center' />
            </div>
          </div>

          <div className='space-y-4 pt-4 border-t border-white/10'>
            <div>
              <div className='flex justify-between text-sm mb-2'>
                <span className='text-white/70'>Home Motivation (Boost)</span>
                <span className='text-primary font-medium'>{(modifiers.homeMotivation * 15).toFixed(0)}%</span>
              </div>
              <input type="range" min="-1" max="1" step="0.1" value={modifiers.homeMotivation} onChange={e => setModifiers({...modifiers, homeMotivation: parseFloat(e.target.value)})} className='w-full accent-primary' />
            </div>

            <div>
              <div className='flex justify-between text-sm mb-2'>
                <span className='text-white/70'>Home Key Injuries</span>
                <span className='text-destructive font-medium'>{modifiers.homeInjuries} players</span>
              </div>
              <input type="range" min="0" max="5" step="1" value={modifiers.homeInjuries} onChange={e => setModifiers({...modifiers, homeInjuries: parseInt(e.target.value)})} className='w-full accent-destructive' />
            </div>
          </div>

          <div className='pt-4 border-t border-white/10'>
             <label className='text-xs font-medium text-muted uppercase tracking-wider mb-3 block'>Weather Conditions</label>
             <div className='flex gap-2'>
                {['normal', 'rain', 'snow'].map(w => (
                  <button 
                    key={w}
                    onClick={() => setModifiers({...modifiers, weather: w})}
                    className={cn(
                      'flex-1 py-2 rounded-lg text-sm font-medium capitalize border transition-all',
                      modifiers.weather === w ? 'bg-primary/20 border-primary text-primary' : 'bg-white/5 border-white/10 text-white/50'
                    )}
                  >
                    {w}
                  </button>
                ))}
             </div>
          </div>

          <button 
            onClick={() => mutate()}
            disabled={isPending}
            className='w-full py-4 bg-primary text-primary-foreground font-bold rounded-xl shadow-[0_0_20px_rgba(16,231,116,0.2)] hover:shadow-[0_0_30px_rgba(16,231,116,0.4)] transition-all flex items-center justify-center gap-2'
          >
            {isPending ? <RefreshCw className='w-5 h-5 animate-spin' /> : <Zap className='w-5 h-5' />}
            {isPending ? 'Simulating Engine...' : 'Run Simulation'}
          </button>
        </div>

        {/* Results */}
        {simulation && simulation.simulation && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className='space-y-4'>
             <div className='glass-panel p-5 rounded-2xl flex items-center justify-between'>
                <div className='text-center'>
                  <p className='text-xs text-muted uppercase tracking-wider mb-1'>Home xG</p>
                  <p className='text-3xl font-display text-white'>{simulation.simulation.home_xg}</p>
                </div>
                <div className='text-center'>
                  <p className='text-xs text-muted uppercase tracking-wider mb-1'>Predictability</p>
                  <ConfidenceBadge confidence={simulation.simulation.predictability.confidence_level} />
                </div>
                <div className='text-center'>
                  <p className='text-xs text-muted uppercase tracking-wider mb-1'>Away xG</p>
                  <p className='text-3xl font-display text-white'>{simulation.simulation.away_xg}</p>
                </div>
             </div>

             <div className='glass-panel p-5 rounded-2xl'>
                <h3 className='font-medium text-white mb-4 flex items-center gap-2'><Target className='w-4 h-4 text-primary' /> Top Engine Recommendations</h3>
                <div className='space-y-3'>
                  {simulation.simulation.markets.slice(0, 3).map((market: any, idx: number) => (
                    <div key={idx} className='flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5'>
                      <div>
                        <p className='font-medium text-white'>{market.market}</p>
                        <p className='text-xs text-muted'>{market.reason}</p>
                      </div>
                      <div className='text-right'>
                        <p className='text-lg font-bold text-primary'>{(market.probability * 100).toFixed(0)}%</p>
                      </div>
                    </div>
                  ))}
                </div>
             </div>
          </motion.div>
        )}

      </main>
    </div>
  );
}