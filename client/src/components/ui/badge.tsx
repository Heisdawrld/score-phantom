import * as React from "react"
import { cn } from "@/lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "high" | "medium" | "lean" | "low" | "outline"
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 tracking-wide uppercase",
        {
          "border-transparent bg-primary/10 text-primary border-primary/20": variant === "default",
          "border-primary/30 bg-primary/15 text-primary shadow-[0_0_10px_rgba(16,231,116,0.2)]": variant === "high",
          "border-accent-blue/30 bg-accent-blue/15 text-accent-blue shadow-[0_0_10px_rgba(79,137,255,0.2)]": variant === "medium",
          "border-accent-orange/30 bg-accent-orange/15 text-accent-orange": variant === "lean",
          "border-destructive/30 bg-destructive/15 text-destructive": variant === "low",
          "border-border text-foreground": variant === "outline",
        },
        className
      )}
      {...props}
    />
  )
}

export { Badge }
