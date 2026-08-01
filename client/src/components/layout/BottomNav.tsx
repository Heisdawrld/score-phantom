import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Dna, Flame, Home, Layers3, User } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

const FOOTBALL_NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/acca", label: "ACCA", icon: Layers3 },
  { href: "/picks", label: "Picks", icon: Flame, feature: true },
  { href: "/simulator", label: "Sim", icon: Dna },
  { href: "/profile", label: "Account", icon: User },
];

const BASKETBALL_NAV_ITEMS = [
  { href: "/basketball", label: "Home", icon: Home },
  { href: "/basketball/acca", label: "Parlay", icon: Layers3 },
  { href: "/basketball/picks", label: "Picks", icon: Flame, feature: true },
  { href: "/basketball/simulator", label: "Sim", icon: Dna },
  { href: "/basketball/profile", label: "Account", icon: User },
];

export function BottomNav() {
  const { data: user } = useAuth();
  const [location] = useLocation();
  const isBasketball = location.startsWith("/basketball");
  const navItems = isBasketball ? BASKETBALL_NAV_ITEMS : FOOTBALL_NAV_ITEMS;
  const worldHome = isBasketball ? "/basketball" : "/";
  const hiddenPaths = [
    "/login",
    "/signup",
    "/home",
    "/reset-password",
    "/admin",
    "/paywall",
    "/terms",
    "/privacy",
    "/verify-email",
  ];

  if (!user || hiddenPaths.some((path) => location === path || location.startsWith("/admin"))) {
    return null;
  }

  return (
    <>
      <div className="h-24 md:hidden" aria-hidden="true" />
      <nav className={cn("sp-bottom-nav", isBasketball && "is-basketball")} aria-label={`${isBasketball ? "Basketball" : "Football"} mobile navigation`}>
        <div className="sp-bottom-nav__inner">
          {navItems.map(({ href, label, icon: Icon, feature }) => {
            const active = href === worldHome
              ? location === worldHome || (isBasketball && location.startsWith("/basketball/games/"))
              : location.startsWith(href);
            return (
              <Link key={href} href={href}>
                <span
                  className={cn(
                    "sp-bottom-nav__item",
                    active && "is-active",
                    feature && "is-feature"
                  )}
                >
                  {active && !feature && (
                    <motion.span
                      layoutId="mobile-nav-active"
                      className="sp-bottom-nav__active"
                      transition={{ type: "spring", bounce: 0.18, duration: 0.5 }}
                    />
                  )}
                  <span className="sp-bottom-nav__icon"><Icon /></span>
                  <span>{label}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
