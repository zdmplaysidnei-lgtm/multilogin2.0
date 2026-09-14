const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://fkrijejmvtwwtgirlsey.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_slrAzZ8RLnDIwaeERExJxQ_ou8prAN9';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function test() {
  const [uRes, pRes, sRes] = await Promise.all([
    supabase.from('users').select('*'),
    supabase.from('profiles').select('*').order('orderIndex', { ascending: true }),
    supabase.from('settings').select('config').single()
  ]);

  console.log('uRes error:', uRes.error);
  console.log('pRes error:', pRes.error);
  console.log('sRes error:', sRes.error);
}
test();
