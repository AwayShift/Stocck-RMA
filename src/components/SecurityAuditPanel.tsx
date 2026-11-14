/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ChevronLeft, ChevronRight, ShieldCheck, AlertTriangle, Loader2 } from 'lucide-react';
import { fetchAuditLogsPage, AuditLogRecord, AuditLogCategory } from '../lib/dbService';

const PAGE_SIZE = 25;

const CATEGORIES: { id: AuditLogCategory; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'users', label: 'Usuários e papéis' },
  { id: 'backups', label: 'Backups' },
  { id: 'resets', label: 'Limpezas totais' }
];

const ACTION_LABELS: Record<string, { label: string; tone: 'sky' | 'amber' | 'rose' | 'purple' }> = {
  UPDATE_USER_ROLE: { label: 'Papel de usuário alterado', tone: 'purple' },
  USER_ROLE_CHANGED: { label: 'Papel de usuário alterado', tone: 'purple' },
  USER_CREATED: { label: 'Perfil de usuário criado', tone: 'sky' },
  DELETE_USER: { label: 'Usuário removido', tone: 'rose' },
  USER_DELETED: { label: 'Usuário removido', tone: 'rose' },
  BACKUP_RESTORED: { label: 'Backup restaurado', tone: 'amber' },
  BACKUP_EXPORT_FILE: { label: 'Backup exportado', tone: 'sky' },
  BACKUP_DELETE: { label: 'Backup apagado', tone: 'rose' },
  BACKUP_DELETE_BULK: { label: 'Backups apagados em lote', tone: 'rose' },
  BACKUP_CLEANUP: { label: 'Limpeza rápida de backups', tone: 'rose' },
  BACKUP_PURGE_ORPHANS: { label: 'Fragmentos de backup removidos', tone: 'amber' },
  RESET_CATALOG: { label: 'Limpeza total do catálogo', tone: 'rose' },
  RESET_STOCK: { label: 'Limpeza total do estoque', tone: 'rose' },
  RESET_INFLOWS: { label: 'Limpeza total do fluxo diário', tone: 'rose' },
  RESET_DATABASE: { label: 'Limpeza total do banco', tone: 'rose' }
};

const TONE_CLASSES: Record<'sky' | 'amber' | 'rose' | 'purple', string> = {
  sky: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  rose: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  purple: 'bg-purple-500/15 text-purple-300 border-purple-500/30'
};

const formatTimestamp = (iso: string): string => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
};

export default function SecurityAuditPanel() {
  const [category, setCategory] = useState<AuditLogCategory>('all');
  const [page, setPage] = useState<number>(0);
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async (targetPage: number, targetCategory: AuditLogCategory) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const result = await fetchAuditLogsPage(targetPage, PAGE_SIZE, targetCategory);
      setLogs(result.logs);
      setTotal(result.total);
    } catch (err: any) {
      setLogs([]);
      setTotal(0);
      setErrorMessage(err?.message || 'Não foi possível carregar os registros.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load(page, category);
  }, [page, category, load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-3 animate-in fade-in duration-150" id="security-audit-panel">
      <div className="flex items-start gap-2 p-3 rounded-xl border border-slate-800 bg-slate-950/80">
        <ShieldCheck className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
        <p className="text-[11px] leading-relaxed text-slate-400">
          Registro de ações sensíveis (usuários, backups e limpezas totais). Somente leitura: os registros não
          podem ser editados nem apagados. A lista não se atualiza sozinha; use <strong className="text-slate-300">Atualizar</strong>.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="select-audit-category" className="sr-only">Filtrar por tipo</label>
        <select
          id="select-audit-category"
          value={category}
          onChange={(e) => {
            setPage(0);
            setCategory(e.target.value as AuditLogCategory);
          }}
          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-950 border border-slate-700 text-slate-200 cursor-pointer focus:outline-none focus:border-sky-500"
        >
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
        <button
          type="button"
          id="btn-audit-refresh"
          onClick={() => load(page, category)}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Atualizar</span>
        </button>
        <span className="ml-auto text-[11px] text-slate-500">
          {total} {total === 1 ? 'registro' : 'registros'}
        </span>
      </div>

      {errorMessage && (
        <div className="flex items-start gap-2 p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-300" id="audit-error">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Não foi possível carregar os registros: {errorMessage}</span>
        </div>
      )}

      {isLoading && logs.length === 0 && !errorMessage && (
        <div className="flex items-center justify-center gap-2 py-8 text-xs text-slate-400" id="audit-loading">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Carregando registros...</span>
        </div>
      )}

      {!isLoading && !errorMessage && logs.length === 0 && (
        <div className="py-8 text-center text-xs text-slate-500 rounded-xl border border-dashed border-slate-800" id="audit-empty">
          Nenhuma ação sensível registrada ainda.
        </div>
      )}

      {logs.length > 0 && (
        <ul className="space-y-1.5" id="audit-log-list">
          {logs.map((log) => {
            const meta = ACTION_LABELS[log.action] || { label: log.action, tone: 'sky' as const };
            const viaSql = (log.details || '').includes('via SQL/painel');
            return (
              <li key={log.id} className="p-2.5 rounded-lg border border-slate-800 bg-slate-950/70 space-y-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${TONE_CLASSES[meta.tone]}`}>
                    {meta.label}
                  </span>
                  {viaSql && (
                    <span className="px-1.5 py-0.5 rounded border text-[10px] font-bold bg-amber-500/15 text-amber-300 border-amber-500/30">
                      via SQL/painel
                    </span>
                  )}
                  <span className="ml-auto text-[11px] font-mono text-slate-400">{formatTimestamp(log.timestamp)}</span>
                </div>
                <div className="text-[11px] text-slate-400">
                  Por: <span className="font-mono text-slate-200">{log.userEmail || 'sem usuário (banco/SQL)'}</span>
                </div>
                {log.details && (
                  <p className="text-[11px] leading-relaxed text-slate-300 break-words">{log.details}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            id="btn-audit-prev"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || isLoading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Anterior</span>
          </button>
          <span className="text-[11px] text-slate-400">Página {page + 1} de {totalPages}</span>
          <button
            type="button"
            id="btn-audit-next"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1 || isLoading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span>Próxima</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
