# Interactive Match Simulator & Push Notification Engine

## Overview
This design covers two major features to drive engagement and retention for ScorePhantom:
1. **Interactive Match Simulator ("Sandbox"):** A premium tool allowing users to pick any two teams, adjust real-world variables (injuries, motivation, weather), and see how the core AI engine recalculates Expected Goals (xG) and betting markets in real-time.
2. **Push Notification Engine:** A Web Push system utilizing service workers to send re-engagement messages (e.g., "Match starting soon!", "New AI predictions available", special offers) even when the user has closed the app.

---

## 1. Interactive Match Simulator (Option A: Backend-Powered)
We will use the **Backend-Powered** approach. While it introduces a slight network delay, it guarantees that the simulation uses the exact same mathematical rigor (Poisson, time-decay, predictability gates) as the real predictions. Recreating this math on the client would inevitably lead to discrepancies.

### Architecture & Data Flow
1. **Frontend UI (`/simulator`):**
   - Two team search/select dropdowns (Home & Away).
   - Sliders/Toggles for modifiers:
     - Home/Away Motivation (Low/Normal/High)
     - Key Player Injuries (0-5 scale)
     - Weather/Pitch Conditions (Normal/Heavy Rain/Snow)
     - Form Overrides (e.g., "Force 5-game win streak data")
   - A "Simulate Match" button that triggers the API.
   - A results panel mirroring the `MatchCenter` UI, showing the dynamically calculated xG, 1X2 probabilities, and suggested markets.

2. **Backend API (`POST /api/simulator/run`):**
   - Receives the selected `home_team_id`, `away_team_id`, and `modifiers` object.
   - **Data Fetch:** Pulls the standard baseline data (last 10 matches, H2H, league averages) for both teams from the database.
   - **Feature Injection:** Modifies the baseline data vector based on the frontend sliders.
     - *Example:* If "Key Injuries = 3" for Home, the engine artificially drops the Home Team's offensive xG rating by 25%.
   - **Simulation:** Passes the modified data vector into the existing `estimateExpectedGoals` and `scoreMarketCandidates` functions.
   - **Response:** Returns the simulated probabilities and market suggestions to the frontend.

### Error Handling
- If a user selects teams from completely different leagues where cross-league comparison data is missing, the backend will use a standardized "global baseline" to bridge the gap, but will return a `confidence: "low"` flag with a warning UI.

---

## 2. Push Notification Engine (Web Push via Service Workers)
To re-engage users when they are not in the app, we will implement standard Web Push Notifications. Since ScorePhantom is a PWA, this will work natively on Android (Chrome/Firefox) and iOS (Safari 16.4+).

### Architecture & Data Flow
1. **Frontend Registration (`usePushNotifications` hook):**
   - When a user logs in, the app prompts for Notification Permissions using the browser's native API.
   - If granted, the Service Worker (`public/sw.js` or a new `push-sw.js`) registers with the browser's push service to obtain a unique `PushSubscription` object.
   - The frontend sends this `PushSubscription` to the backend to be stored against the user's profile.

2. **Backend Storage & Triggering:**
   - **Database Update:** Add a `push_subscriptions` JSON column to the `users` table, or create a dedicated `push_subscriptions` table linking `user_id` to the subscription endpoints.
   - **Notification Service:** Implement a Node.js module using the `web-push` library.
   - **Triggers:**
     - *Automated:* A cron job checks for upcoming matches in the user's "favorites" or general high-confidence AI picks and fires a notification 1 hour before kickoff.
     - *Manual/Marketing:* An admin endpoint (`POST /api/admin/notify`) allowing you to broadcast custom messages (e.g., "50% off Premium this weekend!") to all users.

3. **Service Worker Delivery (`public/sw.js`):**
   - The service worker listens for the `push` event.
   - When a push arrives from the backend, the service worker displays the native OS notification banner.
   - When the user clicks the notification, the `notificationclick` event fires, bringing the app to the foreground and routing them to the relevant page (e.g., `/match/1234` or `/premium`).

### Key Considerations
- **iOS Limitations:** Web Push on iOS *requires* the user to have added the PWA to their Home Screen. The UI must explicitly guide iOS users to "Add to Home Screen" before asking for notification permissions.
- **VAPID Keys:** We will need to generate Voluntary Application Server Identification (VAPID) keys for the backend to securely authenticate with browser push services.