/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState } from 'react';
import { 
  ShieldAlert, 
  Lock, 
  Eye, 
  EyeOff, 
  AlertTriangle, 
  RefreshCw, 
  X, 
  CheckCircle2, 
  Trash2,
  Database,
  Package,
  FolderMinus,
  Boxes,
  Activity
} from 'lucide-react';
import { reauthenticateSupabaseUser } from '../lib/supabaseAuth';
import { 
  resetDatabaseToDefaults,
  resetCatalogProducts,
  resetPhysicalStockUnits,
  resetDailyInflowsRecords,
  resetAuditLogsRecords
} from '../lib/dbService';

export type ResetTargetType = 'all' | 'catalog' | 'stock' | 'inflows' | 'logs';

interface ResetDatabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
  userRole: 'admin' | 'operator' | null;
  onSuccess: () => void;
  target?: ResetTargetType;
  itemCount?: number;
}

export default function ResetDatabaseModal({
  isOpen,
  onClose,
  userEmail,
  userRole,
  onSuccess,
  target = 'all',
  itemCount
}: ResetDatabaseModalProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  if (!isOpen) return null;

  const getTargetDetails = () => {
    switch (target) {
      case 'catalog':
        return {
          title: 'Resetar Catálogo de Base',
          subtitle: 'Exclusão permanente de todos os produtos do catálogo base',
          icon: <Package className="w-5 h-5 text-amber-400" />,
          badgeColor: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
          whatWillHappen: [
            `Todos os ${itemCount !== undefined ? itemCount : ''} produtos cadastrados no Catálogo Base serão apagados permanentemente.`,
            'Os registros de Estoque Físico, Fluxo de Entradas e Logs serão mantidos intactos.',
            'O catálogo ficará com 0 produtos cadastrados, pronto para novas inserções ou importações de planilha.'
          ],
          buttonLabel: 'Confirmar Reset do Catálogo',
          successText: 'Catálogo de Base resetado com sucesso!'
        };
      case 'stock':
        return {
          title: 'Resetar Estoque Físico & Triagem',
          subtitle: 'Exclusão permanente de todas as unidades de estoque e triagens',
          icon: <FolderMinus className="w-5 h-5 text-sky-400" />,
          badgeColor: 'bg-sky-500/10 text-sky-400 border border-sky-500/20',
          whatWillHappen: [
            `Todas as ${itemCount !== undefined ? itemCount : ''} unidades físicas em triagem, estoque e devoluções serão apagadas permanentemente.`,
            'O Catálogo Base, Fluxo de Entradas e Logs de Auditoria permanecerão salvos.',
            'O estoque físico ficará zerado (0 itens).'
          ],
          buttonLabel: 'Confirmar Reset do Estoque',
          successText: 'Estoque Físico e Triagens resetados com sucesso!'
        };
      case 'inflows':
        return {
          title: 'Resetar Fluxo de Entradas',
          subtitle: 'Exclusão permanente de todos os lançamentos diários por setor',
          icon: <Boxes className="w-5 h-5 text-indigo-400" />,
          badgeColor: 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20',
          whatWillHappen: [
            `Todos os ${itemCount !== undefined ? itemCount : ''} lançamentos diários de entrada consolidada por setor serão excluídos.`,
            'O Catálogo de Base, Estoque Físico e Logs de Auditoria serão mantidos.',
            'O gráfico e tabela do Fluxo de Entradas ficarão zerados.'
          ],
          buttonLabel: 'Confirmar Reset de Entradas',
          successText: 'Fluxo Diário de Entradas resetado com sucesso!'
        };
      case 'logs':
        return {
          title: 'Limpar Histórico de Logs',
          subtitle: 'Exclusão de todos os registros de rastreabilidade e auditoria',
          icon: <Activity className="w-5 h-5 text-rose-400" />,
          badgeColor: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
          whatWillHappen: [
            `Todos os ${itemCount !== undefined ? itemCount : ''} logs de auditoria e ações anteriores serão apagados do Firestore.`,
            'Os dados operacionais de Catálogo, Estoque e Entradas permanecerão inalterados.',
            'Um novo log inicial será registrado comprovando a limpeza de auditoria.'
          ],
          buttonLabel: 'Confirmar Limpeza de Logs',
          successText: 'Histórico de Logs de Auditoria limpo com sucesso!'
        };
      case 'all':
      default:
        return {
          title: 'Resetar Banco de Dados Geral',
          subtitle: 'Ação Crítica e Irreversível em Todos os Módulos',
          icon: <ShieldAlert className="w-5 h-5 text-rose-400" />,
          badgeColor: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
          whatWillHappen: [
            'Todos os Produtos cadastrados no Catálogo Base (0 produtos restantes).',
            'Todas as Unidades Físicas do Estoque e Triagem de RMA.',
            'Todos os lançamentos do Fluxo Diário de Entradas.',
            'Todos os Logs de auditoria e eventos do sistema.'
          ],
          buttonLabel: 'Confirmar Reset Geral do Banco',
          successText: 'Banco de dados 100% limpo com sucesso! 0 registros restantes.'
        };
    }
  };

  const details = getTargetDetails();

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!password.trim()) {
      setErrorMessage('Por favor, digite a sua senha de usuário para autorizar o reset.');
      return;
    }

    if (!userEmail) {
      setErrorMessage('Nenhum usuário ativo autenticado. Faça login novamente.');
      return;
    }

    setIsLoading(true);

    try {
      // 1. Reauthenticate user with provided password in Supabase
      await reauthenticateSupabaseUser(password);

      // 2. Perform the targeted reset
      if (target === 'catalog') {
        await resetCatalogProducts();
      } else if (target === 'stock') {
        await resetPhysicalStockUnits();
      } else if (target === 'inflows') {
        await resetDailyInflowsRecords();
      } else if (target === 'logs') {
        await resetAuditLogsRecords();
      } else {
        await resetDatabaseToDefaults();
      }

      setSuccessMessage(details.successText);
      setIsLoading(false);

      setTimeout(() => {
        setPassword('');
        setSuccessMessage('');
        setErrorMessage('');
        onSuccess();
        onClose();
      }, 1500);

    } catch (err: any) {
      console.error('Reset Error:', err);
      setIsLoading(false);
      setErrorMessage(err?.message || 'Senha incorreta ou falha na autorização.');
    }
  };

  return (
    <div className="fixed inset-0 z-[150] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" id="reset-database-modal">
      <div className="w-full max-w-lg bg-slate-900 border border-rose-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950/80 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${details.badgeColor}`}>
              {details.icon}
            </div>
            <div>
              <h3 className="text-base font-bold text-white">{details.title}</h3>
              <p className="text-xs text-rose-300/80 font-medium">{details.subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            disabled={isLoading}
            onClick={() => {
              setPassword('');
              setErrorMessage('');
              setSuccessMessage('');
              onClose();
            }}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content & Form */}
        <form onSubmit={handleReset} className="p-6 space-y-5">
          
          {/* Warning Banner */}
          <div className="p-4 bg-rose-950/40 border border-rose-500/30 rounded-xl space-y-2">
            <div className="flex items-center gap-2 text-rose-400 font-bold text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>O que será apagado e limpo:</span>
            </div>
            <ul className="text-xs text-slate-300 space-y-1.5 pl-6 list-disc">
              {details.whatWillHappen.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
            <p className="text-[11px] text-emerald-300/90 font-semibold pt-1">
              ✓ Nenhum dado fictício ou de teste será reinserido.
            </p>
          </div>

          {/* User Account Info & Role check */}
          <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-400">
                <Lock className="w-3.5 h-3.5 text-sky-400" />
                <span>Conta Autenticada:</span>
              </div>
              <span className="font-semibold text-slate-200 font-mono">{userEmail || 'Usuário Atual'}</span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
              <span className="text-slate-400">Privilégio Atual:</span>
              <span className={`font-bold px-2 py-0.5 rounded text-[11px] ${userRole === 'admin' ? 'bg-rose-500/10 text-rose-300 border border-rose-500/20' : 'bg-slate-800 text-slate-300'}`}>
                {userRole === 'admin' ? 'Administrador' : 'Logística (Operador)'}
              </span>
            </div>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-2.5 text-xs text-rose-300 animate-in fade-in">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">{errorMessage}</div>
            </div>
          )}

          {/* Success Message */}
          {successMessage && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-2.5 text-xs text-emerald-300 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="flex-1 font-bold">{successMessage}</div>
            </div>
          )}

          {/* Password Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
              Digite a sua Senha para Confirmar <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Sua senha de login"
                disabled={isLoading}
                autoFocus
                className="w-full pl-3.5 pr-10 py-2.5 bg-slate-950 border border-slate-800 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 rounded-xl text-sm text-slate-200 focus:outline-none transition-all placeholder:text-slate-600 disabled:opacity-50"
                id="input-confirm-reset-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                className="absolute right-3 top-3 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              Esta confirmação protege o sistema contra exclusões acidentais.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => {
                setPassword('');
                setErrorMessage('');
                setSuccessMessage('');
                onClose();
              }}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
            
            <button
              type="submit"
              disabled={isLoading || !password.trim()}
              className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-rose-950/50 disabled:opacity-50 disabled:cursor-not-allowed"
              id="btn-confirm-reset-db-submit"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  <span>Validando e Executando...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 text-white" />
                  <span>{details.buttonLabel}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
