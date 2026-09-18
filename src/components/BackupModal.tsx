/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  HardDriveDownload, 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  Database, 
  Download, 
  UploadCloud, 
  FileCheck, 
  RefreshCw, 
  ShieldCheck, 
  Clock,
  Layers,
  RotateCcw,
  Check,
  Cloud,
  Calendar,
  Lock,
  FileCode,
  CheckCheck,
  Search,
  Trash2
} from 'lucide-react';
import { 
  generateAndDownloadBackup, 
  validateBackupFile, 
  restoreDatabaseFromBackup,
  createCloudSnapshot,
  subscribeToCloudBackups,
  loadAutoBackupConfig,
  saveAutoBackupConfig,
  restoreFromCloudSnapshot,
  downloadCloudSnapshotAsJson,
  deleteCloudSnapshot,
  DEFAULT_AUTO_BACKUP_CONFIG
} from '../lib/backupService';
import { 
  BackupValidationResult, 
  SystemBackupPayload, 
  CloudBackupRecord, 
  AutoBackupScheduleConfig,
  BackupTriggerType 
} from '../types';
import { getActiveDbProvider, DatabaseProvider, SUPABASE_SQL_SCHEMA } from '../lib/supabase';
import BackupStorageManagerModal from './BackupStorageManagerModal';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string;
  userName?: string;
  userRole?: 'admin' | 'operator' | null;
  isLight?: boolean;
  currentCounts?: {
    products: number;
    triageUnits: number;
    dailyInflows: number;
    pendingItems?: number;
  };
  onRestoreSuccess?: (payload?: any) => void;
}

export default function BackupModal({
  isOpen,
  onClose,
  userEmail,
  userName,
  userRole,
  isLight = false,
  currentCounts,
  onRestoreSuccess
}: BackupModalProps) {
  const [activeTab, setActiveTab] = useState<'cloud' | 'schedule' | 'local'>('cloud');
  const [activeProvider, setActiveProvider] = useState<DatabaseProvider>(() => getActiveDbProvider());
  const [isStorageManagerOpen, setIsStorageManagerOpen] = useState(false);

  // Cloud Snapshots State
  const [cloudBackups, setCloudBackups] = useState<CloudBackupRecord[]>([]);
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
  const [downloadingSnapId, setDownloadingSnapId] = useState<string | null>(null);
  const [cloudSnapshotSearch, setCloudSnapshotSearch] = useState('');
  const [selectedSnapshotForRestore, setSelectedSnapshotForRestore] = useState<CloudBackupRecord | null>(null);
  const [snapshotToDelete, setSnapshotToDelete] = useState<CloudBackupRecord | null>(null);
  const [isDeletingSnapshot, setIsDeletingSnapshot] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // Auto-Backup Scheduling State
  const [scheduleConfig, setScheduleConfig] = useState<AutoBackupScheduleConfig>(DEFAULT_AUTO_BACKUP_CONFIG);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [scheduleSavedSuccess, setScheduleSavedSuccess] = useState(false);

  // Local File Export States
  const [isExportingLocal, setIsExportingLocal] = useState(false);
  const [localExportResult, setLocalExportResult] = useState<{
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
  const [lastLocalBackupDate, setLastLocalBackupDate] = useState<string | null>(null);
  const [lastLocalBackupFilename, setLastLocalBackupFilename] = useState<string | null>(null);

  // Local Restore States
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
    source: 'cloud' | 'file';
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load cloud backups, schedule config & local markers on mount
  useEffect(() => {
    if (!isOpen) return;

    setActiveProvider(getActiveDbProvider());
    // Load Local storage markers
    setLastLocalBackupDate(localStorage.getItem('stocckrma_last_backup_date'));
    setLastLocalBackupFilename(localStorage.getItem('stocckrma_last_backup_filename'));
    setErrorMessage(null);
    setSuccessMessage(null);
    setRestoreSuccessResult(null);

    // Subscribe to cloud backups in real time
    const unsubscribeCloud = subscribeToCloudBackups((backups) => {
      setCloudBackups(backups);
    });

    // Load schedule config
    loadAutoBackupConfig().then((cfg) => {
      setScheduleConfig(cfg);
    });

    return () => {
      unsubscribeCloud();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Handle Manual Cloud Snapshot Creation
  const handleCreateCloudSnapshot = async () => {
    setIsCreatingSnapshot(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await createCloudSnapshot('manual', undefined, {
        email: userEmail,
        name: userName,
        role: userRole || 'operator'
      });
      setSuccessMessage(`Ponto de Restauração em Nuvem criado com sucesso! (${res.snapshot.collectionsCount.products} produtos, ${res.snapshot.collectionsCount.triageUnits} unidades em estoque salvas).`);
      // Instantly add to state so UI updates without any subscription latency
      setCloudBackups(prev => [res.snapshot, ...prev.filter(b => b.id !== res.snapshot.id)]);
    } catch (err: any) {
      console.error('Error creating cloud snapshot:', err);
      setErrorMessage(err.message || 'Falha ao gerar snapshot online.');
    } finally {
      setIsCreatingSnapshot(false);
    }
  };

  // Handle Download Cloud Snapshot to JSON file
  const handleDownloadCloudSnapshot = async (snap: CloudBackupRecord) => {
    setDownloadingSnapId(snap.id);
    setErrorMessage(null);
    try {
      await downloadCloudSnapshotAsJson(snap);
    } catch (err: any) {
      console.error('Error downloading cloud snapshot:', err);
      setErrorMessage(err.message || 'Erro ao baixar snapshot da nuvem.');
    } finally {
      setDownloadingSnapId(null);
    }
  };

  // Handle Cloud Snapshot Restoration
  const handleConfirmRestoreCloudSnapshot = async () => {
    if (!selectedSnapshotForRestore) return;
    setIsRestoring(true);
    setErrorMessage(null);
    setRestoreSuccessResult(null);

    try {
      const result = await restoreFromCloudSnapshot(
        selectedSnapshotForRestore,
        restoreMode,
        (stage, percent) => {
          setRestoreProgress({ message: stage, percent });
        }
      );

      setRestoreSuccessResult({
        products: result.restoredCounts.products,
        triageUnits: result.restoredCounts.triageUnits,
        dailyInflows: result.restoredCounts.dailyInflows,
        cases: result.restoredCounts.cases,
        mode: restoreMode,
        source: 'cloud'
      });

      setSelectedSnapshotForRestore(null);
      if (onRestoreSuccess) onRestoreSuccess(selectedSnapshotForRestore);
      
      // FORÇAR ATUALIZAÇÃO DA PÁGINA APÓS 3 SEGUNDOS PARA CARREGAR OS DADOS
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    } catch (err: any) {
      console.error('Error restoring from cloud snapshot:', err);
      setErrorMessage(err.message || 'Erro durante a restauração do snapshot da nuvem.');
    } finally {
      setIsRestoring(false);
    }
  };

  // Handle Cloud Snapshot Deletion
  const handleConfirmDeleteSnapshot = async () => {
    if (!snapshotToDelete) return;
    setIsDeletingSnapshot(true);
    setErrorMessage(null);
    try {
      await deleteCloudSnapshot(snapshotToDelete.id);
      setSuccessMessage(`Snapshot "${snapshotToDelete.title}" removido com sucesso.`);
      setCloudBackups(prev => prev.filter(b => b.id !== snapshotToDelete.id));
      setSnapshotToDelete(null);
    } catch (err: any) {
      console.error('Error deleting cloud snapshot:', err);
      setErrorMessage(err.message || 'Falha ao excluir snapshot da nuvem.');
    } finally {
      setIsDeletingSnapshot(false);
    }
  };

  // Handle Save Auto-Backup Schedule Configuration
  const handleSaveScheduleConfig = async () => {
    setIsSavingSchedule(true);
    setScheduleSavedSuccess(false);
    setErrorMessage(null);
    try {
      await saveAutoBackupConfig(scheduleConfig);
      setScheduleSavedSuccess(true);
      setTimeout(() => setScheduleSavedSuccess(false), 3500);
    } catch (err: any) {
      setErrorMessage('Falha ao salvar configurações de agendamento.');
    } finally {
      setIsSavingSchedule(false);
    }
  };

  // Handle Local Backup Export (.json)
  const handleExportLocal = async () => {
    setIsExportingLocal(true);
    setErrorMessage(null);
    try {
      const res = await generateAndDownloadBackup({
        email: userEmail,
        name: userName,
        role: userRole || 'operator'
      });
      setLocalExportResult(res);
      setLastLocalBackupDate(new Date().toISOString());
      setLastLocalBackupFilename(res.filename);
    } catch (err: any) {
      console.error('Error exporting local backup:', err);
      setErrorMessage(err.message || 'Falha ao descarregar cópia de segurança local.');
    } finally {
      setIsExportingLocal(false);
    }
  };

  // Process Local File for Restoration
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
      setErrorMessage('Erro ao ler arquivo do disco local.');
      setSelectedFile(null);
      setValidationResult(null);
    };
    reader.readAsText(file);
  };

  // Handle Local File Drag & Drop
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

  // Confirm Local File Restore
  const handleConfirmRestoreFile = async () => {
    if (!validationResult || !validationResult.payload) {
      setErrorMessage('Nenhum arquivo de backup válido carregado.');
      return;
    }

    setIsRestoring(true);
    setErrorMessage(null);
    setRestoreSuccessResult(null);

    try {
      const result = await restoreDatabaseFromBackup(
        validationResult.payload,
        restoreMode,
        (stage, percent) => {
          setRestoreProgress({ message: stage, percent });
        }
      );

      setRestoreSuccessResult({
        products: result.restoredCounts.products,
        triageUnits: result.restoredCounts.triageUnits,
        dailyInflows: result.restoredCounts.dailyInflows,
        cases: result.restoredCounts.cases,
        mode: restoreMode,
        source: 'file'
      });

      setSelectedFile(null);
      const restoredData = validationResult.payload;
      setValidationResult(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (onRestoreSuccess) onRestoreSuccess(restoredData);
      
      // FORÇAR ATUALIZAÇÃO DA PÁGINA APÓS 3 SEGUNDOS PARA CARREGAR OS DADOS
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    } catch (err: any) {
      console.error('Error during restoration:', err);
      setErrorMessage(err.message || 'Erro durante a restauração do banco de dados.');
    } finally {
      setIsRestoring(false);
    }
  };

  // Filter cloud backups
  const filteredCloudBackups = cloudBackups.filter(b => {
    if (!cloudSnapshotSearch.trim()) return true;
    const q = cloudSnapshotSearch.toLowerCase();
    return (
      b.title.toLowerCase().includes(q) ||
      b.triggerLabel.toLowerCase().includes(q) ||
      b.createdAtFormatted.toLowerCase().includes(q) ||
      (b.createdBy?.name && b.createdBy.name.toLowerCase().includes(q))
    );
  });

  const getTriggerBadge = (type: BackupTriggerType) => {
    if (isLight) {
      switch (type) {
        case 'hourly':
          return { label: 'Por Hora', bg: 'bg-indigo-100 text-indigo-800 border-indigo-300 font-bold' };
        case 'end_of_day':
          return { label: 'Fim do Expediente', bg: 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold' };
        case 'weekly':
          return { label: 'Semanal', bg: 'bg-amber-100 text-amber-900 border-amber-300 font-bold' };
        case 'monthly':
          return { label: 'Mensal', bg: 'bg-purple-100 text-purple-800 border-purple-300 font-bold' };
        case 'manual':
        default:
          return { label: 'Manual', bg: 'bg-sky-100 text-sky-800 border-sky-300 font-bold' };
      }
    }
    switch (type) {
      case 'hourly':
        return { label: 'Por Hora', bg: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' };
      case 'end_of_day':
        return { label: 'Fim do Expediente', bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
      case 'weekly':
        return { label: 'Semanal', bg: 'bg-amber-500/10 text-amber-400 border-amber-500/20' };
      case 'monthly':
        return { label: 'Mensal', bg: 'bg-purple-500/10 text-purple-400 border-purple-500/20' };
      case 'manual':
      default:
        return { label: 'Manual', bg: 'bg-sky-500/10 text-sky-400 border-sky-500/20' };
    }
  };

  const daysOfWeekLabels = [
    'Domingo',
    'Segunda-feira',
    'Terça-feira',
    'Quarta-feira',
    'Quinta-feira',
    'Sexta-feira',
    'Sábado'
  ];

  return (
    <div 
      className={`fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-150 ${
        isLight ? 'bg-slate-900/60' : 'bg-slate-950/85'
      }`}
      id="backup-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isRestoring && !isCreatingSnapshot) onClose();
      }}
    >
      <div 
        className={`w-full max-w-4xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border ${
          isLight ? 'bg-white border-slate-200 text-slate-900 shadow-2xl' : 'bg-slate-900 border-slate-800 text-slate-100 shadow-2xl'
        }`}
        id="backup-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${
          isLight ? 'border-slate-200 bg-slate-50 text-slate-900' : 'border-slate-800 bg-slate-900/60 text-white'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${
              isLight ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gradient-to-br from-emerald-500/20 to-sky-500/20 text-emerald-400 border border-emerald-500/30'
            }`}>
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className={`text-lg font-bold tracking-wide ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  Central de Contingência & Backup
                </h2>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  isLight ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                }`}>
                  Plano B Ativo
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border font-mono ${
                  isLight ? 'bg-sky-100 text-sky-800 border-sky-300' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                }`}>
                  Banco: {activeProvider === 'supabase' ? 'Supabase PostgreSQL' : 'Supabase Cloud DB'}
                </span>
              </div>
              <p className={`text-xs ${isLight ? 'text-slate-600 font-medium' : 'text-slate-400'}`}>
                Snapshots em nuvem no Supabase, rotinas programadas e recuperação instantânea de desastre
              </p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              isLight ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/70' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            id="btn-close-backup-modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className={`flex border-b px-6 ${
          isLight ? 'border-slate-200 bg-slate-100/70' : 'border-slate-800 bg-slate-950/40'
        }`}>
          <button
            type="button"
            onClick={() => {
              setActiveTab('cloud');
              setErrorMessage(null);
            }}
            className={`flex items-center gap-2 py-3.5 px-4 text-xs font-bold transition-all border-b-2 cursor-pointer ${
              activeTab === 'cloud'
                ? (isLight ? 'border-emerald-600 text-emerald-800 bg-emerald-50/80 font-black' : 'border-emerald-400 text-emerald-400 bg-emerald-500/5')
                : (isLight ? 'border-transparent text-slate-600 hover:text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-200')
            }`}
            id="tab-cloud-backup"
          >
            <Cloud className="w-4 h-4" />
            <span>Snapshots em Nuvem ({cloudBackups.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('schedule');
              setErrorMessage(null);
            }}
            className={`flex items-center gap-2 py-3.5 px-4 text-xs font-bold transition-all border-b-2 cursor-pointer ${
              activeTab === 'schedule'
                ? (isLight ? 'border-sky-600 text-sky-800 bg-sky-50/80 font-black' : 'border-sky-400 text-sky-400 bg-sky-500/5')
                : (isLight ? 'border-transparent text-slate-600 hover:text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-200')
            }`}
            id="tab-schedule-backup"
          >
            <Clock className="w-4 h-4" />
            <span>Agendamento Automático</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('local');
              setErrorMessage(null);
            }}
            className={`flex items-center gap-2 py-3.5 px-4 text-xs font-bold transition-all border-b-2 cursor-pointer ${
              activeTab === 'local'
                ? (isLight ? 'border-amber-600 text-amber-800 bg-amber-50/80 font-black' : 'border-amber-400 text-amber-400 bg-amber-500/5')
                : (isLight ? 'border-transparent text-slate-600 hover:text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-200')
            }`}
            id="tab-local-backup"
          >
            <HardDriveDownload className="w-4 h-4" />
            <span>Arquivos Locais (JSON)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setIsStorageManagerOpen(true);
            }}
            className={`flex items-center gap-1.5 py-2 px-3 my-auto ml-auto text-xs font-bold rounded-lg border transition-all cursor-pointer ${
              isLight
                ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-300 shadow-xs'
                : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/30'
            }`}
            id="btn-open-storage-manager"
            title="Abrir janela completa para verificar todos os backups e limpar espaço do banco"
          >
            <Database className="w-3.5 h-3.5" />
            <span>Gerenciar & Limpar (~400MB)</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className={`flex-1 overflow-y-auto p-6 space-y-6 ${
          isLight ? 'bg-slate-50/40 text-slate-900' : 'bg-transparent text-slate-100'
        }`}>
          
          {/* Notifications */}
          {errorMessage && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex flex-col gap-2 animate-in fade-in">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <strong className="block font-semibold">Aviso do Sistema:</strong>
                  {errorMessage}
                </div>
              </div>
              {(errorMessage.includes('table') || errorMessage.includes('relation') || errorMessage.includes('schema') || errorMessage.includes('permission') || errorMessage.includes('500') || errorMessage.includes('Supabase')) && (
                <div className="mt-2 p-3 bg-slate-950/90 rounded-xl border border-rose-500/30 text-[11px] text-slate-300 space-y-2.5">
                  <p className="font-semibold text-rose-200 flex items-center gap-1.5">
                    <span>💡 Solução para o Supabase:</span>
                  </p>
                  <p className="leading-relaxed text-slate-300">
                    O erro 500 ou 404 geralmente ocorre quando as tabelas <code className="text-emerald-300 font-mono">backup_snapshots</code> e <code className="text-emerald-300 font-mono">users</code> ainda não foram criadas ou possuem colunas pendentes no Supabase.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(SUPABASE_SQL_SCHEMA);
                        setCopiedSql(true);
                        setTimeout(() => setCopiedSql(false), 3000);
                      }}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-bold cursor-pointer inline-flex items-center gap-1.5 transition-all shadow-md shadow-emerald-600/20"
                    >
                      {copiedSql ? (
                        <>
                          <CheckCheck className="w-3.5 h-3.5" />
                          <span>Script SQL Copiado!</span>
                        </>
                      ) : (
                        <>
                          <FileCode className="w-3.5 h-3.5" />
                          <span>Copiar Script SQL do Supabase</span>
                        </>
                      )}
                    </button>
                    <span className="text-[10px] text-slate-400">
                      Cole no menu <strong>SQL Editor</strong> do painel Supabase e clique em <strong>RUN</strong>.
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {successMessage && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-3 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1">
                <strong className="block font-semibold">Sucesso:</strong>
                {successMessage}
              </div>
            </div>
          )}

          {/* Restoration Result Banner */}
          {restoreSuccessResult && (
            <div className="p-5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 animate-in fade-in space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400">
                  <CheckCheck className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">
                    Banco de Dados Restaurado com Sucesso!
                  </h4>
                  <p className="text-xs text-emerald-300/80">
                    O sistema foi sincronizado fielmente com o ponto de restauração selecionado ({restoreSuccessResult.mode === 'replace' ? 'Substituição Completa' : 'Mesclagem'}).
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-2">
                <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800 text-center">
                  <span className="text-[11px] text-slate-400 block">Catálogo Base</span>
                  <strong className="text-sm font-mono text-emerald-300">{restoreSuccessResult.products} produtos</strong>
                </div>
                <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800 text-center">
                  <span className="text-[11px] text-slate-400 block">Estoque Físico</span>
                  <strong className="text-sm font-mono text-emerald-300">{restoreSuccessResult.triageUnits} unidades</strong>
                </div>
                <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800 text-center">
                  <span className="text-[11px] text-slate-400 block">Fluxo Diário</span>
                  <strong className="text-sm font-mono text-emerald-300">{restoreSuccessResult.dailyInflows} registros</strong>
                </div>
              </div>
            </div>
          )}

          {/* Restoring In Progress Overlay / Progress Bar */}
          {isRestoring && (
            <div className="p-5 rounded-xl bg-sky-950/40 border border-sky-500/40 text-sky-200 space-y-3 animate-in fade-in">
              <div className="flex items-center gap-3">
                <RefreshCw className="w-5 h-5 text-sky-400 animate-spin" />
                <div className="flex-1">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    Processando Restauração de Emergência...
                  </h4>
                  <p className="text-xs text-sky-300">{restoreProgress.message || 'Sincronizando coleções...'}</p>
                </div>
                <span className="text-xs font-mono font-bold text-sky-400">{restoreProgress.percent}%</span>
              </div>
              <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-sky-500/20">
                <div 
                  className="bg-gradient-to-r from-sky-500 to-emerald-500 h-2 transition-all duration-300"
                  style={{ width: `${restoreProgress.percent}%` }}
                />
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 1: CLOUD SNAPSHOTS (PLANO B ONLINE)                  */}
          {/* ======================================================== */}
          {activeTab === 'cloud' && (
            <div className="space-y-6 animate-in fade-in duration-150" id="section-cloud-snapshots">
              
              {/* Security Banner: Immutability and Supabase Cloud Storage */}
              <div className={`p-4 rounded-xl border flex items-start justify-between gap-3 flex-wrap ${
                isLight 
                  ? 'bg-white border-slate-200 text-slate-800 shadow-xs' 
                  : 'bg-slate-950/60 border-slate-800/80 text-slate-300'
              }`}>
                <div className="flex items-start gap-3 flex-1 min-w-[280px]">
                  <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                    isLight ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-emerald-500/10 text-emerald-400'
                  }`}>
                    <Lock className="w-4 h-4" />
                  </div>
                  <div className={`text-xs leading-relaxed ${isLight ? 'text-slate-700 font-normal' : 'text-slate-300'}`}>
                    <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>Snapshots Seguros no Supabase:</span> Os pontos de restauração são armazenados de forma estruturada e versionada no banco de dados do Supabase. Permitem restauração instantânea com verificação de integridade (checksum) e preservação de todos os relacionamentos de estoque.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(SUPABASE_SQL_SCHEMA);
                    setCopiedSql(true);
                    setTimeout(() => setCopiedSql(false), 3000);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold cursor-pointer inline-flex items-center gap-1.5 transition-all self-center shrink-0 border ${
                    isLight
                      ? 'bg-slate-100 hover:bg-slate-200 text-emerald-800 border-slate-300'
                      : 'bg-slate-900 hover:bg-slate-800 text-emerald-400 border-slate-700 hover:border-emerald-500/40'
                  }`}
                  title="Copiar Script SQL do Supabase para o SQL Editor"
                >
                  {copiedSql ? (
                    <>
                      <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Script SQL Copiado!</span>
                    </>
                  ) : (
                    <>
                      <FileCode className="w-3.5 h-3.5" />
                      <span>Copiar Script SQL (Tabelas)</span>
                    </>
                  )}
                </button>
              </div>

              {/* Dedicated Storage Manager & Bulk Cleanup Banner */}
              <div
                className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isLight
                    ? 'bg-amber-50 border-amber-300 text-slate-900 shadow-xs'
                    : 'bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-900 border-amber-600/40 text-slate-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/30 shrink-0">
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-xs">
                        Gerenciar Todos os Backups Salvos (Supabase)
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-500 border border-amber-500/30">
                        Otimização de Espaço (~400MB)
                      </span>
                    </div>
                    <p className={`text-[11px] mt-0.5 leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                      Abra a janela dedicada com paginação real, filtros por data/tipo e exclusão em lote com 1 clique (ex: manter apenas os 5 mais recentes).
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsStorageManagerOpen(true)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/10 transition-all flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer shrink-0"
                  id="btn-open-dedicated-storage-manager"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Gerenciar Todos & Limpar</span>
                </button>
              </div>

              {/* Action Bar: Create Snapshot & Search */}
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <button
                  type="button"
                  onClick={handleCreateCloudSnapshot}
                  disabled={isCreatingSnapshot || isRestoring}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all hover:scale-[1.02] disabled:opacity-50 cursor-pointer"
                  id="btn-create-cloud-snapshot-now"
                >
                  {isCreatingSnapshot ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Gerando Snapshot Seguro...</span>
                    </>
                  ) : (
                    <>
                      <Cloud className="w-4 h-4" />
                      <span>Criar Snapshot em Nuvem Agora</span>
                    </>
                  )}
                </button>

                <div className="relative min-w-[240px] flex-1 sm:max-w-xs">
                  <Search className={`w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 ${isLight ? 'text-slate-500' : 'text-slate-400'}`} />
                  <input
                    type="text"
                    value={cloudSnapshotSearch}
                    onChange={(e) => setCloudSnapshotSearch(e.target.value)}
                    placeholder="Filtrar por data, tipo ou autor..."
                    className={`w-full border rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none focus:border-emerald-500 transition-colors ${
                      isLight 
                        ? 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 shadow-2xs' 
                        : 'bg-slate-950 border-slate-800 text-white placeholder-slate-500'
                    }`}
                  />
                </div>
              </div>

              {/* Confirmation Modal for Cloud Restore */}
              {selectedSnapshotForRestore && (
                <div 
                  id="cloud-restore-confirmation-panel"
                  className={`p-5 rounded-2xl border space-y-4 animate-in zoom-in-95 duration-150 ${
                    isLight 
                      ? 'bg-amber-50/90 border-amber-300 text-slate-900 shadow-sm' 
                      : 'bg-amber-950/40 border-amber-500/40 text-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl border shrink-0 ${
                      isLight 
                        ? 'bg-amber-100 text-amber-800 border-amber-300' 
                        : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                    }`}>
                      <RotateCcw className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className={`text-sm font-black ${
                        isLight ? 'text-slate-900' : 'text-white'
                      }`}>
                        Restaurar Snapshot Selecionado: {selectedSnapshotForRestore.title}
                      </h4>
                      <p className={`text-xs font-semibold mt-0.5 ${
                        isLight ? 'text-amber-950' : 'text-amber-300/80'
                      }`}>
                        Ponto criado em {selectedSnapshotForRestore.createdAtFormatted} ({selectedSnapshotForRestore.collectionsCount.products} produtos, {selectedSnapshotForRestore.collectionsCount.triageUnits} unidades de estoque).
                      </p>
                    </div>
                  </div>

                  {/* Mode selector */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setRestoreMode('replace')}
                      id="btn-restore-mode-replace"
                      className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                        restoreMode === 'replace'
                          ? (isLight 
                              ? 'bg-rose-50 border-rose-400 text-rose-950 shadow-xs' 
                              : 'bg-rose-500/10 border-rose-500/50 text-white')
                          : (isLight 
                              ? 'bg-white border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50' 
                              : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700')
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-black ${
                          restoreMode === 'replace' 
                            ? (isLight ? 'text-rose-950' : 'text-white') 
                            : (isLight ? 'text-slate-800' : 'text-slate-300')
                        }`}>Substituição Completa</span>
                        {restoreMode === 'replace' && (
                          <Check className={`w-4 h-4 font-bold ${isLight ? 'text-rose-600' : 'text-rose-400'}`} />
                        )}
                      </div>
                      <p className={`text-[11px] leading-relaxed font-medium ${
                        restoreMode === 'replace'
                          ? (isLight ? 'text-rose-900 font-semibold' : 'text-slate-400')
                          : (isLight ? 'text-slate-600 font-medium' : 'text-slate-400')
                      }`}>
                        Limpa as coleções atuais e restaura exatamente o estado do snapshot (Recuperação de Desastre).
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setRestoreMode('merge')}
                      id="btn-restore-mode-merge"
                      className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                        restoreMode === 'merge'
                          ? (isLight 
                              ? 'bg-emerald-50 border-emerald-400 text-emerald-950 shadow-xs' 
                              : 'bg-emerald-500/10 border-emerald-500/50 text-white')
                          : (isLight 
                              ? 'bg-white border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50' 
                              : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700')
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-black ${
                          restoreMode === 'merge' 
                            ? (isLight ? 'text-emerald-950' : 'text-white') 
                            : (isLight ? 'text-slate-800' : 'text-slate-300')
                        }`}>Mesclagem (Merge)</span>
                        {restoreMode === 'merge' && (
                          <Check className={`w-4 h-4 font-bold ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`} />
                        )}
                      </div>
                      <p className={`text-[11px] leading-relaxed font-medium ${
                        restoreMode === 'merge'
                          ? (isLight ? 'text-emerald-900 font-semibold' : 'text-slate-400')
                          : (isLight ? 'text-slate-600 font-medium' : 'text-slate-400')
                      }`}>
                        Mantém registros existentes e atualiza/adiciona os itens do snapshot.
                      </p>
                    </button>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setSelectedSnapshotForRestore(null)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer border ${
                        isLight 
                          ? 'bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 border-slate-300 shadow-xs' 
                          : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border-transparent'
                      }`}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmRestoreCloudSnapshot}
                      disabled={isRestoring}
                      className="px-4 py-2 rounded-xl text-xs font-black !text-white bg-amber-600 hover:bg-amber-500 transition-all shadow-md shadow-amber-600/20 cursor-pointer"
                      id="btn-confirm-restore-cloud-snapshot"
                    >
                      Confirmar e Restaurar Banco
                    </button>
                  </div>
                </div>
              )}

              {/* Snapshots List */}
              <div className="space-y-3">
                <div className={`flex items-center justify-between text-xs font-bold px-1 ${
                  isLight ? 'text-slate-700' : 'text-slate-400'
                }`}>
                  <span>Pontos de Restauração em Nuvem Salvos</span>
                  <span className={isLight ? 'text-slate-500 font-medium' : 'text-slate-400'}>{filteredCloudBackups.length} disponíveis</span>
                </div>

                {filteredCloudBackups.length === 0 ? (
                  <div className={`p-8 rounded-2xl border text-center space-y-3 ${
                    isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/50 border-slate-800/80'
                  }`}>
                    <Cloud className="w-8 h-8 text-slate-400 mx-auto" />
                    <p className={`text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                      Nenhum snapshot online encontrado no momento.
                    </p>
                    <button
                      type="button"
                      onClick={handleCreateCloudSnapshot}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-xs font-semibold cursor-pointer"
                    >
                      Criar Primeiro Snapshot Agora
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                    {filteredCloudBackups.map((snap) => {
                      const badge = getTriggerBadge(snap.triggerType);
                      return (
                        <div 
                          key={snap.id}
                          className={`p-3.5 rounded-xl border transition-all flex items-center justify-between gap-4 ${
                            isLight 
                              ? 'bg-white border-slate-200 hover:border-slate-300 shadow-xs' 
                              : 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700/80'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`p-2 rounded-xl border shrink-0 ${
                              isLight ? 'bg-slate-100 border-slate-200 text-emerald-600' : 'bg-slate-900 border-slate-800 text-slate-300'
                            }`}>
                              <Database className={`w-4 h-4 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`} />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h5 className={`text-xs font-bold truncate ${isLight ? 'text-slate-900' : 'text-white'}`}>
                                  {snap.title}
                                </h5>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.bg}`}>
                                  {badge.label}
                                </span>
                              </div>
                              <div className={`flex items-center gap-3 text-[11px] pt-0.5 flex-wrap ${
                                isLight ? 'text-slate-600' : 'text-slate-400'
                              }`}>
                                <span>📅 {snap.createdAtFormatted}</span>
                                <span>&bull;</span>
                                <span>📦 {snap.collectionsCount.products} prod</span>
                                <span>&bull;</span>
                                <span>🏷️ {snap.collectionsCount.triageUnits} estoque</span>
                                <span>&bull;</span>
                                <span>💾 {snap.fileSizeFormatted}</span>
                                {Boolean(snap.chunked || (snap.totalChunks && snap.totalChunks > 1)) && (
                                  <>
                                    <span>&bull;</span>
                                    <span className={`font-mono font-bold ${isLight ? 'text-sky-700' : 'text-sky-400'}`}>🧩 {snap.totalChunks} partes</span>
                                  </>
                                )}
                                {snap.createdBy?.name && (
                                  <>
                                    <span>&bull;</span>
                                    <span className={isLight ? 'text-slate-500' : 'text-slate-500'}>Por: {snap.createdBy.name}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              disabled={downloadingSnapId === snap.id}
                              onClick={() => handleDownloadCloudSnapshot(snap)}
                              className={`p-2 disabled:opacity-50 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                                isLight 
                                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300' 
                                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-800'
                              }`}
                              title="Baixar cópia offline (.json)"
                            >
                              {downloadingSnapId === snap.id ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-400" />
                              ) : (
                                <Download className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedSnapshotForRestore(snap)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 border ${
                                isLight 
                                  ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300 shadow-xs' 
                                  : 'bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border-emerald-500/20 hover:border-emerald-500/40'
                              }`}
                              id={`btn-restore-cloud-snap-${snap.id}`}
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Restaurar</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setSnapshotToDelete(snap)}
                              className={`p-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                                isLight 
                                  ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200' 
                                  : 'bg-slate-900 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border-slate-800 hover:border-rose-500/30'
                              }`}
                              title="Excluir snapshot"
                              id={`btn-delete-cloud-snap-${snap.id}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 2: AGENDAMENTO AUTOMÁTICO                           */}
          {/* ======================================================== */}
          {activeTab === 'schedule' && (
            <div className="space-y-6 animate-in fade-in duration-150" id="section-auto-schedule">
              
              {/* Master Switch */}
              <div className={`backup-master-switch p-4 rounded-2xl border flex items-center justify-between gap-4 ${
                isLight ? 'bg-sky-50 border-sky-200 shadow-xs' : 'bg-gradient-to-r from-sky-950/40 to-slate-950 border-sky-500/30'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`backup-master-icon p-2.5 rounded-xl border ${
                    isLight ? 'bg-sky-100 text-sky-700 border-sky-200' : 'bg-sky-500/20 text-sky-400 border-sky-500/30'
                  }`}>
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className={`backup-master-title text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                      Rotinas de Backup Automático em Nuvem
                    </h4>
                    <p className={`backup-master-desc text-xs ${isLight ? 'text-slate-600 font-medium' : 'text-slate-400'}`}>
                      Executa cópias de contingência silenciosamente em segundo plano
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={scheduleConfig.enabled}
                  onClick={() => setScheduleConfig({ ...scheduleConfig, enabled: !scheduleConfig.enabled })}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none shadow-inner ${
                    scheduleConfig.enabled ? 'bg-sky-500' : (isLight ? 'bg-slate-300' : 'bg-slate-800')
                  }`}
                  id="toggle-master-backup-schedule"
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      scheduleConfig.enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Schedule Triggers Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* 1. Por Hora */}
                <div className={`p-4 rounded-xl border space-y-3 ${
                  isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-950/60 border-slate-800'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={`p-1.5 rounded-lg ${isLight ? 'bg-indigo-50 text-indigo-700' : 'bg-indigo-500/10 text-indigo-400'}`}>
                        <Clock className="w-4 h-4" />
                      </div>
                      <h5 className={`text-xs font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>Backup por Hora</h5>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={scheduleConfig.hourly.enabled}
                      onClick={() => setScheduleConfig({
                        ...scheduleConfig,
                        hourly: { ...scheduleConfig.hourly, enabled: !scheduleConfig.hourly.enabled }
                      })}
                      className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        scheduleConfig.hourly.enabled ? 'bg-indigo-500' : (isLight ? 'bg-slate-300' : 'bg-slate-800')
                      }`}
                      id="toggle-hourly-backup-schedule"
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                          scheduleConfig.hourly.enabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <p className={`text-[11px] ${isLight ? 'text-slate-600 font-medium' : 'text-slate-400'}`}>
                    Gera um snapshot a cada intervalo configurado durante o uso do sistema.
                  </p>

                  <div className="flex items-center gap-2 pt-1">
                    <span className={`text-xs ${isLight ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>Intervalo:</span>
                    <select
                      value={scheduleConfig.hourly.intervalHours}
                      onChange={(e) => setScheduleConfig({
                        ...scheduleConfig,
                        hourly: { ...scheduleConfig.hourly, intervalHours: parseInt(e.target.value, 10) }
                      })}
                      disabled={!scheduleConfig.hourly.enabled}
                      className={`rounded-lg px-2.5 py-1 text-xs border disabled:opacity-40 ${
                        isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
                      }`}
                    >
                      <option value={1}>A cada 1 hora</option>
                      <option value={2}>A cada 2 horas</option>
                      <option value={4}>A cada 4 horas</option>
                      <option value={6}>A cada 6 horas</option>
                      <option value={8}>A cada 8 horas</option>
                    </select>
                  </div>
                </div>

                {/* 2. Final do Expediente */}
                <div className={`p-4 rounded-xl border space-y-3 ${
                  isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-950/60 border-slate-800'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={`p-1.5 rounded-lg ${isLight ? 'bg-emerald-50 text-emerald-700' : 'bg-emerald-500/10 text-emerald-400'}`}>
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <h5 className={`text-xs font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>Final do Expediente</h5>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={scheduleConfig.endOfDay.enabled}
                      onClick={() => setScheduleConfig({
                        ...scheduleConfig,
                        endOfDay: { ...scheduleConfig.endOfDay, enabled: !scheduleConfig.endOfDay.enabled }
                      })}
                      className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        scheduleConfig.endOfDay.enabled ? 'bg-emerald-500' : (isLight ? 'bg-slate-300' : 'bg-slate-800')
                      }`}
                      id="toggle-endofday-backup-schedule"
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                          scheduleConfig.endOfDay.enabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <p className={`text-[11px] ${isLight ? 'text-slate-600 font-medium' : 'text-slate-400'}`}>
                    Copia diária no fechamento do turno com consolidação das movimentações.
                  </p>

                  <div className="flex items-center gap-2 pt-1">
                    <span className={`text-xs ${isLight ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>Horário:</span>
                    <input
                      type="time"
                      value={scheduleConfig.endOfDay.time}
                      onChange={(e) => setScheduleConfig({
                        ...scheduleConfig,
                        endOfDay: { ...scheduleConfig.endOfDay, time: e.target.value }
                      })}
                      disabled={!scheduleConfig.endOfDay.enabled}
                      className={`rounded-lg px-2.5 py-1 text-xs border disabled:opacity-40 ${
                        isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
                      }`}
                    />
                  </div>
                </div>

                {/* 3. Dia da Semana */}
                <div className={`p-4 rounded-xl border space-y-3 ${
                  isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-950/60 border-slate-800'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={`p-1.5 rounded-lg ${isLight ? 'bg-amber-50 text-amber-700' : 'bg-amber-500/10 text-amber-400'}`}>
                        <Calendar className="w-4 h-4" />
                      </div>
                      <h5 className={`text-xs font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>Dia da Semana</h5>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={scheduleConfig.weekly.enabled}
                      onClick={() => setScheduleConfig({
                        ...scheduleConfig,
                        weekly: { ...scheduleConfig.weekly, enabled: !scheduleConfig.weekly.enabled }
                      })}
                      className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        scheduleConfig.weekly.enabled ? 'bg-amber-500' : (isLight ? 'bg-slate-300' : 'bg-slate-800')
                      }`}
                      id="toggle-weekly-backup-schedule"
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                          scheduleConfig.weekly.enabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <p className={`text-[11px] ${isLight ? 'text-slate-600 font-medium' : 'text-slate-400'}`}>
                    Snapshot semanal para fechamento e auditoria da semana.
                  </p>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <span className={`text-[10px] block mb-1 ${isLight ? 'text-slate-600 font-medium' : 'text-slate-400'}`}>Dia:</span>
                      <select
                        value={scheduleConfig.weekly.dayOfWeek}
                        onChange={(e) => setScheduleConfig({
                          ...scheduleConfig,
                          weekly: { ...scheduleConfig.weekly, dayOfWeek: parseInt(e.target.value, 10) }
                        })}
                        disabled={!scheduleConfig.weekly.enabled}
                        className={`w-full rounded-lg px-2 py-1 text-xs border disabled:opacity-40 ${
                          isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
                        }`}
                      >
                        {daysOfWeekLabels.map((name, idx) => (
                          <option key={idx} value={idx}>{name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <span className={`text-[10px] block mb-1 ${isLight ? 'text-slate-600 font-medium' : 'text-slate-400'}`}>Horário:</span>
                      <input
                        type="time"
                        value={scheduleConfig.weekly.time}
                        onChange={(e) => setScheduleConfig({
                          ...scheduleConfig,
                          weekly: { ...scheduleConfig.weekly, time: e.target.value }
                        })}
                        disabled={!scheduleConfig.weekly.enabled}
                        className={`w-full rounded-lg px-2 py-1 text-xs border disabled:opacity-40 ${
                          isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
                        }`}
                      />
                    </div>
                  </div>
                </div>

                {/* 4. Dia do Mês */}
                <div className={`p-4 rounded-xl border space-y-3 ${
                  isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-950/60 border-slate-800'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={`p-1.5 rounded-lg ${isLight ? 'bg-purple-50 text-purple-700' : 'bg-purple-500/10 text-purple-400'}`}>
                        <Layers className="w-4 h-4" />
                      </div>
                      <h5 className={`text-xs font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>Dia do Mês</h5>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={scheduleConfig.monthly.enabled}
                      onClick={() => setScheduleConfig({
                        ...scheduleConfig,
                        monthly: { ...scheduleConfig.monthly, enabled: !scheduleConfig.monthly.enabled }
                      })}
                      className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        scheduleConfig.monthly.enabled ? 'bg-purple-500' : (isLight ? 'bg-slate-300' : 'bg-slate-800')
                      }`}
                      id="toggle-monthly-backup-schedule"
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                          scheduleConfig.monthly.enabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <p className={`text-[11px] ${isLight ? 'text-slate-600 font-medium' : 'text-slate-400'}`}>
                    Cópia mensal consolidada para arquivo permanente e inventário.
                  </p>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <span className={`text-[10px] block mb-1 ${isLight ? 'text-slate-600 font-medium' : 'text-slate-400'}`}>Dia do Mês:</span>
                      <select
                        value={scheduleConfig.monthly.dayOfMonth}
                        onChange={(e) => setScheduleConfig({
                          ...scheduleConfig,
                          monthly: { ...scheduleConfig.monthly, dayOfMonth: parseInt(e.target.value, 10) }
                        })}
                        disabled={!scheduleConfig.monthly.enabled}
                        className={`w-full rounded-lg px-2 py-1 text-xs border disabled:opacity-40 ${
                          isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
                        }`}
                      >
                        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                          <option key={d} value={d}>Dia {d}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <span className={`text-[10px] block mb-1 ${isLight ? 'text-slate-600 font-medium' : 'text-slate-400'}`}>Horário:</span>
                      <input
                        type="time"
                        value={scheduleConfig.monthly.time}
                        onChange={(e) => setScheduleConfig({
                          ...scheduleConfig,
                          monthly: { ...scheduleConfig.monthly, time: e.target.value }
                        })}
                        disabled={!scheduleConfig.monthly.enabled}
                        className={`w-full rounded-lg px-2 py-1 text-xs border disabled:opacity-40 ${
                          isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
                        }`}
                      />
                    </div>
                  </div>
                </div>

              </div>

              {/* Status and Save button */}
              <div className="flex items-center justify-between pt-2 flex-wrap gap-3">
                <div className={`text-xs ${isLight ? 'text-slate-600 font-medium' : 'text-slate-400'}`}>
                  {scheduleConfig.lastBackupStatus || 'Pronto para execuções programadas.'}
                </div>

                <button
                  type="button"
                  onClick={handleSaveScheduleConfig}
                  disabled={isSavingSchedule}
                  className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-sky-600/20 transition-all cursor-pointer"
                  id="btn-save-backup-schedule-config"
                >
                  {isSavingSchedule ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : scheduleSavedSuccess ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-300" />
                      <span>Configurações Salvas!</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Salvar Configurações de Agendamento</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 3: ARQUIVO LOCAL (.JSON)                             */}
          {/* ======================================================== */}
          {activeTab === 'local' && (
            <div className="space-y-6 animate-in fade-in duration-150" id="section-local-backup">
              
              {/* Section 1: Export Local File */}
              <div className={`p-5 rounded-2xl border space-y-4 ${
                isLight ? 'bg-white border-slate-200' : 'bg-slate-950/60 border-slate-800'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 dark:text-amber-400 border border-amber-500/20">
                      <Download className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        Exportar Arquivo de Backup para o Computador
                      </h4>
                      <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        Baixe um arquivo <code className={`${isLight ? 'text-amber-700 bg-amber-50 px-1 py-0.5 rounded border border-amber-200' : 'text-amber-300'} font-mono`}>.json</code> completo contendo todo o catálogo, estoque e fluxo.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleExportLocal}
                    disabled={isExportingLocal}
                    className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 !text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-amber-600/20 transition-all cursor-pointer"
                    id="btn-download-local-backup-json"
                  >
                    {isExportingLocal ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Gerando...</span>
                      </>
                    ) : (
                      <>
                        <HardDriveDownload className="w-4 h-4" />
                        <span>Baixar Arquivo JSON</span>
                      </>
                    )}
                  </button>
                </div>

                {localExportResult && (
                  <div className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                    isLight ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-amber-500/10 border-amber-500/20 text-amber-200'
                  }`}>
                    <span>Arquivo gerado: <strong className="font-mono">{localExportResult.filename}</strong> ({localExportResult.fileSizeFormatted})</span>
                    <span className={`${isLight ? 'text-emerald-700' : 'text-emerald-400'} font-bold`}>Download concluído</span>
                  </div>
                )}
              </div>

              {/* Section 2: Restore from Local File */}
              <div className={`p-5 rounded-2xl border space-y-4 ${
                isLight ? 'bg-white border-slate-200' : 'bg-slate-950/60 border-slate-800'
              }`}>
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                    <UploadCloud className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                      Restaurar Banco a partir de Arquivo JSON
                    </h4>
                    <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      Carregue um arquivo gerado anteriormente para restaurar o sistema
                    </p>
                  </div>
                </div>

                {/* Drop Zone */}
                <div
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                    dragActive
                      ? (isLight ? 'border-sky-500 bg-sky-50' : 'border-sky-400 bg-sky-500/10')
                      : (isLight ? 'border-slate-300 hover:border-slate-400 bg-slate-50/70' : 'border-slate-800 hover:border-slate-700 bg-slate-900/40')
                  }`}
                  id="drop-backup-file-zone"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={(e) => e.target.files?.[0] && handleFileProcess(e.target.files[0])}
                    className="hidden"
                  />
                  <UploadCloud className={`w-8 h-8 mx-auto mb-2 ${isLight ? 'text-slate-400' : 'text-slate-500'}`} />
                  <p className={`text-xs font-bold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                    Arraste o arquivo .json aqui ou clique para selecionar
                  </p>
                  <p className={`text-[11px] mt-1 ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
                    Suporta arquivos estruturados de backup do StocckRMA
                  </p>
                </div>

                {/* File Validation Preview */}
                {validationResult?.isValid && validationResult.summary && (
                  <div className={`p-4 rounded-xl border space-y-3 ${
                    isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <span className={`text-xs font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{selectedFile?.name}</span>
                      </div>
                      <span className={`text-[11px] font-bold ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>Arquivo Válido</span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className={`p-2 rounded border ${isLight ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
                        <span className={`text-[10px] block ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Catálogo</span>
                        <strong className={`font-mono ${isLight ? 'text-emerald-700 font-bold' : 'text-emerald-400'}`}>{validationResult.summary.counts.products} itens</strong>
                      </div>
                      <div className={`p-2 rounded border ${isLight ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
                        <span className={`text-[10px] block ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Estoque</span>
                        <strong className={`font-mono ${isLight ? 'text-emerald-700 font-bold' : 'text-emerald-400'}`}>{validationResult.summary.counts.triageUnits} itens</strong>
                      </div>
                      <div className={`p-2 rounded border ${isLight ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
                        <span className={`text-[10px] block ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Fluxo</span>
                        <strong className={`font-mono ${isLight ? 'text-emerald-700 font-bold' : 'text-emerald-400'}`}>{validationResult.summary.counts.dailyInflows} itens</strong>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <div className={`flex items-center gap-4 text-xs ${isLight ? 'text-slate-800 font-medium' : 'text-slate-200'}`}>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="fileRestoreMode"
                            checked={restoreMode === 'replace'}
                            onChange={() => setRestoreMode('replace')}
                            className="text-sky-500 focus:ring-0"
                          />
                          <span>Substituição Completa</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="fileRestoreMode"
                            checked={restoreMode === 'merge'}
                            onChange={() => setRestoreMode('merge')}
                            className="text-sky-500 focus:ring-0"
                          />
                          <span>Mesclar</span>
                        </label>
                      </div>

                      <button
                        type="button"
                        onClick={handleConfirmRestoreFile}
                        disabled={isRestoring}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 !text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
                        id="btn-confirm-restore-file"
                      >
                        Restaurar deste Arquivo
                      </button>
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className={`px-6 py-4 border-t flex items-center justify-between text-xs ${
          isLight ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-slate-800 bg-slate-900/60 text-slate-400'
        }`}>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className={isLight ? 'font-medium text-slate-700' : ''}>Banco de Contingência Online Supabase Conectado</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-2 rounded-xl transition-colors cursor-pointer border ${
              isLight ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 font-medium' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-transparent'
            }`}
            id="btn-close-backup-footer"
          >
            Fechar
          </button>
        </div>
      </div>

      {/* Delete Cloud Snapshot Confirmation Dialog */}
      {snapshotToDelete && (
        <div 
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/85 animate-in fade-in duration-150"
          id="delete-snapshot-dialog"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDeletingSnapshot) setSnapshotToDelete(null);
          }}
        >
          <div 
            className={`w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150 border ${
              isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
            }`}
            id="delete-snapshot-dialog-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-rose-500">
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className={`text-base font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>Excluir Snapshot em Nuvem</h3>
                <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Esta ação não poderá ser desfeita.</p>
              </div>
            </div>

            <div className={`p-3.5 rounded-xl border space-y-1.5 text-xs ${
              isLight ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-slate-950/60 border-slate-800/80 text-slate-300'
            }`}>
              <p className={`font-semibold truncate ${isLight ? 'text-slate-900' : 'text-white'}`}>{snapshotToDelete.title}</p>
              <div className={`flex items-center gap-2 font-mono text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                <span>Criado em: {snapshotToDelete.createdAtFormatted}</span>
                <span>&bull;</span>
                <span>{snapshotToDelete.fileSizeFormatted}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeletingSnapshot}
                onClick={() => setSnapshotToDelete(null)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer border ${
                  isLight ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 shadow-xs' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-transparent'
                }`}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeletingSnapshot}
                onClick={handleConfirmDeleteSnapshot}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 !text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-rose-600/20 cursor-pointer flex items-center gap-1.5"
                id="btn-confirm-delete-snapshot"
              >
                {isDeletingSnapshot ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Excluindo...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirmar Exclusão</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dedicated Backup Storage Manager & Quick Deletion Modal */}
      <BackupStorageManagerModal
        isOpen={isStorageManagerOpen}
        onClose={() => setIsStorageManagerOpen(false)}
        isLight={isLight}
        onRestoreSuccess={onRestoreSuccess}
      />
    </div>
  );
}
