/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 * 
 * filterColorHelpers.ts
 * Utilitários padronizados para representação de cores de Plataformas e Setores de Estoque nos filtros do sistema.
 */

import { PlatformType, DestinationSectorType } from '../types';

export interface FilterBadgeStyle {
  badgeClasses: string;
  dotClasses: string;
  hoverBtnClasses: string;
  selectClasses: string;
  ringClasses: string;
  label: string;
}

/**
 * Retorna estilos visuais completos para a plataforma nos filtros
 */
export function getPlatformFilterStyle(platform: PlatformType | string | null | undefined): FilterBadgeStyle {
  if (!platform || platform === 'Todas') {
    return {
      badgeClasses: 'bg-slate-800/60 border-slate-700 text-slate-300',
      dotClasses: 'bg-slate-400',
      hoverBtnClasses: 'hover:text-white',
      selectClasses: 'border-slate-800 text-slate-200',
      ringClasses: 'ring-slate-700 border-slate-700',
      label: 'Todas'
    };
  }

  const normalized = platform.trim();

  switch (normalized) {
    case 'Mercado Livre':
      return {
        badgeClasses: 'bg-yellow-400/15 border-yellow-400/50 text-yellow-300 font-bold shadow-xs',
        dotClasses: 'bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.6)]',
        hoverBtnClasses: 'hover:text-yellow-200 hover:bg-yellow-400/20',
        selectClasses: 'border-yellow-400/60 bg-yellow-400/15 text-yellow-300 font-bold',
        ringClasses: 'border-yellow-400 ring-2 ring-yellow-400/50',
        label: 'Mercado Livre'
      };
    case 'Shopee':
      return {
        badgeClasses: 'bg-orange-500/15 border-orange-500/50 text-orange-400 font-bold shadow-xs',
        dotClasses: 'bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.6)]',
        hoverBtnClasses: 'hover:text-orange-200 hover:bg-orange-500/20',
        selectClasses: 'border-orange-500/60 bg-orange-500/15 text-orange-400 font-bold',
        ringClasses: 'border-orange-500 ring-2 ring-orange-500/40',
        label: 'Shopee'
      };
    case 'Amazon':
      return {
        badgeClasses: 'bg-sky-500/15 border-sky-500/50 text-sky-800 dark:text-sky-200 font-bold',
        dotClasses: 'bg-sky-400',
        hoverBtnClasses: 'hover:text-sky-950 dark:hover:text-sky-100 hover:bg-sky-500/20',
        selectClasses: 'border-sky-500/60 bg-sky-50 dark:bg-sky-950/25 text-sky-900 dark:text-sky-300 font-bold',
        ringClasses: 'border-sky-500 ring-2 ring-sky-500/40',
        label: 'Amazon'
      };
    case 'Amazon Ta Novo':
      return {
        badgeClasses: 'bg-emerald-500/15 border-emerald-500/50 text-emerald-800 dark:text-emerald-200 font-bold',
        dotClasses: 'bg-emerald-400',
        hoverBtnClasses: 'hover:text-emerald-950 dark:hover:text-emerald-100 hover:bg-emerald-500/20',
        selectClasses: 'border-emerald-500/60 bg-emerald-50 dark:bg-emerald-950/25 text-emerald-900 dark:text-emerald-300 font-bold',
        ringClasses: 'border-emerald-500 ring-2 ring-emerald-500/40',
        label: 'Amazon Ta Novo'
      };
    case 'Kabum':
      return {
        badgeClasses: 'bg-indigo-500/15 border-indigo-500/50 text-indigo-800 dark:text-indigo-200 font-bold',
        dotClasses: 'bg-indigo-400',
        hoverBtnClasses: 'hover:text-indigo-950 dark:hover:text-indigo-100 hover:bg-indigo-500/20',
        selectClasses: 'border-indigo-500/60 bg-indigo-50 dark:bg-indigo-950/25 text-indigo-900 dark:text-indigo-300 font-bold',
        ringClasses: 'border-indigo-500 ring-2 ring-indigo-500/40',
        label: 'Kabum'
      };
    case 'Sem Plataforma':
      return {
        badgeClasses: 'bg-purple-500/15 border-purple-500/50 text-purple-800 dark:text-purple-200 font-bold',
        dotClasses: 'bg-purple-400',
        hoverBtnClasses: 'hover:text-purple-950 dark:hover:text-purple-100 hover:bg-purple-500/20',
        selectClasses: 'border-purple-500/60 bg-purple-50 dark:bg-purple-950/25 text-purple-900 dark:text-purple-300 font-bold',
        ringClasses: 'border-purple-500 ring-2 ring-purple-500/40',
        label: 'Sem Plataforma'
      };
    default:
      return {
        badgeClasses: 'bg-purple-500/15 border-purple-500/50 text-purple-300 dark:text-purple-200',
        dotClasses: 'bg-purple-400',
        hoverBtnClasses: 'hover:text-purple-100 hover:bg-purple-500/20',
        selectClasses: 'border-purple-500/60 bg-purple-950/25 text-purple-300',
        ringClasses: 'border-purple-500 ring-2 ring-purple-500/40',
        label: normalized
      };
  }
}

/**
 * Retorna estilos visuais completos para o setor de estoque nos filtros
 */
export function getSectorFilterStyle(sector: DestinationSectorType | 'Baixado' | string | null | undefined): FilterBadgeStyle {
  if (!sector || sector === 'Todos') {
    return {
      badgeClasses: 'bg-slate-800/60 border-slate-700 text-slate-300',
      dotClasses: 'bg-slate-400',
      hoverBtnClasses: 'hover:text-white',
      selectClasses: 'border-slate-800 text-slate-200',
      ringClasses: 'ring-slate-700 border-slate-700',
      label: 'Todos os Estoques'
    };
  }

  const normalized = sector.trim();

  switch (normalized) {
    case 'Principal':
      return {
        badgeClasses: 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 dark:text-emerald-200',
        dotClasses: 'bg-emerald-400',
        hoverBtnClasses: 'hover:text-emerald-100 hover:bg-emerald-500/20',
        selectClasses: 'border-emerald-500/60 bg-emerald-950/25 text-emerald-300',
        ringClasses: 'border-emerald-500 ring-2 ring-emerald-500/40',
        label: 'Estoque Principal'
      };
    case 'Openbox':
      return {
        badgeClasses: 'bg-amber-500/15 border-amber-500/50 text-amber-300 dark:text-amber-200',
        dotClasses: 'bg-amber-400',
        hoverBtnClasses: 'hover:text-amber-100 hover:bg-amber-500/20',
        selectClasses: 'border-amber-500/60 bg-amber-950/25 text-amber-300',
        ringClasses: 'border-amber-500 ring-2 ring-amber-500/40',
        label: 'Setor Openbox'
      };
    case 'RMA':
      return {
        badgeClasses: 'bg-rose-500/15 border-rose-500/50 text-rose-300 dark:text-rose-200',
        dotClasses: 'bg-rose-400',
        hoverBtnClasses: 'hover:text-rose-100 hover:bg-rose-500/20',
        selectClasses: 'border-rose-500/60 bg-rose-950/25 text-rose-300',
        ringClasses: 'border-rose-500 ring-2 ring-rose-500/40',
        label: 'RMA'
      };
    case 'Baixado':
      return {
        badgeClasses: 'bg-slate-500/15 border-slate-500/50 text-slate-300 dark:text-slate-200',
        dotClasses: 'bg-slate-400',
        hoverBtnClasses: 'hover:text-slate-100 hover:bg-slate-500/20',
        selectClasses: 'border-slate-500/60 bg-slate-950/25 text-slate-300',
        ringClasses: 'border-slate-500 ring-2 ring-slate-500/40',
        label: 'Histórico de Baixas'
      };
    default:
      return {
        badgeClasses: 'bg-slate-500/15 border-slate-500/50 text-slate-300 dark:text-slate-200',
        dotClasses: 'bg-slate-400',
        hoverBtnClasses: 'hover:text-slate-100 hover:bg-slate-500/20',
        selectClasses: 'border-slate-500/60 bg-slate-950/25 text-slate-300',
        ringClasses: 'border-slate-500 ring-2 ring-slate-500/40',
        label: normalized
      };
  }
}
