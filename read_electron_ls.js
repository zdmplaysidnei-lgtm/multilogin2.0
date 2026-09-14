const levelup = require('levelup');
const leveldown = require('leveldown');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, 'Sidnei - Ferramentas Ilimitadas', 'Local Storage', 'leveldb');

const db = levelup(leveldown(dbPath));

const keys = [];
db.createReadStream({ values: false })
  .on('data', (key) => {
    const keyStr = key.toString();
    if (keyStr.includes('nebula')) {
      keys.push(keyStr);
    }
  })
  .on('end', () => {
    console.log('Keys with "nebula":', keys);
    db.close(() => {});
  })
  .on('error', err => {
    console.error('Error:', err.message);
    db.close(() => {});
  });
