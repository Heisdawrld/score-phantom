# ScorePhantom Code Wiki

## 1. Overall Project Architecture

**ScorePhantom** is a full-stack, data-driven football prediction engine designed to provide premium match predictions, live scores, value betting edges, and AI-driven match analysis. 

The architecture is split into two main components:
- **Frontend (Client)**: A modern Single Page Application (SPA) built with **React**, **Vite**, **Tailwind CSS**, and **Radix UI**. It uses `wouter` for routing, `framer-motion` for animations, and `@tanstack/react-query` for data fetching and state management.
- **Backend (Server)**: A **Node.js / Express.js** monolithic REST API server. It manages user authentication, payment webhooks, database interactions, and runs the core prediction engine pipeline. 
- **Database**: Uses **Turso (LibSQL)**, an edge-hosted SQLite database, for fast, distributed data storage.
- **External Integrations**:
  - **Firebase Admin**: Used for Google authentication and email verification.
  - **Flutterwave**: Handles premium subscription payments and webhooks.
  - **Groq API**: Powers the "PhantomChat" feature, providing AI-generated explanations based on deterministic model outputs.
  - **BSD LiveScores / Apify**: Provides real-time match data, odds, and historical team statistics.

---

## 2. Responsibilities of Major Modules

### Backend Modules (`/src`)
- **`api/`**: Contains Express routers (`routes.js`, `adminRoutes.js`) for public and protected API endpoints (fixtures, ACCA builder, stats, track record).
- **`auth/`**: Manages JWT authentication, Firebase Google Sign-In, password resets, and Flutterwave payment webhooks (`authRoutes.js`).
- **`engine/`**: The core orchestration pipeline for predictions. It delegates tasks to normalize data, calculate probabilities, and select betting markets.
- **`enrichment/`**: Handles fetching external match statistics and odds from data providers.
- **`features/`**: Extracts features from raw match data (e.g., form, Head-to-Head (H2H), team strength) to be used by the statistical models.
- **`markets/`**: Evaluates and ranks different betting markets (1X2, BTTS, Over/Under) based on model probabilities and market odds.
- **`probabilities/`**: Mathematical and statistical modeling layer, specifically calculating Expected Goals (xG) using Poisson distribution.
- **`services/`**: Integration layers for third-party APIs (BSD live scores, Flutterwave, Groq explainer, Email services).
- **`storage/`**: Database persistence layers for caching predictions, tracking historical outcomes, and backtesting.

### Frontend Modules (`/client/src`)
- **`pages/`**: High-level React components representing views (e.g., `Dashboard.tsx`, `MatchCenter.tsx`, `Paywall.tsx`, `Admin.tsx`).
- **`components/`**: Reusable UI components, including Radix UI primitives (`components/ui/`), match-specific tabs, and prediction cards.
- **`hooks/`**: Custom React hooks like `use-auth.ts` and `use-predictions.ts` for managing global state.
- **`lib/api.ts`**: A centralized fetch wrapper that automatically attaches JWT tokens and handles unauthorized (401) redirects.

---

## 3. Key Classes and Functions

### Backend: Prediction Engine
The core prediction logic is cleanly orchestrated in `src/engine/runPredictionEngine.js` using four distinct stages:
- **`runPredictionEngine(fixtureId, rawData)`**: The main entry point that orchestrates the following stages and handles errors.
- **`preparePredictionContext()`**: (Stage 1) Normalizes data, builds feature vectors, and classifies the "game script" (e.g., dominant home, tight low-event).
- **`runProbabilityPipeline()`**: (Stage 2) Calculates expected goals (xG) using Poisson models and calibrates raw probabilities into usable data.
- **`runMarketSelection()`**: (Stage 3) Compares calibrated probabilities against real market odds to find value, ranks candidates, and selects the best pick.
- **`finalizePredictionResult()`**: (Stage 4) Compiles confidence profiles (Model, Value, Volatility), generates reason codes, and returns the final prediction payload.

### Backend: Background Workers & Services
- **`autoEnrich()`** (`src/app.js`): A background worker that runs periodically to fetch and store external statistics for upcoming fixtures.
- **`checkResults()`** (`src/services/resultChecker.js`): A scheduled job that evaluates past predictions against actual match outcomes to update the application's track record.
- **`buildAcca(rows, mode)`** (`src/engine/buildAcca.js`): An intelligent accumulator (parlay) builder that generates a slip of safe or value picks based on volatility and probability thresholds.
- **`chatAboutMatch()`** (`src/services/groqExplainer.js`): Prompts the Groq LLM with the deterministic prediction data to provide conversational, contextual insights to premium users.

### Frontend: Core Utilities
- **`fetchApi(path, options)`** (`client/src/lib/api.ts`): Wrapper around the native `fetch` API. Automatically injects the `Bearer` token from `localStorage` and handles global error catching.
- **`computeAccessStatus(user)`** (`src/auth/authRoutes.js`): Evaluates user trial dates, subscription codes, and admin flags to determine feature access levels dynamically.

---

## 4. Dependency Relationships

- **Frontend ↔ Backend**: The React SPA communicates with the Express backend exclusively via RESTful JSON APIs. Authentication is maintained using stateless JWT Bearer tokens passed in the `Authorization` header.
- **Backend ↔ Database**: The Express server uses the `@libsql/client` driver to connect to a Turso database. Data access is direct via raw SQL queries rather than a heavy ORM.
- **Backend ↔ Firebase Admin**: Validates ID tokens received from the frontend's Google Sign-In and handles email verification flows.
- **Backend ↔ Flutterwave**: The backend initializes payments, provides a hosted checkout link, and listens to webhooks (`/api/auth/webhook/flutterwave`) to securely grant premium access.
- **Backend ↔ BSD API / LiveScores**: `src/services/bsd.js` and `src/services/wsLiveScores.js` fetch spatial data, live score updates, and match events.
- **Backend ↔ Groq SDK**: `src/services/groqExplainer.js` generates human-readable explanations and interactive chat responses based on the deterministic prediction engine's output.

---

## 5. Instructions for Running the Project

### Prerequisites
- Node.js (v18 or higher recommended)
- A Turso (LibSQL) database instance
- Firebase Service Account JSON (for auth)
- API Keys for Flutterwave, Groq, and Apify (if enriching data)

### 1. Environment Setup
Create a `.env` file in the root directory based on the provided `.env.example`:
```bash
cp .env.example .env
```
Fill in the required variables:
```env
TURSO_URL=libsql://your-db-url.turso.io
TURSO_TOKEN=your_turso_token
JWT_SECRET=your_super_secret_jwt_key
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account", ...}
FLUTTERWAVE_SECRET_KEY=...
GROQ_API_KEY=...
```

### 2. Install Dependencies
Install dependencies for both the backend and the frontend:
```bash
# Install backend dependencies
npm install

# Install frontend dependencies
cd client && npm install && cd ..
```

### 3. Database Seeding
Initialize the database tables and seed the initial fixture data:
```bash
npm run seed
```

### 4. Running Locally (Development)
You will need two terminal windows to run the frontend and backend simultaneously.

**Terminal 1 (Backend):**
```bash
npm start
```
*The backend will run on `http://localhost:3000` (or the port defined in your `.env`).*

**Terminal 2 (Frontend):**
```bash
cd client
npm run dev
```
*The Vite development server will start, typically on `http://localhost:5173`.*

### 5. Production Build
To build the application for production (e.g., deploying to Render):
```bash
npm run build
```
This command navigates into the `client/` directory, builds the optimized React SPA into `client/dist`, and the Express backend (`src/app.js`) will automatically serve these static files when `npm start` is executed.
