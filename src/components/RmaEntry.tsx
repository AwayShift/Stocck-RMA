/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Clipboard, 
  Upload, 
  Trash2, 
  FolderMinus, 
  Layers, 
  Package, 
  CheckCircle, 
  AlertCircle, 
  Eye, 
  Plus,
  Zap,
  Search,
  Check,
  ChevronDown,
  X,
  Link as LinkIcon,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';
import { BaseProduct, TriageUnit, PlatformType, DeviceStatusType, PackageStatusType, DestinationSectorType } from '../types';
import { uploadFileToStorage, uploadImageUrlToStorage } from '../lib/dbService';
import { RichTextEditor } from './RichTextEditor';
import { getBaseProductImages } from '../utils/productImages';
import { processSafeImageUrl } from '../lib/imageSecurityService';

interface RmaEntryProps {
  products: BaseProduct[];
  units?: TriageUnit[];
  onSaveTriage: (unit: TriageUnit) => Promise<void>;
  onNavigateToStock: () => void;
}

export default function RmaEntry({ products, units = [], onSaveTriage, onNavigateToStock }: RmaEntryProps) {
  // Select Base Product state & search query
  const [selectedProductId, setSelectedProductId] = useState('');
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  const productDropdownRef = useRef<HTMLDivElement>(null);

  // Frequency map of triage entries per product
  const productInflowCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (units && units.length > 0) {
      units.forEach(u => {
        if (u.baseProductId) {
          counts[u.baseProductId] = (counts[u.baseProductId] || 0) + 1;
        }
        if (u.baseProductSku) {
          const keySku = `sku:${u.baseProductSku.toLowerCase().trim()}`;
          counts[keySku] = (counts[keySku] || 0) + 1;
        }
      });
    }
    return counts;
  }, [units]);

  const getProductEntryCount = (p: BaseProduct) => {
    const byId = productInflowCounts[p.id] || 0;
    const bySku = productInflowCounts[`sku:${p.sku.toLowerCase().trim()}`] || 0;
    return Math.max(byId, bySku);
  };

  // Top 10 products with most entries in stock
  const top10Products = useMemo(() => {
    return [...products]
      .map(p => ({ product: p, count: getProductEntryCount(p) }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.product.name.localeCompare(b.product.name);
      })
      .slice(0, 10);
  }, [products, productInflowCounts]);
  
  // Fields of Entrance
  const [trackingCode, setTrackingCode] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [serials, setSerials] = useState<string[]>(['']);
  const [platform, setPlatform] = useState<PlatformType>('Mercado Livre');
  const [customerReason, setCustomerReason] = useState('');
  const [excludeFromDailyCount, setExcludeFromDailyCount] = useState(false);

  // Helpers to manage multiple serial lines for the same SKU
  const handleAddSerialLine = () => {
    setSerials(prev => [...prev, '']);
  };

  const handleUpdateSerial = (index: number, value: string) => {
    // If multiple lines pasted (e.g. from spreadsheet or barcode list)
    if (value.includes('\n') || value.includes('\r')) {
      const lines = value.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
      if (lines.length > 1) {
        setSerials(prev => {
          const next = [...prev];
          next[index] = lines[0];
          next.splice(index + 1, 0, ...lines.slice(1));
          return next;
        });
        return;
      }
    }

    setSerials(prev => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleRemoveSerialLine = (index: number) => {
    if (serials.length <= 1) {
      setSerials(['']);
    } else {
      setSerials(prev => prev.filter((_, i) => i !== index));
    }
  };

  // Fields of Analysis
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatusType>('Usado');
  const [isCustomDeviceStatus, setIsCustomDeviceStatus] = useState(false);
  const [customDeviceStatusText, setCustomDeviceStatusText] = useState('');

  const [packageStatus, setPackageStatus] = useState<PackageStatusType>('Danificada');
  const [isCustomPackageStatus, setIsCustomPackageStatus] = useState(false);
  const [customPackageStatusText, setCustomPackageStatusText] = useState('');

  const [accessoriesInclusion, setAccessoriesInclusion] = useState('');

  // Sector Destination
  const [destinationSector, setDestinationSector] = useState<DestinationSectorType>('Openbox');

  // Helper to change destination sector and automatically standardize conditions
  const handleSelectDestinationSector = (sector: DestinationSectorType) => {
    setDestinationSector(sector);
    setIsCustomDeviceStatus(false);
    setCustomDeviceStatusText('');
    setIsCustomPackageStatus(false);
    setCustomPackageStatusText('');

    if (sector === 'Principal') {
      setDeviceStatus('Novo');
      setPackageStatus('Perfeita');
      setAccessoriesInclusion('Todos os acessórios inclusos.');
    } else if (sector === 'Openbox') {
      setDeviceStatus('Usado');
      setPackageStatus('Danificada');
      setAccessoriesInclusion('');
    } else if (sector === 'RMA') {
      setDeviceStatus('Danificado');
      setPackageStatus('Danificada');
      setAccessoriesInclusion('');
    }
  };

  // Photo categories state
  const [photosProduct, setPhotosProduct] = useState<string[]>([]);
  const [photosBox, setPhotosBox] = useState<string[]>([]);
  const [photosAccessories, setPhotosAccessories] = useState<string[]>([]);

  // Active upload zone for Ctrl+V
  const [activeUploadCategory, setActiveUploadCategory] = useState<'product' | 'box' | 'accessories'>('product');

  // URL Photo state
  const [urlPhotoInput, setUrlPhotoInput] = useState('');
  const [isSanitizingUrl, setIsSanitizingUrl] = useState(false);
  const [urlPhotoError, setUrlPhotoError] = useState<string | null>(null);

  // Rich-text observations HTML state
  const [notes, setNotes] = useState('');

  // Status messages
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Handle URL photo addition with sanitization and Cloudinary upload
  const handleAddPhotoByUrl = async (category: 'product' | 'box' | 'accessories') => {
    if (!urlPhotoInput.trim()) return;
    const url = urlPhotoInput.trim();
    setIsSanitizingUrl(true);
    setUrlPhotoError(null);
    setErrorMessage('');

    try {
      const uploadedUrl = await uploadImageUrlToStorage(url, `triage_${category}`);
      if (category === 'product') {
        setPhotosProduct(prev => [...prev, uploadedUrl]);
      } else if (category === 'box') {
        setPhotosBox(prev => [...prev, uploadedUrl]);
      } else {
        setPhotosAccessories(prev => [...prev, uploadedUrl]);
      }
      setUrlPhotoInput('');
      const catLabel = category === 'product' ? 'Produto' : category === 'box' ? 'Embalagem' : 'Acessórios';
      setSuccessMessage(`Foto via link enviada e hospedada no Cloudinary para ${catLabel}!`);
      setTimeout(() => setSuccessMessage(''), 2500);
    } catch (err: any) {
      setUrlPhotoError(err?.message || 'Erro ao validar e enviar imagem por link ao Cloudinary.');
    } finally {
      setIsSanitizingUrl(false);
    }
  };

  // Image upload handler
  const handlePhotoUpload = async (files: FileList | null, category: 'product' | 'box' | 'accessories') => {
    if (!files) return;
    setIsSubmitting(true);
    setErrorMessage('');
    const promises = Array.from(files).map(file => uploadFileToStorage(file, `triage_${category}`));
    try {
      const urls = await Promise.all(promises);
      if (category === 'product') {
        setPhotosProduct(prev => [...prev, ...urls]);
      } else if (category === 'box') {
        setPhotosBox(prev => [...prev, ...urls]);
      } else {
        setPhotosAccessories(prev => [...prev, ...urls]);
      }
      setSuccessMessage('Fotos enviadas com sucesso!');
      setTimeout(() => setSuccessMessage(''), 2000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Erro ao realizar upload das fotos.');
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Remove Photo handler
  const handleRemovePhoto = (index: number, category: 'product' | 'box' | 'accessories') => {
    if (category === 'product') {
      setPhotosProduct(prev => prev.filter((_, i) => i !== index));
    } else if (category === 'box') {
      setPhotosBox(prev => prev.filter((_, i) => i !== index));
    } else {
      setPhotosAccessories(prev => prev.filter((_, i) => i !== index));
    }
  };

  // Drag over handler
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // Drag drop handler
  const handleDrop = (e: React.DragEvent, category: 'product' | 'box' | 'accessories') => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      handlePhotoUpload(e.dataTransfer.files, category);
    }
  };

  // Local paste handler on focusable elements
  const activeCategoryRef = useRef(activeUploadCategory);
  useEffect(() => {
    activeCategoryRef.current = activeUploadCategory;
  }, [activeUploadCategory]);

  const handleLocalPaste = async (e: React.ClipboardEvent | ClipboardEvent, category: 'product' | 'box' | 'accessories') => {
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

    // 2. Check clipboardData.items (screenshot / copied web images)
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
      setIsSubmitting(true);
      const promises = imageFiles.map(file => uploadFileToStorage(file, `triage_${category}`));
      try {
        const urls = await Promise.all(promises);
        if (category === 'product') {
          setPhotosProduct(prev => [...prev, ...urls]);
        } else if (category === 'box') {
          setPhotosBox(prev => [...prev, ...urls]);
        } else {
          setPhotosAccessories(prev => [...prev, ...urls]);
        }
        setSuccessMessage(`Foto colada via Ctrl+V e enviada com sucesso para: ${
          category === 'product' ? 'Fotos do Produto' : 
          category === 'box' ? 'Fotos da Caixa' : 'Fotos dos Acessórios'
        }!`);
        setTimeout(() => setSuccessMessage(''), 2500);
      } catch (err) {
        setErrorMessage('Erro ao realizar upload da imagem colada.');
        console.error(err);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  // Global Ctrl+V Paste handler as fallback
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      // Don't intercept paste if focused inside rich text editor
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.getAttribute('contenteditable') === 'true' || activeEl.closest('[contenteditable="true"]'))) {
        return;
      }
      await handleLocalPaste(e, activeCategoryRef.current);
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (productDropdownRef.current && !productDropdownRef.current.contains(e.target as Node)) {
        setIsProductDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filtered products list by SKU or Name - prioritized by frequency of entries (Top entradas primeiro)
  const filteredProducts = useMemo(() => {
    let list = [...products];
    if (productSearchTerm.trim()) {
      const term = productSearchTerm.toLowerCase();
      list = list.filter(
        p => p.sku?.toLowerCase().includes(term) || p.name?.toLowerCase().includes(term)
      );
    }
    // Sort so products with more triage entries appear first
    return list.sort((a, b) => {
      const countA = getProductEntryCount(a);
      const countB = getProductEntryCount(b);
      if (countB !== countA) return countB - countA;
      return a.name.localeCompare(b.name);
    });
  }, [products, productSearchTerm, productInflowCounts]);

  // Selected product object
  const selectedProduct = useMemo(() => {
    return products.find(p => p.id === selectedProductId) || null;
  }, [products, selectedProductId]);

  // Sync search input with selected product or allow free typing
  const handleSelectProduct = (p: BaseProduct) => {
    setSelectedProductId(p.id);
    setProductSearchTerm(`[${p.sku}] ${p.name}`);
    setIsProductDropdownOpen(false);
  };

  const handleClearSelectedProduct = () => {
    setSelectedProductId('');
    setProductSearchTerm('');
    setIsProductDropdownOpen(true);
  };

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!selectedProductId) {
      // Auto-match if exact SKU or product name typed
      const matched = products.find(
        p => p.sku.toLowerCase() === productSearchTerm.trim().toLowerCase() ||
             p.name.toLowerCase() === productSearchTerm.trim().toLowerCase()
      );
      if (matched) {
        setSelectedProductId(matched.id);
      } else {
        setErrorMessage('Por favor, selecione ou digite um produto válido do Catálogo (SKU ou Nome).');
        return;
      }
    }
    // Keep tracking code as entered by user, or blank if not provided (STI is exclusively for controlled openbox items)
    const finalTrackingCode = trackingCode.trim();

    // Mandatory STI check for Openbox products
    if (destinationSector === 'Openbox' && !finalTrackingCode) {
      setErrorMessage('O Código STI é obrigatório para cadastrar produtos no setor OpenBox.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Determine final device status and package status (presets vs manual description)
    const finalDeviceStatus = (isCustomDeviceStatus ? customDeviceStatusText.trim() : deviceStatus) || 'Usado';
    const finalPackageStatus = (isCustomPackageStatus ? customPackageStatusText.trim() : packageStatus) || 'Danificada';

    const refProduct = products.find(p => p.id === selectedProductId) || products.find(
      p => p.sku.toLowerCase() === productSearchTerm.trim().toLowerCase() ||
           p.name.toLowerCase() === productSearchTerm.trim().toLowerCase()
    );
    if (!refProduct) {
      setErrorMessage('Produto de referência inválido.');
      return;
    }

    // Process serials list
    const cleanSerials = serials.map(s => s.trim());
    // Check if there are non-empty duplicate serials in the form itself
    const filledSerials = cleanSerials.filter(s => s !== '');
    const duplicateInForm = filledSerials.filter((s, idx) => filledSerials.indexOf(s) !== idx);
    if (duplicateInForm.length > 0) {
      setErrorMessage(`O número de série "${duplicateInForm[0]}" foi inserido mais de uma vez. Cada unidade cadastrada deve possuir um serial exclusivo.`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Target list of units to create (if only 1 line and empty, creates 1 unit with empty serial)
    const targetSerials = cleanSerials.length > 0 ? cleanSerials : [''];

    setIsSubmitting(true);

    let finalPhotosProduct = [...photosProduct];
    let finalPhotosBox = [...photosBox];
    let finalPhotosAccessories = [...photosAccessories];

    // For items in Estoque Principal, reuse the base product's already registered image without extra storage
    if (destinationSector === 'Principal' && refProduct) {
      const baseImgs = getBaseProductImages(refProduct);
      if (finalPhotosProduct.length === 0 && baseImgs.productPhotos.length > 0) {
        finalPhotosProduct = baseImgs.productPhotos;
      }
      if (finalPhotosBox.length === 0 && baseImgs.boxPhotos.length > 0) {
        finalPhotosBox = baseImgs.boxPhotos;
      }
      if (finalPhotosAccessories.length === 0 && baseImgs.accessoriesPhotos.length > 0) {
        finalPhotosAccessories = baseImgs.accessoriesPhotos;
      }
    }

    try {
      const baseTimestamp = Date.now();
      for (let i = 0; i < targetSerials.length; i++) {
        const currentSerial = targetSerials[i];
        const newTriage: TriageUnit = {
          id: `tr-${baseTimestamp}-${i}-${Math.random().toString(36).substring(2, 7)}`,
          trackingCode: finalTrackingCode,
          serialNumber: currentSerial,
          orderNumber: orderNumber.trim(),
          baseProductId: refProduct.id,
          baseProductName: refProduct.name,
          baseProductSku: refProduct.sku,
          baseProductVoltage: refProduct.voltage,
          platform,
          customerReason: customerReason.trim(),
          deviceStatus: finalDeviceStatus,
          packageStatus: finalPackageStatus,
          accessoriesInclusion: accessoriesInclusion.trim(),
          destinationSector,
          notes: notes, // HTML rich-text
          photosProduct: finalPhotosProduct,
          photosBox: finalPhotosBox,
          photosAccessories: finalPhotosAccessories,
          createdAt: new Date(baseTimestamp + i * 150).toISOString(),
          status: 'Estoque',
          excludeFromDailyCount: excludeFromDailyCount
        };

        await onSaveTriage(newTriage);
      }

      if (targetSerials.length === 1) {
        setSuccessMessage(`1 unidade do produto [${refProduct.sku}] cadastrada com sucesso no estoque físico!`);
      } else {
        setSuccessMessage(`${targetSerials.length} unidades do produto [${refProduct.sku}] adicionadas ao estoque com sucesso! Cada uma com seu serial exclusivo.`);
      }
      
      // Reset form fields
      setSelectedProductId('');
      setProductSearchTerm('');
      setCustomerReason('');
      setExcludeFromDailyCount(false);
      handleSelectDestinationSector('Openbox');
      setPhotosProduct([]);
      setPhotosBox([]);
      setPhotosAccessories([]);
      setNotes('');
      
      // Reset tracking code, order number & serial numbers list
      setTrackingCode('');
      setOrderNumber('');
      setSerials(['']);

      // Scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });

      // Clean success message and navigate to Stock
      setTimeout(() => {
        setSuccessMessage('');
        onNavigateToStock();
      }, 1500);

    } catch (err) {
      setErrorMessage('Erro ao gravar triagem no banco de dados.');
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6" id="rma-entry-container">
      {/* Header banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl" id="rma-header">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <FolderMinus className="text-rose-400 w-6 h-6" />
            Entrada de RMA e Triagem
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Recebimento de pacotes devolvidos, laudo de análise técnica e destinação de estoque.
          </p>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-2xl shadow-xl flex flex-col items-center justify-center" id="catalog-empty-warning">
          <AlertCircle className="w-12 h-12 text-amber-500 mb-3" />
          <h3 className="text-lg font-bold text-white">Catálogo de Base Vazio</h3>
          <p className="text-slate-400 text-sm mt-1 max-w-md">
            Você precisa cadastrar pelo menos um produto master no "Catálogo de Base" antes de fazer a triagem de entrada.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6" id="rma-entry-form">
          {errorMessage && (
            <div className="flex items-start gap-2.5 p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-sm font-semibold">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="flex items-center gap-2.5 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm font-semibold">
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Side Column: Fields (7 cols) */}
            <div className="lg:col-span-7 space-y-4">
              {/* Step 1: Produto do Catálogo & Números de Série (Agile Focus) */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md space-y-3.5" id="rma-step-product-serials">
                <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 bg-sky-500/10 text-sky-400 text-[11px] font-bold flex items-center justify-center rounded-md">1</span>
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-200">Produto & Números de Série (S/N)</span>
                  </div>
                  {selectedProduct && (
                    <span className="text-[11px] font-mono font-bold text-sky-400 bg-sky-950/60 px-2 py-0.5 rounded border border-sky-800/40">
                      SKU: {selectedProduct.sku}
                    </span>
                  )}
                </div>

                {/* SKU & Product Search Input / AutoComplete */}
                <div className="space-y-1" ref={productDropdownRef}>
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                      <span>Selecionar Produto</span>
                      <span className="text-sky-400 font-bold">*</span>
                    </label>
                    {selectedProduct && (
                      <button
                        type="button"
                        onClick={handleClearSelectedProduct}
                        className="text-[11px] text-slate-400 hover:text-rose-400 flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <X className="w-3 h-3" />
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
                      placeholder="Bipar ou digitar SKU / Nome (Ex: AIR-FRYER, Batedeira...)"
                      value={productSearchTerm}
                      onChange={(e) => {
                        setProductSearchTerm(e.target.value);
                        setIsProductDropdownOpen(true);
                        const exact = products.find(p => p.sku.toLowerCase() === e.target.value.trim().toLowerCase());
                        if (exact) {
                          setSelectedProductId(exact.id);
                        } else if (selectedProductId && e.target.value !== `[${selectedProduct?.sku}] ${selectedProduct?.name}`) {
                          setSelectedProductId('');
                        }
                      }}
                      onFocus={() => setIsProductDropdownOpen(true)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && filteredProducts.length > 0) {
                          e.preventDefault();
                          handleSelectProduct(filteredProducts[0]);
                        } else if (e.key === 'Escape') {
                          setIsProductDropdownOpen(false);
                        }
                      }}
                      className={`w-full pl-9 pr-9 py-2 bg-slate-950 border rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none transition-all font-sans ${
                        selectedProduct 
                          ? 'border-sky-500/60 bg-sky-950/20 text-sky-100 font-medium' 
                          : 'border-slate-800 focus:border-sky-500'
                      }`}
                      id="input-product-search-sku"
                      autoComplete="off"
                    />

                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      {productSearchTerm && (
                        <button
                          type="button"
                          onClick={handleClearSelectedProduct}
                          className="p-1 text-slate-500 hover:text-white rounded transition-colors cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsProductDropdownOpen(prev => !prev)}
                        className="p-1 text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
                      >
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isProductDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>
                    </div>

                    {/* Autocomplete Dropdown */}
                    {isProductDropdownOpen && (
                      <div className="product-search-dropdown absolute left-0 right-0 top-full mt-1 bg-slate-950 border border-slate-700/80 rounded-xl shadow-2xl z-50 max-h-60 overflow-y-auto divide-y divide-slate-800/60">
                        <div className="product-search-header p-2 bg-slate-900/95 text-[10px] text-slate-400 flex items-center justify-between border-b border-slate-800 font-medium sticky top-0 z-10 backdrop-blur-sm">
                          <span className="font-bold text-slate-300">
                            {filteredProducts.length} {filteredProducts.length === 1 ? 'produto' : 'produtos'}
                          </span>
                          <span className="text-[10px] text-slate-500">Mais frequentes primeiro</span>
                        </div>

                        {filteredProducts.length === 0 ? (
                          <div className="p-3 text-center text-xs text-slate-500">
                            Nenhum produto cadastrado com este SKU ou Nome.
                          </div>
                        ) : (
                          filteredProducts.map((p, idx) => {
                            const isSelected = p.id === selectedProductId;
                            const entryCount = getProductEntryCount(p);
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => handleSelectProduct(p)}
                                className={`product-search-item w-full text-left p-2 hover:bg-slate-800/80 transition-colors flex items-center justify-between gap-2.5 cursor-pointer ${
                                  isSelected ? 'bg-sky-500/15 product-search-item-selected' : ''
                                }`}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="product-search-sku font-mono text-[11px] font-bold text-sky-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                                      {p.sku}
                                    </span>
                                    <span className="product-search-voltage text-[10px] font-bold text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded">
                                      {p.voltage}
                                    </span>
                                    {entryCount > 0 && (
                                      <span className="text-[9px] font-mono bg-slate-800 text-slate-400 px-1 rounded">
                                        {entryCount} un
                                      </span>
                                    )}
                                  </div>
                                  <p className="product-search-title text-[11px] font-medium text-slate-200 mt-0.5 truncate">
                                    {p.name}
                                  </p>
                                </div>
                                {isSelected && (
                                  <Check className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Multiple Serial Numbers Management (Compact Barcode Focus) */}
                <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-3 space-y-2" id="rma-multi-serial-container">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-sky-400" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                        Seriais (S/N)
                      </span>
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30">
                        {serials.length} un
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleAddSerialLine}
                      className="px-2.5 py-1 bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 rounded text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                      id="btn-add-serial-line"
                    >
                      <Plus className="w-3 h-3" />
                      <span>+ Serial / Unidade</span>
                    </button>
                  </div>

                  {/* Serials list */}
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-0.5">
                    {serials.map((serialVal, idx) => (
                      <div key={idx} className="flex items-center gap-1.5">
                        <span className="w-6 h-7 bg-slate-900 border border-slate-800 text-slate-400 font-mono text-[10px] font-bold rounded flex items-center justify-center shrink-0">
                          #{idx + 1}
                        </span>

                        <input 
                          type="text"
                          placeholder={`Serial da unidade #${idx + 1} (Bipar leitor ou colar)`}
                          value={serialVal}
                          onChange={(e) => handleUpdateSerial(idx, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                            }
                          }}
                          className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500"
                          id={`input-serial-${idx}`}
                        />

                        <button
                          type="button"
                          onClick={() => handleRemoveSerialLine(idx)}
                          className="p-1.5 text-slate-500 hover:text-rose-400 rounded transition-colors cursor-pointer shrink-0"
                          title={serials.length > 1 ? "Remover" : "Limpar"}
                        >
                          {serials.length > 1 ? <Trash2 className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    ))}
                  </div>

                  <p className="text-[10px] text-slate-500">
                    💡 O serial bipado é registrado no campo selecionado. Para adicionar mais unidades/seriais nesta entrada, clique no botão <strong>+ Serial / Unidade</strong> acima.
                  </p>
                </div>
              </div>

              {/* Step 2: Destino, Origem e Identificação do Pacote (Ultra-compact Unified Card) */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md space-y-3.5" id="rma-step-destination-origin">
                <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 bg-sky-500/10 text-sky-400 text-[11px] font-bold flex items-center justify-center rounded-md">2</span>
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-200">Destino & Origem do Pacote</span>
                  </div>
                  <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md border"
                    style={{
                      backgroundColor: destinationSector === 'Principal' ? 'rgba(16,185,129,0.1)' : destinationSector === 'Openbox' ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
                      borderColor: destinationSector === 'Principal' ? 'rgba(16,185,129,0.3)' : destinationSector === 'Openbox' ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)',
                      color: destinationSector === 'Principal' ? '#34D399' : destinationSector === 'Openbox' ? '#FBBF24' : '#F87171'
                    }}
                  >
                    {destinationSector === 'Principal' ? '🟢 Estoque Principal' : destinationSector === 'Openbox' ? '🟠 Openbox' : '🔴 RMA'}
                  </span>
                </div>

                {/* 3 Quick Destination Cards */}
                <div className="grid grid-cols-3 gap-2" id="destination-sector-cards">
                  <button
                    type="button"
                    onClick={() => handleSelectDestinationSector('Principal')}
                    className={`py-2 px-2.5 rounded-lg border text-left transition-all cursor-pointer flex items-center justify-between ${
                      destinationSector === 'Principal'
                        ? 'bg-emerald-500/15 border-emerald-500 ring-1 ring-emerald-500/40 text-emerald-300 font-bold shadow-sm'
                        : 'bg-slate-950/70 border-slate-800 hover:border-emerald-500/30 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
                      <span className="text-xs truncate">Principal</span>
                    </div>
                    {destinationSector === 'Principal' && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectDestinationSector('Openbox')}
                    className={`py-2 px-2.5 rounded-lg border text-left transition-all cursor-pointer flex items-center justify-between ${
                      destinationSector === 'Openbox'
                        ? 'bg-amber-500/15 border-amber-500 ring-1 ring-amber-500/40 text-amber-300 font-bold shadow-sm'
                        : 'bg-slate-950/70 border-slate-800 hover:border-amber-500/30 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0"></span>
                      <span className="text-xs truncate">Openbox</span>
                    </div>
                    {destinationSector === 'Openbox' && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectDestinationSector('RMA')}
                    className={`py-2 px-2.5 rounded-lg border text-left transition-all cursor-pointer flex items-center justify-between ${
                      destinationSector === 'RMA'
                        ? 'bg-rose-500/15 border-rose-500 ring-1 ring-rose-500/40 text-rose-300 font-bold shadow-sm'
                        : 'bg-slate-950/70 border-slate-800 hover:border-rose-500/30 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0"></span>
                      <span className="text-xs truncate">RMA</span>
                    </div>
                    {destinationSector === 'RMA' && <Check className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                  </button>
                </div>

                {/* Origin details row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  {/* Platform */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Plataforma</label>
                    <select 
                      value={platform}
                      onChange={(e) => setPlatform(e.target.value as PlatformType)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                      id="select-platform-origin"
                    >
                      <option value="Mercado Livre">Mercado Livre</option>
                      <option value="Shopee">Shopee</option>
                      <option value="Amazon">Amazon</option>
                      <option value="Amazon Ta Novo">Amazon Ta Novo</option>
                      <option value="Kabum">Kabum</option>
                    </select>
                  </div>

                  {/* Código STI */}
                  <div className="space-y-1">
                    <label className={`text-[11px] font-bold uppercase tracking-wider flex items-center justify-between ${
                      destinationSector === 'Openbox' ? 'text-amber-400' : 'text-slate-400'
                    }`}>
                      <span>Código STI {destinationSector === 'Openbox' ? '*' : ''}</span>
                      {destinationSector === 'Openbox' && (
                        <span className="text-[9px] font-bold px-1 bg-amber-500/20 text-amber-300 rounded">Obrigatório</span>
                      )}
                    </label>
                    <input 
                      type="text"
                      placeholder={destinationSector === 'Openbox' ? "STI-40912 ou 13509873" : "Opcional"}
                      value={trackingCode}
                      onChange={(e) => setTrackingCode(e.target.value)}
                      className={`w-full px-3 py-2 bg-slate-950 rounded-lg text-xs font-mono transition-all ${
                        destinationSector === 'Openbox'
                          ? 'border border-amber-500/60 text-amber-200 placeholder-amber-500/40 focus:outline-none focus:ring-1 focus:ring-amber-400/40'
                          : 'border border-slate-800 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500'
                      }`}
                      id="input-tracking-code"
                      required={destinationSector === 'Openbox'}
                    />
                  </div>

                  {/* Order Number */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Nº Pedido (Opcional)</label>
                    <input 
                      type="text"
                      placeholder="Ex: 2000008172648"
                      value={orderNumber}
                      onChange={(e) => setOrderNumber(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500"
                      id="input-order-number"
                    />
                  </div>
                </div>
              </div>

              {/* Step 3: Avaliação Técnica e Condições (Quick Pills & Compact Fields) */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md space-y-3.5" id="rma-step-inspection">
                <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 bg-sky-500/10 text-sky-400 text-[11px] font-bold flex items-center justify-center rounded-md">3</span>
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-200">Avaliação Técnica & Condição Visual</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Estado do Aparelho with Quick Pills */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Estado do Aparelho</label>
                    <div className="grid grid-cols-4 gap-1">
                      {(['Novo', 'Usado', 'Danificado', 'Descrever'] as const).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => {
                            setDeviceStatus(st as DeviceStatusType);
                            if (st === 'Descrever') {
                              setIsCustomDeviceStatus(true);
                            } else {
                              setIsCustomDeviceStatus(false);
                              setCustomDeviceStatusText('');
                            }
                          }}
                          className={`py-1.5 px-1 rounded text-[11px] font-semibold border transition-all text-center cursor-pointer truncate ${
                            deviceStatus === st
                              ? 'bg-sky-500/20 border-sky-500 text-sky-300 font-bold shadow-sm'
                              : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>

                    {(deviceStatus === 'Descrever' || isCustomDeviceStatus) && (
                      <input 
                        type="text"
                        placeholder="Descreva o estado do aparelho..."
                        value={customDeviceStatusText}
                        onChange={(e) => setCustomDeviceStatusText(e.target.value)}
                        className="w-full px-3 py-1.5 bg-slate-950 border border-sky-500/50 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
                        id="input-custom-device-status"
                        autoFocus
                      />
                    )}
                  </div>

                  {/* Estado da Embalagem with Quick Pills */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Estado da Caixa / Embalagem</label>
                    <div className="grid grid-cols-4 gap-1">
                      {(['Perfeita', 'Danificada', 'Sem Embalagem', 'Descrever'] as const).map((pkg) => (
                        <button
                          key={pkg}
                          type="button"
                          onClick={() => {
                            setPackageStatus(pkg as PackageStatusType);
                            if (pkg === 'Descrever') {
                              setIsCustomPackageStatus(true);
                            } else {
                              setIsCustomPackageStatus(false);
                              setCustomPackageStatusText('');
                            }
                          }}
                          className={`py-1.5 px-1 rounded text-[11px] font-semibold border transition-all text-center cursor-pointer truncate ${
                            packageStatus === pkg
                              ? 'bg-sky-500/20 border-sky-500 text-sky-300 font-bold shadow-sm'
                              : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                          }`}
                          title={pkg}
                        >
                          {pkg === 'Sem Embalagem' ? 'Sem Caixa' : pkg}
                        </button>
                      ))}
                    </div>

                    {(packageStatus === 'Descrever' || isCustomPackageStatus) && (
                      <input 
                        type="text"
                        placeholder="Descreva o estado da caixa..."
                        value={customPackageStatusText}
                        onChange={(e) => setCustomPackageStatusText(e.target.value)}
                        className="w-full px-3 py-1.5 bg-slate-950 border border-sky-500/50 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
                        id="input-custom-package-status"
                        autoFocus
                      />
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Reclamação / Motivo do Cliente */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Motivo / Reclamação do Cliente</label>
                    <input 
                      type="text"
                      placeholder="Ex: Devolução por desistência, não ligou..."
                      value={customerReason}
                      onChange={(e) => setCustomerReason(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500"
                      id="textarea-customer-reason"
                    />
                  </div>

                  {/* Acessórios inclusos */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Acessórios Inclusos</label>
                    <input 
                      type="text"
                      placeholder="Ex: Completo com cabo e manual..."
                      value={accessoriesInclusion}
                      onChange={(e) => setAccessoriesInclusion(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500"
                      id="input-accessories-inclusion"
                    />
                  </div>
                </div>
              </div>

              {/* Step 4: Laudo Técnico & Observações (Compact Editor) */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md space-y-2.5" id="rma-step-notes">
                <div className="flex items-center gap-2 border-b border-slate-800/80 pb-2">
                  <span className="w-5 h-5 bg-sky-500/10 text-sky-400 text-[11px] font-bold flex items-center justify-center rounded-md">4</span>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-200">Laudo Técnico & Parecer do Triador</span>
                </div>
                
                <RichTextEditor
                  value={notes}
                  onChange={setNotes}
                  placeholder="Insira o laudo técnico, testes realizados ou observações complementares..."
                  minHeight="90px"
                  maxHeight="200px"
                  id="technical-notes-editor"
                />
              </div>
            </div>

            {/* Right Side Column: Media Station & Fast Submission (5 cols) */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md space-y-3.5 sticky top-4" id="rma-step-photos">
                <div className="border-b border-slate-800/80 pb-2.5 flex justify-between items-center">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                    <Clipboard className="text-sky-400 w-4 h-4" />
                    <span>Fotos & Mídia</span>
                  </h3>
                  <div className="flex items-center gap-1 px-2 py-0.5 bg-slate-950 rounded text-[10px] text-sky-400 font-mono border border-slate-800">
                    <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-pulse"></span>
                    <span>Ctrl+V Ativo</span>
                  </div>
                </div>

                {/* Estoque Principal Instant Copy */}
                {(() => {
                  const refProduct = products.find(p => p.id === selectedProductId);
                  const hasCatalogImages = !!(refProduct && ((refProduct.images && refProduct.images.length > 0) || refProduct.imageUrl));
                  
                  if (destinationSector === 'Principal' && selectedProductId) {
                    return (
                      <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center justify-between gap-2" id="catalog-images-import-panel">
                        <div className="flex items-center gap-1.5 text-xs text-emerald-300 font-medium">
                          <Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>Usar imagens oficiais do catálogo</span>
                        </div>
                        {hasCatalogImages && (
                          <button
                            type="button"
                            onClick={() => {
                              if (refProduct.imagesProduct && refProduct.imagesProduct.length > 0) {
                                setPhotosProduct(refProduct.imagesProduct);
                              } else if (refProduct.images && refProduct.images.length > 0) {
                                setPhotosProduct(refProduct.images);
                              } else if (refProduct.imageUrl) {
                                setPhotosProduct([refProduct.imageUrl]);
                              }
                              if (refProduct.imagesBox && refProduct.imagesBox.length > 0) setPhotosBox(refProduct.imagesBox);
                              if (refProduct.imagesAccessories && refProduct.imagesAccessories.length > 0) setPhotosAccessories(refProduct.imagesAccessories);
                            }}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-bold transition-all cursor-pointer shadow-sm"
                          >
                            Copiar Fotos
                          </button>
                        )}
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Category Selector Tabs */}
                <div className="grid grid-cols-3 gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg text-center text-xs" id="ctrl-v-category-selector">
                  <button 
                    type="button" 
                    onClick={() => setActiveUploadCategory('product')}
                    className={`py-1.5 px-1 rounded font-bold cursor-pointer transition-all truncate ${
                      activeUploadCategory === 'product' ? 'bg-sky-500 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-900'
                    }`}
                  >
                    Produto ({photosProduct.length})
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setActiveUploadCategory('box')}
                    className={`py-1.5 px-1 rounded font-bold cursor-pointer transition-all truncate ${
                      activeUploadCategory === 'box' ? 'bg-sky-500 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-900'
                    }`}
                  >
                    Caixa ({photosBox.length})
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setActiveUploadCategory('accessories')}
                    className={`py-1.5 px-1 rounded font-bold cursor-pointer transition-all truncate ${
                      activeUploadCategory === 'accessories' ? 'bg-sky-500 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-900'
                    }`}
                  >
                    Acessórios ({photosAccessories.length})
                  </button>
                </div>

                {/* Active Category Dropzone & Ctrl+V Zone */}
                <div className="space-y-2">
                  <div 
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, activeUploadCategory)}
                    onPaste={(e) => handleLocalPaste(e, activeUploadCategory)}
                    tabIndex={0}
                    className="border-2 border-dashed border-sky-500/70 bg-sky-500/5 hover:bg-sky-500/10 rounded-xl p-4 text-center cursor-pointer transition-all outline-none"
                    onClick={(e) => {
                      e.stopPropagation();
                      document.getElementById(`file-upload-${activeUploadCategory}`)?.click();
                    }}
                  >
                    <Upload className="w-5 h-5 mx-auto text-sky-400 mb-1.5" />
                    <p className="text-xs text-slate-200 font-bold">
                      📸 Clique para selecionar ou aperte <span className="text-sky-400 font-mono">Ctrl+V</span> para colar
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Destino atual: <strong className="text-sky-300">
                        {activeUploadCategory === 'product' ? 'Fotos do Produto' : activeUploadCategory === 'box' ? 'Fotos da Caixa' : 'Fotos dos Acessórios'}
                      </strong>
                    </p>
                    <input 
                      type="file" 
                      id={`file-upload-${activeUploadCategory}`}
                      multiple 
                      accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" 
                      onChange={(e) => handlePhotoUpload(e.target.files, activeUploadCategory)} 
                      className="hidden" 
                    />
                  </div>

                  {/* URL Photo Compact Input */}
                  <div className="flex gap-1.5 pt-1">
                    <input
                      type="url"
                      value={urlPhotoInput}
                      onChange={(e) => { setUrlPhotoInput(e.target.value); setUrlPhotoError(null); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddPhotoByUrl(activeUploadCategory);
                        }
                      }}
                      placeholder="Ou cole o link direto da imagem..."
                      className="flex-1 px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-[11px] text-slate-200 focus:outline-none focus:border-sky-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddPhotoByUrl(activeUploadCategory)}
                      disabled={isSanitizingUrl || !urlPhotoInput.trim()}
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-[11px] font-bold rounded-lg transition-all flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      {isSanitizingUrl ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                      <span>Link</span>
                    </button>
                  </div>
                  {urlPhotoError && (
                    <p className="text-[10px] text-rose-400">{urlPhotoError}</p>
                  )}
                </div>

                {/* Thumbnails Gallery of All 3 Categories */}
                <div className="space-y-2 pt-1">
                  {/* Category 1: Produto */}
                  {photosProduct.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400">Fotos do Produto ({photosProduct.length}):</span>
                      <div className="grid grid-cols-4 gap-1.5">
                        {photosProduct.map((p, i) => (
                          <div key={i} className="relative aspect-square rounded-lg border border-slate-800 overflow-hidden group">
                            <img src={p} className="w-full h-full object-cover" />
                            <button 
                              type="button" 
                              onClick={() => handleRemovePhoto(i, 'product')}
                              className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-rose-400 transition-opacity"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Category 2: Caixa */}
                  {photosBox.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400">Fotos da Caixa ({photosBox.length}):</span>
                      <div className="grid grid-cols-4 gap-1.5">
                        {photosBox.map((p, i) => (
                          <div key={i} className="relative aspect-square rounded-lg border border-slate-800 overflow-hidden group">
                            <img src={p} className="w-full h-full object-cover" />
                            <button 
                              type="button" 
                              onClick={() => handleRemovePhoto(i, 'box')}
                              className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-rose-400 transition-opacity"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Category 3: Acessórios */}
                  {photosAccessories.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400">Fotos de Acessórios ({photosAccessories.length}):</span>
                      <div className="grid grid-cols-4 gap-1.5">
                        {photosAccessories.map((p, i) => (
                          <div key={i} className="relative aspect-square rounded-lg border border-slate-800 overflow-hidden group">
                            <img src={p} className="w-full h-full object-cover" />
                            <button 
                              type="button" 
                              onClick={() => handleRemovePhoto(i, 'accessories')}
                              className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-rose-400 transition-opacity"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Opção de Contador Diário */}
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                  <label className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input 
                      type="checkbox"
                      checked={excludeFromDailyCount}
                      onChange={(e) => setExcludeFromDailyCount(e.target.checked)}
                      className="mt-0.5 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-400 focus:ring-offset-slate-900 h-4 w-4"
                      id="checkbox-exclude-daily-count"
                    />
                    <div className="space-y-0.5">
                      <span className="text-xs font-semibold text-slate-200 block">
                        Não contabilizar na entrada diária
                      </span>
                      <span className="text-[11px] text-slate-400 block leading-tight">
                        O produto entrará normalmente no estoque, mas será ignorado do contador de devoluções de hoje.
                      </span>
                    </div>
                  </label>
                </div>

                {/* Prominent Action Button */}
                <div className="pt-2 border-t border-slate-800/80">
                  <button 
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3 bg-sky-500 hover:bg-sky-400 text-white rounded-xl text-xs font-bold shadow-lg shadow-sky-500/20 disabled:opacity-50 flex items-center justify-center gap-2 transition-all cursor-pointer"
                    id="btn-save-triage"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Gravando triagem...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        <span>Finalizar e Salvar ({serials.filter(s => s.trim()).length || 1} {serials.filter(s => s.trim()).length > 1 ? 'unidades' : 'unidade'})</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
