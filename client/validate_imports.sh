#!/bin/bash

echo "=== VALIDATING IMPORTS & SYNTAX ==="
echo ""

# Check if all imports can be resolved
echo "1. Checking import paths in new pages:"
for file in src/pages/TrackRecord.tsx src/pages/TopPicksToday.tsx src/pages/PredictionResults.tsx src/pages/LeagueFavorites.tsx src/pages/AccaCalculator.tsx; do
  echo "File: $file"
  grep "^import" "$file" | head -5
  echo ""
done

echo "2. Checking that all imported components exist:"
grep -h "from \"@/" src/pages/{TrackRecord,TopPicksToday,PredictionResults,LeagueFavorites,AccaCalculator}.tsx | grep -o '"@/[^"]*"' | sort -u | while read path; do
  path=${path//\"/}
  path=${path//@\//}
  if [ -f "src/${path}.tsx" ] || [ -f "src/${path}.ts" ] || [ -f "src/${path}.jsx" ] || [ -f "src/${path}.js" ]; then
    echo "✓ $path exists"
  else
    echo "✗ $path NOT FOUND - MISSING!"
  fi
done

echo ""
echo "3. Checking TypeScript syntax (basic validation):"
for file in src/pages/*.tsx; do
  # Check for obvious syntax errors
  if grep -q "^\s*<" "$file" && grep -q "export\|export default" "$file"; then
    echo "✓ $(basename $file) - looks valid (has JSX and export)"
  else
    echo "? $(basename $file) - might have issues"
  fi
done

