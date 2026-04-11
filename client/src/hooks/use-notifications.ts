import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './use-auth';
import { requestPushPermission, onForegroundMessage } from '@/lib/firebase';
import { getAuthToken, fetchApi } from '@/lib/api';
import { useToast } from './use-toast';

export interface AppNotification {
  id: number; type: string; title: string; body: string;
  data: Record<string, any>; read: number; created_at: string;
}

async function savePushToken(token: string) {
  try { await fetchApi('/push-token', { method: 'POST', body: JSON.stringify({ token }) }); } catch(e) {}
}

export function useNotifications() {
  const { data: user } = useAuth();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [permission, setPermission] = useState<string>('default');

  useEffect(() => {
    if ('Notification' in window) setPermission(Notification.permission);
  }, []);

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const d = await fetchApi('/notifications');
      setNotifications(d.notifications || []);
      setUnreadCount(d.unread || 0);
    } catch(_) {}
  }, [user]);

  useEffect(() => {
    loadNotifications();
    const t = setInterval(loadNotifications, 2 * 60 * 1000);
    return () => clearInterval(t);
  }, [loadNotifications]);

  useEffect(() => {
    if (!user) return;
    return onForegroundMessage((payload: any) => {
      const n = payload.notification || {};
      toast({ title: n.title || 'ScorePhantom', description: n.body });
      setUnreadCount(c => c + 1);
      loadNotifications();
    });
  }, [user, toast, loadNotifications]);

  const enableNotifications = useCallback(async () => {
    if (!user) return false;
    try {
      const token = await requestPushPermission();
      if (!token) { setPermission(Notification.permission); return false; }
      await savePushToken(token);
      setPermission('granted');
      localStorage.setItem('sp_push_enabled', '1');
      return true;
    } catch(e) { console.error('[Notifs]', e); return false; }
  }, [user]);

  const markRead = useCallback(async (id?: number) => {
    try {
      if (id) { await fetchApi('/notifications/' + id + '/read', { method: 'POST' }); setNotifications(p => p.map(n => n.id === id ? {...n, read: 1} : n)); }
      else { await fetchApi('/notifications/read', { method: 'POST' }); setNotifications(p => p.map(n => ({...n, read: 1}))); }
      setUnreadCount(0);
    } catch(_) {}
  }, []);

  return { notifications, unreadCount, permission, enableNotifications, markRead, loadNotifications };
}
