// Script para verificar a RLS do Supabase - simular exatamente o que o browser faz
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://fkrijejmvtwwtgirlsey.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_slrAzZ8RLnDIwaeERExJxQ_ou8prAN9';

// Simular exatamente como o browser cria o cliente
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

async function test() {
  console.log('=== TESTE 1: Select todos os perfis ===');
  const r1 = await supabase.from('profiles').select('id, name').order('orderIndex', { ascending: true });
  console.log('Count:', r1.data?.length, '| Error:', r1.error?.message);

  console.log('\n=== TESTE 2: Select com RLS check ===');
  const r2 = await supabase.rpc('get_rls_policies').catch(e => ({ error: e }));
  console.log('RLS:', r2);

  console.log('\n=== TESTE 3: Verificar userid das 3 que aparecem ===');
  const r3 = await supabase.from('profiles').select('name, userid').in('name', ['Netflix Premium', 'Canva Pro', 'ChatGPT Plus']);
  console.log('Mock profiles userid:', r3.data, r3.error?.message);
}
test();
