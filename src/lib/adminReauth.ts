/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Reautenticação de administrador para ações destrutivas (restaurar, importar e apagar backups).
 *
 * Fluxo: o serviço chama `ensureAdminReauthenticated(...)`, que
 *   1. confirma no BANCO (public.users) que o usuário logado é admin;
 *   2. abre o modal global de senha (<AdminReauthHost />) e valida a senha no Supabase Auth.
 * Uma confirmação vale por 2 minutos, para não pedir a senha várias vezes numa mesma operação.
 * Importante: isto é uma camada de proteção de UX; a barreira real continua sendo o RLS no banco.
 */

import { getSupabaseClient } from './supabase';
import { reauthenticateSupabaseUser } from './supabaseAuth';

export const ADMIN_REAUTH_EVENT = 'stocck-admin-reauth-request';

export interface AdminReauthRequestDetail {
  actionLabel: string;
  resolve: () => void;
  reject: (error: Error) => void;
}

const REAUTH_VALID_MS = 2 * 60 * 1000;
let lastReauthAt = 0;
let hostCount = 0;

/** Chamado pelo <AdminReauthHost /> ao montar/desmontar. */
export const registerAdminReauthHost = (): (() => void) => {
  hostCount += 1;
  return () => {
    hostCount = Math.max(0, hostCount - 1);
  };
};

export const verifyAdminPassword = async (password: string): Promise<void> => {
  await reauthenticateSupabaseUser(password);
  lastReauthAt = Date.now();
};

const assertCurrentUserIsAdmin = async (actionLabel: string): Promise<void> => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase não conectado.');
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Sessão expirada. Entre novamente para continuar.');
  }
  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('uid', user.id)
    .maybeSingle();

  if (error || data?.role !== 'admin') {
    throw new Error(`Somente administradores podem ${actionLabel}.`);
  }
};

/**
 * Garante que o usuário é admin (no banco) e que acabou de confirmar a senha.
 * Lança erro se não for admin ou se o usuário cancelar.
 */
export const ensureAdminReauthenticated = async (actionLabel: string): Promise<void> => {
  await assertCurrentUserIsAdmin(actionLabel);

  if (Date.now() - lastReauthAt < REAUTH_VALID_MS) {
    return;
  }

  if (typeof window === 'undefined' || hostCount === 0) {
    throw new Error('Não foi possível pedir a confirmação de senha. Recarregue a página e tente novamente.');
  }

  await new Promise<void>((resolve, reject) => {
    window.dispatchEvent(
      new CustomEvent<AdminReauthRequestDetail>(ADMIN_REAUTH_EVENT, {
        detail: { actionLabel, resolve, reject }
      })
    );
  });
};
