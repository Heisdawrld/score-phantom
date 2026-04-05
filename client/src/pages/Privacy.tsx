import { useState } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Lock, ChevronDown } from "lucide-react";

const UPDATED = "January 2025";

const SECTIONS = [
  { id: 1, title: "Information We Collect", body: "We collect information you provide directly such as your email address when you register. We also automatically collect device data, IP addresses, browser type, and usage patterns to improve platform performance and reliability." },
  { id: 2, title: "How We Use Your Information", body: "We use your information to provide and improve the Service, process payments, send account and security notifications, respond to support requests, and communicate about platform updates. We do not use your data for advertising or sell it to third parties." },
  { id: 3, title: "Information Sharing", body: "We do not sell your personal information. We share data only with trusted service providers: Flutterwave for payment processing, Firebase for authentication, and Turso for database storage. All partners are contractually bound to protect your data and may not use it for other purposes." },
  { id: 4, title: "Data Security", body: "We implement industry-standard security measures including encrypted HTTPS connections, secure token-based authentication (JWT), and strict access controls. However, no online service is 100% secure. We recommend using a strong unique password and notifying us immediately of any unauthorized access." },
  { id: 5, title: "Cookies and Tracking", body: "ScorePhantom uses localStorage and session tokens strictly for authentication and user preferences. We do not use third-party advertising cookies or tracking pixels. Any analytics data collected is anonymized and used solely to improve the platform experience." },
  { id: 6, title: "Data Retention", body: "We retain your account data for as long as your account remains active. Upon account deletion request, we will remove your personal data within 30 days, except where we are legally required to retain certain records for financial compliance purposes." },
  { id: 7, title: "Your Rights", body: "You have the right to access, correct, or delete your personal data at any time. To exercise these rights, contact us at support@scorephantom.com. We will respond to all data requests within 30 days. You may also opt out of non-essential communications at any time." },
  { id: 8, title: "Third-Party Services", body: "ScorePhantom integrates with Firebase (Google) for authentication, Flutterwave for payments, and Turso for database services. Each provider maintains its own privacy policy. We recommend reviewing their respective policies for complete transparency on how your data is handled by each service." },
  { id: 9, title: "Changes to This Policy", body: "We may update this Privacy Policy periodically. Material changes will be communicated via email or a prominent notice within the app at least 7 days before taking effect. Continued use after changes are posted constitutes acceptance of the updated policy." },
  { id: 10, title: "Contact Us", body: "For privacy-related questions, data access requests, or deletion requests, contact us at support@scorephantom.com. We are committed to protecting your privacy and will respond within 2 business days." },
];

function Item({ id, title, body }: { id: number; title: string; body: string }) {
  const [open, setOpen] = useState(false);
  const base = "border rounded-2xl overflow-hidden transition-all duration-200 ";
  const opn = "border-primary/30 bg-primary/[0.04]";
  const closed = "border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14]";
  return (
    <div className={base + (open ? opn : closed)}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-5 py-4 text-left gap-3">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-black text-primary/50 font-mono w-5 shrink-0">{String(id).padStart(2, "0")}</span>
          <span className="text-sm font-semibold text-white">{title}</span>
        </div>
        <ChevronDown size={14} className={"text-muted-foreground shrink-0 transition-transform duration-200 " + (open ? "rotate-180 text-primary" : "")} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="px-5 pb-5 border-t border-white/[0.06]">
              <p className="pt-4 text-sm text-white/60 leading-relaxed">{body}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Privacy() {
  return (
    <div className="min-h-screen bg-[#090d13] text-white">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-primary/4 blur-[100px]" />
      </div>
      <div className="relative z-10 max-w-2xl mx-auto px-4 py-8 pb-20">
        <Link href="/login">
          <a className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-white transition-colors mb-8">
            <span className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
              <ArrowLeft size={14} />
            </span>
            Back to Login
          </a>
        </Link>
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Lock size={18} className="text-primary" />
            </div>
            <div>
              <p className="text-sm tracking-[0.15em] font-semibold">SCORE<span className="text-primary">PHANTOM</span></p>
              <p className="text-[10px] text-muted-foreground tracking-wider uppercase">Legal</p>
            </div>
          </div>
          <h1 className="text-2xl font-black mb-3">Privacy Policy</h1>
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gradient-to-r from-primary/40 to-transparent" />
            <p className="text-xs text-muted-foreground shrink-0">Last updated: {UPDATED}</p>
          </div>
        </div>
        <div className="mb-6 p-4 rounded-2xl bg-primary/5 border border-primary/15">
          <p className="text-sm text-white/70 leading-relaxed">Your privacy matters to us. This policy explains what data we collect, how we use it, and the choices you have. ScorePhantom does not sell your personal data or use it for advertising.</p>
        </div>
        <div className="flex flex-col gap-3">
          {SECTIONS.map((s) => (
            <Item key={s.id} id={s.id} title={s.title} body={s.body} />
          ))}
        </div>
        <div className="mt-10 pt-6 border-t border-white/[0.07] text-center space-y-2">
          <p className="text-xs text-muted-foreground/60">Privacy questions? Email <a href="mailto:support@scorephantom.com" className="text-primary hover:underline">support@scorephantom.com</a></p>
          <p className="text-[10px] text-muted-foreground/40">{"© " + new Date().getFullYear() + " ScorePhantom. All rights reserved."}</p>
        </div>
      </div>
    </div>
  );
}
