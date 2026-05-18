import dotenv from 'dotenv';

dotenv.config();

const requiredForStartup = [
  'TURSO_DATABASE_URL',
  'TURSO_AUTH_TOKEN',
  'JWT_SECRET',
];

const recommendedForProduction = [
  'APP_URL',
  'ADMIN_EMAIL',
  'ADMIN_SECRET',
  'BSD_API_KEY',
  'FLUTTERWAVE_PUBLIC_KEY',
  'FLUTTERWAVE_SECRET_KEY',
  'FLUTTERWAVE_ENCRYPTION_KEY',
  'FLUTTERWAVE_WEBHOOK_HASH',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
];

const missingRequired = requiredForStartup.filter((key) => !process.env[key]);
const missingRecommended = recommendedForProduction.filter((key) => !process.env[key]);

if (missingRequired.length) {
  console.error('❌ Missing required environment variables for backend startup:');
  for (const key of missingRequired) console.error(`  - ${key}`);
  process.exit(1);
}

console.log('✅ Required backend environment variables are present.');

if (missingRecommended.length) {
  console.warn('⚠️ Missing recommended environment variables for full production behavior:');
  for (const key of missingRecommended) console.warn(`  - ${key}`);
} else {
  console.log('✅ Recommended production environment variables are present.');
}
