const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://fkrijejmvtwwtgirlsey.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_slrAzZ8RLnDIwaeERExJxQ_ou8prAN9';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function test() {
  const { data, error } = await supabase.from('profiles').select('id, name, status, coverImage, urls, launchMode, useExternalBrowserUI, accessUrl, loginType, autoLoginEnabled, email, password, customCSS, discordToken, categories, proxy, isFavorite, createdAt, orderIndex, fingerprint, customExtensionPath, videoTutorial, userid, useNativeBrowser, session_updated_at');
  if (error) console.log('Error:', error);
  else console.log('Optimized Size:', JSON.stringify(data).length, 'bytes for', data.length, 'profiles');
}
test();
