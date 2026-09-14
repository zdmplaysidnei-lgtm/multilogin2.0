const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://fkrijejmvtwwtgirlsey.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZrcmlqZWptdnR3d3RnaXJsc2V5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1OTgwMTAsImV4cCI6MjA4NTE3NDAxMH0.IOahwdGVSowVMn0FRpz_-EHU8bEv9areX6zY1rM-LdY';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testRLS() {
  console.log('Testing Profiles Update without Edge Function...');
  const { data: pData, error: pError } = await supabase.from('profiles').update({ name: 'TEST_RLS' }).eq('name', 'Com');
  console.log('Profiles Update Error:', pError);

  console.log('Testing Users Update without Edge Function...');
  const { data: uData, error: uError } = await supabase.from('users').update({ blocked: false }).eq('email', 'andreluis.at06@gmail.com');
  console.log('Users Update Error:', uError);
}
testRLS();
