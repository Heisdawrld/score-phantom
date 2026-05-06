import { useState } from "react";
import { motion } from "framer-motion";
import { BellRing, ChevronDown, ChevronRight, ChevronUp } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";
import { fetchApi } from "@/lib/api";

function toWAT(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("en-NG", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return "";
  }
}

function getCountryEmoji(countryName: string): string {
  if (!countryName) return "🌍";
  const lower = countryName.toLowerCase();
  if (lower.includes("england") || lower.includes("premier")) return "🏴";
  if (lower.includes("spain") || lower.includes("la liga")) return "🇪🇸";
  if (lower.includes("italy") || lower.includes("serie a")) return "🇮🇹";
  if (lower.includes("germany") || lower.includes("bundesliga")) return "🇩🇪";
  if (lower.includes("france") || lower.includes("ligue 1")) return "🇫🇷";
  if (lower.includes("netherlands") || lower.includes("eredivisie")) return "🇳🇱";
  if (lower.includes("portugal") || lower.includes("primeira")) return "🇵🇹";
  if (lower.includes("brazil")) return "🇧🇷";
  if (lower.includes("argentina")) return "🇦🇷";
  if (lower.includes("belgium")) return "🇧🇪";
  if (lower.includes("turkey")) return "🇹🇷";
  if (lower.includes("greece")) return "🇬🇷";
  if (lower.includes("scotland")) return "🏴";
  if (lower.includes("europe") || lower.includes("champions") || lower.includes("uefa")) return "🇪🇺";
  if (lower.includes("world") || lower.includes("international")) return "🌍";
  return "⚽";
}

export function LeagueGroup({
  tournament,
  fixtures,
  onSelectFixture,
  defaultOpen,
}: {
  tournament: string;
  fixtures: any[];
  onSelectFixture: (id: string) => void;
  defaultOpen: boolean;
  isPremium: boolean;
}) {
  const countryFlag = fixtures[0]?.category_name ? getCountryEmoji(fixtures[0].category_name) : "";
  const storageKey = `league-expanded-${tournament}`;
  const [open, setOpen] = useState(() => {
    const saved = sessionStorage.getItem(storageKey);
    if (saved !== null) return saved === "true";
    return defaultOpen;
  });
  const [notified, setNotified] = useState<Record<string, boolean>>({});

  const handleToggle = () => {
    setOpen((prev) => {
      const next = !prev;
      sessionStorage.setItem(storageKey, String(next));
      return next;
    });
  };

  async function toggleNotify(e: React.MouseEvent, fixtureId: string) {
    e.stopPropagation();
    const isOn = notified[fixtureId];
    try {
      if (isOn) await fetchApi("/notify-match/" + fixtureId, { method: "DELETE" });
      else await fetchApi("/notify-match/" + fixtureId, { method: "POST" });
      setNotified((prev) => ({ ...prev, [fixtureId]: !isOn }));
    } catch {}
  }

  return (
    <div className="space-y-2">
      <button className="w-full flex items-center gap-3 px-3 py-2 rounded-2xl hover:bg-white/5 transition-all" onClick={handleToggle}>
        <span className="text-lg leading-none">{countryFlag}</span>
        <div className="w-0.5 h-4 bg-primary/60 rounded-full shrink-0" />
        <h3 className="text-[11px] font-black tracking-[0.2em] text-white/60 flex-1 text-left uppercase truncate">{tournament}</h3>
        <span className="text-[10px] text-white/25 bg-white/[0.04] px-2 py-0.5 rounded-full">{fixtures.length}</span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-white/20" /> : <ChevronDown className="w-3.5 h-3.5 text-white/20" />}
      </button>

      {open && (
        <motion.div className="space-y-3" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          {fixtures.map((fixture: any) => {
            const timeStr = toWAT(fixture.match_date);
            const isLive = ["LIVE", "HT", "1H", "2H", "ET", "PEN"].includes(fixture.match_status || "");
            const isFinished = ["FT", "AET", "Pen"].includes(fixture.match_status || "");
            const hasScore = fixture.home_score != null && fixture.away_score != null;
            const isNotified = notified[fixture.id] || false;

            return (
              <button
                key={fixture.id}
                onClick={() => onSelectFixture(fixture.id)}
                className="w-full text-left premium-surface rounded-[24px] transition-all duration-200 group hover:-translate-y-0.5 hover:bg-white/[0.05] active:scale-[0.99]"
              >
                <div className="p-4 grid gap-4 lg:grid-cols-[70px_1fr_auto]">
                  <div className="flex flex-col items-center justify-start min-w-[52px] shrink-0 gap-2">
                    {isLive ? (
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                          <span className="text-[9px] font-black text-red-400 uppercase tracking-widest">LIVE</span>
                        </span>
                        {fixture.live_minute && <span className="text-[9px] text-red-400/70">{fixture.live_minute}&apos;</span>}
                      </div>
                    ) : isFinished ? (
                      <span className="text-[9px] font-bold text-white/25 uppercase tracking-wide">FT</span>
                    ) : (
                      <span className="text-[11px] font-bold text-white/35">{timeStr}</span>
                    )}

                    {(isLive || isFinished) && hasScore && (
                      <div className="flex flex-col items-center bg-black/30 rounded-xl px-2 py-1.5 border border-white/10">
                        <span className="text-lg font-black tabular-nums leading-none" style={{ color: isLive ? "#ef4444" : "#ffffff" }}>{fixture.home_score}</span>
                        <span className="text-[7px] text-white/20">vs</span>
                        <span className="text-lg font-black tabular-nums leading-none" style={{ color: isLive ? "#ef4444" : "#ffffff" }}>{fixture.away_score}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2">
                      <TeamLogo src={fixture.home_team_logo} name={fixture.home_team_name} />
                      <span className="font-black text-sm text-white truncate">{fixture.home_team_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <TeamLogo src={fixture.away_team_logo} name={fixture.away_team_name} />
                      <span className="font-black text-sm text-white/78 truncate">{fixture.away_team_name}</span>
                    </div>

                    {(fixture.is_safe_bet || fixture.is_value_bet) && (
                      <div className="flex gap-1.5 mt-2 flex-wrap">
                        {fixture.is_safe_bet && (
                          <span className="text-[8px] font-bold px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 uppercase tracking-wide">
                            Safe Bet
                          </span>
                        )}
                        {fixture.is_value_bet && (
                          <span className="text-[8px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase tracking-wide">
                            Value Bet
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex lg:flex-col items-end justify-between gap-3 shrink-0">
                    {isLive ? (
                      <button
                        onClick={(e) => toggleNotify(e, fixture.id)}
                        className={"p-2 rounded-xl border transition-all " + (isNotified ? "bg-red-500/20 text-red-400 border-red-500/30" : "bg-white/[0.04] text-white/20 border-white/[0.06] hover:text-white/50")}
                      >
                        <BellRing className="w-3.5 h-3.5" />
                      </button>
                    ) : (fixture.odds_home || fixture.odds_away) && !isFinished ? (
                      <div className="grid gap-1 text-right">
                        {fixture.odds_home && <span className="text-[9px] text-white/30 bg-white/[0.04] px-2 py-0.5 rounded">H {Number(fixture.odds_home).toFixed(2)}</span>}
                        {fixture.odds_draw && <span className="text-[9px] text-white/30 bg-white/[0.04] px-2 py-0.5 rounded">D {Number(fixture.odds_draw).toFixed(2)}</span>}
                        {fixture.odds_away && <span className="text-[9px] text-white/30 bg-white/[0.04] px-2 py-0.5 rounded">A {Number(fixture.odds_away).toFixed(2)}</span>}
                      </div>
                    ) : (
                      <span className="text-[10px] text-white/20 uppercase tracking-widest">View</span>
                    )}

                    <ChevronRight className="w-4 h-4 text-white/15 group-hover:text-primary transition-colors" />
                  </div>
                </div>
              </button>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
