# Basketball Foundation Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make basketball predictions reliably available from cache, separate public track record by sport, and preserve football integrity while preparing the premium shell work.

**Architecture:** Keep football and basketball business logic separate. Improve basketball by tightening the sync-to-cache-to-prediction loop, then expose only cached or single-game-rebuilt predictions to users. Public truth remains sport-filtered via shared routes, but every sport-sensitive query must explicitly respect `sport_key`.

**Tech Stack:** Node.js, Express, PostgreSQL, React, TanStack Query, Vite

---

### Task 1: Stabilize Basketball Cached Prediction Reads

**Files:**
- Modify: `C:\Users\Dawrld\Documents\Playground\score-phantom-review\src\basketball\routes\basketballRoutes.js`
- Modify: `C:\Users\Dawrld\Documents\Playground\score-phantom-review\src\basketball\storage\basketballDb.js`
- Test: `C:\Users\Dawrld\Documents\Playground\score-phantom-review\src\scripts\phase3_prediction_picks_material_change_test.mjs`

- [ ] Step 1: Add a storage helper that can fetch the latest basketball prediction row for one game and engine version preference.
- [ ] Step 2: Update `/api/basketball/games/:league/:externalId` to return the linked cached prediction summary when it exists.
- [ ] Step 3: Update `/api/basketball/predict/:league/:externalId` to:
  - return the cached prediction immediately when fresh enough,
  - rebuild only for that one game when cache is missing or stale,
  - never require a whole-slate regeneration to show a single game prediction.
- [ ] Step 4: Keep the current honest fallback for games that still have no usable odds.
- [ ] Step 5: Run targeted verification with `node --check` on the touched backend files.

### Task 2: Make Basketball Best Picks Purely Cache-Backed and Honest

**Files:**
- Modify: `C:\Users\Dawrld\Documents\Playground\score-phantom-review\src\basketball\routes\basketballRoutes.js`
- Modify: `C:\Users\Dawrld\Documents\Playground\score-phantom-review\src\basketball\jobs\basketballSync.js`
- Modify: `C:\Users\Dawrld\Documents\Playground\score-phantom-review\src\basketball\config\apiSportsTopLeagues.js`

- [ ] Step 1: Keep `/api/basketball/best-picks` fully cache-driven and ensure it only surfaces rows with saved prediction payloads.
- [ ] Step 2: Tighten the curated league ordering so the 15-league set is intentionally major-first and quota-aware.
- [ ] Step 3: Ensure batch prediction runs stay bounded to the short upcoming window and do not expand needlessly.
- [ ] Step 4: Preserve the current no-lines state instead of fabricating value edges when no bookmaker lines were stored.
- [ ] Step 5: Run targeted verification with `node --check` on the touched backend files.

### Task 3: Separate Public Track Record by Sport

**Files:**
- Modify: `C:\Users\Dawrld\Documents\Playground\score-phantom-review\src\api\trackRecordRoutes.js`
- Modify: `C:\Users\Dawrld\Documents\Playground\score-phantom-review\src\services\resultChecker.js`
- Modify: `C:\Users\Dawrld\Documents\Playground\score-phantom-review\src\services\wsLiveScores.js`
- Modify: `C:\Users\Dawrld\Documents\Playground\score-phantom-review\src\storage\backtesting.js`

- [ ] Step 1: Verify football settlement continues to write `sport_key='football'` consistently across the daily checker, websocket finalizer, and admin/manual helper.
- [ ] Step 2: Keep track-record stats and recent endpoints explicitly filtered by requested sport, with football-only backtest blending and basketball-only live rows.
- [ ] Step 3: Ensure no route accidentally treats `NULL` sport rows as basketball.
- [ ] Step 4: Preserve the existing ROI snapshot integrity work while keeping basketball result views safely separate.
- [ ] Step 5: Run targeted verification with `node --check` on the touched backend files.

### Task 4: Make Basketball Detail UI Read the Stronger API Contract

**Files:**
- Modify: `C:\Users\Dawrld\Documents\Playground\score-phantom-review\client\src\pages\BasketballGame.tsx`
- Modify: `C:\Users\Dawrld\Documents\Playground\score-phantom-review\client\src\pages\Basketball.tsx`

- [ ] Step 1: Update the detail page to trust cached prediction presence from the improved backend contract instead of assuming empty prediction data means total failure.
- [ ] Step 2: Keep the “line unavailable” and “no clear edge” states visually distinct.
- [ ] Step 3: Make the basketball slate page prioritize major leagues and show clearer count and availability messaging.
- [ ] Step 4: Avoid introducing admin affordances into the user app shell.
- [ ] Step 5: Run the frontend build with `npm.cmd run build`.

### Task 5: Verify Phase 1 End to End

**Files:**
- Verify: `C:\Users\Dawrld\Documents\Playground\score-phantom-review`

- [ ] Step 1: Run `node C:\Users\Dawrld\Documents\Playground\score-phantom-review\src\scripts\phase3_profit_units_test.mjs`.
- [ ] Step 2: Run `node C:\Users\Dawrld\Documents\Playground\score-phantom-review\src\scripts\phase3_prediction_picks_material_change_test.mjs`.
- [ ] Step 3: Run `node --check C:\Users\Dawrld\Documents\Playground\score-phantom-review\src\app.js`.
- [ ] Step 4: Run `npm.cmd run build` from `C:\Users\Dawrld\Documents\Playground\score-phantom-review`.
- [ ] Step 5: Review the changed files for quota safety, sport separation, and broken CTA risk before merge.
