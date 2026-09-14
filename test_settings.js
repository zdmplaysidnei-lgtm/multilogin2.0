const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://fkrijejmvtwwtgirlsey.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_slrAzZ8RLnDIwaeERExJxQ_ou8prAN9';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function test() {
  const sRes = await supabase.from('settings').select('config').single();
  console.log('sRes:', sRes);
}
test();
