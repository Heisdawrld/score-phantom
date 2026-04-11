import { useAuth } from '@/hooks/use-auth';
import { useLocation } from 'wouter';
import { Header } from '@/components/layout/Header';
import { ChevronLeft, CreditCard, Crown, Zap, Shield, HelpCircle, AlertCircle, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

export default function PaymentBilling() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading } = useAuth();
  
  const isPremium = user?.access_status === 'active' || (user as any)?.subscription_active;
  const isTrial = user?.access_status === 'trial';
  const isExpired = user?.access_status === 'expired';
  
  const trialEnd = (user as any)?.trial_ends_at ? new Date((user as any).trial_ends_at) : null;
  const premEnd = (user as any)?.subscription_expires_at ? new Date((user as any).subscription_expires_at) : null;
  const fmt = (d: Date | null) => d ? d.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : null;

  if (isLoading) return <div className="min-h-screen bg-background" />;

  return (
    <div className='min-h-screen bg-background pb-20'>
      <Header />
      <div className='max-w-2xl mx-auto px-4 pt-6'>
        
        {/* ── Header ── */}
        <div className='flex items-center gap-3 mb-8'>
          <button onClick={() => setLocation('/profile')} className='p-2 hover:bg-white/5 rounded-xl transition'>
            <ChevronLeft className='w-5 h-5' />
          </button>
          <div className='flex-1'>
            <h1 className='text-2xl font-black flex items-center gap-2'>
              <CreditCard className='w-6 h-6 text-primary' />
              Payment & Billing
            </h1>
            <p className='text-[11px] font-black text-white/25 uppercase tracking-widest mt-0.5'>Manage your subscription</p>
          </div>
        </div>

        {/* ── Current Plan ── */}
        <motion.div 
          initial={{ opacity: 0, y: 16 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="glass-card rounded-[2rem] p-6 sm:p-8 mb-6 relative overflow-hidden"
        >
          {isPremium ? (
             <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-amber-400/50 via-amber-400 to-amber-400/50" />
          ) : (
             <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-primary/50 via-primary to-primary/50" />
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
             <div>
                <p className="text-[10px] font-black text-white/35 uppercase tracking-[0.2em] mb-2">Current Plan</p>
                <div className="flex items-center gap-3">
                   {isPremium ? (
                     <div className="w-12 h-12 rounded-2xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center shrink-0">
                        <Crown className="text-amber-400" size={24} />
                     </div>
                   ) : (
                     <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                        <Zap className="text-primary" size={24} />
                     </div>
                   )}
                   <div>
                      <h2 className="text-xl font-black text-white uppercase tracking-tight">
                        {isPremium ? 'Premium Access' : isTrial ? 'Free Trial' : 'Basic (Expired)'}
                      </h2>
                      <p className="text-xs text-white/40 mt-0.5">
                         {isPremium && premEnd ? `Active until ${fmt(premEnd)}` 
                          : isTrial && trialEnd ? `Trial expires on ${fmt(trialEnd)}` 
                          : 'Your trial period has ended.'}
                      </p>
                   </div>
                </div>
             </div>
             
             {!isPremium && (
                <button onClick={() => setLocation('/paywall')} className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-primary text-black font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(16,231,116,0.3)] hover:brightness-110 transition-all">
                   Upgrade Now <ArrowRight size={14} />
                </button>
             )}
          </div>
        </motion.div>

        {/* ── Payment Settings ── */}
        <motion.div 
          initial={{ opacity: 0, y: 16 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ delay: 0.1 }}
          className="space-y-3 mb-6"
        >
           <h3 className="text-[11px] font-black text-white/30 uppercase tracking-[0.2em] ml-2 mb-3">Subscription Settings</h3>
           
           {isPremium && (
             <div className="glass-card rounded-2xl p-5 flex items-center justify-between">
                <div>
                   <p className="text-sm font-bold text-white">Cancel Subscription</p>
                   <p className="text-xs text-white/40 mt-0.5">Stop auto-renewal for your premium plan.</p>
                </div>
                {/* As there is no backend cancellation endpoint currently known, we direct to support or stub it */}
                <button className="px-4 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/60 hover:text-red-400 hover:border-red-500/20 hover:bg-red-500/10 transition-all text-xs font-bold">
                   Cancel Plan
                </button>
             </div>
           )}

           <div className="glass-card rounded-2xl p-5 flex items-center justify-between opacity-50 cursor-not-allowed">
              <div>
                 <p className="text-sm font-bold text-white">Payment Methods</p>
                 <p className="text-xs text-white/40 mt-0.5">Manage your saved cards (Powered by Flutterwave).</p>
              </div>
              <button disabled className="px-4 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/40 text-xs font-bold">
                 Manage
              </button>
           </div>
           
           <div className="glass-card rounded-2xl p-5 flex items-center justify-between opacity-50 cursor-not-allowed">
              <div>
                 <p className="text-sm font-bold text-white">Billing History</p>
                 <p className="text-xs text-white/40 mt-0.5">View and download your past invoices.</p>
              </div>
              <button disabled className="px-4 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/40 text-xs font-bold">
                 View All
              </button>
           </div>
        </motion.div>
        
        {/* ── Support & Security ── */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="flex flex-col gap-4 mt-8">
           <div className="flex items-start gap-3 bg-white/[0.02] border border-white/[0.05] p-4 rounded-2xl">
              <Shield className="w-5 h-5 text-primary shrink-0 opacity-70" />
              <div>
                 <p className="text-xs font-bold text-white/80">Secure Payments</p>
                 <p className="text-[10px] text-white/30 mt-0.5 leading-relaxed">
                    All transactions are securely processed by Flutterwave. ScorePhantom does not store your credit card details.
                 </p>
              </div>
           </div>
           
           <a href="mailto:support@scorephantom.com" className="flex items-center gap-3 bg-white/[0.02] border border-white/[0.05] p-4 rounded-2xl hover:bg-white/[0.04] transition-all">
              <HelpCircle className="w-5 h-5 text-white/40 shrink-0" />
              <div>
                 <p className="text-xs font-bold text-white/80">Need Help with Billing?</p>
                 <p className="text-[10px] text-white/30 mt-0.5">Contact our support team directly.</p>
              </div>
           </a>
        </motion.div>

      </div>
    </div>
  );
}
