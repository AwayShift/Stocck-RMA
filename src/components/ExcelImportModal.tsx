/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useMemo } from 'react';
import { 
  FileSpreadsheet, 
  Upload, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Download, 
  FileText, 
  Layers2,
  AlertTriangle,
  ShieldAlert,
  Search,
  CheckCheck,
  XCircle,
  Copy,
  Info
} from 'lucide-react';
import { BaseProduct, TriageUnit, DestinationSectorType, PlatformType, PackageStatusType } from '../types';
import { parseStockInventoryExcelFile, downloadStockInventoryTemplate } from '../utils/excelHelpers';

interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: BaseProduct[];
  existingUnits?: TriageUnit[];
  onImportUnits: (units: TriageUnit[]) => Promise<void>;
  defaultSector?: DestinationSectorType;
}

export type DuplicateReason = 
  | 'none'
  | 'sti_in_stock' 
  | 'serial_in_stock' 
  | 'both_in_stock' 
  | 'sti_in_file' 
  | 'serial_in_file'
  | 'both_in_file';

export interface DuplicateInfo {
  isDuplicate: boolean;
  reason: DuplicateReason;
  detail: string;
  matchedField: 'sti' | 'serial' | 'both' | 'none';
  matchedExistingUnit?: TriageUnit;
}

export interface ParsedRow {
  id: string;
  sku: string;
  sti: string;
  serialNumber: string;
  productName: string;
  brand?: string;
  category?: string;
  packaging: string;
  observations: string;
  customerReason?: string;
  categoryOrSector: string;
  destinationSector: DestinationSectorType;
  packageStatus: PackageStatusType;
  matchedProduct?: BaseProduct;
  duplicateInfo: DuplicateInfo;
  selected: boolean;
}

export default function ExcelImportModal({
  isOpen,
  onClose,
  products,
  existingUnits = [],
  onImportUnits,
  defaultSector = 'Openbox'
}: ExcelImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
  const [selectedDefaultSector, setSelectedDefaultSector] = useState<DestinationSectorType>(defaultSector);
  const [selectedDefaultPlatform] = useState<PlatformType>('Mercado Livre');
  const [isDragOver, setIsDragOver] = useState(false);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState<string>('');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [filterTab, setFilterTab] = useState<'all' | 'new' | 'duplicates'>('all');
  const [searchFilter, setSearchFilter] = useState('');
  const [, setSerialsFoundTotal] = useState<number>(0);
  const [, setStiFoundTotal] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successReport, setSuccessReport] = useState<{
    importedCount: number;
    ignoredDuplicatesCount: number;
  } | null>(null);

  // Helper to determine sector based on row text or default
  const determineSector = (categoryStr: string, fallback: DestinationSectorType): DestinationSectorType => {
    if (!categoryStr) return fallback;
    const lower = categoryStr.toLowerCase().trim();
    if (lower.includes('openbox') || lower.includes('open box') || lower.includes('revisad') || lower.includes('outlet') || lower.includes('usad')) {
      return 'Openbox';
    }
    if (lower.includes('rma') || lower.includes('defeito') || lower.includes('garantia') || lower.includes('assist')) {
      return 'RMA';
    }
    if (lower.includes('principal') || lower.includes('estoque') || lower.includes('novo')) {
      return 'Principal';
    }
    return fallback;
  };

  // Helper to determine package status based on text
  const determinePackageStatus = (pkgStr: string): PackageStatusType => {
    if (!pkgStr) return 'Perfeita';
    const lower = pkgStr.toLowerCase().trim();
    if (lower.includes('sem') || lower.includes('fora') || lower.includes('avulso') || lower.includes('s/ caixa') || lower.includes('sem / caixa')) {
      return 'Sem Embalagem';
    }
    if (lower.includes('danificad') || lower.includes('rasgad') || lower.includes('amassad') || lower.includes('avariad')) {
      return 'Danificada';
    }
    return 'Perfeita';
  };

  /**
   * Recalculate duplicate status for all rows against current stock and intra-file occurrences
   */
  const evaluateDuplicates = (
    rows: Array<Omit<ParsedRow, 'duplicateInfo'> & { duplicateInfo?: DuplicateInfo }>
  ): ParsedRow[] => {
    const seenStis = new Map<string, number>(); // normalized STI -> row index
    const seenSerials = new Map<string, number>(); // normalized Serial -> row index

    return rows.map((row, idx) => {
      const normSti = (row.sti || '').trim().toUpperCase();
      const normSerial = (row.serialNumber || '').trim().toUpperCase();

      const hasSti = normSti !== '';
      const hasSerial = normSerial !== '';

      let duplicateInfo: DuplicateInfo = {
        isDuplicate: false,
        reason: 'none',
        detail: '',
        matchedField: 'none'
      };

      if (hasSti || hasSerial) {
        // 1. Check existing stock in database for STI collision
        const matchStiStock = hasSti
          ? existingUnits.find(u => {
              const uSti = (u.trackingCode || '').trim().toUpperCase();
              return uSti !== '' && uSti === normSti;
            })
          : undefined;

        // 2. Check existing stock in database for Serial collision
        const matchSerialStock = hasSerial
          ? existingUnits.find(u => {
              const uSerial = (u.serialNumber || '').trim().toUpperCase();
              return uSerial !== '' && uSerial === normSerial;
            })
          : undefined;

        if (matchStiStock && matchSerialStock) {
          duplicateInfo = {
            isDuplicate: true,
            reason: 'both_in_stock',
            detail: `Código STI "${row.sti}" e Serial "${row.serialNumber}" já constam no Estoque Físico (${matchStiStock.baseProductSku} • Setor: ${matchStiStock.destinationSector || 'Estoque'}).`,
            matchedField: 'both',
            matchedExistingUnit: matchStiStock
          };
        } else if (matchStiStock) {
          duplicateInfo = {
            isDuplicate: true,
            reason: 'sti_in_stock',
            detail: `Código STI "${row.sti}" já consta no Estoque Físico (${matchStiStock.baseProductSku} • Setor: ${matchStiStock.destinationSector || 'Estoque'}).`,
            matchedField: 'sti',
            matchedExistingUnit: matchStiStock
          };
        } else if (matchSerialStock) {
          duplicateInfo = {
            isDuplicate: true,
            reason: 'serial_in_stock',
            detail: `Número de Série "${row.serialNumber}" já consta no Estoque Físico (${matchSerialStock.baseProductSku} • Setor: ${matchSerialStock.destinationSector || 'Estoque'}).`,
            matchedField: 'serial',
            matchedExistingUnit: matchSerialStock
          };
        } else {
          // 3. Check for intra-spreadsheet duplicate occurrences
          const isStiDupInFile = hasSti && seenStis.has(normSti);
          const isSerialDupInFile = hasSerial && seenSerials.has(normSerial);

          if (isStiDupInFile && isSerialDupInFile) {
            const firstRowSti = (seenStis.get(normSti)! + 1);
            const firstRowSerial = (seenSerials.get(normSerial)! + 1);
            duplicateInfo = {
              isDuplicate: true,
              reason: 'both_in_file',
              detail: `STI e Serial duplicados na planilha (STI linha ${firstRowSti}, Serial linha ${firstRowSerial}).`,
              matchedField: 'both'
            };
          } else if (isStiDupInFile) {
            const firstRowSti = (seenStis.get(normSti)! + 1);
            duplicateInfo = {
              isDuplicate: true,
              reason: 'sti_in_file',
              detail: `Código STI "${row.sti}" duplicado na própria planilha (aparece primeiro na linha ${firstRowSti}).`,
              matchedField: 'sti'
            };
          } else if (isSerialDupInFile) {
            const firstRowSerial = (seenSerials.get(normSerial)! + 1);
            duplicateInfo = {
              isDuplicate: true,
              reason: 'serial_in_file',
              detail: `Serial "${row.serialNumber}" duplicado na própria planilha (aparece primeiro na linha ${firstRowSerial}).`,
              matchedField: 'serial'
            };
          }
        }

        // Track first occurrences in file
        if (hasSti && !seenStis.has(normSti)) {
          seenStis.set(normSti, idx);
        }
        if (hasSerial && !seenSerials.has(normSerial)) {
          seenSerials.set(normSerial, idx);
        }
      }

      return {
        ...row,
        duplicateInfo,
        // If it's duplicate, keep selected false by default to prevent re-adding
        selected: duplicateInfo.isDuplicate ? false : (row.selected ?? true)
      };
    });
  };

  const handleProcessFile = async (file: File, sheetName?: string) => {
    setErrorMsg(null);
    setCurrentFile(file);
    setFileName(file.name);
    setIsProcessing(true);
    setSuccessReport(null);

    try {
      const result = await parseStockInventoryExcelFile(file, sheetName);

      if (!result.success || result.rows.length === 0) {
        setErrorMsg(result.errors.length > 0 ? result.errors[0] : 'Nenhum produto válido encontrado nesta aba da planilha.');
        setIsProcessing(false);
        setAvailableSheets(result.availableSheets || []);
        setActiveSheet(result.activeSheetName || '');
        return;
      }

      setAvailableSheets(result.availableSheets || []);
      setActiveSheet(result.activeSheetName || '');
      setSerialsFoundTotal(result.serialsFoundCount);
      setStiFoundTotal(result.stiFoundCount);

      const rawMapped = result.rows.map((row, idx) => {
        const cleanSku = row.sku.trim().toUpperCase();
        const matchedProduct = products.find(p => p.sku && p.sku.trim().toUpperCase() === cleanSku);

        const destSector = determineSector(row.categoryOrSector || (matchedProduct ? matchedProduct.category : ''), selectedDefaultSector);
        const pkgStatus = determinePackageStatus(row.packaging);

        const stiCode = row.sti && row.sti.trim() !== '' ? row.sti.trim() : '';
        const serialCode = row.serialNumber && row.serialNumber.trim() !== '' ? row.serialNumber.trim() : '';

        return {
          id: `row-${idx}-${Date.now()}`,
          sku: cleanSku || (matchedProduct ? matchedProduct.sku : 'SKU-INDEF'),
          sti: stiCode,
          serialNumber: serialCode,
          productName: row.productName || (matchedProduct ? matchedProduct.name : 'Produto sem Descrição'),
          brand: row.brand || (matchedProduct ? matchedProduct.brand : ''),
          category: row.categoryOrSector || (matchedProduct ? matchedProduct.category : ''),
          packaging: row.packaging || 'Na caixa',
          observations: row.observations || '',
          customerReason: row.customerReason || '',
          categoryOrSector: row.categoryOrSector || destSector,
          destinationSector: destSector,
          packageStatus: pkgStatus,
          matchedProduct,
          selected: true
        };
      });

      // Run duplicate evaluation across all rows
      const evaluatedRows = evaluateDuplicates(rawMapped);
      setParsedRows(evaluatedRows);
      setIsProcessing(false);
    } catch (err: any) {
      console.error('Failed to parse Excel:', err);
      setErrorMsg(`Erro ao ler planilha: ${err?.message || 'Arquivo corrompido ou formato inválido'}`);
      setIsProcessing(false);
    }
  };

  const handleSelectSheet = (sheetName: string) => {
    if (!currentFile || sheetName === activeSheet) return;
    handleProcessFile(currentFile, sheetName);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleProcessFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleProcessFile(e.dataTransfer.files[0]);
    }
  };

  const handleToggleRow = (id: string) => {
    setParsedRows(prev => prev.map(r => r.id === id ? { ...r, selected: !r.selected } : r));
  };

  const handleSelectOnlyNew = () => {
    setParsedRows(prev => prev.map(r => ({
      ...r,
      selected: !r.duplicateInfo.isDuplicate
    })));
  };

  const handleDeselectAll = () => {
    setParsedRows(prev => prev.map(r => ({ ...r, selected: false })));
  };

  const handleSelectAll = () => {
    setParsedRows(prev => prev.map(r => ({ ...r, selected: true })));
  };

  const handleUpdateRowSector = (id: string, sector: DestinationSectorType) => {
    setParsedRows(prev => prev.map(r => r.id === id ? { ...r, destinationSector: sector } : r));
  };

  const handleUpdateRowField = (
    id: string, 
    field: 'sti' | 'serialNumber' | 'observations' | 'brand' | 'category' | 'packaging', 
    value: string
  ) => {
    setParsedRows(prev => {
      const updatedList = prev.map(r => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: value };
        if (field === 'packaging') {
          updated.packageStatus = determinePackageStatus(value);
        }
        return updated;
      });

      // If sti or serialNumber changed, re-evaluate duplicates dynamically
      if (field === 'sti' || field === 'serialNumber') {
        return evaluateDuplicates(updatedList);
      }
      return updatedList;
    });
  };

  // Download Sample Template
  const handleDownloadSample = () => {
    downloadStockInventoryTemplate();
  };

  // Confirm Import into Database (STRICTLY omitting duplicates)
  const handleConfirmImport = async () => {
    // Only import rows that are selected AND NOT DUPLICATE (guaranteeing duplicates are never added again)
    const validSelectedRows = parsedRows.filter(r => r.selected && !r.duplicateInfo.isDuplicate);
    const ignoredDuplicates = parsedRows.filter(r => r.duplicateInfo.isDuplicate);

    if (validSelectedRows.length === 0) {
      setErrorMsg('Nenhum produto novo válido selecionado para importação. Itens duplicados com STI ou Serial já existentes no estoque não podem ser adicionados novamente.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);

    try {
      const triageUnitsToSave: TriageUnit[] = validSelectedRows.map((row, idx) => {
        const timestamp = new Date(Date.now() + idx * 1000).toISOString();

        // Determinar o Motivo da Devolução sem misturar com as Observações
        const defaultReason = row.destinationSector === 'Openbox' ? 'Inventário OpenBox' : 'Entrada de Estoque';
        const finalCustomerReason = row.customerReason && row.customerReason.trim() !== '' 
          ? row.customerReason.trim() 
          : defaultReason;

        return {
          id: `tr-excel-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
          trackingCode: row.sti.trim(),
          serialNumber: row.serialNumber && row.serialNumber.trim() !== '' ? row.serialNumber.trim() : '',
          baseProductId: row.matchedProduct?.id || `bp-import-${row.sku}`,
          baseProductName: row.productName,
          baseProductSku: row.sku,
          baseProductVoltage: row.matchedProduct?.voltage || 'N/A',
          platform: selectedDefaultPlatform,
          customerReason: finalCustomerReason,
          deviceStatus: row.destinationSector === 'Principal' ? 'Novo' : 'Usado',
          packageStatus: row.packageStatus,
          accessoriesInclusion: row.packaging ? `Embalagem: ${row.packaging}` : 'Conforme inventário',
          destinationSector: row.destinationSector,
          notes: row.observations ? row.observations.trim() : '',
          photosProduct: (row.destinationSector === 'Principal' && row.matchedProduct?.imageUrl) ? [row.matchedProduct.imageUrl] : [],
          photosBox: [],
          photosAccessories: [],
          createdAt: timestamp,
          status: 'Estoque',
          source: 'migration',
          isMigration: true
        };
      });

      await onImportUnits(triageUnitsToSave);
      setSuccessReport({
        importedCount: triageUnitsToSave.length,
        ignoredDuplicatesCount: ignoredDuplicates.length
      });
      setIsProcessing(false);

      setTimeout(() => {
        onClose();
        setParsedRows([]);
        setFileName(null);
        setCurrentFile(null);
        setAvailableSheets([]);
        setActiveSheet('');
        setSuccessReport(null);
      }, 2200);

    } catch (err: any) {
      console.error('Error importing units:', err);
      setErrorMsg(`Erro ao salvar unidades no banco de dados: ${err?.message || err}`);
      setIsProcessing(false);
    }
  };

  // Metrics computation
  const metrics = useMemo(() => {
    const total = parsedRows.length;
    const duplicates = parsedRows.filter(r => r.duplicateInfo.isDuplicate);
    const newItems = parsedRows.filter(r => !r.duplicateInfo.isDuplicate);
    const selectedNew = newItems.filter(r => r.selected);
    const selectedDuplicates = duplicates.filter(r => r.selected);

    return {
      total,
      duplicatesCount: duplicates.length,
      newCount: newItems.length,
      selectedNewCount: selectedNew.length,
      selectedDuplicatesCount: selectedDuplicates.length,
      selectedTotal: parsedRows.filter(r => r.selected).length
    };
  }, [parsedRows]);

  // Filtered rows for the table view
  const displayedRows = useMemo(() => {
    return parsedRows.filter(row => {
      // 1. Tab Filter
      if (filterTab === 'new' && row.duplicateInfo.isDuplicate) return false;
      if (filterTab === 'duplicates' && !row.duplicateInfo.isDuplicate) return false;

      // 2. Search query filter
      if (searchFilter.trim() !== '') {
        const query = searchFilter.toLowerCase().trim();
        const matchSku = row.sku.toLowerCase().includes(query);
        const matchSti = row.sti.toLowerCase().includes(query);
        const matchSerial = row.serialNumber.toLowerCase().includes(query);
        const matchName = row.productName.toLowerCase().includes(query);
        const matchBrand = (row.brand || '').toLowerCase().includes(query);
        const matchDetail = row.duplicateInfo.detail.toLowerCase().includes(query);
        return matchSku || matchSti || matchSerial || matchName || matchBrand || matchDetail;
      }
      return true;
    });
  }, [parsedRows, filterTab, searchFilter]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[90] overflow-y-auto" id="modal-excel-import">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-6xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-800 bg-slate-950 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20 shrink-0">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-bold text-white">
                  Importar Planilha no Estoque Físico
                </h3>
                <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] uppercase font-mono rounded-md font-bold flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3 text-emerald-400" />
                  Antiduplicação STI / Serial
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Produtos com <strong>Código STI</strong> ou <strong>Serial (S/N)</strong> já cadastrados no estoque são detectados automaticamente e não são duplicados.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            id="btn-close-excel-modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">

          {/* Success Banner */}
          {successReport && (
            <div className="p-4 bg-emerald-950/80 border border-emerald-500/50 rounded-xl flex items-start gap-3 text-emerald-200 animate-in fade-in" id="banner-import-success">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-sm">Importação Concluída com Sucesso!</h4>
                <p className="text-xs text-emerald-300 mt-1">
                  <strong>{successReport.importedCount}</strong> novos produtos foram adicionados ao estoque físico com códigos STI e Seriais preservados.
                </p>
                {successReport.ignoredDuplicatesCount > 0 && (
                  <p className="text-xs text-emerald-400/90 font-medium mt-0.5">
                    🛡️ <strong>{successReport.ignoredDuplicatesCount}</strong> itens repetidos (com STI ou Serial já existentes) foram ignorados e não foram duplicados no banco.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Error Banner */}
          {errorMsg && (
            <div className="p-4 bg-rose-950/80 border border-rose-500/50 rounded-xl flex items-start gap-3 text-rose-200 animate-in fade-in" id="banner-import-error">
              <AlertCircle className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
              <div className="text-xs">
                <h4 className="font-bold">Atenção ao importar arquivo:</h4>
                <p className="mt-0.5">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* Sheet Selector (Abas do Excel) if workbook has multiple sheets */}
          {availableSheets.length > 1 && (
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2.5 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Layers2 className="w-4 h-4 text-sky-400" />
                  <span>Abas Detectadas na Planilha ({availableSheets.length}):</span>
                </span>
                <span className="text-[11px] text-slate-400">
                  Clique para alternar entre as abas do arquivo Excel
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {availableSheets.map((sheet) => {
                  const isSelected = sheet === activeSheet;
                  return (
                    <button
                      key={sheet}
                      type="button"
                      onClick={() => handleSelectSheet(sheet)}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                        isSelected
                          ? 'bg-sky-600 text-white shadow-md shadow-sky-600/20 ring-1 ring-sky-400'
                          : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                      }`}
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>{sheet}</span>
                      {isSelected && (
                        <span className="text-[10px] bg-white/20 px-1.5 py-0.2 rounded font-mono">Ativa</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Upload Area / Config options if no file uploaded yet */}
          {parsedRows.length === 0 ? (
            <div className="space-y-5">
              
              {/* Default Configurations */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-850">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Setor Padrão de Destino
                  </label>
                  <select
                    value={selectedDefaultSector}
                    onChange={(e) => setSelectedDefaultSector(e.target.value as DestinationSectorType)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-bold text-white focus:outline-none focus:border-sky-500 cursor-pointer"
                  >
                    <option value="Openbox">Openbox (Revisados / Devoluções)</option>
                    <option value="Principal">Estoque Principal (Novos / Prontos)</option>
                    <option value="RMA">RMA (Assistência Técnica / Defeitos)</option>
                  </select>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Itens contendo indicações de RMA ou defeito na planilha serão direcionados automaticamente.
                  </p>
                </div>
              </div>

              {/* Drag & Drop Upload Zone */}
              <div 
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center space-y-3 ${
                  isDragOver 
                    ? 'border-sky-400 bg-sky-500/10 scale-[1.01]' 
                    : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-950'
                }`}
                id="dropzone-excel"
              >
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".xlsx,.xls,.csv"
                  className="hidden" 
                  id="input-file-excel"
                />
                <div className="p-4 bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20">
                  <Upload className="w-8 h-8" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">
                    Clique aqui ou arraste seu arquivo Excel (.xlsx, .xls, .csv)
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Reconhecimento das colunas na ordem exata: <strong className="text-sky-300">A: STI</strong>, <strong className="text-cyan-300">B: SKU</strong>, <strong className="text-amber-300">C: DESCRIÇÃO DO PRODUTO</strong>, <strong className="text-emerald-300">D: SERIAL</strong>, <strong className="text-orange-300">E: SITUAÇÃO</strong> e <strong className="text-rose-300">F: OBSERVAÇÃO</strong>.
                  </p>
                </div>
              </div>

              {/* Antiduplication Rules Summary Box */}
              <div className="p-4 bg-sky-500/5 border border-sky-500/20 rounded-xl flex items-start gap-3">
                <Info className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
                <div className="text-xs text-slate-300 space-y-1">
                  <span className="font-bold text-white block">Regra de Proteção contra Duplicidade:</span>
                  <p className="text-slate-400 leading-relaxed">
                    O sistema verifica instantaneamente as <strong>{existingUnits.length}</strong> unidades do estoque físico atual. Qualquer produto da planilha com <strong>Código STI idêntico</strong> ou <strong>Número de Série idêntico</strong> será sinalizado em destaque e desmarcado por padrão, impedindo que o mesmo item seja cadastrado repetidamente.
                  </p>
                </div>
              </div>

              {/* Download Sample Template Banner */}
              <div className="flex flex-col sm:flex-row items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-850 gap-3">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-sky-400 shrink-0" />
                  <div className="text-xs">
                    <span className="font-bold text-white block">Precisa de um modelo estruturado?</span>
                    <span className="text-slate-400">Baixe a planilha de exemplo idêntica ao padrão com STI, SKU, Descrição, Serial, Situação e Observação.</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadSample}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
                  id="btn-download-sample-excel"
                >
                  <Download className="w-4 h-4 text-emerald-400" />
                  <span>Baixar Planilha Exemplo</span>
                </button>
              </div>

            </div>
          ) : (
            /* Parsed Rows Preview Section */
            <div className="space-y-4">
              
              {/* Top Summary / Status Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Total na Planilha */}
                <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Total na Planilha</span>
                    <div className="flex items-baseline gap-2 mt-0.5">
                      <span className="text-xl font-black text-white">{metrics.total}</span>
                      <span className="text-xs text-slate-500">itens lidos</span>
                    </div>
                  </div>
                  <div className="p-2.5 bg-slate-900 text-slate-300 rounded-lg border border-slate-800">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                </div>

                {/* Novos / Prontos para Importar */}
                <div className="p-3.5 bg-emerald-950/20 rounded-xl border border-emerald-500/30 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-semibold text-emerald-300 uppercase tracking-wider block">Novos (Aptos)</span>
                    <div className="flex items-baseline gap-2 mt-0.5">
                      <span className="text-xl font-black text-emerald-400">{metrics.newCount}</span>
                      <span className="text-xs text-emerald-500/80">({metrics.selectedNewCount} selecionados)</span>
                    </div>
                  </div>
                  <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
                    <CheckCheck className="w-5 h-5" />
                  </div>
                </div>

                {/* Repetidos / Ignorados */}
                <div className={`p-3.5 rounded-xl border flex items-center justify-between transition-colors ${
                  metrics.duplicatesCount > 0 
                    ? 'bg-rose-950/25 border-rose-500/40 text-rose-300' 
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}>
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider block flex items-center gap-1">
                      {metrics.duplicatesCount > 0 && <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />}
                      Repetidos no Estoque
                    </span>
                    <div className="flex items-baseline gap-2 mt-0.5">
                      <span className={`text-xl font-black ${metrics.duplicatesCount > 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                        {metrics.duplicatesCount}
                      </span>
                      <span className="text-xs text-slate-500">
                        {metrics.duplicatesCount > 0 ? 'ignorados por padrão' : 'nenhum repetido'}
                      </span>
                    </div>
                  </div>
                  <div className={`p-2.5 rounded-lg border ${
                    metrics.duplicatesCount > 0 
                      ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' 
                      : 'bg-slate-900 text-slate-600 border-slate-800'
                  }`}>
                    <Copy className="w-5 h-5" />
                  </div>
                </div>
              </div>

              {/* Repetition Alert Banner (if duplicates exist) */}
              {metrics.duplicatesCount > 0 && (
                <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-3 text-amber-200 text-xs animate-in fade-in">
                  <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="font-bold text-amber-300 block">
                      ⚠️ Atenção: {metrics.duplicatesCount} {metrics.duplicatesCount === 1 ? 'item repetido detectado' : 'itens repetidos detectados'}
                    </span>
                    <p className="text-amber-300/90 leading-relaxed">
                      Estes produtos já possuem o <strong>Código STI</strong> ou <strong>Número de Série</strong> cadastrados no estoque físico atual (ou duplicados na planilha). Eles foram <strong>desmarcados automaticamente</strong> para evitar cadastros duplicados.
                    </p>
                  </div>
                </div>
              )}

              {/* Action Bar & Filter Tabs */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                
                {/* Filter Tabs */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setFilterTab('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      filterTab === 'all'
                        ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                        : 'bg-slate-900/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Todos ({metrics.total})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterTab('new')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      filterTab === 'new'
                        ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20'
                        : 'bg-slate-900/60 hover:bg-emerald-950/30 text-emerald-400 hover:text-emerald-300'
                    }`}
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>Novos ({metrics.newCount})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterTab('duplicates')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      filterTab === 'duplicates'
                        ? 'bg-rose-600 text-white shadow-sm shadow-rose-600/20'
                        : 'bg-slate-900/60 hover:bg-rose-950/30 text-rose-400 hover:text-rose-300'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Repetidos ({metrics.duplicatesCount})</span>
                  </button>
                </div>

                {/* Search in preview */}
                <div className="flex items-center gap-2 w-full md:w-auto">
                  <div className="relative flex-1 md:w-64">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      placeholder="Filtrar por SKU, STI, Serial..."
                      className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                    />
                    {searchFilter && (
                      <button 
                        onClick={() => setSearchFilter('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Batch Selection Helpers */}
                  <button
                    type="button"
                    onClick={handleSelectOnlyNew}
                    className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-sky-400 hover:text-sky-300 border border-slate-800 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0"
                    title="Selecionar apenas os itens novos e desmarcar todos os repetidos"
                  >
                    Marcar Novos
                  </button>
                  <button
                    type="button"
                    onClick={handleDeselectAll}
                    className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0"
                  >
                    Limpar
                  </button>
                  <button
                    type="button"
                    onClick={() => { setParsedRows([]); setFileName(null); setCurrentFile(null); setAvailableSheets([]); }}
                    className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-300 border border-slate-800 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0"
                    title="Carregar outro arquivo"
                  >
                    Trocar
                  </button>
                </div>

              </div>

              {/* Table Preview List */}
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950 max-h-[380px] overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-900 sticky top-0 z-10 text-slate-400 border-b border-slate-800 font-mono uppercase text-[10px]">
                    <tr>
                      <th className="p-3 w-10 text-center">
                        <input 
                          type="checkbox"
                          checked={metrics.newCount > 0 && metrics.selectedNewCount === metrics.newCount}
                          onChange={(e) => {
                            if (e.target.checked) {
                              handleSelectOnlyNew();
                            } else {
                              handleDeselectAll();
                            }
                          }}
                          className="w-4 h-4 rounded text-sky-500 bg-slate-950 border-slate-700 cursor-pointer"
                          title="Selecionar todos os novos itens válidos"
                        />
                      </th>
                      <th className="p-3 min-w-[110px]">Status / Validação</th>
                      <th className="p-3 min-w-[130px] text-sky-400">A: Código STI</th>
                      <th className="p-3 min-w-[100px] text-cyan-400">B: SKU</th>
                      <th className="p-3 min-w-[180px] text-amber-400">C: Descrição do Produto</th>
                      <th className="p-3 min-w-[140px] text-emerald-400">D: Serial (S/N)</th>
                      <th className="p-3 min-w-[110px] text-orange-400">E: Situação</th>
                      <th className="p-3 min-w-[140px] text-rose-400">F: Observações</th>
                      <th className="p-3">Destino</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850">
                    {displayedRows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-8 text-center text-slate-500 text-xs">
                          {searchFilter 
                            ? 'Nenhum item encontrado com o termo filtrado.' 
                            : filterTab === 'duplicates'
                            ? 'Nenhum produto repetido encontrado nesta planilha.'
                            : 'Nenhum item disponível para visualização.'}
                        </td>
                      </tr>
                    ) : (
                      displayedRows.map((row, rowIdx) => {
                        const isDup = row.duplicateInfo.isDuplicate;
                        const isStiDup = row.duplicateInfo.matchedField === 'sti' || row.duplicateInfo.matchedField === 'both';
                        const isSerialDup = row.duplicateInfo.matchedField === 'serial' || row.duplicateInfo.matchedField === 'both';

                        return (
                          <tr 
                            key={row.id}
                            className={`transition-colors ${
                              isDup 
                                ? 'bg-rose-950/20 hover:bg-rose-950/30' 
                                : row.selected 
                                ? 'bg-slate-900/30 hover:bg-slate-900/50' 
                                : 'opacity-60 bg-slate-950 hover:opacity-100 hover:bg-slate-900/20'
                            }`}
                          >
                            {/* Checkbox */}
                            <td className="p-3 text-center">
                              <input 
                                type="checkbox"
                                checked={row.selected}
                                onChange={() => handleToggleRow(row.id)}
                                className={`w-4 h-4 rounded cursor-pointer ${
                                  isDup 
                                    ? 'text-rose-500 bg-rose-950 border-rose-700' 
                                    : 'text-sky-500 bg-slate-950 border-slate-700'
                                }`}
                                title={isDup ? 'Item repetido (não será importado a menos que o STI/Serial seja corrigido)' : 'Selecionar para importação'}
                              />
                            </td>

                            {/* Status / Duplicate Badge */}
                            <td className="p-3 whitespace-nowrap">
                              {isDup ? (
                                <div className="space-y-1">
                                  <span 
                                    className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 inline-flex items-center gap-1 font-mono"
                                    title={row.duplicateInfo.detail}
                                  >
                                    <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
                                    {row.duplicateInfo.reason.includes('sti') && row.duplicateInfo.reason.includes('serial')
                                      ? 'STI + Serial Repetidos'
                                      : row.duplicateInfo.reason.includes('sti')
                                      ? 'STI Repetido'
                                      : 'Serial Repetido'}
                                  </span>
                                  <span 
                                    className="block text-[9px] text-rose-400/90 font-medium truncate max-w-[140px]" 
                                    title={row.duplicateInfo.detail}
                                  >
                                    {row.duplicateInfo.detail}
                                  </span>
                                </div>
                              ) : (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-1 font-mono">
                                  <CheckCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                                  Novo Item
                                </span>
                              )}
                            </td>

                            {/* Col A: STI */}
                            <td className="p-3 font-mono text-xs">
                              <div className="space-y-1">
                                <input 
                                  type="text"
                                  value={row.sti || ''}
                                  onChange={(e) => handleUpdateRowField(row.id, 'sti', e.target.value)}
                                  placeholder="STI..."
                                  className={`w-full px-2 py-1 rounded text-xs font-mono font-bold border transition-colors ${
                                    isStiDup
                                      ? 'bg-rose-950/70 text-rose-200 border-rose-500 ring-1 ring-rose-500/50'
                                      : 'bg-sky-950/50 text-sky-300 border-sky-500/40 focus:border-sky-400 focus:bg-sky-950/80'
                                  }`}
                                  title={isStiDup ? `STI repetido: ${row.duplicateInfo.detail}` : 'Código STI / Rastreio da Devolução (Coluna A)'}
                                />
                                {isStiDup && (
                                  <span className="text-[9px] text-rose-400 font-bold block">
                                    ⚠️ STI já em estoque
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Col B: SKU */}
                            <td className="p-3 font-mono font-bold text-cyan-400">
                              <div>
                                <span>{row.sku}</span>
                                {row.matchedProduct ? (
                                  <span className="block text-[9px] text-emerald-400 font-semibold font-sans">
                                    ✓ No Catálogo
                                  </span>
                                ) : (
                                  <span className="block text-[9px] text-amber-400 font-semibold font-sans">
                                    Novo SKU
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Col C: Descrição do Produto */}
                            <td className="p-3 text-white font-medium max-w-[200px] truncate" title={row.productName}>
                              {row.productName}
                              {row.brand && (
                                <span className="block text-[10px] text-slate-400 font-normal">
                                  Marca: {row.brand}
                                </span>
                              )}
                            </td>

                            {/* Col D: Serial Number */}
                            <td className="p-3 font-mono text-xs">
                              <div className="space-y-1">
                                <input 
                                  type="text"
                                  value={row.serialNumber || ''}
                                  onChange={(e) => handleUpdateRowField(row.id, 'serialNumber', e.target.value)}
                                  placeholder="Sem Serial"
                                  className={`w-full px-2 py-1 rounded text-xs font-mono font-bold border transition-colors ${
                                    isSerialDup
                                      ? 'bg-rose-950/70 text-rose-200 border-rose-500 ring-1 ring-rose-500/50'
                                      : row.serialNumber 
                                      ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/40 focus:border-emerald-400 focus:bg-emerald-950/70' 
                                      : 'bg-slate-900 text-slate-500 border-slate-800 focus:border-sky-500 focus:text-white placeholder:text-slate-600'
                                  }`}
                                  title={isSerialDup ? `Serial repetido: ${row.duplicateInfo.detail}` : 'Número de Série do Fabricante (Hardware) (Coluna D)'}
                                />
                                {isSerialDup && (
                                  <span className="text-[9px] text-rose-400 font-bold block">
                                    ⚠️ Serial já em estoque
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Col E: Situação / Embalagem */}
                            <td className="p-3 text-slate-300">
                              <span className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${
                                row.packaging.toLowerCase().includes('sem') 
                                  ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                                  : 'bg-slate-800 border-slate-700 text-slate-300'
                              }`}>
                                {row.packaging}
                              </span>
                            </td>

                            {/* Col F: Observações */}
                            <td className="p-3 text-slate-300 max-w-[160px] truncate" title={row.observations}>
                              {row.observations ? (
                                <span className="text-rose-300 font-medium">{row.observations}</span>
                              ) : (
                                <span className="text-slate-600 italic">-</span>
                              )}
                            </td>

                            {/* Destino */}
                            <td className="p-3">
                              <select
                                value={row.destinationSector}
                                onChange={(e) => handleUpdateRowSector(row.id, e.target.value as DestinationSectorType)}
                                className={`px-2 py-1 rounded text-[10px] font-bold border focus:outline-none cursor-pointer ${
                                  row.destinationSector === 'Openbox' 
                                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' 
                                    : row.destinationSector === 'Principal'
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                    : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                }`}
                              >
                                <option value="Openbox">Openbox</option>
                                <option value="Principal">Estoque Principal</option>
                                <option value="RMA">RMA</option>
                              </select>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="p-5 border-t border-slate-800 bg-slate-950 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 font-bold rounded-xl text-xs transition-colors cursor-pointer"
            >
              Cancelar
            </button>

            {parsedRows.length > 0 && (
              <div className="text-xs text-slate-400">
                <span>{metrics.selectedNewCount} novos itens selecionados</span>
                {metrics.duplicatesCount > 0 && (
                  <span className="text-rose-400 font-medium ml-1">
                    ({metrics.duplicatesCount} repetidos ignorados)
                  </span>
                )}
              </div>
            )}
          </div>

          {parsedRows.length > 0 && (
            <button
              type="button"
              disabled={isProcessing || metrics.selectedNewCount === 0}
              onClick={handleConfirmImport}
              className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 cursor-pointer"
              id="btn-confirm-excel-import"
            >
              {isProcessing ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Importando Produtos Novos...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    Importar {metrics.selectedNewCount} {metrics.selectedNewCount === 1 ? 'Item Novo' : 'Itens Novos'}
                    {metrics.duplicatesCount > 0 ? ` (Ignorando ${metrics.duplicatesCount} repetidos)` : ''}
                  </span>
                </>
              )}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
