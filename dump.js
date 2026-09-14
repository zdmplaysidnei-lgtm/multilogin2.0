const fs = require('fs');
const content = fs.readFileSync('App.tsx', 'utf8');
let actualStartIndex = content.indexOf('   return (', content.indexOf('if (isAppLoading && !profiles.length) return') + 50);
const endIndex = content.indexOf(`            {activeTab === 'users' && (`, actualStartIndex);
const deletedChunk = content.substring(actualStartIndex, endIndex);
fs.writeFileSync('deleted_chunk.txt', deletedChunk);
