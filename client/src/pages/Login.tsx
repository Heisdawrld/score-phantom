import { useState } from "react";
import { useGoogleSignIn } from "@/hooks/use-auth";
import { Chrome } from "lucide-react";

export default function Login() {
  const googleSignIn = useGoogleSignIn();
  const [error, setError] = useState("");

  const handleGoogle = async () => {
    setError("");
    googleSignIn.mutate(undefined, {
      onError: (err: any) => {
        const msg = err?.message || "Sign in failed";
        // Friendly message for popup-closed
        if (msg.includes("popup-closed") || msg.includes("cancelled")) {
          setError("Sign-in cancelled. Tap the button to try again.");
        } else if (msg.includes("popup-blocked")) {
          setError("Popup was blocked. Please allow popups for this site.");
        } else {
          setError(msg);
        }
      },
    });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 z-0">
        <img
          src={`${import.meta.env.BASE_URL}images/auth-bg.png`}
          alt=""
          className="w-full h-full object-cover opacity-40 mix-blend-screen"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
      </div>

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center gap-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-4">
          <div className="w-20 h-20 rounded-2xl bg-panel border border-primary/20 flex items-center justify-center shadow-[0_0_40px_rgba(16,231,116,0.2)]">
            <img
              src={`${import.meta.env.BASE_URL}images/logo.png`}
              alt="ScorePhantom"
              className="w-12 h-12 object-contain"
            />
          </div>
          <div className="text-center">
            <h1 className="font-display text-4xl tracking-widest text-white">
              SCORE<span className="text-primary">PHANTOM</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              AI-powered football predictions
            </p>
          </div>
        </div>

        {/* Sign-in card */}
        <div className="w-full bg-panel/60 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 flex flex-col items-center gap-6">
          <div className="text-center">
            <p className="text-white font-semibold text-lg">Get started free</p>
            <p className="text-muted-foreground text-sm mt-1">
              1-day free trial · No credit card required
            </p>
          </div>

          {/* Google button */}
          <button
            onClick={handleGoogle}
            disabled={googleSignIn.isPending}
            className="w-full flex items-center justify-center gap-3 bg-white text-gray-800 font-semibold text-[15px] py-3.5 px-6 rounded-2xl hover:bg-gray-50 active:scale-[0.98] transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed shadow-lg"
          >
            {googleSignIn.isPending ? (
              <div className="w-5 h-5 rounded-full border-2 border-gray-300 border-t-gray-700 animate-spin" />
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )}
            {googleSignIn.isPending ? "Signing in…" : "Continue with Google"}
          </button>

          {error && (
            <p className="text-sm text-red-400 text-center -mt-2">{error}</p>
          )}

          <p className="text-xs text-muted-foreground text-center leading-relaxed">
            By continuing, you agree to our terms of service.
            <br />
            Your Google account keeps things secure — no passwords needed.
          </p>
        </div>

        {/* Stats teaser */}
        <div className="flex items-center gap-6 text-center">
          <div>
            <p className="text-primary font-black text-xl">500+</p>
            <p className="text-xs text-muted-foreground">matches/week</p>
          </div>
          <div className="w-px h-8 bg-white/10" />
          <div>
            <p className="text-primary font-black text-xl">AI</p>
            <p className="text-xs text-muted-foreground">predictions</p>
          </div>
          <div className="w-px h-8 bg-white/10" />
          <div>
            <p className="text-primary font-black text-xl">134+</p>
            <p className="text-xs text-muted-foreground">users</p>
          </div>
        </div>
      </div>
    </div>
  );
}
