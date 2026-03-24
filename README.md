# ⚽ ScorePhantom — AI Football Prediction Engine

Premium football prediction web app with a multi-layered AI prediction engine, game script analysis, value detection, and market scoring.

## 🧠 How the Prediction Engine Works

```
raw data → features → game-state model → probability model → market scoring → best pick
```

1. **Team Strength Analysis** — squad quality, league level, home advantage, recent opposition strength
2. **Form Computation** — last 5/10 results, goals, clean sheets, xG trends
3. **Game Script Classification** — classifies each match into one of 6 scripts (dominant home, open end-to-end, tight low-event, etc.)
4. **Poisson Expected Goals** — calculates expected home/away goals using adjusted lambdas
5. **Market Scoring** — scores every market (1X2, BTTS, Over/Under, team goals, handicaps, double chance, DNB)
6. **Value Detection** — compares model probability against market odds to find mispriced outcomes
7. **Smart Pick Selection** — returns the single strongest edge, not just "who wins"

### Confidence Breakdown
Each prediction includes 3 confidence dimensions:
- **Model Confidence** — how sure the model is (HIGH/MEDIUM/LEAN/LOW)
- **Market Value** — how mispriced the odds are (STRONG/FAIR/WEAK)
- **Match Volatility** — how unpredictable the match is (LOW/MEDIUM/HIGH)

### Groq AI (~30% Usage)
- Groq evaluates ~30% of predictions for enhanced analysis
- Smart budget system: max 20 calls/hour, 200/day
- High-value matches (top leagues, tight games) always get AI evaluation
- 70% handled by the deterministic engine for speed and cost efficiency

## 💰 Payment System

- **OPay Bank Transfer** — users transfer ₦3,000/month directly
- **WhatsApp Receipt Verification** — users upload payment proof via WhatsApp
- No third-party payment gateway fees

## 🔒 Access Tiers

| Feature | Free Trial (3 days) | Premium |
|---------|:-------------------:|:-------:|
| View matches | Limited (2 per league) | ✅ All |
| Basic predictions | ✅ | ✅ |
| Game scripts & reasons | ❌ | ✅ |
| Value detection | ❌ | ✅ |
| AI chat | ❌ | ✅ |
| Confidence breakdown | ❌ | ✅ |

## 🚀 Setup

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Edit .env with your actual values

# Seed the database
npm run seed

# Start
npm start
```

## 📁 Project Structure

```
├── index.html                          # Single-page frontend (CSS + JS inline)
├── src/
│   ├── app.js                          # Express server
│   ├── api/routes.js                   # API endpoints
│   ├── auth/authRoutes.js              # Auth + OPay payment
│   ├── predictions/poissonEngine.js    # Core prediction engine (1153 lines)
│   ├── evaluations/groqEvaluator.js    # Groq AI evaluator with rate limiting
│   ├── explanations/groqExplainer.js   # AI explanation + chat
│   ├── features/computeFeatures.js     # Feature extraction
│   ├── enrichment/enrichOne.js         # Data enrichment
│   ├── services/livescore.js           # Live score API
│   └── config/database.js              # Database connection
├── public/
│   └── logo.png
└── package.json
```

## 🌐 Deployment (Render)

1. Push to GitHub
2. Connect repo to Render
3. Set environment variables in Render dashboard
4. Build command: `npm install`
5. Start command: `npm start`

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GROQ_API_KEY` | Groq API key for AI evaluation |
| `DATABASE_URL` | Turso/LibSQL database URL |
| `JWT_SECRET` | Secret for JWT tokens |
| `APIFY_TOKEN` | Apify token for data enrichment |
| `OPAY_ACCOUNT_NUMBER` | OPay account for payments |
| `WHATSAPP_NUMBER` | WhatsApp number for receipt verification |
