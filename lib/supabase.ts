import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://fkrijejmvtwwtgirlsey.supabase.co';

// ✅ Chave multilogin2026 (antiga "default" foi revogada e deletada)
const SUPABASE_ANON_KEY = 'sb_publishable_n0gkvKCEj3XL68eZ2diNXg_FoS0n2xZ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);