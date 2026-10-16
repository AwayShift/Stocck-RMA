/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  Copy, 
  Check, 
  Clock, 
  ArrowRightLeft, 
  User, 
  Hash, 
  Tag, 
  Box, 
  Info, 
  FileText, 
  Sparkles, 
  GitCompare, 
  Eye, 
  Download, 
  Package, 
  ArrowRight, 
  Trash2, 
  RotateCcw, 
  Pencil 
} from 'lucide-react';
import { 
  TriageUnit, 
  DestinationSectorType, 
  PlatformType, 
  BaseProduct 
} from '../types';
import { 
  getUnitResolvedPhotos, 
  findBaseProduct, 
  getResolvedUnitProductName 
} from '../utils/productImages';
import { normalizeStiCode } from '../utils/stiFormatter';
import { isUnitPendingSkuRegistration, isRealStockTransfer } from './PhysicalStock';

export interface StockUnitDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  unit: TriageUnit;
  products?: BaseProduct[];
  units?: TriageUnit[];
  isLight?: boolean;
  enableSpreadsheetExport?: boolean;
  onStartEdit: (unit: TriageUnit) => void;
  onGoToStock: (unit: TriageUnit) => void;
  onQuickRegisterSku?: (unit: TriageUnit) => void;
  onCompareWithBase?: () => void;
  onMoveSector?: (unit: TriageUnit, targetSector: DestinationSectorType) => void;
  onExportExcel?: (units: TriageUnit[]) => void;
  onDelete?: (id: string) => void;
  onCheckout?: (id: string) => void;
  onRevertCheckout?: (id: string) => void;
  onOpenImageZoom?: (imageUrl: string, title: string, imagesList: string[], index: number) => void;
  isReadOnly?: boolean;
}

export function StockUnitDetailsModal({
  isOpen,
  onClose,
  unit,
  products = [],
  units = [],
  isLight = false,
  enableSpreadsheetExport = true,
  onStartEdit,
  onGoToStock,
  onQuickRegisterSku,
  onCompareWithBase,
  onMoveSector,
  onExportExcel,
  onDelete,
  onCheckout,
  onRevertCheckout,
  onOpenImageZoom,
  isReadOnly = false
}: StockUnitDetailsModalProps) {
  const [copiedCodeKey, setCopiedCodeKey] = useState<string | null>(null);
  const [editingSector, setEditingSector] = useState<DestinationSectorType | ''>('');

  if (!isOpen || !unit) return null;

  // Duplicate checks
  const isDuplicateSti = (u: TriageUnit) => {
    if (!u.trackingCode || !u.trackingCode.trim()) return false;
    const code = u.trackingCode.trim().toUpperCase();
    return units.filter(x => x.status === 'Estoque' && x.trackingCode && x.trackingCode.trim().toUpperCase() === code).length > 1;
  };

  const isDuplicateSerial = (u: TriageUnit) => {
    if (!u.serialNumber || !u.serialNumber.trim()) return false;
    const sn = u.serialNumber.trim().toUpperCase();
    return units.filter(x => x.status === 'Estoque' && x.serialNumber && x.serialNumber.trim().toUpperCase() === sn).length > 1;
  };

  const resolvedCurrentUnitSti = (() => {
    const rawSti = (unit as any).sti || unit.trackingCode;
    if (typeof rawSti === 'string' && rawSti.trim()) {
      return normalizeStiCode(rawSti);
    }
    return '';
  })();

  const handleCopyCode = (text: string, key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!text) return;
    try {
      navigator.clipboard.writeText(text);
      setCopiedCodeKey(key);
      setTimeout(() => setCopiedCodeKey(null), 2500);
    } catch (err) {
      console.warn('Clipboard write error:', err);
    }
  };

  const getDischargeDate = (u: TriageUnit): string | null => {
    if (u.checkoutDate) return u.checkoutDate;
    if (u.status === 'Baixado') return u.updatedAt || u.createdAt || null;
    return null;
  };

  const formatDischargeDateTime = (dateStr: string | null | undefined): string => {
    if (!dateStr) return 'Não informada';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return dateStr;
    }
  };

  const getPlatformStyle = (p?: PlatformType) => {
    switch (p) {
      case 'Mercado Livre': return 'bg-yellow-400/15 text-yellow-900 dark:text-yellow-300 dark:bg-yellow-400/20 border border-yellow-400/50 dark:border-yellow-400/60 font-bold shadow-sm shadow-yellow-500/10';
      case 'Shopee': return 'bg-orange-500/10 text-orange-800 dark:text-orange-400 border border-orange-500/30 font-medium';
      case 'Amazon': return 'bg-blue-500/10 text-sky-800 dark:text-blue-400 border border-blue-500/30 font-medium';
      case 'Amazon Ta Novo': return 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-400 border border-emerald-500/30 font-medium';
      case 'Kabum': return 'bg-indigo-500/10 text-indigo-800 dark:text-indigo-400 border border-indigo-500/30 font-medium';
      case 'Outros': return 'bg-slate-700/25 text-slate-800 dark:text-slate-200 border border-slate-600/60 font-bold';
      default: return 'bg-zinc-500/10 text-zinc-800 dark:text-zinc-400 border border-zinc-500/20 font-medium';
    }
  };

  return createPortal(
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 overflow-y-auto" 
      id="stock-details-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        className="w-full max-w-5xl bg-slate-900 border border-slate-800/60 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-4 sm:my-8 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className={`px-6 py-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/90 border-slate-800'
        }`}>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`font-mono text-xs font-black px-2.5 py-0.5 rounded-md flex items-center gap-1.5 border ${
                isLight 
                  ? 'bg-sky-50 border-sky-200 text-sky-700' 
                  : 'text-sky-400 bg-sky-500/15 border-sky-500/30'
              }`} title="Código SKU">
                <span className={`text-[10px] font-sans font-bold ${isLight ? 'text-sky-600' : 'text-sky-300/70'}`}>SKU</span>
                {unit.baseProductSku}
              </span>

              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-md border ${
                unit.destinationSector === 'Principal'
                  ? (isLight ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30')
                  : unit.destinationSector === 'Openbox'
                  ? (isLight ? 'bg-amber-50 text-amber-800 border-amber-300' : 'bg-amber-500/15 text-amber-300 border-amber-500/30')
                  : unit.destinationSector === 'Outros'
                  ? (isLight ? 'bg-indigo-50 text-indigo-800 border-indigo-300' : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30')
                  : (isLight ? 'bg-rose-50 text-rose-800 border-rose-300' : 'bg-rose-500/15 text-rose-300 border-rose-500/30')
              }`}>
                Setor: {unit.destinationSector}
              </span>

              {unit.status === 'Baixado' && (
                <span className={`text-xs font-black px-2.5 py-0.5 rounded-md border flex items-center gap-1.5 uppercase tracking-wider ${
                  isLight 
                    ? 'bg-rose-100 text-rose-900 border-rose-300' 
                    : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                }`}>
                  <CheckCircle2 className="w-3.5 h-3.5 text-rose-500" />
                  Baixado
                </span>
              )}
            </div>

            <h3 className={`text-lg sm:text-xl font-black tracking-tight pt-0.5 ${
              isLight ? 'text-slate-900' : 'text-white'
            }`}>
              {getResolvedUnitProductName(unit, products)}
            </h3>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            {/* Compare with Base button for products not in main stock */}
            {onCompareWithBase && unit.destinationSector !== 'Principal' && (
              <button 
                type="button"
                onClick={onCompareWithBase}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                  isLight
                    ? 'bg-sky-50 hover:bg-sky-100 text-sky-800 border-sky-300 shadow-2xs'
                    : 'bg-sky-950/60 hover:bg-sky-900/80 text-sky-300 border-sky-500/40 shadow-2xs'
                }`}
                title="Comparar fotos e descrição deste produto com o cadastro base original"
                id="btn-modal-compare-base-product"
              >
                <GitCompare className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="hidden sm:inline">Comparar com Base</span>
                <span className="sm:hidden">Comparar</span>
              </button>
            )}

            <button 
              type="button"
              onClick={() => onGoToStock(unit)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                isLight
                  ? 'bg-slate-100 hover:bg-sky-50 text-slate-700 hover:text-sky-800 border-slate-300 hover:border-sky-400 shadow-2xs'
                  : 'bg-slate-800 hover:bg-sky-950 text-slate-200 hover:text-sky-300 border-slate-700 hover:border-sky-500/50 shadow-2xs'
              }`}
              title="Fechar detalhes e ir diretamente para a posição deste produto no Estoque Físico"
              id="btn-modal-go-to-stock-header"
            >
              <Package className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span>Ir ao estoque</span>
              <ArrowRight className="w-3.5 h-3.5 opacity-70 shrink-0" />
            </button>

            {!isReadOnly && (
              <button 
                type="button"
                onClick={() => onStartEdit(unit)}
                className="px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-sky-600/20 flex items-center gap-1.5 cursor-pointer"
                title="Editar imagens, descrição, SKU e especificações do produto"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Editar Produto</span>
              </button>
            )}

            <button 
              type="button"
              onClick={onClose}
              className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                isLight 
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border-slate-300'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border-slate-800'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* SKU Pending Registration Warning Banner */}
        {isUnitPendingSkuRegistration(unit, products) && (
          <div className={`px-6 py-3.5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            isLight 
              ? 'bg-amber-50/95 border-amber-300 text-amber-950' 
              : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
          }`}>
            <div className="flex items-center gap-2.5">
              <div className={`p-1.5 rounded-lg shrink-0 border ${
                isLight ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-amber-500/20 text-amber-400 border-transparent'
              }`}>
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className={`text-xs ${isLight ? 'text-amber-950 font-black' : 'text-amber-300 font-bold'}`}>
                  SKU Pendente de Cadastro no Catálogo Base
                </h4>
                <p className={`text-[11px] ${isLight ? 'text-amber-900/90 font-medium' : 'text-amber-200/80'}`}>
                  Este produto deu entrada no estoque com o SKU <strong className={`font-mono ${isLight ? 'text-amber-950 font-black' : 'text-amber-300'}`}>"{unit.baseProductSku}"</strong> sem registro prévio na base.
                </p>
              </div>
            </div>
            {onQuickRegisterSku && (
              <button
                type="button"
                onClick={() => onQuickRegisterSku(unit)}
                className={`px-3.5 py-1.5 rounded-xl transition-all shrink-0 cursor-pointer shadow-md flex items-center justify-center gap-1.5 text-xs font-black ${
                  isLight 
                    ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-amber-500/20 border border-amber-400' 
                    : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
                }`}
              >
                <Tag className="w-3.5 h-3.5" />
                <span>Cadastrar SKU na Base</span>
              </button>
            )}
          </div>
        )}

        {/* Modal Body: VIEW MODE CONTENT */}
        <div className="p-6 sm:p-8 space-y-6 overflow-y-auto max-h-[75vh]">
          {/* Duplicate warning banner inside detail modal */}
          {(isDuplicateSti(unit) || isDuplicateSerial(unit)) && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-3 text-xs text-amber-200" id="unit-detail-duplicate-warning">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <p className="font-bold text-amber-300">Atenção: Identificado Código Repetido no Estoque Físico</p>
                <p className="text-[11px] text-amber-400/80 mt-0.5">
                  {isDuplicateSti(unit) && `O Código STI (#${unit.trackingCode}) já está cadastrado em outra unidade no estoque. `}
                  {isDuplicateSerial(unit) && `O Número de Série (S/N: ${unit.serialNumber}) já está cadastrado em outra unidade no estoque.`}
                </p>
              </div>
            </div>
          )}

          {/* Baixado info banner inside detail modal */}
          {unit.status === 'Baixado' && (
            <div className={`p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs border ${
              isLight 
                ? 'bg-rose-50 border-rose-200 text-rose-900' 
                : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
            }`} id="unit-detail-baixado-banner">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  isLight ? 'bg-rose-100 border border-rose-300' : 'bg-rose-600/20 border border-rose-500/40'
                }`}>
                  <CheckCircle2 className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <p className={`font-bold text-sm ${isLight ? 'text-rose-950' : 'text-rose-300'}`}>
                    Produto com Baixa Efetuada (Saída Física do Galpão)
                  </p>
                  <p className={`text-[11px] font-mono mt-0.5 ${isLight ? 'text-rose-800 font-semibold' : 'text-rose-300/90'}`}>
                    Data de Saída: <strong className={isLight ? 'text-rose-950 font-black' : 'text-white'}>{formatDischargeDateTime(getDischargeDate(unit))}</strong>
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full bg-rose-600 text-white font-black text-[10px] uppercase tracking-wider shrink-0 self-start sm:self-center shadow-xs">
                Saída Registrada
              </span>
            </div>
          )}

          {/* Technical Specifications Hero Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3 bg-slate-950 p-4 sm:p-5 border border-slate-800 rounded-2xl shadow-inner text-xs">
            {/* SKU */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Código SKU</span>
                <button
                  type="button"
                  onClick={(e) => handleCopyCode(unit.baseProductSku, 'sku', e)}
                  className={`text-[10px] flex items-center gap-1 font-bold px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                    copiedCodeKey === 'sku'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'text-slate-400 hover:text-sky-400 hover:bg-slate-900'
                  }`}
                  title="Copiar Código SKU"
                  id="btn-copy-sku"
                >
                  {copiedCodeKey === 'sku' ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-[9px]">Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span className="text-[9px]">Copiar</span>
                    </>
                  )}
                </button>
              </div>
              <button
                type="button"
                onClick={(e) => handleCopyCode(unit.baseProductSku, 'sku', e)}
                className="sku-badge w-full text-left font-mono text-xs sm:text-sm font-extrabold px-2.5 py-1.5 rounded-lg block truncate transition-colors cursor-pointer group flex items-center justify-between"
                title="Clique para copiar SKU"
              >
                <span className="truncate">{unit.baseProductSku}</span>
                <Copy className="w-3 h-3 opacity-0 group-hover:opacity-60 text-sky-400 transition-opacity ml-1 shrink-0" />
              </button>
            </div>

            {/* Serial Number */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Nº de Série (S/N)</span>
                {unit.serialNumber ? (
                  <button
                    type="button"
                    onClick={(e) => handleCopyCode(unit.serialNumber || '', 'serial', e)}
                    className={`text-[10px] flex items-center gap-1 font-bold px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                      copiedCodeKey === 'serial'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                    }`}
                    title="Copiar Nº de Série"
                    id="btn-copy-serial"
                  >
                    {copiedCodeKey === 'serial' ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-[9px]">Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span className="text-[9px]">Copiar</span>
                      </>
                    )}
                  </button>
                ) : null}
              </div>
              {unit.serialNumber ? (
                <button
                  type="button"
                  onClick={(e) => handleCopyCode(unit.serialNumber || '', 'serial', e)}
                  className="w-full text-left font-mono text-xs sm:text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 px-2.5 py-1.5 rounded-lg block truncate transition-colors cursor-pointer group flex items-center justify-between"
                  title="Clique para copiar Número de Série"
                >
                  <span className="truncate">{unit.serialNumber}</span>
                  <Copy className="w-3 h-3 opacity-0 group-hover:opacity-60 text-slate-300 transition-opacity ml-1 shrink-0" />
                </button>
              ) : (
                <span className="font-mono text-xs sm:text-sm font-bold px-2.5 py-1.5 rounded-lg border block truncate text-slate-500 bg-slate-900/50 border-slate-800/60 italic">
                  Não Informado
                </span>
              )}
            </div>

            {/* Voltage */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Voltagem</span>
              {unit.baseProductVoltage && unit.baseProductVoltage !== 'N/A' ? (
                <span className="font-mono text-xs sm:text-sm font-extrabold text-amber-300 bg-amber-500/10 px-2.5 py-1.5 rounded-lg border border-amber-500/25 block truncate">
                  {unit.baseProductVoltage}
                </span>
              ) : (
                <span className="font-mono text-xs sm:text-sm font-bold px-2.5 py-1.5 rounded-lg border block truncate text-slate-500 bg-slate-900/50 border-slate-800/60 italic">
                  Não informada
                </span>
              )}
            </div>

            {/* Sector */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Setor Físico</span>
              <span className={`text-xs font-bold px-2.5 py-1.5 rounded-lg border block truncate ${
                unit.destinationSector === 'Principal'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : unit.destinationSector === 'Openbox'
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
              }`}>
                {unit.destinationSector}
              </span>
              {isRealStockTransfer(unit.originSector) && (
                <div className="flex items-center gap-1 text-[10.5px] text-amber-400 font-semibold pt-0.5" title={`Transferido de ${unit.originSector}`}>
                  <ArrowRightLeft className="w-3 h-3 text-amber-400 shrink-0" />
                  <span>Origem: <strong className="text-amber-300 font-bold">{unit.originSector}</strong></span>
                </div>
              )}
            </div>
          </div>

          {/* Secondary metadata: Origin & Dates */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-slate-950/60 p-3.5 px-4 rounded-xl border border-slate-800/60">
            <div className="flex flex-wrap items-center gap-3">
              {unit.platform ? (
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-semibold text-[11px]">Plataforma / Canal:</span>
                  <span 
                    data-platform={unit.platform}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getPlatformStyle(unit.platform)}`}
                  >
                    {unit.platform}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-semibold text-[11px]">Plataforma / Canal:</span>
                  <span className="text-slate-500 text-[10px] italic">Não informada</span>
                </div>
              )}
              {unit.orderNumber && (
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400 font-semibold text-[11px]">Nº Pedido:</span>
                  <button
                    type="button"
                    onClick={(e) => handleCopyCode(unit.orderNumber || '', 'order', e)}
                    className="font-mono text-[11px] font-bold text-sky-400 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 px-2 py-0.5 rounded transition-colors cursor-pointer group flex items-center gap-1"
                    title="Clique para copiar Número do Pedido"
                  >
                    <span>{unit.orderNumber}</span>
                    <Copy className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100 transition-opacity" />
                  </button>
                </div>
              )}
              {Boolean(resolvedCurrentUnitSti) && (
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400 font-semibold text-[11px]">Código:</span>
                  <button
                    type="button"
                    onClick={(e) => handleCopyCode(resolvedCurrentUnitSti, 'sti-sub', e)}
                    className="font-mono text-[11px] font-bold text-sky-400 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 px-2 py-0.5 rounded transition-colors cursor-pointer group flex items-center gap-1"
                    title="Clique para copiar Código"
                  >
                    <span>#{resolvedCurrentUnitSti}</span>
                    <Copy className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100 transition-opacity" />
                  </button>
                </div>
              )}
              {(() => {
                const regCode = (unit.pendingRegistrationNumber || '').replace(/^#/, '').trim();
                if (!regCode) return null;
                return (
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 font-semibold text-[11px]">Nº de Registro:</span>
                    <button
                      type="button"
                      onClick={(e) => handleCopyCode(regCode, 'reg', e)}
                      className="font-mono text-[11px] font-bold text-sky-400 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 px-2 py-0.5 rounded transition-colors cursor-pointer group flex items-center gap-1"
                      title="Clique para copiar Número de Registro"
                      id="btn-copy-reg-bottom"
                    >
                      <Hash className="w-2.5 h-2.5 text-sky-400" />
                      <span>{regCode}</span>
                      <Copy className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100 transition-opacity" />
                    </button>
                  </div>
                );
              })()}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 text-slate-400">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <span>Data de Entrada: <strong className="text-slate-200">{new Date(unit.createdAt).toLocaleDateString('pt-BR')} às {new Date(unit.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</strong></span>
                </div>
                {isRealStockTransfer(unit.originSector) && (
                  <>
                    <span className="text-slate-600 hidden sm:inline">•</span>
                    <div className="flex items-center gap-1.5 text-amber-400" title={`Produto transferido do estoque ${unit.originSector}`}>
                      <ArrowRightLeft className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>Estoque de Origem: <strong className="text-amber-300 font-bold">{unit.originSector}</strong></span>
                    </div>
                  </>
                )}
                {unit.initialEntryDate && (
                  <>
                    <span className="text-slate-600 hidden sm:inline">•</span>
                    <div className="flex items-center gap-1.5 text-slate-400" title="Data do primeiro registro no sistema antes da transferência de estoque">
                      <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span>Entrada Inicial: <strong className="text-slate-200">{new Date(unit.initialEntryDate).toLocaleDateString('pt-BR')} às {new Date(unit.initialEntryDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</strong></span>
                    </div>
                  </>
                )}
                {unit.status === 'Baixado' && (
                  <>
                    <span className="text-slate-600 hidden sm:inline">•</span>
                    <div className="flex items-center gap-1.5 text-rose-400">
                      <CheckCircle2 className="w-3.5 h-3.5 text-rose-500" />
                      <span>Data de Saída: <strong className="text-rose-300 font-bold">{formatDischargeDateTime(getDischargeDate(unit))}</strong></span>
                    </div>
                  </>
                )}
                {unit.createdBy && (unit.createdBy.name || unit.createdBy.email) && (
                  <>
                    <span className="text-slate-600 hidden sm:inline">•</span>
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <User className="w-3.5 h-3.5 text-sky-400" />
                      <span>Entrada por: <strong className="text-sky-300 font-semibold">{unit.createdBy.name || unit.createdBy.email}</strong></span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Estado do Produto & Embalagem */}
            {(unit.deviceStatus || unit.packageStatus) && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {unit.deviceStatus && (
                  <div 
                    className={`px-2.5 py-1 rounded-xl text-xs font-medium inline-flex items-center gap-1.5 border shadow-sm ${
                      isLight 
                        ? 'bg-slate-100/90 border-slate-200/90 text-slate-600' 
                        : 'bg-slate-950/80 border-slate-800 text-slate-300'
                    }`}
                  >
                    <Tag className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>Prod: <strong className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{unit.deviceStatus}</strong></span>
                  </div>
                )}
                {unit.packageStatus && (
                  <div 
                    className={`px-2.5 py-1 rounded-xl text-xs font-medium inline-flex items-center gap-1.5 border shadow-sm ${
                      isLight 
                        ? 'bg-slate-100/90 border-slate-200/90 text-slate-600' 
                        : 'bg-slate-950/80 border-slate-800 text-slate-300'
                    }`}
                  >
                    <Box className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>Emb: <strong className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{unit.packageStatus}</strong></span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Claims and Accessories details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={`p-5 bg-slate-950/60 rounded-xl border border-slate-800/60 space-y-2.5 ${
              !unit.accessoriesInclusion || !unit.accessoriesInclusion.trim() ? 'md:col-span-2' : ''
            }`}>
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Motivo da Devolução / Entrada
              </h4>
              <p className="text-sm text-slate-200 leading-relaxed italic bg-slate-900/60 p-3.5 rounded-lg border border-slate-800/40">
                "{unit.customerReason || 'Sem motivo registrado.'}"
              </p>
            </div>

            {unit.accessoriesInclusion && unit.accessoriesInclusion.trim() !== '' && (
              <div className="p-5 bg-slate-950/60 rounded-xl border border-slate-800/60 space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-sky-400" />
                  Lista de Acessórios Recebidos
                </h4>
                <p className="text-sm text-slate-200 leading-relaxed bg-slate-900/60 p-3.5 rounded-lg border border-slate-800/40">
                  {unit.accessoriesInclusion}
                </p>
              </div>
            )}
          </div>

          {/* Technical Report / Observations HTML Render */}
          <div className="space-y-2.5" id="technical-report-view">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-sky-400" />
              Laudo Técnico de Entrada (Triador)
            </h4>
            {unit.notes ? (
              <div 
                className="p-5 bg-slate-950 border border-slate-800/60 rounded-xl text-sm text-slate-200 leading-relaxed max-h-64 overflow-y-auto prose prose-invert prose-sm"
                dangerouslySetInnerHTML={{ __html: unit.notes }}
              />
            ) : (
              <p className="p-5 text-xs text-slate-500 bg-slate-950 rounded-xl border border-slate-800/60 italic text-center">Sem laudo técnico descritivo fornecido.</p>
            )}
          </div>

          {/* Integrated Photo Gallery split by logical category */}
          {(() => {
            const resolved = getUnitResolvedPhotos(unit, products);
            return (
              <div className="space-y-3" id="photo-gallery-modal-view">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-sky-400" />
                    Galeria de Fotos da Triagem
                  </h4>
                  <div className="flex items-center gap-2">
                    {resolved.isUsingBaseProductImage && (
                      <span className="text-[10px] text-sky-400 bg-sky-500/10 border border-sky-500/30 px-2 py-0.5 rounded font-bold">
                        Vinculado ao Catálogo Base (Sem duplicação de dados)
                      </span>
                    )}
                    {unit.destinationSector !== 'Principal' && onCompareWithBase && (
                      <button
                        type="button"
                        onClick={onCompareWithBase}
                        className="px-2.5 py-1 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                        title="Comparar fotos e descrição com o produto cadastrado na base"
                        id="btn-gallery-compare-base"
                      >
                        <GitCompare className="w-3.5 h-3.5 text-sky-400" />
                        <span>Comparar com Base</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Category A: Product */}
                  <div className="p-4 bg-slate-950/40 rounded-xl border border-slate-800/60 space-y-2.5">
                    <span className="text-xs font-bold text-slate-300 block border-b border-slate-800 pb-1.5">
                      Fotos do Aparelho ({resolved.photosProduct.length})
                    </span>
                    {resolved.photosProduct.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2">
                        {resolved.photosProduct.map((p, i) => (
                          <div 
                            key={i} 
                            onClick={() => onOpenImageZoom && onOpenImageZoom(p, `Fotos do Aparelho - ${unit.baseProductName}`, resolved.photosProduct, i)}
                            className="w-full aspect-video rounded-lg overflow-hidden border border-slate-700 hover:border-sky-500 cursor-pointer relative group transition-colors photo-container-clean !bg-white flex items-center justify-center p-1 shadow-sm"
                            style={{ backgroundColor: '#ffffff' }}
                          >
                            <img src={p} className="w-full h-full object-contain" alt={`Aparelho ${i + 1}`} />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs transition-opacity rounded-lg">
                              <Eye className="w-4 h-4" />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic py-4 text-center">Nenhuma foto do aparelho.</p>
                    )}
                  </div>

                  {/* Category B: Packaging / Box */}
                  <div className="p-4 bg-slate-950/40 rounded-xl border border-slate-800/60 space-y-2.5">
                    <span className="text-xs font-bold text-slate-300 block border-b border-slate-800 pb-1.5">
                      Fotos da Embalagem ({resolved.photosBox.length})
                    </span>
                    {resolved.photosBox.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2">
                        {resolved.photosBox.map((p, i) => (
                          <div 
                            key={i} 
                            onClick={() => onOpenImageZoom && onOpenImageZoom(p, `Fotos da Embalagem - ${unit.baseProductName}`, resolved.photosBox, i)}
                            className="w-full aspect-video rounded-lg overflow-hidden border border-slate-700 hover:border-sky-500 cursor-pointer relative group transition-colors photo-container-clean !bg-white flex items-center justify-center p-1 shadow-sm"
                            style={{ backgroundColor: '#ffffff' }}
                          >
                            <img src={p} className="w-full h-full object-contain" alt={`Embalagem ${i + 1}`} />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs transition-opacity rounded-lg">
                              <Eye className="w-4 h-4" />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic py-4 text-center">Nenhuma foto da caixa.</p>
                    )}
                  </div>

                  {/* Category C: Accessories */}
                  <div className="p-4 bg-slate-950/40 rounded-xl border border-slate-800/60 space-y-2.5">
                    <span className="text-xs font-bold text-slate-300 block border-b border-slate-800 pb-1.5">
                      Fotos dos Acessórios ({resolved.photosAccessories.length})
                    </span>
                    {resolved.photosAccessories.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2">
                        {resolved.photosAccessories.map((p, i) => (
                          <div 
                            key={i} 
                            onClick={() => onOpenImageZoom && onOpenImageZoom(p, `Fotos dos Acessórios - ${unit.baseProductName}`, resolved.photosAccessories, i)}
                            className="w-full aspect-video rounded-lg overflow-hidden border border-slate-700 hover:border-sky-500 cursor-pointer relative group transition-colors photo-container-clean !bg-white flex items-center justify-center p-1 shadow-sm"
                            style={{ backgroundColor: '#ffffff' }}
                          >
                            <img src={p} className="w-full h-full object-contain" alt={`Acessório ${i + 1}`} />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs transition-opacity rounded-lg">
                              <Eye className="w-4 h-4" />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic py-4 text-center">Nenhuma foto de acessórios.</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Checkout details if already dispatched */}
          {unit.status === 'Baixado' && unit.checkoutDate && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>Este produto foi retirado física e logicamente do galpão em <strong>{new Date(unit.checkoutDate).toLocaleString('pt-BR')}</strong>.</span>
            </div>
          )}
        </div>

        {/* Modal Action Controls Bar */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800/60 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          {/* Left Side Actions: Re-route / Move Sector (only if active in stock and not read-only) */}
          {isReadOnly ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 text-xs font-semibold">
              <Eye className="w-3.5 h-3.5 text-sky-400" />
              <span>Modo Somente Leitura (Alterações Bloqueadas)</span>
            </div>
          ) : unit.status === 'Estoque' && onMoveSector ? (
            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <span className="text-xs font-bold text-slate-400 whitespace-nowrap">Mover de Setor:</span>
              <select 
                value={editingSector || unit.destinationSector}
                onChange={(e) => {
                  const target = e.target.value as DestinationSectorType;
                  setEditingSector(target);
                  onMoveSector(unit, target);
                }}
                className="px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-bold focus:outline-none cursor-pointer"
                style={{
                  color: (editingSector || unit.destinationSector) === 'Principal' ? '#10B981' : (editingSector || unit.destinationSector) === 'Openbox' ? '#F59E0B' : (editingSector || unit.destinationSector) === 'Outros' ? '#818CF8' : '#EF4444'
                }}
                id="select-change-sector"
              >
                <option value="Principal" style={{ color: '#10B981', backgroundColor: '#0f172a' }}>🟢 Principal (Venda Novo)</option>
                <option value="Openbox" style={{ color: '#F59E0B', backgroundColor: '#0f172a' }}>🟠 Openbox (Outlet)</option>
                <option value="RMA" style={{ color: '#EF4444', backgroundColor: '#0f172a' }}>🔴 RMA (Fila Técnica)</option>
                <option value="Outros" style={{ color: '#818CF8', backgroundColor: '#0f172a' }}>🟣 Outros (Estoque Geral)</option>
              </select>
            </div>
          ) : (
            <div className="text-slate-500 text-xs">Ações indisponíveis para produtos baixados.</div>
          )}

          {/* Right Side Actions: Export, Ir ao estoque, Excluir & Checkout/Revert */}
          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            {enableSpreadsheetExport && onExportExcel && (
              <button 
                type="button"
                onClick={() => onExportExcel([unit])}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                title="Exportar este produto para planilha Excel (.xlsx)"
                id="btn-modal-export-unit"
              >
                <Download className="w-3.5 h-3.5 text-sky-400" />
                <span>Exportar Excel</span>
              </button>
            )}

            <button 
              type="button"
              onClick={() => onGoToStock(unit)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                isLight
                  ? 'bg-slate-100 hover:bg-sky-50 text-slate-700 hover:text-sky-800 border-slate-300 hover:border-sky-400 shadow-2xs'
                  : 'bg-slate-800 hover:bg-sky-950 text-slate-200 hover:text-sky-300 border-slate-700 hover:border-sky-500/50 shadow-2xs'
              }`}
              title="Fechar detalhes e ir diretamente para a posição deste produto no Estoque Físico"
              id="btn-modal-go-to-stock-footer"
            >
              <Package className="w-3.5 h-3.5 text-sky-400" />
              <span>Ir ao estoque</span>
              <ArrowRight className="w-3.5 h-3.5 opacity-70" />
            </button>

            {!isReadOnly && onDelete && (
              <button 
                onClick={() => onDelete(unit.id)}
                className="px-3.5 py-2 bg-slate-800 hover:bg-rose-600/20 text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                title="Apagar ficha técnica do banco"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Excluir Registro
              </button>
            )}

            {!isReadOnly && (
              unit.status === 'Estoque' && onCheckout ? (
                <button 
                  onClick={() => onCheckout(unit.id)}
                  className="px-4.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-lg shadow-emerald-600/20 flex items-center gap-1.5 transition-all cursor-pointer"
                  id="btn-stock-checkout"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Dar Baixa de Estoque
                </button>
              ) : onRevertCheckout ? (
                <button 
                  onClick={() => onRevertCheckout(unit.id)}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-black shadow-lg shadow-amber-600/20 flex items-center gap-1.5 transition-all cursor-pointer"
                  id="btn-stock-revert-checkout"
                  title="Reverter a baixa e retornar este produto para o estoque ativo"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reverter Baixa
                </button>
              ) : null
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
