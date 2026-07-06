import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://fkrijejmvtwwtgirlsey.supabase.co';

// ✅ Chave multilogin2026 (antiga "default" foi revogada e deletada)
const SUPABASE_ANON_KEY = 'sb_publishable_n0gkvKCEj3XL68eZ2diNXg_FoS0n2xZ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: {
    fetch: (url, options) => {
      // Usar apenas a opção nativa do fetch para evitar cache.
      // Parâmetros na URL (como _cb) quebram o PostgREST (erro PGRST100).
      return fetch(url, {
        ...options,
        cache: 'no-store'
      });
    }
  }
});