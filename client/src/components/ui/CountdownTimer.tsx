import { useState, useEffect } from "react";
import { Clock } from "lucide-react";

interface CountdownTimerProps {
  matchDate: string; // ISO date string
  className?: string;
}

export function CountdownTimer({ matchDate, className }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const target = new Date(matchDate).getTime();

    function update() {
      const now = Date.now();
      const diff = target - now;
      if (diff <= 0) {
        setTimeLeft("LIVE");
        return;
      }
      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeLeft(
        `${hours.toString().padStart(2, "0")}:${minutes
          .toString()
          .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
      );
    }

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [matchDate]);

  if (!matchDate || timeLeft === "LIVE") return null;

  return (
    <div className={className}>
      <span className="flex items-center gap-1.5 text-[11px] font-bold text-white/50">
        <Clock className="w-3 h-3" />
        STARTS IN{" "}
        <span className="text-white font-black tabular-nums">{timeLeft}</span>
      </span>
    </div>
  );
}
