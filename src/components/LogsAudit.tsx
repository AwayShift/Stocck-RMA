/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState, useEffect } from 'react';
import { 
  Terminal, 
  ShieldAlert, 
  ShieldCheck, 
  Activity, 
  Search, 
  Clock, 
  User, 
  Filter, 
  Database,
  Lock,
  RefreshCw
} from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { subscribeAuditLogs, createAuditLog } from '../lib/dbService';

interface LogsAuditProps {
  userRole: 'admin' | 'operator' | null;
}

export default function LogsAudit({ userRole }: LogsAuditProps) {
  const [logs, setLogs] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const unsubscribe = subscribeAuditLogs((fetchedLogs) => {
      setLogs(fetchedLogs);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      (log.userEmail && log.userEmail.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (log.details && log.details.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (log.action && log.action.toLowerCase().includes(searchTerm.toLowerCase()));
      
    const matchesFilter = actionFilter === 'ALL' || log.action === actionFilter;
    
    let matchesDate = true;
    if (log.timestamp) {
      const logDate = new Date(log.timestamp);
      
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        if (logDate < start) matchesDate = false;
      }
      
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (logDate > end) matchesDate = false;
      }
    } else if (startDate || endDate) {
      matchesDate = false;
    }
    
    return matchesSearch && matchesFilter && matchesDate;
  });

  const getActionBadgeColor = (action: string) => {
    switch (action) {
      case 'CREATE_PRODUCT':
      case 'CREATE_TRIAGE':
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      case 'UPDATE_PRODUCT':
      case 'UPDATE_TRIAGE':
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
      case 'DELETE_PRODUCT':
      case 'DELETE_TRIAGE':
        return 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
      case 'CHECKOUT_TRIAGE':
        return 'bg-sky-500/10 text-sky-400 border border-sky-500/20';
      case 'RESET_DATABASE':
        return 'bg-purple-500/10 text-purple-400 border border-purple-500/20';
      default:
        return 'bg-slate-500/10 text-slate-400 border border-slate-500/20';
    }
  };

  const getActionName = (action: string) => {
    switch (action) {
      case 'CREATE_PRODUCT': return 'CRIAR PRODUTO';
      case 'UPDATE_PRODUCT': return 'EDITAR PRODUTO';
      case 'DELETE_PRODUCT': return 'EXCLUIR PRODUTO';
      case 'CREATE_TRIAGE': return 'CRIAR RMA';
      case 'UPDATE_TRIAGE': return 'EDITAR RMA';
      case 'DELETE_TRIAGE': return 'EXCLUIR RMA';
      case 'CHECKOUT_TRIAGE': return 'BAIXA ESTOQUE';
      case 'RESET_DATABASE': return 'RESET BANCO';
      default: return action;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200" id="logs-audit-container">
      {/* Overview Block */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl" id="logs-header">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <ShieldAlert className="text-rose-500 w-6 h-6 animate-pulse" />
              Painel de Segurança e Rastreabilidade (Logs)
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Auditoria de logs em tempo real para conformidade de segurança corporativa e governança.
            </p>
          </div>
          <div className="flex items-center gap-2.5 bg-slate-950 px-4 py-2 rounded-xl border border-slate-850">
            <User className="w-4 h-4 text-sky-400" />
            <div className="text-xs">
              <span className="text-slate-400 block font-semibold">Seu Nível RBAC:</span>
              <span className={`font-black uppercase tracking-wider ${userRole === 'admin' ? 'text-rose-400' : 'text-sky-400'}`}>
                {userRole === 'admin' ? 'Administrador' : 'Operador'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="logs-grid">
        {/* Real-time Logs Feed (Left 2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-800 bg-slate-900 space-y-4" id="logs-search-bar">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5">
                {/* Search */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <Search className="w-3 h-3 text-slate-400" />
                    Pesquisar
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
                    <input 
                      type="text"
                      placeholder="Pesquisar logs..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-[#0b1321] border border-slate-800 rounded-xl text-xs text-slate-250 placeholder-slate-500 focus:outline-none focus:border-rose-500 transition-colors"
                    />
                  </div>
                </div>

                {/* Action Filter */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <Filter className="w-3 h-3 text-slate-400" />
                    Ação
                  </label>
                  <select
                    value={actionFilter}
                    onChange={(e) => setActionFilter(e.target.value)}
                    className="w-full px-3 py-1.5 bg-[#0b1321] border border-slate-800 rounded-xl text-xs text-slate-300 font-semibold focus:outline-none cursor-pointer focus:border-rose-500 transition-colors"
                  >
                    <option value="ALL">Todas as Ações</option>
                    <option value="CREATE_TRIAGE">Criar RMA</option>
                    <option value="UPDATE_TRIAGE">Editar RMA</option>
                    <option value="DELETE_TRIAGE">Excluir RMA</option>
                    <option value="CREATE_PRODUCT">Criar Produto</option>
                    <option value="UPDATE_PRODUCT">Editar Produto</option>
                    <option value="DELETE_PRODUCT">Excluir Produto</option>
                    <option value="CHECKOUT_TRIAGE">Baixa Estoque</option>
                    <option value="RESET_DATABASE">Reset Banco</option>
                  </select>
                </div>

                {/* Start Date */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-400" />
                    Data Inicial
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-1.5 bg-[#0b1321] border border-slate-800 rounded-xl text-xs text-slate-350 focus:outline-none cursor-pointer focus:border-rose-500 transition-colors"
                  />
                </div>

                {/* End Date */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-400" />
                    Data Final
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-1.5 bg-[#0b1321] border border-slate-800 rounded-xl text-xs text-slate-350 focus:outline-none cursor-pointer focus:border-rose-500 transition-colors"
                  />
                </div>
              </div>

              {/* Status / Clear Filter Line */}
              <div className="flex justify-between items-center text-xs text-slate-400 pt-2 border-t border-slate-850">
                <span>Mostrando <strong>{filteredLogs.length}</strong> de <strong>{logs.length}</strong> logs</span>
                {(searchTerm || actionFilter !== 'ALL' || startDate || endDate) && (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setActionFilter('ALL');
                      setStartDate('');
                      setEndDate('');
                    }}
                    className="text-rose-400 hover:text-rose-300 font-bold transition-colors cursor-pointer"
                  >
                    Limpar filtros
                  </button>
                )}
              </div>
            </div>

            {userRole !== 'admin' ? (
              <div className="p-12 text-center bg-slate-950 flex flex-col items-center justify-center">
                <Lock className="w-12 h-12 text-rose-500/40 mb-3" />
                <h4 className="text-sm font-bold text-slate-300">Acesso Restrito ao Administrador</h4>
                <p className="text-slate-500 text-xs mt-1 max-w-sm mx-auto">
                  Por razões de conformidade de segurança de nível empresarial, apenas usuários com a função <strong>admin</strong> podem auditar a trilha de logs do sistema.
                </p>
              </div>
            ) : isLoading ? (
              <div className="p-12 text-center bg-slate-950 flex flex-col items-center justify-center space-y-3">
                <RefreshCw className="w-6 h-6 text-sky-400 animate-spin" />
                <p className="text-xs text-slate-400">Carregando auditoria de logs...</p>
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="p-12 text-center bg-slate-950 flex flex-col items-center justify-center">
                <Activity className="w-12 h-12 text-slate-700 mb-3" />
                <p className="text-sm font-semibold text-slate-400">Nenhum log encontrado para o filtro.</p>
                <p className="text-xs text-slate-600 mt-0.5">As atividades de logística aparecerão aqui em tempo real.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-850 bg-slate-950 overflow-y-auto max-h-[750px] scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-slate-950" id="audit-logs-list">
                {filteredLogs.map((log) => (
                  <div key={log.id} className="p-4 hover:bg-slate-900/30 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="space-y-1.5 flex-1 pr-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black ${getActionBadgeColor(log.action)}`}>
                          {getActionName(log.action)}
                        </span>
                        <span className="font-mono text-slate-400 font-semibold">{log.userEmail}</span>
                      </div>
                      <p className="text-slate-200 font-medium leading-relaxed">{log.details}</p>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-slate-500 font-mono shrink-0">
                      <Clock className="w-3 h-3" />
                      {new Date(log.timestamp).toLocaleString('pt-BR')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Security / System Info (Right 1 col) */}
        <div className="space-y-4">
          {/* Cloud Rules */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
              <ShieldCheck className="text-emerald-400 w-4 h-4" />
              Políticas de Acesso (RBAC)
            </h3>
            <ul className="text-xs space-y-3 text-slate-300">
              <li className="flex items-start gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 mt-1.5"></div>
                <div>
                  <strong className="text-white block font-semibold">Autenticação Requerida</strong>
                  <p className="text-slate-450 mt-0.5">Nenhum endpoint ou coleção pode ser lida ou escrita sem autenticação ativa.</p>
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0 mt-1.5"></div>
                <div>
                  <strong className="text-white block font-semibold">Função: Operador</strong>
                  <p className="text-slate-450 mt-0.5">Tem permissão de ler e escrever produtos no catálogo e preencher triagens de devolução.</p>
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0 mt-1.5"></div>
                <div>
                  <strong className="text-white block font-semibold">Função: Administrador</strong>
                  <p className="text-slate-450 mt-0.5">Controle total. Único com permissão de excluir triagens, auditar logs e extrair relatórios.</p>
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0 mt-1.5"></div>
                <div>
                  <strong className="text-white block font-semibold">Armazenamento Seguro</strong>
                  <p className="text-slate-450 mt-0.5">As fotos do RMA são carregadas no Firebase Storage e suas URLs seguras indexadas no Firestore.</p>
                </div>
              </li>
            </ul>
          </div>

          {/* Firestore rules snippet */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <Terminal className="text-sky-400 w-4 h-4" />
                Regras Ativas (Security Rules)
              </h3>
            </div>
            <p className="text-[10px] text-slate-405 leading-relaxed">
              Exemplo real das regras de segurança configuradas em produção para o Firestore:
            </p>
            <pre className="p-3 bg-slate-950 rounded-xl border border-slate-850 text-[9px] font-mono text-slate-300 leading-normal overflow-x-auto max-h-48 overflow-y-auto scrollbar-thin">
{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if isAuthenticated();
      allow write: if isAdmin();
    }
    match /triage_units/{id} {
      allow read: if isAuthenticated();
      allow write: if isOperatorOrAdmin();
      allow delete: if isAdmin();
    }
  }
}`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
