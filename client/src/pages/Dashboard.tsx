import { useState, useMemo } from "react";
import { format, addDays, isSameDay } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { useFixtures } from "@/hooks/use-fixtures";
import { Header } from "@/components/layout/Header";
import { PredictionPanel } from "@/components/prediction/PredictionPanel";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight, Search, Trophy } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export default function Dashboard() {
  const { data: user, isLoading: authLoading } = useAuth();
  
  const dates = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => addDays(new Date(), i));
  }, []);
  
  const [selectedDate, setSelectedDate] = useState(dates[0]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(null);

  const formattedDate = format(selectedDate, "yyyy-MM-dd");
  const { data, isLoading: fixturesLoading } = useFixtures(formattedDate);

  // Group fixtures by tournament
  const groupedFixtures = useMemo(() => {
    if (!data?.fixtures) return {};
    
    let filtered = data.fixtures;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(f => 
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

  // Enforce Paywall (fallback, should ideally be handled by a router wrapper but this works for this scope)
  if (user && user.access_status === 'expired') {
    window.location.href = "/paywall";
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20">
      <Header />
      
      <main className="flex-1 container mx-auto max-w-3xl px-4 pt-6 space-y-6">
        
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

        {/* Fixtures List */}
        <div className="space-y-6">
          {fixturesLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-20 w-full rounded-2xl" />
                <Skeleton className="h-20 w-full rounded-2xl" />
              </div>
            ))
          ) : Object.keys(groupedFixtures).length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <Trophy className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>No fixtures found for this date.</p>
            </div>
          ) : (
            Object.entries(groupedFixtures).map(([tournament, fixtures]: [string, any]) => (
              <div key={tournament} className="space-y-3">
                <div className="flex items-center gap-2 px-2">
                  <div className="w-1 h-4 bg-primary rounded-full" />
                  <h3 className="text-sm font-bold tracking-wide text-white/90">{tournament}</h3>
                  <span className="text-xs text-muted-foreground ml-auto">{fixtures.length} matches</span>
                </div>
                
                <div className="space-y-2">
                  {fixtures.map((fixture: any) => (
                    <button
                      key={fixture.id}
                      onClick={() => setSelectedFixtureId(fixture.id)}
                      className="w-full flex items-center justify-between p-4 rounded-2xl bg-panel/40 border border-white/5 hover:bg-white/5 hover:border-white/10 transition-all text-left group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="text-xs font-bold text-muted-foreground w-12 text-center shrink-0">
                          {format(new Date(fixture.match_date), "HH:mm")}
                        </div>
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
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

      </main>

      <PredictionPanel 
        fixtureId={selectedFixtureId} 
        onClose={() => setSelectedFixtureId(null)} 
      />
    </div>
  );
}
