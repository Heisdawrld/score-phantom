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

// 4-3-3 Standard Formation Coordinates (Left-to-Right attacking)
const HOME_FORMATION = [
  { id: 'h1', role: 'gk', x: 5, y: 50 },
  { id: 'h2', role: 'lb', x: 20, y: 15 },
  { id: 'h3', role: 'cb', x: 15, y: 35 },
  { id: 'h4', role: 'cb', x: 15, y: 65 },
  { id: 'h5', role: 'rb', x: 20, y: 85 },
  { id: 'h6', role: 'cm', x: 35, y: 30 },
  { id: 'h7', role: 'cdm', x: 30, y: 50 },
  { id: 'h8', role: 'cm', x: 35, y: 70 },
  { id: 'h9', role: 'lw', x: 60, y: 20 },
  { id: 'h10', role: 'st', x: 65, y: 50 },
  { id: 'h11', role: 'rw', x: 60, y: 80 },
];
// Mirror coordinates for Away team (Right-to-Left attacking)
const AWAY_FORMATION = HOME_FORMATION.map(p => ({ ...p, id: p.id.replace('h', 'a'), x: 100 - p.x }));

export function VirtualPitch({ homeTeamName, awayTeamName, homeTeamId, awayTeamId, simulationScript, managers, onComplete }: VirtualPitchProps) {
  const [currentMinute, setCurrentMinute] = useState(0);
  const [currentPhase, setCurrentPhase] = useState<'h1' | 'ht' | 'h2' | 'ft' | 'stats'>('h1');
  const [score, setScore] = useState({ home: 0, away: 0 });
  const [activeEvent, setActiveEvent] = useState<{ message: string; type: string } | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<MatchEngine | null>(null);

  const { stats } = simulationScript;

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    const ctx = canvas.getContext('2d');
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    const logicalWidth = rect.width;
    const logicalHeight = rect.height;

    engineRef.current = new MatchEngine(
      canvas, 
      simulationScript, 
      {
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
      },
      HOME_FORMATION,
      AWAY_FORMATION
    );

    engineRef.current.width = logicalWidth;
    engineRef.current.height = logicalHeight;

    engineRef.current.start();

    return () => {
      engineRef.current?.stop();
    };
  }, [simulationScript, homeTeamName, awayTeamName]);

  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current && engineRef.current) {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        const ctx = canvas.getContext('2d');
        ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
        engineRef.current.width = rect.width;
        engineRef.current.height = rect.height;
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (currentPhase !== 'ft') return;
    const t = setTimeout(() => {
      setScore(simulationScript.finalScore);
      setCurrentPhase('stats');
    }, 3500);
    return () => clearTimeout(t);
  }, [currentPhase, simulationScript.finalScore]);

  return (
    <div className={cn(
      "w-full relative bg-[#1a2e1d] flex flex-col transition-all duration-500",
      isExpanded 
        ? "fixed inset-0 z-50 rounded-none h-screen" 
        : "rounded-3xl overflow-hidden border border-white/10 aspect-[16/9] lg:aspect-[21/9] shadow-2xl"
    )}>
      {/* Top Scoreboard */}
      <div className="absolute top-0 left-0 right-0 z-20 flex justify-between items-start p-2 md:p-4 bg-gradient-to-b from-black/90 via-black/40 to-transparent pointer-events-none">
        
        {/* Home Team */}
        <div className="flex-1 flex flex-col gap-1 items-start max-w-[40%]">
          <div className="flex items-center gap-1.5 w-full bg-black/35 backdrop-blur-sm border border-white/10 rounded-lg px-2 py-1 shadow-md">
            <TeamLogo teamId={homeTeamId} name={homeTeamName} className="w-5 h-5 md:w-7 md:h-7" />
            <span className="text-white font-black truncate text-[10px] md:text-sm tracking-wide w-full">{homeTeamName.substring(0, 3).toUpperCase()}</span>
            <span className="text-sm md:text-2xl font-black text-primary tabular-nums shrink-0 leading-none">{score.home}</span>
          </div>
          {managers?.home?.name && (
            <div className="hidden md:block text-[10px] text-white/70 font-medium truncate w-full px-2 uppercase tracking-widest">
              <span className="text-primary">{managers.home.preferred_formation || '4-3-3'}</span> • {managers.home.team_style?.toUpperCase() || 'BALANCED'}
            </div>
          )}
        </div>

        {/* Timer */}
        <div className="flex flex-col items-center shrink-0 mx-2 md:mx-4 mt-0.5">
          <div className="bg-black/75 backdrop-blur-md px-2.5 py-1 rounded-xl border border-white/15 flex items-center gap-1 shadow-[0_0_16px_rgba(0,0,0,0.45)]">
            <Clock className={cn("w-3 h-3", currentPhase === 'ft' || currentPhase === 'stats' ? "text-white/50" : "text-primary animate-pulse")} />
            <span className="text-sm md:text-lg font-black text-white tabular-nums min-w-[28px] text-center font-display leading-none">
              {currentPhase === 'stats' ? 'FT' : `${currentMinute}'`}
            </span>
          </div>
          <span className="text-[8px] text-primary/90 font-black uppercase tracking-widest mt-1 bg-black/35 px-2 py-0.5 rounded border border-primary/20">
            {currentPhase === 'ht' ? 'HALF TIME' : currentPhase === 'ft' || currentPhase === 'stats' ? 'FULL TIME' : 'LIVE SIMULATION'}
          </span>
        </div>

        {/* Away Team */}
        <div className="flex-1 flex flex-col gap-1 items-end max-w-[40%]">
          <div className="flex items-center gap-1.5 w-full justify-end bg-black/35 backdrop-blur-sm border border-white/10 rounded-lg px-2 py-1 shadow-md">
            <span className="text-sm md:text-2xl font-black text-blue-400 tabular-nums shrink-0 leading-none">{score.away}</span>
            <span className="text-white font-black truncate text-right text-[10px] md:text-sm tracking-wide w-full">{awayTeamName.substring(0, 3).toUpperCase()}</span>
            <TeamLogo teamId={awayTeamId} name={awayTeamName} className="w-5 h-5 md:w-7 md:h-7" />
          </div>
          {managers?.away?.name && (
            <div className="hidden md:block text-[10px] text-white/70 font-medium truncate text-right w-full px-2 uppercase tracking-widest">
              {managers.away.team_style?.toUpperCase() || 'BALANCED'} • <span className="text-blue-400">{managers.away.preferred_formation || '4-3-3'}</span>
            </div>
          )}
        </div>
      </div>

      {currentPhase !== 'stats' && (
        <div className="flex-1 relative w-full h-full bg-[#1a2e1d] overflow-hidden">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full block"
          />

          {/* Event Overlay (e.g. GOAL!, SAVED) - Sleek caption bar at bottom */}
          <div className="absolute bottom-10 left-0 right-0 flex justify-center z-30 pointer-events-none px-4">
            <AnimatePresence>
              {activeEvent && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className={cn(
                    "backdrop-blur-md px-3 py-1 md:px-4 md:py-1.5 rounded-full border shadow-lg max-w-[85%] md:max-w-full truncate",
                    activeEvent.type === 'goal' ? 'bg-yellow-500/90 border-yellow-300' :
                    activeEvent.type === 'corner' || activeEvent.type === 'free_kick' ? 'bg-blue-500/90 border-blue-300' :
                    activeEvent.type === 'foul' || activeEvent.type === 'yellow_card' ? 'bg-orange-500/90 border-orange-300' :
                    'bg-black/80 border-white/20'
                  )}
                >
                  <span className={cn(
                    "text-[9px] md:text-xs font-black uppercase tracking-widest",
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
          className="absolute bottom-10 right-2 md:bottom-8 md:right-8 z-40 bg-black/40 hover:bg-black/60 backdrop-blur-md p-1.5 rounded-lg text-white transition-all border border-white/10"
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
          className="absolute bottom-10 left-2 md:bottom-8 md:left-8 z-20 bg-white/10 hover:bg-white/20 backdrop-blur-md px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-white transition-all border border-white/10"
        >
          Skip to End ⏭️
        </button>
      )}
    </div>
  );
}
