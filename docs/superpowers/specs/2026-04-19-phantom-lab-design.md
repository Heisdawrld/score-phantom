# Phantom Lab: Advanced Match Simulation (Premium)

## Overview
The "Phantom Lab" replaces the initial Match Simulator. It transforms a basic utility into a premium, power-user experience by allowing subscribers to tweak real-world variables on upcoming matches and compare the AI's base prediction against their simulated scenario. 

## Key Improvements
1. **Rebranding:** "Match Simulator" → "Phantom Lab". "AI Engine" → "ScorePhantom Model".
2. **Match Selection UX:** Users will click a "Select Match" button that opens a searchable modal of upcoming fixtures (restricted to the 35 supported leagues). No more entering Team IDs.
3. **Expanded Variables:** 
   - Home / Away Motivation
   - Home / Away Injuries
   - Weather Conditions
   - Lineup Strength (Rotation Risk)
4. **Before vs. After Comparison:** The output will display two side-by-side cards: the "Base Model" (original prediction) and the "Simulated Model" (new prediction), highlighting probability shifts and providing a dynamic reason for the change.
5. **Premium Exclusivity:** The feature is locked behind the premium paywall.

---

## 1. Match Selection Modal (Frontend)
- **Component:** `client/src/components/simulator/MatchSelectorModal.tsx`
- **Functionality:** 
  - A full-screen or large modal.
  - A search bar to filter upcoming fixtures by team name or league.
  - Displays a list of matches (similar to the `UpcomingFixtures` component).
  - Clicking a match selects it and populates the Phantom Lab context.

## 2. Expanded Modifiers (Frontend & Backend)
- **Component:** `client/src/pages/PhantomLab.tsx`
- **Sliders/Toggles:**
  - `homeMotivation`, `awayMotivation`: -1 (Low), 0 (Normal), 1 (High)
  - `homeInjuries`, `awayInjuries`: 0 to 5 players
  - `weather`: 'normal', 'rain', 'snow'
  - `lineupStrength`: 'full', 'rotated', 'heavily_rotated'
- **Backend Update:** `src/features/modifyFeatureVector.js`
  - Update the modification logic to handle `lineupStrength` (e.g., 'rotated' applies a 10% penalty to both offensive and defensive strength).

## 3. Before vs. After Comparison (Frontend & Backend)
- **Backend API (`POST /api/simulator/run`):**
  - The endpoint will now return *two* sets of results:
    1. `base_simulation`: The result of running the engine *without* the user's modifiers.
    2. `custom_simulation`: The result of running the engine *with* the user's modifiers.
  - The API will generate a `shift_reason` string comparing the two (e.g., "Heavy rotation and snow decreased expected goals by 0.8, shifting the best value from Home Win to Under 2.5").
- **Frontend UI (`PhantomLab.tsx`):**
  - Upon simulation completion, display a "Base Model" card (left/top) and a "Simulated Model" card (right/bottom).
  - Use Framer Motion to animate the transition and highlight the differences (e.g., green up arrows or red down arrows for probability changes).
  - Display the `shift_reason` prominently to explain the "Why".

## 4. Animation (Frontend)
- **Loading State:** While the simulation runs, display a custom SVG animation of a glowing soccer ball moving across a pitch, or a pulsing "Phantom" logo, indicating the engine is "crunching the numbers."