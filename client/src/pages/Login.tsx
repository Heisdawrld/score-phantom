import { useState, useEffect } from "react";
import {
  useGoogleSignIn,
  useEmailSignIn,
  useEmailSignUp,
} from "@/hooks/use-auth";
import { Chrome, Mail, Eye, EyeOff } from "lucide-react";
import { z } from "zod";

const LoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormData = z.infer<typeof LoginSchema>;

export default function Login() {
  const [authMode, setAuthMode] = useState<
    "social" | "email-signin" | "email-signup"
  >("social");
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState<LoginFormData>({
    email: "",
    password: "",
  });
  const [errors, setErrors] = useState<Partial<LoginFormData>>({});
  const [generalError, setGeneralError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const googleSignIn = useGoogleSignIn();
  
  // Check if email was just verified
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("verified") === "success") {
      setSuccessMsg("Email verified! 🎉 Now sign in with your email and password to access ScorePhantom.");
      setAuthMode("email-signin");
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);
  const emailSignIn = useEmailSignIn();
  const emailSignUp = useEmailSignUp();

  const handleGoogleClick = async () => {
    setGeneralError("");
    googleSignIn.mutate(undefined, {
      onError: (err: any) => {
        const msg = err?.message || "Sign in failed";
        if (msg.includes("popup-closed") || msg.includes("cancelled")) {
          setGeneralError("Sign-in cancelled. Try again.");
        } else if (msg.includes("popup-blocked")) {
          setGeneralError("Popup blocked. Allow popups for this site.");
        } else if (msg.includes("Disposable email")) {
          setGeneralError("Please use a permanent email address, not a temporary one.");
        } else {
          setGeneralError(msg);
        }
      },
    });
  };

  const validateForm = () => {
    try {
      LoginSchema.parse(formData);
      setErrors({});
      return true;
    } catch (err) {
      if (err instanceof z.ZodError) {
        const newErrors: Partial<LoginFormData> = {};
        err.errors.forEach((e) => {
          const path = e.path[0] as keyof LoginFormData;
          newErrors[path] = e.message as any;
        });
        setErrors(newErrors);
      }
      return false;
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError("");
    if (!validateForm()) return;

    emailSignIn.mutate(formData, {
      onError: (err: any) => {
        const msg = err?.message || "Sign in failed";
        if (msg.includes("email_not_verified")) {
          setGeneralError("Please verify your email first. Check your inbox for a verification link. No email? Try signing up again.");
        } else if (msg.includes("Invalid credentials")) {
          setGeneralError("Incorrect email or password.");
        } else if (msg.includes("auth/too-many-requests")) {
          setGeneralError("Too many failed attempts. Try again later.");
        } else if (msg.includes("disposable")) {
          setGeneralError("Disposable emails not allowed. Use a real email.");
        } else {
          setGeneralError(msg);
        }
      },
    });
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError("");
    if (!validateForm()) return;

    emailSignUp.mutate(formData, {
      onSuccess: () => {
        setGeneralError("");
        setFormData({ email: "", password: "" });
        // Show success message
        const successMsg = "Account created! Check your email for a verification link. Click it to verify and start using ScorePhantom.";
        alert(successMsg);
      },
      onError: (err: any) => {
        const msg = err?.message || "Sign up failed";
        if (msg.includes("already registered")) {
          setGeneralError("Email already registered. Sign in instead.");
          setAuthMode("email-signin");
        } else if (msg.includes("Password must be")) {
          setGeneralError("Password must be at least 6 characters.");
        } else if (msg.includes("disposable")) {
          setGeneralError("Disposable emails not allowed. Use a real email address.");
        } else {
          setGeneralError(msg);
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

        {/* Auth card */}
        <div className="w-full bg-panel/60 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 flex flex-col items-center gap-6">
          {/* Mode selector */}
          {authMode === "social" && (
            <>
              <div className="text-center">
                <p className="text-white font-semibold text-lg">Get started</p>
                <p className="text-muted-foreground text-sm mt-1">
                  3-day free trial · No credit card
                </p>
              </div>

              <div className="w-full flex flex-col gap-3">
                {/* Google button */}
                <button
                  onClick={handleGoogleClick}
                  disabled={googleSignIn.isPending}
                  className="w-full flex items-center justify-center gap-3 bg-white text-gray-800 font-semibold text-[15px] py-3.5 px-6 rounded-2xl hover:bg-gray-50 active:scale-[0.98] transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed shadow-lg"
                >
                  {googleSignIn.isPending ? (
                    <div className="w-5 h-5 rounded-full border-2 border-gray-300 border-t-gray-700 animate-spin" />
                  ) : (
                    <Chrome size={20} />
                  )}
                  {googleSignIn.isPending ? "Signing in…" : "Continue with Google"}
                </button>


                {/* Email button */}
                <button
                  onClick={() => setAuthMode("email-signin")}
                  className="w-full flex items-center justify-center gap-3 bg-primary/20 text-primary font-semibold text-[15px] py-3.5 px-6 rounded-2xl hover:bg-primary/30 active:scale-[0.98] transition-all duration-150 shadow-lg"
                >
                  <Mail size={20} />
                  Sign in with Email
                </button>
              </div>

              {successMsg && (
                <p className="text-sm text-green-400 text-center font-semibold">{successMsg}</p>
              )}

              {generalError && (
                <p className="text-sm text-red-400 text-center">{generalError}</p>
              )}

              <p className="text-xs text-muted-foreground text-center leading-relaxed">
                By continuing, you agree to our terms of service.
                <br />
                We use secure authentication to protect your account.
              </p>
            </>
          )}

          {authMode === "email-signin" && (
            <>
              <div className="text-center">
                <p className="text-white font-semibold text-lg">Sign in</p>
              </div>

              <form
                onSubmit={handleEmailSignIn}
                className="w-full flex flex-col gap-4"
              >
                <div>
                  <label className="block text-sm text-muted-foreground mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    placeholder="you@example.com"
                    className={`w-full px-4 py-2.5 rounded-lg bg-background border transition-colors ${
                      errors.email
                        ? "border-red-500"
                        : "border-white/10 focus:border-primary/50"
                    } text-white placeholder:text-muted-foreground focus:outline-none`}
                  />
                  {errors.email && (
                    <p className="text-xs text-red-400 mt-1">{errors.email}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm text-muted-foreground mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={(e) =>
                        setFormData({ ...formData, password: e.target.value })
                      }
                      placeholder="••••••"
                      className={`w-full px-4 py-2.5 rounded-lg bg-background border transition-colors ${
                        errors.password
                          ? "border-red-500"
                          : "border-white/10 focus:border-primary/50"
                      } text-white placeholder:text-muted-foreground focus:outline-none`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white transition-colors"
                    >
                      {showPassword ? (
                        <EyeOff size={18} />
                      ) : (
                        <Eye size={18} />
                      )}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="text-xs text-red-400 mt-1">
                      {errors.password}
                    </p>
                  )}
                </div>

                {generalError && (
                  <p className="text-sm text-red-400 text-center">
                    {generalError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={emailSignIn.isPending}
                  className="w-full bg-primary text-black font-semibold text-[15px] py-3.5 px-6 rounded-2xl hover:bg-primary/90 active:scale-[0.98] transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {emailSignIn.isPending ? "Signing in…" : "Sign in"}
                </button>

                <button
                  type="button"
                  onClick={() => setAuthMode("email-signup")}
                  className="text-sm text-primary hover:text-primary/80 transition-colors text-center"
                >
                  Don't have an account? Sign up
                </button>

                <button
                  type="button"
                  onClick={() => setAuthMode("social")}
                  className="text-xs text-muted-foreground hover:text-muted-foreground/80 transition-colors text-center"
                >
                  Back to social login
                </button>
              </form>
            </>
          )}

          {authMode === "email-signup" && (
            <>
              <div className="text-center">
                <p className="text-white font-semibold text-lg">Create account</p>
              </div>

              <form
                onSubmit={handleEmailSignUp}
                className="w-full flex flex-col gap-4"
              >
                <div>
                  <label className="block text-sm text-muted-foreground mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    placeholder="you@example.com"
                    className={`w-full px-4 py-2.5 rounded-lg bg-background border transition-colors ${
                      errors.email
                        ? "border-red-500"
                        : "border-white/10 focus:border-primary/50"
                    } text-white placeholder:text-muted-foreground focus:outline-none`}
                  />
                  {errors.email && (
                    <p className="text-xs text-red-400 mt-1">{errors.email}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm text-muted-foreground mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={(e) =>
                        setFormData({ ...formData, password: e.target.value })
                      }
                      placeholder="••••••"
                      className={`w-full px-4 py-2.5 rounded-lg bg-background border transition-colors ${
                        errors.password
                          ? "border-red-500"
                          : "border-white/10 focus:border-primary/50"
                      } text-white placeholder:text-muted-foreground focus:outline-none`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white transition-colors"
                    >
                      {showPassword ? (
                        <EyeOff size={18} />
                      ) : (
                        <Eye size={18} />
                      )}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="text-xs text-red-400 mt-1">
                      {errors.password}
                    </p>
                  )}
                </div>

                {generalError && (
                  <p className="text-sm text-red-400 text-center">
                    {generalError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={emailSignUp.isPending}
                  className="w-full bg-primary text-black font-semibold text-[15px] py-3.5 px-6 rounded-2xl hover:bg-primary/90 active:scale-[0.98] transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {emailSignUp.isPending ? "Creating account…" : "Create account"}
                </button>

                <button
                  type="button"
                  onClick={() => setAuthMode("email-signin")}
                  className="text-sm text-primary hover:text-primary/80 transition-colors text-center"
                >
                  Already have an account? Sign in
                </button>

                <button
                  type="button"
                  onClick={() => setAuthMode("social")}
                  className="text-xs text-muted-foreground hover:text-muted-foreground/80 transition-colors text-center"
                >
                  Back to social login
                </button>
              </form>
            </>
          )}
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
            <p className="text-primary font-black text-xl">73%</p>
            <p className="text-xs text-muted-foreground">accuracy</p>
          </div>
        </div>
      </div>
    </div>
  );
}
