/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Search, 
  X, 
  Package, 
  Clock, 
  Database, 
  CornerDownLeft, 
  ArrowRight, 
  ChevronRight,
  Hash
} from 'lucide-react';
import { TriageUnit, PendingItem, BaseProduct } from '../types';
import { normalizeStiCode } from '../utils/stiFormatter';
import { areOrdersMatching, normalizeOrderComparable } from '../utils/orderPlatformHelper';

interface GlobalSearchBarProps {
  units: TriageUnit[];
  pendingItems: PendingItem[];
  products: BaseProduct[];
  onSelectUnit: (unit: TriageUnit) => void;
  onSelectPendingItem: (item: PendingItem) => void;
  onSelectProduct: (product: BaseProduct) => void;
  onSearchSubmitToStock: (searchTerm: string) => void;
  isLight?: boolean;
}

export function GlobalSearchBar({
  units,
  pendingItems,
  products,
  onSelectUnit,
  onSelectPendingItem,
  onSelectProduct,
  onSearchSubmitToStock,
  isLight = false
}: GlobalSearchBarProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<'all' | 'units' | 'pending' | 'catalog'>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global shortcut (Cmd+K / Ctrl+K) to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      } else if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Click outside listener to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter logic across Units, Pending Items, and Catalog Products
  const searchResults = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) {
      return { units: [], pending: [], catalog: [], total: 0 };
    }

    const lower = trimmed.toLowerCase();
    const cleanOrder = normalizeOrderComparable(trimmed);
    const cleanSti = normalizeStiCode(trimmed).toLowerCase();
    const digitsOnly = trimmed.replace(/\D/g, '');

    // 1. Triage Units (Estoque Físico)
    const matchedUnits = units.filter(unit => {
      // Order number
      if (unit.orderNumber) {
        if (areOrdersMatching(unit.orderNumber, trimmed)) return true;
        if (unit.orderNumber.toLowerCase().includes(lower)) return true;
        if (cleanOrder && unit.orderNumber.toLowerCase().includes(cleanOrder)) return true;
        if (digitsOnly.length >= 5 && unit.orderNumber.replace(/\D/g, '').includes(digitsOnly)) return true;
      }
      // Tracking / STI
      if (unit.trackingCode) {
        if (unit.trackingCode.toLowerCase().includes(lower)) return true;
        if (normalizeStiCode(unit.trackingCode).toLowerCase().includes(cleanSti)) return true;
      }
      // Pending Registration / ID
      if (unit.pendingRegistrationNumber && unit.pendingRegistrationNumber.toLowerCase().includes(lower)) return true;
      if (unit.pendingItemId && unit.pendingItemId === trimmed) return true;
      if (unit.id.toLowerCase() === lower) return true;
      // Serial Number
      if (unit.serialNumber && unit.serialNumber.toLowerCase().includes(lower)) return true;
      // SKU & Name
      if (unit.baseProductSku && unit.baseProductSku.toLowerCase().includes(lower)) return true;
      if (unit.baseProductName && unit.baseProductName.toLowerCase().includes(lower)) return true;
      // Customer Reason / Notes / Platform
      if (unit.platform && unit.platform.toLowerCase().includes(lower)) return true;
      if (unit.customerReason && unit.customerReason.toLowerCase().includes(lower)) return true;
      return false;
    }).slice(0, 10);

    // 2. Pending Items (Pendências)
    const matchedPending = pendingItems.filter(item => {
      if (item.orderNumber) {
        if (areOrdersMatching(item.orderNumber, trimmed)) return true;
        if (item.orderNumber.toLowerCase().includes(lower)) return true;
        if (cleanOrder && item.orderNumber.toLowerCase().includes(cleanOrder)) return true;
        if (digitsOnly.length >= 5 && item.orderNumber.replace(/\D/g, '').includes(digitsOnly)) return true;
      }
      if (item.registrationNumber && item.registrationNumber.toLowerCase().includes(lower)) return true;
      if (item.trackingCode) {
        if (item.trackingCode.toLowerCase().includes(lower)) return true;
        if (normalizeStiCode(item.trackingCode).toLowerCase().includes(cleanSti)) return true;
      }
      if (item.serialNumber && item.serialNumber.toLowerCase().includes(lower)) return true;
      if (item.sku && item.sku.toLowerCase().includes(lower)) return true;
      if (item.productName && item.productName.toLowerCase().includes(lower)) return true;
      if (item.pendingReason && item.pendingReason.toLowerCase().includes(lower)) return true;
      if (item.id === trimmed) return true;
      return false;
    }).slice(0, 8);

    // 3. Base Catalog Products (Catálogo)
    const matchedCatalog = products.filter(product => {
      if (product.sku && product.sku.toLowerCase().includes(lower)) return true;
      if (product.name && product.name.toLowerCase().includes(lower)) return true;
      if (product.brand && product.brand.toLowerCase().includes(lower)) return true;
      if (product.category && product.category.toLowerCase().includes(lower)) return true;
      return false;
    }).slice(0, 6);

    const total = matchedUnits.length + matchedPending.length + matchedCatalog.length;
    return {
      units: matchedUnits,
      pending: matchedPending,
      catalog: matchedCatalog,
      total
    };
  }, [query, units, pendingItems, products]);

  // Flattened items list according to current tab filter for keyboard navigation
  const flatDisplayItems = useMemo(() => {
    const list: Array<{ type: 'unit' | 'pending' | 'product'; data: any }> = [];
    if (activeCategoryFilter === 'all' || activeCategoryFilter === 'units') {
      searchResults.units.forEach(u => list.push({ type: 'unit', data: u }));
    }
    if (activeCategoryFilter === 'all' || activeCategoryFilter === 'pending') {
      searchResults.pending.forEach(p => list.push({ type: 'pending', data: p }));
    }
    if (activeCategoryFilter === 'all' || activeCategoryFilter === 'catalog') {
      searchResults.catalog.forEach(c => list.push({ type: 'product', data: c }));
    }
    return list;
  }, [searchResults, activeCategoryFilter]);

  // Reset selected item on query or tab change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, activeCategoryFilter]);

  const handleClear = () => {
    setQuery('');
    setIsOpen(false);
  };

  const handleSelectUnit = (unit: TriageUnit) => {
    onSelectUnit(unit);
    setIsOpen(false);
  };

  const handleSelectPending = (item: PendingItem) => {
    onSelectPendingItem(item);
    setIsOpen(false);
  };

  const handleSelectProduct = (product: BaseProduct) => {
    onSelectProduct(product);
    setIsOpen(false);
  };

  const handleSubmitSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    // If an item is highlighted by arrow keys, select it
    if (flatDisplayItems.length > 0 && flatDisplayItems[selectedIndex]) {
      const selected = flatDisplayItems[selectedIndex];
      if (selected.type === 'unit') handleSelectUnit(selected.data);
      else if (selected.type === 'pending') handleSelectPending(selected.data);
      else if (selected.type === 'product') handleSelectProduct(selected.data);
      return;
    }

    // Default: submit search query directly to PhysicalStock
    onSearchSubmitToStock(query.trim());
    setIsOpen(false);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % Math.max(1, flatDisplayItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + flatDisplayItems.length) % Math.max(1, flatDisplayItems.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmitSearch();
    }
  };

  const getSectorBadge = (sector?: string, status?: string) => {
    if (status === 'Baixado') {
      return isLight
        ? { text: 'Baixado', bg: 'bg-purple-100 text-purple-900 border-purple-300 font-bold' }
        : { text: 'Baixado', bg: 'bg-purple-500/20 text-purple-300 border-purple-500/40' };
    }
    const s = (sector || 'Principal').toLowerCase();
    if (s === 'openbox') {
      return isLight
        ? { text: 'Openbox', bg: 'bg-amber-100 text-amber-900 border-amber-300 font-bold' }
        : { text: 'Openbox', bg: 'bg-amber-500/20 text-amber-300 border-amber-500/40' };
    }
    if (s === 'rma') {
      return isLight
        ? { text: 'RMA', bg: 'bg-rose-100 text-rose-800 border-rose-300 font-bold' }
        : { text: 'RMA', bg: 'bg-rose-500/20 text-rose-300 border-rose-500/40' };
    }
    return isLight
      ? { text: 'Principal', bg: 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold' }
      : { text: 'Principal', bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' };
  };

  return (
    <div ref={containerRef} className="relative flex-1 max-w-md lg:max-w-lg" id="global-search-container">
      {/* Search Input Bar */}
      <form onSubmit={handleSubmitSearch} className="relative w-full">
        <div className={`relative flex items-center rounded-xl border transition-all duration-200 ${
          isOpen
            ? isLight
              ? 'bg-white border-sky-600 ring-2 ring-sky-500/25 shadow-md'
              : 'bg-slate-900 border-sky-500 ring-2 ring-sky-500/20 shadow-lg shadow-sky-500/10'
            : isLight
              ? 'bg-slate-50 border-slate-300 hover:border-slate-400 shadow-xs'
              : 'bg-slate-950/80 border-slate-800 hover:border-slate-700 shadow-inner'
        }`}>
          <Search className={`w-4 h-4 ml-3.5 shrink-0 transition-colors ${
            isOpen 
              ? (isLight ? 'text-sky-600' : 'text-sky-400') 
              : (isLight ? 'text-slate-500' : 'text-slate-400')
          }`} />

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!isOpen && e.target.value.trim().length >= 1) {
                setIsOpen(true);
              }
            }}
            onFocus={() => {
              if (query.trim().length >= 1) {
                setIsOpen(true);
              }
            }}
            onKeyDown={handleInputKeyDown}
            placeholder="Buscar pedido, STI, serial, SKU..."
            className={`w-full bg-transparent px-3 py-2 text-xs sm:text-sm focus:outline-none font-medium ${
              isLight 
                ? 'text-slate-900 placeholder-slate-500 font-semibold' 
                : 'text-slate-100 placeholder-slate-400'
            }`}
            id="global-search-input"
            autoComplete="off"
            spellCheck="false"
          />

          {/* Quick Clear or Keyboard Shortcut badge */}
          <div className="flex items-center gap-1.5 pr-2.5 shrink-0">
            {query ? (
              <button
                type="button"
                onClick={handleClear}
                className={`p-1 rounded-md transition-colors cursor-pointer ${
                  isLight 
                    ? 'text-slate-500 hover:text-slate-800 hover:bg-slate-200' 
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
                title="Limpar busca"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <kbd className={`hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded select-none shadow-xs border ${
                isLight 
                  ? 'bg-slate-200 border-slate-300 text-slate-600 font-bold' 
                  : 'bg-slate-800/80 border-slate-700/80 text-slate-400'
              }`}>
                <span className="text-[9px]">⌘</span>K
              </kbd>
            )}
          </div>
        </div>
      </form>

      {/* Floating Results Dropdown Modal */}
      {isOpen && query.trim().length >= 2 && (
        <div 
          className={`absolute left-0 right-0 top-full mt-2 rounded-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150 max-h-[85vh] flex flex-col border ${
            isLight
              ? 'bg-white border-slate-200 shadow-2xl shadow-slate-900/15'
              : 'bg-slate-900 border-slate-800 shadow-2xl'
          }`}
          id="global-search-dropdown"
        >
          {/* Category Filter Chips Bar */}
          <div 
            className={`flex items-center gap-1.5 p-2.5 text-xs overflow-x-auto scrollbar-none border-b ${
              isLight 
                ? 'bg-slate-100/90 border-slate-200' 
                : 'bg-slate-950 border-slate-800'
            }`}
            id="global-search-filter-bar"
          >
            {/* Tab: Todos */}
            <button
              type="button"
              onClick={() => setActiveCategoryFilter('all')}
              className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeCategoryFilter === 'all'
                  ? 'bg-sky-600 text-white shadow-xs shadow-sky-600/20'
                  : isLight
                    ? 'text-slate-700 hover:text-slate-950 hover:bg-slate-200/90 border border-transparent'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/80 border border-transparent'
              }`}
            >
              <span>Todos</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                activeCategoryFilter === 'all'
                  ? 'bg-sky-700 text-white'
                  : isLight
                    ? 'bg-slate-200 text-slate-700 border border-slate-300/80'
                    : 'bg-slate-800 text-slate-400'
              }`}>
                {searchResults.total}
              </span>
            </button>

            {/* Tab: Estoque */}
            <button
              type="button"
              onClick={() => setActiveCategoryFilter('units')}
              className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeCategoryFilter === 'units'
                  ? 'bg-emerald-600 text-white shadow-xs shadow-emerald-600/20'
                  : isLight
                    ? 'text-slate-700 hover:text-slate-950 hover:bg-slate-200/90 border border-transparent'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/80 border border-transparent'
              }`}
            >
              <Package className={`w-3.5 h-3.5 ${
                activeCategoryFilter === 'units' 
                  ? 'text-white' 
                  : (isLight ? 'text-emerald-700' : 'text-emerald-400')
              }`} />
              <span>Estoque</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                activeCategoryFilter === 'units'
                  ? 'bg-emerald-700 text-white'
                  : isLight
                    ? 'bg-slate-200 text-slate-700 border border-slate-300/80'
                    : 'bg-slate-800 text-slate-400'
              }`}>
                {searchResults.units.length}
              </span>
            </button>

            {/* Tab: Pendências */}
            <button
              type="button"
              onClick={() => setActiveCategoryFilter('pending')}
              className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeCategoryFilter === 'pending'
                  ? 'bg-amber-600 text-white shadow-xs shadow-amber-600/20'
                  : isLight
                    ? 'text-slate-700 hover:text-slate-950 hover:bg-slate-200/90 border border-transparent'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/80 border border-transparent'
              }`}
            >
              <Clock className={`w-3.5 h-3.5 ${
                activeCategoryFilter === 'pending' 
                  ? 'text-white' 
                  : (isLight ? 'text-amber-700' : 'text-amber-400')
              }`} />
              <span>Pendências</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                activeCategoryFilter === 'pending'
                  ? 'bg-amber-700 text-white'
                  : isLight
                    ? 'bg-slate-200 text-slate-700 border border-slate-300/80'
                    : 'bg-slate-800 text-slate-400'
              }`}>
                {searchResults.pending.length}
              </span>
            </button>

            {/* Tab: Catálogo */}
            <button
              type="button"
              onClick={() => setActiveCategoryFilter('catalog')}
              className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeCategoryFilter === 'catalog'
                  ? 'bg-indigo-600 text-white shadow-xs shadow-indigo-600/20'
                  : isLight
                    ? 'text-slate-700 hover:text-slate-950 hover:bg-slate-200/90 border border-transparent'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/80 border border-transparent'
              }`}
            >
              <Database className={`w-3.5 h-3.5 ${
                activeCategoryFilter === 'catalog' 
                  ? 'text-white' 
                  : (isLight ? 'text-indigo-700' : 'text-sky-400')
              }`} />
              <span>Catálogo</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                activeCategoryFilter === 'catalog'
                  ? 'bg-indigo-700 text-white'
                  : isLight
                    ? 'bg-slate-200 text-slate-700 border border-slate-300/80'
                    : 'bg-slate-800 text-slate-400'
              }`}>
                {searchResults.catalog.length}
              </span>
            </button>
          </div>

          {/* Results List */}
          <div className={`overflow-y-auto p-1.5 max-h-[60vh] scrollbar-thin divide-y ${
            isLight ? 'divide-slate-200' : 'divide-slate-800/60'
          }`}>
            {searchResults.total === 0 ? (
              <div className="py-10 px-4 text-center space-y-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center mx-auto ${
                  isLight ? 'bg-slate-100 text-slate-500' : 'bg-slate-800 text-slate-400'
                }`}>
                  <Search className="w-5 h-5 opacity-70" />
                </div>
                <div>
                  <p className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    Nenhum resultado encontrado
                  </p>
                  <p className={`text-xs mt-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                    Não encontramos unidades, pendências ou produtos para &ldquo;{query}&rdquo;.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleSubmitSearch()}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border transition-colors cursor-pointer ${
                    isLight 
                      ? 'bg-slate-100 hover:bg-slate-200 text-sky-700 border-slate-300' 
                      : 'bg-slate-800 hover:bg-slate-750 text-sky-400 border-slate-700'
                  }`}
                >
                  <span>Filtrar no Estoque Físico</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <>
                {/* 1. Estoque Físico Group */}
                {(activeCategoryFilter === 'all' || activeCategoryFilter === 'units') && searchResults.units.length > 0 && (
                  <div className="py-1">
                    <div className={`px-3 py-1.5 text-[10px] uppercase tracking-wider flex items-center gap-1.5 ${
                      isLight ? 'text-emerald-700 font-extrabold' : 'text-emerald-400 font-bold'
                    }`}>
                      <Package className="w-3 h-3" />
                      <span>Estoque Físico ({searchResults.units.length})</span>
                    </div>

                    <div className="space-y-1">
                      {searchResults.units.map((unit) => {
                        const sBadge = getSectorBadge(unit.destinationSector, unit.status);
                        const isSelected = flatDisplayItems[selectedIndex]?.data?.id === unit.id;

                        return (
                          <div
                            key={unit.id}
                            onClick={() => handleSelectUnit(unit)}
                            className={`p-2.5 rounded-xl cursor-pointer transition-all flex items-center justify-between gap-3 group border ${
                              isSelected
                                ? isLight
                                  ? 'bg-sky-50 border-sky-300 shadow-xs'
                                  : 'bg-sky-500/15 border-sky-500/50'
                                : isLight
                                  ? 'hover:bg-slate-100/80 border-transparent'
                                  : 'hover:bg-slate-800/80 border-transparent'
                            }`}
                          >
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${sBadge.bg}`}>
                                  {sBadge.text}
                                </span>

                                {unit.orderNumber && (
                                  <span className={`font-mono text-xs font-extrabold px-1.5 py-0.5 rounded border flex items-center gap-1 ${
                                    isLight
                                      ? 'bg-sky-100 text-sky-800 border-sky-300'
                                      : 'bg-sky-950/40 text-sky-300 border-sky-500/30'
                                  }`}>
                                    <Hash className="w-3 h-3 opacity-80" />
                                    Ped: {unit.orderNumber}
                                  </span>
                                )}

                                {unit.trackingCode && (
                                  <span className={`font-mono text-[11px] font-bold px-1.5 py-0.5 rounded border ${
                                    isLight
                                      ? 'bg-slate-100 text-slate-800 border-slate-300'
                                      : 'bg-slate-950 text-slate-300 border-slate-800'
                                  }`}>
                                    {normalizeStiCode(unit.trackingCode)}
                                  </span>
                                )}

                                {unit.serialNumber && (
                                  <span className={`font-mono text-[11px] px-1.5 py-0.5 rounded border ${
                                    isLight
                                      ? 'bg-slate-100 text-slate-700 border-slate-300 font-medium'
                                      : 'bg-slate-950 text-slate-400 border-slate-800'
                                  }`} title="Número de Série">
                                    S/N: {unit.serialNumber}
                                  </span>
                                )}
                              </div>

                              <p className={`text-xs font-bold truncate transition-colors ${
                                isLight 
                                  ? 'text-slate-900 group-hover:text-sky-700' 
                                  : 'text-white group-hover:text-sky-300'
                              }`}>
                                {unit.baseProductName || 'Produto sem nome'}
                              </p>

                              <div className={`flex items-center gap-2 text-[11px] flex-wrap ${
                                isLight ? 'text-slate-600' : 'text-slate-400'
                              }`}>
                                <span className={`font-mono font-semibold ${
                                  isLight ? 'text-slate-800' : 'text-slate-300'
                                }`}>
                                  SKU: {unit.baseProductSku}
                                </span>
                                {unit.platform && <span>• {unit.platform}</span>}
                                {unit.customerReason && <span className="truncate max-w-[200px] opacity-80">• {unit.customerReason}</span>}
                              </div>
                            </div>

                            <div className={`shrink-0 flex items-center gap-1 transition-all ${
                              isLight 
                                ? 'text-slate-500 group-hover:text-sky-700 font-semibold' 
                                : 'text-slate-500 group-hover:text-sky-400'
                            }`}>
                              <span className="text-[10px] font-bold hidden sm:inline">Ver no Estoque</span>
                              <ChevronRight className="w-4 h-4" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 2. Pendências Group */}
                {(activeCategoryFilter === 'all' || activeCategoryFilter === 'pending') && searchResults.pending.length > 0 && (
                  <div className="py-1">
                    <div className={`px-3 py-1.5 text-[10px] uppercase tracking-wider flex items-center gap-1.5 ${
                      isLight ? 'text-amber-800 font-extrabold' : 'text-amber-400 font-bold'
                    }`}>
                      <Clock className="w-3 h-3" />
                      <span>Pendências ({searchResults.pending.length})</span>
                    </div>

                    <div className="space-y-1">
                      {searchResults.pending.map((item) => {
                        const isSelected = flatDisplayItems[selectedIndex]?.data?.id === item.id;

                        return (
                          <div
                            key={item.id}
                            onClick={() => handleSelectPending(item)}
                            className={`p-2.5 rounded-xl cursor-pointer transition-all flex items-center justify-between gap-3 group border ${
                              isSelected
                                ? isLight
                                  ? 'bg-amber-50 border-amber-300 shadow-xs'
                                  : 'bg-amber-500/15 border-amber-500/50'
                                : isLight
                                  ? 'hover:bg-slate-100/80 border-transparent'
                                  : 'hover:bg-slate-800/80 border-transparent'
                            }`}
                          >
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                                  isLight
                                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                }`}>
                                  {item.status}
                                </span>

                                {item.registrationNumber && (
                                  <span className={`font-mono text-xs font-bold px-1.5 py-0.5 rounded border ${
                                    isLight
                                      ? 'bg-emerald-100 text-emerald-900 border-emerald-300 font-extrabold'
                                      : 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30'
                                  }`}>
                                    {item.registrationNumber}
                                  </span>
                                )}

                                {item.orderNumber && (
                                  <span className={`font-mono text-xs font-bold px-1.5 py-0.5 rounded border flex items-center gap-1 ${
                                    isLight
                                      ? 'bg-sky-100 text-sky-800 border-sky-300'
                                      : 'bg-sky-950/40 text-sky-300 border-sky-500/30'
                                  }`}>
                                    <Hash className="w-3 h-3 opacity-80" />
                                    Ped: {item.orderNumber}
                                  </span>
                                )}

                                {item.priority && (
                                  <span className={`text-[10px] font-bold ${
                                    isLight ? 'text-rose-700' : 'text-rose-400'
                                  }`}>
                                    {item.priority}
                                  </span>
                                )}
                              </div>

                              <p className={`text-xs font-bold truncate transition-colors ${
                                isLight 
                                  ? 'text-slate-900 group-hover:text-amber-800' 
                                  : 'text-white group-hover:text-amber-300'
                              }`}>
                                {item.productName || 'Pendência sem título'}
                              </p>

                              <p className={`text-[11px] truncate ${
                                isLight ? 'text-slate-600' : 'text-slate-400'
                              }`}>
                                <span className={`font-semibold ${isLight ? 'text-slate-800' : 'text-slate-300'}`}>
                                  Motivo:
                                </span> {item.pendingReason}
                              </p>
                            </div>

                            <div className={`shrink-0 flex items-center gap-1 transition-all ${
                              isLight 
                                ? 'text-slate-500 group-hover:text-amber-700 font-semibold' 
                                : 'text-slate-500 group-hover:text-amber-400'
                            }`}>
                              <span className="text-[10px] font-bold hidden sm:inline">Ver Pendência</span>
                              <ChevronRight className="w-4 h-4" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 3. Catálogo Group */}
                {(activeCategoryFilter === 'all' || activeCategoryFilter === 'catalog') && searchResults.catalog.length > 0 && (
                  <div className="py-1">
                    <div className={`px-3 py-1.5 text-[10px] uppercase tracking-wider flex items-center gap-1.5 ${
                      isLight ? 'text-indigo-700 font-extrabold' : 'text-sky-400 font-bold'
                    }`}>
                      <Database className="w-3 h-3" />
                      <span>Catálogo de Base ({searchResults.catalog.length})</span>
                    </div>

                    <div className="space-y-1">
                      {searchResults.catalog.map((product) => {
                        const isSelected = flatDisplayItems[selectedIndex]?.data?.id === product.id;

                        return (
                          <div
                            key={product.id}
                            onClick={() => handleSelectProduct(product)}
                            className={`p-2.5 rounded-xl cursor-pointer transition-all flex items-center justify-between gap-3 group border ${
                              isSelected
                                ? isLight
                                  ? 'bg-sky-50 border-sky-300 shadow-xs'
                                  : 'bg-sky-500/15 border-sky-500/50'
                                : isLight
                                  ? 'hover:bg-slate-100/80 border-transparent'
                                  : 'hover:bg-slate-800/80 border-transparent'
                            }`}
                          >
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className={`font-mono text-xs font-extrabold px-2 py-0.5 rounded border ${
                                  isLight
                                    ? 'bg-slate-100 text-slate-900 border-slate-300'
                                    : 'bg-slate-800 text-white border-slate-700'
                                }`}>
                                  {product.sku}
                                </span>
                                {product.brand && (
                                  <span className={`text-[11px] font-bold ${
                                    isLight ? 'text-sky-700' : 'text-sky-400'
                                  }`}>
                                    {product.brand}
                                  </span>
                                )}
                                {product.category && (
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                                    isLight
                                      ? 'bg-slate-100 text-slate-700 border-slate-300 font-medium'
                                      : 'bg-slate-950 text-slate-400 border-slate-800'
                                  }`}>
                                    {product.category}
                                  </span>
                                )}
                              </div>

                              <p className={`text-xs font-bold truncate transition-colors ${
                                isLight 
                                  ? 'text-slate-900 group-hover:text-sky-700' 
                                  : 'text-white group-hover:text-sky-300'
                              }`}>
                                {product.name}
                              </p>
                            </div>

                            <div className={`shrink-0 flex items-center gap-1 transition-all ${
                              isLight 
                                ? 'text-slate-500 group-hover:text-sky-700 font-semibold' 
                                : 'text-slate-500 group-hover:text-sky-400'
                            }`}>
                              <span className="text-[10px] font-bold hidden sm:inline">Ver no Catálogo</span>
                              <ChevronRight className="w-4 h-4" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer Action Bar */}
          <div className={`px-4 py-2.5 flex items-center justify-between text-xs border-t ${
            isLight
              ? 'bg-slate-50 border-slate-200 text-slate-600'
              : 'bg-slate-950 border-slate-800 text-slate-400'
          }`}>
            <span className="flex items-center gap-1.5">
              <span>Pressione</span>
              <kbd className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-0.5 border ${
                isLight
                  ? 'bg-white border-slate-300 text-slate-800 shadow-xs'
                  : 'bg-slate-800 border-slate-700 text-slate-300'
              }`}>
                <CornerDownLeft className="w-2.5 h-2.5" /> Enter
              </kbd>
              <span>para selecionar ou buscar no Estoque</span>
            </span>

            <button
              type="button"
              onClick={() => handleSubmitSearch()}
              className={`font-bold hover:underline flex items-center gap-1 cursor-pointer ${
                isLight
                  ? 'text-sky-700 hover:text-sky-800'
                  : 'text-sky-400 hover:text-sky-300'
              }`}
            >
              <span>Ver resultados no Estoque</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
