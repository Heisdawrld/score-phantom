import { Link } from "wouter";
import { useAuth, useLogout } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { LogOut, User, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function Header() {
  const { data: user, isLoading } = useAuth();
  const logout = useLogout();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/5 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-b from-panel-light to-panel border border-primary/20 flex items-center justify-center shadow-[0_0_15px_rgba(16,231,116,0.15)] group-hover:shadow-[0_0_20px_rgba(16,231,116,0.25)] transition-all">
            <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Logo" className="w-6 h-6 object-contain" />
          </div>
          <span className="font-display text-2xl tracking-wider text-white">SCORE<span className="text-primary">PHANTOM</span></span>
        </Link>

        <div className="flex items-center gap-4">
          {!isLoading && user && (
            <>
              {user.access_status === 'trial' && (
                <Link href="/paywall">
                  <Badge variant="outline" className="hidden sm:flex border-primary/50 text-primary bg-primary/5 gap-1 hover:bg-primary/10 cursor-pointer">
                    <Zap className="w-3 h-3" /> Trial Active
                  </Badge>
                </Link>
              )}
              {user.access_status === 'expired' && (
                <Link href="/paywall">
                  <Badge variant="destructive" className="hidden sm:flex cursor-pointer hover:bg-destructive/20">
                    Upgrade Required
                  </Badge>
                </Link>
              )}
              {user.access_status === 'active' && (
                <Badge variant="high" className="hidden sm:flex">Premium</Badge>
              )}

              <Button variant="glass" size="icon" className="rounded-full" onClick={logout}>
                <LogOut className="w-4 h-4 text-muted-foreground" />
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
