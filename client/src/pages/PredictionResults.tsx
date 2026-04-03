import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/layout/Header";
import { fetchApi } from "@/lib/api";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

import { ChevronLeft, Check, X, Clock } from "lucide-react";

interface Result {
  fixtureId: string;
  match: string;
  date: string;
  market: string;
  predicted: string;
  actual: string;
  outcome: "win" | "loss" | "void" | "pending";
  confidence: number;
  isWin: boolean;
}

export default function PredictionResults() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading: authLoading } = useAuth();
  if (authLoading) return <div className="min-h-screen bg-background" />;
  
  const { data, isLoading } = useQuery({
    queryKey: ["prediction-results"],
    queryFn: () => fetchApi("/api/prediction-results?limit=50&days=30"),
  });

  const results: Result[] = data?.results || [];
  const summary = data?.summary || { total: 0, wins: 0, losses: 0, pending: 0 };

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

  const getOutcomeIcon = (outcome: string) => {
    switch (outcome) {
      case "win":
        return <Check className="w-5 h-5 text-emerald-400" />;
      case "loss":
        return <X className="w-5 h-5 text-red-400" />;
      case "pending":
        return <Clock className="w-5 h-5 text-blue-400" />;
      default:
        return <X className="w-5 h-5 text-white/40" />;
    }
  };

  const getOutcomeColor = (outcome: string) => {
    switch (outcome) {
      case "win":
        return "bg-emerald-500/10 border-emerald-500/30";
      case "loss":
        return "bg-red-500/10 border-red-500/30";
      case "pending":
        return "bg-blue-500/10 border-blue-500/30";
      default:
        return "bg-white/5 border-white/10";
    }
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
          <h1 className="text-3xl font-bold">📈 Prediction Results</h1>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white/5 border border-white/10 rounded-lg p-6">
            <p className="text-white/60 text-sm mb-2">Total Predictions</p>
            <p className="text-3xl font-bold text-white">{summary.total}</p>
          </div>
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-6">
            <p className="text-emerald-400 text-sm mb-2">Wins</p>
            <p className="text-3xl font-bold text-emerald-400">{summary.wins}</p>
          </div>
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6">
            <p className="text-red-400 text-sm mb-2">Losses</p>
            <p className="text-3xl font-bold text-red-400">{summary.losses}</p>
          </div>
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-6">
            <p className="text-blue-400 text-sm mb-2">Pending</p>
            <p className="text-3xl font-bold text-blue-400">{summary.pending}</p>
          </div>
        </div>

        {/* Results List */}
        {results.length > 0 ? (
          <div className="space-y-3">
            {results.map((result) => (
              <div
                key={result.fixtureId}
                className={`border rounded-lg p-4 flex items-center justify-between ${getOutcomeColor(result.outcome)}`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    {getOutcomeIcon(result.outcome)}
                    <h3 className="text-white font-semibold">{result.match}</h3>
                  </div>
                  <p className="text-white/60 text-sm">{result.date}</p>
                </div>

                <div className="text-right mr-4">
                  <p className="text-white/60 text-xs mb-1">{result.market}</p>
                  <p className="text-white font-semibold">{result.predicted}</p>
                </div>

                <div className="text-right">
                  <p className="text-white/60 text-xs mb-1">Result</p>
                  <p className="text-white font-semibold">{result.actual || "Pending"}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white/5 border border-white/10 rounded-lg p-12 text-center">
            <p className="text-white/60 mb-2">No prediction results yet</p>
            <p className="text-white/40 text-sm">Your predictions will appear here as they resolve</p>
          </div>
        )}
      </div>
    </div>
  );
}
