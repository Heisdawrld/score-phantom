import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { LayoutDashboard, Flame, Calculator, Trophy, BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/top-picks", label: "Top Picks", icon: Flame },
  { href: "/acca-calculator", label: "ACCA", icon: Calculator },
  { href: "/track-record", label: "Record", icon: Trophy },
  { href: "/results", label: "Results", icon: BarChart2 },
];

export function BottomNav() {
  const { data: user } = useAuth();
  const [location] = useLocation();

  // Only show for authenticated users, hide on auth pages
  if (!user) return null;
  const hiddenPaths = ["/login", "/signup", "/home", "/reset-password", "/admin", "/paywall", "/terms", "/privacy"];
  if (hiddenPaths.some((p) => location === p || location.startsWith("/admin"))) return null;

  return (
    <>
      {/* Spacer so content isn't hidden behind the nav on mobile */}
      <div className="h-20 md:hidden" />

      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
        {/* Gradient fade above nav */}
        <div className="h-6 bg-gradient-to-t from-background to-transparent pointer-events-none" />

        <div className="bg-background/90 backdrop-blur-xl border-t border-white/8 px-2 pb-safe">
          <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const isActive =
                href === "/" ? location === "/" : location.startsWith(href);
              return (
                <Link key={href} href={href}>
                  <button
                    className={cn(
                      "flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-xl transition-all duration-200 min-w-[56px]",
                      isActive
                        ? "text-primary"
                        : "text-white/40 hover:text-white/70"
                    )}
                  >
                    <div
                      className={cn(
                        "relative flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200",
                        isActive &&
                          "bg-primary/10 shadow-[0_0_12px_rgba(16,231,116,0.25)]"
                      )}
                    >
                      <Icon
                        className={cn(
                          "w-5 h-5 transition-all duration-200",
                          isActive && "drop-shadow-[0_0_6px_rgba(16,231,116,0.8)]"
                        )}
                      />
                      {/* Active dot indicator */}
                      {isActive && (
                        <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                      )}
                    </div>
                    <span
                      className={cn(
                        "text-[10px] font-medium leading-none transition-all duration-200",
                        isActive ? "text-primary" : "text-white/40"
                      )}
                    >
                      {label}
                    </span>
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
