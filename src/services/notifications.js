import webpush from 'web-push';
import db from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

// Ensure VAPID keys are set
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (!vapidPublicKey || !vapidPrivateKey) {
  console.warn("⚠️ VAPID keys are not set. Push notifications will not work.");
} else {
  webpush.setVapidDetails(
    'mailto:support@scorephantom.com',
    vapidPublicKey,
    vapidPrivateKey
  );
}

export const getVapidPublicKey = () => {
  return vapidPublicKey;
};

export const saveSubscription = async (userId, subscription) => {
  const endpoint = subscription.endpoint;
  const keys = JSON.stringify(subscription.keys);

  try {
    await db.execute({
      sql: `INSERT INTO push_subscriptions (user_id, endpoint, keys) 
            VALUES (?, ?, ?) 
            ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, keys = EXCLUDED.keys`,
      args: [userId, endpoint, keys]
    });
    return true;
  } catch (error) {
    console.error("Error saving push subscription:", error);
    throw error;
  }
};

export const sendPushNotification = async (userId, payload) => {
  try {
    const result = await db.execute({
      sql: `SELECT endpoint, keys FROM push_subscriptions WHERE user_id = ?`,
      args: [userId]
    });

    const subscriptions = result.rows;
    
    if (!subscriptions || subscriptions.length === 0) {
      return false;
    }

    const notifications = subscriptions.map(sub => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: JSON.parse(sub.keys)
      };

      return webpush.sendNotification(pushSubscription, JSON.stringify(payload))
        .catch(err => {
          if (err.statusCode === 404 || err.statusCode === 410) {
            console.log('Subscription has expired or is no longer valid: ', err);
            // Delete the invalid subscription
            return db.execute({
              sql: `DELETE FROM push_subscriptions WHERE endpoint = ?`,
              args: [sub.endpoint]
            });
          } else {
            console.error('Error sending notification: ', err);
            throw err;
          }
        });
    });

    await Promise.all(notifications);
    return true;
  } catch (error) {
    console.error("Error processing push notifications:", error);
    throw error;
  }
};
