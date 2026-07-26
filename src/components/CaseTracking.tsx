/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  X, 
  Check, 
  AlertCircle,
  FileText,
  Calendar,
  Layers,
  HelpCircle,
  HelpCircle as HelpIcon,
  ShieldAlert,
  Clock,
  ExternalLink,
  ChevronRight,
  Filter,
  ThumbsUp,
  ThumbsDown,
  Coins,
  RotateCcw,
  CheckCircle2,
  Clock5
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CaseTracking, CasePlatformType } from '../types';

interface CaseTrackingProps {
  cases: CaseTracking[];
  onSaveCase: (caseData: CaseTracking) => Promise<void>;
  onDeleteCase: (id: string) => Promise<void>;
  userRole: 'admin' | 'operator' | null;
}

export default function CaseTrackingComponent({ cases, onSaveCase, onDeleteCase, userRole }: CaseTrackingProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('Todas');
  
  // Modal / Form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCase, setEditingCase] = useState<CaseTracking | null>(null);
  
  // Field states
  const [code, setCode] = useState('');
  const [platform, setPlatform] = useState<CasePlatformType>('Mercado Livre');
  const [createdAt, setCreatedAt] = useState('');
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState<'Pendente' | 'Resolvido'>('Pendente');
  const [resolutionType, setResolutionType] = useState<'Favorável' | 'Não Favorável' | 'Pago Parcial' | 'Pendente de Resolução'>('Favorável');
  const [caseValue, setCaseValue] = useState<string>('');
  const [notes, setNotes] = useState('');

  // Quick Value Modal state
  const [quickValueModalCase, setQuickValueModalCase] = useState<{ caseItem: CaseTracking; resolution: 'Favorável' | 'Não Favorável' | 'Pago Parcial' | 'Pendente' } | null>(null);
  const [quickValueInput, setQuickValueInput] = useState<string>('');

  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filtered cases
  const filteredCases = useMemo(() => {
    return cases.filter(c => {
      const matchPlatform = selectedPlatform === 'Todas' || c.platform === selectedPlatform;
      const term = searchTerm.toLowerCase().trim();
      const matchSearch = !term || 
        c.code.toLowerCase().includes(term) ||
        c.reason.toLowerCase().includes(term) ||
        (c.resolution && c.resolution.toLowerCase().includes(term)) ||
        (c.status && c.status.toLowerCase().includes(term)) ||
        (c.notes && c.notes.toLowerCase().includes(term));
      return matchPlatform && matchSearch;
    });
  }, [cases, selectedPlatform, searchTerm]);

  // Statistics
  const stats = useMemo(() => {
    const total = cases.length;
    const byPlatform = {
      'Mercado Livre': 0,
      'Shopee': 0,
      'Amazon': 0
    };
    let solvedCount = 0;
    let pendingCount = 0;

    cases.forEach(c => {
      if (byPlatform[c.platform] !== undefined) {
        byPlatform[c.platform]++;
      }
      
      if ((c.status || 'Pendente') === 'Resolvido') {
        solvedCount++;
      } else {
        pendingCount++;
      }
    });

    return { total, byPlatform, solvedCount, pendingCount };
  }, [cases]);

  // Open form for new case
  const handleNewCase = () => {
    setEditingCase(null);
    setCode('');
    setPlatform('Mercado Livre');
    setCreatedAt(new Date().toISOString().split('T')[0]); // Default to today's date
    setReason('');
    setStatus('Pendente');
    setResolutionType('Favorável');
    setCaseValue('');
    setNotes('');
    setErrorMessage('');
    setSuccessMessage('');
    setIsFormOpen(true);
  };

  // Open form to edit case
  const handleEditCase = (c: CaseTracking) => {
    setEditingCase(c);
    setCode(c.code);
    setPlatform(c.platform);
    setCreatedAt(c.createdAt);
    setReason(c.reason);
    setStatus(c.status || 'Pendente');
    const res = c.resolution || 'Pendente de Resolução';
    if (res === 'Favorável' || res === 'Não Favorável' || res === 'Pago Parcial') {
      setResolutionType(res);
    } else {
      setResolutionType('Favorável');
    }
    setCaseValue(c.value !== undefined ? String(c.value) : '');
    setNotes(c.notes || '');
    setErrorMessage('');
    setSuccessMessage('');
    setIsFormOpen(true);
  };

  // Quick resolution marking buttons
  const handleResolveCase = (caseItem: CaseTracking, newResolution: 'Favorável' | 'Não Favorável' | 'Pago Parcial' | 'Pendente') => {
    if (newResolution === 'Favorável' || newResolution === 'Pago Parcial') {
      setQuickValueModalCase({ caseItem, resolution: newResolution });
      setQuickValueInput(caseItem.value !== undefined ? String(caseItem.value) : '');
    } else {
      handleConfirmResolve(caseItem, newResolution, undefined);
    }
  };

  const handleConfirmResolve = async (caseItem: CaseTracking, newResolution: 'Favorável' | 'Não Favorável' | 'Pago Parcial' | 'Pendente', valStr?: string) => {
    try {
      let finalValue: number | undefined = undefined;
      if (valStr !== undefined && valStr.trim() !== '') {
        const parsed = parseFloat(valStr.replace(',', '.'));
        if (!isNaN(parsed)) {
          finalValue = parsed;
        }
      }
      const updatedCase: CaseTracking = {
        ...caseItem,
        status: newResolution === 'Pendente' ? 'Pendente' : 'Resolvido',
        resolution: newResolution === 'Pendente' ? 'Pendente de Resolução' : newResolution,
        value: finalValue
      };
      await onSaveCase(updatedCase);
      setQuickValueModalCase(null);
    } catch (err: any) {
      alert(err?.message || 'Erro ao atualizar resolução do caso.');
    }
  };

  // Handle submit save
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setErrorMessage('O Código é obrigatório.');
      return;
    }
    if (!createdAt.trim()) {
      setErrorMessage('A Data é obrigatória.');
      return;
    }
    if (!reason.trim()) {
      setErrorMessage('O Motivo/Razão é obrigatório.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    
    try {
      let finalResolution = 'Pendente de Resolução';
      let finalValue: number | undefined = undefined;

      if (status === 'Resolvido') {
        finalResolution = resolutionType;
        if ((resolutionType === 'Favorável' || resolutionType === 'Pago Parcial') && caseValue.trim() !== '') {
          const parsed = parseFloat(caseValue.replace(',', '.'));
          if (!isNaN(parsed)) {
            finalValue = parsed;
          }
        }
      }

      const caseData: CaseTracking = {
        id: editingCase ? editingCase.id : `case-${Date.now()}`,
        code: code.trim(),
        platform,
        createdAt,
        reason: reason.trim(),
        resolution: finalResolution,
        status: status,
        value: finalValue,
        notes: notes.trim() || undefined
      };
      
      await onSaveCase(caseData);
      setSuccessMessage(editingCase ? 'Acompanhamento atualizado com sucesso!' : 'Acompanhamento registrado com sucesso!');
      setTimeout(() => {
        setIsFormOpen(false);
        setSuccessMessage('');
      }, 1000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Erro ao salvar caso.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, code: string) => {
    if (userRole !== 'admin') {
      alert('Acesso negado: Apenas administradores possuem permissão para excluir registros de acompanhamento.');
      return;
    }

    if (window.confirm(`Tem certeza de que deseja remover permanentemente o acompanhamento do caso ${code}?`)) {
      try {
        await onDeleteCase(id);
      } catch (err: any) {
        alert(err?.message || 'Erro ao deletar caso.');
      }
    }
  };

  // Platform badges
  const getPlatformBadge = (p: CasePlatformType) => {
    switch (p) {
      case 'Mercado Livre':
        return 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20';
      case 'Shopee':
        return 'bg-orange-500/10 text-orange-400 border border-orange-500/20';
      case 'Amazon':
        return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
      default:
        return 'bg-slate-500/10 text-slate-400 border border-slate-500/20';
    }
  };

  return (
    <div className="space-y-6" id="case-tracking-view">
      
      {/* Header and Add Action */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900/60 p-6 rounded-2xl border border-slate-800/80 shadow-md">
        <div>
          <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
            <Layers className="w-5.5 h-5.5 text-sky-400" />
            Acompanhamento de Casos
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Controle e rastreabilidade de disputas, contestações e resoluções com as plataformas Mercado Livre, Shopee e Amazon.
          </p>
        </div>
        <button
          onClick={handleNewCase}
          className="flex items-center gap-2 px-5 py-3 bg-sky-500 hover:bg-sky-400 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-sky-500/10 cursor-pointer w-full sm:w-auto justify-center"
          id="btn-new-case"
        >
          <Plus className="w-4 h-4" />
          Novo Acompanhamento
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4" id="case-stats-panel">
        
        {/* Total cases */}
        <div className="bg-slate-900 border border-slate-800/80 p-5 rounded-2xl flex items-center gap-4">
          <div className="p-3 bg-sky-500/10 rounded-xl border border-sky-500/10 text-sky-400">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider block">Total de Casos</span>
            <span className="text-2xl font-mono font-black text-white leading-tight">{stats.total}</span>
          </div>
        </div>

        {/* Mercado Livre cases */}
        <div className="bg-slate-900 border border-slate-800/80 p-5 rounded-2xl flex items-center gap-4">
          <div className="p-3 bg-yellow-500/10 rounded-xl border border-yellow-500/10 text-yellow-400">
            <span className="text-xs font-black">ML</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider block">Mercado Livre</span>
            <span className="text-2xl font-mono font-black text-white leading-tight">{stats.byPlatform['Mercado Livre']}</span>
          </div>
        </div>

        {/* Shopee cases */}
        <div className="bg-slate-900 border border-slate-800/80 p-5 rounded-2xl flex items-center gap-4">
          <div className="p-3 bg-orange-500/10 rounded-xl border border-orange-500/10 text-orange-400">
            <span className="text-xs font-black">SH</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider block">Shopee</span>
            <span className="text-2xl font-mono font-black text-white leading-tight">{stats.byPlatform['Shopee']}</span>
          </div>
        </div>

        {/* Amazon cases */}
        <div className="bg-slate-900 border border-slate-800/80 p-5 rounded-2xl flex items-center gap-4">
          <div className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/10 text-blue-400">
            <span className="text-xs font-black">AMZ</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider block">Amazon</span>
            <span className="text-2xl font-mono font-black text-white leading-tight">{stats.byPlatform['Amazon']}</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Panel */}
      <div className="bg-slate-900 border border-slate-800/80 p-4 rounded-2xl flex flex-col md:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por código, razão, resolução ou observações..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 focus:border-slate-750 text-slate-100 rounded-xl pl-10 pr-4 py-2.5 text-xs focus:outline-none placeholder-slate-500 transition-all font-semibold"
            id="search-cases"
          />
        </div>

        {/* Platform filter tabs */}
        <div className="flex gap-1 overflow-x-auto whitespace-nowrap scrollbar-none bg-slate-950 p-1 rounded-xl border border-slate-800 self-start">
          {['Todas', 'Mercado Livre', 'Shopee', 'Amazon'].map((p) => (
            <button
              key={p}
              onClick={() => setSelectedPlatform(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                selectedPlatform === p 
                  ? 'bg-sky-500/15 text-sky-400 font-extrabold border border-sky-500/25' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Main List */}
      <div className="bg-slate-900 border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl" id="cases-table-container">
        {filteredCases.length === 0 ? (
          <div className="py-20 text-center flex flex-col items-center justify-center space-y-4">
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-850 text-slate-500">
              <Clock className="w-8 h-8" />
            </div>
            <div className="max-w-xs">
              <h3 className="text-sm font-bold text-white">Nenhum caso encontrado</h3>
              <p className="text-xs text-slate-500 mt-1">
                Não há registros de acompanhamento que correspondam à busca ou filtros selecionados.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-slate-950/85 border-b border-slate-800 text-slate-400 text-[10px] font-black uppercase tracking-wider">
                  <th className="px-6 py-4">Data</th>
                  <th className="px-6 py-4">Plataforma</th>
                  <th className="px-6 py-4">Código / Rastreamento</th>
                  <th className="px-6 py-4">Motivo / Razão</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Resolução</th>
                  <th className="px-6 py-4">Observações</th>
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {filteredCases.map((c) => {
                  // Beautify Date
                  let displayDate = c.createdAt;
                  if (c.createdAt.includes('-')) {
                    const [year, month, day] = c.createdAt.split('-');
                    displayDate = `${day}/${month}/${year}`;
                  }
                  
                  return (
                    <tr key={c.id} className="hover:bg-slate-950/30 transition-colors group">
                      <td className="px-6 py-4.5 whitespace-nowrap">
                        <span className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-500" />
                          {displayDate}
                        </span>
                      </td>
                      <td className="px-6 py-4.5 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${getPlatformBadge(c.platform)}`}>
                          {c.platform}
                        </span>
                      </td>
                      <td className="px-6 py-4.5 whitespace-nowrap">
                        <span className="text-xs font-mono font-bold text-white tracking-tight group-hover:text-sky-400 transition-colors">
                          {c.code}
                        </span>
                      </td>
                      <td className="px-6 py-4.5">
                        <span className="text-xs font-semibold text-slate-300 block max-w-xs truncate" title={c.reason}>
                          {c.reason}
                        </span>
                      </td>
                      <td className="px-6 py-4.5 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                          (c.status || 'Pendente') === 'Resolvido'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        }`}>
                          {c.status || 'Pendente'}
                        </span>
                      </td>
                      <td className="px-6 py-4.5">
                        <div className="flex flex-col">
                          <span className={`text-xs font-bold block max-w-xs truncate ${
                            c.resolution === 'Favorável'
                              ? 'text-emerald-400' 
                              : c.resolution === 'Pago Parcial'
                              ? 'text-amber-400'
                              : c.resolution === 'Não Favorável'
                              ? 'text-rose-400'
                              : 'text-slate-500 font-medium italic'
                          }`} title={c.resolution || 'Pendente de Resolução'}>
                            {c.resolution || 'Pendente de Resolução'}
                          </span>
                          {c.value !== undefined && (c.resolution === 'Favorável' || c.resolution === 'Pago Parcial') && (
                            <span className="text-[10px] text-slate-400 font-bold font-mono mt-0.5">
                              {c.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4.5">
                        <p className="text-xs text-slate-400 font-medium max-w-sm line-clamp-1" title={c.notes || ''}>
                          {c.notes || <span className="text-slate-600 italic">Sem observações</span>}
                        </p>
                      </td>
                      <td className="px-6 py-4.5 whitespace-nowrap text-right">
                        <div className="flex justify-end items-center gap-2">
                          {/* Quick Resolution Actions */}
                          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800" title="Marcar Resolução do Caso">
                            <button
                              onClick={() => handleResolveCase(c, 'Favorável')}
                              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                                c.status === 'Resolvido' && c.resolution === 'Favorável'
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : 'text-slate-500 hover:text-emerald-400 hover:bg-slate-900 border border-transparent'
                              }`}
                              title="Favorável"
                            >
                              <ThumbsUp className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleResolveCase(c, 'Não Favorável')}
                              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                                c.status === 'Resolvido' && c.resolution === 'Não Favorável'
                                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                  : 'text-slate-500 hover:text-rose-400 hover:bg-slate-900 border border-transparent'
                              }`}
                              title="Não Favorável"
                            >
                              <ThumbsDown className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleResolveCase(c, 'Pago Parcial')}
                              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                                c.status === 'Resolvido' && c.resolution === 'Pago Parcial'
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                  : 'text-slate-500 hover:text-amber-400 hover:bg-slate-900 border border-transparent'
                              }`}
                              title="Pago Parcial"
                            >
                              <Coins className="w-3 h-3" />
                            </button>
                            {c.status === 'Resolvido' && (
                              <button
                                onClick={() => handleResolveCase(c, 'Pendente')}
                                className="p-1.5 rounded-lg transition-all cursor-pointer text-slate-500 hover:text-sky-400 hover:bg-slate-900 border border-transparent"
                                title="Reabrir Caso"
                              >
                                <RotateCcw className="w-3 h-3" />
                              </button>
                            )}
                          </div>

                          <button
                            onClick={() => handleEditCase(c)}
                            className="p-2 bg-slate-950 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 rounded-lg text-slate-400 hover:text-white transition-all cursor-pointer"
                            title="Editar Acompanhamento"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          
                          <button
                            onClick={() => handleDelete(c.id, c.code)}
                            className={`p-2 rounded-lg transition-all border cursor-pointer ${
                              userRole === 'admin' 
                                ? 'bg-slate-950 border-slate-800 hover:border-rose-500/30 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400'
                                : 'bg-slate-950/40 border-transparent text-slate-600 cursor-not-allowed'
                            }`}
                            title={userRole === 'admin' ? "Excluir Registro de Acompanhamento" : "Apenas Administradores podem excluir"}
                            disabled={userRole !== 'admin'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Form Dialog */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col"
              id="case-form-modal"
            >
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
                <h3 className="text-sm font-black text-white tracking-tight flex items-center gap-2">
                  <Layers className="w-4 h-4 text-sky-400" />
                  {editingCase ? 'Editar Acompanhamento' : 'Novo Acompanhamento de Caso'}
                </h3>
                <button
                  onClick={() => setIsFormOpen(false)}
                  className="p-1.5 bg-slate-900 hover:bg-slate-850 rounded-lg text-slate-400 hover:text-white transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Form content */}
              <form onSubmit={handleSubmit} className="p-6 space-y-4 flex-1">
                {errorMessage && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs font-semibold flex items-center gap-2 animate-pulse">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}
                
                {successMessage && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-semibold flex items-center gap-2">
                    <Check className="w-4 h-4 shrink-0 animate-bounce" />
                    <span>{successMessage}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  {/* Platform */}
                  <div className="space-y-1.5 col-span-2 sm:col-span-1">
                    <label className="text-[10px] text-slate-400 uppercase font-black tracking-wider block">Plataforma</label>
                    <select
                      value={platform}
                      onChange={(e) => setPlatform(e.target.value as CasePlatformType)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-slate-750 text-slate-100 rounded-xl px-3 py-2.5 text-xs focus:outline-none font-bold cursor-pointer"
                    >
                      <option value="Mercado Livre">Mercado Livre</option>
                      <option value="Shopee">Shopee</option>
                      <option value="Amazon">Amazon</option>
                    </select>
                  </div>

                  {/* Date (Explicit Calendar Input) */}
                  <div className="space-y-1.5 col-span-2 sm:col-span-1">
                    <label className="text-[10px] text-slate-400 uppercase font-black tracking-wider block">Data de Abertura</label>
                    <div className="relative">
                      <input
                        type="date"
                        value={createdAt}
                        onChange={(e) => setCreatedAt(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-slate-750 text-slate-100 rounded-xl pl-3 pr-10 py-2.5 text-xs focus:outline-none font-bold cursor-pointer"
                        style={{ colorScheme: 'dark' }}
                      />
                      <Calendar className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* Tracking Code */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 uppercase font-black tracking-wider block">Código de Rastreamento / Caso</label>
                  <input
                    type="text"
                    placeholder="Ex: 2001020392010230"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-slate-750 text-slate-100 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none font-mono font-bold"
                  />
                </div>

                {/* Opening Reason */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 uppercase font-black tracking-wider block">Razão / Motivo da Abertura</label>
                  <input
                    type="text"
                    placeholder="Ex: Não devolveu / Devolveu produto danificado"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-slate-750 text-slate-100 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none font-semibold"
                  />
                </div>

                {/* Status Selection instead of Resolution */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 uppercase font-black tracking-wider block">Status do Acompanhamento</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as 'Pendente' | 'Resolvido')}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-slate-750 text-slate-100 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none font-bold cursor-pointer"
                  >
                    <option value="Pendente">Pendente</option>
                    <option value="Resolvido">Resolvido</option>
                  </select>
                </div>

                {status === 'Resolvido' && (
                  <div className="space-y-4 p-4 bg-slate-950/40 rounded-xl border border-slate-800/80">
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-slate-400 uppercase font-black tracking-wider block">Resultado da Resolução</label>
                      <select
                        value={resolutionType}
                        onChange={(e) => setResolutionType(e.target.value as any)}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-slate-750 text-slate-100 rounded-xl px-3 py-2.5 text-xs focus:outline-none font-bold cursor-pointer"
                      >
                        <option value="Favorável">Favorável</option>
                        <option value="Não Favorável">Não Favorável</option>
                        <option value="Pago Parcial">Pago Parcial</option>
                      </select>
                    </div>

                    {(resolutionType === 'Favorável' || resolutionType === 'Pago Parcial') && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-slate-400 uppercase font-black tracking-wider block">Valor Reembolsado / Recuperado (R$, Opcional)</label>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">R$</span>
                          <input
                            type="text"
                            placeholder="Ex: 150.00"
                            value={caseValue}
                            onChange={(e) => setCaseValue(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 focus:border-slate-750 text-slate-100 rounded-xl pl-9 pr-3.5 py-2.5 text-xs focus:outline-none font-mono font-bold"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Observations / notes */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 uppercase font-black tracking-wider block">Observações (Opcional)</label>
                  <textarea
                    placeholder="Adicione notas adicionais, detalhes técnicos do suporte ou observações necessárias do caso..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-slate-750 text-slate-100 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none font-medium resize-none"
                  />
                </div>

                {/* Actions Footer */}
                <div className="pt-4 border-t border-slate-800/60 flex items-center justify-end gap-3.5">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="px-4 py-2.5 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2.5 bg-sky-500 hover:bg-sky-400 text-white rounded-xl text-xs font-black transition-all shadow-md shadow-sky-500/10 flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? 'Salvando...' : 'Salvar Acompanhamento'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Quick Value Modal */}
      <AnimatePresence>
        {quickValueModalCase && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col"
              id="quick-value-modal"
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
                <h3 className="text-sm font-black text-white tracking-tight flex items-center gap-2">
                  <Coins className="w-4 h-4 text-amber-400" />
                  Marcar como {quickValueModalCase.resolution}
                </h3>
                <button
                  onClick={() => setQuickValueModalCase(null)}
                  className="p-1.5 bg-slate-900 hover:bg-slate-850 rounded-lg text-slate-400 hover:text-white transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-4">
                <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800 text-xs text-slate-300 space-y-1">
                  <p><span className="font-bold text-slate-400">Caso:</span> {quickValueModalCase.caseItem.code}</p>
                  <p><span className="font-bold text-slate-400">Plataforma:</span> {quickValueModalCase.caseItem.platform}</p>
                  <p><span className="font-bold text-slate-400">Motivo:</span> {quickValueModalCase.caseItem.reason}</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 uppercase font-black tracking-wider block">
                    Valor Reembolsado / Recuperado (R$, Opcional)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">R$</span>
                    <input
                      type="text"
                      placeholder="Ex: 150.00"
                      value={quickValueInput}
                      onChange={(e) => setQuickValueInput(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-slate-750 text-slate-100 rounded-xl pl-9 pr-3.5 py-2.5 text-xs focus:outline-none font-mono font-bold"
                      autoFocus
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 italic mt-1">
                    Deixe em branco ou limpe para salvar sem valor.
                  </p>
                </div>

                {/* Footer Actions */}
                <div className="pt-4 border-t border-slate-800/60 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setQuickValueModalCase(null)}
                    className="px-4 py-2.5 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleConfirmResolve(quickValueModalCase.caseItem, quickValueModalCase.resolution, quickValueInput)}
                    className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black transition-all shadow-md shadow-amber-500/10 cursor-pointer"
                  >
                    Confirmar Resolução
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
