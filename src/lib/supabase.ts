import { createClient } from '@supabase/supabase-js';

// --- ATENÇÃO: VOCÊ PRECISA SUBSTITUIR ESSES VALORES ---
// Pegue no seu painel do Supabase em Project Settings > API
const SUPABASE_URL = 'https://fkrijejmvtwwtgirlsey.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_slrAzZ8RLnDIwaeERExJxQ_ou8prAN9';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

// Função auxiliar para checar se a config é válida
export const isSupabaseConfigured = () => {
  return SUPABASE_URL && !SUPABASE_URL.includes('SUA-URL') && SUPABASE_ANON_KEY.length > 50;
};

