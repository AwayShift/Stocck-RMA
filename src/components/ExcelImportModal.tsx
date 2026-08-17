/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { 
  FileSpreadsheet, 
  Upload, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Check, 
  Package, 
  Sparkles, 
  Download, 
  ArrowRight,
  Layers,
  HelpCircle,
  FileText,
  Hash,
  Barcode,
  Layers2
} from 'lucide-react';
import { BaseProduct, TriageUnit, DestinationSectorType, PlatformType, PackageStatusType } from '../types';
import { parseStockInventoryExcelFile, downloadStockInventoryTemplate } from '../utils/excelHelpers';

interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: BaseProduct[];
  onImportUnits: (units: TriageUnit[]) => Promise<void>;
  defaultSector?: DestinationSectorType;
}

interface ParsedRow {
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
  selected: boolean;
}

export default function ExcelImportModal({
  isOpen,
  onClose,
  products,
  onImportUnits,
  defaultSector = 'Openbox'
}: ExcelImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
  const [selectedDefaultSector, setSelectedDefaultSector] = useState<DestinationSectorType>(defaultSector);
  const [selectedDefaultPlatform, setSelectedDefaultPlatform] = useState<PlatformType>('Mercado Livre');
  const [isDragOver, setIsDragOver] = useState(false);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState<string>('');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [serialsFoundTotal, setSerialsFoundTotal] = useState<number>(0);
  const [stiFoundTotal, setStiFoundTotal] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState<number | null>(null);

  if (!isOpen) return null;

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

  const handleProcessFile = async (file: File, sheetName?: string) => {
    setErrorMsg(null);
    setCurrentFile(file);
    setFileName(file.name);
    setIsProcessing(true);

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

      const mapped: ParsedRow[] = result.rows.map((row, idx) => {
        const cleanSku = row.sku.trim().toUpperCase();
        const matchedProduct = products.find(p => p.sku && p.sku.trim().toUpperCase() === cleanSku);

        const destSector = determineSector(row.categoryOrSector || (matchedProduct ? matchedProduct.category : ''), selectedDefaultSector);
        const pkgStatus = determinePackageStatus(row.packaging);

        // Keep explicit STI if provided, else generate unique clean identifier
        const stiCode = row.sti && row.sti.trim() !== '' 
          ? row.sti.trim() 
          : `STI-${cleanSku || 'OB'}-${Math.floor(10000 + Math.random() * 90000)}`;

        return {
          id: `row-${idx}-${Date.now()}`,
          sku: cleanSku || (matchedProduct ? matchedProduct.sku : 'SKU-INDEF'),
          sti: stiCode,
          serialNumber: row.serialNumber ? row.serialNumber.trim() : '',
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

      setParsedRows(mapped);
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

  const handleToggleAllRows = () => {
    const allSelected = parsedRows.every(r => r.selected);
    setParsedRows(prev => prev.map(r => ({ ...r, selected: !allSelected })));
  };

  const handleUpdateRowSector = (id: string, sector: DestinationSectorType) => {
    setParsedRows(prev => prev.map(r => r.id === id ? { ...r, destinationSector: sector } : r));
  };

  const handleUpdateRowField = (id: string, field: 'sti' | 'serialNumber' | 'observations' | 'brand' | 'category' | 'packaging', value: string) => {
    setParsedRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      const updated = { ...r, [field]: value };
      if (field === 'packaging') {
        updated.packageStatus = determinePackageStatus(value);
      }
      return updated;
    }));
  };

  // Download Sample Template
  const handleDownloadSample = () => {
    downloadStockInventoryTemplate();
  };

  // Confirm Import into Database
  const handleConfirmImport = async () => {
    const selectedRows = parsedRows.filter(r => r.selected);
    if (selectedRows.length === 0) {
      alert('Selecione pelo menos um item da tabela para importar.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);

    try {
      const triageUnitsToSave: TriageUnit[] = selectedRows.map((row, idx) => {
        const timestamp = new Date(Date.now() + idx * 1000).toISOString();

        // Determinar o Motivo da Devolução sem misturar com as Observações
        const defaultReason = row.destinationSector === 'Openbox' ? 'Inventário OpenBox' : 'Entrada de Estoque';
        const finalCustomerReason = row.customerReason && row.customerReason.trim() !== '' 
          ? row.customerReason.trim() 
          : defaultReason;

        return {
          id: `tr-excel-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
          // STI estritamente separado
          trackingCode: row.sti.trim(),
          // Serial estritamente separado
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
      setSuccessCount(triageUnitsToSave.length);
      setIsProcessing(false);

      setTimeout(() => {
        onClose();
        setParsedRows([]);
        setFileName(null);
        setCurrentFile(null);
        setAvailableSheets([]);
        setActiveSheet('');
        setSuccessCount(null);
      }, 1800);

    } catch (err: any) {
      console.error('Error importing units:', err);
      setErrorMsg(`Erro ao salvar unidades no banco de dados: ${err?.message || err}`);
      setIsProcessing(false);
    }
  };

  const countSelectedWithSerial = parsedRows.filter(r => r.selected && r.serialNumber && r.serialNumber.trim() !== '').length;
  const countSelectedWithSti = parsedRows.filter(r => r.selected && r.sti && r.sti.trim() !== '').length;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[90] overflow-y-auto" id="modal-excel-import">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-800 bg-slate-950 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                Importar Inventário Excel / Estoque Físico
                <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] uppercase font-mono rounded-md font-bold">
                  OpenBox & Estoque
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Importação precisa com distinção rigorosa entre <strong>Código STI</strong> (Rastreio/Ticket) e <strong>Serial (S/N)</strong> do fabricante.
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
        <div className="p-6 space-y-6 overflow-y-auto flex-1">

          {/* Success Banner */}
          {successCount !== null && (
            <div className="p-4 bg-emerald-950/80 border border-emerald-500/50 rounded-xl flex items-center gap-3 text-emerald-200 animate-in fade-in">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
              <div>
                <h4 className="font-bold text-sm">Importação Concluída com Sucesso!</h4>
                <p className="text-xs text-emerald-300">
                  <strong>{successCount}</strong> produtos foram cadastrados no estoque físico com seus códigos STI e seriais preservados individualmente.
                </p>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {errorMsg && (
            <div className="p-4 bg-rose-950/80 border border-rose-500/50 rounded-xl flex items-center gap-3 text-rose-200 animate-in fade-in">
              <AlertCircle className="w-6 h-6 text-rose-400 shrink-0" />
              <div className="text-xs">
                <h4 className="font-bold">Atenção ao importar arquivo:</h4>
                <p>{errorMsg}</p>
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
                          : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-750'
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
            /* Parsed Rows Preview Table */
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-slate-400 font-mono">Arquivo: <strong className="text-sky-400">{fileName}</strong></span>
                    {activeSheet && (
                      <span className="px-2 py-0.5 bg-slate-800 text-slate-300 border border-slate-700 rounded text-[10px] font-bold font-mono">
                        Aba: {activeSheet}
                      </span>
                    )}
                    {countSelectedWithSti > 0 && (
                      <span className="px-2 py-0.5 bg-sky-500/10 text-sky-300 border border-sky-500/30 rounded text-[10px] font-bold font-mono">
                        #{countSelectedWithSti} com STI
                      </span>
                    )}
                    {countSelectedWithSerial > 0 && (
                      <span className="px-2 py-0.5 bg-amber-500/10 text-amber-300 border border-amber-500/30 rounded text-[10px] font-bold font-mono">
                        ⚡ {countSelectedWithSerial} com Serial (S/N)
                      </span>
                    )}
                  </div>
                  <h4 className="text-sm font-bold text-white">
                    {parsedRows.filter(r => r.selected).length} de {parsedRows.length} itens selecionados para importação
                  </h4>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleToggleAllRows}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg cursor-pointer transition-colors"
                  >
                    {parsedRows.every(r => r.selected) ? 'Deselecionar Todos' : 'Selecionar Todos'}
                  </button>
                  <button
                    onClick={() => { setParsedRows([]); setFileName(null); setCurrentFile(null); setAvailableSheets([]); }}
                    className="px-3 py-1.5 bg-slate-900 border border-slate-800 text-slate-400 hover:text-white text-xs font-bold rounded-lg cursor-pointer"
                  >
                    Trocar Arquivo
                  </button>
                </div>
              </div>

              {/* Table Preview List */}
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950 max-h-[380px] overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-900 sticky top-0 z-10 text-slate-400 border-b border-slate-800 font-mono uppercase text-[10px]">
                    <tr>
                      <th className="p-3 w-10 text-center">#</th>
                      <th className="p-3 min-w-[130px] text-sky-400">A: Código STI</th>
                      <th className="p-3 min-w-[100px] text-cyan-400">B: SKU</th>
                      <th className="p-3 min-w-[200px] text-amber-400">C: Descrição do Produto</th>
                      <th className="p-3 min-w-[140px] text-emerald-400">D: Serial (S/N)</th>
                      <th className="p-3 min-w-[110px] text-orange-400">E: Situação</th>
                      <th className="p-3 min-w-[150px] text-rose-400">F: Observações</th>
                      <th className="p-3">Marca</th>
                      <th className="p-3">Destino</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850">
                    {parsedRows.map((row) => (
                      <tr 
                        key={row.id}
                        className={`hover:bg-slate-900/60 transition-colors ${row.selected ? 'bg-slate-900/30' : 'opacity-50 bg-slate-950'}`}
                      >
                        <td className="p-3 text-center">
                          <input 
                            type="checkbox"
                            checked={row.selected}
                            onChange={() => handleToggleRow(row.id)}
                            className="w-4 h-4 rounded text-sky-500 bg-slate-950 border-slate-700 cursor-pointer"
                          />
                        </td>

                        {/* Col A: STI */}
                        <td className="p-3 font-mono text-xs">
                          <div className="flex items-center gap-1">
                            <input 
                              type="text"
                              value={row.sti || ''}
                              onChange={(e) => handleUpdateRowField(row.id, 'sti', e.target.value)}
                              placeholder="STI..."
                              className="w-full px-2 py-1 rounded text-xs font-mono font-bold bg-sky-950/50 text-sky-300 border border-sky-500/40 focus:border-sky-400 focus:bg-sky-950/80 transition-colors"
                              title="Código STI / Rastreio da Devolução (Coluna A)"
                            />
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
                        <td className="p-3 text-white font-medium max-w-[220px] truncate" title={row.productName}>
                          {row.productName}
                        </td>

                        {/* Col D: Serial Number */}
                        <td className="p-3 font-mono text-xs">
                          <div className="flex items-center gap-1">
                            <input 
                              type="text"
                              value={row.serialNumber || ''}
                              onChange={(e) => handleUpdateRowField(row.id, 'serialNumber', e.target.value)}
                              placeholder="Sem Serial"
                              className={`w-full px-2 py-1 rounded text-xs font-mono font-bold border transition-colors ${
                                row.serialNumber 
                                  ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/40 focus:border-emerald-400 focus:bg-emerald-950/70' 
                                  : 'bg-slate-900 text-slate-500 border-slate-800 focus:border-sky-500 focus:text-white placeholder:text-slate-600'
                              }`}
                              title="Número de Série do Fabricante (Hardware) (Coluna D)"
                            />
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
                        <td className="p-3 text-slate-300 max-w-[180px] truncate" title={row.observations}>
                          {row.observations ? (
                            <span className="text-rose-300 font-medium">{row.observations}</span>
                          ) : (
                            <span className="text-slate-600 italic">-</span>
                          )}
                        </td>

                        {/* Marca */}
                        <td className="p-3 text-slate-300 text-xs font-semibold">
                          {row.brand || <span className="text-slate-600">-</span>}
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
                    ))}
                  </tbody>
                </table>
              </div>

            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="p-5 border-t border-slate-800 bg-slate-950 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 font-bold rounded-xl text-xs transition-colors cursor-pointer"
          >
            Cancelar
          </button>

          {parsedRows.length > 0 && (
            <button
              type="button"
              disabled={isProcessing || parsedRows.filter(r => r.selected).length === 0}
              onClick={handleConfirmImport}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-2 cursor-pointer"
              id="btn-confirm-excel-import"
            >
              {isProcessing ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Importando para o Banco de Dados...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirmar Importação ({parsedRows.filter(r => r.selected).length} Itens)</span>
                </>
              )}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}

