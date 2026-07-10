import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Disable browser's native scroll restoration to prevent it from interfering with custom scroll restoration
if ('scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual';
}

// Register Service Worker for Push Notifications (FCM)
// Guard against duplicate registration logs — navigator.serviceWorker.register()
// resolves every time it's called (even if already registered), and some browsers
// re-check on navigation. The module-level flag ensures we only log once per
// page session, eliminating the "24+ FCM Service Worker registered" console spam.
let _fcmSwRegistered = false;
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    if (_fcmSwRegistered) return;
    _fcmSwRegistered = true;
    navigator.serviceWorker
      .register("/firebase-messaging-sw.js")
      .then((reg) => console.log("FCM Service Worker registered:", reg.scope))
      .catch((err) => console.log("FCM Service Worker registration failed:", err));
  });
}

createRoot(document.getElementById("root")!).render(<App />);
