import { useLocation, Link } from 'wouter';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/use-auth';
import { Home, Flame, User, Dna } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/picks", label: "Picks", icon: Flame },
  { href: "/simulator", label: "Sim", icon: Dna },
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
      <div className="h-20 md:hidden" />
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
        {/* Fade gradient above nav */}
        <div className="h-6 bg-gradient-to-t from-[#060a0e] to-transparent pointer-events-none" />
        
        {/* Nav bar */}
        <div className="bg-[#060a0e]/95 backdrop-blur-2xl border-t border-white/[0.06] pb-safe">
          <div className="flex items-center justify-around h-[56px] max-w-lg mx-auto px-2">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const isActive = href === '/' ? location === '/' : location.startsWith(href);
              return (
                <Link key={href} href={href}>
                  <button
                    className={cn(
                      "relative flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-2xl py-1 transition-all duration-300",
                      isActive ? "text-primary" : "text-white/40 hover:text-white/70"
                    )}
                  >
                    {isActive && (
                      <motion.div layoutId="nav-pill" className="absolute inset-0 rounded-2xl bg-primary/10" transition={{ type: "spring", bounce: 0.2, duration: 0.6 }} />
                    )}
                    <div className="relative z-10 flex flex-col items-center gap-1">
                      <Icon className="h-[18px] w-[18px]" strokeWidth={isActive ? 2.5 : 2} />
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
