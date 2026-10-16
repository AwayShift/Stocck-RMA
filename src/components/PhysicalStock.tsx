/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  ArrowRightLeft,
  ArrowRight,
  Box,
  Tag,
  GitCompare,
  Plus
} from 'lucide-react';
import { TriageUnit, DestinationSectorType, PlatformType, BaseProduct, DeviceStatusType, PackageStatusType, PendingItem } from '../types';
import ExcelImportModal from './ExcelImportModal';
import ProductCompareModal from './ProductCompareModal';
import { getPlatformFilterStyle, getSectorFilterStyle } from '../utils/filterColorHelpers';
import { ImageZoomModal } from './ImageZoomModal';
import { getUnitResolvedPhotos, getBaseProductImages, findBaseProduct, getResolvedUnitProductName, getOptimizedThumbnailUrl } from '../utils/productImages';
import { exportStockInventoryToExcel } from '../utils/excelHelpers';
import { processSafeImageUrl } from '../lib/imageSecurityService';
import { uploadFileToStorage, uploadImageUrlToStorage } from '../lib/dbService';
import { CategoryBadge } from './CategoryBadge';
import { buildGroupedFilterCategories, checkCategoryFilterMatch } from '../utils/categoryTaxonomy';
import { RichTextEditor } from './RichTextEditor';
import { formatStiInput, isValidStiCode, normalizeStiCode, formatStiBadge } from '../utils/stiFormatter';
import { StiCodeInput } from './StiCodeInput';
import { validatePendingItemLink, findPendingItemByRegistrationNumber } from '../utils/pendingRegistrationHelper';
import QuickRegisterSkuModal from './QuickRegisterSkuModal';
import { StockUnitEditModal } from './StockUnitEditModal';
import { StockUnitDetailsModal } from './StockUnitDetailsModal';

export const isUnitPendingSkuRegistration = (unit: TriageUnit, productsList?: BaseProduct[]): boolean => {
  if (!unit) return false;
  if (unit.needsSkuRegistration === true || unit.skuRegistrationPending === true) return true;
  if (unit.baseProductId === 'unregistered' || unit.baseProductId === '' || unit.baseProductId?.startsWith('unregistered-')) return true;
  if (Array.isArray(productsList) && productsList.length > 0 && unit.baseProductSku) {
    const cleanSku = unit.baseProductSku.trim().toLowerCase();
    const exists = productsList.some(p => p.sku && p.sku.trim().toLowerCase() === cleanSku);
    if (!exists && unit.baseProductId === 'unregistered') return true;
  }
  return false;
};

interface PhysicalStockProps {
  units: TriageUnit[];
  products?: BaseProduct[];
  pendingItems?: PendingItem[];
  onUpdateUnit: (unit: TriageUnit) => Promise<void>;
  onDeleteUnit: (id: string) => Promise<void>;
  onCheckoutUnit: (id: string) => Promise<void>;
  onRevertCheckoutUnit?: (id: string) => Promise<void>;
  initialSelectedUnit?: TriageUnit | null;
  openModalOnInitialSelect?: boolean;
  onClearSelectedUnit?: () => void;
  onGoToStockDirectly?: (unit: TriageUnit) => void;
  onSaveTriage?: (unit: TriageUnit) => Promise<void>;
  onProductCreated?: (product: BaseProduct) => void;
  enableSpreadsheetImport?: boolean;
  enableSpreadsheetExport?: boolean;
  isLight?: boolean;
  initialPlatformFilter?: PlatformType | null;
  initialSectorFilter?: DestinationSectorType | null;
  initialSearchTerm?: string | null;
  initialPendingSkuFilter?: boolean;
  onClearInitialFilters?: () => void;
  currentTab?: 'dashboard' | 'rma' | 'catalog' | 'stock' | 'pending' | 'movement';
  userRole?: 'admin' | 'operator' | 'viewer' | null;
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

export const isRealStockTransfer = (originSector?: string): boolean => {
  if (!originSector) return false;
  const s = originSector.trim().toLowerCase();
  if (s === 'pendências' || s === 'pendencias' || s === 'sem setor' || s === '') return false;
  return ['principal', 'estoque principal', 'rma', 'openbox', 'outros', 'outro'].includes(s);
};

export const isUnitInSector = (unit: TriageUnit, sectorTab: string): boolean => {
  if (sectorTab === 'Baixado') {
    return unit.status === 'Baixado';
  }
  if (unit.status !== 'Estoque') return false;
  if (sectorTab === 'Todos') return true;

  const dest = (unit.destinationSector || 'Principal').trim().toLowerCase();
  const target = sectorTab.trim().toLowerCase();

  if (target === 'principal') {
    return dest === 'principal' || dest === 'estoque' || dest === '' || (!['openbox', 'rma', 'outros', 'outro'].includes(dest));
  }
  if (target === 'outros' || target === 'outro') {
    return dest === 'outros' || dest === 'outro';
  }
  return dest === target;
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
  openModalOnInitialSelect = true,
  onClearSelectedUnit,
  onGoToStockDirectly,
  onSaveTriage,
  onProductCreated,
  enableSpreadsheetImport = true,
  enableSpreadsheetExport = true,
  isLight = false,
  initialPlatformFilter,
  initialSectorFilter,
  initialSearchTerm,
  initialPendingSkuFilter,
  onClearInitialFilters,
  currentTab = 'stock',
  userRole
}: PhysicalStockProps) {
  const isReadOnly = userRole === 'viewer';
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm || '');
  const [selectedBrand, setSelectedBrand] = useState<string>('Todas');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [selectedPlatform, setSelectedPlatform] = useState<string>(initialPlatformFilter || 'Todas');
  const [selectedVoltage, setSelectedVoltage] = useState<string>('Todas');
  const [selectedDate, setSelectedDate] = useState<string>(''); // YYYY-MM-DD
  const dateInputRef = useRef<HTMLInputElement>(null);

  // React to initial search term changes from navigation
  useEffect(() => {
    if (initialSearchTerm !== undefined && initialSearchTerm !== null) {
      setSearchTerm(initialSearchTerm);
      if (onClearInitialFilters) {
        onClearInitialFilters();
      }
    }
  }, [initialSearchTerm, onClearInitialFilters]);

  // React to initial platform filter changes from Dashboard navigation
  useEffect(() => {
    if (initialPlatformFilter !== undefined && initialPlatformFilter !== null) {
      setSelectedPlatform(initialPlatformFilter || 'Todas');
      if (onClearInitialFilters) {
        onClearInitialFilters();
      }
    }
  }, [initialPlatformFilter, onClearInitialFilters]);

  // React to initial sector filter changes from Dashboard navigation
  useEffect(() => {
    if (initialSectorFilter) {
      setActiveTab(initialSectorFilter);
      if (onClearInitialFilters) {
        onClearInitialFilters();
      }
    }
  }, [initialSectorFilter, onClearInitialFilters]);

  // React to initial pending SKU filter from Base Catalog / Dashboard navigation
  useEffect(() => {
    if (initialPendingSkuFilter) {
      setFilterOnlyPendingSku(true);
      if (onClearInitialFilters) {
        onClearInitialFilters();
      }
    }
  }, [initialPendingSkuFilter, onClearInitialFilters]);

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
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [highlightedUnitId, setHighlightedUnitId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    const saved = localStorage.getItem('rma_stock_view_mode');
    return saved === 'list' ? 'list' : 'grid';
  });

  const handleSetViewMode = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('rma_stock_view_mode', mode);
  };

  // Pagination state (visible items limit in stock list)
  const [visibleCount, setVisibleCount] = useState<number>(20);

  // Spreadsheet / Excel import modal state
  const [isExcelModalOpen, setIsExcelModalOpen] = useState<boolean>(false);

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

  // Sector transfer to Openbox modal state (mandatory STI requirement)
  const [openboxMoveModalData, setOpenboxMoveModalData] = useState<{
    unit: TriageUnit;
    stiCode: string;
    error: string | null;
  } | null>(null);

  // Base Product Comparison Modal state (for units not in Estoque Principal)
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);

  // Selected unit details
  const currentUnit = units.find(u => u.id === selectedUnitId);

  // Resolved STI code for currentUnit (direct trackingCode or fallback from linked pending item)
  const resolvedCurrentUnitSti = useMemo(() => {
    if (!currentUnit) return '';
    const rawSti = (currentUnit.trackingCode || '').trim();
    if (rawSti) {
      return normalizeStiCode(rawSti) || rawSti;
    }
    // Fallback: check if linked pending item has an STI/trackingCode
    if (currentUnit.pendingRegistrationNumber || currentUnit.pendingItemId) {
      const linked = pendingItems.find(p => 
        (currentUnit.pendingItemId && p.id === currentUnit.pendingItemId) ||
        (currentUnit.pendingRegistrationNumber && p.registrationNumber && p.registrationNumber.trim().toUpperCase() === currentUnit.pendingRegistrationNumber.trim().toUpperCase())
      );
      if (linked?.trackingCode && linked.trackingCode.trim()) {
        const pSti = linked.trackingCode.trim();
        return normalizeStiCode(pSti) || pSti;
      }
    }
    return '';
  }, [currentUnit, pendingItems]);

  // Edit modal mode for selected unit
  const [isEditingUnit, setIsEditingUnit] = useState(false);

  // Helper to scroll to a specific unit card in the DOM (supports both grid and list view)
  const scrollToUnit = useCallback((targetId: string) => {
    if (currentTab !== 'stock') return false;
    const gridElem = document.getElementById(`stock-unit-${targetId}`);
    const listElem = document.getElementById(`stock-unit-list-${targetId}`);
    const targetElem = gridElem || listElem;
    if (targetElem) {
      targetElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return true;
    }
    return false;
  }, [currentTab]);

  // Reference to hold active visual highlighting timer
  const highlightTimerRef = useRef<NodeJS.Timeout | null>(null);
  const handledInitialUnitRef = useRef<string | null>(null);

  // Automatically remove visual highlighting on the unit card after 10 seconds (10000ms)
  useEffect(() => {
    if (!highlightedUnitId) {
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = null;
      }
      return;
    }

    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
    }

    highlightTimerRef.current = setTimeout(() => {
      setHighlightedUnitId(null);
      highlightTimerRef.current = null;
    }, 10000);

    return () => {
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = null;
      }
    };
  }, [highlightedUnitId]);

  // Smoothly scroll to the highlighted unit across multiple rendering frames ONLY when in stock tab
  useEffect(() => {
    if (!highlightedUnitId || currentTab !== 'stock') return;
    const attemptScroll = () => {
      if (currentTab !== 'stock') return;
      if (!scrollToUnit(highlightedUnitId)) {
        requestAnimationFrame(() => {
          if (currentTab === 'stock') {
            scrollToUnit(highlightedUnitId);
          }
        });
      }
    };

    const t0 = setTimeout(attemptScroll, 60);
    const t1 = setTimeout(attemptScroll, 180);
    const t2 = setTimeout(attemptScroll, 380);
    const t3 = setTimeout(attemptScroll, 750);
    const t4 = setTimeout(attemptScroll, 1300);

    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [highlightedUnitId, scrollToUnit, currentTab]);

  // When active tab changes:
  // 1. Leaving 'stock': always clear highlight, cancel timer, close modal details, and reset handled unit ref
  // 2. Returning to 'stock' without initialSelectedUnit: clean slate (no residual highlight, no linger modal)
  const prevTabRef = useRef(currentTab);
  useEffect(() => {
    if (prevTabRef.current !== currentTab) {
      if (currentTab !== 'stock') {
        if (highlightTimerRef.current) {
          clearTimeout(highlightTimerRef.current);
          highlightTimerRef.current = null;
        }
        setHighlightedUnitId(null);
        setSelectedUnitId(null);
        setIsEditingUnit(false);
        setIsCompareModalOpen(false);
        handledInitialUnitRef.current = null;
      } else if (currentTab === 'stock' && !initialSelectedUnit) {
        setHighlightedUnitId(null);
        setSelectedUnitId(null);
        setIsEditingUnit(false);
      }
      prevTabRef.current = currentTab;
    }
  }, [currentTab, initialSelectedUnit]);

  // When initialSelectedUnit arrives from click, position screen on the item, open modal, and set matching sector tab
  React.useEffect(() => {
    if (initialSelectedUnit) {
      const targetId = initialSelectedUnit.id;

      // Avoid re-processing if already handled for this specific unit
      if (handledInitialUnitRef.current === targetId && highlightedUnitId === targetId) {
        return;
      }
      handledInitialUnitRef.current = targetId;

      // 1. OPEN THE MODAL ONLY IF openModalOnInitialSelect is true!
      if (openModalOnInitialSelect) {
        setSelectedUnitId(targetId);
        setIsEditingUnit(false);
      } else {
        setSelectedUnitId(null);
        setIsEditingUnit(false);
      }

      // 2. Set the active tab to the item's sector/category tab so it displays properly in its sector
      if (initialSelectedUnit.status === 'Baixado') {
        setActiveTab('Baixado');
      } else {
        const dest = (initialSelectedUnit.destinationSector || '').trim().toLowerCase();
        if (dest === 'openbox') {
          setActiveTab('Openbox');
        } else if (dest === 'rma') {
          setActiveTab('RMA');
        } else if (dest === 'outros' || dest === 'outro') {
          setActiveTab('Outros');
        } else {
          setActiveTab('Principal');
        }
      }

      // 3. Keep search term empty so all products of the tab/sector are displayed
      setSearchTerm('');

      // 4. Reset dropdown filters to 'Todas' so they NEVER hide anything!
      setFilterOnlyDuplicates(false);
      setSelectedBrand('Todas');
      setSelectedCategory('Todas');
      setSelectedPlatform('Todas');
      setSelectedVoltage('Todas');
      setSelectedDate('');

      // 5. Ensure visibleCount is large enough so that the card is rendered in the DOM
      const rawIdx = units.findIndex(u => u.id === targetId);
      if (rawIdx >= 0) {
        setVisibleCount(prev => Math.max(prev, rawIdx + 50));
      }

      // 6. Trigger discreet visual signaling on the card ONLY when navigating directly to stock (without opening modal)
      if (!openModalOnInitialSelect) {
        setHighlightedUnitId(targetId);
      }

      // Clear the prop in parent so it does not persist when navigating away and returning!
      if (onClearSelectedUnit) {
        onClearSelectedUnit();
      }
    }
  }, [initialSelectedUnit?.id, openModalOnInitialSelect, units, onClearSelectedUnit]);

  // When PhysicalStock unmounts (user switches tab), clear any residual parent filters
  useEffect(() => {
    return () => {
      if (onClearSelectedUnit) onClearSelectedUnit();
      if (onClearInitialFilters) onClearInitialFilters();
    };
  }, [onClearSelectedUnit, onClearInitialFilters]);

  const handleCloseDetails = () => {
    setSelectedUnitId(null);
    if (onClearSelectedUnit) {
      onClearSelectedUnit();
    }
    setEditingSector('');
    setIsEditingUnit(false);
    setIsCompareModalOpen(false);
  };

  const handleStartEdit = (unit: TriageUnit) => {
    if (isReadOnly) {
      alert('Modo apenas leitura: você está no modo visitante e não pode editar unidades.');
      return;
    }
    setSelectedUnitId(unit.id);
    setIsEditingUnit(true);
  };

  const handleGoToStock = (unit: TriageUnit) => {
    handleCloseDetails();
    if (onGoToStockDirectly) {
      onGoToStockDirectly(unit);
    } else {
      setSelectedUnitId(null);
      if (unit.status === 'Baixado') {
        setActiveTab('Baixado');
      } else {
        const dest = (unit.destinationSector || '').trim().toLowerCase();
        setActiveTab(dest === 'openbox' ? 'Openbox' : dest === 'rma' ? 'RMA' : 'Principal');
      }
      setHighlightedUnitId(unit.id);
      scrollToUnit(unit.id);
    }
  };

  // State to toggle filtering only duplicate items
  const [filterOnlyDuplicates, setFilterOnlyDuplicates] = useState(false);

  // State to toggle filtering only units whose SKU is pending registration in the base catalog
  const [filterOnlyPendingSku, setFilterOnlyPendingSku] = useState(false);
  const [quickRegisterUnit, setQuickRegisterUnit] = useState<TriageUnit | null>(null);

  // Track duplicated STI Codes (trackingCode) and Serial Numbers (serialNumber) in active physical stock
  const duplicateStiSet = React.useMemo(() => {
    const counts: Record<string, number> = {};
    units.forEach(u => {
      if (u.status === 'Estoque' && u.destinationSector === 'Openbox' && u.trackingCode && u.trackingCode.trim()) {
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
    if (unit.destinationSector !== 'Openbox') return false;
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

  // Units in the current sector tab (e.g. Todos Ativos, Principal, Openbox, RMA, Baixado)
  const tabUnits = React.useMemo(() => {
    if (activeTab === 'Todos') {
      return units.filter(u => u.status === 'Estoque');
    } else if (activeTab === 'Baixado') {
      return units.filter(u => u.status === 'Baixado');
    } else {
      return units.filter(u => isUnitInSector(u, activeTab));
    }
  }, [units, activeTab]);

  // Duplicates count in the current sector tab (only shows button when count > 0)
  const duplicateUnitsCount = React.useMemo(() => {
    return tabUnits.filter(u => isDuplicateSti(u) || isDuplicateSerial(u)).length;
  }, [tabUnits, duplicateStiSet, duplicateSerialSet]);

  // Pending SKU registration count in the current sector tab (only shows button when count > 0)
  const pendingSkuUnitsCount = React.useMemo(() => {
    return tabUnits.filter(u => isUnitPendingSkuRegistration(u, products)).length;
  }, [tabUnits, products]);

  // Auto-reset filters if corresponding counts drop to 0 in the current tab
  useEffect(() => {
    if (duplicateUnitsCount === 0 && filterOnlyDuplicates) {
      setFilterOnlyDuplicates(false);
    }
  }, [duplicateUnitsCount, filterOnlyDuplicates]);

  useEffect(() => {
    if (pendingSkuUnitsCount === 0 && filterOnlyPendingSku) {
      setFilterOnlyPendingSku(false);
    }
  }, [pendingSkuUnitsCount, filterOnlyPendingSku]);

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
    setFilterOnlyPendingSku(false);
  };

  const hasActiveFilters = Boolean(
    searchTerm.trim() || 
    selectedBrand !== 'Todas' || 
    selectedCategory !== 'Todas' || 
    selectedPlatform !== 'Todas' ||
    selectedVoltage !== 'Todas' || 
    selectedDate !== '' ||
    filterOnlyDuplicates ||
    filterOnlyPendingSku
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

      // 0.1 Filter only items whose SKU is pending registration in the base catalog
      if (filterOnlyPendingSku && !isUnitPendingSkuRegistration(unit, products)) {
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

      // 4. Search filter (supports SKU, Name, STI, Serial, Order, Registration, Platform, Notes, Reason, etc.)
      const term = searchTerm.toLowerCase().trim();
      const cleanTerm = term.replace(/^[#]/, '').trim();
      const brandName = (baseProd?.brand || '').toLowerCase();
      const categoryName = (baseProd?.category || '').toLowerCase();
      const baseProdName = (baseProd?.name || '').toLowerCase();
      const baseProdSku = (baseProd?.sku || '').toLowerCase();

      // Clean notes from HTML tags and internal metadata tags ([INITIAL_ENTRY_DATE:...], [CREATED_BY:...], etc.)
      const cleanNotesText = stripHtml(unit.notes || '')
        .replace(/\[[A-Z_]+:.*?\]/g, '')
        .replace(/\[EXCLUDE_DAILY_COUNT\]/g, '')
        .toLowerCase();

      const matchesSearch = !term ||
        (unit.baseProductName || '').toLowerCase().includes(term) ||
        (unit.baseProductSku || '').toLowerCase().includes(term) ||
        baseProdName.includes(term) ||
        baseProdSku.includes(term) ||
        brandName.includes(term) ||
        categoryName.includes(term) ||
        (unit.trackingCode || '').toLowerCase().includes(term) ||
        (Boolean(cleanTerm) && (unit.trackingCode || '').toLowerCase().includes(cleanTerm)) ||
        (unit.orderNumber || '').toLowerCase().includes(term) ||
        (Boolean(cleanTerm) && (unit.orderNumber || '').toLowerCase().includes(cleanTerm)) ||
        (unit.serialNumber || '').toLowerCase().includes(term) ||
        (Boolean(cleanTerm) && (unit.serialNumber || '').toLowerCase().includes(cleanTerm)) ||
        (unit.pendingRegistrationNumber || '').toLowerCase().includes(term) ||
        (Boolean(cleanTerm) && (unit.pendingRegistrationNumber || '').toLowerCase().includes(cleanTerm)) ||
        (unit.platform || '').toLowerCase().includes(term) ||
        (unit.customerReason || '').toLowerCase().includes(term) ||
        (unit.destinationSector || '').toLowerCase().includes(term) ||
        cleanNotesText.includes(term);

      // 5. Tab sector filter
      if (activeTab === 'Todos') {
        return matchesSearch && unit.status === 'Estoque';
      } else if (activeTab === 'Baixado') {
        return matchesSearch && unit.status === 'Baixado';
      } else {
        return isUnitInSector(unit, activeTab) && matchesSearch;
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
  }, [units, filterOnlyDuplicates, filterOnlyPendingSku, selectedBrand, selectedCategory, selectedPlatform, selectedVoltage, selectedDate, searchTerm, activeTab, products]);

  // Reset pagination limit when search term, filters, sector tab, date, or duplicate filter changes,
  // BUT do not cap at 20 if we are navigating to a specific target unit from another tab!
  useEffect(() => {
    const targetId = highlightedUnitId || initialSelectedUnit?.id;
    if (targetId) {
      const idx = filteredUnits.findIndex(u => u.id === targetId);
      const rawIdx = units.findIndex(u => u.id === targetId);
      const targetIndex = Math.max(idx, rawIdx);
      if (targetIndex >= 0) {
        setVisibleCount(prev => Math.max(prev, targetIndex + 50));
        return;
      }
    }
    setVisibleCount(20);
  }, [searchTerm, selectedBrand, selectedCategory, selectedVoltage, selectedDate, activeTab, filterOnlyDuplicates, filterOnlyPendingSku]);

  // Ensure visibleCount expands when a target item arrives or is highlighted
  useEffect(() => {
    const targetId = highlightedUnitId || initialSelectedUnit?.id;
    if (!targetId) return;

    const idx = filteredUnits.findIndex(u => u.id === targetId);
    if (idx >= 0) {
      if (idx >= visibleCount) {
        setVisibleCount(Math.max(visibleCount, idx + 50));
      }
    } else {
      const rawIdx = units.findIndex(u => u.id === targetId);
      if (rawIdx >= 0 && rawIdx >= visibleCount) {
        setVisibleCount(Math.max(visibleCount, rawIdx + 50));
      }
    }
  }, [filteredUnits, highlightedUnitId, initialSelectedUnit, units, visibleCount]);

  // Slice filtered units according to current pagination limit (20 items per page)
  const displayedUnits = filteredUnits.slice(0, visibleCount);
  const hasMore = visibleCount < filteredUnits.length;

  // When displayedUnits updates or renders the target item, ensure it scrolls smoothly into view
  useEffect(() => {
    const targetId = highlightedUnitId || initialSelectedUnit?.id;
    if (targetId) {
      const isRendered = displayedUnits.some(u => u.id === targetId);
      if (isRendered) {
        const t = setTimeout(() => {
          scrollToUnit(targetId);
        }, 80);
        return () => clearTimeout(t);
      }
    }
  }, [displayedUnits, highlightedUnitId, initialSelectedUnit?.id, scrollToUnit]);

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
    if (isReadOnly) {
      alert('Modo apenas leitura: você está no modo visitante e não pode dar baixa em itens.');
      return;
    }
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
    if (isReadOnly) {
      alert('Modo apenas leitura: você está no modo visitante e não pode reverter baixas.');
      return;
    }
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

  // Action: Move Sector (with custom confirmation, mandatory STI for Openbox, and photo strategy options for Principal)
  const handleMoveSector = (unit: TriageUnit, newSector: DestinationSectorType) => {
    if (isReadOnly) {
      alert('Modo apenas leitura: você está no modo visitante e não pode mover unidades de setor.');
      return;
    }
    if (unit.destinationSector === newSector) return;

    // If moving to Openbox, require STI code via dedicated confirmation modal
    if (newSector === 'Openbox') {
      setEditingSector('Openbox');
      setOpenboxMoveModalData({
        unit,
        stiCode: unit.trackingCode ? formatStiInput(unit.trackingCode) : '',
        error: null
      });
      return;
    }

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

        // If moving to Principal or Outros with no previous photos, auto-reference base product images
        if ((newSector === 'Principal' || newSector === 'Outros') && savedPhotosCount === 0 && baseImgs.productPhotos.length > 0) {
          finalPhotosProduct = baseImgs.productPhotos;
        }

        const transferMoment = new Date().toISOString();
        const previousInitialDate = unit.initialEntryDate || unit.createdAt;
        const updated: TriageUnit = {
          ...unit,
          destinationSector: newSector,
          // When moving away from Openbox, clear trackingCode unless moving to Outros with existing code
          trackingCode: newSector === 'Outros' ? (unit.trackingCode || '') : '',
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

  // Action: Execute sector transfer to Openbox with mandatory STI validation
  const handleConfirmOpenboxMove = async () => {
    if (!openboxMoveModalData) return;
    const { unit, stiCode } = openboxMoveModalData;
    const cleanSti = normalizeStiCode(stiCode);

    if (!cleanSti) {
      setOpenboxMoveModalData(prev => prev ? {
        ...prev,
        error: 'O Código STI é obrigatório para mover produtos para o Openbox.'
      } : null);
      return;
    }

    if (!isValidStiCode(cleanSti)) {
      setOpenboxMoveModalData(prev => prev ? {
        ...prev,
        error: 'Código inválido. O formato obrigatório são 4 números (Ex: 1234).'
      } : null);
      return;
    }

    // Verify if this code is already used by another active unit in stock
    const isDuplicate = units.some(u => 
      u.id !== unit.id && 
      u.status === 'Estoque' && 
      normalizeStiCode(u.trackingCode) === cleanSti
    );
    if (isDuplicate) {
      setOpenboxMoveModalData(prev => prev ? {
        ...prev,
        error: `O Código "${cleanSti}" já está cadastrado em outra unidade ativa no estoque.`
      } : null);
      return;
    }

    const transferMoment = new Date().toISOString();
    const previousInitialDate = unit.initialEntryDate || unit.createdAt;
    const updated: TriageUnit = {
      ...unit,
      destinationSector: 'Openbox',
      trackingCode: cleanSti,
      originSector: unit.destinationSector,
      initialEntryDate: previousInitialDate,
      transferredAt: transferMoment,
      createdAt: transferMoment, // Recontabiliza no registro no momento da transferência
      updatedAt: transferMoment,
      excludeFromDailyCount: false
    };

    try {
      await onUpdateUnit(updated);
      setOpenboxMoveModalData(null);
      setEditingSector('');
      setActionSuccess(`Produto movido para o Openbox com sucesso! Código: #${cleanSti}`);
      setTimeout(() => setActionSuccess(null), 3500);
    } catch (err: any) {
      console.error('Error moving to Openbox:', err);
      setOpenboxMoveModalData(prev => prev ? {
        ...prev,
        error: `Erro ao mover para Openbox: ${err?.message || err}`
      } : null);
    }
  };

  const handleCancelOpenboxMove = () => {
    setOpenboxMoveModalData(null);
    setEditingSector('');
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
      trackingCode: targetSector === 'Openbox' ? unit.trackingCode : '',
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
    if (isReadOnly) {
      alert('Modo apenas leitura: você está no modo visitante e não pode excluir registros.');
      return;
    }
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
      case 'Outros': return 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20';
      default: return 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20';
    }
  };

  const getPlatformStyle = (p: PlatformType) => {
    switch(p) {
      case 'Mercado Livre': return 'bg-yellow-400/15 text-yellow-900 dark:text-yellow-300 dark:bg-yellow-400/20 border border-yellow-400/50 dark:border-yellow-400/60 font-bold shadow-sm shadow-yellow-500/10';
      case 'Shopee': return 'bg-orange-500/10 text-orange-800 dark:text-orange-400 border border-orange-500/30 font-medium';
      case 'Amazon': return 'bg-blue-500/10 text-sky-800 dark:text-blue-400 border border-blue-500/30 font-medium';
      case 'Amazon Ta Novo': return 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-400 border border-emerald-500/30 font-medium';
      case 'Kabum': return 'bg-indigo-500/10 text-indigo-800 dark:text-indigo-400 border border-indigo-500/30 font-medium';
      case 'Outros': return 'bg-slate-700/25 text-slate-800 dark:text-slate-200 border border-slate-600/60 font-bold';
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

          {enableSpreadsheetImport && !isReadOnly && (
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

          {isReadOnly && (
            <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 text-slate-300 border border-slate-700 rounded-xl text-xs font-semibold shrink-0">
              <Eye className="w-3.5 h-3.5 text-sky-400" />
              <span>Modo Somente Leitura</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Stock layout Card */}
      <div className={`rounded-2xl shadow-xl overflow-hidden border ${
        isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
      }`} id="stock-main-card">
        {/* Navigation Tabs bar */}
        <div className={`flex flex-wrap border-b p-2 gap-1 ${
          isLight ? 'border-slate-200 bg-slate-100' : 'border-slate-800 bg-slate-950'
        }`} id="stock-tabs">
          <button 
            onClick={() => setActiveTab('Todos')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'Todos' 
                ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/15' 
                : isLight ? 'text-slate-600 hover:text-slate-950 hover:bg-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Todos Ativos ({units.filter(u => u.status === 'Estoque').length})
          </button>
          <button 
            onClick={() => setActiveTab('Principal')}
            id="stock-tab-principal"
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'Principal' 
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/15' 
                : isLight ? 'text-slate-600 hover:text-emerald-700 hover:bg-white' : 'text-slate-400 hover:text-emerald-400 hover:bg-slate-800'
            }`}
          >
            <span className="w-2 h-2 bg-emerald-400 rounded-full"></span>
            Estoque Principal ({units.filter(u => isUnitInSector(u, 'Principal')).length})
          </button>
          <button 
            onClick={() => setActiveTab('Openbox')}
            id="stock-tab-openbox"
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'Openbox' 
                ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/15' 
                : isLight ? 'text-slate-600 hover:text-amber-700 hover:bg-white' : 'text-slate-400 hover:text-amber-400 hover:bg-slate-800'
            }`}
          >
            <span className="w-2 h-2 bg-amber-400 rounded-full"></span>
            Openbox ({units.filter(u => isUnitInSector(u, 'Openbox')).length})
          </button>
          <button 
            onClick={() => setActiveTab('RMA')}
            id="stock-tab-rma"
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'RMA' 
                ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/15' 
                : isLight ? 'text-slate-600 hover:text-rose-700 hover:bg-white' : 'text-slate-400 hover:text-rose-400 hover:bg-slate-800'
            }`}
          >
            <span className="w-2 h-2 bg-rose-400 rounded-full"></span>
            RMA ({units.filter(u => isUnitInSector(u, 'RMA')).length})
          </button>
          <button 
            onClick={() => setActiveTab('Outros')}
            id="stock-tab-outros"
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'Outros' 
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/15' 
                : isLight ? 'text-slate-600 hover:text-indigo-700 hover:bg-white' : 'text-slate-400 hover:text-indigo-400 hover:bg-slate-800'
            }`}
          >
            <span className="w-2 h-2 bg-indigo-400 rounded-full"></span>
            Outros ({units.filter(u => isUnitInSector(u, 'Outros')).length})
          </button>
          <div className={`h-6 w-[1px] self-center mx-1 ${isLight ? 'bg-slate-300' : 'bg-slate-800'}`}></div>
          <button 
            onClick={() => setActiveTab('Baixado')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'Baixado' 
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20' 
                : isLight ? 'text-slate-600 hover:text-purple-700 hover:bg-white' : 'text-slate-400 hover:text-purple-400 hover:bg-slate-800'
            }`}
            id="tab-btn-baixados"
          >
            <span className={`w-2 h-2 rounded-full ${activeTab === 'Baixado' ? 'bg-purple-200' : 'bg-purple-400'}`}></span>
            <span>Histórico de Baixas ({units.filter(u => u.status === 'Baixado').length})</span>
          </button>
        </div>

        {/* Search and Filters Controls Bar */}
        <div className={`p-5 border-b space-y-4 ${
          isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-900'
        }`} id="stock-search-bar">
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
                  className={`w-full pl-10 pr-9 py-2.5 rounded-xl text-sm transition-colors focus:outline-none ${
                    isLight
                      ? 'bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-sky-500 shadow-2xs font-medium'
                      : 'bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-500 focus:border-sky-500'
                  }`}
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
                      ? isLight ? 'bg-sky-100 border-sky-400 text-sky-800 shadow-sm' : 'bg-sky-500/10 border-sky-500/40 text-sky-400 shadow-sm'
                      : selectedUnitIds.length > 0
                      ? isLight ? 'bg-sky-50 border-sky-300 text-sky-700' : 'bg-sky-950/40 border-sky-800/50 text-sky-300'
                      : isLight ? 'bg-white border-slate-300 text-slate-700 hover:border-slate-400 hover:text-slate-950 shadow-2xs' : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
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
                    onClick={isReadOnly ? undefined : handleBatchCheckout}
                    disabled={isReadOnly}
                    className={`px-3.5 py-2 font-bold rounded-xl text-xs transition-all flex items-center gap-2 animate-in fade-in ${
                      isReadOnly 
                        ? 'bg-slate-800/60 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-60' 
                        : 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/20 cursor-pointer'
                    }`}
                    id="btn-batch-checkout"
                    title={isReadOnly ? "Ação bloqueada no Modo Visitante (Apenas Visualização)" : "Dar baixa do estoque para todas as unidades selecionadas"}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Baixa em Lote ({selectedUnitIds.length})</span>
                  </button>

                  <button
                    onClick={isReadOnly ? undefined : handleBatchDelete}
                    disabled={isReadOnly}
                    className={`px-3.5 py-2 font-bold rounded-xl text-xs transition-all flex items-center gap-2 animate-in fade-in ${
                      isReadOnly 
                        ? 'bg-slate-850/60 text-slate-500 border border-slate-800 cursor-not-allowed opacity-60' 
                        : 'bg-slate-800 hover:bg-rose-950 text-rose-300 hover:text-rose-200 border border-rose-800/40 hover:border-rose-600 cursor-pointer'
                    }`}
                    id="btn-batch-delete"
                    title={isReadOnly ? "Ação bloqueada no Modo Visitante (Apenas Visualização)" : "Excluir permanentemente do estoque todas as unidades selecionadas"}
                  >
                    <Trash2 className="w-4 h-4 text-rose-400" />
                    <span>Excluir ({selectedUnitIds.length})</span>
                  </button>
                </>
              )}

              {/* Filter Duplicates button - só aparece caso haja registros duplicados */}
              {duplicateUnitsCount > 0 && (
                <button 
                  type="button"
                  onClick={() => setFilterOnlyDuplicates(prev => !prev)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border animate-in fade-in duration-150 ${
                    filterOnlyDuplicates
                      ? 'bg-amber-500 text-slate-950 border-amber-400 font-black shadow-lg shadow-amber-500/20 scale-105'
                      : isLight
                      ? 'bg-amber-100 border-amber-300 text-amber-950 hover:bg-amber-200'
                      : 'bg-amber-500/10 border-amber-500/40 text-amber-400 hover:bg-amber-500/20'
                  }`}
                  title="Filtrar produtos com STI ou Serial repetidos"
                  id="btn-filter-duplicates"
                >
                  <AlertTriangle className={`w-3.5 h-3.5 ${filterOnlyDuplicates ? 'text-slate-950' : (isLight ? 'text-amber-800' : 'text-amber-400')}`} />
                  <span>{filterOnlyDuplicates ? 'Apenas Duplicados' : `Duplicados (${duplicateUnitsCount})`}</span>
                  {!filterOnlyDuplicates && (
                    <span className={`w-2 h-2 rounded-full ${isLight ? 'bg-amber-600' : 'bg-amber-400 animate-pulse'}`}></span>
                  )}
                </button>
              )}

              {/* Filter Pending SKU Registration button - só aparece caso haja produtos com SKU pendente */}
              {pendingSkuUnitsCount > 0 && (
                <button 
                  type="button"
                  onClick={() => setFilterOnlyPendingSku(prev => !prev)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border animate-in fade-in duration-150 ${
                    filterOnlyPendingSku
                      ? 'bg-amber-400 text-slate-950 border-amber-300 font-black shadow-lg shadow-amber-500/20 scale-105'
                      : isLight
                      ? 'bg-amber-100 border-amber-400 text-amber-950 hover:bg-amber-200'
                      : 'bg-amber-500/10 border-amber-500/40 text-amber-400 hover:bg-amber-500/20'
                  }`}
                  title="Filtrar produtos que deram entrada sem SKU previamente cadastrado na base"
                  id="btn-filter-pending-skus"
                >
                  <Tag className={`w-3.5 h-3.5 ${filterOnlyPendingSku ? 'text-slate-950' : (isLight ? 'text-amber-800' : 'text-amber-400')}`} />
                  <span>{filterOnlyPendingSku ? 'Apenas SKUs Pendentes' : `SKUs Pendentes (${pendingSkuUnitsCount})`}</span>
                  {!filterOnlyPendingSku && (
                    <span className={`w-2 h-2 rounded-full ${isLight ? 'bg-amber-600' : 'bg-amber-400 animate-pulse'}`}></span>
                  )}
                </button>
              )}

              {/* View switcher: Grid vs List/Linhas */}
              <div className={`view-switcher-container flex p-1 rounded-xl border gap-0.5 ${
                isLight ? 'bg-slate-100 border-slate-300' : 'bg-slate-950 border-slate-800'
              }`} id="stock-view-switcher">
                <button
                  onClick={() => handleSetViewMode('grid')}
                  className={`view-switcher-btn px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    viewMode === 'grid' 
                      ? 'view-switcher-active bg-sky-500 text-white shadow-sm' 
                      : isLight 
                      ? 'view-switcher-inactive text-slate-600 hover:text-slate-950 hover:bg-white font-semibold' 
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
                      : isLight 
                      ? 'view-switcher-inactive text-slate-600 hover:text-slate-950 hover:bg-white font-semibold' 
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
          <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-3 border-t ${
            isLight ? 'border-slate-200' : 'border-slate-800'
          }`} id="stock-filter-controls">
            {/* 1. Filter by Marca (Brand) */}
            <div className="space-y-1">
              <div className="h-5 flex items-center">
                <label className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                  isLight ? 'text-slate-700' : 'text-slate-400'
                }`}>
                  <Sliders className="w-3 h-3 text-purple-400" />
                  <span>Marca</span>
                </label>
              </div>
              <select
                value={selectedBrand}
                onChange={(e) => setSelectedBrand(e.target.value)}
                className={`w-full px-3 py-2 border rounded-xl text-xs font-semibold focus:outline-none focus:border-sky-500 transition-colors truncate cursor-pointer ${
                  isLight
                    ? selectedBrand !== 'Todas'
                      ? 'border-purple-400 bg-purple-50 text-purple-950 font-bold shadow-2xs'
                      : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400 shadow-2xs'
                    : selectedBrand !== 'Todas'
                      ? 'border-purple-500/50 bg-purple-950/20 text-purple-300'
                      : 'bg-slate-950 border-slate-800 text-slate-200'
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
                <label className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                  isLight ? 'text-slate-700' : 'text-slate-400'
                }`}>
                  <Layers className="w-3 h-3 text-emerald-400" />
                  <span>Categoria</span>
                </label>
              </div>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className={`w-full px-3 py-2 border rounded-xl text-xs font-semibold focus:outline-none focus:border-sky-500 transition-colors truncate cursor-pointer ${
                  isLight
                    ? selectedCategory !== 'Todas'
                      ? 'border-emerald-400 bg-emerald-50 text-emerald-950 font-bold shadow-2xs'
                      : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400 shadow-2xs'
                    : selectedCategory !== 'Todas'
                      ? 'border-emerald-500/50 bg-emerald-950/20 text-emerald-300'
                      : 'bg-slate-950 border-slate-800 text-slate-200'
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
                        className={opt.isGeneralHeader ? (isLight ? 'font-bold text-emerald-800 bg-emerald-50' : 'font-bold text-emerald-400 bg-slate-900') : 'pl-4'}
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
                <label className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                  isLight ? 'text-slate-700' : 'text-slate-400'
                }`}>
                  <ShoppingCart className={`w-3 h-3 ${selectedPlatform !== 'Todas' ? getPlatformFilterStyle(selectedPlatform).dotClasses.replace('bg-', 'text-') : 'text-sky-400'}`} />
                  <span>Plataforma</span>
                </label>
              </div>
              <select
                value={selectedPlatform}
                onChange={(e) => setSelectedPlatform(e.target.value)}
                className={`w-full px-3 py-2 border rounded-xl text-xs font-semibold focus:outline-none transition-colors truncate cursor-pointer ${
                  isLight
                    ? selectedPlatform !== 'Todas'
                      ? getPlatformFilterStyle(selectedPlatform).selectClasses
                      : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400 shadow-2xs'
                    : selectedPlatform !== 'Todas'
                      ? `bg-slate-950 ${getPlatformFilterStyle(selectedPlatform).selectClasses}`
                      : 'bg-slate-950 border-slate-800 text-slate-200'
                }`}
                id="select-filter-stock-platform"
              >
                <option value="Todas">Todas as Plataformas</option>
                <option value="Mercado Livre">Mercado Livre</option>
                <option value="Shopee">Shopee</option>
                <option value="Amazon">Amazon</option>
                <option value="Amazon Ta Novo">Amazon Ta Novo</option>
                <option value="Kabum">Kabum</option>
                <option value="Outros">Outros</option>
                <option value="Sem Plataforma">Sem Plataforma / Não Informada</option>
              </select>
            </div>

            {/* 3. Filter by Voltagem */}
            <div className="space-y-1">
              <div className="h-5 flex items-center">
                <label className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                  isLight ? 'text-slate-700' : 'text-slate-400'
                }`}>
                  <Zap className="w-3 h-3 text-amber-400" />
                  <span>Tensão / Voltagem</span>
                </label>
              </div>
              <select
                value={selectedVoltage}
                onChange={(e) => setSelectedVoltage(e.target.value)}
                className={`w-full px-3 py-2 border rounded-xl text-xs font-semibold focus:outline-none focus:border-sky-500 transition-colors truncate cursor-pointer ${
                  isLight
                    ? selectedVoltage !== 'Todas'
                      ? 'border-amber-400 bg-amber-50 text-amber-950 font-bold shadow-2xs'
                      : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400 shadow-2xs'
                    : selectedVoltage !== 'Todas'
                      ? 'border-amber-500/50 bg-amber-950/20 text-amber-300'
                      : 'bg-slate-950 border-slate-800 text-slate-200'
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
                <label className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                  isLight ? 'text-slate-700' : 'text-slate-400'
                }`}>
                  <Calendar className="w-3 h-3 text-sky-400" />
                  <span>Data de Registro</span>
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setSelectedDate(getTodayIsoDate())}
                    className={`text-[9px] px-1.5 py-0.5 rounded font-bold cursor-pointer transition-colors ${
                      selectedDate === getTodayIsoDate()
                        ? 'bg-sky-500 text-white shadow-xs'
                        : isLight
                        ? 'bg-white border border-slate-300 text-slate-700 hover:text-slate-950 hover:bg-slate-100 shadow-2xs'
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
                        ? 'bg-sky-500 text-white shadow-xs'
                        : isLight
                        ? 'bg-white border border-slate-300 text-slate-700 hover:text-slate-950 hover:bg-slate-100 shadow-2xs'
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
                      className={`text-[9px] px-1.5 py-0.5 rounded font-bold cursor-pointer transition-colors ${
                        isLight ? 'text-rose-700 hover:bg-rose-100' : 'text-rose-400 hover:bg-rose-500/20'
                      }`}
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
                  className={`w-full px-3 py-2 border rounded-xl text-xs font-semibold focus:outline-none focus:border-sky-500 transition-colors cursor-pointer ${
                    isLight
                      ? `[color-scheme:light] ${
                          selectedDate
                            ? 'border-sky-500 bg-sky-50 text-sky-950 font-bold shadow-2xs'
                            : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400 shadow-2xs'
                        }`
                      : `[color-scheme:dark] ${
                          selectedDate
                            ? 'border-sky-500/50 bg-sky-950/20 text-sky-300'
                            : 'bg-slate-950 border-slate-800 text-slate-200'
                        }`
                  }`}
                  id="input-filter-stock-date"
                />
              </div>
            </div>
          </div>

          {/* Active Filter Badges & Results Counter Bar */}
          <div className={`flex flex-wrap items-center justify-between gap-3 pt-3 border-t text-xs ${
            isLight ? 'border-slate-200 text-slate-700' : 'border-slate-800 text-slate-400'
          }`} id="stock-filter-summary">
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className={`w-3.5 h-3.5 shrink-0 ${isLight ? 'text-sky-600' : 'text-sky-400'}`} />
              <span>
                Exibindo <strong className={isLight ? 'text-sky-700 font-bold' : 'text-sky-400'}>{displayedUnits.length}</strong> de <strong className={isLight ? 'text-slate-950 font-bold' : 'text-white'}>{filteredUnits.length}</strong> {filteredUnits.length === 1 ? 'unidade' : 'unidades'}
                {activeTab !== 'Todos' && (
                  <span className={`ml-1 ${isLight ? 'text-slate-600' : 'text-slate-500'}`}>
                    no setor {activeTab}
                  </span>
                )}
              </span>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleClearAllFilters}
                  className={`ml-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                    isLight 
                      ? 'bg-sky-50 text-sky-700 border-sky-300 hover:bg-sky-100' 
                      : 'bg-slate-800 hover:bg-slate-750 text-sky-400 hover:text-sky-300 border-slate-700'
                  }`}
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
                  <span className={`px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                    isLight ? 'bg-purple-100 border-purple-300 text-purple-950 font-bold shadow-2xs' : 'bg-purple-500/10 border-purple-500/30 text-purple-300 font-medium'
                  }`}>
                    <span>Marca: {selectedBrand}</span>
                    <button 
                      type="button" 
                      onClick={() => setSelectedBrand('Todas')} 
                      className={`transition-colors cursor-pointer ${isLight ? 'text-purple-700 hover:text-rose-600' : 'hover:text-white'}`}
                      title="Remover filtro de Marca"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                )}
                {selectedCategory !== 'Todas' && (
                  <span className={`px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                    isLight ? 'bg-emerald-100 border-emerald-300 text-emerald-950 font-bold shadow-2xs' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 font-medium'
                  }`}>
                    <span>Cat: {selectedCategory}</span>
                    <button 
                      type="button" 
                      onClick={() => setSelectedCategory('Todas')} 
                      className={`transition-colors cursor-pointer ${isLight ? 'text-emerald-700 hover:text-rose-600' : 'hover:text-white'}`}
                      title="Remover filtro de Categoria"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                )}
                {activeTab !== 'Todos' && (() => {
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
                        onClick={() => setActiveTab('Todos')} 
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
                  <span className={`px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                    isLight ? 'bg-amber-100 border-amber-300 text-amber-950 font-bold shadow-2xs' : 'bg-amber-500/10 border-amber-500/30 text-amber-300 font-medium'
                  }`}>
                    <span>Voltagem: {selectedVoltage}</span>
                    <button 
                      type="button" 
                      onClick={() => setSelectedVoltage('Todas')} 
                      className={`transition-colors cursor-pointer ${isLight ? 'text-amber-700 hover:text-rose-600' : 'hover:text-white'}`}
                      title="Remover filtro de Voltagem"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                )}
                {selectedDate && (
                  <span className={`px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                    isLight ? 'bg-sky-100 border-sky-300 text-sky-950 font-bold shadow-2xs' : 'bg-sky-500/10 border-sky-500/30 text-sky-300 font-medium'
                  }`}>
                    <Calendar className={`w-3 h-3 ${isLight ? 'text-sky-700' : 'text-sky-400'}`} />
                    <span>Data: {new Date(`${selectedDate}T12:00:00`).toLocaleDateString('pt-BR')}</span>
                    <button 
                      type="button" 
                      onClick={() => setSelectedDate('')} 
                      className={`transition-colors cursor-pointer ${isLight ? 'text-sky-700 hover:text-rose-600' : 'hover:text-white'}`}
                      title="Remover filtro de Data"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                )}
                {searchTerm && (
                  <span className={`px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                    isLight ? 'bg-slate-100 border-slate-300 text-slate-800 font-bold shadow-2xs' : 'bg-slate-800 border-slate-700 text-slate-300'
                  }`}>
                    <span>Busca: "{searchTerm}"</span>
                    <button 
                      type="button" 
                      onClick={() => setSearchTerm('')} 
                      className={`transition-colors cursor-pointer ${isLight ? 'text-slate-600 hover:text-rose-600' : 'hover:text-white'}`}
                      title="Limpar texto de busca"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                )}
                {filterOnlyDuplicates && (
                  <span className={`px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                    isLight ? 'bg-amber-100 border-amber-300 text-amber-950 font-bold shadow-2xs' : 'bg-amber-500/10 border-amber-500/30 text-amber-300 font-medium'
                  }`}>
                    <AlertTriangle className={`w-3 h-3 ${isLight ? 'text-amber-800' : 'text-amber-400'}`} />
                    <span>Apenas Duplicados</span>
                    <button 
                      type="button" 
                      onClick={() => setFilterOnlyDuplicates(false)} 
                      className={`transition-colors cursor-pointer ${isLight ? 'text-amber-700 hover:text-rose-600' : 'hover:text-white'}`}
                      title="Remover filtro de Duplicados"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                )}
                {filterOnlyPendingSku && (
                  <span className={`px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                    isLight ? 'bg-amber-100 border-amber-400 text-amber-950 font-bold shadow-2xs' : 'bg-amber-500/10 border-amber-500/30 text-amber-300 font-medium'
                  }`}>
                    <Tag className={`w-3 h-3 ${isLight ? 'text-amber-800' : 'text-amber-400'}`} />
                    <span>Apenas SKUs Pendentes</span>
                    <button 
                      type="button" 
                      onClick={() => setFilterOnlyPendingSku(false)} 
                      className={`transition-colors cursor-pointer ${isLight ? 'text-amber-700 hover:text-rose-600' : 'hover:text-white'}`}
                      title="Remover filtro de SKUs Pendentes"
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
              const isHighlighted = highlightedUnitId === unit.id;

              return (
                <div 
                  key={unit.id}
                  className={`group bg-slate-900 border rounded-xl p-4 flex flex-col justify-between transition-all duration-300 ${
                    isHighlighted
                      ? 'ring-2 ring-sky-400 border-sky-400/80 shadow-lg shadow-sky-500/20 bg-slate-900/90'
                      : unit.status === 'Baixado'
                      ? 'border-purple-500/30 hover:border-purple-400/50'
                      : (hasDupSti || hasDupSerial ? 'border-amber-500/50 shadow-md shadow-amber-500/5 hover:border-amber-500' : 'border-slate-800 hover:border-slate-700/80 hover:shadow-xl')
                  }`}
                  style={{ contentVisibility: 'auto', containIntrinsicSize: '360px' }}
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
                        {isHighlighted && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-sky-300 bg-sky-500/15 border border-sky-400/40 animate-pulse">
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
                            Pedido Selecionado
                          </span>
                        )}
                        {isUnitPendingSkuRegistration(unit, products) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setQuickRegisterUnit(unit);
                            }}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold transition-colors cursor-pointer border ${
                              isLight 
                                ? 'text-amber-950 bg-amber-100 border-amber-400 hover:bg-amber-200' 
                                : 'text-amber-300 bg-amber-500/20 border-amber-500/40 hover:bg-amber-500/30 font-bold'
                            }`}
                            title="Este pedido deu entrada sem SKU na base. Clique para cadastrar no catálogo agora."
                          >
                            <AlertTriangle className={`w-2.5 h-2.5 ${isLight ? 'text-amber-800' : 'text-amber-400'}`} />
                            <span>SKU Pendente</span>
                          </button>
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
                      {(() => {
                        const isSti = unit.destinationSector === 'Openbox';
                        const code = isSti 
                          ? (unit.trackingCode ? normalizeStiCode(unit.trackingCode) : '') 
                          : (unit.pendingRegistrationNumber || (unit.trackingCode ? unit.trackingCode.replace(/^#?STI\s*/i, '').trim() : ''));
                        if (!code) return null;
                        const display = isSti ? formatStiBadge(unit.trackingCode) : code;
                        const copyTitle = isSti ? "Clique para copiar o Código STI" : "Clique para copiar o Nº de Registro";
                        const copyKey = isSti ? `sti-${unit.id}` : `reg-${unit.id}`;

                        return (
                          <button
                            type="button"
                            onClick={(e) => handleCopyCode(code, copyKey, e)}
                            className={`font-mono text-xs font-bold px-2 py-0.5 rounded shrink-0 transition-all cursor-pointer flex items-center gap-1 group/copy ${
                              copiedCodeKey === copyKey
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 scale-105'
                                : (isSti && hasDupSti)
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                                  : 'text-slate-300 hover:text-white bg-slate-950/80 hover:bg-slate-800 border border-slate-800'
                            }`}
                            title={copyTitle}
                          >
                            {copiedCodeKey === copyKey ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span>Copiado!</span>
                              </>
                            ) : (
                              <>
                                <span>{display}</span>
                                <Copy className="w-2.5 h-2.5 opacity-0 group-hover/copy:opacity-100 transition-opacity" />
                              </>
                            )}
                          </button>
                        );
                      })()}
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
                        <img 
                          src={getOptimizedThumbnailUrl(mainPhoto, 400, 400)} 
                          alt={getResolvedUnitProductName(unit, products)} 
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-contain group-hover/thumb:scale-105 transition-transform duration-300" 
                          referrerPolicy="no-referrer" 
                        />
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
                        {getResolvedUnitProductName(unit, products)}
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
                      {isRealStockTransfer(unit.originSector) && (
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
                        <span 
                          data-platform={unit.platform}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors ${pStyle}`}
                        >
                          {unit.platform}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500 italic">Sem Plataforma</span>
                      )}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {isRealStockTransfer(unit.originSector) && (
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
                        {isReadOnly ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedUnitId(unit.id);
                            }}
                            className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md text-[10px] font-bold transition-colors flex items-center gap-1 cursor-pointer"
                            title="Visualizar laudo e fotos do produto"
                          >
                            <Eye className="w-3 h-3 text-sky-400" />
                            <span>Ver</span>
                          </button>
                        ) : (
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
                        )}
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
              const isHighlighted = highlightedUnitId === unit.id;

              return (
                <div 
                  key={unit.id}
                  className={`group bg-slate-900 border rounded-xl p-3 sm:p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 transition-all duration-300 ${
                    isHighlighted
                      ? 'ring-2 ring-sky-400 border-sky-400/80 shadow-md shadow-sky-500/15 bg-slate-900/90'
                      : (hasDupSti || hasDupSerial ? 'border-amber-500/50 hover:border-amber-500' : 'border-slate-800/80 hover:border-slate-700/80 hover:shadow-lg')
                  }`}
                  style={{ contentVisibility: 'auto', containIntrinsicSize: '80px' }}
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
                        <img 
                          src={getOptimizedThumbnailUrl(mainPhoto, 96, 96)} 
                          alt={getResolvedUnitProductName(unit, products)} 
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-contain group-hover/listthumb:scale-110 transition-transform" 
                        />
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
                        {isUnitPendingSkuRegistration(unit, products) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setQuickRegisterUnit(unit);
                            }}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold transition-colors cursor-pointer shrink-0 border ${
                              isLight 
                                ? 'text-amber-950 bg-amber-100 border-amber-400 hover:bg-amber-200' 
                                : 'text-amber-300 bg-amber-500/20 border-amber-500/40 hover:bg-amber-500/30 font-bold'
                            }`}
                            title="SKU não cadastrado na base. Clique para cadastrar este produto no catálogo agora."
                          >
                            <AlertTriangle className={`w-2.5 h-2.5 ${isLight ? 'text-amber-800' : 'text-amber-400'}`} />
                            <span>Cadastrar SKU</span>
                          </button>
                        )}
                        {(() => {
                          const isSti = unit.destinationSector === 'Openbox';
                          const code = isSti 
                            ? (unit.trackingCode ? normalizeStiCode(unit.trackingCode) : '') 
                            : (unit.pendingRegistrationNumber || (unit.trackingCode ? unit.trackingCode.replace(/^#?STI\s*/i, '').trim() : ''));
                          if (!code) return null;
                          const display = isSti ? formatStiBadge(unit.trackingCode) : code;
                          const copyTitle = isSti ? "Clique para copiar o Código STI" : "Clique para copiar o Nº de Registro";
                          const copyKey = isSti ? `sti-list-${unit.id}` : `reg-list-${unit.id}`;

                          return (
                            <button
                              type="button"
                              onClick={(e) => handleCopyCode(code, copyKey, e)}
                              className={`font-mono text-xs font-bold px-2 py-0.5 rounded shrink-0 transition-all cursor-pointer flex items-center gap-1 group/copy ${
                                copiedCodeKey === copyKey
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 scale-105'
                                  : (isSti && hasDupSti)
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                                    : 'text-slate-300 hover:text-white bg-slate-950/80 hover:bg-slate-800 border border-slate-800'
                              }`}
                              title={copyTitle}
                            >
                              {copiedCodeKey === copyKey ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  <span>Copiado!</span>
                                </>
                              ) : (
                                <>
                                  <span>{display}</span>
                                  <Copy className="w-2.5 h-2.5 opacity-0 group-hover/copy:opacity-100 transition-opacity" />
                                </>
                              )}
                            </button>
                          );
                        })()}
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
                          <span 
                            data-platform={unit.platform}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${pStyle}`}
                          >
                            {unit.platform}
                          </span>
                        ) : null}
                        {isRealStockTransfer(unit.originSector) && (
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
                        {getResolvedUnitProductName(unit, products)}
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
                      {isRealStockTransfer(unit.originSector) && (
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
                      {isHighlighted && (
                        <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-sky-300 bg-sky-500/15 border border-sky-400/40 animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
                          Pedido Selecionado
                        </span>
                      )}
                      {!isReadOnly && (
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
                      )}

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

      {/* Complete unit details / Edit Modal */}
      {currentUnit && isEditingUnit && (
        <StockUnitEditModal
          isOpen={isEditingUnit}
          onClose={() => setIsEditingUnit(false)}
          unit={currentUnit}
          products={products}
          pendingItems={pendingItems}
          units={units}
          isLight={isLight}
          onSave={async (updatedUnit) => {
            await onUpdateUnit(updatedUnit);
            setIsEditingUnit(false);
            setActionSuccess('Ficha do produto e fotos atualizados com sucesso!');
            setTimeout(() => setActionSuccess(null), 4000);
          }}
          onCompareWithBase={() => setIsCompareModalOpen(true)}
          onOpenImageZoom={(url, title, list, idx) => {
            setFullscreenImage(url);
            setFullscreenImageTitle(title);
            setFullscreenImageList(list);
            setFullscreenImageIndex(idx);
          }}
        />
      )}

      {currentUnit && !isEditingUnit && (
        <StockUnitDetailsModal
          isOpen={!isEditingUnit}
          onClose={handleCloseDetails}
          unit={currentUnit}
          products={products}
          units={units}
          isLight={isLight}
          isReadOnly={isReadOnly}
          enableSpreadsheetExport={enableSpreadsheetExport}
          onStartEdit={(unit) => handleStartEdit(unit)}
          onGoToStock={(unit) => handleGoToStock(unit)}
          onQuickRegisterSku={(unit) => setQuickRegisterUnit(unit)}
          onCompareWithBase={() => setIsCompareModalOpen(true)}
          onMoveSector={(unit, targetSector) => handleMoveSector(unit, targetSector)}
          onExportExcel={(exportUnits) => handleExportExcel(exportUnits)}
          onDelete={(id) => handleDelete(id)}
          onCheckout={(id) => handleCheckout(id)}
          onRevertCheckout={(id) => handleRevertCheckout(id)}
          onOpenImageZoom={(url, title, list, idx) => {
            setFullscreenImage(url);
            setFullscreenImageTitle(title);
            setFullscreenImageList(list);
            setFullscreenImageIndex(idx);
          }}
        />
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
      {transferModalData && createPortal(
        <div 
          className="fixed inset-0 z-[120] bg-black/85 flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) setTransferModalData(null);
          }}
        >
          <div 
            className={`w-full max-w-lg rounded-2xl shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-150 border ${
              isLight ? 'bg-white border-slate-200 text-slate-900 shadow-xl' : 'bg-slate-900 border-slate-800 text-white'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl shrink-0 border ${
                  isLight ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                }`}>
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <h3 className={`text-base font-bold ${isLight ? 'text-slate-950' : 'text-white'}`}>Transferência para Estoque Principal</h3>
                  <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                    {getResolvedUnitProductName(transferModalData.unit, products)} ({transferModalData.unit.sti || transferModalData.unit.trackingCode})
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setTransferModalData(null)}
                className={`p-1 rounded-lg transition-colors cursor-pointer ${
                  isLight ? 'text-slate-500 hover:text-slate-950 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className={`p-3.5 rounded-xl text-xs leading-relaxed border ${
              isLight ? 'bg-amber-50 border-amber-300 text-amber-950 font-medium' : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
            }`}>
              Este produto veio de outro armazém (<strong>{transferModalData.unit.destinationSector}</strong>) e já possui <strong>{transferModalData.savedPhotosCount} foto(s) cadastrada(s)</strong>.
              <br />
              Escolha a opção de imagem para o <strong>Estoque Principal</strong>:
            </div>

            {/* 3 Interactive Photo Strategy Cards */}
            <div className="space-y-2.5">
              {/* Option 1: Keep Saved Photos */}
              <div 
                onClick={() => handleConfirmTransferWithPhotoChoice('keep_saved')}
                className={`p-3.5 rounded-xl transition-all cursor-pointer flex items-center justify-between gap-3 group border ${
                  isLight 
                    ? 'bg-white hover:bg-emerald-50 border-slate-300 hover:border-emerald-500 shadow-2xs' 
                    : 'bg-slate-950 hover:bg-emerald-950/30 border-slate-800 hover:border-emerald-500/50'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Camera className="w-4 h-4 text-emerald-500" />
                    <span className={`text-xs font-bold ${
                      isLight ? 'text-slate-900 group-hover:text-emerald-800 font-extrabold' : 'text-white group-hover:text-emerald-300'
                    }`}>
                      1. Manter Fotos Já Cadastradas
                    </span>
                  </div>
                  <p className={`text-[11px] ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                    Preserva exatamente as fotos reais salvas na triagem deste item.
                  </p>
                </div>
                {transferModalData.unit.photosProduct?.[0] && (
                  <img 
                    src={transferModalData.unit.photosProduct[0]} 
                    alt="Salva" 
                    className={`w-12 h-12 rounded-lg object-cover shrink-0 group-hover:scale-105 transition-transform border ${
                      isLight ? 'border-slate-300 bg-slate-50' : 'border-slate-700'
                    }`} 
                  />
                )}
              </div>

              {/* Option 2: Use Base Product Image */}
              {(() => {
                const baseImgs = getBaseProductImages(transferModalData.baseProduct);
                return (
                  <div 
                    onClick={() => handleConfirmTransferWithPhotoChoice('use_base')}
                    className={`p-3.5 rounded-xl transition-all cursor-pointer flex items-center justify-between gap-3 group border ${
                      isLight 
                        ? 'bg-white hover:bg-sky-50 border-slate-300 hover:border-sky-500 shadow-2xs' 
                        : 'bg-slate-950 hover:bg-sky-950/30 border-slate-800 hover:border-sky-500/50'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <ImageIcon className="w-4 h-4 text-sky-500" />
                        <span className={`text-xs font-bold ${
                          isLight ? 'text-slate-900 group-hover:text-sky-800 font-extrabold' : 'text-white group-hover:text-sky-300'
                        }`}>
                          2. Usar Imagem do Catálogo Base
                        </span>
                      </div>
                      <p className={`text-[11px] ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                        Aplica a foto oficial cadastrada no Catálogo Base (sem duplicação de dados).
                      </p>
                    </div>
                    {baseImgs.main && (
                      <img 
                        src={baseImgs.main} 
                        alt="Base" 
                        className={`w-12 h-12 rounded-lg object-cover shrink-0 group-hover:scale-105 transition-transform border ${
                          isLight ? 'border-slate-300 bg-slate-50' : 'border-slate-700'
                        }`} 
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
                    className={`p-3.5 rounded-xl transition-all cursor-pointer flex items-center justify-between gap-3 group border ${
                      isLight 
                        ? 'bg-white hover:bg-amber-50 border-slate-300 hover:border-amber-500 shadow-2xs' 
                        : 'bg-slate-950 hover:bg-amber-950/30 border-slate-800 hover:border-amber-500/50'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-amber-500" />
                        <span className={`text-xs font-bold ${
                          isLight ? 'text-slate-900 group-hover:text-amber-800 font-extrabold' : 'text-white group-hover:text-amber-300'
                        }`}>
                          3. Usar Ambas (Combinar Imagens)
                        </span>
                      </div>
                      <p className={`text-[11px] ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
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
        </div>,
        document.body
      )}

      {/* Modal: Move Sector to Openbox (Mandatory STI Code Requirement) */}
      {openboxMoveModalData && createPortal(
        <div 
          className="fixed inset-0 z-[120] bg-black/85 flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCancelOpenboxMove();
          }}
        >
          <div 
            className="w-full max-w-lg bg-slate-900 border border-amber-500/40 rounded-2xl shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-150 text-slate-100"
            onClick={(e) => e.stopPropagation()}
            id="modal-move-to-openbox"
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-500 dark:text-amber-400 border border-amber-500/30 shrink-0">
                  <Box className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Mover Produto para o Openbox</h3>
                  <p className="text-xs text-amber-700 dark:text-amber-400 font-semibold mt-0.5">
                    Produtos no Openbox obrigatoriamente precisam de Código STI
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={handleCancelOpenboxMove}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mandatory Requirement Callout */}
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-900 dark:text-amber-300 leading-relaxed flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-amber-950 dark:text-amber-200">Exigência Obrigatória do Setor Openbox:</strong>
                <p className="mt-0.5 text-amber-800 dark:text-amber-300/90 text-[11.5px]">
                  Para transferir este item para o armazém do Openbox, é obrigatório informar o código válido com <strong>4 números</strong> (ex: 1234).
                </p>
              </div>
            </div>

            {/* Unit Info Card */}
            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 dark:text-slate-400 text-[11px] font-medium">Produto:</span>
                <span className="font-bold text-slate-900 dark:text-white text-right truncate">
                  {getResolvedUnitProductName(openboxMoveModalData.unit, products)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 dark:text-slate-400 text-[11px] font-medium">SKU:</span>
                <span className="font-mono font-bold text-sky-600 dark:text-sky-400">
                  {openboxMoveModalData.unit.baseProductSku}
                </span>
              </div>
              {openboxMoveModalData.unit.serialNumber && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400 text-[11px] font-medium">Número de Série:</span>
                  <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                    {openboxMoveModalData.unit.serialNumber}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-200 dark:border-slate-800/80">
                <span className="text-slate-500 dark:text-slate-400 text-[11px] font-medium">Mudança de Setor:</span>
                <div className="flex items-center gap-2 font-bold">
                  <span className={`px-2 py-0.5 rounded text-[10px] ${getSectorBadgeClass(openboxMoveModalData.unit.destinationSector)}`}>
                    {openboxMoveModalData.unit.destinationSector}
                  </span>
                  <ArrowRightLeft className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/40">
                    Setor Openbox (Outlet)
                  </span>
                </div>
              </div>
            </div>

            {/* STI Code Input Field */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Código STI do Produto</span>
                  <span className="text-rose-600 dark:text-rose-400 font-bold">* (Obrigatório)</span>
                </label>
              </div>

              <StiCodeInput
                id="input-openbox-sti-code"
                autoFocus
                value={openboxMoveModalData.stiCode}
                onChange={(formatted) => {
                  setOpenboxMoveModalData(prev => prev ? {
                    ...prev,
                    stiCode: formatted,
                    error: null
                  } : null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleConfirmOpenboxMove();
                  }
                }}
                placeholder="1234"
                variant="amber"
                required
              />
            </div>

            {/* Error Message if any */}
            {openboxMoveModalData.error && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-700 dark:text-rose-400 flex items-center gap-2 animate-in fade-in duration-150">
                <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <span className="font-semibold">{openboxMoveModalData.error}</span>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button 
                type="button"
                onClick={handleCancelOpenboxMove}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button 
                type="button"
                onClick={handleConfirmOpenboxMove}
                disabled={!isValidStiCode(openboxMoveModalData.stiCode)}
                className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-black shadow-lg shadow-amber-600/20 flex items-center gap-2 transition-all cursor-pointer"
                id="btn-confirm-move-openbox"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Confirmar e Mover para Openbox</span>
              </button>
            </div>

          </div>
        </div>,
        document.body
      )}

      {/* Custom Confirmation Modal */}
      {confirmConfig && createPortal(
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
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  confirmConfig.type === 'danger' ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/15' :
                  confirmConfig.type === 'success' ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/15' :
                  'bg-sky-600 hover:bg-sky-500 text-white shadow-lg shadow-sky-600/15'
                }`}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Excel Inventory Import Modal */}
      {isExcelModalOpen && createPortal(
        <ExcelImportModal 
          isOpen={isExcelModalOpen}
          onClose={() => setIsExcelModalOpen(false)}
          products={products}
          existingUnits={units}
          onImportUnits={handleImportBatchUnits}
          defaultSector={activeTab === 'Openbox' ? 'Openbox' : activeTab === 'RMA' ? 'RMA' : activeTab === 'Principal' ? 'Principal' : 'Openbox'}
        />,
        document.body
      )}

      {/* Product Comparison Modal for units not in Estoque Principal */}
      {isCompareModalOpen && currentUnit && (
        <ProductCompareModal
          isOpen={isCompareModalOpen}
          onClose={() => setIsCompareModalOpen(false)}
          selectedProduct={{
            id: currentUnit.id,
            name: currentUnit.baseProductName,
            sku: currentUnit.baseProductSku,
            serialNumber: currentUnit.serialNumber,
            voltage: currentUnit.baseProductVoltage,
            destinationSector: currentUnit.destinationSector,
            originSector: currentUnit.originSector,
            platform: currentUnit.platform,
            orderNumber: currentUnit.orderNumber,
            trackingCode: resolvedCurrentUnitSti || currentUnit.trackingCode,
            registrationNumber: currentUnit.pendingRegistrationNumber,
            deviceStatus: currentUnit.deviceStatus,
            packageStatus: currentUnit.packageStatus,
            customerReason: currentUnit.customerReason,
            accessoriesInclusion: currentUnit.accessoriesInclusion,
            notes: currentUnit.notes,
            photosProduct: currentUnit.photosProduct,
            photosBox: currentUnit.photosBox,
            photosAccessories: currentUnit.photosAccessories,
          }}
          baseProduct={findBaseProduct(currentUnit, products)}
          allBaseProducts={products}
          isLight={isLight}
        />
      )}

      {/* Quick Register SKU Modal */}
      {quickRegisterUnit && (
        <QuickRegisterSkuModal
          isOpen={Boolean(quickRegisterUnit)}
          onClose={() => setQuickRegisterUnit(null)}
          unit={quickRegisterUnit}
          units={units}
          products={products}
          onUpdateUnit={onUpdateUnit}
          onProductCreated={onProductCreated}
          isLight={isLight}
        />
      )}
    </div>
  );
}
