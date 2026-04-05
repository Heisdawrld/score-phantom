import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { auth } from "@/lib/firebase";
import { sendEmailVerification, reload } from "firebase/auth";
import { fetchApi, setAuthToken } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Mail, CheckCircle2, AlertCircle, RefreshCw, ArrowLeft } from "lucide-react";

const COOLDOWN = 60;

export default function VerifyEmail() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const email = auth.currentUser?.email || localStorage.getItem("sp_verify_email") || "your email";
  const [countdown, setCountdown] = useState(COOLDOWN);
  const [canResend, setCanResend] = useState(false);
  const [resending, setResending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    if (countdown <= 0) { setCanResend(true); return; }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  useEffect(() => {
    // Check immediately on mount (handles case where user lands here after clicking email link)
    const checkNow = async () => {
      if (!auth.currentUser) return;
      try {
        await reload(auth.currentUser);
        if (auth.currentUser.emailVerified) { await finalizeLogin(); return; }
      } catch {}
    };
    checkNow();
    const iv = setInterval(async () => {
      if (!auth.currentUser) return;
      try {
        await reload(auth.currentUser);
        if (auth.currentUser.emailVerified) await finalizeLogin();
      } catch {}
    }, 4000);
    return () => clearInterval(iv);
  }, []);

  async function finalizeLogin() {
    const user = auth.currentUser;
    if (!user || !user.emailVerified) return;
    try {
      const idToken = await user.getIdToken(true);
      const referralCode = localStorage.getItem("sp_referral_code") || undefined;
      const data = await fetchApi("/auth/email", { method: "POST", body: JSON.stringify({ idToken, email: user.email, referralCode }) });
      setAuthToken(data.token);
      localStorage.removeItem("sp_referral_code");
      localStorage.removeItem("sp_verify_email");
      const merged = { ...data.user, has_access: data.has_access, access_status: data.access_status };
      queryClient.setQueryData(["/api/auth/me"], merged);
      setLocation("/");
    } catch (err) {
      const e = err as any;
      setError(e.message || "Failed to complete sign-in. Please try again.");
    }
  }

  async function handleVerifyClick() {
    setVerifying(true); setError("");
    try {
      if (!auth.currentUser) { setError("Session expired. Please go back and sign up again."); return; }
      await reload(auth.currentUser);
      if (auth.currentUser.emailVerified) {
        await finalizeLogin();
      } else {
        setError("Email not verified yet. Please click the link in your inbox, then try again.");
      }
    } catch (err) {
      const e = err as any;
      setError(e.message || "Could not check verification status.");
    } finally {
      setVerifying(false);
    }
  }

  async function handleResend() {
    if (!canResend || resending) return;
    setResending(true); setError(""); setSuccessMsg("");
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Session expired. Please go back and sign up again.");
      await sendEmailVerification(user, { url: window.location.origin + "/verify-email", handleCodeInApp: false });
      setSuccessMsg("Verification email resent! Check your inbox.");
      setCanResend(false); setCountdown(COOLDOWN);
    } catch (err) {
      const e = err as any;
      const msg = e?.message || "";
      setError(msg.includes("too-many-requests") ? "Too many requests. Please wait before resending." : msg || "Failed to resend. Please try again.");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#090d13] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-primary/8 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-primary/5 blur-[100px]" />
      </div>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="relative z-10 w-full max-w-[380px] flex flex-col items-center gap-7">
        <div className="flex flex-col items-center gap-3">
          <div className="w-[72px] h-[72px] rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-primary/25 flex items-center justify-center shadow-[0_0_50px_rgba(16,231,116,0.2)]">
            <img src={import.meta.env.BASE_URL + "images/logo.png"} alt="ScorePhantom" className="w-11 h-11 object-contain" />
          </div>
          <h1 className="font-display text-[22px] tracking-[0.2em] text-white">SCORE<span className="text-primary">PHANTOM</span></h1>
        </div>
        <div className="w-full rounded-3xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-2xl shadow-[0_32px_80px_rgba(0,0,0,0.6)]">
          <div className="h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
          <div className="p-7 flex flex-col items-center gap-5 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-[0_0_30px_rgba(16,231,116,0.15)]">
              <Mail className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white mb-1">Check your inbox</h2>
              <p className="text-sm text-muted-foreground">We sent a verification link to</p>
              <p className="text-sm font-semibold text-primary mt-1 break-all">{email}</p>
            </div>
            <div className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 text-left space-y-2">
              <p className="text-xs text-white/50"><span className="text-primary font-bold">1.</span> Open the email from ScorePhantom</p>
              <p className="text-xs text-white/50"><span className="text-primary font-bold">2.</span> Click the verification link inside</p>
              <p className="text-xs text-white/50"><span className="text-primary font-bold">3.</span> Come back here and press the button below</p>
              <p className="text-xs text-white/30 pt-1 border-t border-white/[0.05]">Cannot find it? Check your spam or junk folder.</p>
            </div>
            {error && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="w-full flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm bg-red-500/10 border border-red-500/25 text-red-400 text-left">
                <AlertCircle size={15} className="shrink-0 mt-0.5" /><span>{error}</span>
              </motion.div>
            )}
            {successMsg && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="w-full flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm bg-primary/10 border border-primary/25 text-primary text-left">
                <CheckCircle2 size={15} className="shrink-0 mt-0.5" /><span>{successMsg}</span>
              </motion.div>
            )}
            <button onClick={handleVerifyClick} disabled={verifying} className="w-full bg-primary text-black font-bold text-sm py-3.5 rounded-2xl hover:brightness-110 transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_4px_24px_rgba(16,231,116,0.25)]">
              {verifying ? (
                <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />Checking...</span>
              ) : (
                <span className="flex items-center justify-center gap-2"><CheckCircle2 size={16} />I have verified my email</span>
              )}
            </button>
            <button onClick={handleResend} disabled={!canResend || resending} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              <RefreshCw size={13} className={resending ? "animate-spin" : ""} />
              {resending ? "Sending..." : canResend ? "Resend verification email" : "Resend in " + countdown + "s"}
            </button>
            <button onClick={() => setLocation("/login")} className="flex items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors">
              <ArrowLeft size={12} />Back to sign in
            </button>
          </div>
          <div className="h-px bg-gradient-to-r from-transparent via-white/[0.05] to-transparent" />
        </div>
      </motion.div>
    </div>
  );
}
