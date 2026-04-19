import { useLocation, Link } from 'wouter';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/use-auth';
import { Home, Zap, Flame, User, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/acca", label: "ACCA", icon: Zap },
  { href: "/picks", label: "Picks", icon: Flame },
  { href: "/track-record", label: "Stats", icon: Activity },
  { href: "/profile", label: "Profile", icon: User },
];

export function BottomNav() {
  const { data: user } = useAuth();
  const [location] = useLocation();
  if (!user) return null;
  const hiddenPaths = ['/login','/signup','/home','/reset-password','/admin','/paywall','/terms','/privacy','/verify-email'];
  if (hiddenPaths.some(p => location === p || location.startsWith('/admin'))) return null;

  return (
    <>
      {/* Spacer for mobile */}
      <div className="h-24 md:hidden" />
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
        {/* Fade gradient above nav */}
        <div className="h-8 bg-gradient-to-t from-[#060a0e] to-transparent pointer-events-none" />
        
        {/* Nav bar */}
        <div className="bg-[#060a0e]/95 backdrop-blur-2xl border-t border-white/[0.06] pb-safe">
          <div className="flex items-center justify-around h-[60px] max-w-lg mx-auto px-2">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const isActive = href === '/' ? location === '/' : location.startsWith(href);
              return (
                <Link key={href} href={href}>
                  <button
                    className={cn(
                      "flex flex-col items-center justify-center w-full h-full gap-1 py-1 rounded-2xl transition-all duration-300 relative",
                      isActive ? "text-primary" : "text-white/40 hover:text-white/70"
                    )}
                  >
                    {isActive && (
                      <motion.div layoutId="nav-pill" className="absolute inset-0 bg-primary/10 rounded-2xl" transition={{ type: "spring", bounce: 0.2, duration: 0.6 }} />
                    )}
                    <div className="relative z-10 flex flex-col items-center gap-1">
                      <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
                      <span className={cn("text-[9px] font-bold uppercase tracking-widest", isActive ? "text-primary" : "text-white/40")}>
                        {label}
                      </span>
                    </div>
                  </button>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </>
  );
}
