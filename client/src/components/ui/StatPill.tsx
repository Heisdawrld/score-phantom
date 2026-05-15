import { cn } from "@/lib/utils";

interface StatPillProps {
  label: string;
  value: string | number;
  color?: "green" | "blue" | "orange" | "white" | "yellow";
  size?: "sm" | "md" | "lg";
  className?: string;
  icon?: React.ReactNode;
  highlight?: boolean;
}

const COLOR_MAP = {
  green: "text-primary",
  blue: "text-blue-400",
  orange: "text-orange-400",
  yellow: "text-yellow-400",
  white: "text-white",
};

export function StatPill({
  label,
  value,
  color = "white",
  size = "md",
  className,
  icon,
  highlight = false,
}: StatPillProps) {
  return (
    <div
      className={cn(
        "rounded-xl border text-center",
        highlight
          ? "bg-primary/10 border-primary/25"
          : "bg-white/[0.04] border-white/8",
        size === "sm" ? "px-2 py-1.5" : size === "lg" ? "px-4 py-3" : "px-3 py-2.5",
        className
      )}
    >
      <div className="flex items-center justify-center gap-1.5 mb-0.5">
        {icon}
        <p className="text-[9px] font-bold text-white/35 uppercase tracking-widest">
          {label}
        </p>
      </div>
      <p
        className={cn(
          "font-black tabular-nums",
          COLOR_MAP[color],
          size === "sm" ? "text-sm" : size === "lg" ? "text-xl" : "text-lg"
        )}
      >
        {value}
      </p>
    </div>
  );
}
