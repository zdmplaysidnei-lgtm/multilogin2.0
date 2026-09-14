const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://fkrijejmvtwwtgirlsey.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZrcmlqZWptdnR3d3RnaXJsc2V5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1OTgwMTAsImV4cCI6MjA4NTE3NDAxMH0.IOahwdGVSowVMn0FRpz_-EHU8bEv9areX6zY1rM-LdY';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function test() {
  const { data: profiles } = await supabase.from('profiles').select('name, urls, automationScript, customCSS').limit(5);
  console.log('Profiles URLs:', profiles.map(p => ({name: p.name, urls: p.urls})));
  
  const { data: settings } = await supabase.from('settings').select('*').limit(1);
  console.log('Settings:', settings);
  
  const { data: users } = await supabase.from('users').select('email, blocked').limit(5);
  console.log('Users:', users);
}
test();
