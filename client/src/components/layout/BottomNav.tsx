import { useLocation, Link } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { Home, Zap, Flame, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/acca", label: "ACCA", icon: Zap },
  { href: "/picks", label: "Picks", icon: Flame },
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
                      'flex flex-col items-center justify-center gap-0.5 px-4 py-1.5 rounded-2xl transition-all duration-300 min-w-[60px] relative',
                      isActive
                        ? 'text-primary'
                        : 'text-white/30 hover:text-white/50'
                    )}
                  >
                    {/* Active background glow */}
                    {isActive && (
                      <div className="absolute inset-0 rounded-2xl bg-primary/[0.08] shadow-[0_0_20px_rgba(16,231,116,0.12)]" />
                    )}
                    
                    <div className="relative z-10 flex items-center justify-center w-7 h-7">
                      <Icon
                        className={cn(
                          'w-[22px] h-[22px] transition-all duration-300',
                          isActive && 'drop-shadow-[0_0_8px_rgba(16,231,116,0.7)]'
                        )}
                        strokeWidth={isActive ? 2.5 : 1.8}
                      />
                    </div>

                    <span
                      className={cn(
                        'relative z-10 text-[10px] font-semibold leading-none transition-all duration-300',
                        isActive ? 'text-primary font-bold' : 'text-white/30'
                      )}
                    >
                      {label}
                    </span>

                    {/* Active dot indicator */}
                    {isActive && (
                      <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary shadow-[0_0_6px_rgba(16,231,116,0.8)]" />
                    )}
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
