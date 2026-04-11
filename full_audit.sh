#!/bin/bash

echo "=== FULL APP AUDIT ==="
echo ""

echo "1. PAYMENT INTEGRATION STATUS:"
grep -r "Flutterwave\|OPay\|payment" src/api/routes.js | grep -E "router\.(post|get)" | head -10
echo ""

echo "2. CHECKING FOR DISABLED/BROKEN FEATURES:"
echo "   - Looking for TODO/FIXME/BROKEN comments:"
grep -r "TODO\|FIXME\|BROKEN\|DISABLED\|XXX" src/ | grep -v node_modules | head -15
echo ""

echo "3. CHECKING OAUTH/LOGIN OPTIONS:"
grep -r "google\|GitHub\|Apple\|Facebook\|oauth" client/src/ --include="*.tsx" | grep -i auth | head -10
echo ""

echo "4. CHECKING FOR UNUSED IMPORTS IN NEW PAGES:"
for file in client/src/pages/{TrackRecord,TopPicksToday,PredictionResults,LeagueFavorites,AccaCalculator}.tsx; do
  echo "File: $(basename $file)"
  grep "^import\|^export" "$file" | head -3
  echo ""
done | head -30

echo "5. CHECKING ADMIN PANEL STATUS:"
grep -r "admin\|Admin" client/src/App.tsx | head -5
echo ""

echo "6. CHECKING FOR HARDCODED TEST DATA:"
grep -r "testUser\|test_\|dummy\|mock" src/ --include="*.js" | grep -v node_modules | head -10
echo ""

echo "7. CHECKING DATABASE MIGRATION STATUS:"
grep -r "ALTER TABLE\|CREATE TABLE" src/ --include="*.js" | grep -E "league_favorites|digest_subscriptions|prediction_outcomes" | head -15
echo ""

echo "8. ENDPOINTS SUMMARY:"
grep "router\.\(get\|post\|put\|delete\)" src/api/routes.js | wc -l
echo "Total API endpoints defined"

