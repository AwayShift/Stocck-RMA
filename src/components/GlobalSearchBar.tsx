/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Search, 
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
  const expandedInputRef = useRef<HTMLInputElement>(null);
  const [shiftX, setShiftX] = useState(0);

  // Global shortcut (Cmd+K / Ctrl+K) to open expanded search input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen(true);
      } else if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Ensure expanded container stays fully within horizontal viewport boundaries
  useEffect(() => {
    const adjustPosition = () => {
      if (isOpen && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const targetWidth = Math.min(540, viewportWidth - 24);
        const rightEdge = rect.left + targetWidth;
        if (rightEdge > viewportWidth - 12) {
          const overflow = rightEdge - (viewportWidth - 12);
          const maxShift = rect.left - 12;
          setShiftX(-Math.min(overflow, Math.max(0, maxShift)));
        } else {
          setShiftX(0);
        }
      }
    };

    if (isOpen) {
      adjustPosition();
      window.addEventListener('resize', adjustPosition);
      return () => window.removeEventListener('resize', adjustPosition);
    } else {
      setShiftX(0);
    }
  }, [isOpen]);

  // Focus the expanded input immediately when opened
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        expandedInputRef.current?.focus();
        expandedInputRef.current?.select();
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Click outside to collapse
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Filter logic across Units, Pending Items, and Catalog Products
  const searchResults = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) {
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
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  const getSectorBadge = (sector?: string, status?: string) => {
    if (status === 'Baixado') {
      return isLight
        ? { text: 'Baixado', bg: 'bg-purple-100 text-purple-900 border-purple-300 font-bold' }
        : { text: 'Baixado', bg: 'bg-purple-500/20 text-purple-300 border-purple-500/40 font-bold' };
    }
    const s = (sector || 'Principal').toLowerCase();
    if (s === 'openbox') {
      return isLight
        ? { text: 'Openbox', bg: 'bg-amber-100 text-amber-900 border-amber-300 font-bold' }
        : { text: 'Openbox', bg: 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold' };
    }
    if (s === 'rma') {
      return isLight
        ? { text: 'RMA', bg: 'bg-rose-100 text-rose-800 border-rose-300 font-bold' }
        : { text: 'RMA', bg: 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-bold' };
    }
    return isLight
      ? { text: 'Principal', bg: 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold' }
      : { text: 'Principal', bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold' };
  };

  return (
    <div ref={containerRef} className="relative" id="global-search-wrapper">
      {/* 
        1. Idle / Collapsed Search Trigger Bar in Header
        Compact, discreet, and smoothly expands on hover:
      */}
      <div
        onClick={() => setIsOpen(true)}
        className={`h-7.5 w-20 sm:w-24 md:w-28 hover:w-32 sm:hover:w-40 md:hover:w-48 px-2 rounded-lg border transition-all duration-300 ease-out flex items-center gap-1.5 cursor-pointer select-none group shrink-0 ${
          isLight
            ? 'bg-slate-100/90 border-slate-200 hover:bg-white hover:border-slate-300 text-slate-500 shadow-2xs'
            : 'bg-slate-950/60 border-slate-800/90 hover:bg-slate-900 hover:border-slate-700 text-slate-400 shadow-inner'
        }`}
        title="Buscar pedido, STI, serial, SKU... (Ctrl+K)"
        id="global-search-trigger"
      >
        <Search className={`w-3.5 h-3.5 shrink-0 transition-colors ${
          isLight ? 'text-slate-400 group-hover:text-sky-600' : 'text-slate-500 group-hover:text-sky-400'
        }`} />
        <span className="truncate text-[11px] sm:text-xs font-normal">
          {query.trim() ? query : 'Buscar...'}
        </span>
      </div>

      {/* 
        2. Expanded Input (Overlaid right on top of the search trigger)
        Generates a slightly larger input placed directly over the header input,
        as shown in Mercado Livre reference (Image 2), without any full-screen modal!
      */}
      {isOpen && (
        <div 
          className="absolute -top-1.5 left-0 z-50 w-72 sm:w-96 md:w-[480px] lg:w-[540px] max-w-[calc(100vw-1.5rem)] animate-in fade-in duration-100"
          style={{
            transform: shiftX !== 0 ? `translateX(${shiftX}px)` : undefined
          }}
          id="global-search-expanded-container"
        >
          {/* Floating Expanded Input Box */}
          <div className={`relative flex items-center h-11 sm:h-12 rounded-xl border shadow-xl transition-all ${
            isLight
              ? 'bg-white border-slate-200/90 shadow-slate-900/15 ring-2 ring-sky-500/15'
              : 'bg-slate-900 border-slate-700/80 shadow-2xl shadow-black/80 ring-2 ring-sky-500/20'
          }`}>
            <Search className={`w-4.5 h-4.5 sm:w-5 sm:h-5 ml-3 sm:ml-3.5 shrink-0 transition-colors ${
              isLight ? 'text-slate-400' : 'text-slate-400'
            }`} />

            <form onSubmit={handleSubmitSearch} className="w-full h-full flex items-center">
              <input
                ref={expandedInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Buscar por pedido, STI, serial, SKU ou #"
                className={`w-full h-full bg-transparent px-3 text-xs sm:text-sm font-medium focus:outline-none ${
                  isLight 
                    ? 'text-slate-900 placeholder-slate-400' 
                    : 'text-white placeholder-slate-400'
                }`}
                id="global-search-expanded-input"
                autoComplete="off"
                spellCheck="false"
              />
            </form>
          </div>

          {/* 
            3. Attached Dropdown Popover directly underneath this expanded input 
            Only appears when the user has typed at least one character!
          */}
          {query.trim().length > 0 && (
            <div 
              className={`mt-1.5 rounded-xl border shadow-2xl overflow-hidden flex flex-col max-h-[calc(100vh-5.5rem)] animate-in fade-in duration-100 ${
                isLight
                  ? 'bg-white border-slate-200 shadow-slate-900/15'
                  : 'bg-slate-900 border-slate-800 shadow-2xl'
              }`}
              id="global-search-dropdown-menu"
            >
              {/* Filter Chips Bar (Categorias: Todos, Estoque, Pendências, Catálogo) */}
              <div 
                className={`grid grid-cols-4 gap-1 p-1.5 sm:p-2 border-b w-full text-xs ${
                  isLight 
                    ? 'bg-slate-50/90 border-slate-200' 
                    : 'bg-slate-950/80 border-slate-800'
                }`}
              >
                {/* Tab: Todos */}
                <button
                  type="button"
                  onClick={() => setActiveCategoryFilter('all')}
                  className={`px-1 sm:px-2 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center justify-center gap-1 min-w-0 w-full ${
                    activeCategoryFilter === 'all'
                      ? 'bg-sky-600 text-white shadow-xs'
                      : isLight
                        ? 'text-slate-700 hover:text-slate-950 hover:bg-slate-200/90'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                  }`}
                  title="Todos os resultados"
                >
                  <span className="truncate text-xs">Todos</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold shrink-0 ${
                    activeCategoryFilter === 'all'
                      ? 'bg-sky-700 text-white'
                      : isLight
                        ? 'bg-slate-200 text-slate-800 border border-slate-300/80'
                        : 'bg-slate-800 text-slate-400'
                  }`}>
                    {searchResults.total}
                  </span>
                </button>

                {/* Tab: Estoque */}
                <button
                  type="button"
                  onClick={() => setActiveCategoryFilter('units')}
                  className={`px-1 sm:px-2 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center justify-center gap-1 min-w-0 w-full ${
                    activeCategoryFilter === 'units'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : isLight
                        ? 'text-slate-700 hover:text-slate-950 hover:bg-slate-200/90'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                  }`}
                  title="Filtrar por Estoque Físico"
                >
                  <Package className={`w-3.5 h-3.5 shrink-0 ${
                    activeCategoryFilter === 'units' 
                      ? 'text-white' 
                      : (isLight ? 'text-emerald-700' : 'text-emerald-400')
                  }`} />
                  <span className="truncate text-xs">Estoque</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold shrink-0 ${
                    activeCategoryFilter === 'units'
                      ? 'bg-emerald-700 text-white'
                      : isLight
                        ? 'bg-slate-200 text-slate-800 border border-slate-300/80'
                        : 'bg-slate-800 text-slate-400'
                  }`}>
                    {searchResults.units.length}
                  </span>
                </button>

                {/* Tab: Pendências */}
                <button
                  type="button"
                  onClick={() => setActiveCategoryFilter('pending')}
                  className={`px-1 sm:px-2 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center justify-center gap-1 min-w-0 w-full ${
                    activeCategoryFilter === 'pending'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : isLight
                        ? 'text-slate-700 hover:text-slate-950 hover:bg-slate-200/90'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                  }`}
                  title="Filtrar por Pendências"
                >
                  <Clock className={`w-3.5 h-3.5 shrink-0 ${
                    activeCategoryFilter === 'pending' 
                      ? 'text-white' 
                      : (isLight ? 'text-amber-700' : 'text-amber-400')
                  }`} />
                  <span className="truncate text-xs">Pendências</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold shrink-0 ${
                    activeCategoryFilter === 'pending'
                      ? 'bg-amber-700 text-white'
                      : isLight
                        ? 'bg-slate-200 text-slate-800 border border-slate-300/80'
                        : 'bg-slate-800 text-slate-400'
                  }`}>
                    {searchResults.pending.length}
                  </span>
                </button>

                {/* Tab: Catálogo */}
                <button
                  type="button"
                  onClick={() => setActiveCategoryFilter('catalog')}
                  className={`px-1 sm:px-2 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center justify-center gap-1 min-w-0 w-full ${
                    activeCategoryFilter === 'catalog'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : isLight
                        ? 'text-slate-700 hover:text-slate-950 hover:bg-slate-200/90'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                  }`}
                  title="Filtrar por Catálogo"
                >
                  <Database className={`w-3.5 h-3.5 shrink-0 ${
                    activeCategoryFilter === 'catalog' 
                    ? 'text-white' 
                    : (isLight ? 'text-indigo-700' : 'text-sky-400')
                  }`} />
                  <span className="truncate text-xs">Catálogo</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold shrink-0 ${
                    activeCategoryFilter === 'catalog'
                      ? 'bg-indigo-700 text-white'
                      : isLight
                        ? 'bg-slate-200 text-slate-800 border border-slate-300/80'
                        : 'bg-slate-800 text-slate-400'
                  }`}>
                    {searchResults.catalog.length}
                  </span>
                </button>
              </div>

              {/* Results Content Area */}
              <div className={`overflow-y-auto p-2 max-h-[50vh] scrollbar-thin divide-y ${
                isLight ? 'divide-slate-200' : 'divide-slate-800/60'
              }`}>
                {searchResults.total === 0 ? (
                  <div className="py-6 px-3 text-center space-y-2">
                    <p className={`text-xs font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                      Nenhum resultado para &ldquo;{query}&rdquo;
                    </p>
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
                  {/* Estoque Físico Group */}
                  {(activeCategoryFilter === 'all' || activeCategoryFilter === 'units') && searchResults.units.length > 0 && (
                    <div className="py-1">
                      <div className={`px-2.5 py-1 text-[10px] uppercase tracking-wider flex items-center gap-1.5 ${
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
                              className={`p-2 rounded-xl cursor-pointer transition-all flex items-center justify-between gap-2.5 group border ${
                                isSelected
                                  ? isLight
                                    ? 'bg-sky-50 border-sky-300 shadow-xs'
                                    : 'bg-sky-500/15 border-sky-500/50'
                                  : isLight
                                    ? 'hover:bg-slate-100/80 border-transparent'
                                    : 'hover:bg-slate-800/80 border-transparent'
                              }`}
                            >
                              <div className="min-w-0 flex-1 space-y-0.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${sBadge.bg}`}>
                                    {sBadge.text}
                                  </span>

                                  {unit.orderNumber && (
                                    <span className={`font-mono text-xs font-extrabold px-1.5 py-0.2 rounded border flex items-center gap-0.5 ${
                                      isLight
                                        ? 'bg-sky-100 text-sky-800 border-sky-300'
                                        : 'bg-sky-950/40 text-sky-300 border-sky-500/30'
                                    }`}>
                                      <Hash className="w-2.5 h-2.5 opacity-80" />
                                      Ped: {unit.orderNumber}
                                    </span>
                                  )}

                                  {unit.trackingCode && (
                                    <span className={`font-mono text-[11px] font-bold px-1.5 py-0.2 rounded border ${
                                      isLight
                                        ? 'bg-slate-100 text-slate-800 border-slate-300'
                                        : 'bg-slate-950 text-slate-300 border-slate-800'
                                    }`}>
                                      {normalizeStiCode(unit.trackingCode)}
                                    </span>
                                  )}

                                  {unit.serialNumber && (
                                    <span className={`font-mono text-[10px] px-1 py-0.2 rounded border ${
                                      isLight
                                        ? 'bg-slate-100 text-slate-700 border-slate-300 font-medium'
                                        : 'bg-slate-950 text-slate-400 border-slate-800'
                                    }`}>
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

                                <div className={`flex items-center gap-2 text-[10px] ${
                                  isLight ? 'text-slate-600' : 'text-slate-400'
                                }`}>
                                  <span className={`font-mono font-semibold ${isLight ? 'text-slate-800' : 'text-slate-300'}`}>
                                    SKU: {unit.baseProductSku}
                                  </span>
                                  {unit.platform && <span>• {unit.platform}</span>}
                                </div>
                              </div>

                              <div className={`shrink-0 flex items-center transition-all ${
                                isLight 
                                  ? 'text-slate-400 group-hover:text-sky-700' 
                                  : 'text-slate-500 group-hover:text-sky-400'
                              }`}>
                                <ChevronRight className="w-4 h-4" />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Pendências Group */}
                  {(activeCategoryFilter === 'all' || activeCategoryFilter === 'pending') && searchResults.pending.length > 0 && (
                    <div className="py-1">
                      <div className={`px-2.5 py-1 text-[10px] uppercase tracking-wider flex items-center gap-1.5 ${
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
                              className={`p-2 rounded-xl cursor-pointer transition-all flex items-center justify-between gap-2.5 group border ${
                                isSelected
                                  ? isLight
                                    ? 'bg-amber-50 border-amber-300 shadow-xs'
                                    : 'bg-amber-500/15 border-amber-500/50'
                                  : isLight
                                    ? 'hover:bg-slate-100/80 border-transparent'
                                    : 'hover:bg-slate-800/80 border-transparent'
                              }`}
                            >
                              <div className="min-w-0 flex-1 space-y-0.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                                    isLight
                                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                                      : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                  }`}>
                                    {item.status}
                                  </span>

                                  {item.registrationNumber && (
                                    <span className={`font-mono text-xs font-bold px-1.5 py-0.2 rounded border ${
                                      isLight
                                        ? 'bg-emerald-100 text-emerald-900 border-emerald-300 font-extrabold'
                                        : 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30'
                                    }`}>
                                      {item.registrationNumber}
                                    </span>
                                  )}

                                  {item.orderNumber && (
                                    <span className={`font-mono text-xs font-bold px-1.5 py-0.2 rounded border flex items-center gap-0.5 ${
                                      isLight
                                        ? 'bg-sky-100 text-sky-800 border-sky-300'
                                        : 'bg-sky-950/40 text-sky-300 border-sky-500/30'
                                    }`}>
                                      <Hash className="w-2.5 h-2.5 opacity-80" />
                                      Ped: {item.orderNumber}
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

                                <p className={`text-[10px] truncate ${
                                  isLight ? 'text-slate-600' : 'text-slate-400'
                                }`}>
                                  <span className={`font-semibold ${isLight ? 'text-slate-800' : 'text-slate-300'}`}>
                                    Motivo:
                                  </span> {item.pendingReason}
                                </p>
                              </div>

                              <div className={`shrink-0 flex items-center transition-all ${
                                isLight 
                                  ? 'text-slate-400 group-hover:text-amber-700' 
                                  : 'text-slate-500 group-hover:text-amber-400'
                              }`}>
                                <ChevronRight className="w-4 h-4" />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Catálogo Group */}
                  {(activeCategoryFilter === 'all' || activeCategoryFilter === 'catalog') && searchResults.catalog.length > 0 && (
                    <div className="py-1">
                      <div className={`px-2.5 py-1 text-[10px] uppercase tracking-wider flex items-center gap-1.5 ${
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
                              className={`p-2 rounded-xl cursor-pointer transition-all flex items-center justify-between gap-2.5 group border ${
                                isSelected
                                  ? isLight
                                    ? 'bg-sky-50 border-sky-300 shadow-xs'
                                    : 'bg-sky-500/15 border-sky-500/50'
                                  : isLight
                                    ? 'hover:bg-slate-100/80 border-transparent'
                                    : 'hover:bg-slate-800/80 border-transparent'
                              }`}
                            >
                              <div className="min-w-0 flex-1 space-y-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span className={`font-mono text-xs font-extrabold px-1.5 py-0.2 rounded border ${
                                    isLight
                                      ? 'bg-slate-100 text-slate-900 border-slate-300'
                                      : 'bg-slate-800 text-white border-slate-700'
                                  }`}>
                                    {product.sku}
                                  </span>
                                  {product.brand && (
                                    <span className={`text-[10px] font-bold ${
                                      isLight ? 'text-sky-700' : 'text-sky-400'
                                    }`}>
                                      {product.brand}
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

                              <div className={`shrink-0 flex items-center transition-all ${
                                isLight 
                                  ? 'text-slate-400 group-hover:text-sky-700' 
                                  : 'text-slate-500 group-hover:text-sky-400'
                              }`}>
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
            <div className={`px-3 py-2 flex items-center justify-between text-[11px] border-t ${
              isLight
                ? 'bg-slate-50 border-slate-200 text-slate-600'
                : 'bg-slate-950 border-slate-800 text-slate-400'
            }`}>
              <span className="flex items-center gap-1">
                <kbd className={`px-1 py-0.2 rounded text-[10px] font-mono font-bold flex items-center gap-0.5 border ${
                  isLight
                    ? 'bg-white border-slate-300 text-slate-800'
                    : 'bg-slate-800 border-slate-700 text-slate-300'
                }`}>
                  <CornerDownLeft className="w-2.5 h-2.5" /> Enter
                </kbd>
                <span>selecionar</span>
                <span className="mx-1">•</span>
                <kbd className={`px-1 py-0.2 rounded text-[10px] font-mono font-bold border ${
                  isLight
                    ? 'bg-white border-slate-300 text-slate-800'
                    : 'bg-slate-800 border-slate-700 text-slate-300'
                }`}>
                  ESC
                </kbd>
                <span>fechar</span>
              </span>

              {query.trim().length >= 1 && (
                <button
                  type="button"
                  onClick={() => handleSubmitSearch()}
                  className={`font-bold hover:underline flex items-center gap-1 cursor-pointer text-[11px] ${
                    isLight
                      ? 'text-sky-700 hover:text-sky-800'
                      : 'text-sky-400 hover:text-sky-300'
                  }`}
                >
                  <span>Ver no Estoque</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    )}
    </div>
  );
}
