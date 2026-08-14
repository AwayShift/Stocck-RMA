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
        const esIdx = headerRow.findIndex(h => h === 'ES' || h.includes('E.S.') || h.includes('ESPECIAL') || h.includes('SUPLEMENTAR'));
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
        const skuIdx = headerRow.findIndex(h => h === 'SKU' || h.includes('SKU') || h.includes('CÓD') || h.includes('COD'));
        const descIdx = headerRow.findIndex(h => h.includes('DESCRIÇÃO') || h.includes('DESCRICAO') || h.includes('PRODUTO') || h.includes('NOME') || h.includes('DESCRIPTION'));
        const brandIdx = headerRow.findIndex(h => h.includes('MARCA') || h.includes('BRAND') || h.includes('FABRICANTE'));
        const catIdx = headerRow.findIndex(h => h.includes('CATEGORIA') || h.includes('CATEGORY') || h.includes('SETOR'));
        const voltIdx = headerRow.findIndex(h => h.includes('VOLT') || h.includes('TENSAO') || h.includes('TENSÃO'));
        const accIdx = headerRow.findIndex(h => h.includes('ACESSORIO') || h.includes('ACESSÓRIO') || h.includes('ACCESSOR'));

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
          let voltage: '110V' | '220V' | 'Bivolt' | 'N/A' = 'Bivolt';
          if (voltIdx !== -1 && row[voltIdx]) {
            const vStr = String(row[voltIdx]).toUpperCase().trim();
            if (vStr.includes('110') || vStr.includes('127')) voltage = '110V';
            else if (vStr.includes('220')) voltage = '220V';
            else if (vStr.includes('BIVOLT') || vStr.includes('BI')) voltage = 'Bivolt';
            else if (vStr.includes('N/A') || vStr.includes('NA') || vStr.includes('SEM')) voltage = 'N/A';
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
      'Descrição': 'A DROP DISSEY ISSEY MIYAKE EDP - 50ML'
    },
    {
      'SKU': 17408,
      'Descrição': 'ACABAMENTO PARA REGISTRO BASE DECA 3/4" RIVA'
    },
    {
      'SKU': 16351,
      'Descrição': 'ACCESS POINT UBIQUITI U6+ UNIFI 6 PLUS SEM FONTE - U6+I'
    },
    {
      'SKU': 17354,
      'Descrição': 'ACCESS POINT UBIQUITI U7 LITE UNIFI WIFI 7 DUAL BAND 4988 MBPS POE SEM FONTE'
    }
  ];

  const ws = XLSX.utils.json_to_sheet(sampleData);
  
  // Set explicit column widths
  ws['!cols'] = [
    { wch: 15 },
    { wch: 65 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Catálogo de Produtos');
  XLSX.writeFile(wb, 'modelo_catalogo_base_sku.xlsx');
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
    'Voltagem': p.voltage || 'Bivolt',
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

