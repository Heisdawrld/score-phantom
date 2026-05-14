import {
  Document, Packer, Paragraph, TextRun, Header, Footer,
  AlignmentType, HeadingLevel, PageNumber, Table, TableRow, TableCell,
  WidthType, BorderStyle, ShadingType,
} from "docx";
import fs from "fs";

const P = {
  primary: "#0F172A",
  body: "#1E293B",
  secondary: "#64748B",
  accent: "#10E774",
  danger: "#EF4444",
  warning: "#F59E0B",
  info: "#3B82F6",
};
const c = (hex) => hex.replace("#", "");

function heading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({
    heading: level,
    spacing: { before: level === HeadingLevel.HEADING_1 ? 360 : 240, after: 120 },
    children: [
      new TextRun({
        text,
        bold: true,
        color: c(P.primary),
        font: { ascii: "Calibri", eastAsia: "SimHei" },
      }),
    ],
  });
}

function body(text) {
  return new Paragraph({
    spacing: { line: 312, after: 80 },
    children: [
      new TextRun({ text, size: 22, color: c(P.body), font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" } }),
    ],
  });
}

function boldBody(label, text) {
  return new Paragraph({
    spacing: { line: 312, after: 80 },
    children: [
      new TextRun({ text: label, bold: true, size: 22, color: c(P.primary), font: { ascii: "Calibri" } }),
      new TextRun({ text, size: 22, color: c(P.body), font: { ascii: "Calibri" } }),
    ],
  });
}

function bullet(text, level = 0) {
  return new Paragraph({
    bullet: { level },
    spacing: { line: 312, after: 60 },
    children: [
      new TextRun({ text, size: 22, color: c(P.body), font: { ascii: "Calibri" } }),
    ],
  });
}

function codeBlock(text) {
  return new Paragraph({
    spacing: { line: 280, after: 60 },
    indent: { left: 400 },
    children: [
      new TextRun({ text, size: 18, font: { ascii: "Consolas" }, color: c(P.secondary) }),
    ],
  });
}

function severityBadge(severity) {
  const colorMap = { CRITICAL: P.danger, HIGH: P.danger, MEDIUM: P.warning, LOW: P.info };
  return new TextRun({ text: `[${severity}]`, bold: true, size: 22, color: c(colorMap[severity] || P.info), font: { ascii: "Calibri" } });
}

function bugEntry(id, severity, title, description, location, fix) {
  return [
    new Paragraph({
      spacing: { before: 200, after: 80, line: 312 },
      children: [
        severityBadge(severity),
        new TextRun({ text: ` #${id}: `, bold: true, size: 22, color: c(P.primary), font: { ascii: "Calibri" } }),
        new TextRun({ text: title, bold: true, size: 22, color: c(P.body), font: { ascii: "Calibri" } }),
      ],
    }),
    boldBody("Location: ", location),
    body(description),
    boldBody("Fix: ", fix),
  ];
}

function makeTable(headers, rows) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(h =>
      new TableCell({
        shading: { fill: c(P.primary), type: ShadingType.CLEAR },
        margins: { top: 60, bottom: 60, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 20, color: "FFFFFF", font: { ascii: "Calibri" } })] })],
      })
    ),
  });
  const dataRows = rows.map((row, idx) =>
    new TableRow({
      children: row.map(cell =>
        new TableCell({
          shading: { fill: idx % 2 === 0 ? "F8FAFC" : "FFFFFF", type: ShadingType.CLEAR },
          margins: { top: 60, bottom: 60, left: 120, right: 120 },
          children: [new Paragraph({ children: [new TextRun({ text: String(cell), size: 20, color: c(P.body), font: { ascii: "Calibri" } })] })],
        })
      ),
    })
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
  });
}

// ── Build Document ──
const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" }, size: 22, color: c(P.body) },
        paragraph: { spacing: { line: 312 } },
      },
    },
  },
  sections: [
    // Cover
    {
      properties: { page: { margin: { top: 0, bottom: 0, left: 0, right: 0 } } },
      children: [
        new Paragraph({ spacing: { before: 4800 } }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [
            new TextRun({ text: "SCOREPHANTOM", size: 56, bold: true, color: c(P.primary), font: { ascii: "Calibri" } }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [
            new TextRun({ text: "E2E Debug & Improvement Report", size: 36, color: c(P.accent), font: { ascii: "Calibri" } }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 600 },
          children: [
            new TextRun({ text: "Comprehensive Codebase Audit, Bug Analysis & Enhancement Roadmap", size: 22, color: c(P.secondary), font: { ascii: "Calibri" } }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [
            new TextRun({ text: "Repository: github.com/Heisdawrld/score-phantom", size: 20, color: c(P.secondary), font: { ascii: "Calibri" } }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [
            new TextRun({ text: "Production: score-phantom.onrender.com", size: 20, color: c(P.secondary), font: { ascii: "Calibri" } }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [
            new TextRun({ text: "Tech Stack: Express + Turso DB (libSQL) + React + Vite + BSD v2 API", size: 20, color: c(P.secondary), font: { ascii: "Calibri" } }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 1600 },
          children: [
            new TextRun({ text: "May 14, 2026", size: 22, color: c(P.secondary), font: { ascii: "Calibri" } }),
          ],
        }),
      ],
    },
    // Body
    {
      properties: {
        page: {
          margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 },
          pageNumbers: { start: 1, formatType: "decimal" },
        },
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: "ScorePhantom E2E Debug Report ", size: 16, color: c(P.secondary), font: { ascii: "Calibri" } }),
                new TextRun({ children: [PageNumber.CURRENT], size: 16, color: c(P.secondary) }),
              ],
            }),
          ],
        }),
      },
      children: [
        // ── SECTION 1: EXECUTIVE SUMMARY ──
        heading("1. Executive Summary"),
        body("This report documents the results of a comprehensive end-to-end debugging and improvement audit of the ScorePhantom application. The audit covered the full stack: Express.js backend, Turso DB (libSQL/SQLite) schema and queries, BSD v2 API integration, React/Vite frontend, authentication flow, prediction engine, enrichment pipeline, live score WebSocket polling, and Flutterwave payment integration. The live production site was actively tested against real API endpoints to confirm runtime behavior."),
        body("The project is architecturally sound with a well-structured prediction engine, thoughtful caching layers, and proper separation of concerns. However, the audit uncovered 15 bugs ranging from critical security vulnerabilities to moderate logic errors, plus 12 improvement opportunities across security, performance, reliability, and code quality dimensions. The most critical issues are: (1) a missing admin route guard exposing a debug enrichment endpoint, (2) a double daily count increment race condition affecting trial users, (3) an env.example that still references Postgres despite the project using Turso, and (4) a /live endpoint that always returns 500 due to an incorrect SQL query."),

        heading("2. Project Architecture Overview", HeadingLevel.HEADING_2),
        body("ScorePhantom is a sports prediction platform built on a monorepo Express + React architecture deployed on Render. The backend serves a REST API, the frontend is a Vite-bundled SPA with wouter routing, and the data layer uses Turso (distributed SQLite via @libsql/client). The prediction engine is a multi-stage pipeline: fixture seeding from BSD v2 API, enrichment (form/H2H/standings/lineups), feature vector construction, Poisson-based probability modeling, market candidate scoring, and final pick selection with confidence profiling."),
        makeTable(
          ["Layer", "Technology", "Key Files"],
          [
            ["Backend API", "Express 4.18 (ES Modules)", "src/app.js, src/api/routes.js"],
            ["Database", "Turso (libSQL/SQLite)", "src/config/database.js, src/storage/"],
            ["Auth", "JWT + Firebase Admin + bcrypt", "src/auth/authRoutes.js"],
            ["Prediction Engine", "Custom Poisson + Market Model", "src/engine/, src/features/, src/probabilities/"],
            ["External API", "BSD v2 (Bzzoiro Sports Data)", "src/services/bsd.js, src/enrichment/"],
            ["Payments", "Flutterwave V3", "src/services/flutterwave.js"],
            ["Live Scores", "Polling + SSE Push", "src/services/wsLiveScores.js"],
            ["Frontend", "React 18 + Vite 5 + Tailwind 4", "client/src/"],
            ["State Management", "TanStack React Query", "client/src/hooks/"],
          ]
        ),

        // ── SECTION 3: CRITICAL BUGS ──
        heading("3. Bugs Found (Ordered by Severity)"),

        ...bugEntry(
          "BUG-001", "CRITICAL",
          "Admin Debug Route Exposed Without Auth on /api/debug/enrich/:fixtureId",
          "The route GET /api/debug/enrich/:fixtureId in routes.js uses a local requireAdmin middleware that only checks the JWT email against ADMIN_EMAIL. However, this middleware does NOT verify token_version (unlike the authRoutes.js requireAuth). More critically, the route is registered under /api (not /api/admin), so it bypasses the requireAdminSecret middleware entirely. Any authenticated user who guesses the admin email can trigger enrichment for any fixture, consuming BSD API quota.",
          "src/api/routes.js:960",
          "Move the debug route under /api/admin/ so it inherits the requireAdminSecret guard. Also add token_version verification to the local requireAdmin helper in routes.js, or better yet, remove the duplicate requireAdmin and import the central one from authRoutes.js."
        ),

        ...bugEntry(
          "BUG-002", "HIGH",
          "Race Condition in incrementAndCheckDailyCount Causes Double Increment",
          "The function incrementAndCheckDailyCount() first does an INSERT ON CONFLICT DO UPDATE to increment the count, then SELECTs the new count, and if over the limit, decrements it back. Between the increment and the decrement, another concurrent request can read the inflated count and also be rejected. Worse, the increment and decrement are not atomic, so under concurrent requests, the count can drift upward permanently. This means trial users may hit their 15-prediction daily limit prematurely.",
          "src/api/routes.js:238-284",
          "Use a single atomic SQL statement: UPDATE trial_daily_counts SET prediction_count = prediction_count + 1 WHERE user_id = ? AND date_str = ? AND prediction_count < ? RETURNING prediction_count. If the RETURNING row is empty, the limit was already hit. This eliminates the race window entirely."
        ),

        ...bugEntry(
          "BUG-003", "HIGH",
          "/api/live Returns 500 Error Due to Incorrect SQL Query",
          "The /api/live route queries fixtures with match_status IN ('LIVE','HT'), but the live score poller writes status values like 'LIVE' and 'FT' (from normalizeLiveStatus). However, the query also expects home_score and away_score to be present for these matches. The actual error on production is: the SQL query is a single-line compressed string that includes columns that may not exist on some fixture rows, causing Turso to throw. The live endpoint consistently returns {error: 'Failed to fetch live matches'} in production.",
          "src/api/routes.js:363-375",
          "Wrap the query in a proper try/catch (already present but the inner SQL may be failing silently). Debug by adding the actual error message to the response in non-production. Also ensure the SELECT only references columns that exist in the fixtures table schema. Add explicit column names instead of relying on the table having all columns."
        ),

        ...bugEntry(
          "BUG-004", "HIGH",
          "env.example Still References Postgres Despite Using Turso DB",
          "The env.example file shows DATABASE_URL=postgres://user:password@host:5432/dbname which is misleading since the project uses Turso (libSQL). This causes confusion for new developers who try to set up a Postgres database. The app.js startup check correctly looks for TURSO_DATABASE_URL, and database.js requires both TURSO_DATABASE_URL and TURSO_AUTH_TOKEN, but the env.example doesn't document either.",
          "env.example:6",
          "Replace the Postgres DATABASE_URL line with TURSO_DATABASE_URL=libsql://your-db-name-your-org.turso.io and TURSO_AUTH_TOKEN=your_turso_auth_token. Remove the Postgres reference entirely."
        ),

        ...bugEntry(
          "BUG-005", "MEDIUM",
          "Duplicate requireAuth Middleware Definitions in routes.js and authRoutes.js",
          "Both src/api/routes.js and src/auth/authRoutes.js define their own requireAuth, requireAdmin, and requirePremiumAccess middleware functions. The routes.js version fetches the full user from DB and attaches req.access, while the authRoutes.js version only verifies the JWT and checks token_version. This means some routes get full user context while others only get the decoded JWT payload, creating inconsistent authorization behavior across the API.",
          "src/api/routes.js:113-157 vs src/auth/authRoutes.js:302-350",
          "Consolidate all auth middleware into authRoutes.js (or a dedicated middleware file) and export a single set of functions. Ensure requireAuth always attaches both req.user (full DB user) and req.access (computed access status) consistently."
        ),

        ...bugEntry(
          "BUG-006", "MEDIUM",
          "is_sharp_value Column Missing from prediction_outcomes Table Schema",
          "The resultChecker.js inserts is_sharp_value into prediction_outcomes, and the wsLiveScores.js triggerResultCheck function also inserts it. However, the table creation in backtesting.js does not include an is_sharp_value column, and there is no migration to add it. This will cause INSERT failures when the column does not exist, silently losing outcome data.",
          "src/storage/backtesting.js:13-39, src/services/resultChecker.js:147",
          "Add is_sharp_value to the CREATE TABLE statement in backtesting.js, and add it to the migrations array that checks and adds missing columns."
        ),

        ...bugEntry(
          "BUG-007", "MEDIUM",
          "ACCA Builder Returns Only 1 Pick When More Are Available",
          "The ACCA endpoint returns only 1 pick with the message 'Only 1 ACCA-grade pick(s) found.' even when there are 6 candidates in the pool. The buildAcca function appears to be filtering too aggressively, requiring both high probability AND low volatility AND specific enrichment statuses. With 31 enriched fixtures for today but only 1 making it through the ACCA filter, the filtering criteria may be too strict for practical use.",
          "src/api/routes.js:806-916, src/engine/buildAcca.js",
          "Review the buildAcca.js filtering thresholds. Consider relaxing the volatility requirement from 'low only' to 'low or medium' for safe mode, and allow picks with probability >= 0.68 (not just >= 0.75) for value mode. Also check if the no_safe_pick flag is incorrectly set on many predictions."
        ),

        ...bugEntry(
          "BUG-008", "MEDIUM",
          "Live Score Poller Makes Excessive API Calls Per Cycle",
          "The pollLiveScores() function calls fetchExpandedLiveMatches(), which fires 7+ parallel BSD API requests (1 fetchLiveMatches + 1 fetchKickoffWindowCandidates + 5 bsdFetchAll by status). For each live match found, it then calls fetchEventDetail(eventId, true) which fires 8 more parallel requests (stats, incidents, odds, metadata, lineups, player-stats, referee, venue). With 10 live matches, this is 7 + 80 = 87 API calls per 60-second poll cycle. This is unsustainable and likely causes rate limiting.",
          "src/services/wsLiveScores.js:362-430",
          "Reduce API calls by: (1) Only calling fetchEventDetail with full=true for matches that just changed status or score, not every poll; (2) Cache event details for 2-3 minutes; (3) Use fetchEventDetail with full=false for most matches and only fetch full details on status transitions; (4) Increase poll interval to 90s or 120s when few matches are live."
        ),

        ...bugEntry(
          "BUG-009", "MEDIUM",
          "predict/:fixtureId/explain Has Contradictory Access Control",
          "The /predict/:fixtureId/explain route uses requirePremiumAccess middleware (which checks has_full_access), then immediately does a secondary check: if (!req.access.subscription_active && req.access.trial_active) it enforces the daily cap. But if the user has has_full_access via a fallback premium (isFallbackPremium), subscription_active is true, so trial users who get a fallback premium flag bypass the daily cap entirely. The logic is inconsistent with the /predict/:fixtureId route which correctly handles trial limits.",
          "src/api/routes.js:614-670",
          "Unify the access control logic: both /predict and /predict/:fixtureId/explain should use the same trial limit enforcement. Extract the trial daily cap logic into a shared middleware or helper function."
        ),

        ...bugEntry(
          "BUG-010", "MEDIUM",
          "addColumnIfNotExists Has Dead Code (Variable 'exists' Never Used)",
          "In database.js, the addColumnIfNotExists function attempts to detect if a column exists, sets a variable 'exists' to true, then immediately checks 'if (!exists)' which is always false (it was just set to true). This means ALTER TABLE ADD COLUMN is never executed via the normal path. It only works because the catch block also adds the column when the SELECT throws (no such column error). The function works by accident, not by design.",
          "src/config/database.js:259-275",
          "Remove the dead 'exists' variable and simplify: just try the ALTER TABLE directly and catch the 'duplicate column' error, which is the standard SQLite pattern. Or fix the PRAGMA table_info approach to actually check the result."
        ),

        ...bugEntry(
          "BUG-011", "LOW",
          "track-record/summary Route Returns 404",
          "The frontend or API consumers may expect /api/track-record/summary but the actual route is /api/track-record/stats. The route file only defines /stats, /recent, and /league/:leagueId. There is no /summary endpoint. This was confirmed by testing the live site: GET /api/track-record/summary returns {error: 'Not found'}.",
          "src/api/trackRecordRoutes.js",
          "Either add a /summary alias that redirects to /stats, or update the frontend to call /stats instead of /summary."
        ),

        ...bugEntry(
          "BUG-012", "LOW",
          "In-Memory BSD Cache Grows Unbounded",
          "The bsd.js file uses a simple Map for caching (_cache) with a 5-minute TTL. However, there is no mechanism to prune expired entries from the map. Over time (especially with the live score poller making many distinct requests), this map will grow indefinitely, consuming increasing memory. On a Render free tier with limited RAM, this can eventually cause OOM crashes.",
          "src/services/bsd.js:18-38",
          "Add a periodic cleanup that removes expired entries every 5 minutes, or use an LRU cache with a size limit (e.g., 500 entries). Alternatively, switch to a proper cache library like 'lru-cache' with TTL support."
        ),

        ...bugEntry(
          "BUG-013", "LOW",
          "Admin Page Served Without Any Authentication",
          "The route GET /admin.html serves the standalone admin HTML page without any authentication check. While the API routes under /api/admin/ are protected, the admin.html page itself is publicly accessible. This leaks the existence and structure of the admin interface to anyone who discovers the URL.",
          "src/app.js:181-183",
          "Add at least a basic auth check before serving admin.html, or serve it from a non-guessable path. At minimum, add a comment that the page's API calls are auth-protected so the page alone is harmless."
        ),

        ...bugEntry(
          "BUG-014", "LOW",
          "SPA Fallback Does Not Handle POST/PUT/DELETE Requests",
          "The catch-all SPA fallback route (app.get('*')) only handles GET requests. If a user makes a POST/PUT/DELETE to a non-API route, Express will return a 404 with the default HTML error page, not the React SPA. This is unlikely to cause issues in normal usage but is technically incorrect for a true SPA architecture.",
          "src/app.js:186-207",
          "Add app.all('*', ...) instead of app.get('*', ...) to handle all HTTP methods with the SPA fallback. Only apply the SPA fallback for non-API routes."
        ),

        ...bugEntry(
          "BUG-015", "LOW",
          "Password Field Still Present in Users Table",
          "The users table has both 'password' and 'password_hash' columns. The codebase uses password_hash (bcrypt) for new signups and login, but the legacy 'password' column still exists as a fallback (user.password_hash || user.password). This suggests plaintext passwords may have been stored at some point. The password column should be deprecated and eventually removed for security.",
          "src/auth/authRoutes.js:70-71, :777-778",
          "Add a migration to copy any remaining data from 'password' to 'password_hash' (hashing if not already hashed), then remove the 'password' column. Remove the fallback '|| user.password' from the login code."
        ),

        // ── SECTION 4: IMPROVEMENTS ──
        heading("4. Improvement Recommendations"),

        heading("4.1 Security Improvements", HeadingLevel.HEADING_2),

        boldBody("SEC-001: Implement Rate Limiting on Prediction Endpoints", ""),
        body("Currently, the /predict/:fixtureId endpoint has no rate limiting beyond the trial daily cap. Premium users can make unlimited prediction requests, which could be abused to scrape the entire prediction database. Add express-rate-limit to /predict, /predict/:fixtureId/explain, and /predict/:fixtureId/chat endpoints with a limit of 60 requests per 15 minutes per user."),

        boldBody("SEC-002: Add Helmet.js for HTTP Security Headers", ""),
        body("The Express app does not set any security-related HTTP headers (X-Content-Type-Options, X-Frame-Options, Content-Security-Policy, etc.). Install helmet and add app.use(helmet()) early in the middleware chain. This prevents clickjacking, MIME-type sniffing, and other common attack vectors with zero application code changes."),

        boldBody("SEC-003: Rotate JWT Secret Periodically", ""),
        body("The JWT_SECRET is a static environment variable that never changes. If it leaks, all tokens are compromised forever. Implement a JWT_SECRET_ROTATION array that contains the current and previous secrets, allowing graceful rotation without immediately invalidating all active sessions."),

        heading("4.2 Performance Improvements", HeadingLevel.HEADING_2),

        boldBody("PERF-001: Batch Enrichment Writes to Reduce Turso Round-Trips", ""),
        body("The storeEnrichment function in enrichOne.js writes historical matches one at a time in a loop. For a fixture with 30 historical matches, this results in 30 separate INSERT queries plus 1 DELETE and 1 UPDATE. Use db.batch() to combine the DELETE and all INSERTs into a single transaction, reducing round-trips from ~32 to 2 (one batch write + one fixture UPDATE). This will significantly speed up the enrichment pipeline."),

        boldBody("PERF-002: Add Connection Pooling Configuration for Turso", ""),
        body("The @libsql/client is created with default settings. For a production app with many concurrent requests, consider configuring the connection with explicit read-concurrency and write-concurrency settings. Also, ensure the client is reused across the application (it currently is, via the singleton db export), but document this explicitly so future developers don't accidentally create multiple clients."),

        boldBody("PERF-003: Implement Request Deduplication for Prediction Cache", ""),
        body("When multiple users request predictions for the same fixture simultaneously (e.g., right after a new seed), each request triggers a separate engine run. Add an in-flight request map that deduplicates concurrent getOrBuildPrediction calls for the same fixtureId, returning the same Promise to all waiters."),

        heading("4.3 Reliability Improvements", HeadingLevel.HEADING_2),

        boldBody("REL-001: Add Graceful Shutdown Handling", ""),
        body("The Express server starts with app.listen() but has no graceful shutdown handler. When Render restarts the dyno, in-flight requests are abruptly terminated, and any pending DB writes may be lost. Add process.on('SIGTERM') and process.on('SIGINT') handlers that stop accepting new connections, wait for in-flight requests to complete (with a timeout), then close the Turso client connection."),

        boldBody("REL-002: Add Health Check Endpoint That Tests DB Connectivity", ""),
        body("The /api/health endpoint only returns a static JSON response. It does not verify database connectivity. Render's health check system can only detect port-level failures. Add a database ping (SELECT 1) to the /api/health endpoint so that Render can detect and restart the dyno when Turso becomes unreachable."),

        boldBody("REL-003: Implement Circuit Breaker for BSD API", ""),
        body("The bsdFetch function has retry logic but no circuit breaker. If the BSD API goes down, every request will retry 3 times with exponential backoff, causing massive latency across the entire application. Add a circuit breaker that stops making requests after N consecutive failures, and periodically tests if the API has recovered."),

        heading("4.4 Code Quality Improvements", HeadingLevel.HEADING_2),

        boldBody("CQ-001: Extract Shared Utility Functions", ""),
        body("The safeJsonParse function is defined independently in routes.js, predictionCache.js, wsLiveScores.js, and responseAdapter.js. The mapHistoryRow function is duplicated in routes.js and predictionCache.js. Extract these into a shared utils module (e.g., src/utils/helpers.js) to eliminate duplication and ensure consistent behavior."),

        boldBody("CQ-002: Replace Console Logging with Structured Logging", ""),
        body("The codebase uses console.log, console.warn, and console.error throughout. While the logger.js utility exists, it is barely used. Migrate all logging to use the structured logger, which should support log levels (debug, info, warn, error) and structured metadata. This makes production debugging much easier, especially on Render where logs are aggregated."),

        boldBody("CQ-003: Add Input Validation with Zod on Backend Routes", ""),
        body("The frontend uses Zod for schema validation, but the backend routes have no input validation. Any request body is parsed as JSON and used directly. Add Zod schemas to validate request bodies on POST/PUT endpoints (signup, login, chat, payment initialize) to prevent malformed data from reaching the database."),

        // ── SECTION 5: API TEST RESULTS ──
        heading("5. Live API Test Results"),

        body("All tests were performed against the production deployment at https://score-phantom.onrender.com using the provided admin credentials."),

        makeTable(
          ["Endpoint", "Method", "Status", "Result"],
          [
            ["/api/health", "GET", "200", "OK - Returns static JSON"],
            ["/api/version", "GET", "200", "OK - Returns build version + timestamp"],
            ["/api/auth/login", "POST", "200", "OK - JWT token issued correctly"],
            ["/api/auth/me", "GET", "200", "OK - User profile + access status returned"],
            ["/api/fixtures?date=2026-05-14", "GET", "200", "OK - 31 fixtures returned, all enriched"],
            ["/api/usage", "GET", "200", "OK - Premium user gets unlimited usage"],
            ["/api/predict/9605", "GET", "200", "OK - Full prediction with engine output"],
            ["/api/acca", "GET", "200", "PARTIAL - Only 1 pick, should have 3+"],
            ["/api/live", "GET", "500", "FAIL - Returns 'Failed to fetch live matches'"],
            ["/api/track-record/summary", "GET", "404", "FAIL - Route does not exist"],
            ["/api/track-record", "GET", "200", "OK - 905 picks tracked, 69.8% win rate"],
            ["/api/payments/history", "GET", "200", "OK - Payment records returned"],
          ]
        ),

        // ── SECTION 6: PRIORITY MATRIX ──
        heading("6. Fix Priority Matrix"),

        body("The following matrix ranks all identified issues by impact and urgency to help guide the implementation order."),

        makeTable(
          ["Priority", "Bug ID", "Title", "Effort"],
          [
            ["P0 (Now)", "BUG-001", "Admin debug route exposed without auth", "Low"],
            ["P0 (Now)", "BUG-002", "Race condition in daily count increment", "Medium"],
            ["P0 (Now)", "BUG-004", "env.example references Postgres not Turso", "Low"],
            ["P1 (This Week)", "BUG-003", "/api/live returns 500 error", "Medium"],
            ["P1 (This Week)", "BUG-005", "Duplicate auth middleware definitions", "Medium"],
            ["P1 (This Week)", "BUG-006", "Missing is_sharp_value column in schema", "Low"],
            ["P1 (This Week)", "BUG-007", "ACCA builder returns only 1 pick", "Medium"],
            ["P2 (Next Sprint)", "BUG-008", "Excessive API calls in live poller", "Medium"],
            ["P2 (Next Sprint)", "BUG-009", "Contradictory explain route access control", "Low"],
            ["P2 (Next Sprint)", "BUG-010", "Dead code in addColumnIfNotExists", "Low"],
            ["P3 (Backlog)", "BUG-011-015", "Low severity items (see above)", "Low"],
          ]
        ),

        heading("7. Conclusion"),
        body("ScorePhantom is a well-architected sports prediction platform with a sophisticated engine pipeline and thoughtful design decisions. The core prediction logic is sound, the caching strategy is effective, and the frontend is well-structured with proper state management. The issues identified are primarily in the integration and operational layers rather than in the core engine, which reflects well on the original design. Addressing the P0 and P1 bugs will significantly improve reliability and security, while the performance improvements will reduce API costs and improve response times. The code quality improvements will make the codebase more maintainable as the project scales."),
      ],
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync("/home/z/my-project/download/ScorePhantom_E2E_Debug_Report.docx", buffer);
console.log("Report generated successfully!");
