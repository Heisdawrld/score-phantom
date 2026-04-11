#!/bin/bash

echo "=== CHECKING DATABASE SCHEMA ==="
echo ""

# List all available tables (requires DB connection)
# Since we can't easily connect here, let's check the migration files
echo "1. Checking migration files for table definitions:"
find src -name "*migration*" -o -name "*schema*" | head -10
echo ""

echo "2. Checking what tables are mentioned in routes.js:"
grep -o "FROM [a-z_]*" src/api/routes.js | sort -u | head -20
echo ""

echo "3. Checking for prediction_outcomes table mentions:"
grep -r "prediction_outcomes" src/ | head -10
echo ""

echo "4. Checking for league_favorites table mentions:"
grep -r "league_favorites" src/ | head -10
echo ""

echo "5. Checking database.js for table initialization:"
grep -E "CREATE TABLE|migrations|schema" src/config/database.js | head -20

