const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://fkrijejmvtwwtgirlsey.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZrcmlqZWptdnR3d3RnaXJsc2V5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1OTgwMTAsImV4cCI6MjA4NTE3NDAxMH0.IOahwdGVSowVMn0FRpz_-EHU8bEv9areX6zY1rM-LdY';

async function test() {
  const fetchResponse = await fetch('https://fkrijejmvtwwtgirlsey.supabase.co/functions/v1/secure-db-ops', {
     method: 'POST',
     headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
     },
     body: JSON.stringify({ action: 'upsertProfile', profile: { id: 'test_123', name: 'Test' }, secret: '123456' })
  });
  const text = await fetchResponse.text();
  console.log('Status:', fetchResponse.status);
  console.log('Body:', text);
  
  // Test direct db
  const { data, error } = await supabase.from('users').select('id').eq('password', '123456');
  console.log('Users with password 123456:', data?.length, error);
}
test();
