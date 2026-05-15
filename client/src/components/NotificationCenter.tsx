import { useState, useRef, useEffect } from 'react';
import { Bell, Trophy, Flame, CheckCheck, X } from 'lucide-react';
import { useNotifications, AppNotification } from '@/hooks/use-notifications';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return Math.floor(diff/60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago';
  return Math.floor(diff/86400000) + 'd ago';
}

function NotifIcon({ type }: { type: string }) {
  if (type === 'match_result') return <Trophy className="w-4 h-4 text-primary" />;
  if (type === 'top_picks_ready') return <Flame className="w-4 h-4 text-orange-400" />;
  return <Bell className="w-4 h-4 text-blue-400" />;
}

export function NotificationCenter() {
  const { notifications, unreadCount, markRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [, setLocation] = useLocation();

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleOpen() {
    setOpen(o => !o);
    if (!open && unreadCount > 0) markRead();
  }

  function handleClick(n: AppNotification) {
    markRead(n.id);
    setOpen(false);
    const url = n.data?.url || '/';
    setLocation(url);
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={handleOpen} className="relative flex items-center justify-center w-9 h-9 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 hover:border-primary/30 transition-all">
        <Bell className="w-4 h-4 text-white/70" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-primary text-black text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, scale: 0.95, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -8 }} transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-80 rounded-2xl border border-white/10 bg-panel shadow-2xl shadow-black/60 z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
              <span className="text-sm font-bold text-white">Notifications</span>
              {unreadCount > 0 && (
                <button onClick={() => markRead()} className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors">
                  <CheckCheck className="w-3 h-3" /> Mark all read
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <Bell className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-30" />
                  <p className="text-xs text-muted-foreground">No notifications yet</p>
                </div>
              ) : notifications.map(n => (
                <div key={n.id} onClick={() => handleClick(n)} className={cn('flex items-start gap-3 px-4 py-3 border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors', !n.read && 'bg-primary/5')}>
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0 mt-0.5"><NotifIcon type={n.type} /></div>
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-xs font-semibold truncate', n.read ? 'text-white/70' : 'text-white')}>{n.title}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{n.body}</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">{timeAgo(n.created_at)}</p>
                  </div>
                  {!n.read && <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1" />}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
