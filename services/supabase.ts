import { createClient } from '@supabase/supabase-js';

// URL confirmada pelo print do seu navegador
const SUPABASE_URL = 'https://fkrijejmvtwwtgirlsey.supabase.co'; 

// IMPORTANTE: Insira sua chave real aqui.
const SUPABASE_ANON_KEY = 'sb_publishable_slrAzZ8RLnDIwaeERExJxQ_ou8prAN9'; 

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);