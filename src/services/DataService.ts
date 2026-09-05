import { supabase } from '../lib/supabase';
import { AppSettings, Profile, User } from '../../types';
import { INITIAL_SETTINGS, MOCK_USERS, MOCK_PROFILES } from '../../constants';
import { Security } from './Security';

/**
 * Remove apenas campos "undefined" que o Supabase rejeita.
 */
const cleanForSupabase = (obj: any) => {
  return JSON.parse(JSON.stringify(obj, (key, value) => {
    if (value === undefined) return null;
    return value;
  }));
};

export const DataService = {

  initializeData: async () => {
    const cachedUsers = Security.decrypt(localStorage.getItem('nebula_users_v1'));
    const cachedProfiles = Security.decrypt(localStorage.getItem('nebula_profiles_v1'));
    const cachedSettings = Security.decrypt(localStorage.getItem('nebula_settings_v1'));

    try {
      console.log("🔥 BUSCANDO PERFIS OTIMIZADOS DO SUPABASE 🔥");
      const [uRes, pRes, sRes] = await Promise.all([
        supabase.from('users').select('*'),
        supabase.from('profiles').select('id, name, status, coverImage, urls, launchMode, useExternalBrowserUI, accessUrl, loginType, autoLoginEnabled, email, password, customCSS, discordToken, categories, proxy, isFavorite, createdAt, orderIndex, fingerprint, customExtensionPath, videoTutorial, userid, useNativeBrowser, session_updated_at').order('orderIndex', { ascending: true }),
        supabase.from('settings').select('config').single()
      ]);

      const cloudUsers = uRes.data || [];
      const cloudProfiles = pRes.data || [];
      const cloudSettings = sRes.data?.config || INITIAL_SETTINGS;

      // Anti-wipe desativado temporariamente para debug
      // if (cloudProfiles.length === 0 && cachedProfiles && cachedProfiles.length > 0) { ... }

      if (pRes.error) {
         cloudSettings.updateMessage = `DB_ERROR: ${pRes.error.message} (code: ${pRes.error.code})`;
      } else if (cloudProfiles.length === 0) {
         cloudSettings.updateMessage = `DB_EMPTY: 0 rows returned for profiles.`;
      }

      // Salva no cache sem deixar falhas de quota matarem o retorno
      try { DataService.saveToLocalCache(cloudUsers, cloudProfiles, cloudSettings); } catch (cacheErr) {
        console.warn('Cache write failed (quota?), continuing anyway:', cacheErr);
      }

      console.log(`✅ DataService retornando ${cloudProfiles.length} perfis do Supabase`);
      return { users: cloudUsers, profiles: cloudProfiles, settings: cloudSettings, isOffline: false };
    } catch (error) {
      return {
        users: cachedUsers || MOCK_USERS,
        profiles: cachedProfiles || MOCK_PROFILES,
        settings: { ...(cachedSettings || INITIAL_SETTINGS), updateMessage: `CATCH_ERROR: ${String(error)}` },
        isOffline: true,
        catchError: String(error)
      };
    }
  },

  saveUsers: async (users: User[]): Promise<boolean> => {
    localStorage.setItem('nebula_users_v1', Security.encrypt(users));
    try {
      const sanitized = users.map(u => cleanForSupabase(u));
      const chunkSize = 200;
      for (let i = 0; i < sanitized.length; i += chunkSize) {
        const chunk = sanitized.slice(i, i + chunkSize);
        const { error } = await supabase.from('users').upsert(chunk, { onConflict: 'id' });
        if (error) {
          console.error("Erro no chunk users:", error.message);
          return false;
        }
      }
      return true;
    } catch (e) { return false; }
  },

  saveProfiles: async (profiles: Profile[]): Promise<boolean> => {
    localStorage.setItem('nebula_profiles_v1', Security.encrypt(profiles));
    try {
      if (!profiles || profiles.length === 0) return true;

      // Envia em lotes de 5 para evitar limite de payload do Supabase
      const BATCH_SIZE = 5;
      for (let i = 0; i < profiles.length; i += BATCH_SIZE) {
        const batch = profiles.slice(i, i + BATCH_SIZE);
        const sanitized = batch.map(p => cleanForSupabase(p));
        const { error } = await supabase.from('profiles').upsert(sanitized, { onConflict: 'id' });
        if (error) {
          console.error("Erro Supabase batch:", error.message);
          return false;
        }
        // Pequeno delay entre lotes
        if (i + BATCH_SIZE < profiles.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      return true;
    } catch (e) { return false; }
  },

  upsertSingleProfile: async (profile: Profile): Promise<boolean> => {
    try {
      const sanitized = cleanForSupabase(profile);

      // 🚀 Usa o IPC do Electron (supabaseAdmin com poderes totais) se disponível
      if (typeof window !== 'undefined' && (window as any).nebulaAPI?.db?.upsertProfile) {
        const result = await (window as any).nebulaAPI.db.upsertProfile(sanitized);
        if (!result.success) {
          console.error('IPC upsert error:', result.error);
          return false;
        }
      } else {
        const { error } = await supabase.from('profiles').upsert([sanitized], { onConflict: 'id' });
        if (error) {
          console.error("Erro upsert single:", error.message);
          return false;
        }
      }

      // Atualiza cache local
      const cached = Security.decrypt(localStorage.getItem('nebula_profiles_v1')) || [];
      const updated = cached.map((p: Profile) => p.id === profile.id ? profile : p);
      if (!cached.find((p: Profile) => p.id === profile.id)) updated.push(profile);
      localStorage.setItem('nebula_profiles_v1', Security.encrypt(updated));
      return true;
    } catch (e) { return false; }
  },

  saveSettings: async (settings: AppSettings): Promise<boolean> => {
    localStorage.setItem('nebula_settings_v1', Security.encrypt(settings));
    try {
      const { error } = await supabase.from('settings').upsert({ id: 1, config: settings }, { onConflict: 'id' });
      return !error;
    } catch (error) { return false; }
  },

  // Fix: Added missing deleteUser method
  deleteUser: async (userId: string): Promise<boolean> => {
    try {
      const { error } = await supabase.from('users').delete().eq('id', userId);
      if (error) return false;
      const current = Security.decrypt(localStorage.getItem('nebula_users_v1')) || [];
      localStorage.setItem('nebula_users_v1', Security.encrypt(current.filter((u: any) => u.id !== userId)));
      return true;
    } catch (e) { return false; }
  },

  // Fix: Added missing deleteProfile method
  deleteProfile: async (profileId: string): Promise<boolean> => {
    try {
      // 🚀 Usa o IPC do Electron (supabaseAdmin) se disponível
      if (typeof window !== 'undefined' && (window as any).nebulaAPI?.db?.deleteProfile) {
        const result = await (window as any).nebulaAPI.db.deleteProfile(profileId);
        if (!result.success) {
          console.error('IPC delete error:', result.error);
          return false;
        }
      } else {
        // Tenta deletar direto
        const { error } = await supabase.from('profiles').delete().eq('id', profileId);
        if (error) {
          // Fallback: soft-delete renomeando para __DELETED__
          const { error: softErr } = await supabase.from('profiles').update({ name: '__DELETED__' }).eq('id', profileId);
          if (softErr) return false;
        }
      }
      // Atualiza cache local
      const current = Security.decrypt(localStorage.getItem('nebula_profiles_v1')) || [];
      localStorage.setItem('nebula_profiles_v1', Security.encrypt(current.filter((p: any) => p.id !== profileId)));
      return true;
    } catch (e) { return false; }
  },

  saveToLocalCache: (users: User[], profiles: Profile[], settings: AppSettings) => {
    // NÃO salvar users nem profiles (muito grandes para o localStorage do Electron)
    // Só salvar settings (pequeno)
    try { localStorage.setItem('nebula_settings_v1', Security.encrypt(settings)); } catch(e) { console.warn('Cache settings failed:', e); }
  },

  getRememberMe: () => Security.decrypt(localStorage.getItem('nebula_auth_remember')),
  saveRememberMe: (email: string, password: string) => {
    localStorage.setItem('nebula_auth_remember', Security.encrypt({ email, password, timestamp: Date.now() }));
  },
  clearRememberMe: () => localStorage.removeItem('nebula_auth_remember'),

  updateSingleUser: async (user: User): Promise<boolean> => {
    try {
      const sanitized = cleanForSupabase(user);
      const { error } = await supabase.from('users').upsert(sanitized, { onConflict: 'id' });
      if (error) return false;
      const cached = Security.decrypt(localStorage.getItem('nebula_users_v1')) || [];
      const updated = cached.map((u: User) => u.id === user.id ? user : u);
      if (!cached.find((u: User) => u.id === user.id)) updated.push(user);
      localStorage.setItem('nebula_users_v1', Security.encrypt(updated));
      return true;
    } catch (e) { return false; }
  },

  updateSingleProfile: async (profileId: string, updates: Partial<Profile>): Promise<boolean> => {
    try {
      const sanitized = cleanForSupabase(updates);
      const { error } = await supabase.from('profiles').update(sanitized).eq('id', profileId);
      if (error) return false;
      const cached = Security.decrypt(localStorage.getItem('nebula_profiles_v1')) || [];
      const updated = cached.map((p: Profile) => p.id === profileId ? { ...p, ...updates } : p);
      localStorage.setItem('nebula_profiles_v1', Security.encrypt(updated));
      return true;
    } catch (e) { return false; }
  },

  updateProfileSessionData: async (profileId: string, sessionData: any): Promise<boolean> => {
    try {
      const { error } = await supabase.from('profiles').update({ cookies: sessionData.cookies, localStorage: sessionData.localStorage || '' }).eq('id', profileId);
      if (error) return false;
      const cached = Security.decrypt(localStorage.getItem('nebula_profiles_v1')) || [];
      const updated = cached.map((p: Profile) => p.id === profileId ? { ...p, cookies: sessionData.cookies, localStorage: sessionData.localStorage || '' } : p);
      localStorage.setItem('nebula_profiles_v1', Security.encrypt(updated));
      return true;
    } catch (e) { return false; }
  },

  getProfileSessionData: async (profileId: string): Promise<any> => {
    try {
      const { data, error } = await supabase.from('profiles').select('cookies, localStorage').eq('id', profileId).single();
      if (error || !data) return null;
      return data;
    } catch (e) { return null; }
  },

  deleteAllMembers: async (): Promise<boolean> => {
    try {
      const { error } = await supabase.from('users').delete().eq('role', 'MEMBER');
      if (error) return false;
      const cached = Security.decrypt(localStorage.getItem('nebula_users_v1')) || [];
      const updated = cached.filter((u: User) => u.role !== 'MEMBER');
      localStorage.setItem('nebula_users_v1', Security.encrypt(updated));
      return true;
    } catch (e) { return false; }
  },

  invalidateCache: () => {
    localStorage.removeItem('nebula_users_v1');
    localStorage.removeItem('nebula_profiles_v1');
    localStorage.removeItem('nebula_settings_v1');
  },

  ping: async (): Promise<{ success: boolean; latency: number }> => {
    const start = Date.now();
    try {
      const { error } = await supabase.from('settings').select('id').limit(1);
      if (error) return { success: false, latency: 0 };
      return { success: true, latency: Date.now() - start };
    } catch (e) {
      return { success: false, latency: 0 };
    }
  }
};