const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://fkrijejmvtwwtgirlsey.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZrcmlqZWptdnR3d3RnaXJsc2V5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1OTgwMTAsImV4cCI6MjA4NTE3NDAxMH0.IOahwdGVSowVMn0FRpz_-EHU8bEv9areX6zY1rM-LdY';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function test() {
  console.log('Testing Edge Function deployment status...');
  // Find a password that is shared among multiple users
  const { data: users } = await supabase.from('users').select('password');
  const passwordCounts = {};
  users.forEach(u => {
     passwordCounts[u.password] = (passwordCounts[u.password] || 0) + 1;
  });
  const sharedPassword = Object.keys(passwordCounts).find(p => passwordCounts[p] > 1);
  console.log('Shared password found:', sharedPassword);
  
  if (sharedPassword) {
      const fetchResponse = await fetch('https://fkrijejmvtwwtgirlsey.supabase.co/functions/v1/secure-db-ops', {
         method: 'POST',
         headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
         },
         body: JSON.stringify({ action: 'deleteProfile', profileId: 'test_123', secret: sharedPassword })
      });
      console.log('Edge function HTTP Status:', fetchResponse.status);
      console.log('Edge function Body:', await fetchResponse.text());
  } else {
      console.log('No shared passwords found to test.');
  }
}
test();
