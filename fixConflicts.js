import fs from 'fs';
import { execSync } from 'child_process';

const files = [
  'src/auth/authRoutes.js',
  'src/api/adminRoutes.js',
  'src/api/routes.js',
  'src/services/fixtureSeeder.js'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  
  content = content.replace(/INSERT INTO payments\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/g, 'INSERT INTO payments ($1) VALUES ($2) ON CONFLICT DO NOTHING');
  content = content.replace(/INSERT INTO partner_referrals\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/g, 'INSERT INTO partner_referrals ($1) VALUES ($2) ON CONFLICT DO NOTHING');
  content = content.replace(/INSERT INTO match_subscriptions\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/g, 'INSERT INTO match_subscriptions ($1) VALUES ($2) ON CONFLICT DO NOTHING');
  content = content.replace(/INSERT INTO teams\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/g, 'INSERT INTO teams ($1) VALUES ($2) ON CONFLICT DO NOTHING');
  content = content.replace(/INSERT INTO tournaments\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/g, 'INSERT INTO tournaments ($1) VALUES ($2) ON CONFLICT DO NOTHING');
  content = content.replace(/INSERT INTO fixtures\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/g, 'INSERT INTO fixtures ($1) VALUES ($2) ON CONFLICT DO NOTHING');

  // Specific multiline fix for payments
  content = content.replace(/INSERT INTO payments \(user_id, reference, amount, amount_currency, status, channel, paid_at\)\s*VALUES \(\?, \?, \?, 'NGN', 'verified', 'manual', \?\)/g, "INSERT INTO payments (user_id, reference, amount, amount_currency, status, channel, paid_at) VALUES (?, ?, ?, 'NGN', 'verified', 'manual', ?) ON CONFLICT DO NOTHING");

  // Multiline fixtures in fixtureSeeder.js
  content = content.replace(/INSERT INTO fixtures\s*\n\s*\([^)]+\)\s*VALUES\s*\([^)]+\)/g, match => {
    if (!match.includes('ON CONFLICT')) {
      return match + ' ON CONFLICT DO NOTHING';
    }
    return match;
  });

  fs.writeFileSync(file, content, 'utf8');
  console.log(`Updated ${file}`);
}
