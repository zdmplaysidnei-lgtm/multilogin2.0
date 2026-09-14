const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://fkrijejmvtwwtgirlsey.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZrcmlqZWptdnR3d3RnaXJsc2V5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1OTgwMTAsImV4cCI6MjA4NTE3NDAxMH0.IOahwdGVSowVMn0FRpz_-EHU8bEv9areX6zY1rM-LdY';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function cleanDB() {
  console.log('Unblocking all users...');
  const { data: uData, error: uError } = await supabase.from('users').update({ blocked: false }).neq('email', 'fake'); // Updates all rows
  console.log('Users Unblocked Result:', uError ? uError.message : 'Success');

  console.log('Fetching profiles...');
  const { data: profiles, error: pError } = await supabase.from('profiles').select('id, name, urls');
  if (pError) {
    console.log('Error fetching profiles:', pError);
    return;
  }

  console.log(`Found ${profiles.length} profiles. Cleaning URLs...`);
  for (const p of profiles) {
    let newUrl = 'https://google.com';
    // Try to guess URL based on name
    if (p.name.toLowerCase().includes('envato')) newUrl = 'https://env.hubguru.space/';
    if (p.name.toLowerCase().includes('netflix')) newUrl = 'https://netflix.com';
    if (p.name.toLowerCase().includes('canva')) newUrl = 'https://canva.com';
    if (p.name.toLowerCase().includes('chatgpt') || p.name.toLowerCase().includes('gpt')) newUrl = 'https://chat.openai.com';

    const { error } = await supabase.from('profiles').update({ urls: [newUrl] }).eq('id', p.id);
    if (error) console.log(`Error updating ${p.name}:`, error.message);
    else console.log(`Cleaned ${p.name} -> ${newUrl}`);
  }
}
cleanDB();
