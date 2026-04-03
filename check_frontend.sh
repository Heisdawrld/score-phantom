#!/bin/bash

echo "=== CHECKING FRONTEND PAGES ==="
echo ""

echo "1. New page files exist?"
ls -la client/src/pages/ | grep -E "TrackRecord|TopPicks|PredictionResults|LeagueFavorites|AccaCalculator"
echo ""

echo "2. Routes in App.tsx:"
grep -E "import.*from.*pages|<Route.*path=" client/src/App.tsx | grep -E "TrackRecord|TopPicks|PredictionResults|LeagueFavorites|AccaCalculator"
echo ""

echo "3. Navigation links in Header:"
grep -E "Track Record|Top Picks|Prediction Results|League Favorites|ACCA" client/src/components/layout/Header.tsx
echo ""

echo "4. Checking if pages are TypeScript syntax valid:"
for file in TrackRecord TopPicksToday PredictionResults LeagueFavorites AccaCalculator; do
  if [ -f "client/src/pages/${file}.tsx" ]; then
    echo "✓ ${file}.tsx exists"
    head -5 "client/src/pages/${file}.tsx"
    echo ""
  fi
done

