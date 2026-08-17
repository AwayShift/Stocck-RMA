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
  X
} from 'lucide-react';
import { BaseProduct, TriageUnit, PlatformType, DeviceStatusType, PackageStatusType, DestinationSectorType } from '../types';
import { uploadFileToStorage } from '../lib/dbService';
import { RichTextEditor } from './RichTextEditor';
import { getBaseProductImages } from '../utils/productImages';

interface RmaEntryProps {
  products: BaseProduct[];
  units?: TriageUnit[];
  onSaveTriage: (unit: TriageUnit) => Promise<void>;
  onNavigateToStock: () => void;
}

// Image compression utility
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
          const base64 = canvas.toDataURL('image/jpeg', 0.7); // Compress at 70% JPEG quality
          resolve(base64);
        } else {
          resolve(e.target?.result as string);
        }
      };
      img.onerror = () => reject(new Error('Falha ao ler imagem.'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Falha ao ler arquivo.'));
    reader.readAsDataURL(file);
  });
};

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
  const [serialNumber, setSerialNumber] = useState('');
  const [platform, setPlatform] = useState<PlatformType>('Mercado Livre');
  const [customerReason, setCustomerReason] = useState('');

  // Fields of Analysis
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatusType>('Usado');
  const [packageStatus, setPackageStatus] = useState<PackageStatusType>('Danificada');
  const [accessoriesInclusion, setAccessoriesInclusion] = useState('Todos os acessórios inclusos.');

  // Sector Destination
  const [destinationSector, setDestinationSector] = useState<DestinationSectorType>('Openbox');

  // Photo categories state
  const [photosProduct, setPhotosProduct] = useState<string[]>([]);
  const [photosBox, setPhotosBox] = useState<string[]>([]);
  const [photosAccessories, setPhotosAccessories] = useState<string[]>([]);

  // Active upload zone for Ctrl+V
  const [activeUploadCategory, setActiveUploadCategory] = useState<'product' | 'box' | 'accessories'>('product');

  // Rich-text observations HTML state
  const [notes, setNotes] = useState('');

  // Status messages
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    } catch (err) {
      setErrorMessage('Erro ao realizar upload das fotos.');
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
    let finalTrackingCode = trackingCode.trim();
    if (!finalTrackingCode) {
      if (destinationSector === 'Openbox') {
        finalTrackingCode = `STI-${Math.floor(10000 + Math.random() * 90000)}`;
      } else if (destinationSector === 'Principal') {
        finalTrackingCode = `PRIN-${Math.floor(10000 + Math.random() * 90000)}`;
      } else {
        finalTrackingCode = `RMA-${Math.floor(10000 + Math.random() * 90000)}`;
      }
    }

    const refProduct = products.find(p => p.id === selectedProductId) || products.find(
      p => p.sku.toLowerCase() === productSearchTerm.trim().toLowerCase() ||
           p.name.toLowerCase() === productSearchTerm.trim().toLowerCase()
    );
    if (!refProduct) {
      setErrorMessage('Produto de referência inválido.');
      return;
    }

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

    const newTriage: TriageUnit = {
      id: 'tr-' + Date.now(),
      trackingCode: finalTrackingCode,
      serialNumber: serialNumber.trim(),
      baseProductId: refProduct.id,
      baseProductName: refProduct.name,
      baseProductSku: refProduct.sku,
      baseProductVoltage: refProduct.voltage,
      platform,
      customerReason: customerReason.trim(),
      deviceStatus,
      packageStatus,
      accessoriesInclusion: accessoriesInclusion.trim(),
      destinationSector,
      notes: notes, // HTML rich-text
      photosProduct: finalPhotosProduct,
      photosBox: finalPhotosBox,
      photosAccessories: finalPhotosAccessories,
      createdAt: new Date().toISOString(),
      status: 'Estoque'
    };

    try {
      await onSaveTriage(newTriage);
      setSuccessMessage('Triagem de Devolução gravada com sucesso no banco de dados!');
      
      // Reset form fields
      setSelectedProductId('');
      setProductSearchTerm('');
      setCustomerReason('');
      setAccessoriesInclusion('Todos os acessórios inclusos.');
      setPhotosProduct([]);
      setPhotosBox([]);
      setPhotosAccessories([]);
      setNotes('');
      
      // Reset tracking code & serial number
      setTrackingCode('');
      setSerialNumber('');

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

  // Helper to pre-populate inputs for quick test
  const handleQuickPreFill = () => {
    if (products.length === 0) return;
    const randomProduct = products[Math.floor(Math.random() * products.length)];
    setSelectedProductId(randomProduct.id);
    setProductSearchTerm(`[${randomProduct.sku}] ${randomProduct.name}`);
    setPlatform('Mercado Livre');
    setTrackingCode('STI-40912');
    setSerialNumber('SN-9876543210-BR');
    setCustomerReason('O produto funcionou na primeira semana, mas parou de esquentar na segunda semana. Quero devolução.');
    setDeviceStatus('Usado');
    setPackageStatus('Danificada');
    setAccessoriesInclusion('Acompanha cabo, gaveta de fritar e divisória de silicone.');
    setDestinationSector('RMA');
    const technicalReport = `<h3>Relatório de Entrada de RMA:</h3><p>Equipamento recebido com marcas leves de gordura no cesto.</p><p><strong>Diagnóstico:</strong> Resistência aberta. Fusível térmico de proteção em curto-circuito devido a superaquecimento.</p><p><strong>Solução:</strong> Necessita troca de kit de aquecimento na oficina técnica.</p>`;
    setNotes(technicalReport);
  };

  return (
    <div className="space-y-6" id="rma-entry-container">
      {/* Header banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#161F30] border border-[#26354A] rounded-2xl p-6 shadow-xl" id="rma-header">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <FolderMinus className="text-rose-400 w-6 h-6" />
            Entrada de RMA e Triagem
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Recebimento de pacotes devolvidos, laudo de análise técnica e destinação de estoque.
          </p>
        </div>
        <button 
          type="button"
          onClick={handleQuickPreFill}
          disabled={products.length === 0}
          className="flex items-center gap-2 px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 rounded-lg text-xs font-semibold border border-rose-500/20 disabled:opacity-50 transition-all cursor-pointer"
          title="Preenche o formulário com dados de exemplo realistas"
          id="btn-prefill-rma"
        >
          <Zap className="w-3.5 h-3.5 text-rose-400" />
          Preenchimento Rápido (Simulação)
        </button>
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
            <div className="lg:col-span-7 space-y-6">
              {/* Step 1: Destination Decision (FIRST ITEM IN ORDER - COMPACT) */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-md" id="rma-step-destination">
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <span className="w-5 h-5 bg-sky-500/10 text-sky-400 text-[11px] font-bold flex items-center justify-center rounded-md">1</span>
                    <span>Decisão de Direcionamento (Destino)</span>
                  </label>
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

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" id="destination-sector-cards">
                  {/* Card 1: Estoque Principal */}
                  <button
                    type="button"
                    onClick={() => setDestinationSector('Principal')}
                    className={`py-2 px-3 rounded-lg border text-left transition-all cursor-pointer flex items-center justify-between ${
                      destinationSector === 'Principal'
                        ? 'bg-emerald-500/15 border-emerald-500 shadow-sm shadow-emerald-500/10 ring-1 ring-emerald-500/40 text-emerald-300 font-bold'
                        : 'bg-slate-950/60 border-slate-800 hover:border-emerald-500/30 hover:bg-slate-950 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
                      <span className="text-xs truncate">Estoque Principal</span>
                    </div>
                    {destinationSector === 'Principal' && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                  </button>

                  {/* Card 2: Openbox */}
                  <button
                    type="button"
                    onClick={() => setDestinationSector('Openbox')}
                    className={`py-2 px-3 rounded-lg border text-left transition-all cursor-pointer flex items-center justify-between ${
                      destinationSector === 'Openbox'
                        ? 'bg-amber-500/15 border-amber-500 shadow-sm shadow-amber-500/10 ring-1 ring-amber-500/40 text-amber-300 font-bold'
                        : 'bg-slate-950/60 border-slate-800 hover:border-amber-500/30 hover:bg-slate-950 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0"></span>
                      <span className="text-xs truncate">Openbox</span>
                    </div>
                    {destinationSector === 'Openbox' && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                  </button>

                  {/* Card 3: RMA */}
                  <button
                    type="button"
                    onClick={() => setDestinationSector('RMA')}
                    className={`py-2 px-3 rounded-lg border text-left transition-all cursor-pointer flex items-center justify-between ${
                      destinationSector === 'RMA'
                        ? 'bg-rose-500/15 border-rose-500 shadow-sm shadow-rose-500/10 ring-1 ring-rose-500/40 text-rose-300 font-bold'
                        : 'bg-slate-950/60 border-slate-800 hover:border-rose-500/30 hover:bg-slate-950 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0"></span>
                      <span className="text-xs truncate">RMA</span>
                    </div>
                    {destinationSector === 'RMA' && <Check className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                  </button>
                </div>
              </div>

              {/* Step 2: Base Identification */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4" id="rma-step-2">
                <h3 className="text-base font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                  <span className="w-6 h-6 bg-sky-500/10 text-sky-400 text-xs font-bold flex items-center justify-center rounded-lg">2</span>
                  Recepção e Origem do Pacote
                </h3>

                {/* SKU & Product Search Input / AutoComplete */}
                <div className="space-y-1.5" ref={productDropdownRef}>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <span>Produto do Catálogo (Nome ou SKU)</span>
                      <span className="text-sky-400 font-bold">*</span>
                    </label>
                    {selectedProduct && (
                      <button
                        type="button"
                        onClick={handleClearSelectedProduct}
                        className="text-[11px] text-slate-400 hover:text-rose-400 flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                        <span>Trocar produto</span>
                      </button>
                    )}
                  </div>

                  <div className="relative">
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
                      <Search className="w-4 h-4" />
                    </div>

                    <input
                      type="text"
                      placeholder="Digite o SKU ou Nome do produto (Ex: AIR-FRYER, Batedeira...)"
                      value={productSearchTerm}
                      onChange={(e) => {
                        setProductSearchTerm(e.target.value);
                        setIsProductDropdownOpen(true);
                        // If exact match exists, sync it
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
                      className={`w-full pl-10 pr-10 py-2.5 bg-slate-950 border rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none transition-all font-sans ${
                        selectedProduct 
                          ? 'border-sky-500/60 bg-sky-950/10 text-sky-100 font-medium' 
                          : 'border-slate-800 focus:border-sky-500'
                      }`}
                      id="input-product-search-sku"
                      autoComplete="off"
                    />

                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                      {productSearchTerm && (
                        <button
                          type="button"
                          onClick={handleClearSelectedProduct}
                          className="p-1 text-slate-500 hover:text-white rounded-md transition-colors cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsProductDropdownOpen(prev => !prev)}
                        className="p-1 text-slate-400 hover:text-white rounded-md transition-colors cursor-pointer"
                      >
                        <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isProductDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>
                    </div>

                    {/* Autocomplete Dropdown */}
                    {isProductDropdownOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1.5 bg-[#0a0f1d] border border-slate-700/80 rounded-xl shadow-2xl z-50 max-h-72 overflow-y-auto divide-y divide-slate-800/60 scrollbar-thin scrollbar-thumb-slate-850">
                        <div className="p-2.5 bg-slate-900/90 text-[11px] text-slate-400 flex items-center justify-between border-b border-slate-800 font-medium sticky top-0 z-10 backdrop-blur-sm">
                          <span className="flex items-center gap-1.5 font-bold text-slate-300">
                            <span className="w-2 h-2 rounded-full bg-sky-400"></span>
                            {filteredProducts.length} {filteredProducts.length === 1 ? 'produto' : 'produtos'} {productSearchTerm ? 'encontrados' : 'ordenados por frequência de entrada'}
                          </span>
                          <span className="text-[10px] text-slate-500">Top 10 mais frequentes primeiro</span>
                        </div>

                        {filteredProducts.length === 0 ? (
                          <div className="p-4 text-center text-xs text-slate-500">
                            Nenhum produto cadastrado com este SKU ou Nome.
                          </div>
                        ) : (
                          filteredProducts.map((p, idx) => {
                            const isSelected = p.id === selectedProductId;
                            const entryCount = getProductEntryCount(p);
                            const isTop10 = idx < 10;
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => handleSelectProduct(p)}
                                className={`w-full text-left p-2.5 hover:bg-slate-800/80 transition-colors flex items-center justify-between gap-3 cursor-pointer ${
                                  isSelected ? 'bg-sky-500/10' : ''
                                }`}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono text-xs font-bold text-sky-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                                      {p.sku}
                                    </span>
                                    <span className="text-[11px] font-bold text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded">
                                      {p.voltage}
                                    </span>
                                    {entryCount > 0 && (
                                      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${
                                        isTop10 && !productSearchTerm 
                                          ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' 
                                          : 'bg-slate-800 text-slate-400'
                                      }`}>
                                        <span>#{idx + 1}</span>
                                        <span>•</span>
                                        <span>{entryCount} {entryCount === 1 ? 'entrada' : 'entradas'}</span>
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs font-medium text-slate-200 mt-1 truncate">
                                    {p.name}
                                  </p>
                                </div>
                                {isSelected && (
                                  <Check className="w-4 h-4 text-sky-400 shrink-0" />
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>

                  {/* Selected product tag preview */}
                  {selectedProduct && (
                    <div className="flex items-center gap-2 pt-1">
                      <div className="flex items-center gap-2 px-2.5 py-1 bg-sky-950/40 border border-sky-800/40 rounded-lg text-xs text-sky-300">
                        <CheckCircle className="w-3.5 h-3.5 text-sky-400" />
                        <span className="font-mono font-bold text-white">{selectedProduct.sku}</span>
                        <span className="text-slate-400">•</span>
                        <span className="truncate max-w-xs">{selectedProduct.name}</span>
                        <span className="text-slate-400 font-mono text-[10px]">({selectedProduct.voltage})</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className={`grid grid-cols-1 ${destinationSector === 'Openbox' ? 'md:grid-cols-2' : 'md:grid-cols-2'} gap-4`}>
                  {/* Platform Selection */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Plataforma Origem</label>
                    <select 
                      value={platform}
                      onChange={(e) => setPlatform(e.target.value as PlatformType)}
                      className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-sky-500"
                      id="select-platform-origin"
                    >
                      <option value="Mercado Livre">Mercado Livre</option>
                      <option value="Shopee">Shopee</option>
                      <option value="Amazon">Amazon</option>
                      <option value="Kabum">Kabum</option>
                    </select>
                  </div>

                  {/* Tracking / Case Code (Código STI) - Enabled ONLY for Openbox */}
                  {destinationSector === 'Openbox' ? (
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center justify-between">
                        <span>Código STI</span>
                        <span className="text-[11px] font-normal text-slate-400">Identificador Openbox</span>
                      </label>
                      <input 
                        type="text"
                        placeholder="Digite o Código STI (Ex: STI-40912)"
                        value={trackingCode}
                        onChange={(e) => setTrackingCode(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-950 border border-amber-500/40 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400 font-mono"
                        id="input-tracking-code"
                      />
                    </div>
                  ) : (
                    /* Serial Number / S/N when not openbox */
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                        <span>Nº de Série / Serial</span>
                        <span className="text-slate-500 font-normal">(S/N)</span>
                      </label>
                      <input 
                        type="text"
                        placeholder="Ex: SN-123456789-BR (Bipar barras)"
                        value={serialNumber}
                        onChange={(e) => setSerialNumber(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-sky-500 font-mono"
                        id="input-serial-number"
                      />
                    </div>
                  )}
                </div>

                {/* Serial Number when Openbox is active */}
                {destinationSector === 'Openbox' && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                      <span>Nº de Série / Serial</span>
                      <span className="text-slate-500 font-normal">(S/N)</span>
                    </label>
                    <input 
                      type="text"
                      placeholder="Ex: SN-123456789-BR (Bipar barras)"
                      value={serialNumber}
                      onChange={(e) => setSerialNumber(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-sky-500 font-mono"
                      id="input-serial-number-openbox"
                    />
                  </div>
                )}

                {/* Customer Reason text */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Reclamação / Motivo do Cliente</label>
                  <textarea 
                    rows={2}
                    placeholder="Cole ou digite aqui a justificativa oficial do cliente para a devolução..."
                    value={customerReason}
                    onChange={(e) => setCustomerReason(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500"
                    id="textarea-customer-reason"
                  />
                </div>
              </div>

              {/* Step 3: Analysis and State */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4" id="rma-step-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                  <span className="w-6 h-6 bg-sky-500/10 text-sky-400 text-xs font-bold flex items-center justify-center rounded-lg">3</span>
                  Avaliação Visual e Triagem Técnica
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Device Status */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Estado do Aparelho</label>
                    <select 
                      value={deviceStatus}
                      onChange={(e) => setDeviceStatus(e.target.value as DeviceStatusType)}
                      className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none"
                      id="select-device-status"
                    >
                      <option value="Novo">Novo (Sem marcas de uso)</option>
                      <option value="Usado">Usado (Marcas normais / leves)</option>
                      <option value="Danificado">Danificado / Quebrado</option>
                    </select>
                  </div>

                  {/* Packaging Status */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Estado da Caixa/Embalagem</label>
                    <select 
                      value={packageStatus}
                      onChange={(e) => setPackageStatus(e.target.value as PackageStatusType)}
                      className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none"
                      id="select-package-status"
                    >
                      <option value="Perfeita">Perfeita / Intacta</option>
                      <option value="Danificada">Caixa danificada / amassada</option>
                      <option value="Sem Embalagem">Sem caixa de varejo original</option>
                    </select>
                  </div>
                </div>

                {/* Accessories included check */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Acessórios Inclusos</label>
                  <input 
                    type="text"
                    placeholder="Ex: Grade de metal, manual, carregador, cabo HDMI..."
                    value={accessoriesInclusion}
                    onChange={(e) => setAccessoriesInclusion(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none"
                    id="input-accessories-inclusion"
                  />
                </div>
              </div>

              {/* Step 4: Technical observations */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4" id="rma-step-4">
                <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span className="w-6 h-6 bg-sky-500/10 text-sky-400 text-xs font-bold flex items-center justify-center rounded-lg">4</span>
                    Laudo Técnico & Observações
                  </h3>
                </div>
                
                {/* Editor Container */}
                <RichTextEditor
                  value={notes}
                  onChange={setNotes}
                  label="Observações e Parecer do Triador"
                  placeholder="Insira o laudo técnico completo, observações sobre o circuito, avarias, etc..."
                  minHeight="160px"
                  maxHeight="320px"
                  id="technical-notes-editor"
                />
              </div>
            </div>

            {/* Right Side Column: Photos & Submission (5 cols) */}
            <div className="lg:col-span-5 space-y-6">
              {/* Photo categories upload */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5" id="rma-step-photos">
                <div className="border-b border-slate-800 pb-3 flex justify-between items-center">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Clipboard className="text-sky-400 w-5 h-5" />
                    Arquivos de Mídia
                  </h3>
                  <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-950 rounded text-[10px] text-slate-400 font-mono border border-slate-850">
                    <span className="w-1.5 h-1.5 bg-sky-400 rounded-full"></span>
                    Ctrl+V Ativo
                  </div>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed">
                  Arraste arquivos de fotos para cada zona correspondente ou <strong>selecione um setor e aperte Ctrl+V</strong> com sua imagem copiada. As fotos serão comprimidas na hora.
                </p>

                {(() => {
                  const refProduct = products.find(p => p.id === selectedProductId);
                  const hasCatalogImages = !!(refProduct && ((refProduct.images && refProduct.images.length > 0) || refProduct.imageUrl));
                  
                  if (destinationSector === 'Principal' && selectedProductId) {
                    return (
                      <div className="p-3.5 bg-sky-500/10 border border-sky-500/20 rounded-xl text-xs space-y-2.5" id="catalog-images-import-panel">
                        <div className="flex items-center gap-1.5 font-bold text-sky-400">
                          <Zap className="w-4 h-4 text-sky-400 shrink-0" />
                          <span>Usar Imagens do Catálogo (Produto Novo)</span>
                        </div>
                        <p className="text-slate-400 text-[11px] leading-relaxed font-sans">
                          Como o destino é o <strong>Estoque Principal</strong>, você pode preencher as fotos automaticamente usando as imagens oficiais cadastradas no catálogo.
                        </p>
                        {hasCatalogImages ? (
                          <div className="flex flex-wrap gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                if (refProduct.imagesProduct && refProduct.imagesProduct.length > 0) {
                                  setPhotosProduct(refProduct.imagesProduct);
                                } else {
                                  const hasSeparated = !!(
                                    (refProduct.imagesProduct && refProduct.imagesProduct.length > 0) ||
                                    (refProduct.imagesBox && refProduct.imagesBox.length > 0) ||
                                    (refProduct.imagesAccessories && refProduct.imagesAccessories.length > 0)
                                  );
                                  if (!hasSeparated) {
                                    if (refProduct.images && refProduct.images.length > 0) {
                                      setPhotosProduct(refProduct.images);
                                    } else if (refProduct.imageUrl) {
                                      setPhotosProduct([refProduct.imageUrl]);
                                    }
                                  } else {
                                    setPhotosProduct([]);
                                  }
                                }
                              }}
                              className="px-2.5 py-1.5 bg-[#0b1321] hover:bg-[#101c30] border border-slate-800 hover:border-sky-500/50 rounded-lg text-slate-300 hover:text-white font-semibold transition-all cursor-pointer text-[11px]"
                            >
                              Copiar para Produto
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (refProduct.imagesBox && refProduct.imagesBox.length > 0) {
                                  setPhotosBox(refProduct.imagesBox);
                                } else {
                                  setPhotosBox([]);
                                }
                              }}
                              className="px-2.5 py-1.5 bg-[#0b1321] hover:bg-[#101c30] border border-slate-800 hover:border-sky-500/50 rounded-lg text-slate-300 hover:text-white font-semibold transition-all cursor-pointer text-[11px]"
                            >
                              Copiar para Caixa
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (refProduct.imagesAccessories && refProduct.imagesAccessories.length > 0) {
                                  setPhotosAccessories(refProduct.imagesAccessories);
                                } else {
                                  setPhotosAccessories([]);
                                }
                              }}
                              className="px-2.5 py-1.5 bg-[#0b1321] hover:bg-[#101c30] border border-slate-800 hover:border-sky-500/50 rounded-lg text-slate-300 hover:text-white font-semibold transition-all cursor-pointer text-[11px]"
                            >
                              Copiar para Acessórios
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                // Product
                                if (refProduct.imagesProduct && refProduct.imagesProduct.length > 0) {
                                  setPhotosProduct(refProduct.imagesProduct);
                                } else {
                                  const hasSeparated = !!(
                                    (refProduct.imagesProduct && refProduct.imagesProduct.length > 0) ||
                                    (refProduct.imagesBox && refProduct.imagesBox.length > 0) ||
                                    (refProduct.imagesAccessories && refProduct.imagesAccessories.length > 0)
                                  );
                                  if (!hasSeparated) {
                                    if (refProduct.images && refProduct.images.length > 0) {
                                      setPhotosProduct(refProduct.images);
                                    } else if (refProduct.imageUrl) {
                                      setPhotosProduct([refProduct.imageUrl]);
                                    }
                                  } else {
                                    setPhotosProduct([]);
                                  }
                                }

                                // Box
                                if (refProduct.imagesBox && refProduct.imagesBox.length > 0) {
                                  setPhotosBox(refProduct.imagesBox);
                                } else {
                                  setPhotosBox([]);
                                }

                                // Accessories
                                if (refProduct.imagesAccessories && refProduct.imagesAccessories.length > 0) {
                                  setPhotosAccessories(refProduct.imagesAccessories);
                                } else {
                                  setPhotosAccessories([]);
                                }
                              }}
                              className="px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-white rounded-lg font-bold transition-all cursor-pointer text-[11px] shadow-sm hover:shadow-md"
                            >
                              Copiar para Todos
                            </button>
                          </div>
                        ) : (
                          <p className="text-amber-500 text-[11px] font-semibold flex items-center gap-1 font-sans">
                            <AlertCircle className="w-3.5 h-3.5" />
                            O produto selecionado não possui imagens cadastradas no catálogo.
                          </p>
                        )}
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Upload Section Selector for Ctrl+V */}
                <div className="grid grid-cols-3 gap-1 p-1 bg-slate-950 border border-slate-855 rounded-xl text-center text-xs text-slate-400" id="ctrl-v-category-selector">
                  <button 
                    type="button" 
                    onClick={() => setActiveUploadCategory('product')}
                    className={`py-2 rounded-lg font-bold cursor-pointer transition-all ${activeUploadCategory === 'product' ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/10' : 'hover:bg-slate-850 hover:text-white text-slate-405'}`}
                  >
                    Produto
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setActiveUploadCategory('box')}
                    className={`py-2 rounded-lg font-bold cursor-pointer transition-all ${activeUploadCategory === 'box' ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/10' : 'hover:bg-slate-850 hover:text-white text-slate-405'}`}
                  >
                    Caixa
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setActiveUploadCategory('accessories')}
                    className={`py-2 rounded-lg font-bold cursor-pointer transition-all ${activeUploadCategory === 'accessories' ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/10' : 'hover:bg-slate-850 hover:text-white text-slate-405'}`}
                  >
                    Acessórios
                  </button>
                </div>

                {/* Category 1: Photos of Product */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-300 flex justify-between items-center">
                    <span>1. Fotos do Produto ({photosProduct.length})</span>
                    {activeUploadCategory === 'product' && <span className="text-[10px] text-sky-400 font-mono">[Ctrl+V Alvo]</span>}
                  </span>
                  
                  {/* Drop zone */}
                  <div 
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, 'product')}
                    onPaste={(e) => handleLocalPaste(e, 'product')}
                    onFocus={() => setActiveUploadCategory('product')}
                    tabIndex={0}
                    className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all outline-none ${
                      activeUploadCategory === 'product' ? 'border-sky-500 bg-sky-500/10 shadow-[0_0_15px_rgba(14,165,233,0.25)]' : 'border-slate-800 hover:border-slate-700 bg-slate-950 focus:border-sky-500/50'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.currentTarget.focus();
                      if (activeUploadCategory !== 'product') {
                        setActiveUploadCategory('product');
                      } else {
                        document.getElementById('file-upload-product')?.click();
                      }
                    }}
                  >
                    <Upload className="w-6 h-6 mx-auto text-slate-400 mb-2" />
                    <p className="text-[12px] text-slate-200 font-bold">
                      {activeUploadCategory === 'product' 
                        ? '👉 Área ativa! Pressione Ctrl+V para colar ou clique de novo para escolher arquivos' 
                        : 'Clique para selecionar e ativar colar (Ctrl+V)'}
                    </p>
                    <p className="text-[10px] text-slate-500 font-normal mt-1">Ou arraste fotos do produto diretamente aqui</p>
                    <input 
                      type="file" 
                      id="file-upload-product" 
                      multiple 
                      accept="image/*" 
                      onChange={(e) => handlePhotoUpload(e.target.files, 'product')} 
                      className="hidden" 
                    />
                  </div>

                  {/* Thumbnail gallery */}
                  {photosProduct.length > 0 && (
                    <div className="grid grid-cols-4 gap-2 pt-1">
                      {photosProduct.map((p, i) => (
                        <div key={i} className="relative w-full aspect-video rounded-lg border border-slate-800 overflow-hidden group">
                          <img src={p} className="w-full h-full object-cover" />
                          <button 
                            type="button" 
                            onClick={(e) => { e.stopPropagation(); handleRemovePhoto(i, 'product'); }}
                            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-rose-400 transition-opacity"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Category 2: Photos of Box */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-300 flex justify-between items-center">
                    <span>2. Fotos da Embalagem / Caixa ({photosBox.length})</span>
                    {activeUploadCategory === 'box' && <span className="text-[10px] text-sky-400 font-mono">[Ctrl+V Alvo]</span>}
                  </span>
                  
                  {/* Drop zone */}
                  <div 
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, 'box')}
                    onPaste={(e) => handleLocalPaste(e, 'box')}
                    onFocus={() => setActiveUploadCategory('box')}
                    tabIndex={0}
                    className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all outline-none ${
                      activeUploadCategory === 'box' ? 'border-sky-500 bg-sky-500/10 shadow-[0_0_15px_rgba(14,165,233,0.25)]' : 'border-slate-800 hover:border-slate-700 bg-slate-950 focus:border-sky-500/50'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.currentTarget.focus();
                      if (activeUploadCategory !== 'box') {
                        setActiveUploadCategory('box');
                      } else {
                        document.getElementById('file-upload-box')?.click();
                      }
                    }}
                  >
                    <Upload className="w-6 h-6 mx-auto text-slate-400 mb-2" />
                    <p className="text-[12px] text-slate-200 font-bold">
                      {activeUploadCategory === 'box' 
                        ? '👉 Área ativa! Pressione Ctrl+V para colar ou clique de novo para escolher arquivos' 
                        : 'Clique para selecionar e ativar colar (Ctrl+V)'}
                    </p>
                    <p className="text-[10px] text-slate-500 font-normal mt-1">Ou arraste fotos da caixa diretamente aqui</p>
                    <input 
                      type="file" 
                      id="file-upload-box" 
                      multiple 
                      accept="image/*" 
                      onChange={(e) => handlePhotoUpload(e.target.files, 'box')} 
                      className="hidden" 
                    />
                  </div>

                  {/* Thumbnail gallery */}
                  {photosBox.length > 0 && (
                    <div className="grid grid-cols-4 gap-2 pt-1">
                      {photosBox.map((p, i) => (
                        <div key={i} className="relative w-full aspect-video rounded-lg border border-slate-800 overflow-hidden group">
                          <img src={p} className="w-full h-full object-cover" />
                          <button 
                            type="button" 
                            onClick={(e) => { e.stopPropagation(); handleRemovePhoto(i, 'box'); }}
                            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-rose-400 transition-opacity"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Category 3: Photos of Accessories */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-300 flex justify-between items-center">
                    <span>3. Fotos dos Acessórios ({photosAccessories.length})</span>
                    {activeUploadCategory === 'accessories' && <span className="text-[10px] text-sky-400 font-mono">[Ctrl+V Alvo]</span>}
                  </span>
                  
                  {/* Drop zone */}
                  <div 
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, 'accessories')}
                    onPaste={(e) => handleLocalPaste(e, 'accessories')}
                    onFocus={() => setActiveUploadCategory('accessories')}
                    tabIndex={0}
                    className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all outline-none ${
                      activeUploadCategory === 'accessories' ? 'border-sky-500 bg-sky-500/10 shadow-[0_0_15px_rgba(14,165,233,0.25)]' : 'border-slate-800 hover:border-slate-700 bg-slate-950 focus:border-sky-500/50'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.currentTarget.focus();
                      if (activeUploadCategory !== 'accessories') {
                        setActiveUploadCategory('accessories');
                      } else {
                        document.getElementById('file-upload-accessories')?.click();
                      }
                    }}
                  >
                    <Upload className="w-6 h-6 mx-auto text-slate-400 mb-2" />
                    <p className="text-[12px] text-slate-200 font-bold">
                      {activeUploadCategory === 'accessories' 
                        ? '👉 Área ativa! Pressione Ctrl+V para colar ou clique de novo para escolher arquivos' 
                        : 'Clique para selecionar e ativar colar (Ctrl+V)'}
                    </p>
                    <p className="text-[10px] text-slate-500 font-normal mt-1">Ou arraste fotos dos acessórios diretamente aqui</p>
                    <input 
                      type="file" 
                      id="file-upload-accessories" 
                      multiple 
                      accept="image/*" 
                      onChange={(e) => handlePhotoUpload(e.target.files, 'accessories')} 
                      className="hidden" 
                    />
                  </div>

                  {/* Thumbnail gallery */}
                  {photosAccessories.length > 0 && (
                    <div className="grid grid-cols-4 gap-2 pt-1">
                      {photosAccessories.map((p, i) => (
                        <div key={i} className="relative w-full aspect-video rounded-lg border border-slate-800 overflow-hidden group">
                          <img src={p} className="w-full h-full object-cover" />
                          <button 
                            type="button" 
                            onClick={(e) => { e.stopPropagation(); handleRemovePhoto(i, 'accessories'); }}
                            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-rose-400 transition-opacity"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Form Buttons */}
                <div className="pt-4">
                  <button 
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3.5 bg-sky-500 hover:bg-sky-400 text-white rounded-xl text-sm font-bold shadow-lg shadow-sky-500/20 disabled:opacity-50 flex items-center justify-center gap-2 transition-all cursor-pointer"
                    id="btn-save-triage"
                  >
                    {isSubmitting ? (
                      <>
                        <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Gravando triagem...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        Finalizar e Salvar Triagem
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
