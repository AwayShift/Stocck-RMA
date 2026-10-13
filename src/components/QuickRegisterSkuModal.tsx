/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Save, 
  CheckCircle2, 
  AlertTriangle, 
  Tag, 
  Boxes, 
  Layers, 
  Sparkles 
} from 'lucide-react';
import { TriageUnit, BaseProduct } from '../types';
import { saveBaseProduct } from '../lib/dbService';
import { CategoryFormSelector } from './CategoryFormSelector';

interface QuickRegisterSkuModalProps {
  isOpen: boolean;
  onClose: () => void;
  unit: TriageUnit | null;
  units: TriageUnit[];
  products: BaseProduct[];
  onUpdateUnit: (unit: TriageUnit) => Promise<void>;
  onProductCreated?: (product: BaseProduct) => void;
  isLight?: boolean;
}

export default function QuickRegisterSkuModal({
  isOpen,
  onClose,
  unit,
  units,
  products,
  onUpdateUnit,
  onProductCreated,
  isLight = false
}: QuickRegisterSkuModalProps) {
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [voltage, setVoltage] = useState<'110V' | '220V' | 'Bivolt' | 'N/A'>('Bivolt');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('Geral');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (unit && isOpen) {
      const cleanSku = (unit.baseProductSku || (unit as any).sku || '').trim().toUpperCase();
      setSku(cleanSku);

      // Clean default provisional text from name
      let cleanName = (unit.baseProductName || '').trim();
      cleanName = cleanName
        .replace(/\s*\((Cadastro|Aguardando Cadastro)\s*Pendente\)/gi, '')
        .replace(/\s*\(Cadastro Pendente\)/gi, '')
        .replace(/\s*\(Aguardando Cadastro\)/gi, '')
        .trim();
      setName(cleanName || cleanSku);

      setVoltage((unit.baseProductVoltage as any) || 'Bivolt');
      setBrand('');
      setCategory('Geral');
      setDescription('');
      
      const photo = (unit.photosProduct && unit.photosProduct.length > 0) 
        ? unit.photosProduct[0] 
        : (unit.photosBox && unit.photosBox.length > 0) 
          ? unit.photosBox[0] 
          : '';
      setImageUrl(photo);
      setErrorMessage('');
      setSuccessMessage('');
    }
  }, [unit, isOpen]);

  if (!isOpen || !unit) return null;

  const targetSkuClean = sku.trim().toUpperCase();
  const matchingUnits = units.filter(
    u => u.baseProductSku && u.baseProductSku.trim().toUpperCase() === targetSkuClean
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!sku.trim()) {
      setErrorMessage('O SKU é obrigatório.');
      return;
    }
    if (!name.trim()) {
      setErrorMessage('O Nome do produto é obrigatório.');
      return;
    }

    // Check if SKU already exists in catalog
    const existing = products.find(p => p.sku.trim().toUpperCase() === targetSkuClean);
    if (existing) {
      setErrorMessage(`O SKU "${targetSkuClean}" já está cadastrado no Catálogo (${existing.name}). Se deseja vincular, basta associar diretamente.`);
      return;
    }

    setIsSubmitting(true);

    try {
      const newProduct: BaseProduct = {
        id: `bp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        sku: targetSkuClean,
        name: name.trim(),
        voltage: voltage,
        brand: brand.trim() || undefined,
        category: category.trim() || 'Geral',
        description: description.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
        images: imageUrl.trim() ? [imageUrl.trim()] : [],
        createdAt: new Date().toISOString()
      };

      const savedProduct = await saveBaseProduct(newProduct);
      if (onProductCreated) {
        onProductCreated(savedProduct);
      }

      // Update all triage units in stock with this SKU to link to the new registered product
      let updatedCount = 0;
      for (const u of matchingUnits) {
        const updated: TriageUnit = {
          ...u,
          baseProductId: savedProduct.id,
          baseProductName: savedProduct.name,
          baseProductSku: savedProduct.sku,
          baseProductVoltage: savedProduct.voltage,
          needsSkuRegistration: false,
          skuRegistrationPending: false
        };
        await onUpdateUnit(updated);
        updatedCount++;
      }

      setSuccessMessage(`SKU "${savedProduct.sku}" cadastrado com sucesso! ${updatedCount} pedido(s)/unidade(s) vinculados no estoque.`);

      setTimeout(() => {
        onClose();
      }, 1500);

    } catch (err: any) {
      console.error('Error quick registering SKU:', err);
      setErrorMessage(err?.message || 'Falha ao cadastrar o SKU no Catálogo Base.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div 
        className={`w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col border ${
          isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`p-4 sm:p-5 border-b flex items-center justify-between ${
          isLight 
            ? 'bg-gradient-to-r from-amber-100 to-amber-50 border-amber-300' 
            : 'bg-gradient-to-r from-amber-950/60 to-slate-900 border-amber-500/30'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
              isLight ? 'bg-amber-200 text-amber-900 border-amber-400' : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
            }`}>
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h3 className={`text-sm sm:text-base ${isLight ? 'text-amber-950 font-black' : 'text-white font-bold'} flex items-center gap-2`}>
                <span>Cadastrar SKU no Catálogo Base</span>
              </h3>
              <p className={`text-[11px] ${isLight ? 'text-amber-900/90 font-medium' : 'text-amber-200/80'}`}>
                Oficializar o SKU para este e outros pedidos com o mesmo código
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isLight ? 'text-slate-600 hover:text-slate-900 hover:bg-amber-200/60' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {errorMessage && (
            <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Info Card */}
          <div className={`p-3 rounded-xl text-xs space-y-1.5 border ${
            isLight ? 'bg-amber-50/80 border-amber-300 text-slate-800' : 'bg-slate-950/80 border-slate-800'
          }`}>
            <div className="flex items-center justify-between">
              <span className={isLight ? 'text-slate-600 font-medium' : 'text-slate-400'}>Origem:</span>
              <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                {unit.orderNumber ? `Pedido #${unit.orderNumber}` : `RMA ${unit.trackingCode || unit.id}`}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className={isLight ? 'text-slate-600 font-medium' : 'text-slate-400'}>Unidades a serem vinculadas:</span>
              <span className={`font-mono ${isLight ? 'text-amber-950 font-black' : 'text-amber-400 font-bold'}`}>
                {matchingUnits.length} unidade(s)
              </span>
            </div>
            <p className={`text-[10px] pt-1 border-t ${
              isLight ? 'text-slate-600 border-amber-200' : 'text-slate-500 border-slate-800/80'
            }`}>
              Ao cadastrar este produto, todas as unidades no estoque com o SKU <strong className={isLight ? 'text-amber-950 font-black' : 'text-amber-300'}>{targetSkuClean}</strong> perderão o status de pendência de SKU e ficarão integradas ao catálogo.
            </p>
          </div>

          {/* Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={`text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                isLight ? 'text-slate-700' : 'text-slate-300'
              }`}>
                <span>SKU</span>
                <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={sku}
                onChange={(e) => setSku(e.target.value.toUpperCase())}
                placeholder="Ex: SKU-AIR-FRY"
                className={`w-full px-3 py-2 rounded-lg text-xs font-mono font-bold placeholder-slate-400 focus:outline-none transition-all ${
                  isLight
                    ? 'bg-white border-2 border-amber-500 text-slate-900 focus:border-amber-600 focus:ring-1 focus:ring-amber-500/20 shadow-xs'
                    : 'bg-slate-950 border border-amber-500/50 text-amber-200 placeholder-slate-500 focus:border-amber-400'
                }`}
              />
            </div>

            <div className="space-y-1">
              <label className={`text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                isLight ? 'text-slate-700' : 'text-slate-300'
              }`}>
                <span>Voltagem</span>
                <span className="text-sky-500">*</span>
              </label>
              <select
                value={voltage}
                onChange={(e) => setVoltage(e.target.value as any)}
                className={`w-full px-3 py-2 rounded-lg text-xs focus:outline-none transition-all ${
                  isLight
                    ? 'bg-white border border-slate-300 text-slate-900 focus:border-sky-500 shadow-xs font-medium'
                    : 'bg-slate-950 border border-slate-700 text-white focus:border-sky-500'
                }`}
              >
                <option value="Bivolt">Bivolt</option>
                <option value="110V">110V</option>
                <option value="220V">220V</option>
                <option value="N/A">N/A</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className={`text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 ${
              isLight ? 'text-slate-700' : 'text-slate-300'
            }`}>
              <span>Nome Completo do Produto</span>
              <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Fritadeira Elétrica Digital Touch 4.5L"
              className={`w-full px-3 py-2 rounded-lg text-xs placeholder-slate-400 focus:outline-none transition-all ${
                isLight
                  ? 'bg-white border border-slate-300 text-slate-900 focus:border-sky-500 shadow-xs'
                  : 'bg-slate-950 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-sky-500'
              }`}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={`text-[11px] font-bold uppercase tracking-wider ${
                isLight ? 'text-slate-700' : 'text-slate-300'
              }`}>
                <span>Marca (Opcional)</span>
              </label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Ex: Mondial, Philips..."
                className={`w-full px-3 py-2 rounded-lg text-xs placeholder-slate-400 focus:outline-none transition-all ${
                  isLight
                    ? 'bg-white border border-slate-300 text-slate-900 focus:border-sky-500 shadow-xs'
                    : 'bg-slate-950 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-sky-500'
                }`}
              />
            </div>

            <div className="space-y-1">
              <label className={`text-[11px] font-bold uppercase tracking-wider ${
                isLight ? 'text-slate-700' : 'text-slate-300'
              }`}>
                <span>Categoria</span>
              </label>
              <CategoryFormSelector
                value={category}
                onChange={(val) => setCategory(val)}
                isLight={isLight}
              />
            </div>
          </div>

          {/* Optional Image */}
          {imageUrl && (
            <div className="space-y-1">
              <label className={`text-[11px] font-bold uppercase tracking-wider ${
                isLight ? 'text-slate-700' : 'text-slate-300'
              }`}>
                <span>Foto Vinculada (Foto da Triagem)</span>
              </label>
              <div className={`flex items-center gap-3 p-2 rounded-xl border ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
              }`}>
                <img 
                  src={imageUrl} 
                  alt="Pré-visualização" 
                  className={`w-12 h-12 rounded-lg object-cover border ${
                    isLight ? 'border-slate-300 bg-white' : 'border-slate-700 bg-slate-900'
                  }`} 
                />
                <div className={`text-[11px] flex-1 truncate ${
                  isLight ? 'text-slate-600' : 'text-slate-400'
                }`}>
                  <span>A foto capturada durante a triagem será usada como imagem oficial do produto.</span>
                </div>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className={`pt-3 border-t flex items-center justify-end gap-2.5 ${
            isLight ? 'border-slate-200' : 'border-slate-800'
          }`}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className={`px-4 py-2 font-bold text-xs rounded-xl transition-colors cursor-pointer ${
                isLight 
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300' 
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-5 py-2 disabled:opacity-50 text-slate-950 text-xs rounded-xl flex items-center gap-2 transition-all cursor-pointer shadow-md ${
                isLight 
                  ? 'bg-amber-500 hover:bg-amber-600 font-black shadow-amber-500/20 border border-amber-400' 
                  : 'bg-amber-500 hover:bg-amber-400 font-bold shadow-amber-500/20'
              }`}
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
                  <span>Cadastrando...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Salvar no Catálogo & Vincular</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
