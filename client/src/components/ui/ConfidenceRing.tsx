import { cn } from "@/lib/utils";

interface ConfidenceRingProps {
  value: number; // 0-100
  size?: number; // px, default 56
  strokeWidth?: number;
  className?: string;
  label?: string; // e.g. "CONFIDENCE" or "MODEL PROB"
  showLabel?: boolean;
  tier?: string; // "ELITE" | "STRONG" | "GOOD" | "LEAN"
}

const TIER_COLORS: Record<string, string> = {
  ELITE: "#10e774",
  STRONG: "#10e774",
  GOOD: "#3b82f6",
  LEAN: "#f59e0b",
};

function getTier(value: number): string {
  if (value >= 75) return "ELITE";
  if (value >= 60) return "STRONG";
  if (value >= 50) return "GOOD";
  return "LEAN";
}

export function ConfidenceRing({
  value,
  size = 56,
  strokeWidth = 3.5,
  className,
  label,
  showLabel = false,
  tier,
}: ConfidenceRingProps) {
  const resolvedTier = tier || getTier(value);
  const color = TIER_COLORS[resolvedTier] || "#f59e0b";
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(value, 100) / 100;
  const offset = circumference * (1 - progress);
  const center = size / 2;

  return (
    <div className={cn("relative flex flex-col items-center", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="rotate-[-90deg]">
          {/* Background track */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Progress arc */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              transition: "stroke-dashoffset 0.8s ease-out",
              filter: `drop-shadow(0 0 6px ${color}40)`,
            }}
          />
        </svg>
        {/* Center value */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span
            style={{ color, fontSize: size * 0.28 }}
            className="font-black leading-none tabular-nums"
          >
            {value.toFixed(0)}%
          </span>
        </div>
      </div>
      {/* Labels below ring */}
      {showLabel && (
        <div className="flex flex-col items-center mt-0.5">
          {label && (
            <span className="text-[8px] font-bold uppercase tracking-widest text-white/35">
              {label}
            </span>
          )}
          <span
            className="text-[9px] font-black uppercase tracking-widest mt-0.5"
            style={{ color }}
          >
            {resolvedTier}
          </span>
        </div>
      )}
    </div>
  );
}
