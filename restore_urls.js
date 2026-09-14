const fs = require('fs');
const csv = require('csv-parser');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient('https://fkrijejmvtwwtgirlsey.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZrcmlqZWptdnR3d3RnaXJsc2V5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTU5ODAxMCwiZXhwIjoyMDg1MTc0MDEwfQ.TcuSlPAZaJ8C0uRSilvGVvuYzQsCEafA13xP3FOv5DE');

let restoredCount = 0;
let tasks = [];

fs.createReadStream('C:\\Users\\USER\\Downloads\\supabase2\\profiles_rows (1).csv')
  .pipe(csv())
  .on('data', (data) => {
    try {
      let urls = [];
      if (data.urls) {
        try {
          urls = JSON.parse(data.urls);
        } catch (e) {
          // fallback
        }
      }
      
      if (urls.length > 0) {
        tasks.push(supabase.from('profiles').update({ urls: urls }).eq('id', data.id).then(({error}) => {
          if (!error) restoredCount++;
          else console.error('Error updating', data.id, error.message);
        }));
      }
    } catch (e) {
      console.error(e);
    }
  })
  .on('end', async () => {
    console.log(`Waiting for ${tasks.length} updates to finish...`);
    await Promise.all(tasks);
    console.log(`Restored URLs for ${restoredCount} profiles from backup!`);
  });
