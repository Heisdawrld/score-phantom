import { useAuth, useLogout } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  Crown, Bell, Heart, LogOut, ChevronRight, Shield, BarChart2,
  CreditCard, Calendar, CheckCircle, Lock, Zap, Star, TrendingUp,
  Settings, HelpCircle, ExternalLink
} from "lucide-react";
import { fetchApi } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const P_FEATS = [
  { i: Zap, l: "Unlimited predictions — no daily cap" },
  { i: TrendingUp, l: "Real odds + value bet detection" },
  { i: Crown, l: "Daily ACCA Builder" },
  { i: Star, l: "PhantomChat — deep match analysis" },
  { i: BarChart2, l: "Top Picks ranked by edge strength" },
  { i: Shield, l: "Full track record & results history" },
];

export default function Profile() {
  const { data: user } = useAuth();
  const logout = useLogout();
  const [, nav] = useLocation();
  const { toast } = useToast();

  const isPremium = (user as any)?.access_status === "active";
  const isTrial = (user as any)?.access_status === "trial";
  const isExpired = (user as any)?.access_status === "expired";

  const email = (user as any)?.email || "";
  const username = (user as any)?.username || "";
  const dn = username || email.split("@")[0] || "User";
  const ini = dn.charAt(0).toUpperCase();

  const trialEnd = (user as any)?.trial_ends_at ? new Date((user as any).trial_ends_at) : null;
  const premEnd = (user as any)?.subscription_expires_at ? new Date((user as any).subscription_expires_at) : null;
  const fmt = (d: Date | null) => d ? d.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : null;

  const { data: td } = useQuery({
    queryKey: ["/api/track-record"],
    queryFn: () => fetchApi("/track-record?days=30"),
    staleTime: 300000,
  });
  const st = (td as any)?.overallStats || {};

  const navItems = [
    { icon: CreditCard, label: "Payment & Billing", sub: "Manage your subscription plan", go: "/billing" },
    { icon: Settings, label: "Account Settings", sub: "Preferences & notifications", go: "/settings" },
    { icon: BarChart2, label: "Track Record", sub: "Win rates & prediction history", go: "/track-record" },
    { icon: Heart, label: "Favourite Leagues", sub: "Personalise your match feed", go: "/league-favorites" },
  ];

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* ── Header ── */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-xl border-b border-white/[0.04] px-4 py-4">
        <h1 className="text-xl font-black text-white tracking-wide">Account</h1>
      </div>

      <div className="px-4 py-5 flex flex-col gap-4">
        {/* ── Profile Card ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4 p-5 rounded-2xl glass-card"
        >
          {/* Avatar */}
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/25 flex items-center justify-center text-2xl font-black text-primary shadow-[0_0_20px_rgba(16,231,116,0.1)]">
            {ini}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-black text-white capitalize truncate">{dn}</p>
            <p className="text-xs text-white/35 truncate">{email}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {isPremium && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-full px-2.5 py-0.5">
                  <Crown size={10} /> PREMIUM
                </span>
              )}
              {isTrial && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 rounded-full px-2.5 py-0.5">
                  <Zap size={10} /> FREE TRIAL
                </span>
              )}
              {isExpired && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-400/10 border border-red-400/20 rounded-full px-2.5 py-0.5">
                  <Lock size={10} /> EXPIRED
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-2.5 py-0.5">
                <CheckCircle size={10} /> Verified
              </span>
            </div>
          </div>
        </motion.div>

        {/* ── Performance Card ── */}
        {(st.wins != null) && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="rounded-2xl glass-card p-4"
          >
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-primary" />
              <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Performance (30D)</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Win Rate", val: (st.winRate || 0).toFixed(1) + "%", color: "text-primary" },
                { label: "Won", val: st.wins || 0, color: "text-emerald-400" },
                { label: "Lost", val: st.losses || 0, color: "text-red-400" },
              ].map(s => (
                <div key={s.label} className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 text-center">
                  <p className={"text-2xl font-black tabular-nums " + s.color}>{s.val}</p>
                  <p className="text-[9px] text-white/30 uppercase tracking-wider mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Subscription Card ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="rounded-2xl border overflow-hidden"
          style={{
            borderColor: isPremium ? "rgba(245,158,11,0.2)" : isTrial ? "rgba(16,231,116,0.2)" : "rgba(239,68,68,0.2)",
            background: isPremium
              ? "linear-gradient(135deg,rgba(245,158,11,0.06),rgba(0,0,0,0))"
              : isTrial
              ? "linear-gradient(135deg,rgba(16,231,116,0.05),rgba(0,0,0,0))"
              : "linear-gradient(135deg,rgba(239,68,68,0.05),rgba(0,0,0,0))",
          }}
        >
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CreditCard size={14} className={isPremium ? "text-amber-400" : isTrial ? "text-primary" : "text-red-400"} />
                <p className={"text-xs font-black uppercase tracking-widest " + (isPremium ? "text-amber-400" : isTrial ? "text-primary" : "text-red-400")}>
                  {isPremium ? "Premium Plan" : isTrial ? "Free Trial" : "Trial Expired"}
                </p>
              </div>
              {!isPremium && (
                <button onClick={() => nav("/paywall")} className="text-[10px] font-black text-black bg-primary px-3 py-1 rounded-lg hover:brightness-110 transition-all">
                  Upgrade
                </button>
              )}
            </div>

            {isPremium && premEnd && (
              <div className="flex items-center gap-2 mb-2">
                <Calendar size={12} className="text-white/30" />
                <p className="text-xs text-white/50">Active until <span className="text-white font-semibold">{fmt(premEnd)}</span></p>
                <CheckCircle size={11} className="text-primary ml-auto" />
              </div>
            )}
            {isTrial && trialEnd && (
              <div className="flex items-center gap-2 mb-2">
                <Calendar size={12} className="text-white/30" />
                <p className="text-xs text-white/50">Trial ends <span className="text-white font-semibold">{fmt(trialEnd)}</span></p>
              </div>
            )}
            {isExpired && (
              <div className="flex items-center gap-2 mb-2">
                <Lock size={12} className="text-red-400" />
                <p className="text-xs text-red-300">Your trial has expired — upgrade to continue</p>
              </div>
            )}
          </div>

          <div className="px-4 pb-4 border-t border-white/[0.04] pt-3">
            <p className="text-[9px] text-white/20 uppercase tracking-widest mb-2">
              {isPremium ? "Your access" : "Premium unlocks"}
            </p>
            <div className="grid grid-cols-1 gap-1.5">
              {P_FEATS.map(({ i: Icon, l }, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className={"w-4 h-4 rounded flex items-center justify-center shrink-0 " + (isPremium ? "text-primary" : "text-white/15")}>
                    {isPremium ? <CheckCircle size={12} /> : <Lock size={10} />}
                  </div>
                  <p className={"text-xs " + (isPremium ? "text-white/55" : "text-white/20")}>{l}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* ── Navigation Items ── */}
        <div className="flex flex-col gap-2">
          {navItems.map(({ icon: Icon, label, sub, go }, i) => (
              <motion.button
                key={label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i }}
                onClick={() => nav(go)}
                className="flex items-center gap-4 p-4 rounded-2xl glass-card glass-card-hover transition-all text-left w-full"
              >
                <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0">
                  <Icon size={16} className="text-white/45" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{label}</p>
                  {sub && <p className="text-xs text-white/30">{sub}</p>}
                </div>
                <ChevronRight size={14} className="text-white/20 shrink-0" />
              </motion.button>
            ))}
          </div>

          {/* ── Logout ── */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          onClick={logout}
          className="flex items-center gap-3 p-4 rounded-2xl bg-red-500/[0.06] border border-red-500/15 hover:bg-red-500/10 transition-all w-full"
        >
          <LogOut size={18} className="text-red-400" />
          <span className="text-sm font-semibold text-red-400">Sign Out</span>
        </motion.button>

        <p className="text-center text-[10px] text-white/10 mt-2">ScorePhantom v2.0</p>
      </div>
    </div>
  );
}
