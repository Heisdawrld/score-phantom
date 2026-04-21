import { Player, Ball, Vec2 } from './Physics';

export class MatchEngine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  
  script: any;
  callbacks: {
    onMinute: (min: number) => void;
    onEvent: (e: any | null) => void;
    onPhaseChange: (phase: string) => void;
    onComplete: () => void;
  };

  isRunning: boolean = false;
  lastTime: number = 0;
  
  // Simulation State
  gameMinute: number = 0;
  realTimeElapsed: number = 0; // ms
  REAL_MS_PER_GAME_MINUTE = 2660; // 45 mins = 120 seconds real time -> 2.66s per minute
  currentPhase: 'h1' | 'ht' | 'h2' | 'ft' | 'stats' = 'h1';
  
  ball: Ball;
  players: Player[] = [];
  
  tacticalPhase: 'buildup' | 'midfield' | 'attack' = 'midfield';
  activeTeam: 'home' | 'away' = 'home';
  activeEvent: any = null;
  eventTimer: number = 0;
  
  constructor(canvas: HTMLCanvasElement, script: any, callbacks: any, homeFormation: any[], awayFormation: any[]) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.script = script;
    this.callbacks = callbacks;
    
    this.width = canvas.width;
    this.height = canvas.height;
    
    this.ball = new Ball(50, 50);
    this.initPlayers(homeFormation, awayFormation);
  }

  initPlayers(homeFormation: any[], awayFormation: any[]) {
    // Load exact formations from VirtualPitch.tsx
    homeFormation.forEach((c) => {
      this.players.push(new Player(c.id, 'home', c.role as any, c.x, c.y));
    });
    
    awayFormation.forEach((c) => {
      this.players.push(new Player(c.id, 'away', c.role as any, c.x, c.y));
    });

    // Start with home ball — safe fallback chain so this never crashes
    const hMid = 
      this.players.find(p => p.team === 'home' && (p.role === 'cm' || p.role === 'cdm')) ||
      this.players.find(p => p.team === 'home' && p.role !== 'gk') ||
      this.players.find(p => p.team === 'home');
    if (hMid) {
      hMid.hasBall = true;
      this.ball.owner = hMid;
      this.ball.state = 'controlled';
    }
    this.activeTeam = 'home';
  }

  start() {
    this.isRunning = true;
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  stop() {
    this.isRunning = false;
  }

  loop(timestamp: number) {
    if (!this.isRunning) return;
    
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.1); // max 100ms dt to prevent physics exploding on lag
    this.lastTime = timestamp;
    
    this.update(dt);
    this.render();
    
    if (this.currentPhase !== 'ft' && this.currentPhase !== 'stats') {
      requestAnimationFrame((t) => this.loop(t));
    }
  }

  update(dt: number) {
    if (this.currentPhase === 'ht') {
      this.realTimeElapsed += dt * 1000;
      if (this.realTimeElapsed > 5000) { // 5 sec halftime break
        this.currentPhase = 'h2';
        this.gameMinute = 45;
        this.realTimeElapsed = 0;
        this.callbacks.onPhaseChange('h2');
      }
      return;
    }

    // Advance Game Clock
    this.realTimeElapsed += dt * 1000;
    const rawMinute = Math.floor(this.realTimeElapsed / this.REAL_MS_PER_GAME_MINUTE);
    // In h2, realTimeElapsed resets to 0 at kickoff — offset by 45 to continue from 45'
    const newMinute = this.currentPhase === 'h2' ? rawMinute + 45 : rawMinute;

    // Check Phase Transitions
    if (this.currentPhase === 'h1' && newMinute >= 45 + this.script.addedTime.half1) {
      this.currentPhase = 'ht';
      this.realTimeElapsed = 0;
      this.callbacks.onPhaseChange('ht');
      return;
    }
    if (this.currentPhase === 'h2' && newMinute >= 90 + this.script.addedTime.half2) {
      this.currentPhase = 'ft';
      this.callbacks.onPhaseChange('ft');
      this.callbacks.onComplete();
      this.stop();
      return;
    }

    if (newMinute > this.gameMinute) {
      this.gameMinute = newMinute;
      this.callbacks.onMinute(this.gameMinute);
      this.checkEvents(this.gameMinute);
    }

    // AI Physics Loop
    this.updateAI(dt);
    this.ball.update(dt);

    // Handle Event Animations (Goals, Corners, etc)
    if (this.activeEvent) {
      this.eventTimer -= dt;
      if (this.eventTimer <= 0) {
        this.activeEvent = null;
        this.callbacks.onEvent(null);
      }
    }
  }

  checkEvents(min: number) {
    const evs = this.script.events.filter((e:any) => e.minute === min);
    if (evs.length > 0) {
      const e = evs[0]; // Process first event of the minute
      this.activeEvent = e;
      this.eventTimer = 3; // Show caption for 3 seconds
      this.callbacks.onEvent(e);
      
      this.executeEventScript(e);
    }
  }

  executeEventScript(e: any) {
    const isHome = e.team === 'home';
    this.activeTeam = e.team;
    
    // Un-own ball
    this.players.forEach(p => p.hasBall = false);
    
    if (e.type === 'goal') {
      const st = this.players.find(p => p.team === e.team && (p.role === 'st' || p.role === 'lw' || p.role === 'rw')) || this.players.find(p => p.team === e.team)!;
      this.ball.pos = st.pos.copy();
      this.ball.shoot(new Vec2(isHome ? 100 : 0, 50), 60);
      this.tacticalPhase = 'attack';
      
    } else if (e.type === 'corner') {
      const cornerX = isHome ? 100 : 0;
      const cornerY = 100;
      this.ball.pos = new Vec2(cornerX, cornerY);
      const winger = this.players.find(p => p.team === e.team && (p.role === 'rw' || p.role === 'lw')) || this.players.find(p => p.team === e.team)!;
      winger.pos = new Vec2(cornerX, cornerY);
      
      // Cross ball in 1s
      setTimeout(() => {
        if (!this.isRunning) return;
        this.ball.passTo(new Vec2(isHome ? 90 : 10, 50), 30, 20); // lofted cross
      }, 1000);
      this.tacticalPhase = 'attack';
      
    } else if (e.type === 'save' || e.type === 'miss') {
      const fwd = this.players.find(p => p.team === e.team && (p.role === 'st' || p.role === 'lw' || p.role === 'rw')) || this.players.find(p => p.team === e.team)!;
      this.ball.pos = fwd.pos.copy();
      
      const targetY = e.type === 'miss' ? (Math.random()>0.5 ? 30:70) : 50;
      this.ball.shoot(new Vec2(isHome ? 100 : 0, targetY), 50);
      this.tacticalPhase = 'attack';
      
    } else if (e.type === 'possession' || e.type === 'foul' || e.type === 'yellow_card') {
      const mid = this.players.find(p => p.team === e.team && (p.role === 'cm' || p.role === 'cdm')) || this.players.find(p => p.team === e.team)!;
      this.ball.owner = mid;
      this.ball.state = 'controlled';
      mid.hasBall = true;
      this.tacticalPhase = 'midfield';
    } else if (e.type === 'free_kick') {
      const mid = this.players.find(p => p.team === e.team && (p.role === 'cm' || p.role === 'st')) || this.players.find(p => p.team === e.team)!;
      this.ball.pos = mid.pos.copy();
      // Shoot over wall
      setTimeout(() => {
        if (!this.isRunning) return;
        this.ball.shoot(new Vec2(isHome ? 100 : 0, 50), 55);
      }, 1000);
      this.tacticalPhase = 'attack';
    }
  }

  updateAI(dt: number) {
    // Normal play logic if no hard-coded event is animating
    if (!this.activeEvent) {
      if (this.ball.state === 'controlled') {
        // Random chance to pass
        if (Math.random() < 0.02) { 
          // Find teammate
          const teammates = this.players.filter(p => p.team === this.activeTeam && p !== this.ball.owner);
          
          // Tactical progression
          let targets = teammates;
          if (this.tacticalPhase === 'buildup') targets = teammates.filter(p => p.role === 'cm' || p.role === 'cdm' || p.role === 'cb' || p.role === 'lb' || p.role === 'rb');
          if (this.tacticalPhase === 'midfield') targets = teammates.filter(p => p.role === 'st' || p.role === 'lw' || p.role === 'rw' || p.role === 'cm' || p.role === 'cam');
          
          const targetPlayer = targets[Math.floor(Math.random() * targets.length)] || teammates[0];
          
          // Pass the ball
          this.ball.owner!.hasBall = false;
          this.ball.passTo(targetPlayer.pos, 40, 0); // 40 speed
          
          // Shift Phase
          if (targetPlayer.role === 'st' || targetPlayer.role === 'lw' || targetPlayer.role === 'rw' || targetPlayer.role === 'cam') this.tacticalPhase = 'attack';
          else if (targetPlayer.role === 'cm' || targetPlayer.role === 'cdm') this.tacticalPhase = 'midfield';
          else this.tacticalPhase = 'buildup';
        }
      } else if (this.ball.state === 'passing' || this.ball.state === 'free') {
        // Find nearest player to intercept/receive
        let nearest: Player | null = null;
        let minDist = 999;
        
        this.players.forEach(p => {
          const d = p.pos.dist(this.ball.pos);
          if (d < minDist) { minDist = d; nearest = p; }
        });
        
        // Intercept threshold
        if (minDist < 3 && nearest && this.ball.z < 2) {
          this.ball.state = 'controlled';
          this.ball.owner = nearest;
          nearest.hasBall = true;
          this.activeTeam = nearest.team;
        }
      }
    }

    // Determine nearest defender to the ball for pressing
    let nearestDefender: Player | null = null;
    let minDefDist = 999;
    this.players.forEach(p => {
      if (p.team !== this.activeTeam && p.role !== 'gk') {
        const d = p.pos.dist(this.ball.pos);
        if (d < minDefDist) {
          minDefDist = d;
          nearestDefender = p;
        }
      }
    });

    // Update Player Positions (Rigid Tactical Shapes + Pressing)
    this.players.forEach(p => {
      let target = p.basePos.copy();
      
      const isAttacking = p.team === this.activeTeam;
      const dir = p.team === 'home' ? 1 : -1;

      // GK Logic - Sweeper Keeper
      if (p.role === 'gk') {
        target.x = p.team === 'home' ? 5 : 95;
        // Track the ball's Y slightly to cover angles
        target.y = 50 + (this.ball.pos.y - 50) * 0.3;
        
        // Push up slightly if team is attacking in final third
        if (isAttacking && this.tacticalPhase === 'attack') {
          target.x += dir * 10;
        }
      } 
      else {
        // Outfield Players
        if (isAttacking) {
          // Attacking shape
          if (this.tacticalPhase === 'buildup') {
            target.x += dir * 10;
          } else if (this.tacticalPhase === 'midfield') {
            target.x += dir * 25;
            if (p.role === 'lb' || p.role === 'rb') target.x += dir * 15; // Fullbacks overlap
          } else if (this.tacticalPhase === 'attack') {
            target.x += dir * 40;
            if (p.role === 'lw' || p.role === 'rw' || p.role === 'st') target.x += dir * 15; // Forwards push the line
            if (p.role === 'lb' || p.role === 'rb') target.x += dir * 25; // Fullbacks bomb down
            if (p.role === 'cb') target.x -= dir * 10; // CBs stay back to cover counters
          }
          
          // Spread wide in attack
          if (p.role === 'lw' || p.role === 'lb') target.y = Math.max(5, target.y - 15);
          if (p.role === 'rw' || p.role === 'rb') target.y = Math.min(95, target.y + 15);

        } else {
          // Defending shape (Rigid block)
          if (this.tacticalPhase === 'buildup') {
            target.x += dir * -5; // High block
          } else if (this.tacticalPhase === 'midfield') {
            target.x += dir * -15; // Mid block
          } else if (this.tacticalPhase === 'attack') {
            target.x += dir * -35; // Low block (Park the bus)
            if (p.role === 'st') target.x += dir * 15; // Striker stays slightly higher for counters
          }
          
          // Compress center when defending
          if (target.y < 50) target.y += 10;
          if (target.y > 50) target.y -= 10;

          // Single-man Pressing: Only the closest defender breaks the line to press
          if (p === nearestDefender && minDefDist < 20 && this.ball.state !== 'shooting') {
            target = this.ball.pos.copy();
          }
        }
      }

      // If receiving a pass, run to the ball
      if (isAttacking && this.ball.state === 'passing') {
         const distToBall = p.pos.dist(this.ball.pos);
         if (distToBall < 15) target = this.ball.pos.copy();
      }

      // Teammates for separation physics
      const teammates = this.players.filter(t => t.team === p.team);
      p.update(dt, target, teammates);
    });
  }

  render() {
    const { ctx, width, height } = this;
    
    // Scale 0-100 coords to actual canvas size
    const sx = width / 100;
    const sy = height / 100;
    
    // Clear pitch (drawn by CSS behind canvas usually, but we can draw it here)
    ctx.clearRect(0, 0, width, height);

    // Draw Pitch Markings
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    
    // Outer bounds
    ctx.strokeRect(2 * sx, 2 * sy, 96 * sx, 96 * sy);
    // Halfway line
    ctx.beginPath(); ctx.moveTo(50 * sx, 2 * sy); ctx.lineTo(50 * sx, 98 * sy); ctx.stroke();
    // Center circle
    ctx.beginPath(); ctx.arc(50 * sx, 50 * sy, 10 * sy, 0, Math.PI*2); ctx.stroke();
    // Penalty boxes
    ctx.strokeRect(2 * sx, 25 * sy, 15 * sx, 50 * sy);
    ctx.strokeRect(83 * sx, 25 * sy, 15 * sx, 50 * sy);
    
    // Draw Players
    this.players.forEach(p => {
      ctx.beginPath();
      // Radius scales with canvas size
      const r = p.radius * Math.min(sx, sy);
      ctx.arc(p.pos.x * sx, p.pos.y * sy, r, 0, Math.PI*2);
      
      // Colors
      ctx.fillStyle = p.team === 'home' ? '#10e774' : '#3b82f6';
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();
      
      // Highlight owner
      if (p.hasBall) {
        ctx.beginPath();
        ctx.arc(p.pos.x * sx, p.pos.y * sy, r * 1.5, 0, Math.PI*2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });

    // Draw Ball
    const bx = this.ball.pos.x * sx;
    // Apply z-height (simulate height by moving ball "up" visually and growing shadow)
    const bVisualY = (this.ball.pos.y * sy) - (this.ball.z * sy * 0.5); 
    
    // Shadow
    ctx.beginPath();
    ctx.ellipse(bx, this.ball.pos.y * sy, 3, 1.5, 0, 0, Math.PI*2);
    ctx.fillStyle = `rgba(0,0,0,${Math.max(0.1, 0.5 - this.ball.z * 0.05)})`;
    ctx.fill();

    // Ball Body
    ctx.beginPath();
    const ballR = Math.max(2, (1.2 + this.ball.z * 0.05) * Math.min(sx, sy));
    ctx.arc(bx, bVisualY, ballR, 0, Math.PI*2);
    ctx.fillStyle = '#fde047'; // Yellow ball
    ctx.fill();
    ctx.strokeStyle = '#854d0e';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}