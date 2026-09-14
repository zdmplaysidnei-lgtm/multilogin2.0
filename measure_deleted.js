const fs = require('fs');
const content = fs.readFileSync('App.tsx', 'utf8');
let actualStartIndex = content.indexOf('   return (', content.indexOf('if (isAppLoading && !profiles.length) return') + 50);
const endIndex = content.indexOf(`            {activeTab === 'users' && (`, actualStartIndex);
const deletedChunk = content.substring(actualStartIndex, endIndex);

let depth = 0;
for (let j = 0; j < deletedChunk.length; j++) {
  if (deletedChunk[j] === '{') depth++;
  if (deletedChunk[j] === '}') depth--;
}
console.log('Deleted chunk brace balance:', depth);

const divOpen = (deletedChunk.match(/<div/g)||[]).length;
const divClose = (deletedChunk.match(/<\/div>/g)||[]).length;
console.log('Deleted div balance:', divOpen - divClose);

const mainOpen = (deletedChunk.match(/<main/g)||[]).length;
const mainClose = (deletedChunk.match(/<\/main>/g)||[]).length;
console.log('Deleted main balance:', mainOpen - mainClose);

