import { createClient } from '../storage/dbShim.js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

const db = createClient({ url: process.env.DATABASE_URL });

async function getFlutterwavePaidEmails() {
  const secretKey = process.env.FLUTTERWAVE_SECRET_KEY;
  if (!secretKey) {
    console.warn("⚠️ No FLUTTERWAVE_SECRET_KEY found. Assuming 0 premium users from Flutterwave.");
    return new Set();
  }
  
  console.log("Fetching historical payments from Flutterwave...");
  const paidEmails = new Set();
  
  try {
    // Fetch recent successful transactions from Flutterwave (page 1)
    const res = await fetch('https://api.flutterwave.com/v3/transactions?status=successful', {
      headers: {
        'Authorization': `Bearer ${secretKey}`
      }
    });
    
    if (res.ok) {
      const data = await res.json();
      if (data.data && Array.isArray(data.data)) {
        for (const tx of data.data) {
          if (tx.customer && tx.customer.email) {
            paidEmails.add(tx.customer.email.toLowerCase().trim());
          }
        }
      }
    } else {
      console.error("Flutterwave API Error:", await res.text());
    }
  } catch (err) {
    console.error("Failed to connect to Flutterwave:", err.message);
  }
  
  console.log(`Found ${paidEmails.size} premium users from recent transactions.`);
  return paidEmails;
}

async function migrateUsers() {
  console.log("Starting User Migration...");

  // 1. Read CSV Emails
  if (!fs.existsSync('user_emails_export.csv')) {
    console.error("❌ user_emails_export.csv not found.");
    process.exit(1);
  }
  
  const csvContent = fs.readFileSync('user_emails_export.csv', 'utf8');
  const emails = csvContent.split(/\r?\n/)
    .map(email => email.trim().toLowerCase())
    .filter(email => email.length > 5 && email.includes('@') && email !== 'email');
  
  console.log(`Found ${emails.length} unique valid emails in CSV.`);

  // 2. Fetch Premium Users from Flutterwave
  const premiumSet = await getFlutterwavePaidEmails();

  // 3. Migrate to Supabase
  let successCount = 0;
  for (const email of emails) {
    // Default: 14 day trial
    let status = 'trial';
    let trialEnds = new Date();
    trialEnds.setDate(trialEnds.getDate() + 14); // Extended apology trial
    let trialEndsStr = trialEnds.toISOString();
    let premiumEndsStr = null;

    if (premiumSet.has(email)) {
      status = 'active';
      let premiumEnds = new Date();
      premiumEnds.setDate(premiumEnds.getDate() + 30); // Extend premium by 1 month
      premiumEndsStr = premiumEnds.toISOString();
    }

    try {
      await db.execute({
        sql: `INSERT OR IGNORE INTO users (email, status, trial_ends_at, premium_expires_at, email_verified) VALUES (?, ?, ?, ?, 1)`,
        args: [email, status, trialEndsStr, premiumEndsStr]
      });
      successCount++;
      if (successCount % 50 === 0) console.log(`Migrated ${successCount} users...`);
    } catch (err) {
      console.error(`Failed to migrate ${email}:`, err.message);
    }
  }

  console.log(`✅ Migration Complete! Saved ${successCount} out of ${emails.length} users into Supabase.`);
  process.exit(0);
}

migrateUsers();
