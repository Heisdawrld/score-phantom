import { useState, useRef, useEffect } from "react";
import { NotificationCenter } from '@/components/NotificationCenter';
import { Link, useLocation } from "wouter";
import { useAuth, useLogout } from "@/hooks/use-auth";
import {
  Zap, Crown, LogOut, User, Copy, Check, ChevronDown,
  LayoutDashboard, ShieldCheck, Flame, Trophy, BarChart2, Star
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const DESKTOP_NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/picks", label: "Top Picks", icon: Flame },
  { href: "/acca", label: "Daily ACCA", icon: Zap },
  { href: "/track-record", label: "Record", icon: Trophy },
  { href: "/results", label: "Results", icon: BarChart2 },
];

function PlanBadge({ status }: { status: string }) {
  if (status === "active")
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-primary px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/20 uppercase tracking-widest">
        <Crown className="w-3 h-3" /> Premium
      </span>
    );
  if (status === "trial")
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-amber-400 px-2.5 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/20 uppercase tracking-widest">
        <Zap className="w-3 h-3" /> Free Trial
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-white/30 px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 uppercase tracking-widest">
      Expired
    </span>
  );
}

export function Header() {
  const { data: user, isLoading } = useAuth();
  const logout = useLogout();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [location] = useLocation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function copyId() {
    if (!user?.id) return;
    navigator.clipboard.writeText(String(user.id));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const displayUsername = (user as any)?.username || (user?.email ? user.email.split("@")[0] : "SP");
  const initials = displayUsername.slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/[0.02] bg-[#060a0e]/80 backdrop-blur-2xl">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-4 group shrink-0">
          <div className="w-10 h-10 rounded-full bg-white/[0.02] border border-white/[0.05] flex items-center justify-center shadow-[0_0_15px_rgba(16,231,116,0.05)] group-hover:shadow-[0_0_20px_rgba(16,231,116,0.15)] transition-all overflow-hidden p-1.5">
            <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Logo" className="w-full h-full object-contain" />
          </div>
          <span className="font-display text-2xl tracking-wider text-white hidden sm:block">SCORE<span className="text-primary">PHANTOM</span></span>
        </Link>

        {/* Desktop Nav — hidden on mobile, shown md+ */}
        {!isLoading && user && (
          <nav className="hidden lg:flex items-center gap-1 flex-1 justify-center">
            {DESKTOP_NAV.map(({ href, label, icon: Icon }) => {
              const isActive = href === "/" ? location === "/" : location.startsWith(href);
              return (
                <Link key={href} href={href}>
                  <button
                    className={cn(
                      "relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all duration-300",
                      isActive
                        ? "text-primary bg-primary/8"
                        : "text-white/40 hover:text-white hover:bg-white/5"
                    )}
                  >
                    <Icon className={cn("w-4 h-4 transition-transform", isActive ? "scale-110" : "opacity-60")} />
                    {label}
                    {isActive && (
                      <motion.div 
                        layoutId="nav-active"
                        className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full shadow-[0_0_8px_rgba(16,231,116,0.5)]" 
                      />
                    )}
                  </button>
                </Link>
              );
            })}
          </nav>
        )}

        {/* Mobile Logo centered (optional but let's keep it simple) */}

        {/* Right side — Notification + User */}
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <NotificationCenter />
          
          {!isLoading && user && (
            <div ref={ref} className="relative">
              {/* Avatar button */}
              <button
                onClick={() => setOpen((o) => !o)}
                className={cn(
                  "flex items-center gap-2 px-2.5 py-1.5 rounded-full transition-all border",
                  open 
                    ? "bg-white/10 border-white/20" 
                    : "bg-white/[0.04] border-white/[0.08] hover:bg-white/[0.08] hover:border-white/15"
                )}
              >
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/20 flex items-center justify-center text-[10px] font-black text-primary shrink-0 shadow-[0_0_10px_rgba(16,231,116,0.1)]">
                  {initials}
                </div>
                <span className="hidden sm:block text-xs font-bold text-white/70">Account</span>
                <ChevronDown className={cn("w-3.5 h-3.5 text-white/30 transition-transform", open && "rotate-180")} />
              </button>

              {/* Dropdown */}
              <AnimatePresence>
                {open && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="absolute right-0 top-full mt-3 w-72 rounded-2xl border border-white/[0.08] bg-panel/95 backdrop-blur-2xl shadow-2xl shadow-black/80 overflow-hidden z-50 pointer-events-auto"
                  >
                    {/* Header strip */}
                    <div className="px-5 py-4 border-b border-white/[0.05] bg-white/[0.02]">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/20 flex items-center justify-center text-sm font-black text-primary shrink-0">
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-black text-white truncate">{(user as any)?.username ? `@${(user as any).username}` : user.email}</p>
                          {(user as any)?.username && <p className="text-[10px] text-white/30 truncate">{user.email}</p>}
                          <div className="mt-1.5">
                            <PlanBadge status={user.access_status || "trial"} />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Quick Info */}
                    <div className="px-5 py-3.5 space-y-3 border-b border-white/[0.05]">
                      <div className="flex items-center gap-3">
                        <ShieldCheck className="w-4 h-4 text-primary shrink-0 opacity-70" />
                        <span className="text-[11px] font-bold text-white/50 leading-none">
                          {user.access_status === "active"
                            ? "PREMIUM ACTIVE"
                            : user.access_status === "trial"
                            ? "TRIAL ACTIVE"
                            : "SUBSCRIPTION EXPIRED"}
                        </span>
                      </div>
                      {user.id && (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <User className="w-4 h-4 text-white/30 shrink-0" />
                            <span className="text-[11px] font-mono text-white/40">
                              ID: #{String(user.id).padStart(5, "0")}
                            </span>
                          </div>
                          <button
                            onClick={copyId}
                            className="flex items-center gap-1.5 text-[10px] font-black text-primary hover:text-primary/80 transition-colors uppercase"
                          >
                            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            {copied ? "Copied" : "Copy"}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Menu Items */}
                    <div className="p-2 border-b border-white/[0.05]">
                      <Link href="/profile" onClick={() => setOpen(false)}>
                        <div className="px-4 py-2.5 rounded-xl hover:bg-white/[0.04] transition-all cursor-pointer flex items-center gap-3 text-white/60 hover:text-white">
                          <User className="w-4 h-4" />
                          <span className="text-xs font-bold">Profile Settings</span>
                        </div>
                      </Link>
                      <Link href="/league-favorites" onClick={() => setOpen(false)}>
                        <div className="px-4 py-2.5 rounded-xl hover:bg-white/[0.04] transition-all cursor-pointer flex items-center gap-3 text-white/60 hover:text-white">
                          <Star className="w-4 h-4 text-amber-400" />
                          <span className="text-xs font-bold">Leagues Tracker</span>
                        </div>
                      </Link>
                      {/* Admin link */}
                      {user.email?.toLowerCase() === (import.meta.env.VITE_ADMIN_EMAIL || '').toLowerCase() && (
                        <Link href="/admin" onClick={() => setOpen(false)}>
                          <div className="px-4 py-2.5 rounded-xl hover:bg-primary/10 transition-all cursor-pointer flex items-center gap-3 text-primary">
                            <ShieldCheck className="w-4 h-4" />
                            <span className="text-xs font-bold">Admin Panel</span>
                          </div>
                        </Link>
                      )}
                    </div>

                    {/* Upgrade CTA */}
                    {user.access_status !== "active" && (
                      <div className="p-3">
                        <Link href="/paywall" onClick={() => setOpen(false)}>
                          <div className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-primary text-black font-black text-xs hover:brightness-110 transition-all cursor-pointer shadow-[0_0_15px_rgba(16,231,116,0.2)]">
                            <Crown className="w-3.5 h-3.5" />
                            <span>UPGRADE NOW</span>
                          </div>
                        </Link>
                      </div>
                    )}

                    {/* Logout */}
                    <div className="p-2 bg-white/[0.02]">
                      <button
                        onClick={() => { logout(); setOpen(false); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-red-500/10 transition-all group"
                      >
                        <LogOut className="w-4 h-4 text-white/20 group-hover:text-red-400 transition-colors" />
                        <span className="text-xs font-bold text-white/40 group-hover:text-red-400 transition-colors">Sign Out</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
