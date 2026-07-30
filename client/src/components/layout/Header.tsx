import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  Check,
  ChevronDown,
  Copy,
  Crown,
  Dna,
  Flame,
  Gauge,
  LogOut,
  Settings,
  ShieldCheck,
  Sparkles,
  Trophy,
  User,
  Zap,
} from "lucide-react";
import { NotificationCenter } from "@/components/NotificationCenter";
import { useAuth, useLogout } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

const DESKTOP_NAV = [
  { href: "/", label: "Overview", icon: Gauge },
  { href: "/picks", label: "Top Picks", icon: Flame },
  { href: "/acca", label: "ACCA Lab", icon: Zap },
  { href: "/simulator", label: "Simulator", icon: Dna },
];

function PlanBadge({ status }: { status: string }) {
  if (status === "active") {
    return (
      <span className="sp-status-badge sp-status-badge--premium">
        <Crown className="h-3 w-3" /> Premium
      </span>
    );
  }
  if (status === "trial") {
    return (
      <span className="sp-status-badge sp-status-badge--trial">
        <Zap className="h-3 w-3" /> Trial
      </span>
    );
  }
  return <span className="sp-status-badge">Expired</span>;
}

export function Header() {
  const { data: user, isLoading } = useAuth();
  const logout = useLogout();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [location] = useLocation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (isLoading || !user) return null;

  const displayUsername =
    (user as any)?.username || (user.email ? user.email.split("@")[0] : "Member");
  const initials = displayUsername.slice(0, 2).toUpperCase();
  const isBasketball = location.startsWith("/basketball");

  const copyId = async () => {
    if (!user.id) return;
    await navigator.clipboard.writeText(String(user.id));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <header className="sp-header">
      <div className="sp-header__inner">
        <Link href="/" className="sp-brand" aria-label="ScorePhantom overview">
          <span className="sp-brand__mark">
            <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="" />
          </span>
          <span className="sp-brand__copy">
            <span className="sp-brand__wordmark">
              SCORE<span>PHANTOM</span>
            </span>
            <span className="sp-brand__season">Football intelligence · 26/27</span>
          </span>
        </Link>

        <nav className="sp-header__nav" aria-label="Primary navigation">
          {DESKTOP_NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? location === "/" : location.startsWith(href);
            return (
              <Link href={href} key={href}>
                <span className={cn("sp-header__nav-item", active && "is-active")}>
                  <Icon aria-hidden="true" />
                  {label}
                  {active && <motion.span layoutId="desktop-nav-line" className="sp-header__nav-line" />}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="sp-header__actions">
          <div className="sp-sport-switch" aria-label="Choose sport">
            <Link href="/">
              <span className={cn("sp-sport-switch__item", !isBasketball && "is-active")}>
                Football
              </span>
            </Link>
            <Link href="/basketball">
              <span className={cn("sp-sport-switch__item", isBasketball && "is-basketball")}>
                Basketball
              </span>
            </Link>
          </div>

          <span className="sp-live-signal" title="Live data feed connected">
            <span />
            Live
          </span>

          <NotificationCenter />

          <div ref={ref} className="relative">
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              className={cn("sp-account-trigger", open && "is-open")}
              aria-haspopup="menu"
              aria-expanded={open}
            >
              <span className="sp-account-trigger__avatar">{initials}</span>
              <span className="sp-account-trigger__copy">
                <strong>{displayUsername}</strong>
                <small>{user.access_status === "active" ? "Premium" : user.access_status}</small>
              </span>
              <ChevronDown className={cn("h-3.5 w-3.5", open && "rotate-180")} />
            </button>

            <AnimatePresence>
              {open && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.97 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="sp-account-menu"
                  role="menu"
                >
                  <div className="sp-account-menu__profile">
                    <div className="sp-account-menu__avatar">{initials}</div>
                    <div className="min-w-0">
                      <p>@{displayUsername}</p>
                      <small>{user.email}</small>
                      <PlanBadge status={user.access_status || "trial"} />
                    </div>
                  </div>

                  <div className="sp-account-menu__signal">
                    <ShieldCheck />
                    <div>
                      <span>Account protected</span>
                      <small>Secure session active</small>
                    </div>
                  </div>

                  {user.id && (
                    <button type="button" onClick={copyId} className="sp-account-menu__id">
                      <span>Member #{String(user.id).padStart(5, "0")}</span>
                      <span>{copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy ID"}</span>
                    </button>
                  )}

                  <div className="sp-account-menu__links">
                    <Link href="/profile" onClick={() => setOpen(false)}>
                      <span><User /> Profile</span>
                    </Link>
                    <Link href="/track-record" onClick={() => setOpen(false)}>
                      <span><BarChart3 /> Track record</span>
                    </Link>
                    <Link href="/league-favorites" onClick={() => setOpen(false)}>
                      <span><Trophy /> League tracker</span>
                    </Link>
                    <Link href="/settings" onClick={() => setOpen(false)}>
                      <span><Settings /> Settings</span>
                    </Link>
                  </div>

                  {user.access_status !== "active" && (
                    <Link href="/paywall" onClick={() => setOpen(false)}>
                      <span className="sp-account-menu__upgrade">
                        <Sparkles /> Upgrade to Premium
                      </span>
                    </Link>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      logout();
                      setOpen(false);
                    }}
                    className="sp-account-menu__logout"
                  >
                    <LogOut /> Sign out
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </header>
  );
}
