import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Header } from '@/components/layout/Header';
import { fetchApi } from '@/lib/api';
import { ChevronLeft, Receipt, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/use-auth';

function fmtDate(d: string) {
  try { return new Date(d).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return d; }
}

export default function BillingHistory() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading: authLoading } = useAuth();
  
  const { data, isLoading } = useQuery({
    queryKey: ['billing-history'],
    queryFn: () => fetchApi('/payments/history'),
    enabled: !authLoading,
  });

  if (authLoading || isLoading) return <div className='min-h-screen bg-background' />;

  const history: any[] = data?.history || [];

  return (
    <div className='min-h-screen bg-background pb-20'>
      <Header />
      <div className='max-w-2xl mx-auto px-4 pt-6'>
        
        {/* ── Header ── */}
        <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8'>
          <div className='flex items-center gap-3'>
            <button onClick={() => window.history.back()} className='p-2 hover:bg-white/5 rounded-xl transition shrink-0'>
              <ChevronLeft className='w-5 h-5' />
            </button>
            <div>
              <h1 className='text-xl sm:text-2xl font-black flex items-center gap-2 text-white'>
                <Receipt className='w-5 h-5 sm:w-6 sm:h-6 text-primary' />
                Billing History
              </h1>
              <p className='text-[10px] font-black text-white/30 uppercase tracking-widest mt-0.5'>Past Transactions</p>
            </div>
          </div>
        </div>

        {/* ── List ── */}
        <div className="space-y-3">
          {history.length === 0 ? (
            <div className="glass-card rounded-[2rem] p-10 text-center flex flex-col items-center">
              <Receipt className="w-12 h-12 text-white/10 mb-4" />
              <p className="text-white/40 text-sm font-bold">No payments found</p>
            </div>
          ) : (
            history.map((tx: any, i: number) => (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                key={tx.id || i}
                className="glass-card p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-white/[0.05]"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-1">
                    {tx.status === 'verified' || tx.status === 'successful' ? (
                      <CheckCircle2 className="w-5 h-5 text-primary" />
                    ) : tx.status === 'initialized' ? (
                      <Clock className="w-5 h-5 text-amber-500" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-500" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white uppercase tracking-wider">
                      {tx.status === 'verified' || tx.status === 'successful' ? 'Subscription Premium' : 'Subscription Checkout'}
                    </p>
                    <p className="text-xs text-white/40 mt-0.5 space-x-2">
                       <span>{fmtDate(tx.created_at)}</span>
                       <span className="text-white/20">•</span>
                       <span className="font-mono text-[10px] text-white/30">{tx.reference}</span>
                    </p>
                  </div>
                </div>

                <div className="text-left sm:text-right flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-center">
                  <p className="text-lg font-black text-white">
                    {tx.amount_currency === 'NGN' ? '₦' : '$'}{(tx.amount || 3000).toLocaleString()}
                  </p>
                  <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mt-1">
                    {tx.channel || 'Flutterwave'}
                  </p>
                </div>
              </motion.div>
            ))
          )}
        </div>

      </div>
    </div>
  );
}
