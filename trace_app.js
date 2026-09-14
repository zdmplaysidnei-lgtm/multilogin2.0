const fs = require('fs');
const content = fs.readFileSync('App.tsx', 'utf8');
let depth = 0;
const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    if (line[j] === '{') depth++;
    if (line[j] === '}') depth--;
  }
}
console.log('App.tsx final depth:', depth);
