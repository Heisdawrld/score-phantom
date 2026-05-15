import { useState } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Shield, ChevronDown } from "lucide-react";

const UPDATED = "January 2025";

const SECTIONS = [
  { id: 1, title: "Acceptance of Terms", body: "By accessing or using ScorePhantom you confirm you are at least 18 years old and agree to these Terms of Service. If you do not agree, please do not use the Service." },
  { id: 2, title: "Description of Service", body: "ScorePhantom provides data-driven football predictions and analytics for informational and entertainment purposes only. We do not guarantee accuracy and are not a bookmaker or gambling operator." },
  { id: 3, title: "User Accounts", body: "You must provide accurate information when registering. You are responsible for the security of your credentials. Do not share your account. Creating multiple accounts to exploit free trials is prohibited and may result in account termination." },
  { id: 4, title: "Subscriptions and Payments", body: "ScorePhantom offers a 7-day free trial then a monthly plan of NGN 3,000 processed via Flutterwave. Subscriptions grant 30-day access and do not auto-renew. Payments are non-refundable once a subscription period begins. Contact support within 7 days for payment issues." },
    { id: 5, title: "Free Trial Policy", body: "New users receive one 7-day free trial with full premium access available once per person or email. Creating multiple accounts to exploit the trial will result in permanent account termination." },
  { id: 6, title: "Intellectual Property", body: "All content on ScorePhantom including prediction models, algorithms, statistical data, designs, and branding is our exclusive intellectual property. You may not copy, scrape, redistribute, or reverse-engineer any part of the Service." },
  { id: 7, title: "Prohibited Conduct", body: "You agree not to use the Service unlawfully, attempt unauthorized access, upload malware, harass users, impersonate others, use bots, or resell our predictions without authorization. Violations may result in suspension or legal action." },
  { id: 8, title: "Disclaimer and Liability", body: "The Service is provided as-is without warranties. ScorePhantom shall not be liable for any indirect, incidental, or consequential damages, financial losses from betting, or service interruptions." },
  { id: 9, title: "Changes to Terms", body: "We may update these Terms at any time. Material changes will be communicated at least 7 days before taking effect. Continued use of the Service after changes constitutes acceptance." },
  { id: 10, title: "Governing Law", body: "These Terms are governed by the laws of the Federal Republic of Nigeria. Unresolved disputes will be submitted to binding arbitration in Lagos, Nigeria." },
  { id: 11, title: "Contact", body: "Questions about these Terms? Email us at support@scorephantom.com. We aim to respond within 2 business days." },
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


export default function Terms() {
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
              <Shield size={18} className="text-primary" />
            </div>
            <div>
              <p className="text-sm tracking-[0.15em] font-semibold">SCORE<span className="text-primary">PHANTOM</span></p>
              <p className="text-[10px] text-muted-foreground tracking-wider uppercase">Legal</p>
            </div>
          </div>
          <h1 className="text-2xl font-black mb-3">Terms of Service</h1>
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gradient-to-r from-primary/40 to-transparent" />
            <p className="text-xs text-muted-foreground shrink-0">Last updated: {UPDATED}</p>
          </div>
        </div>
        <div className="mb-6 p-4 rounded-2xl bg-primary/5 border border-primary/15">
          <p className="text-sm text-white/70 leading-relaxed">Please read these Terms carefully before using ScorePhantom. By using our platform, you agree to be bound by these terms. ScorePhantom is a prediction analytics tool and is not a gambling operator.</p>
        </div>
        <div className="flex flex-col gap-3">
          {SECTIONS.map((s) => (
            <Item key={s.id} id={s.id} title={s.title} body={s.body} />
          ))}
        </div>
        <div className="mt-10 pt-6 border-t border-white/[0.07] text-center space-y-2">
          <p className="text-xs text-muted-foreground/60">Questions? Email <a href="mailto:support@scorephantom.com" className="text-primary hover:underline">support@scorephantom.com</a></p>
          <p className="text-[10px] text-muted-foreground/40">{"© " + new Date().getFullYear() + " ScorePhantom. All rights reserved."}</p>
        </div>
      </div>
    </div>
  );
}
