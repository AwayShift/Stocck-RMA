/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { User } from '@supabase/supabase-js';
import { getSupabaseClient, mapSupabaseToUser, mapUserToSupabase } from './supabase';
import { UserAccount } from '../types';

export interface AuthSessionUser {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'operator';
}

const STORAGE_AUTH_USER_KEY = 'stocckrma_supabase_current_user';

let cachedCurrentSupabaseUser: { uid: string; email: string; name: string } | null = null;

export const setCachedAuthUser = (user: { uid: string; email: string; name?: string } | null) => {
  if (user) {
    cachedCurrentSupabaseUser = {
      uid: user.uid,
      email: user.email,
      name: user.name || user.email.split('@')[0]
    };
  } else {
    cachedCurrentSupabaseUser = null;
  }
};

export const getCachedAuthUser = (): { uid: string; email: string; name: string } | null => {
  return cachedCurrentSupabaseUser;
};

export const getCurrentActiveAuthUser = async (): Promise<{ uid: string; email: string; name: string } | null> => {
  if (cachedCurrentSupabaseUser) {
    return cachedCurrentSupabaseUser;
  }
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const u = session.user;
        const res = {
          uid: u.id,
          email: u.email || (u.user_metadata?.email as string) || '',
          name: (u.user_metadata?.name as string) || u.email?.split('@')[0] || 'Operador'
        };
        cachedCurrentSupabaseUser = res;
        return res;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const res = {
          uid: user.id,
          email: user.email || (user.user_metadata?.email as string) || '',
          name: (user.user_metadata?.name as string) || user.email?.split('@')[0] || 'Operador'
        };
        cachedCurrentSupabaseUser = res;
        return res;
      }
    } catch (e) {
      console.warn('Error retrieving active Supabase user session:', e);
    }
  }
  return null;
};

/**
 * Get active session / user from Supabase client or local storage cache
 */
export const getActiveSupabaseUser = async (): Promise<User | null> => {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      return session.user;
    }
    const { data: { user } } = await supabase.auth.getUser();
    return user || null;
  } catch (err) {
    console.error('Error fetching Supabase user session:', err);
    return null;
  }
};

/**
 * Sign in using Supabase Auth (Email and Password)
 */
export const signInWithSupabase = async (
  email: string, 
  password: string
): Promise<{ user: User; profile: UserAccount }> => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Cliente Supabase não configurado. Verifique as credenciais do banco nas configurações.');
  }

  const cleanEmail = email.trim().toLowerCase();

  // 1. Authenticate with Supabase Auth
  const { data, error } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password: password.trim()
  });

  if (error) {
    // Contas só são criadas por um administrador no painel do Supabase (sem cadastro público).
    throw new Error(translateAuthError(error));
  }

  if (!data.user) {
    throw new Error('Falha ao obter dados do usuário autenticado.');
  }

  // 2. Synchronize user profile in `users` table
  const profile = await syncUserProfileInDb(data.user);
  setCachedAuthUser({ uid: data.user.id, email: data.user.email || cleanEmail, name: profile.name });
  return { user: data.user, profile };
};

/**
 * Sign Out from Supabase Auth
 */
export const signOutSupabase = async (): Promise<void> => {
  setCachedAuthUser(null);
  if (typeof window !== 'undefined') {
    localStorage.removeItem('stocckrma_guest_mode');
    localStorage.removeItem(STORAGE_AUTH_USER_KEY);
  }
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('Error during Supabase sign out:', err);
    }
  }
};

/**
 * Re-authenticate user by verifying password (used for dangerous operations like Database Reset)
 */
export const reauthenticateSupabaseUser = async (password: string): Promise<boolean> => {
  const supabase = getSupabaseClient();
  if (!supabase) return false;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) {
    throw new Error('Nenhum usuário ativo para reautenticação.');
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: password.trim()
  });

  if (error || !data.user) {
    throw new Error('Senha incorreta. Ação não autorizada.');
  }

  return true;
};

/**
 * Sync / Ensure user profile in `users` table and return up-to-date UserAccount
 */
export const syncUserProfileInDb = async (
  user: User, 
  fallbackName?: string
): Promise<UserAccount> => {
  const supabase = getSupabaseClient();
  const metadata = user.user_metadata || {};
  // O papel NUNCA vem de user_metadata (editável pelo próprio usuário) nem de e-mail fixo no código.
  // Padrão seguro: viewer. O papel real é lido de public.users (alterado só por um admin).
  const determinedRole: UserAccount['role'] = 'viewer';
  const determinedName = fallbackName || metadata.name || user.email?.split('@')[0] || 'Operador Corporativo';

  const defaultProfile: UserAccount = {
    uid: user.id,
    email: user.email || '',
    name: determinedName,
    role: determinedRole,
    createdAt: user.created_at || new Date().toISOString(),
    lastLogin: new Date().toISOString()
  };

  if (!supabase) {
    return defaultProfile;
  }

  try {
    const { data: existing, error } = await supabase
      .from('users')
      .select('uid, email, name, role, created_at, last_login')
      .eq('uid', user.id)
      .maybeSingle();

    if (error || !existing) {
      // Create new profile record
      await supabase.from('users').upsert(mapUserToSupabase(defaultProfile));
      return defaultProfile;
    } else {
      // Update last login
      const currentRole = existing.role || 'viewer';
      const updatedProfile: UserAccount = {
        uid: existing.uid,
        email: existing.email || user.email || '',
        name: existing.name || determinedName,
        role: currentRole as UserAccount['role'],
        createdAt: existing.created_at || user.created_at || '',
        lastLogin: new Date().toISOString()
      };

      // O papel não é gravado pelo cliente: só um admin altera users.role (RLS).
      await supabase.from('users').update({
        last_login: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).eq('uid', user.id);

      return updatedProfile;
    }
  } catch (err) {
    console.error('Error synchronizing Supabase user profile in db:', err);
    return defaultProfile;
  }
};

/**
 * Subscribe to Supabase Auth State Changes with instant recovery and timeout safeguards
 */
export const subscribeToSupabaseAuth = (
  onUserChanged: (user: User | null, profile: UserAccount | null) => void
) => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    onUserChanged(null, null);
    return () => {};
  }

  let hasEmittedInitialState = false;
  let lastEmittedUserId: string | null = null;
  let cachedProfile: UserAccount | null = null;
  let resolving: Promise<void> | null = null;

  // Perfil provisório (somente leitura). Só é usado se o banco demorar demais ou falhar.
  const fallbackProfileFor = (u: User): UserAccount => ({
    uid: u.id,
    email: u.email || '',
    name: (u.user_metadata?.name as string) || u.email?.split('@')[0] || 'Operador',
    role: 'viewer',
    createdAt: u.created_at || new Date().toISOString()
  });

  // Só avisa o app depois de ler o papel REAL no banco (evita a tela "Somente leitura" piscar
  // para quem é operator/admin). Se o banco demorar mais de 4s, usa o perfil provisório e
  // atualiza assim que o banco responder.
  const emitResolvedUser = (u: User): Promise<void> => {
    if (lastEmittedUserId === u.id && cachedProfile) return Promise.resolve();
    if (resolving) return resolving;

    const fallback = fallbackProfileFor(u);
    setCachedAuthUser({ uid: u.id, email: u.email || '', name: fallback.name });

    resolving = (async () => {
      const syncPromise = syncUserProfileInDb(u).catch(() => null);
      const dbProfile = await Promise.race([
        syncPromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000))
      ]);

      const profile = dbProfile || fallback;
      cachedProfile = profile;
      lastEmittedUserId = u.id;
      hasEmittedInitialState = true;
      setCachedAuthUser({ uid: u.id, email: u.email || '', name: profile.name });
      onUserChanged(u, profile);

      if (!dbProfile) {
        syncPromise.then((late) => {
          if (late && lastEmittedUserId === u.id) {
            cachedProfile = late;
            setCachedAuthUser({ uid: u.id, email: u.email || '', name: late.name });
            onUserChanged(u, late);
          }
        });
      }
    })().finally(() => {
      resolving = null;
    });

    return resolving;
  };

  // 1. Fallback timer: se o Supabase nem responder a sessão, libera a tela de login em 2.5s
  const authTimeout = setTimeout(() => {
    if (!hasEmittedInitialState) {
      hasEmittedInitialState = true;
      onUserChanged(null, null);
    }
  }, 2500);

  // 2. Sondagem direta da sessão
  supabase.auth.getSession().then(async ({ data: { session } }) => {
    if (hasEmittedInitialState) return;
    clearTimeout(authTimeout);

    if (session?.user) {
      await emitResolvedUser(session.user);
    } else {
      hasEmittedInitialState = true;
      onUserChanged(null, null);
    }
  }).catch(() => {
    if (!hasEmittedInitialState) {
      hasEmittedInitialState = true;
      clearTimeout(authTimeout);
      onUserChanged(null, null);
    }
  });

  // 3. Listener para transições posteriores (login, logout, renovação de token)
  const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
    clearTimeout(authTimeout);
    const currentUser = session?.user || null;

    if (currentUser) {
      if (lastEmittedUserId !== currentUser.id || !cachedProfile) {
        await emitResolvedUser(currentUser);
        return;
      }

      // Renovação de token com perfil já carregado: não precisa consultar de novo
      if (event === 'TOKEN_REFRESHED') {
        return;
      }

      // Atualiza o perfil em segundo plano, sem bloquear a interface
      try {
        const dbProfile = await syncUserProfileInDb(currentUser);
        if (dbProfile) {
          cachedProfile = dbProfile;
          setCachedAuthUser({
            uid: currentUser.id,
            email: currentUser.email || '',
            name: dbProfile.name
          });
          onUserChanged(currentUser, dbProfile);
        }
      } catch (err) {
        console.warn('Background user profile sync note:', err);
      }
    } else {
      hasEmittedInitialState = true;
      setCachedAuthUser(null);
      lastEmittedUserId = null;
      cachedProfile = null;
      onUserChanged(null, null);
    }
  });

  return () => {
    clearTimeout(authTimeout);
    subscription.unsubscribe();
  };
};

/**
 * Friendly Error Messages in Portuguese
 */
function translateAuthError(error: any): string {
  const msg = error?.message || '';
  if (msg.includes('Invalid login credentials') || msg.includes('invalid_grant')) {
    return 'Usuário ou senha incorretos.';
  }
  if (msg.includes('Email not confirmed')) {
    return 'E-mail ainda não confirmado no Supabase. Verifique sua caixa de entrada ou desative "Confirm Email" no painel Supabase Auth.';
  }
  if (msg.includes('User already registered')) {
    return 'Este e-mail já possui cadastro no sistema.';
  }
  if (msg.includes('Password should be at least 6 characters')) {
    return 'A senha deve conter no mínimo 6 caracteres.';
  }
  if (msg.includes('Invalid email') || msg.includes('email format')) {
    return 'Formato de e-mail inválido.';
  }
  if (msg.includes('Database error') || msg.includes('connection refused')) {
    return 'Erro de conexão com o banco de dados Supabase.';
  }
  return msg || 'Falha na autenticação. Verifique suas credenciais.';
}
