/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
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
  Zap
} from 'lucide-react';
import { BaseProduct, TriageUnit, PlatformType, DeviceStatusType, PackageStatusType, DestinationSectorType } from '../types';
import { uploadFileToStorage } from '../lib/dbService';

interface RmaEntryProps {
  products: BaseProduct[];
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

export default function RmaEntry({ products, onSaveTriage, onNavigateToStock }: RmaEntryProps) {
  // Select Base Product state
  const [selectedProductId, setSelectedProductId] = useState('');
  
  // Fields of Entrance
  const [trackingCode, setTrackingCode] = useState('');
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

  // Quill rich-text observations HTML state
  const [notes, setNotes] = useState('');
  const quillContainerRef = useRef<HTMLDivElement>(null);
  const quillInstanceRef = useRef<any>(null);

  // Status messages
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dynamic Quill.js CDN loader
  useEffect(() => {
    let quillScript: HTMLScriptElement | null = null;
    let quillStyle: HTMLLinkElement | null = null;

    const initQuill = () => {
      if (quillContainerRef.current && (window as any).Quill && !quillInstanceRef.current) {
        // Clear previous toolbars and editor markup in the parent container to prevent duplication
        const parent = quillContainerRef.current.parentNode;
        if (parent) {
          const toolbars = parent.querySelectorAll('.ql-toolbar');
          toolbars.forEach(tb => tb.remove());
        }
        quillContainerRef.current.innerHTML = '';

        quillInstanceRef.current = new (window as any).Quill(quillContainerRef.current, {
          theme: 'snow',
          placeholder: 'Insira o laudo técnico completo, observações sobre o circuito, avarias, etc...',
          modules: {
            toolbar: [
              ['bold', 'italic', 'underline', 'strike'],
              [{ 'list': 'ordered'}, { 'list': 'bullet' }],
              ['clean']
            ]
          }
        });

        // Set initial state
        quillInstanceRef.current.root.innerHTML = notes;

        // Listen for changes
        quillInstanceRef.current.on('text-change', () => {
          setNotes(quillInstanceRef.current.root.innerHTML);
        });
      }
    };

    if (!(window as any).Quill) {
      // Load Quill css
      quillStyle = document.createElement('link');
      quillStyle.rel = 'stylesheet';
      quillStyle.href = 'https://cdn.jsdelivr.net/npm/quill@2.0.2/dist/quill.snow.css';
      document.head.appendChild(quillStyle);

      // Load Quill js
      quillScript = document.createElement('script');
      quillScript.src = 'https://cdn.jsdelivr.net/npm/quill@2.0.2/dist/quill.js';
      quillScript.async = true;
      quillScript.onload = () => {
        initQuill();
      };
      document.body.appendChild(quillScript);
    } else {
      initQuill();
    }

    return () => {
      // Component unmount logic
      if (quillInstanceRef.current) {
        quillInstanceRef.current = null;
      }
    };
  }, []);

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
      // Don't intercept paste if focused inside Quill editor
      const activeEl = document.activeElement;
      if (activeEl && activeEl.closest('.ql-editor')) {
        return;
      }
      await handleLocalPaste(e, activeCategoryRef.current);
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, []);

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!selectedProductId) {
      setErrorMessage('Por favor, selecione um produto de referência do Catálogo.');
      return;
    }
    const finalTrackingCode = trackingCode.trim() || `STI-${Math.floor(10000 + Math.random() * 90000)}`;

    const refProduct = products.find(p => p.id === selectedProductId);
    if (!refProduct) {
      setErrorMessage('Produto de referência inválido.');
      return;
    }

    setIsSubmitting(true);

    const newTriage: TriageUnit = {
      id: 'tr-' + Date.now(),
      trackingCode: finalTrackingCode,
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
      photosProduct,
      photosBox,
      photosAccessories,
      createdAt: new Date().toISOString(),
      status: 'Estoque'
    };

    try {
      await onSaveTriage(newTriage);
      setSuccessMessage('Triagem de Devolução gravada com sucesso no banco de dados!');
      
      // Reset form fields
      setSelectedProductId('');
      setCustomerReason('');
      setAccessoriesInclusion('Todos os acessórios inclusos.');
      setPhotosProduct([]);
      setPhotosBox([]);
      setPhotosAccessories([]);
      setNotes('');
      if (quillInstanceRef.current) {
        quillInstanceRef.current.root.innerHTML = '';
      }
      
      // Reset tracking code
      setTrackingCode('');

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
    setPlatform('Mercado Livre');
    setTrackingCode('STI-40912');
    setCustomerReason('O produto funcionou na primeira semana, mas parou de esquentar na segunda semana. Quero devolução.');
    setDeviceStatus('Usado');
    setPackageStatus('Danificada');
    setAccessoriesInclusion('Acompanha cabo, gaveta de fritar e divisória de silicone.');
    setDestinationSector('RMA');
    const technicalReport = `<h3>Relatório de Entrada de RMA:</h3><p>Equipamento recebido com marcas leves de gordura no cesto.</p><p><strong>Diagnóstico:</strong> Resistência aberta. Fusível térmico de proteção em curto-circuito devido a superaquecimento.</p><p><strong>Solução:</strong> Necessita troca de kit de aquecimento na oficina técnica.</p>`;
    setNotes(technicalReport);
    if (quillInstanceRef.current) {
      quillInstanceRef.current.root.innerHTML = technicalReport;
    }
  };

  return (
    <div className="space-y-6" id="rma-entry-container">
      {/* Header banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#161F30] border border-[#26354A] rounded-2xl p-6 shadow-xl" id="rma-header">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <FolderMinus className="text-indigo-400 w-6 h-6" />
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
          className="flex items-center gap-2 px-3 py-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-450 hover:text-sky-400 rounded-lg text-xs font-semibold border border-sky-500/20 disabled:opacity-50 transition-all cursor-pointer"
          title="Preenche o formulário com dados de exemplo realistas"
          id="btn-prefill-rma"
        >
          <Zap className="w-3.5 h-3.5 text-sky-400" />
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
              {/* Step 1: Base Identification */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4" id="rma-step-1">
                <h3 className="text-base font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                  <span className="w-6 h-6 bg-sky-500/10 text-sky-400 text-xs font-bold flex items-center justify-center rounded-lg">1</span>
                  Recepção e Origem do Pacote
                </h3>

                {/* SKU Reference Selection */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Selecionar Produto do Catálogo</label>
                  <select 
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-sky-500 transition-colors font-sans"
                    id="select-reference-product"
                  >
                    <option value="">-- Selecione o SKU / Nome do Produto --</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>
                        [{p.sku}] - {p.name} ({p.voltage})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

                   {/* Tracking / Case Code (Código STI) */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Código STI {destinationSector === 'Openbox' ? <span className="text-amber-500 font-bold">* (Obrigatório para Openbox)</span> : <span className="text-slate-500 font-normal">(Opcional)</span>}
                    </label>
                    <input 
                      type="text"
                      placeholder={destinationSector === 'Openbox' ? "Digite o Código STI (Obrigatório para Openbox)" : "Digite o Código STI (Opcional)"}
                      value={trackingCode}
                      onChange={(e) => setTrackingCode(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-sky-500 font-mono"
                      id="input-tracking-code"
                    />
                    <p className="text-[10px] text-slate-500">
                      {destinationSector === 'Openbox' 
                        ? 'O código STI é obrigatório para identificar unicamente o item no Openbox.' 
                        : 'Este código identifica o item, mas é opcional para RMA / Estoque Principal.'}
                    </p>
                  </div>
                </div>

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

              {/* Step 2: Analysis and State */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4" id="rma-step-2">
                <h3 className="text-base font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                  <span className="w-6 h-6 bg-sky-500/10 text-sky-400 text-xs font-bold flex items-center justify-center rounded-lg">2</span>
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

              {/* Step 3: Technical observations (Quill Rich text) */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4" id="rma-step-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                  <span className="w-6 h-6 bg-sky-500/10 text-sky-400 text-xs font-bold flex items-center justify-center rounded-lg">3</span>
                  Laudo Técnico & Observações
                </h3>
                
                {/* Note Rich-text container with explicit Quill instantiation */}
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex justify-between">
                    <span>Observações do Triador (Quill WYSIWYG)</span>
                    <span className="text-[10px] text-sky-400 font-normal">Nota técnica oficial de recebimento</span>
                  </label>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden text-slate-200" style={{ minHeight: '180px' }}>
                    <div ref={quillContainerRef} id="quill-editor" style={{ height: '140px', border: 'none' }} className="text-sm"></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Side Column: Photos & Decision (5 cols) */}
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
                <div className="grid grid-cols-3 gap-1 p-1 bg-slate-950 border border-slate-850 rounded-xl text-center text-xs text-slate-400" id="ctrl-v-category-selector">
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
              </div>

              {/* Step 4: Final Destination Decision */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4" id="rma-step-decision">
                <h3 className="text-base font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                  <span className="w-6 h-6 bg-sky-500/10 text-sky-400 text-xs font-bold flex items-center justify-center rounded-lg">4</span>
                  Decisão de Direcionamento Final
                </h3>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Setor de Destino</label>
                  <select 
                    value={destinationSector}
                    onChange={(e) => setDestinationSector(e.target.value as DestinationSectorType)}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm font-bold focus:outline-none"
                    style={{
                      color: destinationSector === 'Principal' ? '#10B981' : destinationSector === 'Openbox' ? '#F59E0B' : '#EF4444'
                    }}
                    id="select-destination-sector"
                  >
                    <option value="Principal" style={{ color: '#10B981', backgroundColor: '#0f172a' }}>
                      🟢 Estoque Principal (Perfeito estado, volta para venda como novo)
                    </option>
                    <option value="Openbox" style={{ color: '#F59E0B', backgroundColor: '#0f172a' }}>
                      🟠 Openbox (Caixa aberta/danificada ou pequenas marcas, funcional)
                    </option>
                    <option value="RMA" style={{ color: '#EF4444', backgroundColor: '#0f172a' }}>
                      🔴 RMA (Produto com defeito técnico real)
                    </option>
                  </select>
                </div>

                <div className="bg-slate-950 p-3.5 border border-slate-850 rounded-xl text-xs text-slate-450 leading-relaxed">
                  {destinationSector === 'Principal' && (
                    <span><strong>Estoque Principal:</strong> O produto será registrado como disponível no catálogo de novos. Requer que o estado do aparelho seja Novo e com embalagem Perfeita.</span>
                  )}
                  {destinationSector === 'Openbox' && (
                    <span><strong>Openbox:</strong> O produto será disponibilizado em estoque especial para venda promocional de outlet devido a pequenas avarias estéticas ou caixa aberta.</span>
                  )}
                  {destinationSector === 'RMA' && (
                    <span><strong>RMA:</strong> Encaminhado para a fila técnica de reparo. O produto aguardará diagnóstico avançado e troca de componentes na oficina.</span>
                  )}
                </div>

                {/* Form Buttons */}
                <div className="flex gap-3 pt-4 justify-end">
                  <button 
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3 bg-sky-500 hover:bg-sky-400 text-white rounded-xl text-sm font-bold shadow-lg shadow-sky-500/20 disabled:opacity-50 flex items-center justify-center gap-2 transition-all cursor-pointer"
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
