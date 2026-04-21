import { useState, useRef, useEffect, lazy, Suspense, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchApi } from "@/lib/api";
import { useAccess } from "@/hooks/use-access";
import { motion, AnimatePresence } from "framer-motion";
import { X, Target, BarChart2, MessageCircle, Send, Bot, Zap, TrendingUp, Trophy, ChevronRight, Lock, Share2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfidenceRing } from "@/components/ui/ConfidenceRing";
import { ConfidenceBadge, getConfidenceTier } from "@/components/ui/ConfidenceBadge";
import { TeamLogo } from "@/components/TeamLogo";

const PredictionTab = lazy(() => import("@/components/match/PredictionTab").then(m => ({ default: m.PredictionTab })));
const StatsTab = lazy(() => import("@/components/match/StatsTab").then(m => ({ default: m.StatsTab })));
const LeagueTab = lazy(() => import("@/components/match/LeagueTab").then(m => ({ default: m.LeagueTab })));
const PitchTab = lazy(() => import("@/components/match/PitchTab").then(m => ({ default: m.PitchTab })));
const LineupsTab = lazy(() => import("@/components/match/LineupsTab").then(m => ({ default: m.LineupsTab })));
const PhantomChatTab = lazy(() => import("@/components/match/PhantomChatTab").then(m => ({ default: m.PhantomChatTab })));

// ── Helpers ──────────────────────────────────────────────────────────────────

export function SpiralWatermark() {
  return (
    <svg width="110" height="110" viewBox="0 0 110 110" fill="none"
      className="absolute top-3 right-3 opacity-[0.06] pointer-events-none text-primary">
      <circle cx="55" cy="55" r="50" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="55" cy="55" r="38" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="55" cy="55" r="27" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="55" cy="55" r="16" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="55" cy="55" r="6" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="55" cy="55" r="2" fill="currentColor" />
    </svg>
  );
}

const TABS = [
  { key: "Prediction", label: "Prediction", Icon: Target },
  { key: "Stats", label: "Stats", Icon: BarChart2 },
  { key: "Pitch", label: "Pitch", Icon: Target },
  { key: "Lineups", label: "Lineups", Icon: Users },
  { key: "League", label: "League", Icon: Trophy },
  { key: "PhantomChat", label: "PhantomChat", Icon: MessageCircle },
];


// ── Prediction Tab ──────────────────────────────────────────────────────────



// ── Stats Tab ───────────────────────────────────────────────────────────────



// ── League Tab ──────────────────────────────────────────────────────────────



// ── Pitch Tab ────────────────────────────────────────────────────────────────


// ── Lineups Tab ───────────────────────────────────────────────────────────────


// ── PhantomChat Tab ─────────────────────────────────────────────────────────



// ── Main MatchCenter ────────────────────────────────────────────────────────

export default function MatchCenter() {
  const params = useParams();
  const fixtureId = params?.id;
  const [, setLocation] = useLocation();
  const { user, isPremium, isLoading: authLoading } = useAccess();
  const [tab, setTab] = useState("Prediction");

  // Scroll to top when MatchCenter loads
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const { data, isLoading } = useQuery({
      queryKey: ["/api/matches", fixtureId],
      queryFn: () => fetchApi("/matches/" + fixtureId),
      staleTime: 30 * 1000,
      enabled: !!fixtureId,
    });
  const d = data as any;
  const fix = d?.fixture || {};
  const isLive = ["LIVE", "HT", "1H", "2H", "ET", "PEN"].includes(fix.match_status || "");
  const isFT = ["FT", "AET", "Pen"].includes(fix.match_status || "");
  const matchTime = fix.match_date
      ? new Date(fix.match_date).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
      : "";

    // Get standings position
    const { homePos, awayPos } = useMemo(() => {
      const st = Array.isArray(d?.standings) ? d.standings : Array.isArray(d?.meta?.standings) ? d.meta.standings : [];
      const home = st.find((r: any) => (r.team || "").toLowerCase().includes((fix.home_team_name || "").toLowerCase().split(" ")[0]));
      const away = st.find((r: any) => (r.team || "").toLowerCase().includes((fix.away_team_name || "").toLowerCase().split(" ")[0]));
      return { homePos: home, awayPos: away };
    }, [d?.standings, d?.meta?.standings, fix.home_team_name, fix.away_team_name]);

    return (
    <div className="flex flex-col min-h-screen bg-[#060a0e] text-white pb-24 selection:bg-primary/30 relative">
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80vw] h-[50vh] bg-primary/5 blur-[120px] opacity-50 rounded-full mix-blend-screen" />
      </div>

      {/* ── MATCH HEADER ── */}
      <div className="sticky top-0 z-50 bg-[#060a0e]/80 backdrop-blur-xl border-b border-white/[0.02] px-4 pt-4 pb-0 relative">
        {/* Back + close */}
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => window.history.back()}
            className="flex items-center gap-1.5 text-white/40 hover:text-white transition-colors">
            <span className="text-lg">←</span>
            <span className="text-xs font-bold">Back</span>
          </button>
          <button onClick={() => window.history.back()}
            className="w-8 h-8 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center shrink-0">
            <X size={14} className="text-white/40" />
          </button>
        </div>

        {/* Tournament + time info */}
        <p className="text-[10px] text-white/25 mb-3">
          {fix.tournament_name || ""}{matchTime ? " · Today, " + matchTime : ""}
        </p>

        {/* ── TEAM CRESTS ── */}
        <div className="flex items-center justify-center gap-6 mb-4">
          {/* Home */}
          <div className="flex flex-col items-center gap-1.5">
            <TeamLogo src={fix.home_team_logo} name={fix.home_team_name || "Home"} size="lg" />
            <span className="text-sm font-black text-white">{(fix.home_team_name || "Home").slice(0, 3).toUpperCase()}</span>
            {homePos && (
              <span className="text-[9px] text-white/30">{homePos.position}th · {homePos.points} PTS</span>
            )}
          </div>

          {/* Score / VS */}
          <div className="flex flex-col items-center">
            {(isLive || isFT) ? (
              <>
                <span className="text-3xl font-black text-white tabular-nums">
                  {fix.home_score ?? 0} - {fix.away_score ?? 0}
                </span>
                {isLive && (
                  <div className="flex flex-col items-center mt-1 gap-1">
                    <span className="text-xs font-black text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full animate-pulse">● LIVE {fix.live_minute ? `${fix.live_minute}'` : ''}</span>
                    {d?.meta?.matchStats?.home_xg_live != null && (
                      <span className="text-[10px] text-white/50 font-medium">xG: {Number(d.meta.matchStats.home_xg_live).toFixed(2)} - {Number(d.meta.matchStats.away_xg_live ?? 0).toFixed(2)}</span>
                    )}
                  </div>
                )}
                {isFT && <span className="text-xs font-bold text-white/25 bg-white/[0.04] px-2 py-0.5 rounded-full mt-1">FT</span>}
              </>
            ) : (
              <span className="text-lg font-bold text-white/20">vs</span>
            )}
          </div>

          {/* Away */}
          <div className="flex flex-col items-center gap-1.5">
            <TeamLogo src={fix.away_team_logo} name={fix.away_team_name || "Away"} size="lg" />
            <span className="text-sm font-black text-white">{(fix.away_team_name || "Away").slice(0, 3).toUpperCase()}</span>
            {awayPos && (
              <span className="text-[9px] text-white/30">{awayPos.position}th · {awayPos.points} PTS</span>
            )}
          </div>
        </div>

        {/* ── TABS ── */}
        <div className="flex border-b border-white/[0.06] overflow-x-auto scrollbar-hide touch-pan-x overscroll-x-contain">
          {TABS.map(({ key, label, Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className={cn("flex items-center gap-1.5 px-4 py-3 text-sm font-bold transition-all border-b-2 -mb-px shrink-0 whitespace-nowrap",
                tab === key ? "text-primary border-primary" : "text-white/30 border-transparent hover:text-white/50")}>
              <Icon size={13} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── TAB CONTENT ── */}
      {isLoading && (
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
        </div>
      )}
      {!isLoading && (
          <div className="flex-1 w-full max-w-lg mx-auto px-4 pt-5 relative z-10">
            <AnimatePresence mode="wait">
              <motion.div key={tab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}>
                <Suspense fallback={<div className="flex justify-center py-20"><div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" /></div>}>
                  {tab === "Prediction" && <PredictionTab fixtureId={fixtureId} isPremium={isPremium} setLocation={setLocation} matchData={d} />}
                  {tab === "Stats" && <StatsTab d={d} />}
                  {tab === "Pitch" && <PitchTab matchData={d} />}
                  {tab === "Lineups" && <LineupsTab matchData={d} />}
                  {tab === "League" && <LeagueTab d={d} />}
                  {tab === "PhantomChat" && <PhantomChatTab fixtureId={fixtureId} isPremium={isPremium} setLocation={setLocation} />}
                </Suspense>
              </motion.div>
            </AnimatePresence>
          </div>
        )}
    </div>
  );
}
