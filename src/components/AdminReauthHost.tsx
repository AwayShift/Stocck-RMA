/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Modal global que pede a senha do administrador antes de ações destrutivas de backup.
 * Montado uma única vez no App; é acionado por `ensureAdminReauthenticated` (src/lib/adminReauth.ts).
 */

import React, { useEffect, useRef, useState } from 'react';
import { ShieldAlert, Lock, Loader2, X } from 'lucide-react';
import {
  ADMIN_REAUTH_EVENT,
  AdminReauthRequestDetail,
  registerAdminReauthHost,
  verifyAdminPassword
} from '../lib/adminReauth';

export default function AdminReauthHost() {
  const [request, setRequest] = useState<AdminReauthRequestDetail | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const requestRef = useRef<AdminReauthRequestDetail | null>(null);

  useEffect(() => {
    const unregister = registerAdminReauthHost();
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<AdminReauthRequestDetail>).detail;
      // Se já existir um pedido aberto, recusa o anterior para não deixar promessas penduradas
      requestRef.current?.reject(new Error('Ação cancelada.'));
      requestRef.current = detail;
      setRequest(detail);
      setPassword('');
      setError('');
    };
    window.addEventListener(ADMIN_REAUTH_EVENT, handler);
    return () => {
      window.removeEventListener(ADMIN_REAUTH_EVENT, handler);
      unregister();
    };
  }, []);

  const closeWith = (finish: (r: AdminReauthRequestDetail) => void) => {
    const current = requestRef.current;
    requestRef.current = null;
    setRequest(null);
    setPassword('');
    setError('');
    if (current) finish(current);
  };

  const handleCancel = () => {
    if (isVerifying) return;
    closeWith((r) => r.reject(new Error('Ação cancelada pelo administrador.')));
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || isVerifying) return;
    setIsVerifying(true);
    setError('');
    try {
      await verifyAdminPassword(password);
      closeWith((r) => r.resolve());
    } catch (err: any) {
      setError(err?.message || 'Senha incorreta. Ação não autorizada.');
    } finally {
      setIsVerifying(false);
    }
  };

  if (!request) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70"
      id="admin-reauth-modal-overlay"
    >
      <form
        onSubmit={handleConfirm}
        className="w-full max-w-md bg-slate-900 border border-rose-500/40 rounded-2xl shadow-2xl p-6 space-y-4"
        id="admin-reauth-modal"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-500/10 text-rose-400 rounded-xl border border-rose-500/30">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Confirme sua senha de administrador</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Ação sensível: <strong className="text-slate-200">{request.actionLabel}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
            title="Cancelar"
            id="btn-admin-reauth-close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Senha da sua conta</label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Digite sua senha"
              className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
              id="input-admin-reauth-password"
              autoComplete="current-password"
            />
          </div>
          {error && (
            <p className="text-xs font-semibold text-rose-400" id="admin-reauth-error">{error}</p>
          )}
        </div>

        <div className="flex gap-2.5 pt-1">
          <button
            type="button"
            onClick={handleCancel}
            disabled={isVerifying}
            className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs transition-all cursor-pointer disabled:opacity-50"
            id="btn-admin-reauth-cancel"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!password.trim() || isVerifying}
            className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            id="btn-admin-reauth-confirm"
          >
            {isVerifying ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            <span>{isVerifying ? 'Verificando...' : 'Confirmar'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
