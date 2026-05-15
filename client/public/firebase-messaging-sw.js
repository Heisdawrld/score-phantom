// firebase-messaging-sw.js — FCM background push service worker
// Do NOT import any module — this file is loaded by importScripts()

importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js");

var firebaseConfig = {
  apiKey: "AIzaSyAHXHS9kwi_4HoCDyf0yi_UzLWzDRUU9Q0",
  authDomain: "scorephantom-app.firebaseapp.com",
  projectId: "scorephantom-app",
  storageBucket: "scorephantom-app.firebasestorage.app",
  messagingSenderId: "776631141819",
  appId: "1:776631141819:web:f3e3ffca1c68d76d8f309e",
}

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Show notification for background FCM messages
messaging.onBackgroundMessage(function(payload) {
  console.log("[FCM SW] Background message received");
  var notif = payload.notification || {};
  var data = payload.data || {};
  var title = notif.title || "ScorePhantom";
  var options = {
    body: notif.body || "You have a new notification",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: Object.assign({ url: "/" }, data),
    tag: data.type || "sp-notif",
    renotify: true
  };
  return self.registration.showNotification(title, options);
});

// Open the app when notification is clicked
self.addEventListener("notificationclick", function(event) {
  event.notification.close();
  if (event.action === "dismiss") return;
  var url = (event.notification.data && event.notification.data.url) ? event.notification.data.url : "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function(wins) {
      for (var i = 0; i < wins.length; i++) {
        var c = wins[i];
        if (c.url.indexOf(self.location.origin) !== -1 && "focus" in c) { c.navigate(url); return c.focus(); }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});