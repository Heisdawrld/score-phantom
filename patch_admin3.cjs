const fs = require('fs');
let html = fs.readFileSync('admin.html', 'utf-8');

html = html.replace(
  "fetch('/api/admin/standard-commissions', { headers: { 'Authorization': 'Bearer '+token } }).then(r=>r.json())",
  "api('/api/admin/standard-commissions')"
);

html = html.replace(
  "fetch('/api/admin/partners', { headers: { 'Authorization': 'Bearer '+token } }).then(r=>r.json())",
  "api('/api/admin/partners')"
);

html = html.replace(
  "fetch('/api/admin/standard-commissions/' + userId + '/settle', {",
  "api('/api/admin/standard-commissions/' + userId + '/settle', {"
);

html = html.replace(
  "fetch('/api/admin/partners/' + partnerId + '/settle', {",
  "api('/api/admin/partners/' + partnerId + '/settle', {"
);

html = html.replace(
  "headers: { 'Authorization': 'Bearer '+token, 'Content-Type': 'application/json' },",
  ""
);

html = html.replace(
  "headers: { 'Authorization': 'Bearer '+token, 'Content-Type': 'application/json' },",
  ""
);

fs.writeFileSync('admin.html', html);
console.log("Patched admin.html API calls");
