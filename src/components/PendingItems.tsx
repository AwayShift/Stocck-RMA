/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  Search,
  Filter,
  Clock,
  AlertTriangle,
  Plus,
  Trash2,
  Pencil,
  CheckCircle2,
  Image as ImageIcon,
  Upload,
  X,
  Package,
  ShieldCheck,
  Eye,
  FileSpreadsheet,
  Check,
  Info,
  MoveRight,
  LayoutGrid,
  List,
  Box
} from 'lucide-react';
import { 
  PendingItem, 
  PendingStatusType, 
  BaseProduct, 
  DestinationSectorType, 
  PlatformType,
  TriageUnit
} from '../types';
import { ImageZoomModal } from './ImageZoomModal';
import { uploadFileToStorage } from '../lib/dbService';

interface PendingItemsProps {
  items: PendingItem[];
  products: BaseProduct[];
  onSavePending: (item: PendingItem) => Promise<void>;
  onDeletePending: (id: string) => Promise<void>;
  onUpdateStatus: (id: string, status: PendingStatusType) => Promise<void>;
  onTransferToStock: (
    item: PendingItem,
    destination: DestinationSectorType,
    details?: {
      deviceStatus?: string;
      packageStatus?: string;
      accessoriesInclusion?: string;
      notes?: string;
    }
  ) => Promise<TriageUnit>;
  userRole?: string | null;
  onNavigateToStock?: () => void;
  enableSpreadsheetExport?: boolean;
}

const PRESET_REASONS = [
  'Aguardando Nota Fiscal (NF)',
  'Sem Identificação do Comprador / Rastreio',
  'Aguardando Peça de Reposição',
  'Dúvida Técnica / Em Teste Prolongado',
  'Falta Acessório Essencial / Incompleto',
  'Aguardando Autorização da Gerência',
  'Item Não Localizado no Catálogo',
  'Produto Danificado no Transporte (Avaria)',
  'Outro Motivo'
];

const PLATFORMS: (PlatformType | 'Outro')[] = [
  'Mercado Livre',
  'Shopee',
  'Amazon',
  'Amazon Ta Novo',
  'Kabum',
  'Outro'
];

export default function PendingItems({
  items,
  products,
  onSavePending,
  onDeletePending,
  onUpdateStatus,
  onTransferToStock,
  userRole,
  onNavigateToStock,
  enableSpreadsheetExport = true
}: PendingItemsProps) {
  // Filters & State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Todos' | PendingStatusType>('Todos');
  const [platformFilter, setPlatformFilter] = useState<string>('Todas');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Modals
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PendingItem | null>(null);
  
  // Delete Confirmation Modal
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<PendingItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  
  // Transfer to Stock Modal
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [itemToTransfer, setItemToTransfer] = useState<PendingItem | null>(null);
  const [transferDestination, setTransferDestination] = useState<DestinationSectorType>('Openbox');
  const [transferDeviceStatus, setTransferDeviceStatus] = useState('Usado');
  const [transferPackageStatus, setTransferPackageStatus] = useState('Danificada');
  const [transferAccessories, setTransferAccessories] = useState('');
  const [transferSti, setTransferSti] = useState('');
  const [transferNotes, setTransferNotes] = useState('');
  const [transferError, setTransferError] = useState<string | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);

  // Image Zoom Modal
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [zoomTitle, setZoomTitle] = useState<string>('');

  // Form State
  const [formSku, setFormSku] = useState('');
  const [formProductName, setFormProductName] = useState('');
  const [formVoltage, setFormVoltage] = useState<'110V' | '220V' | 'Bivolt' | 'N/A'>('Bivolt');
  const [formSerial, setFormSerial] = useState('');
  const [formTrackingCode, setFormTrackingCode] = useState('');
  const [formOrderNumber, setFormOrderNumber] = useState('');
  const [formPlatform, setFormPlatform] = useState<string>('Mercado Livre');
  const [formReason, setFormReason] = useState(PRESET_REASONS[0]);
  const [formCustomReason, setFormCustomReason] = useState('');
  const [formDetailedNotes, setFormDetailedNotes] = useState('');
  const [formStatus, setFormStatus] = useState<PendingStatusType>('Pendente');
  const [formPhotos, setFormPhotos] = useState<string[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // In-App Feedback & Notifications
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [transferSuccessData, setTransferSuccessData] = useState<{
    productName: string;
    sku: string;
    destination: DestinationSectorType;
    trackingCode?: string;
    voltage?: string;
  } | null>(null);

  // Suggestions for SKU
  const [skuSuggestions, setSkuSuggestions] = useState<BaseProduct[]>([]);
  const [showSkuDropdown, setShowSkuDropdown] = useState(false);

  // Filtered Items
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const term = searchTerm.toLowerCase().trim();
      const matchesSearch = 
        !term ||
        (item.sku && item.sku.toLowerCase().includes(term)) ||
        (item.productName && item.productName.toLowerCase().includes(term)) ||
        (item.serialNumber && item.serialNumber.toLowerCase().includes(term)) ||
        (item.trackingCode && item.trackingCode.toLowerCase().includes(term)) ||
        (item.orderNumber && item.orderNumber.toLowerCase().includes(term)) ||
        (item.pendingReason && item.pendingReason.toLowerCase().includes(term)) ||
        (item.detailedNotes && item.detailedNotes.toLowerCase().includes(term)) ||
        (item.platform && item.platform.toLowerCase().includes(term));

      const matchesStatus = statusFilter === 'Todos' || item.status === statusFilter;
      const matchesPlatform = platformFilter === 'Todas' || item.platform === platformFilter;

      return matchesSearch && matchesStatus && matchesPlatform;
    });
  }, [items, searchTerm, statusFilter, platformFilter]);

  // Statistics
  const stats = useMemo(() => {
    const total = items.length;
    const pendentes = items.filter(i => i.status === 'Pendente').length;
    const analise = items.filter(i => i.status === 'Em Análise').length;
    const aguardandoPecaOuNf = items.filter(i => i.status === 'Aguardando Peça' || i.status === 'Aguardando NF').length;
    const resolvidos = items.filter(i => i.status === 'Resolvido').length;
    const comFotos = items.filter(i => i.photos && i.photos.length > 0).length;

    return { total, pendentes, analise, aguardandoPecaOuNf, resolvidos, comFotos };
  }, [items]);

  // Open Form for New Item
  const handleOpenNewModal = () => {
    setEditingItem(null);
    setFormSku('');
    setFormProductName('');
    setFormVoltage('Bivolt');
    setFormSerial('');
    setFormTrackingCode('');
    setFormOrderNumber('');
    setFormPlatform('Mercado Livre');
    setFormReason(PRESET_REASONS[0]);
    setFormCustomReason('');
    setFormDetailedNotes('');
    setFormStatus('Pendente');
    setFormPhotos([]);
    setFormError(null);
    setShowSkuDropdown(false);
    setIsFormModalOpen(true);
  };

  // Open Form for Editing Item
  const handleOpenEditModal = (item: PendingItem) => {
    setEditingItem(item);
    setFormSku(item.sku || '');
    setFormProductName(item.productName || '');
    setFormVoltage((item.voltage as any) || 'Bivolt');
    setFormSerial(item.serialNumber || '');
    setFormTrackingCode(item.trackingCode || '');
    setFormOrderNumber(item.orderNumber || '');
    setFormPlatform(item.platform || 'Mercado Livre');
    
    if (PRESET_REASONS.includes(item.pendingReason)) {
      setFormReason(item.pendingReason);
      setFormCustomReason('');
    } else {
      setFormReason('Outro Motivo');
      setFormCustomReason(item.pendingReason);
    }

    setFormDetailedNotes(item.detailedNotes || '');
    setFormStatus(item.status || 'Pendente');
    setFormPhotos(item.photos || []);
    setFormError(null);
    setShowSkuDropdown(false);
    setIsFormModalOpen(true);
  };

  // Handle SKU input with autocomplete
  const handleSkuChange = (val: string) => {
    setFormSku(val);
    if (!val.trim()) {
      setSkuSuggestions([]);
      setShowSkuDropdown(false);
      return;
    }
    const cleanVal = val.trim().toLowerCase();
    const matches = products.filter(
      p => p.sku.toLowerCase().includes(cleanVal) || p.name.toLowerCase().includes(cleanVal)
    ).slice(0, 8);
    setSkuSuggestions(matches);
    setShowSkuDropdown(matches.length > 0);
  };

  const handleSelectProductSuggestion = (prod: BaseProduct) => {
    setFormSku(prod.sku);
    setFormProductName(prod.name);
    setFormVoltage(prod.voltage || 'Bivolt');
    setShowSkuDropdown(false);
  };

  // Handle Photo Upload
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploadingPhoto(true);
    setFormError(null);
    try {
      const newPhotos: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const uploadedUrl = await uploadFileToStorage(file, 'pending_items');
        newPhotos.push(uploadedUrl);
      }
      setFormPhotos(prev => [...prev, ...newPhotos]);
    } catch (err: any) {
      console.error('Erro ao processar upload de imagem:', err);
      setFormError(err?.message || 'Falha ao processar a imagem. Certifique-se de que é um formato válido (JPG, PNG, WEBP) e menor que 3MB.');
    } finally {
      setIsUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const handleRemovePhoto = (index: number) => {
    setFormPhotos(prev => prev.filter((_, idx) => idx !== index));
  };

  // Delete Modal Handlers
  const handleOpenDeleteModal = (item: PendingItem) => {
    setDeleteConfirmItem(item);
    setDeleteError(null);
  };

  const handleExecuteDelete = async () => {
    if (!deleteConfirmItem) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await onDeletePending(deleteConfirmItem.id);
      setDeleteConfirmItem(null);
      setActionSuccess('Registro de pendência excluído com sucesso.');
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      console.error('Erro ao excluir pendência:', err);
      setDeleteError(err?.message || 'Falha ao excluir registro de pendência. Verifique sua conexão e tente novamente.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Save Pending Item
  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!formSku.trim() && !formProductName.trim()) {
      setFormError('Por favor, informe ao menos o SKU ou o Nome do Produto.');
      return;
    }

    const finalReason = formReason === 'Outro Motivo' 
      ? (formCustomReason.trim() || 'Outro Motivo não especificado')
      : formReason;

    setIsSaving(true);
    try {
      const itemToSave: PendingItem = {
        id: editingItem ? editingItem.id : `pend-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        sku: formSku.trim().toUpperCase() || 'PENDENCIA',
        productName: formProductName.trim() || 'Produto em Análise',
        voltage: formVoltage,
        serialNumber: formSerial.trim(),
        trackingCode: formTrackingCode.trim(),
        orderNumber: formOrderNumber.trim(),
        platform: formPlatform,
        pendingReason: finalReason,
        detailedNotes: formDetailedNotes.trim(),
        status: formStatus,
        photos: formPhotos,
        createdAt: editingItem ? editingItem.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await onSavePending(itemToSave);
      setIsFormModalOpen(false);
      setActionSuccess(editingItem ? 'Registro de pendência atualizado com sucesso!' : 'Novo item de pendência cadastrado com sucesso!');
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err) {
      console.error('Erro ao salvar pendência:', err);
      setFormError('Ocorreu um erro ao salvar o registro no banco de dados.');
    } finally {
      setIsSaving(false);
    }
  };

  // Open Transfer Modal
  const handleOpenTransferModal = (item: PendingItem) => {
    setItemToTransfer(item);
    setTransferDestination('Openbox');
    setTransferDeviceStatus('Usado');
    setTransferPackageStatus('Danificada');
    setTransferAccessories(item.detailedNotes ? `Obs: ${item.detailedNotes}` : 'Liberado de pendência');
    setTransferSti(item.trackingCode || '');
    setTransferNotes(`<p><strong>Liberado da Aba de Pendências:</strong></p><p>Motivo resolvido: ${item.pendingReason}</p><p>${item.detailedNotes || ''}</p>`);
    setTransferError(null);
    setIsTransferModalOpen(true);
  };

  // Execute Transfer to Stock
  const handleExecuteTransfer = async () => {
    if (!itemToTransfer) return;

    if (transferDestination === 'Openbox' && !transferSti.trim()) {
      setTransferError('Para movimentar este item para o estoque do Openbox, é obrigatório preencher o Código STI. Por favor, marque/informe o STI no campo indicado para prosseguir com a movimentação.');
      return;
    }

    setTransferError(null);
    setIsTransferring(true);
    try {
      const updatedItem = {
        ...itemToTransfer,
        trackingCode: transferSti.trim() || itemToTransfer.trackingCode || ''
      };

      await onTransferToStock(updatedItem, transferDestination, {
        deviceStatus: transferDeviceStatus,
        packageStatus: transferPackageStatus,
        accessoriesInclusion: transferAccessories,
        notes: transferNotes
      });

      setIsTransferModalOpen(false);

      // Open styled in-app confirmation modal & toast
      setTransferSuccessData({
        productName: updatedItem.productName,
        sku: updatedItem.sku,
        destination: transferDestination,
        trackingCode: updatedItem.trackingCode,
        voltage: updatedItem.voltage || 'Bivolt'
      });
      setItemToTransfer(null);
      setActionSuccess(`Sucesso! O produto "${updatedItem.productName}" foi transferido para o setor [${transferDestination}] do Estoque Físico.`);
      setTimeout(() => setActionSuccess(null), 5000);
    } catch (err) {
      console.error('Erro ao transferir item para o estoque:', err);
      setTransferError('Falha ao transferir o item para o estoque. Verifique sua conexão e tente novamente.');
    } finally {
      setIsTransferring(false);
    }
  };

  // Export to Excel
  const handleExportExcel = () => {
    if (filteredItems.length === 0) {
      setActionError('Não há itens na lista para exportar.');
      setTimeout(() => setActionError(null), 3500);
      return;
    }

    const dataToExport = filteredItems.map(item => ({
      'ID': item.id,
      'Data de Registro': new Date(item.createdAt).toLocaleString('pt-BR'),
      'SKU': item.sku,
      'Nome do Produto': item.productName,
      'Voltagem': item.voltage || 'Bivolt',
      'Serial (S/N)': item.serialNumber || '-',
      'Código STI / Rastreio': item.trackingCode || '-',
      'Plataforma': item.platform || '-',
      'Status': item.status,
      'Motivo da Pendência': item.pendingReason,
      'Observações': item.detailedNotes || '-',
      'Qtd Fotos': item.photos?.length || 0,
      'Transferido Estoque': item.transferredToStock ? 'Sim' : 'Não'
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pendencias');
    XLSX.writeFile(wb, `RMA_Flow_Pendencias_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

   const getStatusBadge = (status: PendingStatusType) => {
    switch (status) {
      case 'Pendente':
        return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
      case 'Em Análise':
        return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
      case 'Aguardando Peça':
        return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
      case 'Aguardando NF':
        return 'bg-orange-500/15 text-orange-300 border-orange-500/30';
      case 'Resolvido':
        return 'bg-emerald-500/10 text-emerald-400/80 border-emerald-500/25';
      case 'Cancelado':
        return 'bg-slate-800 text-slate-400 border-slate-700';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200 relative" id="pendencias-container">
      {/* Floating Notifications */}
      {actionSuccess && (
        <div 
          className="fixed top-20 right-6 z-[60] px-5 py-3.5 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-4 duration-300 app-toast-success bg-slate-900 border border-emerald-500/50 text-emerald-300"
          id="pending-toast-success"
        >
          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
            <CheckCircle2 className="w-4.5 h-4.5" />
          </div>
          <span className="text-xs font-bold text-slate-100">{actionSuccess}</span>
          <button 
            type="button" 
            onClick={() => setActionSuccess(null)}
            className="ml-2 text-slate-400 hover:text-slate-200 p-1 rounded-md transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {actionError && (
        <div 
          className="fixed top-20 right-6 z-[60] px-5 py-3.5 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-4 duration-300 app-toast-error bg-slate-900 border border-rose-500/50 text-rose-300"
          id="pending-toast-error"
        >
          <div className="w-7 h-7 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
            <AlertTriangle className="w-4.5 h-4.5" />
          </div>
          <span className="text-xs font-bold text-slate-100">{actionError}</span>
          <button 
            type="button" 
            onClick={() => setActionError(null)}
            className="ml-2 text-slate-400 hover:text-slate-200 p-1 rounded-md transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-sky-500/15 text-sky-400 border border-sky-500/30 rounded-xl shadow-inner">
                <Clock className="w-6 h-6 shrink-0" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white flex items-center gap-2">
                  Aba de Pendências
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/40 font-mono font-bold">
                    {stats.total} itens
                  </span>
                </h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  Área flexível para produtos temporariamente retidos antes de ingressarem no estoque (Principal, Openbox ou RMA).
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {enableSpreadsheetExport && (
              <button
                onClick={handleExportExcel}
                className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 text-xs font-bold transition-all cursor-pointer shadow-sm"
                title="Exportar registros filtrados para planilha Excel"
                id="btn-export-pendencias"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span>Exportar Excel</span>
              </button>
            )}

            <button
              onClick={handleOpenNewModal}
              className="flex items-center gap-2 px-4 py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold rounded-xl text-xs transition-all cursor-pointer shadow-lg shadow-sky-500/20 hover:scale-[1.02]"
              id="btn-new-pendencia"
            >
              <Plus className="w-4 h-4 text-slate-950 stroke-[3]" />
              <span>Nova Pendência</span>
            </button>
          </div>
        </div>

        {/* Metric Cards Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-5 pt-5 border-t border-slate-800/80">
          <div className="bg-slate-950/60 border border-slate-800 p-3 rounded-xl">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total em Aberto</div>
            <div className="text-xl font-extrabold text-white mt-1">
              {stats.pendentes + stats.analise + stats.aguardandoPecaOuNf}
            </div>
            <div className="text-[10px] text-sky-400 font-medium mt-0.5">Aguardando resolução</div>
          </div>

          <div className="bg-slate-950/60 border border-amber-500/20 p-3 rounded-xl">
            <div className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">Pendentes</div>
            <div className="text-xl font-extrabold text-amber-300 mt-1">{stats.pendentes}</div>
            <div className="text-[10px] text-slate-400 font-medium mt-0.5">Sem triagem inicial</div>
          </div>

          <div className="bg-slate-950/60 border border-sky-500/20 p-3 rounded-xl">
            <div className="text-[11px] font-semibold text-sky-400 uppercase tracking-wider">Em Análise</div>
            <div className="text-xl font-extrabold text-sky-300 mt-1">{stats.analise}</div>
            <div className="text-[10px] text-slate-400 font-medium mt-0.5">Diagnóstico em curso</div>
          </div>

          <div className="bg-slate-950/60 border border-purple-500/20 p-3 rounded-xl">
            <div className="text-[11px] font-semibold text-purple-400 uppercase tracking-wider">Peças / NF</div>
            <div className="text-xl font-extrabold text-purple-300 mt-1">{stats.aguardandoPecaOuNf}</div>
            <div className="text-[10px] text-slate-400 font-medium mt-0.5">Falta componente/NF</div>
          </div>

          <div className="bg-slate-950/60 border border-emerald-500/20 p-3 rounded-xl col-span-2 sm:col-span-1">
            <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">Resolvidos</div>
            <div className="text-xl font-extrabold text-emerald-300 mt-1">{stats.resolvidos}</div>
            <div className="text-[10px] text-slate-400 font-medium mt-0.5">Liberados p/ estoque</div>
          </div>
        </div>
      </div>

      {/* Filter and View Controls Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Search Bar */}
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por SKU, Nome, Serial, STI, Motivo..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-9 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
            id="input-search-pendencias"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filters Group */}
        <div className="flex items-center gap-2.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          {/* Status Filter Dropdown */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs text-slate-400 font-medium">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500 cursor-pointer"
              id="select-status-filter"
            >
              <option value="Todos">Todos os Status</option>
              <option value="Pendente">Pendente</option>
              <option value="Em Análise">Em Análise</option>
              <option value="Aguardando Peça">Aguardando Peça</option>
              <option value="Aguardando NF">Aguardando NF</option>
              <option value="Resolvido">Resolvido</option>
              <option value="Cancelado">Cancelado</option>
            </select>
          </div>

          {/* Platform Filter Dropdown */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs text-slate-400 font-medium">Origem:</span>
            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500 cursor-pointer"
              id="select-platform-filter"
            >
              <option value="Todas">Todas as Plataformas</option>
              {PLATFORMS.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 shrink-0 ml-auto md:ml-0">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'grid' ? 'bg-sky-500/20 text-sky-300' : 'text-slate-400 hover:text-white'
              }`}
              title="Visualização em Cards"
              id="btn-view-grid"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'list' ? 'bg-sky-500/20 text-sky-300' : 'text-slate-400 hover:text-white'
              }`}
              title="Visualização em Tabela"
              id="btn-view-list"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area: Cards or Table */}
      {filteredItems.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center max-w-lg mx-auto space-y-3">
          <div className="p-3 bg-slate-800/80 text-slate-400 rounded-2xl w-fit mx-auto border border-slate-700">
            <Clock className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-base font-bold text-white">Nenhuma pendência encontrada</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            {searchTerm || statusFilter !== 'Todos' || platformFilter !== 'Todas'
              ? 'Nenhum item corresponde aos filtros selecionados. Tente limpar os filtros de busca.'
              : 'Não há itens pendentes cadastrados no momento. Clique no botão acima para adicionar um novo produto à lista de pendências.'}
          </p>
          {(searchTerm || statusFilter !== 'Todos' || platformFilter !== 'Todas') ? (
            <button
              onClick={() => { setSearchTerm(''); setStatusFilter('Todos'); setPlatformFilter('Todas'); }}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-sky-400 text-xs font-bold rounded-xl border border-slate-700 transition-all cursor-pointer"
            >
              Limpar Filtros
            </button>
          ) : (
            <button
              onClick={handleOpenNewModal}
              className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold rounded-xl transition-all cursor-pointer inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              Cadastrar Nova Pendência
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="pendencias-grid">
          {filteredItems.map((item) => {
            const isResolved = item.status === 'Resolvido' || item.transferredToStock;
            return (
              <div
                key={item.id}
                className={`pending-card rounded-2xl p-4 flex flex-col justify-between transition-all group ${
                  isResolved
                    ? 'bg-slate-950/60 border border-slate-800/60 opacity-60 hover:opacity-100 shadow-sm'
                    : 'bg-slate-900 border border-slate-800 hover:border-slate-700 shadow-lg'
                }`}
                id={`card-pendencia-${item.id}`}
              >
                <div>
                  {/* Card Header: Badges & Actions */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`pending-status-badge text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${getStatusBadge(item.status)}`}>
                        {item.status}
                      </span>
                      <span className="pending-platform-badge text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-950 text-slate-400 border border-slate-800">
                        {item.platform || 'Mercado Livre'}
                      </span>
                      {item.voltage && item.voltage !== 'N/A' && (
                        <span className="pending-voltage-badge text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                          {item.voltage}
                        </span>
                      )}
                    </div>

                    {/* Actions Dropdown / Icons */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleOpenEditModal(item)}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                        title="Editar Pendência"
                        id={`btn-edit-${item.id}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleOpenDeleteModal(item)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                        title="Excluir Pendência"
                        id={`btn-delete-${item.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* SKU & Title */}
                  <div className="mb-2.5">
                    <div className="flex items-center gap-2">
                      <span className={`pending-sku-badge font-mono text-xs font-bold px-2 py-0.5 rounded border ${
                        isResolved 
                          ? 'text-slate-400 bg-slate-800/60 border-slate-700/50' 
                          : 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                      }`}>
                        {item.sku || 'SEM SKU'}
                      </span>
                    </div>
                    <h4 className={`pending-card-title text-sm mt-1.5 line-clamp-2 leading-snug ${
                      isResolved ? 'text-slate-300 font-semibold' : 'text-white font-bold'
                    }`}>
                      {item.productName || 'Produto sem título informado'}
                    </h4>
                  </div>

                  {/* Tracking & Serial Info */}
                  <div className="pending-info-box space-y-1 bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/80 mb-3 text-[11px]">
                    {item.trackingCode && (
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="text-slate-500">STI / Rastreio:</span>
                        <span className="font-mono font-semibold text-slate-300">{item.trackingCode}</span>
                      </div>
                    )}
                    {item.serialNumber && (
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="text-slate-500">Serial (S/N):</span>
                        <span className="font-mono font-semibold text-slate-300 truncate max-w-[180px]">{item.serialNumber}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-slate-400">
                      <span className="text-slate-500">Cadastrado em:</span>
                      <span className="text-slate-400 font-mono text-[10px]">
                        {new Date(item.createdAt).toLocaleDateString('pt-BR')} às {new Date(item.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>

                  {/* Pending Reason Banner */}
                  {isResolved ? (
                    <div className="pending-reason-banner-resolved bg-slate-950/60 border border-slate-800/70 p-2.5 rounded-xl mb-3">
                      <div className="text-[10px] font-semibold uppercase text-slate-400 flex items-center gap-1 mb-0.5">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400/80" />
                        <span>Motivo (Resolvido)</span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        {item.pendingReason}
                      </p>
                    </div>
                  ) : (
                    <div className="pending-reason-banner bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-xl mb-3">
                      <div className="pending-reason-header text-[10px] font-bold uppercase text-amber-400 flex items-center gap-1 mb-0.5">
                        <AlertTriangle className="w-3 h-3 text-amber-400" />
                        <span>Motivo da Pendência</span>
                      </div>
                      <p className="pending-reason-text text-xs text-amber-200/90 font-medium leading-relaxed">
                        {item.pendingReason}
                      </p>
                    </div>
                  )}

                  {/* Detailed Notes if any */}
                  {item.detailedNotes && (
                    <div className="pending-notes-box bg-slate-950/50 p-2 rounded-xl border border-slate-800/60 mb-3 text-[11px] text-slate-400 line-clamp-3">
                      <span className="font-semibold text-slate-300">Obs: </span>
                      {item.detailedNotes}
                    </div>
                  )}

                  {/* Photo Previews */}
                  {item.photos && item.photos.length > 0 && (
                    <div className="mb-3">
                      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                        <ImageIcon className="w-3 h-3 text-slate-400" />
                        Fotos Anexadas ({item.photos.length})
                      </div>
                      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
                        {item.photos.map((photo, pIdx) => (
                          <div
                            key={pIdx}
                            onClick={() => {
                              setZoomImage(photo);
                              setZoomTitle(`${item.sku} - Foto ${pIdx + 1}`);
                            }}
                            className="w-14 h-14 rounded-lg bg-slate-950 border border-slate-800 overflow-hidden shrink-0 cursor-pointer hover:border-sky-500/50 transition-all relative group/img"
                          >
                            <img
                              src={photo}
                              alt={`Foto ${pIdx + 1}`}
                              className="w-full h-full object-cover group-hover/img:scale-105 transition-transform"
                            />
                            <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity">
                              <Eye className="w-4 h-4 text-white" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Card Footer: Transfer / Resolve Actions */}
                <div className="pending-card-footer pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2 mt-2">
                  {item.transferredToStock ? (
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 bg-slate-950/60 px-3 py-1.5 rounded-xl border border-slate-800/80 w-full justify-center">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500/80" />
                      <span>Transferido para o Estoque</span>
                    </div>
                  ) : (
                    <>
                      <select
                        value={item.status}
                        onChange={(e) => onUpdateStatus(item.id, e.target.value as any)}
                        className="pending-status-select bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-sky-500 cursor-pointer"
                        title="Alterar status da pendência"
                      >
                        <option value="Pendente">Pendente</option>
                        <option value="Em Análise">Em Análise</option>
                        <option value="Aguardando Peça">Aguardando Peça</option>
                        <option value="Aguardando NF">Aguardando NF</option>
                        <option value="Resolvido">Resolvido</option>
                        <option value="Cancelado">Cancelado</option>
                      </select>

                      <button
                        onClick={() => handleOpenTransferModal(item)}
                        className="pending-transfer-btn flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-md shadow-emerald-900/20 hover:scale-[1.02]"
                        title="Liberar item e enviar para o estoque físico"
                        id={`btn-transfer-${item.id}`}
                      >
                        <span>Liberar p/ Estoque</span>
                        <MoveRight className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE LIST VIEW */
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl" id="pendencias-table">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">SKU / Produto</th>
                  <th className="py-3.5 px-4">STI / Serial</th>
                  <th className="py-3.5 px-4">Origem</th>
                  <th className="py-3.5 px-4">Motivo da Pendência</th>
                  <th className="py-3.5 px-4">Fotos</th>
                  <th className="py-3.5 px-4">Data</th>
                  <th className="py-3.5 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredItems.map((item) => {
                  const isResolved = item.status === 'Resolvido' || item.transferredToStock;
                  return (
                    <tr 
                      key={item.id} 
                      className={`transition-colors ${
                        isResolved ? 'bg-slate-950/40 opacity-60 hover:opacity-100 hover:bg-slate-800/30' : 'hover:bg-slate-800/40'
                      }`}
                    >
                      {/* Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${getStatusBadge(item.status)}`}>
                          {item.status}
                        </span>
                      </td>

                      {/* SKU & Name */}
                      <td className="py-3.5 px-4 max-w-[280px]">
                        <div className={`font-mono text-xs ${isResolved ? 'text-slate-400 font-semibold' : 'font-bold text-amber-400'}`}>
                          {item.sku || 'SEM SKU'}
                        </div>
                        <div className={`truncate mt-0.5 ${isResolved ? 'text-slate-300 font-normal' : 'text-white font-medium'}`} title={item.productName}>
                          {item.productName}
                        </div>
                        {item.voltage && (
                          <span className="text-[10px] text-slate-400">{item.voltage}</span>
                        )}
                      </td>

                      {/* STI / Serial / Pedido */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {item.trackingCode && (
                          <div className="font-mono text-slate-300 font-semibold text-xs">
                            STI: {item.trackingCode}
                          </div>
                        )}
                        {item.orderNumber && (
                          <div className="font-mono text-sky-400 text-[11px] truncate max-w-[150px]">
                            Ped: {item.orderNumber}
                          </div>
                        )}
                        {item.serialNumber && (
                          <div className="font-mono text-slate-400 text-[11px] truncate max-w-[150px]">
                            S/N: {item.serialNumber}
                          </div>
                        )}
                        {!item.trackingCode && !item.orderNumber && !item.serialNumber && (
                          <span className="text-slate-500 italic">-</span>
                        )}
                      </td>

                      {/* Platform */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="text-xs text-slate-300 font-medium">
                          {item.platform || 'Mercado Livre'}
                        </span>
                      </td>

                      {/* Pending Reason */}
                      <td className="py-3.5 px-4 max-w-[260px]">
                        <div className={`text-xs truncate ${isResolved ? 'text-slate-400' : 'text-amber-300/90 font-medium'}`} title={item.pendingReason}>
                          {item.pendingReason}
                        </div>
                        {item.detailedNotes && (
                          <div className="text-[10px] text-slate-400 truncate mt-0.5" title={item.detailedNotes}>
                            {item.detailedNotes}
                          </div>
                        )}
                      </td>

                      {/* Photos */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {item.photos && item.photos.length > 0 ? (
                          <button
                            onClick={() => {
                              setZoomImage(item.photos[0]);
                              setZoomTitle(`${item.sku} - Foto 1`);
                            }}
                            className="flex items-center gap-1 px-2 py-1 bg-slate-950 hover:bg-slate-800 text-sky-300 rounded-lg border border-slate-800 text-[11px] transition-colors cursor-pointer"
                          >
                            <ImageIcon className="w-3 h-3 text-sky-400" />
                            <span>{item.photos.length} foto(s)</span>
                          </button>
                        ) : (
                          <span className="text-slate-500 italic text-[11px]">Sem fotos</span>
                        )}
                      </td>

                      {/* Date */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-400 font-mono text-[11px]">
                        {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {!item.transferredToStock && (
                            <button
                              onClick={() => handleOpenTransferModal(item)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1 shadow-sm"
                              title="Liberar para Estoque"
                            >
                              <span>Liberar</span>
                              <MoveRight className="w-3 h-3" />
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenEditModal(item)}
                            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                            title="Editar"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleOpenDeleteModal(item)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                            title="Excluir"
                            id={`btn-table-delete-${item.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirmItem && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDeleting) {
              setDeleteConfirmItem(null);
              setDeleteError(null);
            }
          }}
        >
          <div 
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-150" 
            id="modal-delete-pending-item"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-rose-500/15 text-rose-400 border border-rose-500/30 rounded-xl shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-white">Excluir Registro de Pendência</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Tem certeza que deseja excluir permanentemente este item de pendência?
                </p>
              </div>
            </div>

            {/* Item Details Box */}
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/80 space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">
                  {deleteConfirmItem.sku}
                </span>
                <span className="text-[11px] text-slate-400">
                  {deleteConfirmItem.platform || 'Mercado Livre'}
                </span>
              </div>
              <div className="text-xs font-semibold text-white truncate">
                {deleteConfirmItem.productName}
              </div>
              <div className="flex items-start gap-1.5 text-xs bg-amber-500/10 border border-amber-500/25 px-2.5 py-1.5 rounded-lg text-amber-300">
                <span className="font-bold text-amber-500 shrink-0">Motivo:</span>
                <span className="font-semibold text-amber-200 break-words">{deleteConfirmItem.pendingReason}</span>
              </div>
            </div>

            {/* Error Message if any */}
            {deleteError && (
              <div className="p-3 bg-rose-500/15 border border-rose-500/40 rounded-xl text-xs text-rose-300 flex items-start gap-2 animate-in fade-in">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{deleteError}</span>
              </div>
            )}

            {/* Actions */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirmItem(null);
                  setDeleteError(null);
                }}
                disabled={isDeleting}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecuteDelete}
                disabled={isDeleting}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer shadow-lg shadow-rose-900/30 disabled:opacity-50 flex items-center gap-1.5"
                id="btn-confirm-delete-pending"
              >
                {isDeleting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Excluindo...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Confirmar Exclusão</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE / EDIT PENDING ITEM MODAL */}
      {isFormModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSaving) setIsFormModalOpen(false);
          }}
        >
          <div 
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col" 
            id="modal-pendencia-form"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900 z-10">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-sky-500/15 text-sky-400 rounded-xl border border-sky-500/30">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {editingItem ? 'Editar Registro de Pendência' : 'Cadastrar Nova Pendência de Produto'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Insira as informações do item para mantê-lo registrado com total flexibilidade.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsFormModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleSaveForm} className="p-6 space-y-4 flex-1">
              {formError && (
                <div className="p-3.5 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-300 text-xs font-semibold flex items-center gap-2.5 animate-in fade-in duration-150" id="form-error-banner">
                  <AlertTriangle className="w-4.5 h-4.5 text-rose-400 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Row 1: SKU with autocomplete + Nome do Produto */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* SKU */}
                <div className="relative">
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    SKU do Produto *
                  </label>
                  <input
                    type="text"
                    value={formSku}
                    onChange={(e) => handleSkuChange(e.target.value)}
                    placeholder="Ex: SKU-1049 ou digite para buscar"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white uppercase font-mono placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
                    required
                    id="input-form-sku"
                  />
                  {showSkuDropdown && skuSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl z-30 max-h-48 overflow-y-auto divide-y divide-slate-800">
                      {skuSuggestions.map(s => (
                        <div
                          key={s.id}
                          onClick={() => handleSelectProductSuggestion(s)}
                          className="p-2.5 hover:bg-slate-800/80 cursor-pointer transition-colors"
                        >
                          <div className="font-mono text-xs font-bold text-sky-400">{s.sku}</div>
                          <div className="text-xs text-slate-200 truncate">{s.name}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-slate-500 mt-1">
                    Você pode escolher do catálogo ou digitar um SKU novo livremente.
                  </p>
                </div>

                {/* Nome do Produto */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Nome / Título do Produto *
                  </label>
                  <input
                    type="text"
                    value={formProductName}
                    onChange={(e) => setFormProductName(e.target.value)}
                    placeholder="Ex: Cafeteira Elétrica Mondial Smart"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
                    required
                    id="input-form-name"
                  />
                </div>
              </div>

              {/* Row 2: Voltagem + Plataforma de Origem */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Voltagem
                  </label>
                  <select
                    value={formVoltage}
                    onChange={(e) => setFormVoltage(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-sky-500 cursor-pointer"
                  >
                    <option value="110V">110V</option>
                    <option value="220V">220V</option>
                    <option value="Bivolt">Bivolt</option>
                    <option value="N/A">N/A (Não aplicável / Acessório)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Plataforma de Origem
                  </label>
                  <select
                    value={formPlatform}
                    onChange={(e) => setFormPlatform(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-sky-500 cursor-pointer"
                  >
                    {PLATFORMS.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 3: Código STI / Rastreio + Serial Number (S/N) + Número de Pedido */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Código STI / Rastreio
                  </label>
                  <input
                    type="text"
                    value={formTrackingCode}
                    onChange={(e) => setFormTrackingCode(e.target.value)}
                    placeholder="Ex: STI-99201"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Opcional para pendências.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Número de Pedido
                  </label>
                  <input
                    type="text"
                    value={formOrderNumber}
                    onChange={(e) => setFormOrderNumber(e.target.value)}
                    placeholder="Ex: 20000081726"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Opcional.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Número de Série (S/N)
                  </label>
                  <input
                    type="text"
                    value={formSerial}
                    onChange={(e) => setFormSerial(e.target.value)}
                    placeholder="Ex: SN-88392014"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Opcional para pendências.</p>
                </div>
              </div>

              {/* Row 4: Motivo da Pendência */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Motivo da Pendência *
                </label>
                <select
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-sky-500 cursor-pointer mb-2"
                >
                  {PRESET_REASONS.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>

                {formReason === 'Outro Motivo' && (
                  <input
                    type="text"
                    value={formCustomReason}
                    onChange={(e) => setFormCustomReason(e.target.value)}
                    placeholder="Descreva o motivo da pendência detalhadamente..."
                    className="w-full bg-slate-950 border border-sky-500/40 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
                    required
                  />
                )}
              </div>

              {/* Row 5: Observações Detalhadas */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Observações / Diagnóstico Preliminar
                </label>
                <textarea
                  value={formDetailedNotes}
                  onChange={(e) => setFormDetailedNotes(e.target.value)}
                  placeholder="Insira detalhes adicionais sobre o produto, estado das peças, testes realizados ou tratativas com clientes/fornecedor..."
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors resize-none"
                />
              </div>

              {/* Row 6: Status da Pendência */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Status Inicial
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['Pendente', 'Em Análise', 'Aguardando Peça', 'Aguardando NF'] as PendingStatusType[]).map((st) => (
                    <button
                      type="button"
                      key={st}
                      onClick={() => setFormStatus(st)}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer text-center ${
                        formStatus === st
                          ? 'bg-sky-500 text-slate-950 border-sky-400 shadow-md'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Row 7: Fotos / Anexos de Imagens */}
              <div className="pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-sky-400" />
                    Fotos do Produto / Avaria / Caixa / Etiquetas ({formPhotos.length})
                  </label>
                  <label className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 rounded-xl text-xs font-bold cursor-pointer transition-all">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Adicionar Fotos</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handlePhotoUpload}
                      className="hidden"
                      disabled={isUploadingPhoto}
                    />
                  </label>
                </div>

                {isUploadingPhoto && (
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-center text-xs text-sky-400 flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
                    Comprimindo e processando imagens com segurança...
                  </div>
                )}

                {formPhotos.length > 0 ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5 mt-2">
                    {formPhotos.map((photo, idx) => (
                      <div
                        key={idx}
                        className="relative group aspect-square rounded-xl bg-slate-950 border border-slate-800 overflow-hidden"
                      >
                        <img
                          src={photo}
                          alt={`Anexo ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(idx)}
                          className="absolute top-1 right-1 p-1 bg-rose-600/90 hover:bg-rose-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow-md"
                          title="Remover foto"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="border border-dashed border-slate-800 rounded-xl p-4 text-center text-slate-500 text-xs">
                    Nenhuma foto anexada. Você pode anexar fotos da etiqueta, número de série ou defeito se desejar.
                  </div>
                )}
              </div>

              {/* Modal Footer Buttons */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3 sticky bottom-0 bg-slate-900 z-10">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold rounded-xl text-xs transition-all cursor-pointer shadow-lg shadow-sky-500/20 disabled:opacity-50 flex items-center gap-2"
                  id="btn-submit-pendencia"
                >
                  {isSaving ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>{editingItem ? 'Salvar Alterações' : 'Criar Pendência'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TRANSFER TO STOCK MODAL */}
      {isTransferModalOpen && itemToTransfer && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isTransferring) setIsTransferModalOpen(false);
          }}
        >
          <div 
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4" 
            id="modal-transfer-to-stock"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-500/15 text-emerald-400 rounded-xl border border-emerald-500/30">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Liberar e Transferir para Estoque</h3>
                  <p className="text-xs text-slate-400">
                    O produto será promovido e inserido no Estoque Físico.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsTransferModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Product Summary */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
              <div className="text-[11px] font-mono text-amber-400 font-bold">
                SKU: {itemToTransfer.sku}
              </div>
              <div className="text-xs font-semibold text-white">
                {itemToTransfer.productName}
              </div>
              <div className="text-[10px] text-slate-400 flex items-center gap-2">
                <span>Origem: {itemToTransfer.platform}</span>
                <span>•</span>
                <span>{itemToTransfer.voltage || 'Bivolt'}</span>
              </div>
            </div>

            {/* Transfer Error Alert */}
            {transferError && (
              <div className="p-3.5 bg-rose-500/15 border border-rose-500/50 rounded-xl text-xs text-rose-200 flex items-start gap-2.5 animate-in fade-in" id="transfer-sti-alert">
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-rose-300">Atenção: STI Obrigatório</div>
                  <p className="mt-0.5 text-rose-200/90 leading-relaxed">{transferError}</p>
                </div>
              </div>
            )}

            {/* Destination Sector Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Setor de Destino no Estoque *
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['Principal', 'Openbox', 'RMA'] as DestinationSectorType[]).map((sec) => (
                  <button
                    type="button"
                    key={sec}
                    onClick={() => {
                      setTransferDestination(sec);
                      if (sec !== 'Openbox') setTransferError(null);
                    }}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer text-center ${
                      transferDestination === sec
                        ? sec === 'Openbox'
                          ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md font-extrabold'
                          : sec === 'Principal'
                          ? 'bg-sky-500 text-white border-sky-400 shadow-md font-extrabold'
                          : 'bg-rose-500 text-white border-rose-400 shadow-md font-extrabold'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {sec}
                  </button>
                ))}
              </div>
            </div>

            {/* If Openbox, STI code is mandatory */}
            {transferDestination === 'Openbox' && (
              <div className={`p-3.5 rounded-xl border transition-all space-y-2 ${
                !transferSti.trim() || transferError 
                  ? 'bg-amber-500/10 border-amber-500/50 shadow-sm' 
                  : 'bg-slate-950 border-emerald-500/40'
              }`}>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-amber-300 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-amber-400" />
                    <span>Código STI (Obrigatório para Openbox) *</span>
                  </label>
                  {!transferSti.trim() ? (
                    <span className="text-[10px] font-bold text-amber-400/90 bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/30">
                      Pendente de preenchimento
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Preenchido
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-slate-400 leading-snug">
                  Para mover o item para o estoque do <strong>Openbox</strong>, identifique o código STI abaixo para garantir o rastreio e prosseguir com a movimentação.
                </p>

                <input
                  type="text"
                  value={transferSti}
                  onChange={(e) => {
                    setTransferSti(e.target.value);
                    if (e.target.value.trim()) {
                      setTransferError(null);
                    }
                  }}
                  placeholder="Informe o Código STI (Ex: STI-882910)"
                  className={`w-full bg-slate-950 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono placeholder-slate-500 focus:outline-none transition-all ${
                    transferError && !transferSti.trim()
                      ? 'border-2 border-rose-500 focus:border-rose-400 shadow-sm shadow-rose-500/20'
                      : !transferSti.trim()
                      ? 'border border-amber-500/60 focus:border-amber-400'
                      : 'border border-emerald-500/60 focus:border-emerald-400'
                  }`}
                  id="input-transfer-sti"
                  required
                />
              </div>
            )}

            {/* Condition Options */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Estado do Aparelho
                </label>
                <select
                  value={transferDeviceStatus}
                  onChange={(e) => setTransferDeviceStatus(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="Novo">Novo</option>
                  <option value="Usado">Usado</option>
                  <option value="Danificado">Danificado</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Estado da Embalagem
                </label>
                <select
                  value={transferPackageStatus}
                  onChange={(e) => setTransferPackageStatus(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="Perfeita">Perfeita</option>
                  <option value="Danificada">Danificada</option>
                  <option value="Sem Embalagem">Sem Embalagem</option>
                </select>
              </div>
            </div>

            {/* Accessories & Notes */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Acessórios Inclusos
              </label>
              <input
                type="text"
                value={transferAccessories}
                onChange={(e) => setTransferAccessories(e.target.value)}
                placeholder="Ex: Completo com fonte e cabos..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsTransferModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecuteTransfer}
                disabled={isTransferring}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer shadow-lg shadow-emerald-900/30 disabled:opacity-50 flex items-center gap-1.5"
                id="btn-confirm-transfer-stock"
              >
                {isTransferring ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Transferindo...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>Confirmar Transferência</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TRANSFER SUCCESS CONFIRMATION MODAL */}
      {transferSuccessData && (
        <div 
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setTransferSuccessData(null)}
        >
          <div 
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
            id="modal-transfer-success-confirmation"
          >
            <div className="flex items-start gap-3.5">
              <div className="p-3 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-2xl shrink-0">
                <CheckCircle2 className="w-6 h-6 stroke-[2.5]" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-white">Item Transferido com Sucesso!</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  O produto foi liberado da fila de pendências e promovido para o <strong>Estoque Físico</strong>.
                </p>
              </div>
            </div>

            {/* Product Card Details */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-bold text-sky-400 bg-sky-500/10 px-2.5 py-1 rounded-lg border border-sky-500/20">
                  SKU: {transferSuccessData.sku}
                </span>
                <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                  transferSuccessData.destination === 'Openbox'
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                    : transferSuccessData.destination === 'Principal'
                    ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                    : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                }`}>
                  Setor: {transferSuccessData.destination}
                </span>
              </div>

              <div className="text-xs font-semibold text-white">
                {transferSuccessData.productName}
              </div>

              {transferSuccessData.trackingCode && (
                <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5 pt-1 border-t border-slate-900">
                  <span className="text-slate-500">Rastreio/STI:</span>
                  <span className="text-emerald-400 font-bold">{transferSuccessData.trackingCode}</span>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setTransferSuccessData(null)}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Continuar nas Pendências
              </button>
              {onNavigateToStock && (
                <button
                  type="button"
                  onClick={() => {
                    setTransferSuccessData(null);
                    onNavigateToStock();
                  }}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer shadow-lg shadow-emerald-900/30 flex items-center gap-2"
                  id="btn-goto-stock-after-transfer"
                >
                  <span>Ver no Estoque</span>
                  <MoveRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Image Zoom Modal */}
      {zoomImage && (
        <ImageZoomModal
          isOpen={true}
          imageUrl={zoomImage}
          onClose={() => setZoomImage(null)}
          title={zoomTitle}
        />
      )}
    </div>
  );
}
