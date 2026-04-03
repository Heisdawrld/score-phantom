import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/layout/Header";
import { fetchApi } from "@/lib/api";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";

export default function TrackRecord() {
  const [, setLocation] = useLocation();
  
  const { data, isLoading, error } = useQuery({
    queryKey: ["track-record"],
    queryFn: () => fetchApi("/api/track-record?days=30"),
  });

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

  const stats = data?.overallStats || { totalPicks: 0, wins: 0, losses: 0, voids: 0, winRate: 0 };
  const byMarket = data?.byMarket || [];

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
          <h1 className="text-3xl font-bold">📊 Track Record</h1>
        </div>

        {/* Overall Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white/5 border border-white/10 rounded-lg p-6">
            <p className="text-white/60 text-sm mb-2">Total Picks</p>
            <p className="text-3xl font-bold text-white">{stats.totalPicks}</p>
          </div>
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-6">
            <p className="text-emerald-400 text-sm mb-2">Wins</p>
            <p className="text-3xl font-bold text-emerald-400">{stats.wins}</p>
          </div>
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6">
            <p className="text-red-400 text-sm mb-2">Losses</p>
            <p className="text-3xl font-bold text-red-400">{stats.losses}</p>
          </div>
          <div className={`${stats.winRate >= 50 ? 'bg-primary/10 border-primary/30' : 'bg-yellow-500/10 border-yellow-500/30'} border rounded-lg p-6`}>
            <p className={stats.winRate >= 50 ? 'text-primary text-sm mb-2' : 'text-yellow-500 text-sm mb-2'}>Win Rate</p>
            <p className={`text-3xl font-bold ${stats.winRate >= 50 ? 'text-primary' : 'text-yellow-500'}`}>
              {stats.winRate.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Market Breakdown */}
        {byMarket.length > 0 && (
          <div className="bg-white/5 border border-white/10 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-6">Performance by Market</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left p-3 text-white/70">Market</th>
                    <th className="text-center p-3 text-white/70">Picks</th>
                    <th className="text-center p-3 text-white/70">Wins</th>
                    <th className="text-center p-3 text-white/70">Losses</th>
                    <th className="text-center p-3 text-primary">Win Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {byMarket.map((market, idx) => (
                    <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition">
                      <td className="p-3 text-white capitalize">{market.market}</td>
                      <td className="text-center p-3 text-white">{market.totalPicks}</td>
                      <td className="text-center p-3 text-emerald-400">{market.wins}</td>
                      <td className="text-center p-3 text-red-400">{market.losses}</td>
                      <td className="text-center p-3 text-primary font-bold">{market.winRate.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {stats.totalPicks === 0 && (
          <div className="bg-white/5 border border-white/10 rounded-lg p-12 text-center">
            <p className="text-white/60 mb-2">No predictions tracked yet</p>
            <p className="text-white/40 text-sm">Make predictions to build your track record!</p>
          </div>
        )}
      </div>
    </div>
  );
}
