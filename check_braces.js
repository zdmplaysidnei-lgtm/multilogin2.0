const fs = require('fs');
const content = fs.readFileSync('App.tsx', 'utf8');

let depth = 0;
let lineNum = 1;
for (let i = 0; i < content.length; i++) {
  if (content[i] === '\n') lineNum++;
  if (content[i] === '{') depth++;
  if (content[i] === '}') {
    depth--;
    if (depth < 0) {
      console.log('Negative depth at line', lineNum);
      break;
    }
  }
}
console.log('Final depth:', depth);
