import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Disable browser's native scroll restoration to prevent it from interfering with custom scroll restoration
if ('scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual';
}

// Register Service Worker for Push Notifications (FCM)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/firebase-messaging-sw.js")
      .then((reg) => console.log("FCM Service Worker registered:", reg.scope))
      .catch((err) => console.log("FCM Service Worker registration failed:", err));
  });
}

createRoot(document.getElementById("root")!).render(<App />);
