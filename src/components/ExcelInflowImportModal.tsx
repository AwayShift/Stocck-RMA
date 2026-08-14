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
  ArrowRight,
  Database,
  Calendar,
  Layers
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Importar Planilha Excel</h2>
              <p className="text-xs text-slate-500">
                Alimente o banco de dados do Fluxo de Entradas a partir de arquivo .xlsx ou .csv
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Upload Dropzone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
              isDragOver 
                ? 'border-emerald-500 bg-emerald-50/50 scale-[0.99]' 
                : file 
                  ? 'border-emerald-300 bg-emerald-50/20' 
                  : 'border-slate-300 hover:border-slate-400 bg-slate-50/50 hover:bg-slate-50'
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

            <div className="flex flex-col items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-sm">
                <UploadCloud className="w-6 h-6" />
              </div>
              {file ? (
                <div>
                  <p className="text-sm font-semibold text-slate-800">{file.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{(file.size / 1024).toFixed(1)} KB • Clique para escolher outro arquivo</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-semibold text-slate-700">
                    Arraste sua planilha aqui ou clique para selecionar
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Formatos suportados: .xlsx, .xls, .csv (com colunas DATA, RMA, ESTOQUE, OPENBOX, ES)
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Quick template download banner */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                <Download className="w-4 h-4" />
              </div>
              <div className="text-xs text-slate-600">
                <p className="font-semibold text-slate-800">Precisa do modelo padrão?</p>
                <p>Baixe a planilha de exemplo com as colunas corretas (RMA, Estoque, Openbox, ES e Totais).</p>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                downloadInflowTemplate();
              }}
              className="px-3.5 py-1.5 bg-white border border-slate-300 hover:border-slate-400 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg shadow-sm transition-all whitespace-nowrap"
            >
              Baixar Modelo (.xlsx)
            </button>
          </div>

          {/* Loading / Parsing State */}
          {isParsing && (
            <div className="py-8 text-center">
              <div className="inline-block w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mb-2" />
              <p className="text-sm font-medium text-slate-600">Processando e validando linhas da planilha...</p>
            </div>
          )}

          {/* Errors Notice if any */}
          {parseErrors.length > 0 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs space-y-1">
              <div className="flex items-center gap-2 font-bold text-amber-800">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Avisos de processamento:</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-amber-700 pl-1">
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
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <h3 className="text-sm font-bold text-slate-800">
                    Prévia dos Dados Extraídos ({parsedRecords.length} dias identificados)
                  </h3>
                </div>
                <span className="text-xs font-medium text-slate-500">
                  Total de Entradas: <strong className="text-slate-800 font-bold">{totalUnits} un.</strong>
                </span>
              </div>

              {/* Summary stat cards of import */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">RMA</span>
                  <span className="text-lg font-black text-blue-700">{totalRma}</span>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Estoque</span>
                  <span className="text-lg font-black text-emerald-700">{totalEstoque}</span>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Openbox</span>
                  <span className="text-lg font-black text-amber-700">{totalOpenbox}</span>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">ES</span>
                  <span className="text-lg font-black text-purple-700">{totalEs}</span>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center col-span-2 sm:col-span-1">
                  <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider block">Total Geral</span>
                  <span className="text-lg font-black text-emerald-800">{totalUnits}</span>
                </div>
              </div>

              {/* Table preview */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs max-h-64 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-2.5 px-3">Data</th>
                      <th className="py-2.5 px-3 text-center">RMA</th>
                      <th className="py-2.5 px-3 text-center">Estoque</th>
                      <th className="py-2.5 px-3 text-center">Openbox</th>
                      <th className="py-2.5 px-3 text-center">ES</th>
                      <th className="py-2.5 px-3 text-center bg-slate-200/60 font-black text-slate-900">Total Dia</th>
                      <th className="py-2.5 px-3">Observações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedRecords.map((rec) => (
                      <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2 px-3 font-semibold text-slate-800">
                          {formatBrDate(rec.date)} <span className="text-slate-400 font-normal text-[10px]">({getWeekdayName(rec.date)})</span>
                        </td>
                        <td className="py-2 px-3 text-center font-medium text-blue-700">{rec.rma}</td>
                        <td className="py-2 px-3 text-center font-medium text-emerald-700">{rec.estoque}</td>
                        <td className="py-2 px-3 text-center font-medium text-amber-700">{rec.openbox}</td>
                        <td className="py-2 px-3 text-center font-medium text-purple-700">{rec.es}</td>
                        <td className="py-2 px-3 text-center font-black bg-slate-50 text-slate-900">{rec.totalDia}</td>
                        <td className="py-2 px-3 text-slate-500 truncate max-w-xs">{rec.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/80">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors"
          >
            Cancelar
          </button>

          <button
            type="button"
            disabled={parsedRecords.length === 0 || isSaving}
            onClick={handleSave}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
