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
import { useScrollRestoration } from "@/hooks/use-scroll-restoration";
import { TeamLogo } from "@/components/TeamLogo";
import { TodaysBestBet } from "@/components/dashboard/TodaysBestBet";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { YourStats } from "@/components/dashboard/YourStats";
import { ValueBetCard } from "@/components/dashboard/ValueBetCard";
import { UpcomingFixtures } from "@/components/dashboard/UpcomingFixtures";
import { AccaSection } from "@/components/dashboard/AccaSection";
import { EnrichmentBadge } from "@/components/dashboard/EnrichmentBadge";
import { LeagueGroup } from "@/components/dashboard/LeagueGroup";

// ── Helpers ──────────────────────────────────────────────────────────────────

function toWAT(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-NG', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', hour12: false });
  } catch { return ''; }
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



// ── Quick Action Cards ──────────────────────────────────────────────────────



// ── Your Stats Card ─────────────────────────────────────────────────────────



// ── Value Bet of the Day ────────────────────────────────────────────────────



// ── Upcoming Fixtures Horizontal Scroll ─────────────────────────────────────



// ── ACCA Section ────────────────────────────────────────────────────────────



// ── League Group ────────────────────────────────────────────────────────────





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
  const heroPick = (heroData as any)?.picks?.[0] || null;
  const { data: trackData } = useQuery({ queryKey: ["/api/track-strip"], queryFn: () => fetchApi("/track-record?days=30"), enabled: !authLoading, staleTime: 10 * 60 * 1000 });
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
      filtered = filtered.filter((f: any) => ['LIVE', 'HT', '1H', '2H', 'ET', 'PEN', 'inprogress', '1st_half', 'halftime', '2nd_half'].includes(f.match_status?.toUpperCase() || f.match_status || ''));
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

  const handleSelectFixture = (id: string) => {
    setLocation("/matches/" + id);
  };
  const handlePredictionError = (code: string) => {
    if (code === "daily_limit_reached") setDailyLimitHit(true);
  };

  const leagues = Object.entries(groupedFixtures).sort(([, a]: any, [, b]: any) => a.label.localeCompare(b.label));
  const allFixtures = data?.fixtures || [];
  const displayName = (user as any)?.username || (user?.email ? user.email.split('@')[0] : 'User');

  return (
    <div className="flex flex-col min-h-screen bg-[#060a0e] text-white pb-24 selection:bg-primary/30 relative">
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80vw] h-[50vh] bg-primary/5 blur-[120px] opacity-50 rounded-full mix-blend-screen" />
      </div>
      
      <Header />
      
      {/* Main Content Area */}
      <main className="flex-1 container mx-auto max-w-3xl px-4 pt-4 space-y-4 relative z-10">

        {/* ── Welcome Header ── */}
        <motion.div 
          initial={{ opacity: 0, y: 8 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.3 }}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/[0.02] border border-white/[0.05] p-5 rounded-3xl"
        >
          <div>
            <h1 className="text-xl font-black text-white tracking-tight">
              Welcome back, <span className="text-primary capitalize">{displayName}</span> 👋
            </h1>
            <p className="text-xs text-white/50 mt-1">Here are today's highest value edges</p>
          </div>
          
          <div className="relative w-full sm:w-64 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input 
              type="text" 
              placeholder="Search teams or leagues..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#0a110d] border border-white/[0.05] rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-primary/30 focus:ring-1 focus:ring-primary/30 transition-all"
            />
          </div>
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
          onLive={() => {
            setSelectedDate(dates[0]);
            setActiveGroupTab("live");
            document.getElementById('fixtures-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
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
        <div ref={dateStripRef} className="flex gap-2 overflow-x-auto hide-scrollbar pb-2 touch-pan-x overscroll-x-contain">
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

        {/* ── Tabs ── */}
          <div id="fixtures-list" className="flex bg-black/40 backdrop-blur-md rounded-xl p-1.5 border border-white/5 shadow-lg overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory">
            <button onClick={() => setActiveGroupTab("all")} className={`shrink-0 px-4 py-2 text-[11px] uppercase tracking-wider font-bold rounded-lg transition-all ${activeGroupTab === "all" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"}`}>All</button>
            <button onClick={() => setActiveGroupTab("live")} className={`shrink-0 px-4 py-2 text-[11px] uppercase tracking-wider font-bold rounded-lg transition-all ${activeGroupTab === "live" ? "bg-red-500/20 text-red-400" : "text-white/40 hover:text-white/70"}`}>Live</button>
            <button onClick={() => setActiveGroupTab("favorites")} className={`shrink-0 px-4 py-2 text-[11px] uppercase tracking-wider font-bold rounded-lg transition-all ${activeGroupTab === "favorites" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"}`}>My Leagues</button>
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
              <p className="font-medium">
                {activeGroupTab === "live" ? "No live matches right now." :
                 activeGroupTab === "favorites" ? "None of your favorite leagues have matches today." :
                 `No fixtures for ${format(selectedDate, 'MMM d')}.`}
              </p>
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
