import { useState } from "react";
import { useAuth, useLogout } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { User, Crown, Bell, Heart, LogOut, ChevronRight, Shield, BarChart2, ExternalLink } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

export default function Profile() {
  const { data: user } = useAuth();
  const logout = useLogout();
  const [, setLocation] = useLocation();
  const isPremium = user && (user as any).has_access && (user as any).access_status === "active";
  const isTrial = user && (user as any).has_access && (user as any).access_status === "trial";
  const { data: trackData } = useQuery({
    queryKey: ["/api/track-record"],
    queryFn: () => fetchApi("/track-record?days=30"),
    staleTime: 5 * 60 * 1000,
  });
  const stats = trackData || {};
  const email = (user as any)?.email || "";
  const displayName = email.split("@")[0] || "User";
  const initials = displayName.slice(0,2).toUpperCase();

  const items = [
    { icon: BarChart2, label: "Track Record", sub: "Win rates and prediction history", action: () => setLocation("/track-record") },
    { icon: BarChart2, label: "Results Feed", sub: "All prediction outcomes", action: () => setLocation("/results") },
    { icon: Heart, label: "Favourite Leagues", sub: "Personalise your feed", action: () => setLocation("/league-favorites") },
    { icon: Bell, label: "Notifications", sub: "Push notification settings", action: () => setLocation("/") },
    { icon: Shield, label: "Privacy Policy", sub: "", action: () => setLocation("/privacy") },
  ];

  return (
    <div className="min-h-screen bg-[#090d13] pb-24">
      <div className="sticky top-0 z-10 bg-[#090d13]/95 backdrop-blur-xl border-b border-white/5 px-4 py-4">
        <h1 className="text-xl font-black text-white tracking-wide">Profile</h1>
      </div>
      <div className="px-4 py-6 flex flex-col gap-4">
        <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }}
          className="flex items-center gap-4 p-5 rounded-2xl bg-white/4 border border-white/8">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-2xl font-black text-primary">{initials}</div>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-black text-white capitalize truncate">{displayName}</p>
            <p className="text-xs text-white/40 truncate">{email}</p>
            {isPremium && <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-full px-2 py-0.5"><Crown size={10}/>PREMIUM</span>}
            {isTrial && <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 rounded-full px-2 py-0.5">FREE TRIAL</span>}
          </div>
        </motion.div>
        {(stats.wins != null) && (
          <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.05 }}
            className="grid grid-cols-3 gap-3">
            {[{label:"Win Rate",val:(stats.winRate||0).toFixed(1)+"%",color:"text-primary"},{label:"Wins",val:stats.wins||0,color:"text-emerald-400"},{label:"Losses",val:stats.losses||0,color:"text-red-400"}].map((s)=>(
              <div key={s.label} className="rounded-2xl bg-white/4 border border-white/8 p-3 text-center">
                <p className={"text-2xl font-black "+s.color}>{s.val}</p>
                <p className="text-[9px] text-white/35 uppercase tracking-wider mt-0.5">{s.label}</p>
              </div>
            ))}
          </motion.div>
        )}
        {!isPremium && (
          <motion.button initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.1 }}
            onClick={() => setLocation("/paywall")}
            className="w-full flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 to-amber-400/5 border border-amber-400/25 hover:border-amber-400/40 transition-all">
            <Crown size={20} className="text-amber-400 shrink-0"/>
            <div className="flex-1 text-left">
              <p className="text-sm font-bold text-amber-400">Upgrade to Premium</p>
              <p className="text-xs text-white/40">Unlock all predictions and odds</p>
            </div>
            <ChevronRight size={16} className="text-white/30"/>
          </motion.button>
        )}
        <div className="flex flex-col gap-2">
          {items.map(({ icon: Icon, label, sub, action }, i) => (
            <motion.button key={label} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.05*i }}
              onClick={action}
              className="flex items-center gap-4 p-4 rounded-2xl bg-white/3 border border-white/6 hover:bg-white/6 hover:border-white/12 transition-all text-left w-full">
              <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center shrink-0"><Icon size={16} className="text-white/50"/></div>
              <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-white">{label}</p>{sub && <p className="text-xs text-white/35">{sub}</p>}</div>
              <ChevronRight size={14} className="text-white/25 shrink-0"/>
            </motion.button>
          ))}
        </div>
        <motion.button initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.3 }}
          onClick={logout}
          className="flex items-center gap-3 p-4 rounded-2xl bg-red-500/8 border border-red-500/15 hover:bg-red-500/15 transition-all w-full">
          <LogOut size={18} className="text-red-400"/>
          <span className="text-sm font-semibold text-red-400">Sign Out</span>
        </motion.button>
        <p className="text-center text-[10px] text-white/15 mt-2">ScorePhantom v2.0 &bull; davidchuks229@gmail.com</p>
      </div>
    </div>
  );
}
