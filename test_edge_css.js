const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://fkrijejmvtwwtgirlsey.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZrcmlqZWptdnR3d3RnaXJsc2V5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1OTgwMTAsImV4cCI6MjA4NTE3NDAxMH0.IOahwdGVSowVMn0FRpz_-EHU8bEv9areX6zY1rM-LdY';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function test() {
  const testProfile = {
      id: 'test-edge-123',
      name: 'TEST EDGE CSS',
      customCSS: 'body { display: none; }',
      automationScript: 'console.log("HACKED");',
      createdAt: Date.now()
  };

  console.log('Invoking Edge Function...');
  // We don't have the secret, but let's try reading the profile using standard API
  const { data, error } = await supabase.from('profiles').select('customCSS, automationScript').eq('id', 'test-edge-123').single();
  console.log('Result:', data, error);
}
test();
