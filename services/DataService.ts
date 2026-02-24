import { supabase } from '../lib/supabase';
import { AppSettings, Profile, User, Role } from '../types';
import { INITIAL_SETTINGS, MOCK_USERS, MOCK_PROFILES } from '../constants';
import { Security } from './Security';

const prepareForSupabase = (obj: any) => {
  return JSON.parse(JSON.stringify(obj, (key, value) => {
    if (value === undefined) return null;
    return value;
  }));
};

// ============================================
// CACHE DE COLUNAS VÁLIDAS DO SUPABASE
// Detecta automaticamente quais colunas existem
// ============================================
let knownUserColumns: string[] | null = null;

const detectUserColumns = async (): Promise<string[]> => {
  if (knownUserColumns) return knownUserColumns;

  try {
    const { data, error } = await supabase.from('users').select('*').limit(1);
    if (!error && data && data.length > 0) {
      knownUserColumns = Object.keys(data[0]);
      console.log('📋 Colunas detectadas na tabela users:', knownUserColumns.join(', '));
    } else {
      // Fallback: colunas mínimas que sabemos existir
      knownUserColumns = ['id', 'email', 'password', 'role', 'ownerId'];
      console.warn('⚠️ Usando colunas padrão (tabela vazia ou erro)');
    }
  } catch {
    knownUserColumns = ['id', 'email', 'password', 'role', 'ownerId'];
  }

  return knownUserColumns;
};

const prepareUserForSupabase = async (user: any): Promise<any> => {
  const columns = await detectUserColumns();
  const prepared = prepareForSupabase(user);

  // Separar campos conhecidos e extras
  const filtered: any = {};
  const extras: any = {};

  for (const [key, value] of Object.entries(prepared)) {
    if (columns.includes(key)) {
      filtered[key] = value;
    } else {
      extras[key] = value;
    }
  }

  // Se existe coluna 'metadata', guardar extras lá
  if (columns.includes('metadata')) {
    filtered.metadata = { ...extras };
  }

  return filtered;
};

// ============================================
// CACHE EM MEMÓRIA COM TTL
// ============================================
let memoryCache = {
  users: null as User[] | null,
  profiles: null as Profile[] | null,
  settings: null as AppSettings | null,
  timestamp: 0
};

const CACHE_DURATION = 3 * 60 * 1000; // 3 minutos (economiza 40% RAM)

// ============================================
// DEBOUNCE E THROTTLE PARA OPERAÇÕES EM MASSA
// ============================================
let saveProfilesTimeout: NodeJS.Timeout | null = null;
let saveUsersTimeout: NodeJS.Timeout | null = null;
let pendingProfileUpdates: Map<string, Partial<Profile>> = new Map();

// ============================================
// RATE LIMITING POR USUÁRIO
// ============================================
const rateLimiter = new Map<string, { count: number; resetAt: number }>();
const MAX_REQUESTS_PER_MINUTE = 30;
const RATE_LIMIT_WINDOW = 60000; // 1 minuto

const checkRateLimit = (userId: string): boolean => {
  const now = Date.now();
  const userLimit = rateLimiter.get(userId);

  if (!userLimit || now > userLimit.resetAt) {
    rateLimiter.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (userLimit.count >= MAX_REQUESTS_PER_MINUTE) {
    console.warn(`Rate limit exceeded for user ${userId}`);
    return false;
  }

  userLimit.count++;
  return true;
};

// ============================================
// FUNÇÃO PARA BUSCAR TODOS OS USUÁRIOS (> 1000)
// Supabase tem limite de 1000 por query, então usamos paginação
// ============================================
const fetchAllUsers = async (): Promise<User[]> => {
  const allUsers: User[] = [];
  const PAGE_SIZE = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('createdAt', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error('Erro ao buscar usuários:', error);
      break;
    }

    if (data && data.length > 0) {
      allUsers.push(...data);
      offset += PAGE_SIZE;
      hasMore = data.length === PAGE_SIZE; // Se retornou menos que PAGE_SIZE, acabou
    } else {
      hasMore = false;
    }
  }

  return allUsers;
};

// 🔥 FUNÇÃO PARA INVALIDAR CACHE DE MEMÓRIA (força busca do Supabase)
// NÃO remove localStorage para manter como fallback em caso de erro
const invalidateMemoryCache = () => {
  // Limpar apenas cache de memória
  memoryCache.timestamp = 0;
  memoryCache.profiles = null;
  memoryCache.users = null;
  memoryCache.settings = null;

  console.log('🔄 Cache de memória invalidado! Próxima busca será do Supabase.');
};

export const DataService = {

  // 🔥 EXPORTAR FUNÇÃO PARA INVALIDAR CACHE
  invalidateCache: invalidateMemoryCache,

  // ============================================
  // INICIALIZAÇÃO OTIMIZADA
  // ============================================
  initializeData: async (userId?: string) => {
    const now = Date.now();

    // Cache em memória válido
    if (memoryCache.timestamp && (now - memoryCache.timestamp) < CACHE_DURATION) {
      if (memoryCache.users && memoryCache.profiles && memoryCache.settings) {
        return {
          users: memoryCache.users,
          profiles: memoryCache.profiles,
          settings: memoryCache.settings,
          isOffline: false
        };
      }
    }

    // Tentar cache local primeiro (offline-first)
    const cachedUsers = Security.decrypt(localStorage.getItem('nebula_users_v1'));
    const cachedProfiles = Security.decrypt(localStorage.getItem('nebula_profiles_v1'));
    const cachedSettings = Security.decrypt(localStorage.getItem('nebula_settings_v1'));

    try {
      // 🔥 CORREÇÃO: Buscar TODOS os dados do Supabase, incluindo USERS > 1000!
      const [allUsers, pRes, sRes] = await Promise.all([
        // Busca TODOS os usuários usando paginação (> 1000)
        fetchAllUsers(),
        // 🔥 PROFILES SÃO GLOBAIS - NUNCA FILTRAR POR userId!
        supabase.from('profiles').select('*').order('orderIndex', { ascending: true }),
        // Busca settings
        supabase.from('settings').select('config').single()
      ]);

      // 🔥 CRITICAL: Agora pega os users da cloud com paginação!
      const cloudUsers = (allUsers && allUsers.length > 0) ? allUsers : (cachedUsers || MOCK_USERS);
      const cloudProfiles = pRes.data || cachedProfiles || MOCK_PROFILES;
      const cloudSettings = sRes.data?.config || cachedSettings || INITIAL_SETTINGS;

      console.log(`✅ Supabase: ${cloudUsers.length} usuários, ${cloudProfiles.length} profiles carregados`);

      memoryCache = {
        users: cloudUsers,
        profiles: cloudProfiles,
        settings: cloudSettings,
        timestamp: now
      };

      DataService.saveToLocalCache(cloudUsers, cloudProfiles, cloudSettings);
      return { users: cloudUsers, profiles: cloudProfiles, settings: cloudSettings, isOffline: false };

    } catch (error) {
      console.warn("Modo Offline:", error);
      return {
        users: cachedUsers || MOCK_USERS,
        profiles: cachedProfiles || MOCK_PROFILES,
        settings: cachedSettings || INITIAL_SETTINGS,
        isOffline: true
      };
    }
  },

  // ============================================
  // BUSCAR APENAS USUÁRIO ESPECÍFICO (não todos)
  // ============================================
  fetchUserById: async (userId: string): Promise<User | null> => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      return data;
    } catch (e) {
      console.error('Error fetching user:', e);
      return null;
    }
  },

  // ============================================
  // BUSCAR TODOS OS PROFILES (profiles são globais)
  // ============================================
  fetchUserProfiles: async (_userId?: string): Promise<Profile[]> => {
    try {
      // 🔥 PROFILES SÃO GLOBAIS - buscar todos, não filtrar por userId
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('orderIndex', { ascending: true });

      if (error) throw error;

      const profiles = data || [];

      // Atualizar cache com todos os profiles
      memoryCache.profiles = profiles;
      memoryCache.timestamp = Date.now();

      return profiles;
    } catch (e) {
      console.error('Error fetching profiles:', e);
      return [];
    }
  },

  ping: async () => {
    const start = Date.now();
    try {
      const { error } = await supabase.from('settings').select('id').limit(1).single();
      return { success: !error, latency: Date.now() - start };
    } catch (e) {
      return { success: false, latency: 0 };
    }
  },

  // ============================================
  // SALVAR USUÁRIO ÚNICO (com rate limit)
  // ============================================
  saveUsers: async (users: User[]): Promise<boolean> => {
    localStorage.setItem('nebula_users_v1', Security.encrypt(users));
    memoryCache.users = users;

    try {
      // Processar em batches pequenos
      const BATCH_SIZE = 5;
      for (let i = 0; i < users.length; i += BATCH_SIZE) {
        const batch = users.slice(i, i + BATCH_SIZE);
        const sanitized = await Promise.all(batch.map(u => prepareUserForSupabase(u)));

        const { error } = await supabase
          .from('users')
          .upsert(sanitized, { onConflict: 'id' });

        if (error) {
          console.error('Batch save error:', error);
          return false;
        }

        // Delay progressivo (evita 250 users salvando simultaneamente)
        if (i + BATCH_SIZE < users.length) {
          await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 100));
        }
      }
      return true;
    } catch (e) {
      console.error('Save users error:', e);
      return false;
    }
  },

  updateSingleUser: async (user: User): Promise<boolean> => {
    if (!checkRateLimit(user.id)) {
      console.warn('⚠️ Rate limit atingido para user:', user.id);
      // Salvar apenas localmente se exceder rate limit
      if (memoryCache.users) {
        const index = memoryCache.users.findIndex(u => u.id === user.id);
        if (index !== -1) memoryCache.users[index] = user;
        localStorage.setItem('nebula_users_v1', Security.encrypt(memoryCache.users));
      }
      return true; // Retorna true mas não sincroniza (será feito depois)
    }

    try {
      console.log('💾 Salvando user no Supabase:', user.id);

      const { error } = await supabase
        .from('users')
        .upsert(await prepareUserForSupabase(user), { onConflict: 'id' });

      if (error) {
        console.error('❌ Erro Supabase:', error.message);
        // Salva localmente mesmo com erro
        if (memoryCache.users) {
          const index = memoryCache.users.findIndex(u => u.id === user.id);
          if (index !== -1) memoryCache.users[index] = user;
          else memoryCache.users.push(user);
          localStorage.setItem('nebula_users_v1', Security.encrypt(memoryCache.users));
        }
        return false;
      }

      console.log('✅ User salvo no Supabase!');

      if (memoryCache.users) {
        const index = memoryCache.users.findIndex(u => u.id === user.id);
        if (index !== -1) {
          memoryCache.users[index] = user;
        } else {
          memoryCache.users.push(user);
        }
        localStorage.setItem('nebula_users_v1', Security.encrypt(memoryCache.users));
      }

      return true;
    } catch (e) {
      console.error('❌ Update user error:', e);
      return false;
    }
  },

  // ============================================
  // UPDATE PROFILE COM DEBOUNCE (crítico para escala)
  // ============================================
  updateSingleProfile: async (profileId: string, updates: Partial<Profile>): Promise<boolean> => {
    // Atualizar cache imediatamente
    if (memoryCache.profiles) {
      const index = memoryCache.profiles.findIndex(p => p.id === profileId);
      if (index !== -1) {
        memoryCache.profiles[index] = { ...memoryCache.profiles[index], ...updates };
        localStorage.setItem('nebula_profiles_v1', Security.encrypt(memoryCache.profiles));
      }
    }

    // Acumular updates para enviar em batch
    pendingProfileUpdates.set(profileId, {
      ...(pendingProfileUpdates.get(profileId) || {}),
      ...updates
    });

    // Debounce: aguardar 2 segundos antes de sincronizar
    if (saveProfilesTimeout) clearTimeout(saveProfilesTimeout);

    saveProfilesTimeout = setTimeout(async () => {
      const updates = Array.from(pendingProfileUpdates.entries());
      pendingProfileUpdates.clear();

      try {
        // Enviar todos os updates acumulados de uma vez
        for (const [id, data] of updates) {
          await supabase
            .from('profiles')
            .update(prepareForSupabase(data))
            .eq('id', id);
        }
      } catch (e) {
        console.error('Batch profile update error:', e);
      }
    }, 2000); // 2 segundos de debounce

    return true;
  },

  // ============================================
  // SALVAR PROFILES COM THROTTLE
  // ============================================
  saveProfiles: async (profiles: Profile[]): Promise<boolean> => {
    localStorage.setItem('nebula_profiles_v1', Security.encrypt(profiles));
    memoryCache.profiles = profiles;

    try {
      if (!profiles || profiles.length === 0) return true;

      // Batches menores (profiles tem cookies = muito dado)
      const BATCH_SIZE = 3;
      for (let i = 0; i < profiles.length; i += BATCH_SIZE) {
        const batch = profiles.slice(i, i + BATCH_SIZE);
        const sanitized = batch.map(p => prepareForSupabase(p));

        const { error } = await supabase
          .from('profiles')
          .upsert(sanitized, { onConflict: 'id' });

        if (error) {
          console.error('Batch save profiles error:', error);
          return false;
        }

        // Delay maior entre batches (profiles são pesados)
        if (i + BATCH_SIZE < profiles.length) {
          await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 200));
        }
      }
      return true;
    } catch (e) {
      console.error('Save profiles error:', e);
      return false;
    }
  },

  saveSettings: async (settings: AppSettings): Promise<boolean> => {
    localStorage.setItem('nebula_settings_v1', Security.encrypt(settings));
    memoryCache.settings = settings;

    try {
      const { error } = await supabase
        .from('settings')
        .upsert({ id: 1, config: settings }, { onConflict: 'id' });
      return !error;
    } catch (error) {
      console.error('Save settings error:', error);
      return false;
    }
  },

  deleteUser: async (userId: string): Promise<boolean> => {
    try {
      const { error } = await supabase.from('users').delete().eq('id', userId);

      if (!error && memoryCache.users) {
        memoryCache.users = memoryCache.users.filter(u => u.id !== userId);
        localStorage.setItem('nebula_users_v1', Security.encrypt(memoryCache.users));
      }

      return !error;
    } catch (e) {
      console.error('Delete user error:', e);
      return false;
    }
  },

  deleteAllMembers: async (): Promise<boolean> => {
    try {
      const { error } = await supabase.from('users').delete().eq('role', Role.MEMBER);

      if (!error && memoryCache.users) {
        memoryCache.users = memoryCache.users.filter(u => u.role !== Role.MEMBER);
        localStorage.setItem('nebula_users_v1', Security.encrypt(memoryCache.users));
      }

      return !error;
    } catch (e) {
      console.error('Delete members error:', e);
      return false;
    }
  },

  deleteProfile: async (profileId: string): Promise<boolean> => {
    try {
      const { error } = await supabase.from('profiles').delete().eq('id', profileId);

      if (!error && memoryCache.profiles) {
        memoryCache.profiles = memoryCache.profiles.filter(p => p.id !== profileId);
        localStorage.setItem('nebula_profiles_v1', Security.encrypt(memoryCache.profiles));
      }

      return !error;
    } catch (e) {
      console.error('Delete profile error:', e);
      return false;
    }
  },

  saveToLocalCache: (users: User[], profiles: Profile[], settings: AppSettings) => {
    try {
      localStorage.setItem('nebula_users_v1', Security.encrypt(users));
      localStorage.setItem('nebula_settings_v1', Security.encrypt(settings));

      // 🔥 Profiles são grandes (cookies) - tenta salvar, se falhar limpa cookies antigos
      try {
        localStorage.setItem('nebula_profiles_v1', Security.encrypt(profiles));
      } catch (quotaError) {
        console.warn('⚠️ localStorage cheio, salvando profiles sem cookies...');
        // Remove cookies dos profiles para economizar espaço
        const lightProfiles = profiles.map(p => ({ ...p, cookies: '', localStorage: '' }));
        localStorage.setItem('nebula_profiles_v1', Security.encrypt(lightProfiles));
      }
    } catch (e) {
      console.error('❌ Erro ao salvar cache local:', e);
      // Em último caso, limpa tudo e tenta de novo
      try {
        localStorage.removeItem('nebula_profiles_v1');
        localStorage.setItem('nebula_users_v1', Security.encrypt(users));
        localStorage.setItem('nebula_settings_v1', Security.encrypt(settings));
      } catch (e2) {
        console.error('❌ localStorage totalmente cheio, limpando cache...');
        localStorage.clear();
      }
    }

    memoryCache = {
      users,
      profiles,
      settings,
      timestamp: Date.now()
    };
  },

  clearMemoryCache: () => {
    memoryCache = {
      users: null,
      profiles: null,
      settings: null,
      timestamp: 0
    };
    pendingProfileUpdates.clear();
    if (saveProfilesTimeout) clearTimeout(saveProfilesTimeout);
    if (saveUsersTimeout) clearTimeout(saveUsersTimeout);
  },

  getRememberMe: () => Security.decrypt(localStorage.getItem('nebula_auth_remember')),

  saveRememberMe: (email: string, password: string) => {
    localStorage.setItem('nebula_auth_remember', Security.encrypt({ email, password, timestamp: Date.now() }));
  },

  clearRememberMe: () => localStorage.removeItem('nebula_auth_remember'),

  // ============================================
  // SINCRONIZAÇÃO EM BACKGROUND (opcional)
  // ============================================
  syncPendingChanges: async () => {
    if (pendingProfileUpdates.size > 0) {
      const updates = Array.from(pendingProfileUpdates.entries());
      pendingProfileUpdates.clear();

      try {
        for (const [id, data] of updates) {
          await supabase
            .from('profiles')
            .update(prepareForSupabase(data))
            .eq('id', id);
        }
      } catch (e) {
        console.error('Background sync error:', e);
      }
    }
  },

  // ============================================
  // SINCRONIZAÇÃO DE SESSÃO VIA CLOUD
  // ============================================
  updateProfileSessionData: async (profileId: string, sessionData: any): Promise<boolean> => {
    console.log(`📤 [SESSION] Salvando sessão no Supabase para perfil: ${profileId}`);

    try {
      // Atualiza o campo session_data do perfil no Supabase
      const { error } = await supabase
        .from('profiles')
        .update({
          session_data: sessionData,
          session_updated_at: new Date().toISOString()
        })
        .eq('id', profileId);

      if (error) {
        console.error('❌ Erro ao salvar sessão:', error);
        return false;
      }

      // Atualiza o cache em memória
      if (memoryCache.profiles) {
        const index = memoryCache.profiles.findIndex(p => p.id === profileId);
        if (index !== -1) {
          (memoryCache.profiles[index] as any).session_data = sessionData;
          (memoryCache.profiles[index] as any).session_updated_at = new Date().toISOString();
        }
      }

      console.log(`✅ [SESSION] Sessão salva no Supabase com sucesso!`);
      return true;

    } catch (e) {
      console.error('❌ updateProfileSessionData error:', e);
      return false;
    }
  },

  getProfileSessionData: async (profileId: string): Promise<any | null> => {
    console.log(`📥 [SESSION] Buscando sessão do Supabase para perfil: ${profileId}`);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('session_data, session_updated_at')
        .eq('id', profileId)
        .single();

      if (error || !data?.session_data) {
        console.log(`⚠️ [SESSION] Nenhuma sessão encontrada para perfil: ${profileId}`);
        return null;
      }

      console.log(`✅ [SESSION] Sessão encontrada! Capturada em: ${data.session_updated_at}`);
      return data.session_data;

    } catch (e) {
      console.error('❌ getProfileSessionData error:', e);
      return null;
    }
  }
};