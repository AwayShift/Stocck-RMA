/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Calendar, 
  Trash2, 
  Save, 
  X, 
  Boxes, 
  Sparkles,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { DailyInflowRecord, TriageUnit, isMigrationUnit } from '../types';
import { getWeekdayName, formatBrDate } from '../utils/excelHelpers';

interface TriageStats {
  rma: number;
  estoque: number;
  openbox: number;
  es: number;
  total: number;
}

interface ManualDailyInflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (record: DailyInflowRecord) => Promise<void>;
  onDelete?: (idOrDate: string) => Promise<void>;
  initialData?: DailyInflowRecord | null;
  defaultDate?: string;
  allInflows?: DailyInflowRecord[];
  unitsByDayMap?: Map<string, TriageStats>;
  allUnits?: TriageUnit[];
  existingTriageStats?: TriageStats;
}

const getTodayLocalDateStr = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const offsetDateStr = (dateStr: string, offsetDays: number): string => {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d + offsetDays);
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    return dateStr;
  }
};

export default function ManualDailyInflowModal({
  isOpen,
  onClose,
  onSave,
  onDelete,
  initialData,
  defaultDate,
  allInflows,
  unitsByDayMap,
  allUnits,
  existingTriageStats
}: ManualDailyInflowModalProps) {
  const [date, setDate] = useState<string>(() => {
    if (initialData?.date) return initialData.date;
    if (defaultDate) return defaultDate;
    return getTodayLocalDateStr();
  });

  const [rma, setRma] = useState<number>(0);
  const [estoque, setEstoque] = useState<number>(0);
  const [openbox, setOpenbox] = useState<number>(0);
  const [es, setEs] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');
  const [existingRecordId, setExistingRecordId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Helper to extract triage stats for any date
  const getTriageStatsForDate = useCallback((targetDate: string): TriageStats | null => {
    if (!targetDate) return null;
    if (unitsByDayMap && unitsByDayMap.has(targetDate)) {
      return unitsByDayMap.get(targetDate)!;
    }
    if (allUnits && allUnits.length > 0) {
      let rmaCount = 0, estoqueCount = 0, openboxCount = 0, esCount = 0, totalCount = 0;
      allUnits.forEach(u => {
        if (u.excludeFromDailyCount || isMigrationUnit(u)) return;
        const dStr = (u.createdAt || '').substring(0, 10);
        if (dStr === targetDate) {
          totalCount++;
          if (u.destinationSector === 'Openbox') openboxCount++;
          else if (u.destinationSector === 'Principal') estoqueCount++;
          else if ((u.destinationSector as string) === 'Descarte') esCount++;
          else rmaCount++;
        }
      });
      if (totalCount > 0) {
        return { rma: rmaCount, estoque: estoqueCount, openbox: openboxCount, es: esCount, total: totalCount };
      }
    }
    return null;
  }, [unitsByDayMap, allUnits]);

  // Current date's triage stats
  const currentTriageStats = useMemo(() => {
    if (!date) return null;
    const stats = getTriageStatsForDate(date);
    if (stats) return stats;
    if (existingTriageStats && initialData?.date === date) return existingTriageStats;
    return null;
  }, [date, getTriageStatsForDate, existingTriageStats, initialData]);

  // Synchronize state when modal opens or initialData/defaultDate changes
  useEffect(() => {
    if (!isOpen) return;

    const targetDate = initialData?.date || defaultDate || getTodayLocalDateStr();
    setDate(targetDate);

    // Look for existing record for targetDate
    const matchedRecord = (initialData?.date === targetDate ? initialData : null) || 
      allInflows?.find(r => r.date === targetDate);

    const tStats = getTriageStatsForDate(targetDate);

    if (matchedRecord && (matchedRecord.rma > 0 || matchedRecord.estoque > 0 || matchedRecord.openbox > 0 || matchedRecord.es > 0)) {
      setRma(Number(matchedRecord.rma || 0));
      setEstoque(Number(matchedRecord.estoque || 0));
      setOpenbox(Number(matchedRecord.openbox || 0));
      setEs(Number(matchedRecord.es || 0));
      setNotes(matchedRecord.notes || '');
      setExistingRecordId(
        matchedRecord.id && !matchedRecord.id.startsWith('triage-auto-') ? matchedRecord.id : null
      );
    } else if (tStats && tStats.total > 0) {
      // Auto prefill from live triages in the system!
      setRma(tStats.rma);
      setEstoque(tStats.estoque);
      setOpenbox(tStats.openbox);
      setEs(tStats.es);
      setNotes(matchedRecord?.notes || '');
      setExistingRecordId(
        matchedRecord?.id && !matchedRecord.id.startsWith('triage-auto-') ? matchedRecord.id : null
      );
    } else {
      setRma(0);
      setEstoque(0);
      setOpenbox(0);
      setEs(0);
      setNotes('');
      setExistingRecordId(null);
    }
  }, [isOpen, initialData, defaultDate, allInflows, getTriageStatsForDate]);

  // When date is manually changed in the date picker
  const handleDateChange = (newDate: string) => {
    setDate(newDate);
    if (!newDate) return;

    const matchedRecord = allInflows?.find(r => r.date === newDate) || 
      (initialData?.date === newDate ? initialData : null);

    const tStats = getTriageStatsForDate(newDate);

    if (matchedRecord && (matchedRecord.rma > 0 || matchedRecord.estoque > 0 || matchedRecord.openbox > 0 || matchedRecord.es > 0)) {
      setRma(Number(matchedRecord.rma || 0));
      setEstoque(Number(matchedRecord.estoque || 0));
      setOpenbox(Number(matchedRecord.openbox || 0));
      setEs(Number(matchedRecord.es || 0));
      setNotes(matchedRecord.notes || '');
      setExistingRecordId(
        matchedRecord.id && !matchedRecord.id.startsWith('triage-auto-') ? matchedRecord.id : null
      );
    } else if (tStats && tStats.total > 0) {
      setRma(tStats.rma);
      setEstoque(tStats.estoque);
      setOpenbox(tStats.openbox);
      setEs(tStats.es);
      setNotes(matchedRecord?.notes || '');
      setExistingRecordId(
        matchedRecord?.id && !matchedRecord.id.startsWith('triage-auto-') ? matchedRecord.id : null
      );
    } else {
      // Clear fields for fresh entry on that day
      setRma(0);
      setEstoque(0);
      setOpenbox(0);
      setEs(0);
      setNotes('');
      setExistingRecordId(null);
    }
  };

  if (!isOpen) return null;

  const totalDia = Number(rma || 0) + Number(estoque || 0) + Number(openbox || 0) + Number(es || 0);
  const isEditingExisting = Boolean(existingRecordId || allInflows?.some(r => r.date === date));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) {
      alert('Por favor, informe a data do lançamento.');
      return;
    }

    setIsSaving(true);
    try {
      const cleanId = existingRecordId && !existingRecordId.startsWith('triage-auto-') && !existingRecordId.startsWith('inflow-')
        ? existingRecordId
        : undefined;

      await onSave({
        id: cleanId as any,
        date,
        rma: Number(rma || 0),
        estoque: Number(estoque || 0),
        openbox: Number(openbox || 0),
        es: Number(es || 0),
        totalDia,
        notes: (notes || '').trim(),
        source: 'manual',
        updatedAt: new Date().toISOString()
      });
      onClose();
    } catch (err: any) {
      alert(`Erro ao salvar lançamento diário: ${err?.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    const targetToDelete = existingRecordId || date;
    if (window.confirm(`Tem certeza que deseja remover o lançamento do dia ${formatBrDate(date)}?`)) {
      setIsDeleting(true);
      try {
        await onDelete(targetToDelete);
        onClose();
      } catch (err: any) {
        alert(`Erro ao excluir lançamento: ${err?.message || err}`);
      } finally {
        setIsDeleting(false);
      }
    }
  };

  // Quick increment helper
  const adjustValue = (setter: React.Dispatch<React.SetStateAction<number>>, amount: number) => {
    setter(prev => Math.max(0, Number(prev || 0) + amount));
  };

  const todayStr = getTodayLocalDateStr();

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 animate-fadeIn" 
      id="manual-inflow-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving && !isDeleting) onClose();
      }}
    >
      <div 
        id="manual-inflow-modal-card"
        className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div id="manual-inflow-modal-header" className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 sticky top-0 z-10">
          <div className="flex items-center gap-3.5">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shadow-inner ${
              isEditingExisting 
                ? 'inflow-icon-edit bg-amber-500/10 border border-amber-500/25 text-amber-400'
                : 'inflow-icon-new bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
            }`}>
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-white">
                  {isEditingExisting ? 'Editar Lançamento Diário' : 'Novo Lançamento Diário'}
                </h2>
                <span className={`inflow-mode-badge text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  isEditingExisting
                    ? 'inflow-badge-edit bg-amber-500/20 text-amber-300 border-amber-500/30'
                    : 'inflow-badge-new bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                }`}>
                  {isEditingExisting ? 'Modo Edição' : 'Novo Registro'}
                </span>
              </div>
              <p className="inflow-header-sub text-xs text-slate-400 mt-0.5">
                Controle manual de fluxo de entrada diário por setor
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="inflow-btn-close p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Container (Scrollable) */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          {/* Date Picker & Quick Day Switcher */}
          <div className="inflow-date-section bg-slate-950/70 border border-slate-800 p-3.5 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <label className="inflow-date-label text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-400" />
                Data da Entrada *
              </label>
              {date && (
                <span className="inflow-date-weekday text-xs font-bold text-blue-400">
                  {getWeekdayName(date)} ({formatBrDate(date)})
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleDateChange(offsetDateStr(date, -1))}
                className="inflow-btn-nav px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1 border border-slate-700 transition-colors cursor-pointer"
                title="Dia Anterior"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Anterior</span>
              </button>

              <div className="relative flex-1">
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => handleDateChange(e.target.value)}
                  className="inflow-date-input w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm font-bold text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-center"
                />
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              <button
                type="button"
                onClick={() => handleDateChange(offsetDateStr(date, 1))}
                className="inflow-btn-nav px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1 border border-slate-700 transition-colors cursor-pointer"
                title="Próximo Dia"
              >
                <span>Próximo</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>

              {date !== todayStr && (
                <button
                  type="button"
                  onClick={() => handleDateChange(todayStr)}
                  className="inflow-btn-today px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold border border-blue-500 shadow-sm transition-colors cursor-pointer"
                  title="Ir para Hoje"
                >
                  Hoje
                </button>
              )}
            </div>

            {/* Existing record indicator */}
            {isEditingExisting ? (
              <div className="inflow-banner-existing flex items-center gap-2 text-[11px] text-amber-400 font-medium bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>Já existe lançamento salvo para este dia. Você pode alterar os valores abaixo ou salvar.</span>
              </div>
            ) : (
              <div className="inflow-banner-empty flex items-center gap-2 text-[11px] text-slate-400 font-medium bg-slate-800/40 border border-slate-800 px-2.5 py-1 rounded-lg">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                <span>Nenhum lançamento manual para esta data ainda. Preencha e clique em salvar.</span>
              </div>
            )}

            {/* Automatic Triage Stats Helper Card */}
            {currentTriageStats && currentTriageStats.total > 0 && (
              <div className="inflow-triage-card bg-sky-950/40 border border-sky-500/30 p-3 rounded-2xl space-y-2 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="inflow-triage-title flex items-center gap-1.5 text-xs font-bold text-sky-400">
                    <Boxes className="w-4 h-4 text-sky-400" />
                    <span>Triagens Registradas no Sistema ({currentTriageStats.total} {currentTriageStats.total === 1 ? 'item' : 'itens'})</span>
                  </div>
                  <span className="inflow-triage-badge text-[10px] font-black px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/40">
                    Detalhamento Ativo
                  </span>
                </div>
                <div className="inflow-triage-summary text-xs text-slate-300 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span>Estoque: <strong className="text-white">{currentTriageStats.estoque}</strong></span>
                  <span className="text-slate-500">•</span>
                  <span>RMA: <strong className="text-white">{currentTriageStats.rma}</strong></span>
                  <span className="text-slate-500">•</span>
                  <span>Openbox: <strong className="text-white">{currentTriageStats.openbox}</strong></span>
                  {currentTriageStats.es > 0 && (
                    <>
                      <span className="text-slate-500">•</span>
                      <span>ES: <strong className="text-white">{currentTriageStats.es}</strong></span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setEstoque(currentTriageStats.estoque);
                      setRma(currentTriageStats.rma);
                      setOpenbox(currentTriageStats.openbox);
                      setEs(currentTriageStats.es);
                    }}
                    className="inflow-btn-substitute px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
                  >
                    Preencher com as triagens
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEstoque(prev => Number(prev || 0) + currentTriageStats.estoque);
                      setRma(prev => Number(prev || 0) + currentTriageStats.rma);
                      setOpenbox(prev => Number(prev || 0) + currentTriageStats.openbox);
                      setEs(prev => Number(prev || 0) + currentTriageStats.es);
                    }}
                    className="inflow-btn-sum px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
                  >
                    Somar às triagens
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Quantities by Sector Grid */}
          <div className="grid grid-cols-2 gap-3 pt-0.5">
            {/* ESTOQUE */}
            <div className="inflow-sector-card inflow-sector-estoque bg-slate-800/50 border border-slate-700/60 rounded-2xl p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="inflow-sector-label text-xs font-bold text-emerald-400 uppercase tracking-wider">
                  Estoque Geral
                </label>
                <span className="inflow-sector-badge text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                  Qtd
                </span>
              </div>
              <input
                type="number"
                min="0"
                value={estoque === 0 ? '' : estoque}
                onChange={(e) => {
                  const val = e.target.value.trim();
                  if (val === '') setEstoque(0);
                  else {
                    const parsed = parseInt(val, 10);
                    setEstoque(isNaN(parsed) ? 0 : Math.max(0, parsed));
                  }
                }}
                placeholder="0"
                className="inflow-sector-input w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xl font-black text-emerald-400 focus:outline-none focus:border-emerald-500 text-center"
              />
              <div className="flex items-center justify-center gap-1">
                <button
                  type="button"
                  onClick={() => adjustValue(setEstoque, -1)}
                  className="inflow-btn-stepper stepper-sub px-2 py-0.5 text-xs font-bold bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg border border-slate-700 cursor-pointer"
                >
                  -1
                </button>
                <button
                  type="button"
                  onClick={() => adjustValue(setEstoque, 1)}
                  className="inflow-btn-stepper stepper-add px-2 py-0.5 text-xs font-bold bg-slate-900 text-emerald-400 hover:text-white hover:bg-slate-700 rounded-lg border border-slate-700 cursor-pointer"
                >
                  +1
                </button>
                <button
                  type="button"
                  onClick={() => adjustValue(setEstoque, 10)}
                  className="inflow-btn-stepper stepper-add px-2 py-0.5 text-xs font-bold bg-slate-900 text-emerald-400 hover:text-white hover:bg-slate-700 rounded-lg border border-slate-700 cursor-pointer"
                >
                  +10
                </button>
              </div>
            </div>

            {/* RMA */}
            <div className="inflow-sector-card inflow-sector-rma bg-slate-800/50 border border-slate-700/60 rounded-2xl p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="inflow-sector-label text-xs font-bold text-rose-400 uppercase tracking-wider">
                  RMA (Triagem)
                </label>
                <span className="inflow-sector-badge text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 px-1.5 py-0.5 rounded">
                  Qtd
                </span>
              </div>
              <input
                type="number"
                min="0"
                value={rma === 0 ? '' : rma}
                onChange={(e) => {
                  const val = e.target.value.trim();
                  if (val === '') setRma(0);
                  else {
                    const parsed = parseInt(val, 10);
                    setRma(isNaN(parsed) ? 0 : Math.max(0, parsed));
                  }
                }}
                placeholder="0"
                className="inflow-sector-input w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xl font-black text-rose-400 focus:outline-none focus:border-rose-500 text-center"
              />
              <div className="flex items-center justify-center gap-1">
                <button
                  type="button"
                  onClick={() => adjustValue(setRma, -1)}
                  className="inflow-btn-stepper stepper-sub px-2 py-0.5 text-xs font-bold bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg border border-slate-700 cursor-pointer"
                >
                  -1
                </button>
                <button
                  type="button"
                  onClick={() => adjustValue(setRma, 1)}
                  className="inflow-btn-stepper stepper-add px-2 py-0.5 text-xs font-bold bg-slate-900 text-rose-400 hover:text-white hover:bg-slate-700 rounded-lg border border-slate-700 cursor-pointer"
                >
                  +1
                </button>
                <button
                  type="button"
                  onClick={() => adjustValue(setRma, 10)}
                  className="inflow-btn-stepper stepper-add px-2 py-0.5 text-xs font-bold bg-slate-900 text-rose-400 hover:text-white hover:bg-slate-700 rounded-lg border border-slate-700 cursor-pointer"
                >
                  +10
                </button>
              </div>
            </div>

            {/* OPENBOX */}
            <div className="inflow-sector-card inflow-sector-openbox bg-slate-800/50 border border-slate-700/60 rounded-2xl p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="inflow-sector-label text-xs font-bold text-amber-400 uppercase tracking-wider">
                  Openbox
                </label>
                <span className="inflow-sector-badge text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded">
                  Qtd
                </span>
              </div>
              <input
                type="number"
                min="0"
                value={openbox === 0 ? '' : openbox}
                onChange={(e) => {
                  const val = e.target.value.trim();
                  if (val === '') setOpenbox(0);
                  else {
                    const parsed = parseInt(val, 10);
                    setOpenbox(isNaN(parsed) ? 0 : Math.max(0, parsed));
                  }
                }}
                placeholder="0"
                className="inflow-sector-input w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xl font-black text-amber-400 focus:outline-none focus:border-amber-500 text-center"
              />
              <div className="flex items-center justify-center gap-1">
                <button
                  type="button"
                  onClick={() => adjustValue(setOpenbox, -1)}
                  className="inflow-btn-stepper stepper-sub px-2 py-0.5 text-xs font-bold bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg border border-slate-700 cursor-pointer"
                >
                  -1
                </button>
                <button
                  type="button"
                  onClick={() => adjustValue(setOpenbox, 1)}
                  className="inflow-btn-stepper stepper-add px-2 py-0.5 text-xs font-bold bg-slate-900 text-amber-400 hover:text-white hover:bg-slate-700 rounded-lg border border-slate-700 cursor-pointer"
                >
                  +1
                </button>
                <button
                  type="button"
                  onClick={() => adjustValue(setOpenbox, 5)}
                  className="inflow-btn-stepper stepper-add px-2 py-0.5 text-xs font-bold bg-slate-900 text-amber-400 hover:text-white hover:bg-slate-700 rounded-lg border border-slate-700 cursor-pointer"
                >
                  +5
                </button>
              </div>
            </div>

            {/* ES */}
            <div className="inflow-sector-card inflow-sector-es bg-slate-800/50 border border-slate-700/60 rounded-2xl p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="inflow-sector-label text-xs font-bold text-purple-400 uppercase tracking-wider">
                  ES (Espírito Santo)
                </label>
                <span className="inflow-sector-badge text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded">
                  Qtd
                </span>
              </div>
              <input
                type="number"
                min="0"
                value={es === 0 ? '' : es}
                onChange={(e) => {
                  const val = e.target.value.trim();
                  if (val === '') setEs(0);
                  else {
                    const parsed = parseInt(val, 10);
                    setEs(isNaN(parsed) ? 0 : Math.max(0, parsed));
                  }
                }}
                placeholder="0"
                className="inflow-sector-input w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xl font-black text-purple-400 focus:outline-none focus:border-purple-500 text-center"
              />
              <div className="flex items-center justify-center gap-1">
                <button
                  type="button"
                  onClick={() => adjustValue(setEs, -1)}
                  className="inflow-btn-stepper stepper-sub px-2 py-0.5 text-xs font-bold bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg border border-slate-700 cursor-pointer"
                >
                  -1
                </button>
                <button
                  type="button"
                  onClick={() => adjustValue(setEs, 1)}
                  className="inflow-btn-stepper stepper-add px-2 py-0.5 text-xs font-bold bg-slate-900 text-purple-400 hover:text-white hover:bg-slate-700 rounded-lg border border-slate-700 cursor-pointer"
                >
                  +1
                </button>
                <button
                  type="button"
                  onClick={() => adjustValue(setEs, 10)}
                  className="inflow-btn-stepper stepper-add px-2 py-0.5 text-xs font-bold bg-slate-900 text-purple-400 hover:text-white hover:bg-slate-700 rounded-lg border border-slate-700 cursor-pointer"
                >
                  +10
                </button>
              </div>
            </div>
          </div>

          {/* Total Preview Badge */}
          <div className="inflow-total-card bg-slate-950 border border-slate-800 text-white rounded-2xl p-3.5 flex items-center justify-between shadow-inner">
            <div className="flex items-center gap-2.5">
              <Sparkles className="inflow-total-sparkle w-5 h-5 text-amber-400" />
              <div>
                <span className="inflow-total-title text-xs font-bold text-slate-200 block">Total Consolidado do Dia</span>
                <span className="inflow-total-sub text-[11px] text-slate-400">RMA + Estoque + Openbox + ES</span>
              </div>
            </div>
            <div className="text-right">
              <span className="inflow-total-value text-2xl font-black text-emerald-400">{totalDia}</span>
              <span className="inflow-total-unit text-xs text-slate-400 ml-1">unidades</span>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="inflow-notes-label block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Observações / Lote (Opcional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Carga recebida transportadora X, lote especial..."
              className="inflow-notes-input w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-all"
            />
          </div>

          {/* Action Buttons */}
          <div className="inflow-footer pt-3 border-t border-slate-800 flex items-center justify-between gap-3">
            {isEditingExisting && onDelete ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting || isSaving}
                className="inflow-btn-delete px-3.5 py-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? (
                  <div className="w-3.5 h-3.5 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>Excluir Dia</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving || isDeleting}
                className="inflow-btn-cancel px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 font-semibold text-xs transition-all cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving || isDeleting}
                className="inflow-btn-save flex items-center gap-2 px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl font-bold text-xs shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all cursor-pointer disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Salvar Lançamento</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
