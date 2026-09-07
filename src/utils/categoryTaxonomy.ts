/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SubcategoryDef {
  id: string;
  name: string;
  shortLabel: string;
  description?: string;
}

export interface GeneralCategoryDef {
  id: string;
  name: string;
  shortName: string;
  iconName: string;
  color: {
    bg: string;
    text: string;
    border: string;
    badge: string;
    dot: string;
  };
  subcategories: SubcategoryDef[];
}

export const GENERAL_CATEGORIES: GeneralCategoryDef[] = [
  {
    id: 'eletro',
    name: 'Eletrodomésticos & Eletroportáteis',
    shortName: 'Eletrodomésticos',
    iconName: 'Zap',
    color: {
      bg: 'bg-amber-500/10',
      text: 'text-amber-400',
      border: 'border-amber-500/30',
      badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      dot: 'bg-amber-400',
    },
    subcategories: [
      { id: 'linha_branca', name: 'Eletrodomésticos (Linha Branca)', shortLabel: 'Linha Branca', description: 'Geladeiras, Fogões, Máquinas de Lavar, Micro-ondas, Fornos...' },
      { id: 'eletroportateis', name: 'Eletroportáteis', shortLabel: 'Eletroportáteis', description: 'Airfryers, Aspiradores, Cafeteiras, Liquidificadores, Batedeiras...' },
      { id: 'climatizacao', name: 'Climatização & Ventilação', shortLabel: 'Climatização', description: 'Ventiladores, Circuladores, Ar-condicionado, Aquecedores...' }
    ]
  },
  {
    id: 'informatica',
    name: 'Informática & Tecnologia',
    shortName: 'Informática',
    iconName: 'Cpu',
    color: {
      bg: 'bg-sky-500/10',
      text: 'text-sky-400',
      border: 'border-sky-500/30',
      badge: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
      dot: 'bg-sky-400',
    },
    subcategories: [
      { id: 'inf_componentes', name: 'Informática - Componentes', shortLabel: 'Componentes', description: 'Placas de Vídeo, Processadores, Placas-Mãe, RAM, Fontes, Coolers...' },
      { id: 'inf_armazenamento', name: 'Informática - Armazenamento', shortLabel: 'Armazenamento', description: 'SSDs, HDs Externos/Internos, Pen Drives, Cartões de Memória...' },
      { id: 'inf_perifericos', name: 'Informática - Periféricos', shortLabel: 'Periféricos', description: 'Teclados, Mouses, Headsets, Webcams, Caixas de Som PC, Mousepads...' },
      { id: 'computadores', name: 'Computadores & Notebooks', shortLabel: 'Computadores', description: 'Notebooks, PCs Gamer, Desktops, Mini PCs, All-in-One...' },
      { id: 'redes', name: 'Redes & Conectividade', shortLabel: 'Redes & Conectividade', description: 'Roteadores, Switches, Repetidores Wi-Fi, Placas de Rede...' },
      { id: 'cabos_hubs', name: 'Cabos, Conversores & Hubs', shortLabel: 'Cabos & Hubs', description: 'Cabos HDMI, DisplayPort, USB-C, Hubs USB, Adaptadores...' }
    ]
  },
  {
    id: 'audio_video',
    name: 'Áudio, Vídeo & Instrumentos',
    shortName: 'Áudio & Vídeo',
    iconName: 'Headphones',
    color: {
      bg: 'bg-purple-500/10',
      text: 'text-purple-400',
      border: 'border-purple-500/30',
      badge: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
      dot: 'bg-purple-400',
    },
    subcategories: [
      { id: 'audio_som', name: 'Áudio & Vídeo', shortLabel: 'Áudio & Vídeo', description: 'Caixas de Som Bluetooth, Soundbars, Fones TWS, Microfones...' },
      { id: 'tv_imagem', name: 'TV, Monitores & Imagem', shortLabel: 'TV & Telas', description: 'Smart TVs, Monitores, Projetores, Telas, Dongles/TV Box...' },
      { id: 'instrumentos', name: 'Instrumentos Musicais', shortLabel: 'Instrumentos', description: 'Teclados, Guitarras, Violões, Interfaces de Áudio, Pedais...' }
    ]
  },
  {
    id: 'impressao_escritorio',
    name: 'Impressão & Escritório',
    shortName: 'Impressão & Escritório',
    iconName: 'Printer',
    color: {
      bg: 'bg-indigo-500/10',
      text: 'text-indigo-400',
      border: 'border-indigo-500/30',
      badge: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
      dot: 'bg-indigo-400',
    },
    subcategories: [
      { id: 'impressao_esc', name: 'Impressão & Escritório', shortLabel: 'Impressão & Scanners', description: 'Impressoras, Multifuncionais, Scanners, Toners, Cartuchos...' },
      { id: 'impressao_3d', name: 'Impressão 3D', shortLabel: 'Impressão 3D', description: 'Impressoras 3D, Filamentos PLA/ABS, Resinas, Peças de Reposição...' },
      { id: 'moveis_ergonomia', name: 'Móveis & Ergonomia', shortLabel: 'Móveis & Ergonomia', description: 'Cadeiras Ergonômicas, Cadeiras Gamer, Mesas, Suportes Articulados...' }
    ]
  },
  {
    id: 'telefonia',
    name: 'Telefonia & Comunicação',
    shortName: 'Telefonia',
    iconName: 'Smartphone',
    color: {
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-400',
      border: 'border-emerald-500/30',
      badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      dot: 'bg-emerald-400',
    },
    subcategories: [
      { id: 'telefonia_com', name: 'Telefonia & Comunicação', shortLabel: 'Smartphones & Celulares', description: 'Smartphones, Celulares, Telefones sem fio, Rádios Comunicadores...' },
      { id: 'tablets', name: 'Tablets & E-Readers', shortLabel: 'Tablets & E-readers', description: 'Tablets Android, iPads, Leitores Digitais, Mesas Digitalizadoras...' },
      { id: 'wearables', name: 'Smartwatches & Wearables', shortLabel: 'Smartwatches', description: 'Smartwatches, Smartbands, Relógios Inteligentes, Acessórios...' }
    ]
  },
  {
    id: 'energia_seguranca',
    name: 'Energia & Segurança',
    shortName: 'Energia & Segurança',
    iconName: 'ShieldCheck',
    color: {
      bg: 'bg-rose-500/10',
      text: 'text-rose-400',
      border: 'border-rose-500/30',
      badge: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
      dot: 'bg-rose-400',
    },
    subcategories: [
      { id: 'energia_prot', name: 'Energia & Proteção', shortLabel: 'Energia & Nobreaks', description: 'Nobreaks, Estabilizadores, Filtros de Linha, Baterias Seladas...' },
      { id: 'seguranca_cftv', name: 'Segurança & CFTV', shortLabel: 'Segurança & CFTV', description: 'Câmeras de Segurança, DVRs/NVRs, Fechaduras Digitais, Alarmes...' }
    ]
  },
  {
    id: 'casa_lazer',
    name: 'Casa, Ferramentas & Lazer',
    shortName: 'Ferramentas & Lazer',
    iconName: 'Wrench',
    color: {
      bg: 'bg-teal-500/10',
      text: 'text-teal-400',
      border: 'border-teal-500/30',
      badge: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
      dot: 'bg-teal-400',
    },
    subcategories: [
      { id: 'construcao_hidr', name: 'Construção & Hidráulica', shortLabel: 'Construção & Hidráulica', description: 'Ferramentas Elétricas, Furadeiras, Parafusadeiras, Torneiras, Bombas...' },
      { id: 'brinquedos', name: 'Brinquedos', shortLabel: 'Brinquedos & Games', description: 'Brinquedos, Drones, Games, Colecionáveis, Pistas...' },
      { id: 'iluminacao_smart', name: 'Iluminação & Casa Inteligente', shortLabel: 'Casa Inteligente', description: 'Lâmpadas Smart, Fitas LED, Sensores, Interruptores...' }
    ]
  },
  {
    id: 'outros',
    name: 'Outros / Diversos',
    shortName: 'Outros',
    iconName: 'Package',
    color: {
      bg: 'bg-slate-500/10',
      text: 'text-slate-400',
      border: 'border-slate-500/30',
      badge: 'bg-slate-800 text-slate-300 border-slate-700',
      dot: 'bg-slate-400',
    },
    subcategories: [
      { id: 'outros_geral', name: 'Outros / Não Identificado', shortLabel: 'Não Identificado', description: 'Itens diversos, Sucatas, Peças avulsas, Não classificados...' }
    ]
  }
];

// Flat list of all predefined subcategory names
export const ALL_PREDEFINED_SUBCATEGORIES: string[] = GENERAL_CATEGORIES.flatMap(g => 
  g.subcategories.map(s => s.name)
);

// Map of synonyms / legacy names to standard subcategory and general category
const CATEGORY_MAPPINGS: Record<string, { generalId: string; subcategoryName: string }> = {
  'eletrodomésticos (linha branca)': { generalId: 'eletro', subcategoryName: 'Eletrodomésticos (Linha Branca)' },
  'linha branca': { generalId: 'eletro', subcategoryName: 'Eletrodomésticos (Linha Branca)' },
  'eletroportáteis': { generalId: 'eletro', subcategoryName: 'Eletroportáteis' },
  'eletroportateis': { generalId: 'eletro', subcategoryName: 'Eletroportáteis' },
  'cozinha': { generalId: 'eletro', subcategoryName: 'Eletroportáteis' },
  'climatização & ventilação': { generalId: 'eletro', subcategoryName: 'Climatização & Ventilação' },
  'climatizacao': { generalId: 'eletro', subcategoryName: 'Climatização & Ventilação' },

  'informática - componentes': { generalId: 'informatica', subcategoryName: 'Informática - Componentes' },
  'componentes': { generalId: 'informatica', subcategoryName: 'Informática - Componentes' },
  'hardware': { generalId: 'informatica', subcategoryName: 'Informática - Componentes' },
  'informática - armazenamento': { generalId: 'informatica', subcategoryName: 'Informática - Armazenamento' },
  'armazenamento': { generalId: 'informatica', subcategoryName: 'Informática - Armazenamento' },
  'informática - periféricos': { generalId: 'informatica', subcategoryName: 'Informática - Periféricos' },
  'periféricos': { generalId: 'informatica', subcategoryName: 'Informática - Periféricos' },
  'perifericos': { generalId: 'informatica', subcategoryName: 'Informática - Periféricos' },
  'tecnologia': { generalId: 'informatica', subcategoryName: 'Informática - Periféricos' },
  'computadores & notebooks': { generalId: 'informatica', subcategoryName: 'Computadores & Notebooks' },
  'computadores': { generalId: 'informatica', subcategoryName: 'Computadores & Notebooks' },
  'notebooks': { generalId: 'informatica', subcategoryName: 'Computadores & Notebooks' },
  'redes & conectividade': { generalId: 'informatica', subcategoryName: 'Redes & Conectividade' },
  'redes': { generalId: 'informatica', subcategoryName: 'Redes & Conectividade' },
  'cabos, conversores & hubs': { generalId: 'informatica', subcategoryName: 'Cabos, Conversores & Hubs' },
  'cabos': { generalId: 'informatica', subcategoryName: 'Cabos, Conversores & Hubs' },

  'áudio & vídeo': { generalId: 'audio_video', subcategoryName: 'Áudio & Vídeo' },
  'audio & video': { generalId: 'audio_video', subcategoryName: 'Áudio & Vídeo' },
  'áudio': { generalId: 'audio_video', subcategoryName: 'Áudio & Vídeo' },
  'audio': { generalId: 'audio_video', subcategoryName: 'Áudio & Vídeo' },
  'tv, monitores & imagem': { generalId: 'audio_video', subcategoryName: 'TV, Monitores & Imagem' },
  'monitores': { generalId: 'audio_video', subcategoryName: 'TV, Monitores & Imagem' },
  'instrumentos musicais': { generalId: 'audio_video', subcategoryName: 'Instrumentos Musicais' },
  'instrumentos': { generalId: 'audio_video', subcategoryName: 'Instrumentos Musicais' },

  'impressão & escritório': { generalId: 'impressao_escritorio', subcategoryName: 'Impressão & Escritório' },
  'impressao & escritorio': { generalId: 'impressao_escritorio', subcategoryName: 'Impressão & Escritório' },
  'impressão': { generalId: 'impressao_escritorio', subcategoryName: 'Impressão & Escritório' },
  'impressao': { generalId: 'impressao_escritorio', subcategoryName: 'Impressão & Escritório' },
  'impressão 3d': { generalId: 'impressao_escritorio', subcategoryName: 'Impressão 3D' },
  'impressao 3d': { generalId: 'impressao_escritorio', subcategoryName: 'Impressão 3D' },
  'móveis & ergonomia': { generalId: 'impressao_escritorio', subcategoryName: 'Móveis & Ergonomia' },
  'moveis & ergonomia': { generalId: 'impressao_escritorio', subcategoryName: 'Móveis & Ergonomia' },

  'telefonia & comunicação': { generalId: 'telefonia', subcategoryName: 'Telefonia & Comunicação' },
  'telefonia & comunicacao': { generalId: 'telefonia', subcategoryName: 'Telefonia & Comunicação' },
  'telefonia': { generalId: 'telefonia', subcategoryName: 'Telefonia & Comunicação' },
  'celulares': { generalId: 'telefonia', subcategoryName: 'Telefonia & Comunicação' },
  'smartphones': { generalId: 'telefonia', subcategoryName: 'Telefonia & Comunicação' },
  'tablets & e-readers': { generalId: 'telefonia', subcategoryName: 'Tablets & E-Readers' },
  'tablets': { generalId: 'telefonia', subcategoryName: 'Tablets & E-Readers' },
  'smartwatches & wearables': { generalId: 'telefonia', subcategoryName: 'Smartwatches & Wearables' },
  'smartwatches': { generalId: 'telefonia', subcategoryName: 'Smartwatches & Wearables' },

  'energia & proteção': { generalId: 'energia_seguranca', subcategoryName: 'Energia & Proteção' },
  'energia & protecao': { generalId: 'energia_seguranca', subcategoryName: 'Energia & Proteção' },
  'energia': { generalId: 'energia_seguranca', subcategoryName: 'Energia & Proteção' },
  'nobreaks': { generalId: 'energia_seguranca', subcategoryName: 'Energia & Proteção' },
  'segurança & cftv': { generalId: 'energia_seguranca', subcategoryName: 'Segurança & CFTV' },
  'seguranca & cftv': { generalId: 'energia_seguranca', subcategoryName: 'Segurança & CFTV' },
  'segurança': { generalId: 'energia_seguranca', subcategoryName: 'Segurança & CFTV' },
  'cftv': { generalId: 'energia_seguranca', subcategoryName: 'Segurança & CFTV' },

  'construção & hidráulica': { generalId: 'casa_lazer', subcategoryName: 'Construção & Hidráulica' },
  'construcao & hidraulica': { generalId: 'casa_lazer', subcategoryName: 'Construção & Hidráulica' },
  'ferramentas': { generalId: 'casa_lazer', subcategoryName: 'Construção & Hidráulica' },
  'brinquedos': { generalId: 'casa_lazer', subcategoryName: 'Brinquedos' },
  'games & consoles': { generalId: 'casa_lazer', subcategoryName: 'Games & Consoles' },
  'games': { generalId: 'casa_lazer', subcategoryName: 'Games & Consoles' },
  'iluminação & casa inteligente': { generalId: 'casa_lazer', subcategoryName: 'Iluminação & Casa Inteligente' },

  'outros / não identificado': { generalId: 'outros', subcategoryName: 'Outros / Não Identificado' },
  'outros': { generalId: 'outros', subcategoryName: 'Outros / Não Identificado' },
  'diversos': { generalId: 'outros', subcategoryName: 'Outros / Não Identificado' }
};

export interface ResolvedCategoryHierarchy {
  general: GeneralCategoryDef;
  subCategoryName: string;
  subCategoryLabel: string;
  isCustom: boolean;
}

/**
 * Resolves any raw category string into its General Category and Subcategory.
 */
export function resolveCategoryHierarchy(rawCategory?: string): ResolvedCategoryHierarchy {
  if (!rawCategory || !rawCategory.trim() || rawCategory.trim() === 'Todas') {
    const defaultGeneral = GENERAL_CATEGORIES.find(g => g.id === 'outros') || GENERAL_CATEGORIES[0];
    return {
      general: defaultGeneral,
      subCategoryName: 'Outros / Não Identificado',
      subCategoryLabel: 'Não Identificado',
      isCustom: false
    };
  }

  const trimmed = rawCategory.trim();
  const lower = trimmed.toLowerCase();

  // 1. Check direct mapping
  if (CATEGORY_MAPPINGS[lower]) {
    const { generalId, subcategoryName } = CATEGORY_MAPPINGS[lower];
    const general = GENERAL_CATEGORIES.find(g => g.id === generalId) || GENERAL_CATEGORIES[GENERAL_CATEGORIES.length - 1];
    const subDef = general.subcategories.find(s => s.name.toLowerCase() === subcategoryName.toLowerCase());
    return {
      general,
      subCategoryName: subcategoryName,
      subCategoryLabel: subDef?.shortLabel || subcategoryName,
      isCustom: false
    };
  }

  // 2. Check if it matches any general category name
  const matchedGeneral = GENERAL_CATEGORIES.find(g => 
    g.name.toLowerCase() === lower || 
    g.shortName.toLowerCase() === lower ||
    g.id.toLowerCase() === lower
  );
  if (matchedGeneral) {
    return {
      general: matchedGeneral,
      subCategoryName: matchedGeneral.subcategories[0]?.name || matchedGeneral.name,
      subCategoryLabel: matchedGeneral.subcategories[0]?.shortLabel || matchedGeneral.shortName,
      isCustom: false
    };
  }

  // 3. Check if any subcategory matches by exact name or substring
  for (const general of GENERAL_CATEGORIES) {
    for (const sub of general.subcategories) {
      if (sub.name.toLowerCase() === lower || sub.shortLabel.toLowerCase() === lower) {
        return {
          general,
          subCategoryName: sub.name,
          subCategoryLabel: sub.shortLabel,
          isCustom: false
        };
      }
    }
  }

  // 4. Keyword heuristic
  if (lower.includes('informática') || lower.includes('informatica') || lower.includes('pc') || lower.includes('ssd') || lower.includes('ram')) {
    const general = GENERAL_CATEGORIES.find(g => g.id === 'informatica')!;
    return { general, subCategoryName: trimmed, subCategoryLabel: trimmed, isCustom: true };
  }
  if (lower.includes('eletro') || lower.includes('cozinha') || lower.includes('geladeira') || lower.includes('fogão') || lower.includes('fogao')) {
    const general = GENERAL_CATEGORIES.find(g => g.id === 'eletro')!;
    return { general, subCategoryName: trimmed, subCategoryLabel: trimmed, isCustom: true };
  }
  if (lower.includes('áudio') || lower.includes('audio') || lower.includes('som') || lower.includes('fone') || lower.includes('música') || lower.includes('musica')) {
    const general = GENERAL_CATEGORIES.find(g => g.id === 'audio_video')!;
    return { general, subCategoryName: trimmed, subCategoryLabel: trimmed, isCustom: true };
  }
  if (lower.includes('impress') || lower.includes('escritório') || lower.includes('escritorio') || lower.includes('cadeira')) {
    const general = GENERAL_CATEGORIES.find(g => g.id === 'impressao_escritorio')!;
    return { general, subCategoryName: trimmed, subCategoryLabel: trimmed, isCustom: true };
  }
  if (lower.includes('celular') || lower.includes('fone') || lower.includes('telef')) {
    const general = GENERAL_CATEGORIES.find(g => g.id === 'telefonia')!;
    return { general, subCategoryName: trimmed, subCategoryLabel: trimmed, isCustom: true };
  }
  if (lower.includes('segurança') || lower.includes('seguranca') || lower.includes('câmera') || lower.includes('camera') || lower.includes('energia') || lower.includes('nobreak')) {
    const general = GENERAL_CATEGORIES.find(g => g.id === 'energia_seguranca')!;
    return { general, subCategoryName: trimmed, subCategoryLabel: trimmed, isCustom: true };
  }

  // 5. Fallback to "Outros"
  const outrosGeneral = GENERAL_CATEGORIES.find(g => g.id === 'outros') || GENERAL_CATEGORIES[GENERAL_CATEGORIES.length - 1];
  return {
    general: outrosGeneral,
    subCategoryName: trimmed,
    subCategoryLabel: trimmed,
    isCustom: true
  };
}

export interface GroupedCategoryFilterItem {
  general: GeneralCategoryDef;
  options: Array<{
    value: string; // "general:id" or subcategoryName
    label: string;
    isGeneralHeader?: boolean;
    count?: number;
  }>;
}

/**
 * Builds grouped filter list for select dropdowns with <optgroup>.
 * Takes all categories present in the products/stock database and ensures they are nicely grouped.
 */
export function buildGroupedFilterCategories(
  existingCategories: string[],
  categoryCounts?: Record<string, number>
): GroupedCategoryFilterItem[] {
  // Combine predefined subcategories with any custom categories in the system
  const categoriesPool = new Set<string>([...ALL_PREDEFINED_SUBCATEGORIES, ...existingCategories.filter(Boolean)]);

  // Group by general category
  const groupsMap = new Map<string, Set<string>>();
  GENERAL_CATEGORIES.forEach(g => {
    groupsMap.set(g.id, new Set<string>());
  });

  categoriesPool.forEach(cat => {
    if (!cat || cat === 'Todas') return;
    const hierarchy = resolveCategoryHierarchy(cat);
    const set = groupsMap.get(hierarchy.general.id);
    if (set) {
      set.add(cat);
    } else {
      const outros = groupsMap.get('outros');
      outros?.add(cat);
    }
  });

  const result: GroupedCategoryFilterItem[] = [];

  GENERAL_CATEGORIES.forEach(gen => {
    const catSet = groupsMap.get(gen.id) || new Set<string>();
    const options: Array<{ value: string; label: string; isGeneralHeader?: boolean; count?: number }> = [];

    // Option to filter ALL products in this general category
    options.push({
      value: `general:${gen.id}`,
      label: `✦ Todos de ${gen.shortName}`,
      isGeneralHeader: true
    });

    // Subcategories in this group
    const sortedSubcats = Array.from(catSet).sort((a, b) => {
      // Prioritize predefined order
      const idxA = gen.subcategories.findIndex(s => s.name.toLowerCase() === a.toLowerCase());
      const idxB = gen.subcategories.findIndex(s => s.name.toLowerCase() === b.toLowerCase());
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b, 'pt-BR');
    });

    sortedSubcats.forEach(subName => {
      const count = categoryCounts ? (categoryCounts[subName] || 0) : undefined;
      const countSuffix = count !== undefined ? ` (${count})` : '';
      options.push({
        value: subName,
        label: `${subName}${countSuffix}`
      });
    });

    if (options.length > 0) {
      result.push({
        general: gen,
        options
      });
    }
  });

  return result;
}

/**
 * Checks if a product's category matches the current active filter.
 * Handles both "Todas", "general:xyz", and specific subcategory matching.
 */
export function checkCategoryFilterMatch(productCategory: string | undefined, selectedFilter: string): boolean {
  if (!selectedFilter || selectedFilter === 'Todas') {
    return true;
  }

  const pCat = (productCategory || '').trim();

  // If user selected a general macro-category filter (e.g. "general:informatica")
  if (selectedFilter.startsWith('general:')) {
    const targetGeneralId = selectedFilter.replace('general:', '').toLowerCase();
    const hierarchy = resolveCategoryHierarchy(pCat);
    return hierarchy.general.id.toLowerCase() === targetGeneralId;
  }

  // Exact match or normalized match
  if (pCat.toLowerCase() === selectedFilter.toLowerCase()) {
    return true;
  }

  // Check hierarchy matching (e.g. legacy name mapping)
  const hierarchy = resolveCategoryHierarchy(pCat);
  if (hierarchy.subCategoryName.toLowerCase() === selectedFilter.toLowerCase()) {
    return true;
  }

  return false;
}
