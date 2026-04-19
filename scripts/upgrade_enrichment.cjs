const fs = require('fs');
const content = fs.readFileSync('C:/Users/Dawrld/score-phantom/src/enrichment/enrichmentService.js', 'utf8');
const lines = content.split('\n');
let braceDepth = 0, funcStartLine = -1, funcEndLine = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('export async function fetchAndStoreEnrichment(fixture)')) {
    funcStartLine = i; braceDepth = 0;
  }
  if (funcStartLine > -1) {
    for (const ch of lines[i]) { if (ch === '{') braceDepth++; if (ch === '}') braceDepth--; }
    if (braceDepth === 0 && i > funcStartLine) { funcEndLine = i; break; }
  }
}
console.log('Function found at lines:', funcStartLine, '-', funcEndLine);
const newFn = fs.readFileSync('C:/Users/Dawrld/score-phantom/scripts/new_enrichment_fn.js', 'utf8');
const newContent = lines.slice(0, funcStartLine).join('\n') + '\n' + newFn + '\n' + lines.slice(funcEndLine + 1).join('\n');
fs.writeFileSync('C:/Users/Dawrld/score-phantom/src/enrichment/enrichmentService.js', newContent);
console.log('Done!');
