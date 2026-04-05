import { useState, useRef, useEffect } from "react";
import { NotificationCenter } from '@/components/NotificationCenter';
import { Link, useLocation } from "wouter";
import { useAuth, useLogout } from "@/hooks/use-auth";
import {
  Zap, Crown, LogOut, User, Copy, Check, ChevronDown,
  LayoutDashboard, ShieldCheck, Flame, Calculator, Trophy, BarChart2, Star
} from "lucide-react";
import { cn } from "@/lib/utils";

const DESKTOP_NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/top-picks", label: "Top Picks", icon: Flame },
  { href: "/acca-calculator", label: "ACCA", icon: Calculator },
  { href: "/track-record", label: "Record", icon: Trophy },
  { href: "/results", label: "Results", icon: BarChart2 },
];

function PlanBadge({ status }: { status: string }) {
  if (status === "active")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold text-primary px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">
        <Crown className="w-3 h-3" /> Premium
      </span>
    );
  if (status === "trial")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold text-orange-400 px-2 py-0.5 rounded-full bg-orange-400/10 border border-orange-400/20">
        <Zap className="w-3 h-3" /> Free Trial
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground px-2 py-0.5 rounded-full bg-white/5 border border-white/10">
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

  const initials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : "SP";

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/5 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 group shrink-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-b from-panel-light to-panel border border-primary/20 flex items-center justify-center shadow-[0_0_15px_rgba(16,231,116,0.15)] group-hover:shadow-[0_0_20px_rgba(16,231,116,0.25)] transition-all">
            <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Logo" className="w-6 h-6 object-contain" />
          </div>
          <span className="font-display text-2xl tracking-wider text-white">SCORE<span className="text-primary">PHANTOM</span></span>
        </Link>

        {/* Desktop Nav — hidden on mobile, shown md+ */}
        {!isLoading && user && (
          <nav className="hidden md:flex items-center gap-1 flex-1 justify-center">
            {DESKTOP_NAV.map(({ href, label, icon: Icon }) => {
              const isActive = href === "/" ? location === "/" : location.startsWith(href);
              return (
                <Link key={href} href={href}>
                  <button
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                      isActive
                        ? "text-primary bg-primary/10 border border-primary/20"
                        : "text-white/50 hover:text-white hover:bg-white/5"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                    {isActive && <span className="absolute -bottom-1 left-0 right-0 h-0.5 bg-primary rounded-full transition-all duration-300" />}
                  </button>
                </Link>
              );
            })}
          </nav>
        )}

        <NotificationCenter />
        {/* Right side — avatar dropdown */}
        <div className="flex items-center gap-3 shrink-0">
          {!isLoading && user && (
            <div ref={ref} className="relative">
              {/* Avatar button */}
              <button
                onClick={() => setOpen((o) => !o)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 hover:border-primary/30 transition-all"
              >
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary/40 to-primary/10 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                  {initials}
                </div>
                <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
              </button>

              {/* Dropdown */}
              {open && (
                <div className="absolute right-0 top-full mt-2 w-72 rounded-2xl border border-white/10 bg-panel shadow-2xl shadow-black/50 overflow-hidden z-50">
                  {/* Header strip */}
                  <div className="px-4 py-3 border-b border-white/8 bg-white/3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/40 to-primary/10 border border-primary/30 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{user.email}</p>
                        <div className="mt-1">
                          <PlanBadge status={user.access_status || "trial"} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Plan details */}
                  <div className="px-4 py-3 space-y-2.5 border-b border-white/8">
                    <div className="flex items-center gap-2">
                      {user.access_status === "active" ? (
                        <Crown className="w-3.5 h-3.5 text-primary shrink-0" />
                      ) : (
                        <Zap className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                      )}
                      <span className="text-xs text-white font-medium">
                        {user.access_status === "active"
                          ? "Premium Plan — Full Access"
                          : user.access_status === "trial"
                          ? "Free Trial (3 predictions/day)"
                          : "Plan Expired"}
                      </span>
                    </div>
                    {user.id && (
                      <div className="flex items-center gap-2">
                        <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="text-xs text-muted-foreground font-mono flex-1">
                          ID: #{String(user.id).padStart(5, "0")}
                        </span>
                        <button
                          onClick={copyId}
                          className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors"
                        >
                          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          {copied ? "Copied" : "Copy"}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* League Favorites — not in main nav */}
                  <div className="px-2 py-2 border-b border-white/8">
                    <Link href="/league-favorites" onClick={() => setOpen(false)}>
                      <div className="px-3 py-2 rounded-lg hover:bg-white/5 transition-all cursor-pointer flex items-center gap-2">
                        <Star className="w-3.5 h-3.5 text-yellow-400" />
                        <span className="text-sm text-white/70 hover:text-white">League Favorites</span>
                      </div>
                    </Link>
                  </div>

                  {/* Upgrade CTA for non-premium */}
                  {user.access_status !== "active" && (
                    <div className="px-4 py-2.5 border-b border-white/8">
                      <Link href="/paywall" onClick={() => setOpen(false)}>
                        <div className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/10 border border-primary/20 hover:bg-primary/15 transition-all cursor-pointer">
                          <Crown className="w-3.5 h-3.5 text-primary shrink-0" />
                          <span className="text-xs font-bold text-primary">Upgrade to Premium — ₦3,000/mo</span>
                        </div>
                      </Link>
                    </div>
                  )}

                  {/* Admin link */}
                  {user.email?.toLowerCase() === (import.meta.env.VITE_ADMIN_EMAIL || '').toLowerCase() && (
                    <div className="px-4 py-2.5 border-b border-white/8">
                      <Link href="/admin" onClick={() => setOpen(false)}>
                        <div className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/8 transition-all cursor-pointer">
                          <ShieldCheck className="w-3.5 h-3.5 text-primary shrink-0" />
                          <span className="text-xs font-bold text-white">Admin Panel</span>
                        </div>
                      </Link>
                    </div>
                  )}

                  {/* Logout */}
                  <div className="px-4 py-2.5">
                    <button
                      onClick={() => { logout(); setOpen(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/5 transition-all group"
                    >
                      <LogOut className="w-3.5 h-3.5 text-muted-foreground group-hover:text-red-400 transition-colors" />
                      <span className="text-xs text-muted-foreground group-hover:text-red-400 transition-colors font-medium">Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
