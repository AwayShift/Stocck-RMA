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
  Database,
  Search,
  RefreshCw,
  Plus,
  Zap,
  Tag,
  Layers,
  HelpCircle
} from 'lucide-react';
import { BaseProduct } from '../types';
import { parseCatalogExcelFile, downloadBaseCatalogTemplate } from '../utils/excelHelpers';

interface ExcelBaseCatalogImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingProducts: BaseProduct[];
  onImportProducts: (products: BaseProduct[]) => Promise<{ added: number; updated: number }>;
}

interface ParsedCatalogItem {
  id: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  voltage: '110V' | '220V' | 'Bivolt' | 'N/A';
  description: string;
  accessories: string;
  isExisting: boolean;
  existingProductId?: string;
  selected: boolean;
}

export default function ExcelBaseCatalogImportModal({
  isOpen,
  onClose,
  existingProducts,
  onImportProducts
}: ExcelBaseCatalogImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isDragOver, setIsDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedItems, setParsedItems] = useState<ParsedCatalogItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successReport, setSuccessReport] = useState<{ added: number; updated: number } | null>(null);
  const [previewFilter, setPreviewFilter] = useState('');
  
  // Default values to apply to rows that don't specify them
  const [defaultVoltage, setDefaultVoltage] = useState<'110V' | '220V' | 'Bivolt' | 'N/A'>('Bivolt');
  const [defaultCategory, setDefaultCategory] = useState<string>('');
  const [defaultBrand, setDefaultBrand] = useState<string>('');

  if (!isOpen) return null;

  const handleProcessFile = async (file: File) => {
    setErrorMsg(null);
    setFileName(file.name);
    setIsProcessing(true);

    try {
      const result = await parseCatalogExcelFile(file);

      if (!result.success || result.products.length === 0) {
        setErrorMsg(result.errors.length > 0 ? result.errors[0] : 'Nenhum produto válido com SKU e Descrição foi identificado no arquivo.');
        setIsProcessing(false);
        return;
      }

      // Map products to internal parsed state
      const mapped: ParsedCatalogItem[] = result.products.map((p, idx) => {
        const cleanSku = p.sku.trim().toUpperCase();
        const existing = existingProducts.find(ep => ep.sku.trim().toUpperCase() === cleanSku);

        return {
          id: `item-${Date.now()}-${idx}`,
          sku: cleanSku,
          name: p.name.trim(),
          brand: p.brand || defaultBrand || (existing ? existing.brand || '' : ''),
          category: p.category || defaultCategory || (existing ? existing.category || '' : ''),
          voltage: p.voltage || defaultVoltage || (existing ? existing.voltage : 'Bivolt'),
          description: p.description || p.name.trim(),
          accessories: p.accessories || (existing ? existing.accessories || '' : ''),
          isExisting: !!existing,
          existingProductId: existing ? existing.id : undefined,
          selected: true
        };
      });

      setParsedItems(mapped);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(`Erro ao ler planilha: ${err?.message || 'Arquivo corrompido'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
  };

  const toggleSelectAll = () => {
    const allSelected = parsedItems.every(r => r.selected);
    setParsedItems(prev => prev.map(r => ({ ...r, selected: !allSelected })));
  };

  const toggleSelectRow = (id: string) => {
    setParsedItems(prev => prev.map(r => r.id === id ? { ...r, selected: !r.selected } : r));
  };

  const removeRow = (id: string) => {
    setParsedItems(prev => prev.filter(r => r.id !== id));
  };

  const updateItemField = (id: string, field: keyof ParsedCatalogItem, value: any) => {
    setParsedItems(prev => prev.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        if (field === 'sku') {
          const cleanSku = String(value).trim().toUpperCase();
          const existing = existingProducts.find(ep => ep.sku.trim().toUpperCase() === cleanSku);
          updated.sku = cleanSku;
          updated.isExisting = !!existing;
          updated.existingProductId = existing ? existing.id : undefined;
        }
        return updated;
      }
      return item;
    }));
  };

  // Apply default category / voltage / brand to all parsed items
  const applyDefaultsToAll = () => {
    setParsedItems(prev => prev.map(item => ({
      ...item,
      voltage: defaultVoltage,
      category: defaultCategory || item.category,
      brand: defaultBrand || item.brand
    })));
  };

  const handleImportSelected = async () => {
    const selected = parsedItems.filter(r => r.selected);
    if (selected.length === 0) {
      setErrorMsg('Selecione ao menos um produto da lista para importar.');
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);

    try {
      const productsToSave: BaseProduct[] = selected.map(item => ({
        id: item.existingProductId || `bp-${item.sku.replace(/[^A-Z0-9_-]/gi, '_')}-${Date.now()}`,
        name: item.name,
        sku: item.sku,
        voltage: item.voltage,
        brand: item.brand,
        category: item.category,
        description: item.description || item.name,
        accessories: item.accessories || '',
        imageUrl: '',
        images: [],
        imagesProduct: [],
        imagesBox: [],
        imagesAccessories: []
      }));

      const report = await onImportProducts(productsToSave);
      setSuccessReport(report);

      setTimeout(() => {
        onClose();
      }, 2200);

    } catch (err: any) {
      console.error(err);
      setErrorMsg(`Erro ao salvar produtos no banco de dados: ${err?.message || 'Falha de conexão'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredPreview = parsedItems.filter(item => {
    if (!previewFilter) return true;
    const term = previewFilter.toLowerCase();
    return (
      item.sku.toLowerCase().includes(term) ||
      item.name.toLowerCase().includes(term) ||
      item.category.toLowerCase().includes(term) ||
      item.brand.toLowerCase().includes(term)
    );
  });

  const selectedCount = parsedItems.filter(r => r.selected).length;
  const newCount = parsedItems.filter(r => r.selected && !r.isExisting).length;
  const updateCount = parsedItems.filter(r => r.selected && r.isExisting).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn" id="excel-catalog-import-modal">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 sticky top-0 z-10">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-inner">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                Importar Produtos do Excel (Catálogo Base)
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  .xlsx / .xls / .csv
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Importe lotes de produtos com <span className="text-emerald-400 font-semibold">SKU</span> e <span className="text-emerald-400 font-semibold">Descrição</span> para cadastrar ou atualizar o catálogo master.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={downloadBaseCatalogTemplate}
              className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold border border-slate-700 transition-all cursor-pointer shadow-sm"
              title="Baixar planilha modelo no formato exato da imagem (SKU e Descrição)"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Baixar Modelo (.xlsx)</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
          
          {/* Format Explanation Banner */}
          <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 mt-0.5">
                <HelpCircle className="w-5 h-5" />
              </div>
              <div className="text-xs space-y-1">
                <p className="font-semibold text-slate-200">
                  Formato Suportado (Exemplo da Imagem):
                </p>
                <div className="flex flex-wrap items-center gap-2 text-slate-400">
                  <span className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700 text-sky-300 font-mono">Coluna A: SKU</span>
                  <span className="text-slate-600 font-bold">→</span>
                  <span className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700 text-emerald-300 font-mono">Coluna B: Descrição</span>
                  <span className="text-slate-500 text-[11px] ml-1">(Ex: 16791 | A DROP DISSEY ISSEY MIYAKE EDP - 50ML)</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-900/60 px-3 py-1.5 rounded-xl border border-slate-800">
              <Database className="w-3.5 h-3.5 text-sky-400" />
              <span>{existingProducts.length} produtos no catálogo</span>
            </div>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-start gap-3 text-rose-300 text-sm animate-shake">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-400" />
              <div className="flex-1">
                <p className="font-bold">Atenção ao processar planilha</p>
                <p className="text-xs text-rose-300/90 mt-0.5">{errorMsg}</p>
              </div>
              <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Success Message Banner */}
          {successReport && (
            <div className="p-5 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl flex items-center gap-4 text-emerald-300 animate-fadeIn">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 shrink-0" />
              <div>
                <h4 className="font-bold text-base text-emerald-200">Importação Concluída com Sucesso!</h4>
                <p className="text-xs text-emerald-300/90 mt-0.5">
                  <strong className="text-white font-bold">{successReport.added}</strong> novos produtos adicionados e <strong className="text-white font-bold">{successReport.updated}</strong> produtos existentes atualizados no Catálogo de Base.
                </p>
              </div>
            </div>
          )}

          {/* Dropzone */}
          {parsedItems.length === 0 ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-3xl p-10 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-4 ${
                isDragOver 
                  ? 'border-emerald-400 bg-emerald-500/10 scale-[1.01]' 
                  : 'border-slate-700/80 hover:border-slate-500 bg-slate-800/20 hover:bg-slate-800/40'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileChange}
                className="hidden"
              />

              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-inner">
                {isProcessing ? (
                  <RefreshCw className="w-8 h-8 animate-spin" />
                ) : (
                  <Upload className="w-8 h-8" />
                )}
              </div>

              <div>
                <p className="text-base font-bold text-white">
                  {isProcessing ? 'Lendo e processando planilha...' : 'Clique para selecionar ou arraste sua planilha aqui'}
                </p>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  Formatos aceitos: Microsoft Excel (.xlsx, .xls) ou CSV. Deve conter as colunas <strong className="text-slate-300">SKU</strong> e <strong className="text-slate-300">Descrição</strong>.
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs font-semibold px-4 py-2 bg-slate-800 text-slate-300 rounded-xl border border-slate-700">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span>Escolher Arquivo do Computador</span>
              </div>
            </div>
          ) : (
            /* After file is parsed: Configuration & Preview */
            <div className="space-y-5">
              
              {/* Top controls: File info, batch defaults & search */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-800/40 border border-slate-700/50 p-4 rounded-2xl">
                
                {/* File info */}
                <div className="flex flex-col justify-center">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Arquivo Carregado</span>
                  <div className="flex items-center gap-2 mt-1">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-xs font-bold text-white truncate" title={fileName || ''}>{fileName || 'Planilha'}</span>
                    <button
                      onClick={() => { setParsedItems([]); setFileName(null); }}
                      className="text-slate-400 hover:text-rose-400 ml-auto text-xs px-2 py-0.5 rounded hover:bg-slate-700"
                      title="Trocar arquivo"
                    >
                      Trocar
                    </button>
                  </div>
                </div>

                {/* Default Voltage */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                    Voltagem Padrão
                  </label>
                  <select
                    value={defaultVoltage}
                    onChange={(e) => setDefaultVoltage(e.target.value as any)}
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white font-medium focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="Bivolt">Bivolt</option>
                    <option value="110V">110V</option>
                    <option value="220V">220V</option>
                    <option value="N/A">N/A (Sem Tensão)</option>
                  </select>
                </div>

                {/* Default Category */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                    Categoria Padrão (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Informática / Beleza"
                    value={defaultCategory}
                    onChange={(e) => setDefaultCategory(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                {/* Default Brand & Apply */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                    Marca Padrão (Opcional)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      placeholder="Ex: Ubiquiti"
                      value={defaultBrand}
                      onChange={(e) => setDefaultBrand(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={applyDefaultsToAll}
                      className="px-2.5 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors"
                      title="Aplicar voltagem, categoria e marca para todas as linhas"
                    >
                      Aplicar
                    </button>
                  </div>
                </div>

              </div>

              {/* Stats Bar and Filter */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-2xl border border-slate-800">
                <div className="flex items-center gap-3 text-xs">
                  <button
                    onClick={toggleSelectAll}
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-medium border border-slate-700 cursor-pointer"
                  >
                    <Check className={`w-3.5 h-3.5 ${parsedItems.every(r => r.selected) ? 'text-emerald-400' : 'text-slate-400'}`} />
                    <span>{parsedItems.every(r => r.selected) ? 'Desmarcar Todos' : 'Selecionar Todos'}</span>
                  </button>

                  <div className="flex items-center gap-2 text-slate-400">
                    <span>Selecionados: <strong className="text-white font-bold">{selectedCount}</strong> de {parsedItems.length}</span>
                    <span className="text-slate-600">•</span>
                    <span className="text-emerald-400 font-semibold"><strong className="font-bold">{newCount}</strong> Novos</span>
                    <span className="text-slate-600">•</span>
                    <span className="text-amber-400 font-semibold"><strong className="font-bold">{updateCount}</strong> Atualizações</span>
                  </div>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Filtrar produtos importados..."
                    value={previewFilter}
                    onChange={(e) => setPreviewFilter(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-slate-600"
                  />
                </div>
              </div>

              {/* Table Preview */}
              <div className="border border-slate-800 rounded-2xl overflow-hidden max-h-[380px] overflow-y-auto custom-scrollbar">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-800/80 sticky top-0 z-10 text-slate-300 uppercase text-[10px] tracking-wider font-semibold border-b border-slate-700">
                    <tr>
                      <th className="p-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={parsedItems.length > 0 && parsedItems.every(r => r.selected)}
                          onChange={toggleSelectAll}
                          className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-900"
                        />
                      </th>
                      <th className="p-3 w-32">SKU</th>
                      <th className="p-3">Descrição / Nome do Produto</th>
                      <th className="p-3 w-28">Voltagem</th>
                      <th className="p-3 w-32">Categoria</th>
                      <th className="p-3 w-28 text-center">Status</th>
                      <th className="p-3 w-12 text-center">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                    {filteredPreview.map((item) => (
                      <tr 
                        key={item.id}
                        className={`hover:bg-slate-800/40 transition-colors ${!item.selected ? 'opacity-40' : ''}`}
                      >
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={item.selected}
                            onChange={() => toggleSelectRow(item.id)}
                            className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-900 cursor-pointer"
                          />
                        </td>
                        <td className="p-3">
                          <input
                            type="text"
                            value={item.sku}
                            onChange={(e) => updateItemField(item.id, 'sku', e.target.value)}
                            className="w-full px-2 py-1 bg-slate-950/80 border border-slate-700/80 rounded font-mono font-bold text-sky-300 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                          />
                        </td>
                        <td className="p-3">
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => updateItemField(item.id, 'name', e.target.value)}
                            className="w-full px-2 py-1 bg-slate-950/80 border border-slate-700/80 rounded font-medium text-slate-100 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                          />
                        </td>
                        <td className="p-3">
                          <select
                            value={item.voltage}
                            onChange={(e) => updateItemField(item.id, 'voltage', e.target.value)}
                            className="w-full px-2 py-1 bg-slate-950/80 border border-slate-700/80 rounded text-slate-300 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                          >
                            <option value="Bivolt">Bivolt</option>
                            <option value="110V">110V</option>
                            <option value="220V">220V</option>
                            <option value="N/A">N/A</option>
                          </select>
                        </td>
                        <td className="p-3">
                          <input
                            type="text"
                            placeholder="Categoria"
                            value={item.category}
                            onChange={(e) => updateItemField(item.id, 'category', e.target.value)}
                            className="w-full px-2 py-1 bg-slate-950/80 border border-slate-700/80 rounded text-slate-300 text-xs placeholder-slate-600 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                          />
                        </td>
                        <td className="p-3 text-center">
                          {item.isExisting ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              Atualização
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                              Novo
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => removeRow(item.id)}
                            className="p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 transition-colors"
                            title="Remover produto da lista"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-6 border-t border-slate-800 flex items-center justify-between bg-slate-900/90 sticky bottom-0 z-10">
          <div className="text-xs text-slate-400">
            {parsedItems.length > 0 && (
              <span>
                Total a importar: <strong className="text-white font-bold">{selectedCount}</strong> itens selecionados
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 font-semibold text-xs transition-all cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>

            {parsedItems.length > 0 && (
              <button
                type="button"
                onClick={handleImportSelected}
                disabled={isSaving || selectedCount === 0}
                className="flex items-center gap-2 px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl font-bold text-xs shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                id="btn-confirm-import-catalog"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Importando {selectedCount} produtos...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Importar {selectedCount} Produtos para o Catálogo</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
