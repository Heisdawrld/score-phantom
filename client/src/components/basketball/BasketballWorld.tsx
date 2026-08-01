import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, BarChart3, CircleGauge, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  basketballDecision,
  basketballDecisionTone,
  basketballEdgeLabel,
  basketballMarketLabel,
  basketballPercent,
  formatBasketballTip,
  type BasketballPrediction,
} from "@/lib/basketball-world";

export function BasketballWorldPage({
  eyebrow,
  title,
  subtitle,
  action,
  children,
  wide = false,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  action?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="basketball-world relative min-h-screen overflow-hidden pb-28 text-white">
      <div className="basketball-world__court" aria-hidden="true" />
      <div className="basketball-world__glow basketball-world__glow--one" aria-hidden="true" />
      <div className="basketball-world__glow basketball-world__glow--two" aria-hidden="true" />
      <main className={cn("relative z-10 mx-auto px-4 pb-10 pt-6 sm:px-6", wide ? "max-w-7xl" : "max-w-6xl")}>
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-7 flex flex-col gap-5 border-b border-orange-200/10 pb-6 sm:flex-row sm:items-end sm:justify-between"
        >
          <div className="max-w-3xl">
            <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-orange-200/65">
              <span className="h-1.5 w-1.5 rounded-full bg-orange-300 shadow-[0_0_14px_rgba(251,146,60,.8)]" />
              {eyebrow}
            </div>
            <h1 className="font-display text-3xl font-black leading-none tracking-tight sm:text-5xl">{title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/42 sm:text-base">{subtitle}</p>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </motion.header>
        {children}
      </main>
    </div>
  );
}
export function BasketballMetric({ label, value, detail, tone = "orange" }: {
  label: string;
  value: string | number;
  detail?: string;
  tone?: "orange" | "violet" | "cyan" | "green";
}) {
  const tones = {
    orange: "from-orange-400/12 border-orange-300/12 text-orange-100",
    violet: "from-violet-400/12 border-violet-300/12 text-violet-100",
    cyan: "from-cyan-400/12 border-cyan-300/12 text-cyan-100",
    green: "from-emerald-400/12 border-emerald-300/12 text-emerald-100",
  };
  return (
    <div className={cn("rounded-2xl border bg-gradient-to-br to-transparent p-4", tones[tone])}>
      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/30">{label}</p>
      <p className="mt-2 text-2xl font-black tabular-nums">{value}</p>
      {detail && <p className="mt-1 text-[10px] text-white/28">{detail}</p>}
    </div>
  );
}

export function BasketballSignalCard({
  prediction,
  index = 0,
  onOpen,
  selected,
  onSelect,
  compact = false,
}: {
  prediction: BasketballPrediction;
  index?: number;
  onOpen?: () => void;
  selected?: boolean;
  onSelect?: () => void;
  compact?: boolean;
}) {
  const rec = prediction.recommendation;
  const decision = basketballDecision(prediction);
  const reasons = (rec?.reasons || []).slice(0, compact ? 1 : 2);

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.045, 0.25) }}
      className={cn(
        "group relative overflow-hidden rounded-3xl border bg-[#0c1117]/88 p-4 shadow-[0_22px_80px_rgba(0,0,0,.22)] transition",
        selected ? "border-orange-300/35 ring-1 ring-orange-300/15" : "border-white/[0.065] hover:border-orange-200/18",
      )}
    >
      <div className="pointer-events-none absolute -right-16 -top-20 h-40 w-40 rounded-full bg-orange-400/8 blur-3xl" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full border px-2 py-1 text-[9px] font-black tracking-[0.16em]", basketballDecisionTone(decision))}>{decision}</span>
            <span className="text-[9px] font-black uppercase tracking-[0.14em] text-white/25">{prediction.league?.label || "Basketball"}</span>
            <span className="text-[9px] text-white/20">{formatBasketballTip(prediction.game?.startTime)}</span>
          </div>
          <h2 className="mt-3 truncate text-sm font-black text-white sm:text-base">
            {prediction.game?.homeTeam || "Home"} <span className="font-medium text-white/20">vs</span> {prediction.game?.awayTeam || "Away"}
          </h2>
          <p className="mt-1 text-base font-black text-orange-100 sm:text-lg">{rec?.pick || "No clear edge"}</p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/24">{basketballMarketLabel(rec?.market)}</p>
        </div>
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-orange-200/12 bg-orange-400/8 text-center">
          <div>
            <strong className="block text-lg leading-none text-orange-100">{Math.round(Number(rec?.phantomScore || 0))}</strong>
            <span className="text-[7px] font-black uppercase tracking-wider text-orange-100/35">score</span>
          </div>
        </div>
      </div>

      <div className="relative mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-white/[0.025] p-2.5">
          <p className="text-[8px] font-black uppercase tracking-wider text-white/24">Model</p>
          <p className="mt-1 text-sm font-black text-white">{basketballPercent(rec?.modelProbability)}</p>
        </div>
        <div className="rounded-xl bg-white/[0.025] p-2.5">
          <p className="text-[8px] font-black uppercase tracking-wider text-white/24">Edge</p>
          <p className="mt-1 text-sm font-black text-emerald-200">{basketballEdgeLabel(rec)}</p>
        </div>
        <div className="rounded-xl bg-white/[0.025] p-2.5">
          <p className="text-[8px] font-black uppercase tracking-wider text-white/24">Coverage</p>
          <p className="mt-1 text-sm font-black text-violet-100">{prediction.intel?.dataQuality || 0}%</p>
        </div>
      </div>

      {!compact && reasons.length > 0 && (
        <div className="relative mt-3 space-y-1.5 border-t border-white/[0.045] pt-3">
          {reasons.map((reason, reasonIndex) => (
            <p key={`${reason}-${reasonIndex}`} className="flex gap-2 text-[10px] leading-4 text-white/34">
              <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-orange-200/45" /> {reason}
            </p>
          ))}
        </div>
      )}

      <div className="relative mt-4 flex items-center gap-2">
        {onSelect && (
          <button
            type="button"
            onClick={onSelect}
            className={cn(
              "flex-1 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] transition",
              selected ? "border-orange-300/30 bg-orange-400/15 text-orange-100" : "border-white/[0.07] bg-white/[0.025] text-white/38 hover:text-white",
            )}
          >
            {selected ? "Added to slip" : "Add to slip"}
          </button>
        )}
        {onOpen && (
          <button type="button" onClick={onOpen} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-orange-300 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#1a0c02] transition hover:bg-orange-200">
            Match intel <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </motion.article>
  );
}

export function BasketballEmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-orange-200/12 bg-orange-400/[0.025] px-6 py-14 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-orange-200/12 bg-orange-400/8">
        <CircleGauge className="h-5 w-5 text-orange-200/55" />
      </div>
      <h2 className="mt-4 text-base font-black">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-white/34">{message}</p>
    </div>
  );
}

export function BasketballLoadingGrid({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="h-72 animate-pulse rounded-3xl border border-white/[0.05] bg-white/[0.025]" />
      ))}
    </div>
  );
}

export function BasketballIntegrityNote() {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-violet-300/10 bg-violet-400/[0.035] p-4 text-xs leading-5 text-white/36">
      <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-violet-200/60" />
      Basketball signals are graded separately from football. Thin coverage stays on WATCH, and the engine will not pad a slip with a weak market.
    </div>
  );
}
