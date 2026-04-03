import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/layout/Header";
import { fetchApi } from "@/lib/api";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

import { ChevronLeft, Plus, X, TrendingUp } from "lucide-react";

interface Pick {
  match: string;
  market: string;
  prediction: string;
  odds: number;
  confidence: number;
}

interface PayoutData {
  picks: number;
  stake: number;
  combinedOdds: number;
  potentialReturn: number;
  profit: number;
  roi: number;
}

export default function AccaCalculator() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading: authLoading } = useAuth();
  const isPremium = user?.access_status === "active" || (user as any)?.subscription_active;
  if (authLoading) return <div className="min-h-screen bg-background" />;
  if (!isPremium) { setLocation("/"); return null; }
  const [picks, setPicks] = useState<Pick[]>([
    { match: "Man City vs Liverpool", market: "Over 2.5", prediction: "Yes", odds: 1.68, confidence: 75 },
    { match: "Arsenal vs Chelsea", market: "BTTS", prediction: "Yes", odds: 1.85, confidence: 70 },
  ]);
  const [stake, setStake] = useState(1000);
  const [newPick, setNewPick] = useState({ match: "", market: "", prediction: "", odds: 1.5 });
  const [payout, setPayout] = useState<PayoutData | null>(null);

  // Calculate payout when picks or stake change
  useEffect(() => {
    const calculatePayout = async () => {
      if (picks.length === 0) return;
      
      try {
        const data = await fetchApi(
          `/api/acca-payout?picks=${encodeURIComponent(JSON.stringify(picks))}&stake=${stake}`
        );
        setPayout(data);
      } catch (err) {
        console.error("Failed to calculate payout:", err);
      }
    };

    calculatePayout();
  }, [picks, stake]);

  const addPick = () => {
    if (newPick.match && newPick.odds > 0) {
      setPicks([...picks, newPick]);
      setNewPick({ match: "", market: "", prediction: "", odds: 1.5 });
    }
  };

  const removePick = (idx: number) => {
    setPicks(picks.filter((_, i) => i !== idx));
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => setLocation("/")}
            className="p-2 hover:bg-white/5 rounded-lg transition"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-3xl font-bold">💰 ACCA Calculator</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Side: Picks Editor */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white/5 border border-white/10 rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4">Your Picks</h2>

              {/* Picks List */}
              <div className="space-y-3 mb-4">
                {picks.map((pick, idx) => (
                  <div key={idx} className="bg-white/5 border border-white/10 rounded-lg p-4 flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-white font-semibold text-sm">{pick.match}</p>
                      <p className="text-white/60 text-xs">{pick.market} - {pick.prediction}</p>
                    </div>
                    <div className="text-right mr-3">
                      <p className="text-primary font-bold">{pick.odds.toFixed(2)}</p>
                      <p className="text-white/60 text-xs">{pick.confidence}% confidence</p>
                    </div>
                    <button
                      onClick={() => removePick(idx)}
                      className="p-2 hover:bg-red-500/20 rounded transition"
                    >
                      <X className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add Pick Form */}
              <div className="border-t border-white/10 pt-4">
                <p className="text-white/60 text-xs mb-3">Add a new pick</p>
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Match (e.g. Man City vs Liverpool)"
                    value={newPick.match}
                    onChange={(e) => setNewPick({ ...newPick, match: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-white placeholder-white/40 text-sm focus:outline-none focus:border-primary"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Market"
                      value={newPick.market}
                      onChange={(e) => setNewPick({ ...newPick, market: e.target.value })}
                      className="bg-white/5 border border-white/10 rounded px-3 py-2 text-white placeholder-white/40 text-sm focus:outline-none focus:border-primary"
                    />
                    <input
                      type="text"
                      placeholder="Prediction"
                      value={newPick.prediction}
                      onChange={(e) => setNewPick({ ...newPick, prediction: e.target.value })}
                      className="bg-white/5 border border-white/10 rounded px-3 py-2 text-white placeholder-white/40 text-sm focus:outline-none focus:border-primary"
                    />
                  </div>
                  <input
                    type="number"
                    placeholder="Odds (e.g. 1.85)"
                    step="0.01"
                    min="1"
                    value={newPick.odds}
                    onChange={(e) => setNewPick({ ...newPick, odds: parseFloat(e.target.value) || 1.5 })}
                    className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-white placeholder-white/40 text-sm focus:outline-none focus:border-primary"
                  />
                  <button
                    onClick={addPick}
                    className="w-full bg-primary/20 hover:bg-primary/30 border border-primary/50 text-primary font-semibold py-2 rounded transition text-sm flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Add Pick
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side: Payout Summary */}
          <div className="lg:col-span-1">
            <div className="bg-primary/10 border border-primary/30 rounded-lg p-6 sticky top-6">
              <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Payout Summary
              </h2>

              {payout && (
                <div className="space-y-4">
                  {/* Combined Odds */}
                  <div>
                    <p className="text-primary/60 text-xs mb-1">Combined Odds</p>
                    <p className="text-3xl font-bold text-primary">{payout.combinedOdds.toFixed(2)}</p>
                  </div>

                  <div className="bg-black/20 rounded p-3 space-y-2">
                    {/* Stake */}
                    <div className="flex justify-between items-center">
                      <p className="text-white/60 text-sm">Stake</p>
                      <p className="text-white font-semibold">₦{payout.stake.toLocaleString()}</p>
                    </div>

                    {/* Potential Return */}
                    <div className="flex justify-between items-center border-t border-white/10 pt-2">
                      <p className="text-white/60 text-sm">Potential Return</p>
                      <p className="text-emerald-400 font-bold">₦{payout.potentialReturn.toLocaleString()}</p>
                    </div>

                    {/* Profit */}
                    <div className="flex justify-between items-center">
                      <p className="text-white/60 text-sm">Profit</p>
                      <p className="text-emerald-400 font-bold">₦{payout.profit.toLocaleString()}</p>
                    </div>

                    {/* ROI */}
                    <div className="flex justify-between items-center border-t border-white/10 pt-2">
                      <p className="text-white/60 text-sm">ROI</p>
                      <p className={`font-bold ${payout.roi >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {payout.roi >= 0 ? '+' : ''}{payout.roi.toFixed(1)}%
                      </p>
                    </div>
                  </div>

                  {/* Stake Input */}
                  <div>
                    <p className="text-primary/60 text-xs mb-2">Adjust Stake</p>
                    <input
                      type="number"
                      value={stake}
                      onChange={(e) => setStake(parseInt(e.target.value) || 1000)}
                      className="w-full bg-white/5 border border-primary/30 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-primary"
                    />
                  </div>

                  <button className="w-full bg-primary hover:bg-primary/80 text-black font-bold py-3 rounded-lg transition">
                    Place Bet
                  </button>
                </div>
              )}

              {!payout && picks.length > 0 && (
                <p className="text-white/60 text-sm text-center">Loading...</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
