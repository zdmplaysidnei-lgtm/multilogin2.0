import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://fkrijejmvtwwtgirlsey.supabase.co';

// ✅ Chave multilogin2026 (antiga "default" foi revogada e deletada)
const SUPABASE_ANON_KEY = 'sb_publishable_slrAzZ8RLnDIwaeERExJxQ_ou8prAN9';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);