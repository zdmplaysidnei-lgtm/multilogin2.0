const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://fkrijejmvtwwtgirlsey.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_slrAzZ8RLnDIwaeERExJxQ_ou8prAN9';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function test() {
  const { data, error } = await supabase.from('profiles').select('*');
  if (error) {
    console.error('Error fetching profiles:', error);
  } else {
    console.log('Profiles in Supabase:', data.length);
    if (data.length > 0) {
      console.log('Profiles names:', data.map(p => p.name));
    }
  }
}
test();
