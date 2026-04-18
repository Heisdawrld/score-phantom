import fs from 'fs';

const filePath = '/workspace/score-phantom/src/auth/authRoutes.js';
let content = fs.readFileSync(filePath, 'utf-8');

// We will inject ensureReferralCode function right before computeAccessStatus
const ensureFn = `
async function ensureReferralCode(user) {
  if (user.own_referral_code) return user.own_referral_code;
  const prefix = String(user.email).split("@")[0].replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase();
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  const newCode = \`\${prefix}_\${suffix}\`;
  
  let isUnique = false;
  let finalCode = newCode;
  let attempts = 0;
  while (!isUnique && attempts < 5) {
    const existing = await db.execute({
      sql: "SELECT id FROM users WHERE own_referral_code = ? LIMIT 1",
      args: [finalCode],
    });
    if ((existing.rows || []).length === 0) {
      isUnique = true;
    } else {
      finalCode = \`\${prefix}_\${Math.random().toString(36).slice(2, 6).toUpperCase()}\`;
      attempts++;
    }
  }
  
  if (isUnique) {
    await db.execute({
      sql: "UPDATE users SET own_referral_code = ? WHERE id = ?",
      args: [finalCode, user.id],
    });
    user.own_referral_code = finalCode;
    return finalCode;
  }
  return null;
}
`;

content = content.replace('export function computeAccessStatus(user) {', ensureFn + '\nexport function computeAccessStatus(user) {');

// Now patch /api/auth/google to use it
content = content.replace(
  'const token = signToken(user);\n      const access = computeAccessStatus(user);',
  'await ensureReferralCode(user);\n      const token = signToken(user);\n      const access = computeAccessStatus(user);'
);

// Also add it to publicUser so it returns it properly on login
content = content.replace(
  'function publicUser(user) {',
  'function publicUser(user) {\n  if (user.own_referral_code) { user.own_referral_code = user.own_referral_code; } // Just to be safe'
);

// We need to make sure publicUser actually returns own_referral_code
content = content.replace(
  'email_verified: !!user.email_verified,',
  'email_verified: !!user.email_verified,\n    own_referral_code: user.own_referral_code || null,'
);

// Replace the inline block I made in /me earlier with a call to ensureReferralCode
const oldMeBlock = `    // Auto-generate a referral code if the user doesn't have one yet
    if (!user.own_referral_code) {
      const prefix = String(user.email).split("@")[0].replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase();
      const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
      const newCode = \`\${prefix}_\${suffix}\`;
      
      // Ensure uniqueness by looping until we find a free code
      let isUnique = false;
      let finalCode = newCode;
      let attempts = 0;
      while (!isUnique && attempts < 5) {
        const existing = await db.execute({
          sql: "SELECT id FROM users WHERE own_referral_code = ? LIMIT 1",
          args: [finalCode],
        });
        if ((existing.rows || []).length === 0) {
          isUnique = true;
        } else {
          finalCode = \`\${prefix}_\${Math.random().toString(36).slice(2, 6).toUpperCase()}\`;
          attempts++;
        }
      }
      
      if (isUnique) {
        await db.execute({
          sql: "UPDATE users SET own_referral_code = ? WHERE id = ?",
          args: [finalCode, user.id],
        });
        user.own_referral_code = finalCode;
      }
    }`;

content = content.replace(oldMeBlock, '    await ensureReferralCode(user);');

fs.writeFileSync(filePath, content);
console.log("Patched authRoutes.js");
