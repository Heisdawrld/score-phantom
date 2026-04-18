const fs = require('fs');
let html = fs.readFileSync('admin.html', 'utf-8');

// 1. Move tab-backtest inside the body
const backtestHTML = html.substring(html.indexOf('  <div id="tab-backtest"'));
html = html.substring(0, html.indexOf('</script>\n</body>\n</html>'));

// Insert the backtestHTML right before the script tag
html = html.replace('  <!-- Login -->', backtestHTML + '\n  <!-- Login -->');

// Re-append the closing tags
html += '</script>\n</body>\n</html>\n';

fs.writeFileSync('admin.html', html);
