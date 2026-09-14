const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://fkrijejmvtwwtgirlsey.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZrcmlqZWptdnR3d3RnaXJsc2V5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1OTgwMTAsImV4cCI6MjA4NTE3NDAxMH0.IOahwdGVSowVMn0FRpz_-EHU8bEv9areX6zY1rM-LdY';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function test() {
  console.log('\nInvoking edge function...');
  try {
      const { data, error } = await supabase.functions.invoke('secure-db-ops', {
          body: { 
              action: 'upsertProfile', 
              profile: { id: 'test_123', name: 'Test' }, 
              secret: '123456' 
          }
      });
      console.log('Edge function response:', { data, error });
  } catch (err) {
      console.log('Local Error:', err);
  }
}
test();
