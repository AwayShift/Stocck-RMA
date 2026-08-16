/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
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
  FileText
} from 'lucide-react';
import { BaseProduct, TriageUnit, DestinationSectorType, PlatformType, PackageStatusType } from '../types';

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
  serialNumber?: string;
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
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
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
    if (lower.includes('sem') || lower.includes('fora') || lower.includes('avulso')) {
      return 'Sem Embalagem';
    }
    if (lower.includes('danificad') || lower.includes('rasgad') || lower.includes('amassad') || lower.includes('avariad')) {
      return 'Danificada';
    }
    return 'Perfeita';
  };

  const handleProcessFile = (file: File) => {
    setErrorMsg(null);
    setFileName(file.name);
    setIsProcessing(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Parse to JSON array of objects
        const jsonRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });

        if (jsonRows.length === 0) {
          setErrorMsg('O arquivo importado está vazio ou não possui linhas válidas.');
          setIsProcessing(false);
          return;
        }

        // Map columns dynamically
        const mapped: ParsedRow[] = jsonRows.map((row, idx) => {
          // Flexible key lookup
          const keys = Object.keys(row);
          const getKey = (possibleNames: string[]) => {
            const foundKey = keys.find(k => {
              const kClean = k.toLowerCase().trim();
              return possibleNames.some(p => {
                const pClean = p.toLowerCase().trim();
                return kClean === pClean || kClean.includes(pClean);
              });
            });
            return foundKey ? String(row[foundKey]).trim() : '';
          };

          // Strict search for Serial Number (do not capture STI)
          const getSerialKey = () => {
            const candidates = [
              'número de série', 'numero de serie', 'número de serie', 'numero de série',
              'nº de série', 'nº de serie', 'n° de serie', 'nº serie', 'n° serie', 'num serie',
              's/n', 'sn', 'n/s', 'serial number', 'serial'
            ];
            for (const cand of candidates) {
              const foundKey = keys.find(k => {
                const clean = k.toLowerCase().trim();
                if (clean === cand) return true;
                if (cand === 's/n' || cand === 'sn' || cand === 'n/s') {
                  return clean === 's/n' || clean === 'sn' || clean === 's / n' || clean === 'n/s';
                }
                return clean.includes(cand);
              });
              if (foundKey && String(row[foundKey]).trim()) {
                const val = String(row[foundKey]).trim();
                const upper = val.toUpperCase();
                if (upper !== 'N/A' && upper !== 'SEM SERIAL' && upper !== 'NA' && upper !== '-') {
                  return val;
                }
              }
            }
            return '';
          };

          const sku = getKey(['sku', 'cod', 'código', 'codigo']);
          const sti = getKey(['sti', 'rastreio', 'tracking', 'etiqueta', 'código sti', 'codigo sti']);
          const rawSerial = getSerialKey();

          // Ensure serialNumber is purely the product serial if present in sheet, never STI
          const serialNumber = (rawSerial && rawSerial !== sti) ? rawSerial : '';

          const productName = getKey(['descrição', 'descricao', 'produto', 'nome']);
          const brand = getKey(['marca', 'brand', 'fabricante']);
          const category = getKey(['categoria do produto', 'categoria produto', 'cat', 'categoria', 'segmento', 'grupo']);
          const packaging = getKey(['embalagem', 'caixa', 'pacote']);

          // Observações: exatas da planilha
          const observations = getKey(['observação', 'observações', 'observacao', 'observacoes', 'obs', 'detalhes', 'laudo', 'parecer']);

          // Motivo: apenas se houver coluna explícita de motivo na planilha
          const explicitReason = getKey(['motivo da devolução', 'motivo devolucao', 'motivo de devolução', 'motivo retorno', 'motivo do retorno', 'motivo']);

          const categoryOrSector = getKey(['setor', 'destino', 'categoria/setor']);

          // Match with catalog product if SKU matches
          const matchedProduct = products.find(p => p.sku && sku && p.sku.toLowerCase() === sku.toLowerCase());

          const destSector = determineSector(categoryOrSector || category, selectedDefaultSector);
          const pkgStatus = determinePackageStatus(packaging);

          return {
            id: `row-${idx}-${Date.now()}`,
            sku: sku || (matchedProduct ? matchedProduct.sku : 'SKU-INDEF'),
            sti: sti || `STI-${sku || 'OB'}-${Math.floor(10000 + Math.random() * 90000)}`,
            serialNumber: serialNumber || '',
            productName: productName || (matchedProduct ? matchedProduct.name : 'Produto de Inventário sem Nome'),
            brand: brand || (matchedProduct ? matchedProduct.brand : ''),
            category: category || (matchedProduct ? matchedProduct.category : ''),
            packaging: packaging || 'Na caixa',
            observations: observations || '',
            customerReason: explicitReason || '',
            categoryOrSector: categoryOrSector || category || destSector,
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
        setErrorMsg('Não foi possível ler a planilha Excel. Certifique-se de que é um arquivo .xlsx, .xls ou .csv válido.');
        setIsProcessing(false);
      }
    };

    reader.readAsArrayBuffer(file);
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

  const handleUpdateRowField = (id: string, field: 'serialNumber' | 'observations' | 'brand' | 'category', value: string) => {
    setParsedRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  // Download Sample Template
  const handleDownloadSample = () => {
    const sampleData = [
      {
        'SKU': '1650',
        'STI': '13509873',
        'Número de Série': 'BL-A1-998822',
        'Descrição do produto': 'Impressora 3D Bambu Lab A1 com AMS Lite Combo',
        'Marca': 'Bambu Lab',
        'Categoria': 'Impressão 3D',
        'Embalagem': 'Na caixa',
        'Observações': 'Revisada, sem detalhes de uso, testada e higienizada',
        'Setor': 'Openbox'
      },
      {
        'SKU': 'AIR-FRY-45L',
        'STI': 'ML-88192031',
        'Número de Série': '',
        'Descrição do produto': 'Fritadeira Elétrica AirFryer Touch 4.5L',
        'Marca': 'Mondial',
        'Categoria': 'Eletroportáteis',
        'Embalagem': 'Na caixa',
        'Observações': 'Testada e funcionando 100%',
        'Setor': 'Openbox'
      },
      {
        'SKU': 'ASP-VRT-1600',
        'STI': 'SHP-7729102',
        'Número de Série': 'SN-ELT-4401',
        'Descrição do produto': 'Aspirador de Pó Vertical Ultra 1600W',
        'Marca': 'Electrolux',
        'Categoria': 'Eletroportáteis',
        'Embalagem': 'Sem caixa',
        'Observações': 'Substituído filtro HEPA, pronto para estoque',
        'Setor': 'Estoque Principal'
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventario_OpenBox');
    XLSX.writeFile(workbook, 'Modelo_Inventario_OpenBox_RMA.xlsx');
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

        // Determinar o Motivo da Devolução: se veio coluna específica na planilha, usa ela;
        // caso contrário, define o padrão de inventário sem misturar com as Observações.
        const defaultReason = row.destinationSector === 'Openbox' ? 'Inventário OpenBox' : 'Entrada de Estoque';
        const finalCustomerReason = row.customerReason && row.customerReason.trim() !== '' 
          ? row.customerReason.trim() 
          : defaultReason;

        return {
          id: `tr-excel-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
          trackingCode: row.sti,
          // Serial: somente se existir na planilha (nunca inclui o STI quando não tiver serial)
          serialNumber: row.serialNumber && row.serialNumber.trim() !== '' ? row.serialNumber.trim() : '',
          baseProductId: row.matchedProduct?.id || `bp-import-${row.sku}`,
          baseProductName: row.productName,
          baseProductSku: row.sku,
          baseProductVoltage: row.matchedProduct?.voltage || 'N/A',
          platform: selectedDefaultPlatform,
          // Motivo da Devolução separado das Observações
          customerReason: finalCustomerReason,
          deviceStatus: row.destinationSector === 'Principal' ? 'Novo' : 'Usado',
          packageStatus: row.packageStatus,
          accessoriesInclusion: row.packaging ? `Embalagem: ${row.packaging}` : 'Conforme inventário',
          destinationSector: row.destinationSector,
          // Observações: coloca APENAS as mesmas observações que constam na planilha
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
        setSuccessCount(null);
      }, 1800);

    } catch (err: any) {
      console.error('Error importing units:', err);
      setErrorMsg(`Erro ao salvar unidades no banco de dados: ${err?.message || err}`);
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[90] overflow-y-auto" id="modal-excel-import">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-800 bg-slate-950 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                Importar Inventário Excel / OpenBox
                <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] uppercase font-mono rounded-md font-bold">
                  OpenBox & Estoque
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Carregue planilhas do inventário com colunas SKU, STI, Descrição, Embalagem e Observações.
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
                  <strong>{successCount}</strong> produtos foram cadastrados e direcionados ao estoque de forma automática.
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

          {/* Upload Area / Config options if no file uploaded yet */}
          {parsedRows.length === 0 ? (
            <div className="space-y-5">
              
              {/* Default Configurations */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-850">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Setor Padrão para Itens sem Categoria
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
                    Itens contendo "Openbox" na planilha serão direcionados para Openbox automaticamente.
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
                    Suporta colunas: <strong>SKU</strong>, <strong>STI</strong>, <strong>Descrição do produto</strong>, <strong>Embalagem</strong> e <strong>Observações</strong>.
                  </p>
                </div>
              </div>

              {/* Download Sample Template Banner */}
              <div className="flex flex-col sm:flex-row items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-850 gap-3">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-sky-400 shrink-0" />
                  <div className="text-xs">
                    <span className="font-bold text-white block">Precisa de um modelo estruturado?</span>
                    <span className="text-slate-400">Baixe a planilha de exemplo com as colunas SKU, STI, Descrição, Embalagem e Observações.</span>
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
                <div>
                  <span className="text-xs text-slate-400 font-mono">Arquivo: <strong className="text-sky-400">{fileName}</strong></span>
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
                    onClick={() => { setParsedRows([]); setFileName(null); }}
                    className="px-3 py-1.5 bg-slate-900 border border-slate-800 text-slate-400 hover:text-white text-xs font-bold rounded-lg cursor-pointer"
                  >
                    Trocar Arquivo
                  </button>
                </div>
              </div>

              {/* Table Preview List */}
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950 max-h-[360px] overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-900 sticky top-0 z-10 text-slate-400 border-b border-slate-800 font-mono uppercase text-[10px]">
                    <tr>
                      <th className="p-3 w-10 text-center">#</th>
                      <th className="p-3">SKU</th>
                      <th className="p-3">STI</th>
                      <th className="p-3">Serial (S/N)</th>
                      <th className="p-3">Descrição do Produto</th>
                      <th className="p-3">Marca</th>
                      <th className="p-3">Embalagem</th>
                      <th className="p-3">Destino</th>
                      <th className="p-3">Observações</th>
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
                        <td className="p-3 font-mono font-bold text-sky-400">
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
                        <td className="p-3 font-mono text-slate-300 font-semibold">
                          #{row.sti}
                        </td>
                        <td className="p-3 font-mono text-xs">
                          {row.serialNumber ? (
                            <span className="text-amber-300 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded text-[10px] font-bold">
                              {row.serialNumber}
                            </span>
                          ) : (
                            <span className="text-slate-600 text-[10px] italic">
                              Sem Serial
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-white font-medium max-w-[200px] truncate" title={row.productName}>
                          {row.productName}
                        </td>
                        <td className="p-3 text-slate-300 text-xs font-semibold">
                          {row.brand || <span className="text-slate-600">-</span>}
                        </td>
                        <td className="p-3 text-slate-300">
                          <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-semibold">
                            {row.packaging}
                          </span>
                        </td>
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
                        <td className="p-3 text-slate-400 max-w-[180px] truncate" title={row.observations}>
                          {row.observations || <span className="text-slate-600 italic">-</span>}
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
