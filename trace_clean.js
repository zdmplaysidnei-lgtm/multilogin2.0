const fs = require('fs');
const content = fs.readFileSync('App.tsx', 'utf8');

// Just remove all string literals and comments to see if brackets match
let clean = content
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*/g, '')
  .replace(/"[^"\\]*(\\.[^"\\]*)*"/g, '""')
  .replace(/'[^'\\]*(\\.[^'\\]*)*'/g, "''")
  .replace(/`[^`\\]*(\\.[^`\\]*)*`/g, "``");

let depth = 0;
const lines = clean.split('\n');
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    if (line[j] === '{') depth++;
    if (line[j] === '}') depth--;
  }
}
console.log('Clean depth:', depth);
