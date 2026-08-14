/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  Plus, 
  Trash2, 
  Save, 
  X, 
  Package, 
  Layers, 
  Boxes, 
  Sparkles,
  RotateCcw
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">
                {initialData ? 'Editar Lançamento Diário' : 'Lançamento Manual de Quantidades'}
              </h2>
              <p className="text-xs text-slate-500">
                Registre o volume diário de entradas por setor sem especificar SKUs
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Date Picker */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Data da Entrada *
            </label>
            <div className="relative">
              <input
                type="date"
                required
                max={new Date().toISOString().split('T')[0]}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
              <Calendar className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            {date && (
              <p className="text-xs text-blue-600 font-medium mt-1">
                {getWeekdayName(date)} ({formatBrDate(date)})
              </p>
            )}
          </div>

          {/* Quantities by Sector Grid */}
          <div className="grid grid-cols-2 gap-3.5 pt-1">
            {/* RMA */}
            <div className="bg-blue-50/40 border border-blue-100 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-blue-900 uppercase tracking-wider">
                  RMA (Triagem)
                </label>
                <span className="text-[10px] font-semibold bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
                  Qtd
                </span>
              </div>
              <input
                type="number"
                min="0"
                value={rma === 0 ? '' : rma}
                onChange={(e) => setRma(Math.max(0, parseInt(e.target.value, 10) || 0))}
                placeholder="0"
                className="w-full px-3 py-1.5 bg-white border border-blue-200 rounded-lg text-lg font-black text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-center"
              />
              <div className="flex items-center justify-center gap-1">
                <button
                  type="button"
                  onClick={() => adjustValue(setRma, -1)}
                  className="px-2 py-0.5 text-xs font-bold bg-white text-blue-700 hover:bg-blue-100 rounded border border-blue-200"
                >
                  -1
                </button>
                <button
                  type="button"
                  onClick={() => adjustValue(setRma, 1)}
                  className="px-2 py-0.5 text-xs font-bold bg-white text-blue-700 hover:bg-blue-100 rounded border border-blue-200"
                >
                  +1
                </button>
                <button
                  type="button"
                  onClick={() => adjustValue(setRma, 10)}
                  className="px-2 py-0.5 text-xs font-bold bg-white text-blue-700 hover:bg-blue-100 rounded border border-blue-200"
                >
                  +10
                </button>
              </div>
            </div>

            {/* ESTOQUE */}
            <div className="bg-emerald-50/40 border border-emerald-100 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-emerald-900 uppercase tracking-wider">
                  Estoque Geral
                </label>
                <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                  Qtd
                </span>
              </div>
              <input
                type="number"
                min="0"
                value={estoque === 0 ? '' : estoque}
                onChange={(e) => setEstoque(Math.max(0, parseInt(e.target.value, 10) || 0))}
                placeholder="0"
                className="w-full px-3 py-1.5 bg-white border border-emerald-200 rounded-lg text-lg font-black text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-center"
              />
              <div className="flex items-center justify-center gap-1">
                <button
                  type="button"
                  onClick={() => adjustValue(setEstoque, -1)}
                  className="px-2 py-0.5 text-xs font-bold bg-white text-emerald-700 hover:bg-emerald-100 rounded border border-emerald-200"
                >
                  -1
                </button>
                <button
                  type="button"
                  onClick={() => adjustValue(setEstoque, 1)}
                  className="px-2 py-0.5 text-xs font-bold bg-white text-emerald-700 hover:bg-emerald-100 rounded border border-emerald-200"
                >
                  +1
                </button>
                <button
                  type="button"
                  onClick={() => adjustValue(setEstoque, 10)}
                  className="px-2 py-0.5 text-xs font-bold bg-white text-emerald-700 hover:bg-emerald-100 rounded border border-emerald-200"
                >
                  +10
                </button>
              </div>
            </div>

            {/* OPENBOX */}
            <div className="bg-amber-50/40 border border-amber-100 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                  Openbox
                </label>
                <span className="text-[10px] font-semibold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                  Qtd
                </span>
              </div>
              <input
                type="number"
                min="0"
                value={openbox === 0 ? '' : openbox}
                onChange={(e) => setOpenbox(Math.max(0, parseInt(e.target.value, 10) || 0))}
                placeholder="0"
                className="w-full px-3 py-1.5 bg-white border border-amber-200 rounded-lg text-lg font-black text-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-center"
              />
              <div className="flex items-center justify-center gap-1">
                <button
                  type="button"
                  onClick={() => adjustValue(setOpenbox, -1)}
                  className="px-2 py-0.5 text-xs font-bold bg-white text-amber-700 hover:bg-amber-100 rounded border border-amber-200"
                >
                  -1
                </button>
                <button
                  type="button"
                  onClick={() => adjustValue(setOpenbox, 1)}
                  className="px-2 py-0.5 text-xs font-bold bg-white text-amber-700 hover:bg-amber-100 rounded border border-amber-200"
                >
                  +1
                </button>
                <button
                  type="button"
                  onClick={() => adjustValue(setOpenbox, 5)}
                  className="px-2 py-0.5 text-xs font-bold bg-white text-amber-700 hover:bg-amber-100 rounded border border-amber-200"
                >
                  +5
                </button>
              </div>
            </div>

            {/* ES */}
            <div className="bg-purple-50/40 border border-purple-100 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-purple-900 uppercase tracking-wider">
                  ES (Especial)
                </label>
                <span className="text-[10px] font-semibold bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded">
                  Qtd
                </span>
              </div>
              <input
                type="number"
                min="0"
                value={es === 0 ? '' : es}
                onChange={(e) => setEs(Math.max(0, parseInt(e.target.value, 10) || 0))}
                placeholder="0"
                className="w-full px-3 py-1.5 bg-white border border-purple-200 rounded-lg text-lg font-black text-purple-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-center"
              />
              <div className="flex items-center justify-center gap-1">
                <button
                  type="button"
                  onClick={() => adjustValue(setEs, -1)}
                  className="px-2 py-0.5 text-xs font-bold bg-white text-purple-700 hover:bg-purple-100 rounded border border-purple-200"
                >
                  -1
                </button>
                <button
                  type="button"
                  onClick={() => adjustValue(setEs, 1)}
                  className="px-2 py-0.5 text-xs font-bold bg-white text-purple-700 hover:bg-purple-100 rounded border border-purple-200"
                >
                  +1
                </button>
                <button
                  type="button"
                  onClick={() => adjustValue(setEs, 10)}
                  className="px-2 py-0.5 text-xs font-bold bg-white text-purple-700 hover:bg-purple-100 rounded border border-purple-200"
                >
                  +10
                </button>
              </div>
            </div>
          </div>

          {/* Total Preview Badge */}
          <div className="bg-slate-900 text-white rounded-xl p-4 flex items-center justify-between shadow-inner">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-5 h-5 text-amber-400" />
              <div>
                <span className="text-xs font-medium text-slate-300 block">Total Consolidado do Dia</span>
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
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Observações / Lote (Opcional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Carga recebida transportadora X, lote especial..."
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
            {initialData?.id && onDelete ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-3.5 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Excluir Dia</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-2"
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
