# Implementation Plan: Interactive Match Simulator & Push Notification Engine

## Overview
This plan details the implementation of the Interactive Match Simulator (Backend-Powered) and the Push Notification Engine for ScorePhantom, based on the design document at `docs/superpowers/specs/2026-04-19-brainstorm-features-design.md`.

## Phase 1: Push Notification Engine (Web Push)
Since the user confirmed that VAPID keys are already available in the Render environment, we will start with the Push Notification Engine.

### 1.1 Backend: Web-Push Integration & Storage
1. **Dependencies:** Install `web-push` library.
2. **Database:** Update the Turso `users` table to include a `push_subscriptions` column (JSON) or create a new table. *Note: We need to check the current database schema to decide.*
3. **API Endpoint (`POST /api/notifications/subscribe`):**
   - Create an endpoint to receive a `PushSubscription` object from the frontend.
   - Save the subscription to the user's record in the database.
4. **API Endpoint (`GET /api/notifications/vapidPublicKey`):**
   - Create an endpoint to expose the public VAPID key to the frontend.
5. **Notification Service (`src/services/notifications.js`):**
   - Configure `web-push` with VAPID keys from environment variables.
   - Implement a function `sendPushNotification(userId, payload)` to send notifications to all subscriptions for a user.
   - Implement a test/broadcast endpoint (`POST /api/admin/notify`) for manual triggering.

### 1.2 Frontend: Service Worker & Registration
1. **Service Worker (`client/public/sw.js`):**
   - Update the existing service worker to listen for `push` events and show notifications using `self.registration.showNotification`.
   - Listen for `notificationclick` events to handle routing when a user clicks the notification.
2. **React Hook (`client/src/hooks/use-push-notifications.ts`):**
   - Create a hook to request notification permission (`Notification.requestPermission()`).
   - Fetch the VAPID public key from the backend.
   - Subscribe the user using the Service Worker registration and the VAPID key.
   - Send the resulting `PushSubscription` to the backend.
3. **UI Integration:**
   - Add a "Enable Notifications" button/toggle in the `Profile.tsx` or `Settings.tsx` page.
   - Optionally prompt the user after login.

## Phase 2: Interactive Match Simulator (Backend-Powered)
Once the notification engine is active, we will build the Sandbox.

### 2.1 Backend: Simulator API
1. **API Endpoint (`POST /api/simulator/run`):**
   - Create a new route to handle simulation requests.
   - Input: `home_team_id`, `away_team_id`, `modifiers` (e.g., `{ homeMotivation: 'high', awayInjuries: 2, weather: 'rain' }`).
2. **Feature Modification Logic (`src/features/modifyFeatureVector.js`):**
   - Create a utility to adjust the baseline feature vector based on the provided modifiers.
   - *Example:* `if (modifiers.awayInjuries > 0) { vector.away_offensive_strength *= (1 - 0.05 * modifiers.awayInjuries); }`
3. **Simulation Pipeline:**
   - Fetch baseline data for both teams.
   - Apply modifications using the new utility.
   - Run the modified data through `estimateExpectedGoals` and `scoreMarketCandidates`.
   - Return the results (xG, 1X2 probabilities, suggested markets).

### 2.2 Frontend: Simulator UI
1. **Simulator Page (`client/src/pages/Simulator.tsx`):**
   - Create a new page accessible via the navigation menu.
   - Add team selection dropdowns (using existing team data/search if available).
   - Build a control panel for modifiers using sliders/toggles (Motivation, Injuries, Weather).
2. **Integration & Results:**
   - Add a "Simulate Match" button to trigger the backend API.
   - Display loading states during the API call.
   - Render the results using components similar to `MatchCenter.tsx` (Confidence Rings, Market suggestions).
3. **Routing:**
   - Add the `/simulator` route to `App.tsx` and the navigation menu (`BottomNav.tsx` / `Header.tsx`).