/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  TrendingUp, 
  Package, 
  Sparkles, 
  AlertTriangle, 
  ArrowRight, 
  Calendar, 
  ShoppingCart, 
  Layers 
} from 'lucide-react';
import { TriageUnit, PlatformType, DestinationSectorType, isMigrationUnit, BaseProduct } from '../types';
import { getUnitResolvedPhotos } from '../utils/productImages';

interface DashboardProps {
  units: TriageUnit[];
  products?: BaseProduct[];
  onViewUnit: (unit: TriageUnit) => void;
  onNavigateToStock: () => void;
  onResetData?: () => void;
}

export default function Dashboard({ units, products = [], onViewUnit, onNavigateToStock }: DashboardProps) {
  // Filter for today's units (based on local timezone, excluding migration imports)
  const todayUnits = units.filter(u => {
    try {
      if (isMigrationUnit(u)) return false;
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

  // Platform colors & logos styling
  const getPlatformStyle = (p: PlatformType) => {
    switch(p) {
      case 'Mercado Livre': return { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/30', barBg: 'bg-yellow-400', dotBg: 'bg-yellow-400' };
      case 'Shopee': return { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30', barBg: 'bg-orange-400', dotBg: 'bg-orange-400' };
      case 'Amazon': return { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30', barBg: 'bg-blue-400', dotBg: 'bg-blue-400' };
      case 'Amazon Ta Novo': return { 
        bg: 'bg-[#05621a]/20', 
        text: 'text-emerald-300', 
        border: 'border-[#05621a]/80', 
        barBg: 'bg-[#05621a]', 
        dotBg: 'bg-[#05621a]',
        customColor: 'rgba(5, 98, 26, 0.8)'
      };
      case 'Kabum': return { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/30', barBg: 'bg-indigo-400', dotBg: 'bg-indigo-400' };
      default: return { bg: 'bg-zinc-500/10', text: 'text-zinc-400', border: 'border-zinc-500/30', barBg: 'bg-zinc-400', dotBg: 'bg-zinc-400' };
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
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 px-3.5 py-2 bg-slate-950 rounded-lg border border-slate-800 text-xs text-slate-300 shadow-inner">
            <Calendar className="w-4 h-4 text-sky-400" />
            <span>{getFormattedLocalDate()}</span>
          </div>
        </div>
      </div>

      {/* Primary KPIs Matrix */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6" id="kpi-grid">
        {/* KPI 1: Today Receives */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden group hover:border-slate-700 transition-all shadow-lg" id="kpi-today">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Recebidos Hoje</span>
              <h3 className="text-4xl font-black text-white mt-1.5">{totalReceivedToday}</h3>
            </div>
            <div className="p-3 bg-sky-500/10 text-sky-400 rounded-xl">
              <Layers className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-5 flex items-center text-sm text-sky-400 font-bold cursor-pointer group" onClick={onNavigateToStock}>
            Ver estoque atual
            <ArrowRight className="w-3.5 h-3.5 ml-1.5 group-hover:translate-x-1 transition-transform" />
          </div>
          <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-sky-500/5 rounded-full filter blur-xl group-hover:scale-150 transition-transform"></div>
        </div>

        {/* KPI 2: Principal */}
        <div className="bg-slate-900 border border-emerald-500/20 hover:border-emerald-500/40 rounded-2xl p-6 relative overflow-hidden group transition-all shadow-lg" id="kpi-principal">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Estoque Principal</span>
              <h3 className="text-4xl font-black text-emerald-400 mt-1.5">{sectorCountsGlobal.Principal}</h3>
            </div>
            <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl">
              <Package className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-5 text-sm text-slate-400">
            <span className="text-emerald-400 font-bold">+{sectorCountsToday.Principal} hoje</span> direcionados para revenda
          </div>
          <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-emerald-500/5 rounded-full filter blur-xl group-hover:scale-150 transition-transform"></div>
        </div>

        {/* KPI 3: Openbox */}
        <div className="bg-slate-900 border border-amber-500/20 hover:border-amber-500/40 rounded-2xl p-6 relative overflow-hidden group transition-all shadow-lg" id="kpi-openbox">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Setor Openbox</span>
              <h3 className="text-4xl font-black text-amber-400 mt-1.5">{sectorCountsGlobal.Openbox}</h3>
            </div>
            <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl">
              <Sparkles className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-5 text-sm text-slate-400">
            <span className="text-amber-400 font-bold">+{sectorCountsToday.Openbox} hoje</span> caixa aberta / marcas leves
          </div>
          <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-amber-500/5 rounded-full filter blur-xl group-hover:scale-150 transition-transform"></div>
        </div>

        {/* KPI 4: RMA */}
        <div className="bg-slate-900 border border-rose-500/20 hover:border-rose-500/40 rounded-2xl p-6 relative overflow-hidden group transition-all shadow-lg" id="kpi-conserto">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Aguardando RMA</span>
              <h3 className="text-4xl font-black text-rose-400 mt-1.5">{sectorCountsGlobal.RMA}</h3>
            </div>
            <div className="p-3 bg-rose-500/10 text-rose-400 rounded-xl">
              <AlertTriangle className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-5 text-sm text-slate-400">
            <span className="text-rose-400 font-bold">+{sectorCountsToday.RMA} hoje</span> falhas técnicas / defeito real
          </div>
          <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-rose-500/5 rounded-full filter blur-xl group-hover:scale-150 transition-transform"></div>
        </div>
      </div>

      {/* Main Grid: Platforms Breakdown & Today's Activity Log */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="dashboard-main-grid">
        {/* Left Side: Today's Triage Activity Log (8 cols) */}
        <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between" id="today-activity-card">
          <div>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-bold text-white">
                  Histórico de Triagem de Hoje
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Últimas devoluções recebidas e processadas hoje no setor</p>
              </div>
              <span className="px-2.5 py-1 bg-sky-500/10 text-sky-400 rounded-full text-xs font-bold border border-sky-500/20">
                {totalReceivedToday} Devoluções
              </span>
            </div>

            {todayUnits.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 border border-dashed border-slate-800 rounded-xl bg-slate-950" id="no-returns-today">
                <Package className="w-12 h-12 text-slate-600 mb-3" />
                <p className="text-slate-300 font-medium text-sm">Nenhuma devolução realizada hoje ainda.</p>
                <p className="text-slate-500 text-xs text-center max-w-sm mt-1">Vá até o módulo "Entrada de RMA" para registrar e fazer a triagem do primeiro retorno.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1" id="today-activity-list">
                {todayUnits.map((unit) => {
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
            <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-sky-400" />
              Entradas Hoje por Plataforma
            </h3>
            <p className="text-xs text-slate-400 mb-6">Distribuição dos itens de devolução recebidos hoje ({totalReceivedToday} {totalReceivedToday === 1 ? 'item' : 'itens'})</p>

            <div className="space-y-4" id="platforms-breakdown">
              {platforms.map((platform) => {
                const count = platformCountsToday[platform] || 0;
                const percent = totalReceivedToday > 0 ? (count / totalReceivedToday) * 100 : 0;
                const style = getPlatformStyle(platform);

                return (
                  <div key={platform} className="space-y-1.5" id={`platform-row-${platform.replace(' ', '-')}`}>
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${style.dotBg}`}></span>
                        {platform}
                      </span>
                      <span className="text-slate-400 font-mono">
                        {count} {count === 1 ? 'unid.' : 'unids.'} ({Math.round(percent)}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800/80">
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
