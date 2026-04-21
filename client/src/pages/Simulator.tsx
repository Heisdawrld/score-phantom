import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Header } from '@/components/layout/Header';
import { fetchApi } from '@/lib/api';
import { useAccess } from "@/hooks/use-access";
import { ChevronLeft, Zap, Target, TrendingUp, AlertTriangle, Shield, SlidersHorizontal, CloudRain, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { ModelAdvisorBadge, AdvisorStatus } from '@/components/ui/ModelAdvisorBadge';
import { useLocation } from 'wouter';
import { MatchSelectorModal } from '@/components/simulator/MatchSelectorModal';
import { VirtualPitch } from '@/components/simulator/VirtualPitch';
import { TeamLogo } from '@/components/TeamLogo';
import { useToast } from '@/hooks/use-toast';

export default function PhantomLab() {
  const [, setLocation] = useLocation();
  const { user, isSubscribed, isLoading: authLoading } = useAccess();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<{
    homeTeamId: string;
    awayTeamId: string;
    name: string;
    homeTeamName: string;
    awayTeamName: string;
  } | null>(null);
  
  const [modifiers, setModifiers] = useState({
    weather: 'normal',
    lineupStrength: 'full'
  });

  const [simulationState, setSimulationState] = useState<'idle' | 'running' | 'completed'>('idle');

  const { toast } = useToast();

  const { data: simulation, isPending, mutate, reset } = useMutation({
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
    },
    onSuccess: () => {
      setSimulationState('running');
    },
    onError: (error: any) => {
      toast({
        title: "Simulation Failed",
        description: error.message || "Failed to run simulation. Please try again.",
        variant: "destructive"
      });
      setSimulationState('idle');
    }
  });

  if (!isSubscribed) {
    return (
      <div className='min-h-screen bg-background pb-20'>
        <Header />
        <main className='max-w-lg mx-auto px-4 pt-6'>
          <div className='glass-panel p-8 rounded-3xl text-center space-y-6 border border-primary/20 shadow-[0_0_50px_rgba(16,231,116,0.15)] relative overflow-hidden'>
            <div className='absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(16,231,116,0.2),transparent_50%)] opacity-60' />
            <Shield className='w-16 h-16 text-primary mx-auto relative z-10 drop-shadow-[0_0_15px_rgba(16,231,116,0.5)]' />
            <h2 className='text-3xl font-display tracking-widest text-white relative z-10'>PHANTOM <span className='text-primary drop-shadow-[0_0_10px_rgba(16,231,116,0.5)]'>LAB</span></h2>
            <p className='text-muted relative z-10 font-light'>The Interactive Match Sandbox is exclusively available to Premium members.</p>
            <button onClick={() => setLocation('/premium')} className='w-full py-4 bg-primary text-primary-foreground font-bold tracking-widest uppercase rounded-2xl relative z-10 shadow-[0_0_20px_rgba(16,231,116,0.4)] hover:shadow-[0_0_30px_rgba(16,231,116,0.6)] transition-shadow'>Upgrade to Access Lab</button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-background pb-24 relative overflow-hidden'>
      {/* Premium Background Effects */}
      <div className='fixed inset-0 pointer-events-none'>
        <div className='absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-lg h-96 bg-[radial-gradient(ellipse_at_top,rgba(16,231,116,0.08),transparent_70%)]' />
      </div>

      <Header />

      <main className='max-w-7xl mx-auto px-4 pt-6 space-y-6 relative z-10'>
        {/* Header */}
        <div className='flex items-center gap-4 mb-8'>
          <button onClick={() => setLocation('/')} className='w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-all'>
            <ChevronLeft className='w-6 h-6' />
          </button>
          <div>
            <h1 className='font-display text-3xl tracking-widest text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]'>PHANTOM <span className='text-primary drop-shadow-[0_0_10px_rgba(16,231,116,0.4)]'>LAB</span></h1>
            <p className='text-sm text-primary/70 font-medium tracking-wide uppercase mt-0.5'>Interactive Match Sandbox</p>
          </div>
        </div>

        <div className='lg:grid lg:grid-cols-12 lg:gap-8'>
          {/* Controls - Left Side on PC */}
          <div className='lg:col-span-4 space-y-6'>
            <div className='glass-panel p-6 rounded-[2rem] border border-white/10 shadow-2xl relative overflow-hidden backdrop-blur-xl space-y-8'>
              <div className='absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none' />
          
          {/* Match Selector */}
          <div className='relative z-10'>
            <label className='text-[10px] font-bold text-white/40 uppercase tracking-widest mb-3 block pl-1'>Matchup</label>
            <button 
              onClick={() => setIsModalOpen(true)}
              className='w-full p-5 bg-black/40 hover:bg-black/60 border border-white/10 rounded-2xl transition-all flex items-center justify-between group'
            >
              {selectedMatch ? (
                <div className='flex items-center gap-4 w-full'>
                  <div className='flex-1 flex flex-col items-center justify-center gap-2'>
                    <TeamLogo teamId={selectedMatch.homeTeamId} className='w-12 h-12 drop-shadow-xl' />
                    <span className='font-display tracking-wide text-sm text-white truncate w-full text-center'>{selectedMatch.homeTeamName}</span>
                  </div>
                  <div className='flex flex-col items-center justify-center gap-1 shrink-0'>
                    <div className='text-[10px] font-black text-primary bg-primary/10 px-3 py-1 rounded-full tracking-widest border border-primary/20'>VS</div>
                  </div>
                  <div className='flex-1 flex flex-col items-center justify-center gap-2'>
                    <TeamLogo teamId={selectedMatch.awayTeamId} className='w-12 h-12 drop-shadow-xl' />
                    <span className='font-display tracking-wide text-sm text-white truncate w-full text-center'>{selectedMatch.awayTeamName}</span>
                  </div>
                </div>
              ) : (
                <div className='flex items-center justify-center gap-3 w-full py-4 text-primary/80 group-hover:text-primary transition-colors'>
                  <Search className='w-6 h-6' />
                  <span className='font-display tracking-widest text-lg uppercase'>Select Matchup</span>
                </div>
              )}
            </button>
          </div>

          <div className={cn('space-y-8 transition-all duration-500 relative z-10', !selectedMatch && 'opacity-20 grayscale pointer-events-none')}>
            {/* Auto-Derived Context Banner */}
            <div className='bg-primary/5 border border-primary/20 rounded-2xl p-4 flex gap-3 items-start relative overflow-hidden'>
              <div className='absolute -right-4 -top-4 w-16 h-16 bg-primary/20 blur-2xl rounded-full' />
              <Zap className='w-5 h-5 text-primary shrink-0 mt-0.5 relative z-10' />
              <div className='relative z-10'>
                <p className='text-sm font-bold text-white mb-1'>Live Data Integration Active</p>
                <p className='text-xs text-white/60 leading-relaxed'>
                  The simulator automatically pulls the predicted starting XIs, key player absences, tactical setups, and team momentum directly from the API. Adjust the environment and rotation risk below to see how external chaos affects the match script.
                </p>
              </div>
            </div>

            {/* Environment Toggles */}
            <div className='space-y-5'>
              <label className='text-[10px] font-bold text-white/40 uppercase tracking-widest block pl-1 flex items-center gap-2'>
                <CloudRain className='w-3 h-3' /> Environment
              </label>
              
              <div className='grid grid-cols-3 gap-2'>
                {['normal', 'rain', 'snow'].map(w => (
                  <button 
                    key={w}
                    onClick={() => setModifiers({...modifiers, weather: w})}
                    className={cn(
                      'py-3 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all duration-300',
                      modifiers.weather === w 
                        ? 'bg-primary/20 border-primary text-primary shadow-[0_0_15px_rgba(16,231,116,0.2)]' 
                        : 'bg-black/20 border-white/5 text-white/40 hover:bg-white/5 hover:text-white/70'
                    )}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>

            {/* Lineup Strength */}
            <div className='space-y-5'>
              <label className='text-[10px] font-bold text-white/40 uppercase tracking-widest block pl-1 flex items-center gap-2'>
                <SlidersHorizontal className='w-3 h-3' /> Rotation Risk
              </label>
              
              <div className='grid grid-cols-3 gap-2'>
                {[
                  { id: 'full', label: 'Full Strength' },
                  { id: 'rotated', label: 'Rotated' },
                  { id: 'heavily_rotated', label: 'Heavy Rot' }
                ].map(l => (
                  <button 
                    key={l.id}
                    onClick={() => setModifiers({...modifiers, lineupStrength: l.id})}
                    className={cn(
                      'py-3 rounded-xl text-[10px] font-bold uppercase tracking-wider border transition-all duration-300',
                      modifiers.lineupStrength === l.id 
                        ? 'bg-primary/20 border-primary text-primary shadow-[0_0_15px_rgba(16,231,116,0.2)]' 
                        : 'bg-black/20 border-white/5 text-white/40 hover:bg-white/5 hover:text-white/70'
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
            className='w-full py-5 bg-primary text-primary-foreground font-display text-lg tracking-widest uppercase rounded-2xl shadow-[0_0_20px_rgba(16,231,116,0.3)] hover:shadow-[0_0_40px_rgba(16,231,116,0.5)] transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden relative z-10 group'
          >
            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
            {isPending ? (
              <>
                <img src="/images/logo.png" className="w-6 h-6 animate-spin invert brightness-0" alt="Loading" />
                <span className='relative z-10'>Processing...</span>
              </>
            ) : (
              <>
                <Zap className='w-6 h-6 relative z-10' />
                <span className='relative z-10'>Run Engine</span>
              </>
            )}
          </button>
            </div>
          </div>

          {/* Results - Right Side on PC */}
          <div className='lg:col-span-8 mt-8 lg:mt-0'>
            <AnimatePresence mode="wait">
              {simulationState === 'idle' && (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full min-h-[400px] rounded-3xl border border-white/5 bg-white/[0.02] flex flex-col items-center justify-center text-center p-8 hidden lg:flex"
                >
                  <Target className="w-16 h-16 text-white/10 mb-4" />
                  <h3 className="text-xl font-display text-white/40 tracking-widest">AWAITING SIMULATION</h3>
                  <p className="text-white/20 mt-2 max-w-sm">Select a matchup and run the engine to visualize the 90-minute tactical simulation.</p>
                </motion.div>
              )}

              {simulationState === 'running' && simulation?.simulation && (
                <motion.div
                  key="pitch"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="h-full flex items-center"
                >
                  <VirtualPitch
                    homeTeamName={selectedMatch!.homeTeamName}
                    awayTeamName={selectedMatch!.awayTeamName}
                    homeTeamId={selectedMatch!.homeTeamId}
                    awayTeamId={selectedMatch!.awayTeamId}
                    simulationScript={simulation.simulation.simulation_script}
                    managers={simulation.simulation.managers}
                    onComplete={() => setSimulationState('completed')}
                  />
                </motion.div>
              )}

              {simulationState === 'completed' && simulation?.simulation && (
                <motion.div
                  key="results"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ type: "spring", stiffness: 200, damping: 20 }}
                  className='space-y-6 pt-4 lg:pt-0'
                >
              {/* Shift Reason Callout */}
              <div className='p-5 bg-gradient-to-r from-primary/20 to-primary/5 border border-primary/30 rounded-2xl flex gap-4 items-center shadow-[0_0_30px_rgba(16,231,116,0.1)] relative overflow-hidden'>
                <div className='absolute left-0 top-0 bottom-0 w-1 bg-primary' />
                <div className='shrink-0 p-3 bg-primary/20 rounded-full shadow-[0_0_15px_rgba(16,231,116,0.3)]'>
                  <TrendingUp className='w-6 h-6 text-primary' />
                </div>
                <p className='text-sm font-medium text-white/90 leading-relaxed'>{simulation.simulation.shift_reason}</p>
              </div>

              <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                {/* Base Model Card */}
                <div className='glass-panel rounded-3xl relative overflow-hidden border border-white/5 opacity-90'>
                  <div className='bg-white/5 px-6 py-3 border-b border-white/5 flex justify-between items-center'>
                    <span className='text-xs font-bold text-white/50 uppercase tracking-widest'>Original Model</span>
                    <Shield className='w-4 h-4 text-white/30' />
                  </div>
                  
                  <div className='p-6'>
                    <div className='flex justify-between items-end mb-6'>
                      <div className='text-center'>
                        <p className='text-[10px] text-white/40 uppercase tracking-widest mb-1 font-bold'>Home xG</p>
                        <p className='text-3xl font-display text-white/70'>{simulation.simulation.base_model.home_xg}</p>
                      </div>
                      <div className='text-center'>
                        <p className='text-[10px] text-white/40 uppercase tracking-widest mb-1 font-bold'>Away xG</p>
                        <p className='text-3xl font-display text-white/70'>{simulation.simulation.base_model.away_xg}</p>
                      </div>
                    </div>

                    <div className='space-y-3'>
                      {simulation.simulation.base_model.markets.slice(0, 2).map((market: any, idx: number) => (
                        <div key={idx} className='flex items-center justify-between p-4 rounded-2xl bg-black/40 border border-white/5'>
                          <div>
                            <p className='font-display tracking-wide text-sm text-white/80'>{market.market}</p>
                            <ModelAdvisorBadge status={(market.advisor_status || "GAMBLE") as AdvisorStatus} showLabel={false} className="mt-1.5 opacity-60" />
                          </div>
                          <div className='text-right'>
                            <p className='text-xl font-display text-white/70'>{(market.probability * 100).toFixed(0)}%</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Simulated Model Card */}
                <div className='glass-panel rounded-3xl relative overflow-hidden border-2 border-primary shadow-[0_0_40px_rgba(16,231,116,0.15)]'>
                  <div className='absolute inset-0 bg-gradient-to-b from-primary/10 to-transparent pointer-events-none' />
                  
                  <div className='bg-primary/20 px-6 py-3 border-b border-primary/30 flex justify-between items-center relative z-10'>
                    <span className='text-xs font-bold text-primary uppercase tracking-widest'>Simulated Result</span>
                    <Zap className='w-4 h-4 text-primary animate-pulse' />
                  </div>
                  
                  <div className='p-6 relative z-10'>
                    <div className='flex justify-between items-end mb-6'>
                      <div className='text-center'>
                        <p className='text-[10px] text-primary/70 uppercase tracking-widest mb-1 font-bold'>Home xG</p>
                        <p className='text-4xl font-display text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]'>{simulation.simulation.simulated_model.home_xg}</p>
                      </div>
                      <div className='text-center'>
                        <p className='text-[10px] text-primary/70 uppercase tracking-widest mb-1 font-bold'>Away xG</p>
                        <p className='text-4xl font-display text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]'>{simulation.simulation.simulated_model.away_xg}</p>
                      </div>
                    </div>

                    <div className='space-y-3'>
                      {simulation.simulation.simulated_model.markets.slice(0, 2).map((market: any, idx: number) => (
                        <div key={idx} className='flex items-center justify-between p-4 rounded-2xl bg-primary/10 border border-primary/20 backdrop-blur-sm'>
                          <div>
                            <p className='font-display tracking-wide text-sm text-white'>{market.market}</p>
                            <ModelAdvisorBadge status={(market.advisor_status || "GAMBLE") as AdvisorStatus} showLabel={true} className="mt-1.5" />
                          </div>
                          <div className='text-right'>
                            <p className='text-2xl font-display text-primary drop-shadow-[0_0_10px_rgba(16,231,116,0.3)]'>{(market.probability * 100).toFixed(0)}%</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
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
          // Clear simulation on new match selection
          reset();
          setSimulationState('idle');
        }}
      />
    </div>
  );
}