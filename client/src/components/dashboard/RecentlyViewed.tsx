import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { History, ChevronRight, X } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { cn } from "@/lib/utils";

/**
 * RecentlyViewed — horizontal strip showing matches the user recently opened.
 *
 * Appears on the Dashboard below the date strip. Clicking a card navigates back
 * to that match's prediction. Includes a clear-all button.
 *
 * Purely client-side (localStorage) — no backend dependency.
 */

function timeAgo(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function RecentlyViewed() {
  const [, setLocation] = useLocation();
  const { recentlyViewed, clearRecentlyViewed } = useRecentlyViewed();

  // Don't render anything if empty (no recently viewed matches)
  if (recentlyViewed.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="space-y-2.5"
    >
      {/* ── Section header ── */}
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-2">
          <div className="relative">
            <History className="w-3.5 h-3.5 text-white/50" />
          </div>
          <h2 className="text-sm font-black text-white/70 tracking-wide uppercase">
            Recently Viewed
          </h2>
          <span className="text-2xs font-bold text-white/25 bg-white/5 px-1.5 py-0.5 rounded-md">
            {recentlyViewed.length}
          </span>
        </div>
        <button
          onClick={clearRecentlyViewed}
          className="flex items-center gap-1 text-2xs font-bold text-white/30 hover:text-white/60 transition-colors"
          aria-label="Clear recently viewed"
        >
          <X size={11} />
          Clear
        </button>
      </div>

      {/* ── Horizontal scroll strip ── */}
      <div className="flex gap-2 overflow-x-auto hide-scrollbar touch-pan-x overscroll-x-contain -mx-1 px-1 pb-1">
        {recentlyViewed.map((item) => {
          const prob = item.probability != null ? Math.round(item.probability * 100) : null;
          return (
            <motion.button
              key={item.fixtureId}
              whileTap={{ scale: 0.97 }}
              onClick={() => setLocation("/matches/" + item.fixtureId)}
              className="interactive-card shrink-0 w-[180px] text-left rounded-2xl border border-white/6 bg-white/[0.025] p-2.5 transition-all hover:border-white/12 hover:bg-white/[0.04] relative group"
            >
              {/* Time ago badge */}
              <span className="absolute top-2 right-2 text-[9px] font-medium text-white/25 tabular-nums">
                {timeAgo(item.viewedAt)}
              </span>

              {/* Match name + logos */}
              <div className="flex items-center gap-1.5 mb-2 min-w-0 pr-10">
                <TeamLogo src={item.homeLogo} name={item.homeTeam} size="xs" />
                <span className="text-2xs font-bold text-white/80 truncate">{item.homeTeam}</span>
                <span className="text-2xs text-white/25 shrink-0">v</span>
                <TeamLogo src={item.awayLogo} name={item.awayTeam} size="xs" />
                <span className="text-2xs font-bold text-white/80 truncate">{item.awayTeam}</span>
              </div>

              {/* Pick + probability */}
              {item.pick ? (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-primary/10 border border-primary/15 text-2xs font-bold text-primary truncate flex-1 min-w-0">
                    <span className="truncate">{item.pick}</span>
                  </span>
                  {prob != null && (
                    <span className="text-2xs font-bold text-white/40 tabular-nums shrink-0">{prob}%</span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <span className="text-2xs font-medium text-white/20">No pick</span>
                  {item.tournament && (
                    <span className="text-2xs text-white/15 truncate">· {item.tournament}</span>
                  )}
                </div>
              )}

              {/* Hover affordance: chevron */}
              <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <ChevronRight size={12} className="text-white/40" />
              </div>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}
