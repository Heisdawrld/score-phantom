import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth, useLogout } from "@/hooks/use-auth";
import { Zap, Crown, LogOut, User, Copy, Check, ChevronDown, LayoutDashboard, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

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
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-b from-panel-light to-panel border border-primary/20 flex items-center justify-center shadow-[0_0_15px_rgba(16,231,116,0.15)] group-hover:shadow-[0_0_20px_rgba(16,231,116,0.25)] transition-all">
            <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Logo" className="w-6 h-6 object-contain" />
          </div>
          <span className="font-display text-2xl tracking-wider text-white">SCORE<span className="text-primary">PHANTOM</span></span>
        </Link>

        {/* Nav links + right side */}
        <div className="flex items-center gap-4">
          {/* Dashboard nav link — visible when not on / */}
          {!isLoading && user && location !== "/" && (
            <Link href="/">
              <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-white transition-colors">
                <LayoutDashboard className="w-4 h-4" />
                <span className="hidden sm:inline">Dashboard</span>
              </button>
            </Link>
          )}

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

                  {/* User details */}
                  <div className="px-4 py-3 space-y-2.5 border-b border-white/8">
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs text-muted-foreground flex-1 truncate">{user.email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {user.access_status === "active" ? (
                        <Crown className="w-3.5 h-3.5 text-primary shrink-0" />
                      ) : (
                        <Zap className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                      )}
                      <span className="text-xs text-white font-medium">
                        {user.access_status === "active"
                          ? "Premium Plan"
                          : user.access_status === "trial"
                          ? "Free Trial (10 predictions/day)"
                          : "Plan Expired"}
                      </span>
                    </div>
                    {user.id && (
                      <div className="flex items-center gap-2">
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

                  {/* Upgrade CTA for non-premium */}
                  {user.access_status !== "active" && (
                    <div className="px-4 py-2.5 border-b border-white/8">
                      <Link href="/paywall" onClick={() => setOpen(false)}>
                        <div className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/10 border border-primary/20 hover:bg-primary/15 transition-all cursor-pointer">
                          <Crown className="w-3.5 h-3.5 text-primary shrink-0" />
                          <span className="text-xs font-bold text-primary">Upgrade to Premium</span>
                        </div>
                      </Link>
                    </div>
                  )}


                  {/* Admin link — only shown if admin email matches */}
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
