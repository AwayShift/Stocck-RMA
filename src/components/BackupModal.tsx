/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  HardDriveDownload, 
  HardDriveUpload, 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  Database, 
  Package, 
  Boxes, 
  Activity, 
  Download, 
  UploadCloud, 
  FileCheck, 
  RefreshCw, 
  ShieldCheck, 
  HelpCircle,
  Clock,
  Sparkles,
  Layers,
  ArrowRight,
  RotateCcw,
  Check,
  AlertCircle
} from 'lucide-react';
import { 
  generateAndDownloadBackup, 
  validateBackupFile, 
  restoreDatabaseFromBackup 
} from '../lib/backupService';
import { BackupValidationResult, SystemBackupPayload } from '../types';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string;
  userName?: string;
  userRole?: 'admin' | 'operator' | null;
  currentCounts?: {
    products: number;
    triageUnits: number;
    dailyInflows: number;
  };
  onRestoreSuccess?: () => void;
}

export default function BackupModal({
  isOpen,
  onClose,
  userEmail,
  userName,
  userRole,
  currentCounts,
  onRestoreSuccess
}: BackupModalProps) {
  const [activeTab, setActiveTab] = useState<'export' | 'restore'>('export');

  // Export States
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{
    filename: string;
    fileSizeFormatted: string;
    counts: {
      products: number;
      triageUnits: number;
      dailyInflows: number;
      cases: number;
      logs: number;
    };
  } | null>(null);
  const [lastBackupDate, setLastBackupDate] = useState<string | null>(null);
  const [lastBackupFilename, setLastBackupFilename] = useState<string | null>(null);

  // Restore States
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validationResult, setValidationResult] = useState<BackupValidationResult | null>(null);
  const [restoreMode, setRestoreMode] = useState<'replace' | 'merge'>('replace');
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState<{ message: string; percent: number }>({
    message: '',
    percent: 0
  });
  const [restoreSuccessResult, setRestoreSuccessResult] = useState<{
    products: number;
    triageUnits: number;
    dailyInflows: number;
    cases: number;
    mode: 'replace' | 'merge';
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load last backup info on mount / open
  useEffect(() => {
    if (isOpen) {
      const savedDate = localStorage.getItem('stocckrma_last_backup_date');
      const savedFile = localStorage.getItem('stocckrma_last_backup_filename');
      setLastBackupDate(savedDate);
      setLastBackupFilename(savedFile);
      setErrorMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Handle Export Backup Click
  const handleExportBackup = async () => {
    setIsExporting(true);
    setErrorMessage(null);
    try {
      const res = await generateAndDownloadBackup({
        email: userEmail,
        name: userName,
        role: userRole || 'operator'
      });
      setExportResult(res);
      setLastBackupDate(new Date().toISOString());
      setLastBackupFilename(res.filename);
    } catch (err: any) {
      console.error('Error generating backup:', err);
      setErrorMessage(err.message || 'Falha ao gerar e descarregar cópia de segurança.');
    } finally {
      setIsExporting(false);
    }
  };

  // Process File for Restoration
  const handleFileProcess = (file: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.json')) {
      setErrorMessage('Formato inválido! Por favor selecione um arquivo de backup com extensão .json');
      setSelectedFile(null);
      setValidationResult(null);
      return;
    }

    setErrorMessage(null);
    setSelectedFile(file);
    setRestoreSuccessResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const result = validateBackupFile(content, file.size);
      setValidationResult(result);
      if (!result.isValid) {
        setErrorMessage(result.error || 'Arquivo de backup inválido ou incompatível.');
      }
    };
    reader.onerror = () => {
      setErrorMessage('Não foi possível ler o arquivo selecionado no seu computador.');
    };
    reader.readAsText(file);
  };

  // Drag & Drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  // Trigger Restoration
  const handleExecuteRestore = async () => {
    if (!validationResult || !validationResult.isValid || !validationResult.payload) {
      setErrorMessage('Nenhum arquivo de backup válido carregado.');
      return;
    }

    setIsRestoring(true);
    setErrorMessage(null);
    setRestoreProgress({ message: 'Iniciando restauração de dados...', percent: 5 });

    try {
      const res = await restoreDatabaseFromBackup(
        validationResult.payload,
        restoreMode,
        (msg, pct) => {
          setRestoreProgress({ message: msg, percent: pct });
        }
      );

      setRestoreSuccessResult({
        ...res.restoredCounts,
        mode: restoreMode
      });

      if (onRestoreSuccess) {
        onRestoreSuccess();
      }
    } catch (err: any) {
      console.error('Error during database restoration:', err);
      setErrorMessage(`Erro ao restaurar banco de dados: ${err.message || 'Falha na gravação'}`);
    } finally {
      setIsRestoring(false);
    }
  };

  // Reset restore form
  const handleResetRestoreForm = () => {
    setSelectedFile(null);
    setValidationResult(null);
    setRestoreSuccessResult(null);
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-150"
      id="backup-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isRestoring && !isExporting) {
          onClose();
        }
      }}
    >
      <div 
        className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-6 animate-in zoom-in-95 duration-200"
        id="backup-modal"
      >
        {/* Header */}
        <div className="px-6 py-5 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-sky-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-inner">
              <HardDriveDownload className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-white tracking-tight">
                  Backup & Restauração de Dados
                </h2>
                <span className="bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  Local Seguro (.JSON)
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Cópia completa de segurança dos cadastros, estoque, laudos e entradas
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isRestoring || isExporting}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer disabled:opacity-40"
            id="btn-close-backup-modal"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 pt-4 bg-slate-950/50 border-b border-slate-800 flex gap-2">
          <button
            type="button"
            onClick={() => { setActiveTab('export'); setErrorMessage(null); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-extrabold transition-all cursor-pointer border-t border-x ${
              activeTab === 'export'
                ? 'bg-slate-900 text-sky-400 border-slate-700/80 shadow-sm'
                : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/50'
            }`}
            id="tab-export-backup"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Fazer Backup (Exportar .JSON)</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('restore'); setErrorMessage(null); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-extrabold transition-all cursor-pointer border-t border-x ${
              activeTab === 'restore'
                ? 'bg-slate-900 text-indigo-400 border-slate-700/80 shadow-sm'
                : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/50'
            }`}
            id="tab-restore-backup"
          >
            <HardDriveUpload className="w-3.5 h-3.5" />
            <span>Restaurar Backup (Importar)</span>
          </button>
        </div>

        {/* Error Alert if any */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-start gap-3 text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-bold block">Atenção:</span>
              <p className="mt-0.5 leading-relaxed">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">

          {/* ========================================================= */}
          {/* TAB 1: EXPORTAR BACKUP (DOWNLOAD LOCAL)                   */}
          {/* ========================================================= */}
          {activeTab === 'export' && (
            <div className="space-y-5" id="section-export-backup">
              {/* Introduction Card */}
              <div className="p-4 bg-slate-950/70 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400 mt-0.5">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-white">
                      O que está incluído no seu Backup?
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      O arquivo gerado é um snapshot 100% autônomo e legível contendo todo o estado operacional do sistema para arquivamento no seu computador local:
                    </p>
                  </div>
                </div>

                {/* Items Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2">
                  <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 text-center">
                    <Package className="w-4 h-4 text-sky-400 mx-auto mb-1" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Catálogo Base</span>
                    <span className="text-lg font-black text-white">
                      {currentCounts ? currentCounts.products : '—'}
                    </span>
                    <span className="text-[10px] text-slate-500 block">SKUs / Modelos</span>
                  </div>

                  <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 text-center">
                    <Database className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Estoque & RMA</span>
                    <span className="text-lg font-black text-white">
                      {currentCounts ? currentCounts.triageUnits : '—'}
                    </span>
                    <span className="text-[10px] text-slate-500 block">Unidades Físicas</span>
                  </div>

                  <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 text-center">
                    <Boxes className="w-4 h-4 text-purple-400 mx-auto mb-1" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Fluxo Entradas</span>
                    <span className="text-lg font-black text-white">
                      {currentCounts ? currentCounts.dailyInflows : '—'}
                    </span>
                    <span className="text-[10px] text-slate-500 block">Dias Consolidados</span>
                  </div>

                  <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 text-center">
                    <Activity className="w-4 h-4 text-indigo-400 mx-auto mb-1" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Auditoria & Logs</span>
                    <span className="text-lg font-black text-white">Completo</span>
                    <span className="text-[10px] text-slate-500 block">Histórico de Ações</span>
                  </div>
                </div>
              </div>

              {/* Last Backup Notice */}
              {lastBackupDate && (
                <div className="p-3.5 bg-slate-950/50 rounded-xl border border-slate-800/80 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5 text-slate-400">
                    <Clock className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div>
                      <span>Último backup salvo neste computador: </span>
                      <strong className="text-slate-200">{new Date(lastBackupDate).toLocaleString('pt-BR')}</strong>
                    </div>
                  </div>
                  {lastBackupFilename && (
                    <span className="text-[11px] font-mono text-slate-500 hidden sm:inline truncate max-w-[200px]" title={lastBackupFilename}>
                      {lastBackupFilename}
                    </span>
                  )}
                </div>
              )}

              {/* Success Result after download */}
              {exportResult && (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl space-y-2 text-emerald-300 text-xs animate-in fade-in">
                  <div className="flex items-center gap-2 font-bold text-emerald-200">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    Arquivo de Backup gerado e descarregado com sucesso!
                  </div>
                  <div className="pl-6 space-y-1 text-slate-300">
                    <p>
                      <strong>Arquivo:</strong> <code className="bg-slate-950 px-2 py-0.5 rounded text-emerald-300 font-mono">{exportResult.filename}</code> ({exportResult.fileSizeFormatted})
                    </p>
                    <p className="text-slate-400">
                      O arquivo foi salvo na pasta padrão de Downloads do seu computador. Você pode guardá-lo em local seguro, pendrive ou compartilhamento corporativo.
                    </p>
                  </div>
                </div>
              )}

              {/* Export Action Card */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4 p-5 bg-gradient-to-r from-sky-950/40 via-slate-950 to-indigo-950/40 border border-sky-500/20 rounded-2xl">
                <div className="space-y-1 text-center sm:text-left">
                  <span className="text-xs font-bold text-white block">
                    Pronto para extrair os dados agora?
                  </span>
                  <span className="text-[11px] text-slate-400 block">
                    Gera instantaneamente o arquivo .JSON compactado sem interromper as operações do sistema.
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleExportBackup}
                  disabled={isExporting}
                  className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-2.5 px-6 py-3 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-sky-500/20 transition-all cursor-pointer disabled:opacity-50"
                  id="btn-download-backup-json"
                >
                  {isExporting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-white" />
                      <span>Gerando Backup...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>Baixar Backup (.JSON)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 2: RESTAURAR BACKUP (IMPORTAR DO PC)                  */}
          {/* ========================================================= */}
          {activeTab === 'restore' && (
            <div className="space-y-5" id="section-restore-backup">

              {/* Success Result State */}
              {restoreSuccessResult ? (
                <div className="p-6 bg-emerald-500/10 border border-emerald-500/30 rounded-3xl space-y-4 text-center animate-in zoom-in-95">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto shadow-lg">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-emerald-200">
                      Restauração Concluída com Sucesso!
                    </h3>
                    <p className="text-xs text-slate-300 mt-1">
                      O banco de dados foi sincronizado com o backup selecionado no modo: 
                      <strong className="text-emerald-300 ml-1">
                        {restoreSuccessResult.mode === 'replace' ? 'Substituição Completa' : 'Mesclagem (Merge)'}
                      </strong>
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-2 py-2 max-w-md mx-auto text-xs">
                    <div className="p-2.5 bg-slate-950/80 rounded-xl border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Produtos</span>
                      <span className="text-base font-bold text-white">{restoreSuccessResult.products}</span>
                    </div>
                    <div className="p-2.5 bg-slate-950/80 rounded-xl border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Estoque/Triagem</span>
                      <span className="text-base font-bold text-white">{restoreSuccessResult.triageUnits}</span>
                    </div>
                    <div className="p-2.5 bg-slate-950/80 rounded-xl border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Entradas Diárias</span>
                      <span className="text-base font-bold text-white">{restoreSuccessResult.dailyInflows}</span>
                    </div>
                  </div>

                  <div className="flex justify-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleResetRestoreForm}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Restaurar Outro Arquivo
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-6 py-2 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-xl text-xs shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
                    >
                      Concluir e Voltar
                    </button>
                  </div>
                </div>
              ) : isRestoring ? (
                /* Restoring Progress Bar State */
                <div className="p-8 bg-slate-950/90 rounded-3xl border border-indigo-500/30 text-center space-y-5 animate-in fade-in">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 mx-auto animate-bounce">
                    <RotateCcw className="w-7 h-7 animate-spin" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-white">
                      Gravando Dados no Firestore...
                    </h3>
                    <p className="text-xs text-indigo-300 mt-1">
                      {restoreProgress.message}
                    </p>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden p-0.5 border border-slate-700">
                    <div 
                      className="bg-gradient-to-r from-sky-500 to-indigo-500 h-full rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${restoreProgress.percent}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-400 block">
                    {restoreProgress.percent}% concluído
                  </span>
                </div>
              ) : (
                /* File Selection and Review Step */
                <div className="space-y-5">
                  {/* Step 1: Upload or Drop file */}
                  {!validationResult || !validationResult.isValid ? (
                    <div
                      onDragEnter={handleDrag}
                      onDragLeave={handleDrag}
                      onDragOver={handleDrag}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`p-8 border-2 border-dashed rounded-3xl text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
                        dragActive 
                          ? 'border-indigo-400 bg-indigo-500/10 scale-[1.01]' 
                          : 'border-slate-700/80 bg-slate-950/60 hover:bg-slate-950 hover:border-slate-600'
                      }`}
                      id="drop-backup-file-zone"
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json,application/json"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleFileProcess(e.target.files[0]);
                          }
                        }}
                      />
                      <div className="w-12 h-12 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-inner">
                        <UploadCloud className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <span className="text-sm font-bold text-white block">
                          Clique para escolher ou arraste o arquivo .JSON aqui
                        </span>
                        <span className="text-xs text-slate-400 block">
                          Selecione um arquivo de backup previamente gerado pelo StocckRMA
                        </span>
                      </div>
                    </div>
                  ) : (
                    /* Step 2: Validated File Preview & Restore Options */
                    <div className="space-y-4 animate-in fade-in">
                      {/* File Card Header */}
                      <div className="p-4 bg-slate-950 rounded-2xl border border-indigo-500/30 flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className="p-2.5 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 mt-0.5">
                            <FileCheck className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-white font-mono">
                                {selectedFile?.name}
                              </span>
                              <span className="text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                                Backup Válido
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-1">
                              Gerado em: <strong className="text-slate-200">{validationResult.metadata?.exportedAtFormatted || 'Desconhecido'}</strong>
                              {validationResult.metadata?.exportedBy?.name && (
                                <span className="ml-2 text-slate-500">
                                  por {validationResult.metadata.exportedBy.name}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={handleResetRestoreForm}
                          className="text-xs text-slate-400 hover:text-rose-400 p-1.5 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                          title="Trocar arquivo"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Content Statistics to be Restored */}
                      <div className="p-4 bg-slate-950/60 rounded-2xl border border-slate-800 space-y-2">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                          Conteúdo detectado no arquivo:
                        </span>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                          <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800/80 text-center">
                            <span className="text-slate-400 block text-[10px]">Produtos Base</span>
                            <span className="text-base font-black text-sky-400">
                              {validationResult.stats?.productsCount || 0}
                            </span>
                          </div>
                          <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800/80 text-center">
                            <span className="text-slate-400 block text-[10px]">Estoque / Triagem</span>
                            <span className="text-base font-black text-emerald-400">
                              {validationResult.stats?.triageUnitsCount || 0}
                            </span>
                          </div>
                          <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800/80 text-center">
                            <span className="text-slate-400 block text-[10px]">Fluxo Diário</span>
                            <span className="text-base font-black text-purple-400">
                              {validationResult.stats?.dailyInflowsCount || 0}
                            </span>
                          </div>
                          <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800/80 text-center">
                            <span className="text-slate-400 block text-[10px]">Casos / Logs</span>
                            <span className="text-base font-black text-amber-400">
                              {(validationResult.stats?.casesCount || 0) + (validationResult.stats?.logsCount || 0)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Step 3: Choose Restoration Mode */}
                      <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-3">
                        <div className="flex items-center gap-2">
                          <Layers className="w-4 h-4 text-indigo-400" />
                          <span className="text-xs font-bold text-white uppercase tracking-wider">
                            Escolha o Modo de Restauração:
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* Mode: Replace */}
                          <div
                            onClick={() => setRestoreMode('replace')}
                            className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                              restoreMode === 'replace'
                                ? 'bg-indigo-500/10 border-indigo-500/50 text-white shadow-sm'
                                : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-900'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold flex items-center gap-1.5">
                                🔄 Substituição Completa
                              </span>
                              {restoreMode === 'replace' && (
                                <span className="w-2 h-2 rounded-full bg-indigo-400 shadow-xs shadow-indigo-400" />
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                              Limpa as coleções atuais e restaura exatamente o estado do arquivo de backup (Recomendado para recuperação de desastre).
                            </p>
                          </div>

                          {/* Mode: Merge */}
                          <div
                            onClick={() => setRestoreMode('merge')}
                            className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                              restoreMode === 'merge'
                                ? 'bg-emerald-500/10 border-emerald-500/50 text-white shadow-sm'
                                : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-900'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold flex items-center gap-1.5">
                                ⚡ Mesclagem / Merge
                              </span>
                              {restoreMode === 'merge' && (
                                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-xs shadow-emerald-400" />
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                              Atualiza cadastros coincidentes por ID e insere novos registros sem apagar os dados que já existem no banco.
                            </p>
                          </div>
                        </div>

                        {/* Admin Warning for Replace Mode */}
                        {restoreMode === 'replace' && (
                          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2.5 text-amber-300 text-[11px]">
                            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <span>
                              <strong>Atenção:</strong> Na substituição completa, registros que não existirem no arquivo de backup serão excluídos do banco para espelhar fielmente o arquivo.
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Execute Restore Button */}
                      <div className="pt-2 flex justify-end gap-3">
                        <button
                          type="button"
                          onClick={handleResetRestoreForm}
                          className="px-4 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
                        >
                          Cancelar
                        </button>

                        <button
                          type="button"
                          onClick={handleExecuteRestore}
                          className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold rounded-xl text-xs shadow-lg shadow-indigo-600/25 transition-all cursor-pointer"
                          id="btn-confirm-restore-backup"
                        >
                          <RotateCcw className="w-4 h-4" />
                          <span>Confirmar e Restaurar Dados</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-500 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
            Backups gerados localmente e criptografados pelo navegador
          </span>
          <button
            type="button"
            onClick={onClose}
            disabled={isRestoring || isExporting}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-all cursor-pointer disabled:opacity-40"
            id="btn-close-backup-footer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
