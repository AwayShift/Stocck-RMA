/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Search, 
  Filter, 
  Package, 
  Trash2, 
  FileText, 
  ArrowRight, 
  X, 
  CheckCircle2, 
  MoveRight, 
  Sparkles,
  Layers,
  AlertTriangle,
  Info,
  Eye,
  Clock
} from 'lucide-react';
import { TriageUnit, DestinationSectorType, PlatformType } from '../types';

interface PhysicalStockProps {
  units: TriageUnit[];
  onUpdateUnit: (unit: TriageUnit) => Promise<void>;
  onDeleteUnit: (id: string) => Promise<void>;
  onCheckoutUnit: (id: string) => Promise<void>;
  initialSelectedUnit?: TriageUnit | null;
  onClearSelectedUnit?: () => void;
}

export default function PhysicalStock({ 
  units, 
  onUpdateUnit, 
  onDeleteUnit, 
  onCheckoutUnit,
  initialSelectedUnit,
  onClearSelectedUnit
}: PhysicalStockProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'Todos' | DestinationSectorType | 'Baixado'>('Todos');
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(initialSelectedUnit?.id || null);

  // Multi-select state
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);

  // Quick edit/action states
  const [editingSector, setEditingSector] = useState<DestinationSectorType | ''>('');
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    type: 'danger' | 'info' | 'success';
    onConfirm: () => void;
  } | null>(null);

  // Selected unit details
  const currentUnit = units.find(u => u.id === (selectedUnitId || initialSelectedUnit?.id));

  // If initialSelectedUnit changed from parent, keep local state in sync
  React.useEffect(() => {
    if (initialSelectedUnit) {
      setSelectedUnitId(initialSelectedUnit.id);
    }
  }, [initialSelectedUnit]);

  const handleCloseDetails = () => {
    setSelectedUnitId(null);
    if (onClearSelectedUnit) {
      onClearSelectedUnit();
    }
    setEditingSector('');
  };

  // Filter logic
  const filteredUnits = units.filter(unit => {
    // 1. Search filter
    const term = searchTerm.toLowerCase().trim();
    const matchesSearch = !term ||
      (unit.baseProductName || '').toLowerCase().includes(term) ||
      (unit.baseProductSku || '').toLowerCase().includes(term) ||
      (unit.trackingCode || '').toLowerCase().includes(term) ||
      (unit.platform || '').toLowerCase().includes(term) ||
      (unit.customerReason || '').toLowerCase().includes(term) ||
      (unit.destinationSector || '').toLowerCase().includes(term) ||
      (unit.notes || '').toLowerCase().includes(term) ||
      (unit.id || '').toLowerCase().includes(term);

    // 2. Tab sector filter
    if (activeTab === 'Todos') {
      return matchesSearch && unit.status === 'Estoque';
    } else if (activeTab === 'Baixado') {
      return matchesSearch && unit.status === 'Baixado';
    } else {
      const matchesSector = unit.destinationSector === activeTab;
      // If a search term is present, allow finding the matching item across active stock items
      return unit.status === 'Estoque' && (term ? matchesSearch : (matchesSearch && matchesSector));
    }
  });

  // Toggle selection for a single item
  const handleToggleSelectUnit = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedUnitIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // Toggle select all filtered units
  const handleToggleSelectAll = () => {
    const activeFilteredIds = filteredUnits.map(u => u.id);
    const allSelected = activeFilteredIds.length > 0 && activeFilteredIds.every(id => selectedUnitIds.includes(id));
    if (allSelected) {
      setSelectedUnitIds(prev => prev.filter(id => !activeFilteredIds.includes(id)));
    } else {
      setSelectedUnitIds(prev => Array.from(new Set([...prev, ...activeFilteredIds])));
    }
  };

  // Batch checkout execution
  const handleBatchCheckout = () => {
    if (selectedUnitIds.length === 0) return;
    setConfirmConfig({
      title: 'Confirmar Baixa em Lote',
      message: `Deseja dar baixa em lote para ${selectedUnitIds.length} item(ns) selecionado(s) do estoque?`,
      type: 'success',
      onConfirm: async () => {
        try {
          for (const id of selectedUnitIds) {
            await onCheckoutUnit(id);
          }
          setActionSuccess(`Baixa efetuada com sucesso para ${selectedUnitIds.length} item(ns)!`);
          setTimeout(() => setActionSuccess(null), 3000);
          setSelectedUnitIds([]);
        } catch (err) {
          console.error(err);
          setActionError('Erro ao executar baixa em lote.');
          setTimeout(() => setActionError(null), 3000);
        }
      }
    });
  };

  // Action: Dar Baixa (with custom confirmation)
  const handleCheckout = (id: string) => {
    setConfirmConfig({
      title: 'Confirmar Baixa de Estoque',
      message: 'Confirmar saída física do produto? Esta ação dará baixa e arquivará a unidade permanentemente no histórico de baixas.',
      type: 'success',
      onConfirm: async () => {
        try {
          await onCheckoutUnit(id);
          setActionSuccess('Baixa de estoque efetuada com sucesso!');
          setTimeout(() => setActionSuccess(null), 3000);
          handleCloseDetails();
        } catch (err) {
          console.error(err);
          setActionError('Erro ao dar baixa.');
          setTimeout(() => setActionError(null), 3000);
        }
      }
    });
  };

  // Action: Move Sector (with custom confirmation)
  const handleMoveSector = (unit: TriageUnit, newSector: DestinationSectorType) => {
    setConfirmConfig({
      title: 'Mover Setor de Estoque',
      message: `Deseja alterar o setor de destino desta unidade para "${newSector}"?`,
      type: 'info',
      onConfirm: async () => {
        const updated: TriageUnit = {
          ...unit,
          destinationSector: newSector
        };
        try {
          await onUpdateUnit(updated);
          setEditingSector('');
          setActionSuccess('Setor atualizado com sucesso no estoque!');
          setTimeout(() => setActionSuccess(null), 3000);
        } catch (err) {
          console.error(err);
          setActionError('Erro ao mover setor.');
          setTimeout(() => setActionError(null), 3000);
        }
      }
    });
  };

  // Action: Delete Triage Unit (with custom confirmation)
  const handleDelete = (id: string) => {
    setConfirmConfig({
      title: 'Excluir Registro Permanentemente',
      message: 'Tem certeza absoluta de que deseja EXCLUIR este laudo de triagem e remover o registro permanentemente? Esta ação é irreversível.',
      type: 'danger',
      onConfirm: async () => {
        try {
          await onDeleteUnit(id);
          setActionSuccess('Ficha de triagem excluída com sucesso.');
          setTimeout(() => setActionSuccess(null), 3000);
          handleCloseDetails();
        } catch (err) {
          console.error(err);
          setActionError('Erro ao excluir registro.');
          setTimeout(() => setActionError(null), 3000);
        }
      }
    });
  };

  const getSectorBadgeClass = (sec: DestinationSectorType) => {
    switch (sec) {
      case 'Principal': return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      case 'Openbox': return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
      case 'RMA': return 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
    }
  };

  const getPlatformStyle = (p: PlatformType) => {
    switch(p) {
      case 'Mercado Livre': return 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20';
      case 'Shopee': return 'bg-orange-500/10 text-orange-400 border border-orange-500/20';
      case 'Amazon': return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
      case 'Kabum': return 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20';
      case 'FAVS': return 'bg-orange-500/10 text-orange-400 border border-orange-500/20';
      default: return 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20';
    }
  };

  return (
    <div className="space-y-6 relative" id="stock-manager-container">
      {/* Floating Notifications */}
      {actionSuccess && (
        <div className="fixed top-20 right-6 z-[60] bg-emerald-950 border border-emerald-500 text-emerald-200 px-5 py-3.5 rounded-xl shadow-2xl flex items-center gap-2.5 animate-in slide-in-from-top-4 duration-300">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-semibold">{actionSuccess}</span>
        </div>
      )}
      {actionError && (
        <div className="fixed top-20 right-6 z-[60] bg-rose-950 border border-rose-500 text-rose-200 px-5 py-3.5 rounded-xl shadow-2xl flex items-center gap-2.5 animate-in slide-in-from-top-4 duration-300">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
          <span className="text-xs font-semibold">{actionError}</span>
        </div>
      )}

      {/* Top Banner and Navigation Info */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl" id="stock-header">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Package className="text-sky-400 w-6 h-6" />
            Gestão de Estoque Físico
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Lista de itens triados e armazenados no galpão, com controle de status, galeria de laudo e despacho.
          </p>
        </div>
      </div>

      {/* Main Stock layout Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden" id="stock-main-card">
        {/* Navigation Tabs bar */}
        <div className="flex flex-wrap border-b border-slate-850 bg-slate-950 p-2 gap-1" id="stock-tabs">
          <button 
            onClick={() => setActiveTab('Todos')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'Todos' ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/15' : 'text-slate-455 hover:text-white hover:bg-slate-850'}`}
          >
            Todos Ativos ({units.filter(u => u.status === 'Estoque').length})
          </button>
          <button 
            onClick={() => setActiveTab('Principal')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${activeTab === 'Principal' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/15' : 'text-slate-455 hover:text-emerald-400 hover:bg-slate-850'}`}
          >
            <span className="w-2 h-2 bg-emerald-400 rounded-full"></span>
            Estoque Principal ({units.filter(u => u.status === 'Estoque' && u.destinationSector === 'Principal').length})
          </button>
          <button 
            onClick={() => setActiveTab('Openbox')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${activeTab === 'Openbox' ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/15' : 'text-slate-455 hover:text-amber-400 hover:bg-slate-850'}`}
          >
            <span className="w-2 h-2 bg-amber-400 rounded-full"></span>
            Openbox ({units.filter(u => u.status === 'Estoque' && u.destinationSector === 'Openbox').length})
          </button>
          <button 
            onClick={() => setActiveTab('RMA')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${activeTab === 'RMA' ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/15' : 'text-slate-455 hover:text-rose-400 hover:bg-slate-850'}`}
          >
            <span className="w-2 h-2 bg-rose-400 rounded-full"></span>
            RMA ({units.filter(u => u.status === 'Estoque' && u.destinationSector === 'RMA').length})
          </button>
          <div className="h-6 w-[1px] bg-slate-800 self-center mx-1"></div>
          <button 
            onClick={() => setActiveTab('Baixado')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'Baixado' ? 'bg-slate-800 text-slate-200' : 'text-slate-500 hover:text-slate-350 hover:bg-slate-850'}`}
          >
            Histórico de Baixas ({units.filter(u => u.status === 'Baixado').length})
          </button>
        </div>

        {/* Search Input and Batch Actions bar */}
        <div className="p-5 border-b border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-slate-900" id="stock-search-bar">
          <div className="flex flex-1 items-center gap-4 max-w-xl">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
              <input 
                type="text"
                placeholder="Pesquisar por SKU, Nome, Plataforma ou Código de Rastreio..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
                id="input-stock-search"
              />
            </div>
            {filteredUnits.length > 0 && activeTab !== 'Baixado' && (
              <label className="flex items-center gap-2 cursor-pointer bg-slate-950 px-3 py-2 border border-slate-800 rounded-xl hover:border-slate-700 transition-all text-xs font-bold text-slate-300 shrink-0">
                <input 
                  type="checkbox"
                  checked={filteredUnits.length > 0 && filteredUnits.every(u => selectedUnitIds.includes(u.id))}
                  onChange={handleToggleSelectAll}
                  className="w-4 h-4 rounded text-sky-500 bg-slate-900 border-slate-700 cursor-pointer"
                  id="checkbox-select-all"
                />
                <span>Selecionar Todos ({selectedUnitIds.length})</span>
              </label>
            )}
          </div>

          <div className="flex items-center gap-3 justify-between sm:justify-end">
            {selectedUnitIds.length > 0 && (
              <button
                onClick={handleBatchCheckout}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition-all shadow-lg shadow-rose-600/20 flex items-center gap-2 cursor-pointer animate-in fade-in"
                id="btn-batch-checkout"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Dar Baixa em Lote ({selectedUnitIds.length})</span>
              </button>
            )}
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Filter className="w-3.5 h-3.5 text-sky-400" />
              <span>Mostrando <strong>{filteredUnits.length}</strong> unidades</span>
            </div>
          </div>
        </div>

        {/* Units list Grid */}
        {filteredUnits.length === 0 ? (
          <div className="p-12 text-center bg-slate-950 flex flex-col items-center justify-center" id="stock-empty">
            <Package className="w-12 h-12 text-slate-600 mb-3" />
            <p className="text-slate-300 font-semibold text-sm">Nenhuma unidade física localizada.</p>
            <p className="text-slate-500 text-xs mt-1">Insira novas devoluções ou refine os termos de busca.</p>
          </div>
        ) : (
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 bg-slate-950" id="stock-grid">
            {filteredUnits.map((unit) => {
              const pStyle = getPlatformStyle(unit.platform);
              const sectorClass = getSectorBadgeClass(unit.destinationSector);
              
              // Total photos count
              const photosCount = (unit.photosProduct?.length || 0) + (unit.photosBox?.length || 0) + (unit.photosAccessories?.length || 0);

              return (
                <div 
                  key={unit.id}
                  onClick={() => setSelectedUnitId(unit.id)}
                  className="group bg-slate-900 border border-slate-800 hover:border-slate-600 rounded-xl p-4 flex flex-col justify-between hover:shadow-xl transition-all cursor-pointer"
                  id={`stock-unit-${unit.id}`}
                >
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex items-center gap-2">
                        {unit.status !== 'Baixado' && (
                          <input 
                            type="checkbox"
                            checked={selectedUnitIds.includes(unit.id)}
                            onChange={(e) => handleToggleSelectUnit(unit.id, e as any)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-4 h-4 rounded text-sky-500 bg-slate-950 border-slate-700 cursor-pointer"
                            id={`checkbox-unit-${unit.id}`}
                            title="Selecionar unidade para ação em lote"
                          />
                        )}
                        <span className="font-mono text-[10px] font-bold text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded">
                          {unit.baseProductSku}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-slate-500 font-bold">
                        #{unit.trackingCode}
                      </span>
                    </div>

                    {/* Image / Thumbnail if exists */}
                    <div className="w-full h-32 rounded-lg bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center relative">
                      {unit.photosProduct && unit.photosProduct.length > 0 ? (
                        <img src={unit.photosProduct[0]} alt={unit.baseProductName} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      ) : (
                        <Package className="w-8 h-8 text-slate-600" />
                      )}
                      {photosCount > 0 && (
                        <span className="absolute bottom-2 right-2 bg-black/80 text-[10px] text-slate-300 px-1.5 py-0.5 rounded font-mono font-bold">
                          {photosCount} {photosCount === 1 ? 'Foto' : 'Fotos'}
                        </span>
                      )}
                      {unit.status === 'Baixado' && (
                        <span className="absolute inset-0 bg-black/70 flex items-center justify-center text-rose-400 font-bold text-xs uppercase tracking-wider">
                          Saída Efetuada
                        </span>
                      )}
                    </div>

                    {/* Metadata details */}
                    <div>
                      <h4 className="font-bold text-white text-sm line-clamp-1 group-hover:text-sky-400 transition-colors">
                        {unit.baseProductName}
                      </h4>
                      <p className="text-xs text-slate-400 line-clamp-1 mt-1">
                        Motivo: {unit.customerReason}
                      </p>
                      <p className="text-[10px] text-slate-450 font-medium mt-1.5 flex items-center gap-1 font-mono">
                        <Clock className="w-3.5 h-3.5 text-sky-450 shrink-0" />
                        <span>Entrada:</span>
                        <span className="text-slate-300 font-semibold">
                          {new Date(unit.createdAt).toLocaleDateString('pt-BR')} {new Date(unit.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800 flex justify-between items-center text-xs">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${pStyle}`}>
                      {unit.platform}
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${sectorClass}`}>
                      {unit.destinationSector}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Complete unit details Modal Sheet */}
      {currentUnit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto" id="stock-details-modal">
          <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-8 animate-in fade-in zoom-in duration-200">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center px-6 py-4 bg-slate-950 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded">
                    {currentUnit.baseProductSku}
                  </span>
                  <span className="font-mono text-xs text-slate-500">
                    Caso: #{currentUnit.trackingCode}
                  </span>
                </div>
                <h3 className="text-base font-bold text-white mt-1">
                  {currentUnit.baseProductName}
                </h3>
              </div>
              <button 
                onClick={handleCloseDetails}
                className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg border border-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
              
              {/* Top metadata grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-950 p-4 border border-slate-850 rounded-xl text-xs">
                <div>
                  <span className="text-slate-450 block uppercase font-bold tracking-wider text-[9px] mb-1">Origem / Canal</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getPlatformStyle(currentUnit.platform)}`}>
                    {currentUnit.platform}
                  </span>
                </div>
                <div>
                  <span className="text-slate-450 block uppercase font-bold tracking-wider text-[9px] mb-1">Voltagem Elétrica</span>
                  <span className="font-semibold text-slate-200 font-mono bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">{currentUnit.baseProductVoltage}</span>
                </div>
                <div>
                  <span className="text-slate-450 block uppercase font-bold tracking-wider text-[9px] mb-1">Data de Triagem</span>
                  <span className="font-semibold text-slate-300">{new Date(currentUnit.createdAt).toLocaleDateString('pt-BR')} {new Date(currentUnit.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div>
                  <span className="text-slate-450 block uppercase font-bold tracking-wider text-[9px] mb-1">Status Interno</span>
                  <span className={`font-semibold px-2 py-0.5 rounded text-[10px] font-bold ${currentUnit.status === 'Estoque' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                    {currentUnit.status === 'Estoque' ? 'Em Estoque' : 'Baixado / Saída'}
                  </span>
                </div>
              </div>

              {/* Claims and Accessories details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-950/40 rounded-xl border border-slate-850 space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    Motivo da Devolução (Cliente)
                  </h4>
                  <p className="text-sm text-slate-300 leading-relaxed italic">
                    "{currentUnit.customerReason}"
                  </p>
                </div>

                <div className="p-4 bg-slate-950/40 rounded-xl border border-slate-850 space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-sky-400" />
                    Lista de Acessórios Recebidos
                  </h4>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    {currentUnit.accessoriesInclusion || 'Nenhum acessório declarado.'}
                  </p>
                  <div className="grid grid-cols-2 gap-2 pt-2 text-[10px] text-slate-450 border-t border-slate-800">
                    <span>Aparelho: <strong>{currentUnit.deviceStatus}</strong></span>
                    <span>Caixa: <strong>{currentUnit.packageStatus}</strong></span>
                  </div>
                </div>
              </div>

              {/* Integrated Photo Gallery split by logical category */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                  Galeria de Fotos da Triagem
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4" id="gallery-categories">
                  {/* Category A: Product */}
                  <div className="p-3 bg-slate-950/30 rounded-xl border border-slate-850 space-y-2">
                    <span className="text-[11px] font-bold text-slate-400 block border-b border-slate-800 pb-1">Fotos do Aparelho ({currentUnit.photosProduct?.length || 0})</span>
                    {currentUnit.photosProduct && currentUnit.photosProduct.length > 0 ? (
                      <div className="grid grid-cols-2 gap-1.5">
                        {currentUnit.photosProduct.map((p, i) => (
                          <div 
                            key={i} 
                            onClick={() => setFullscreenImage(p)}
                            className="w-full aspect-video rounded-lg overflow-hidden border border-slate-800 hover:border-sky-550 cursor-pointer relative group"
                          >
                            <img src={p} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs transition-opacity">
                              <Eye className="w-4 h-4" />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-500 italic py-3 text-center">Nenhuma foto do aparelho.</p>
                    )}
                  </div>

                  {/* Category B: Box */}
                  <div className="p-3 bg-slate-950/30 rounded-xl border border-slate-850 space-y-2">
                    <span className="text-[11px] font-bold text-slate-400 block border-b border-slate-800 pb-1">Fotos da Embalagem ({currentUnit.photosBox?.length || 0})</span>
                    {currentUnit.photosBox && currentUnit.photosBox.length > 0 ? (
                      <div className="grid grid-cols-2 gap-1.5">
                        {currentUnit.photosBox.map((p, i) => (
                          <div 
                            key={i} 
                            onClick={() => setFullscreenImage(p)}
                            className="w-full aspect-video rounded-lg overflow-hidden border border-slate-800 hover:border-sky-550 cursor-pointer relative group"
                          >
                            <img src={p} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs transition-opacity">
                              <Eye className="w-4 h-4" />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-500 italic py-3 text-center">Nenhuma foto da caixa.</p>
                    )}
                  </div>

                  {/* Category C: Accessories */}
                  <div className="p-3 bg-slate-950/30 rounded-xl border border-slate-850 space-y-2">
                    <span className="text-[11px] font-bold text-slate-400 block border-b border-slate-800 pb-1">Fotos dos Acessórios ({currentUnit.photosAccessories?.length || 0})</span>
                    {currentUnit.photosAccessories && currentUnit.photosAccessories.length > 0 ? (
                      <div className="grid grid-cols-2 gap-1.5">
                        {currentUnit.photosAccessories.map((p, i) => (
                          <div 
                            key={i} 
                            onClick={() => setFullscreenImage(p)}
                            className="w-full aspect-video rounded-lg overflow-hidden border border-slate-800 hover:border-sky-550 cursor-pointer relative group"
                          >
                            <img src={p} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs transition-opacity">
                              <Eye className="w-4 h-4" />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-500 italic py-3 text-center">Nenhuma foto de acessórios.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Technical Report / Observations HTML Render */}
              <div className="space-y-2" id="technical-report-view">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-sky-400" />
                  Laudo Técnico de Entrada (Triador)
                </h4>
                {currentUnit.notes ? (
                  <div 
                    className="p-5 bg-slate-950 border border-slate-850 rounded-xl text-sm text-slate-300 leading-relaxed max-h-60 overflow-y-auto prose prose-invert prose-sm"
                    dangerouslySetInnerHTML={{ __html: currentUnit.notes }}
                  />
                ) : (
                  <p className="p-4 text-xs text-slate-500 bg-slate-950 rounded-xl border border-slate-850 italic text-center">Sem observações descritivas fornecidas.</p>
                )}
              </div>

              {/* Checkout details if already dispatched */}
              {currentUnit.status === 'Baixado' && currentUnit.checkoutDate && (
                <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Este produto foi retirado física e logicamente do galpão em <strong>{new Date(currentUnit.checkoutDate).toLocaleString('pt-BR')}</strong>.</span>
                </div>
              )}
            </div>

            {/* Modal Action Controls Bar */}
            <div className="px-6 py-4 bg-slate-950 border-t border-slate-850 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              
              {/* Left Side Actions: Re-route / Move Sector (only if active in stock) */}
              {currentUnit.status === 'Estoque' ? (
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <span className="text-[11px] font-bold text-slate-400 whitespace-nowrap">Mover de Setor:</span>
                  <select 
                    value={editingSector || currentUnit.destinationSector}
                    onChange={(e) => handleMoveSector(currentUnit, e.target.value as DestinationSectorType)}
                    className="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-bold focus:outline-none cursor-pointer"
                    style={{
                      color: (editingSector || currentUnit.destinationSector) === 'Principal' ? '#10B981' : (editingSector || currentUnit.destinationSector) === 'Openbox' ? '#F59E0B' : '#EF4444'
                    }}
                    id="select-change-sector"
                  >
                    <option value="Principal" style={{ color: '#10B981', backgroundColor: '#0f172a' }}>🟢 Principal (Venda Novo)</option>
                    <option value="Openbox" style={{ color: '#F59E0B', backgroundColor: '#0f172a' }}>🟠 Openbox (Outlet)</option>
                    <option value="RMA" style={{ color: '#EF4444', backgroundColor: '#0f172a' }}>🔴 RMA (Fila Técnica)</option>
                  </select>
                </div>
              ) : (
                <div className="text-slate-500 text-xs">Ações indisponíveis para produtos baixados.</div>
              )}

              {/* Right Side Actions: Dar Baixa & Excluir */}
              <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                <button 
                  onClick={() => handleDelete(currentUnit.id)}
                  className="px-3 py-2 bg-slate-800 hover:bg-rose-600/20 text-slate-405 hover:text-rose-400 border border-slate-750 hover:border-rose-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                  title="Apagar ficha técnica do banco"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Excluir Registro
                </button>

                {currentUnit.status === 'Estoque' && (
                  <button 
                    onClick={() => handleCheckout(currentUnit.id)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-lg shadow-emerald-600/20 flex items-center gap-1.5 transition-all cursor-pointer"
                    id="btn-stock-checkout"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Dar Baixa de Estoque
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Photo Lightbox wrapper */}
      {fullscreenImage && (
        <div 
          onClick={() => setFullscreenImage(null)}
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in duration-200"
        >
          <button className="absolute top-4 right-4 p-2 bg-slate-900 rounded-full text-white hover:bg-slate-800 cursor-pointer">
            <X className="w-6 h-6" />
          </button>
          <img src={fullscreenImage} className="max-w-full max-h-[90vh] rounded-xl border border-slate-800 object-contain shadow-2xl" />
        </div>
      )}

      {/* Custom Confirmation Modal */}
      {confirmConfig && (
        <div className="fixed inset-0 z-[110] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className={`p-2.5 rounded-xl border shrink-0 ${
                confirmConfig.type === 'danger' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                confirmConfig.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                'bg-sky-500/10 text-sky-400 border-sky-500/20'
              }`}>
                {confirmConfig.type === 'danger' ? <Trash2 className="w-5 h-5" /> : 
                 confirmConfig.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> :
                 <Layers className="w-5 h-5" />}
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">{confirmConfig.title}</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">{confirmConfig.message}</p>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmConfig(null)}
                className="px-4 py-2 bg-slate-850 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmConfig.onConfirm();
                  setConfirmConfig(null);
                }}
                className={`px-4 py-2 rounded-xl text-xs font-black text-white transition-all cursor-pointer ${
                  confirmConfig.type === 'danger' ? 'bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-600/15' :
                  confirmConfig.type === 'success' ? 'bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-600/15' :
                  'bg-sky-600 hover:bg-sky-500 shadow-lg shadow-sky-600/15'
                }`}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
