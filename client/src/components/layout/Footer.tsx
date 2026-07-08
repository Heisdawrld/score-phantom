import { Link, useLocation } from "wouter";
import { Mail, MessageCircle, Shield } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

/**
 * ScorePhantom Desktop Footer
 * — Sticky to bottom on desktop (md+), hidden on mobile (BottomNav handles mobile)
 * — Shows on all authenticated pages + public pages (terms/privacy/login)
 * — Hidden on admin pages (admin has its own chrome)
 */
export function Footer() {
  const [location] = useLocation();
  const { data: user } = useAuth();

  // Hide on admin routes (they have their own layout)
  if (location.startsWith("/admin")) return null;

  // Hide on mobile — BottomNav is the mobile navigation
  // The footer is md:block so it only renders on desktop

  const year = new Date().getFullYear();

  return (
    <footer className="hidden md:block mt-auto border-t border-white/[0.04] bg-[#060a0e]/60 backdrop-blur-sm">
      <div className="container mx-auto px-6 py-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Left — Brand + copyright */}
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-white/[0.02] border border-white/[0.05] flex items-center justify-center p-1">
              <img
                src={`${import.meta.env.BASE_URL}images/logo.png`}
                alt="ScorePhantom"
                className="w-full h-full object-contain opacity-70"
              />
            </div>
            <div className="flex items-center gap-2 text-xs text-white/40">
              <span className="font-display tracking-wider text-white/60">
                SCORE<span className="text-primary/80">PHANTOM</span>
              </span>
              <span className="text-white/20">·</span>
              <span>© {year}</span>
            </div>
          </div>

          {/* Center — Legal links */}
          <nav className="flex items-center gap-6">
            <Link href="/terms">
              <span className="text-xs font-medium text-white/40 hover:text-white/70 interactive cursor-pointer">
                Terms
              </span>
            </Link>
            <Link href="/privacy">
              <span className="text-xs font-medium text-white/40 hover:text-white/70 interactive cursor-pointer">
                Privacy
              </span>
            </Link>
            {user && (
              <Link href="/billing/history">
                <span className="text-xs font-medium text-white/40 hover:text-white/70 interactive cursor-pointer">
                  Billing
                </span>
              </Link>
            )}
            <Link href={user ? "/track-record" : "/login"}>
              <span className="text-xs font-medium text-white/40 hover:text-white/70 interactive cursor-pointer">
                Track Record
              </span>
            </Link>
          </nav>

          {/* Right — Trust + contact */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-[10px] font-medium text-white/30">
              <Shield className="w-3 h-3 text-primary/50" />
              <span className="uppercase tracking-wider">Secure Checkout</span>
            </div>
            <a
              href="https://wa.me/2348000000000"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-medium text-white/40 hover:text-primary/80 interactive"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>Support</span>
            </a>
          </div>
        </div>

        {/* Bottom disclaimer line */}
        <div className="mt-4 pt-4 border-t border-white/[0.03] text-center">
          <p className="text-[10px] text-white/25 leading-relaxed max-w-3xl mx-auto">
            ScorePhantom provides data-driven predictions for informational purposes only.
            Predictions do not guarantee outcomes. Please bet responsibly — 18+ only.
            Gambling can be addictive. If you need help, contact the National Gambling Helpline.
          </p>
        </div>
      </div>
    </footer>
  );
}
