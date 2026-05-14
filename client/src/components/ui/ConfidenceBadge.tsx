import { cn } from "@/lib/utils";

interface ConfidenceBadgeProps {
  value: number; // 0-100 composite or confidence
  className?: string;
  size?: "sm" | "md";
}

// UNIFIED confidence tiers — matches engine's buildConfidenceProfile output.
// Engine uses: HIGH / MEDIUM / LEAN / LOW (market-baseline-aware).
// These are now the single source of truth for all UI components.
// Thresholds aligned with engine: HIGH >= 62%+edge, MEDIUM >= 52%+edge, LEAN >= 44%+edge, LOW < that
const TIERS = [
  { min: 68, label: "HIGH",   cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  { min: 55, label: "MEDIUM", cls: "bg-blue-500/10 text-blue-400 border-blue-500/25" },
  { min: 44, label: "LEAN",   cls: "bg-amber-500/10 text-amber-400 border-amber-500/25" },
  { min: 0,  label: "LOW",    cls: "bg-white/5 text-muted-foreground border-white/10" },
];

export function getConfidenceTier(value: number) {
  return TIERS.find(t => value >= t.min) || TIERS[TIERS.length - 1];
}

export function ConfidenceBadge({ value, className, size = "sm" }: ConfidenceBadgeProps) {
  const tier = getConfidenceTier(value);
  return (
    <span
      className={cn(
        "inline-flex items-center font-black uppercase tracking-widest border rounded-full",
        tier.cls,
        size === "sm"
          ? "text-[9px] px-2 py-0.5"
          : "text-[10px] px-2.5 py-1",
        className
      )}
    >
      {tier.label}
    </span>
  );
}
