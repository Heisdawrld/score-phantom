// Live site integration test — hits the production API directly
const BASE = 'https://score-phantom.onrender.com/api';

async function api(path, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { headers });
  if (!res.ok) return { error: res.status, body: await res.text() };
  return res.json();
}

async function login(email, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  return res.json();
}

async function run() {
  console.log('========================================');
  console.log('  SCOREPHANTOM LIVE API TEST');
  console.log('  ' + new Date().toISOString());
  console.log('========================================\n');

  // ── TEST 1: Login as FREE TRIAL user ─────────────────────────────
  console.log('── TEST 1: FREE TRIAL LOGIN ──');
  const trial = await login('Adieledavid007@gmail.com', 'Dawrld1*');
  if (trial.error) {
    console.log('❌ Login failed:', trial.error);
  } else {
    const u = trial.user;
    console.log(`✅ Logged in as: ${u.username || u.email}`);
    console.log(`   access_status:      ${u.access_status}`);
    console.log(`   has_access:         ${u.has_access}`);
    console.log(`   has_full_access:    ${u.has_full_access}`);
    console.log(`   trial_active:       ${u.trial_active}`);
    console.log(`   subscription_active: ${u.subscription_active}`);
    console.log(`   trial_ends_at:      ${u.trial_ends_at}`);
    
    // Expected: access_status = "trial", trial_active = true, has_full_access = true
    const trialOk = u.access_status === 'trial' && u.trial_active === true && u.has_full_access === true;
    console.log(`   VERDICT: ${trialOk ? '🟢 CORRECT — trial recognized' : '🔴 BUG — trial not recognized'}`);
  }

  // ── TEST 2: Login as PREMIUM user ────────────────────────────────
  console.log('\n── TEST 2: PREMIUM LOGIN ──');
  const prem = await login('Davidadiele7@gmail.com', 'Dawrld1*');
  if (prem.error) {
    console.log('❌ Login failed:', prem.error);
  } else {
    const u = prem.user;
    console.log(`✅ Logged in as: ${u.username || u.email}`);
    console.log(`   access_status:      ${u.access_status}`);
    console.log(`   has_access:         ${u.has_access}`);
    console.log(`   has_full_access:    ${u.has_full_access}`);
    console.log(`   trial_active:       ${u.trial_active}`);
    console.log(`   subscription_active: ${u.subscription_active}`);
  }

  const token = trial.token || prem.token;

  // ── TEST 3: Fixtures API ─────────────────────────────────────────
  console.log('\n── TEST 3: FIXTURES ──');
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  const fixtures = await api(`/fixtures?date=${today}`, token);
  if (fixtures.error) {
    console.log(`❌ Fixtures failed: ${fixtures.error}`);
  } else {
    const list = fixtures.fixtures || fixtures;
    console.log(`✅ Fixtures for ${today}: ${Array.isArray(list) ? list.length : 'N/A'}`);
    if (Array.isArray(list) && list.length > 0) {
      const f = list.find(x => x.match_status === 'NS') || list[0];
      console.log(`   Sample: ${f.home_team_name || f.homeTeam} vs ${f.away_team_name || f.awayTeam} | ${f.match_status}`);
      
      // ── TEST 4: Prediction for this fixture ──────────────────────
      console.log('\n── TEST 4: PREDICTION TAGS ──');
      const pred = await api(`/predict/${f.id}`, token);
      if (pred.error) {
        console.log(`❌ Prediction failed: ${pred.error} — ${pred.body?.slice(0,200)}`);
      } else {
        const rec = pred.predictions?.recommendation || pred.recommendation;
        if (rec) {
          console.log(`✅ Prediction loaded for fixture ${f.id}`);
          console.log(`   Pick:           ${rec.pick}`);
          console.log(`   Phantom Score:  ${rec.phantom_score_pct}%`);
          console.log(`   Risk Level:     ${rec.riskLevel}`);
          console.log(`   Edge Label:     ${rec.edgeLabel}`);
          console.log(`   Advisor Status: ${rec.advisor_status}`);
          console.log(`   Model Conf:     ${rec.modelConfidence}`);
          console.log(`   Tactical Fit:   ${rec.tacticalFit}`);
          console.log(`   Value Rating:   ${rec.valueRating}`);
          console.log(`   isSafeBet:      ${rec.isSafeBet}`);
          console.log(`   isValueBet:     ${rec.isValueBet}`);

          // TAG ALIGNMENT CHECK
          const prob = rec.phantom_score_pct;
          const risk = rec.riskLevel;
          const advisor = rec.advisor_status;
          
          let tagOk = true;
          if (prob >= 74 && risk === 'AGGRESSIVE') {
            console.log(`   ⚠️ BUG: ${prob}% should NOT be AGGRESSIVE/HIGH RISK`);
            tagOk = false;
          }
          if (prob >= 70 && advisor === 'GAMBLE') {
            console.log(`   ⚠️ BUG: ${prob}% should NOT be GAMBLE`);
            tagOk = false;
          }
          if (prob < 58 && risk === 'SAFE') {
            console.log(`   ⚠️ BUG: ${prob}% should NOT be SAFE`);
            tagOk = false;
          }
          console.log(`   TAG ALIGNMENT: ${tagOk ? '🟢 COHERENT' : '🔴 MISALIGNED'}`);
        } else {
          console.log(`   No recommendation (noSafePick or abstain)`);
          console.log(`   Reason: ${pred.predictions?.recommendation?.reasons?.[0] || 'N/A'}`);
        }

        // Check backup picks too
        const backups = pred.predictions?.backup_picks || [];
        if (backups.length > 0) {
          console.log(`\n   Backup picks (${backups.length}):`);
          backups.forEach((bp, i) => {
            console.log(`     [${i+1}] ${bp.pick} | ${bp.phantom_score_pct}% | risk:${bp.riskLevel} | advisor:${bp.advisor_status}`);
          });
        }
      }
    }
  }

  // ── TEST 5: Track Record ──────────────────────────────────────────
  console.log('\n── TEST 5: TRACK RECORD ──');
  const tr = await api('/track-record?days=30', token);
  if (tr.error) {
    console.log(`❌ Track record failed: ${tr.error}`);
  } else {
    const s = tr.overallStats || {};
    console.log(`✅ Track Record (30d): wins=${s.wins} losses=${s.losses} rate=${s.winRate?.toFixed(1)}%`);
  }

  console.log('\n========================================');
  console.log('  TEST COMPLETE');
  console.log('========================================');
  process.exit(0);
}

run().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
