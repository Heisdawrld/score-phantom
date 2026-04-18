const fs = require('fs');
let html = fs.readFileSync('admin.html', 'utf-8');

const scriptLogic = `
  // ── Referrals & Partners ──────────────────────────────────────────────────
  async function loadReferrals() {
    document.getElementById('standardReferralTableWrap').innerHTML = '<div style="color:#8b949e">Loading...</div>';
    document.getElementById('partnerTableWrap').innerHTML = '<div style="color:#8b949e">Loading...</div>';
    
    try {
      const stdRes = await api('/api/admin/standard-commissions');
      const partRes = await api('/api/admin/partners');
      
      renderStandardReferrals(stdRes.commissions || []);
      renderPartners(partRes.partners || []);
    } catch (err) {
      document.getElementById('standardReferralTableWrap').innerHTML = \`<div style="color:#ef4444">\${err.message}</div>\`;
      document.getElementById('partnerTableWrap').innerHTML = \`<div style="color:#ef4444">\${err.message}</div>\`;
    }
  }

  function renderStandardReferrals(data) {
    const wrap = document.getElementById('standardReferralTableWrap');
    if (!data.length) { wrap.innerHTML = '<p style="color:#8b949e">No standard user commissions generated yet.</p>'; return; }
    
    let html = '<table><thead><tr>';
    html += '<th style="text-align:left">User</th>';
    html += '<th style="text-align:left">Code</th>';
    html += '<th style="text-align:right">Revenue</th>';
    html += '<th style="text-align:right">Commission</th>';
    html += '<th style="text-align:right">Pending</th>';
    html += '<th style="text-align:right">Paid</th>';
    html += '<th style="text-align:right">Action</th>';
    html += '</tr></thead><tbody>';
    
    data.forEach(c => {
      html += '<tr>';
      html += \`<td style="font-weight:bold">\${c.email}</td>\`;
      html += \`<td style="color:#8b949e; font-family:monospace">\${c.own_referral_code}</td>\`;
      html += \`<td style="text-align:right; color:#8b949e">₦\${Number(c.total_revenue).toLocaleString()}</td>\`;
      html += \`<td style="text-align:right; font-weight:bold; color:var(--primary)">₦\${Number(c.total_commission).toLocaleString()}</td>\`;
      html += \`<td style="text-align:right; font-weight:bold; color:#eab308">₦\${Number(c.pending_commission).toLocaleString()}</td>\`;
      html += \`<td style="text-align:right; font-weight:bold; color:var(--primary)">₦\${Number(c.settled_commission).toLocaleString()}</td>\`;
      html += \`<td style="text-align:right"><button class="btn" onclick="settleStandardCommission('\${c.user_id}', '\${c.email}')">Mark Paid</button></td>\`;
      html += '</tr>';
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;
  }

  function renderPartners(data) {
    const wrap = document.getElementById('partnerTableWrap');
    if (!data.length) { wrap.innerHTML = '<p style="color:#8b949e">No active partners found.</p>'; return; }
    
    let html = '<table><thead><tr>';
    html += '<th style="text-align:left">Partner</th>';
    html += '<th style="text-align:left">Code</th>';
    html += '<th style="text-align:right">Rate</th>';
    html += '<th style="text-align:right">Signups</th>';
    html += '<th style="text-align:right">Revenue</th>';
    html += '<th style="text-align:right">Pending</th>';
    html += '<th style="text-align:right">Paid</th>';
    html += '<th style="text-align:right">Action</th>';
    html += '</tr></thead><tbody>';
    
    data.forEach(p => {
      html += '<tr>';
      html += \`<td><div style="font-weight:bold">\${p.name}</div><div style="font-size:11px; color:#8b949e">\${p.email || 'No email'}</div></td>\`;
      html += \`<td style="color:#8b949e; font-family:monospace">\${p.referral_code}</td>\`;
      html += \`<td style="text-align:right; color:var(--primary); font-weight:bold">\${(p.commission_rate * 100).toFixed(0)}%</td>\`;
      html += \`<td style="text-align:right; color:#8b949e">\${p.total_referred_signups} users</td>\`;
      html += \`<td style="text-align:right; color:#8b949e">₦\${Number(p.total_revenue).toLocaleString()}</td>\`;
      html += \`<td style="text-align:right; font-weight:bold; color:#eab308">₦\${Number(p.pending_commission).toLocaleString()}</td>\`;
      html += \`<td style="text-align:right; font-weight:bold; color:var(--primary)">₦\${Number(p.settled_commission).toLocaleString()}</td>\`;
      html += \`<td style="text-align:right"><button class="btn" onclick="settlePartnerCommission('\${p.partner_id}', '\${p.name}')">Mark Paid</button></td>\`;
      html += '</tr>';
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;
  }

  async function settleStandardCommission(userId, email) {
    if (!confirm('Mark ALL pending commissions for ' + email + ' as Paid?')) return;
    try {
      const data = await api('/api/admin/standard-commissions/' + userId + '/settle', { method: 'POST', body: JSON.stringify({}) });
      if (data.error) throw new Error(data.error);
      alert('Settled ' + data.settled_count + ' commissions successfully.');
      loadReferrals();
    } catch (err) { alert('Error: ' + err.message); }
  }

  async function settlePartnerCommission(partnerId, name) {
    if (!confirm('Mark ALL pending commissions for ' + name + ' as Paid?')) return;
    try {
      const data = await api('/api/admin/partners/' + partnerId + '/settle', { method: 'POST', body: JSON.stringify({}) });
      if (data.error) throw new Error(data.error);
      alert('Settled ' + data.settled_count + ' commissions successfully.');
      loadReferrals();
    } catch (err) { alert('Error: ' + err.message); }
  }
`;

html = html.replace(
  '  // ── Search ────────────────────────────────────────────────────────────────', 
  scriptLogic + '\n  // ── Search ────────────────────────────────────────────────────────────────'
);

fs.writeFileSync('admin.html', html);
