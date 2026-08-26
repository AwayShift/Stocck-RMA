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
    // If user not found and it is the master admin or a fresh setup, attempt auto-signup
    if (
      error.message.includes('Invalid login credentials') ||
      error.message.includes('User not found') ||
      error.message.includes('invalid_grant')
    ) {
      // Check if user exists in the custom users table for fallback validation
      const { data: dbUser } = await supabase
        .from('users')
        .select('uid, email, name, role')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (!dbUser && cleanEmail === 'alessandro.away6@gmail.com') {
        // Automatically create master admin account in Supabase
        const signUpRes = await supabase.auth.signUp({
          email: cleanEmail,
          password: password.trim(),
          options: {
            data: {
              name: 'Alessandro (Administrador Master)',
              role: 'admin'
            }
          }
        });

        if (signUpRes.data.user) {
          const profile = await syncUserProfileInDb(signUpRes.data.user, 'Alessandro (Administrador Master)', 'admin');
          return { user: signUpRes.data.user, profile };
        }
      }
    }

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
 * Sign up a new user account in Supabase
 */
export const signUpWithSupabase = async (
  email: string,
  password: string,
  name: string,
  role: 'admin' | 'operator' = 'operator'
): Promise<{ user: User | null; profile: UserAccount }> => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Cliente Supabase não configurado.');
  }

  const cleanEmail = email.trim().toLowerCase();
  const finalRole = cleanEmail === 'alessandro.away6@gmail.com' ? 'admin' : role;

  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail,
    password: password.trim(),
    options: {
      data: {
        name: name.trim() || cleanEmail.split('@')[0],
        role: finalRole
      }
    }
  });

  if (error) {
    throw new Error(translateAuthError(error));
  }

  const user = data.user;
  const uid = user?.id || `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const profileRecord: UserAccount = {
    uid,
    email: cleanEmail,
    name: name.trim() || (user?.user_metadata?.name as string) || cleanEmail.split('@')[0],
    role: finalRole,
    createdAt: new Date().toISOString(),
    lastLogin: new Date().toISOString()
  };

  if (user) {
    setCachedAuthUser({ uid: user.id, email: cleanEmail, name: profileRecord.name });
  }

  // Upsert into users table
  try {
    await supabase.from('users').upsert(mapUserToSupabase(profileRecord));
  } catch (dbErr) {
    console.warn('Warning syncing registered user to users table:', dbErr);
  }

  return { user, profile: profileRecord };
};

/**
 * Sign Out from Supabase Auth
 */
export const signOutSupabase = async (): Promise<void> => {
  setCachedAuthUser(null);
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('Error during Supabase sign out:', err);
    }
  }
  localStorage.removeItem(STORAGE_AUTH_USER_KEY);
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
  fallbackName?: string, 
  forcedRole?: 'admin' | 'operator'
): Promise<UserAccount> => {
  const supabase = getSupabaseClient();
  const isMasterAdmin = user.email === 'alessandro.away6@gmail.com';
  const metadata = user.user_metadata || {};
  const determinedRole = forcedRole || (isMasterAdmin ? 'admin' : (metadata.role || 'operator'));
  const determinedName = fallbackName || metadata.name || user.email?.split('@')[0] || 'Operador Corporativo';

  const defaultProfile: UserAccount = {
    uid: user.id,
    email: user.email || '',
    name: determinedName,
    role: (isMasterAdmin ? 'admin' : determinedRole) as 'admin' | 'operator',
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
      const currentRole = isMasterAdmin ? 'admin' : (existing.role || 'operator');
      const updatedProfile: UserAccount = {
        uid: existing.uid,
        email: existing.email || user.email || '',
        name: existing.name || determinedName,
        role: currentRole as 'admin' | 'operator',
        createdAt: existing.created_at || user.created_at || '',
        lastLogin: new Date().toISOString()
      };

      await supabase.from('users').update({
        last_login: new Date().toISOString(),
        role: currentRole,
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
 * Subscribe to Supabase Auth State Changes
 */
export const subscribeToSupabaseAuth = (
  onUserChanged: (user: User | null, profile: UserAccount | null) => void
) => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    onUserChanged(null, null);
    return () => {};
  }

  let lastEmittedUserId: string | null = null;
  let cachedProfile: UserAccount | null = null;

  const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
    const currentUser = session?.user || null;

    if (currentUser) {
      setCachedAuthUser({
        uid: currentUser.id,
        email: currentUser.email || '',
        name: (currentUser.user_metadata?.name as string) || currentUser.email?.split('@')[0] || 'Operador'
      });

      // If same user and token was just refreshed upon switching back to tab, do not re-sync or re-emit
      if (lastEmittedUserId === currentUser.id && cachedProfile && (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED')) {
        return;
      }

      // Only perform database sync on initial sign in or actual user change
      if (lastEmittedUserId !== currentUser.id || !cachedProfile) {
        cachedProfile = await syncUserProfileInDb(currentUser);
        lastEmittedUserId = currentUser.id;
      }

      if (cachedProfile) {
        setCachedAuthUser({
          uid: currentUser.id,
          email: currentUser.email || '',
          name: cachedProfile.name
        });
      }

      onUserChanged(currentUser, cachedProfile);
    } else {
      setCachedAuthUser(null);
      lastEmittedUserId = null;
      cachedProfile = null;
      onUserChanged(null, null);
    }
  });

  return () => {
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
