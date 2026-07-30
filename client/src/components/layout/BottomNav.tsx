import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Flame, Home, Layers3, User } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/picks", label: "Picks", icon: Flame, feature: true },
  { href: "/acca", label: "ACCA", icon: Layers3 },
  { href: "/profile", label: "Account", icon: User },
];

export function BottomNav() {
  const { data: user } = useAuth();
  const [location] = useLocation();
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
      <nav className="sp-bottom-nav" aria-label="Mobile navigation">
        <div className="sp-bottom-nav__inner">
          {NAV_ITEMS.map(({ href, label, icon: Icon, feature }) => {
            const active = href === "/" ? location === "/" : location.startsWith(href);
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
