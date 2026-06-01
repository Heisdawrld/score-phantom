import { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { useNotifications } from '@/hooks/use-notifications';
import { useAuth } from '@/hooks/use-auth';
import { motion, AnimatePresence } from 'framer-motion';

export function NotificationPrompt() {
  const { data: user } = useAuth();
  const { permission, enableNotifications } = useNotifications();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (permission !== 'default') return;
    if (localStorage.getItem('sp_push_dismissed')) return;
    if (!('Notification' in window)) return;
    const t = setTimeout(() => setVisible(true), 3000);
    return () => clearTimeout(t);
  }, [user, permission]);

  async function handleEnable() {
    setLoading(true);
    const ok = await enableNotifications();
    setLoading(false);
    if (ok) { setSuccess(true); setTimeout(() => setVisible(false), 2000); }
    else { setVisible(false); }
  }

  function dismiss() {
    localStorage.setItem('sp_push_dismissed', '1');
    setVisible(false);
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }} transition={{ type: 'spring', damping: 20 }}
          className="fixed bottom-24 left-4 right-4 md:left-auto md:right-6 md:w-96 z-50">
          <div className="bg-panel border border-primary/30 rounded-2xl p-4 shadow-2xl shadow-black/60">
            <button onClick={dismiss} className="absolute top-3 right-3 text-muted-foreground hover:text-white transition-colors"><X className="w-4 h-4" /></button>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <Bell className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                {success ? (
                  <p className="text-sm font-bold text-primary">Notifications enabled!</p>
                ) : (
                  <>
                    <p className="text-sm font-bold text-white mb-1">Get notified about your picks</p>
                    <p className="text-xs text-muted-foreground mb-3">Daily top picks at 7am + instant match results</p>
                    <div className="flex gap-2">
                      <button onClick={handleEnable} disabled={loading} className="flex-1 bg-primary text-black text-xs font-bold py-2 px-3 rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-all">{loading ? 'Enabling...' : 'Enable Notifications'}</button>
                      <button onClick={dismiss} className="text-xs text-muted-foreground hover:text-white px-2 transition-colors">Later</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
