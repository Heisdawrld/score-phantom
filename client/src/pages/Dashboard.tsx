import { useState, useMemo } from "react";
import { format, addDays, isSameDay } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { useFixtures } from "@/hooks/use-fixtures";
import { usePrediction } from "@/hooks/use-predictions";
import { Header } from "@/components/layout/Header";
import { PredictionPanel } from "@/components/prediction/PredictionPanel";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronRight, ChevronDown, ChevronUp, Search, Trophy,
  Crown, Zap, Lock, AlertCircle
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/api";

// ── ACCA Banner (premium only) ────────────────────────────────────────────────
function AccaSection({ isPremium }: { isPremium: boolean }) {
  const [open, setOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/acca"],
    queryFn: () => fetchApi("/acca"),
    enabled: isPremium && open,
    staleTime: 10 * 60 * 1000,
  });

  const confColor: Record<string, string> = {
    HIGH: "text-primary",
    MEDIUM: "text-blue-400",
    LEAN: "text-orange-400",
    LOW: "text-muted-foreground",
  };

  if (!isPremium) {
    return (
      <div
        className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/5 to-transparent p-4 flex items-center gap-4 cursor-pointer hover:bg-primary/10 transition-all"
        onClick={() => (window.location.href = "/paywall")}
      >
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
          <Crown className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-primary tracking-wide">ACCA — Today's Best 5 Picks</p>
          <p className="text-xs text-muted-foreground mt-0.5">Upgrade to Premium to unlock your daily accumulator</p>
        </div>
        <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-primary/30 bg-gradient-to-b from-primary/8 to-transparent overflow-hidden">
      <button
        className="w-full flex items-center gap-3 p-4 hover:bg-primary/5 transition-all"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
          <Zap className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 text-left">
          <p className="text-sm font-bold text-primary tracking-wide">ACCA — Today's Best 5 Picks</p>
          <p className="text-xs text-muted-foreground">AI-selected accumulator for today</p>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-primary shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-primary shrink-0" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2">
          {isLoading &&
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}

          {error && (
            <p className="text-xs text-muted-foreground text-center py-4">
              Could not load ACCA picks right now.
            </p>
          )}

          {data?.picks?.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              No picks available yet. Check back later today.
            </p>
          )}

          {data?.picks?.map((pick: any, i: number) => (
            <div
              key={pick.fixtureId}
              className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/8"
            >
              <span className="text-xs font-bold text-muted-foreground w-5 shrink-0">#{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">
                  {pick.homeTeam} <span className="text-muted-foreground text-xs">vs</span> {pick.awayTeam}
                </p>
                <p className="text-xs text-muted-foreground truncate">{pick.tournament}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-bold text-white">{pick.selection || pick.pick}</p>
                <p className={cn("text-[10px] font-bold tracking-wide uppercase", confColor[pick.confidence] ?? "text-muted-foreground")}>
                  {pick.confidence}
                </p>
              </div>
            </div>
          ))}

          {data?.picks?.length > 0 && (
            <p className="text-[10px] text-muted-foreground text-center pt-2">
              ACCA is AI-generated. Always gamble responsibly.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Collapsible League Group ───────────────────────────────────────────────────
function LeagueGroup({
  tournament,
  fixtures,
  onSelectFixture,
  defaultOpen,
}: {
  tournament: string;
  fixtures: any[];
  onSelectFixture: (id: string) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="space-y-2">
      <button
        className="w-full flex items-center gap-2 px-2 py-1 rounded-xl hover:bg-white/5 transition-all"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="w-1 h-4 bg-primary rounded-full shrink-0" />
        <h3 className="text-sm font-bold tracking-wide text-white/90 flex-1 text-left">{tournament}</h3>
        <span className="text-xs text-muted-foreground">{fixtures.length}</span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="space-y-2">
          {fixtures.map((fixture: any) => {
            let time = "";
            try { time = format(new Date(fixture.match_date), "HH:mm"); } catch {}
            return (
              <button
                key={fixture.id}
                onClick={() => onSelectFixture(fixture.id)}
                className="w-full flex items-center justify-between p-4 rounded-2xl bg-panel/40 border border-white/5 hover:bg-white/5 hover:border-white/10 transition-all text-left group"
              >
                <div className="flex items-center gap-4">
                  <div className="text-xs font-bold text-muted-foreground w-12 text-center shrink-0">{time}</div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                      <span className="font-semibold text-sm">{fixture.home_team_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-accent-blue" />
                      <span className="font-semibold text-sm">{fixture.away_team_name}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  {fixture.enriched ? (
                    <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_#10e774]" title="AI Analyzed" />
                  ) : null}
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { data: user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  const dates = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => addDays(new Date(), i));
  }, []);

  const [selectedDate, setSelectedDate] = useState(dates[0]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(null);
  const [dailyLimitHit, setDailyLimitHit] = useState(false);

  const formattedDate = format(selectedDate, "yyyy-MM-dd");
  const { data, isLoading: fixturesLoading } = useFixtures(formattedDate);

  const isPremium = user?.access_status === "active" || (user as any)?.subscription_active;
  const isTrial = user?.access_status === "trial";

  const { data: usageData } = useQuery({
    queryKey: ["/api/usage"],
    queryFn: () => fetchApi("/usage"),
    enabled: isTrial,
    refetchInterval: 30000, // refresh every 30s
    staleTime: 10000,
  });

  const groupedFixtures = useMemo(() => {
    if (!data?.fixtures) return {};

    let filtered = data.fixtures;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (f) =>
          f.home_team_name.toLowerCase().includes(q) ||
          f.away_team_name.toLowerCase().includes(q) ||
          (f.tournament_name && f.tournament_name.toLowerCase().includes(q))
      );
    }

    return filtered.reduce((acc: any, fixture) => {
      const key = fixture.tournament_name || "Other Competitions";
      if (!acc[key]) acc[key] = [];
      acc[key].push(fixture);
      return acc;
    }, {});
  }, [data?.fixtures, searchQuery]);

  if (authLoading) return <div className="min-h-screen bg-background" />;

  if (user && user.access_status === "expired") {
    window.location.href = "/paywall";
    return null;
  }

  const handleSelectFixture = (id: string) => {
    setDailyLimitHit(false);
    setSelectedFixtureId(id);
  };

  const handlePredictionError = (code: string) => {
    if (code === "daily_limit_reached") {
      setDailyLimitHit(true);
      setSelectedFixtureId(null);
    }
  };

  const leagues = Object.entries(groupedFixtures);

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20">
      <Header />

      <main className="flex-1 container mx-auto max-w-3xl px-4 pt-6 space-y-5">

        {/* Trial subscribe banner */}
        {isTrial && (
          <div
            className="flex items-center gap-3 p-3 rounded-2xl bg-primary/8 border border-primary/20 cursor-pointer hover:bg-primary/12 transition-all"
            onClick={() => setLocation("/paywall")}
          >
            <Crown className="w-5 h-5 text-primary shrink-0" />
            <p className="text-sm text-white/90 flex-1">
              <span className="font-bold text-primary">Free trial active.</span>{" "}
              {usageData ? (
                <>
                  <span className={usageData.remaining <= 2 ? "text-orange-400 font-bold" : ""}>
                    {usageData.remaining}/{usageData.limit} predictions left today
                  </span>{" · "}
                </>
              ) : (
                "10 predictions/day · "
              )}
              No AI chat · No ACCA
            </p>
            <Button size="sm" className="shrink-0 h-7 text-xs">Upgrade</Button>
          </div>
        )}

        {/* Daily limit hit banner */}
        {dailyLimitHit && (
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-orange-500/10 border border-orange-500/20">
            <AlertCircle className="w-5 h-5 text-orange-400 shrink-0" />
            <p className="text-sm text-white/90 flex-1">
              You've used all <strong>10 free predictions</strong> for today. Come back tomorrow or{" "}
              <span
                className="text-primary underline cursor-pointer"
                onClick={() => setLocation("/paywall")}
              >
                upgrade to Premium
              </span>
              .
            </p>
          </div>
        )}

        {/* ACCA Section */}
        <AccaSection isPremium={!!isPremium} />

        {/* Date Strip */}
        <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2 snap-x">
          {dates.map((date) => {
            const isSelected = isSameDay(date, selectedDate);
            return (
              <button
                key={date.toISOString()}
                onClick={() => setSelectedDate(date)}
                className={cn(
                  "snap-start shrink-0 min-w-[70px] flex flex-col items-center justify-center p-3 rounded-2xl border transition-all",
                  isSelected
                    ? "bg-gradient-to-b from-primary/20 to-primary/5 border-primary/30 text-primary shadow-[0_0_15px_rgba(16,231,116,0.1)]"
                    : "bg-panel/50 border-white/5 text-muted-foreground hover:bg-white/5"
                )}
              >
                <span className="text-[10px] font-bold tracking-widest uppercase mb-1">{format(date, "EEE")}</span>
                <span className="font-display text-2xl leading-none">{format(date, "dd")}</span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-4 top-3.5 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Search teams or leagues..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-11 h-12 bg-panel/50 border-white/10 rounded-2xl"
          />
        </div>

        {/* Fixtures List — Grouped & Collapsible */}
        <div className="space-y-4">
          {fixturesLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-20 w-full rounded-2xl" />
                <Skeleton className="h-20 w-full rounded-2xl" />
              </div>
            ))
          ) : leagues.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <Trophy className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>No fixtures found for this date.</p>
            </div>
          ) : (
            leagues.map(([tournament, fixtures]: [string, any], idx) => (
              <LeagueGroup
                key={tournament}
                tournament={tournament}
                fixtures={fixtures}
                onSelectFixture={handleSelectFixture}
                defaultOpen={idx < 2}
              />
            ))
          )}
        </div>
      </main>

      <PredictionPanel
        fixtureId={selectedFixtureId}
        onClose={() => setSelectedFixtureId(null)}
        onError={handlePredictionError}
      />
    </div>
  );
}
