const fs = require('fs');
const parser = require('@babel/parser');

const content = fs.readFileSync('App.tsx', 'utf8');
try {
  parser.parse(content, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript']
  });
  console.log("Parsed successfully!");
} catch (e) {
  console.log("Parse Error:", e.message, "at line", e.loc?.line, "column", e.loc?.column);
}
