/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  Trash2, 
  Save, 
  X, 
  Boxes, 
  Sparkles
} from 'lucide-react';
import { DailyInflowRecord } from '../types';
import { getWeekdayName, formatBrDate } from '../utils/excelHelpers';

interface ManualDailyInflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (record: DailyInflowRecord) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  initialData?: DailyInflowRecord | null;
  defaultDate?: string;
}

export default function ManualDailyInflowModal({
  isOpen,
  onClose,
  onSave,
  onDelete,
  initialData,
  defaultDate
}: ManualDailyInflowModalProps) {
  const [date, setDate] = useState<string>(() => {
    if (initialData?.date) return initialData.date;
    if (defaultDate) return defaultDate;
    return new Date().toISOString().split('T')[0];
  });

  const [rma, setRma] = useState<number>(0);
  const [estoque, setEstoque] = useState<number>(0);
  const [openbox, setOpenbox] = useState<number>(0);
  const [es, setEs] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (initialData) {
      setDate(initialData.date);
      setRma(initialData.rma || 0);
      setEstoque(initialData.estoque || 0);
      setOpenbox(initialData.openbox || 0);
      setEs(initialData.es || 0);
      setNotes(initialData.notes || '');
    } else {
      setDate(defaultDate || new Date().toISOString().split('T')[0]);
      setRma(0);
      setEstoque(0);
      setOpenbox(0);
      setEs(0);
      setNotes('');
    }
  }, [initialData, defaultDate, isOpen]);

  if (!isOpen) return null;

  const totalDia = Number(rma || 0) + Number(estoque || 0) + Number(openbox || 0) + Number(es || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) {
      alert('Por favor, informe a data do lançamento.');
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        id: initialData?.id || `inflow-${date}`,
        date,
        rma: Number(rma || 0),
        estoque: Number(estoque || 0),
        openbox: Number(openbox || 0),
        es: Number(es || 0),
        totalDia,
        notes,
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
    if (!initialData?.id || !onDelete) return;
    if (window.confirm(`Tem certeza que deseja remover o lançamento do dia ${formatBrDate(initialData.date)}?`)) {
      setIsDeleting(true);
      try {
        await onDelete(initialData.id);
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

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn" 
      id="manual-inflow-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving && !isDeleting) onClose();
      }}
    >
      <div 
        className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 sticky top-0 z-10">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-inner">
              <Boxes className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">
                {initialData ? 'Editar Lançamento Diário' : 'Lançamento Manual de Quantidades'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Registre o volume diário de entradas por setor sem especificar SKUs
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Date Picker */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Data da Entrada *
            </label>
            <div className="relative">
              <input
                type="date"
                required
                max={new Date().toISOString().split('T')[0]}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm font-semibold text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
              />
              <Calendar className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            {date && (
              <p className="text-xs text-emerald-400 font-medium mt-1">
                {getWeekdayName(date)} ({formatBrDate(date)})
              </p>
            )}
          </div>

          {/* Quantities by Sector Grid */}
          <div className="grid grid-cols-2 gap-3.5 pt-1">
            {/* RMA */}
            <div className="bg-slate-800/50 border border-slate-700/60 rounded-2xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-rose-400 uppercase tracking-wider">
                  RMA (Triagem)
                </label>
                <span className="text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 px-1.5 py-0.5 rounded">
                  Qtd
                </span>
              </div>
              <input
                type="number"
                min="0"
                value={rma === 0 ? '' : rma}
                onChange={(e) => setRma(Math.max(0, parseInt(e.target.value, 10) || 0))}
                placeholder="0"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xl font-black text-rose-400 focus:outline-none focus:border-rose-500 text-center"
              />
              <div className="flex items-center justify-center gap-1">
                <button
                  type="button"
                  onClick={() => adjustValue(setRma, -1)}
                  className="px-2.5 py-1 text-xs font-bold bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg border border-slate-700 cursor-pointer"
                >
                  -1
                </button>
                <button
                  type="button"
                  onClick={() => adjustValue(setRma, 1)}
                  className="px-2.5 py-1 text-xs font-bold bg-slate-900 text-rose-400 hover:text-white hover:bg-slate-700 rounded-lg border border-slate-700 cursor-pointer"
                >
                  +1
                </button>
                <button
                  type="button"
                  onClick={() => adjustValue(setRma, 10)}
                  className="px-2.5 py-1 text-xs font-bold bg-slate-900 text-rose-400 hover:text-white hover:bg-slate-700 rounded-lg border border-slate-700 cursor-pointer"
                >
                  +10
                </button>
              </div>
            </div>

            {/* ESTOQUE */}
            <div className="bg-slate-800/50 border border-slate-700/60 rounded-2xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                  Estoque Geral
                </label>
                <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                  Qtd
                </span>
              </div>
              <input
                type="number"
                min="0"
                value={estoque === 0 ? '' : estoque}
                onChange={(e) => setEstoque(Math.max(0, parseInt(e.target.value, 10) || 0))}
                placeholder="0"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xl font-black text-emerald-400 focus:outline-none focus:border-emerald-500 text-center"
              />
              <div className="flex items-center justify-center gap-1">
                <button
                  type="button"
                  onClick={() => adjustValue(setEstoque, -1)}
                  className="px-2.5 py-1 text-xs font-bold bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg border border-slate-700 cursor-pointer"
                >
                  -1
                </button>
                <button
                  type="button"
                  onClick={() => adjustValue(setEstoque, 1)}
                  className="px-2.5 py-1 text-xs font-bold bg-slate-900 text-emerald-400 hover:text-white hover:bg-slate-700 rounded-lg border border-slate-700 cursor-pointer"
                >
                  +1
                </button>
                <button
                  type="button"
                  onClick={() => adjustValue(setEstoque, 10)}
                  className="px-2.5 py-1 text-xs font-bold bg-slate-900 text-emerald-400 hover:text-white hover:bg-slate-700 rounded-lg border border-slate-700 cursor-pointer"
                >
                  +10
                </button>
              </div>
            </div>

            {/* OPENBOX */}
            <div className="bg-slate-800/50 border border-slate-700/60 rounded-2xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                  Openbox
                </label>
                <span className="text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded">
                  Qtd
                </span>
              </div>
              <input
                type="number"
                min="0"
                value={openbox === 0 ? '' : openbox}
                onChange={(e) => setOpenbox(Math.max(0, parseInt(e.target.value, 10) || 0))}
                placeholder="0"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xl font-black text-amber-400 focus:outline-none focus:border-amber-500 text-center"
              />
              <div className="flex items-center justify-center gap-1">
                <button
                  type="button"
                  onClick={() => adjustValue(setOpenbox, -1)}
                  className="px-2.5 py-1 text-xs font-bold bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg border border-slate-700 cursor-pointer"
                >
                  -1
                </button>
                <button
                  type="button"
                  onClick={() => adjustValue(setOpenbox, 1)}
                  className="px-2.5 py-1 text-xs font-bold bg-slate-900 text-amber-400 hover:text-white hover:bg-slate-700 rounded-lg border border-slate-700 cursor-pointer"
                >
                  +1
                </button>
                <button
                  type="button"
                  onClick={() => adjustValue(setOpenbox, 5)}
                  className="px-2.5 py-1 text-xs font-bold bg-slate-900 text-amber-400 hover:text-white hover:bg-slate-700 rounded-lg border border-slate-700 cursor-pointer"
                >
                  +5
                </button>
              </div>
            </div>

            {/* ES */}
            <div className="bg-slate-800/50 border border-slate-700/60 rounded-2xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-purple-400 uppercase tracking-wider">
                  ES (Espírito Santo)
                </label>
                <span className="text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded">
                  Qtd
                </span>
              </div>
              <input
                type="number"
                min="0"
                value={es === 0 ? '' : es}
                onChange={(e) => setEs(Math.max(0, parseInt(e.target.value, 10) || 0))}
                placeholder="0"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xl font-black text-purple-400 focus:outline-none focus:border-purple-500 text-center"
              />
              <div className="flex items-center justify-center gap-1">
                <button
                  type="button"
                  onClick={() => adjustValue(setEs, -1)}
                  className="px-2.5 py-1 text-xs font-bold bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg border border-slate-700 cursor-pointer"
                >
                  -1
                </button>
                <button
                  type="button"
                  onClick={() => adjustValue(setEs, 1)}
                  className="px-2.5 py-1 text-xs font-bold bg-slate-900 text-purple-400 hover:text-white hover:bg-slate-700 rounded-lg border border-slate-700 cursor-pointer"
                >
                  +1
                </button>
                <button
                  type="button"
                  onClick={() => adjustValue(setEs, 10)}
                  className="px-2.5 py-1 text-xs font-bold bg-slate-900 text-purple-400 hover:text-white hover:bg-slate-700 rounded-lg border border-slate-700 cursor-pointer"
                >
                  +10
                </button>
              </div>
            </div>
          </div>

          {/* Total Preview Badge */}
          <div className="bg-slate-950 border border-slate-800 text-white rounded-2xl p-4 flex items-center justify-between shadow-inner">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-5 h-5 text-amber-400" />
              <div>
                <span className="text-xs font-bold text-slate-200 block">Total Consolidado do Dia</span>
                <span className="text-[11px] text-slate-400">RMA + Estoque + Openbox + ES</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-emerald-400">{totalDia}</span>
              <span className="text-xs text-slate-400 ml-1">unidades</span>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Observações / Lote (Opcional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Carga recebida transportadora X, lote especial..."
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-all"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-3">
            {initialData?.id && onDelete ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Excluir Dia</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 font-semibold text-xs transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-2 px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl font-bold text-xs shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all cursor-pointer disabled:opacity-50"
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

