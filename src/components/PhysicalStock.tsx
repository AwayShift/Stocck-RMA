/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
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
  RotateCcw
} from 'lucide-react';
import { TriageUnit, DestinationSectorType, PlatformType, BaseProduct, DeviceStatusType, PackageStatusType } from '../types';
import ExcelImportModal from './ExcelImportModal';
import { ImageZoomModal } from './ImageZoomModal';
import { getUnitResolvedPhotos, getBaseProductImages, findBaseProduct } from '../utils/productImages';
import { exportStockInventoryToExcel } from '../utils/excelHelpers';
import { processSafeImageUrl } from '../lib/imageSecurityService';
import { uploadFileToStorage, uploadImageUrlToStorage } from '../lib/dbService';

interface PhysicalStockProps {
  units: TriageUnit[];
  products?: BaseProduct[];
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
}

export default function PhysicalStock({ 
  units, 
  products = [],
  onUpdateUnit, 
  onDeleteUnit, 
  onCheckoutUnit,
  onRevertCheckoutUnit,
  initialSelectedUnit,
  onClearSelectedUnit,
  onSaveTriage,
  enableSpreadsheetImport = true,
  enableSpreadsheetExport = true,
  isLight = false
}: PhysicalStockProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<string>('Todas');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [selectedVoltage, setSelectedVoltage] = useState<string>('Todas');

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
    setOriginalUnitPhotos(null);
  };

  const handleStartEdit = (unit: TriageUnit) => {
    setSelectedUnitId(unit.id);
    setEditForm({ ...unit });
    setOriginalUnitPhotos({
      photosProduct: [...(unit.photosProduct || [])],
      photosBox: [...(unit.photosBox || [])],
      photosAccessories: [...(unit.photosAccessories || [])]
    });
    setIsEditingUnit(true);
  };

  const handleSaveEdit = async () => {
    if (!editForm) return;
    setIsSavingEdit(true);
    try {
      let updatedForm = { ...editForm };
      
      // If destinationSector is 'Principal' and photos are empty, auto-reference base product images
      if (updatedForm.destinationSector === 'Principal' && (!updatedForm.photosProduct || updatedForm.photosProduct.length === 0)) {
        const baseProd = findBaseProduct(updatedForm, products);
        const baseImgs = getBaseProductImages(baseProd);
        if (baseImgs.productPhotos.length > 0) {
          updatedForm.photosProduct = baseImgs.productPhotos;
        }
      }

      // Mandatory STI check for Openbox products
      if (updatedForm.destinationSector === 'Openbox' && (!updatedForm.trackingCode || !updatedForm.trackingCode.trim())) {
        setActionError('O Código STI é obrigatório para produtos no setor OpenBox.');
        setIsSavingEdit(false);
        setTimeout(() => setActionError(null), 4000);
        return;
      }

      await onUpdateUnit(updatedForm);
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

  // Unique Brands from catalog products and units
  const uniqueBrands = React.useMemo(() => {
    const brandsSet = new Set<string>();
    products.forEach(p => {
      if (p.brand && p.brand.trim() && p.brand.trim() !== 'N/A' && p.brand.trim() !== 'Não Informado') {
        brandsSet.add(p.brand.trim());
      }
    });
    units.forEach(u => {
      const bp = findBaseProduct(u, products);
      if (bp?.brand && bp.brand.trim() && bp.brand.trim() !== 'N/A' && bp.brand.trim() !== 'Não Informado') {
        brandsSet.add(bp.brand.trim());
      }
    });
    return Array.from(brandsSet).sort();
  }, [products, units]);

  // Unique Categories from catalog products and units
  const uniqueCategories = React.useMemo(() => {
    const categoriesSet = new Set<string>();
    products.forEach(p => {
      if (p.category && p.category.trim() && p.category.trim() !== 'Todas') {
        categoriesSet.add(p.category.trim());
      }
    });
    units.forEach(u => {
      const bp = findBaseProduct(u, products);
      if (bp?.category && bp.category.trim() && bp.category.trim() !== 'Todas') {
        categoriesSet.add(bp.category.trim());
      }
    });
    return Array.from(categoriesSet).sort();
  }, [products, units]);

  const handleClearAllFilters = () => {
    setSearchTerm('');
    setSelectedBrand('Todas');
    setSelectedCategory('Todas');
    setSelectedVoltage('Todas');
    setFilterOnlyDuplicates(false);
  };

  const hasActiveFilters = Boolean(
    searchTerm.trim() || 
    selectedBrand !== 'Todas' || 
    selectedCategory !== 'Todas' || 
    selectedVoltage !== 'Todas' || 
    filterOnlyDuplicates
  );

  // Filter logic
  const filteredUnits = units.filter(unit => {
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

    // 2. Category filter
    if (selectedCategory !== 'Todas') {
      const targetCategory = selectedCategory.trim().toLowerCase();
      const unitCategory = (baseProd?.category || '').trim().toLowerCase();
      if (unitCategory !== targetCategory) {
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
      (unit.destinationSector !== 'Openbox' && (unit.platform || '').toLowerCase().includes(term)) ||
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

  // Reset pagination limit when search term, filters, sector tab, or duplicate filter changes
  useEffect(() => {
    setVisibleCount(20);
  }, [searchTerm, selectedBrand, selectedCategory, selectedVoltage, activeTab, filterOnlyDuplicates]);

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

        const updated: TriageUnit = {
          ...unit,
          destinationSector: newSector,
          photosProduct: finalPhotosProduct,
          photosBox: finalPhotosBox,
          photosAccessories: finalPhotosAccessories
        };
        try {
          await onUpdateUnit(updated);
          setEditingSector('');
          setActionSuccess(`Setor atualizado para ${newSector} com sucesso!`);
          setTimeout(() => setActionSuccess(null), 3000);
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

    const updated: TriageUnit = {
      ...unit,
      destinationSector: targetSector,
      photosProduct: newPhotosProduct,
      photosBox: newPhotosBox,
      photosAccessories: newPhotosAccessories
    };

    try {
      await onUpdateUnit(updated);
      setTransferModalData(null);
      setEditingSector('');
      const strategyName = choice === 'keep_saved' ? 'Fotos salvas mantidas' : choice === 'use_base' ? 'Imagens da base aplicadas' : 'Fotos combinadas';
      setActionSuccess(`Transferido para ${targetSector} com sucesso! (${strategyName})`);
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
      case 'Mercado Livre': return 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20';
      case 'Shopee': return 'bg-orange-500/10 text-orange-400 border border-orange-500/20';
      case 'Amazon': return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
      case 'Amazon Ta Novo': return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
      case 'Kabum': return 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20';
      default: return 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20';
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

          {/* Filter Controls Row: Marcas, Categoria, Voltagem */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-800" id="stock-filter-controls">
            {/* 1. Filter by Marca (Brand) */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="w-3 h-3 text-purple-400" />
                <span>Marca</span>
              </label>
              <select
                value={selectedBrand}
                onChange={(e) => setSelectedBrand(e.target.value)}
                className={`w-full px-3 py-2 bg-slate-950 border rounded-xl text-xs font-semibold text-slate-200 focus:outline-none focus:border-sky-500 transition-colors truncate ${
                  selectedBrand !== 'Todas' ? 'border-purple-500/50 bg-purple-950/20 text-purple-300' : 'border-slate-800'
                }`}
                id="select-filter-stock-brand"
              >
                <option value="Todas">Todas as Marcas ({uniqueBrands.length})</option>
                {uniqueBrands.map(brand => (
                  <option key={brand} value={brand}>{brand}</option>
                ))}
              </select>
            </div>

            {/* 2. Filter by Categoria */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3 h-3 text-emerald-400" />
                <span>Categoria</span>
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className={`w-full px-3 py-2 bg-slate-950 border rounded-xl text-xs font-semibold text-slate-200 focus:outline-none focus:border-sky-500 transition-colors truncate ${
                  selectedCategory !== 'Todas' ? 'border-emerald-500/50 bg-emerald-950/20 text-emerald-300' : 'border-slate-800'
                }`}
                id="select-filter-stock-category"
              >
                <option value="Todas">Todas as Categorias ({uniqueCategories.length})</option>
                {uniqueCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* 3. Filter by Voltagem */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="w-3 h-3 text-amber-400" />
                <span>Tensão / Voltagem</span>
              </label>
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
                      {unit.trackingCode && unit.trackingCode.trim() !== '' && (
                        <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                          hasDupSti ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'text-slate-500'
                        }`}>
                          #{unit.trackingCode.replace(/^#/, '')}
                        </span>
                      )}
                    </div>

                    {/* Image / Thumbnail if exists */}
                    <div className="w-full h-32 rounded-lg bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center relative p-1.5">
                      {mainPhoto ? (
                        <img src={mainPhoto} alt={unit.baseProductName} className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-300" referrerPolicy="no-referrer" />
                      ) : (
                        <Package className="w-8 h-8 text-slate-600" />
                      )}
                      {photosCount > 0 && (
                        <span className="absolute bottom-2 right-2 bg-black/80 text-[10px] text-slate-300 px-1.5 py-0.5 rounded font-mono font-bold flex items-center gap-1">
                          {resolved.isUsingBaseProductImage && (
                            <span className="text-sky-400 text-[9px] font-sans font-normal">Base •</span>
                          )}
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

                      {/* Brand, Category, Voltage attributes */}
                      {(() => {
                        const baseProd = findBaseProduct(unit, products);
                        const bBrand = baseProd?.brand && baseProd.brand.trim() !== 'N/A' && baseProd.brand.trim() !== 'Não Informado' ? baseProd.brand.trim() : null;
                        const bCat = baseProd?.category && baseProd.category.trim() !== 'Todas' ? baseProd.category.trim() : null;
                        const bVolt = unit.baseProductVoltage || (baseProd?.voltage && baseProd.voltage !== 'N/A' ? baseProd.voltage : null);

                        if (!bBrand && !bCat && (!bVolt || bVolt === 'N/A')) return null;

                        return (
                          <div className="flex items-center gap-1.5 flex-wrap pt-2">
                            {bBrand && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/30 flex items-center gap-1" title={`Marca: ${bBrand}`}>
                                <Sliders className="w-2.5 h-2.5" />
                                <span>{bBrand}</span>
                              </span>
                            )}
                            {bCat && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 flex items-center gap-1" title={`Categoria: ${bCat}`}>
                                <Layers className="w-2.5 h-2.5" />
                                <span>{bCat}</span>
                              </span>
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

                      <p className="text-[10px] text-slate-450 font-medium mt-2 flex items-center gap-1 font-mono">
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
                      {mainPhoto ? (
                        <img src={mainPhoto} alt={unit.baseProductName} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
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
                        {unit.trackingCode && unit.trackingCode.trim() !== '' && (
                          <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                            hasDupSti ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'text-slate-500'
                          }`}>
                            #{unit.trackingCode.replace(/^#/, '')}
                          </span>
                        )}
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

                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs text-slate-400 line-clamp-1">
                          Motivo: {unit.customerReason}
                        </p>

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
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 flex items-center gap-1" title={`Categoria: ${bCat}`}>
                                  <Layers className="w-2.5 h-2.5" />
                                  <span>{bCat}</span>
                                </span>
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

        {/* Pagination / Mostrar Mais button */}
        <div className="p-5 bg-slate-950/80 border-t border-slate-800/80 flex flex-col items-center justify-center gap-2.5 text-center" id="stock-pagination-footer">
          {hasMore ? (
            <button
              type="button"
              onClick={() => setVisibleCount(prev => prev + 20)}
              className="px-6 py-2.5 bg-slate-800 hover:bg-slate-750 hover:border-sky-500/50 text-slate-200 hover:text-white border border-slate-700 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm group"
              id="btn-load-more-stock"
            >
              <span>Mostrar Mais</span>
              <ChevronDown className="w-4 h-4 text-sky-400 group-hover:translate-y-0.5 transition-transform" />
            </button>
          ) : (
            <span className="text-xs text-slate-500 font-medium">
              Todas as {filteredUnits.length} unidades foram carregadas
            </span>
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
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto" 
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
                      onClick={() => { setIsEditingUnit(false); setEditForm(null); }}
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

                    <div>
                      <label className={`block text-[11px] font-bold mb-1 ${
                        editForm.destinationSector === 'Openbox' ? 'text-amber-400' : 'text-slate-300'
                      }`}>
                        <span>Código STI / Rastreio</span>
                        {editForm.destinationSector === 'Openbox' && (
                          <span className="text-rose-400 font-bold ml-1">* (Obrigatório)</span>
                        )}
                      </label>
                      <input 
                        type="text" 
                        value={editForm.trackingCode} 
                        onChange={(e) => setEditForm({ ...editForm, trackingCode: e.target.value })} 
                        className={`w-full bg-slate-900 rounded-lg p-2.5 text-xs font-bold font-mono focus:outline-none ${
                          editForm.destinationSector === 'Openbox'
                            ? 'border border-amber-500/50 text-amber-200 placeholder-amber-500/40 focus:border-amber-400'
                            : 'border border-slate-700 text-slate-200 focus:border-sky-500'
                        }`}
                        placeholder={editForm.destinationSector === 'Openbox' ? "Obrigatório para Openbox (Ex: 13509873)" : "Ex: 13509873"}
                      />
                    </div>

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
                <div className="space-y-3 bg-slate-950 p-5 border border-slate-800 rounded-xl">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                    <FileText className="w-4 h-4" />
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

                {/* Section 4: Photo Gallery Editor */}
                <div 
                  className="space-y-4 bg-slate-950 p-5 border border-slate-800 rounded-xl"
                  onPaste={(e) => handleEditModalPaste(e, urlInputCategory)}
                  id="edit-photo-gallery-manager"
                >
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                        <Camera className="w-4 h-4" />
                        Gerenciar Galeria de Fotos ({ (editForm.photosProduct?.length || 0) + (editForm.photosBox?.length || 0) + (editForm.photosAccessories?.length || 0) })
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Faça upload, cole prints de tela com <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-sky-400 font-mono text-[10px]">Ctrl+V</kbd> ou insira links diretos.
                      </p>
                    </div>

                    {/* Category selector */}
                    <div className="flex items-center gap-2 text-xs self-stretch sm:self-auto justify-between sm:justify-end">
                      <span className="text-slate-400 text-[11px] font-medium">Adicionar Para:</span>
                      <select 
                        value={urlInputCategory}
                        onChange={(e) => setUrlInputCategory(e.target.value as any)}
                        className="bg-slate-900 border border-slate-700 hover:border-sky-500 rounded-lg px-3 py-1.5 text-xs font-bold text-white cursor-pointer transition-colors shadow-sm"
                      >
                        <option value="photosProduct">Fotos do Aparelho ({editForm.photosProduct?.length || 0})</option>
                        <option value="photosBox">Fotos da Embalagem ({editForm.photosBox?.length || 0})</option>
                        <option value="photosAccessories">Fotos dos Acessórios ({editForm.photosAccessories?.length || 0})</option>
                      </select>
                    </div>
                  </div>

                  {/* Target Category Quick Switcher Tabs */}
                  <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-900/90 border border-slate-800 rounded-xl text-center text-xs">
                    <button 
                      type="button" 
                      onClick={() => setUrlInputCategory('photosProduct')}
                      className={`py-2 px-2 rounded-lg font-bold cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
                        urlInputCategory === 'photosProduct' 
                          ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20' 
                          : 'hover:bg-slate-800 hover:text-white text-slate-400'
                      }`}
                    >
                      <span>Aparelho</span>
                      <span className="photo-tab-counter-badge px-2 py-0.5 rounded-full text-[10px] font-bold">
                        {editForm.photosProduct?.length || 0}
                      </span>
                      {urlInputCategory === 'photosProduct' && (
                        <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded font-mono hidden sm:inline">Ctrl+V Alvo</span>
                      )}
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setUrlInputCategory('photosBox')}
                      className={`py-2 px-2 rounded-lg font-bold cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
                        urlInputCategory === 'photosBox' 
                          ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20' 
                          : 'hover:bg-slate-800 hover:text-white text-slate-400'
                      }`}
                    >
                      <span>Embalagem</span>
                      <span className="photo-tab-counter-badge px-2 py-0.5 rounded-full text-[10px] font-bold">
                        {editForm.photosBox?.length || 0}
                      </span>
                      {urlInputCategory === 'photosBox' && (
                        <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded font-mono hidden sm:inline">Ctrl+V Alvo</span>
                      )}
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setUrlInputCategory('photosAccessories')}
                      className={`py-2 px-2 rounded-lg font-bold cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
                        urlInputCategory === 'photosAccessories' 
                          ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20' 
                          : 'hover:bg-slate-800 hover:text-white text-slate-400'
                      }`}
                    >
                      <span>Acessórios</span>
                      <span className="photo-tab-counter-badge px-2 py-0.5 rounded-full text-[10px] font-bold">
                        {editForm.photosAccessories?.length || 0}
                      </span>
                      {urlInputCategory === 'photosAccessories' && (
                        <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded font-mono hidden sm:inline">Ctrl+V Alvo</span>
                      )}
                    </button>
                  </div>

                  {/* Smart Base Product Image & Saved Photo Options for Estoque Principal */}
                  {(() => {
                    const baseProd = findBaseProduct(editForm, products);
                    const baseImgs = getBaseProductImages(baseProd);
                    const isPrincipal = editForm.destinationSector === 'Principal';
                    const origSavedCount = (originalUnitPhotos?.photosProduct?.length || 0) + (originalUnitPhotos?.photosBox?.length || 0) + (originalUnitPhotos?.photosAccessories?.length || 0);

                    if (isPrincipal && baseImgs.main) {
                      return (
                        <div className="p-3.5 bg-slate-900/90 border border-sky-500/30 rounded-xl space-y-3">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-sky-300">
                              <Sparkles className="w-4 h-4 text-sky-400 shrink-0" />
                              <span className="text-xs font-bold text-white">
                                Opções de Imagens para o Estoque Principal
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-400">
                              Produto Base: <strong className="text-sky-300">{baseProd?.name || editForm.baseProductName}</strong>
                            </span>
                          </div>

                          {/* 3 Strategy Buttons Grid */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {/* Option 1: Use Base Product Images */}
                            <button
                              type="button"
                              onClick={() => {
                                setEditForm(prev => prev ? {
                                  ...prev,
                                  photosProduct: baseImgs.productPhotos.length > 0 ? baseImgs.productPhotos : (baseImgs.main ? [baseImgs.main] : []),
                                  photosBox: baseImgs.boxPhotos,
                                  photosAccessories: baseImgs.accessoriesPhotos
                                } : null);
                                setActionSuccess('Fotos do Catálogo Base aplicadas!');
                                setTimeout(() => setActionSuccess(null), 2500);
                              }}
                              className="p-2.5 bg-slate-950 hover:bg-sky-950/40 border border-slate-800 hover:border-sky-500/50 rounded-lg text-left transition-all flex flex-col justify-between gap-2 group cursor-pointer"
                              title="Substituir galeria pelas fotos oficiais cadastradas no Catálogo Base"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-sky-400 flex items-center gap-1.5">
                                  <ImageIcon className="w-3.5 h-3.5" />
                                  Usar Imagem da Base
                                </span>
                                {baseImgs.main && (
                                  <img src={baseImgs.main} alt="Base" className="w-6 h-6 rounded object-cover border border-slate-700 shrink-0" />
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400 leading-tight">
                                Aplica fotos oficiais do produto base sem duplicar dados.
                              </span>
                            </button>

                            {/* Option 2: Keep Saved Triage Photos */}
                            <button
                              type="button"
                              disabled={origSavedCount === 0}
                              onClick={() => {
                                if (originalUnitPhotos) {
                                  setEditForm(prev => prev ? {
                                    ...prev,
                                    photosProduct: [...originalUnitPhotos.photosProduct],
                                    photosBox: [...originalUnitPhotos.photosBox],
                                    photosAccessories: [...originalUnitPhotos.photosAccessories]
                                  } : null);
                                  setActionSuccess('Fotos salvas da triagem restauradas!');
                                  setTimeout(() => setActionSuccess(null), 2500);
                                }
                              }}
                              className={`p-2.5 rounded-lg text-left transition-all flex flex-col justify-between gap-2 group ${
                                origSavedCount > 0 
                                  ? 'bg-slate-950 hover:bg-emerald-950/40 border border-slate-800 hover:border-emerald-500/50 cursor-pointer' 
                                  : 'bg-slate-950/50 border border-slate-800 opacity-40 cursor-not-allowed'
                              }`}
                              title={origSavedCount > 0 ? "Restaurar fotos que já estavam cadastradas na triagem deste item" : "Nenhuma foto salva anteriormente"}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1.5">
                                  <Camera className="w-3.5 h-3.5" />
                                  Usar Fotos Salvas
                                </span>
                                {originalUnitPhotos?.photosProduct?.[0] && (
                                  <img src={originalUnitPhotos.photosProduct[0]} alt="Salva" className="w-6 h-6 rounded object-cover border border-slate-700 shrink-0" />
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400 leading-tight">
                                {origSavedCount > 0 ? `Mantém as ${origSavedCount} foto(s) da triagem.` : 'Sem fotos salvas da triagem.'}
                              </span>
                            </button>

                            {/* Option 3: Combine Both */}
                            <button
                              type="button"
                              onClick={() => {
                                setEditForm(prev => {
                                  if (!prev) return null;
                                  const currentProd = [...(prev.photosProduct || [])];
                                  const currentBox = [...(prev.photosBox || [])];
                                  const currentAcc = [...(prev.photosAccessories || [])];

                                  const baseProdList = baseImgs.productPhotos.length > 0 ? baseImgs.productPhotos : (baseImgs.main ? [baseImgs.main] : []);
                                  for (const img of baseProdList) {
                                    if (!currentProd.includes(img)) currentProd.push(img);
                                  }
                                  for (const img of baseImgs.boxPhotos) {
                                    if (!currentBox.includes(img)) currentBox.push(img);
                                  }
                                  for (const img of baseImgs.accessoriesPhotos) {
                                    if (!currentAcc.includes(img)) currentAcc.push(img);
                                  }
                                  return {
                                    ...prev,
                                    photosProduct: currentProd,
                                    photosBox: currentBox,
                                    photosAccessories: currentAcc
                                  };
                                });
                                setActionSuccess('Fotos salvas combinadas com a Base!');
                                setTimeout(() => setActionSuccess(null), 2500);
                              }}
                              className="p-2.5 bg-slate-950 hover:bg-amber-950/40 border border-slate-800 hover:border-amber-500/50 rounded-lg text-left transition-all flex flex-col justify-between gap-2 group cursor-pointer"
                              title="Mesclar fotos da triagem com imagens oficiais do Catálogo Base"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-amber-400 flex items-center gap-1.5">
                                  <Layers className="w-3.5 h-3.5" />
                                  Combinar Ambas
                                </span>
                                <div className="flex -space-x-1.5 shrink-0">
                                  {originalUnitPhotos?.photosProduct?.[0] && (
                                    <img src={originalUnitPhotos.photosProduct[0]} alt="Salva" className="w-5 h-5 rounded-full object-cover border border-slate-700" />
                                  )}
                                  {baseImgs.main && (
                                    <img src={baseImgs.main} alt="Base" className="w-5 h-5 rounded-full object-cover border border-slate-700" />
                                  )}
                                </div>
                              </div>
                              <span className="text-[10px] text-slate-400 leading-tight">
                                Junta fotos da triagem + imagens da base.
                              </span>
                            </button>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* Add photo inputs toolbar with Paste Button */}
                  <div className="p-3.5 bg-slate-900 rounded-xl border border-slate-800 space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Upload from Computer */}
                      <label className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 shadow-sm hover:shadow">
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload do Computador</span>
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
                        className="px-3.5 py-2 bg-sky-600 hover:bg-sky-500 active:scale-95 text-white font-bold rounded-lg text-xs transition-all flex items-center gap-1.5 shrink-0 shadow-sm hover:shadow cursor-pointer"
                        title="Colar imagem ou screenshot copiado para a categoria selecionada"
                      >
                        <ClipboardPaste className="w-3.5 h-3.5" />
                        <span>Colar Imagem</span>
                        <span className="text-[10px] bg-sky-700/80 px-1 py-0.5 rounded font-mono font-normal">Ctrl+V</span>
                      </button>

                      {/* URL input */}
                      <div className="flex-1 min-w-[240px] flex items-center gap-2">
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
                          placeholder="Cole o link da imagem (https://...)" 
                          className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500 placeholder:text-slate-600" 
                        />
                        <button 
                          type="button" 
                          onClick={() => handleAddPhotoUrl(urlInputCategory)}
                          disabled={isSanitizingUrl || !imageUrlInput.trim()}
                          className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-200 font-bold rounded-lg text-xs transition-colors shrink-0 cursor-pointer flex items-center gap-1.5"
                        >
                          {isSanitizingUrl ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-400" />
                              <span>Sanitizando...</span>
                            </>
                          ) : (
                            <>
                              <span>Adicionar URL</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 pt-0.5">
                      <span className="flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-sky-400" />
                        Destino ativo: <strong className="text-sky-300">
                          {urlInputCategory === 'photosProduct' ? 'Fotos do Aparelho' : urlInputCategory === 'photosBox' ? 'Fotos da Embalagem' : 'Fotos dos Acessórios'}
                        </strong>
                      </span>
                      <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" />
                        Sanitização e desinfecção de fotos ativada
                      </span>
                    </div>
                  </div>

                  {/* Categories preview grids with delete overlay and dropzones */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Product Photos */}
                    <div 
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleDropPhoto(e, 'photosProduct')}
                      onPaste={(e) => handleEditModalPaste(e, 'photosProduct')}
                      onClick={() => setUrlInputCategory('photosProduct')}
                      className={`p-3.5 rounded-xl border transition-all space-y-2.5 ${
                        urlInputCategory === 'photosProduct' 
                          ? 'bg-slate-900/90 border-sky-500/60 shadow-lg shadow-sky-500/5 ring-1 ring-sky-500/30' 
                          : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex justify-between items-center text-[11px] font-bold text-slate-300 border-b border-slate-800 pb-2">
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
                        <div className="grid grid-cols-2 gap-2">
                          {editForm.photosProduct.map((p, i) => (
                            <div key={i} className="relative aspect-video rounded-lg overflow-hidden border border-slate-700 group bg-slate-950">
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
                                className="absolute top-1 right-1 p-1 bg-rose-600/90 text-white rounded-md hover:bg-rose-500 transition-colors shadow-md cursor-pointer opacity-80 hover:opacity-100"
                                title="Remover foto"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div 
                          className="border border-dashed border-slate-800 hover:border-sky-500/50 rounded-lg p-4 text-center cursor-pointer transition-colors bg-slate-950/40"
                          onClick={(e) => {
                            e.stopPropagation();
                            setUrlInputCategory('photosProduct');
                          }}
                        >
                          <Upload className="w-5 h-5 mx-auto text-slate-500 mb-1" />
                          <p className="text-[11px] text-slate-300 font-semibold">Sem fotos do aparelho</p>
                          <p className="text-[9px] text-slate-500 mt-0.5">Clique aqui, use Ctrl+V ou arraste imagens</p>
                        </div>
                      )}
                    </div>

                    {/* Box Photos */}
                    <div 
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleDropPhoto(e, 'photosBox')}
                      onPaste={(e) => handleEditModalPaste(e, 'photosBox')}
                      onClick={() => setUrlInputCategory('photosBox')}
                      className={`p-3.5 rounded-xl border transition-all space-y-2.5 ${
                        urlInputCategory === 'photosBox' 
                          ? 'bg-slate-900/90 border-sky-500/60 shadow-lg shadow-sky-500/5 ring-1 ring-sky-500/30' 
                          : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex justify-between items-center text-[11px] font-bold text-slate-300 border-b border-slate-800 pb-2">
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
                        <div className="grid grid-cols-2 gap-2">
                          {editForm.photosBox.map((p, i) => (
                            <div key={i} className="relative aspect-video rounded-lg overflow-hidden border border-slate-700 group bg-slate-950">
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
                                className="absolute top-1 right-1 p-1 bg-rose-600/90 text-white rounded-md hover:bg-rose-500 transition-colors shadow-md cursor-pointer opacity-80 hover:opacity-100"
                                title="Remover foto"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div 
                          className="border border-dashed border-slate-800 hover:border-sky-500/50 rounded-lg p-4 text-center cursor-pointer transition-colors bg-slate-950/40"
                          onClick={(e) => {
                            e.stopPropagation();
                            setUrlInputCategory('photosBox');
                          }}
                        >
                          <Upload className="w-5 h-5 mx-auto text-slate-500 mb-1" />
                          <p className="text-[11px] text-slate-300 font-semibold">Sem fotos da caixa</p>
                          <p className="text-[9px] text-slate-500 mt-0.5">Clique aqui, use Ctrl+V ou arraste imagens</p>
                        </div>
                      )}
                    </div>

                    {/* Accessories Photos */}
                    <div 
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleDropPhoto(e, 'photosAccessories')}
                      onPaste={(e) => handleEditModalPaste(e, 'photosAccessories')}
                      onClick={() => setUrlInputCategory('photosAccessories')}
                      className={`p-3.5 rounded-xl border transition-all space-y-2.5 ${
                        urlInputCategory === 'photosAccessories' 
                          ? 'bg-slate-900/90 border-sky-500/60 shadow-lg shadow-sky-500/5 ring-1 ring-sky-500/30' 
                          : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex justify-between items-center text-[11px] font-bold text-slate-300 border-b border-slate-800 pb-2">
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
                        <div className="grid grid-cols-2 gap-2">
                          {editForm.photosAccessories.map((p, i) => (
                            <div key={i} className="relative aspect-video rounded-lg overflow-hidden border border-slate-700 group bg-slate-950">
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
                                className="absolute top-1 right-1 p-1 bg-rose-600/90 text-white rounded-md hover:bg-rose-500 transition-colors shadow-md cursor-pointer opacity-80 hover:opacity-100"
                                title="Remover foto"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div 
                          className="border border-dashed border-slate-800 hover:border-sky-500/50 rounded-lg p-4 text-center cursor-pointer transition-colors bg-slate-950/40"
                          onClick={(e) => {
                            e.stopPropagation();
                            setUrlInputCategory('photosAccessories');
                          }}
                        >
                          <Upload className="w-5 h-5 mx-auto text-slate-500 mb-1" />
                          <p className="text-[11px] text-slate-300 font-semibold">Sem fotos de acessórios</p>
                          <p className="text-[9px] text-slate-500 mt-0.5">Clique aqui, use Ctrl+V ou arraste imagens</p>
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
                      onClick={(e) => handleCopyCode(currentUnit.trackingCode.replace(/^#/, ''), 'sti', e)}
                      className="w-full text-left font-mono text-xs sm:text-sm font-bold text-slate-200 bg-slate-900 hover:bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-800 block truncate transition-colors cursor-pointer group flex items-center justify-between"
                      title="Clique para copiar Código STI"
                    >
                      <span className="truncate">{currentUnit.trackingCode.startsWith('#') ? currentUnit.trackingCode : `#${currentUnit.trackingCode}`}</span>
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
                  </div>
                </div>

                {/* Secondary metadata: Origin & Dates */}
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-slate-950/60 p-3.5 px-4 rounded-xl border border-slate-800/60">
                  <div className="flex flex-wrap items-center gap-3">
                    {currentUnit.destinationSector !== 'Openbox' && (
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 font-semibold text-[11px]">Canal:</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getPlatformStyle(currentUnit.platform)}`}>
                          {currentUnit.platform}
                        </span>
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
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <span>Data de Entrada: <strong className="text-slate-200">{new Date(currentUnit.createdAt).toLocaleDateString('pt-BR')} às {new Date(currentUnit.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</strong></span>
                      </div>
                      <span className="text-slate-600 hidden sm:inline">•</span>
                      {currentUnit.excludeFromDailyCount ? (
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            Ignorado do Contador Diário
                          </span>
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              await onUpdateUnit({ ...currentUnit, excludeFromDailyCount: false });
                              setActionSuccess('Unidade reativada no contador de entrada diária!');
                              setTimeout(() => setActionSuccess(null), 2500);
                            }}
                            className="text-[10px] text-sky-400 hover:text-sky-300 underline font-semibold cursor-pointer"
                            id="btn-reactivate-daily-count"
                          >
                            Reativar no Contador
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                            Ativo no Contador Diário
                          </span>
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              await onUpdateUnit({ ...currentUnit, excludeFromDailyCount: true });
                              setActionSuccess('Unidade removida do contador diário!');
                              setTimeout(() => setActionSuccess(null), 2500);
                            }}
                            className="text-[10px] text-rose-400 hover:text-rose-300 underline font-semibold cursor-pointer"
                            id="btn-remove-from-daily-count"
                          >
                            Remover do Contador
                          </button>
                        </div>
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

                {/* Integrated Photo Gallery split by logical category */}
                {(() => {
                  const resolved = getUnitResolvedPhotos(currentUnit, products);
                  return (
                    <div className="space-y-3">
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
                                  className="w-full aspect-video rounded-lg overflow-hidden border border-slate-800 hover:border-sky-500 cursor-pointer relative group transition-colors"
                                >
                                  <img src={p} className="w-full h-full object-cover" />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs transition-opacity">
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
                                  className="w-full aspect-video rounded-lg overflow-hidden border border-slate-800 hover:border-sky-500 cursor-pointer relative group transition-colors"
                                >
                                  <img src={p} className="w-full h-full object-cover" />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs transition-opacity">
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
                                  className="w-full aspect-video rounded-lg overflow-hidden border border-slate-800 hover:border-sky-500 cursor-pointer relative group transition-colors"
                                >
                                  <img src={p} className="w-full h-full object-cover" />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs transition-opacity">
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
          className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
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
          className="fixed inset-0 z-[110] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
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
