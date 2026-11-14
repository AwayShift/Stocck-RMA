/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  X, 
  Hash, 
  Copy, 
  Check, 
  Clock, 
  Tag, 
  Package, 
  AlertTriangle, 
  FileText, 
  CheckCircle2, 
  AlertOctagon, 
  Sparkles, 
  Layers, 
  ExternalLink,
  ChevronRight,
  Info,
  Calendar,
  Zap,
  Barcode,
  ShoppingBag,
  Flame,
  ArrowRight
} from 'lucide-react';
import { PendingItem, TriageUnit, BaseProduct } from '../types';
import { ImageZoomModal } from './ImageZoomModal';
import { cleanPendingReasonFromCustomerReason, cleanPendingBoilerplateFromNotes } from '../utils/pendingRegistrationHelper';
import { normalizeStiCode } from '../utils/stiFormatter';
import { sanitizeHtml } from '../utils/sanitizeHtml';

export interface PendingItemDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  pendingItem: PendingItem;
  linkedUnit?: TriageUnit | null;
  products?: BaseProduct[];
  isLight?: boolean;
  onNavigateToPendingTab?: (pendingId?: string) => void;
}

export const PendingItemDetailsModal: React.FC<PendingItemDetailsModalProps> = ({
  isOpen,
  onClose,
  pendingItem,
  linkedUnit,
  products = [],
  isLight = false,
  onNavigateToPendingTab
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [zoomIndex, setZoomIndex] = useState(0);

  if (!isOpen || !pendingItem) return null;

  const handleCopy = (text: string, key: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Pendente':
        return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
      case 'Em Análise':
        return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
      case 'Aguardando Peça':
        return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
      case 'Aguardando NF':
        return 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30';
      case 'Resolvido':
        return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
      case 'Cancelado':
        return 'bg-slate-500/15 text-slate-400 border-slate-500/30';
      default:
        return 'bg-slate-500/15 text-slate-300 border-slate-500/30';
    }
  };

  const getPriorityBadge = (prio?: string) => {
    switch (prio) {
      case 'Urgente':
        return {
          label: 'Urgente',
          className: 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-bold',
          icon: <Flame className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
        };
      case 'Alta':
        return {
          label: 'Alta Prioridade',
          className: 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold',
          icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
        };
      case 'Média':
        return {
          label: 'Média Prioridade',
          className: 'bg-sky-500/15 text-sky-300 border-sky-500/30 font-medium',
          icon: <Clock className="w-3.5 h-3.5 text-sky-400" />
        };
      case 'Baixa':
        return {
          label: 'Baixa Prioridade',
          className: 'bg-slate-500/15 text-slate-300 border-slate-500/30 font-medium',
          icon: <Info className="w-3.5 h-3.5 text-slate-400" />
        };
      default:
        return {
          label: 'Média Prioridade',
          className: 'bg-slate-500/15 text-slate-300 border-slate-500/30 font-medium',
          icon: <Info className="w-3.5 h-3.5 text-slate-400" />
        };
    }
  };

  const priority = getPriorityBadge(pendingItem.priority);
  const cleanCustomerReason = cleanPendingReasonFromCustomerReason(pendingItem.customerReason, pendingItem.pendingReason);
  const cleanNotes = cleanPendingBoilerplateFromNotes(pendingItem.detailedNotes);

  const matchedProduct = products.find(p => 
    (pendingItem.sku && p.sku && p.sku.toLowerCase() === pendingItem.sku.toLowerCase())
  );
  const displayProductName = pendingItem.productName || matchedProduct?.name || 'Produto Não Especificado';
  const displayVoltage = pendingItem.voltage || matchedProduct?.voltage || 'Bivolt';

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      id="modal-pending-item-details"
    >
      <div 
        className={`relative w-full max-w-3xl rounded-2xl border shadow-2xl overflow-hidden my-auto transition-all ${
          isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Gradient Accent */}
        <div className="h-1.5 w-full bg-linear-to-r from-sky-500 via-amber-500 to-rose-500" />

        {/* Modal Header */}
        <div className={`p-4 sm:p-5 border-b flex items-center justify-between gap-3 ${
          isLight ? 'bg-slate-50/80 border-slate-200' : 'bg-slate-950/60 border-slate-800'
        }`}>
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className={`p-2 rounded-xl border ${
              isLight ? 'bg-sky-100 text-sky-700 border-sky-300' : 'bg-sky-500/15 text-sky-400 border-sky-500/30'
            }`}>
              <AlertOctagon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Ficha da Pendência
                </span>
                {pendingItem.registrationNumber && (
                  <button
                    type="button"
                    onClick={(e) => handleCopy(pendingItem.registrationNumber!, 'reg-header', e)}
                    className="font-mono text-xs font-bold text-sky-400 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 px-2 py-0.5 rounded transition-all cursor-pointer flex items-center gap-1 group/btn"
                    title="Copiar número de registro"
                  >
                    <Hash className="w-3 h-3 text-sky-400" />
                    <span>{pendingItem.registrationNumber}</span>
                    {copiedKey === 'reg-header' ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3 opacity-60 group-hover/btn:opacity-100 transition-opacity" />
                    )}
                  </button>
                )}
                <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${getStatusBadge(pendingItem.status)}`}>
                  {pendingItem.status}
                </span>
                <span className={`text-[11px] px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${priority.className}`}>
                  {priority.icon}
                  <span>{priority.label}</span>
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-extrabold text-white line-clamp-1 mt-0.5">
                {displayProductName}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-xl border transition-colors cursor-pointer shrink-0 ${
              isLight 
                ? 'bg-white border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800' 
                : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-white'
            }`}
            title="Fechar"
            id="btn-close-pending-modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Linked Unit Alert Banner (if attached to stock) */}
          {linkedUnit && (
            <div className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
              isLight ? 'bg-emerald-50 border-emerald-300 text-emerald-950' : 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
            }`}>
              <div className="flex items-center gap-2.5 text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Vinculada à unidade física no setor <strong className="font-bold text-white uppercase bg-emerald-600 px-1.5 py-0.5 rounded text-[10px]">{linkedUnit.destinationSector}</strong>
                  {linkedUnit.trackingCode && (
                    <> (Código STI: <strong className="font-mono text-white">#{normalizeStiCode(linkedUnit.trackingCode)}</strong>)</>
                  )}
                  {linkedUnit.orderNumber && (
                    <> — Pedido: <strong className="font-mono text-white">{linkedUnit.orderNumber}</strong></>
                  )}
                </span>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 shrink-0">
                Vínculo Ativo 1:1
              </span>
            </div>
          )}

          {/* Grid: Identification Details */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {/* SKU */}
            <div className={`p-3 rounded-xl border ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800/80'
            }`}>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Código SKU
              </span>
              <div className="flex items-center justify-between gap-1">
                <span className="font-mono text-xs font-bold text-sky-400 truncate">
                  {pendingItem.sku || 'SEM SKU'}
                </span>
                {pendingItem.sku && (
                  <button
                    type="button"
                    onClick={(e) => handleCopy(pendingItem.sku, 'sku', e)}
                    className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
                    title="Copiar SKU"
                  >
                    {copiedKey === 'sku' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                )}
              </div>
            </div>

            {/* Serial Number */}
            <div className={`p-3 rounded-xl border ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800/80'
            }`}>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Nº de Série (S/N)
              </span>
              <div className="flex items-center justify-between gap-1">
                <span className="font-mono text-xs font-medium text-slate-200 truncate">
                  {pendingItem.serialNumber || 'Não informado'}
                </span>
                {pendingItem.serialNumber && (
                  <button
                    type="button"
                    onClick={(e) => handleCopy(pendingItem.serialNumber!, 'sn', e)}
                    className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
                    title="Copiar Serial"
                  >
                    {copiedKey === 'sn' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                )}
              </div>
            </div>

            {/* Order Number */}
            <div className={`p-3 rounded-xl border ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800/80'
            }`}>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Nº Pedido
              </span>
              <div className="flex items-center justify-between gap-1">
                <span className="font-mono text-xs font-bold text-sky-400 truncate">
                  {pendingItem.orderNumber || 'Não informado'}
                </span>
                {pendingItem.orderNumber && (
                  <button
                    type="button"
                    onClick={(e) => handleCopy(pendingItem.orderNumber!, 'order', e)}
                    className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
                    title="Copiar Pedido"
                  >
                    {copiedKey === 'order' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                )}
              </div>
            </div>

            {/* Platform & Voltage */}
            <div className={`p-3 rounded-xl border ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800/80'
            }`}>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Canal & Voltagem
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-bold text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 truncate">
                  {pendingItem.platform || 'Mercado Livre'}
                </span>
                <span className="text-[10px] font-medium text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                  {displayVoltage}
                </span>
              </div>
            </div>
          </div>

          {/* Pending Reason Box */}
          <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/5 space-y-1.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <span>Motivo da Pendência (Registro)</span>
            </h4>
            <p className="text-sm font-semibold text-rose-200">
              {pendingItem.pendingReason || 'Sem motivo de pendência especificado.'}
            </p>
          </div>

          {/* Customer Reason Box (if informed) */}
          {cleanCustomerReason && cleanCustomerReason !== pendingItem.pendingReason && (
            <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-1.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-amber-400" />
                <span>Motivo da Devolução / Reclamação do Cliente</span>
              </h4>
              <p className="text-sm text-slate-200 italic leading-relaxed">
                "{cleanCustomerReason}"
              </p>
            </div>
          )}

          {/* Device & Package Conditions + Accessories */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className={`p-3 rounded-xl border ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800/80'
            }`}>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Estado do Aparelho
              </span>
              <span className="text-xs font-semibold text-slate-200">
                {pendingItem.deviceStatus || 'Usado'}
              </span>
            </div>

            <div className={`p-3 rounded-xl border ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800/80'
            }`}>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Estado da Caixa / Embalagem
              </span>
              <span className="text-xs font-semibold text-slate-200">
                {pendingItem.packageStatus || 'Danificada'}
              </span>
            </div>

            <div className={`p-3 rounded-xl border ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800/80'
            }`}>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Acessórios Inclusos
              </span>
              <span className="text-xs font-semibold text-slate-200 line-clamp-1" title={pendingItem.accessories || 'Nenhum'}>
                {pendingItem.accessories || 'Nenhum acessório declarado'}
              </span>
            </div>
          </div>

          {/* Observations / Detailed Technical Notes */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-sky-400" />
              <span>Observações / Parecer da Pendência</span>
            </h4>
            <div className={`p-4 rounded-xl border text-sm leading-relaxed max-h-56 overflow-y-auto ${
              isLight ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800/80 text-slate-200'
            }`}>
              {cleanNotes && cleanNotes.trim() ? (
                cleanNotes.startsWith('<') ? (
                  <div 
                    className="prose prose-sm prose-invert"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(cleanNotes) }} 
                  />
                ) : (
                  <p className="whitespace-pre-line">{cleanNotes}</p>
                )
              ) : (
                <span className="text-slate-500 italic text-xs">
                  Nenhuma observação descritiva fornecida ao abrir a pendência.
                </span>
              )}
            </div>
          </div>

          {/* Resolution Details (if resolved) */}
          {pendingItem.status === 'Resolvido' && pendingItem.resolutionReason && (
            <div className="p-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 space-y-1.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Motivo / Detalhes da Resolução</span>
              </h4>
              <p className="text-sm font-semibold text-emerald-200 leading-relaxed">
                {pendingItem.resolutionReason}
              </p>
              {pendingItem.resolvedAt && (
                <span className="text-[10px] text-emerald-400/80 block mt-1">
                  Resolvido em: {new Date(pendingItem.resolvedAt).toLocaleString('pt-BR')}
                </span>
              )}
            </div>
          )}

          {/* Photos Gallery */}
          {pendingItem.photos && pendingItem.photos.length > 0 && (
            <div className="space-y-2 pt-1 border-t border-slate-800">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-sky-400" />
                <span>Fotos Anexadas na Pendência ({pendingItem.photos.length})</span>
              </h4>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {pendingItem.photos.map((url, i) => (
                  <div
                    key={i}
                    onClick={() => {
                      setZoomImage(url);
                      setZoomIndex(i);
                    }}
                    className="aspect-square rounded-xl overflow-hidden border border-slate-800 hover:border-sky-500 transition-all cursor-pointer group bg-slate-950 relative"
                  >
                    <img 
                      src={url} 
                      alt={`Foto da Pendência ${i + 1}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform" 
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-bold">
                      Ampliar
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timeline & Metadata */}
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400 flex-wrap gap-2">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span>
                Aberta em: <strong className="text-slate-200">{new Date(pendingItem.createdAt).toLocaleString('pt-BR')}</strong>
              </span>
            </div>
            {pendingItem.updatedAt && (
              <span className="text-slate-500">
                Última atualização: {new Date(pendingItem.updatedAt).toLocaleString('pt-BR')}
              </span>
            )}
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className={`p-4 border-t flex items-center justify-between gap-3 ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/80 border-slate-800'
        }`}>
          {onNavigateToPendingTab ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onNavigateToPendingTab(pendingItem.id);
              }}
              className="px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm shadow-sky-950/40"
              id="btn-goto-pending-tab"
            >
              <span>Ver na Aba de Pendências</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer border ${
              isLight 
                ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100' 
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white'
            }`}
          >
            Fechar
          </button>
        </div>
      </div>

      {/* Image Zoom Modal */}
      {zoomImage && (
        <ImageZoomModal
          isOpen={!!zoomImage}
          onClose={() => setZoomImage(null)}
          imageUrl={zoomImage}
          title={`Foto da Pendência ${pendingItem.registrationNumber || ''}`}
          imagesList={pendingItem.photos || []}
          initialIndex={zoomIndex}
        />
      )}
    </div>
  );
};
