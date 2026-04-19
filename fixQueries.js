import fs from 'fs';
import glob from 'glob';

const files = glob.sync('src/**/*.js');

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;
  
  // Replace simple single-line INSERT OR IGNORE INTO table (col) VALUES (?, ?)
  content = content.replace(/INSERT OR IGNORE INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/g, 'INSERT INTO $1 ($2) VALUES ($3) ON CONFLICT DO NOTHING');
  
  // For any remaining INSERT OR IGNORE INTO (like multi-line), just replace it and we will append ON CONFLICT DO NOTHING manually
  content = content.replace(/INSERT OR IGNORE INTO/g, 'INSERT INTO');
  
  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Updated ${file}`);
  }
}
