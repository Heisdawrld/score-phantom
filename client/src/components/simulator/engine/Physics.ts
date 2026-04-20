export class Vec2 {
  constructor(public x: number, public y: number) {}
  
  add(v: Vec2) { return new Vec2(this.x + v.x, this.y + v.y); }
  sub(v: Vec2) { return new Vec2(this.x - v.x, this.y - v.y); }
  mul(s: number) { return new Vec2(this.x * s, this.y * s); }
  mag() { return Math.sqrt(this.x * this.x + this.y * this.y); }
  norm() { const m = this.mag(); return m === 0 ? new Vec2(0,0) : new Vec2(this.x/m, this.y/m); }
  dist(v: Vec2) { return this.sub(v).mag(); }
  copy() { return new Vec2(this.x, this.y); }
}

export type TeamType = 'home' | 'away';
export type PlayerRole = 'gk' | 'cb' | 'lb' | 'rb' | 'cdm' | 'cm' | 'cam' | 'lw' | 'rw' | 'st';

export class Player {
  id: string;
  team: TeamType;
  role: PlayerRole;
  pos: Vec2;
  vel: Vec2;
  basePos: Vec2; // Tactical anchor point (0-100 scale)
  speed: number;
  hasBall: boolean = false;
  radius: number = 1.5; // percent of pitch width
  
  constructor(id: string, team: TeamType, role: PlayerRole, bx: number, by: number) {
    this.id = id;
    this.team = team;
    this.role = role;
    this.basePos = new Vec2(bx, by);
    this.pos = new Vec2(bx, by);
    this.vel = new Vec2(0, 0);
    // Speed varies slightly by role
    this.speed = (role === 'lw' || role === 'rw' || role === 'st') ? 9 : 
                 (role === 'cm' || role === 'cam' || role === 'lb' || role === 'rb') ? 8 : 
                 (role === 'cb' || role === 'cdm') ? 7 : 5; // gk
  }

  update(dt: number, target: Vec2, teammates: Player[]) {
    // Steer towards target
    const desired = target.sub(this.pos);
    const d = desired.mag();
    
    let steer = new Vec2(0, 0);
    if (d > 0.5) {
      steer = desired.norm().mul(this.speed);
    }
    
    // Separation: Don't cluster with teammates
    let separation = new Vec2(0, 0);
    let count = 0;
    for (const other of teammates) {
      if (other.id !== this.id) {
        const dist = this.pos.dist(other.pos);
        if (dist > 0 && dist < 4) { // 4% pitch width threshold
          const diff = this.pos.sub(other.pos).norm().mul(1 / dist); // Stronger push if closer
          separation = separation.add(diff);
          count++;
        }
      }
    }
    
    if (count > 0) {
      separation = separation.mul(10); // weight of separation
      steer = steer.add(separation);
    }
    
    // Simple acceleration
    this.vel = this.vel.add(steer.sub(this.vel).mul(dt * 5)); 
    
    // Friction
    if (d <= 0.5 && count === 0) {
      this.vel = this.vel.mul(0.8); 
    }
    
    this.pos = this.pos.add(this.vel.mul(dt));
    
    // Clamp to pitch (0-100)
    this.pos.x = Math.max(2, Math.min(98, this.pos.x));
    this.pos.y = Math.max(2, Math.min(98, this.pos.y));
  }
}

export class Ball {
  pos: Vec2;
  vel: Vec2;
  z: number = 0; // Height for shots/crosses
  vz: number = 0;
  owner: Player | null = null;
  targetPos: Vec2 | null = null;
  state: 'controlled' | 'passing' | 'shooting' | 'free' = 'free';

  constructor(x: number, y: number) {
    this.pos = new Vec2(x, y);
    this.vel = new Vec2(0, 0);
  }

  update(dt: number) {
    if (this.state === 'controlled' && this.owner) {
      // Ball sits at player's feet
      this.pos = this.owner.pos.copy();
      this.vel = new Vec2(0,0);
      this.z = 0;
    } else if (this.state === 'passing' || this.state === 'shooting' || this.state === 'free') {
      this.pos = this.pos.add(this.vel.mul(dt));
      
      // Z physics (gravity)
      this.z += this.vz * dt;
      this.vz -= 30 * dt; // Gravity
      if (this.z < 0) {
        this.z = 0;
        this.vz = Math.max(0, -this.vz * 0.5); // Bounce
      }

      // Friction
      this.vel = this.vel.mul(1 - (1.5 * dt));

      if (this.vel.mag() < 1 && this.z <= 0.1) {
        this.state = 'free';
      }
    }
    
    // Clamp to pitch bounds roughly
    this.pos.x = Math.max(-5, Math.min(105, this.pos.x));
    this.pos.y = Math.max(-5, Math.min(105, this.pos.y));
  }

  passTo(target: Vec2, speed: number, loft: number = 0) {
    this.state = 'passing';
    this.owner = null;
    const dir = target.sub(this.pos).norm();
    this.vel = dir.mul(speed);
    this.vz = loft;
  }
  
  shoot(target: Vec2, speed: number) {
    this.state = 'shooting';
    this.owner = null;
    const dir = target.sub(this.pos).norm();
    this.vel = dir.mul(speed);
    this.vz = 5; // Hard shot stays low
  }
}