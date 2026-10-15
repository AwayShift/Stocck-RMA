/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  Package, 
  Tag, 
  Search, 
  X, 
  ChevronDown, 
  Check, 
  AlertTriangle, 
  GitCompare, 
  Save, 
  Upload, 
  Hash, 
  ArrowRightLeft, 
  FileText, 
  Camera, 
  Image as ImageIcon, 
  ClipboardPaste, 
  RefreshCw, 
  ShieldCheck, 
  Layers, 
  Pencil,
  Sparkles
} from 'lucide-react';
import { 
  TriageUnit, 
  DestinationSectorType, 
  PlatformType, 
  BaseProduct, 
  DeviceStatusType, 
  PackageStatusType, 
  PendingItem 
} from '../types';
import { 
  getBaseProductImages, 
  findBaseProduct, 
  getResolvedUnitProductName 
} from '../utils/productImages';
import { uploadFileToStorage, uploadImageUrlToStorage } from '../lib/dbService';
import { RichTextEditor } from './RichTextEditor';
import { 
  formatStiInput, 
  isValidStiCode, 
  normalizeStiCode 
} from '../utils/stiFormatter';
import { 
  validatePendingItemLink, 
  findPendingItemByRegistrationNumber 
} from '../utils/pendingRegistrationHelper';
import { 
  inspectOrderNumber, 
  detectPlatformFromOrderNumber, 
  normalizeOrderNumberForPlatform 
} from '../utils/orderPlatformHelper';

export const isRealStockTransfer = (originSector?: string): boolean => {
  if (!originSector) return false;
  const s = originSector.trim().toLowerCase();
  if (s === 'pendências' || s === 'pendencias' || s === 'sem setor' || s === '') return false;
  return ['principal', 'estoque principal', 'rma', 'openbox', 'outros', 'outro'].includes(s);
};

export interface StockUnitEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  unit: TriageUnit;
  products?: BaseProduct[];
  pendingItems?: PendingItem[];
  units?: TriageUnit[];
  isLight?: boolean;
  onSave: (updatedUnit: TriageUnit) => Promise<void>;
  onCompareWithBase?: () => void;
  onOpenImageZoom?: (imageUrl: string, title: string, imagesList: string[], index: number) => void;
}

export function StockUnitEditModal({
  isOpen,
  onClose,
  unit,
  products = [],
  pendingItems = [],
  units = [],
  isLight = false,
  onSave,
  onCompareWithBase,
  onOpenImageZoom
}: StockUnitEditModalProps) {
  const [editForm, setEditForm] = useState<TriageUnit | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Photos & Media
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [isSanitizingUrl, setIsSanitizingUrl] = useState(false);
  const [urlInputCategory, setUrlInputCategory] = useState<'photosProduct' | 'photosBox' | 'photosAccessories'>('photosProduct');

  // Custom Status
  const [isCustomEditDeviceStatus, setIsCustomEditDeviceStatus] = useState(false);
  const [customEditDeviceStatusText, setCustomEditDeviceStatusText] = useState('');
  const [isCustomEditPackageStatus, setIsCustomEditPackageStatus] = useState(false);
  const [customEditPackageStatusText, setCustomEditPackageStatusText] = useState('');

  // Pending selector
  const [isEditPendingSelectorOpen, setIsEditPendingSelectorOpen] = useState(false);
  const editPendingSelectorRef = useRef<HTMLDivElement>(null);

  // SKU Autocomplete
  const [isEditSkuDropdownOpen, setIsEditSkuDropdownOpen] = useState(false);
  const [editSkuSearchTerm, setEditSkuSearchTerm] = useState('');
  const editSkuDropdownRef = useRef<HTMLDivElement>(null);
  const lastUnitIdRef = useRef<string | null>(null);

  // Initialize form state when unit changes or modal opens
  useEffect(() => {
    if (!isOpen || !unit) {
      setEditForm(null);
      lastUnitIdRef.current = null;
      return;
    }

    // If modal is already open and initialized for this exact unit, preserve existing form edits across background re-renders
    if (lastUnitIdRef.current === unit.id) {
      return;
    }
    lastUnitIdRef.current = unit.id;

    const catalogProduct = products.find(p => (unit.baseProductId && p.id === unit.baseProductId) || (unit.baseProductSku && p.sku === unit.baseProductSku));
    const resolvedSku = unit.baseProductSku || (unit as any).sku || catalogProduct?.sku || '';
    const resolvedName = getResolvedUnitProductName(unit, products);
    const sanitizedOriginSector = isRealStockTransfer(unit.originSector) ? unit.originSector : undefined;

    setEditForm({
      ...unit,
      originSector: sanitizedOriginSector,
      baseProductName: resolvedName,
      baseProductSku: resolvedSku,
      platform: (((unit.platform as string) === 'Outro' ? 'Outros' : unit.platform) || '') as any,
    });

    const STANDARD_DEVICE_STATUSES = ['Novo', 'Usado', 'Com Avaria', 'Peças'];
    const isCustomDev = Boolean(unit.deviceStatus) && !STANDARD_DEVICE_STATUSES.includes(unit.deviceStatus);
    setIsCustomEditDeviceStatus(isCustomDev);
    setCustomEditDeviceStatusText(isCustomDev ? unit.deviceStatus : '');

    const STANDARD_PACKAGE_STATUSES = ['Perfeita', 'Usada', 'Sem Caixa', 'Danificada', 'Sem Embalagem'];
    const isCustomPkg = Boolean(unit.packageStatus) && !STANDARD_PACKAGE_STATUSES.includes(unit.packageStatus);
    setIsCustomEditPackageStatus(isCustomPkg);
    setCustomEditPackageStatusText(isCustomPkg ? unit.packageStatus : '');

    setEditSkuSearchTerm(resolvedSku);
    setIsEditSkuDropdownOpen(false);
    setIsEditPendingSelectorOpen(false);
    setActionError(null);
    setActionSuccess(null);
  }, [isOpen, unit, products]);

  // Click outside listener for dropdowns
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (editPendingSelectorRef.current && !editPendingSelectorRef.current.contains(event.target as Node)) {
        setIsEditPendingSelectorOpen(false);
      }
      if (editSkuDropdownRef.current && !editSkuDropdownRef.current.contains(event.target as Node)) {
        setIsEditSkuDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter products by SKU or Name for the edit modal autocomplete
  const filteredEditProducts = useMemo(() => {
    if (!products || products.length === 0) return [];
    const term = (editSkuSearchTerm || editForm?.baseProductSku || '').trim().toLowerCase();
    if (!term) return products;
    return products.filter(p =>
      (p.sku && p.sku.toLowerCase().includes(term)) ||
      (p.name && p.name.toLowerCase().includes(term))
    ).sort((a, b) => {
      const aExact = a.sku?.toLowerCase() === term;
      const bExact = b.sku?.toLowerCase() === term;
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      const aStarts = a.sku?.toLowerCase().startsWith(term);
      const bStarts = b.sku?.toLowerCase().startsWith(term);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [products, editSkuSearchTerm, editForm?.baseProductSku]);

  // Check if current editForm product matches a registered item in the base catalog
  const matchedBaseProductInEdit = useMemo(() => {
    if (!editForm || !products || products.length === 0) return null;
    if (editForm.baseProductId && editForm.baseProductId !== 'unregistered' && !editForm.baseProductId.startsWith('unregistered-')) {
      const byId = products.find(p => p.id === editForm.baseProductId);
      if (byId) return byId;
    }
    const currentSku = (editForm.baseProductSku || '').trim().toLowerCase();
    if (currentSku) {
      return products.find(p => p.sku && p.sku.trim().toLowerCase() === currentSku) || null;
    }
    return null;
  }, [editForm?.baseProductId, editForm?.baseProductSku, products]);

  // Fill basic information from base catalog product into the unit being edited
  const handleSelectEditBaseProduct = (p: BaseProduct) => {
    if (!editForm) return;
    const baseImgs = getBaseProductImages(p);
    const hasPhotosProduct = (editForm.photosProduct?.length || 0) > 0;
    const hasPhotosBox = (editForm.photosBox?.length || 0) > 0;
    const hasPhotosAccessories = (editForm.photosAccessories?.length || 0) > 0;

    setEditForm({
      ...editForm,
      baseProductId: p.id,
      baseProductSku: p.sku,
      baseProductName: p.name,
      baseProductVoltage: (p.voltage && p.voltage !== 'N/A' ? p.voltage : (editForm.baseProductVoltage || 'Bivolt')),
      needsSkuRegistration: false,
      skuRegistrationPending: false,
      unregisteredSku: undefined,
      unregisteredProductName: undefined,
      photosProduct: !hasPhotosProduct && baseImgs.productPhotos.length > 0 
        ? [...baseImgs.productPhotos] 
        : editForm.photosProduct,
      photosBox: !hasPhotosBox && baseImgs.boxPhotos.length > 0
        ? [...baseImgs.boxPhotos]
        : editForm.photosBox,
      photosAccessories: !hasPhotosAccessories && baseImgs.accessoriesPhotos.length > 0
        ? [...baseImgs.accessoriesPhotos]
        : editForm.photosAccessories,
    });
    setEditSkuSearchTerm(p.sku);
    setIsEditSkuDropdownOpen(false);
  };

  const handleClearEditSku = () => {
    if (!editForm) return;
    setEditSkuSearchTerm('');
    setEditForm({
      ...editForm,
      baseProductSku: '',
      baseProductId: '',
    });
    setIsEditSkuDropdownOpen(true);
  };

  const cleanSku = (val?: string) => {
    if (!val) return '';
    let s = val.trim().toUpperCase();
    const m = s.match(/^\[(.*?)\]/);
    if (m && m[1]) s = m[1].trim().toUpperCase();
    return s;
  };

  const availableEditPendingItems = useMemo(() => {
    if (!pendingItems || pendingItems.length === 0 || !editForm) return [];
    
    let currentSku = (editForm.baseProductSku || (editForm as any).sku || '').trim();
    if (!currentSku && editForm.baseProductId) {
      const prod = products.find(p => p.id === editForm.baseProductId);
      if (prod?.sku) currentSku = prod.sku;
    }
    const normalizedSku = cleanSku(currentSku);
    if (!normalizedSku) return [];

    return pendingItems.filter((item) => {
      if (item.status === 'Cancelado') return false;

      const itemSku = cleanSku(item.sku);
      if (!itemSku || itemSku !== normalizedSku) return false;

      const isAlreadyLinkedToThisUnit = 
        Boolean(editForm.id && item.linkedUnitId && item.linkedUnitId === editForm.id) ||
        Boolean(editForm.pendingItemId && item.id === editForm.pendingItemId) ||
        Boolean(editForm.pendingRegistrationNumber && item.registrationNumber && cleanSku(editForm.pendingRegistrationNumber) === cleanSku(item.registrationNumber));

      if (isAlreadyLinkedToThisUnit) return true;

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

  const detectedEditOrderInfo = useMemo(() => {
    if (!editForm?.orderNumber) return null;
    return inspectOrderNumber(editForm.orderNumber, editForm.platform);
  }, [editForm?.orderNumber, editForm?.platform]);

  const handleEditOrderNumberChange = (raw: string) => {
    setEditForm(prev => {
      if (!prev) return null;
      const detection = inspectOrderNumber(raw, prev.platform);
      return {
        ...prev,
        orderNumber: raw,
        platform: (detection ? detection.platform : prev.platform) as any
      };
    });
  };

  const handleEditOrderNumberBlur = () => {
    setEditForm(prev => {
      if (!prev) return null;
      const normalized = normalizeOrderNumberForPlatform(prev.orderNumber || '', prev.platform);
      const detected = detectPlatformFromOrderNumber(normalized, prev.platform);
      return {
        ...prev,
        orderNumber: normalized,
        platform: (detected ? detected : prev.platform) as any
      };
    });
  };

  // Photo uploads
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
            setActionSuccess(`Link de imagem colado e enviado ao armazenamento para Fotos do ${catLabel}!`);
            setTimeout(() => setActionSuccess(null), 3000);
            return;
          } catch (urlErr: any) {
            setActionError(urlErr?.message || 'Erro ao enviar imagem colada ao armazenamento.');
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

    if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
      for (let i = 0; i < e.clipboardData.files.length; i++) {
        const file = e.clipboardData.files[i];
        if (file.type.indexOf('image/') !== -1) {
          imageFiles.push(file);
        }
      }
    }

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
    if (!isOpen || !editForm) return;
    const handleGlobalPaste = (e: ClipboardEvent) => {
      // Don't intercept paste if user is focused inside an input, textarea or rich text editor
      const activeEl = document.activeElement;
      if (activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        activeEl.getAttribute('contenteditable') === 'true' || 
        Boolean(activeEl.closest('[contenteditable="true"]'))
      )) {
        return;
      }

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
  }, [isOpen, urlInputCategory, Boolean(editForm)]);

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
      setActionSuccess(`Foto via link enviada com sucesso para Fotos do ${catLabel}!`);
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err: any) {
      setActionError(err?.message || 'Erro ao validar e enviar imagem por link.');
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

  const handleSave = async () => {
    if (!editForm) return;
    setIsSavingEdit(true);
    try {
      let updatedForm = { ...editForm };
      
      if (isCustomEditDeviceStatus || editForm.deviceStatus === 'Descrever') {
        updatedForm.deviceStatus = (customEditDeviceStatusText.trim() || 'Descrever') as any;
      }
      if (isCustomEditPackageStatus || editForm.packageStatus === 'Descrever') {
        updatedForm.packageStatus = (customEditPackageStatusText.trim() || 'Descrever') as any;
      }

      const rawPlatform = editForm.platform || '';
      updatedForm.platform = (rawPlatform === 'Outro' ? 'Outros' : rawPlatform) as any;

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
      
      if (updatedForm.destinationSector === 'Principal' && (!updatedForm.photosProduct || updatedForm.photosProduct.length === 0)) {
        const baseProd = findBaseProduct(updatedForm, products);
        const baseImgs = getBaseProductImages(baseProd);
        if (baseImgs.productPhotos.length > 0) {
          updatedForm.photosProduct = baseImgs.productPhotos;
        }
      }

      if (updatedForm.destinationSector === 'Openbox') {
        const normSti = normalizeStiCode(updatedForm.trackingCode);
        if (!normSti) {
          setActionError('O Código STI é obrigatório para produtos no setor Openbox. Por favor, preencha o código STI.');
          setIsSavingEdit(false);
          setTimeout(() => setActionError(null), 5000);
          return;
        }
        if (!isValidStiCode(normSti)) {
          setActionError('Código STI inválido. O formato obrigatório é a combinação de STI + 6 números (Ex: STI134920).');
          setIsSavingEdit(false);
          setTimeout(() => setActionError(null), 5000);
          return;
        }
        const isDuplicate = units.some(u => 
          u.id !== updatedForm.id && 
          u.status === 'Estoque' && 
          normalizeStiCode(u.trackingCode) === normSti
        );
        if (isDuplicate) {
          setActionError(`O Código STI "${normSti}" já está cadastrado em outra unidade ativa no estoque.`);
          setIsSavingEdit(false);
          setTimeout(() => setActionError(null), 5000);
          return;
        }
        updatedForm.trackingCode = normSti;
      } else if (updatedForm.destinationSector === 'Outros') {
        const normSti = updatedForm.trackingCode ? normalizeStiCode(updatedForm.trackingCode) : '';
        updatedForm.trackingCode = normSti || (updatedForm.trackingCode ? updatedForm.trackingCode.trim() : '');
      } else {
        updatedForm.trackingCode = '';
      }

      const originalSector = unit?.destinationSector;
      const isSectorTransferred = Boolean(originalSector && originalSector !== updatedForm.destinationSector);
      if (isSectorTransferred) {
        const transferMoment = new Date().toISOString();
        const previousInitialDate = updatedForm.initialEntryDate || unit?.initialEntryDate || updatedForm.createdAt || unit?.createdAt;
        updatedForm.originSector = originalSector;
        updatedForm.initialEntryDate = previousInitialDate;
        updatedForm.transferredAt = transferMoment;
        updatedForm.createdAt = transferMoment;
        updatedForm.updatedAt = transferMoment;
        updatedForm.excludeFromDailyCount = false;
      } else if (!isRealStockTransfer(updatedForm.originSector)) {
        updatedForm.originSector = undefined;
      }

      const cleanSkuVal = (updatedForm.baseProductSku || '').trim().toLowerCase();
      const matchedCatalog = products.find(p => p.sku && p.sku.trim().toLowerCase() === cleanSkuVal);
      if (matchedCatalog) {
        if (!updatedForm.baseProductId || updatedForm.baseProductId === 'unregistered' || updatedForm.baseProductId.startsWith('unregistered-')) {
          updatedForm.baseProductId = matchedCatalog.id;
        }
        updatedForm.needsSkuRegistration = false;
        updatedForm.skuRegistrationPending = false;
        updatedForm.unregisteredSku = undefined;
        updatedForm.unregisteredProductName = undefined;
      }

      const currentName = updatedForm.baseProductName?.trim();
      const isGeneric = !currentName || 
        currentName.toLowerCase() === 'produto em análise' || 
        currentName.toLowerCase() === 'produto em analise' ||
        currentName.toLowerCase() === 'produto transferido de pendências';
      if (isGeneric) {
        updatedForm.baseProductName = getResolvedUnitProductName(updatedForm, products);
      }

      await onSave(updatedForm);
      setIsSavingEdit(false);
      onClose();
    } catch (err: any) {
      console.error('Error updating unit:', err);
      setActionError(`Erro ao salvar alterações: ${err?.message || err}`);
      setIsSavingEdit(false);
      setTimeout(() => setActionError(null), 5000);
    }
  };

  if (!isOpen || !editForm) return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 overflow-y-auto" 
      id="stock-unit-edit-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
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
                {editForm.baseProductSku || unit.baseProductSku}
              </span>

              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-md border ${
                editForm.destinationSector === 'Principal'
                  ? (isLight ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30')
                  : editForm.destinationSector === 'Openbox'
                  ? (isLight ? 'bg-amber-50 text-amber-800 border-amber-300' : 'bg-amber-500/15 text-amber-300 border-amber-500/30')
                  : editForm.destinationSector === 'Outros'
                  ? (isLight ? 'bg-indigo-50 text-indigo-800 border-indigo-300' : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30')
                  : (isLight ? 'bg-rose-50 text-rose-800 border-rose-300' : 'bg-rose-500/15 text-rose-300 border-rose-500/30')
              }`}>
                Setor: {editForm.destinationSector}
              </span>

              <span className={`px-2 py-0.5 text-[10px] font-black rounded-md uppercase tracking-wider border ${
                isLight 
                  ? 'bg-amber-100 text-amber-900 border-amber-300' 
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              }`}>
                Modo Edição
              </span>
            </div>

            <h3 className={`text-lg sm:text-xl font-black tracking-tight pt-0.5 ${
              isLight ? 'text-slate-900' : 'text-white'
            }`}>
              {editForm.baseProductName || getResolvedUnitProductName(unit, products)}
            </h3>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            {onCompareWithBase && editForm.destinationSector !== 'Principal' && (
              <button 
                type="button"
                onClick={onCompareWithBase}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                  isLight
                    ? 'bg-sky-50 hover:bg-sky-100 text-sky-800 border-sky-300 shadow-2xs'
                    : 'bg-sky-950/60 hover:bg-sky-900/80 text-sky-300 border-sky-500/40 shadow-2xs'
                }`}
                title="Comparar fotos e descrição com o produto base cadastrado"
                id="btn-edit-modal-compare-base-product"
              >
                <GitCompare className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="hidden sm:inline">Comparar com Base</span>
              </button>
            )}
            <button 
              type="button"
              onClick={onClose}
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
              onClick={handleSave}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-black transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-1.5 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{isSavingEdit ? 'Salvando...' : 'Salvar Alterações'}</span>
            </button>
          </div>
        </div>

        {/* Action Error / Success Toast alerts inside modal */}
        {actionError && (
          <div className="mx-6 mt-4 p-3.5 bg-rose-500/15 border border-rose-500/30 rounded-xl flex items-center gap-2.5 text-xs text-rose-300 animate-in fade-in">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{actionError}</span>
          </div>
        )}
        {actionSuccess && (
          <div className="mx-6 mt-4 p-3.5 bg-emerald-500/15 border border-emerald-500/30 rounded-xl flex items-center gap-2.5 text-xs text-emerald-300 animate-in fade-in">
            <Check className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {/* Modal Body */}
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
          <div className={`space-y-4 p-5 rounded-xl border ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
          }`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                <Package className="w-4 h-4" />
                Dados Principais & Identificação Técnica
              </h4>
              {matchedBaseProductInEdit ? (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                  isLight 
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300' 
                    : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                }`}>
                  <Check className="w-3 h-3 stroke-[3]" />
                  <span>Vinculado ao Catálogo Base</span>
                </span>
              ) : editForm.baseProductSku?.trim() ? (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                  isLight 
                    ? 'bg-amber-50 text-amber-900 border-amber-300' 
                    : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                }`}>
                  <AlertTriangle className="w-3 h-3" />
                  <span>SKU Avulso (Não Cadastrado na Base)</span>
                </span>
              ) : null}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* SKU with Autocomplete Dropdown */}
              <div className="sm:col-span-1 relative" ref={editSkuDropdownRef}>
                <div className="flex items-center justify-between mb-1 min-h-[18px]">
                  <label className={`block text-[11px] font-bold ${
                    isLight ? 'text-slate-800' : 'text-slate-300'
                  }`}>
                    Código SKU *
                  </label>
                  {editForm.baseProductSku && (
                    <button
                      type="button"
                      onClick={handleClearEditSku}
                      className={`text-[10px] font-semibold flex items-center gap-0.5 cursor-pointer transition-colors ${
                        isLight ? 'text-slate-600 hover:text-rose-600' : 'text-slate-400 hover:text-rose-400'
                      }`}
                      title="Trocar / Limpar SKU para buscar outro na base"
                    >
                      <X className="w-2.5 h-2.5" />
                      <span>Trocar</span>
                    </button>
                  )}
                </div>

                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
                    <Search className="w-3.5 h-3.5" />
                  </div>

                  <input 
                    type="text" 
                    value={editForm.baseProductSku} 
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditSkuSearchTerm(val);
                      setEditForm({ ...editForm, baseProductSku: val });
                      setIsEditSkuDropdownOpen(true);
                      const clean = val.trim().toLowerCase();
                      const exact = products.find(p => p.sku && p.sku.toLowerCase() === clean);
                      if (exact) {
                        setEditForm(prev => prev ? {
                          ...prev,
                          baseProductId: exact.id,
                          baseProductSku: exact.sku,
                          baseProductName: exact.name,
                          baseProductVoltage: (exact.voltage && exact.voltage !== 'N/A' ? exact.voltage : (prev.baseProductVoltage || 'Bivolt')),
                          needsSkuRegistration: false,
                          skuRegistrationPending: false,
                          unregisteredSku: undefined,
                          unregisteredProductName: undefined,
                        } : null);
                      }
                    }} 
                    onFocus={() => setIsEditSkuDropdownOpen(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && filteredEditProducts.length > 0) {
                        e.preventDefault();
                        handleSelectEditBaseProduct(filteredEditProducts[0]);
                      } else if (e.key === 'Escape') {
                        setIsEditSkuDropdownOpen(false);
                      }
                    }}
                    className={`w-full pl-9 pr-14 py-2.5 rounded-lg text-xs font-mono font-bold focus:outline-none transition-all uppercase ${
                      matchedBaseProductInEdit
                        ? isLight 
                          ? 'bg-sky-50/70 border-2 border-sky-500 text-sky-950 font-extrabold shadow-2xs'
                          : 'bg-sky-950/30 border border-sky-500/70 text-sky-300'
                        : isLight
                          ? 'bg-white border border-slate-300 text-slate-900 focus:border-sky-500 shadow-2xs'
                          : 'bg-slate-900 border border-slate-700 text-white focus:border-sky-500'
                    }`} 
                    placeholder="Bipar ou digitar SKU..."
                    autoComplete="off"
                    id="edit-unit-sku-input"
                  />

                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {editForm.baseProductSku && (
                      <button
                        type="button"
                        onClick={handleClearEditSku}
                        className="p-1 text-slate-400 hover:text-slate-200 rounded transition-colors cursor-pointer"
                        title="Limpar SKU"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsEditSkuDropdownOpen(prev => !prev)}
                      className="p-1 text-slate-400 hover:text-slate-200 rounded transition-colors cursor-pointer"
                      title="Listar todos os SKUs da base"
                    >
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isEditSkuDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                </div>

                {/* Autocomplete Dropdown */}
                {isEditSkuDropdownOpen && (
                  <div className={`absolute left-0 top-full mt-1.5 w-full sm:w-[460px] rounded-xl shadow-2xl z-50 max-h-64 overflow-y-auto divide-y border animate-in fade-in duration-100 ${
                    isLight 
                      ? 'bg-white border-slate-300 divide-slate-100 text-slate-900 shadow-xl' 
                      : 'bg-slate-950 border-slate-700/80 divide-slate-800/60 text-slate-100'
                  }`}>
                    <div className={`p-2 text-[10px] flex items-center justify-between border-b font-medium sticky top-0 z-10 ${
                      isLight ? 'bg-slate-100 border-slate-200 text-slate-600' : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}>
                      <span>Produtos Cadastrados na Base</span>
                      <span className="font-mono">{filteredEditProducts.length} encontrados</span>
                    </div>

                    {filteredEditProducts.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400 space-y-1">
                        <p className="font-medium">Nenhum SKU encontrado com esse termo.</p>
                        <p className="text-[10px] text-slate-500">Você pode manter o SKU avulso ou buscar outro.</p>
                      </div>
                    ) : (
                      filteredEditProducts.map((p) => {
                        const isSelected = p.sku?.toLowerCase() === editForm.baseProductSku?.trim().toLowerCase();
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => handleSelectEditBaseProduct(p)}
                            className={`w-full p-2.5 text-left transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                              isSelected
                                ? isLight ? 'bg-sky-50' : 'bg-sky-500/15'
                                : isLight ? 'hover:bg-slate-50' : 'hover:bg-slate-900'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`font-mono text-xs font-bold px-1.5 py-0.5 rounded border ${
                                  isLight ? 'bg-sky-100 border-sky-300 text-sky-800' : 'bg-sky-500/20 border-sky-500/30 text-sky-300'
                                }`}>
                                  {p.sku}
                                </span>
                                {p.brand && p.brand !== 'N/A' && (
                                  <span className={`text-[9.5px] font-bold px-1.5 py-0.2 rounded border ${
                                    isLight 
                                      ? 'bg-purple-50 text-purple-800 border-purple-200' 
                                      : 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                                  }`}>
                                    {p.brand}
                                  </span>
                                )}
                              </div>
                              <p className={`text-[11px] font-medium mt-1 truncate ${
                                isLight ? 'text-slate-800' : 'text-slate-200'
                              }`}>
                                {p.name}
                              </p>
                            </div>
                            {isSelected && (
                              <span className="text-sky-500 text-xs shrink-0 flex items-center gap-1 font-bold">
                                <Check className="w-4 h-4 stroke-[2.5]" />
                              </span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              {/* Nome do Produto */}
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-1 min-h-[18px]">
                  <label className={`block text-[11px] font-bold ${
                    isLight ? 'text-slate-800' : 'text-slate-300'
                  }`}>
                    Nome do Produto *
                  </label>
                  {matchedBaseProductInEdit && (
                    <span className={`text-[10px] ${
                      isLight ? 'text-slate-600 font-medium' : 'text-slate-400'
                    }`}>
                      Preenchido da base (editável)
                    </span>
                  )}
                </div>
                <input 
                  type="text" 
                  value={editForm.baseProductName} 
                  onChange={(e) => setEditForm({ ...editForm, baseProductName: e.target.value })} 
                  className={`w-full rounded-lg p-2.5 text-xs font-bold focus:outline-none transition-colors border ${
                    isLight 
                      ? 'bg-white border-slate-300 text-slate-900 focus:border-sky-500 shadow-2xs' 
                      : 'bg-slate-900 border-slate-700 text-white focus:border-sky-500'
                  }`} 
                  placeholder="Nome do produto"
                />
              </div>

              <div>
                <label className={`block text-[11px] font-bold mb-1 ${
                  isLight ? 'text-slate-800' : 'text-slate-300'
                }`}>
                  Número de Série (S/N)
                </label>
                <input 
                  type="text" 
                  value={editForm.serialNumber || ''} 
                  onChange={(e) => setEditForm({ ...editForm, serialNumber: e.target.value })} 
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                    }
                  }}
                  className={`w-full rounded-lg p-2.5 text-xs font-bold font-mono focus:outline-none transition-colors border ${
                    isLight 
                      ? 'bg-white border-slate-300 text-slate-900 focus:border-sky-500 shadow-2xs' 
                      : 'bg-slate-900 border-slate-700 text-slate-200 focus:border-sky-500'
                  }`} 
                  placeholder="Ex: SN-123456789-BR"
                />
              </div>

              <div>
                <label className={`block text-[11px] font-bold mb-1 ${
                  isLight ? 'text-slate-800' : 'text-slate-300'
                }`}>
                  Voltagem Elétrica
                </label>
                <select 
                  value={editForm.baseProductVoltage || 'Bivolt'} 
                  onChange={(e) => setEditForm({ ...editForm, baseProductVoltage: e.target.value })} 
                  className={`w-full rounded-lg p-2.5 text-xs font-bold focus:outline-none cursor-pointer transition-colors border ${
                    isLight 
                      ? 'bg-white border-slate-300 text-slate-900 focus:border-sky-500 shadow-2xs' 
                      : 'bg-slate-900 border-slate-700 text-white focus:border-sky-500'
                  }`}
                >
                  <option value="Bivolt">Bivolt</option>
                  <option value="110V / 127V">110V / 127V</option>
                  <option value="220V">220V</option>
                  <option value="N/A">N/A (Sem energia)</option>
                </select>
              </div>

              {/* Plataforma de Origem */}
              <div>
                <label className={`block text-[11px] font-bold mb-1 ${
                  isLight ? 'text-slate-800' : 'text-slate-300'
                }`}>
                  Plataforma de Origem
                </label>
                <select 
                  value={(editForm.platform as string) === 'Outro' ? 'Outros' : (editForm.platform || '')} 
                  onChange={(e) => setEditForm({ ...editForm, platform: (e.target.value === 'Outro' ? 'Outros' : e.target.value) as PlatformType })} 
                  className={`w-full rounded-lg p-2.5 text-xs font-bold focus:outline-none cursor-pointer transition-colors border ${
                    isLight 
                      ? 'bg-white border-slate-300 text-slate-900 focus:border-sky-500 shadow-2xs' 
                      : 'bg-slate-900 border-slate-700 text-white focus:border-sky-500'
                  }`}
                  id="edit-unit-platform"
                >
                  <option value="">Sem Plataforma / Não informada</option>
                  <option value="Mercado Livre">Mercado Livre</option>
                  <option value="Shopee">Shopee</option>
                  <option value="Amazon">Amazon</option>
                  <option value="Amazon Ta Novo">Amazon Ta Novo</option>
                  <option value="Kabum">Kabum</option>
                  <option value="Outros">Outros</option>
                </select>
              </div>

              {editForm.destinationSector === 'Openbox' && (
                <div className="animate-in fade-in duration-200">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-amber-800 dark:text-amber-400 flex items-center gap-1">
                      <span>Código STI / Rastreio</span>
                      <span className="text-rose-600 dark:text-rose-400 font-bold">* (Obrigatório)</span>
                    </label>
                    {editForm.trackingCode && (
                      isValidStiCode(editForm.trackingCode) ? (
                        <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1 bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                          <Check className="w-2.5 h-2.5 stroke-[3]" /> Válido
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-rose-700 dark:text-rose-400 bg-rose-500/15 border border-rose-500/30 px-1.5 py-0.5 rounded">
                          STI + 6 dígitos
                        </span>
                      )
                    )}
                  </div>
                  <input 
                    type="text" 
                    value={editForm.trackingCode || ''} 
                    onChange={(e) => {
                      const formatted = formatStiInput(e.target.value);
                      setEditForm({ ...editForm, trackingCode: formatted });
                    }} 
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                      }
                    }}
                    maxLength={9}
                    className={`w-full bg-slate-900 rounded-lg p-2.5 text-xs font-bold font-mono focus:outline-none border transition-colors ${
                      isValidStiCode(editForm.trackingCode)
                        ? 'border-emerald-500 text-emerald-800 dark:text-emerald-200 focus:border-emerald-600'
                        : 'border-amber-500 text-amber-900 dark:text-amber-200 placeholder-amber-500/60 focus:border-amber-600'
                    }`}
                    placeholder="Ex: STI134920"
                  />
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1 min-h-[18px]">
                  <label className="text-[11px] font-bold text-slate-300">
                    <span>Número de Pedido</span>
                    <span className="text-slate-500 font-normal ml-1">(Opcional)</span>
                  </label>
                  {detectedEditOrderInfo && (
                    <button
                      type="button"
                      onClick={() => {
                        if (detectedEditOrderInfo.isAmazonVariant) {
                          const next = editForm.platform === 'Amazon Ta Novo' ? 'Amazon' : 'Amazon Ta Novo';
                          setEditForm({ ...editForm, platform: next as any });
                        }
                      }}
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 transition-all ${
                        detectedEditOrderInfo.isAmazonVariant
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 cursor-pointer'
                          : 'bg-sky-500/20 text-sky-300 border border-sky-500/40 cursor-default'
                      }`}
                      title={detectedEditOrderInfo.isAmazonVariant ? 'Clique para alternar entre Amazon e Amazon Ta Novo' : detectedEditOrderInfo.hint}
                    >
                      <Sparkles className="w-2.5 h-2.5 text-sky-400" />
                      <span>{editForm.platform || detectedEditOrderInfo.platform}</span>
                      {detectedEditOrderInfo.isAmazonVariant && (
                        <span className="text-[9px] text-amber-400 underline ml-0.5">
                          {editForm.platform === 'Amazon Ta Novo' ? '(p/ Amazon)' : '(p/ Ta Novo)'}
                        </span>
                      )}
                    </button>
                  )}
                </div>
                <input 
                  type="text" 
                  value={editForm.orderNumber || ''} 
                  onChange={(e) => handleEditOrderNumberChange(e.target.value)} 
                  onBlur={handleEditOrderNumberBlur}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                    }
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs font-bold text-slate-200 font-mono focus:outline-none focus:border-sky-500" 
                  placeholder="Ex: 2000018084300220"
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
                <label className={`block text-[11px] font-bold mb-1 ${
                  isLight ? 'text-slate-700' : 'text-slate-300'
                }`}>
                  Setor de Destino
                </label>
                <select 
                  value={editForm.destinationSector} 
                  onChange={(e) => setEditForm({ ...editForm, destinationSector: e.target.value as DestinationSectorType })} 
                  className={`w-full border rounded-lg p-2.5 text-xs font-bold focus:outline-none focus:border-sky-500 cursor-pointer ${
                    isLight 
                      ? 'bg-white border-slate-300 text-slate-900 shadow-2xs' 
                      : 'bg-slate-900 border-slate-700 text-white'
                  }`}
                >
                  <option value="Principal">Estoque Principal (Prontos / Novos)</option>
                  <option value="Openbox">Openbox (Outlet / Revisados)</option>
                  <option value="RMA">RMA (Assistência Técnica)</option>
                  <option value="Outros">Outros (Estoque Geral)</option>
                </select>
                {isRealStockTransfer(editForm.originSector) && (
                  <p className={`text-[10.5px] flex items-center gap-1.5 mt-1.5 border px-2.5 py-1.5 rounded-lg ${
                    isLight 
                      ? 'bg-amber-50 border-amber-300 text-amber-950 font-semibold' 
                      : 'bg-amber-500/10 border-amber-500/25 text-amber-400/95'
                  }`}>
                    <ArrowRightLeft className={`w-3.5 h-3.5 shrink-0 ${isLight ? 'text-amber-700' : 'text-amber-400'}`} />
                    <span>
                      Estoque de Origem: <strong className={isLight ? 'text-amber-950 font-black' : 'text-amber-300'}>{editForm.originSector}</strong>
                      {editForm.initialEntryDate ? ` (Entrada inicial: ${new Date(editForm.initialEntryDate).toLocaleDateString('pt-BR')})` : ''}
                    </span>
                  </p>
                )}

                {/* Explicit Openbox STI requirement notice & input */}
                {editForm.destinationSector === 'Openbox' && (
                  <div className={`mt-2.5 p-3 rounded-xl border space-y-1.5 animate-in fade-in duration-200 ${
                    isLight ? 'bg-amber-50 border-amber-300' : 'bg-amber-500/10 border-amber-500/30'
                  }`}>
                    <div className="flex items-center justify-between">
                      <label className={`text-[11px] font-bold flex items-center gap-1.5 ${
                        isLight ? 'text-amber-950' : 'text-amber-300'
                      }`}>
                        <Tag className={`w-3.5 h-3.5 ${isLight ? 'text-amber-700' : 'text-amber-400'}`} />
                        <span>Código STI Obrigatório para Openbox</span>
                        <span className="text-rose-600 font-bold">*</span>
                      </label>
                      {isValidStiCode(editForm.trackingCode) ? (
                        <span className={`text-[10px] font-bold border px-1.5 py-0.5 rounded flex items-center gap-1 ${
                          isLight ? 'bg-emerald-100 border-emerald-400 text-emerald-950 font-black' : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                        }`}>
                          <Check className="w-3 h-3 stroke-[3]" /> STI Válido
                        </span>
                      ) : (
                        <span className={`text-[10px] font-bold border px-1.5 py-0.5 rounded ${
                          isLight ? 'bg-rose-100 border-rose-300 text-rose-900 font-black' : 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                        }`}>
                          Obrigatório (STI + 6 dígitos)
                        </span>
                      )}
                    </div>
                    <input 
                      type="text" 
                      value={editForm.trackingCode || ''} 
                      onChange={(e) => {
                        const formatted = formatStiInput(e.target.value);
                        setEditForm({ ...editForm, trackingCode: formatted });
                      }} 
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                        }
                      }}
                      maxLength={9}
                      className={`w-full rounded-lg p-2.5 text-xs font-mono font-bold focus:outline-none border transition-colors ${
                        isValidStiCode(editForm.trackingCode)
                          ? isLight 
                            ? 'bg-white border-2 border-emerald-500 text-emerald-950 focus:border-emerald-600 shadow-2xs' 
                            : 'bg-slate-900 border-emerald-500 text-emerald-300 focus:border-emerald-600'
                          : isLight 
                          ? 'bg-white border-2 border-amber-500 text-amber-950 placeholder-amber-700/60 focus:border-amber-600 shadow-2xs' 
                          : 'bg-slate-900 border-amber-500 text-amber-200 placeholder-amber-600/50 focus:border-amber-600'
                      }`}
                      placeholder="Ex: STI134920"
                    />
                    <p className={`text-[10.5px] font-medium ${
                      isLight ? 'text-amber-900' : 'text-amber-300/80'
                    }`}>
                      Produtos no Openbox obrigatoriamente exigem o código STI no formato <strong className={isLight ? 'text-amber-950 font-black' : 'text-amber-200 font-bold'}>STI + 6 números</strong>.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Diagnostics & Condition */}
          <div className={`space-y-4 p-5 rounded-xl border ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
          }`}>
            <h4 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
              isLight ? 'text-amber-800 font-black' : 'text-amber-400'
            }`}>
              <AlertTriangle className="w-4 h-4" />
              Condição, Motivo & Acessórios
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className={`block text-[11px] font-bold ${
                    isLight ? 'text-slate-800' : 'text-slate-300'
                  }`}>
                    Estado do Aparelho
                  </label>
                  {!isCustomEditDeviceStatus && editForm.deviceStatus !== 'Descrever' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomEditDeviceStatus(true);
                        setEditForm({ ...editForm, deviceStatus: 'Descrever' as any });
                      }}
                      className={`text-[10px] font-bold transition-colors cursor-pointer ${
                        isLight ? 'text-sky-700 hover:text-sky-900' : 'text-sky-400 hover:text-sky-300'
                      }`}
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
                      className={`text-[10px] font-semibold transition-colors cursor-pointer ${
                        isLight ? 'text-slate-600 hover:text-slate-950' : 'text-slate-400 hover:text-slate-200'
                      }`}
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
                  className={`w-full border rounded-lg p-2.5 text-xs font-bold focus:outline-none focus:border-sky-500 cursor-pointer ${
                    isLight ? 'bg-white border-slate-300 text-slate-900 shadow-2xs' : 'bg-slate-900 border-slate-700 text-white'
                  }`}
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
                      className={`w-full rounded-lg p-2.5 text-xs focus:outline-none transition-colors border ${
                        isLight 
                          ? 'bg-white border-2 border-sky-500 text-slate-900 placeholder-slate-400 shadow-2xs font-medium' 
                          : 'bg-slate-900 border border-sky-500/70 text-white placeholder-slate-500 focus:border-sky-400'
                      }`}
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
                          className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer font-medium ${
                            isLight 
                              ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100 hover:text-slate-950 shadow-2xs' 
                              : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'
                          }`}
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
                  <label className={`block text-[11px] font-bold ${
                    isLight ? 'text-slate-800' : 'text-slate-300'
                  }`}>
                    Estado da Embalagem / Caixa
                  </label>
                  {!isCustomEditPackageStatus && editForm.packageStatus !== 'Descrever' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomEditPackageStatus(true);
                        setEditForm({ ...editForm, packageStatus: 'Descrever' as any });
                      }}
                      className={`text-[10px] font-bold transition-colors cursor-pointer ${
                        isLight ? 'text-sky-700 hover:text-sky-900' : 'text-sky-400 hover:text-sky-300'
                      }`}
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
                      className={`text-[10px] font-semibold transition-colors cursor-pointer ${
                        isLight ? 'text-slate-600 hover:text-slate-950' : 'text-slate-400 hover:text-slate-200'
                      }`}
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
                  className={`w-full border rounded-lg p-2.5 text-xs font-bold focus:outline-none focus:border-sky-500 cursor-pointer ${
                    isLight ? 'bg-white border-slate-300 text-slate-900 shadow-2xs' : 'bg-slate-900 border-slate-700 text-white'
                  }`}
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
                      className={`w-full rounded-lg p-2.5 text-xs focus:outline-none transition-colors border ${
                        isLight 
                          ? 'bg-white border-2 border-sky-500 text-slate-900 placeholder-slate-400 shadow-2xs font-medium' 
                          : 'bg-slate-900 border border-sky-500/70 text-white placeholder-slate-500 focus:border-sky-400'
                      }`}
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
                          className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer font-medium ${
                            isLight 
                              ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100 hover:text-slate-950 shadow-2xs' 
                              : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'
                          }`}
                        >
                          + {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="sm:col-span-2">
                <label className={`block text-[11px] font-bold mb-1 ${
                  isLight ? 'text-slate-800' : 'text-slate-300'
                }`}>
                  Motivo da Devolução / Observação Curta
                </label>
                <textarea 
                  value={editForm.customerReason || ''} 
                  onChange={(e) => setEditForm({ ...editForm, customerReason: e.target.value })} 
                  rows={2}
                  className={`w-full border rounded-lg p-2.5 text-xs focus:outline-none focus:border-sky-500 ${
                    isLight 
                      ? 'bg-white border-slate-300 text-slate-800 placeholder-slate-400 shadow-2xs font-medium' 
                      : 'bg-slate-900 border-slate-700 text-white'
                  }`} 
                  placeholder="Ex: Revisada, sem marcas de uso, testada..."
                />
              </div>

              <div className="sm:col-span-2">
                <label className={`block text-[11px] font-bold mb-1 ${
                  isLight ? 'text-slate-800' : 'text-slate-300'
                }`}>
                  Acessórios Recebidos
                </label>
                <input 
                  type="text" 
                  value={editForm.accessoriesInclusion || ''} 
                  onChange={(e) => setEditForm({ ...editForm, accessoriesInclusion: e.target.value })} 
                  className={`w-full border rounded-lg p-2.5 text-xs focus:outline-none focus:border-sky-500 ${
                    isLight 
                      ? 'bg-white border-slate-300 text-slate-800 placeholder-slate-400 shadow-2xs font-medium' 
                      : 'bg-slate-900 border-slate-700 text-slate-200'
                  }`} 
                  placeholder="Ex: Embalagem: Na caixa; Fonte e cabo USB inclusos."
                />
              </div>
            </div>
          </div>

          {/* Section 3: Technical Report / Detailed Description */}
          <div className={`space-y-3 p-5 rounded-xl border ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
          }`}>
            <h4 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
              isLight ? 'text-sky-800 font-black' : 'text-sky-400'
            }`}>
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
          <div className={`p-4 border rounded-xl ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
          }`}>
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input 
                type="checkbox"
                checked={Boolean(editForm.excludeFromDailyCount)}
                onChange={(e) => setEditForm({ ...editForm, excludeFromDailyCount: e.target.checked })}
                className="mt-0.5 rounded border-slate-400 bg-white text-amber-500 focus:ring-amber-400 h-4 w-4"
                id="checkbox-edit-exclude-daily"
              />
              <div className="space-y-0.5">
                <span className={`text-xs font-semibold block ${
                  isLight ? 'text-slate-900' : 'text-slate-200'
                }`}>
                  Não contabilizar no registro de entrada diária
                </span>
                <span className={`text-[11px] block leading-tight ${
                  isLight ? 'text-slate-600' : 'text-slate-400'
                }`}>
                  Se marcado, este produto será ignorado do contador e gráficos de devoluções diárias.
                </span>
              </div>
            </label>
          </div>

          {/* Section 4: Photo Gallery Editor */}
          <div 
            className="space-y-3 bg-slate-950 p-4 border border-slate-800 rounded-xl"
            onPaste={(e) => handleEditModalPaste(e, urlInputCategory)}
            id="edit-photo-gallery-manager"
          >
            {/* Header & Target Selector */}
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

            {/* Photo toolbar */}
            <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
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

            {/* Categories preview grids */}
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
                            if (onOpenImageZoom) {
                              onOpenImageZoom(p, `Fotos do Aparelho - ${editForm.baseProductName}`, editForm.photosProduct || [], i);
                            }
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
                            if (onOpenImageZoom) {
                              onOpenImageZoom(p, `Fotos da Embalagem - ${editForm.baseProductName}`, editForm.photosBox || [], i);
                            }
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
                            if (onOpenImageZoom) {
                              onOpenImageZoom(p, `Fotos dos Acessórios - ${editForm.baseProductName}`, editForm.photosAccessories || [], i);
                            }
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

        {/* Modal Action Controls Bar */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800/60 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="text-xs text-slate-500">
            {editForm.status === 'Estoque' ? 'Alterações salvas serão propagadas imediatamente no estoque ativo.' : 'Unidade baixada.'}
          </div>
          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button 
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button 
              type="button"
              disabled={isSavingEdit}
              onClick={handleSave}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-lg shadow-emerald-600/20 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{isSavingEdit ? 'Salvando...' : 'Salvar Alterações'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
