import { useState, useMemo, useEffect, useRef } from "react";
import { format, addDays, isSameDay } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { useFixtures } from "@/hooks/use-fixtures";
import { Header } from "@/components/layout/Header";
import { PredictionPanel } from "@/components/prediction/PredictionPanel";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfidenceRing } from "@/components/ui/ConfidenceRing";
import { ConfidenceBadge, getConfidenceTier } from "@/components/ui/ConfidenceBadge";
import { CountdownTimer } from "@/components/ui/CountdownTimer";
import {
  ChevronRight, ChevronDown, ChevronUp, Search, Trophy, BellRing,
  Crown, Zap, Lock, AlertCircle, Flame, BarChart2, Activity, Star,
  TrendingUp, Target
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useLocation, useSearch } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";

// ── Helpers ──────────────────────────────────────────────────────────────────

function toWAT(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-NG', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', hour12: false });
  } catch { return ''; }
}

function TeamLogo({ src, name }: { src?: string | null; name: string }) {
  const [err, setErr] = useState(false);
  if (src && !err) {
    return <img src={src} alt={name} onError={() => setErr(true)} className='w-7 h-7 rounded-full object-contain bg-white/5 border border-white/10 shrink-0' loading='lazy' />;
  }
  return <div className='w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 text-[10px] font-bold text-primary'>{name.slice(0,2).toUpperCase()}</div>;
}

// ── Tournament ID → Country lookup ──────────────────────────────────────────
const TOURNAMENT_COUNTRY: Record<string, string> = {
  '5': 'France', '35': 'Algeria', '84': 'Senegal', '42': 'Tunisia',
  '97': 'France', '229': 'Ivory Coast', '343': 'Morocco',
  '7': 'England', '16': 'Scotland', '30': 'Russia', '36': 'Nigeria',
  '37': 'South Africa', '64': 'Bangladesh', '80': 'Tajikistan',
  '86': 'India', '91': 'Zambia', '183': 'Thailand', '238': 'Rwanda',
  '258': 'Uganda', '273': 'Gambia', '278': 'Ethiopia', '281': 'Iraq',
  '282': 'Jamaica', '287': 'Bahrain', '292': 'South Sudan',
  '313': 'Eswatini', '399': 'Liberia',
  '25': 'Uruguay', '46': 'Dominican Rep', '47': 'Cuba', '48': 'Paraguay',
  '52': 'Bolivia', '54': 'El Salvador',
  '259': 'Ecuador', '265': 'Colombia',
  '55': 'Guatemala', '56': 'Honduras',
  '9': 'Greece', '15': 'Kosovo', '26': 'Switzerland', '63': 'China',
  '290': 'Egypt', '408': 'Bangladesh',
  '72': 'Hungary', '138': 'Bosnia', '187': 'Moldova', '239': 'Armenia',
  '44': 'Andorra', '132': 'Lithuania', '147': 'Estonia',
  '216': 'Yemen', '327': 'South Africa',
  '144': 'Croatia', '148': 'Denmark',
  '126': 'Serbia', '135': 'Turkmenistan', '190': 'Malta',
  '202': 'N. Macedonia', '272': 'Iceland', '295': 'Luxembourg', '434': 'Armenia',
  '191': 'Malta', '338': 'Switzerland',
  '4': 'Brazil', '24': 'Brazil B', '95': 'Brazil Ser.B',
};

/**
 * Build a display label for a tournament group.
 * Uses category_name (country) from the fixture — already stored in the DB.
 * Format: "Premier League · England" or just "Premier League"
 *
 * Safety: some fixtures have a venue/stadium in category_name (e.g. "Selhurst Park").
 * We filter those out by checking for venue-like keywords.
 */
const VENUE_KEYWORDS = ['park', 'stadium', 'arena', 'ground', 'road', 'lane', 'parc', 'stade', 'estadio', 'field', 'dome'];
function looksLikeVenue(s: string): boolean {
  const lower = s.toLowerCase();
  return VENUE_KEYWORDS.some(kw => lower.includes(kw));
}
function getTournamentLabel(tournamentName: string, categoryName?: string | null): string {
  if (!tournamentName) return 'Other Competitions';
  const country = (categoryName || '').trim();
  if (
    !country ||
    country.toLowerCase() === 'other' ||
    country.toLowerCase() === tournamentName.toLowerCase() ||
    looksLikeVenue(country)
  ) {
    return tournamentName;
  }
  return `${tournamentName} · ${country}`;
}

function fifaToEmoji(fifaCode: string): string {
  if (!fifaCode) return '⚽';
  const code = fifaCode.replace('.png', '').toUpperCase().slice(0, 3);
  const FIFA_EMOJI: Record<string, string> = {
    'ENG': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'ESP': '🇪🇸', 'GER': '🇩🇪', 'ITA': '🇮🇹', 'FRA': '🇫🇷',
    'POR': '🇵🇹', 'NED': '🇳🇱', 'BEL': '🇧🇪', 'SCO': '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'TUR': '🇹🇷',
    'ARG': '🇦🇷', 'BRA': '🇧🇷', 'MEX': '🇲🇽', 'USA': '🇺🇸', 'AUS': '🇦🇺',
    'NGA': '🇳🇬', 'GHA': '🇬🇭', 'ZAF': '🇿🇦', 'EGY': '🇪🇬', 'MAR': '🇲🇦',
    'JPN': '🇯🇵', 'KOR': '🇰🇷', 'CHN': '🇨🇳', 'GRE': '🇬🇷', 'URU': '🇺🇾',
    'COL': '🇨🇴', 'CHI': '🇨🇱', 'PER': '🇵🇪', 'AUT': '🇦🇹', 'CHE': '🇨🇭',
    'DNK': '🇩🇰', 'SWE': '🇸🇪', 'NOR': '🇳🇴', 'POL': '🇵🇱', 'CZE': '🇨🇿',
    'ROU': '🇷🇴', 'RUS': '🇷🇺', 'UKR': '🇺🇦', 'HRV': '🇭🇷', 'SRB': '🇷🇸',
    'HUN': '🇭🇺', 'ISR': '🇮🇱', 'SAU': '🇸🇦', 'ARE': '🇦🇪', 'IND': '🇮🇳',
  };
  return FIFA_EMOJI[code] || '⚽';
}

// ── TODAY'S BEST BET — Premium Hero Card ────────────────────────────────────

function TodaysBestBet({ pick, onView }: { pick: any; onView: () => void }) {
  const prob = pick.probability ?? 0;
  const composite = pick.composite ?? pick.confidence ?? 0;
  const tier = getConfidenceTier(composite);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="relative rounded-2xl overflow-hidden gradient-card-green"
    >
      {/* Subtle glow overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(16,231,116,0.06),transparent_60%)]" />

      <div className="relative z-10 p-5">
        {/* Header row */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-base">🔥</span>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
              Today's Best Bet
            </span>
          </div>
          {pick.time && (
            <CountdownTimer
              matchDate={(() => {
                // Build date from today + time
                const today = new Date();
                const [h, m] = (pick.time || "00:00").split(":");
                today.setHours(parseInt(h) || 0, parseInt(m) || 0, 0, 0);
                return today.toISOString();
              })()}
            />
          )}
        </div>

        {/* Tournament + Time */}
        <div className="flex items-center gap-2 mb-2">
          {pick.tournament && (
            <span className="text-[10px] text-white/40 uppercase tracking-wider">
              {pick.tournament}
            </span>
          )}
          {pick.time && (
            <span className="text-[10px] text-white/30">⏰ {pick.time}</span>
          )}
        </div>

        {/* Match name + Confidence ring */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-black text-white leading-tight">
              {pick.match}
            </h3>
            {/* Pick label as green pill */}
            <div className="mt-2 inline-flex items-center gap-1.5 bg-primary/15 border border-primary/30 rounded-full px-3 py-1">
              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
              <span className="text-xs font-bold text-primary">{pick.pick}</span>
            </div>
          </div>

          {/* Confidence ring */}
          <ConfidenceRing
            value={composite}
            size={72}
            strokeWidth={4}
            showLabel
            label="CONFIDENCE"
          />
        </div>

        {/* Stats row: Model Prob / Edge */}
        <div className="flex gap-2 mb-4">
          <div className="flex-1 bg-white/[0.04] rounded-xl p-2.5 text-center border border-white/[0.06]">
            <p className="text-[9px] text-white/35 font-bold uppercase tracking-wider mb-0.5">Model Prob</p>
            <p className="text-lg font-black text-primary tabular-nums">{prob.toFixed(0)}%</p>
          </div>
          <div className={cn(
            "flex-1 rounded-xl p-2.5 text-center border",
            "bg-primary/[0.06] border-primary/20"
          )}>
            <p className="text-[9px] text-primary/60 font-bold uppercase tracking-wider mb-0.5">Edge</p>
            <p className="text-lg font-black text-primary tabular-nums">
              +{Math.max(0, composite - 50).toFixed(0)}%
            </p>
          </div>
          <div className="flex-1 bg-white/[0.04] rounded-xl p-2.5 text-center border border-white/[0.06]">
            <p className="text-[9px] text-white/35 font-bold uppercase tracking-wider mb-0.5">Score</p>
            <p className="text-lg font-black text-white tabular-nums">{composite.toFixed(0)}</p>
          </div>
        </div>

        {/* View CTA */}
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          onClick={onView}
          className="w-full py-3 rounded-xl bg-primary text-black font-black text-sm tracking-wide flex items-center justify-center gap-2 shadow-[0_0_24px_rgba(16,231,116,0.25)] hover:shadow-[0_0_32px_rgba(16,231,116,0.4)] transition-shadow"
        >
          View Full Analysis <ChevronRight className="w-4 h-4" />
        </motion.button>
      </div>
    </motion.div>
  );
}

// ── Quick Action Cards ──────────────────────────────────────────────────────

function QuickActions({ onTopPicks, onAcca, onLive, onValueBets }: {
  onTopPicks: () => void;
  onAcca: () => void;
  onLive: () => void;
  onValueBets: () => void;
}) {
  const items = [
    { label: "Top Picks", sub: "Updated daily", icon: <Flame className="w-5 h-5" />, color: "text-orange-400", onClick: onTopPicks },
    { label: "ACCA Builder", sub: "Smart combos", icon: <Zap className="w-5 h-5" />, color: "text-blue-400", onClick: onAcca },
    { label: "Live Tracker", sub: "Track in real-time", icon: <Activity className="w-5 h-5" />, color: "text-emerald-400", onClick: onLive },
    { label: "Value Bets", sub: "High edge plays", icon: <Star className="w-5 h-5" />, color: "text-amber-400", onClick: onValueBets },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 }}
      className="grid grid-cols-4 gap-2"
    >
      {items.map((item) => (
        <motion.button
          key={item.label}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.95 }}
          onClick={item.onClick}
          className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl glass-card glass-card-hover transition-all"
        >
          <div className={cn("w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center", item.color)}>
            {item.icon}
          </div>
          <span className={cn("text-[10px] font-bold", item.color)}>{item.label}</span>
          <span className="text-[8px] text-white/25">{item.sub}</span>
        </motion.button>
      ))}
    </motion.div>
  );
}

// ── Your Stats Card ─────────────────────────────────────────────────────────

function YourStats({ stats, onView }: { stats: any; onView: () => void }) {
  const wr = stats.winRate ?? 0;
  const settled = (stats.wins || 0) + (stats.losses || 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className="glass-card rounded-2xl p-4 cursor-pointer hover:border-white/12 transition-all"
      onClick={onView}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-primary" />
          <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">Your Stats</span>
        </div>
        <ChevronRight className="w-4 h-4 text-white/20" />
      </div>
      <div className="flex items-center gap-4">
        <div className="text-center">
          <p className="text-2xl font-black text-primary tabular-nums">{wr.toFixed(1)}%</p>
          <p className="text-[9px] text-white/30 uppercase tracking-wider">Win Rate</p>
        </div>
        <div className="w-px h-10 bg-white/8" />
        <div className="text-center">
          <p className="text-2xl font-black text-emerald-400 tabular-nums">{stats.wins || 0}</p>
          <p className="text-[9px] text-white/30 uppercase tracking-wider">Won</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-black text-red-400 tabular-nums">{stats.losses || 0}</p>
          <p className="text-[9px] text-white/30 uppercase tracking-wider">Lost</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-black text-white/50 tabular-nums">{settled}</p>
          <p className="text-[9px] text-white/30 uppercase tracking-wider">Settled</p>
        </div>
      </div>
    </motion.div>
  );
}

// ── Value Bet of the Day ────────────────────────────────────────────────────

function ValueBetCard({ isPremium }: { isPremium: boolean }) {
  const [, setLocation] = useLocation();
  const { data } = useQuery({
    queryKey: ["/api/value-bet-today"],
    queryFn: () => fetchApi("/value-bet-today"),
    enabled: isPremium,
    staleTime: 30 * 60 * 1000,
  });

  if (!isPremium) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="rounded-2xl border border-amber-500/20 bg-gradient-to-r from-amber-500/5 to-transparent p-4 flex items-center gap-4 cursor-pointer hover:bg-amber-500/8 transition-all"
        onClick={() => setLocation("/paywall")}
      >
        <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
          <span className="text-lg">🔥</span>
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-amber-400">Value Bet of the Day</p>
          <p className="text-xs text-white/40 mt-0.5">Upgrade to see today's highest edge pick</p>
        </div>
        <Lock className="w-4 h-4 text-white/20 shrink-0" />
      </motion.div>
    );
  }

  if (!data?.found) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
      className="rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-500/8 via-amber-500/3 to-transparent p-4 cursor-pointer hover:border-amber-500/35 transition-all"
      onClick={() => setLocation("/matches/" + data.fixtureId)}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">🔥</span>
          <span className="text-[10px] font-black text-amber-400 uppercase tracking-[0.15em]">Value Bet of the Day</span>
        </div>
        <ChevronRight className="w-4 h-4 text-amber-400/40" />
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white truncate">{data.homeTeam} vs {data.awayTeam}</p>
          <p className="text-[10px] text-white/30 mt-0.5">{data.tournament}</p>
          <p className="text-xs font-bold text-amber-400 mt-1">{data.selection}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <div className="text-center">
            <p className="text-lg font-black text-primary tabular-nums">{data.probability?.toFixed(0)}%</p>
            <p className="text-[8px] text-white/25 uppercase">Model</p>
          </div>
          {data.edge != null && (
            <div className="text-center">
              <p className="text-lg font-black text-amber-400 tabular-nums">+{data.edge?.toFixed(0)}%</p>
              <p className="text-[8px] text-white/25 uppercase">Edge</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Upcoming Fixtures Horizontal Scroll ─────────────────────────────────────

function UpcomingFixtures({ fixtures, onSelect }: { fixtures: any[]; onSelect: (id: string) => void }) {
  if (!fixtures.length) return null;

  // Take only upcoming (not live/finished), limit to 10
  const upcoming = fixtures
    .filter((f: any) => !['LIVE','HT','FT','AET','Pen'].includes(f.match_status || ''))
    .slice(0, 10);

  if (!upcoming.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">
          ‖ Upcoming Fixtures
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1 snap-x">
        {upcoming.map((f: any) => {
          const time = toWAT(f.match_date);
          const homeName = f.home_team_name || "Home";
          const awayName = f.away_team_name || "Away";
          const league = (f.tournament_name || "").split(/[\s-]/)[0] || "";

          return (
            <button
              key={f.id}
              onClick={() => onSelect(f.id)}
              className="snap-start shrink-0 w-[130px] glass-card rounded-xl p-3 hover:border-white/15 transition-all group text-left"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-white/40">{time}</span>
                <ChevronRight className="w-3 h-3 text-white/15 group-hover:text-primary transition-colors" />
              </div>
              <div className="flex items-center gap-1.5 mb-1">
                <TeamLogo src={f.home_team_logo} name={homeName} />
                <span className="text-[11px] font-bold text-white truncate">{homeName.slice(0, 3).toUpperCase()}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <TeamLogo src={f.away_team_logo} name={awayName} />
                <span className="text-[11px] font-bold text-white truncate">{awayName.slice(0, 3).toUpperCase()}</span>
              </div>
              <p className="text-[8px] text-white/20 uppercase tracking-wider mt-1.5">{league}</p>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

// ── ACCA Section ────────────────────────────────────────────────────────────

function AccaSection({ isPremium }: { isPremium: boolean }) {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(true);
  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/acca'],
    queryFn: () => fetchApi('/acca'),
    enabled: isPremium && open,
    staleTime: 15 * 60 * 1000,
  });

  if (!isPremium) {
    return (
      <div className='rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/5 to-transparent p-4 flex items-center gap-4 cursor-pointer hover:bg-primary/8 transition-all' onClick={() => setLocation('/paywall')}>
        <div className='w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0'><Crown className='w-5 h-5 text-primary' /></div>
        <div className='flex-1'><p className='text-sm font-bold text-primary'>Daily ACCA Builder</p><p className='text-xs text-muted-foreground mt-0.5'>5-pick daily accumulator — Premium only</p></div>
        <Lock className='w-4 h-4 text-muted-foreground shrink-0' />
      </div>
    );
  }

  const picks = data?.picks || [];
  const combinedOdds = picks.reduce((acc: number, p: any) => {
    const realOdds = p.pickOdds || p.oddsHome || p.oddsAway || (100 / Math.max(p.probability, 1));
    return acc * parseFloat(realOdds);
  }, 1);

  return (
    <div className='rounded-2xl border border-primary/25 bg-gradient-to-b from-primary/[0.06] via-primary/[0.02] to-transparent overflow-hidden'>
      <button className='w-full flex items-center gap-3 px-4 py-3.5 hover:bg-primary/5 transition-all' onClick={() => setOpen(o => !o)}>
        <div className='w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0'><Zap className='w-4 h-4 text-primary' /></div>
        <div className='flex-1 text-left'>
          <p className='text-sm font-black text-primary tracking-wide'>Daily ACCA</p>
          <p className='text-[10px] text-white/35'>Smart auto-generated accumulator</p>
        </div>
        {picks.length > 0 && <span className='text-xs font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full'>{combinedOdds.toFixed(2)}x</span>}
        {open ? <ChevronUp className='w-4 h-4 text-primary shrink-0' /> : <ChevronDown className='w-4 h-4 text-primary shrink-0' />}
      </button>
      {open && (
        <div className='px-4 pb-4 space-y-3'>
          {isLoading && <div className='flex justify-center py-6'><div className='w-6 h-6 rounded-full border-2 border-primary/20 border-t-primary animate-spin' /></div>}
          {error && <p className='text-xs text-white/30 text-center py-4'>Could not load ACCA picks right now.</p>}
          {!isLoading && !error && picks.length === 0 && <p className='text-xs text-white/30 text-center py-4'>{data?.message || 'Building today ACCA — check back soon.'}</p>}
          {picks.length > 0 && (
            <div className='flex gap-2'>
              <div className='flex-1 bg-white/[0.04] rounded-xl p-2.5 border border-white/[0.06] text-center'><p className='text-[9px] text-white/35 mb-0.5'>Combined Odds</p><p className='text-sm font-black text-white'>{combinedOdds.toFixed(2)}x</p></div>
              <div className='flex-1 bg-primary/[0.06] rounded-xl p-2.5 border border-primary/15 text-center'><p className='text-[9px] text-white/35 mb-0.5'>NGN1k returns</p><p className='text-sm font-black text-primary'>NGN{Math.round(1000 * combinedOdds).toLocaleString()}</p></div>
            </div>
          )}
          {picks.map((pick: any, i: number) => {
            const realOdds = pick.pickOdds || pick.oddsHome || pick.oddsAway;
            const oddsFmt = realOdds ? parseFloat(realOdds).toFixed(2) : (100 / Math.max(pick.probability, 1)).toFixed(2);
            return (
              <div key={pick.fixtureId || i} className='flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]'>
                <span className='text-xs font-black text-white/25 w-5 shrink-0 pt-0.5'>#{i + 1}</span>
                <div className='flex-1 min-w-0'>
                  <p className='text-sm font-semibold truncate'>{pick.homeTeam} <span className='text-white/30 text-xs'>vs</span> {pick.awayTeam}</p>
                  <p className='text-[10px] text-white/30 truncate'>{pick.tournament}</p>
                  <p className='text-xs font-bold text-white mt-0.5'>{(pick.market || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())} — {pick.selection}</p>
                </div>
                <div className='text-right shrink-0 space-y-1'>
                  <p className='text-sm font-black text-primary'>{pick.probability?.toFixed(0)}%</p>
                  <p className='text-xs font-bold text-white/40 bg-white/[0.06] px-2 py-0.5 rounded border border-white/[0.06]'>{oddsFmt}</p>
                </div>
              </div>
            );
          })}
          {picks.length > 0 && <p className='text-[10px] text-white/15 text-center'>Odds shown are market odds · Always gamble responsibly</p>}
        </div>
      )}
    </div>
  );
}

// ── League Group ────────────────────────────────────────────────────────────

function EnrichmentBadge({ status }: { status?: string | null }) {
  const config: Record<string, { label: string; cls: string }> = {
    deep:    { label: "Deep",     cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
    basic:   { label: "Basic",    cls: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
    limited: { label: "Limited",  cls: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
    no_data: { label: "No Data",  cls: "bg-white/5 text-white/30 border-white/10" },
  };
  const c = !status ? { label: ". . .", cls: "bg-white/5 text-white/20 border-white/8 animate-pulse" } : (config[status] ?? config["no_data"]);
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider shrink-0 ${c.cls}`}>
      {c.label}
    </span>
  );
}

function LeagueGroup({
  tournament, fixtures, onSelectFixture, defaultOpen, isPremium
}: {
  tournament: string; fixtures: any[]; onSelectFixture: (id: string) => void; defaultOpen: boolean; isPremium: boolean;
}) {
  const countryFlag = fixtures[0]?.country_flag ? fifaToEmoji(fixtures[0].country_flag) : '';
  const [open, setOpen] = useState(defaultOpen);
  const [notified, setNotified] = useState<Record<string, boolean>>({});

  async function toggleNotify(e: React.MouseEvent, fixtureId: string) {
    e.stopPropagation();
    const isOn = notified[fixtureId];
    try {
      if (isOn) { await fetchApi('/notify-match/' + fixtureId, { method: 'DELETE' }); }
      else { await fetchApi('/notify-match/' + fixtureId, { method: 'POST' }); }
      setNotified(prev => ({ ...prev, [fixtureId]: !isOn }));
    } catch (_) {}
  }

  return (
    <div className='space-y-1.5'>
      <button className='w-full flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-white/5 transition-all' onClick={() => setOpen(o => !o)}>
        <span className='text-base leading-none mr-0.5'>{countryFlag}</span>
        <div className='w-0.5 h-3.5 bg-primary/60 rounded-full shrink-0' />
        <h3 className='text-[11px] font-black tracking-widest text-white/60 flex-1 text-left uppercase'>{tournament}</h3>
        <span className='text-[10px] text-white/25 bg-white/[0.04] px-1.5 py-0.5 rounded-full'>{fixtures.length}</span>
        {open ? <ChevronUp className='w-3 h-3 text-white/20' /> : <ChevronDown className='w-3 h-3 text-white/20' />}
      </button>
      {open && (
        <motion.div className='space-y-2' initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          {fixtures.map((fixture: any) => {
            const timeStr = toWAT(fixture.match_date);
            const isLive = ['LIVE', 'HT', '1H', '2H', 'ET', 'PEN'].includes(fixture.match_status || '');
            const isFinished = ['FT', 'AET', 'Pen'].includes(fixture.match_status || '');
            const hasScore = fixture.home_score != null && fixture.away_score != null;
            const pct = fixture.best_pick_probability ? parseFloat(fixture.best_pick_probability) * 100 : 0;
            const isNotified = notified[fixture.id] || false;

            return (
              <button key={fixture.id} onClick={() => onSelectFixture(fixture.id)}
                className='w-full text-left rounded-2xl border transition-all duration-200 group hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]'
                style={{ borderColor: isLive ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.05)', background: isLive ? 'rgba(239,68,68,0.03)' : 'rgba(255,255,255,0.02)' }}>
                <div className='p-3.5 flex items-start gap-3'>
                  <div className='flex flex-col items-center justify-start min-w-[48px] shrink-0 mt-0.5 gap-1'>
                    {isLive ? (
                      <div className='flex flex-col items-center gap-0.5'>
                        <span className='flex items-center gap-1'>
                          <span className='w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse' />
                          <span className='text-[9px] font-black text-red-400 uppercase tracking-widest'>LIVE</span>
                        </span>
                        {fixture.live_minute && <span className='text-[9px] text-red-400/70'>{fixture.live_minute}&apos;</span>}
                      </div>
                    ) : isFinished ? (
                      <span className='text-[9px] font-bold text-white/25 uppercase tracking-wide'>FT</span>
                    ) : (
                      <span className='text-[11px] font-bold text-white/35'>{timeStr}</span>
                    )}
                    {(isLive || isFinished) && hasScore && (
                      <div className='flex flex-col items-center bg-black/30 rounded-lg px-1.5 py-1 border border-white/10 mt-0.5'>
                        <span className='text-base font-black tabular-nums leading-none' style={{ color: isLive ? '#ef4444' : '#ffffff' }}>{fixture.home_score}</span>
                        <span className='text-[7px] text-white/20'>vs</span>
                        <span className='text-base font-black tabular-nums leading-none' style={{ color: isLive ? '#ef4444' : '#ffffff' }}>{fixture.away_score}</span>
                      </div>
                    )}
                  </div>
                  <div className='flex-1 min-w-0 space-y-2'>
                    <div className='flex items-center gap-2'>
                      <TeamLogo src={fixture.home_team_logo} name={fixture.home_team_name} />
                      <span className='font-semibold text-sm text-white truncate'>{fixture.home_team_name}</span>
                    </div>
                    <div className='flex items-center gap-2'>
                      <TeamLogo src={fixture.away_team_logo} name={fixture.away_team_name} />
                      <span className='font-semibold text-sm text-white truncate'>{fixture.away_team_name}</span>
                    </div>
                  </div>
                  {!isPremium && pct > 0 && (
                    <div className="mt-1.5 flex items-center gap-1 px-2 py-0.5 rounded-lg bg-primary/8 border border-primary/15">
                      <span className="text-[9px] font-black text-primary/70 blur-[3px] select-none">{pct.toFixed(0)}%</span>
                      <Lock className="w-2.5 h-2.5 text-primary/50" />
                    </div>
                  )}
                  <div className='flex flex-col items-end gap-1.5 shrink-0'>
                    {isLive && (
                      <button onClick={(e) => toggleNotify(e, fixture.id)} className={'p-1.5 rounded-lg border transition-all ' + (isNotified ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-white/[0.04] text-white/20 border-white/[0.06] hover:text-white/50')}>
                        <BellRing className='w-3.5 h-3.5' />
                      </button>
                    )}
                    {(fixture.odds_home || fixture.odds_away) && !isLive && !isFinished && (
                      <div className='flex flex-col gap-0.5'>
                        {fixture.odds_home && <span className='text-[9px] text-white/30 bg-white/[0.04] px-1.5 py-0.5 rounded text-right'>H {Number(fixture.odds_home).toFixed(2)}</span>}
                        {fixture.odds_draw && <span className='text-[9px] text-white/30 bg-white/[0.04] px-1.5 py-0.5 rounded text-right'>D {Number(fixture.odds_draw).toFixed(2)}</span>}
                        {fixture.odds_away && <span className='text-[9px] text-white/30 bg-white/[0.04] px-1.5 py-0.5 rounded text-right'>A {Number(fixture.odds_away).toFixed(2)}</span>}
                      </div>
                    )}
                    <ChevronRight className='w-4 h-4 text-white/15 group-hover:text-primary transition-colors mt-auto' />
                  </div>
                </div>
              </button>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────

export default function Dashboard() {
  const { data: user, isLoading: authLoading, refetch: refetchAuth } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const dateStripRef = useRef(null);

  // ── Payment success: refresh auth ────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.get("payment") === "success") {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      refetchAuth();
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [search]);

  const dates = useMemo(() => Array.from({ length: 7 }).map((_, i) => addDays(new Date(), i)), []);

  // Trial countdown timer
  const [trialHoursRemaining, setTrialHoursRemaining] = useState<number | null>(null);
  const [trialTimeLabel, setTrialTimeLabel] = useState<string>("");
  useEffect(() => {
    if (!user?.trial_ends_at) { setTrialHoursRemaining(null); setTrialTimeLabel(""); return; }
    const updateCountdown = () => {
      const now = new Date();
      const trialEnds = new Date((user as any).trial_ends_at);
      const msRemaining = trialEnds.getTime() - now.getTime();
      const totalHours = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60)));
      setTrialHoursRemaining(totalHours);
      const days = Math.floor(totalHours / 24);
      const hours = totalHours % 24;
      if (totalHours <= 0) setTrialTimeLabel("Expires soon");
      else if (days > 0) setTrialTimeLabel(hours > 0 ? `${days}d ${hours}h left` : `${days}d left`);
      else setTrialTimeLabel(`${hours}h left`);
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 60000);
    return () => clearInterval(interval);
  }, [(user as any)?.trial_ends_at]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      toast({ title: '🎉 Payment confirmed!', description: 'ScorePhantom Premium is now active!', duration: 6000 });
      window.history.replaceState({}, '', '/');
    }
  }, []);

  const [selectedDate, setSelectedDate] = useState(() => {
    try { const s = sessionStorage.getItem("sp_dash_date"); if (s) { const d = new Date(s); if (!isNaN(d.getTime())) return d; } } catch (_) {}
    return dates[0];
  });
  const [showPayBanner, setShowPayBanner] = useState(() => new URLSearchParams(window.location.search).get("payment") === "success");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeGroupTab, setActiveGroupTab] = useState<"all" | "favorites">("all");
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(null);
  const [dailyLimitHit, setDailyLimitHit] = useState(false);

  const formattedDate = format(selectedDate, "yyyy-MM-dd");
  useEffect(() => { try { sessionStorage.setItem("sp_dash_date", selectedDate.toISOString()); } catch (_) {} }, [selectedDate]);
  const { data, isLoading: fixturesLoading } = useFixtures(formattedDate);

  const { data: heroData } = useQuery({ queryKey: ["/api/hero-pick"], queryFn: () => fetchApi("/top-picks-today?limit=1"), enabled: !authLoading, staleTime: 5 * 60 * 1000 });
  const heroPick = (heroData as any)?.picks?.[0] || null;
  const { data: trackData } = useQuery({ queryKey: ["/api/track-strip"], queryFn: () => fetchApi("/track-record?days=30"), enabled: !authLoading, staleTime: 10 * 60 * 1000 });
  const trackStats = (trackData as any)?.overallStats || null;

  const isPremium = user?.access_status === "active" || (user as any)?.subscription_active;
  const isTrial = user?.access_status === "trial";
  const isExpired = user?.access_status === "expired";

  const { data: usageData } = useQuery({
    queryKey: ["/api/usage"],
    queryFn: () => fetchApi("/usage"),
    enabled: isTrial,
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const isDailyLimitHit = dailyLimitHit || (!!usageData && (usageData as any).remaining === 0 && isTrial);

  const groupedFixtures = useMemo(() => {
    if (!data?.fixtures) return {};
    let filtered = data.fixtures;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((f) =>
        f.home_team_name.toLowerCase().includes(q) ||
        f.away_team_name.toLowerCase().includes(q) ||
        (f.tournament_name && f.tournament_name.toLowerCase().includes(q))
      );
    }
    if (activeGroupTab === "favorites") {
      try {
        const favs = JSON.parse((user as any)?.league_favorites || "[]");
        if (Array.isArray(favs) && favs.length > 0) {
           filtered = filtered.filter(f => favs.includes(f.tournament_name));
        } else {
           filtered = [];
        }
      } catch (e) {
         filtered = [];
      }
    }
    return filtered.reduce((acc: any, fixture) => {
      // Group by tournament_id — this is the stable unique key per competition.
      // category_name is used only for the display label, not the group key.
      const groupId = fixture.tournament_id
        ? String(fixture.tournament_id)
        : (fixture.tournament_name || 'Other Competitions');
      const categoryName = (fixture.category_name || '').trim();
      if (!acc[groupId]) {
        acc[groupId] = {
          label: getTournamentLabel(fixture.tournament_name || 'Other Competitions', categoryName),
          fixtures: [],
        };
      }
      acc[groupId].fixtures.push(fixture);
      return acc;
    }, {});
  }, [data?.fixtures, searchQuery]);

  if (authLoading) return <div className="min-h-screen bg-background" />;

  const handleSelectFixture = (id: string) => setLocation("/matches/" + id);
  const handlePredictionError = (code: string) => {
    if (code === "daily_limit_reached") setDailyLimitHit(true);
  };

  const leagues = Object.entries(groupedFixtures).sort(([, a]: any, [, b]: any) => a.label.localeCompare(b.label));
  const allFixtures = data?.fixtures || [];
  const displayName = (user as any)?.username || (user?.email ? user.email.split('@')[0] : 'User');

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20">
      <Header />

      <main className="flex-1 container mx-auto max-w-3xl px-4 pt-4 space-y-4">

        {/* ── Welcome Header ── */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <h1 className="text-xl font-black text-white">
            Welcome back, <span className="text-primary capitalize">{displayName}</span> 👋
          </h1>
          <p className="text-xs text-white/35 mt-0.5">Let's keep the edge going.</p>
        </motion.div>

        {/* ── Payment Success Banner ── */}
        {showPayBanner && (
          <motion.div initial={{ opacity: 0, y: -16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10 }}
            className="relative rounded-2xl overflow-hidden border border-primary/40 p-4 flex items-center gap-4"
            style={{ background: "linear-gradient(135deg,#0c2018 0%,#0a1a12 100%)", boxShadow: "0 0 30px rgba(16,231,116,0.15)" }}>
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent" />
            <div className="w-12 h-12 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
              <span className="text-2xl">🎉</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-primary">Welcome to Premium!</p>
              <p className="text-xs text-white/50 mt-0.5">Your account is fully activated. Enjoy unlimited predictions.</p>
            </div>
            <button onClick={() => setShowPayBanner(false)} className="text-white/20 hover:text-white/50 transition-colors shrink-0 p-1">
              <span className="text-lg leading-none">×</span>
            </button>
          </motion.div>
        )}

        {/* ── Trial/Expired Banners ── */}
        {isExpired && (
          <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-gradient-to-r from-orange-500/10 to-orange-500/5 border border-orange-500/25 cursor-pointer hover:border-orange-500/40 transition-all"
            onClick={() => setLocation("/paywall")}>
            <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center shrink-0"><Lock className="w-4 h-4 text-orange-400" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-orange-400 leading-none mb-0.5">Free Trial Expired</p>
              <p className="text-xs text-white/50">Upgrade to unlock everything</p>
            </div>
            <span className="text-[11px] font-black text-black bg-primary px-3 py-1.5 rounded-xl shrink-0">Unlock All</span>
          </div>
        )}

        {isTrial && (
          <div className={`flex items-center gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all group ${
            isDailyLimitHit || (trialHoursRemaining !== null && trialHoursRemaining <= 2)
              ? 'bg-gradient-to-r from-red-500/10 to-red-500/5 border-red-500/25 hover:border-red-500/40'
              : 'bg-gradient-to-r from-primary/10 to-primary/5 border-primary/25 hover:border-primary/40'
          }`} onClick={() => setLocation("/paywall")}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
              isDailyLimitHit || (trialHoursRemaining !== null && trialHoursRemaining <= 2) ? 'bg-red-500/20' : 'bg-primary/20'
            }`}>
              {isDailyLimitHit ? <Zap className="w-4 h-4 text-red-400" /> : <Crown className="w-4 h-4 text-primary" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-bold leading-none mb-0.5 ${
                isDailyLimitHit || (trialHoursRemaining !== null && trialHoursRemaining <= 2) ? 'text-red-400' : 'text-primary'
              }`}>
                {isDailyLimitHit ? "Predictions used up for today" : "Free Trial Active"}
              </p>
              <p className="text-xs text-white/50 flex flex-wrap gap-x-1.5">
                {usageData && <span className={
                  usageData.remaining === 0 ? "text-red-400 font-semibold" :
                  usageData.remaining <= 1 ? "text-orange-400 font-semibold" :
                  "text-white/80 font-semibold"
                }>{usageData.remaining}/{usageData.limit} left</span>}
                {trialHoursRemaining !== null && <span>· {trialTimeLabel}</span>}
              </p>
            </div>
            <span className={`text-[11px] font-black text-black px-3 py-1.5 rounded-xl shrink-0 ${
              isDailyLimitHit ? 'bg-red-400' : 'bg-primary'
            }`}>{isDailyLimitHit ? "Unlock" : "Upgrade"}</span>
          </div>
        )}

        {/* ── Today's Best Bet ── */}
        {heroPick && <TodaysBestBet pick={heroPick} onView={() => setLocation("/matches/" + heroPick.fixtureId)} />}

        {/* ── Quick Actions ── */}
        <QuickActions
          onTopPicks={() => setLocation("/picks")}
          onAcca={() => setLocation("/acca")}
          onLive={() => { setSelectedDate(dates[0]); }}
          onValueBets={() => setLocation("/picks")}
        />

        {/* ── Your Stats ── */}
        {trackStats && trackStats.totalPicks > 0 && (
          <YourStats stats={trackStats} onView={() => setLocation("/track-record")} />
        )}

        {/* ── Value Bet of the Day ── */}
        <ValueBetCard isPremium={isPremium} />

        {/* ── ACCA Section ── */}
        <AccaSection isPremium={isPremium} />

        {/* ── Upcoming Fixtures (horizontal scroll) ── */}
        <UpcomingFixtures fixtures={allFixtures} onSelect={handleSelectFixture} />

        {/* ── Date Strip ── */}
        <div ref={dateStripRef} className="flex gap-2 overflow-x-auto hide-scrollbar pb-2 snap-x">
          {dates.map((date) => {
            const isSelected = isSameDay(date, selectedDate);
            return (
              <button
                key={date.toISOString()}
                onClick={() => setSelectedDate(date)}
                className={cn(
                  "snap-start shrink-0 min-w-[66px] flex flex-col items-center justify-center p-2.5 rounded-xl border transition-all",
                  isSelected
                    ? "bg-gradient-to-b from-primary/15 to-primary/5 border-primary/30 text-primary glow-primary"
                    : "bg-white/[0.02] border-white/[0.05] text-white/35 hover:bg-white/[0.04]"
                )}
              >
                <span className="text-[10px] font-bold tracking-widest uppercase mb-1">{format(date, "EEE")}</span>
                <span className="font-display text-2xl leading-none">{format(date, "dd")}</span>
              </button>
            );
          })}
        </div>

        {/* ── Tabs & Search ── */}
        <div className="flex gap-2 p-1 bg-white/[0.02] rounded-xl mt-4">
          <button onClick={() => setActiveGroupTab("all")} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${activeGroupTab === "all" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"}`}>All Matches</button>
          <button onClick={() => setActiveGroupTab("favorites")} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${activeGroupTab === "favorites" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"}`}>My Leagues</button>
        </div>
        <div className="relative mt-2">
          <Search className="absolute left-4 top-3.5 h-4 w-4 text-white/25" />
          <Input
            placeholder="Search teams or leagues..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-11 h-11 bg-white/[0.03] border-white/[0.06] rounded-xl text-sm placeholder:text-white/20"
          />
        </div>

        {/* ── Fixtures count ── */}
        {data && ((data as any).total > 0) && (
          <div className="flex items-center gap-2 px-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_5px_#34d399] shrink-0" />
            <span className="text-[11px] text-white/30">
              <span className="text-emerald-400 font-semibold">{(data as any).total ?? 0}</span> fixtures today
            </span>
          </div>
        )}

        {/* ── Fixtures by League ── */}
        <div className="space-y-4">
          {fixturesLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-20 w-full rounded-2xl" />
                <Skeleton className="h-20 w-full rounded-2xl" />
              </div>
            ))
          ) : leagues.length === 0 ? (
            <div className="text-center py-20 text-white/25 space-y-3">
              <Trophy className="w-12 h-12 mx-auto opacity-20" />
              <p className="font-medium">No fixtures for {format(selectedDate, 'MMM d')}.</p>
              <p className="text-xs opacity-60">{isSameDay(selectedDate, dates[0]) ? 'Fixtures loading — check back soon.' : 'No matches scheduled.'}</p>
            </div>
          ) : (
            leagues.map(([groupId, group]: [string, any], idx) => (
              <LeagueGroup
                key={groupId}
                tournament={group.label}
                fixtures={group.fixtures}
                onSelectFixture={handleSelectFixture}
                defaultOpen={idx < 2}
                isPremium={isPremium}
              />
            ))
          )}
        </div>
      </main>

      <PredictionPanel
        fixtureId={selectedFixtureId}
        onClose={() => setSelectedFixtureId(null)}
        onError={handlePredictionError}
        limitReached={isDailyLimitHit}
      />
    </div>
  );
}
