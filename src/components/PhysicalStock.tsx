/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { 
  Search, 
  Filter, 
  Package, 
  Trash2, 
  FileText, 
  X, 
  CheckCircle2, 
  Sparkles,
  Layers,
  AlertTriangle,
  Info,
  Eye,
  Clock,
  LayoutGrid,
  List,
  Check,
  Copy,
  FileSpreadsheet,
  Upload,
  Pencil,
  Save,
  Camera,
  Image as ImageIcon,
  Download,
  ChevronDown,
  Clipboard,
  ClipboardPaste,
  Sliders,
  Zap,
  ShieldCheck,
  RefreshCw,
  RotateCcw,
  Undo2,
  Calendar,
  ShoppingCart,
  User,
  Hash,
  Link2,
  ArrowRightLeft
} from 'lucide-react';
import { TriageUnit, DestinationSectorType, PlatformType, BaseProduct, DeviceStatusType, PackageStatusType, PendingItem } from '../types';
import ExcelImportModal from './ExcelImportModal';
import { getPlatformFilterStyle, getSectorFilterStyle } from '../utils/filterColorHelpers';
import { ImageZoomModal } from './ImageZoomModal';
import { getUnitResolvedPhotos, getBaseProductImages, findBaseProduct } from '../utils/productImages';
import { exportStockInventoryToExcel } from '../utils/excelHelpers';
import { processSafeImageUrl } from '../lib/imageSecurityService';
import { uploadFileToStorage, uploadImageUrlToStorage } from '../lib/dbService';
import { CategoryBadge } from './CategoryBadge';
import { buildGroupedFilterCategories, checkCategoryFilterMatch } from '../utils/categoryTaxonomy';
import { RichTextEditor } from './RichTextEditor';
import { formatStiInput, isValidStiCode, normalizeStiCode, formatStiBadge } from '../utils/stiFormatter';
import { validatePendingItemLink, findPendingItemByRegistrationNumber } from '../utils/pendingRegistrationHelper';

interface PhysicalStockProps {
  units: TriageUnit[];
  products?: BaseProduct[];
  pendingItems?: PendingItem[];
  onUpdateUnit: (unit: TriageUnit) => Promise<void>;
  onDeleteUnit: (id: string) => Promise<void>;
  onCheckoutUnit: (id: string) => Promise<void>;
  onRevertCheckoutUnit?: (id: string) => Promise<void>;
  initialSelectedUnit?: TriageUnit | null;
  onClearSelectedUnit?: () => void;
  onSaveTriage?: (unit: TriageUnit) => Promise<void>;
  enableSpreadsheetImport?: boolean;
  enableSpreadsheetExport?: boolean;
  isLight?: boolean;
  initialPlatformFilter?: PlatformType | null;
  initialSectorFilter?: DestinationSectorType | null;
}

const stripHtml = (html?: string): string => {
  if (!html) return '';
  return html
    .replace(/<[^>]*>?/gm, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
};

export default function PhysicalStock({ 
  units, 
  products = [],
  pendingItems = [],
  onUpdateUnit, 
  onDeleteUnit, 
  onCheckoutUnit,
  onRevertCheckoutUnit,
  initialSelectedUnit,
  onClearSelectedUnit,
  onSaveTriage,
  enableSpreadsheetImport = true,
  enableSpreadsheetExport = true,
  isLight = false,
  initialPlatformFilter,
  initialSectorFilter
}: PhysicalStockProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<string>('Todas');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [selectedPlatform, setSelectedPlatform] = useState<string>(initialPlatformFilter || 'Todas');
  const [selectedVoltage, setSelectedVoltage] = useState<string>('Todas');
  const [selectedDate, setSelectedDate] = useState<string>(''); // YYYY-MM-DD
  const dateInputRef = useRef<HTMLInputElement>(null);

  // React to initial platform filter changes from Dashboard navigation
  useEffect(() => {
    if (initialPlatformFilter !== undefined) {
      setSelectedPlatform(initialPlatformFilter || 'Todas');
    }
  }, [initialPlatformFilter]);

  // React to initial sector filter changes from Dashboard navigation
  useEffect(() => {
    if (initialSectorFilter) {
      setActiveTab(initialSectorFilter);
    }
  }, [initialSectorFilter]);

  const getTodayIsoDate = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const getYesterdayIsoDate = () => {
    const now = new Date();
    now.setDate(now.getDate() - 1);
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const [activeTab, setActiveTab] = useState<'Todos' | DestinationSectorType | 'Baixado'>('Todos');
  const [visibleCount, setVisibleCount] = useState(20);
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

  // Quick copy state
  const [copiedCodeKey, setCopiedCodeKey] = useState<string | null>(null);

  const handleCopyCode = async (text: string, key: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    if (!text || text === 'Não Informado' || text === 'N/D') return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedCodeKey(key);
      setTimeout(() => {
        setCopiedCodeKey(prev => (prev === key ? null : prev));
      }, 1800);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  // Quick edit/action states
  const [editingSector, setEditingSector] = useState<DestinationSectorType | ''>('');
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [fullscreenImageList, setFullscreenImageList] = useState<string[]>([]);
  const [fullscreenImageIndex, setFullscreenImageIndex] = useState<number>(0);
  const [fullscreenImageTitle, setFullscreenImageTitle] = useState<string>('');

  const openImageZoom = (img: string, title?: string, list?: string[], index?: number) => {
    const activeList = list && list.length > 0 ? list : [img];
    const idx = index !== undefined ? index : activeList.indexOf(img);
    setFullscreenImage(img);
    setFullscreenImageTitle(title || '');
    setFullscreenImageList(activeList);
    setFullscreenImageIndex(idx >= 0 ? idx : 0);
  };

  const handleNavigateZoomImage = (newIdx: number) => {
    if (fullscreenImageList && fullscreenImageList[newIdx]) {
      setFullscreenImageIndex(newIdx);
      setFullscreenImage(fullscreenImageList[newIdx]);
    }
  };

  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    type: 'danger' | 'info' | 'success';
    onConfirm: () => void;
  } | null>(null);

  // Sector transfer with photo choice modal state
  const [transferModalData, setTransferModalData] = useState<{
    unit: TriageUnit;
    targetSector: DestinationSectorType;
    baseProduct?: BaseProduct;
    savedPhotosCount: number;
  } | null>(null);

  // Selected unit details
  const currentUnit = units.find(u => u.id === (selectedUnitId || initialSelectedUnit?.id));

  // Edit mode state for selected unit
  const [isEditingUnit, setIsEditingUnit] = useState(false);
  const [editForm, setEditForm] = useState<TriageUnit | null>(null);
  const [originalUnitPhotos, setOriginalUnitPhotos] = useState<{
    photosProduct: string[];
    photosBox: string[];
    photosAccessories: string[];
  } | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [isSanitizingUrl, setIsSanitizingUrl] = useState(false);
  const [urlInputCategory, setUrlInputCategory] = useState<'photosProduct' | 'photosBox' | 'photosAccessories'>('photosProduct');
  const [isCustomEditDeviceStatus, setIsCustomEditDeviceStatus] = useState(false);
  const [customEditDeviceStatusText, setCustomEditDeviceStatusText] = useState('');
  const [isCustomEditPackageStatus, setIsCustomEditPackageStatus] = useState(false);
  const [customEditPackageStatusText, setCustomEditPackageStatusText] = useState('');

  // SKU-based pending items selector for edit mode
  const [isEditPendingSelectorOpen, setIsEditPendingSelectorOpen] = useState(false);
  const editPendingSelectorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (editPendingSelectorRef.current && !editPendingSelectorRef.current.contains(event.target as Node)) {
        setIsEditPendingSelectorOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const cleanSku = (val?: string) => {
    if (!val) return '';
    let s = val.trim().toUpperCase();
    const m = s.match(/^\[(.*?)\]/);
    if (m && m[1]) s = m[1].trim().toUpperCase();
    return s;
  };

  const availableEditPendingItems = useMemo(() => {
    if (!pendingItems || pendingItems.length === 0 || !editForm) return [];
    
    // Resolve active SKU exactly like RmaEntry does (with fallback to catalog product)
    let currentSku = (editForm.baseProductSku || (editForm as any).sku || '').trim();
    if (!currentSku && editForm.baseProductId) {
      const prod = products.find(p => p.id === editForm.baseProductId);
      if (prod?.sku) currentSku = prod.sku;
    }
    const normalizedSku = cleanSku(currentSku);
    if (!normalizedSku) return [];

    return pendingItems.filter((item) => {
      // Must not be cancelled
      if (item.status === 'Cancelado') return false;

      // Strict SKU comparison (normalized, case-insensitive, strip brackets)
      const itemSku = cleanSku(item.sku);
      if (!itemSku || itemSku !== normalizedSku) return false;

      // Is it already linked to THIS unit being edited?
      const isAlreadyLinkedToThisUnit = 
        Boolean(editForm.id && item.linkedUnitId && item.linkedUnitId === editForm.id) ||
        Boolean(editForm.pendingItemId && item.id === editForm.pendingItemId) ||
        Boolean(editForm.pendingRegistrationNumber && item.registrationNumber && cleanSku(editForm.pendingRegistrationNumber) === cleanSku(item.registrationNumber));

      if (isAlreadyLinkedToThisUnit) return true;

      // Must not be linked to ANOTHER unit in stock (same rule as RmaEntry)
      const isLinkedToAnotherUnit = units.some((u) => {
        if (u.id === editForm.id) return false;
        if (editForm.trackingCode && u.trackingCode && u.trackingCode === editForm.trackingCode) return false;
        return (
          (u.pendingRegistrationNumber && item.registrationNumber && cleanSku(u.pendingRegistrationNumber) === cleanSku(item.registrationNumber)) ||
          (u.pendingItemId && item.id && u.pendingItemId === item.id)
        );
      });
      return !isLinkedToAnotherUnit;
    });
  }, [pendingItems, editForm?.baseProductSku, (editForm as any)?.sku, editForm?.baseProductId, editForm?.id, editForm?.trackingCode, editForm?.pendingRegistrationNumber, editForm?.pendingItemId, units, products]);

  const editPendingLinkValidation = useMemo(() => {
    if (!editForm || !editForm.pendingRegistrationNumber || !editForm.pendingRegistrationNumber.trim()) {
      return { valid: true };
    }
    return validatePendingItemLink(editForm.pendingRegistrationNumber, editForm.id, pendingItems, units);
  }, [editForm?.pendingRegistrationNumber, editForm?.id, pendingItems, units]);

  const handleSelectEditPendingItem = (item: PendingItem) => {
    if (!editForm) return;
    const updated = { ...editForm };
    updated.pendingRegistrationNumber = item.registrationNumber || undefined;
    updated.pendingItemId = item.id;

    // Pull other relevant fields if currently empty (without modifying notes/laudo or customerReason/motivo)
    if (!updated.orderNumber && item.orderNumber) {
      updated.orderNumber = item.orderNumber;
    }
    if (!updated.serialNumber && item.serialNumber) {
      updated.serialNumber = item.serialNumber;
    }
    if (!updated.platform && item.platform) {
      updated.platform = item.platform as any;
    }
    if (item.trackingCode && (!updated.trackingCode || updated.trackingCode.trim() === '')) {
      updated.trackingCode = item.trackingCode;
    }
    if (!updated.customerReason && item.customerReason) {
      updated.customerReason = item.customerReason;
    }
    if (item.deviceStatus && (!updated.deviceStatus || updated.deviceStatus === 'Usado')) {
      updated.deviceStatus = item.deviceStatus as any;
    }
    if (item.packageStatus && (!updated.packageStatus || updated.packageStatus === 'Danificada')) {
      updated.packageStatus = item.packageStatus as any;
    }

    setEditForm(updated);
    setIsEditPendingSelectorOpen(false);
  };

  const handleClearEditPendingLink = () => {
    if (!editForm) return;
    setEditForm({
      ...editForm,
      pendingRegistrationNumber: undefined,
      pendingItemId: undefined
    });
    setIsEditPendingSelectorOpen(false);
  };

  // If initialSelectedUnit changed from parent, keep local state in sync
  React.useEffect(() => {
    if (initialSelectedUnit) {
      setSelectedUnitId(initialSelectedUnit.id);
      if (initialSelectedUnit.status === 'Baixado') {
        setActiveTab('Baixado');
      } else if (initialSelectedUnit.destinationSector) {
        setActiveTab(initialSelectedUnit.destinationSector);
      }
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
    setOriginalUnitPhotos(null);
    setIsCustomEditDeviceStatus(false);
    setCustomEditDeviceStatusText('');
    setIsCustomEditPackageStatus(false);
    setCustomEditPackageStatusText('');
    setIsEditPendingSelectorOpen(false);
  };

  const handleStartEdit = (unit: TriageUnit) => {
    setSelectedUnitId(unit.id);
    const catalogProduct = products.find(p => (unit.baseProductId && p.id === unit.baseProductId) || (unit.baseProductSku && p.sku === unit.baseProductSku));
    const resolvedSku = unit.baseProductSku || (unit as any).sku || catalogProduct?.sku || '';
    setEditForm({ 
      ...unit,
      baseProductSku: resolvedSku,
      platform: (unit.platform || '') as any,
    });
    setOriginalUnitPhotos({
      photosProduct: [...(unit.photosProduct || [])],
      photosBox: [...(unit.photosBox || [])],
      photosAccessories: [...(unit.photosAccessories || [])]
    });

    const STANDARD_DEVICE_STATUSES = ['Novo', 'Usado', 'Com Avaria', 'Peças'];
    const isCustomDev = Boolean(unit.deviceStatus) && !STANDARD_DEVICE_STATUSES.includes(unit.deviceStatus);
    setIsCustomEditDeviceStatus(isCustomDev);
    setCustomEditDeviceStatusText(isCustomDev ? unit.deviceStatus : '');

    const STANDARD_PACKAGE_STATUSES = ['Perfeita', 'Usada', 'Sem Caixa', 'Danificada', 'Sem Embalagem'];
    const isCustomPkg = Boolean(unit.packageStatus) && !STANDARD_PACKAGE_STATUSES.includes(unit.packageStatus);
    setIsCustomEditPackageStatus(isCustomPkg);
    setCustomEditPackageStatusText(isCustomPkg ? unit.packageStatus : '');

    setIsEditingUnit(true);
  };

  const handleSaveEdit = async () => {
    if (!editForm) return;
    setIsSavingEdit(true);
    try {
      let updatedForm = { ...editForm };
      
      // Apply custom device and package status if selected
      if (isCustomEditDeviceStatus || editForm.deviceStatus === 'Descrever') {
        updatedForm.deviceStatus = (customEditDeviceStatusText.trim() || 'Descrever') as any;
      }
      if (isCustomEditPackageStatus || editForm.packageStatus === 'Descrever') {
        updatedForm.packageStatus = (customEditPackageStatusText.trim() || 'Descrever') as any;
      }

      // Ensure platform is properly set (or empty string/undefined)
      updatedForm.platform = (editForm.platform || '') as any;

      // Validate pending registration link if specified
      if (updatedForm.pendingRegistrationNumber && updatedForm.pendingRegistrationNumber.trim()) {
        const val = validatePendingItemLink(updatedForm.pendingRegistrationNumber, updatedForm.id, pendingItems, units);
        if (!val.valid) {
          setActionError(val.error || 'Erro ao vincular número de registro de pendência.');
          setIsSavingEdit(false);
          setTimeout(() => setActionError(null), 5000);
          return;
        }
        const item = findPendingItemByRegistrationNumber(updatedForm.pendingRegistrationNumber, pendingItems);
        if (item) {
          updatedForm.pendingItemId = item.id;
        }
      } else {
        updatedForm.pendingRegistrationNumber = undefined;
        updatedForm.pendingItemId = undefined;
      }
      
      // If destinationSector is 'Principal' and photos are empty, auto-reference base product images
      if (updatedForm.destinationSector === 'Principal' && (!updatedForm.photosProduct || updatedForm.photosProduct.length === 0)) {
        const baseProd = findBaseProduct(updatedForm, products);
        const baseImgs = getBaseProductImages(baseProd);
        if (baseImgs.productPhotos.length > 0) {
          updatedForm.photosProduct = baseImgs.productPhotos;
        }
      }

      // Mandatory STI check for Openbox products, and clear STI if not Openbox
      if (updatedForm.destinationSector === 'Openbox') {
        const normSti = normalizeStiCode(updatedForm.trackingCode);
        if (!normSti) {
          setActionError('O Código STI é obrigatório para produtos no setor OpenBox.');
          setIsSavingEdit(false);
          setTimeout(() => setActionError(null), 4000);
          return;
        }
        if (!isValidStiCode(normSti)) {
          setActionError('Código STI inválido. O formato obrigatório é a combinação de STI + 6 números (Ex: STI134920).');
          setIsSavingEdit(false);
          setTimeout(() => setActionError(null), 4000);
          return;
        }
        updatedForm.trackingCode = normSti;
      } else {
        updatedForm.trackingCode = '';
      }

      // Check if product was transferred to another stock sector
      const originalUnit = units.find(u => u.id === updatedForm.id) || currentUnit;
      const originalSector = originalUnit?.destinationSector;
      const isSectorTransferred = Boolean(originalSector && originalSector !== updatedForm.destinationSector);
      if (isSectorTransferred) {
        const transferMoment = new Date().toISOString();
        const previousInitialDate = updatedForm.initialEntryDate || originalUnit?.initialEntryDate || updatedForm.createdAt || originalUnit?.createdAt;
        updatedForm.originSector = originalSector;
        updatedForm.initialEntryDate = previousInitialDate;
        updatedForm.transferredAt = transferMoment;
        updatedForm.createdAt = transferMoment; // Contabiliza novamente no registro no momento da transferência
        updatedForm.updatedAt = transferMoment;
        updatedForm.excludeFromDailyCount = false; // Garante que será contabilizado no registro diário
      }

      await onUpdateUnit(updatedForm);
      setIsSavingEdit(false);
      setIsEditingUnit(false);
      setActionSuccess(
        isSectorTransferred
          ? `Ficha atualizada e produto transferido para ${updatedForm.destinationSector}! Recontabilizado no registro de hoje.`
          : 'Ficha do produto e fotos atualizados com sucesso!'
      );
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      console.error('Error updating unit:', err);
      setActionError(`Erro ao salvar alterações: ${err?.message || err}`);
      setIsSavingEdit(false);
      setTimeout(() => setActionError(null), 4000);
    }
  };

  const handleProcessImageFiles = async (files: File[], targetCategory: 'photosProduct' | 'photosBox' | 'photosAccessories') => {
    if (!editForm || files.length === 0) return;
    try {
      const uploadPromises = files.map(file => uploadFileToStorage(file, `stock_${targetCategory}`));
      const urlList = await Promise.all(uploadPromises);
      const existing = editForm[targetCategory] || [];
      setEditForm({
        ...editForm,
        [targetCategory]: [...existing, ...urlList]
      });
      const catLabel = targetCategory === 'photosProduct' ? 'Aparelho' : targetCategory === 'photosBox' ? 'Embalagem' : 'Acessórios';
      setActionSuccess(`${files.length} foto(s) adicionada(s) para Fotos do ${catLabel}!`);
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err: any) {
      console.error(err);
      setActionError(err?.message || 'Erro ao processar imagem.');
      setTimeout(() => setActionError(null), 3000);
    }
  };

  const handleAddPhotoFile = async (category: 'photosProduct' | 'photosBox' | 'photosAccessories', e: React.ChangeEvent<HTMLInputElement>) => {
    if (!editForm || !e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files) as File[];
    await handleProcessImageFiles(files, category);
    e.target.value = '';
  };

  const handlePasteFromClipboard = async (targetCategory: 'photosProduct' | 'photosBox' | 'photosAccessories') => {
    try {
      if (navigator.clipboard && (navigator.clipboard as any).read) {
        const items = await (navigator.clipboard as any).read();
        const imageFiles: File[] = [];
        for (const item of items) {
          for (const type of item.types) {
            if (type.startsWith('image/')) {
              const blob = await item.getType(type);
              const file = new File([blob], `clipboard-${Date.now()}.${type.split('/')[1] || 'png'}`, { type });
              imageFiles.push(file);
            }
          }
        }
        if (imageFiles.length > 0) {
          await handleProcessImageFiles(imageFiles, targetCategory);
          return;
        }
      }
      
      // Fallback: check clipboard text if it is an image URL or data URI
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && (text.startsWith('http://') || text.startsWith('https://') || text.startsWith('data:image/'))) {
          if (!editForm) return;
          setIsSanitizingUrl(true);
          try {
            const uploadedUrl = await uploadImageUrlToStorage(text.trim(), `stock_${targetCategory}`);
            const existing = editForm[targetCategory] || [];
            setEditForm({
              ...editForm,
              [targetCategory]: [...existing, uploadedUrl]
            });
            const catLabel = targetCategory === 'photosProduct' ? 'Aparelho' : targetCategory === 'photosBox' ? 'Embalagem' : 'Acessórios';
            setActionSuccess(`Link de imagem colado e enviado ao Cloudinary para Fotos do ${catLabel}!`);
            setTimeout(() => setActionSuccess(null), 3000);
            return;
          } catch (urlErr: any) {
            setActionError(urlErr?.message || 'Erro ao enviar imagem colada ao Cloudinary.');
            setTimeout(() => setActionError(null), 3500);
            return;
          } finally {
            setIsSanitizingUrl(false);
          }
        }
      }

      setActionError('Nenhuma imagem encontrada na área de transferência. Copie uma imagem ou use Ctrl+V.');
      setTimeout(() => setActionError(null), 3500);
    } catch (err: any) {
      console.warn('Clipboard read error:', err);
      setActionError('Dica: Pressione Ctrl+V no teclado para colar a imagem diretamente.');
      setTimeout(() => setActionError(null), 3500);
    }
  };

  const handleEditModalPaste = async (e: React.ClipboardEvent | ClipboardEvent, targetCategory?: 'photosProduct' | 'photosBox' | 'photosAccessories') => {
    const cat = targetCategory || urlInputCategory;
    const imageFiles: File[] = [];

    // 1. Check clipboardData.files (files copied from filesystem)
    if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
      for (let i = 0; i < e.clipboardData.files.length; i++) {
        const file = e.clipboardData.files[i];
        if (file.type.indexOf('image/') !== -1) {
          imageFiles.push(file);
        }
      }
    }

    // 2. Check clipboardData.items (screenshots / copied web images)
    if (imageFiles.length === 0 && e.clipboardData?.items) {
      const items = e.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image/') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            imageFiles.push(file);
          }
        }
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault();
      if ('stopPropagation' in e) {
        e.stopPropagation();
      }
      await handleProcessImageFiles(imageFiles, cat);
    }
  };

  const handleDropPhoto = async (e: React.DragEvent, category: 'photosProduct' | 'photosBox' | 'photosAccessories') => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const allFiles = Array.from(e.dataTransfer.files) as File[];
      const imageFiles = allFiles.filter(f => f.type.startsWith('image/'));
      if (imageFiles.length > 0) {
        await handleProcessImageFiles(imageFiles, category);
      }
    }
  };

  // Global paste event listener during edit mode
  useEffect(() => {
    if (!isEditingUnit) return;
    const handleGlobalPaste = (e: ClipboardEvent) => {
      // If typing in input/textarea, only intercept if clipboard has image files/screenshots
      const items = e.clipboardData?.items ? (Array.from(e.clipboardData.items) as DataTransferItem[]) : [];
      const hasImage = items.some(item => item.type.startsWith('image/'));
      
      if (hasImage) {
        handleEditModalPaste(e, urlInputCategory);
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => {
      window.removeEventListener('paste', handleGlobalPaste);
    };
  }, [isEditingUnit, urlInputCategory, editForm]);

  const handleAddPhotoUrl = async (category: 'photosProduct' | 'photosBox' | 'photosAccessories') => {
    if (!editForm || !imageUrlInput.trim()) return;
    const url = imageUrlInput.trim();
    setIsSanitizingUrl(true);
    setActionError(null);

    try {
      const uploadedUrl = await uploadImageUrlToStorage(url, `stock_${category}`);
      const existing = editForm[category] || [];
      setEditForm({
        ...editForm,
        [category]: [...existing, uploadedUrl]
      });
      setImageUrlInput('');
      const catLabel = category === 'photosProduct' ? 'Aparelho' : category === 'photosBox' ? 'Embalagem' : 'Acessórios';
      setActionSuccess(`Foto via link enviada e hospedada no Cloudinary para Fotos do ${catLabel}!`);
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err: any) {
      setActionError(err?.message || 'Erro ao validar e enviar imagem por link ao Cloudinary.');
      setTimeout(() => setActionError(null), 4000);
    } finally {
      setIsSanitizingUrl(false);
    }
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
        const key = normalizeStiCode(u.trackingCode).toLowerCase();
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
    return duplicateStiSet.has(normalizeStiCode(unit.trackingCode).toLowerCase());
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

  // Units in the current sector tab (e.g. Todos Ativos, Principal, Openbox, RMA, Baixado)
  const tabUnits = React.useMemo(() => {
    if (activeTab === 'Todos') {
      return units.filter(u => u.status === 'Estoque');
    } else if (activeTab === 'Baixado') {
      return units.filter(u => u.status === 'Baixado');
    } else {
      return units.filter(u => u.status === 'Estoque' && u.destinationSector === activeTab);
    }
  }, [units, activeTab]);

  // Brand counts and unique brands with at least 1 registered unit in the active stock tab
  const brandCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    tabUnits.forEach(u => {
      const bp = findBaseProduct(u, products);
      const b = (bp?.brand || '').trim();
      if (b && b !== 'N/A' && b !== 'Não Informado' && b !== 'Todas') {
        counts[b] = (counts[b] || 0) + 1;
      }
    });
    return counts;
  }, [tabUnits, products]);

  const uniqueBrands = React.useMemo(() => {
    return (Object.entries(brandCounts) as [string, number][])
      .filter(([_, count]) => count > 0)
      .map(([brand, count]) => ({ brand, count }))
      .sort((a, b) => a.brand.localeCompare(b.brand, 'pt-BR'));
  }, [brandCounts]);

  // Category counts and grouped filter categories for items with registered units
  const categoryCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    tabUnits.forEach(u => {
      const bp = findBaseProduct(u, products);
      if (bp?.category && bp.category.trim() && bp.category.trim() !== 'Todas') {
        const cat = bp.category.trim();
        counts[cat] = (counts[cat] || 0) + 1;
      }
    });
    return counts;
  }, [tabUnits, products]);

  // Grouped Categories with General Categories & Subcategories with registered units
  const groupedFilterCategories = React.useMemo(() => {
    const existingCats = Object.keys(categoryCounts).filter(cat => (categoryCounts[cat] || 0) > 0);
    return buildGroupedFilterCategories(existingCats, categoryCounts);
  }, [categoryCounts]);

  // Reset selected filters if they no longer exist in the available items of the current view
  useEffect(() => {
    if (selectedBrand !== 'Todas' && !uniqueBrands.some(b => b.brand === selectedBrand)) {
      setSelectedBrand('Todas');
    }
  }, [uniqueBrands, selectedBrand]);

  useEffect(() => {
    if (selectedCategory !== 'Todas') {
      const exists = groupedFilterCategories.some(group => 
        group.options.some(opt => opt.value === selectedCategory)
      );
      if (!exists) {
        setSelectedCategory('Todas');
      }
    }
  }, [groupedFilterCategories, selectedCategory]);

  const handleClearAllFilters = () => {
    setSearchTerm('');
    setSelectedBrand('Todas');
    setSelectedCategory('Todas');
    setSelectedPlatform('Todas');
    setSelectedVoltage('Todas');
    setSelectedDate('');
    setFilterOnlyDuplicates(false);
  };

  const hasActiveFilters = Boolean(
    searchTerm.trim() || 
    selectedBrand !== 'Todas' || 
    selectedCategory !== 'Todas' || 
    selectedPlatform !== 'Todas' ||
    selectedVoltage !== 'Todas' || 
    selectedDate !== '' ||
    filterOnlyDuplicates
  );

  // Helper: Retrieve discharge / checkout date
  const getDischargeDate = (unit: TriageUnit): string | null => {
    if (unit.checkoutDate) return unit.checkoutDate;
    if (unit.status === 'Baixado') return unit.updatedAt || unit.createdAt || null;
    return null;
  };

  // Helper: Format discharge date for UI
  const formatDischargeDateTime = (dateStr: string | null | undefined): string => {
    if (!dateStr) return 'Não informada';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return dateStr;
    }
  };

  // Filter logic with Chronological Sorting (Mais recente ao mais antigo)
  const filteredUnits = useMemo(() => {
    const list = units.filter(unit => {
      // 0. Filter only duplicate items if toggle is active
      if (filterOnlyDuplicates && !isUnitDuplicate(unit)) {
        return false;
      }

      const baseProd = findBaseProduct(unit, products);

      // 1. Brand filter
      if (selectedBrand !== 'Todas') {
        const targetBrand = selectedBrand.trim().toLowerCase();
        const unitBrand = (baseProd?.brand || '').trim().toLowerCase();
        if (unitBrand !== targetBrand) {
          return false;
        }
      }

      // 2. Category filter (hierárquico: Categoria Geral ou Subcategoria)
      if (selectedCategory !== 'Todas') {
        const unitCategory = baseProd?.category;
        if (!checkCategoryFilterMatch(unitCategory, selectedCategory)) {
          return false;
        }
      }

      // 2.5 Platform filter
      if (selectedPlatform !== 'Todas') {
        const targetPlatform = selectedPlatform.trim().toLowerCase();
        const unitPlatform = (unit.platform || '').trim().toLowerCase();
        if (targetPlatform === 'sem plataforma') {
          if (unitPlatform !== '' && unitPlatform !== 'sem plataforma' && unitPlatform !== 'não informada') {
            return false;
          }
        } else if (unitPlatform !== targetPlatform) {
          return false;
        }
      }

      // 3. Voltage filter
      if (selectedVoltage !== 'Todas') {
        const targetVoltage = selectedVoltage.trim().toLowerCase();
        const unitVoltage = (unit.baseProductVoltage || baseProd?.voltage || '').trim().toLowerCase();
        if (unitVoltage !== targetVoltage) {
          return false;
        }
      }

      // 3.5 Filter by registration date (dia em que o produto foi registrado)
      if (selectedDate) {
        if (!unit.createdAt) {
          return false;
        }
        try {
          const uDate = new Date(unit.createdAt);
          const y = uDate.getFullYear();
          const m = String(uDate.getMonth() + 1).padStart(2, '0');
          const d = String(uDate.getDate()).padStart(2, '0');
          const localDateStr = `${y}-${m}-${d}`;
          const rawIsoDateStr = unit.createdAt.slice(0, 10);
          if (localDateStr !== selectedDate && rawIsoDateStr !== selectedDate) {
            return false;
          }
        } catch {
          return false;
        }
      }

      // 4. Search filter (supports SKU, Name, STI, Serial, Platform, Notes, Reason, etc.)
      const term = searchTerm.toLowerCase().trim();
      const brandName = (baseProd?.brand || '').toLowerCase();
      const categoryName = (baseProd?.category || '').toLowerCase();
      const baseProdName = (baseProd?.name || '').toLowerCase();
      const baseProdSku = (baseProd?.sku || '').toLowerCase();

      const matchesSearch = !term ||
        (unit.baseProductName || '').toLowerCase().includes(term) ||
        (unit.baseProductSku || '').toLowerCase().includes(term) ||
        baseProdName.includes(term) ||
        baseProdSku.includes(term) ||
        brandName.includes(term) ||
        categoryName.includes(term) ||
        (unit.trackingCode || '').toLowerCase().includes(term) ||
        (unit.orderNumber || '').toLowerCase().includes(term) ||
        (unit.serialNumber || '').toLowerCase().includes(term) ||
        (unit.platform || '').toLowerCase().includes(term) ||
        (unit.customerReason || '').toLowerCase().includes(term) ||
        (unit.destinationSector || '').toLowerCase().includes(term) ||
        (unit.notes || '').toLowerCase().includes(term) ||
        (unit.id || '').toLowerCase().includes(term);

      // 5. Tab sector filter
      if (activeTab === 'Todos') {
        return matchesSearch && unit.status === 'Estoque';
      } else if (activeTab === 'Baixado') {
        return matchesSearch && unit.status === 'Baixado';
      } else {
        const matchesSector = unit.destinationSector === activeTab;
        return unit.status === 'Estoque' && matchesSearch && matchesSector;
      }
    });

    // Ordenação: Do mais recente ao mais antigo (descending)
    // Na aba 'Baixado', prioriza a data de saída física (checkoutDate || updatedAt || createdAt)
    // Nas demais abas, prioriza a data de registro de entrada (createdAt)
    return list.sort((a, b) => {
      if (activeTab === 'Baixado') {
        const dateBStr = b.checkoutDate || b.updatedAt || b.createdAt || '';
        const dateAStr = a.checkoutDate || a.updatedAt || a.createdAt || '';
        const timeB = dateBStr ? new Date(dateBStr).getTime() : 0;
        const timeA = dateAStr ? new Date(dateAStr).getTime() : 0;
        if (timeB !== timeA) return timeB - timeA;
      }
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      return timeB - timeA;
    });
  }, [units, filterOnlyDuplicates, selectedBrand, selectedCategory, selectedPlatform, selectedVoltage, selectedDate, searchTerm, activeTab, products]);

  // Reset pagination limit when search term, filters, sector tab, date, or duplicate filter changes
  useEffect(() => {
    setVisibleCount(20);
  }, [searchTerm, selectedBrand, selectedCategory, selectedVoltage, selectedDate, activeTab, filterOnlyDuplicates]);

  // Slice filtered units according to current pagination limit (20 items per page)
  const displayedUnits = filteredUnits.slice(0, visibleCount);
  const hasMore = visibleCount < filteredUnits.length;

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
        } catch (err: any) {
          console.error(err);
          setActionError(err?.message || 'Erro ao executar baixa em lote.');
          setTimeout(() => setActionError(null), 3000);
        }
      }
    });
  };

  // Batch delete execution
  const handleBatchDelete = () => {
    if (selectedUnitIds.length === 0) return;
    setConfirmConfig({
      title: 'Excluir Itens em Lote',
      message: `Tem certeza absoluta de que deseja EXCLUIR PERMANENTEMENTE os ${selectedUnitIds.length} item(ns) selecionado(s) do estoque? Esta ação não pode ser desfeita.`,
      type: 'danger',
      onConfirm: async () => {
        try {
          const idsToDelete = [...selectedUnitIds];
          for (const id of idsToDelete) {
            await onDeleteUnit(id);
          }
          setActionSuccess(`${idsToDelete.length} item(ns) excluído(s) com sucesso do estoque!`);
          setTimeout(() => setActionSuccess(null), 3500);
          setSelectedUnitIds([]);
        } catch (err: any) {
          console.error(err);
          setActionError(err?.message || 'Erro ao executar exclusão em lote.');
          setTimeout(() => setActionError(null), 3500);
        }
      }
    });
  };

  // Export Physical Stock units to Excel (.xlsx) matching exactly the import format
  const handleExportExcel = (unitsToExport?: TriageUnit[]) => {
    const list = unitsToExport || filteredUnits;
    if (list.length === 0) {
      setActionError('Nenhuma unidade física localizada para exportar.');
      setTimeout(() => setActionError(null), 3500);
      return;
    }

    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const isSelectedBatch = Boolean(unitsToExport && unitsToExport.length < filteredUnits.length);
      const fileName = `Inventario_Estoque_${isSelectedBatch ? 'Selecionados_' : activeTab !== 'Todos' ? activeTab + '_' : ''}${todayStr}.xlsx`;
      const sheetName = (activeTab === 'Todos' ? 'Inventario_Estoque' : `Estoque_${activeTab}`).substring(0, 31);

      exportStockInventoryToExcel(list, fileName, sheetName);

      setActionSuccess(`${list.length} produto(s) exportado(s) com sucesso para a planilha ${fileName}!`);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      console.error('Erro ao exportar planilha:', err);
      setActionError(`Erro ao gerar planilha Excel: ${err?.message || err}`);
      setTimeout(() => setActionError(null), 4000);
    }
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

  // Action: Reverter Baixa (with custom confirmation)
  const handleRevertCheckout = (id: string) => {
    setConfirmConfig({
      title: 'Reverter Baixa de Estoque',
      message: 'Deseja reverter a baixa deste produto e retornar a unidade para o estoque ativo?',
      type: 'warning',
      onConfirm: async () => {
        try {
          if (onRevertCheckoutUnit) {
            await onRevertCheckoutUnit(id);
          }
          setActionSuccess('Baixa revertida com sucesso! O produto retornou ao estoque ativo.');
          setTimeout(() => setActionSuccess(null), 3000);
          handleCloseDetails();
        } catch (err) {
          console.error(err);
          setActionError('Erro ao reverter baixa.');
          setTimeout(() => setActionError(null), 3000);
        }
      }
    });
  };

  // Action: Move Sector (with custom confirmation and photo strategy options for Principal)
  const handleMoveSector = (unit: TriageUnit, newSector: DestinationSectorType) => {
    if (unit.destinationSector === newSector) return;

    const baseProd = findBaseProduct(unit, products);
    const baseImgs = getBaseProductImages(baseProd);
    const savedPhotosCount = (unit.photosProduct?.length || 0) + (unit.photosBox?.length || 0) + (unit.photosAccessories?.length || 0);

    // If transferring to Estoque Principal, and the unit already has saved photos AND base product images exist:
    if (newSector === 'Principal' && savedPhotosCount > 0 && !!baseImgs.main) {
      setTransferModalData({
        unit,
        targetSector: newSector,
        baseProduct: baseProd,
        savedPhotosCount
      });
      return;
    }

    setConfirmConfig({
      title: 'Mover Setor de Estoque',
      message: `Deseja alterar o setor de destino desta unidade para "${newSector}"?${newSector === 'Principal' && baseImgs.main ? ' (As imagens oficiais do produto base serão vinculadas automaticamente).' : ''}`,
      type: 'info',
      onConfirm: async () => {
        let finalPhotosProduct = unit.photosProduct || [];
        let finalPhotosBox = unit.photosBox || [];
        let finalPhotosAccessories = unit.photosAccessories || [];

        // If moving to Principal with no previous photos, auto-reference base product images
        if (newSector === 'Principal' && savedPhotosCount === 0 && baseImgs.productPhotos.length > 0) {
          finalPhotosProduct = baseImgs.productPhotos;
        }

        const transferMoment = new Date().toISOString();
        const previousInitialDate = unit.initialEntryDate || unit.createdAt;
        const updated: TriageUnit = {
          ...unit,
          destinationSector: newSector,
          originSector: unit.destinationSector,
          initialEntryDate: previousInitialDate,
          transferredAt: transferMoment,
          photosProduct: finalPhotosProduct,
          photosBox: finalPhotosBox,
          photosAccessories: finalPhotosAccessories,
          createdAt: transferMoment, // Recontabiliza no registro no exato momento da transferência
          updatedAt: transferMoment,
          excludeFromDailyCount: false // Garante que será contabilizado no registro diário
        };
        try {
          await onUpdateUnit(updated);
          setEditingSector('');
          setActionSuccess(`Setor atualizado para ${newSector} com sucesso e recontabilizado no registro de hoje!`);
          setTimeout(() => setActionSuccess(null), 3500);
        } catch (err) {
          console.error(err);
          setActionError('Erro ao mover setor.');
          setTimeout(() => setActionError(null), 3000);
        }
      }
    });
  };

  // Action: Execute sector transfer with selected photo strategy (Keep Saved / Use Base / Combine Both)
  const handleConfirmTransferWithPhotoChoice = async (
    choice: 'keep_saved' | 'use_base' | 'combine'
  ) => {
    if (!transferModalData) return;
    const { unit, targetSector, baseProduct } = transferModalData;
    const baseImgs = getBaseProductImages(baseProduct);

    let newPhotosProduct = [...(unit.photosProduct || [])];
    let newPhotosBox = [...(unit.photosBox || [])];
    let newPhotosAccessories = [...(unit.photosAccessories || [])];

    if (choice === 'use_base') {
      newPhotosProduct = baseImgs.productPhotos.length > 0 ? baseImgs.productPhotos : (baseImgs.main ? [baseImgs.main] : []);
      newPhotosBox = baseImgs.boxPhotos;
      newPhotosAccessories = baseImgs.accessoriesPhotos;
    } else if (choice === 'combine') {
      const baseProdList = baseImgs.productPhotos.length > 0 ? baseImgs.productPhotos : (baseImgs.main ? [baseImgs.main] : []);
      for (const img of baseProdList) {
        if (!newPhotosProduct.includes(img)) {
          newPhotosProduct.push(img);
        }
      }
      for (const img of baseImgs.boxPhotos) {
        if (!newPhotosBox.includes(img)) {
          newPhotosBox.push(img);
        }
      }
      for (const img of baseImgs.accessoriesPhotos) {
        if (!newPhotosAccessories.includes(img)) {
          newPhotosAccessories.push(img);
        }
      }
    }
    // If 'keep_saved', keeps the existing photosProduct, photosBox, photosAccessories as they were

    const transferMoment = new Date().toISOString();
    const previousInitialDate = unit.initialEntryDate || unit.createdAt;
    const updated: TriageUnit = {
      ...unit,
      destinationSector: targetSector,
      originSector: unit.destinationSector,
      initialEntryDate: previousInitialDate,
      transferredAt: transferMoment,
      photosProduct: newPhotosProduct,
      photosBox: newPhotosBox,
      photosAccessories: newPhotosAccessories,
      createdAt: transferMoment, // Recontabiliza no registro no exato momento da transferência
      updatedAt: transferMoment,
      excludeFromDailyCount: false // Garante que será contabilizado no registro diário
    };

    try {
      await onUpdateUnit(updated);
      setTransferModalData(null);
      setEditingSector('');
      const strategyName = choice === 'keep_saved' ? 'Fotos salvas mantidas' : choice === 'use_base' ? 'Imagens da base aplicadas' : 'Fotos combinadas';
      setActionSuccess(`Transferido para ${targetSector} com sucesso e recontabilizado no registro de hoje! (${strategyName})`);
      setTimeout(() => setActionSuccess(null), 3500);
    } catch (err: any) {
      console.error('Error updating sector:', err);
      setActionError(`Erro ao transferir: ${err?.message || err}`);
      setTimeout(() => setActionError(null), 3500);
    }
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
          setSelectedUnitIds(prev => prev.filter(uId => uId !== id));
          setActionSuccess('Ficha de triagem excluída com sucesso.');
          setTimeout(() => setActionSuccess(null), 3000);
          handleCloseDetails();
        } catch (err: any) {
          console.error(err);
          setActionError(err?.message || 'Erro ao excluir registro.');
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
      case 'Mercado Livre': return 'bg-yellow-500/10 text-amber-800 dark:text-yellow-400 border border-yellow-500/30 font-medium';
      case 'Shopee': return 'bg-orange-500/10 text-orange-800 dark:text-orange-400 border border-orange-500/30 font-medium';
      case 'Amazon': return 'bg-blue-500/10 text-sky-800 dark:text-blue-400 border border-blue-500/30 font-medium';
      case 'Amazon Ta Novo': return 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-400 border border-emerald-500/30 font-medium';
      case 'Kabum': return 'bg-indigo-500/10 text-indigo-800 dark:text-indigo-400 border border-indigo-500/30 font-medium';
      default: return 'bg-zinc-500/10 text-zinc-800 dark:text-zinc-400 border border-zinc-500/20 font-medium';
    }
  };

  const handleImportBatchUnits = async (importedUnits: TriageUnit[]) => {
    try {
      // Safety filter: ensure no unit with duplicate STI or Serial is re-added
      const nonDuplicateUnits = importedUnits.filter(unit => {
        const normSti = (unit.trackingCode || '').trim().toUpperCase();
        const normSerial = (unit.serialNumber || '').trim().toUpperCase();

        const stiExists = normSti !== '' && units.some(u => (u.trackingCode || '').trim().toUpperCase() === normSti);
        const serialExists = normSerial !== '' && units.some(u => (u.serialNumber || '').trim().toUpperCase() === normSerial);

        return !stiExists && !serialExists;
      });

      for (const unit of nonDuplicateUnits) {
        if (onSaveTriage) {
          await onSaveTriage(unit);
        } else {
          await onUpdateUnit(unit);
        }
      }
      setActionSuccess(`${nonDuplicateUnits.length} novos produtos adicionados ao estoque físico com sucesso!`);
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
        <div 
          className="fixed top-20 right-6 z-[60] px-5 py-3.5 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-4 duration-300 app-toast-success bg-slate-900 border border-emerald-500/50 text-emerald-300"
          id="stock-toast-success"
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
          id="stock-toast-error"
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

        <div className="flex items-center gap-2.5 flex-wrap">
          {enableSpreadsheetExport && (
            <button
              onClick={() => handleExportExcel()}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 hover:text-white text-slate-200 font-bold rounded-xl text-xs transition-all border border-slate-700 hover:border-slate-600 flex items-center gap-2 cursor-pointer shrink-0 shadow-sm"
              id="btn-export-stock-excel"
              title="Exportar produtos do estoque físico atual para planilha Excel (.xlsx)"
            >
              <Download className="w-4 h-4 text-sky-400" />
              <span>Exportar Planilha Excel ({filteredUnits.length})</span>
            </button>
          )}

          {enableSpreadsheetImport && (
            <button
              onClick={() => setIsExcelModalOpen(true)}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-2 cursor-pointer shrink-0"
              id="btn-open-excel-import"
              title="Importar planilha Excel de inventário OpenBox e direcionar por categorias"
            >
              <FileSpreadsheet className="w-4.5 h-4.5 text-white" />
              <span>Importar Tabela Excel (OpenBox)</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Stock layout Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden" id="stock-main-card">
        {/* Navigation Tabs bar */}
        <div className="flex flex-wrap border-b border-slate-800 bg-slate-950 p-2 gap-1" id="stock-tabs">
          <button 
            onClick={() => setActiveTab('Todos')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'Todos' ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/15' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
          >
            Todos Ativos ({units.filter(u => u.status === 'Estoque').length})
          </button>
          <button 
            onClick={() => setActiveTab('Principal')}
            id="stock-tab-principal"
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${activeTab === 'Principal' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/15' : 'text-slate-455 hover:text-emerald-400 hover:bg-slate-850'}`}
          >
            <span className="w-2 h-2 bg-emerald-400 rounded-full"></span>
            Estoque Principal ({units.filter(u => u.status === 'Estoque' && u.destinationSector === 'Principal').length})
          </button>
          <button 
            onClick={() => setActiveTab('Openbox')}
            id="stock-tab-openbox"
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${activeTab === 'Openbox' ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/15' : 'text-slate-455 hover:text-amber-400 hover:bg-slate-850'}`}
          >
            <span className="w-2 h-2 bg-amber-400 rounded-full"></span>
            Openbox ({units.filter(u => u.status === 'Estoque' && u.destinationSector === 'Openbox').length})
          </button>
          <button 
            onClick={() => setActiveTab('RMA')}
            id="stock-tab-rma"
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${activeTab === 'RMA' ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/15' : 'text-slate-455 hover:text-rose-400 hover:bg-slate-850'}`}
          >
            <span className="w-2 h-2 bg-rose-400 rounded-full"></span>
            RMA ({units.filter(u => u.status === 'Estoque' && u.destinationSector === 'RMA').length})
          </button>
          <div className="h-6 w-[1px] bg-slate-800 self-center mx-1"></div>
          <button 
            onClick={() => setActiveTab('Baixado')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'Baixado' 
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20' 
                : 'text-slate-455 hover:text-purple-400 hover:bg-slate-850'
            }`}
            id="tab-btn-baixados"
          >
            <span className={`w-2 h-2 rounded-full ${activeTab === 'Baixado' ? 'bg-purple-200' : 'bg-purple-400'}`}></span>
            <span>Histórico de Baixas ({units.filter(u => u.status === 'Baixado').length})</span>
          </button>
        </div>

        {/* Search and Filters Controls Bar */}
        <div className="p-5 border-b border-slate-800 bg-slate-900 space-y-4" id="stock-search-bar">
          {/* Top row: Search input and Action controls */}
          <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-4">
            <div className="flex flex-1 items-center gap-3 max-w-2xl">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                <input 
                  type="text"
                  placeholder="Pesquisar por SKU, Nome, Plataforma, STI, Serial ou Laudo..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-9 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
                  id="input-stock-search"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-3 text-slate-400 hover:text-white transition-colors cursor-pointer"
                    title="Limpar pesquisa"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {filteredUnits.length > 0 && activeTab !== 'Baixado' && (
                <button
                  type="button"
                  onClick={handleToggleSelectAll}
                  className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer select-none shrink-0 ${
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
                      ? `Todos (${selectedUnitIds.length})`
                      : selectedUnitIds.length > 0
                      ? `(${selectedUnitIds.length}/${filteredUnits.length})`
                      : `Selecionar (${filteredUnits.length})`}
                  </span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2.5 justify-between xl:justify-end flex-wrap">
              {selectedUnitIds.length > 0 && (
                <>
                  {enableSpreadsheetExport && (
                    <button
                      type="button"
                      onClick={() => {
                        const selectedUnits = units.filter(u => selectedUnitIds.includes(u.id));
                        handleExportExcel(selectedUnits);
                      }}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-750 text-sky-300 hover:text-white font-bold rounded-xl text-xs transition-all border border-slate-700 hover:border-sky-500/50 flex items-center gap-1.5 cursor-pointer shadow-sm animate-in fade-in"
                      id="btn-export-selected"
                      title="Exportar apenas as unidades selecionadas para planilha Excel"
                    >
                      <Download className="w-3.5 h-3.5 text-sky-400" />
                      <span>Exportar ({selectedUnitIds.length})</span>
                    </button>
                  )}

                  <button
                    onClick={handleBatchCheckout}
                    className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition-all shadow-lg shadow-rose-600/20 flex items-center gap-2 cursor-pointer animate-in fade-in"
                    id="btn-batch-checkout"
                    title="Dar baixa do estoque para todas as unidades selecionadas"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Baixa em Lote ({selectedUnitIds.length})</span>
                  </button>

                  <button
                    onClick={handleBatchDelete}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-rose-950 text-rose-300 hover:text-rose-200 border border-rose-800/40 hover:border-rose-600 font-bold rounded-xl text-xs transition-all flex items-center gap-2 cursor-pointer animate-in fade-in"
                    id="btn-batch-delete"
                    title="Excluir permanentemente do estoque todas as unidades selecionadas"
                  >
                    <Trash2 className="w-4 h-4 text-rose-400" />
                    <span>Excluir ({selectedUnitIds.length})</span>
                  </button>
                </>
              )}

              {/* Filter Duplicates button */}
              <button 
                type="button"
                onClick={() => setFilterOnlyDuplicates(prev => !prev)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border ${
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
              <div className="view-switcher-container flex bg-slate-950 p-1 rounded-xl border border-slate-800 gap-0.5" id="stock-view-switcher">
                <button
                  onClick={() => handleSetViewMode('grid')}
                  className={`view-switcher-btn px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    viewMode === 'grid' 
                      ? 'view-switcher-active bg-sky-500 text-white shadow-sm' 
                      : 'view-switcher-inactive text-slate-400 hover:text-white hover:bg-slate-900'
                  }`}
                  title="Visualização em Grade"
                  id="btn-view-grid"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Grade</span>
                </button>
                <button
                  onClick={() => handleSetViewMode('list')}
                  className={`view-switcher-btn px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    viewMode === 'list' 
                      ? 'view-switcher-active bg-sky-500 text-white shadow-sm' 
                      : 'view-switcher-inactive text-slate-400 hover:text-white hover:bg-slate-900'
                  }`}
                  title="Visualização em Linhas"
                  id="btn-view-list"
                >
                  <List className="w-3.5 h-3.5" />
                  <span>Linhas</span>
                </button>
              </div>
            </div>
          </div>

          {/* Filter Controls Row: Marcas, Categoria, Plataforma, Voltagem, Data de Registro */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-3 border-t border-slate-800" id="stock-filter-controls">
            {/* 1. Filter by Marca (Brand) */}
            <div className="space-y-1">
              <div className="h-5 flex items-center">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Sliders className="w-3 h-3 text-purple-400" />
                  <span>Marca</span>
                </label>
              </div>
              <select
                value={selectedBrand}
                onChange={(e) => setSelectedBrand(e.target.value)}
                className={`w-full px-3 py-2 bg-slate-950 border rounded-xl text-xs font-semibold text-slate-200 focus:outline-none focus:border-sky-500 transition-colors truncate ${
                  selectedBrand !== 'Todas' ? 'border-purple-500/50 bg-purple-950/20 text-purple-300' : 'border-slate-800'
                }`}
                id="select-filter-stock-brand"
              >
                <option value="Todas">Todas as Marcas ({uniqueBrands.length})</option>
                {uniqueBrands.map(({ brand, count }) => (
                  <option key={brand} value={brand}>{brand} ({count})</option>
                ))}
              </select>
            </div>

            {/* 2. Filter by Categoria */}
            <div className="space-y-1">
              <div className="h-5 flex items-center">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3 h-3 text-emerald-400" />
                  <span>Categoria</span>
                </label>
              </div>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className={`w-full px-3 py-2 bg-slate-950 border rounded-xl text-xs font-semibold text-slate-200 focus:outline-none focus:border-sky-500 transition-colors truncate ${
                  selectedCategory !== 'Todas' ? 'border-emerald-500/50 bg-emerald-950/20 text-emerald-300' : 'border-slate-800'
                }`}
                id="select-filter-stock-category"
              >
                <option value="Todas">Todas as Categorias</option>
                {groupedFilterCategories.map(group => (
                  <optgroup key={group.general.id} label={`📂 ${group.general.name}`}>
                    {group.options.map(opt => (
                      <option 
                        key={opt.value} 
                        value={opt.value}
                        className={opt.isGeneralHeader ? 'font-bold text-emerald-400 bg-slate-900' : 'pl-4'}
                      >
                        {opt.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* 2.5 Filter by Plataforma */}
            <div className="space-y-1">
              <div className="h-5 flex items-center">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <ShoppingCart className={`w-3 h-3 ${selectedPlatform !== 'Todas' ? getPlatformFilterStyle(selectedPlatform).dotClasses.replace('bg-', 'text-') : 'text-sky-400'}`} />
                  <span>Plataforma</span>
                </label>
              </div>
              <select
                value={selectedPlatform}
                onChange={(e) => setSelectedPlatform(e.target.value)}
                className={`w-full px-3 py-2 bg-slate-950 border rounded-xl text-xs font-semibold focus:outline-none transition-colors truncate ${
                  selectedPlatform !== 'Todas' ? getPlatformFilterStyle(selectedPlatform).selectClasses : 'border-slate-800 text-slate-200'
                }`}
                id="select-filter-stock-platform"
              >
                <option value="Todas">Todas as Plataformas</option>
                <option value="Mercado Livre">Mercado Livre</option>
                <option value="Shopee">Shopee</option>
                <option value="Amazon">Amazon</option>
                <option value="Amazon Ta Novo">Amazon Ta Novo</option>
                <option value="Kabum">Kabum</option>
                <option value="Sem Plataforma">Sem Plataforma / Não Informada</option>
              </select>
            </div>

            {/* 3. Filter by Voltagem */}
            <div className="space-y-1">
              <div className="h-5 flex items-center">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Zap className="w-3 h-3 text-amber-400" />
                  <span>Tensão / Voltagem</span>
                </label>
              </div>
              <select
                value={selectedVoltage}
                onChange={(e) => setSelectedVoltage(e.target.value)}
                className={`w-full px-3 py-2 bg-slate-950 border rounded-xl text-xs font-semibold text-slate-200 focus:outline-none focus:border-sky-500 transition-colors truncate ${
                  selectedVoltage !== 'Todas' ? 'border-amber-500/50 bg-amber-950/20 text-amber-300' : 'border-slate-800'
                }`}
                id="select-filter-stock-voltage"
              >
                <option value="Todas">Todas as Voltagens</option>
                <option value="110V">110V</option>
                <option value="220V">220V</option>
                <option value="Bivolt">Bivolt</option>
                <option value="N/A">N/A (Pilhas / USB / Bateria)</option>
              </select>
            </div>

            {/* 4. Filter by Data de Registro */}
            <div className="space-y-1">
              <div className="h-5 flex items-center justify-between">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-3 h-3 text-sky-400" />
                  <span>Data de Registro</span>
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setSelectedDate(getTodayIsoDate())}
                    className={`text-[9px] px-1.5 py-0.5 rounded font-bold cursor-pointer transition-colors ${
                      selectedDate === getTodayIsoDate()
                        ? 'bg-sky-500 text-white'
                        : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                    }`}
                    title="Filtrar produtos registrados hoje"
                  >
                    Hoje
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedDate(getYesterdayIsoDate())}
                    className={`text-[9px] px-1.5 py-0.5 rounded font-bold cursor-pointer transition-colors ${
                      selectedDate === getYesterdayIsoDate()
                        ? 'bg-sky-500 text-white'
                        : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                    }`}
                    title="Filtrar produtos registrados ontem"
                  >
                    Ontem
                  </button>
                  {selectedDate && (
                    <button
                      type="button"
                      onClick={() => setSelectedDate('')}
                      className="text-[9px] px-1.5 py-0.5 rounded font-bold text-rose-400 hover:bg-rose-500/20 cursor-pointer transition-colors"
                      title="Limpar filtro de data"
                    >
                      Limpar
                    </button>
                  )}
                </div>
              </div>
              <div 
                className="relative cursor-pointer"
                onClick={() => {
                  const input = dateInputRef.current;
                  if (input) {
                    if (typeof input.showPicker === 'function') {
                      try {
                        input.showPicker();
                      } catch {
                        input.focus();
                      }
                    } else {
                      input.focus();
                    }
                  }
                }}
              >
                <input
                  ref={dateInputRef}
                  type="date"
                  value={selectedDate}
                  onClick={(e) => {
                    const target = e.currentTarget;
                    if (typeof target.showPicker === 'function') {
                      try {
                        target.showPicker();
                      } catch {
                        // fallback to standard browser behavior
                      }
                    }
                  }}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className={`w-full px-3 py-2 bg-slate-950 border rounded-xl text-xs font-semibold text-slate-200 focus:outline-none focus:border-sky-500 transition-colors cursor-pointer [color-scheme:dark] ${
                    selectedDate ? 'border-sky-500/50 bg-sky-950/20 text-sky-300' : 'border-slate-800'
                  }`}
                  id="input-filter-stock-date"
                />
              </div>
            </div>
          </div>

          {/* Active Filter Badges & Results Counter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800 text-xs text-slate-400" id="stock-filter-summary">
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span>
                Exibindo <strong className="text-sky-400">{displayedUnits.length}</strong> de <strong className="text-white">{filteredUnits.length}</strong> {filteredUnits.length === 1 ? 'unidade' : 'unidades'}
                {activeTab !== 'Todos' && (
                  <span className="text-slate-500 ml-1">
                    no setor {activeTab}
                  </span>
                )}
              </span>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleClearAllFilters}
                  className="ml-2 inline-flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-750 text-sky-400 hover:text-sky-300 rounded-lg text-[11px] font-bold border border-slate-700 transition-colors cursor-pointer"
                  id="btn-clear-stock-filters"
                  title="Remover todos os filtros aplicados"
                >
                  <X className="w-3 h-3" />
                  <span>Limpar Filtros</span>
                </button>
              )}
            </div>

            {/* Active Filter Badges */}
            {hasActiveFilters && (
              <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                {selectedBrand !== 'Todas' && (
                  <span className="px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/30 text-purple-300 font-medium flex items-center gap-1">
                    <span>Marca: {selectedBrand}</span>
                    <button 
                      type="button" 
                      onClick={() => setSelectedBrand('Todas')} 
                      className="hover:text-white transition-colors cursor-pointer"
                      title="Remover filtro de Marca"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                )}
                {selectedCategory !== 'Todas' && (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-medium flex items-center gap-1">
                    <span>Cat: {selectedCategory}</span>
                    <button 
                      type="button" 
                      onClick={() => setSelectedCategory('Todas')} 
                      className="hover:text-white transition-colors cursor-pointer"
                      title="Remover filtro de Categoria"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                )}
                {activeTab !== 'Todas' && (() => {
                  const sStyle = getSectorFilterStyle(activeTab);
                  return (
                    <span 
                      data-sector={activeTab}
                      className={`px-2 py-0.5 rounded-md border font-medium flex items-center gap-1.5 shadow-xs filter-sector-badge ${sStyle.badgeClasses}`}
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 filter-badge-dot ${sStyle.dotClasses}`} />
                      <span>Estoque: <strong>{sStyle.label}</strong></span>
                      <button 
                        type="button" 
                        onClick={() => setActiveTab('Todas')} 
                        className={`transition-colors cursor-pointer p-0.5 rounded ${sStyle.hoverBtnClasses}`}
                        title="Ver todos os estoques"
                      >
                        <X className="w-2.5 h-2.5 stroke-[2.5]" />
                      </button>
                    </span>
                  );
                })()}
                {selectedPlatform !== 'Todas' && (() => {
                  const pStyle = getPlatformFilterStyle(selectedPlatform);
                  return (
                    <span 
                      data-platform={selectedPlatform}
                      className={`px-2 py-0.5 rounded-md border font-medium flex items-center gap-1.5 shadow-xs filter-platform-badge ${pStyle.badgeClasses}`}
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 filter-badge-dot ${pStyle.dotClasses}`} />
                      <span>Plat: <strong>{selectedPlatform}</strong></span>
                      <button 
                        type="button" 
                        onClick={() => setSelectedPlatform('Todas')} 
                        className={`transition-colors cursor-pointer p-0.5 rounded ${pStyle.hoverBtnClasses}`}
                        title="Remover filtro de Plataforma"
                      >
                        <X className="w-2.5 h-2.5 stroke-[2.5]" />
                      </button>
                    </span>
                  );
                })()}
                {selectedVoltage !== 'Todas' && (
                  <span className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 font-medium flex items-center gap-1">
                    <span>Voltagem: {selectedVoltage}</span>
                    <button 
                      type="button" 
                      onClick={() => setSelectedVoltage('Todas')} 
                      className="hover:text-white transition-colors cursor-pointer"
                      title="Remover filtro de Voltagem"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                )}
                {selectedDate && (
                  <span className="px-2 py-0.5 rounded-md bg-sky-500/10 border border-sky-500/30 text-sky-300 font-medium flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-sky-400" />
                    <span>Data: {new Date(`${selectedDate}T12:00:00`).toLocaleDateString('pt-BR')}</span>
                    <button 
                      type="button" 
                      onClick={() => setSelectedDate('')} 
                      className="hover:text-white transition-colors cursor-pointer"
                      title="Remover filtro de Data"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                )}
                {searchTerm && (
                  <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300 flex items-center gap-1">
                    <span>Busca: "{searchTerm}"</span>
                    <button 
                      type="button" 
                      onClick={() => setSearchTerm('')} 
                      className="hover:text-white transition-colors cursor-pointer"
                      title="Limpar texto de busca"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Duplicate Warning Banner */}
        {duplicateUnitsCount > 0 && (
          <div 
            className={`px-5 py-3 border-b flex flex-wrap items-center justify-between gap-3 text-xs font-medium transition-colors ${
              filterOnlyDuplicates 
                ? 'bg-amber-950/60 border-amber-500/50 text-amber-200' 
                : 'bg-amber-950/30 border-amber-500/30 text-amber-300'
            }`} 
            id="stock-duplicate-banner"
            data-active={filterOnlyDuplicates ? 'true' : 'false'}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>{duplicateUnitsCount}</strong> {duplicateUnitsCount === 1 ? 'produto possui' : 'produtos possuem'} <strong>Código STI</strong> ou <strong>Número de Série</strong> repetidos no estoque físico.
              </span>
            </div>
            <button
              type="button"
              id="btn-filter-duplicates-banner"
              data-active={filterOnlyDuplicates ? 'true' : 'false'}
              onClick={() => setFilterOnlyDuplicates(prev => !prev)}
              className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Filter className="w-3 h-3" />
              <span>{filterOnlyDuplicates ? 'Mostrar Todos os Produtos' : 'Filtrar Apenas Duplicados'}</span>
            </button>
          </div>
        )}

        {/* Baixado History Context Banner */}
        {activeTab === 'Baixado' && (
          <div 
            className={`px-5 py-3 border-b flex flex-wrap items-center justify-between gap-3 text-xs font-medium transition-colors ${
              isLight
                ? 'bg-purple-50 border-purple-200 text-purple-900'
                : 'bg-purple-950/40 border-purple-500/40 text-purple-100'
            }`}
            id="stock-baixado-history-banner"
          >
            <div className="flex items-center gap-2.5">
              <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                isLight 
                  ? 'bg-purple-100 border border-purple-300 text-purple-700' 
                  : 'bg-purple-500/20 border border-purple-400/50 text-purple-200'
              }`}>
                <CheckCircle2 className="w-4 h-4" />
              </span>
              <div>
                <span className={`font-bold ${isLight ? 'text-purple-950' : 'text-white'}`}>
                  Histórico de Baixas (Saídas Físicas do Galpão)
                </span>
                <span className={`ml-1.5 hidden sm:inline ${isLight ? 'text-purple-800' : 'text-purple-200'}`}>
                  — Unidades ordenadas por data de saída da mais recente para a mais antiga.
                </span>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full text-[11px] font-extrabold bg-purple-600 text-white shadow-xs">
              {filteredUnits.length} {filteredUnits.length === 1 ? 'saída registrada' : 'saídas registradas'}
            </span>
          </div>
        )}

        {/* Units list Grid or List */}
        {filteredUnits.length === 0 ? (
          <div className="p-12 text-center bg-slate-950 flex flex-col items-center justify-center" id="stock-empty">
            <Package className="w-12 h-12 text-slate-600 mb-3" />
            <p className="text-slate-300 font-semibold text-sm">Nenhuma unidade física localizada.</p>
            <p className="text-slate-500 text-xs mt-1">Insira novas devoluções ou refine os termos de busca.</p>
          </div>
        ) : (
          <>
            {viewMode === 'grid' ? (
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 bg-slate-950" id="stock-grid">
                {displayedUnits.map((unit) => {
              const pStyle = getPlatformStyle(unit.platform);
              const sectorClass = getSectorBadgeClass(unit.destinationSector);
              
              // Resolve photos (automatic fallback to base product if Principal/Novo or empty)
              const resolved = getUnitResolvedPhotos(unit, products);
              const photosCount = resolved.totalPhotosCount;
              const mainPhoto = resolved.mainPhoto;

              const hasDupSti = isDuplicateSti(unit);
              const hasDupSerial = isDuplicateSerial(unit);

              return (
                <div 
                  key={unit.id}
                  className={`group bg-slate-900 border hover:border-slate-700/80 rounded-xl p-4 flex flex-col justify-between hover:shadow-xl transition-all ${
                    unit.status === 'Baixado'
                      ? 'border-purple-500/30'
                      : (hasDupSti || hasDupSerial ? 'border-amber-500/50 shadow-md shadow-amber-500/5' : 'border-slate-800')
                  }`}
                  id={`stock-unit-${unit.id}`}
                >
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {unit.status !== 'Baixado' ? (
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
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-rose-600 text-white shadow-xs flex items-center gap-1 shrink-0">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Baixado</span>
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => handleCopyCode(unit.baseProductSku, `sku-${unit.id}`, e)}
                          className={`font-mono text-xs font-bold px-2 py-0.5 rounded transition-all cursor-pointer flex items-center gap-1 group/copy ${
                            copiedCodeKey === `sku-${unit.id}`
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 scale-105'
                              : 'text-sky-400 bg-sky-500/10 hover:bg-sky-500/20 hover:text-sky-300 border border-transparent'
                          }`}
                          title="Clique para copiar o SKU"
                        >
                          {copiedCodeKey === `sku-${unit.id}` ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span>Copiado!</span>
                            </>
                          ) : (
                            <>
                              <span>{unit.baseProductSku}</span>
                              <Copy className="w-2.5 h-2.5 opacity-0 group-hover/copy:opacity-100 transition-opacity" />
                            </>
                          )}
                        </button>
                        {unit.serialNumber && (
                          <button
                            type="button"
                            onClick={(e) => handleCopyCode(unit.serialNumber!, `serial-${unit.id}`, e)}
                            className={`font-mono text-xs px-2 py-0.5 rounded border transition-all cursor-pointer flex items-center gap-1 group/copy ${
                              copiedCodeKey === `serial-${unit.id}`
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 scale-105 font-bold'
                                : hasDupSerial 
                                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-bold hover:bg-rose-500/30' 
                                  : 'text-slate-300 bg-slate-950 border-slate-800 hover:border-slate-700 hover:text-white'
                            }`}
                            title={hasDupSerial ? "Número de Série Duplicado! Clique para copiar" : "Clique para copiar o Número de Série"}
                          >
                            {copiedCodeKey === `serial-${unit.id}` ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span>Copiado!</span>
                              </>
                            ) : (
                              <>
                                <span>S/N: {unit.serialNumber}</span>
                                <Copy className="w-2.5 h-2.5 opacity-0 group-hover/copy:opacity-100 transition-opacity" />
                              </>
                            )}
                          </button>
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
                        {unit.pendingRegistrationNumber && (
                          <span 
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-sky-400 bg-sky-500/10 border border-sky-500/20 hover:bg-sky-500/20 transition-colors cursor-help" 
                            title={`Vinculado à Pendência: ${unit.pendingRegistrationNumber}`}
                          >
                            <Link2 className="w-2.5 h-2.5 text-sky-400" />
                            <span>Vinculado</span>
                          </span>
                        )}
                      </div>
                      {unit.trackingCode && unit.trackingCode.trim() !== '' && (
                        <button
                          type="button"
                          onClick={(e) => handleCopyCode(normalizeStiCode(unit.trackingCode), `sti-${unit.id}`, e)}
                          className={`font-mono text-xs font-bold px-2 py-0.5 rounded shrink-0 transition-all cursor-pointer flex items-center gap-1 group/copy ${
                            copiedCodeKey === `sti-${unit.id}`
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 scale-105'
                              : hasDupSti
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                                : 'text-slate-300 hover:text-white bg-slate-950/80 hover:bg-slate-800 border border-slate-800'
                          }`}
                          title="Clique para copiar o Código STI"
                        >
                          {copiedCodeKey === `sti-${unit.id}` ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span>Copiado!</span>
                            </>
                          ) : (
                            <>
                              <span>{formatStiBadge(unit.trackingCode)}</span>
                              <Copy className="w-2.5 h-2.5 opacity-0 group-hover/copy:opacity-100 transition-opacity" />
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    {/* Image / Thumbnail - click here opens unit details */}
                    <div 
                      onClick={() => setSelectedUnitId(unit.id)}
                      className={`w-full h-36 rounded-lg photo-container-clean !bg-white border ${
                        isLight 
                          ? 'border-slate-200 shadow-sm' 
                          : 'border-slate-800'
                      } hover:border-sky-500/60 overflow-hidden flex items-center justify-center relative p-2 cursor-pointer transition-all group/thumb hover:shadow-sky-500/10`}
                      style={{ backgroundColor: '#ffffff' }}
                      title="Clique na foto ou ícone para ver os detalhes do produto"
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          setSelectedUnitId(unit.id);
                        }
                      }}
                    >
                      {mainPhoto ? (
                        <img src={mainPhoto} alt={unit.baseProductName} className="w-full h-full object-contain group-hover/thumb:scale-105 transition-transform duration-300" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-1.5 text-slate-400 group-hover/thumb:text-sky-500 transition-colors">
                          <Package className="w-9 h-9" />
                          <span className="text-[10px] font-semibold text-slate-500 group-hover/thumb:text-sky-500">Ver detalhes</span>
                        </div>
                      )}
                      {unit.status === 'Baixado' && (
                        <div className="absolute inset-0 bg-slate-950/85 dark:bg-black/85 flex flex-col items-center justify-center gap-1.5 p-2 transition-opacity">
                          <span className="px-2.5 py-1 rounded-full bg-rose-600 text-white font-black text-[11px] uppercase tracking-wider shadow-lg flex items-center gap-1.5 border border-rose-300/40">
                            <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
                            <span>Saída Efetuada</span>
                          </span>
                          {getDischargeDate(unit) && (
                            <span className="text-[10px] font-mono font-bold text-white bg-slate-900/90 dark:bg-black/90 px-2 py-0.5 rounded shadow-sm border border-white/20">
                              Saída: {formatDischargeDateTime(getDischargeDate(unit))}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Metadata details */}
                    <div className="space-y-1.5 pt-0.5">
                      <h4 className="font-bold text-white text-sm line-clamp-1 group-hover:text-sky-400 transition-colors">
                        {unit.baseProductName}
                      </h4>
                      <p className="text-xs text-slate-400 line-clamp-1">
                        <span className="font-medium text-slate-400">Motivo:</span> {unit.customerReason}
                      </p>

                      {/* Laudo do Produto para itens do estoque Openbox */}
                      {(activeTab === 'Openbox' || unit.destinationSector === 'Openbox') && (
                        <div className="mt-1.5 mb-2">
                          <p className="text-xs text-slate-300 line-clamp-4 leading-relaxed" title={stripHtml(unit.notes) || undefined}>
                            <span className="text-amber-400 font-bold">Laudo:</span>{' '}
                            {stripHtml(unit.notes) || <span className="text-slate-500 italic">Sem laudo informado</span>}
                          </p>
                        </div>
                      )}

                      {/* Brand, Category, Voltage attributes */}
                      {(() => {
                        const baseProd = findBaseProduct(unit, products);
                        const bBrand = baseProd?.brand && baseProd.brand.trim() !== 'N/A' && baseProd.brand.trim() !== 'Não Informado' ? baseProd.brand.trim() : null;
                        const bCat = baseProd?.category && baseProd.category.trim() !== 'Todas' ? baseProd.category.trim() : null;
                        const bVolt = unit.baseProductVoltage || (baseProd?.voltage && baseProd.voltage !== 'N/A' ? baseProd.voltage : null);

                        if (!bBrand && !bCat && (!bVolt || bVolt === 'N/A')) return null;

                        return (
                          <div className="flex items-center gap-1.5 flex-wrap pt-1.5">
                            {bBrand && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/30 flex items-center gap-1" title={`Marca: ${bBrand}`}>
                                <Sliders className="w-2.5 h-2.5" />
                                <span>{bBrand}</span>
                              </span>
                            )}
                            {bCat && (
                              <CategoryBadge category={bCat} size="xs" />
                            )}
                            {bVolt && bVolt !== 'N/A' && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 flex items-center gap-1" title={`Tensão: ${bVolt}`}>
                                <Zap className="w-2.5 h-2.5" />
                                <span>{bVolt}</span>
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Bottom section: Entrada, Saída and Actions */}
                  <div className="mt-5 pt-3 border-t border-slate-800">
                    <div className="flex flex-col gap-1 mb-2.5 font-mono text-[10px]">
                      <p className="text-slate-400 font-medium flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                        <span className="text-slate-400">Entrada:</span>
                        <span className="text-slate-200 font-semibold">
                          {new Date(unit.createdAt).toLocaleDateString('pt-BR')} {new Date(unit.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </p>
                      {unit.originSector && (
                        <p className="text-slate-400 font-medium flex items-center gap-1.5 text-[9.5px]" title={`Item transferido do estoque ${unit.originSector}`}>
                          <ArrowRightLeft className="w-3 h-3 text-amber-400 shrink-0" />
                          <span className="text-amber-400 font-semibold">Origem ({unit.originSector}):</span>
                          {unit.initialEntryDate ? (
                            <span className="text-slate-300">
                              {new Date(unit.initialEntryDate).toLocaleDateString('pt-BR')} {new Date(unit.initialEntryDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          ) : null}
                        </p>
                      )}
                      {unit.status === 'Baixado' && (
                        <p className={`font-bold flex items-center gap-1.5 ${
                          isLight ? 'text-rose-700' : 'text-rose-400'
                        }`}>
                          <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${
                            isLight ? 'text-rose-700' : 'text-rose-400'
                          }`} />
                          <span>Saída:</span>
                          <span className={`font-extrabold ${
                            isLight ? 'text-rose-950' : 'text-rose-200'
                          }`}>
                            {formatDischargeDateTime(getDischargeDate(unit))}
                          </span>
                        </p>
                      )}
                    </div>

                    <div className="flex justify-between items-center text-xs">
                      {unit.platform ? (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${pStyle}`}>
                          {unit.platform}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500 italic">Sem Plataforma</span>
                      )}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {unit.originSector && (
                          <span 
                            className="px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1"
                            title={`Produto transferido do estoque ${unit.originSector}`}
                          >
                            <ArrowRightLeft className="w-2.5 h-2.5" />
                            <span>{unit.originSector}</span>
                          </span>
                        )}
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
                </div>
              );
            })}
          </div>
        ) : (
          /* List / Linhas View */
          <div className="p-4 space-y-2 bg-slate-950" id="stock-list-rows">
            {displayedUnits.map((unit) => {
              const pStyle = getPlatformStyle(unit.platform);
              const sectorClass = getSectorBadgeClass(unit.destinationSector);
              
              // Resolve photos (automatic fallback to base product if Principal/Novo or empty)
              const resolved = getUnitResolvedPhotos(unit, products);
              const photosCount = resolved.totalPhotosCount;
              const mainPhoto = resolved.mainPhoto;

              const hasDupSti = isDuplicateSti(unit);
              const hasDupSerial = isDuplicateSerial(unit);

              return (
                <div 
                  key={unit.id}
                  className={`group bg-slate-900 border hover:border-slate-700/80 rounded-xl p-3 sm:p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:shadow-lg transition-all ${
                    hasDupSti || hasDupSerial ? 'border-amber-500/50' : 'border-slate-800/80'
                  }`}
                  id={`stock-unit-list-${unit.id}`}
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    {unit.status !== 'Baixado' ? (
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
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-rose-600 text-white shadow-xs flex items-center gap-1 shrink-0">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Baixado</span>
                      </span>
                    )}

                    {/* Thumbnail - click opens unit details */}
                    <div 
                      onClick={() => setSelectedUnitId(unit.id)}
                      className={`w-12 h-12 rounded-lg photo-container-clean !bg-white border ${
                        isLight 
                          ? 'border-slate-200 shadow-sm' 
                          : 'border-slate-800 shadow-inner'
                      } hover:border-sky-500/60 overflow-hidden flex items-center justify-center shrink-0 relative cursor-pointer group/listthumb transition-all shadow-sm hover:shadow-sky-500/10 p-0.5`}
                      style={{ backgroundColor: '#ffffff' }}
                      title="Clique na foto ou ícone para ver os detalhes do produto"
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          setSelectedUnitId(unit.id);
                        }
                      }}
                    >
                      {mainPhoto ? (
                        <img src={mainPhoto} alt={unit.baseProductName} className="w-full h-full object-contain group-hover/listthumb:scale-110 transition-transform" />
                      ) : (
                        <Package className="w-5 h-5 text-slate-400 group-hover/listthumb:text-sky-500 transition-colors" />
                      )}
                    </div>

                    {/* Details */}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={(e) => handleCopyCode(unit.baseProductSku, `sku-list-${unit.id}`, e)}
                          className={`font-mono text-xs font-bold px-2 py-0.5 rounded shrink-0 transition-all cursor-pointer flex items-center gap-1 group/copy ${
                            copiedCodeKey === `sku-list-${unit.id}`
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 scale-105'
                              : 'text-sky-400 bg-sky-500/10 hover:bg-sky-500/20 hover:text-sky-300 border border-transparent'
                          }`}
                          title="Clique para copiar o SKU"
                        >
                          {copiedCodeKey === `sku-list-${unit.id}` ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span>Copiado!</span>
                            </>
                          ) : (
                            <>
                              <span>{unit.baseProductSku}</span>
                              <Copy className="w-2.5 h-2.5 opacity-0 group-hover/copy:opacity-100 transition-opacity" />
                            </>
                          )}
                        </button>
                        {unit.trackingCode && unit.trackingCode.trim() !== '' && (
                          <button
                            type="button"
                            onClick={(e) => handleCopyCode(normalizeStiCode(unit.trackingCode), `sti-list-${unit.id}`, e)}
                            className={`font-mono text-xs font-bold px-2 py-0.5 rounded shrink-0 transition-all cursor-pointer flex items-center gap-1 group/copy ${
                              copiedCodeKey === `sti-list-${unit.id}`
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 scale-105'
                                : hasDupSti
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                                  : 'text-slate-300 hover:text-white bg-slate-950/80 hover:bg-slate-800 border border-slate-800'
                            }`}
                            title="Clique para copiar o Código STI"
                          >
                            {copiedCodeKey === `sti-list-${unit.id}` ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span>Copiado!</span>
                              </>
                            ) : (
                              <>
                                <span>{formatStiBadge(unit.trackingCode)}</span>
                                <Copy className="w-2.5 h-2.5 opacity-0 group-hover/copy:opacity-100 transition-opacity" />
                              </>
                            )}
                          </button>
                        )}
                        {unit.serialNumber && (
                          <button
                            type="button"
                            onClick={(e) => handleCopyCode(unit.serialNumber!, `serial-list-${unit.id}`, e)}
                            className={`font-mono text-xs px-2 py-0.5 rounded border shrink-0 transition-all cursor-pointer flex items-center gap-1 group/copy ${
                              copiedCodeKey === `serial-list-${unit.id}`
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 scale-105 font-bold'
                                : hasDupSerial 
                                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-bold hover:bg-rose-500/30' 
                                  : 'text-slate-300 bg-slate-950 border-slate-800 hover:border-slate-700 hover:text-white'
                            }`}
                            title={hasDupSerial ? "Número de Série Duplicado! Clique para copiar" : "Clique para copiar o Número de Série"}
                          >
                            {copiedCodeKey === `serial-list-${unit.id}` ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span>Copiado!</span>
                              </>
                            ) : (
                              <>
                                <span>S/N: {unit.serialNumber}</span>
                                <Copy className="w-2.5 h-2.5 opacity-0 group-hover/copy:opacity-100 transition-opacity" />
                              </>
                            )}
                          </button>
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
                        {unit.pendingRegistrationNumber && (
                          <span 
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-sky-400 bg-sky-500/10 border border-sky-500/20 hover:bg-sky-500/20 transition-colors cursor-help" 
                            title={`Vinculado à Pendência: ${unit.pendingRegistrationNumber}`}
                          >
                            <Link2 className="w-2.5 h-2.5 text-sky-400" />
                            <span>Vinculado</span>
                          </span>
                        )}
                        {unit.platform ? (
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${pStyle}`}>
                            {unit.platform}
                          </span>
                        ) : null}
                        {unit.originSector && (
                          <span 
                            className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1"
                            title={`Produto transferido do estoque ${unit.originSector}${unit.initialEntryDate ? ' em ' + new Date(unit.initialEntryDate).toLocaleDateString('pt-BR') : ''}`}
                          >
                            <ArrowRightLeft className="w-2.5 h-2.5" />
                            <span>Veio de: {unit.originSector}</span>
                          </span>
                        )}
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${sectorClass}`}>
                          {unit.destinationSector}
                        </span>
                        {unit.status === 'Baixado' && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-600 text-white shadow-xs uppercase tracking-wider flex items-center gap-1 shrink-0">
                            <CheckCircle2 className="w-3 h-3 text-white" />
                            <span>Saída Efetuada</span>
                          </span>
                        )}
                      </div>

                      <h4 className="font-bold text-white text-sm line-clamp-1 group-hover:text-sky-400 transition-colors">
                        {unit.baseProductName}
                      </h4>

                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs text-slate-400 line-clamp-1">
                          Motivo: {unit.customerReason}
                        </p>

                        {(activeTab === 'Openbox' || unit.destinationSector === 'Openbox') && (
                          <p className="text-xs text-slate-300 line-clamp-1 flex items-center gap-1" title={stripHtml(unit.notes) || undefined}>
                            <span className="text-slate-600">•</span>
                            <span className="text-amber-400 font-semibold">Laudo:</span>{' '}
                            <span>{stripHtml(unit.notes) || <span className="text-slate-500 italic">Sem laudo</span>}</span>
                          </p>
                        )}

                        {(() => {
                          const baseProd = findBaseProduct(unit, products);
                          const bBrand = baseProd?.brand && baseProd.brand.trim() !== 'N/A' && baseProd.brand.trim() !== 'Não Informado' ? baseProd.brand.trim() : null;
                          const bCat = baseProd?.category && baseProd.category.trim() !== 'Todas' ? baseProd.category.trim() : null;
                          const bVolt = unit.baseProductVoltage || (baseProd?.voltage && baseProd.voltage !== 'N/A' ? baseProd.voltage : null);

                          if (!bBrand && !bCat && (!bVolt || bVolt === 'N/A')) return null;

                          return (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {bBrand && (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-purple-500/10 text-purple-300 border border-purple-500/30 flex items-center gap-1" title={`Marca: ${bBrand}`}>
                                  <Sliders className="w-2.5 h-2.5" />
                                  <span>{bBrand}</span>
                                </span>
                              )}
                              {bCat && (
                                <CategoryBadge category={bCat} size="xs" />
                              )}
                              {bVolt && bVolt !== 'N/A' && (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 flex items-center gap-1" title={`Tensão: ${bVolt}`}>
                                  <Zap className="w-2.5 h-2.5" />
                                  <span>{bVolt}</span>
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Date and Action hint */}
                  <div className="flex items-center justify-between md:justify-end gap-4 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-800/60">
                    <div className="flex flex-col items-start md:items-end gap-1 font-mono text-[10px]">
                      <p className="text-slate-400 font-medium flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                        <span className="text-slate-400">Entrada:</span>
                        <span className="text-slate-200 font-semibold">
                          {new Date(unit.createdAt).toLocaleDateString('pt-BR')} {new Date(unit.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </p>
                      {unit.originSector && (
                        <p className="text-slate-400 font-medium flex items-center gap-1 text-[9.5px]" title="Data do primeiro registro antes da transferência de estoque">
                          <ArrowRightLeft className="w-3 h-3 text-amber-400 shrink-0" />
                          <span className="text-amber-400 font-semibold">Origem ({unit.originSector}):</span>
                          {unit.initialEntryDate ? (
                            <span className="text-slate-300">
                              {new Date(unit.initialEntryDate).toLocaleDateString('pt-BR')} {new Date(unit.initialEntryDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          ) : null}
                        </p>
                      )}
                      {unit.status === 'Baixado' && (
                        <p className={`font-bold flex items-center gap-1 ${
                          isLight ? 'text-rose-700' : 'text-rose-400'
                        }`}>
                          <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${
                            isLight ? 'text-rose-700' : 'text-rose-400'
                          }`} />
                          <span>Saída:</span>
                          <span className={`font-extrabold ${
                            isLight ? 'text-rose-950' : 'text-rose-200'
                          }`}>
                            {formatDischargeDateTime(getDischargeDate(unit))}
                          </span>
                        </p>
                      )}
                    </div>

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

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedUnitId(unit.id);
                        }}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 hover:border-slate-600 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                        title="Ver detalhes completos do produto"
                      >
                        <Eye className="w-3.5 h-3.5 text-sky-400" />
                        <span>Detalhes</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination / Mostrar Mais button */}
        <div className="p-5 bg-slate-950/80 border-t border-slate-800/80 flex flex-col items-center justify-center gap-2.5 text-center" id="stock-pagination-footer">
          {hasMore && (
            <button
              type="button"
              onClick={() => setVisibleCount(prev => prev + 20)}
              className="px-6 py-2.5 bg-slate-800 hover:bg-slate-750 hover:border-sky-500/50 text-slate-200 hover:text-white border border-slate-700 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm group"
              id="btn-load-more-stock"
            >
              <span>Mostrar Mais</span>
              <ChevronDown className="w-4 h-4 text-sky-400 group-hover:translate-y-0.5 transition-transform" />
            </button>
          )}

          <span className="text-xs text-slate-400 font-medium">
            Exibindo <strong className="text-sky-400 font-bold">{displayedUnits.length}</strong> de <strong className="text-white font-bold">{filteredUnits.length}</strong> {filteredUnits.length === 1 ? 'unidade' : 'unidades'}
          </span>
        </div>
      </>
    )}
  </div>

      {/* Complete unit details / Edit Modal Sheet */}
      {currentUnit && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 overflow-y-auto" 
          id="stock-details-modal"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleCloseDetails();
            }
          }}
        >
          <div 
            className="w-full max-w-5xl bg-slate-900 border border-slate-800/60 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-4 sm:my-8 animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            
            {/* Modal Header */}
            <div className={`px-6 py-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/90 border-slate-800'
            }`}>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`font-mono text-xs font-black px-2.5 py-0.5 rounded-md flex items-center gap-1.5 border ${
                    isLight 
                      ? 'bg-sky-50 border-sky-200 text-sky-700' 
                      : 'text-sky-400 bg-sky-500/15 border-sky-500/30'
                  }`} title="Código SKU">
                    <span className={`text-[10px] font-sans font-bold ${isLight ? 'text-sky-600' : 'text-sky-300/70'}`}>SKU</span>
                    {isEditingUnit && editForm ? editForm.baseProductSku : currentUnit.baseProductSku}
                  </span>

                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded-md border ${
                    (isEditingUnit && editForm ? editForm.destinationSector : currentUnit.destinationSector) === 'Principal'
                      ? (isLight ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30')
                      : (isEditingUnit && editForm ? editForm.destinationSector : currentUnit.destinationSector) === 'Openbox'
                      ? (isLight ? 'bg-amber-50 text-amber-800 border-amber-300' : 'bg-amber-500/15 text-amber-300 border-amber-500/30')
                      : (isLight ? 'bg-rose-50 text-rose-800 border-rose-300' : 'bg-rose-500/15 text-rose-300 border-rose-500/30')
                  }`}>
                    Setor: {isEditingUnit && editForm ? editForm.destinationSector : currentUnit.destinationSector}
                  </span>

                  {currentUnit.status === 'Baixado' && (
                    <span className={`text-xs font-black px-2.5 py-0.5 rounded-md border flex items-center gap-1.5 uppercase tracking-wider ${
                      isLight 
                        ? 'bg-rose-100 text-rose-900 border-rose-300' 
                        : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    }`}>
                      <CheckCircle2 className="w-3.5 h-3.5 text-rose-500" />
                      Baixado
                    </span>
                  )}

                  {currentUnit.pendingRegistrationNumber && (
                    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-md border flex items-center gap-1.5 ${
                      isLight
                        ? 'bg-sky-50 text-sky-800 border-sky-300'
                        : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                    }`} title={`Vinculado à Pendência: ${currentUnit.pendingRegistrationNumber}`}>
                      <Hash className="w-3.5 h-3.5 text-sky-400" />
                      <span>Pendência: {currentUnit.pendingRegistrationNumber}</span>
                    </span>
                  )}

                  {isEditingUnit && (
                    <span className={`px-2 py-0.5 text-[10px] font-black rounded-md uppercase tracking-wider border ${
                      isLight 
                        ? 'bg-amber-100 text-amber-900 border-amber-300' 
                        : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    }`}>
                      Modo Edição
                    </span>
                  )}
                </div>

                <h3 className={`text-lg sm:text-xl font-black tracking-tight pt-0.5 ${
                  isLight ? 'text-slate-900' : 'text-white'
                }`}>
                  {isEditingUnit && editForm ? editForm.baseProductName : currentUnit.baseProductName}
                </h3>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                {isEditingUnit ? (
                  <>
                    <button 
                      type="button"
                      onClick={() => { 
                        setIsEditingUnit(false); 
                        setEditForm(null); 
                        setIsCustomEditDeviceStatus(false);
                        setCustomEditDeviceStatusText('');
                        setIsCustomEditPackageStatus(false);
                        setCustomEditPackageStatusText('');
                      }}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer border ${
                        isLight
                          ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 shadow-sm'
                          : 'bg-slate-800 hover:bg-slate-750 text-slate-300 border-slate-700'
                      }`}
                    >
                      Cancelar
                    </button>
                    <button 
                      type="button"
                      disabled={isSavingEdit}
                      onClick={handleSaveEdit}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-black transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Save className="w-4 h-4" />
                      <span>{isSavingEdit ? 'Salvando...' : 'Salvar Alterações'}</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button 
                      type="button"
                      onClick={() => handleStartEdit(currentUnit)}
                      className="px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-sky-600/20 flex items-center gap-1.5 cursor-pointer"
                      title="Editar imagens, descrição, SKU e especificações do produto"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Editar Produto</span>
                    </button>
                    <button 
                      type="button"
                      onClick={handleCloseDetails}
                      className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                        isLight 
                          ? 'bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border-slate-300'
                          : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border-slate-800'
                      }`}
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
              <div className={`p-6 sm:p-8 space-y-6 overflow-y-auto max-h-[75vh] ${
                isLight ? 'bg-white' : ''
              }`}>
                <div className={`p-3.5 rounded-xl text-xs flex items-center gap-2.5 border ${
                  isLight
                    ? 'bg-sky-50 border-sky-200 text-sky-900 shadow-sm'
                    : 'bg-sky-950/60 border-sky-500/30 text-sky-200'
                }`}>
                  <Pencil className={`w-4 h-4 shrink-0 ${isLight ? 'text-sky-600' : 'text-sky-400'}`} />
                  <span className={isLight ? 'text-sky-950 font-medium' : 'text-sky-200'}>
                    Modo de edição do produto. Altere imagens, descrição, nome, SKU e especificações do item.
                  </span>
                </div>

                {/* Section 1: Main Info */}
                <div className="space-y-4 bg-slate-950 p-5 border border-slate-800 rounded-xl">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                    <Package className="w-4 h-4" />
                    Dados Principais & Identificação Técnica
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-3">
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

                    {/* Plataforma de Origem */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">
                        Plataforma de Origem
                      </label>
                      <select 
                        value={editForm.platform || ''} 
                        onChange={(e) => setEditForm({ ...editForm, platform: e.target.value as PlatformType })} 
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs font-bold text-white focus:outline-none focus:border-sky-500 cursor-pointer"
                        id="edit-unit-platform"
                      >
                        <option value="">Sem Plataforma / Não informada</option>
                        <option value="Mercado Livre">Mercado Livre</option>
                        <option value="Shopee">Shopee</option>
                        <option value="Amazon">Amazon</option>
                        <option value="Amazon Ta Novo">Amazon Ta Novo</option>
                        <option value="Kabum">Kabum</option>
                        <option value="Outro">Outro</option>
                      </select>
                    </div>

                    {editForm.destinationSector === 'Openbox' && (
                      <div className="animate-in fade-in duration-200">
                        <label className="block text-[11px] font-bold mb-1 text-amber-400">
                          <span>Código STI / Rastreio</span>
                          <span className="text-rose-400 font-bold ml-1">* (Obrigatório)</span>
                        </label>
                        <input 
                          type="text" 
                          value={editForm.trackingCode || ''} 
                          onChange={(e) => {
                            const formatted = formatStiInput(e.target.value);
                            setEditForm({ ...editForm, trackingCode: formatted });
                          }} 
                          maxLength={9}
                          className="w-full bg-slate-900 rounded-lg p-2.5 text-xs font-bold font-mono focus:outline-none border border-amber-500/50 text-amber-200 placeholder-amber-500/40 focus:border-amber-400"
                          placeholder="Ex: STI134920"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">
                        <span>Número de Pedido</span>
                        <span className="text-slate-500 font-normal ml-1">(Opcional)</span>
                      </label>
                      <input 
                        type="text" 
                        value={editForm.orderNumber || ''} 
                        onChange={(e) => setEditForm({ ...editForm, orderNumber: e.target.value })} 
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs font-bold text-slate-200 font-mono focus:outline-none focus:border-sky-500" 
                        placeholder="Ex: 2000008172648"
                      />
                    </div>

                    <div className="relative" ref={editPendingSelectorRef}>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                          <Hash className="w-3 h-3 text-sky-400" />
                          <span>Nº Registro da Pendência</span>
                        </label>
                        {editForm.pendingRegistrationNumber && (
                          <button
                            type="button"
                            onClick={handleClearEditPendingLink}
                            className="text-[10px] text-rose-400 hover:text-rose-300 flex items-center gap-0.5 cursor-pointer transition-colors"
                            title="Remover vínculo com a pendência"
                            id="btn-edit-clear-pending"
                          >
                            <X className="w-3 h-3" />
                            <span>Desvincular</span>
                          </button>
                        )}
                      </div>

                      {/* Dropdown selector trigger */}
                      <button
                        type="button"
                        onClick={() => setIsEditPendingSelectorOpen(!isEditPendingSelectorOpen)}
                        className={`w-full p-2.5 rounded-lg text-xs text-left flex items-center justify-between transition-colors border cursor-pointer ${
                          editForm.pendingRegistrationNumber
                            ? 'bg-sky-950/40 border-sky-500 text-sky-200'
                            : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-600'
                        }`}
                        id="btn-edit-select-pending"
                      >
                        <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-1.5">
                          {editForm.pendingRegistrationNumber ? (
                            <>
                              <span className="font-mono font-bold text-sky-400 bg-sky-500/20 px-1.5 py-0.5 rounded text-[10px] border border-sky-500/30 shrink-0">
                                {editForm.pendingRegistrationNumber}
                              </span>
                              <span className="truncate text-[11px] text-slate-200 font-medium">
                                {(() => {
                                  const matched = (pendingItems || []).find(p => p.registrationNumber === editForm.pendingRegistrationNumber);
                                  return matched ? (matched.orderNumber ? `Ped: ${matched.orderNumber}` : matched.platform || 'Vinculada') : 'Vinculada';
                                })()}
                              </span>
                            </>
                          ) : (
                            <span className="text-slate-400 truncate text-[11px]">
                              {availableEditPendingItems.length > 0
                                ? `Puxar pendência (${availableEditPendingItems.length} disponíveis SKU ${editForm.baseProductSku || (editForm as any).sku || ''})...`
                                : `Nenhuma pendência aberta para SKU ${editForm.baseProductSku || (editForm as any).sku || ''}`}
                            </span>
                          )}
                        </div>
                        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-200 ${isEditPendingSelectorOpen ? 'rotate-180' : ''}`} />
                      </button>

                      {/* Dropdown list of pending items filtered strictly by SKU */}
                      {isEditPendingSelectorOpen && (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-slate-950 border border-slate-700 rounded-xl shadow-2xl z-50 max-h-60 overflow-y-auto divide-y divide-slate-800">
                          <div className="p-2 bg-slate-900 text-[10px] text-slate-400 flex items-center justify-between sticky top-0 z-10 border-b border-slate-800 font-medium">
                            <span className="font-bold text-slate-300">
                              Pendências Abertas (SKU <span className="font-mono text-sky-400">{editForm.baseProductSku || (editForm as any).sku || ''}</span>)
                            </span>
                            <span className="text-sky-400 font-mono font-bold">{availableEditPendingItems.length}</span>
                          </div>

                          {editForm.pendingRegistrationNumber && (
                            <div
                              onClick={handleClearEditPendingLink}
                              className="p-2 hover:bg-slate-800 cursor-pointer text-xs text-rose-300 flex items-center gap-1.5 transition-colors"
                            >
                              <X className="w-3.5 h-3.5 text-rose-400" />
                              <span>Remover vínculo atual (Desvincular)</span>
                            </div>
                          )}

                          {availableEditPendingItems.length === 0 ? (
                            <div className="p-3 text-center text-xs text-slate-400 space-y-1">
                              <p className="text-slate-300 font-medium">Nenhuma pendência aberta para este SKU.</p>
                              <p className="text-[10px] text-slate-500">Apenas pendências abertas com o SKU "{editForm.baseProductSku || (editForm as any).sku || ''}" podem ser vinculadas.</p>
                            </div>
                          ) : (
                            availableEditPendingItems.map((item) => {
                              const isSelected = editForm.pendingRegistrationNumber === item.registrationNumber;
                              return (
                                <div
                                  key={item.id}
                                  onClick={() => handleSelectEditPendingItem(item)}
                                  className={`p-2 hover:bg-slate-800/80 cursor-pointer transition-colors text-xs ${
                                    isSelected ? 'bg-sky-500/15 border-l-2 border-sky-400' : ''
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="font-mono font-bold text-sky-400 text-[10px] bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20">
                                      {item.registrationNumber || 'SEM REG'}
                                    </span>
                                    <span className="text-[10px] text-slate-400 truncate">
                                      {item.orderNumber ? `Ped: ${item.orderNumber}` : item.platform || ''}
                                    </span>
                                  </div>
                                  <div className="font-medium text-slate-200 text-[11px] truncate mt-0.5">
                                    {item.productName || item.sku}
                                  </div>
                                  <div className="text-[10px] text-amber-400/90 truncate mt-0.5">
                                    Motivo: {item.pendingReason}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}

                      {!editPendingLinkValidation.valid && (
                        <p className="text-[10px] text-rose-400 mt-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          <span>{editPendingLinkValidation.error}</span>
                        </p>
                      )}
                    </div>

                    <div className="sm:col-span-3">
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
                      {editForm.originSector && (
                        <p className="text-[10.5px] text-amber-400/95 flex items-center gap-1.5 mt-1.5 bg-amber-500/10 border border-amber-500/25 px-2.5 py-1.5 rounded-lg">
                          <ArrowRightLeft className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                          <span>
                            Estoque de Origem: <strong className="text-amber-300">{editForm.originSector}</strong>
                            {editForm.initialEntryDate ? ` (Entrada inicial: ${new Date(editForm.initialEntryDate).toLocaleDateString('pt-BR')})` : ''}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Section 2: Diagnostics & Condition */}
                <div className="space-y-4 bg-slate-950 p-5 border border-slate-800 rounded-xl">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    Condição, Motivo & Acessórios
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[11px] font-bold text-slate-300">
                          Estado do Aparelho
                        </label>
                        {!isCustomEditDeviceStatus && editForm.deviceStatus !== 'Descrever' ? (
                          <button
                            type="button"
                            onClick={() => {
                              setIsCustomEditDeviceStatus(true);
                              setEditForm({ ...editForm, deviceStatus: 'Descrever' as any });
                            }}
                            className="text-[10px] text-sky-400 hover:text-sky-300 font-medium transition-colors cursor-pointer"
                          >
                            + Descrever
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setIsCustomEditDeviceStatus(false);
                              setCustomEditDeviceStatusText('');
                              setEditForm({ ...editForm, deviceStatus: 'Usado' });
                            }}
                            className="text-[10px] text-slate-400 hover:text-slate-200 font-medium transition-colors cursor-pointer"
                          >
                            Opções padrão
                          </button>
                        )}
                      </div>
                      <select 
                        value={isCustomEditDeviceStatus ? 'Descrever' : editForm.deviceStatus} 
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'Descrever') {
                            setIsCustomEditDeviceStatus(true);
                            setEditForm({ ...editForm, deviceStatus: 'Descrever' as any });
                          } else {
                            setIsCustomEditDeviceStatus(false);
                            setCustomEditDeviceStatusText('');
                            setEditForm({ ...editForm, deviceStatus: val as DeviceStatusType });
                          }
                        }} 
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs font-bold text-white focus:outline-none focus:border-sky-500 cursor-pointer"
                      >
                        <option value="Novo">Novo</option>
                        <option value="Usado">Usado</option>
                        <option value="Com Avaria">Com Avaria</option>
                        <option value="Peças">Peças / Sucata</option>
                        <option value="Descrever">Descrever (Personalizado)...</option>
                      </select>

                      {(isCustomEditDeviceStatus || editForm.deviceStatus === 'Descrever') && (
                        <div className="mt-2 space-y-1.5">
                          <input
                            type="text"
                            value={customEditDeviceStatusText}
                            onChange={(e) => {
                              setCustomEditDeviceStatusText(e.target.value);
                              setEditForm({ ...editForm, deviceStatus: (e.target.value || 'Descrever') as any });
                            }}
                            placeholder="Descreva o estado do aparelho..."
                            autoFocus
                            className="w-full bg-slate-900 border border-sky-500/70 rounded-lg p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 transition-colors"
                          />
                          <div className="flex flex-wrap gap-1">
                            {['Leves marcas de uso', 'Riscos na carcaça', 'Tela riscada/trincada', 'Sem marcas estéticas'].map((tag) => (
                              <button
                                type="button"
                                key={tag}
                                onClick={() => {
                                  const newVal = customEditDeviceStatusText ? `${customEditDeviceStatusText}, ${tag}` : tag;
                                  setCustomEditDeviceStatusText(newVal);
                                  setEditForm({ ...editForm, deviceStatus: newVal as any });
                                }}
                                className="text-[9px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-colors cursor-pointer"
                              >
                                + {tag}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[11px] font-bold text-slate-300">
                          Estado da Embalagem / Caixa
                        </label>
                        {!isCustomEditPackageStatus && editForm.packageStatus !== 'Descrever' ? (
                          <button
                            type="button"
                            onClick={() => {
                              setIsCustomEditPackageStatus(true);
                              setEditForm({ ...editForm, packageStatus: 'Descrever' as any });
                            }}
                            className="text-[10px] text-sky-400 hover:text-sky-300 font-medium transition-colors cursor-pointer"
                          >
                            + Descrever
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setIsCustomEditPackageStatus(false);
                              setCustomEditPackageStatusText('');
                              setEditForm({ ...editForm, packageStatus: 'Danificada' });
                            }}
                            className="text-[10px] text-slate-400 hover:text-slate-200 font-medium transition-colors cursor-pointer"
                          >
                            Opções padrão
                          </button>
                        )}
                      </div>
                      <select 
                        value={isCustomEditPackageStatus ? 'Descrever' : editForm.packageStatus} 
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'Descrever') {
                            setIsCustomEditPackageStatus(true);
                            setEditForm({ ...editForm, packageStatus: 'Descrever' as any });
                          } else {
                            setIsCustomEditPackageStatus(false);
                            setCustomEditPackageStatusText('');
                            setEditForm({ ...editForm, packageStatus: val as PackageStatusType });
                          }
                        }} 
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs font-bold text-white focus:outline-none focus:border-sky-500 cursor-pointer"
                      >
                        <option value="Perfeita">Perfeita / Na Caixa</option>
                        <option value="Usada">Usada</option>
                        <option value="Sem Caixa">Sem Caixa</option>
                        <option value="Danificada">Danificada</option>
                        <option value="Sem Embalagem">Sem Embalagem / Fora da Caixa</option>
                        <option value="Descrever">Descrever (Personalizado)...</option>
                      </select>

                      {(isCustomEditPackageStatus || editForm.packageStatus === 'Descrever') && (
                        <div className="mt-2 space-y-1.5">
                          <input
                            type="text"
                            value={customEditPackageStatusText}
                            onChange={(e) => {
                              setCustomEditPackageStatusText(e.target.value);
                              setEditForm({ ...editForm, packageStatus: (e.target.value || 'Descrever') as any });
                            }}
                            placeholder="Descreva o estado da embalagem/caixa..."
                            autoFocus
                            className="w-full bg-slate-900 border border-sky-500/70 rounded-lg p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 transition-colors"
                          />
                          <div className="flex flex-wrap gap-1">
                            {['Caixa original amassada', 'Caixa rasgada', 'Sem berço interno', 'Embalagem plástica / parda'].map((tag) => (
                              <button
                                type="button"
                                key={tag}
                                onClick={() => {
                                  const newVal = customEditPackageStatusText ? `${customEditPackageStatusText}, ${tag}` : tag;
                                  setCustomEditPackageStatusText(newVal);
                                  setEditForm({ ...editForm, packageStatus: newVal as any });
                                }}
                                className="text-[9px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-colors cursor-pointer"
                              >
                                + {tag}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
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
                <div className="space-y-3 bg-slate-950 p-5 border border-slate-800 rounded-xl">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                    <FileText className="w-4 h-4" />
                    Laudo Técnico de Entrada / Descrição Detalhada
                  </h4>
                  <RichTextEditor 
                    value={editForm.notes || ''} 
                    onChange={(val) => setEditForm({ ...editForm, notes: val })} 
                    placeholder="Adicione texto ou laudo com formatação (negrito, itálico, listas, tabelas, cores)..."
                    minHeight="180px"
                  />
                </div>

                {/* Opção de Contador Diário */}
                <div className="bg-slate-950 p-4 border border-slate-800 rounded-xl">
                  <label className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input 
                      type="checkbox"
                      checked={Boolean(editForm.excludeFromDailyCount)}
                      onChange={(e) => setEditForm({ ...editForm, excludeFromDailyCount: e.target.checked })}
                      className="mt-0.5 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-400 focus:ring-offset-slate-900 h-4 w-4"
                      id="checkbox-edit-exclude-daily"
                    />
                    <div className="space-y-0.5">
                      <span className="text-xs font-semibold text-slate-200 block">
                        Não contabilizar no registro de entrada diária
                      </span>
                      <span className="text-[11px] text-slate-400 block leading-tight">
                        Se marcado, este produto será ignorado do contador e gráficos de devoluções diárias.
                      </span>
                    </div>
                  </label>
                </div>

                {/* Section 4: Photo Gallery Editor - Compact & High Efficiency */}
                <div 
                  className="space-y-3 bg-slate-950 p-4 border border-slate-800 rounded-xl"
                  onPaste={(e) => handleEditModalPaste(e, urlInputCategory)}
                  id="edit-photo-gallery-manager"
                >
                  {/* Compact Header & Target Selector */}
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-2 border-b border-slate-800/80">
                    <div className="flex items-center gap-2">
                      <Camera className="w-4 h-4 text-emerald-400 shrink-0" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                        Galeria de Fotos
                      </h4>
                      <span className="text-[11px] font-bold font-mono px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-slate-300">
                        {(editForm.photosProduct?.length || 0) + (editForm.photosBox?.length || 0) + (editForm.photosAccessories?.length || 0)} fotos
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-slate-400 text-[11px]">Destino ativo:</span>
                      {/* Interactive pill buttons for category selection */}
                      <div className="flex items-center gap-1 p-0.5 bg-slate-900 border border-slate-800 rounded-lg">
                        <button 
                          type="button" 
                          onClick={() => setUrlInputCategory('photosProduct')}
                          className={`px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer transition-all flex items-center gap-1 ${
                            urlInputCategory === 'photosProduct' 
                              ? 'bg-sky-500 text-white shadow-sm' 
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                          title="Definir destino como Fotos do Aparelho (Ctrl+V colará aqui)"
                        >
                          <span>Aparelho</span>
                          <span className={`text-[10px] px-1 rounded-full ${urlInputCategory === 'photosProduct' ? 'bg-sky-700/80 text-white' : 'bg-slate-800 text-slate-300'}`}>
                            {editForm.photosProduct?.length || 0}
                          </span>
                        </button>
                        <button 
                          type="button" 
                          onClick={() => setUrlInputCategory('photosBox')}
                          className={`px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer transition-all flex items-center gap-1 ${
                            urlInputCategory === 'photosBox' 
                              ? 'bg-sky-500 text-white shadow-sm' 
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                          title="Definir destino como Fotos da Embalagem (Ctrl+V colará aqui)"
                        >
                          <span>Embalagem</span>
                          <span className={`text-[10px] px-1 rounded-full ${urlInputCategory === 'photosBox' ? 'bg-sky-700/80 text-white' : 'bg-slate-800 text-slate-300'}`}>
                            {editForm.photosBox?.length || 0}
                          </span>
                        </button>
                        <button 
                          type="button" 
                          onClick={() => setUrlInputCategory('photosAccessories')}
                          className={`px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer transition-all flex items-center gap-1 ${
                            urlInputCategory === 'photosAccessories' 
                              ? 'bg-sky-500 text-white shadow-sm' 
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                          title="Definir destino como Fotos dos Acessórios (Ctrl+V colará aqui)"
                        >
                          <span>Acessórios</span>
                          <span className={`text-[10px] px-1 rounded-full ${urlInputCategory === 'photosAccessories' ? 'bg-sky-700/80 text-white' : 'bg-slate-800 text-slate-300'}`}>
                            {editForm.photosAccessories?.length || 0}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Add photo inputs toolbar with Paste Button - Compact single-row design */}
                  <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Upload from Computer */}
                      <label className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 shadow-sm">
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload</span>
                        <input 
                          type="file" 
                          multiple
                          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" 
                          onChange={(e) => handleAddPhotoFile(urlInputCategory, e)} 
                          className="hidden" 
                        />
                      </label>

                      {/* Paste Image from Clipboard Button */}
                      <button
                        type="button"
                        onClick={() => handlePasteFromClipboard(urlInputCategory)}
                        className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 active:scale-95 text-white font-bold rounded-lg text-xs transition-all flex items-center gap-1.5 shrink-0 shadow-sm cursor-pointer"
                        title="Colar imagem da área de transferência (ou use Ctrl+V diretamente)"
                      >
                        <ClipboardPaste className="w-3.5 h-3.5" />
                        <span>Colar</span>
                        <span className="text-[10px] bg-sky-700/80 px-1 py-0.2 rounded font-mono font-normal">Ctrl+V</span>
                      </button>

                      {/* URL input */}
                      <div className="flex-1 min-w-[220px] flex items-center gap-1.5">
                        <input 
                          type="url" 
                          value={imageUrlInput} 
                          onChange={(e) => setImageUrlInput(e.target.value)} 
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddPhotoUrl(urlInputCategory);
                            }
                          }}
                          placeholder="Cole link da imagem (https://...)" 
                          className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 placeholder:text-slate-600" 
                        />
                        <button 
                          type="button" 
                          onClick={() => handleAddPhotoUrl(urlInputCategory)}
                          disabled={isSanitizingUrl || !imageUrlInput.trim()}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-200 font-bold rounded-lg text-xs transition-colors shrink-0 cursor-pointer flex items-center gap-1"
                        >
                          {isSanitizingUrl ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-400" />
                              <span>Processando...</span>
                            </>
                          ) : (
                            <span>Adicionar</span>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                      <span className="flex items-center gap-1 text-[11px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
                        Inserindo em: <strong className="text-sky-300">
                          {urlInputCategory === 'photosProduct' ? 'Aparelho' : urlInputCategory === 'photosBox' ? 'Embalagem' : 'Acessórios'}
                        </strong>
                        <span className="text-slate-500 hidden sm:inline ml-1">(Pressione Ctrl+V em qualquer lugar para colar rápido)</span>
                      </span>
                      <span className="text-[10px] text-slate-500 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-emerald-400" />
                        Max 3MB · WebP
                      </span>
                    </div>
                  </div>

                  {/* Categories preview grids with delete overlay and dropzones */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Product Photos */}
                    <div 
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleDropPhoto(e, 'photosProduct')}
                      onPaste={(e) => handleEditModalPaste(e, 'photosProduct')}
                      onClick={() => setUrlInputCategory('photosProduct')}
                      className={`p-3 rounded-xl border transition-all space-y-2 ${
                        urlInputCategory === 'photosProduct' 
                          ? 'bg-slate-900/90 border-sky-500/60 shadow-md shadow-sky-500/5 ring-1 ring-sky-500/30' 
                          : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex justify-between items-center text-[11px] font-bold text-slate-300 border-b border-slate-800 pb-1.5">
                        <span className="flex items-center gap-1.5">
                          <ImageIcon className="w-3.5 h-3.5 text-sky-400" />
                          <span>Fotos do Aparelho</span>
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sky-400">({editForm.photosProduct?.length || 0})</span>
                          {urlInputCategory === 'photosProduct' && (
                            <span className="text-[9px] bg-sky-500/20 text-sky-300 px-1 py-0.5 rounded font-mono">Ativo</span>
                          )}
                        </div>
                      </div>

                      {editForm.photosProduct && editForm.photosProduct.length > 0 ? (
                        <div className="grid grid-cols-3 gap-1.5">
                          {editForm.photosProduct.map((p, i) => (
                            <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-slate-700 group bg-slate-950">
                              <img 
                                src={p} 
                                className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openImageZoom(p, `Fotos do Aparelho - ${editForm.baseProductName}`, editForm.photosProduct, i);
                                }}
                                alt={`Aparelho ${i + 1}`}
                              />
                              <button 
                                type="button" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemovePhoto('photosProduct', i);
                                }}
                                className="absolute top-1 right-1 p-0.5 bg-rose-600/90 text-white rounded hover:bg-rose-500 transition-colors shadow-md cursor-pointer opacity-80 hover:opacity-100"
                                title="Remover foto"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div 
                          className="border border-dashed border-slate-800 hover:border-sky-500/50 rounded-lg p-2.5 text-center cursor-pointer transition-colors bg-slate-950/40"
                          onClick={(e) => {
                            e.stopPropagation();
                            setUrlInputCategory('photosProduct');
                          }}
                        >
                          <Upload className="w-4 h-4 mx-auto text-slate-500 mb-0.5" />
                          <p className="text-[11px] text-slate-300 font-semibold">Sem fotos do aparelho</p>
                          <p className="text-[9px] text-slate-500">Clique, arraste ou use Ctrl+V</p>
                        </div>
                      )}
                    </div>

                    {/* Box Photos */}
                    <div 
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleDropPhoto(e, 'photosBox')}
                      onPaste={(e) => handleEditModalPaste(e, 'photosBox')}
                      onClick={() => setUrlInputCategory('photosBox')}
                      className={`p-3 rounded-xl border transition-all space-y-2 ${
                        urlInputCategory === 'photosBox' 
                          ? 'bg-slate-900/90 border-sky-500/60 shadow-md shadow-sky-500/5 ring-1 ring-sky-500/30' 
                          : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex justify-between items-center text-[11px] font-bold text-slate-300 border-b border-slate-800 pb-1.5">
                        <span className="flex items-center gap-1.5">
                          <Package className="w-3.5 h-3.5 text-sky-400" />
                          <span>Fotos da Embalagem</span>
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sky-400">({editForm.photosBox?.length || 0})</span>
                          {urlInputCategory === 'photosBox' && (
                            <span className="text-[9px] bg-sky-500/20 text-sky-300 px-1 py-0.5 rounded font-mono">Ativo</span>
                          )}
                        </div>
                      </div>

                      {editForm.photosBox && editForm.photosBox.length > 0 ? (
                        <div className="grid grid-cols-3 gap-1.5">
                          {editForm.photosBox.map((p, i) => (
                            <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-slate-700 group bg-slate-950">
                              <img 
                                src={p} 
                                className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openImageZoom(p, `Fotos da Embalagem - ${editForm.baseProductName}`, editForm.photosBox, i);
                                }}
                                alt={`Caixa ${i + 1}`}
                              />
                              <button 
                                type="button" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemovePhoto('photosBox', i);
                                }}
                                className="absolute top-1 right-1 p-0.5 bg-rose-600/90 text-white rounded hover:bg-rose-500 transition-colors shadow-md cursor-pointer opacity-80 hover:opacity-100"
                                title="Remover foto"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div 
                          className="border border-dashed border-slate-800 hover:border-sky-500/50 rounded-lg p-2.5 text-center cursor-pointer transition-colors bg-slate-950/40"
                          onClick={(e) => {
                            e.stopPropagation();
                            setUrlInputCategory('photosBox');
                          }}
                        >
                          <Upload className="w-4 h-4 mx-auto text-slate-500 mb-0.5" />
                          <p className="text-[11px] text-slate-300 font-semibold">Sem fotos da caixa</p>
                          <p className="text-[9px] text-slate-500">Clique, arraste ou use Ctrl+V</p>
                        </div>
                      )}
                    </div>

                    {/* Accessories Photos */}
                    <div 
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleDropPhoto(e, 'photosAccessories')}
                      onPaste={(e) => handleEditModalPaste(e, 'photosAccessories')}
                      onClick={() => setUrlInputCategory('photosAccessories')}
                      className={`p-3 rounded-xl border transition-all space-y-2 ${
                        urlInputCategory === 'photosAccessories' 
                          ? 'bg-slate-900/90 border-sky-500/60 shadow-md shadow-sky-500/5 ring-1 ring-sky-500/30' 
                          : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex justify-between items-center text-[11px] font-bold text-slate-300 border-b border-slate-800 pb-1.5">
                        <span className="flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-sky-400" />
                          <span>Fotos dos Acessórios</span>
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sky-400">({editForm.photosAccessories?.length || 0})</span>
                          {urlInputCategory === 'photosAccessories' && (
                            <span className="text-[9px] bg-sky-500/20 text-sky-300 px-1 py-0.5 rounded font-mono">Ativo</span>
                          )}
                        </div>
                      </div>

                      {editForm.photosAccessories && editForm.photosAccessories.length > 0 ? (
                        <div className="grid grid-cols-3 gap-1.5">
                          {editForm.photosAccessories.map((p, i) => (
                            <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-slate-700 group bg-slate-950">
                              <img 
                                src={p} 
                                className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openImageZoom(p, `Fotos dos Acessórios - ${editForm.baseProductName}`, editForm.photosAccessories, i);
                                }}
                                alt={`Acessório ${i + 1}`}
                              />
                              <button 
                                type="button" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemovePhoto('photosAccessories', i);
                                }}
                                className="absolute top-1 right-1 p-0.5 bg-rose-600/90 text-white rounded hover:bg-rose-500 transition-colors shadow-md cursor-pointer opacity-80 hover:opacity-100"
                                title="Remover foto"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div 
                          className="border border-dashed border-slate-800 hover:border-sky-500/50 rounded-lg p-2.5 text-center cursor-pointer transition-colors bg-slate-950/40"
                          onClick={(e) => {
                            e.stopPropagation();
                            setUrlInputCategory('photosAccessories');
                          }}
                        >
                          <Upload className="w-4 h-4 mx-auto text-slate-500 mb-0.5" />
                          <p className="text-[11px] text-slate-300 font-semibold">Sem fotos de acessórios</p>
                          <p className="text-[9px] text-slate-500">Clique, arraste ou use Ctrl+V</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* VIEW MODE CONTENT */
              <div className="p-6 sm:p-8 space-y-6 overflow-y-auto max-h-[75vh]">
                
                {/* Duplicate warning banner inside detail modal */}
                {(isDuplicateSti(currentUnit) || isDuplicateSerial(currentUnit)) && (
                  <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-3 text-xs text-amber-200" id="unit-detail-duplicate-warning">
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                    <div>
                      <p className="font-bold text-amber-300">Atenção: Identificado Código Repetido no Estoque Físico</p>
                      <p className="text-[11px] text-amber-400/80 mt-0.5">
                        {isDuplicateSti(currentUnit) && `O Código STI (#${currentUnit.trackingCode}) já está cadastrado em outra unidade no estoque. `}
                        {isDuplicateSerial(currentUnit) && `O Número de Série (S/N: ${currentUnit.serialNumber}) já está cadastrado em outra unidade no estoque.`}
                      </p>
                    </div>
                  </div>
                )}

                {/* Baixado info banner inside detail modal */}
                {currentUnit.status === 'Baixado' && (
                  <div className={`p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs border ${
                    isLight 
                      ? 'bg-rose-50 border-rose-200 text-rose-900' 
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                  }`} id="unit-detail-baixado-banner">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        isLight ? 'bg-rose-100 border border-rose-300' : 'bg-rose-600/20 border border-rose-500/40'
                      }`}>
                        <CheckCircle2 className="w-5 h-5 text-rose-600" />
                      </div>
                      <div>
                        <p className={`font-bold text-sm ${isLight ? 'text-rose-950' : 'text-rose-300'}`}>
                          Produto com Baixa Efetuada (Saída Física do Galpão)
                        </p>
                        <p className={`text-[11px] font-mono mt-0.5 ${isLight ? 'text-rose-800 font-semibold' : 'text-rose-300/90'}`}>
                          Data de Saída: <strong className={isLight ? 'text-rose-950 font-black' : 'text-white'}>{formatDischargeDateTime(getDischargeDate(currentUnit))}</strong>
                        </p>
                      </div>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-rose-600 text-white font-black text-[10px] uppercase tracking-wider shrink-0 self-start sm:self-center shadow-xs">
                      Saída Registrada
                    </span>
                  </div>
                )}

                {/* Technical Specifications Hero Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 bg-slate-950 p-4 sm:p-5 border border-slate-800 rounded-2xl shadow-inner text-xs">
                  {/* SKU */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Código SKU</span>
                      <button
                        type="button"
                        onClick={(e) => handleCopyCode(currentUnit.baseProductSku, 'sku', e)}
                        className={`text-[10px] flex items-center gap-1 font-bold px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                          copiedCodeKey === 'sku'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'text-slate-400 hover:text-sky-400 hover:bg-slate-900'
                        }`}
                        title="Copiar Código SKU"
                        id="btn-copy-sku"
                      >
                        {copiedCodeKey === 'sku' ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-[9px]">Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span className="text-[9px]">Copiar</span>
                          </>
                        )}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => handleCopyCode(currentUnit.baseProductSku, 'sku', e)}
                      className="sku-badge w-full text-left font-mono text-xs sm:text-sm font-extrabold px-2.5 py-1.5 rounded-lg block truncate transition-colors cursor-pointer group flex items-center justify-between"
                      title="Clique para copiar SKU"
                    >
                      <span className="truncate">{currentUnit.baseProductSku}</span>
                      <Copy className="w-3 h-3 opacity-0 group-hover:opacity-60 text-sky-400 transition-opacity ml-1 shrink-0" />
                    </button>
                  </div>

                  {/* STI Tracking Code */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Código STI</span>
                      <button
                        type="button"
                        onClick={(e) => handleCopyCode(currentUnit.trackingCode.replace(/^#/, ''), 'sti', e)}
                        className={`text-[10px] flex items-center gap-1 font-bold px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                          copiedCodeKey === 'sti'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                        }`}
                        title="Copiar Código STI"
                        id="btn-copy-sti"
                      >
                        {copiedCodeKey === 'sti' ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-[9px]">Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span className="text-[9px]">Copiar</span>
                          </>
                        )}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => handleCopyCode(normalizeStiCode(currentUnit.trackingCode), 'sti', e)}
                      className="w-full text-left font-mono text-xs sm:text-sm font-bold text-slate-200 bg-slate-900 hover:bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-800 block truncate transition-colors cursor-pointer group flex items-center justify-between"
                      title="Clique para copiar Código STI"
                    >
                      <span className="truncate">{formatStiBadge(currentUnit.trackingCode)}</span>
                      <Copy className="w-3 h-3 opacity-0 group-hover:opacity-60 text-slate-300 transition-opacity ml-1 shrink-0" />
                    </button>
                  </div>

                  {/* Serial Number */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Nº de Série (S/N)</span>
                      {currentUnit.serialNumber ? (
                        <button
                          type="button"
                          onClick={(e) => handleCopyCode(currentUnit.serialNumber || '', 'serial', e)}
                          className={`text-[10px] flex items-center gap-1 font-bold px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                            copiedCodeKey === 'serial'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                          }`}
                          title="Copiar Nº de Série"
                          id="btn-copy-serial"
                        >
                          {copiedCodeKey === 'serial' ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span className="text-[9px]">Copiado!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span className="text-[9px]">Copiar</span>
                            </>
                          )}
                        </button>
                      ) : null}
                    </div>
                    {currentUnit.serialNumber ? (
                      <button
                        type="button"
                        onClick={(e) => handleCopyCode(currentUnit.serialNumber || '', 'serial', e)}
                        className="w-full text-left font-mono text-xs sm:text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 px-2.5 py-1.5 rounded-lg block truncate transition-colors cursor-pointer group flex items-center justify-between"
                        title="Clique para copiar Número de Série"
                      >
                        <span className="truncate">{currentUnit.serialNumber}</span>
                        <Copy className="w-3 h-3 opacity-0 group-hover:opacity-60 text-slate-300 transition-opacity ml-1 shrink-0" />
                      </button>
                    ) : (
                      <span className="font-mono text-xs sm:text-sm font-bold px-2.5 py-1.5 rounded-lg border block truncate text-slate-500 bg-slate-900/50 border-slate-800/60 italic">
                        Não Informado
                      </span>
                    )}
                  </div>

                  {/* Voltage */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Voltagem</span>
                    {currentUnit.baseProductVoltage && currentUnit.baseProductVoltage !== 'N/A' ? (
                      <span className="font-mono text-xs sm:text-sm font-extrabold text-amber-300 bg-amber-500/10 px-2.5 py-1.5 rounded-lg border border-amber-500/25 block truncate">
                        {currentUnit.baseProductVoltage}
                      </span>
                    ) : (
                      <span className="font-mono text-xs sm:text-sm font-bold px-2.5 py-1.5 rounded-lg border block truncate text-slate-500 bg-slate-900/50 border-slate-800/60 italic">
                        Não informada
                      </span>
                    )}
                  </div>

                  {/* Sector */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Setor Físico</span>
                    <span className={`text-xs font-bold px-2.5 py-1.5 rounded-lg border block truncate ${
                      currentUnit.destinationSector === 'Principal'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : currentUnit.destinationSector === 'Openbox'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    }`}>
                      {currentUnit.destinationSector}
                    </span>
                    {currentUnit.originSector && (
                      <div className="flex items-center gap-1 text-[10.5px] text-amber-400 font-semibold pt-0.5" title={`Transferido de ${currentUnit.originSector}`}>
                        <ArrowRightLeft className="w-3 h-3 text-amber-400 shrink-0" />
                        <span>Origem: <strong className="text-amber-300 font-bold">{currentUnit.originSector}</strong></span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Secondary metadata: Origin & Dates */}
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-slate-950/60 p-3.5 px-4 rounded-xl border border-slate-800/60">
                  <div className="flex flex-wrap items-center gap-3">
                    {currentUnit.platform ? (
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 font-semibold text-[11px]">Plataforma / Canal:</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getPlatformStyle(currentUnit.platform)}`}>
                          {currentUnit.platform}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 font-semibold text-[11px]">Plataforma / Canal:</span>
                        <span className="text-slate-500 text-[10px] italic">Não informada</span>
                      </div>
                    )}
                    {currentUnit.orderNumber && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400 font-semibold text-[11px]">Nº Pedido:</span>
                        <button
                          type="button"
                          onClick={(e) => handleCopyCode(currentUnit.orderNumber || '', 'order', e)}
                          className="font-mono text-[11px] font-bold text-sky-400 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 px-2 py-0.5 rounded transition-colors cursor-pointer group flex items-center gap-1"
                          title="Clique para copiar Número do Pedido"
                        >
                          <span>{currentUnit.orderNumber}</span>
                          <Copy className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100 transition-opacity" />
                        </button>
                      </div>
                    )}
                    {currentUnit.pendingRegistrationNumber && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400 font-semibold text-[11px]">Nº Pendência:</span>
                        <button
                          type="button"
                          onClick={(e) => handleCopyCode(currentUnit.pendingRegistrationNumber || '', 'pendingReg', e)}
                          className="font-mono text-[11px] font-bold text-sky-400 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 px-2 py-0.5 rounded transition-colors cursor-pointer group flex items-center gap-1"
                          title="Clique para copiar Número de Registro de Pendência"
                        >
                          <Hash className="w-2.5 h-2.5 text-sky-400" />
                          <span>{currentUnit.pendingRegistrationNumber}</span>
                          <Copy className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100 transition-opacity" />
                        </button>
                      </div>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <span>Data de Entrada: <strong className="text-slate-200">{new Date(currentUnit.createdAt).toLocaleDateString('pt-BR')} às {new Date(currentUnit.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</strong></span>
                      </div>
                      {currentUnit.originSector && (
                        <>
                          <span className="text-slate-600 hidden sm:inline">•</span>
                          <div className="flex items-center gap-1.5 text-amber-400" title={`Produto transferido do estoque ${currentUnit.originSector}`}>
                            <ArrowRightLeft className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span>Estoque de Origem: <strong className="text-amber-300 font-bold">{currentUnit.originSector}</strong></span>
                          </div>
                        </>
                      )}
                      {currentUnit.initialEntryDate && (
                        <>
                          <span className="text-slate-600 hidden sm:inline">•</span>
                          <div className="flex items-center gap-1.5 text-slate-400" title="Data do primeiro registro no sistema antes da transferência de estoque">
                            <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            <span>Entrada Inicial: <strong className="text-slate-200">{new Date(currentUnit.initialEntryDate).toLocaleDateString('pt-BR')} às {new Date(currentUnit.initialEntryDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</strong></span>
                          </div>
                        </>
                      )}
                      {currentUnit.status === 'Baixado' && (
                        <>
                          <span className="text-slate-600 hidden sm:inline">•</span>
                          <div className="flex items-center gap-1.5 text-rose-400">
                            <CheckCircle2 className="w-3.5 h-3.5 text-rose-500" />
                            <span>Data de Saída: <strong className="text-rose-300 font-bold">{formatDischargeDateTime(getDischargeDate(currentUnit))}</strong></span>
                          </div>
                        </>
                      )}
                      {currentUnit.createdBy && (currentUnit.createdBy.name || currentUnit.createdBy.email) && (
                        <>
                          <span className="text-slate-600 hidden sm:inline">•</span>
                          <div className="flex items-center gap-1.5 text-slate-400">
                            <User className="w-3.5 h-3.5 text-sky-400" />
                            <span>Entrada por: <strong className="text-sky-300 font-semibold">{currentUnit.createdBy.name || currentUnit.createdBy.email}</strong></span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-slate-400 text-[11px]">
                    <span>Aparelho: <strong className="text-slate-200 font-bold">{currentUnit.deviceStatus}</strong></span>
                    <span className="text-slate-600">•</span>
                    <span>Embalagem: <strong className="text-slate-200 font-bold">{currentUnit.packageStatus}</strong></span>
                  </div>
                </div>

                {/* Claims and Accessories details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-5 bg-slate-950/60 rounded-xl border border-slate-800/60 space-y-2.5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      Motivo da Devolução (Cliente)
                    </h4>
                    <p className="text-sm text-slate-200 leading-relaxed italic bg-slate-900/60 p-3.5 rounded-lg border border-slate-800/40">
                      "{currentUnit.customerReason || 'Sem motivo registrado.'}"
                    </p>
                  </div>

                  <div className="p-5 bg-slate-950/60 rounded-xl border border-slate-800/60 space-y-2.5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                      <Info className="w-4 h-4 text-sky-400" />
                      Lista de Acessórios Recebidos
                    </h4>
                    <p className="text-sm text-slate-200 leading-relaxed bg-slate-900/60 p-3.5 rounded-lg border border-slate-800/40">
                      {currentUnit.accessoriesInclusion || 'Nenhum acessório declarado.'}
                    </p>
                  </div>
                </div>

                {/* Technical Report / Observations HTML Render */}
                <div className="space-y-2.5" id="technical-report-view">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-sky-400" />
                    Laudo Técnico de Entrada (Triador)
                  </h4>
                  {currentUnit.notes ? (
                    <div 
                      className="p-5 bg-slate-950 border border-slate-800/60 rounded-xl text-sm text-slate-200 leading-relaxed max-h-64 overflow-y-auto prose prose-invert prose-sm"
                      dangerouslySetInnerHTML={{ __html: currentUnit.notes }}
                    />
                  ) : (
                    <p className="p-5 text-xs text-slate-500 bg-slate-950 rounded-xl border border-slate-800/60 italic text-center">Sem laudo técnico descritivo fornecido.</p>
                  )}
                </div>

                {/* Integrated Photo Gallery split by logical category (Last element in modal view) */}
                {(() => {
                  const resolved = getUnitResolvedPhotos(currentUnit, products);
                  return (
                    <div className="space-y-3" id="photo-gallery-modal-view">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4 text-sky-400" />
                          Galeria de Fotos da Triagem
                        </h4>
                        <div className="flex items-center gap-2">
                          {resolved.isUsingBaseProductImage && (
                            <span className="text-[10px] text-sky-400 bg-sky-500/10 border border-sky-500/30 px-2 py-0.5 rounded font-bold">
                              Vinculado ao Catálogo Base (Sem duplicação de dados)
                            </span>
                          )}
                          {currentUnit.destinationSector === 'Principal' && (
                            <button
                              type="button"
                              onClick={() => handleStartEdit(currentUnit)}
                              className="px-2.5 py-1 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                              title="Alterar opções de fotos (Base, Salvas ou Combinadas)"
                            >
                              <Pencil className="w-3 h-3" />
                              Opções de Imagens
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" id="gallery-categories">
                        {/* Category A: Product */}
                        <div className="p-4 bg-slate-950/40 rounded-xl border border-slate-800/60 space-y-2.5">
                          <span className="text-xs font-bold text-slate-300 block border-b border-slate-800 pb-1.5">
                            Fotos do Aparelho ({resolved.photosProduct.length})
                          </span>
                          {resolved.photosProduct.length > 0 ? (
                            <div className="grid grid-cols-2 gap-2">
                              {resolved.photosProduct.map((p, i) => (
                                <div 
                                  key={i} 
                                  onClick={() => openImageZoom(p, `Fotos do Aparelho - ${currentUnit.baseProductName}`, resolved.photosProduct, i)}
                                  className="w-full aspect-video rounded-lg overflow-hidden border border-slate-700 hover:border-sky-500 cursor-pointer relative group transition-colors photo-container-clean !bg-white flex items-center justify-center p-1 shadow-sm"
                                  style={{ backgroundColor: '#ffffff' }}
                                >
                                  <img src={p} className="w-full h-full object-contain" />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs transition-opacity rounded-lg">
                                    <Eye className="w-4 h-4" />
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-500 italic py-4 text-center">Nenhuma foto do aparelho.</p>
                          )}
                        </div>

                        {/* Category B: Box */}
                        <div className="p-4 bg-slate-950/40 rounded-xl border border-slate-800/60 space-y-2.5">
                          <span className="text-xs font-bold text-slate-300 block border-b border-slate-800 pb-1.5">
                            Fotos da Embalagem ({resolved.photosBox.length})
                          </span>
                          {resolved.photosBox.length > 0 ? (
                            <div className="grid grid-cols-2 gap-2">
                              {resolved.photosBox.map((p, i) => (
                                <div 
                                  key={i} 
                                  onClick={() => openImageZoom(p, `Fotos da Embalagem - ${currentUnit.baseProductName}`, resolved.photosBox, i)}
                                  className="w-full aspect-video rounded-lg overflow-hidden border border-slate-700 hover:border-sky-500 cursor-pointer relative group transition-colors photo-container-clean !bg-white flex items-center justify-center p-1 shadow-sm"
                                  style={{ backgroundColor: '#ffffff' }}
                                >
                                  <img src={p} className="w-full h-full object-contain" />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs transition-opacity rounded-lg">
                                    <Eye className="w-4 h-4" />
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-500 italic py-4 text-center">Nenhuma foto da caixa.</p>
                          )}
                        </div>

                        {/* Category C: Accessories */}
                        <div className="p-4 bg-slate-950/40 rounded-xl border border-slate-800/60 space-y-2.5">
                          <span className="text-xs font-bold text-slate-300 block border-b border-slate-800 pb-1.5">
                            Fotos dos Acessórios ({resolved.photosAccessories.length})
                          </span>
                          {resolved.photosAccessories.length > 0 ? (
                            <div className="grid grid-cols-2 gap-2">
                              {resolved.photosAccessories.map((p, i) => (
                                <div 
                                  key={i} 
                                  onClick={() => openImageZoom(p, `Fotos dos Acessórios - ${currentUnit.baseProductName}`, resolved.photosAccessories, i)}
                                  className="w-full aspect-video rounded-lg overflow-hidden border border-slate-700 hover:border-sky-500 cursor-pointer relative group transition-colors photo-container-clean !bg-white flex items-center justify-center p-1 shadow-sm"
                                  style={{ backgroundColor: '#ffffff' }}
                                >
                                  <img src={p} className="w-full h-full object-contain" />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs transition-opacity rounded-lg">
                                    <Eye className="w-4 h-4" />
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-500 italic py-4 text-center">Nenhuma foto de acessórios.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Checkout details if already dispatched */}
                {currentUnit.status === 'Baixado' && currentUnit.checkoutDate && (
                  <div className="p-4 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Este produto foi retirado física e logicamente do galpão em <strong>{new Date(currentUnit.checkoutDate).toLocaleString('pt-BR')}</strong>.</span>
                  </div>
                )}
              </div>
            )}

            {/* Modal Action Controls Bar */}
            <div className="px-6 py-4 bg-slate-950 border-t border-slate-800/60 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              
              {/* Left Side Actions: Re-route / Move Sector (only if active in stock) */}
              {currentUnit.status === 'Estoque' ? (
                <div className="flex items-center gap-2.5 w-full sm:w-auto">
                  <span className="text-xs font-bold text-slate-400 whitespace-nowrap">Mover de Setor:</span>
                  <select 
                    value={editingSector || currentUnit.destinationSector}
                    onChange={(e) => handleMoveSector(currentUnit, e.target.value as DestinationSectorType)}
                    className="px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-bold focus:outline-none cursor-pointer"
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
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-lg shadow-emerald-600/20 flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isSavingEdit ? 'Salvando...' : 'Salvar Alterações'}</span>
                  </button>
                ) : (
                  <>
                    {enableSpreadsheetExport && (
                      <button 
                        type="button"
                        onClick={() => handleExportExcel([currentUnit])}
                        className="px-3.5 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                        title="Exportar este produto para planilha Excel (.xlsx)"
                        id="btn-modal-export-unit"
                      >
                        <Download className="w-3.5 h-3.5 text-sky-400" />
                        <span>Exportar Excel</span>
                      </button>
                    )}

                    <button 
                      onClick={() => handleDelete(currentUnit.id)}
                      className="px-3.5 py-2 bg-slate-800 hover:bg-rose-600/20 text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                      title="Apagar ficha técnica do banco"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Excluir Registro
                    </button>

                    {currentUnit.status === 'Estoque' ? (
                      <button 
                        onClick={() => handleCheckout(currentUnit.id)}
                        className="px-4.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-lg shadow-emerald-600/20 flex items-center gap-1.5 transition-all cursor-pointer"
                        id="btn-stock-checkout"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Dar Baixa de Estoque
                      </button>
                    ) : (
                      <button 
                        onClick={() => handleRevertCheckout(currentUnit.id)}
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-black shadow-lg shadow-amber-600/20 flex items-center gap-1.5 transition-all cursor-pointer"
                        id="btn-stock-revert-checkout"
                        title="Reverter a baixa e retornar este produto para o estoque ativo"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Reverter Baixa
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Image Zoom Lightbox Modal with Loupe Magnifier */}
      <ImageZoomModal 
        isOpen={!!fullscreenImage}
        onClose={() => setFullscreenImage(null)}
        imageUrl={fullscreenImage}
        imageTitle={fullscreenImageTitle || (currentUnit ? `${currentUnit.baseProductName} (${currentUnit.baseProductSku})` : 'Foto da Triagem')}
        imagesList={fullscreenImageList}
        currentIndex={fullscreenImageIndex}
        onNavigate={handleNavigateZoomImage}
      />

      {/* Sector Transfer with Photo Choice Modal (When moving to Estoque Principal) */}
      {transferModalData && (
        <div 
          className="fixed inset-0 z-[120] bg-black/85 flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) setTransferModalData(null);
          }}
        >
          <div 
            className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 shrink-0">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Transferência para Estoque Principal</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {transferModalData.unit.baseProductName} ({transferModalData.unit.sti || transferModalData.unit.trackingCode})
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setTransferModalData(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300 leading-relaxed">
              Este produto veio de outro armazém (<strong>{transferModalData.unit.destinationSector}</strong>) e já possui <strong>{transferModalData.savedPhotosCount} foto(s) cadastrada(s)</strong>.
              <br />
              Escolha a opção de imagem para o <strong>Estoque Principal</strong>:
            </div>

            {/* 3 Interactive Photo Strategy Cards */}
            <div className="space-y-2.5">
              {/* Option 1: Keep Saved Photos */}
              <div 
                onClick={() => handleConfirmTransferWithPhotoChoice('keep_saved')}
                className="p-3.5 bg-slate-950 hover:bg-emerald-950/30 border border-slate-800 hover:border-emerald-500/50 rounded-xl transition-all cursor-pointer flex items-center justify-between gap-3 group"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Camera className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-white group-hover:text-emerald-300">
                      1. Manter Fotos Já Cadastradas
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Preserva exatamente as fotos reais salvas na triagem deste item.
                  </p>
                </div>
                {transferModalData.unit.photosProduct?.[0] && (
                  <img 
                    src={transferModalData.unit.photosProduct[0]} 
                    alt="Salva" 
                    className="w-12 h-12 rounded-lg object-cover border border-slate-700 shrink-0 group-hover:scale-105 transition-transform" 
                  />
                )}
              </div>

              {/* Option 2: Use Base Product Image */}
              {(() => {
                const baseImgs = getBaseProductImages(transferModalData.baseProduct);
                return (
                  <div 
                    onClick={() => handleConfirmTransferWithPhotoChoice('use_base')}
                    className="p-3.5 bg-slate-950 hover:bg-sky-950/30 border border-slate-800 hover:border-sky-500/50 rounded-xl transition-all cursor-pointer flex items-center justify-between gap-3 group"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <ImageIcon className="w-4 h-4 text-sky-400" />
                        <span className="text-xs font-bold text-white group-hover:text-sky-300">
                          2. Usar Imagem do Catálogo Base
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Aplica a foto oficial cadastrada no Catálogo Base (sem duplicação de dados).
                      </p>
                    </div>
                    {baseImgs.main && (
                      <img 
                        src={baseImgs.main} 
                        alt="Base" 
                        className="w-12 h-12 rounded-lg object-cover border border-slate-700 shrink-0 group-hover:scale-105 transition-transform" 
                      />
                    )}
                  </div>
                );
              })()}

              {/* Option 3: Combine Both */}
              {(() => {
                const baseImgs = getBaseProductImages(transferModalData.baseProduct);
                return (
                  <div 
                    onClick={() => handleConfirmTransferWithPhotoChoice('combine')}
                    className="p-3.5 bg-slate-950 hover:bg-amber-950/30 border border-slate-800 hover:border-amber-500/50 rounded-xl transition-all cursor-pointer flex items-center justify-between gap-3 group"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-amber-400" />
                        <span className="text-xs font-bold text-white group-hover:text-amber-300">
                          3. Usar Ambas (Combinar Imagens)
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Mantém as fotos já salvas E inclui as fotos oficiais do catálogo base.
                      </p>
                    </div>
                    <div className="flex -space-x-3 shrink-0">
                      {transferModalData.unit.photosProduct?.[0] && (
                        <img 
                          src={transferModalData.unit.photosProduct[0]} 
                          alt="Salva" 
                          className="w-10 h-10 rounded-lg object-cover border-2 border-slate-900 group-hover:scale-105 transition-transform" 
                        />
                      )}
                      {baseImgs.main && (
                        <img 
                          src={baseImgs.main} 
                          alt="Base" 
                          className="w-10 h-10 rounded-lg object-cover border-2 border-slate-900 group-hover:scale-105 transition-transform" 
                        />
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setTransferModalData(null)}
                className="px-4 py-2 bg-slate-850 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Cancelar Transferência
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Confirmation Modal */}
      {confirmConfig && (
        <div 
          className="fixed inset-0 z-[110] bg-black/85 flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmConfig(null);
          }}
        >
          <div 
            className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
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
        existingUnits={units}
        onImportUnits={handleImportBatchUnits}
        defaultSector={activeTab === 'Openbox' ? 'Openbox' : activeTab === 'RMA' ? 'RMA' : activeTab === 'Principal' ? 'Principal' : 'Openbox'}
      />
    </div>
  );
}
