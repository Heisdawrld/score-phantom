/**
 * ContactSupport.tsx
 * Floating WhatsApp support button + "Lost Premium Access?" modal.
 * Shows to all users but is especially targeted at users with expired/trial status
 * who previously had premium (helping them get restored post-migration).
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, Crown, ExternalLink } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const WHATSAPP_NUMBER = "2348117024699";
const WHATSAPP_MESSAGE = encodeURIComponent(
  "Hi ScorePhantom support, I need help restoring my premium access. My email is: "
);

export function ContactSupport() {
  const [open, setOpen] = useState(false);
  const { data: user } = useAuth();

  // Only show when logged in
  if (!user) return null;

  const isExpired = user.access_status === "expired" || (!user.has_access);
  const waLink = `https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_MESSAGE}${encodeURIComponent(user?.email || "")}`;

  return (
    <>
      {/* Floating button */}
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 2, type: "spring", stiffness: 300 }}
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-4 z-40 w-14 h-14 rounded-full bg-[#25D366] shadow-[0_4px_20px_rgba(37,211,102,0.4)] flex items-center justify-center hover:brightness-110 active:scale-95 transition-all"
        aria-label="Contact Support"
      >
        <MessageCircle className="w-7 h-7 text-white fill-white" />
        {/* Pulse ring */}
        <span className="absolute inset-0 rounded-full bg-[#25D366] animate-ping opacity-30" />
      </motion.button>

      {/* Modal */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            />

            {/* Card */}
            <motion.div
              initial={{ opacity: 0, y: 60, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 60, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-md p-4"
            >
              <div className="relative rounded-3xl border border-white/[0.08] bg-[#0d1117] shadow-2xl overflow-hidden">
                {/* Green accent top bar */}
                <div className="h-1 w-full bg-gradient-to-r from-[#25D366] via-[#10e774] to-[#25D366]" />

                <div className="p-6">
                  {/* Close */}
                  <button
                    onClick={() => setOpen(false)}
                    className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-white/10 transition-colors"
                  >
                    <X className="w-4 h-4 text-white/50" />
                  </button>

                  {/* Header */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-[#25D366]/15 border border-[#25D366]/20 flex items-center justify-center">
                      <MessageCircle className="w-6 h-6 text-[#25D366]" />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-white">Contact Support</h3>
                      <p className="text-xs text-white/40">We reply fast on WhatsApp</p>
                    </div>
                  </div>

                  {/* Lost access block — shown to expired users */}
                  {isExpired && (
                    <div className="mb-4 p-3.5 rounded-xl bg-amber-500/8 border border-amber-500/15">
                      <div className="flex items-start gap-2.5">
                        <Crown className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[11px] font-black text-amber-400 uppercase tracking-wide mb-1">
                            Lost Premium Access?
                          </p>
                          <p className="text-[11px] text-white/50 leading-relaxed">
                            If you had an active subscription before, message us on WhatsApp with
                            your email and we'll restore it immediately.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* General help options */}
                  <div className="space-y-2 mb-5">
                    {[
                      "Restore my premium access",
                      "Payment issue or refund",
                      "Prediction not loading",
                      "Other question",
                    ].map((topic) => {
                      const link = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
                        `Hi ScorePhantom, I need help with: ${topic}. My email: ${user?.email || ""}`
                      )}`;
                      return (
                        <a
                          key={topic}
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setOpen(false)}
                          className="flex items-center justify-between w-full px-4 py-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.05] hover:border-white/10 transition-all group"
                        >
                          <span className="text-xs font-bold text-white/70 group-hover:text-white transition-colors">
                            {topic}
                          </span>
                          <ExternalLink className="w-3.5 h-3.5 text-white/20 group-hover:text-[#25D366] transition-colors" />
                        </a>
                      );
                    })}
                  </div>

                  {/* Main CTA */}
                  <a
                    href={waLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-center gap-2.5 w-full py-3.5 rounded-xl bg-[#25D366] text-black font-black text-sm hover:brightness-110 active:scale-98 transition-all shadow-[0_4px_16px_rgba(37,211,102,0.3)]"
                  >
                    <MessageCircle className="w-4 h-4 fill-black" />
                    Open WhatsApp Chat
                  </a>

                  <p className="text-center text-[10px] text-white/25 mt-3">
                    Typically responds within minutes · +234 811 702 4699
                  </p>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
