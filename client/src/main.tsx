import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Disable browser's native scroll restoration to prevent it from interfering with custom scroll restoration
if ('scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual';
}

createRoot(document.getElementById("root")!).render(<App />);
