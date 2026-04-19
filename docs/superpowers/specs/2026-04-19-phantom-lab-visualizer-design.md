# Phantom Lab: Visual Match Simulator Design

## 1. Overview
The Phantom Lab (`Simulator.tsx`) is being upgraded from a static, slider-based statistical calculator into a premium, real-time 2D visual match simulator. It will automatically fetch real-world data (predicted starting XIs, manager tactics, team momentum, and referee stats) from the BSD API and simulate a highly realistic, 4-minute visual match on a virtual pitch.

## 2. Architecture & Data Flow

### 2.1 Backend (`POST /api/simulator/run`)
- **Data Ingestion:** When a simulation is triggered, the backend fetches:
  - `predicted_lineup` (formations and starting 11 players for both teams)
  - `team_form` and `h2h` (to establish base momentum)
  - `refereeData` (to calculate randomized extra time)
- **Simulation Engine:** Instead of just returning final probabilities, the backend generates a `simulation_script`.
  - The script is an array of "events" mapped to the 90 minutes.
  - Events include: Possession shifts (Home, Away, Neutral), Shots, Saves, Goals, and Half-Time/Full-Time whistles.
  - The script calculates a dynamic "Added Time" for both halves based on the referee's strictness and match chaos score.

### 2.2 Frontend (`Simulator.tsx` & `VirtualPitch.tsx`)
- **The Pitch:** A dark-mode, 2D top-down football pitch UI component.
- **The Players:** Renders the predicted starting 11 for both teams as glowing nodes positioned according to their real-world tactical formations (e.g., 4-3-3).
- **The Ball/Possession:** A glowing orb that moves dynamically between pitch zones (Defensive Third, Midfield, Attacking Third).

## 3. The 4-Minute Real-Time Loop
To make the simulation feel completely organic and unprogrammed, it runs on a fixed, realistic timer:
- **First Half (0' - 45'):** Takes exactly 2 minutes of real time.
- **First Half Added Time:** The referee adds random extra time (e.g., +3 mins), extending the real-time loop by a few seconds.
- **Half-Time Break:** A brief 5-second pause showing 1st Half stats.
- **Second Half (45' - 90'):** Takes exactly 2 minutes of real time.
- **Second Half Added Time:** Final dramatic stoppage time.

### 3.1 Organic Visualization Mechanics
- **Non-Linear Clock:** The in-game clock ticks up smoothly, but the possession shifts happen at random micro-intervals (every 1-3 seconds) to mimic the chaotic nature of football.
- **Player Highlighting:** When the ball enters a specific zone (e.g., Away Team's Left Wing), the corresponding player node (e.g., the Left Winger) pulses to indicate they are on the ball.
- **Goal Sequences:** If the simulation script triggers a goal:
  - The ball rapidly moves into the penalty box.
  - A "Shot" animation plays.
  - The net flashes, the scoreboard ticks up, and a dramatic UI overlay announces the goal scorer.

## 4. The Climax (Post-Match Reveal)
- At the final whistle (e.g., 90+4'), the pitch darkens and a massive glass-morphism overlay drops down.
- **Final Simulated Score:** Displayed prominently.
- **Value Bets & AI Badges:** The engine reveals the top betting markets derived from this specific simulation run (e.g., `Pick This 🔥 Home Win`, `Gamble It 🎲 Over 2.5`).
- **Simulated Stats:** Final possession %, total shots, and xG generated during the simulation.

## 5. UI/UX Considerations
- The UI must look premium, utilizing Framer Motion for smooth, physics-based ball movements and pulsing player nodes.
- Users must have a "Skip to End" button in case they do not want to wait the full 4 minutes, instantly revealing the final results.
- Modifiers (Motivation, Weather) still exist, but they now visually affect the simulation script (e.g., "Heavy Rain" makes the ball movement slightly more erratic and increases random possession turnovers).