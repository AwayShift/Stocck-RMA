/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  TrendingUp, 
  Package, 
  Sparkles, 
  AlertTriangle, 
  ArrowRight, 
  Calendar, 
  ShoppingCart, 
  Layers,
  Clock,
  MinusCircle,
  PlusCircle,
  EyeOff,
  Eye,
  CheckCircle2,
  Filter,
  X
} from 'lucide-react';
import { TriageUnit, PlatformType, DestinationSectorType, isMigrationUnit, BaseProduct } from '../types';
import { getUnitResolvedPhotos } from '../utils/productImages';
import { getPlatformFilterStyle, getSectorFilterStyle } from '../utils/filterColorHelpers';

interface DashboardProps {
  units: TriageUnit[];
  products?: BaseProduct[];
  pendingItemsCount?: number;
  onViewUnit: (unit: TriageUnit) => void;
  onUpdateUnit?: (unit: TriageUnit) => Promise<void>;
  onNavigateToStock: (platform?: PlatformType | null, sector?: DestinationSectorType | null) => void;
  onNavigateToPending?: () => void;
}

export default function Dashboard({ 
  units, 
  products = [], 
  pendingItemsCount = 0,
  onViewUnit, 
  onUpdateUnit,
  onNavigateToStock,
  onNavigateToPending
}: DashboardProps) {
  const [showExcluded, setShowExcluded] = useState(false);
  const [updatingUnitId, setUpdatingUnitId] = useState<string | null>(null);
  const [selectedPlatformFilter, setSelectedPlatformFilter] = useState<PlatformType | null>(null);
  const [selectedSectorFilter, setSelectedSectorFilter] = useState<DestinationSectorType | null>(null);

  const handleTogglePlatformFilter = (platform: PlatformType) => {
    setSelectedPlatformFilter(prev => prev === platform ? null : platform);
  };

  const handleToggleSectorFilter = (sector: DestinationSectorType) => {
    setSelectedSectorFilter(prev => prev === sector ? null : sector);
  };

  const handleClearFilters = () => {
    setSelectedPlatformFilter(null);
    setSelectedSectorFilter(null);
  };

  // Filter for today's units (based on local timezone, excluding migration imports and excluded units)
  const todayUnits = units.filter(u => {
    try {
      if (isMigrationUnit(u)) return false;
      if (u.excludeFromDailyCount) return false;
      const uDate = new Date(u.createdAt);
      const today = new Date();
      return uDate.getDate() === today.getDate() &&
             uDate.getMonth() === today.getMonth() &&
             uDate.getFullYear() === today.getFullYear();
    } catch {
      return false;
    }
  });

  // Filter for units from today that were excluded from daily count
  const excludedTodayUnits = units.filter(u => {
    try {
      if (isMigrationUnit(u)) return false;
      if (!u.excludeFromDailyCount) return false;
      const uDate = new Date(u.createdAt);
      const today = new Date();
      return uDate.getDate() === today.getDate() &&
             uDate.getMonth() === today.getMonth() &&
             uDate.getFullYear() === today.getFullYear();
    } catch {
      return false;
    }
  });

  const getFormattedLocalDate = () => {
    const months = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = months[today.getMonth()];
    const year = today.getFullYear();
    return `${day} de ${month}, ${year}`;
  };

  const totalReceivedToday = todayUnits.length;

  // Counters for today's sector destinations
  const sectorCountsToday = todayUnits.reduce((acc, curr) => {
    acc[curr.destinationSector] = (acc[curr.destinationSector] || 0) + 1;
    return acc;
  }, { Principal: 0, Openbox: 0, RMA: 0 } as Record<DestinationSectorType, number>);

  // Global counts for inventory metrics (all units still in stock)
  const inStockUnits = units.filter(u => u.status === 'Estoque');
  const totalInStock = inStockUnits.length;
  
  const sectorCountsGlobal = inStockUnits.reduce((acc, curr) => {
    acc[curr.destinationSector] = (acc[curr.destinationSector] || 0) + 1;
    return acc;
  }, { Principal: 0, Openbox: 0, RMA: 0 } as Record<DestinationSectorType, number>);

  // Platform Breakdown (Today's Entries)
  const platformCountsToday = todayUnits.reduce((acc, curr) => {
    acc[curr.platform] = (acc[curr.platform] || 0) + 1;
    return acc;
  }, {} as Record<PlatformType, number>);

  const platforms: PlatformType[] = ['Mercado Livre', 'Shopee', 'Amazon', 'Amazon Ta Novo', 'Kabum'];

  // Filtered today's units based on shared platform and sector filters
  const displayedTodayUnits = todayUnits.filter(u => {
    if (selectedPlatformFilter && u.platform !== selectedPlatformFilter) return false;
    if (selectedSectorFilter && u.destinationSector !== selectedSectorFilter) return false;
    return true;
  });

  // Platform colors & logos styling
  const getPlatformStyle = (p: PlatformType) => {
    switch(p) {
      case 'Mercado Livre': return { bg: 'bg-yellow-500/10', text: 'text-amber-800 dark:text-yellow-400', border: 'border-yellow-500/30', barBg: 'bg-amber-500', dotBg: 'bg-amber-500' };
      case 'Shopee': return { bg: 'bg-orange-500/10', text: 'text-orange-800 dark:text-orange-400', border: 'border-orange-500/30', barBg: 'bg-orange-500', dotBg: 'bg-orange-500' };
      case 'Amazon': return { bg: 'bg-blue-500/10', text: 'text-sky-800 dark:text-blue-400', border: 'border-blue-500/30', barBg: 'bg-sky-500', dotBg: 'bg-sky-500' };
      case 'Amazon Ta Novo': return { 
        bg: 'bg-emerald-500/15', 
        text: 'text-emerald-800 dark:text-emerald-400', 
        border: 'border-emerald-500/30', 
        barBg: 'bg-emerald-500', 
        dotBg: 'bg-emerald-500',
        customColor: 'rgba(16, 185, 129, 0.8)'
      };
      case 'Kabum': return { bg: 'bg-indigo-500/10', text: 'text-indigo-800 dark:text-indigo-400', border: 'border-indigo-500/30', barBg: 'bg-indigo-500', dotBg: 'bg-indigo-500' };
      default: return { bg: 'bg-zinc-500/10', text: 'text-zinc-800 dark:text-zinc-400', border: 'border-zinc-500/30', barBg: 'bg-zinc-400', dotBg: 'bg-zinc-400' };
    }
  };

  return (
    <div className="space-y-6" id="dashboard-container">
      {/* Top Welcome / Header section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl" id="dashboard-header">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <TrendingUp className="text-sky-400 w-6 h-6" />
            Painel Logístico e Triagem
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Controle de devoluções, análise técnica de RMA e direcionamento inteligente de estoque.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          {pendingItemsCount > 0 && onNavigateToPending && (
            <button
              onClick={onNavigateToPending}
              className="flex items-center gap-2 px-3.5 py-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 hover:text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-sm"
              title="Visualizar produtos aguardando liberação na aba Pendências"
              id="dashboard-pending-alert-badge"
            >
              <Clock className="w-4 h-4 text-amber-400 animate-pulse" />
              <span>{pendingItemsCount} {pendingItemsCount === 1 ? 'item pendente' : 'itens pendentes'}</span>
              <ArrowRight className="w-3 h-3 text-amber-400" />
            </button>
          )}
          <div className="flex items-center gap-2 px-3.5 py-2 bg-slate-950 rounded-lg border border-slate-800 text-xs text-slate-300 shadow-inner">
            <Calendar className="w-4 h-4 text-sky-400" />
            <span>{getFormattedLocalDate()}</span>
          </div>
        </div>
      </div>

      {/* Primary KPIs Matrix */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6" id="kpi-grid">
        {/* KPI 1: Today Receives */}
        <div 
          onClick={handleClearFilters}
          className={`bg-slate-900 border rounded-2xl p-6 relative overflow-hidden group transition-all shadow-lg cursor-pointer ${
            !selectedPlatformFilter && !selectedSectorFilter
              ? 'border-sky-500/50 ring-1 ring-sky-500/30'
              : 'border-slate-800 hover:border-slate-700'
          }`} 
          id="kpi-today"
          title="Clique para ver todas as devoluções de hoje (limpar filtros)"
        >
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Recebidos Hoje</span>
                {(!selectedPlatformFilter && !selectedSectorFilter) && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300">Todos</span>
                )}
              </div>
              <h3 className="text-4xl font-black text-white mt-1.5">{totalReceivedToday}</h3>
            </div>
            <div className="p-3 bg-sky-500/10 text-sky-400 rounded-xl">
              <Layers className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-5 flex items-center text-sm text-sky-400 font-bold cursor-pointer group" onClick={(e) => { e.stopPropagation(); onNavigateToStock(selectedPlatformFilter, selectedSectorFilter); }}>
            Ver estoque atual
            <ArrowRight className="w-3.5 h-3.5 ml-1.5 group-hover:translate-x-1 transition-transform" />
          </div>
          <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-sky-500/5 rounded-full filter blur-xl group-hover:scale-150 transition-transform"></div>
        </div>

        {/* KPI 2: Principal */}
        <div 
          onClick={() => handleToggleSectorFilter('Principal')}
          data-selected={selectedSectorFilter === 'Principal' ? 'true' : 'false'}
          className={`border rounded-2xl p-6 relative overflow-hidden group transition-all shadow-lg cursor-pointer select-none ${
            selectedSectorFilter === 'Principal'
              ? 'kpi-card-selected border-emerald-500 ring-2 ring-emerald-500/60 bg-emerald-50 dark:bg-emerald-950/30 shadow-emerald-500/10'
              : 'bg-slate-900 border-emerald-500/20 hover:border-emerald-500/40'
          }`} 
          id="kpi-principal"
          title="Clique para filtrar por Estoque Principal"
        >
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Estoque Principal</span>
                {selectedSectorFilter === 'Principal' && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/30 text-emerald-300 flex items-center gap-0.5">
                    <Filter className="w-2.5 h-2.5" /> Filtrando
                  </span>
                )}
              </div>
              <h3 className="text-4xl font-black text-emerald-400 mt-1.5">{sectorCountsGlobal.Principal}</h3>
            </div>
            <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl">
              <Package className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-5 flex items-center justify-between text-sm text-slate-400">
            <div>
              <span className="text-emerald-400 font-bold">+{sectorCountsToday.Principal} hoje</span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNavigateToStock(selectedPlatformFilter, 'Principal');
              }}
              className="text-xs font-bold text-emerald-400 hover:text-emerald-300 hover:underline flex items-center gap-1 cursor-pointer transition-colors"
              title="Abrir no Estoque Físico com filtro de Principal"
            >
              <span>Ver Estoque</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-emerald-500/5 rounded-full filter blur-xl group-hover:scale-150 transition-transform"></div>
        </div>

        {/* KPI 3: Openbox */}
        <div 
          onClick={() => handleToggleSectorFilter('Openbox')}
          data-selected={selectedSectorFilter === 'Openbox' ? 'true' : 'false'}
          className={`border rounded-2xl p-6 relative overflow-hidden group transition-all shadow-lg cursor-pointer select-none ${
            selectedSectorFilter === 'Openbox'
              ? 'kpi-card-selected border-amber-500 ring-2 ring-amber-500/60 bg-amber-50 dark:bg-amber-950/30 shadow-amber-500/10'
              : 'bg-slate-900 border-amber-500/20 hover:border-amber-500/40'
          }`} 
          id="kpi-openbox"
          title="Clique para filtrar por Setor Openbox"
        >
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Setor Openbox</span>
                {selectedSectorFilter === 'Openbox' && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/30 text-amber-300 flex items-center gap-0.5">
                    <Filter className="w-2.5 h-2.5" /> Filtrando
                  </span>
                )}
              </div>
              <h3 className="text-4xl font-black text-amber-400 mt-1.5">{sectorCountsGlobal.Openbox}</h3>
            </div>
            <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl">
              <Sparkles className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-5 flex items-center justify-between text-sm text-slate-400">
            <div>
              <span className="text-amber-400 font-bold">+{sectorCountsToday.Openbox} hoje</span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNavigateToStock(selectedPlatformFilter, 'Openbox');
              }}
              className="text-xs font-bold text-amber-400 hover:text-amber-300 hover:underline flex items-center gap-1 cursor-pointer transition-colors"
              title="Abrir no Estoque Físico com filtro de Openbox"
            >
              <span>Ver Estoque</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-amber-500/5 rounded-full filter blur-xl group-hover:scale-150 transition-transform"></div>
        </div>

        {/* KPI 4: RMA */}
        <div 
          onClick={() => handleToggleSectorFilter('RMA')}
          data-selected={selectedSectorFilter === 'RMA' ? 'true' : 'false'}
          className={`border rounded-2xl p-6 relative overflow-hidden group transition-all shadow-lg cursor-pointer select-none ${
            selectedSectorFilter === 'RMA'
              ? 'kpi-card-selected border-rose-500 ring-2 ring-rose-500/60 bg-rose-50 dark:bg-rose-950/30 shadow-rose-500/10'
              : 'bg-slate-900 border-rose-500/20 hover:border-rose-500/40'
          }`} 
          id="kpi-conserto"
          title="Clique para filtrar por Setor RMA"
        >
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Aguardando RMA</span>
                {selectedSectorFilter === 'RMA' && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/30 text-rose-300 flex items-center gap-0.5">
                    <Filter className="w-2.5 h-2.5" /> Filtrando
                  </span>
                )}
              </div>
              <h3 className="text-4xl font-black text-rose-400 mt-1.5">{sectorCountsGlobal.RMA}</h3>
            </div>
            <div className="p-3 bg-rose-500/10 text-rose-400 rounded-xl">
              <AlertTriangle className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-5 flex items-center justify-between text-sm text-slate-400">
            <div>
              <span className="text-rose-400 font-bold">+{sectorCountsToday.RMA} hoje</span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNavigateToStock(selectedPlatformFilter, 'RMA');
              }}
              className="text-xs font-bold text-rose-400 hover:text-rose-300 hover:underline flex items-center gap-1 cursor-pointer transition-colors"
              title="Abrir no Estoque Físico com filtro de RMA"
            >
              <span>Ver Estoque</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-rose-500/5 rounded-full filter blur-xl group-hover:scale-150 transition-transform"></div>
        </div>
      </div>

      {/* Main Grid: Platforms Breakdown & Today's Activity Log */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="dashboard-main-grid">
        {/* Left Side: Today's Triage Activity Log (8 cols) */}
        <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between" id="today-activity-card">
          <div>
            <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>Histórico de Triagem de Hoje</span>
                  {(selectedPlatformFilter || selectedSectorFilter) && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30 flex items-center gap-1">
                      <Filter className="w-3 h-3" /> Filtrado
                    </span>
                  )}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {selectedPlatformFilter || selectedSectorFilter
                    ? `Exibindo ${displayedTodayUnits.length} de ${totalReceivedToday} devoluções hoje com os filtros ativos`
                    : 'Últimas devoluções recebidas e processadas hoje no setor'
                  }
                </p>
              </div>
              <div className="flex items-center gap-2">
                {excludedTodayUnits.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowExcluded(prev => !prev)}
                    className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded-full text-xs font-bold border border-amber-500/30 transition-colors flex items-center gap-1.5 cursor-pointer"
                    title={showExcluded ? "Ocultar itens ignorados" : "Visualizar itens ignorados do contador diário"}
                  >
                    <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                    <span>{excludedTodayUnits.length} {excludedTodayUnits.length === 1 ? 'ignorado' : 'ignorados'}</span>
                  </button>
                )}
                <span className="px-2.5 py-1 bg-sky-500/10 text-sky-400 rounded-full text-xs font-bold border border-sky-500/20">
                  {displayedTodayUnits.length} {displayedTodayUnits.length === 1 ? 'Devolução' : 'Devoluções'}
                </span>
              </div>
            </div>

            {/* Active shared filter tags row */}
            {(selectedPlatformFilter || selectedSectorFilter) && (
              <div className="mb-4 p-2.5 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between flex-wrap gap-2 text-xs shadow-md" id="dashboard-active-filters-bar">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-slate-400 font-semibold flex items-center gap-1 text-[11px]">
                    <Filter className="w-3.5 h-3.5 text-sky-400" />
                    Filtros ativos:
                  </span>
                  {selectedPlatformFilter && (() => {
                    const style = getPlatformFilterStyle(selectedPlatformFilter);
                    return (
                      <span 
                        data-platform={selectedPlatformFilter}
                        className={`px-2.5 py-1 rounded-lg border font-bold flex items-center gap-1.5 text-xs transition-all shadow-xs filter-platform-badge ${style.badgeClasses}`} 
                        id="tag-filter-platform"
                      >
                        <span className={`w-2 h-2 rounded-full shrink-0 filter-badge-dot ${style.dotClasses}`} />
                        <span>Plataforma: <strong>{selectedPlatformFilter}</strong></span>
                        <button 
                          type="button" 
                          onClick={() => setSelectedPlatformFilter(null)}
                          className={`p-0.5 rounded transition-colors cursor-pointer ${style.hoverBtnClasses}`}
                          title="Remover filtro de plataforma"
                        >
                          <X className="w-3 h-3 stroke-[2.5]" />
                        </button>
                      </span>
                    );
                  })()}
                  {selectedSectorFilter && (() => {
                    const style = getSectorFilterStyle(selectedSectorFilter);
                    return (
                      <span 
                        data-sector={selectedSectorFilter}
                        className={`px-2.5 py-1 rounded-lg border font-bold flex items-center gap-1.5 text-xs transition-all shadow-xs filter-sector-badge ${style.badgeClasses}`} 
                        id="tag-filter-sector"
                      >
                        <span className={`w-2 h-2 rounded-full shrink-0 filter-badge-dot ${style.dotClasses}`} />
                        <span>Estoque: <strong>{selectedSectorFilter}</strong></span>
                        <button 
                          type="button" 
                          onClick={() => setSelectedSectorFilter(null)}
                          className={`p-0.5 rounded transition-colors cursor-pointer ${style.hoverBtnClasses}`}
                          title="Remover filtro de estoque"
                        >
                          <X className="w-3 h-3 stroke-[2.5]" />
                        </button>
                      </span>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onNavigateToStock(selectedPlatformFilter, selectedSectorFilter)}
                    className="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer transition-colors"
                    title="Navegar para a aba de Estoque Físico aplicando exatamente estes filtros"
                    id="btn-nav-stock-filtered"
                  >
                    <span>Ver no Estoque Físico ({displayedTodayUnits.length})</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="text-xs text-rose-400 hover:text-rose-300 font-bold hover:underline transition-all cursor-pointer flex items-center gap-1 ml-1"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Limpar filtros</span>
                  </button>
                </div>
              </div>
            )}

            {/* Excluded Units Panel (if toggled on) */}
            {showExcluded && excludedTodayUnits.length > 0 && (
              <div className="mb-4 p-3.5 bg-amber-950/20 border border-amber-500/30 rounded-xl space-y-2" id="dashboard-excluded-panel">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                    <EyeOff className="w-4 h-4 text-amber-400" />
                    <span>Itens Excluídos do Contador Diário ({excludedTodayUnits.length})</span>
                  </div>
                  <span className="text-[11px] text-amber-400/80">Estes produtos estão no estoque, mas não somam nas métricas de hoje.</span>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {excludedTodayUnits.map((exUnit) => (
                    <div key={exUnit.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-950/80 border border-slate-800 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-sky-400 font-bold">{exUnit.baseProductSku}</span>
                        <span className="text-white truncate max-w-xs">{exUnit.baseProductName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {onUpdateUnit && (
                          <button
                            type="button"
                            disabled={updatingUnitId === exUnit.id}
                            onClick={async (e) => {
                              e.stopPropagation();
                              setUpdatingUnitId(exUnit.id);
                              try {
                                await onUpdateUnit({ ...exUnit, excludeFromDailyCount: false });
                              } finally {
                                setUpdatingUnitId(null);
                              }
                            }}
                            className="px-2 py-0.5 rounded bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 font-semibold text-[10px] flex items-center gap-1 transition-colors cursor-pointer"
                            title="Reativar no contador de devoluções de hoje"
                          >
                            <PlusCircle className="w-3 h-3" />
                            <span>Reativar no Contador</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {todayUnits.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 border border-dashed border-slate-800 rounded-xl bg-slate-950" id="no-returns-today">
                <Package className="w-12 h-12 text-slate-600 mb-3" />
                <p className="text-slate-300 font-medium text-sm">Nenhuma devolução realizada hoje ainda.</p>
                <p className="text-slate-500 text-xs text-center max-w-sm mt-1">Vá até o módulo "Entrada de RMA" para registrar e fazer a triagem do primeiro retorno.</p>
              </div>
            ) : displayedTodayUnits.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 border border-dashed border-slate-800 rounded-xl bg-slate-950" id="no-filtered-returns-today">
                <Filter className="w-10 h-10 text-slate-600 mb-3" />
                <p className="text-slate-300 font-semibold text-sm">Nenhum produto encontrado com os filtros selecionados.</p>
                <p className="text-slate-500 text-xs text-center max-w-sm mt-1">
                  {selectedPlatformFilter && `Plataforma: "${selectedPlatformFilter}" `}
                  {selectedSectorFilter && `Estoque: "${selectedSectorFilter}"`}
                </p>
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="mt-4 px-3.5 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 font-bold text-xs transition-colors cursor-pointer"
                >
                  Limpar Filtros e Ver Todos ({todayUnits.length})
                </button>
              </div>
            ) : (
              <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1" id="today-activity-list">
                {displayedTodayUnits.map((unit) => {
                  const pStyle = getPlatformStyle(unit.platform);
                  let sectorStyle = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
                  if (unit.destinationSector === 'Openbox') {
                    sectorStyle = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
                  } else if (unit.destinationSector === 'RMA') {
                    sectorStyle = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
                  }

                  const hourStr = new Date(unit.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

                  const resolved = getUnitResolvedPhotos(unit, products);
                  const mainPhoto = resolved.mainPhoto;

                  return (
                    <div 
                      key={unit.id}
                      onClick={() => onViewUnit(unit)}
                      title={`Produto: ${unit.baseProductName}\nSKU: ${unit.baseProductSku}${unit.customerReason ? `\nMotivo: ${unit.customerReason}` : ''}`}
                      className="group flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 p-4 bg-slate-950 border border-slate-800/80 rounded-xl hover:border-slate-700 hover:bg-slate-900/50 transition-all cursor-pointer"
                      id={`activity-item-${unit.id}`}
                    >
                      <div className="flex items-center gap-3.5 flex-1 min-w-0 w-full sm:w-auto">
                        {/* Thumbnail of product photo or placeholder */}
                        <div className="w-12 h-12 rounded-lg bg-slate-900 border border-slate-800 flex-shrink-0 overflow-hidden flex items-center justify-center">
                          {mainPhoto ? (
                            <img src={mainPhoto} alt={unit.baseProductName} className="w-full h-full object-cover" />
                          ) : (
                            <Package className="w-6 h-6 text-slate-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-bold text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded">
                              {unit.baseProductSku}
                            </span>
                            {unit.trackingCode && unit.trackingCode.trim() !== '' && (
                              <span className="font-mono text-xs text-slate-400">
                                #{unit.trackingCode.replace(/^#/, '')}
                              </span>
                            )}
                            {unit.serialNumber && (
                              <span className="font-mono text-xs text-slate-400 bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded">
                                S/N: {unit.serialNumber}
                              </span>
                            )}
                          </div>
                          <h4 
                            title={unit.baseProductName} 
                            className="text-sm font-semibold text-white mt-1 truncate w-full group-hover:text-sky-300 transition-colors"
                          >
                            {unit.baseProductName}
                          </h4>
                          <p 
                            title={unit.customerReason} 
                            className="text-xs text-slate-400 truncate w-full mt-0.5"
                          >
                            Motivo: {unit.customerReason}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end shrink-0 sm:pl-3 flex-wrap">
                        {unit.destinationSector !== 'Openbox' && (
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${pStyle.bg} ${pStyle.text} ${pStyle.border}`}>
                            {unit.platform}
                          </span>
                        )}
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${sectorStyle}`}>
                          {unit.destinationSector}
                        </span>
                        <span className="font-mono text-xs text-slate-500 pl-2">
                          {hourStr}
                        </span>
                        {onUpdateUnit && (
                          <button
                            type="button"
                            disabled={updatingUnitId === unit.id}
                            onClick={async (e) => {
                              e.stopPropagation();
                              setUpdatingUnitId(unit.id);
                              try {
                                await onUpdateUnit({ ...unit, excludeFromDailyCount: true });
                              } finally {
                                setUpdatingUnitId(null);
                              }
                            }}
                            title="Remover este produto do contador diário de hoje"
                            className="p-1.5 text-slate-500 hover:text-amber-400 hover:bg-amber-500/15 rounded-lg transition-colors cursor-pointer"
                            id={`btn-exclude-daily-${unit.id}`}
                          >
                            <MinusCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="mt-6 pt-4 border-t border-slate-800 flex justify-between items-center text-xs text-slate-400">
            <span>Operador Atual: <strong>Logística Sênior</strong></span>
            <span>Total Geral: {totalInStock} unidades no estoque ativo</span>
          </div>
        </div>

        {/* Right Side: Platforms Breakdown (4 cols) */}
        <div className="lg:col-span-4 space-y-6" id="dashboard-right-side">
          {/* Platform Performance metrics card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl" id="platforms-card">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-sky-400" />
                Entradas Hoje por Plataforma
              </h3>
              {selectedPlatformFilter && (
                <button
                  type="button"
                  onClick={() => setSelectedPlatformFilter(null)}
                  className="text-[11px] text-sky-400 hover:text-sky-300 font-bold hover:underline cursor-pointer"
                  title="Limpar filtro de plataforma"
                >
                  Limpar
                </button>
              )}
            </div>
            <p className="text-xs text-slate-400 mb-4">Clique no nome da plataforma para filtrar a lista ao lado</p>

            <div className="space-y-2" id="platforms-breakdown">
              {platforms.map((platform) => {
                const count = platformCountsToday[platform] || 0;
                const percent = totalReceivedToday > 0 ? (count / totalReceivedToday) * 100 : 0;
                const style = getPlatformStyle(platform);
                const isSelected = selectedPlatformFilter === platform;
                const platformStyle = getPlatformFilterStyle(platform);

                return (
                  <div 
                    key={platform} 
                    onClick={() => handleTogglePlatformFilter(platform)}
                    data-selected={isSelected ? 'true' : 'false'}
                    data-platform={platform}
                    className={`platform-breakdown-row space-y-1.5 p-2.5 rounded-xl border transition-all cursor-pointer select-none ${
                      isSelected
                        ? `platform-row-selected bg-slate-800/90 ${platformStyle.ringClasses} shadow-lg`
                        : 'border-slate-800/80 bg-slate-950/40 hover:bg-slate-800/60 hover:border-slate-700'
                    }`} 
                    id={`platform-row-${platform.replace(/\s+/g, '-')}`}
                    title={`Clique para ${isSelected ? 'remover o filtro de' : 'filtrar por'} ${platform}`}
                  >
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                        <span className={`w-2.5 h-2.5 rounded-full inline-block shrink-0 ${style.dotBg}`}></span>
                        <span className="platform-name-text">{platform}</span>
                        {isSelected && (
                          <span 
                            data-platform={platform}
                            className={`platform-filtering-badge text-[9px] font-bold px-1.5 py-0.5 rounded border ml-1 ${platformStyle.badgeClasses}`}
                          >
                            Filtrando
                          </span>
                        )}
                      </span>
                      <span className="text-slate-400 font-mono text-[11px]">
                        {count} {count === 1 ? 'unid.' : 'unids.'} ({Math.round(percent)}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800/80">
                      <div 
                        className={`h-full rounded-full ${style.barBg} transition-all duration-500`}
                        style={{ width: `${count > 0 ? Math.max(percent, 3) : 0}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
