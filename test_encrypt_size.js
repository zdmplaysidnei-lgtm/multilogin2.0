const { createClient } = require('@supabase/supabase-js');
const CryptoJS = require('crypto-js');

const SUPABASE_URL = 'https://fkrijejmvtwwtgirlsey.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_slrAzZ8RLnDIwaeERExJxQ_ou8prAN9';
const SECRET_KEY = "nebula-vps-super-secret-key-v1"; 

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function test() {
  const { data } = await supabase.from('profiles').select('id, name, status, coverImage, urls, launchMode, useExternalBrowserUI, accessUrl, loginType, autoLoginEnabled, email, password, customCSS, discordToken, categories, proxy, isFavorite, createdAt, orderIndex, fingerprint, customExtensionPath, videoTutorial, userid, useNativeBrowser, session_updated_at');
  
  const jsonString = JSON.stringify(data);
  const encrypted = CryptoJS.AES.encrypt(jsonString, SECRET_KEY).toString();
  console.log('Encrypted Size:', encrypted.length, 'bytes for', data.length, 'profiles');
}
test();
