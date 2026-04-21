import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Header } from "@/components/layout/Header";
import { fetchApi } from "@/lib/api";
import { useLocation } from "wouter";
import { useAccess } from "@/hooks/use-access";

import { ChevronLeft, Star, Plus, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const POPULAR_LEAGUES = [
  "Premier League", "La Liga", "Serie A", "Bundesliga", "Ligue 1",
  "Champions League", "Europa League", "FA Cup", "Copa Del Rey",
  "Italian Cup", "German Cup", "French Cup", "Super Cup",
  "Eredivisie", "Primeira Liga", "Turkish Super League",
  "MLS", "Brazil Serie A", "Argentina Primera",
  "Copa America", "Africa Cup", "World Cup"
];

export default function LeagueFavorites() {
  const [, setLocation] = useLocation();
  const { user, isSubscribed, isLoading: authLoading } = useAccess();
  useEffect(() => { if (!authLoading && !isSubscribed) setLocation("/paywall"); }, [authLoading, isSubscribed]);
  if (authLoading || !isSubscribed) return <div className="min-h-screen bg-background" />;
  const { toast } = useToast();
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch current favorites
  const { data: currentFavs, isLoading } = useQuery({
    queryKey: ["league-favorites"],
    queryFn: () => fetchApi("/league-favorites"),
  });

  useEffect(() => {
    if (currentFavs?.favorites) {
      setSelectedLeagues(currentFavs.favorites);
    }
  }, [currentFavs]);

  // Save favorites mutation
  const saveMutation = useMutation({
    mutationFn: (leagues: string[]) =>
      fetchApi("/league-favorites", {
        method: "POST",
        body: JSON.stringify({ leagues }),
      }),
    onSuccess: (res) => {
      toast({
        title: "Saved!",
        description: res.message || `Saved ${selectedLeagues.length} favorite leagues`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save preferences",
        variant: "destructive",
      });
    },
  });

  const toggleLeague = (league: string) => {
    setSelectedLeagues((prev) =>
      prev.includes(league)
        ? prev.filter((l) => l !== league)
        : [...prev, league]
    );
  };

  const filteredLeagues = POPULAR_LEAGUES.filter((league) =>
    league.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="max-w-2xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => setLocation("/")}
            className="p-2 hover:bg-white/5 rounded-lg transition"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-3xl font-bold">⭐ League Favorites</h1>
        </div>

        <p className="text-white/60 mb-6">Select your favorite leagues to personalize your top picks and digests.</p>

        {/* Search Box */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="Search leagues..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-white/40 focus:outline-none focus:border-primary"
          />
        </div>

        {/* Selected Leagues */}
        {selectedLeagues.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-4">Selected ({selectedLeagues.length})</h2>
            <div className="flex flex-wrap gap-2">
              {selectedLeagues.map((league) => (
                <div
                  key={league}
                  className="bg-primary/20 border border-primary/50 rounded-lg px-4 py-2 flex items-center gap-2 group hover:bg-primary/30 transition"
                >
                  <Star className="w-4 h-4 text-primary fill-primary" />
                  <span className="text-white text-sm">{league}</span>
                  <button
                    onClick={() => toggleLeague(league)}
                    className="ml-1 p-1 hover:bg-primary/40 rounded transition"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Available Leagues */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Available Leagues</h2>
          {filteredLeagues.length === 0 && (<p className="text-white/40 text-sm py-8 text-center">No leagues found for "{searchQuery}"</p>)}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {filteredLeagues.map((league) => (
              <button
                key={league}
                onClick={() => toggleLeague(league)}
                className={`p-3 rounded-lg border transition text-left ${
                  selectedLeagues.includes(league)
                    ? "bg-primary/20 border-primary/50 text-white"
                    : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
                }`}
              >
                <div className="flex items-center gap-2">
                  {selectedLeagues.includes(league) && (
                    <Star className="w-4 h-4 text-primary fill-primary flex-shrink-0" />
                  )}
                  <span className="text-sm">{league}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Save Button */}
        <div className="mt-8 flex gap-3">
          <button
            onClick={() => saveMutation.mutate(selectedLeagues)}
            disabled={saveMutation.isPending}
            className="flex-1 bg-primary hover:bg-primary/80 disabled:bg-primary/40 text-black font-bold py-3 rounded-lg transition"
          >
            {saveMutation.isPending ? "Saving..." : "Save Favorites"}
          </button>
          <button
            onClick={() => setSelectedLeagues([])}
            className="px-6 bg-white/5 hover:bg-white/10 text-white border border-white/10 font-semibold py-3 rounded-lg transition"
          >
            Clear All
          </button>
        </div>
      </div>
    </div>
  );
}
