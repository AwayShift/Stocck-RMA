import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, ShoppingBag, Sparkles, Store, Package, Layers } from 'lucide-react';
import { PlatformType } from '../types';

export interface PlatformConfig {
  id: PlatformType | 'Outro' | string;
  name: string;
  shortCode: string;
  tagline: string;
  badgeBg: string;
  badgeText: string;
  triggerStyleDark: string;
  triggerStyleLight: string;
  optionHoverDark: string;
  optionHoverLight: string;
  optionActiveDark: string;
  optionActiveLight: string;
  dotBg: string;
}

export const PLATFORM_CONFIGS: Record<string, PlatformConfig> = {
  'Mercado Livre': {
    id: 'Mercado Livre',
    name: 'Mercado Livre',
    shortCode: 'ML',
    tagline: 'Marketplace Mercado Livre',
    badgeBg: 'bg-amber-400',
    badgeText: 'text-slate-950',
    triggerStyleDark: 'bg-amber-500/10 border-amber-500/50 text-amber-300 shadow-sm shadow-amber-500/10',
    triggerStyleLight: 'bg-amber-50/90 border-amber-400 text-amber-900 shadow-sm shadow-amber-500/10',
    optionHoverDark: 'hover:bg-amber-500/15 hover:border-amber-500/40',
    optionHoverLight: 'hover:bg-amber-50 hover:border-amber-300',
    optionActiveDark: 'bg-amber-500/20 border-amber-500/60 text-amber-200 font-bold',
    optionActiveLight: 'bg-amber-100/90 border-amber-500 text-amber-950 font-bold',
    dotBg: 'bg-amber-400',
  },
  'Shopee': {
    id: 'Shopee',
    name: 'Shopee',
    shortCode: 'SH',
    tagline: 'Shopee Marketplace',
    badgeBg: 'bg-orange-500',
    badgeText: 'text-white',
    triggerStyleDark: 'bg-orange-500/10 border-orange-500/50 text-orange-300 shadow-sm shadow-orange-500/10',
    triggerStyleLight: 'bg-orange-50/90 border-orange-400 text-orange-900 shadow-sm shadow-orange-500/10',
    optionHoverDark: 'hover:bg-orange-500/15 hover:border-orange-500/40',
    optionHoverLight: 'hover:bg-orange-50 hover:border-orange-300',
    optionActiveDark: 'bg-orange-500/20 border-orange-500/60 text-orange-200 font-bold',
    optionActiveLight: 'bg-orange-100/90 border-orange-500 text-orange-950 font-bold',
    dotBg: 'bg-orange-500',
  },
  'Amazon': {
    id: 'Amazon',
    name: 'Amazon',
    shortCode: 'AZ',
    tagline: 'Amazon Vendas Gerais',
    badgeBg: 'bg-sky-600',
    badgeText: 'text-white',
    triggerStyleDark: 'bg-sky-500/10 border-sky-500/50 text-sky-300 shadow-sm shadow-sky-500/10',
    triggerStyleLight: 'bg-sky-50/90 border-sky-400 text-sky-900 shadow-sm shadow-sky-500/10',
    optionHoverDark: 'hover:bg-sky-500/15 hover:border-sky-500/40',
    optionHoverLight: 'hover:bg-sky-50 hover:border-sky-300',
    optionActiveDark: 'bg-sky-500/20 border-sky-500/60 text-sky-200 font-bold',
    optionActiveLight: 'bg-sky-100/90 border-sky-500 text-sky-950 font-bold',
    dotBg: 'bg-sky-500',
  },
  'Amazon Ta Novo': {
    id: 'Amazon Ta Novo',
    name: 'Amazon Ta Novo',
    shortCode: 'TÁ NOVO',
    tagline: 'Amazon Recondicionados / Quase Novo',
    badgeBg: 'bg-emerald-500',
    badgeText: 'text-slate-950',
    triggerStyleDark: 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 shadow-sm shadow-emerald-500/10',
    triggerStyleLight: 'bg-emerald-50/90 border-emerald-400 text-emerald-900 shadow-sm shadow-emerald-500/10',
    optionHoverDark: 'hover:bg-emerald-500/15 hover:border-emerald-500/40',
    optionHoverLight: 'hover:bg-emerald-50 hover:border-emerald-300',
    optionActiveDark: 'bg-emerald-500/25 border-emerald-500/70 text-emerald-200 font-bold',
    optionActiveLight: 'bg-emerald-100/90 border-emerald-500 text-emerald-950 font-bold',
    dotBg: 'bg-emerald-400',
  },
  'Kabum': {
    id: 'Kabum',
    name: 'Kabum',
    shortCode: 'KB',
    tagline: 'KaBuM! E-commerce & Hardware',
    badgeBg: 'bg-indigo-600',
    badgeText: 'text-white',
    triggerStyleDark: 'bg-indigo-500/10 border-indigo-500/50 text-indigo-300 shadow-sm shadow-indigo-500/10',
    triggerStyleLight: 'bg-indigo-50/90 border-indigo-400 text-indigo-900 shadow-sm shadow-indigo-500/10',
    optionHoverDark: 'hover:bg-indigo-500/15 hover:border-indigo-500/40',
    optionHoverLight: 'hover:bg-indigo-50 hover:border-indigo-300',
    optionActiveDark: 'bg-indigo-500/20 border-indigo-500/60 text-indigo-200 font-bold',
    optionActiveLight: 'bg-indigo-100/90 border-indigo-500 text-indigo-950 font-bold',
    dotBg: 'bg-indigo-500',
  },
  'Outro': {
    id: 'Outro',
    name: 'Outro',
    shortCode: 'OUT',
    tagline: 'Outro canal ou plataforma',
    badgeBg: 'bg-slate-700',
    badgeText: 'text-slate-200',
    triggerStyleDark: 'bg-slate-900 border-slate-700 text-slate-300',
    triggerStyleLight: 'bg-slate-100 border-slate-300 text-slate-800',
    optionHoverDark: 'hover:bg-slate-800 hover:border-slate-700',
    optionHoverLight: 'hover:bg-slate-100 hover:border-slate-300',
    optionActiveDark: 'bg-slate-800 border-slate-600 text-slate-100 font-bold',
    optionActiveLight: 'bg-slate-200 border-slate-400 text-slate-900 font-bold',
    dotBg: 'bg-slate-500',
  }
};

const DEFAULT_PLATFORMS: PlatformType[] = [
  'Mercado Livre',
  'Shopee',
  'Amazon',
  'Amazon Ta Novo',
  'Kabum'
];

interface PlatformSelectorProps {
  value: PlatformType | 'Outro' | string;
  onChange: (platform: any) => void;
  id?: string;
  className?: string;
  disabled?: boolean;
  platforms?: (PlatformType | 'Outro' | string)[];
}

export const PlatformSelector: React.FC<PlatformSelectorProps> = ({
  value,
  onChange,
  id = 'select-platform-origin',
  className = '',
  disabled = false,
  platforms = DEFAULT_PLATFORMS,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentConfig = PLATFORM_CONFIGS[value] || {
    id: value,
    name: value,
    shortCode: value.substring(0, 2).toUpperCase(),
    tagline: 'Plataforma selecionada',
    badgeBg: 'bg-slate-800',
    badgeText: 'text-slate-200',
    triggerStyleDark: 'bg-slate-950 border-slate-800 text-slate-200',
    triggerStyleLight: 'bg-white border-slate-300 text-slate-800',
    optionHoverDark: 'hover:bg-slate-800',
    optionHoverLight: 'hover:bg-slate-100',
    optionActiveDark: 'bg-slate-800 border-slate-600 text-white',
    optionActiveLight: 'bg-slate-200 border-slate-400 text-slate-950',
    dotBg: 'bg-sky-500',
  };

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setIsOpen(prev => !prev);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        const currentIndex = platforms.indexOf(value);
        const nextIndex = (currentIndex + 1) % platforms.length;
        onChange(platforms[nextIndex]);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        const currentIndex = platforms.indexOf(value);
        const prevIndex = (currentIndex - 1 + platforms.length) % platforms.length;
        onChange(platforms[prevIndex]);
      }
    }
  };

  return (
    <div 
      ref={containerRef} 
      className={`relative platform-selector-container ${className}`}
      onKeyDown={handleKeyDown}
    >
      {/* Hidden native select for accessibility and automated selectors */}
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      >
        {platforms.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>

      {/* Styled Interactive Trigger */}
      <button
        type="button"
        id={`${id}-trigger`}
        data-platform={value}
        disabled={disabled}
        onClick={() => setIsOpen(prev => !prev)}
        className={`w-full px-2.5 py-1.5 sm:py-2 rounded-lg text-xs font-semibold border flex items-center justify-between gap-2 transition-all cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-sky-500/40 ${
          isOpen ? 'ring-2 ring-sky-500/50 border-sky-500' : ''
        } ${currentConfig.triggerStyleDark} platform-trigger-btn`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2 min-w-0">
          {/* Badge Icon / Tag */}
          <span 
            className={`px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider shrink-0 ${currentConfig.badgeBg} ${currentConfig.badgeText} shadow-xs`}
          >
            {currentConfig.shortCode}
          </span>
          <span className="font-bold truncate text-left">
            {currentConfig.name}
          </span>
        </div>

        <ChevronDown 
          className={`w-4 h-4 shrink-0 opacity-70 transition-transform duration-200 ${
            isOpen ? 'rotate-180 opacity-100' : ''
          }`} 
        />
      </button>

      {/* Dropdown Options Menu */}
      {isOpen && (
        <div 
          className="absolute top-full left-0 mt-1.5 w-full min-w-[260px] bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150 platform-dropdown-menu backdrop-blur-md"
          role="listbox"
          id={`${id}-dropdown`}
        >
          <div className="px-2.5 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800/80 mb-1 flex items-center justify-between">
            <span>Selecionar Plataforma</span>
            <span className="text-[9px] text-slate-400 font-mono">({platforms.length} canais)</span>
          </div>

          <div className="space-y-1">
            {platforms.map((p) => {
              const cfg = PLATFORM_CONFIGS[p] || {
                id: p,
                name: p,
                shortCode: p.substring(0, 2).toUpperCase(),
                tagline: 'Canal de venda',
                badgeBg: 'bg-slate-700',
                badgeText: 'text-slate-200',
                triggerStyleDark: '',
                triggerStyleLight: '',
                optionHoverDark: 'hover:bg-slate-800',
                optionHoverLight: 'hover:bg-slate-100',
                optionActiveDark: 'bg-slate-800 border-slate-600 text-white',
                optionActiveLight: 'bg-slate-200 border-slate-400 text-slate-900',
                dotBg: 'bg-slate-400',
              };

              const isSelected = value === p;

              return (
                <button
                  key={p}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(p);
                    setIsOpen(false);
                  }}
                  className={`w-full p-2 rounded-lg border text-left flex items-center justify-between gap-2.5 transition-all cursor-pointer group platform-option-item ${
                    isSelected 
                      ? `${cfg.optionActiveDark} border` 
                      : `border-transparent ${cfg.optionHoverDark} text-slate-300 hover:text-white`
                  }`}
                  data-platform={p}
                  id={`platform-option-${p.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* Visual Brand Badge */}
                    <span 
                      className={`w-8 h-6 rounded flex items-center justify-center text-[10px] font-black uppercase tracking-wider shrink-0 transition-transform group-hover:scale-105 shadow-sm ${cfg.badgeBg} ${cfg.badgeText}`}
                    >
                      {cfg.shortCode}
                    </span>

                    <div className="min-w-0 flex flex-col">
                      <span className={`text-xs font-bold truncate ${isSelected ? 'text-white' : 'text-slate-200'}`}>
                        {cfg.name}
                      </span>
                      <span className="text-[10px] text-slate-400 truncate font-normal">
                        {cfg.tagline}
                      </span>
                    </div>
                  </div>

                  {/* Active Indicator Checkmark */}
                  {isSelected ? (
                    <div className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0 border border-sky-500/40">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                  ) : (
                    <div className={`w-2 h-2 rounded-full ${cfg.dotBg} opacity-30 group-hover:opacity-100 transition-opacity shrink-0`} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
