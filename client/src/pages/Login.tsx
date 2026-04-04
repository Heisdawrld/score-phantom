import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useGoogleSignIn,
  useEmailSignIn,
  useEmailSignUp,
} from "@/hooks/use-auth";
import { Chrome, Mail, Eye, EyeOff, ArrowLeft, CheckCircle2, AlertCircle } from "lucide-react";
import { z } from "zod";

const LoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormData = z.infer<typeof LoginSchema>;
type AuthMode = "social" | "email-signin" | "email-signup";

function InputField({
  label,
  type,
  value,
  onChange,
  placeholder,
  error,
  rightEl,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  rightEl?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  const active = focused || value.length > 0;

  return (
    <div className="relative">
      <div
        className={`relative rounded-xl border transition-all duration-200 ${
          error
            ? "border-red-500/70 bg-red-500/5"
            : focused
            ? "border-primary/60 bg-primary/5 shadow-[0_0_0_3px_rgba(16,231,116,0.08)]"
            : "border-white/10 bg-white/5"
        }`}
      >
        <label
          className={`absolute left-4 transition-all duration-200 pointer-events-none font-medium ${
            active
              ? "top-2 text-[10px] text-primary/80 tracking-wider uppercase"
              : "top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
          }`}
        >
          {label}
        </label>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={focused ? placeholder : ""}
          className="w-full bg-transparent px-4 pt-6 pb-2.5 text-white text-sm focus:outline-none placeholder:text-white/25"
          style={{ paddingRight: rightEl ? "44px" : "16px" }}
        />
        {rightEl && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {rightEl}
          </div>
        )}
      </div>
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="flex items-center gap-1 text-xs text-red-400 mt-1.5 px-1"
          >
            <AlertCircle size={11} />
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function PasswordInput({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <InputField
      label={label}
      type={show ? "text" : "password"}
      value={value}
      onChange={onChange}
      placeholder="••••••••"
      error={error}
      rightEl={
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="text-muted-foreground hover:text-white transition-colors p-1"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      }
    />
  );
}

const slideVariants = {
  enter: (dir: number) => ({ x: dir * 40, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir * -40, opacity: 0 }),
};

export default function Login() {
  const [authMode, setAuthMode] = useState<AuthMode>("social");
  const [direction, setDirection] = useState(1);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");
  const [formData, setFormData] = useState<LoginFormData>({ email: "", password: "" });
  const [errors, setErrors] = useState<Partial<LoginFormData>>({});
  const [generalError, setGeneralError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const googleSignIn = useGoogleSignIn();
  const emailSignIn = useEmailSignIn();
  const emailSignUp = useEmailSignUp();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("verified") === "success") {
      setSuccessMsg("Email verified! 🎉 Now sign in to access ScorePhantom.");
      setAuthMode("email-signin");
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const goTo = (mode: AuthMode, dir = 1) => {
    setDirection(dir);
    setGeneralError("");
    setErrors({});
    setAuthMode(mode);
  };

  const handleGoogleClick = () => {
    setGeneralError("");
    googleSignIn.mutate(undefined, {
      onError: (err: any) => {
        const msg = err?.message || "Sign in failed";
        if (msg.includes("popup-closed") || msg.includes("cancelled")) {
          setGeneralError("Sign-in cancelled. Try again.");
        } else if (msg.includes("popup-blocked")) {
          setGeneralError("Popup blocked. Allow popups for this site.");
        } else if (msg.includes("Disposable email")) {
          setGeneralError("Please use a permanent email address.");
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
          setGeneralError("Email not verified. Check your inbox and spam folder.");
        } else if (
          msg.includes("auth/invalid-credential") ||
          msg.includes("auth/invalid-login-credentials") ||
          msg.includes("auth/wrong-password") ||
          msg.includes("auth/user-not-found") ||
          msg.includes("Invalid credentials")
        ) {
          setGeneralError("Incorrect email or password.");
        } else if (msg.includes("too-many-requests")) {
          setGeneralError("Too many attempts. Please try again later.");
        } else if (msg.includes("disposable")) {
          setGeneralError("Disposable emails not allowed.");
        } else {
          setGeneralError(msg);
        }
      },
    });
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError("");
    setConfirmPasswordError("");
    if (!validateForm()) return;
    if (formData.password !== confirmPassword) {
      setConfirmPasswordError("Passwords do not match.");
      return;
    }
    emailSignUp.mutate(formData, {
      onSuccess: () => {
        setGeneralError("");
        setFormData({ email: "", password: "" });
        setConfirmPassword("");
        setConfirmPasswordError("");
        setSuccessMsg("Account created! Check your inbox — we sent a verification email. Verify it, then sign in.");
        goTo("email-signin", -1);
      },
      onError: (err: any) => {
        const msg = err?.message || "Sign up failed";
        if (msg.includes("email-already-in-use") || msg.includes("already registered")) {
          setGeneralError("An account with this email already exists.");
          goTo("email-signin", -1);
        } else if (msg.includes("weak-password")) {
          setGeneralError("Password must be at least 6 characters.");
        } else if (msg.includes("invalid-email")) {
          setGeneralError("Please enter a valid email address.");
        } else if (msg.includes("disposable")) {
          setGeneralError("Disposable emails not allowed.");
        } else {
          setGeneralError(msg);
        }
      },
    });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden bg-[#090d13]">
      {/* Animated background orbs */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-primary/10 blur-[120px] animate-pulse" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-primary/8 blur-[120px] animate-pulse" style={{ animationDelay: "1.5s" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-primary/5 blur-[100px]" />
        <img
          src={`${import.meta.env.BASE_URL}images/auth-bg.png`}
          alt=""
          className="w-full h-full object-cover opacity-20 mix-blend-screen absolute inset-0"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#090d13] via-[#090d13]/70 to-transparent" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 w-full max-w-[380px] flex flex-col items-center gap-7"
      >
        {/* Logo */}
        <div className="flex flex-col items-center gap-4">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.4 }}
            className="w-[72px] h-[72px] rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-primary/25 flex items-center justify-center shadow-[0_0_50px_rgba(16,231,116,0.25),inset_0_1px_0_rgba(255,255,255,0.1)]"
          >
            <img
              src={`${import.meta.env.BASE_URL}images/logo.png`}
              alt="ScorePhantom"
              className="w-11 h-11 object-contain"
            />
          </motion.div>
          <div className="text-center">
            <h1 className="font-display text-[28px] tracking-[0.2em] text-white">
              SCORE<span className="text-primary">PHANTOM</span>
            </h1>
            <p className="text-xs text-muted-foreground mt-1 tracking-wider">
              DATA-DRIVEN FOOTBALL PREDICTIONS
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="w-full rounded-3xl overflow-hidden border border-white/[0.07] bg-white/[0.03] backdrop-blur-2xl shadow-[0_32px_80px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.07)]">
          {/* Top accent line */}
          <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

          <div className="p-7">
            <AnimatePresence mode="wait" custom={direction}>
              {/* ─── SOCIAL ─── */}
              {authMode === "social" && (
                <motion.div
                  key="social"
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                  className="flex flex-col gap-5"
                >
                  <div className="text-center">
                    <p className="text-white font-semibold text-lg">Get started free</p>
                    <p className="text-muted-foreground text-xs mt-1">3-day trial · No credit card required</p>
                  </div>

                  <div className="flex flex-col gap-3">
                    <motion.button
                      whileTap={{ scale: 0.98 }}
                      onClick={handleGoogleClick}
                      disabled={googleSignIn.isPending}
                      className="w-full flex items-center justify-center gap-3 bg-white text-gray-800 font-semibold text-sm py-3.5 px-6 rounded-2xl hover:bg-gray-50 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed shadow-md"
                    >
                      {googleSignIn.isPending ? (
                        <div className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-gray-700 animate-spin" />
                      ) : (
                        <Chrome size={18} />
                      )}
                      {googleSignIn.isPending ? "Signing in…" : "Continue with Google"}
                    </motion.button>

                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-px bg-white/8" />
                      <span className="text-xs text-muted-foreground">or</span>
                      <div className="flex-1 h-px bg-white/8" />
                    </div>

                    <motion.button
                      whileTap={{ scale: 0.98 }}
                      onClick={() => goTo("email-signin")}
                      className="w-full flex items-center justify-center gap-3 bg-primary/15 text-primary font-semibold text-sm py-3.5 px-6 rounded-2xl border border-primary/25 hover:bg-primary/22 hover:border-primary/40 transition-all duration-150"
                    >
                      <Mail size={18} />
                      Sign in with Email
                    </motion.button>
                  </div>

                  <AnimatePresence>
                    {(successMsg || generalError) && (
                      <motion.div
                        initial={{ opacity: 0, y: -6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        className={`flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm ${
                          successMsg
                            ? "bg-primary/10 border border-primary/25 text-primary"
                            : "bg-red-500/10 border border-red-500/25 text-red-400"
                        }`}
                      >
                        {successMsg ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertCircle size={16} className="mt-0.5 shrink-0" />}
                        <span>{successMsg || generalError}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <p className="text-[11px] text-muted-foreground/60 text-center leading-relaxed">
                    By continuing, you agree to our <a href="/terms" className="underline hover:text-white">Terms of Service</a> and <a href="/privacy" className="underline hover:text-white">Privacy Policy</a>.<br />
                    Secured with end-to-end authentication.
                  </p>
                </motion.div>
              )}

              {/* ─── SIGN IN ─── */}
              {authMode === "email-signin" && (
                <motion.div
                  key="email-signin"
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                  className="flex flex-col gap-5"
                >
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => goTo("social", -1)}
                      className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-muted-foreground hover:text-white hover:bg-white/10 transition-all"
                    >
                      <ArrowLeft size={15} />
                    </button>
                    <div>
                      <p className="text-white font-semibold text-base leading-tight">Welcome back</p>
                      <p className="text-xs text-muted-foreground">Sign in to your account</p>
                    </div>
                  </div>

                  <AnimatePresence>
                    {(successMsg || generalError) && (
                      <motion.div
                        initial={{ opacity: 0, y: -6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        className={`flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm ${
                          successMsg
                            ? "bg-primary/10 border border-primary/25 text-primary"
                            : "bg-red-500/10 border border-red-500/25 text-red-400"
                        }`}
                      >
                        {successMsg ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertCircle size={16} className="mt-0.5 shrink-0" />}
                        <span>{successMsg || generalError}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <form onSubmit={handleEmailSignIn} className="flex flex-col gap-3">
                    <InputField
                      label="Email"
                      type="email"
                      value={formData.email}
                      onChange={(v) => setFormData({ ...formData, email: v })}
                      placeholder="you@example.com"
                      error={errors.email}
                    />
                    <PasswordInput
                      label="Password"
                      value={formData.password}
                      onChange={(v) => setFormData({ ...formData, password: v })}
                      error={errors.password}
                    />

                    <motion.button
                      whileTap={{ scale: 0.98 }}
                      type="submit"
                      disabled={emailSignIn.isPending}
                      className="w-full mt-1 bg-primary text-black font-bold text-sm py-3.5 rounded-2xl hover:brightness-110 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_4px_24px_rgba(16,231,116,0.25)]"
                    >
                      {emailSignIn.isPending ? (
                        <span className="flex items-center justify-center gap-2">
                          <div className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />
                          Signing in…
                        </span>
                      ) : (
                        "Sign in"
                      )}
                    </motion.button>
                  </form>

                  <div className="flex flex-col items-center gap-2">
                    <button
                      onClick={() => goTo("email-signup")}
                      className="text-xs text-primary/80 hover:text-primary transition-colors"
                    >
                      Don't have an account? <span className="font-semibold">Sign up free</span>
                    </button>
                  </div>
                </motion.div>
              )}

              {/* ─── SIGN UP ─── */}
              {authMode === "email-signup" && (
                <motion.div
                  key="email-signup"
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                  className="flex flex-col gap-5"
                >
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => goTo("email-signin", -1)}
                      className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-muted-foreground hover:text-white hover:bg-white/10 transition-all"
                    >
                      <ArrowLeft size={15} />
                    </button>
                    <div>
                      <p className="text-white font-semibold text-base leading-tight">Create account</p>
                      <p className="text-xs text-muted-foreground">Start your 3-day free trial</p>
                    </div>
                  </div>

                  <AnimatePresence>
                    {generalError && (
                      <motion.div
                        initial={{ opacity: 0, y: -6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        className="flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm bg-red-500/10 border border-red-500/25 text-red-400"
                      >
                        <AlertCircle size={16} className="mt-0.5 shrink-0" />
                        <span>{generalError}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <form onSubmit={handleEmailSignUp} className="flex flex-col gap-3">
                    <InputField
                      label="Email"
                      type="email"
                      value={formData.email}
                      onChange={(v) => setFormData({ ...formData, email: v })}
                      placeholder="you@example.com"
                      error={errors.email}
                    />
                    <PasswordInput
                      label="Password"
                      value={formData.password}
                      onChange={(v) => {
                        setFormData({ ...formData, password: v });
                        setErrors({ ...errors, password: undefined });
                      }}
                      error={errors.password}
                    />
                    <PasswordInput
                      label="Confirm Password"
                      value={confirmPassword}
                      onChange={(v) => {
                        setConfirmPassword(v);
                        setConfirmPasswordError("");
                      }}
                      error={confirmPasswordError}
                    />

                    <motion.button
                      whileTap={{ scale: 0.98 }}
                      type="submit"
                      disabled={emailSignUp.isPending}
                      className="w-full mt-1 bg-primary text-black font-bold text-sm py-3.5 rounded-2xl hover:brightness-110 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_4px_24px_rgba(16,231,116,0.25)]"
                    >
                      {emailSignUp.isPending ? (
                        <span className="flex items-center justify-center gap-2">
                          <div className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />
                          Creating account…
                        </span>
                      ) : (
                        "Create account"
                      )}
                    </motion.button>
                  </form>

                  <div className="flex flex-col items-center gap-2">
                    <button
                      onClick={() => goTo("email-signin", -1)}
                      className="text-xs text-primary/80 hover:text-primary transition-colors"
                    >
                      Already have an account? <span className="font-semibold">Sign in</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Bottom accent */}
          <div className="h-px w-full bg-gradient-to-r from-transparent via-white/[0.05] to-transparent" />
        </div>

        {/* Stats strip */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="flex items-center gap-6 text-center"
        >
          <div>
            <p className="text-primary font-black text-lg leading-tight">500+</p>
            <p className="text-[10px] text-muted-foreground/60 tracking-wider uppercase">Matches/week</p>
          </div>
          <div className="w-px h-7 bg-white/8" />
          <div>
            <p className="text-primary font-black text-lg leading-tight">Model</p>
            <p className="text-[10px] text-muted-foreground/60 tracking-wider uppercase">Predictions</p>
          </div>
          <div className="w-px h-7 bg-white/8" />
          <div>
            <p className="text-primary font-black text-lg leading-tight">73%</p>
            <p className="text-[10px] text-muted-foreground/60 tracking-wider uppercase">Accuracy</p>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
