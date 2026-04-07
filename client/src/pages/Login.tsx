import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  useGoogleSignIn,
  useLogin,
  useSignup,
} from "@/hooks/use-auth";
import { resetPassword } from "@/lib/firebase";
import { Chrome, Mail, Eye, EyeOff, ArrowLeft, CheckCircle2, AlertCircle, KeyRound } from "lucide-react";
import { z } from "zod";
import { fetchApi } from "@/lib/api";

const LoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormData = z.infer<typeof LoginSchema>;
type AuthMode = "email-signin" | "email-signup" | "forgot-password";

function InputField({
  label, type, value, onChange, placeholder, error, rightEl,
}: {
  label: string; type: string; value: string; onChange: (v: string) => void;
  placeholder?: string; error?: string; rightEl?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  const active = focused || value.length > 0;
  return (
    <div className="relative">
      <div className={`relative rounded-xl border transition-all duration-200 ${
        error ? "border-red-500/70 bg-red-500/5"
        : focused ? "border-primary/60 bg-primary/5 shadow-[0_0_0_3px_rgba(16,231,116,0.08)]"
        : "border-white/10 bg-white/5"
      }`}>
        <label className={`absolute left-4 transition-all duration-200 pointer-events-none font-medium ${
          active ? "top-2 text-[10px] text-primary/80 tracking-wider uppercase" : "top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
        }`}>{label}</label>
        <input
          type={type} value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={focused ? placeholder : ""}
          className="w-full bg-transparent px-4 pt-6 pb-2.5 text-white text-sm focus:outline-none placeholder:text-white/25"
          style={{ paddingRight: rightEl ? "44px" : "16px" }}
        />
        {rightEl && <div className="absolute right-3 top-1/2 -translate-y-1/2">{rightEl}</div>}
      </div>
      <AnimatePresence>
        {error && (
          <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            className="flex items-center gap-1 text-xs text-red-400 mt-1.5 px-1">
            <AlertCircle size={11} />{error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function PasswordInput({ label, value, onChange, error }: { label: string; value: string; onChange: (v: string) => void; error?: string; }) {
  const [show, setShow] = useState(false);
  return (
    <InputField label={label} type={show ? "text" : "password"} value={value} onChange={onChange}
      placeholder="••••••••" error={error}
      rightEl={
        <button type="button" onClick={() => setShow(!show)} className="text-muted-foreground hover:text-white transition-colors p-1">
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
  const [authMode, setAuthMode] = useState<AuthMode>("email-signin");
  const [direction, setDirection] = useState(1);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");
  const [formData, setFormData] = useState<LoginFormData>({ email: "", password: "" });
  const [errors, setErrors] = useState<Partial<LoginFormData>>({});
  const [generalError, setGeneralError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [showUnverifiedActions, setShowUnverifiedActions] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  // Forgot-password state
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [referralCode, setReferralCode] = useState(() => localStorage.getItem("sp_referral_code") || "");

  const [, setLocation] = useLocation();
  const googleSignIn = useGoogleSignIn();
  const loginMutation = useLogin();
  const signupMutation = useSignup();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "signup") goTo("email-signup");
    // Capture referral code from URL ?ref=CODE
    const refCode = params.get("ref");
    if (refCode) {
      const code = refCode.trim().toUpperCase();
      localStorage.setItem("sp_referral_code", code);
      setReferralCode(code);
      // Remove ref param from URL without reload
      const clean = new URL(window.location.href);
      clean.searchParams.delete("ref");
      window.history.replaceState({}, document.title, clean.toString());
    }
  }, []);

  const goTo = (mode: AuthMode, dir = 1) => {
    setDirection(dir);
    setGeneralError("");
    setSuccessMsg("");
    setErrors({});
    setShowUnverifiedActions(false);
    setAuthMode(mode);
  };

  const handleGoogleClick = () => {
    setGeneralError("");
    if (referralCode) localStorage.setItem("sp_referral_code", referralCode);
    googleSignIn.mutate(referralCode || undefined, {
      onError: (err: any) => {
        const msg = err?.message || "Sign in failed";
        if (msg.includes("popup-closed") || msg.includes("cancelled")) setGeneralError("Sign-in cancelled. Try again.");
        else if (msg.includes("popup-blocked")) setGeneralError("Popup blocked. Allow popups for this site.");
        else if (msg.includes("Disposable email")) setGeneralError("Please use a permanent email address.");
        else setGeneralError(msg);
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
        err.errors.forEach((e) => { newErrors[e.path[0] as keyof LoginFormData] = e.message as any; });
        setErrors(newErrors);
      }
      return false;
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError("");
    setShowUnverifiedActions(false);
    if (!validateForm()) return;
    if (referralCode) localStorage.setItem("sp_referral_code", referralCode);
    loginMutation.mutate({ ...formData }, {
      onError: (err: any) => {
        const msg = err?.message || "Sign in failed";
        if (msg.includes("email_not_verified")) {
          setGeneralError("Email not verified. Check your inbox and spam folder.");
          setShowUnverifiedActions(true);
        } else if (
          msg.includes("auth/invalid-credential") || msg.includes("auth/invalid-login-credentials") ||
          msg.includes("auth/wrong-password") || msg.includes("auth/user-not-found") ||
          msg.includes("Invalid credentials")
        ) {
          setGeneralError("Incorrect email or password.");
        } else if (msg.includes("too-many-requests")) {
          setGeneralError("Too many attempts. Please try again later.");
        } else if (msg.includes("disposable")) {
          setGeneralError("Disposable emails not allowed.");
        } else if (msg.toLowerCase().includes("authentication failed") || msg.toLowerCase().includes("token verification")) {
          setGeneralError("Connection issue — please tap Sign in again.");
        } else {
          setGeneralError(msg);
        }
      },
    });
  };

  const handleResendVerification = async () => {
    setResendLoading(true);
    try {
      await fetchApi("/auth/resend-verification", { method: "POST", body: JSON.stringify({ email: formData.email }) });
      localStorage.setItem("sp_verify_email", formData.email);
      setLocation("/verify-email");
    } catch (err: any) {
      setGeneralError(err.message || "Failed to resend. Please try again.");
    } finally {
      setResendLoading(false);
    }
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(""); setConfirmPasswordError("");
    if (!validateForm()) return;
    if (formData.password !== confirmPassword) { setConfirmPasswordError("Passwords do not match."); return; }
    signupMutation.mutate({ email: formData.email, password: formData.password, referralCode: referralCode || undefined }, {
      onError: (err: any) => {
        const msg = err?.message || "Sign up failed";
        if (msg.includes("email-already-in-use") || msg.includes("already registered")) {
          // Navigate first, then set error (goTo clears generalError so we delay it)
          goTo("email-signin", -1);
          setTimeout(() => setGeneralError("This email already has an account — sign in below."), 50);
        } else if (msg.includes("weak-password")) setGeneralError("Password must be at least 6 characters.");
        else if (msg.includes("invalid-email")) setGeneralError("Please enter a valid email address.");
        else if (msg.includes("disposable")) setGeneralError("Disposable emails not allowed.");
        else setGeneralError(msg);
      },
    });
  };

  // ── Forgot Password handler ───────────────────────────────────────────────
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) return setGeneralError("Please enter your email address.");
    setResetLoading(true); setGeneralError("");
    try {
      try { await fetchApi("/auth/password/reset-request", { method: "POST", body: JSON.stringify({ email: resetEmail.trim().toLowerCase() }) }); } catch (_) {}
      try { await resetPassword(resetEmail.trim().toLowerCase()); } catch (_) {}
      setSuccessMsg(`Reset email sent to ${resetEmail}. Check your inbox.`);
      setResetEmail("");
      goTo("email-signin", -1);
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg.includes("user-not-found") || msg.includes("invalid-email")) {
        // Still show success to avoid enumeration
        setSuccessMsg("If that email is registered, a reset link has been sent.");
        setResetEmail(""); goTo("email-signin", -1);
      } else {
        setGeneralError(msg || "Failed to send reset email. Try again.");
      }
    } finally { setResetLoading(false); }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden bg-[#090d13]">
      {/* Animated background */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-primary/10 blur-[120px] animate-pulse" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-primary/8 blur-[120px] animate-pulse" style={{ animationDelay: "1.5s" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-primary/5 blur-[100px]" />
        <img src={`${import.meta.env.BASE_URL}images/auth-bg.png`} alt="" className="w-full h-full object-cover opacity-20 mix-blend-screen absolute inset-0" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#090d13] via-[#090d13]/70 to-transparent" />
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 w-full max-w-[380px] flex flex-col items-center gap-7">
        {/* Logo */}
        <div className="flex flex-col items-center gap-4">
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1, duration: 0.4 }}
            className="w-[72px] h-[72px] rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-primary/25 flex items-center justify-center shadow-[0_0_50px_rgba(16,231,116,0.25),inset_0_1px_0_rgba(255,255,255,0.1)]">
            <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="ScorePhantom" className="w-11 h-11 object-contain" />
          </motion.div>
          <div className="text-center">
            <h1 className="font-display text-[28px] tracking-[0.2em] text-white">SCORE<span className="text-primary">PHANTOM</span></h1>
            <p className="text-xs text-muted-foreground mt-1 tracking-wider">DATA-DRIVEN FOOTBALL PREDICTIONS</p>
          </div>
        </div>

        {/* Card */}
        <div className="w-full rounded-3xl overflow-hidden border border-white/[0.07] bg-white/[0.03] backdrop-blur-2xl shadow-[0_32px_80px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.07)]">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
          <div className="p-7">
            <AnimatePresence mode="wait" custom={direction}>

              {/* ─── SIGN IN ─── */}
              {authMode === "email-signin" && (
                <motion.div key="email-signin" custom={direction} variants={slideVariants} initial="enter" animate="center" exit="exit"
                  transition={{ duration: 0.25, ease: "easeInOut" }} className="flex flex-col gap-5">
                  <div className="flex items-center gap-3">
                    <button onClick={() => goTo("email-signin",-1)} className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-muted-foreground hover:text-white hover:bg-white/10 transition-all">
                      <ArrowLeft size={15} />
                    </button>
                    <div><p className="text-white font-semibold text-base leading-tight">Welcome back</p><p className="text-xs text-muted-foreground">Sign in to your account</p></div>
                  </div>

                  <AnimatePresence>
                    {(successMsg || generalError) && (
                      <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
                        className={`flex flex-col gap-2 rounded-xl px-4 py-3 text-sm ${successMsg ? "bg-primary/10 border border-primary/25 text-primary" : "bg-red-500/10 border border-red-500/25 text-red-400"}`}>
                        <div className="flex items-start gap-2.5">
                          {successMsg ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertCircle size={16} className="mt-0.5 shrink-0" />}
                          <span>{successMsg || generalError}</span>
                        </div>
                        {/* Resend Verification button — shown when email is not verified */}
                        {showUnverifiedActions && (
                          <button onClick={handleResendVerification} disabled={resendLoading}
                            className="mt-1 w-full text-center text-xs font-semibold bg-orange-500/20 border border-orange-500/30 text-orange-300 hover:bg-orange-500/30 rounded-lg py-2 px-3 transition-all disabled:opacity-50">
                            {resendLoading ? "Sending…" : "📧 Resend Verification Email"}
                          </button>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <form onSubmit={handleEmailSignIn} className="flex flex-col gap-3">
                    <InputField label="Email" type="email" value={formData.email} onChange={(v) => setFormData({ ...formData, email: v })} placeholder="you@example.com" error={errors.email} />
                    <PasswordInput label="Password" value={formData.password} onChange={(v) => setFormData({ ...formData, password: v })} error={errors.password} />

                    {/* Forgot Password link */}
                    <div className="flex justify-end">
                      <button type="button" onClick={() => { setResetEmail(formData.email); goTo("forgot-password"); }}
                        className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
                        <KeyRound size={11} /> Forgot password?
                      </button>
                    </div>

                    <motion.button whileTap={{ scale: 0.98 }} type="submit" disabled={loginMutation.isPending}
                      className="w-full mt-1 bg-primary text-black font-bold text-sm py-3.5 rounded-2xl hover:brightness-110 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_4px_24px_rgba(16,231,116,0.25)]">
                      {loginMutation.isPending ? <span className="flex items-center justify-center gap-2"><div className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />Signing in…</span> : "Sign in"}
                    </motion.button>
                  </form>

                  <div className="flex flex-col items-center gap-2">
                    <button onClick={() => goTo("email-signup")} className="text-xs text-primary/80 hover:text-primary transition-colors">
                      Don't have an account? <span className="font-semibold">Sign up free</span>
                    </button>
                  </div>
                </motion.div>
              )}

              {/* ─── SIGN UP ─── */}
              {authMode === "email-signup" && (
                <motion.div key="email-signup" custom={direction} variants={slideVariants} initial="enter" animate="center" exit="exit"
                  transition={{ duration: 0.25, ease: "easeInOut" }} className="flex flex-col gap-5">
                  <div className="flex items-center gap-3">
                    <button onClick={() => goTo("email-signin",-1)} className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-muted-foreground hover:text-white hover:bg-white/10 transition-all">
                      <ArrowLeft size={15} />
                    </button>
                    <div><p className="text-white font-semibold text-base leading-tight">Create account</p><p className="text-xs text-muted-foreground">Start your 3-day free trial</p></div>
                  </div>
                  <div className="p-3 rounded-xl bg-white/4 border border-primary/10 text-xs space-y-1.5">
                    <p className="text-white/50 font-semibold uppercase tracking-wider text-[9px] mb-2">Free trial includes</p>
                    <div className="flex items-center gap-2 text-white/60"><span className="text-primary font-bold mr-1">✓</span>5 predictions per day</div>
                    <div className="flex items-center gap-2 text-white/60"><span className="text-primary font-bold mr-1">✓</span>Match Predictions tab</div>
                    <div className="flex items-center gap-2 text-white/30"><span className="text-white/20 mr-1">✗</span>Stats, ACCA, PhantomChat — Premium</div>
                    <div className="flex items-center gap-2 text-white/30"><span className="text-white/20 mr-1">✗</span>Top Picks + value bets — Premium</div>
                  </div>
                  <AnimatePresence>
                    {generalError && (
                      <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
                        className="flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm bg-red-500/10 border border-red-500/25 text-red-400">
                        <AlertCircle size={16} className="mt-0.5 shrink-0" /><span>{generalError}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <form onSubmit={handleEmailSignUp} className="flex flex-col gap-3">
                    <InputField label="Email" type="email" value={formData.email} onChange={(v) => setFormData({ ...formData, email: v })} placeholder="you@example.com" error={errors.email} />
                    <PasswordInput label="Password" value={formData.password} onChange={(v) => { setFormData({ ...formData, password: v }); setErrors({ ...errors, password: undefined }); }} error={errors.password} />
                    <PasswordInput label="Confirm Password" value={confirmPassword} onChange={(v) => { setConfirmPassword(v); setConfirmPasswordError(""); }} error={confirmPasswordError} />
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Referral Code (optional)</label>
                      <input
                        type="text"
                        value={referralCode}
                        onChange={e => { const v = e.target.value.toUpperCase(); setReferralCode(v); if (v) localStorage.setItem("sp_referral_code", v); else localStorage.removeItem("sp_referral_code"); }}
                        placeholder="e.g. MAZI"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-gray-600 focus:outline-none focus:border-primary/40 font-mono tracking-widest transition-all"
                      />
                    </div>
                    <motion.button whileTap={{ scale: 0.98 }} type="submit" disabled={signupMutation.isPending}
                      className="w-full mt-1 bg-primary text-black font-bold text-sm py-3.5 rounded-2xl hover:brightness-110 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_4px_24px_rgba(16,231,116,0.25)]">
                      {signupMutation.isPending ? <span className="flex items-center justify-center gap-2"><div className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />Creating account…</span> : "Create account"}
                    </motion.button>
                  </form>
                  <div className="flex flex-col items-center">
                    <button onClick={() => goTo("email-signin", -1)} className="text-xs text-primary/80 hover:text-primary transition-colors">
                      Already have an account? <span className="font-semibold">Sign in</span>
                    </button>
                  </div>
                </motion.div>
              )}

              {/* ─── FORGOT PASSWORD ─── */}
              {authMode === "forgot-password" && (
                <motion.div key="forgot-password" custom={direction} variants={slideVariants} initial="enter" animate="center" exit="exit"
                  transition={{ duration: 0.25, ease: "easeInOut" }} className="flex flex-col gap-5">
                  <div className="flex items-center gap-3">
                    <button onClick={() => goTo("email-signin", -1)} className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-muted-foreground hover:text-white hover:bg-white/10 transition-all">
                      <ArrowLeft size={15} />
                    </button>
                    <div>
                      <p className="text-white font-semibold text-base leading-tight">Reset password</p>
                      <p className="text-xs text-muted-foreground">We'll send a reset link via email</p>
                    </div>
                  </div>

                  <AnimatePresence>
                    {generalError && (
                      <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
                        className="flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm bg-red-500/10 border border-red-500/25 text-red-400">
                        <AlertCircle size={16} className="mt-0.5 shrink-0" /><span>{generalError}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <form onSubmit={handleForgotPassword} className="flex flex-col gap-4">
                    <InputField label="Email" type="email" value={resetEmail} onChange={setResetEmail} placeholder="you@example.com" />
                    <motion.button whileTap={{ scale: 0.98 }} type="submit" disabled={resetLoading}
                      className="w-full bg-primary text-black font-bold text-sm py-3.5 rounded-2xl hover:brightness-110 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_4px_24px_rgba(16,231,116,0.25)]">
                      {resetLoading ? <span className="flex items-center justify-center gap-2"><div className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />Sending…</span> : "Send Reset Link"}
                    </motion.button>
                  </form>

                  <p className="text-[11px] text-muted-foreground/60 text-center leading-relaxed">
                    A reset link will be sent if this email is registered.
                  </p>
                </motion.div>
              )}

            </AnimatePresence>
          </div>
          <div className="h-px w-full bg-gradient-to-r from-transparent via-white/[0.05] to-transparent" />
        </div>

        {/* Stats strip */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4, duration: 0.5 }}
          className="flex items-center gap-6 text-center">
          <div><p className="text-primary font-black text-lg leading-tight">500+</p><p className="text-[10px] text-muted-foreground/60 tracking-wider uppercase">Matches/week</p></div>
          <div className="w-px h-7 bg-white/8" />
          <div><p className="text-primary font-black text-lg leading-tight">Model</p><p className="text-[10px] text-muted-foreground/60 tracking-wider uppercase">Predictions</p></div>
          <div className="w-px h-7 bg-white/8" />
          <div><p className="text-primary font-black text-lg leading-tight">73%</p><p className="text-[10px] text-muted-foreground/60 tracking-wider uppercase">Accuracy</p></div>
        </motion.div>
      </motion.div>
    </div>
  );
}
