/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
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
  EyeOff,
  FileSpreadsheet,
  Check,
  Info,
  MoveRight,
  LayoutGrid,
  List,
  Box,
  Clipboard,
  Camera,
  Flame,
  AlertOctagon,
  Tag,
  FileText,
  CheckSquare
} from 'lucide-react';
import { 
  PendingItem, 
  PendingStatusType, 
  PendingPriorityType,
  BaseProduct, 
  DestinationSectorType, 
  PlatformType,
  TriageUnit
} from '../types';
import { ImageZoomModal } from './ImageZoomModal';
import { PlatformSelector } from './PlatformSelector';
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
      baseProductId?: string;
      baseProductName?: string;
      baseProductSku?: string;
      baseProductVoltage?: string;
      platform?: PlatformType;
      serialNumber?: string;
      trackingCode?: string;
      orderNumber?: string;
      customerReason?: string;
      deviceStatus?: string;
      packageStatus?: string;
      accessoriesInclusion?: string;
      notes?: string;
      photosProduct?: string[];
      photosBox?: string[];
      photosAccessories?: string[];
      excludeFromDailyCount?: boolean;
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

const PRIORITY_ORDER: Record<string, number> = {
  'Urgente': 4,
  'Alta': 3,
  'Média': 2,
  'Baixa': 1
};

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
  const [priorityFilter, setPriorityFilter] = useState<'Todas' | PendingPriorityType>('Todas');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  // Option to hide or show already resolved pendencies (stored in localStorage)
  const [hideResolved, setHideResolved] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('rma_hide_resolved_pendencies');
      return saved !== null ? saved === 'true' : false;
    } catch {
      return false;
    }
  });

  const handleToggleHideResolved = () => {
    setHideResolved(prev => {
      const nextVal = !prev;
      try {
        localStorage.setItem('rma_hide_resolved_pendencies', String(nextVal));
      } catch {
        // ignore
      }
      return nextVal;
    });
  };

  // Modals
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PendingItem | null>(null);
  
  // Delete Confirmation Modal
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<PendingItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  
  // Transfer to Stock Modal (Complete triage info matching RmaEntry)
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [itemToTransfer, setItemToTransfer] = useState<PendingItem | null>(null);
  const [transferSku, setTransferSku] = useState('');
  const [transferProductName, setTransferProductName] = useState('');
  const [transferVoltage, setTransferVoltage] = useState<'110V' | '220V' | 'Bivolt' | 'N/A'>('Bivolt');
  const [transferPlatform, setTransferPlatform] = useState<PlatformType>('Mercado Livre');
  const [transferSerialNumber, setTransferSerialNumber] = useState('');
  const [transferOrderNumber, setTransferOrderNumber] = useState('');
  const [transferCustomerReason, setTransferCustomerReason] = useState('');
  const [transferDestination, setTransferDestination] = useState<DestinationSectorType>('Openbox');
  const [transferDeviceStatus, setTransferDeviceStatus] = useState('Usado');
  const [transferPackageStatus, setTransferPackageStatus] = useState('Danificada');
  const [transferAccessories, setTransferAccessories] = useState('');
  const [transferSti, setTransferSti] = useState('');
  const [transferNotes, setTransferNotes] = useState('');
  const [transferExcludeDailyCount, setTransferExcludeDailyCount] = useState(false);
  const [transferPhotosProduct, setTransferPhotosProduct] = useState<string[]>([]);
  const [transferPhotosBox, setTransferPhotosBox] = useState<string[]>([]);
  const [transferPhotosAccessories, setTransferPhotosAccessories] = useState<string[]>([]);
  const [transferActivePhotoTab, setTransferActivePhotoTab] = useState<'product' | 'box' | 'accessories'>('product');
  const [isTransferUploadingPhoto, setIsTransferUploadingPhoto] = useState(false);
  const [transferSkuSuggestions, setTransferSkuSuggestions] = useState<BaseProduct[]>([]);
  const [showTransferSkuDropdown, setShowTransferSkuDropdown] = useState(false);
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
  const [formPriority, setFormPriority] = useState<PendingPriorityType>('Média');
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

  // Quick Photo Paste Handler (Ctrl+V) for both modals
  useEffect(() => {
    const handleGlobalPaste = async (e: ClipboardEvent) => {
      // Only process when one of the modals is open
      if (!isFormModalOpen && !isTransferModalOpen) return;

      const clipboardData = e.clipboardData;
      if (!clipboardData) return;

      const itemsList = clipboardData.items;
      const imageFiles: File[] = [];

      if (itemsList) {
        for (let i = 0; i < itemsList.length; i++) {
          if (itemsList[i].type.indexOf('image') !== -1) {
            const file = itemsList[i].getAsFile();
            if (file) imageFiles.push(file);
          }
        }
      }

      if (imageFiles.length === 0 && clipboardData.files) {
        for (let i = 0; i < clipboardData.files.length; i++) {
          if (clipboardData.files[i].type.startsWith('image/')) {
            imageFiles.push(clipboardData.files[i]);
          }
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        e.stopPropagation();

        if (isFormModalOpen) {
          setIsUploadingPhoto(true);
          setFormError(null);
          try {
            const uploadedUrls: string[] = [];
            for (const file of imageFiles) {
              const url = await uploadFileToStorage(file, 'pending_items');
              uploadedUrls.push(url);
            }
            setFormPhotos(prev => [...prev, ...uploadedUrls]);
            setActionSuccess(`Foto colada via Ctrl+V com sucesso! (${imageFiles.length} foto${imageFiles.length > 1 ? 's' : ''})`);
            setTimeout(() => setActionSuccess(null), 3500);
          } catch (err: any) {
            setFormError(err?.message || 'Erro ao processar imagem colada via Ctrl+V.');
          } finally {
            setIsUploadingPhoto(false);
          }
        } else if (isTransferModalOpen) {
          setIsTransferUploadingPhoto(true);
          setTransferError(null);
          try {
            const uploadedUrls: string[] = [];
            const folder = transferActivePhotoTab === 'product' 
              ? 'triage_product' 
              : transferActivePhotoTab === 'box' 
              ? 'triage_box' 
              : 'triage_accessories';
            for (const file of imageFiles) {
              const url = await uploadFileToStorage(file, folder as any);
              uploadedUrls.push(url);
            }
            if (transferActivePhotoTab === 'product') {
              setTransferPhotosProduct(prev => [...prev, ...uploadedUrls]);
            } else if (transferActivePhotoTab === 'box') {
              setTransferPhotosBox(prev => [...prev, ...uploadedUrls]);
            } else {
              setTransferPhotosAccessories(prev => [...prev, ...uploadedUrls]);
            }
            setActionSuccess(`Foto colada via Ctrl+V adicionada às fotos (${transferActivePhotoTab === 'product' ? 'Aparelho' : transferActivePhotoTab === 'box' ? 'Caixa' : 'Acessórios'})!`);
            setTimeout(() => setActionSuccess(null), 3500);
          } catch (err: any) {
            setTransferError(err?.message || 'Erro ao processar imagem colada via Ctrl+V.');
          } finally {
            setIsTransferUploadingPhoto(false);
          }
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => {
      window.removeEventListener('paste', handleGlobalPaste);
    };
  }, [isFormModalOpen, isTransferModalOpen, transferActivePhotoTab]);

  // Handle Quick Paste Click Button
  const handleTriggerClipboardPaste = async (target: 'form' | 'transfer') => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.read) {
        alert('Para colar fotos rapidamente, basta pressionar Ctrl+V no seu teclado com a imagem na área de transferência.');
        return;
      }
      const clipboardItems = await navigator.clipboard.read();
      const imageFiles: File[] = [];
      for (const item of clipboardItems) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            imageFiles.push(new File([blob], `paste-${Date.now()}.png`, { type }));
          }
        }
      }
      if (imageFiles.length === 0) {
        setActionError('Nenhuma imagem encontrada na área de transferência. Copie uma imagem ou tire um print antes de clicar.');
        setTimeout(() => setActionError(null), 4000);
        return;
      }
      if (target === 'form') {
        setIsUploadingPhoto(true);
        setFormError(null);
        try {
          const uploadedUrls: string[] = [];
          for (const file of imageFiles) {
            const url = await uploadFileToStorage(file, 'pending_items');
            uploadedUrls.push(url);
          }
          setFormPhotos(prev => [...prev, ...uploadedUrls]);
          setActionSuccess(`Foto colada com sucesso! (${imageFiles.length} foto${imageFiles.length > 1 ? 's' : ''})`);
          setTimeout(() => setActionSuccess(null), 3500);
        } catch (err: any) {
          setFormError(err?.message || 'Erro ao processar imagem colada.');
        } finally {
          setIsUploadingPhoto(false);
        }
      } else {
        setIsTransferUploadingPhoto(true);
        setTransferError(null);
        try {
          const uploadedUrls: string[] = [];
          const folder = transferActivePhotoTab === 'product' ? 'triage_product' : transferActivePhotoTab === 'box' ? 'triage_box' : 'triage_accessories';
          for (const file of imageFiles) {
            const url = await uploadFileToStorage(file, folder as any);
            uploadedUrls.push(url);
          }
          if (transferActivePhotoTab === 'product') {
            setTransferPhotosProduct(prev => [...prev, ...uploadedUrls]);
          } else if (transferActivePhotoTab === 'box') {
            setTransferPhotosBox(prev => [...prev, ...uploadedUrls]);
          } else {
            setTransferPhotosAccessories(prev => [...prev, ...uploadedUrls]);
          }
          setActionSuccess(`Foto adicionada às fotos da categoria selecionada!`);
          setTimeout(() => setActionSuccess(null), 3500);
        } catch (err: any) {
          setTransferError(err?.message || 'Erro ao processar imagem.');
        } finally {
          setIsTransferUploadingPhoto(false);
        }
      }
    } catch {
      setActionError('Pressione Ctrl+V no seu teclado para colar a imagem diretamente nesta tela.');
      setTimeout(() => setActionError(null), 4000);
    }
  };

  // Helper to determine if an item is unresolved
  const isPendingUnresolved = (item: PendingItem) => {
    return item.status !== 'Resolvido' && item.status !== 'Cancelado' && !item.transferredToStock;
  };

  // Helper to determine if an item is resolved
  const isPendingResolved = (item: PendingItem) => {
    return item.status === 'Resolvido' || !!item.transferredToStock;
  };

  // Filtered & Sorted Items
  // 1. Unresolved items appear before resolved ones
  // 2. Higher priority appears before lower priority
  // 3. Newest registration date appears first
  const filteredItems = useMemo(() => {
    const list = items.filter(item => {
      // If user chose to hide resolved items, filter them out UNLESS the user explicitly selected "Resolvido" in statusFilter
      if (hideResolved && isPendingResolved(item) && statusFilter !== 'Resolvido') {
        return false;
      }

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
        (item.platform && item.platform.toLowerCase().includes(term)) ||
        (item.priority && item.priority.toLowerCase().includes(term));

      const matchesStatus = statusFilter === 'Todos' || item.status === statusFilter;
      const matchesPlatform = platformFilter === 'Todas' || item.platform === platformFilter;
      const matchesPriority = priorityFilter === 'Todas' || (item.priority || 'Média') === priorityFilter;

      return matchesSearch && matchesStatus && matchesPlatform && matchesPriority;
    });

    return list.sort((a, b) => {
      // 1. Unresolved items come FIRST
      const aUnresolved = isPendingUnresolved(a);
      const bUnresolved = isPendingUnresolved(b);
      if (aUnresolved !== bUnresolved) {
        return aUnresolved ? -1 : 1;
      }

      // 2. Higher priority first (Urgente > Alta > Média > Baixa)
      const aPrio = PRIORITY_ORDER[a.priority || 'Média'] || 2;
      const bPrio = PRIORITY_ORDER[b.priority || 'Média'] || 2;
      if (aPrio !== bPrio) {
        return bPrio - aPrio;
      }

      // 3. Newest registration date first
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [items, searchTerm, statusFilter, platformFilter, priorityFilter, hideResolved]);

  // Statistics
  const stats = useMemo(() => {
    const total = items.length;
    const pendentes = items.filter(i => i.status === 'Pendente').length;
    const analise = items.filter(i => i.status === 'Em Análise').length;
    const aguardandoPecaOuNf = items.filter(i => i.status === 'Aguardando Peça' || i.status === 'Aguardando NF').length;
    const resolvidos = items.filter(i => isPendingResolved(i)).length;
    const urgentes = items.filter(i => isPendingUnresolved(i) && (i.priority === 'Urgente' || i.priority === 'Alta')).length;
    const comFotos = items.filter(i => i.photos && i.photos.length > 0).length;

    return { total, pendentes, analise, aguardandoPecaOuNf, resolvidos, urgentes, comFotos };
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
    setFormPriority('Média');
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
    setFormPriority(item.priority || 'Média');
    
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

  // Handle SKU change in Transfer Modal
  const handleTransferSkuChange = (val: string) => {
    setTransferSku(val);
    if (!val.trim()) {
      setTransferSkuSuggestions([]);
      setShowTransferSkuDropdown(false);
      return;
    }
    const cleanVal = val.trim().toLowerCase();
    const matches = products.filter(
      p => p.sku.toLowerCase().includes(cleanVal) || p.name.toLowerCase().includes(cleanVal)
    ).slice(0, 8);
    setTransferSkuSuggestions(matches);
    setShowTransferSkuDropdown(matches.length > 0);
  };

  const handleSelectTransferProductSuggestion = (prod: BaseProduct) => {
    setTransferSku(prod.sku);
    setTransferProductName(prod.name);
    setTransferVoltage(prod.voltage || 'Bivolt');
    setShowTransferSkuDropdown(false);
  };

  // Handle Photo Upload in New/Edit form
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

  // Handle Photo Upload in Transfer modal
  const handleTransferPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsTransferUploadingPhoto(true);
    setTransferError(null);
    try {
      const folder = transferActivePhotoTab === 'product' 
        ? 'triage_product' 
        : transferActivePhotoTab === 'box' 
        ? 'triage_box' 
        : 'triage_accessories';

      const newPhotos: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const uploadedUrl = await uploadFileToStorage(file, folder as any);
        newPhotos.push(uploadedUrl);
      }

      if (transferActivePhotoTab === 'product') {
        setTransferPhotosProduct(prev => [...prev, ...newPhotos]);
      } else if (transferActivePhotoTab === 'box') {
        setTransferPhotosBox(prev => [...prev, ...newPhotos]);
      } else {
        setTransferPhotosAccessories(prev => [...prev, ...newPhotos]);
      }
    } catch (err: any) {
      console.error('Erro ao processar upload de foto de triagem:', err);
      setTransferError(err?.message || 'Falha ao processar imagem.');
    } finally {
      setIsTransferUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const handleRemoveTransferPhoto = (category: 'product' | 'box' | 'accessories', index: number) => {
    if (category === 'product') {
      setTransferPhotosProduct(prev => prev.filter((_, idx) => idx !== index));
    } else if (category === 'box') {
      setTransferPhotosBox(prev => prev.filter((_, idx) => idx !== index));
    } else {
      setTransferPhotosAccessories(prev => prev.filter((_, idx) => idx !== index));
    }
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
        priority: formPriority,
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

  // Open Transfer Modal with rich triage fields matching RmaEntry
  const handleOpenTransferModal = (item: PendingItem) => {
    setItemToTransfer(item);
    setTransferSku(item.sku || '');
    setTransferProductName(item.productName || '');
    setTransferVoltage((item.voltage as any) || 'Bivolt');
    setTransferPlatform((item.platform as any) || 'Mercado Livre');
    setTransferSerialNumber(item.serialNumber || '');
    setTransferSti(item.trackingCode || '');
    setTransferOrderNumber(item.orderNumber || '');
    setTransferDestination(item.destinationSectorSuggested || 'Openbox');
    setTransferDeviceStatus('Usado');
    setTransferPackageStatus('Danificada');
    setTransferCustomerReason(item.pendingReason || '');
    setTransferAccessories(item.detailedNotes ? `Obs: ${item.detailedNotes}` : 'Liberado de pendência');
    setTransferNotes(`<p><strong>Liberado da Aba de Pendências:</strong></p><p>Motivo original: ${item.pendingReason}</p><p>${item.detailedNotes || ''}</p>`);
    setTransferPhotosProduct(item.photos ? [...item.photos] : []);
    setTransferPhotosBox([]);
    setTransferPhotosAccessories([]);
    setTransferActivePhotoTab('product');
    setTransferExcludeDailyCount(false);
    setTransferError(null);
    setShowTransferSkuDropdown(false);
    setIsTransferModalOpen(true);
  };

  // Execute Transfer to Stock with complete triage data
  const handleExecuteTransfer = async () => {
    if (!itemToTransfer) return;

    if (transferDestination === 'Openbox' && !transferSti.trim()) {
      setTransferError('Para movimentar este item para o estoque do Openbox, é obrigatório preencher o Código STI. Por favor, marque/informe o STI no campo indicado para prosseguir com a movimentação.');
      return;
    }

    if (!transferSku.trim()) {
      setTransferError('Por favor, informe o SKU do produto.');
      return;
    }

    if (!transferProductName.trim()) {
      setTransferError('Por favor, informe o Nome do produto.');
      return;
    }

    setTransferError(null);
    setIsTransferring(true);
    try {
      const updatedItem = {
        ...itemToTransfer,
        sku: transferSku.trim().toUpperCase(),
        productName: transferProductName.trim(),
        voltage: transferVoltage,
        trackingCode: transferSti.trim() || itemToTransfer.trackingCode || '',
        serialNumber: transferSerialNumber.trim() || itemToTransfer.serialNumber || '',
        orderNumber: transferOrderNumber.trim() || itemToTransfer.orderNumber || '',
        platform: transferPlatform
      };

      const matchedProd = products.find(p => p.sku.toLowerCase() === transferSku.trim().toLowerCase());

      await onTransferToStock(updatedItem, transferDestination, {
        baseProductId: matchedProd?.id,
        baseProductName: transferProductName.trim(),
        baseProductSku: transferSku.trim().toUpperCase(),
        baseProductVoltage: transferVoltage,
        platform: transferPlatform,
        serialNumber: transferSerialNumber.trim(),
        trackingCode: transferSti.trim(),
        orderNumber: transferOrderNumber.trim(),
        customerReason: transferCustomerReason.trim() || updatedItem.pendingReason,
        deviceStatus: transferDeviceStatus,
        packageStatus: transferPackageStatus,
        accessoriesInclusion: transferAccessories.trim(),
        notes: transferNotes,
        photosProduct: transferPhotosProduct,
        photosBox: transferPhotosBox,
        photosAccessories: transferPhotosAccessories,
        excludeFromDailyCount: transferExcludeDailyCount
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

  const getPriorityBadge = (priority?: PendingPriorityType | string) => {
    switch (priority) {
      case 'Urgente':
        return {
          label: 'Urgente',
          icon: '',
          className: 'bg-rose-500/20 text-rose-300 border-rose-500/50 font-bold',
          dotColor: 'bg-rose-500',
          cardBorder: 'border-l-4 border-l-rose-500 shadow-rose-950/20',
          cardBg: 'bg-rose-950/15'
        };
      case 'Alta':
        return {
          label: 'Alta',
          icon: '',
          className: 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold',
          dotColor: 'bg-amber-500',
          cardBorder: 'border-l-4 border-l-amber-500 shadow-amber-950/20',
          cardBg: 'bg-amber-950/15'
        };
      case 'Média':
        return {
          label: 'Média',
          icon: '',
          className: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
          dotColor: 'bg-sky-400',
          cardBorder: '',
          cardBg: ''
        };
      case 'Baixa':
      default:
        return {
          label: 'Baixa',
          icon: '',
          className: 'bg-slate-800 text-slate-400 border-slate-700',
          dotColor: 'bg-slate-500',
          cardBorder: '',
          cardBg: ''
        };
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-5 pt-5 border-t border-slate-800/80">
          <div className="bg-slate-950/60 border border-slate-800 p-3 rounded-xl">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total em Aberto</div>
            <div className="text-xl font-extrabold text-white mt-1">
              {stats.pendentes + stats.analise + stats.aguardandoPecaOuNf}
            </div>
            <div className="text-[10px] text-sky-400 font-medium mt-0.5">Aguardando resolução</div>
          </div>

          <div className="bg-slate-950/60 border border-rose-500/30 p-3 rounded-xl">
            <div className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider flex items-center justify-between">
              <span>Urgentes / Alta</span>
            </div>
            <div className="text-xl font-extrabold text-rose-300 mt-1">{stats.urgentes}</div>
            <div className="text-[10px] text-rose-400/80 font-medium mt-0.5">Foco prioritário</div>
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

          <div 
            onClick={() => {
              if (statusFilter === 'Resolvido') {
                setStatusFilter('Todos');
              } else {
                setStatusFilter('Resolvido');
                if (hideResolved) setHideResolved(false);
              }
            }}
            className={`bg-slate-950/60 border p-3 rounded-xl cursor-pointer transition-all ${
              statusFilter === 'Resolvido'
                ? 'border-emerald-500 bg-emerald-950/20 ring-1 ring-emerald-500/50'
                : 'border-emerald-500/20 hover:border-emerald-500/40'
            }`}
            title="Clique para filtrar apenas pendências resolvidas"
            id="card-metric-resolvidos"
          >
            <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center justify-between">
              <span>Resolvidos</span>
              {hideResolved && (
                <span className="text-[9px] text-slate-400 lowercase font-normal">(ocultos)</span>
              )}
            </div>
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
        <div className="flex items-center gap-2.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 flex-wrap sm:flex-nowrap">
          {/* Priority Filter Dropdown */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs text-slate-400 font-medium">Prioridade:</span>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as any)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500 cursor-pointer"
              id="select-priority-filter"
            >
              <option value="Todas">Todas</option>
              <option value="Urgente">Urgente</option>
              <option value="Alta">Alta</option>
              <option value="Média">Média</option>
              <option value="Baixa">Baixa</option>
            </select>
          </div>

          {/* Status Filter Dropdown */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs text-slate-400 font-medium">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => {
                const val = e.target.value as any;
                setStatusFilter(val);
                if (val === 'Resolvido' && hideResolved) {
                  setHideResolved(false);
                }
              }}
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

          {/* Toggle Hide/Show Resolved Button */}
          <button
            type="button"
            onClick={handleToggleHideResolved}
            data-hidden={hideResolved ? 'true' : 'false'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer shrink-0 ${
              hideResolved
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 shadow-sm'
                : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
            }`}
            title={
              hideResolved
                ? "Pendências resolvidas estão ocultas. Clique para exibir todas."
                : "Pendências resolvidas estão visíveis. Clique para ocultá-las."
            }
            id="btn-toggle-hide-resolved"
          >
            {hideResolved ? (
              <>
                <EyeOff className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Ocultando Resolvidas</span>
                {stats.resolvidos > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {stats.resolvidos}
                  </span>
                )}
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>Ocultar Resolvidas</span>
                {stats.resolvidos > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono font-medium bg-slate-800 text-slate-400 border border-slate-700">
                    {stats.resolvidos}
                  </span>
                )}
              </>
            )}
          </button>

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

      {/* Alert banner if resolved items are hidden */}
      {hideResolved && stats.resolvidos > 0 && statusFilter !== 'Resolvido' && (
        <div className="pending-hidden-resolved-banner flex items-center justify-between px-4 py-2.5 bg-emerald-950/20 border border-emerald-500/25 rounded-xl text-xs text-emerald-300 shadow-sm animate-in fade-in" id="banner-hidden-resolved">
          <div className="flex items-center gap-2">
            <EyeOff className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              <strong>{stats.resolvidos}</strong> {stats.resolvidos === 1 ? 'pendência resolvida está oculta' : 'pendências resolvidas estão ocultas'} da lista atual.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setHideResolved(false)}
            className="text-xs text-emerald-400 hover:text-emerald-200 font-bold underline cursor-pointer shrink-0 ml-2"
            id="btn-show-resolved-inline"
          >
            Exibir resolvidas
          </button>
        </div>
      )}

      {/* Main Content Area: Cards or Table */}
      {filteredItems.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center max-w-lg mx-auto space-y-3" id="empty-state-pendencias">
          <div className="p-3 bg-slate-800/80 text-slate-400 rounded-2xl w-fit mx-auto border border-slate-700">
            <Clock className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-base font-bold text-white">Nenhuma pendência encontrada</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            {hideResolved && stats.resolvidos > 0 && !searchTerm && statusFilter === 'Todos' && platformFilter === 'Todas' && priorityFilter === 'Todas'
              ? `Todas as ${stats.resolvidos} pendências registradas já estão resolvidas e foram ocultadas pelo filtro ativo.`
              : (searchTerm || statusFilter !== 'Todos' || platformFilter !== 'Todas' || priorityFilter !== 'Todas' || hideResolved)
              ? 'Nenhum item corresponde aos filtros selecionados. Tente ajustar os filtros ou reexibir pendências resolvidas.'
              : 'Não há itens pendentes cadastrados no momento. Clique no botão acima para adicionar um novo produto à lista de pendências.'}
          </p>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {hideResolved && stats.resolvidos > 0 && (
              <button
                onClick={() => setHideResolved(false)}
                className="px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-bold rounded-xl border border-emerald-500/40 transition-all cursor-pointer flex items-center gap-1.5"
                id="btn-empty-show-resolved"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Exibir {stats.resolvidos} {stats.resolvidos === 1 ? 'Resolvida' : 'Resolvidas'}</span>
              </button>
            )}
            {(searchTerm || statusFilter !== 'Todos' || platformFilter !== 'Todas' || priorityFilter !== 'Todas') && (
              <button
                onClick={() => { setSearchTerm(''); setStatusFilter('Todos'); setPlatformFilter('Todas'); setPriorityFilter('Todas'); }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-sky-400 text-xs font-bold rounded-xl border border-slate-700 transition-all cursor-pointer"
                id="btn-clear-pending-filters"
              >
                Limpar Filtros
              </button>
            )}
            {!searchTerm && statusFilter === 'Todos' && platformFilter === 'Todas' && priorityFilter === 'Todas' && (!hideResolved || stats.resolvidos === 0) && (
              <button
                onClick={handleOpenNewModal}
                className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold rounded-xl transition-all cursor-pointer inline-flex items-center gap-1.5"
                id="btn-empty-new-pending"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                Cadastrar Nova Pendência
              </button>
            )}
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="pendencias-grid">
          {filteredItems.map((item) => {
            const isResolved = item.status === 'Resolvido' || item.transferredToStock;
            const prioInfo = getPriorityBadge(item.priority);
            return (
              <div
                key={item.id}
                className={`pending-card rounded-2xl p-4 flex flex-col justify-between transition-all group ${
                  isResolved
                    ? 'bg-slate-950/60 border border-slate-800/60 opacity-60 hover:opacity-100 shadow-sm'
                    : `bg-slate-900 border border-slate-800 hover:border-slate-700 shadow-lg ${prioInfo.cardBorder} ${prioInfo.cardBg}`
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
                      <span className={`pending-priority-badge text-[10px] px-2 py-0.5 rounded-md border flex items-center gap-1 ${prioInfo.className}`}>
                        <span>{prioInfo.icon}</span>
                        <span>{prioInfo.label}</span>
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
                  <th className="py-3.5 px-4">Prioridade</th>
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
                  const prioInfo = getPriorityBadge(item.priority);
                  return (
                    <tr 
                      key={item.id} 
                      className={`transition-colors ${
                        isResolved 
                          ? 'bg-slate-950/40 opacity-60 hover:opacity-100 hover:bg-slate-800/30' 
                          : item.priority === 'Urgente'
                          ? 'bg-rose-950/15 hover:bg-rose-950/25 border-l-2 border-l-rose-500'
                          : item.priority === 'Alta'
                          ? 'bg-amber-950/10 hover:bg-amber-950/20 border-l-2 border-l-amber-500'
                          : 'hover:bg-slate-800/40'
                      }`}
                    >
                      {/* Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${getStatusBadge(item.status)}`}>
                          {item.status}
                        </span>
                      </td>

                      {/* Prioridade */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={`text-[10px] px-2 py-0.5 rounded-md border inline-flex items-center gap-1 ${prioInfo.className}`}>
                          <span>{prioInfo.icon}</span>
                          <span>{prioInfo.label}</span>
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
                        {item.voltage && item.voltage !== 'N/A' && (
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

              {/* Row 6: Nível de Prioridade */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Flame className="w-4 h-4 text-amber-400" />
                    <span>Nível de Prioridade da Pendência *</span>
                  </label>
                  <span className="text-[10px] text-slate-400">
                    Itens urgentes e de alta prioridade ganham destaque e ficam no topo da fila.
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormPriority('Urgente')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      formPriority === 'Urgente'
                        ? 'bg-rose-600 text-white border-rose-400 shadow-md shadow-rose-950/40 ring-1 ring-rose-400'
                        : 'bg-slate-950 text-rose-300/80 border-slate-800 hover:border-rose-500/40'
                    }`}
                  >
                    <span>Urgente</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormPriority('Alta')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      formPriority === 'Alta'
                        ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-950/40 ring-1 ring-amber-400 font-extrabold'
                        : 'bg-slate-950 text-amber-300/80 border-slate-800 hover:border-amber-500/40'
                    }`}
                  >
                    <span>Alta</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormPriority('Média')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      formPriority === 'Média'
                        ? 'bg-sky-500 text-slate-950 border-sky-400 shadow-md shadow-sky-950/40 ring-1 ring-sky-400 font-extrabold'
                        : 'bg-slate-950 text-sky-300/80 border-slate-800 hover:border-sky-500/40'
                    }`}
                  >
                    <span>Média</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormPriority('Baixa')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      formPriority === 'Baixa'
                        ? 'bg-slate-700 text-white border-slate-500 shadow-md ring-1 ring-slate-400'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <span>Baixa</span>
                  </button>
                </div>
              </div>

              {/* Row 7: Status da Pendência */}
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

              {/* Row 8: Fotos / Anexos de Imagens */}
              <div className="pt-2 border-t border-slate-800">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4 text-sky-400" />
                      Fotos do Produto / Avaria / Caixa / Etiquetas ({formPhotos.length})
                    </label>
                    <span className="text-[10px] text-slate-500 block sm:inline">
                      Dica: você pode colar fotos diretamente com <strong className="text-sky-400">Ctrl+V</strong>.
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleTriggerClipboardPaste('form')}
                      disabled={isUploadingPhoto}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 rounded-xl text-xs font-bold cursor-pointer transition-all disabled:opacity-50"
                      title="Colar imagem da área de transferência (Ctrl+V)"
                    >
                      <Clipboard className="w-3.5 h-3.5" />
                      <span>Colar Foto (Ctrl+V)</span>
                    </button>
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

      {/* TRANSFER TO STOCK MODAL - COMPLETE RMA TRIAGE FORM */}
      {isTransferModalOpen && itemToTransfer && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isTransferring) setIsTransferModalOpen(false);
          }}
        >
          <div 
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl xl:max-w-6xl max-h-[92vh] overflow-y-auto shadow-2xl p-6 space-y-5" 
            id="modal-transfer-to-stock"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-800 sticky -top-6 bg-slate-900 z-20 pt-1">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-emerald-500/15 text-emerald-400 rounded-xl border border-emerald-500/30">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>Liberar e Transferir para Estoque</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      Triagem Completa
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    O produto será promovido e inserido no Estoque Físico com dados completos de RMA.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsTransferModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Transfer Error Alert */}
            {transferError && (
              <div className="p-3.5 bg-rose-500/15 border border-rose-500/50 rounded-xl text-xs text-rose-200 flex items-start gap-2.5 animate-in fade-in" id="transfer-sti-alert">
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-rose-300">Atenção no Preenchimento</div>
                  <p className="mt-0.5 text-rose-200/90 leading-relaxed">{transferError}</p>
                </div>
              </div>
            )}

            {/* 2-Column Responsive Layout: Left = Product/Dest/Inspection, Right = Daily Count/Notes/Photos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* Left Column: Identificação, Destino, Inspeção */}
              <div className="space-y-4">
                {/* Section 1: Identificação do Produto */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
                    <Tag className="w-3.5 h-3.5 text-sky-400" />
                    <span>1. Identificação do Produto</span>
                  </div>

                  {/* SKU com Autocomplete */}
                  <div className="relative">
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      SKU do Produto *
                    </label>
                    <input
                      type="text"
                      value={transferSku}
                      onChange={(e) => handleTransferSkuChange(e.target.value)}
                      onFocus={() => {
                        if (transferSku.trim()) setShowTransferSkuDropdown(true);
                      }}
                      placeholder="Informe ou pesquise o SKU..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                      required
                    />

                    {/* SKU Autocomplete Dropdown */}
                    {showTransferSkuDropdown && transferSkuSuggestions.length > 0 && (
                      <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-slate-950 border border-slate-800 rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto">
                        {transferSkuSuggestions.map((prod) => (
                          <div
                            key={prod.id}
                            onClick={() => handleSelectTransferProductSuggestion(prod)}
                            className="px-3.5 py-2.5 hover:bg-slate-800/80 cursor-pointer text-xs border-b border-slate-800/50 last:border-0 flex items-center justify-between"
                          >
                            <div>
                              <span className="font-mono font-bold text-amber-400">{prod.sku}</span>
                              <span className="text-slate-300 ml-2 font-medium">{prod.name}</span>
                            </div>
                            {prod.voltage && prod.voltage !== 'N/A' && (
                              <span className="text-[10px] text-slate-400 font-mono">{prod.voltage}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Nome do Produto */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Nome do Produto *
                    </label>
                    <input
                      type="text"
                      value={transferProductName}
                      onChange={(e) => setTransferProductName(e.target.value)}
                      placeholder="Nome comercial do produto"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                      required
                    />
                  </div>

                  {/* Voltagem & Plataforma */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Voltagem
                      </label>
                      <select
                        value={transferVoltage}
                        onChange={(e) => setTransferVoltage(e.target.value as any)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                      >
                        <option value="110V">110V</option>
                        <option value="220V">220V</option>
                        <option value="Bivolt">Bivolt</option>
                        <option value="N/A">N/A (Acessório / Manual)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Plataforma de Origem
                      </label>
                      <PlatformSelector
                        value={transferPlatform}
                        onChange={(p) => setTransferPlatform(p as PlatformType)}
                        id="select-transfer-platform"
                        platforms={PLATFORMS.filter(p => p !== 'Outro') as PlatformType[]}
                      />
                    </div>
                  </div>
                </div>

                {/* Section 2: Destino & Rastreamento */}
                <div className="space-y-3 pt-3 border-t border-slate-800">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>2. Destino & Rastreamento</span>
                  </div>

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
                  <div className={`p-3.5 rounded-xl border transition-all space-y-2 ${
                    transferDestination === 'Openbox'
                      ? !transferSti.trim() || transferError 
                        ? 'bg-amber-500/10 border-amber-500/50 shadow-sm' 
                        : 'bg-slate-950 border-emerald-500/40'
                      : 'bg-slate-950 border-slate-800'
                  }`}>
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-amber-300 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-amber-400" />
                        <span>Código STI / Rastreio {transferDestination === 'Openbox' ? '(Obrigatório para Openbox) *' : '(Opcional)'}</span>
                      </label>
                      {transferDestination === 'Openbox' && (
                        !transferSti.trim() ? (
                          <span className="text-[10px] font-bold text-amber-400/90 bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/30">
                            Pendente de preenchimento
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1">
                            <Check className="w-3 h-3" /> Preenchido
                          </span>
                        )
                      )}
                    </div>

                    <input
                      type="text"
                      value={transferSti}
                      onChange={(e) => {
                        setTransferSti(e.target.value);
                        if (e.target.value.trim()) setTransferError(null);
                      }}
                      placeholder="Informe o Código STI (Ex: STI-882910)"
                      className={`w-full bg-slate-950 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono placeholder-slate-500 focus:outline-none transition-all ${
                        transferDestination === 'Openbox' && transferError && !transferSti.trim()
                          ? 'border-2 border-rose-500 focus:border-rose-400 shadow-sm shadow-rose-500/20'
                          : !transferSti.trim() && transferDestination === 'Openbox'
                          ? 'border border-amber-500/60 focus:border-amber-400'
                          : 'border border-slate-800 focus:border-emerald-400'
                      }`}
                      id="input-transfer-sti"
                    />
                  </div>

                  {/* Serial Number & Order Number */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Número de Série (S/N)
                      </label>
                      <input
                        type="text"
                        value={transferSerialNumber}
                        onChange={(e) => setTransferSerialNumber(e.target.value)}
                        placeholder="Ex: SN-99882244"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Número de Pedido
                      </label>
                      <input
                        type="text"
                        value={transferOrderNumber}
                        onChange={(e) => setTransferOrderNumber(e.target.value)}
                        placeholder="Ex: 20000088921"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 3: Inspeção Física & Motivo */}
                <div className="space-y-3 pt-3 border-t border-slate-800">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
                    <Box className="w-3.5 h-3.5 text-amber-400" />
                    <span>3. Inspeção Física & Motivo</span>
                  </div>

                  {/* Estado do Aparelho & Embalagem */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Estado do Aparelho
                      </label>
                      <select
                        value={transferDeviceStatus}
                        onChange={(e) => setTransferDeviceStatus(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                      >
                        <option value="Novo">Novo (Sem marcas de uso)</option>
                        <option value="Usado">Usado (Leves marcas / Marcas normais)</option>
                        <option value="Danificado">Danificado / Avariado</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Estado da Embalagem
                      </label>
                      <select
                        value={transferPackageStatus}
                        onChange={(e) => setTransferPackageStatus(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                      >
                        <option value="Perfeita">Perfeita (Original intacta)</option>
                        <option value="Danificada">Danificada (Amassada / Rasgada)</option>
                        <option value="Sem Embalagem">Sem Embalagem (Caixa parda / genérica)</option>
                      </select>
                    </div>
                  </div>

                  {/* Motivo do Cliente / Devolução */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Motivo da Devolução / Entrada
                    </label>
                    <input
                      type="text"
                      value={transferCustomerReason}
                      onChange={(e) => setTransferCustomerReason(e.target.value)}
                      placeholder="Ex: Arrependimento, cliente alegou defeito intermitente, etc."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>

                  {/* Acessórios Inclusos */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Acessórios Inclusos
                    </label>
                    <input
                      type="text"
                      value={transferAccessories}
                      onChange={(e) => setTransferAccessories(e.target.value)}
                      placeholder="Ex: Completo com fonte e cabos..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {['Completo com fonte e cabo', 'Apenas aparelho', 'Sem caixa original', 'Acessórios lacrados'].map((tag) => (
                        <button
                          type="button"
                          key={tag}
                          onClick={() => setTransferAccessories(prev => prev ? `${prev}, ${tag}` : tag)}
                          className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer border border-slate-700"
                        >
                          + {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Controle Diário, Laudo, Fotos da Triagem */}
              <div className="space-y-4">
                {/* Section 4: Controle de Entrada Diária (Requisito 5) */}
                <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl">
                  <label 
                    htmlFor="transfer-exclude-daily-count-toggle" 
                    className="flex items-start gap-3 cursor-pointer"
                  >
                    <input
                      id="transfer-exclude-daily-count-toggle"
                      type="checkbox"
                      checked={transferExcludeDailyCount}
                      onChange={(e) => setTransferExcludeDailyCount(e.target.checked)}
                      className="w-4 h-4 mt-0.5 rounded border-slate-700 text-amber-500 focus:ring-amber-400 cursor-pointer accent-amber-500 shrink-0"
                    />
                    <div className="space-y-0.5">
                      <span className={`text-xs font-bold block ${transferExcludeDailyCount ? 'text-amber-300' : 'text-slate-200'}`}>
                        Não contabilizar no registro de entrada diária
                      </span>
                      <span className="text-[11px] text-slate-400 block leading-relaxed">
                        Marque esta opção caso este item já tenha sido recebido anteriormente ou seja uma reentrada/resolução interna de pendência, evitando duplicar o contador de recebimento e fluxo de entrada do dia.
                      </span>
                    </div>
                  </label>
                </div>

                {/* Section 5: Observações Técnicas / Laudo */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    Observações Técnicas / Laudo de Saída da Pendência
                  </label>
                  <textarea
                    value={transferNotes}
                    onChange={(e) => setTransferNotes(e.target.value)}
                    placeholder="Detalhes dos testes realizados para liberação, peças trocadas ou parecer técnico..."
                    rows={3}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors resize-none"
                  />
                </div>

                {/* Section 6: Fotos da Triagem */}
                <div className="space-y-3 pt-2 border-t border-slate-800">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
                        <Camera className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Fotos da Triagem</span>
                      </label>
                      <span className="text-[10px] text-slate-500">
                        Você pode colar fotos com <strong className="text-emerald-400">Ctrl+V</strong>.
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleTriggerClipboardPaste('transfer')}
                        disabled={isTransferUploadingPhoto}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold cursor-pointer transition-all disabled:opacity-50"
                        title="Colar imagem da área de transferência (Ctrl+V)"
                      >
                        <Clipboard className="w-3.5 h-3.5" />
                        <span>Colar (Ctrl+V)</span>
                      </button>
                      <label className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold cursor-pointer transition-all">
                        <Upload className="w-3.5 h-3.5" />
                        <span>Adicionar Fotos</span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handleTransferPhotoUpload}
                          className="hidden"
                          disabled={isTransferUploadingPhoto}
                        />
                      </label>
                    </div>
                  </div>

                  {/* Photo Tabs Horizontal with High-Contrast Light/Dark Indicator */}
                  <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                    <button
                      type="button"
                      onClick={() => setTransferActivePhotoTab('product')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                        transferActivePhotoTab === 'product'
                          ? 'bg-emerald-500 text-slate-950 shadow-sm'
                          : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      <span>Aparelho</span>
                      <span className="photo-tab-counter-badge px-2 py-0.5 rounded-full text-[10px] font-bold">
                        {transferPhotosProduct.length}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTransferActivePhotoTab('box')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                        transferActivePhotoTab === 'box'
                          ? 'bg-emerald-500 text-slate-950 shadow-sm'
                          : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      <span>Caixa / Embalagem</span>
                      <span className="photo-tab-counter-badge px-2 py-0.5 rounded-full text-[10px] font-bold">
                        {transferPhotosBox.length}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTransferActivePhotoTab('accessories')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                        transferActivePhotoTab === 'accessories'
                          ? 'bg-emerald-500 text-slate-950 shadow-sm'
                          : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      <span>Acessórios</span>
                      <span className="photo-tab-counter-badge px-2 py-0.5 rounded-full text-[10px] font-bold">
                        {transferPhotosAccessories.length}
                      </span>
                    </button>
                  </div>

                  {isTransferUploadingPhoto && (
                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-center text-xs text-emerald-400 flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                      Comprimindo e processando foto com segurança...
                    </div>
                  )}

                  {/* Photos Grid */}
                  {(() => {
                    const currentList = transferActivePhotoTab === 'product'
                      ? transferPhotosProduct
                      : transferActivePhotoTab === 'box'
                      ? transferPhotosBox
                      : transferPhotosAccessories;

                    return currentList.length > 0 ? (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 max-h-56 overflow-y-auto pr-1">
                        {currentList.map((photo, idx) => (
                          <div
                            key={idx}
                            className="relative group aspect-square rounded-xl bg-slate-950 border border-slate-800 overflow-hidden"
                          >
                            <img
                              src={photo}
                              alt={`Foto ${idx + 1}`}
                              className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform"
                              onClick={() => {
                                setZoomImage(photo);
                                setZoomTitle(`Foto de Triagem (${transferActivePhotoTab}) - Foto ${idx + 1}`);
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveTransferPhoto(transferActivePhotoTab, idx)}
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
                        Nenhuma foto adicionada na categoria <strong>{transferActivePhotoTab === 'product' ? 'Aparelho' : transferActivePhotoTab === 'box' ? 'Caixa' : 'Acessórios'}</strong>.
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-2.5 sticky -bottom-6 bg-slate-900 z-20 pb-1">
              <button
                type="button"
                onClick={() => setIsTransferModalOpen(false)}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecuteTransfer}
                disabled={isTransferring}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer shadow-lg shadow-emerald-900/30 disabled:opacity-50 flex items-center gap-1.5"
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
                    <span>Confirmar e Transferir para o Estoque</span>
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
