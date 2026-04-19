# Implementation Plan: Phantom Lab & AI Advisor

## Overview
This plan details the implementation of the "Phantom Lab" premium sandbox and the app-wide "AI Advisor" indicator, based on the design at `docs/superpowers/specs/2026-04-19-phantom-lab-design.md`.

## Phase 1: AI Advisor Indicator (App-Wide)
We will introduce a reusable UI component that analyzes a prediction and assigns it a "Fire", "Gamble", or "Avoid" status with corresponding animations.

### 1.1 Backend Logic Update
1. **File:** `src/markets/scoreMarketCandidates.js` (or a new utility)
2. **Task:** Add an `advisor_status` field to the market output based on the probability and predictability score.
   - High predictability + >75% prob = `FIRE`
   - Medium predictability OR 60-74% prob = `GAMBLE`
   - Low predictability OR <60% prob = `AVOID`

### 1.2 Frontend Component
1. **Component:** `client/src/components/ui/AIAdvisorBadge.tsx`
2. **Task:** Create a React component that takes an `advisor_status` prop and renders an animated badge.
   - `FIRE`: Green/Gold pulsing glow with a fire icon.
   - `GAMBLE`: Orange/Amber pulse with dice icon.
   - `AVOID`: Red muted border with stop icon.
3. **Integration:** Inject this badge into `MatchCenter.tsx` and `TopPicksToday.tsx` wherever predictions are displayed.

## Phase 2: Phantom Lab Backend Upgrades
Upgrade the simulator endpoint to support the new variables and generate the "Before vs. After" comparison.

### 2.1 Feature Modifier Update
1. **File:** `src/features/modifyFeatureVector.js`
2. **Task:** Add support for `lineupStrength` (full, rotated, heavily_rotated). Update the logic to be more impactful.

### 2.2 API Endpoint Update
1. **File:** `src/api/routes.js` (the `/simulator/run` endpoint)
2. **Task:**
   - Run the engine twice: once with the original baseline vector, and once with the modified vector.
   - Calculate the delta in Expected Goals and the primary market recommendation.
   - Generate a dynamic `shift_reason` string (e.g., "The addition of 3 away injuries and heavy rain dropped the expected goals...").
   - Return both `base_simulation` and `custom_simulation` in the JSON response.

## Phase 3: Phantom Lab Frontend Upgrades
Transform the basic `Simulator.tsx` into the premium `PhantomLab.tsx`.

### 3.1 Match Selection Modal
1. **Component:** `client/src/components/simulator/MatchSelectorModal.tsx`
2. **Task:** Create a modal that fetches upcoming fixtures (`/api/fixtures/upcoming`) and allows the user to select one. It should pass the selected `fixture_id`, `home_team_id`, and `away_team_id` back to the parent.

### 3.2 Phantom Lab UI
1. **File:** Rename `Simulator.tsx` to `PhantomLab.tsx` and update routes.
2. **Task:**
   - Integrate the `MatchSelectorModal` to replace the manual Team ID inputs.
   - Expand the modifier sliders/toggles to match the new spec (Lineup Strength).
   - Implement the "Before vs. After" side-by-side card layout using Framer Motion for smooth reveals.
   - Display the dynamic `shift_reason` prominently.
3. **Animation:** Add a pulsing CSS animation (e.g., the glowing ghost logo) during the `isPending` state of the API call.