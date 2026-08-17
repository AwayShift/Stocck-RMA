/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as XLSX from 'xlsx';
import { DailyInflowRecord, InflowWeekSummary } from '../types';

/**
 * Parses Excel dates safely (supporting numeric serial dates, DD/MM/YYYY, YYYY-MM-DD, etc.)
 */
export function parseExcelDate(val: any): string | null {
  if (val === undefined || val === null || val === '') return null;
  
  if (typeof val === 'number') {
    // Excel base date: 1899-12-30 (handling Excel leap year bug)
    // In XLSX utility:
    try {
      const parsedDate = XLSX.SSF.parse_date_code(val);
      if (parsedDate) {
        const y = String(parsedDate.y).padStart(4, '0');
        const m = String(parsedDate.m).padStart(2, '0');
        const d = String(parsedDate.d).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    } catch {
      const jsDate = new Date((val - (25567 + 2)) * 86400 * 1000);
      if (!isNaN(jsDate.getTime())) {
        return jsDate.toISOString().split('T')[0];
      }
    }
  }

  if (typeof val === 'string') {
    const trimmed = val.trim();
    // DD/MM/YYYY or DD-MM-YYYY
    const brMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (brMatch) {
      const day = brMatch[1].padStart(2, '0');
      const month = brMatch[2].padStart(2, '0');
      const year = brMatch[3];
      return `${year}-${month}-${day}`;
    }
    // YYYY-MM-DD
    const isoMatch = trimmed.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (isoMatch) {
      const year = isoMatch[1];
      const month = isoMatch[2].padStart(2, '0');
      const day = isoMatch[3].padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
  }

  if (val instanceof Date && !isNaN(val.getTime())) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return null;
}

/**
 * Format 'YYYY-MM-DD' to 'DD/MM/YYYY'
 */
export function formatBrDate(isoDate: string): string {
  if (!isoDate) return '-';
  const parts = isoDate.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoDate;
}

/**
 * Format date to weekday name in Portuguese
 */
export function getWeekdayName(isoDate: string): string {
  try {
    const [y, m, d] = isoDate.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const days = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    return days[date.getDay()] || '';
  } catch {
    return '';
  }
}

/**
 * Reads an Excel file buffer or File and extracts DailyInflowRecords
 */
export async function parseInflowExcelFile(file: File): Promise<{
  success: boolean;
  records: DailyInflowRecord[];
  errors: string[];
  totalRows: number;
}> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          return resolve({ success: false, records: [], errors: ['A planilha está vazia ou não contém abas válidas.'], totalRows: 0 });
        }

        const worksheet = workbook.Sheets[firstSheetName];
        // Read as array of objects
        const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        
        if (rawJson.length < 2) {
          return resolve({ success: false, records: [], errors: ['A planilha não contém linhas de dados suficientes.'], totalRows: 0 });
        }

        // Find header row (usually row 0)
        const headerRow: string[] = (rawJson[0] || []).map((h: any) => String(h).trim().toUpperCase());
        
        // Find column indices
        const dateIdx = headerRow.findIndex(h => h.includes('DATA') || h.includes('DATE') || h.includes('DIA'));
        const rmaIdx = headerRow.findIndex(h => h.includes('RMA') || h.includes('TRIAGEM'));
        const estoqueIdx = headerRow.findIndex(h => h.includes('ESTOQUE') || h.includes('STOCK') || h.includes('ALMOXARIFADO'));
        const openboxIdx = headerRow.findIndex(h => h.includes('OPENBOX') || h.includes('OPEN BOX') || h.includes('OPEN-BOX'));
        const esIdx = headerRow.findIndex(h => h === 'ES' || h.includes('E.S.') || h.includes('ESPIRITO SANTO') || h.includes('ESPÍRITO SANTO') || h.includes('ESPECIAL') || h.includes('SUPLEMENTAR'));
        const notesIdx = headerRow.findIndex(h => h.includes('OBS') || h.includes('NOTA') || h.includes('NOTE'));

        if (dateIdx === -1) {
          return resolve({
            success: false,
            records: [],
            errors: ['Não foi encontrada a coluna obrigatória "DATA" no cabeçalho da planilha.'],
            totalRows: 0
          });
        }

        const records: DailyInflowRecord[] = [];
        const errors: string[] = [];

        // Parse data rows
        for (let i = 1; i < rawJson.length; i++) {
          const row = rawJson[i];
          if (!row || row.length === 0 || row.every((c: any) => c === '' || c === null || c === undefined)) {
            continue; // Skip empty rows
          }

          const rawDate = row[dateIdx];
          const parsedDate = parseExcelDate(rawDate);

          if (!parsedDate) {
            if (rawDate !== '' && rawDate !== undefined) {
              errors.push(`Linha ${i + 1}: Data inválida ou não reconhecida ("${rawDate}").`);
            }
            continue;
          }

          const rma = Math.max(0, parseInt(row[rmaIdx], 10) || 0);
          const estoque = Math.max(0, parseInt(row[estoqueIdx], 10) || 0);
          const openbox = Math.max(0, parseInt(row[openboxIdx], 10) || 0);
          const es = esIdx !== -1 ? Math.max(0, parseInt(row[esIdx], 10) || 0) : 0;
          const totalDia = rma + estoque + openbox + es;
          const notes = notesIdx !== -1 ? String(row[notesIdx] || '').trim() : '';

          records.push({
            id: `inflow-${parsedDate}`,
            date: parsedDate,
            rma,
            estoque,
            openbox,
            es,
            totalDia,
            notes,
            source: 'excel',
            updatedAt: new Date().toISOString()
          });
        }

        if (records.length === 0) {
          return resolve({
            success: false,
            records: [],
            errors: errors.length > 0 ? errors : ['Nenhuma linha de entrada válida pôde ser importada da planilha.'],
            totalRows: 0
          });
        }

        // Sort ascending by date
        records.sort((a, b) => a.date.localeCompare(b.date));

        return resolve({
          success: true,
          records,
          errors,
          totalRows: records.length
        });
      } catch (err: any) {
        return resolve({
          success: false,
          records: [],
          errors: [`Erro ao ler arquivo Excel: ${err?.message || err}`],
          totalRows: 0
        });
      }
    };

    reader.onerror = () => {
      resolve({
        success: false,
        records: [],
        errors: ['Erro ao processar leitura do arquivo do sistema operacional.'],
        totalRows: 0
      });
    };

    reader.readAsArrayBuffer(file);
  });
}

/**
 * Generates and downloads a sample Excel template matching the user's screenshot
 */
export function downloadInflowTemplate() {
  const sampleData = [
    {
      'DATA': '25/05/2026',
      'RMA': 23,
      'ESTOQUE': 25,
      'OPENBOX': 2,
      'ES': 0,
      'TOTAL DIA': 50,
      'TOTAL SEMANA': ''
    },
    {
      'DATA': '26/05/2026',
      'RMA': 11,
      'ESTOQUE': 15,
      'OPENBOX': 1,
      'ES': 44,
      'TOTAL DIA': 71,
      'TOTAL SEMANA': ''
    },
    {
      'DATA': '27/05/2026',
      'RMA': 11,
      'ESTOQUE': 25,
      'OPENBOX': 5,
      'ES': 54,
      'TOTAL DIA': 95,
      'TOTAL SEMANA': 267
    },
    {
      'DATA': '28/05/2026',
      'RMA': 15,
      'ESTOQUE': 24,
      'OPENBOX': 2,
      'ES': 0,
      'TOTAL DIA': 41,
      'TOTAL SEMANA': ''
    },
    {
      'DATA': '29/05/2026',
      'RMA': 2,
      'ESTOQUE': 6,
      'OPENBOX': 2,
      'ES': 0,
      'TOTAL DIA': 10,
      'TOTAL SEMANA': ''
    }
  ];

  const ws = XLSX.utils.json_to_sheet(sampleData);
  
  // Set column widths
  ws['!cols'] = [
    { wch: 14 }, // DATA
    { wch: 10 }, // RMA
    { wch: 12 }, // ESTOQUE
    { wch: 12 }, // OPENBOX
    { wch: 10 }, // ES
    { wch: 14 }, // TOTAL DIA
    { wch: 16 }  // TOTAL SEMANA
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Fluxo de Entradas');
  XLSX.writeFile(wb, 'modelo_fluxo_entradas.xlsx');
}

/**
 * Exports current daily inflow records to an Excel workbook
 */
export function exportInflowRecordsToExcel(records: DailyInflowRecord[], filename = 'fluxo_entradas_exportado.xlsx') {
  // Sort ascending
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
  
  // Group by week to populate TOTAL SEMANA
  const weekSummaries = groupRecordsByWeek(sorted);
  
  const rows: any[] = [];
  
  weekSummaries.forEach(week => {
    const weekCount = week.records.length;
    const midIdx = Math.floor(weekCount / 2);

    week.records.forEach((rec, idx) => {
      rows.push({
        'DATA': formatBrDate(rec.date),
        'RMA': rec.rma,
        'ESTOQUE': rec.estoque,
        'OPENBOX': rec.openbox,
        'ES': rec.es,
        'TOTAL DIA': rec.totalDia,
        'TOTAL SEMANA': idx === midIdx ? week.totalWeek : '',
        'OBSERVAÇÕES': rec.notes || ''
      });
    });
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 14 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 14 },
    { wch: 16 },
    { wch: 30 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Entradas Consolidada');
  XLSX.writeFile(wb, filename);
}

/**
 * Groups daily inflow records into weeks (Monday through Sunday) and computes weekly totals
 */
export function groupRecordsByWeek(records: DailyInflowRecord[]): InflowWeekSummary[] {
  if (records.length === 0) return [];

  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
  const weekMap = new Map<string, DailyInflowRecord[]>();

  sorted.forEach(rec => {
    const [y, m, d] = rec.date.split('-').map(Number);
    const currDate = new Date(y, m - 1, d);
    
    // Find Monday of this week
    const dayOfWeek = currDate.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monDate = new Date(currDate);
    monDate.setDate(currDate.getDate() + diffToMon);
    
    const monKey = `${monDate.getFullYear()}-${String(monDate.getMonth() + 1).padStart(2, '0')}-${String(monDate.getDate()).padStart(2, '0')}`;
    
    if (!weekMap.has(monKey)) {
      weekMap.set(monKey, []);
    }
    weekMap.get(monKey)!.push(rec);
  });

  const summaries: InflowWeekSummary[] = [];
  let weekCounter = 1;

  Array.from(weekMap.entries()).forEach(([monKey, weekRecords]) => {
    const [my, mm, md] = monKey.split('-').map(Number);
    const monDate = new Date(my, mm - 1, md);
    const sunDate = new Date(monDate);
    sunDate.setDate(monDate.getDate() + 6);

    const startStr = `${String(monDate.getDate()).padStart(2, '0')}/${String(monDate.getMonth() + 1).padStart(2, '0')}`;
    const endStr = `${String(sunDate.getDate()).padStart(2, '0')}/${String(sunDate.getMonth() + 1).padStart(2, '0')}/${sunDate.getFullYear()}`;

    let totalRma = 0;
    let totalEstoque = 0;
    let totalOpenbox = 0;
    let totalEs = 0;
    let totalWeek = 0;

    weekRecords.forEach(r => {
      totalRma += r.rma;
      totalEstoque += r.estoque;
      totalOpenbox += r.openbox;
      totalEs += r.es;
      totalWeek += r.totalDia;
    });

    summaries.push({
      weekNumber: weekCounter++,
      weekLabel: `Semana (${startStr} a ${endStr})`,
      startDate: monKey,
      endDate: `${sunDate.getFullYear()}-${String(sunDate.getMonth() + 1).padStart(2, '0')}-${String(sunDate.getDate()).padStart(2, '0')}`,
      records: weekRecords,
      totalWeek,
      totalRma,
      totalEstoque,
      totalOpenbox,
      totalEs
    });
  });

  return summaries;
}

/**
 * Parses an Excel file for Base Catalog products (SKU and Descrição / Nome)
 */
export async function parseCatalogExcelFile(file: File): Promise<{
  success: boolean;
  products: {
    sku: string;
    name: string;
    brand?: string;
    category?: string;
    voltage?: '110V' | '220V' | 'Bivolt' | 'N/A';
    description?: string;
    accessories?: string;
  }[];
  errors: string[];
  totalRows: number;
}> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          return resolve({ success: false, products: [], errors: ['A planilha está vazia ou não contém abas válidas.'], totalRows: 0 });
        }

        const worksheet = workbook.Sheets[firstSheetName];
        const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        
        if (rawJson.length < 2) {
          return resolve({ success: false, products: [], errors: ['A planilha não contém linhas de dados suficientes.'], totalRows: 0 });
        }

        // Find header row (usually row 0)
        const headerRow: string[] = (rawJson[0] || []).map((h: any) => String(h).trim().toUpperCase());
        
        // Find column indices
        const skuIdx = headerRow.findIndex(h => h === 'SKU' || h.includes('SKU') || h.includes('CÓD') || h.includes('COD') || h.includes('ITEM') || h.includes('REFERÊNCIA') || h.includes('REFERENCIA'));
        const descIdx = headerRow.findIndex(h => h.includes('DESCRIÇÃO') || h.includes('DESCRICAO') || h.includes('PRODUTO') || h.includes('NOME') || h.includes('DESCRIPTION') || h.includes('TITLE') || h.includes('TÍTULO') || h.includes('TITULO'));
        const brandIdx = headerRow.findIndex(h => h === 'MARCA' || h.includes('MARCA') || h.includes('BRAND') || h.includes('FABRICANTE') || h.includes('FABRIC') || h.includes('MAKE'));
        const catIdx = headerRow.findIndex(h => h === 'CATEGORIA' || h.includes('CATEGORIA') || h.includes('CATEGORY') || h.includes('CATEG') || h.includes('SETOR') || h.includes('SEGMENTO') || h.includes('GRUPO') || h.includes('DEPARTAMENTO') || h.includes('DEPTO') || h.includes('FAMILIA') || h.includes('FAMÍLIA') || h.includes('LINHA'));
        const voltIdx = headerRow.findIndex(h => h.includes('VOLT') || h.includes('TENSAO') || h.includes('TENSÃO') || h.includes('VOLTAGEM'));
        const accIdx = headerRow.findIndex(h => h.includes('ACESSORIO') || h.includes('ACESSÓRIO') || h.includes('ACCESSOR') || h.includes('ITENS'));

        const effectiveSkuIdx = skuIdx !== -1 ? skuIdx : 0;
        const effectiveDescIdx = descIdx !== -1 ? descIdx : 1;

        const parsedProducts: {
          sku: string;
          name: string;
          brand?: string;
          category?: string;
          voltage?: '110V' | '220V' | 'Bivolt' | 'N/A';
          description?: string;
          accessories?: string;
        }[] = [];
        const errors: string[] = [];

        for (let i = 1; i < rawJson.length; i++) {
          const row = rawJson[i];
          if (!row || row.length === 0 || row.every((c: any) => c === '' || c === null || c === undefined)) {
            continue; // Skip empty rows
          }

          const rawSku = row[effectiveSkuIdx];
          const rawDesc = row[effectiveDescIdx];

          const sku = String(rawSku !== undefined && rawSku !== null ? rawSku : '').trim().toUpperCase();
          const name = String(rawDesc !== undefined && rawDesc !== null ? rawDesc : '').trim();

          if (!sku && !name) {
            continue;
          }

          if (!sku) {
            errors.push(`Linha ${i + 1}: SKU está em branco.`);
            continue;
          }

          if (!name) {
            errors.push(`Linha ${i + 1}: Descrição do produto (SKU: ${sku}) está em branco.`);
            continue;
          }

          // Optional extra columns
          const brand = brandIdx !== -1 && row[brandIdx] ? String(row[brandIdx]).trim() : '';
          const category = catIdx !== -1 && row[catIdx] ? String(row[catIdx]).trim() : '';
          let voltage: '110V' | '220V' | 'Bivolt' | 'N/A' = 'N/A';
          if (voltIdx !== -1 && row[voltIdx]) {
            const vStr = String(row[voltIdx]).toUpperCase().trim();
            if (vStr.includes('110') || vStr.includes('127')) voltage = '110V';
            else if (vStr.includes('220')) voltage = '220V';
            else if (vStr.includes('BIVOLT') || vStr.includes('BI-VOLT') || vStr.includes('BIV')) voltage = 'Bivolt';
            else if (vStr.includes('N/A') || vStr.includes('NA') || vStr.includes('SEM')) voltage = 'N/A';
            else voltage = 'N/A';
          } else {
            // Check if product description explicitly specifies voltage
            const descUpper = name.toUpperCase();
            if (descUpper.includes('110V') || descUpper.includes('127V')) voltage = '110V';
            else if (descUpper.includes('220V')) voltage = '220V';
            else if (descUpper.includes('BIVOLT') || descUpper.includes('BI-VOLT')) voltage = 'Bivolt';
            else voltage = 'N/A';
          }
          const accessories = accIdx !== -1 && row[accIdx] ? String(row[accIdx]).trim() : '';

          parsedProducts.push({
            sku,
            name,
            brand,
            category,
            voltage,
            description: name,
            accessories
          });
        }

        resolve({
          success: parsedProducts.length > 0,
          products: parsedProducts,
          errors,
          totalRows: parsedProducts.length
        });
      } catch (err: any) {
        console.error('Error parsing base catalog excel:', err);
        resolve({
          success: false,
          products: [],
          errors: [`Falha técnica ao processar planilha: ${err?.message || 'Arquivo corrompido ou formato inválido'}`],
          totalRows: 0
        });
      }
    };

    reader.onerror = () => {
      resolve({
        success: false,
        products: [],
        errors: ['Erro ao ler arquivo do computador.'],
        totalRows: 0
      });
    };

    reader.readAsArrayBuffer(file);
  });
}

/**
 * Downloads a pre-formatted Excel template for Base Catalog matching the user's spreadsheet example
 */
export function downloadBaseCatalogTemplate() {
  const sampleData = [
    {
      'SKU': 16791,
      'Descrição': 'A DROP DISSEY ISSEY MIYAKE EDP - 50ML',
      'Marca': 'Issey Miyake',
      'Categoria': 'Perfumaria & Beleza',
      'Voltagem': 'N/A',
      'Acessórios': 'Frasco 50ml, Caixa Original'
    },
    {
      'SKU': 17408,
      'Descrição': 'ACABAMENTO PARA REGISTRO BASE DECA 3/4" RIVA',
      'Marca': 'Deca',
      'Categoria': 'Metais e Hidráulica',
      'Voltagem': 'N/A',
      'Acessórios': 'Kit de fixação, Manual'
    },
    {
      'SKU': 16351,
      'Descrição': 'ACCESS POINT UBIQUITI U6+ UNIFI 6 PLUS SEM FONTE - U6+I',
      'Marca': 'Ubiquiti',
      'Categoria': 'Redes & Conectividade',
      'Voltagem': 'Bivolt',
      'Acessórios': 'Suporte de montagem de teto'
    },
    {
      'SKU': 17354,
      'Descrição': 'ACCESS POINT UBIQUITI U7 LITE UNIFI WIFI 7 DUAL BAND 4988 MBPS POE SEM FONTE',
      'Marca': 'Ubiquiti',
      'Categoria': 'Redes & Conectividade',
      'Voltagem': 'Bivolt',
      'Acessórios': 'Suporte de parede, Manual'
    },
    {
      'SKU': 18502,
      'Descrição': 'FRITADEIRA ELETRICA AIRFRYER TOUCH DIGITAL 4.5L 1500W',
      'Marca': 'Mondial',
      'Categoria': 'Eletroportáteis',
      'Voltagem': '110V',
      'Acessórios': 'Cesto antiaderente, Livro de receitas'
    }
  ];

  const ws = XLSX.utils.json_to_sheet(sampleData);
  
  // Set explicit column widths
  ws['!cols'] = [
    { wch: 15 }, // SKU
    { wch: 65 }, // Descrição
    { wch: 20 }, // Marca
    { wch: 26 }, // Categoria
    { wch: 14 }, // Voltagem
    { wch: 35 }  // Acessórios
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Catálogo de Produtos');
  XLSX.writeFile(wb, 'modelo_catalogo_base_completo.xlsx');
}

/**
 * Exports base catalog products to Excel
 */
export function exportBaseCatalogToExcel(products: any[], filename = 'catalogo_base_produtos.xlsx') {
  const rows = products.map(p => ({
    'SKU': p.sku,
    'Descrição': p.name,
    'Marca': p.brand || '',
    'Categoria': p.category || '',
    'Voltagem': p.voltage || 'N/A',
    'Acessórios': p.accessories || ''
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 16 },
    { wch: 55 },
    { wch: 20 },
    { wch: 22 },
    { wch: 14 },
    { wch: 30 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Catálogo de Produtos');
  XLSX.writeFile(wb, filename);
}

/**
 * Normalizes header string removing accents, special characters, multiple spaces
 */
export function normalizeExcelHeader(h: any): string {
  if (h === undefined || h === null) return '';
  return String(h)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface StockInventoryParsedRow {
  sku: string;
  productName: string;
  serialNumber: string;
  sti: string;
  packaging: string;
  observations: string;
  customerReason: string;
  brand: string;
  categoryOrSector: string;
}

export interface StockInventoryParseResult {
  success: boolean;
  rows: StockInventoryParsedRow[];
  serialsFoundCount: number;
  stiFoundCount: number;
  availableSheets: string[];
  activeSheetName: string;
  errors: string[];
  totalRows: number;
}

/**
 * Helper to intelligently extract brand name from product title if not specified
 */
export function extractBrandFromTitle(title: string): string {
  if (!title) return '';
  const upper = title.toUpperCase();
  const knownBrands = [
    'PHILCO', 'MULTILASER', 'CADENCE', 'EPSON', 'ELGIN', 'MONDIAL', 
    'BRITANIA', 'BRITÂNIA', 'OSTER', 'ARNO', 'LOGITECH', 'SAMSUNG', 
    'LG', 'DELL', 'ACER', 'ASUS', 'LENOVO', 'MOTOROLA', 'XIAOMI', 
    'APPLE', 'WALITA', 'ELECTROLUX', 'CONSUL', 'BRASTEMP', 'JBL', 
    'HAYOM', 'REDDRAGON', 'REDRAGON', 'WARRIOR', 'KNUP', 'TP-LINK', 
    'INTELBRAS', 'GA.MA', 'TAIFF', 'MALLORY', 'MIDEA', 'AGRATTO',
    'POSITIVO', 'SANDISK', 'KINGSTON', 'CORSAIR', 'HYPERX', 'RAZER'
  ];

  for (const brand of knownBrands) {
    // Check whole word boundary
    const regex = new RegExp(`\\b${brand}\\b`, 'i');
    if (regex.test(upper)) {
      // Capitalize first letter properly
      if (brand === 'LG' || brand === 'JBL' || brand === 'TP-LINK') return brand;
      return brand.charAt(0).toUpperCase() + brand.slice(1).toLowerCase();
    }
  }
  return '';
}

/**
 * Parses an Excel file for Physical Stock / Openbox inventory
 * Strictly distinguishes and extracts:
 * Col A: STI (Tracking/Case/Ticket)
 * Col B: SKU (Product Code)
 * Col C: DESCRIÇÃO DO PRODUTO (Product Title)
 * Col D: SERIAL (Manufacturer Hardware Serial)
 * Col E: SITUAÇÃO (Packaging condition: NA CAIXA, SEM / CAIXA, etc.)
 * Col F: OBSERVAÇÃO (Notes, Return reason, Warranty info)
 */
export async function parseStockInventoryExcelFile(
  file: File,
  targetSheetName?: string
): Promise<StockInventoryParseResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const availableSheets = workbook.SheetNames || [];
        
        if (availableSheets.length === 0) {
          return resolve({
            success: false,
            rows: [],
            serialsFoundCount: 0,
            stiFoundCount: 0,
            availableSheets: [],
            activeSheetName: '',
            errors: ['A planilha está vazia ou não contém abas válidas.'],
            totalRows: 0
          });
        }

        // Determine which sheet to parse
        const activeSheetName = targetSheetName && availableSheets.includes(targetSheetName)
          ? targetSheetName
          : availableSheets[0];

        const worksheet = workbook.Sheets[activeSheetName];
        if (!worksheet) {
          return resolve({
            success: false,
            rows: [],
            serialsFoundCount: 0,
            stiFoundCount: 0,
            availableSheets,
            activeSheetName,
            errors: [`A aba "${activeSheetName}" não foi encontrada no arquivo.`],
            totalRows: 0
          });
        }

        // Read raw 2D array
        const rawMatrix: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        if (rawMatrix.length === 0) {
          return resolve({
            success: false,
            rows: [],
            serialsFoundCount: 0,
            stiFoundCount: 0,
            availableSheets,
            activeSheetName,
            errors: [`A aba "${activeSheetName}" está vazia.`],
            totalRows: 0
          });
        }

        // Find the actual header row (scanning first 15 rows)
        let headerRowIdx = 0;
        let highestScore = 0;

        for (let r = 0; r < Math.min(rawMatrix.length, 15); r++) {
          const row = rawMatrix[r] || [];
          let score = 0;
          row.forEach((cell: any) => {
            const norm = normalizeExcelHeader(cell);
            if (norm === 'sti' || norm.startsWith('sti') || norm.includes('sti') || norm.includes('rastreio')) score += 4;
            if (norm === 'sku' || norm.includes('sku') || norm.startsWith('cod')) score += 4;
            if (norm.includes('descricao') || norm.includes('produto') || norm === 'item') score += 3;
            if (norm === 'serial' || norm === 'serie' || norm === 'sn' || norm === 's/n' || norm.includes('serial')) score += 4;
            if (norm.includes('situacao') || norm.includes('embalagem') || norm.includes('caixa')) score += 3;
            if (norm.includes('observac') || norm.includes('obs')) score += 3;
          });

          if (score > highestScore) {
            highestScore = score;
            headerRowIdx = r;
          }
        }

        const headerRow = (rawMatrix[headerRowIdx] || []).map(normalizeExcelHeader);

        // 1. STI: Column A / Tracking code (strictly excludes Serial / SKU)
        let stiIdx = headerRow.findIndex(h => {
          if (h.includes('serial') || h.includes('serie') || h === 'sn' || h === 's/n' || h === 'sku') return false;
          if (h === 'sti' || h.startsWith('sti') || h.endsWith('sti') || h.includes('sti')) return true;
          if (h === 'codigo sti' || h === 'cod sti' || h === 'n sti' || h === 'no sti' || h === 'num sti' || h === 'numero sti') return true;
          if (h === 'rastreio' || h === 'codigo de rastreio' || h === 'cod rastreio' || h === 'tracking' || h === 'etiqueta' || h === 'ticket' || h === 'caso') return true;
          return false;
        });

        // 2. SKU: Column B / Product Code
        let skuIdx = headerRow.findIndex(h => {
          if (h === 'sti' || h.startsWith('sti') || h.includes('codigo sti') || h.includes('serial') || h.includes('serie')) return false;
          if (h === 'sku' || h.includes('sku')) return true;
          if (h === 'cod' || h === 'codigo' || h === 'ref' || h === 'referencia' || h === 'cod item' || h === 'codigo item') return true;
          if (h === 'cod produto' || h === 'codigo do produto' || h === 'codigo produto' || h === 'cod prod' || h === 'cod da mercadoria') return true;
          return false;
        });

        // 3. DESCRIÇÃO DO PRODUTO: Column C / Product Title
        let descIdx = headerRow.findIndex(h => {
          if (h === 'cod produto' || h === 'codigo do produto' || h === 'situacao do produto' || h.includes('serial') || h.includes('sti')) return false;
          if (h === 'descricao do produto' || h === 'descricao' || h === 'produto' || h === 'nome do produto' || h === 'nome' || h === 'item' || h === 'titulo' || h === 'mercadoria' || h === 'modelo') return true;
          if (h.includes('descricao') || (h.includes('produto') && !h.includes('codigo') && !h.includes('situacao'))) return true;
          return false;
        });

        // 4. SERIAL: Column D / Hardware Serial Number (strictly excludes STI)
        let serialIdx = headerRow.findIndex(h => {
          if (h.includes('sti') || h.includes('rastreio') || h.includes('tracking') || h === 'sku') return false;
          if (h === 'serial' || h === 'serie' || h === 'sn' || h === 's/n' || h === 'n/s' || h === 'ns' || h === 'serial number') return true;
          if (h === 'numero de serie' || h === 'num de serie' || h === 'num serie' || h === 'no de serie' || h === 'n de serie' || h === 'codigo de serie' || h === 'cod de serie' || h === 'no serie') return true;
          if (h.includes('serial') || h.includes('numero de serie') || h.includes('num serie') || h.includes('no serie')) return true;
          if (h.startsWith('sn ') || h.endsWith(' sn') || h.includes('s/n')) return true;
          return false;
        });

        // 5. SITUAÇÃO / EMBALAGEM: Column E
        let pkgIdx = headerRow.findIndex(h => {
          if (h === 'situacao' || h === 'embalagem' || h === 'caixa' || h === 'pacote' || h === 'condicao' || h === 'estado') return true;
          if (h === 'situacao da embalagem' || h === 'situacao do produto' || h === 'condicao da caixa' || h === 'estado do produto' || h === 'status da embalagem') return true;
          if (h.includes('embalagem') || h.includes('situacao') || h.includes('caixa') || h.includes('condicao')) return true;
          return false;
        });

        // 6. OBSERVAÇÃO: Column F
        let obsIdx = headerRow.findIndex(h => {
          if (h === 'observacao' || h === 'observacoes' || h === 'obs' || h === 'detalhes' || h === 'laudo' || h === 'parecer' || h === 'apontamentos') return true;
          if (h === 'motivo' || h === 'defeito' || h === 'problema' || h === 'reclamacao' || h === 'retorno' || h === 'motivo da devolucao' || h === 'retorno garantia') return true;
          if (h.includes('observac') || h.includes('obs') || h.includes('motivo') || h.includes('defeito') || h.includes('retorno')) return true;
          return false;
        });

        // Positional defaults if standard 6-column format (Col A=STI, Col B=SKU, Col C=DESC, Col D=SERIAL, Col E=SITUAÇÃO, Col F=OBS)
        if (stiIdx === -1 && headerRow.length >= 2) {
          // If first column header or data has STI pattern
          const sampleCell = String(rawMatrix[headerRowIdx + 1]?.[0] || '');
          if (sampleCell.toUpperCase().startsWith('STI') || headerRow[0] === 'sti') {
            stiIdx = 0;
          }
        }

        const effectiveStiIdx = stiIdx !== -1 ? stiIdx : (headerRow.length >= 6 ? 0 : -1);
        const effectiveSkuIdx = skuIdx !== -1 ? skuIdx : (effectiveStiIdx === 0 ? 1 : 0);
        const effectiveDescIdx = descIdx !== -1 ? descIdx : (effectiveSkuIdx === 1 ? 2 : 1);
        const effectiveSerialIdx = serialIdx !== -1 ? serialIdx : (headerRow.length >= 6 ? 3 : -1);
        const effectivePkgIdx = pkgIdx !== -1 ? pkgIdx : (headerRow.length >= 6 ? 4 : -1);
        const effectiveObsIdx = obsIdx !== -1 ? obsIdx : (headerRow.length >= 6 ? 5 : -1);

        const brandIdx = headerRow.findIndex(h => 
          h === 'marca' || h === 'brand' || h === 'fabricante' || h.includes('marca') || h.includes('fabricante')
        );

        const catIdx = headerRow.findIndex(h => 
          h === 'setor' || h === 'destino' || h === 'categoria' || h === 'segmento' || h === 'departamento' || 
          h.includes('setor') || h.includes('destino') || h.includes('categoria')
        );

        const parsedRows: StockInventoryParsedRow[] = [];
        let serialsFound = 0;
        let stiFound = 0;
        const errors: string[] = [];

        for (let i = headerRowIdx + 1; i < rawMatrix.length; i++) {
          const row = rawMatrix[i];
          if (!row || row.length === 0 || row.every((c: any) => c === '' || c === null || c === undefined)) {
            continue; // Skip empty rows
          }

          const rawSku = effectiveSkuIdx !== -1 ? row[effectiveSkuIdx] : '';
          const rawDesc = effectiveDescIdx !== -1 ? row[effectiveDescIdx] : '';

          const sku = String(rawSku !== undefined && rawSku !== null ? rawSku : '').trim().toUpperCase();
          const productName = String(rawDesc !== undefined && rawDesc !== null ? rawDesc : '').trim();

          // If both SKU and Product Name are empty, skip row
          if (!sku && !productName) {
            continue;
          }

          // 1. Extract STI strictly
          let rawSti = effectiveStiIdx !== -1 && row[effectiveStiIdx] !== undefined && row[effectiveStiIdx] !== null ? String(row[effectiveStiIdx]).trim() : '';
          const stiUpper = rawSti.toUpperCase();
          let sti = '';
          if (
            rawSti && 
            stiUpper !== 'N/A' && 
            stiUpper !== 'SEM STI' && 
            stiUpper !== 'NA' && 
            stiUpper !== '-' && 
            stiUpper !== 'NULL' && 
            stiUpper !== 'UNDEFINED' && 
            stiUpper !== 'NONE'
          ) {
            sti = rawSti;
            stiFound++;
          }

          // 2. Extract Serial Number strictly
          let rawSerial = effectiveSerialIdx !== -1 && row[effectiveSerialIdx] !== undefined && row[effectiveSerialIdx] !== null ? String(row[effectiveSerialIdx]).trim() : '';
          const serialUpper = rawSerial.toUpperCase();
          let serialNumber = '';
          if (
            rawSerial && 
            serialUpper !== 'N/A' && 
            serialUpper !== 'SEM SERIAL' && 
            serialUpper !== 'NA' && 
            serialUpper !== '-' && 
            serialUpper !== 'S/N' && 
            serialUpper !== 'NULL' && 
            serialUpper !== 'UNDEFINED' && 
            serialUpper !== 'NONE' && 
            serialUpper !== 'NÃO' && 
            serialUpper !== 'NAO'
          ) {
            serialNumber = rawSerial;
            serialsFound++;
          }

          // 3. Extract Packaging / Situação
          const rawPkg = effectivePkgIdx !== -1 && row[effectivePkgIdx] !== undefined && row[effectivePkgIdx] !== null ? String(row[effectivePkgIdx]).trim() : '';
          let packaging = rawPkg || 'Na caixa';
          const pkgUpper = packaging.toUpperCase();
          if (pkgUpper.includes('SEM') || pkgUpper.includes('S/') || pkgUpper.includes('FORA')) {
            packaging = 'Sem / Caixa';
          } else if (pkgUpper.includes('DANIFICAD') || pkgUpper.includes('AVARIAD')) {
            packaging = 'Danificada';
          } else if (pkgUpper.includes('NA CAIXA') || pkgUpper.includes('PERFEIT')) {
            packaging = 'Na caixa';
          }

          // 4. Extract Observations
          const rawObs = effectiveObsIdx !== -1 && row[effectiveObsIdx] !== undefined && row[effectiveObsIdx] !== null ? String(row[effectiveObsIdx]).trim() : '';

          // 5. Extract Brand: explicit column or auto-extracted from product name
          let brand = brandIdx !== -1 && row[brandIdx] !== undefined && row[brandIdx] !== null ? String(row[brandIdx]).trim() : '';
          if (!brand && productName) {
            brand = extractBrandFromTitle(productName);
          }

          // 6. Extract Category / Sector
          const categoryOrSector = catIdx !== -1 && row[catIdx] !== undefined && row[catIdx] !== null ? String(row[catIdx]).trim() : '';

          parsedRows.push({
            sku: sku || 'SKU-INDEF',
            productName: productName || 'Produto Importado',
            serialNumber,
            sti,
            packaging,
            observations: rawObs,
            customerReason: rawObs || 'Entrada de Estoque',
            brand,
            categoryOrSector
          });
        }

        resolve({
          success: parsedRows.length > 0,
          rows: parsedRows,
          serialsFoundCount: serialsFound,
          stiFoundCount: stiFound,
          availableSheets,
          activeSheetName,
          errors,
          totalRows: parsedRows.length
        });
      } catch (err: any) {
        console.error('Error parsing stock inventory excel:', err);
        resolve({
          success: false,
          rows: [],
          serialsFoundCount: 0,
          stiFoundCount: 0,
          availableSheets: [],
          activeSheetName: '',
          errors: [`Falha ao ler planilha: ${err?.message || 'Arquivo corrompido ou formato inválido'}`],
          totalRows: 0
        });
      }
    };

    reader.onerror = () => {
      resolve({
        success: false,
        rows: [],
        serialsFoundCount: 0,
        stiFoundCount: 0,
        availableSheets: [],
        activeSheetName: '',
        errors: ['Erro ao ler arquivo do computador.'],
        totalRows: 0
      });
    };

    reader.readAsArrayBuffer(file);
  });
}

/**
 * Downloads a pre-formatted Excel template for Physical Stock & OpenBox inventory
 * Matches EXACTLY the 6-column structure:
 * Col A: STI
 * Col B: SKU
 * Col C: DESCRIÇÃO DO PRODUTO
 * Col D: SERIAL
 * Col E: SITUAÇÃO
 * Col F: OBSERVAÇÃO
 */
export function downloadStockInventoryTemplate() {
  const stockData = [
    {
      'STI': 'STI135638',
      'SKU': 16552,
      'DESCRIÇÃO DO PRODUTO': 'FORNO ELÉTRICO 17L PHILCO PRETO 2 RESISTÊNCIAS PFE17P 220V - PHILCO',
      'SERIAL': '',
      'SITUAÇÃO': 'NA CAIXA',
      'OBSERVAÇÃO': ''
    },
    {
      'STI': 'STI135454',
      'SKU': 16552,
      'DESCRIÇÃO DO PRODUTO': 'FORNO ELÉTRICO 17L PHILCO PRETO 2 RESISTÊNCIAS PFE17P 220V - PHILCO',
      'SERIAL': '',
      'SITUAÇÃO': 'NA CAIXA',
      'OBSERVAÇÃO': 'RETORNO GARANTIA'
    },
    {
      'STI': 'STI 135635',
      'SKU': 16541,
      'DESCRIÇÃO DO PRODUTO': 'ASPIRADOR DE PÓ PHILCO PAS1450C 2 EM 1 1300W 220V - PHILCO',
      'SERIAL': '',
      'SITUAÇÃO': 'NA CAIXA',
      'OBSERVAÇÃO': ''
    },
    {
      'STI': 'STI135625',
      'SKU': 9157,
      'DESCRIÇÃO DO PRODUTO': 'VOLANTE MULTILASER JS087 MULTI PLATAF C/MARCHA+PEDAL JS087 - MULTILASER',
      'SERIAL': '',
      'SITUAÇÃO': 'NA CAIXA',
      'OBSERVAÇÃO': ''
    },
    {
      'STI': 'STI 135607',
      'SKU': 8937,
      'DESCRIÇÃO DO PRODUTO': 'Tablet Infantil Princesas com Controle Parental MULTILASER',
      'SERIAL': '',
      'SITUAÇÃO': 'NA CAIXA',
      'OBSERVAÇÃO': 'MARCAS DE USO'
    },
    {
      'STI': 'STI134976',
      'SKU': 12624,
      'DESCRIÇÃO DO PRODUTO': 'IMPRESSORA TÉRMICA NÃO FISCAL EPSON TM T88VII-C31CJ57062',
      'SERIAL': 'XB4F027290',
      'SITUAÇÃO': 'SEM / CAIXA',
      'OBSERVAÇÃO': ''
    },
    {
      'STI': 'STI135425',
      'SKU': 16299,
      'DESCRIÇÃO DO PRODUTO': 'IMPRESSORA TÉRMICA NÃO FISCAL ELGIN I8',
      'SERIAL': '',
      'SITUAÇÃO': 'SEM / CAIXA',
      'OBSERVAÇÃO': ''
    }
  ];

  const ws = XLSX.utils.json_to_sheet(stockData);
  ws['!cols'] = [
    { wch: 18 }, // A: STI
    { wch: 14 }, // B: SKU
    { wch: 65 }, // C: DESCRIÇÃO DO PRODUTO
    { wch: 22 }, // D: SERIAL
    { wch: 18 }, // E: SITUAÇÃO
    { wch: 32 }  // F: OBSERVAÇÃO
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Inventario_Estoque');
  XLSX.writeFile(wb, 'modelo_importacao_estoque.xlsx');
}


