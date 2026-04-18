#!/bin/bash

BASE_URL="https://score-phantom.onrender.com"

echo "=== TESTING API ENDPOINTS ==="
echo ""

# Test if server is alive
echo "1. Server Health Check:"
curl -s -o /dev/null -w "Status: %{http_code}\n" "$BASE_URL/" 
echo ""

# Test Track Record (no auth needed for public)
echo "2. GET /api/track-record (no auth):"
curl -s -w "\nStatus: %{http_code}\n" "$BASE_URL/api/track-record?days=30" | head -20
echo ""

# Test Top Picks Today
echo "3. GET /api/top-picks-today (no auth):"
curl -s -w "\nStatus: %{http_code}\n" "$BASE_URL/api/top-picks-today?limit=5" | head -20
echo ""

# Test Prediction Results
echo "4. GET /api/prediction-results (no auth):"
curl -s -w "\nStatus: %{http_code}\n" "$BASE_URL/api/prediction-results?limit=5" | head -20
echo ""

# Test League Favorites
echo "5. GET /api/league-favorites (no auth):"
curl -s -w "\nStatus: %{http_code}\n" "$BASE_URL/api/league-favorites" | head -20
echo ""

# Test ACCA Payout Calculator
echo "6. GET /api/acca-payout (no auth):"
curl -s -w "\nStatus: %{http_code}\n" "$BASE_URL/api/acca-payout?stake=1000&picks=%5B%7B%22odds%22%3A1.85%7D%5D" | head -20
echo ""

echo "=== CHECKING IF ENDPOINTS EXIST IN ROUTES.JS ==="
grep -E "GET|POST|PUT|DELETE" src/api/routes.js | grep -E "track-record|top-picks|prediction-results|league-favorites|acca-payout" | head -20

