import { useState, useEffect } from 'react';
import { fetchApi } from '../lib/api';

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setIsSupported(true);
      setPermission(Notification.permission);
      
      // Check current subscription status
      navigator.serviceWorker.ready.then(registration => {
        registration.pushManager.getSubscription().then(subscription => {
          setIsSubscribed(subscription !== null);
        });
      });
    }
  }, []);

  const subscribeToNotifications = async () => {
    if (!isSupported) return false;

    try {
      const currentPermission = await Notification.requestPermission();
      setPermission(currentPermission);

      if (currentPermission !== 'granted') {
        console.log('Notification permission denied');
        return false;
      }

      // Fetch VAPID key
      const { publicKey } = await fetchApi<{ publicKey: string }>('/notifications/vapidPublicKey');
      
      const registration = await navigator.serviceWorker.ready;
      
      // Convert base64 VAPID to Uint8Array
      const padding = '='.repeat((4 - publicKey.length % 4) % 4);
      const base64 = (publicKey + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = window.atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: outputArray
      });

      // Send to backend
      await fetchApi('/notifications/subscribe', {
        method: 'POST',
        body: JSON.stringify(subscription)
      });

      setIsSubscribed(true);
      return true;

    } catch (error) {
      console.error('Failed to subscribe to push notifications', error);
      return false;
    }
  };

  return { isSupported, isSubscribed, permission, subscribeToNotifications };
}