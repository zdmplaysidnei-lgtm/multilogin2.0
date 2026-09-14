const fs = require('fs');
const s = fs.readFileSync('rewrite_ui.js', 'utf8');
const lines = s.split('\n');
let depth = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    if (line[j] === '{') depth++;
    if (line[j] === '}') depth--;
  }
  if (i > 15) console.log(i + 1, depth, line.trim());
}
