import { motion } from "framer-motion";
import { Activity, Flame, Star, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export function QuickActions({
  onTopPicks,
  onAcca,
  onLive,
  onValueBets,
}: {
  onTopPicks: () => void;
  onAcca: () => void;
  onLive: () => void;
  onValueBets: () => void;
}) {
  const items = [
    { label: "Top Picks", sub: "Daily ranked board", icon: Flame, color: "text-orange-300", onClick: onTopPicks },
    { label: "ACCA Lab", sub: "Smart combo builder", icon: Zap, color: "text-sky-300", onClick: onAcca },
    { label: "Live Pulse", sub: "Real-time watchlist", icon: Activity, color: "text-emerald-300", onClick: onLive },
    { label: "Value Edge", sub: "Best mispriced spots", icon: Star, color: "text-amber-300", onClick: onValueBets },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 }}
      className="grid grid-cols-2 lg:grid-cols-4 gap-3"
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <motion.button
            key={item.label}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.97 }}
            onClick={item.onClick}
            className="premium-surface rounded-[24px] p-4 text-left transition-all hover:bg-white/[0.05]"
          >
            <div className="flex items-center justify-between gap-3">
              <div className={cn("flex h-11 w-11 items-center justify-center rounded-2xl border border-white/[0.08] bg-black/25", item.color)}>
                <Icon className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/22">Open</span>
            </div>
            <div className="mt-4">
              <p className={cn("text-sm font-black", item.color)}>{item.label}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-white/38">{item.sub}</p>
            </div>
          </motion.button>
        );
      })}
    </motion.div>
  );
}
