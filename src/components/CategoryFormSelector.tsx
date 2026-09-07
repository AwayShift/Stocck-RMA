/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Layers, 
  ChevronDown, 
  Check, 
  Zap, 
  Cpu, 
  Headphones, 
  Printer, 
  Smartphone, 
  ShieldCheck, 
  Wrench, 
  Package,
  Edit3
} from 'lucide-react';
import { 
  GENERAL_CATEGORIES, 
  resolveCategoryHierarchy, 
  GeneralCategoryDef 
} from '../utils/categoryTaxonomy';

interface CategoryFormSelectorProps {
  value: string;
  onChange: (category: string) => void;
  id?: string;
}

export const CategoryFormSelector: React.FC<CategoryFormSelectorProps> = ({
  value,
  onChange,
  id = 'select-product-category'
}) => {
  const initialHierarchy = resolveCategoryHierarchy(value);
  const [selectedGeneralId, setSelectedGeneralId] = useState<string>(initialHierarchy.general.id);
  const [isCustomMode, setIsCustomMode] = useState<boolean>(initialHierarchy.isCustom && !!value.trim());
  const [customValue, setCustomValue] = useState<string>(initialHierarchy.isCustom ? value : '');

  // Keep in sync if parent value changes externally (e.g. when opening edit modal for different product)
  useEffect(() => {
    const hierarchy = resolveCategoryHierarchy(value);
    setSelectedGeneralId(hierarchy.general.id);
    if (hierarchy.isCustom && value.trim()) {
      setIsCustomMode(true);
      setCustomValue(value);
    } else {
      setIsCustomMode(false);
    }
  }, [value]);

  const currentGeneral: GeneralCategoryDef = 
    GENERAL_CATEGORIES.find(g => g.id === selectedGeneralId) || GENERAL_CATEGORIES[0];

  const handleGeneralChange = (newGeneralId: string) => {
    setSelectedGeneralId(newGeneralId);
    setIsCustomMode(false);
    const gen = GENERAL_CATEGORIES.find(g => g.id === newGeneralId) || GENERAL_CATEGORIES[0];
    // Automatically select the first subcategory of the selected general category
    if (gen.subcategories.length > 0) {
      onChange(gen.subcategories[0].name);
    } else {
      onChange(gen.name);
    }
  };

  const handleSubcategoryChange = (newSubName: string) => {
    if (newSubName === '__custom__') {
      setIsCustomMode(true);
      setCustomValue('');
      return;
    }
    setIsCustomMode(false);
    onChange(newSubName);
  };

  const handleCustomSubmit = (customText: string) => {
    setCustomValue(customText);
    onChange(customText.trim() || 'Outros / Não Identificado');
  };

  // Icon selector helper
  const renderGeneralIcon = (iconName: string, className: string = 'w-4 h-4') => {
    switch (iconName) {
      case 'Zap': return <Zap className={className} />;
      case 'Cpu': return <Cpu className={className} />;
      case 'Headphones': return <Headphones className={className} />;
      case 'Printer': return <Printer className={className} />;
      case 'Smartphone': return <Smartphone className={className} />;
      case 'ShieldCheck': return <ShieldCheck className={className} />;
      case 'Wrench': return <Wrench className={className} />;
      default: return <Package className={className} />;
    }
  };

  // Determine current active subcategory
  const activeSubcategory = currentGeneral.subcategories.find(
    s => s.name.toLowerCase() === value.trim().toLowerCase()
  );

  return (
    <div className="space-y-2.5" id={id}>
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-sky-400" />
          <span>Categoria do Produto</span>
        </label>

        {/* Selected hierarchy preview badge */}
        {value.trim() && (
          <div className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700/80">
            <span className={`w-2 h-2 rounded-full ${currentGeneral.color.dot}`} />
            <span className="text-slate-400 font-medium">{currentGeneral.shortName}</span>
            <span className="text-slate-600">›</span>
            <span className="font-bold text-slate-200">
              {activeSubcategory ? activeSubcategory.shortLabel : value}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {/* 1. General Category Selector (Tipo de Produto) */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <span>1. Tipo Geral</span>
            <span className="text-sky-400 font-normal">(Macro-categoria)</span>
          </label>
          <div className="relative">
            <select
              value={selectedGeneralId}
              onChange={(e) => handleGeneralChange(e.target.value)}
              className="w-full pl-3 pr-8 py-2.5 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl text-xs font-bold text-slate-200 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all appearance-none cursor-pointer"
              id="select-general-category"
            >
              {GENERAL_CATEGORIES.map(gen => (
                <option key={gen.id} value={gen.id}>
                  {gen.name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {/* 2. Subcategory Selector */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <span>2. Subcategoria Específica</span>
          </label>
          {!isCustomMode ? (
            <div className="relative">
              <select
                value={activeSubcategory ? activeSubcategory.name : (value || currentGeneral.subcategories[0]?.name || '')}
                onChange={(e) => handleSubcategoryChange(e.target.value)}
                className="w-full pl-3 pr-8 py-2.5 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl text-xs font-semibold text-slate-200 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all appearance-none cursor-pointer"
                id="select-sub-category"
              >
                {currentGeneral.subcategories.map(sub => (
                  <option key={sub.id} value={sub.name}>
                    {sub.name}
                  </option>
                ))}
                <option value="__custom__">+ Outra / Personalizada...</option>
              </select>
              <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={customValue}
                onChange={(e) => handleCustomSubmit(e.target.value)}
                placeholder="Digitar subcategoria personalizada..."
                className="flex-1 px-3 py-2 bg-slate-950 border border-amber-500/50 rounded-xl text-xs text-amber-200 focus:outline-none focus:ring-1 focus:ring-amber-500 transition-all"
                autoFocus
              />
              <button
                type="button"
                onClick={() => {
                  setIsCustomMode(false);
                  if (currentGeneral.subcategories[0]) {
                    onChange(currentGeneral.subcategories[0].name);
                  }
                }}
                className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-[11px] font-bold border border-slate-700"
                title="Voltar para opções pré-definidas"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Subcategory description helper text */}
      {activeSubcategory?.description && !isCustomMode && (
        <p className="text-[11px] text-slate-500 flex items-center gap-1 pl-1">
          <span className="text-slate-400 font-semibold">Exemplos:</span>
          <span className="truncate">{activeSubcategory.description}</span>
        </p>
      )}
    </div>
  );
};
