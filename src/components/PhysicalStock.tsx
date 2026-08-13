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
  Clock,
  LayoutGrid,
  List,
  Check,
  FileSpreadsheet,
  Upload,
  Pencil,
  Save,
  Plus,
  RotateCcw,
  Camera,
  Image as ImageIcon
} from 'lucide-react';
import { TriageUnit, DestinationSectorType, PlatformType, BaseProduct, DeviceStatusType, PackageStatusType } from '../types';
import ExcelImportModal from './ExcelImportModal';

// Helper to compress image to base64
const compressImageToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 600;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        } else {
          resolve(e.target?.result as string);
        }
      };
      img.onerror = () => reject(new Error('Falha ao processar imagem.'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Falha ao ler arquivo.'));
    reader.readAsDataURL(file);
  });
};

interface PhysicalStockProps {
  units: TriageUnit[];
  products?: BaseProduct[];
  onUpdateUnit: (unit: TriageUnit) => Promise<void>;
  onDeleteUnit: (id: string) => Promise<void>;
  onCheckoutUnit: (id: string) => Promise<void>;
  initialSelectedUnit?: TriageUnit | null;
  onClearSelectedUnit?: () => void;
  onSaveTriage?: (unit: TriageUnit) => Promise<void>;
}

export default function PhysicalStock({ 
  units, 
  products = [],
  onUpdateUnit, 
  onDeleteUnit, 
  onCheckoutUnit,
  initialSelectedUnit,
  onClearSelectedUnit,
  onSaveTriage
}: PhysicalStockProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'Todos' | DestinationSectorType | 'Baixado'>('Todos');
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(initialSelectedUnit?.id || null);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    const saved = localStorage.getItem('rma_stock_view_mode');
    return saved === 'list' ? 'list' : 'grid';
  });

  const handleSetViewMode = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('rma_stock_view_mode', mode);
  };

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

  // Edit mode state for selected unit
  const [isEditingUnit, setIsEditingUnit] = useState(false);
  const [editForm, setEditForm] = useState<TriageUnit | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [urlInputCategory, setUrlInputCategory] = useState<'photosProduct' | 'photosBox' | 'photosAccessories'>('photosProduct');

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
    setIsEditingUnit(false);
    setEditForm(null);
  };

  const handleStartEdit = (unit: TriageUnit) => {
    setSelectedUnitId(unit.id);
    setEditForm({ ...unit });
    setIsEditingUnit(true);
  };

  const handleSaveEdit = async () => {
    if (!editForm) return;
    setIsSavingEdit(true);
    try {
      await onUpdateUnit(editForm);
      setIsSavingEdit(false);
      setIsEditingUnit(false);
      setActionSuccess('Ficha do produto e fotos atualizados com sucesso!');
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      console.error('Error updating unit:', err);
      setActionError(`Erro ao salvar alterações: ${err?.message || err}`);
      setIsSavingEdit(false);
      setTimeout(() => setActionError(null), 4000);
    }
  };

  const handleAddPhotoFile = async (category: 'photosProduct' | 'photosBox' | 'photosAccessories', e: React.ChangeEvent<HTMLInputElement>) => {
    if (!editForm || !e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    try {
      const base64 = await compressImageToBase64(file);
      const existing = editForm[category] || [];
      setEditForm({
        ...editForm,
        [category]: [...existing, base64]
      });
      // Reset input value so same file can be chosen again if needed
      e.target.value = '';
    } catch (err) {
      alert('Erro ao carregar a imagem.');
    }
  };

  const handleAddPhotoUrl = (category: 'photosProduct' | 'photosBox' | 'photosAccessories') => {
    if (!editForm || !imageUrlInput.trim()) return;
    const existing = editForm[category] || [];
    setEditForm({
      ...editForm,
      [category]: [...existing, imageUrlInput.trim()]
    });
    setImageUrlInput('');
  };

  const handleRemovePhoto = (category: 'photosProduct' | 'photosBox' | 'photosAccessories', index: number) => {
    if (!editForm) return;
    const existing = editForm[category] || [];
    const updated = existing.filter((_, i) => i !== index);
    setEditForm({
      ...editForm,
      [category]: updated
    });
  };

  // State to toggle filtering only duplicate items
  const [filterOnlyDuplicates, setFilterOnlyDuplicates] = useState(false);

  // Track duplicated STI Codes (trackingCode) and Serial Numbers (serialNumber) in active physical stock
  const duplicateStiSet = React.useMemo(() => {
    const counts: Record<string, number> = {};
    units.forEach(u => {
      if (u.status === 'Estoque' && u.trackingCode && u.trackingCode.trim()) {
        const key = u.trackingCode.trim().toLowerCase();
        counts[key] = (counts[key] || 0) + 1;
      }
    });
    const set = new Set<string>();
    Object.entries(counts).forEach(([key, count]) => {
      if (count > 1) set.add(key);
    });
    return set;
  }, [units]);

  const duplicateSerialSet = React.useMemo(() => {
    const counts: Record<string, number> = {};
    units.forEach(u => {
      if (u.status === 'Estoque' && u.serialNumber && u.serialNumber.trim()) {
        const key = u.serialNumber.trim().toLowerCase();
        counts[key] = (counts[key] || 0) + 1;
      }
    });
    const set = new Set<string>();
    Object.entries(counts).forEach(([key, count]) => {
      if (count > 1) set.add(key);
    });
    return set;
  }, [units]);

  const isDuplicateSti = (unit: TriageUnit) => {
    if (!unit.trackingCode || !unit.trackingCode.trim()) return false;
    return duplicateStiSet.has(unit.trackingCode.trim().toLowerCase());
  };

  const isDuplicateSerial = (unit: TriageUnit) => {
    if (!unit.serialNumber || !unit.serialNumber.trim()) return false;
    return duplicateSerialSet.has(unit.serialNumber.trim().toLowerCase());
  };

  const isUnitDuplicate = (unit: TriageUnit) => {
    return isDuplicateSti(unit) || isDuplicateSerial(unit);
  };

  const duplicateUnitsCount = React.useMemo(() => {
    return units.filter(u => u.status === 'Estoque' && (isDuplicateSti(u) || isDuplicateSerial(u))).length;
  }, [units, duplicateStiSet, duplicateSerialSet]);

  // Filter logic
  const filteredUnits = units.filter(unit => {
    // 0. Filter only duplicate items if toggle is active
    if (filterOnlyDuplicates && !isUnitDuplicate(unit)) {
      return false;
    }

    // 1. Search filter
    const term = searchTerm.toLowerCase().trim();
    const matchesSearch = !term ||
      (unit.baseProductName || '').toLowerCase().includes(term) ||
      (unit.baseProductSku || '').toLowerCase().includes(term) ||
      (unit.trackingCode || '').toLowerCase().includes(term) ||
      (unit.serialNumber || '').toLowerCase().includes(term) ||
      (unit.destinationSector !== 'Openbox' && (unit.platform || '').toLowerCase().includes(term)) ||
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
      default: return 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20';
    }
  };

  const handleImportBatchUnits = async (importedUnits: TriageUnit[]) => {
    try {
      for (const unit of importedUnits) {
        if (onSaveTriage) {
          await onSaveTriage(unit);
        } else {
          await onUpdateUnit(unit);
        }
      }
      setActionSuccess(`${importedUnits.length} produtos importados do Excel e direcionados aos setores!`);
      setTimeout(() => setActionSuccess(null), 5000);
    } catch (err: any) {
      setActionError(`Erro ao salvar lote de inventário: ${err?.message || err}`);
      setTimeout(() => setActionError(null), 5000);
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
            Gestão de Estoque Físico & OpenBox
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Lista de itens triados e armazenados no galpão, com controle de status, galeria de laudo e despacho.
          </p>
        </div>

        <button
          onClick={() => setIsExcelModalOpen(true)}
          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-2 cursor-pointer shrink-0"
          id="btn-open-excel-import"
          title="Importar planilha Excel de inventário OpenBox e direcionar por categorias"
        >
          <FileSpreadsheet className="w-4.5 h-4.5 text-white" />
          <span>Importar Tabela Excel (OpenBox)</span>
        </button>
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
              <button
                type="button"
                onClick={handleToggleSelectAll}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer select-none shrink-0 ${
                  filteredUnits.every(u => selectedUnitIds.includes(u.id))
                    ? 'bg-sky-500/10 border-sky-500/40 text-sky-400 shadow-sm'
                    : selectedUnitIds.length > 0
                    ? 'bg-sky-950/40 border-sky-800/50 text-sky-300'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
                }`}
                id="btn-select-all"
                title={filteredUnits.every(u => selectedUnitIds.includes(u.id)) ? "Deselecionar todos" : "Selecionar todos os produtos filtrados"}
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                  filteredUnits.every(u => selectedUnitIds.includes(u.id))
                    ? 'bg-sky-500 border-sky-400 text-white shadow-sm'
                    : selectedUnitIds.length > 0
                    ? 'bg-sky-500/20 border-sky-500/50 text-sky-400'
                    : 'border-slate-700 bg-slate-900'
                }`}>
                  {filteredUnits.every(u => selectedUnitIds.includes(u.id)) && (
                    <Check className="w-3 h-3 stroke-[3]" />
                  )}
                  {!filteredUnits.every(u => selectedUnitIds.includes(u.id)) && selectedUnitIds.length > 0 && (
                    <div className="w-1.5 h-1.5 rounded-xs bg-sky-400" />
                  )}
                </div>
                <span>
                  {filteredUnits.every(u => selectedUnitIds.includes(u.id))
                    ? `Todos Selecionados (${selectedUnitIds.length})`
                    : selectedUnitIds.length > 0
                    ? `Selecionados (${selectedUnitIds.length}/${filteredUnits.length})`
                    : `Selecionar Todos (${filteredUnits.length})`}
                </span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 justify-between sm:justify-end flex-wrap">
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

            {/* Filter Duplicates button */}
            <button 
              type="button"
              onClick={() => setFilterOnlyDuplicates(prev => !prev)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border ${
                filterOnlyDuplicates
                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-black shadow-lg shadow-amber-500/20 scale-105'
                  : duplicateUnitsCount > 0
                  ? 'bg-amber-500/10 border-amber-500/40 text-amber-400 hover:bg-amber-500/20'
                  : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
              }`}
              title="Filtrar produtos com STI ou Serial repetidos"
              id="btn-filter-duplicates"
            >
              <AlertTriangle className={`w-3.5 h-3.5 ${filterOnlyDuplicates ? 'text-slate-950' : 'text-amber-400'}`} />
              <span>{filterOnlyDuplicates ? 'Apenas Duplicados' : `Duplicados (${duplicateUnitsCount})`}</span>
              {duplicateUnitsCount > 0 && !filterOnlyDuplicates && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
              )}
            </button>

            {/* View switcher: Grid vs List/Linhas */}
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 gap-0.5" id="stock-view-switcher">
              <button
                onClick={() => handleSetViewMode('grid')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  viewMode === 'grid' 
                    ? 'bg-sky-500 text-white shadow-sm' 
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
                title="Visualização em Grade"
                id="btn-view-grid"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Grade</span>
              </button>
              <button
                onClick={() => handleSetViewMode('list')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  viewMode === 'list' 
                    ? 'bg-sky-500 text-white shadow-sm' 
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
                title="Visualização em Linhas"
                id="btn-view-list"
              >
                <List className="w-3.5 h-3.5" />
                <span>Linhas</span>
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Filter className="w-3.5 h-3.5 text-sky-400" />
              <span>Mostrando <strong>{filteredUnits.length}</strong> unidades</span>
            </div>
          </div>
        </div>

        {/* Duplicate Warning Banner */}
        {duplicateUnitsCount > 0 && (
          <div className={`px-5 py-3 border-b flex flex-wrap items-center justify-between gap-3 text-xs font-medium transition-colors ${
            filterOnlyDuplicates 
              ? 'bg-amber-950/60 border-amber-500/50 text-amber-200' 
              : 'bg-amber-950/30 border-amber-500/30 text-amber-300'
          }`} id="stock-duplicate-banner">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>{duplicateUnitsCount}</strong> {duplicateUnitsCount === 1 ? 'produto possui' : 'produtos possuem'} <strong>Código STI</strong> ou <strong>Número de Série</strong> repetidos no estoque físico.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setFilterOnlyDuplicates(prev => !prev)}
              className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Filter className="w-3 h-3" />
              <span>{filterOnlyDuplicates ? 'Mostrar Todos os Produtos' : 'Filtrar Apenas Duplicados'}</span>
            </button>
          </div>
        )}

        {/* Units list Grid or List */}
        {filteredUnits.length === 0 ? (
          <div className="p-12 text-center bg-slate-950 flex flex-col items-center justify-center" id="stock-empty">
            <Package className="w-12 h-12 text-slate-600 mb-3" />
            <p className="text-slate-300 font-semibold text-sm">Nenhuma unidade física localizada.</p>
            <p className="text-slate-500 text-xs mt-1">Insira novas devoluções ou refine os termos de busca.</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 bg-slate-950" id="stock-grid">
            {filteredUnits.map((unit) => {
              const pStyle = getPlatformStyle(unit.platform);
              const sectorClass = getSectorBadgeClass(unit.destinationSector);
              
              // Total photos count
              const photosCount = (unit.photosProduct?.length || 0) + (unit.photosBox?.length || 0) + (unit.photosAccessories?.length || 0);

              const hasDupSti = isDuplicateSti(unit);
              const hasDupSerial = isDuplicateSerial(unit);

              return (
                <div 
                  key={unit.id}
                  onClick={() => setSelectedUnitId(unit.id)}
                  className={`group bg-slate-900 border hover:border-slate-600 rounded-xl p-4 flex flex-col justify-between hover:shadow-xl transition-all cursor-pointer ${
                    hasDupSti || hasDupSerial ? 'border-amber-500/50 shadow-md shadow-amber-500/5' : 'border-slate-800'
                  }`}
                  id={`stock-unit-${unit.id}`}
                >
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {unit.status !== 'Baixado' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleSelectUnit(unit.id, e as any);
                            }}
                            className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                              selectedUnitIds.includes(unit.id)
                                ? 'bg-sky-500 border-sky-400 text-white shadow-sm shadow-sky-500/20 scale-105'
                                : 'bg-slate-950 border-slate-700 text-transparent hover:border-sky-500/50 hover:bg-slate-900'
                            }`}
                            id={`checkbox-unit-${unit.id}`}
                            title={selectedUnitIds.includes(unit.id) ? "Desmarcar unidade" : "Selecionar unidade para ação em lote"}
                          >
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </button>
                        )}
                        <span className="font-mono text-[10px] font-bold text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded">
                          {unit.baseProductSku}
                        </span>
                        {unit.serialNumber && (
                          <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${
                            hasDupSerial 
                              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-bold' 
                              : 'text-slate-400 bg-slate-950 border-slate-800'
                          }`} title={hasDupSerial ? "Número de Série Duplicado!" : "Número de Série"}>
                            S/N: {unit.serialNumber}
                          </span>
                        )}
                        {hasDupSti && (
                          <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1.5 py-0.5 rounded font-mono text-[10px] font-bold flex items-center gap-0.5" title="Código STI Duplicado!">
                            <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                            <span>STI Repetido</span>
                          </span>
                        )}
                        {hasDupSerial && (
                          <span className="bg-rose-500/20 text-rose-300 border border-rose-500/40 px-1.5 py-0.5 rounded font-mono text-[10px] font-bold flex items-center gap-0.5" title="Número de Série Duplicado!">
                            <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
                            <span>Serial Repetido</span>
                          </span>
                        )}
                      </div>
                      <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                        hasDupSti ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'text-slate-500'
                      }`}>
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
                    {unit.destinationSector !== 'Openbox' ? (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${pStyle}`}>
                        {unit.platform}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-500 italic">Openbox</span>
                    )}
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${sectorClass}`}>
                        {unit.destinationSector}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartEdit(unit);
                        }}
                        className="px-2 py-0.5 bg-slate-800 hover:bg-sky-600/30 text-sky-400 hover:text-sky-300 border border-slate-700 hover:border-sky-500/50 rounded-md text-[10px] font-bold transition-colors flex items-center gap-1 cursor-pointer"
                        title="Editar nome, fotos, descrição e laudo do produto"
                      >
                        <Pencil className="w-3 h-3" />
                        <span>Editar</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* List / Linhas View */
          <div className="p-4 space-y-2 bg-slate-950" id="stock-list-rows">
            {filteredUnits.map((unit) => {
              const pStyle = getPlatformStyle(unit.platform);
              const sectorClass = getSectorBadgeClass(unit.destinationSector);
              const photosCount = (unit.photosProduct?.length || 0) + (unit.photosBox?.length || 0) + (unit.photosAccessories?.length || 0);

              const hasDupSti = isDuplicateSti(unit);
              const hasDupSerial = isDuplicateSerial(unit);

              return (
                <div 
                  key={unit.id}
                  onClick={() => setSelectedUnitId(unit.id)}
                  className={`group bg-slate-900 border hover:border-slate-600 rounded-xl p-3 sm:p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:shadow-lg transition-all cursor-pointer ${
                    hasDupSti || hasDupSerial ? 'border-amber-500/50' : 'border-slate-800/80'
                  }`}
                  id={`stock-unit-list-${unit.id}`}
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    {unit.status !== 'Baixado' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleSelectUnit(unit.id, e as any);
                        }}
                        className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                          selectedUnitIds.includes(unit.id)
                            ? 'bg-sky-500 border-sky-400 text-white shadow-sm shadow-sky-500/20 scale-105'
                            : 'bg-slate-950 border-slate-700 text-transparent hover:border-sky-500/50 hover:bg-slate-900'
                        }`}
                        id={`checkbox-unit-list-${unit.id}`}
                        title={selectedUnitIds.includes(unit.id) ? "Desmarcar unidade" : "Selecionar unidade para ação em lote"}
                      >
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </button>
                    )}

                    {/* Thumbnail */}
                    <div className="w-12 h-12 rounded-lg bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center shrink-0 relative">
                      {unit.photosProduct && unit.photosProduct.length > 0 ? (
                        <img src={unit.photosProduct[0]} alt={unit.baseProductName} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      ) : (
                        <Package className="w-5 h-5 text-slate-600" />
                      )}
                      {photosCount > 0 && (
                        <span className="absolute bottom-0.5 right-0.5 bg-black/80 text-[8px] text-slate-300 px-1 py-0.2 rounded font-mono font-bold">
                          {photosCount}
                        </span>
                      )}
                    </div>

                    {/* Details */}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[10px] font-bold text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded shrink-0">
                          {unit.baseProductSku}
                        </span>
                        <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                          hasDupSti ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'text-slate-500'
                        }`}>
                          #{unit.trackingCode}
                        </span>
                        {unit.serialNumber && (
                          <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${
                            hasDupSerial ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-bold' : 'text-slate-400 bg-slate-950 border-slate-800'
                          }`} title="Número de Série">
                            S/N: {unit.serialNumber}
                          </span>
                        )}
                        {hasDupSti && (
                          <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1.5 py-0.5 rounded font-mono text-[10px] font-bold flex items-center gap-0.5" title="Código STI Duplicado!">
                            <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                            <span>STI Repetido</span>
                          </span>
                        )}
                        {hasDupSerial && (
                          <span className="bg-rose-500/20 text-rose-300 border border-rose-500/40 px-1.5 py-0.5 rounded font-mono text-[10px] font-bold flex items-center gap-0.5" title="Número de Série Duplicado!">
                            <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
                            <span>Serial Repetido</span>
                          </span>
                        )}
                        {unit.destinationSector !== 'Openbox' && (
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${pStyle}`}>
                            {unit.platform}
                          </span>
                        )}
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${sectorClass}`}>
                          {unit.destinationSector}
                        </span>
                        {unit.status === 'Baixado' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950/80 text-rose-400 border border-rose-800/50 uppercase">
                            Saída Efetuada
                          </span>
                        )}
                      </div>

                      <h4 className="font-bold text-white text-sm line-clamp-1 group-hover:text-sky-400 transition-colors">
                        {unit.baseProductName}
                      </h4>

                      <p className="text-xs text-slate-400 line-clamp-1">
                        Motivo: {unit.customerReason}
                      </p>
                    </div>
                  </div>

                  {/* Date and Action hint */}
                  <div className="flex items-center justify-between md:justify-end gap-4 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-800/60">
                    <p className="text-[10px] text-slate-450 font-medium flex items-center gap-1 font-mono">
                      <Clock className="w-3.5 h-3.5 text-sky-450 shrink-0" />
                      <span className="text-slate-400">Entrada:</span>
                      <span className="text-slate-300 font-semibold">
                        {new Date(unit.createdAt).toLocaleDateString('pt-BR')} {new Date(unit.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </p>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartEdit(unit);
                        }}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-sky-600/30 text-sky-400 hover:text-sky-300 border border-slate-700 hover:border-sky-500/50 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                        title="Editar ficha e fotos do produto"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Editar</span>
                      </button>

                      <span className="text-xs text-slate-400 font-semibold group-hover:translate-x-0.5 transition-transform hidden sm:inline-flex items-center gap-1">
                        <Eye className="w-3.5 h-3.5" />
                        <span>Detalhes</span>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Complete unit details / Edit Modal Sheet */}
      {currentUnit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto" id="stock-details-modal">
          <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-8 animate-in fade-in zoom-in duration-200">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center px-6 py-4 bg-slate-950 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded">
                    {isEditingUnit && editForm ? editForm.baseProductSku : currentUnit.baseProductSku}
                  </span>
                  <span className="font-mono text-xs text-slate-500">
                    Caso: #{isEditingUnit && editForm ? editForm.trackingCode : currentUnit.trackingCode}
                  </span>
                  {(isEditingUnit && editForm ? editForm.serialNumber : currentUnit.serialNumber) && (
                    <span className="font-mono text-xs text-slate-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded" title="Número de Série">
                      S/N: {isEditingUnit && editForm ? editForm.serialNumber : currentUnit.serialNumber}
                    </span>
                  )}
                  {isEditingUnit && (
                    <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-bold rounded">
                      Modo Edição
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold text-white mt-1">
                  {isEditingUnit && editForm ? editForm.baseProductName : currentUnit.baseProductName}
                </h3>
              </div>

              <div className="flex items-center gap-2">
                {isEditingUnit ? (
                  <>
                    <button 
                      type="button"
                      onClick={() => { setIsEditingUnit(false); setEditForm(null); }}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="button"
                      disabled={isSavingEdit}
                      onClick={handleSaveEdit}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{isSavingEdit ? 'Salvando...' : 'Salvar Alterações'}</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button 
                      type="button"
                      onClick={() => handleStartEdit(currentUnit)}
                      className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold transition-all shadow-lg shadow-sky-600/20 flex items-center gap-1.5 cursor-pointer"
                      title="Editar imagens, descrição, SKU e campos do produto"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Editar Produto</span>
                    </button>
                    <button 
                      type="button"
                      onClick={handleCloseDetails}
                      className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg border border-slate-800 transition-colors cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Modal Body: Switch between View Mode and Edit Mode */}
            {isEditingUnit && editForm ? (
              /* EDIT MODE CONTENT */
              <div className="p-6 space-y-6 overflow-y-auto max-h-[75vh]">
                <div className="p-3 bg-sky-950/60 border border-sky-500/30 rounded-xl text-sky-200 text-xs flex items-center gap-2">
                  <Pencil className="w-4 h-4 text-sky-400 shrink-0" />
                  <span>Modo de edição do produto. Altere imagens, descrição, nome, SKU e especificações do item.</span>
                </div>

                {/* Section 1: Main Info */}
                <div className="space-y-4 bg-slate-950 p-4 border border-slate-800 rounded-xl">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5" />
                    Dados do Produto & Identificação
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">
                        Nome do Produto
                      </label>
                      <input 
                        type="text" 
                        value={editForm.baseProductName} 
                        onChange={(e) => setEditForm({ ...editForm, baseProductName: e.target.value })} 
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs font-bold text-white focus:outline-none focus:border-sky-500" 
                        placeholder="Nome do produto"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">
                        SKU
                      </label>
                      <input 
                        type="text" 
                        value={editForm.baseProductSku} 
                        onChange={(e) => setEditForm({ ...editForm, baseProductSku: e.target.value })} 
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs font-bold text-sky-400 font-mono focus:outline-none focus:border-sky-500" 
                        placeholder="Ex: 1650"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">
                        Código STI / Rastreio
                      </label>
                      <input 
                        type="text" 
                        value={editForm.trackingCode} 
                        onChange={(e) => setEditForm({ ...editForm, trackingCode: e.target.value })} 
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs font-bold text-slate-200 font-mono focus:outline-none focus:border-sky-500" 
                        placeholder="Ex: 13509873"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">
                        Número de Série (S/N)
                      </label>
                      <input 
                        type="text" 
                        value={editForm.serialNumber || ''} 
                        onChange={(e) => setEditForm({ ...editForm, serialNumber: e.target.value })} 
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs font-bold text-slate-200 font-mono focus:outline-none focus:border-sky-500" 
                        placeholder="Ex: SN-123456789-BR"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">
                        Voltagem Elétrica
                      </label>
                      <select 
                        value={editForm.baseProductVoltage || 'Bivolt'} 
                        onChange={(e) => setEditForm({ ...editForm, baseProductVoltage: e.target.value })} 
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs font-bold text-white focus:outline-none focus:border-sky-500 cursor-pointer"
                      >
                        <option value="Bivolt">Bivolt</option>
                        <option value="110V / 127V">110V / 127V</option>
                        <option value="220V">220V</option>
                        <option value="N/A">N/A (Sem energia)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">
                        Setor de Destino
                      </label>
                      <select 
                        value={editForm.destinationSector} 
                        onChange={(e) => setEditForm({ ...editForm, destinationSector: e.target.value as DestinationSectorType })} 
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs font-bold text-white focus:outline-none focus:border-sky-500 cursor-pointer"
                      >
                        <option value="Openbox">Openbox (Outlet / Revisados)</option>
                        <option value="Principal">Estoque Principal (Prontos / Novos)</option>
                        <option value="RMA">RMA (Assistência Técnica)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Section 2: Diagnostics & Condition */}
                <div className="space-y-4 bg-slate-950 p-4 border border-slate-800 rounded-xl">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Condição, Motivo & Acessórios
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">
                        Estado do Aparelho
                      </label>
                      <select 
                        value={editForm.deviceStatus} 
                        onChange={(e) => setEditForm({ ...editForm, deviceStatus: e.target.value as DeviceStatusType })} 
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs font-bold text-white focus:outline-none focus:border-sky-500 cursor-pointer"
                      >
                        <option value="Novo">Novo</option>
                        <option value="Usado">Usado</option>
                        <option value="Com Avaria">Com Avaria</option>
                        <option value="Peças">Peças / Sucata</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">
                        Estado da Embalagem / Caixa
                      </label>
                      <select 
                        value={editForm.packageStatus} 
                        onChange={(e) => setEditForm({ ...editForm, packageStatus: e.target.value as PackageStatusType })} 
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs font-bold text-white focus:outline-none focus:border-sky-500 cursor-pointer"
                      >
                        <option value="Perfeita">Perfeita / Na Caixa</option>
                        <option value="Danificada">Danificada</option>
                        <option value="Sem Embalagem">Sem Embalagem / Fora da Caixa</option>
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">
                        Motivo da Devolução / Observação Curta
                      </label>
                      <textarea 
                        value={editForm.customerReason} 
                        onChange={(e) => setEditForm({ ...editForm, customerReason: e.target.value })} 
                        rows={2}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-sky-500" 
                        placeholder="Ex: Revisada, sem marcas de uso, testada..."
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">
                        Acessórios Recebidos
                      </label>
                      <input 
                        type="text" 
                        value={editForm.accessoriesInclusion || ''} 
                        onChange={(e) => setEditForm({ ...editForm, accessoriesInclusion: e.target.value })} 
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500" 
                        placeholder="Ex: Embalagem: Na caixa; Fonte e cabo USB inclusos."
                      />
                    </div>
                  </div>
                </div>

                {/* Section 3: Technical Report / Detailed Description */}
                <div className="space-y-3 bg-slate-950 p-4 border border-slate-800 rounded-xl">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" />
                    Laudo Técnico de Entrada / Descrição Detalhada
                  </h4>
                  <textarea 
                    value={editForm.notes || ''} 
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} 
                    rows={4}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-slate-200 font-mono focus:outline-none focus:border-sky-500 leading-relaxed" 
                    placeholder="Adicione texto ou formato HTML do laudo..."
                  />
                </div>

                {/* Section 4: Photo Gallery Editor */}
                <div className="space-y-4 bg-slate-950 p-4 border border-slate-800 rounded-xl">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5" />
                      Gerenciar Galeria de Fotos ({ (editForm.photosProduct?.length || 0) + (editForm.photosBox?.length || 0) + (editForm.photosAccessories?.length || 0) })
                    </h4>

                    {/* Category selector for URL addition */}
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-400 text-[10px]">Adicionar Para:</span>
                      <select 
                        value={urlInputCategory}
                        onChange={(e) => setUrlInputCategory(e.target.value as any)}
                        className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-[11px] font-bold text-white cursor-pointer"
                      >
                        <option value="photosProduct">Fotos do Aparelho</option>
                        <option value="photosBox">Fotos da Embalagem</option>
                        <option value="photosAccessories">Fotos dos Acessórios</option>
                      </select>
                    </div>
                  </div>

                  {/* Add photo inputs */}
                  <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 space-y-2">
                    <div className="flex flex-col sm:flex-row items-center gap-2">
                      <label className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs transition-colors cursor-pointer flex items-center gap-1.5 shrink-0">
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload do Computador</span>
                        <input 
                          type="file" 
                          accept="image/*" 
                          onChange={(e) => handleAddPhotoFile(urlInputCategory, e)} 
                          className="hidden" 
                        />
                      </label>

                      <div className="flex-1 w-full flex items-center gap-2">
                        <input 
                          type="text" 
                          value={imageUrlInput} 
                          onChange={(e) => setImageUrlInput(e.target.value)} 
                          placeholder="Cole o link da imagem (URL https://...)" 
                          className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500" 
                        />
                        <button 
                          type="button" 
                          onClick={() => handleAddPhotoUrl(urlInputCategory)}
                          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-lg text-xs transition-colors shrink-0 cursor-pointer"
                        >
                          Adicionar URL
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Categories preview grids with delete overlay */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Product Photos */}
                    <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 space-y-2">
                      <div className="flex justify-between items-center text-[11px] font-bold text-slate-300 border-b border-slate-800 pb-1">
                        <span>Fotos do Aparelho</span>
                        <span className="text-sky-400">({editForm.photosProduct?.length || 0})</span>
                      </div>
                      {editForm.photosProduct && editForm.photosProduct.length > 0 ? (
                        <div className="grid grid-cols-2 gap-2">
                          {editForm.photosProduct.map((p, i) => (
                            <div key={i} className="relative aspect-video rounded-lg overflow-hidden border border-slate-700 group">
                              <img src={p} className="w-full h-full object-cover" />
                              <button 
                                type="button" 
                                onClick={() => handleRemovePhoto('photosProduct', i)}
                                className="absolute top-1 right-1 p-1 bg-rose-600/90 text-white rounded-md hover:bg-rose-500 transition-colors shadow-md cursor-pointer"
                                title="Remover foto"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-500 italic text-center py-4">Sem fotos do aparelho.</p>
                      )}
                    </div>

                    {/* Box Photos */}
                    <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 space-y-2">
                      <div className="flex justify-between items-center text-[11px] font-bold text-slate-300 border-b border-slate-800 pb-1">
                        <span>Fotos da Embalagem</span>
                        <span className="text-sky-400">({editForm.photosBox?.length || 0})</span>
                      </div>
                      {editForm.photosBox && editForm.photosBox.length > 0 ? (
                        <div className="grid grid-cols-2 gap-2">
                          {editForm.photosBox.map((p, i) => (
                            <div key={i} className="relative aspect-video rounded-lg overflow-hidden border border-slate-700 group">
                              <img src={p} className="w-full h-full object-cover" />
                              <button 
                                type="button" 
                                onClick={() => handleRemovePhoto('photosBox', i)}
                                className="absolute top-1 right-1 p-1 bg-rose-600/90 text-white rounded-md hover:bg-rose-500 transition-colors shadow-md cursor-pointer"
                                title="Remover foto"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-500 italic text-center py-4">Sem fotos da caixa.</p>
                      )}
                    </div>

                    {/* Accessories Photos */}
                    <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 space-y-2">
                      <div className="flex justify-between items-center text-[11px] font-bold text-slate-300 border-b border-slate-800 pb-1">
                        <span>Fotos dos Acessórios</span>
                        <span className="text-sky-400">({editForm.photosAccessories?.length || 0})</span>
                      </div>
                      {editForm.photosAccessories && editForm.photosAccessories.length > 0 ? (
                        <div className="grid grid-cols-2 gap-2">
                          {editForm.photosAccessories.map((p, i) => (
                            <div key={i} className="relative aspect-video rounded-lg overflow-hidden border border-slate-700 group">
                              <img src={p} className="w-full h-full object-cover" />
                              <button 
                                type="button" 
                                onClick={() => handleRemovePhoto('photosAccessories', i)}
                                className="absolute top-1 right-1 p-1 bg-rose-600/90 text-white rounded-md hover:bg-rose-500 transition-colors shadow-md cursor-pointer"
                                title="Remover foto"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-500 italic text-center py-4">Sem fotos de acessórios.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* VIEW MODE CONTENT */
              <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
                
                {/* Duplicate warning banner inside detail modal */}
                {(isDuplicateSti(currentUnit) || isDuplicateSerial(currentUnit)) && (
                  <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-2.5 text-xs text-amber-200">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <div>
                      <p className="font-bold text-amber-300">Atenção: Identificado Código Repetido no Estoque Físico</p>
                      <p className="text-[11px] text-amber-400/80 mt-0.5">
                        {isDuplicateSti(currentUnit) && `O Código STI (#${currentUnit.trackingCode}) já está cadastrado em outra unidade no estoque. `}
                        {isDuplicateSerial(currentUnit) && `O Número de Série (S/N: ${currentUnit.serialNumber}) já está cadastrado em outra unidade no estoque.`}
                      </p>
                    </div>
                  </div>
                )}

                {/* Top metadata grid */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 bg-slate-950 p-4 border border-slate-850 rounded-xl text-xs">
                  {currentUnit.destinationSector !== 'Openbox' && (
                    <div>
                      <span className="text-slate-450 block uppercase font-bold tracking-wider text-[9px] mb-1">Origem / Canal</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getPlatformStyle(currentUnit.platform)}`}>
                        {currentUnit.platform}
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="text-slate-450 block uppercase font-bold tracking-wider text-[9px] mb-1">Nº de Série (S/N)</span>
                    <span className="font-semibold text-slate-200 font-mono bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                      {currentUnit.serialNumber || 'Não Informado'}
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
                      {currentUnit.accessoriesInclusion || 'Nenhum acessório declared.'}
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
            )}

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

              {/* Right Side Actions: Save/Edit, Dar Baixa & Excluir */}
              <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                {isEditingUnit ? (
                  <button 
                    type="button"
                    disabled={isSavingEdit}
                    onClick={handleSaveEdit}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-lg shadow-emerald-600/20 flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isSavingEdit ? 'Salvando...' : 'Salvar Alterações'}</span>
                  </button>
                ) : (
                  <>
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
                  </>
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

      {/* Excel Inventory Import Modal */}
      <ExcelImportModal 
        isOpen={isExcelModalOpen}
        onClose={() => setIsExcelModalOpen(false)}
        products={products}
        onImportUnits={handleImportBatchUnits}
        defaultSector={activeTab === 'Openbox' ? 'Openbox' : activeTab === 'RMA' ? 'RMA' : activeTab === 'Principal' ? 'Principal' : 'Openbox'}
      />
    </div>
  );
}
