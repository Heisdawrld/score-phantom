const fs = require('fs');
let html = fs.readFileSync('admin.html', 'utf-8');

const referralPanel = `
    <!-- Referrals Tab -->
    <div id="panel-referrals" class="tab-content" style="display:none">
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <h2>Standard User Referrals (10%)</h2>
          <button class="btn" onclick="loadReferrals()">Refresh</button>
        </div>
        <div id="standardReferralTableWrap">
          <div class="loading">Loading standard user referrals...</div>
        </div>
      </div>

      <div class="card" style="margin-top: 24px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <h2>Dedicated Partners (Custom %)</h2>
        </div>
        <div id="partnerTableWrap">
          <div class="loading">Loading partners...</div>
        </div>
      </div>
    </div>
`;

html = html.replace(
  '<div id="tab-backtest"',
  referralPanel + '\n    <div id="tab-backtest"'
);

fs.writeFileSync('admin.html', html);
console.log("Patched admin.html HTML panel");
