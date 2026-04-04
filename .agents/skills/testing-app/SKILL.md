# Testing Score-Phantom Webapp

## Auth Flow
- **Browser "Sign in with Email"** uses Firebase `signInWithEmail` first, then exchanges the Firebase ID token for a JWT via `/auth/email`. This is NOT the same as the direct `/auth/login` endpoint.
- **Direct API login**: `POST /api/auth/login` with `{"email", "password"}` returns a JWT token directly (bypasses Firebase). Use this for programmatic testing.
- **Token storage**: JWT stored in `localStorage` as `sp_token`. The `useAuth` hook calls `/api/auth/me` with the token to verify session.
- **Token injection workaround**: If Firebase login fails in browser, obtain token via curl and inject with Playwright CDP:
  ```python
  await page.evaluate('() => localStorage.setItem("sp_token", "<token>")')
  await page.goto("https://score-phantom.onrender.com/")
  ```

## Test Accounts
- Premium: `$SCORE_PHANTOM_PREMIUM_EMAIL` / `$SCORE_PHANTOM_PREMIUM_PASSWORD`
- Free trial: `$SCORE_PHANTOM_TRIAL_EMAIL` / `$SCORE_PHANTOM_TRIAL_PASSWORD`

## Navigation
- Dashboard: `/` — shows fixtures grouped by league, prediction badges, odds
- Top Picks: `/top-picks` — premium-only, best tips ranked by composite score
- ACCA Builder: `/acca-calculator` — premium-only accumulator builder
- Track Record: `/track-record` — win rate ring, market breakdown
- Prediction Results: `/results` — prediction outcomes with W/L icons
- Paywall: `/paywall` — upgrade prompt for expired trial accounts

## Key API Endpoints
- `GET /api/fixtures?date=YYYY-MM-DD` — fixtures with predictions
- `GET /api/track-record?days=30` — backtesting accuracy stats
- `GET /api/prediction-results?limit=50&days=30` — prediction outcomes
- `GET /api/top-picks-today?limit=15` — top ranked picks
- `GET /api/auth/me` — current user info + access status

## Architecture
- **Render** hosts the full-stack app (Express backend + built React frontend)
- **Vercel** deploys frontend-only preview builds (no API proxy) — `/api` calls will 404
- **Turso/LibSQL** database
- **Firebase** for Google OAuth and email verification
- **Flutterwave** for payment processing (V3 hosted payment)

## Access Tiers
- **Premium**: Full access to all features
- **Trial**: 3 days, 3 predictions/day, restricted from Top Picks/ACCA/Value Bet
- **Expired trial**: Redirected to paywall, "Free Trial Expired" banner on dashboard
