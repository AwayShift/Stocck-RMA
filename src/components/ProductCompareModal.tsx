/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  GitCompare, 
  Eye, 
  Package, 
  Box, 
  Check, 
  AlertTriangle, 
  Tag, 
  Sparkles, 
  Search, 
  Copy, 
  CheckCircle2, 
  Info, 
  FileText, 
  Zap, 
  ExternalLink,
  ChevronDown,
  Layers,
  ArrowRightLeft
} from 'lucide-react';
import { BaseProduct } from '../types';
import { getBaseProductImages } from '../utils/productImages';
import { ImageZoomModal } from './ImageZoomModal';

export interface SelectedProductData {
  id?: string;
  name: string;
  sku: string;
  serialNumber?: string;
  voltage?: string;
  destinationSector?: string;
  originSector?: string;
  platform?: string;
  orderNumber?: string;
  trackingCode?: string;
  registrationNumber?: string;
  deviceStatus?: string;
  packageStatus?: string;
  customerReason?: string;
  accessoriesInclusion?: string;
  notes?: string; // HTML description / technical report
  photosProduct?: string[];
  photosBox?: string[];
  photosAccessories?: string[];
  photosGeneral?: string[]; // E.g. pending items with general photo list
}

interface ProductCompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProduct: SelectedProductData;
  baseProduct?: BaseProduct | null;
  allBaseProducts?: BaseProduct[];
  isLight?: boolean;
}

export default function ProductCompareModal({
  isOpen,
  onClose,
  selectedProduct,
  baseProduct: initialBaseProduct,
  allBaseProducts = [],
  isLight = false,
}: ProductCompareModalProps) {
  const isLightMode = isLight || (typeof document !== 'undefined' && (document.documentElement.classList.contains('light') || document.body.classList.contains('light')));
  // Matched base product state (allows searching/switching if needed)
  const [currentBaseProduct, setCurrentBaseProduct] = useState<BaseProduct | null | undefined>(initialBaseProduct);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Active photo categories view (Product, Box, Accessories)
  const [activeSelectedPhotoTab, setActiveSelectedPhotoTab] = useState<'all' | 'product' | 'box' | 'accessories'>('all');
  const [activeBasePhotoTab, setActiveBasePhotoTab] = useState<'all' | 'product' | 'box' | 'accessories'>('all');

  // Zoom modal state
  const [zoomImage, setZoomImage] = useState<{
    url: string;
    title: string;
    list: string[];
    index: number;
  } | null>(null);

  // Copied indicator
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Reset base product when props change
  useEffect(() => {
    setCurrentBaseProduct(initialBaseProduct);
  }, [initialBaseProduct]);

  // If initialBaseProduct was null, try to auto-find in allBaseProducts by SKU
  useEffect(() => {
    if (!currentBaseProduct && selectedProduct.sku && allBaseProducts.length > 0) {
      const cleanSku = selectedProduct.sku.trim().toLowerCase();
      const match = allBaseProducts.find(p => p.sku && p.sku.trim().toLowerCase() === cleanSku);
      if (match) {
        setCurrentBaseProduct(match);
      }
    }
  }, [selectedProduct.sku, allBaseProducts, currentBaseProduct]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        if (zoomImage) {
          setZoomImage(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, zoomImage, onClose]);

  // Copy helper
  const handleCopy = (text: string, key: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Base product images
  const baseImages = useMemo(() => {
    if (!currentBaseProduct) {
      return { main: null, productPhotos: [], boxPhotos: [], accessoriesPhotos: [] };
    }
    return getBaseProductImages(currentBaseProduct);
  }, [currentBaseProduct]);

  // Selected product photos
  const selectedPhotos = useMemo(() => {
    const pProd = selectedProduct.photosProduct || [];
    const pBox = selectedProduct.photosBox || [];
    const pAcc = selectedProduct.photosAccessories || [];
    const pGen = selectedProduct.photosGeneral || [];

    const all = [...pProd, ...pBox, ...pAcc, ...pGen];
    return {
      product: pProd,
      box: pBox,
      accessories: pAcc,
      general: pGen,
      all
    };
  }, [selectedProduct]);

  // Filtered search list for base products
  const filteredBaseProducts = useMemo(() => {
    if (!searchQuery.trim()) return allBaseProducts.slice(0, 15);
    const q = searchQuery.toLowerCase().trim();
    return allBaseProducts.filter(p => 
      (p.sku && p.sku.toLowerCase().includes(q)) || 
      (p.name && p.name.toLowerCase().includes(q))
    ).slice(0, 20);
  }, [allBaseProducts, searchQuery]);

  if (!isOpen) return null;

  return createPortal(
    <div 
      className={`fixed inset-0 z-[110] flex items-center justify-center p-2 sm:p-4 md:p-6 animate-in fade-in duration-150 ${
        isLightMode ? 'bg-white/75' : 'bg-black/85'
      }`}
      id="product-compare-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        className={`w-full max-w-6xl max-h-[94vh] flex flex-col rounded-2xl shadow-2xl border overflow-hidden animate-in fade-in zoom-in-95 duration-150 ${
          isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
        }`}
        id="product-compare-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`px-5 py-3.5 border-b flex items-center justify-between gap-3 shrink-0 ${
          isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
        }`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
              <GitCompare className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className={`text-sm sm:text-base font-black truncate ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                  Comparação com Cadastro Base
                </h3>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${
                  selectedProduct.destinationSector === 'Openbox'
                    ? (isLightMode ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-amber-500/20 text-amber-300 border-amber-500/30')
                    : selectedProduct.destinationSector === 'RMA'
                    ? (isLightMode ? 'bg-rose-100 text-rose-800 border-rose-300' : 'bg-rose-500/20 text-rose-300 border-rose-500/30')
                    : selectedProduct.destinationSector === 'Outros'
                    ? (isLightMode ? 'bg-indigo-100 text-indigo-800 border-indigo-300' : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30')
                    : (isLightMode ? 'bg-slate-100 text-slate-700 border-slate-300' : 'bg-slate-800 text-slate-300 border-slate-700')
                }`}>
                  Setor: {selectedProduct.destinationSector || 'Não Principal'}
                </span>
                <span className="font-mono text-[11px] font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/25">
                  SKU: {selectedProduct.sku}
                </span>
              </div>
              <p className={`text-[11px] truncate mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                Compare as fotos físicas e laudo da unidade com as especificações e fotos cadastradas no catálogo original.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Quick Switch / Change Base Product button */}
            <button
              type="button"
              onClick={() => setIsSearchOpen(v => !v)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                isSearchOpen
                  ? (isLightMode ? 'bg-sky-100 text-sky-800 border-sky-300' : 'bg-sky-500/20 text-sky-300 border-sky-500/40')
                  : (isLightMode ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200' : 'bg-slate-800 hover:bg-slate-750 text-slate-300 border-slate-700')
              }`}
              title="Pesquisar ou trocar produto base para comparar"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Trocar Base</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className={`p-1.5 rounded-xl transition-colors cursor-pointer border ${
                isLight 
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border-slate-200' 
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border-slate-700'
              }`}
              title="Fechar comparação (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Change Base Product Drawer / Selector if toggled */}
        {isSearchOpen && (
          <div className={`p-4 border-b space-y-3 animate-in fade-in duration-150 ${
            isLightMode ? 'bg-sky-50/60 border-sky-200' : 'bg-sky-950/40 border-sky-500/30'
          }`}>
            <div className="flex items-center justify-between gap-3">
              <span className={`text-xs font-bold ${isLightMode ? 'text-sky-900' : 'text-sky-300'}`}>
                Selecionar outro produto cadastrado no Catálogo Base para comparar:
              </span>
              <button 
                type="button"
                onClick={() => setIsSearchOpen(false)}
                className="text-[11px] text-slate-400 hover:text-white font-bold cursor-pointer"
              >
                Fechar busca
              </button>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por SKU ou Nome do produto no catálogo..."
                className={`w-full pl-9 pr-3 py-2 rounded-xl text-xs font-bold border focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                  isLight 
                    ? 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400' 
                    : 'bg-slate-900 border-slate-700 text-white placeholder:text-slate-500'
                }`}
                autoFocus
              />
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
              {filteredBaseProducts.length > 0 ? (
                filteredBaseProducts.map((p) => {
                  const isSelected = currentBaseProduct?.id === p.id;
                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        setCurrentBaseProduct(p);
                        setIsSearchOpen(false);
                      }}
                      className={`p-2 rounded-lg text-xs flex items-center justify-between gap-3 cursor-pointer transition-colors border ${
                        isSelected 
                          ? (isLightMode ? 'bg-sky-100 border-sky-300 text-sky-900 font-bold' : 'bg-sky-500/20 border-sky-500/40 text-sky-300 font-bold')
                          : (isLightMode ? 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800' : 'bg-slate-900 hover:bg-slate-850 border-slate-800 text-slate-200')
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="font-mono font-bold text-sky-400 shrink-0">{p.sku}</span>
                        <span className="truncate">{p.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {p.voltage && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                            {p.voltage}
                          </span>
                        )}
                        {isSelected && <Check className="w-3.5 h-3.5 text-sky-400" />}
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-slate-400 italic py-2 text-center">Nenhum produto cadastrado encontrado com esse termo.</p>
              )}
            </div>
          </div>
        )}

        {/* Modal Scrollable Body: Side-by-Side 2-Column Comparison */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">

          {/* Quick Match Indicator Banner */}
          <div className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-3 text-xs ${
            currentBaseProduct
              ? (isLightMode ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-slate-950/70 border-slate-800 text-slate-300')
              : (isLightMode ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-amber-500/10 border-amber-500/30 text-amber-300')
          }`}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-sky-400" />
                <span>Status da Vinculação:</span>
              </span>
              {currentBaseProduct ? (
                <span className="inline-flex items-center gap-1 font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded text-[11px]">
                  <CheckCircle2 className="w-3 h-3" />
                  Vinculado ao Produto Base (SKU: {currentBaseProduct.sku})
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 font-bold text-amber-400 bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 rounded text-[11px]">
                  <AlertTriangle className="w-3 h-3" />
                  Nenhum cadastro base correspondente ao SKU "{selectedProduct.sku}". Use o botão "Trocar Base" acima para comparar manualmente.
                </span>
              )}
            </div>

            {/* Quick Spec Match Chips */}
            {currentBaseProduct && (
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-slate-400">Verificação:</span>
                <span className={`px-2 py-0.5 rounded font-mono font-bold border ${
                  selectedProduct.sku.trim().toLowerCase() === currentBaseProduct.sku.trim().toLowerCase()
                    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                    : 'text-rose-400 bg-rose-500/10 border-rose-500/30'
                }`}>
                  SKU: {selectedProduct.sku === currentBaseProduct.sku ? 'Igual' : 'Diferente'}
                </span>
                {selectedProduct.voltage && currentBaseProduct.voltage && (
                  <span className={`px-2 py-0.5 rounded font-mono font-bold border ${
                    selectedProduct.voltage.trim().toLowerCase() === currentBaseProduct.voltage.trim().toLowerCase()
                      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                      : 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                  }`}>
                    Voltagem: {selectedProduct.voltage === currentBaseProduct.voltage ? 'Igual' : 'Diferente'}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Side-by-Side 2-Column Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            
            {/* ========================================================
                LEFT COLUMN: 📦 PRODUTO SELECIONADO (FÍSICO / TRIAGEM)
               ======================================================== */}
            <div className={`rounded-2xl border p-4 sm:p-5 space-y-4 flex flex-col ${
              isLightMode ? 'bg-slate-50/70 border-slate-300' : 'bg-slate-950/80 border-slate-800'
            }`}>
              {/* Column Header */}
              <div className="border-b pb-3 flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-sky-500/15 text-sky-400 border border-sky-500/30 flex items-center gap-1">
                      <Package className="w-3 h-3" />
                      Produto Selecionado
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                      selectedProduct.destinationSector === 'Openbox'
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        : selectedProduct.destinationSector === 'RMA'
                        ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                        : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                    }`}>
                      Setor: {selectedProduct.destinationSector || 'Não Principal'}
                    </span>
                  </div>
                  <h4 className={`text-base font-extrabold truncate leading-tight ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                    {selectedProduct.name}
                  </h4>
                  <div className="flex items-center gap-2 flex-wrap text-xs text-slate-400 pt-0.5">
                    <span className="font-mono font-bold text-sky-400">SKU: {selectedProduct.sku}</span>
                    {selectedProduct.serialNumber && (
                      <>
                        <span>•</span>
                        <span className="font-mono text-slate-300">S/N: {selectedProduct.serialNumber}</span>
                      </>
                    )}
                    {selectedProduct.voltage && (
                      <>
                        <span>•</span>
                        <span className="text-amber-400 font-bold">{selectedProduct.voltage}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Physical Condition Badges */}
              {(selectedProduct.deviceStatus || selectedProduct.packageStatus) && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {selectedProduct.deviceStatus && (
                    <span className={`px-2.5 py-1 rounded-lg border font-medium flex items-center gap-1.5 ${
                      isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-200'
                    }`}>
                      <Tag className="w-3 h-3 text-amber-400" />
                      <span>Aparelho: <strong className="font-bold">{selectedProduct.deviceStatus}</strong></span>
                    </span>
                  )}
                  {selectedProduct.packageStatus && (
                    <span className={`px-2.5 py-1 rounded-lg border font-medium flex items-center gap-1.5 ${
                      isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-200'
                    }`}>
                      <Box className="w-3 h-3 text-amber-400" />
                      <span>Embalagem: <strong className="font-bold">{selectedProduct.packageStatus}</strong></span>
                    </span>
                  )}
                  {selectedProduct.platform && (
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                      isLightMode ? 'bg-white border-slate-300 text-slate-600' : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}>
                      {selectedProduct.platform}
                    </span>
                  )}
                </div>
              )}

              {/* Secondary Codes: Order, STI, and Registration Number */}
              {(selectedProduct.orderNumber || selectedProduct.trackingCode || selectedProduct.registrationNumber) && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {selectedProduct.orderNumber && (
                    <span className={`px-2 py-0.5 rounded text-[10.5px] font-mono font-bold border flex items-center gap-1 ${
                      isLightMode ? 'bg-white border-slate-300 text-slate-700' : 'bg-slate-900 border-slate-800 text-slate-300'
                    }`}>
                      <span className="text-slate-400 font-sans font-semibold">Ped:</span>
                      <span className="text-sky-400">{selectedProduct.orderNumber}</span>
                    </span>
                  )}
                  {selectedProduct.trackingCode && (
                    <span className={`px-2 py-0.5 rounded text-[10.5px] font-mono font-bold border flex items-center gap-1 ${
                      isLightMode ? 'bg-white border-slate-300 text-slate-700' : 'bg-slate-900 border-slate-800 text-slate-300'
                    }`}>
                      <span className="text-slate-400 font-sans font-semibold">Código STI:</span>
                      <span className="text-sky-400">{selectedProduct.trackingCode}</span>
                    </span>
                  )}
                  {selectedProduct.registrationNumber && (
                    <span className={`px-2 py-0.5 rounded text-[10.5px] font-mono font-bold border flex items-center gap-1 ${
                      isLightMode ? 'bg-white border-slate-300 text-slate-700' : 'bg-slate-900 border-slate-800 text-slate-300'
                    }`}>
                      <span className="text-slate-400 font-sans font-semibold">Nº de Registro:</span>
                      <span className="text-sky-400">{selectedProduct.registrationNumber}</span>
                    </span>
                  )}
                </div>
              )}

              {/* SECTION: Selected Product Photo Gallery */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-sky-400" />
                    Fotos da Unidade / Triagem ({selectedPhotos.all.length})
                  </span>
                  
                  {/* Photo Filter Tabs */}
                  {selectedPhotos.all.length > 0 && (
                    <div className="flex items-center gap-1 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setActiveSelectedPhotoTab('all')}
                        className={`px-2 py-0.5 rounded font-bold cursor-pointer transition-colors ${
                          activeSelectedPhotoTab === 'all'
                            ? 'bg-sky-500 text-white'
                            : 'text-slate-400 hover:text-white bg-slate-900'
                        }`}
                      >
                        Todas ({selectedPhotos.all.length})
                      </button>
                      {selectedPhotos.product.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setActiveSelectedPhotoTab('product')}
                          className={`px-2 py-0.5 rounded font-bold cursor-pointer transition-colors ${
                            activeSelectedPhotoTab === 'product'
                              ? 'bg-sky-500 text-white'
                              : 'text-slate-400 hover:text-white bg-slate-900'
                          }`}
                        >
                          Aparelho ({selectedPhotos.product.length})
                        </button>
                      )}
                      {selectedPhotos.box.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setActiveSelectedPhotoTab('box')}
                          className={`px-2 py-0.5 rounded font-bold cursor-pointer transition-colors ${
                            activeSelectedPhotoTab === 'box'
                              ? 'bg-sky-500 text-white'
                              : 'text-slate-400 hover:text-white bg-slate-900'
                          }`}
                        >
                          Caixa ({selectedPhotos.box.length})
                        </button>
                      )}
                      {selectedPhotos.accessories.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setActiveSelectedPhotoTab('accessories')}
                          className={`px-2 py-0.5 rounded font-bold cursor-pointer transition-colors ${
                            activeSelectedPhotoTab === 'accessories'
                              ? 'bg-sky-500 text-white'
                              : 'text-slate-400 hover:text-white bg-slate-900'
                          }`}
                        >
                          Acessórios ({selectedPhotos.accessories.length})
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Grid of photos */}
                {selectedPhotos.all.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {(() => {
                      const listToDisplay = activeSelectedPhotoTab === 'product'
                        ? selectedPhotos.product
                        : activeSelectedPhotoTab === 'box'
                        ? selectedPhotos.box
                        : activeSelectedPhotoTab === 'accessories'
                        ? selectedPhotos.accessories
                        : selectedPhotos.all;

                      return listToDisplay.map((photoUrl, idx) => (
                        <div
                          key={idx}
                          onClick={() => setZoomImage({
                            url: photoUrl,
                            title: `Foto ${idx + 1} - ${selectedProduct.name} (${selectedProduct.sku})`,
                            list: listToDisplay,
                            index: idx
                          })}
                          className="group relative aspect-video rounded-xl overflow-hidden border border-slate-700/80 hover:border-sky-500 bg-white cursor-pointer transition-all flex items-center justify-center p-1 shadow-sm"
                        >
                          <img 
                            src={photoUrl} 
                            alt={`Foto da unidade ${idx + 1}`} 
                            className="w-full h-full object-contain transition-transform group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                            <div className="p-1.5 rounded-lg bg-slate-900/80 text-white flex items-center gap-1 text-[10px] font-bold">
                              <Eye className="w-3.5 h-3.5 text-sky-400" />
                              <span>Ampliar</span>
                            </div>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                ) : (
                  <div className={`p-6 rounded-xl border border-dashed text-center text-xs italic ${
                    isLightMode ? 'bg-white border-slate-300 text-slate-400' : 'bg-slate-900/50 border-slate-800 text-slate-500'
                  }`}>
                    Nenhuma foto física registrada para esta unidade.
                  </div>
                )}
              </div>

              {/* SECTION: Selected Product Accessories received */}
              <div className="space-y-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Box className="w-3.5 h-3.5 text-sky-400" />
                  Acessórios Recebidos na Devolução / Entrada
                </span>
                <div className={`p-3 rounded-xl border text-xs leading-relaxed ${
                  isLightMode ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900/80 border-slate-800 text-slate-200'
                }`}>
                  {selectedProduct.accessoriesInclusion && selectedProduct.accessoriesInclusion.trim() !== '' ? (
                    <span>{selectedProduct.accessoriesInclusion}</span>
                  ) : (
                    <span className="text-slate-400 italic">Sem especificação de acessórios recebidos.</span>
                  )}
                </div>
              </div>

              {/* SECTION: Return Reason */}
              {selectedProduct.customerReason && selectedProduct.customerReason.trim() !== '' && (
                <div className="space-y-1.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Motivo da Devolução Informado
                  </span>
                  <div className={`p-3 rounded-xl border text-xs italic leading-relaxed ${
                    isLightMode ? 'bg-amber-50/60 border-amber-200 text-amber-950' : 'bg-slate-900/80 border-slate-800 text-slate-300'
                  }`}>
                    "{selectedProduct.customerReason}"
                  </div>
                </div>
              )}

              {/* SECTION: Technical Report / Laudo / Notes */}
              <div className="space-y-1.5 flex-1">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-sky-400" />
                  Laudo Técnico / Observações da Triagem
                </span>
                <div className={`p-3.5 rounded-xl border text-xs leading-relaxed max-h-56 overflow-y-auto prose prose-invert prose-xs ${
                  isLightMode ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-200'
                }`}>
                  {selectedProduct.notes && selectedProduct.notes.trim() !== '' && selectedProduct.notes !== '<p><br></p>' ? (
                    <div dangerouslySetInnerHTML={{ __html: selectedProduct.notes }} />
                  ) : (
                    <span className="text-slate-400 italic">Sem laudo técnico descritivo registrado.</span>
                  )}
                </div>
              </div>
            </div>

            {/* ========================================================
                RIGHT COLUMN: 🏷️ PRODUTO CADASTRADO (CATÁLOGO BASE OFICIAL)
               ======================================================== */}
            <div className={`rounded-2xl border p-4 sm:p-5 space-y-4 flex flex-col ${
              isLightMode ? 'bg-sky-50/30 border-sky-200' : 'bg-slate-950/80 border-slate-800 ring-1 ring-sky-500/20'
            }`}>
              {currentBaseProduct ? (
                <>
                  {/* Column Header */}
                  <div className="border-b pb-3 flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Cadastro Base Oficial
                        </span>
                        {currentBaseProduct.brand && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                            isLightMode ? 'bg-white border-slate-200 text-slate-700' : 'bg-slate-900 border-slate-800 text-slate-300'
                          }`}>
                            Marca: {currentBaseProduct.brand}
                          </span>
                        )}
                        {currentBaseProduct.category && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                            isLightMode ? 'bg-white border-slate-200 text-slate-700' : 'bg-slate-900 border-slate-800 text-slate-300'
                          }`}>
                            {currentBaseProduct.category}
                          </span>
                        )}
                      </div>
                      <h4 className={`text-base font-extrabold truncate leading-tight ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                        {currentBaseProduct.name}
                      </h4>
                      <div className="flex items-center gap-2 flex-wrap text-xs text-slate-400 pt-0.5">
                        <span className="font-mono font-bold text-sky-400">SKU Oficial: {currentBaseProduct.sku}</span>
                        {currentBaseProduct.voltage && (
                          <>
                            <span>•</span>
                            <span className="text-amber-400 font-bold">{currentBaseProduct.voltage}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* SECTION: Base Product Photo Gallery */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                        Fotos Oficiais do Catálogo ({
                          baseImages.productPhotos.length + baseImages.boxPhotos.length + baseImages.accessoriesPhotos.length
                        })
                      </span>

                      {/* Photo Filter Tabs */}
                      <div className="flex items-center gap-1 text-[10px]">
                        <button
                          type="button"
                          onClick={() => setActiveBasePhotoTab('all')}
                          className={`px-2 py-0.5 rounded font-bold cursor-pointer transition-colors ${
                            activeBasePhotoTab === 'all'
                              ? 'bg-emerald-600 text-white'
                              : 'text-slate-400 hover:text-white bg-slate-900'
                          }`}
                        >
                          Todas
                        </button>
                        {baseImages.productPhotos.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setActiveBasePhotoTab('product')}
                            className={`px-2 py-0.5 rounded font-bold cursor-pointer transition-colors ${
                              activeBasePhotoTab === 'product'
                                ? 'bg-emerald-600 text-white'
                                : 'text-slate-400 hover:text-white bg-slate-900'
                            }`}
                          >
                            Produto ({baseImages.productPhotos.length})
                          </button>
                        )}
                        {baseImages.boxPhotos.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setActiveBasePhotoTab('box')}
                            className={`px-2 py-0.5 rounded font-bold cursor-pointer transition-colors ${
                              activeBasePhotoTab === 'box'
                                ? 'bg-emerald-600 text-white'
                                : 'text-slate-400 hover:text-white bg-slate-900'
                            }`}
                          >
                            Caixa ({baseImages.boxPhotos.length})
                          </button>
                        )}
                        {baseImages.accessoriesPhotos.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setActiveBasePhotoTab('accessories')}
                            className={`px-2 py-0.5 rounded font-bold cursor-pointer transition-colors ${
                              activeBasePhotoTab === 'accessories'
                                ? 'bg-emerald-600 text-white'
                                : 'text-slate-400 hover:text-white bg-slate-900'
                            }`}
                          >
                            Acessórios ({baseImages.accessoriesPhotos.length})
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Grid of official photos */}
                    {(() => {
                      const allBaseList = [
                        ...baseImages.productPhotos,
                        ...baseImages.boxPhotos,
                        ...baseImages.accessoriesPhotos
                      ];

                      const listToDisplay = activeBasePhotoTab === 'product'
                        ? baseImages.productPhotos
                        : activeBasePhotoTab === 'box'
                        ? baseImages.boxPhotos
                        : activeBasePhotoTab === 'accessories'
                        ? baseImages.accessoriesPhotos
                        : allBaseList;

                      return listToDisplay.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {listToDisplay.map((photoUrl, idx) => (
                            <div
                              key={idx}
                              onClick={() => setZoomImage({
                                url: photoUrl,
                                title: `Foto Oficial ${idx + 1} - ${currentBaseProduct.name} (${currentBaseProduct.sku})`,
                                list: listToDisplay,
                                index: idx
                              })}
                              className="group relative aspect-video rounded-xl overflow-hidden border border-emerald-500/30 hover:border-emerald-400 bg-white cursor-pointer transition-all flex items-center justify-center p-1 shadow-sm"
                            >
                              <img 
                                src={photoUrl} 
                                alt={`Foto catálogo ${idx + 1}`} 
                                className="w-full h-full object-contain transition-transform group-hover:scale-105"
                              />
                              <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                                <div className="p-1.5 rounded-lg bg-emerald-950/80 text-emerald-300 flex items-center gap-1 text-[10px] font-bold">
                                  <Eye className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>Ampliar</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className={`p-6 rounded-xl border border-dashed text-center text-xs italic ${
                          isLightMode ? 'bg-white border-slate-300 text-slate-400' : 'bg-slate-900/50 border-slate-800 text-slate-500'
                        }`}>
                          Nenhuma foto cadastrada no produto base.
                        </div>
                      );
                    })()}
                  </div>

                  {/* SECTION: Official accessories list from BaseProduct */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                      <Box className="w-3.5 h-3.5" />
                      Lista Oficial de Acessórios de Fábrica
                    </span>
                    <div className={`p-3 rounded-xl border text-xs leading-relaxed ${
                      isLightMode ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900/80 border-slate-800 text-slate-200'
                    }`}>
                      {currentBaseProduct.accessories && currentBaseProduct.accessories.trim() !== '' ? (
                        <div className="flex items-start gap-2">
                          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          <span>{currentBaseProduct.accessories}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Nenhum acessório especificado no cadastro original.</span>
                      )}
                    </div>
                  </div>

                  {/* SECTION: Official Product Description */}
                  <div className="space-y-1.5 flex-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-emerald-400" />
                      Descrição Oficial Cadastrada no Catálogo
                    </span>
                    <div className={`p-3.5 rounded-xl border text-xs leading-relaxed max-h-56 overflow-y-auto prose prose-invert prose-xs ${
                      isLightMode ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-200'
                    }`}>
                      {currentBaseProduct.description && 
                       currentBaseProduct.description.trim() !== '' && 
                       currentBaseProduct.description !== '<p><br></p>' ? (
                        <div dangerouslySetInnerHTML={{ __html: currentBaseProduct.description }} />
                      ) : (
                        <span className="text-slate-400 italic">Sem descrição técnica cadastrada no catálogo.</span>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                /* No base product matched state */
                <div className="py-16 px-6 text-center space-y-3 my-auto">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-200">
                    Nenhum Produto Base Encontrado para o SKU "{selectedProduct.sku}"
                  </h4>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    Este item não possui um cadastro correspondente no Catálogo Base ou o SKU foi inserido de forma diferente.
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsSearchOpen(true)}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold shadow-md inline-flex items-center gap-1.5 cursor-pointer transition-all mt-2"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>Buscar e Selecionar Produto Manualmente</span>
                  </button>
                </div>
              )}
            </div>

          </div>

          {/* Quick Comparison Checklist / Diff Bar */}
          {currentBaseProduct && (
            <div className={`p-4 rounded-xl border space-y-2.5 ${
              isLightMode ? 'bg-slate-100/70 border-slate-300' : 'bg-slate-950 border-slate-800'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <GitCompare className="w-4 h-4 text-sky-400" />
                  Conferência de Acessórios & Itens Inclusos
                </span>
                <span className="text-[11px] text-slate-400">
                  Verifique se o produto devolvido possui todos os itens de fábrica
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className={`p-2.5 rounded-lg border ${
                  isLightMode ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-200'
                }`}>
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block mb-1">
                    Recebido na Unidade Física ({selectedProduct.destinationSector || 'Triagem'}):
                  </span>
                  <p className="italic">
                    {selectedProduct.accessoriesInclusion || 'Nenhum acessório listado.'}
                  </p>
                </div>

                <div className={`p-2.5 rounded-lg border ${
                  isLightMode ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-200'
                }`}>
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block mb-1">
                    Padrão Original de Fábrica (Catálogo):
                  </span>
                  <p>
                    {currentBaseProduct.accessories || 'Nenhum acessório original especificado.'}
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className={`px-5 py-3 border-t flex items-center justify-between gap-3 shrink-0 ${
          isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
        }`}>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Info className="w-3.5 h-3.5 text-sky-400" />
            <span>Dica: Clique em qualquer foto para abrir em alta resolução com rotação e zoom.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer border ${
              isLight
                ? 'bg-slate-200 hover:bg-slate-300 text-slate-800 border-slate-300'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
          >
            Fechar Comparação
          </button>
        </div>
      </div>

      {/* Lightbox Image Zoom */}
      {zoomImage && (
        <ImageZoomModal
          isOpen={true}
          onClose={() => setZoomImage(null)}
          imageUrl={zoomImage.url}
          imageTitle={zoomImage.title}
          imagesList={zoomImage.list}
          currentIndex={zoomImage.index}
          onNavigate={(newIdx) => {
            if (zoomImage.list[newIdx]) {
              setZoomImage({
                ...zoomImage,
                url: zoomImage.list[newIdx],
                index: newIdx
              });
            }
          }}
        />
      )}
    </div>,
    document.body
  );
}
