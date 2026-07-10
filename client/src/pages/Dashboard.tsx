import { useState, useMemo, useEffect, useRef } from "react";
import { format, addDays, isSameDay } from "date-fns";
import { useAccess } from "@/hooks/use-access";
import { useFixtures } from "@/hooks/use-fixtures";
import { Header } from "@/components/layout/Header";
import { PredictionPanel } from "@/components/prediction/PredictionPanel";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfidenceRing } from "@/components/ui/ConfidenceRing";
import { ConfidenceBadge, getConfidenceTier } from "@/components/ui/ConfidenceBadge";
import { CountdownTimer } from "@/components/ui/CountdownTimer";
import {
  ChevronRight, ChevronDown, Search, Trophy, Crown, Zap, Lock, Flame, TrendingUp
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation, useSearch } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { useScrollRestoration } from "@/hooks/use-scroll-restoration";
import { TeamLogo } from "@/components/TeamLogo";
import { LeagueGroup } from "@/components/dashboard/LeagueGroup";
import { EnrichmentBadge } from "@/components/dashboard/EnrichmentBadge";
import { SmartEdge } from "@/components/dashboard/SmartEdge";
import { PageLoader } from "@/components/ui/PageLoader";
import { ErrorState } from "@/components/ui/ErrorState";

// ── Helpers ──────────────────────────────────────────────────────────────────

function toWAT(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-NG', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', hour12: false });
  } catch { return ''; }
}

const VENUE_KEYWORDS = ['park', 'stadium', 'arena', 'ground', 'road', 'lane', 'parc', 'stade', 'estadio', 'field', 'dome'];
function looksLikeVenue(s: string): boolean {
  const lower = s.toLowerCase();
  return VENUE_KEYWORDS.some(kw => lower.includes(kw));
}
function getTournamentLabel(tournamentName: string, categoryName?: string | null): string {
  if (!tournamentName) return 'Other Competitions';
  const country = (categoryName || '').trim();
  if (!country || country.toLowerCase() === 'other' || country.toLowerCase() === tournamentName.toLowerCase() || looksLikeVenue(country)) {
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

// ── Main Dashboard ─────────────────────────────────────────────────────────

export default function Dashboard() {
  const { isPremium, user, isLoading: authLoading, refetch: refetchAuth } = useAccess();
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
        toast({ title: '🎉 Payment confirmed!', description: 'ScorePhantom Premium is now active!', duration: 6000 });
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }, [search, queryClient, refetchAuth, toast]);

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

  const [selectedDate, setSelectedDate] = useState(() => {
      try { const s = sessionStorage.getItem("sp_dash_date"); if (s) { const d = new Date(s); if (!isNaN(d.getTime())) return d; } } catch (_) {}
      return dates[0];
    });
  const [showPayBanner, setShowPayBanner] = useState(() => new URLSearchParams(window.location.search).get("payment") === "success");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeGroupTab, setActiveGroupTab] = useState<"all" | "favorites" | "live">("all");
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(null);
  const [dailyLimitHit, setDailyLimitHit] = useState(false);

  const formattedDate = format(selectedDate, "yyyy-MM-dd");
  useEffect(() => { try { sessionStorage.setItem("sp_dash_date", selectedDate.toISOString()); } catch (_) {} }, [selectedDate]);
  const { data, isLoading: fixturesLoading } = useFixtures(formattedDate);

  useScrollRestoration("dashboard", !fixturesLoading && !authLoading);

  const { data: heroData } = useQuery({ queryKey: ["/api/hero-pick"], queryFn: () => fetchApi("/top-picks-today?limit=1"), enabled: !authLoading, staleTime: 5 * 60 * 1000 });
  // BUG FIX: Don't show hero card if the top pick is AVOID — showing an AVOID pick
  // as "Top Pick" with green glow is contradictory and confuses users.
  const rawHeroPick = (heroData as any)?.picks?.[0] || null;
  const heroPick = rawHeroPick && rawHeroPick.advisor_status !== 'AVOID' && rawHeroPick.advisor_status !== 'SKIP' && rawHeroPick.valueTier !== 'JUNK' && rawHeroPick.valueTier !== 'NEGATIVE_EV'
    ? rawHeroPick : null;
  const { data: trackData } = useQuery({ queryKey: ["/api/track-strip"], queryFn: () => fetchApi("/track-record?days=30&sport=football"), enabled: !authLoading, staleTime: 10 * 60 * 1000 });
  const trackStats = (trackData as any)?.overallStats || null;

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
    if (activeGroupTab === "live") {
      // BUG FIX: Normalize all API status values to uppercase for comparison.
      // The old code uppercased the match_status but the comparison array had mixed case
      // ('inprogress', '1st_half', etc.) which never matched after toUpperCase().
      const LIVE_STATUSES_UPPER = ['LIVE', 'HT', '1H', '2H', 'ET', 'PEN', 'INPROGRESS', '1ST_HALF', 'HALFTIME', '2ND_HALF'];
      filtered = filtered.filter((f: any) => LIVE_STATUSES_UPPER.includes((f.match_status || '').toUpperCase()));
    } else if (activeGroupTab === "favorites") {
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
  }, [data?.fixtures, searchQuery, activeGroupTab]);

  if (authLoading) return <PageLoader variant="dashboard" count={4} />;

  const handleSelectFixture = (id: string) => {
    setLocation("/matches/" + id);
  };
  const handlePredictionError = (code: string) => {
    if (code === "daily_limit_reached") setDailyLimitHit(true);
  };

  const leagues = Object.entries(groupedFixtures).sort(([, a]: any, [, b]: any) => a.label.localeCompare(b.label));
  const allFixtures = data?.fixtures || [];
  const displayName = (user as any)?.username || (user?.email ? user.email.split('@')[0] : 'User');
  const liveCount = allFixtures.filter((f: any) => ['LIVE', 'HT', '1H', '2H'].includes(f.match_status?.toUpperCase?.() || '')).length;

  return (
    <div className="flex flex-col min-h-screen bg-[#060a0e] text-white pb-24 selection:bg-accent-blue/30 relative">
      {/* Ambient backdrop — soft blue/green wash for depth */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[50vh] bg-accent-blue/[0.04] blur-[120px] opacity-60 rounded-full mix-blend-screen" />
      </div>

      <Header />

      <main className="flex-1 container mx-auto max-w-2xl xl:max-w-3xl px-4 pt-5 space-y-6 relative z-10">

        {/* ── Welcome Strip — clear hierarchy: greeting (text-2xl) + subtext (text-sm/white-50) ── */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-black text-white tracking-tight leading-tight">
                Hey, <span className="text-accent-blue capitalize">{displayName}</span>
              </h1>
              <p className="text-sm text-white/50 mt-1">
                {allFixtures.length} matches today{liveCount > 0 ? ` · ${liveCount} live` : ''}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {trackStats?.hitRate && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent-blue/10 border border-accent-blue/20">
                  <TrendingUp className="w-3.5 h-3.5 text-accent-blue" />
                  <span className="text-xs font-bold text-accent-blue">{(trackStats.hitRate * 100).toFixed(0)}%</span>
                </div>
              )}
              <button onClick={() => setLocation("/picks")} className="interactive-card flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-white/60 hover:text-white/90">
                <Flame className="w-3.5 h-3.5 text-accent-orange" />
                <span className="text-xs font-bold">Picks</span>
              </button>
            </div>
          </div>
        </motion.div>

        {/* ── Trial/Expired/Payment Inline Alerts — amber for trial status (color discipline) ── */}
        <AnimatePresence>
          {showPayBanner && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-3 p-3 rounded-2xl bg-accent-blue/8 border border-accent-blue/20">
              <span className="text-lg">🎉</span>
              <p className="text-sm font-bold text-accent-blue flex-1">Premium activated!</p>
              <button onClick={() => setShowPayBanner(false)} className="text-white/20 hover:text-white/50 text-base">×</button>
            </motion.div>
          )}
          {isExpired && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="interactive-card flex items-center gap-3 p-3 rounded-2xl bg-accent-orange/8 border border-accent-orange/20 cursor-pointer"
              onClick={() => setLocation("/paywall")}>
              <Lock className="w-4 h-4 text-accent-orange shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-accent-orange">Trial expired</p>
              </div>
              <span className="text-2xs font-black text-black bg-primary px-2.5 py-1 rounded-lg shrink-0">Upgrade</span>
            </motion.div>
          )}
          {isTrial && !isExpired && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="interactive-card flex items-center gap-3 p-3 rounded-2xl bg-accent-orange/6 border border-accent-orange/15 cursor-pointer"
              onClick={() => setLocation("/paywall")}>
              <Crown className="w-4 h-4 text-accent-orange shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white/70">
                  {usageData && <span className="font-bold text-white/90">{(usageData as any).remaining}/{(usageData as any).limit} picks left</span>}
                  {trialTimeLabel && <span> · {trialTimeLabel}</span>}
                </p>
              </div>
              <span className="text-2xs font-black text-black bg-primary px-2.5 py-1 rounded-lg shrink-0">Upgrade</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Today's Top Pick — Featured confidence card (green = confidence indicator) ── */}
        {heroPick && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="relative w-full rounded-2xl overflow-hidden"
          >
            {/* Cinematic green glow backdrop — green reserved for confidence context */}
            <div className="absolute inset-0 z-0">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent" />
              {/* Diagonal light streaks */}
              <div className="absolute -top-10 -right-10 w-[200%] h-[200%] opacity-[0.07]" style={{
                background: 'repeating-linear-gradient(135deg, transparent, transparent 40px, rgba(16,231,116,0.3) 40px, rgba(16,231,116,0.3) 42px)',
              }} />
              <div className="absolute bottom-0 left-0 w-[60%] h-[80%] bg-primary/10 blur-[60px] rounded-full" />
              <div className="absolute top-0 right-[20%] w-[40%] h-[60%] bg-primary/8 blur-[50px] rounded-full" />
            </div>

            <button
              onClick={() => setLocation("/matches/" + heroPick.fixtureId)}
              className="interactive-card relative z-10 w-full text-left p-6 border border-primary/15 rounded-2xl backdrop-blur-sm"
            >
              {/* Top bar: label + dismiss */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-primary" />
                  <span className="text-2xs font-black uppercase tracking-[0.2em] text-primary">Top Pick</span>
                </div>
                <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-white/20 text-xs hover:bg-white/10 transition-colors" onClick={(e) => { e.stopPropagation(); }}>
                  ×
                </div>
              </div>

              {/* Content: match info + confidence ring */}
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-3">
                  <p className="text-lg font-black text-white leading-tight">{heroPick.homeTeam} vs {heroPick.awayTeam}</p>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-sm font-bold text-white/90">
                    {heroPick.pick}
                    <ChevronRight className="w-3.5 h-3.5 text-white/40" />
                  </span>
                </div>

                {/* Large circular confidence gauge — green ring (confidence indicator) */}
                <div className="shrink-0 flex flex-col items-center">
                  <div className="relative w-[72px] h-[72px]">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 72 72">
                      <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
                      <circle
                        cx="36" cy="36" r="30" fill="none"
                        stroke="url(#confGrad)"
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeDasharray={`${(heroPick.confidence / 100) * 188.5} 188.5`}
                      />
                      <defs>
                        <linearGradient id="confGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#10e774" />
                          <stop offset="100%" stopColor="#0bc95f" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-xl font-black text-white leading-none tabular-nums">{heroPick.confidence}%</span>
                    </div>
                  </div>
                  <span className="text-2xs font-bold text-white/40 uppercase tracking-widest mt-1.5">Conf.</span>
                </div>
              </div>
            </button>
          </motion.div>
        )}

        {/* ── Smart Edge — Model vs Market value detector (new feature) ── */}
        {/* Surfaces the top 5 picks ranked by EDGE (model prob − bookmaker implied),
            giving users a different lens from TopPicks (which ranks by composite score). */}
        <SmartEdge />

        {/* ── Date Strip — blue for selected/today (color discipline) ── */}
        <div ref={dateStripRef} className="flex gap-2 overflow-x-auto hide-scrollbar pb-1 touch-pan-x overscroll-x-contain -mx-1 px-1">
          {dates.map((date) => {
            const isSelected = isSameDay(date, selectedDate);
            const isToday = isSameDay(date, new Date());
            return (
              <button
                key={date.toISOString()}
                onClick={() => setSelectedDate(date)}
                className={cn(
                  "interactive snap-start shrink-0 min-w-[60px] flex flex-col items-center justify-center py-2.5 px-3 rounded-xl border transition-all",
                  isSelected
                    ? "bg-accent-blue/15 border-accent-blue/30 text-accent-blue"
                    : "bg-white/[0.02] border-white/[0.04] text-white/40 hover:bg-white/[0.04] hover:text-white/60"
                )}
              >
                <span className="text-2xs font-bold tracking-widest uppercase">{isToday ? 'Today' : format(date, "EEE")}</span>
                <span className="text-lg font-black leading-none mt-1 tabular-nums">{format(date, "dd")}</span>
              </button>
            );
          })}
        </div>

        {/* ── Search + Filter Bar — type scale + blue for active "all/fav" tab ── */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" />
            <input
              type="text"
              placeholder="Search teams or leagues..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/[0.03] border border-white/[0.05] rounded-xl pl-8 pr-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-accent-blue/30 transition-all"
            />
          </div>
          <div className="flex items-center gap-0.5 rounded-xl border border-white/[0.05] bg-white/[0.02] p-0.5 shrink-0">
            {([
              { key: "all" as const, label: "All" },
              { key: "live" as const, label: "Live" },
              { key: "favorites" as const, label: "Fav" },
            ]).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveGroupTab(tab.key)}
                className={cn(
                  "px-3 py-1.5 rounded-[10px] text-2xs font-bold uppercase tracking-wider transition-all",
                  activeGroupTab === tab.key
                    ? tab.key === "live" ? "bg-red-500/15 text-red-400" : "bg-accent-blue/15 text-accent-blue"
                    : "text-white/30 hover:text-white/60"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Fixture Count — informational, blue accent (not green) ── */}
        {allFixtures.length > 0 && (
          <div className="flex items-center gap-2 px-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-blue shadow-[0_0_6px_rgba(33,150,243,0.5)] shrink-0" />
            <span className="text-sm text-white/50">
              <span className="text-white font-bold">{allFixtures.length}</span> fixtures · {format(selectedDate, "EEEE, MMM d")}
            </span>
          </div>
        )}

        {/* ── Fixtures by League — subtle separation between groups ── */}
        <div className="space-y-5">
          {fixturesLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-3 pb-4 border-b border-white/[0.04]">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-16 w-full rounded-2xl" />
                <Skeleton className="h-16 w-full rounded-2xl" />
              </div>
            ))
          ) : leagues.length === 0 ? (
            <div className="text-center py-16 text-white/25 space-y-3">
              <Trophy className="w-10 h-10 mx-auto opacity-30" />
              <p className="text-base font-medium">
                {activeGroupTab === "live" ? "No live matches right now." :
                 activeGroupTab === "favorites" ? "No favorite league matches today." :
                 `No fixtures for ${format(selectedDate, 'MMM d')}.`}
              </p>
              <p className="text-sm text-white/35">{isSameDay(selectedDate, dates[0]) ? 'Check back soon.' : 'Try another date.'}</p>
            </div>
          ) : (
            leagues.map(([groupId, group]: [string, any]) => (
              <div key={groupId} className="pb-4 border-b border-white/[0.04] last:border-b-0">
                <LeagueGroup
                  tournament={group.label}
                  tournamentId={groupId}
                  fixtures={group.fixtures}
                  onSelectFixture={handleSelectFixture}
                  defaultOpen={false}
                  isPremium={isPremium}
                />
              </div>
            ))
          )}
        </div>

        {/* ── Bottom Quick Links — interactive cards, blue accent for track record ── */}
        {!fixturesLoading && leagues.length > 0 && (
          <div className="grid grid-cols-2 gap-2 pt-2">
            <button onClick={() => setLocation("/picks")} className="interactive-card flex items-center gap-2 p-3 rounded-xl bg-white/[0.025] border border-white/[0.04] text-white/50 hover:text-white/85">
              <Flame className="w-4 h-4 text-accent-orange" />
              <span className="text-sm font-bold">Today's Best Picks</span>
            </button>
            <button onClick={() => setLocation("/track-record")} className="interactive-card flex items-center gap-2 p-3 rounded-xl bg-white/[0.025] border border-white/[0.04] text-white/50 hover:text-white/85">
              <TrendingUp className="w-4 h-4 text-accent-blue" />
              <span className="text-sm font-bold">Track Record</span>
            </button>
          </div>
        )}
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
