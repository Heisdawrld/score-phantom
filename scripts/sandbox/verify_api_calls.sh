#!/bin/bash

echo "=== VERIFYING API ENDPOINT CALLS IN FRONTEND PAGES ==="
echo ""

echo "1. TrackRecord.tsx -> /api/track-record?"
grep "track-record" client/src/pages/TrackRecord.tsx && echo "✓ CORRECT" || echo "✗ MISSING"
echo ""

echo "2. TopPicksToday.tsx -> /api/top-picks-today?"
grep "top-picks-today" client/src/pages/TopPicksToday.tsx && echo "✓ CORRECT" || echo "✗ MISSING"
echo ""

echo "3. PredictionResults.tsx -> /api/prediction-results?"
grep "prediction-results" client/src/pages/PredictionResults.tsx && echo "✓ CORRECT" || echo "✗ MISSING"
echo ""

echo "4. LeagueFavorites.tsx -> /api/league-favorites?"
grep "league-favorites" client/src/pages/LeagueFavorites.tsx && echo "✓ CORRECT" || echo "✗ MISSING"
echo ""

echo "5. AccaCalculator.tsx -> /api/acca-payout?"
grep "acca-payout" client/src/pages/AccaCalculator.tsx && echo "✓ CORRECT" || echo "✗ MISSING"
echo ""

echo "=== CHECKING ACTUAL API CALL IMPLEMENTATION ==="
echo ""

echo "Track Record - fetchApi call:"
grep -A 3 "useQuery.*track-record" client/src/pages/TrackRecord.tsx | head -10
echo ""

echo "Top Picks Today - fetchApi call:"
grep -A 3 "useQuery.*top-picks" client/src/pages/TopPicksToday.tsx | head -10
echo ""

echo "League Favorites - useMutation for POST:"
grep -A 3 "useMutation.*league-favorites" client/src/pages/LeagueFavorites.tsx | head -10

