/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { 
  FileSpreadsheet, 
  UploadCloud, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  Download, 
  Database,
  Calendar,
  Layers,
  HelpCircle,
  RefreshCw,
  TrendingUp,
  FileCheck
} from 'lucide-react';
import { DailyInflowRecord } from '../types';
import { parseInflowExcelFile, downloadInflowTemplate, formatBrDate, getWeekdayName } from '../utils/excelHelpers';

interface ExcelInflowImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmImport: (records: DailyInflowRecord[]) => Promise<number>;
}

export default function ExcelInflowImportModal({
  isOpen,
  onClose,
  onConfirmImport
}: ExcelInflowImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedRecords, setParsedRecords] = useState<DailyInflowRecord[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelected = async (selectedFile: File) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setIsParsing(true);
    setParseErrors([]);
    setParsedRecords([]);

    try {
      const result = await parseInflowExcelFile(selectedFile);
      if (result.success && result.records.length > 0) {
        setParsedRecords(result.records);
        setParseErrors(result.errors);
      } else {
        setParseErrors(result.errors.length > 0 ? result.errors : ['Falha ao processar arquivo Excel. Verifique o cabeçalho das colunas.']);
      }
    } catch (err: any) {
      setParseErrors([err?.message || 'Erro inesperado ao processar arquivo.']);
    } finally {
      setIsParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleSave = async () => {
    if (parsedRecords.length === 0) return;
    setIsSaving(true);
    try {
      await onConfirmImport(parsedRecords);
      onClose();
    } catch (err: any) {
      alert(`Erro ao salvar no banco de dados: ${err?.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Compute totals of parsed rows
  const totalUnits = parsedRecords.reduce((acc, r) => acc + r.totalDia, 0);
  const totalRma = parsedRecords.reduce((acc, r) => acc + r.rma, 0);
  const totalEstoque = parsedRecords.reduce((acc, r) => acc + r.estoque, 0);
  const totalOpenbox = parsedRecords.reduce((acc, r) => acc + r.openbox, 0);
  const totalEs = parsedRecords.reduce((acc, r) => acc + r.es, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn" id="excel-inflow-import-modal">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 sticky top-0 z-10">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-inner">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                Importar Planilha de Entradas
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  .xlsx / .xls / .csv
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Alimente o banco de dados do Fluxo de Entradas a partir de arquivo com colunas de RMA, Estoque, Openbox e ES.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={downloadInflowTemplate}
              className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold border border-slate-700 transition-all cursor-pointer shadow-sm"
              title="Baixar planilha de exemplo com as colunas corretas"
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

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
          
          {/* Format Explanation Banner */}
          <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 mt-0.5 shrink-0">
                <HelpCircle className="w-5 h-5" />
              </div>
              <div className="text-xs space-y-1">
                <p className="font-semibold text-slate-200">
                  Colunas Identificadas no Arquivo:
                </p>
                <div className="flex flex-wrap items-center gap-2 text-slate-400">
                  <span className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700 text-slate-200 font-mono">DATA</span>
                  <span className="text-slate-600 font-bold">→</span>
                  <span className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700 text-sky-300 font-mono">RMA</span>
                  <span className="text-slate-600 font-bold">→</span>
                  <span className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700 text-emerald-300 font-mono">ESTOQUE</span>
                  <span className="text-slate-600 font-bold">→</span>
                  <span className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700 text-amber-300 font-mono">OPENBOX</span>
                  <span className="text-slate-600 font-bold">→</span>
                  <span className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700 text-purple-300 font-mono">ES</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-900/60 px-3 py-1.5 rounded-xl border border-slate-800 shrink-0">
              <Calendar className="w-3.5 h-3.5 text-emerald-400" />
              <span>Entrada por Dia</span>
            </div>
          </div>

          {/* Upload Dropzone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3.5 ${
              isDragOver 
                ? 'border-emerald-400 bg-emerald-500/10 scale-[1.01]' 
                : file 
                  ? 'border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/10' 
                  : 'border-slate-700/80 hover:border-slate-500 bg-slate-800/20 hover:bg-slate-800/40'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx, .xls, .csv"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFileSelected(e.target.files[0]);
                }
              }}
            />

            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-inner">
              {isParsing ? (
                <RefreshCw className="w-7 h-7 animate-spin text-emerald-400" />
              ) : file ? (
                <FileCheck className="w-7 h-7 text-emerald-400" />
              ) : (
                <UploadCloud className="w-7 h-7 text-emerald-400" />
              )}
            </div>

            {file ? (
              <div>
                <p className="text-sm font-bold text-white flex items-center justify-center gap-2">
                  <span>{file.name}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {(file.size / 1024).toFixed(1)} KB
                  </span>
                </p>
                <p className="text-xs text-slate-400 mt-1">Clique para selecionar outro arquivo ou substitua arrastando</p>
              </div>
            ) : (
              <div>
                <p className="text-base font-bold text-white">
                  Arraste sua planilha aqui ou clique para selecionar
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Formatos suportados: .xlsx, .xls, .csv (com colunas DATA, RMA, ESTOQUE, OPENBOX, ES)
                </p>
              </div>
            )}

            {!file && (
              <div className="flex items-center gap-2 text-xs font-semibold px-4 py-2 bg-slate-800 text-slate-300 rounded-xl border border-slate-700 mt-1">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span>Escolher Arquivo do Computador</span>
              </div>
            )}
          </div>

          {/* Loading / Parsing State */}
          {isParsing && (
            <div className="py-8 text-center bg-slate-800/30 rounded-2xl border border-slate-800">
              <div className="inline-block w-8 h-8 border-3 border-emerald-400 border-t-transparent rounded-full animate-spin mb-2" />
              <p className="text-sm font-medium text-slate-300">Processando e validando linhas da planilha...</p>
            </div>
          )}

          {/* Errors Notice if any */}
          {parseErrors.length > 0 && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-300 text-xs space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-amber-400">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Avisos de processamento:</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-amber-300/90 pl-1">
                {parseErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Preview of Parsed Data */}
          {parsedRecords.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-sm font-bold text-white">
                    Prévia dos Dados Extraídos ({parsedRecords.length} dias identificados)
                  </h3>
                </div>
                <span className="text-xs font-medium text-slate-400 bg-slate-800 px-3 py-1 rounded-xl border border-slate-700">
                  Total de Entradas: <strong className="text-emerald-400 font-bold">{totalUnits} un.</strong>
                </span>
              </div>

              {/* Summary stat cards of import */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-3.5 text-center shadow-xs">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">RMA</span>
                  <span className="text-xl font-black text-sky-400">{totalRma}</span>
                </div>
                <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-3.5 text-center shadow-xs">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Estoque</span>
                  <span className="text-xl font-black text-emerald-400">{totalEstoque}</span>
                </div>
                <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-3.5 text-center shadow-xs">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Openbox</span>
                  <span className="text-xl font-black text-amber-400">{totalOpenbox}</span>
                </div>
                <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-3.5 text-center shadow-xs">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">ES</span>
                  <span className="text-xl font-black text-purple-400">{totalEs}</span>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-3.5 text-center col-span-2 sm:col-span-1 shadow-xs">
                  <span className="text-[11px] font-semibold text-emerald-300 uppercase tracking-wider block">Total Geral</span>
                  <span className="text-xl font-black text-emerald-400">{totalUnits}</span>
                </div>
              </div>

              {/* Table preview */}
              <div className="border border-slate-800 rounded-2xl overflow-hidden shadow-sm max-h-64 overflow-y-auto custom-scrollbar">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-800 text-slate-300 font-bold sticky top-0 uppercase tracking-wider text-[10px] border-b border-slate-700">
                    <tr>
                      <th className="py-2.5 px-3">Data</th>
                      <th className="py-2.5 px-3 text-center">RMA</th>
                      <th className="py-2.5 px-3 text-center">Estoque</th>
                      <th className="py-2.5 px-3 text-center">Openbox</th>
                      <th className="py-2.5 px-3 text-center">ES</th>
                      <th className="py-2.5 px-3 text-center bg-slate-800/90 font-black text-emerald-400">Total Dia</th>
                      <th className="py-2.5 px-3">Observações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                    {parsedRecords.map((rec) => (
                      <tr key={rec.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-2 px-3 font-semibold text-white">
                          {formatBrDate(rec.date)} <span className="text-slate-500 font-normal text-[10px]">({getWeekdayName(rec.date)})</span>
                        </td>
                        <td className="py-2 px-3 text-center font-bold text-sky-400">{rec.rma}</td>
                        <td className="py-2 px-3 text-center font-bold text-emerald-400">{rec.estoque}</td>
                        <td className="py-2 px-3 text-center font-bold text-amber-400">{rec.openbox}</td>
                        <td className="py-2 px-3 text-center font-bold text-purple-400">{rec.es}</td>
                        <td className="py-2 px-3 text-center font-black bg-slate-800/30 text-white">{rec.totalDia}</td>
                        <td className="py-2 px-3 text-slate-400 truncate max-w-xs">{rec.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-6 border-t border-slate-800 flex items-center justify-between bg-slate-900/90 sticky bottom-0 z-10">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-5 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 font-semibold text-xs transition-all cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>

          <button
            type="button"
            disabled={parsedRecords.length === 0 || isSaving}
            onClick={handleSave}
            className="flex items-center gap-2 px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl font-bold text-xs shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            id="btn-confirm-import-inflow"
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Gravando no Banco de Dados...</span>
              </>
            ) : (
              <>
                <Database className="w-4 h-4" />
                <span>Confirmar e Gravar ({parsedRecords.length} dias)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

