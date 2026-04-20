import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Trophy, Clock, AlertCircle, Maximize, Minimize } from "lucide-react";
import { TeamLogo } from '@/components/TeamLogo';
import { MatchEngine } from "./engine/MatchEngine";

interface VirtualPitchProps {
  homeTeamName: string;
  awayTeamName: string;
  homeTeamId: number;
  awayTeamId: number;
  simulationScript: {
    events: Array<{ minute: number; type: string; team: string; xg?: number; message: string }>;
    addedTime: { half1: number; half2: number };
    finalScore: { home: number; away: number };
    stats: {
      home: { shots: number; shotsOnTarget: number; corners: number; fouls: number; yellowCards: number };
      away: { shots: number; shotsOnTarget: number; corners: number; fouls: number; yellowCards: number };
      possession: { home: number; away: number };
    };
  };
  managers?: {
    home: any;
    away: any;
  };
  onComplete: () => void;
}

export function VirtualPitch({ homeTeamName, awayTeamName, homeTeamId, awayTeamId, simulationScript, managers, onComplete }: VirtualPitchProps) {
  const [currentMinute, setCurrentMinute] = useState(0);
  const [currentPhase, setCurrentPhase] = useState<'h1' | 'ht' | 'h2' | 'ft' | 'stats'>('h1');
  const [score, setScore] = useState({ home: 0, away: 0 });
  const [activeEvent, setActiveEvent] = useState<{ message: string; type: string } | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<MatchEngine | null>(null);

  const { stats } = simulationScript;

  // Initialize Canvas Engine
  useEffect(() => {
    if (!canvasRef.current) return;

    // Fix scaling for high DPI displays
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    // Set actual size in memory (scaled to account for extra pixel density)
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    // Normalize coordinate system to use css pixels
    const ctx = canvas.getContext('2d');
    ctx?.scale(dpr, dpr);
    // Overwrite canvas width/height properties inside engine so it uses logical pixels
    const logicalWidth = rect.width;
    const logicalHeight = rect.height;

    engineRef.current = new MatchEngine(canvas, simulationScript, {
      onMinute: (min: number) => setCurrentMinute(min),
      onEvent: (e: any) => {
        if (e) {
          const isHome = e.team === 'home';
          const teamName = isHome ? homeTeamName : awayTeamName;
          if (e.type === 'goal') {
            setScore(s => ({ ...s, [e.team]: s[e.team as keyof typeof s] + 1 }));
          }
          setActiveEvent({ 
            message: `${e.message} - ${teamName.substring(0,3).toUpperCase()}`, 
            type: e.type 
          });
        } else {
          setActiveEvent(null);
        }
      },
      onPhaseChange: (phase: string) => {
        setCurrentPhase(phase as any);
      },
      onComplete: () => {
        // Handled via state transition to 'stats'
      }
    });

    // Override engine's width/height to logical pixels so rendering scales properly
    engineRef.current.width = logicalWidth;
    engineRef.current.height = logicalHeight;

    engineRef.current.start();

    return () => {
      engineRef.current?.stop();
    };
  }, [simulationScript, homeTeamName, awayTeamName]);

  // Handle window resize dynamically
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current && engineRef.current) {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        const ctx = canvas.getContext('2d');
        ctx?.scale(dpr, dpr);
        engineRef.current.width = rect.width;
        engineRef.current.height = rect.height;
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className={cn(
      "w-full relative bg-[#1a2e1d] flex flex-col transition-all duration-500",
      isExpanded 
        ? "fixed inset-0 z-50 rounded-none h-screen" 
        : "rounded-3xl overflow-hidden border border-white/10 aspect-[16/9] lg:aspect-[21/9] shadow-2xl"
    )}>
      {/* Top Scoreboard */}
      <div className="absolute top-0 left-0 right-0 z-20 flex justify-between items-start p-4 bg-gradient-to-b from-black/90 via-black/50 to-transparent pointer-events-none">
        
        {/* Home Team */}
        <div className="flex-1 flex flex-col gap-1 items-start max-w-[40%]">
          <div className="flex items-center gap-2 w-full bg-black/40 backdrop-blur-sm border border-white/10 rounded-xl px-3 py-1.5 shadow-lg">
            <TeamLogo teamId={homeTeamId} name={homeTeamName} className="w-6 h-6 md:w-8 md:h-8" />
            <span className="text-white font-black truncate text-xs md:text-sm tracking-wide w-full">{homeTeamName.substring(0, 3).toUpperCase()}</span>
            <span className="text-2xl md:text-3xl font-black text-primary tabular-nums shrink-0">{score.home}</span>
          </div>
          {managers?.home?.name && (
            <div className="text-[8px] md:text-[10px] text-white/70 font-medium truncate w-full px-2 uppercase tracking-widest">
              <span className="text-primary">{managers.home.preferred_formation || '4-3-3'}</span> • {managers.home.team_style?.toUpperCase() || 'BALANCED'}
            </div>
          )}
        </div>

        {/* Timer */}
        <div className="flex flex-col items-center shrink-0 mx-2 md:mx-4 mt-0.5">
          <div className="bg-black/80 backdrop-blur-md px-4 py-1.5 rounded-2xl border border-white/20 flex items-center gap-1.5 shadow-[0_0_20px_rgba(0,0,0,0.5)]">
            <Clock className={cn("w-3 h-3 md:w-4 md:h-4", currentPhase === 'ft' || currentPhase === 'stats' ? "text-white/50" : "text-primary animate-pulse")} />
            <span className="text-lg md:text-xl font-black text-white tabular-nums min-w-[40px] text-center font-display">
              {currentPhase === 'stats' ? 'FT' : `${currentMinute}'`}
            </span>
          </div>
          <span className="text-[8px] md:text-[9px] text-primary/90 font-black uppercase tracking-widest mt-1.5 bg-black/40 px-2 py-0.5 rounded border border-primary/20">
            {currentPhase === 'ht' ? 'HALF TIME' : currentPhase === 'ft' || currentPhase === 'stats' ? 'FULL TIME' : 'LIVE SIMULATION'}
          </span>
        </div>

        {/* Away Team */}
        <div className="flex-1 flex flex-col gap-1 items-end max-w-[40%]">
          <div className="flex items-center gap-2 w-full justify-end bg-black/40 backdrop-blur-sm border border-white/10 rounded-xl px-3 py-1.5 shadow-lg">
            <span className="text-2xl md:text-3xl font-black text-blue-400 tabular-nums shrink-0">{score.away}</span>
            <span className="text-white font-black truncate text-right text-xs md:text-sm tracking-wide w-full">{awayTeamName.substring(0, 3).toUpperCase()}</span>
            <TeamLogo teamId={awayTeamId} name={awayTeamName} className="w-6 h-6 md:w-8 md:h-8" />
          </div>
          {managers?.away?.name && (
            <div className="text-[8px] md:text-[10px] text-white/70 font-medium truncate text-right w-full px-2 uppercase tracking-widest">
              {managers.away.team_style?.toUpperCase() || 'BALANCED'} • <span className="text-blue-400">{managers.away.preferred_formation || '4-3-3'}</span>
            </div>
          )}
        </div>
      </div>

      {/* The 2D Pitch */}
      {currentPhase !== 'stats' && (
        <div className="flex-1 relative w-full h-full bg-[#1a2e1d] overflow-hidden">
          {/* Pitch markings */}
          <div className="absolute inset-4 border-2 border-white/20" />
          <div className="absolute top-4 bottom-4 left-1/2 w-0.5 bg-white/20 -translate-x-1/2" />
          <div className="absolute top-1/2 left-1/2 w-24 h-24 border-2 border-white/20 rounded-full -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute top-1/2 left-4 w-16 h-32 border-2 border-l-0 border-white/20 -translate-y-1/2" />
          <div className="absolute top-1/2 right-4 w-16 h-32 border-2 border-r-0 border-white/20 -translate-y-1/2" />

          {/* Home Players */}
          {HOME_FORMATION.map((p, i) => (
            <motion.div
              key={p.id}
              className={cn(
                "absolute w-2.5 h-2.5 md:w-3.5 md:h-3.5 rounded-full z-10 border border-black shadow-lg",
                activePlayer?.team === 'home' && activePlayer.index === i ? "bg-primary scale-125" : "bg-white"
              )}
              animate={{ 
                left: `${playerPositions.home[i].x}%`, 
                top: `${playerPositions.home[i].y}%` 
              }}
              transition={{ type: "spring", stiffness: 40, damping: 10 }}
              style={{ x: '-50%', y: '-50%' }}
            />
          ))}

          {/* Away Players */}
          {AWAY_FORMATION.map((p, i) => (
            <motion.div
              key={p.id}
              className={cn(
                "absolute w-2.5 h-2.5 md:w-3.5 md:h-3.5 rounded-full z-10 border border-black shadow-lg",
                activePlayer?.team === 'away' && activePlayer.index === i ? "bg-blue-400 scale-125" : "bg-blue-600"
              )}
              animate={{ 
                left: `${playerPositions.away[i].x}%`, 
                top: `${playerPositions.away[i].y}%` 
              }}
              transition={{ type: "spring", stiffness: 40, damping: 10 }}
              style={{ x: '-50%', y: '-50%' }}
            />
          ))}

          {/* The Ball */}
          <motion.div
            className="absolute w-3 h-3 md:w-4 md:h-4 bg-yellow-300 rounded-full shadow-[0_0_15px_rgba(253,224,71,0.8)] z-20 border border-yellow-600"
            animate={getBallPosition()}
            transition={{ type: "spring", stiffness: 60, damping: 12 }}
            style={{ x: '-50%', y: '-50%' }}
          />

          {/* Event Overlay (e.g. GOAL!, SAVED) - Now a sleek caption bar at bottom */}
          <div className="absolute bottom-4 md:bottom-8 left-0 right-0 flex justify-center z-30 pointer-events-none px-4">
            <AnimatePresence>
              {activeEvent && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className={cn(
                    "backdrop-blur-md px-4 py-1.5 rounded-full border shadow-lg max-w-full truncate",
                    activeEvent.type === 'goal' ? 'bg-yellow-500/90 border-yellow-300' :
                    activeEvent.type === 'corner' || activeEvent.type === 'free_kick' ? 'bg-blue-500/90 border-blue-300' :
                    activeEvent.type === 'foul' || activeEvent.type === 'yellow_card' ? 'bg-orange-500/90 border-orange-300' :
                    'bg-black/80 border-white/20'
                  )}
                >
                  <span className={cn(
                    "text-xs md:text-sm font-black uppercase tracking-wider",
                    activeEvent.type === 'goal' || activeEvent.type === 'foul' || activeEvent.type === 'yellow_card' ? 'text-black' : 'text-white'
                  )}>
                    {activeEvent.message}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Post-Match Stats Screen */}
      {currentPhase === 'stats' && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex-1 w-full h-full bg-black/80 flex flex-col items-center justify-center p-4 md:p-8"
        >
          <h2 className="text-2xl md:text-3xl font-black text-white mb-6 md:mb-8 font-display tracking-widest text-center">FULL TIME STATS</h2>
          
          <div className="w-full max-w-lg space-y-4 md:space-y-6">
            {/* Possession */}
            <div className="flex items-center justify-between">
              <span className="text-xl md:text-2xl font-black text-white w-12">{stats.possession.home}%</span>
              <span className="text-xs md:text-sm font-bold text-white/50 tracking-widest uppercase">Possession</span>
              <span className="text-xl md:text-2xl font-black text-white w-12 text-right">{stats.possession.away}%</span>
            </div>
            {/* Shots */}
            <div className="flex items-center justify-between">
              <span className="text-xl md:text-2xl font-black text-white w-12">{stats.home.shots}</span>
              <span className="text-xs md:text-sm font-bold text-white/50 tracking-widest uppercase">Shots</span>
              <span className="text-xl md:text-2xl font-black text-white w-12 text-right">{stats.away.shots}</span>
            </div>
            {/* Shots on Target */}
            <div className="flex items-center justify-between">
              <span className="text-xl md:text-2xl font-black text-white w-12">{stats.home.shotsOnTarget}</span>
              <span className="text-xs md:text-sm font-bold text-white/50 tracking-widest uppercase">On Target</span>
              <span className="text-xl md:text-2xl font-black text-white w-12 text-right">{stats.away.shotsOnTarget}</span>
            </div>
            {/* Corners */}
            <div className="flex items-center justify-between">
              <span className="text-xl md:text-2xl font-black text-white w-12">{stats.home.corners}</span>
              <span className="text-xs md:text-sm font-bold text-white/50 tracking-widest uppercase">Corners</span>
              <span className="text-xl md:text-2xl font-black text-white w-12 text-right">{stats.away.corners}</span>
            </div>
            {/* Fouls */}
            <div className="flex items-center justify-between">
              <span className="text-xl md:text-2xl font-black text-white w-12">{stats.home.fouls}</span>
              <span className="text-xs md:text-sm font-bold text-white/50 tracking-widest uppercase">Fouls</span>
              <span className="text-xl md:text-2xl font-black text-white w-12 text-right">{stats.away.fouls}</span>
            </div>
          </div>

          <button 
            onClick={onComplete}
            className="mt-8 md:mt-12 bg-primary text-black font-black uppercase tracking-widest px-8 py-3 rounded-xl hover:bg-primary/90 transition-colors shadow-[0_0_20px_rgba(16,231,116,0.3)]"
          >
            Reveal Prediction
          </button>
        </motion.div>
      )}

      {/* Expand/Collapse Button */}
      {currentPhase !== 'ft' && currentPhase !== 'stats' && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="absolute bottom-4 right-4 md:bottom-8 md:right-8 z-40 bg-black/40 hover:bg-black/60 backdrop-blur-md p-2 rounded-xl text-white transition-all border border-white/10"
          title={isExpanded ? "Collapse View" : "Expand View"}
        >
          {isExpanded ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
        </button>
      )}

      {/* Skip Button */}
      {currentPhase !== 'ft' && currentPhase !== 'stats' && (
        <button
          onClick={() => {
            setCurrentPhase('stats');
            setScore(simulationScript.finalScore);
          }}
          className="absolute bottom-4 left-4 md:bottom-8 md:left-8 z-20 bg-white/10 hover:bg-white/20 backdrop-blur-md px-4 py-2 rounded-xl text-xs font-bold text-white transition-all border border-white/10"
        >
          Skip to End ⏭️
        </button>
      )}
    </div>
  );
}