import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Header } from '@/components/layout/Header';
import { fetchApi } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { ChevronLeft, Zap, Target, TrendingUp, AlertTriangle, Shield, SlidersHorizontal, CloudRain, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { AIAdvisorBadge, AdvisorStatus } from '@/components/ui/AIAdvisorBadge';
import { useLocation } from 'wouter';
import { MatchSelectorModal } from '@/components/simulator/MatchSelectorModal';
import { TeamLogo } from '@/components/TeamLogo';

export default function PhantomLab() {
  const [, setLocation] = useLocation();
  const { data: user } = useAuth();
  const isPremium = user?.access_status === 'active' || (user as any)?.subscription_active || (user as any)?.is_admin;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<{
    homeTeamId: string;
    awayTeamId: string;
    name: string;
    homeTeamName: string;
    awayTeamName: string;
  } | null>(null);
  
  const [modifiers, setModifiers] = useState({
    homeMotivation: 0,
    awayMotivation: 0,
    homeInjuries: 0,
    awayInjuries: 0,
    weather: 'normal',
    lineupStrength: 'full'
  });

  const { data: simulation, isPending, mutate } = useMutation({
    mutationFn: async () => {
      if (!selectedMatch) return;
      return fetchApi('/simulator/run', {
        method: 'POST',
        body: JSON.stringify({
          home_team_id: selectedMatch.homeTeamId,
          away_team_id: selectedMatch.awayTeamId,
          home_team_name: selectedMatch.homeTeamName,
          away_team_name: selectedMatch.awayTeamName,
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
          <div className='glass-panel p-8 rounded-2xl text-center space-y-4 border border-primary/20 shadow-[0_0_50px_rgba(16,231,116,0.1)] relative overflow-hidden'>
            <div className='absolute inset-0 bg-gradient-to-b from-primary/10 to-transparent opacity-50' />
            <Shield className='w-12 h-12 text-primary mx-auto relative z-10' />
            <h2 className='text-2xl font-display tracking-wider text-white relative z-10'>PHANTOM <span className='text-primary'>LAB</span></h2>
            <p className='text-muted relative z-10'>The Interactive Match Sandbox is exclusively available to Premium members.</p>
            <button onClick={() => setLocation('/premium')} className='w-full py-4 bg-primary text-primary-foreground font-bold rounded-xl relative z-10 shadow-[0_0_20px_rgba(16,231,116,0.3)]'>Upgrade to Access Lab</button>
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
            <h1 className='font-display text-2xl tracking-wider text-white'>PHANTOM <span className='text-primary'>LAB</span></h1>
            <p className='text-sm text-muted'>Test variables against the ScorePhantom Model</p>
          </div>
        </div>

        {/* Controls */}
        <div className='glass-panel p-5 rounded-2xl space-y-6'>
          
          {/* Match Selector */}
          <button 
            onClick={() => setIsModalOpen(true)}
            className='w-full py-4 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all flex items-center justify-between group'
          >
            {selectedMatch ? (
              <div className='flex items-center gap-3 w-full'>
                <div className='flex-1 flex items-center justify-end gap-2'>
                  <span className='font-bold text-white truncate'>{selectedMatch.name.split(' vs ')[0]}</span>
                  <TeamLogo teamId={selectedMatch.homeTeamId} className='w-6 h-6' />
                </div>
                <div className='text-xs font-black text-primary bg-primary/10 px-2 py-0.5 rounded'>VS</div>
                <div className='flex-1 flex items-center justify-start gap-2'>
                  <TeamLogo teamId={selectedMatch.awayTeamId} className='w-6 h-6' />
                  <span className='font-bold text-white truncate'>{selectedMatch.name.split(' vs ')[1]}</span>
                </div>
              </div>
            ) : (
              <div className='flex items-center gap-3 mx-auto text-white/70 group-hover:text-white'>
                <Search className='w-5 h-5' />
                <span className='font-medium uppercase tracking-wider'>Select Match</span>
              </div>
            )}
          </button>

          <div className={cn('space-y-4 pt-4 border-t border-white/10 transition-opacity', !selectedMatch && 'opacity-30 pointer-events-none')}>
            <div>
              <div className='flex justify-between text-sm mb-2'>
                <span className='text-white/70'>Home Motivation (Boost)</span>
                <span className='text-primary font-medium'>{(modifiers.homeMotivation * 15).toFixed(0)}%</span>
              </div>
              <input type="range" min="-1" max="1" step="0.1" value={modifiers.homeMotivation} onChange={e => setModifiers({...modifiers, homeMotivation: parseFloat(e.target.value)})} className='w-full accent-primary' />
            </div>

            <div>
              <div className='flex justify-between text-sm mb-2'>
                <span className='text-white/70'>Away Motivation (Boost)</span>
                <span className='text-blue-400 font-medium'>{(modifiers.awayMotivation * 15).toFixed(0)}%</span>
              </div>
              <input type="range" min="-1" max="1" step="0.1" value={modifiers.awayMotivation} onChange={e => setModifiers({...modifiers, awayMotivation: parseFloat(e.target.value)})} className='w-full accent-blue-400' />
            </div>

            <div className='grid grid-cols-2 gap-4 pt-2'>
              <div>
                <div className='flex justify-between text-sm mb-2'>
                  <span className='text-white/70 text-xs'>Home Injuries</span>
                  <span className='text-destructive font-medium text-xs'>{modifiers.homeInjuries}</span>
                </div>
                <input type="range" min="0" max="5" step="1" value={modifiers.homeInjuries} onChange={e => setModifiers({...modifiers, homeInjuries: parseInt(e.target.value)})} className='w-full accent-destructive' />
              </div>
              <div>
                <div className='flex justify-between text-sm mb-2'>
                  <span className='text-white/70 text-xs'>Away Injuries</span>
                  <span className='text-destructive font-medium text-xs'>{modifiers.awayInjuries}</span>
                </div>
                <input type="range" min="0" max="5" step="1" value={modifiers.awayInjuries} onChange={e => setModifiers({...modifiers, awayInjuries: parseInt(e.target.value)})} className='w-full accent-destructive' />
              </div>
            </div>
          </div>

          <div className={cn('pt-4 border-t border-white/10 space-y-4', !selectedMatch && 'opacity-30 pointer-events-none')}>
             <div>
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
             
             <div>
               <label className='text-xs font-medium text-muted uppercase tracking-wider mb-3 block'>Lineup Strength (Rotation Risk)</label>
               <div className='flex gap-2'>
                  {[
                    { id: 'full', label: 'Full Strength' },
                    { id: 'rotated', label: 'Rotated' },
                    { id: 'heavily_rotated', label: 'Heavy Rotation' }
                  ].map(l => (
                    <button 
                      key={l.id}
                      onClick={() => setModifiers({...modifiers, lineupStrength: l.id})}
                      className={cn(
                        'flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all',
                        modifiers.lineupStrength === l.id ? 'bg-primary/20 border-primary text-primary' : 'bg-white/5 border-white/10 text-white/50'
                      )}
                    >
                      {l.label}
                    </button>
                  ))}
               </div>
             </div>
          </div>

          <button 
            onClick={() => mutate()}
            disabled={isPending || !selectedMatch}
            className='w-full py-4 bg-primary text-primary-foreground font-bold rounded-xl shadow-[0_0_20px_rgba(16,231,116,0.2)] hover:shadow-[0_0_30px_rgba(16,231,116,0.4)] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden relative'
          >
            {isPending && (
              <div className="absolute inset-0 bg-white/20 animate-pulse" />
            )}
            {isPending ? (
              <>
                <img src="/images/logo.png" className="w-5 h-5 animate-spin" alt="Loading" />
                <span>Simulating Match...</span>
              </>
            ) : (
              <>
                <Zap className='w-5 h-5' />
                <span>Run Simulation</span>
              </>
            )}
          </button>
        </div>

        {/* Results - Before & After */}
        <AnimatePresence>
          {simulation && simulation.simulation && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }} 
              animate={{ opacity: 1, height: 'auto' }} 
              className='space-y-4'
            >
              <div className='p-4 bg-primary/10 border border-primary/20 rounded-xl flex gap-3 items-start'>
                <div className='mt-1 shrink-0 p-1.5 bg-primary/20 rounded-full'>
                  <Target className='w-4 h-4 text-primary' />
                </div>
                <p className='text-sm font-medium text-primary leading-relaxed'>{simulation.simulation.shift_reason}</p>
              </div>

              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                {/* Base Model */}
                <div className='glass-panel p-5 rounded-2xl relative overflow-hidden'>
                  <div className='absolute top-0 right-0 px-3 py-1 bg-white/5 text-[10px] font-bold text-white/50 rounded-bl-xl uppercase tracking-wider'>Base Model</div>
                  
                  <div className='flex justify-between mt-2 mb-4'>
                    <div className='text-center'>
                      <p className='text-xs text-muted uppercase tracking-wider mb-1'>Home xG</p>
                      <p className='text-2xl font-display text-white/70'>{simulation.simulation.base_model.home_xg}</p>
                    </div>
                    <div className='text-center'>
                      <p className='text-xs text-muted uppercase tracking-wider mb-1'>Away xG</p>
                      <p className='text-2xl font-display text-white/70'>{simulation.simulation.base_model.away_xg}</p>
                    </div>
                  </div>

                  <div className='space-y-3 pt-4 border-t border-white/5'>
                    {simulation.simulation.base_model.markets.slice(0, 2).map((market: any, idx: number) => (
                      <div key={idx} className='flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 opacity-70'>
                        <div>
                          <p className='font-bold text-sm text-white'>{market.market}</p>
                          <AIAdvisorBadge status={(market.advisor_status || "GAMBLE") as AdvisorStatus} showLabel={false} className="mt-1" />
                        </div>
                        <div className='text-right'>
                          <p className='text-lg font-bold text-white'>{(market.probability * 100).toFixed(0)}%</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Simulated Model */}
                <div className='glass-panel p-5 rounded-2xl border border-primary/30 relative overflow-hidden shadow-[0_0_30px_rgba(16,231,116,0.1)]'>
                  <div className='absolute top-0 right-0 px-3 py-1 bg-primary text-[10px] font-bold text-primary-foreground rounded-bl-xl uppercase tracking-wider'>Simulated Model</div>
                  
                  <div className='flex justify-between mt-2 mb-4'>
                    <div className='text-center'>
                      <p className='text-xs text-muted uppercase tracking-wider mb-1'>Home xG</p>
                      <p className='text-3xl font-display text-white'>{simulation.simulation.simulated_model.home_xg}</p>
                    </div>
                    <div className='text-center'>
                      <p className='text-xs text-muted uppercase tracking-wider mb-1'>Away xG</p>
                      <p className='text-3xl font-display text-white'>{simulation.simulation.simulated_model.away_xg}</p>
                    </div>
                  </div>

                  <div className='space-y-3 pt-4 border-t border-white/10'>
                    {simulation.simulation.simulated_model.markets.slice(0, 2).map((market: any, idx: number) => (
                      <div key={idx} className='flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/20'>
                        <div>
                          <p className='font-bold text-sm text-white'>{market.market}</p>
                          <AIAdvisorBadge status={(market.advisor_status || "GAMBLE") as AdvisorStatus} showLabel={true} className="mt-1" />
                        </div>
                        <div className='text-right'>
                          <p className='text-xl font-bold text-primary'>{(market.probability * 100).toFixed(0)}%</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </main>

      {/* Match Selector Modal */}
      <MatchSelectorModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        onSelect={(homeTeamId, awayTeamId, homeTeamName, awayTeamName) => {
          setSelectedMatch({ 
            homeTeamId, 
            awayTeamId, 
            homeTeamName, 
            awayTeamName, 
            name: `${homeTeamName} vs ${awayTeamName}` 
          });
          setIsModalOpen(false);
        }}
      />
    </div>
  );
}