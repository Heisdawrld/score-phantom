# Phantom Lab & AI Advisor: Premium Upgrades

## Overview
Based on user feedback, the app needs to move beyond just presenting raw percentages. Users want the engine to act as a *Premium Betting Advisor*. This document outlines the improvements to the **Phantom Lab** and the introduction of a new **AI Advisor Indicator** across the app.

## 1. Phantom Lab (Premium Match Sandbox)
The Phantom Lab replaces the basic simulator with a sleek, expensive-feeling UI where users can manipulate real-world variables for upcoming matches in supported leagues.

### Match Selection
- **Search Modal:** Users click "Select Match" to open a modal displaying upcoming fixtures (filtered to the 35 supported leagues). They can search by team name or browse.
- **Visuals:** The modal uses dark, glassmorphic styling consistent with the new premium UI.

### Expanded Simulation Variables
- **Motivation:** Sliders for Home/Away (-15% to +15% boost).
- **Injuries:** Sliders for Home/Away (0 to 5 key players missing).
- **Weather:** Toggles for Normal, Rain, Snow (affects variance and goal output).
- **Lineup Strength (Rotation):** Toggles for Full Strength, Rotated, Heavily Rotated.

### Before vs. After Results
- The engine calculates both the *Base Model* (no modifiers) and the *Simulated Model*.
- **UI Presentation:** Two side-by-side or stacked cards showing the shift in Expected Goals (xG) and the top market recommendation.
- **Dynamic Reasoning:** The backend generates a sentence explaining the shift (e.g., "Heavy rotation and snow decreased attacking output, shifting the best value to Under 2.5 Goals").
- **Animation:** A pulsing "Phantom" logo or a simulated pitch animation plays while the engine "calculates."

---

## 2. AI Advisor Indicator (App-Wide Upgrade)
To solve the problem of users not knowing *when* to trust a percentage, we are introducing a fun, clear, and actionable indicator attached to predictions.

### The Advisor Logic
The engine will evaluate the prediction's probability and the match's overall predictability score to categorize the pick into one of three buckets:

1. **"🔥 FIRE PICK" (Green/Gold Glow)**
   - *Condition:* High predictability match AND prediction probability > 75%.
   - *Meaning:* The engine is extremely confident. This is a core bet.
2. **"🎲 GAMBLE IT" (Orange/Amber Glow)**
   - *Condition:* Medium predictability OR prediction probability between 60% - 74%.
   - *Meaning:* Good value, but carries inherent risk. Good for accas or small stakes.
3. **"🛑 AVOID / TOO CHAOTIC" (Red/Muted Glow)**
   - *Condition:* Low predictability match OR prediction probability < 60%.
   - *Meaning:* The data is too volatile. The engine recommends staying away.

### UI Integration
- These indicators will be small, animated badges (e.g., blinking dots or glowing borders) attached to the market predictions in the `MatchCenter`, `TopPicksToday`, and `Phantom Lab`.
- It transforms the engine from a "calculator" into a "consultant."