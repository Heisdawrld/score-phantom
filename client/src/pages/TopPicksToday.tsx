import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/layout/Header";
import { fetchApi } from "@/lib/api";
import { useLocation } from "wouter";
import { ChevronLeft, TrendingUp, Zap } from "lucide-react";

interface Pick {
  fixtureId: string;
  match: string;
  market: string;
  pick: string;
  probability: number;
  score: number;
  confidence: number;
  tournament: string;
  time: string;
}

export default function TopPicksToday() {
  const [, setLocation] = useLocation();
  
  const { data, isLoading } = useQuery({
    queryKey: ["top-picks-today"],
    queryFn: () => fetchApi("/api/top-picks-today?limit=15"),
  });

  const picks: Pick[] = data?.picks || [];

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

  const getConfidenceColor = (conf: number) => {
    if (conf >= 75) return "text-emerald-400 bg-emerald-500/10";
    if (conf >= 65) return "text-blue-400 bg-blue-500/10";
    return "text-yellow-400 bg-yellow-500/10";
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => setLocation("/")}
            className="p-2 hover:bg-white/5 rounded-lg transition"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-3xl font-bold">🎯 Top Picks Today</h1>
        </div>

        {picks.length > 0 ? (
          <div className="space-y-4">
            {picks.map((pick, idx) => (
              <div
                key={pick.fixtureId}
                className="bg-white/5 border border-white/10 rounded-lg p-5 hover:bg-white/10 transition group cursor-pointer"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-primary font-bold text-lg">#{idx + 1}</span>
                      <h3 className="text-white font-semibold">{pick.match}</h3>
                      <span className="text-[9px] px-2 py-1 bg-white/10 rounded text-white/60 uppercase">
                        {pick.tournament}
                      </span>
                    </div>
                    <p className="text-white/60 text-sm mb-3">{pick.time}</p>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <p className="text-white/60 text-xs mb-1">Market</p>
                        <p className="text-white font-semibold">{pick.market}</p>
                      </div>
                      <div>
                        <p className="text-white/60 text-xs mb-1">Pick</p>
                        <p className="text-primary font-bold">{pick.pick}</p>
                      </div>
                      <div>
                        <p className="text-white/60 text-xs mb-1">Probability</p>
                        <p className="text-white font-semibold">{pick.probability.toFixed(1)}%</p>
                      </div>
                      <div>
                        <p className="text-white/60 text-xs mb-1">Confidence</p>
                        <div className={`inline-block px-3 py-1 rounded font-bold text-sm ${getConfidenceColor(pick.confidence)}`}>
                          {pick.confidence.toFixed(0)}%
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="flex items-center gap-1 text-primary mb-2">
                      <TrendingUp className="w-4 h-4" />
                      <span className="font-bold text-lg">{pick.score.toFixed(2)}</span>
                    </div>
                    <p className="text-white/40 text-xs">Pick Score</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white/5 border border-white/10 rounded-lg p-12 text-center">
            <Zap className="w-12 h-12 text-white/30 mx-auto mb-4" />
            <p className="text-white/60 mb-2">No predictions for today yet</p>
            <p className="text-white/40 text-sm">Check back soon for fresh picks!</p>
          </div>
        )}
      </div>
    </div>
  );
}
