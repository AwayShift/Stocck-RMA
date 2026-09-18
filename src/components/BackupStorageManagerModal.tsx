/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Dedicated Cloud Backup Storage Manager & Quick Purge Modal
 * Resolves large storage consumption (~400MB) with fast pagination and 1-click batch cleanup.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Database,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  X,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Layers,
  Calendar,
  Clock,
  ArrowUpDown,
  Check,
  Filter,
  CheckSquare,
  Square,
  HardDrive
} from 'lucide-react';
import {
  getBackupStorageStats,
  fetchPaginatedCloudBackups,
  bulkDeleteCloudSnapshots,
  quickCleanupBackups,
  purgeOrphanBackupChunks,
  deleteCloudSnapshot,
  downloadCloudSnapshotAsJson,
  restoreFromCloudSnapshot,
  FetchCloudBackupsOptions,
  QuickCleanupPolicy
} from '../lib/backupService';
import { BackupStorageStats, CloudBackupRecord } from '../types';

interface BackupStorageManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  isLight?: boolean;
  onRestoreSuccess?: (payload?: any) => void;
}

export default function BackupStorageManagerModal({
  isOpen,
  onClose,
  isLight = false,
  onRestoreSuccess
}: BackupStorageManagerModalProps) {
  // Stats
  const [stats, setStats] = useState<BackupStorageStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  // Paginated list
  const [backups, setBackups] = useState<CloudBackupRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [isLoadingList, setIsLoadingList] = useState(false);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [triggerFilter, setTriggerFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'last7days' | 'last30days' | 'older30days'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'largest'>('newest');

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Operations & Modals
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStatus, setProgressStatus] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);
  const [actionErrorMessage, setActionErrorMessage] = useState<string | null>(null);

  // Quick Cleanup Confirm Modal
  const [cleanupModalPolicy, setCleanupModalPolicy] = useState<QuickCleanupPolicy | null>(null);
  const [cleanupModalTitle, setCleanupModalTitle] = useState('');
  const [cleanupModalDescription, setCleanupModalDescription] = useState('');
  const [confirmInputText, setConfirmInputText] = useState('');

  // Single Item Delete Confirm
  const [itemToDelete, setItemToDelete] = useState<CloudBackupRecord | null>(null);

  // Load storage stats
  const refreshStats = useCallback(async () => {
    setIsLoadingStats(true);
    try {
      const data = await getBackupStorageStats();
      setStats(data);
    } catch (e) {
      console.error('Error fetching storage stats:', e);
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  // Load paginated list
  const loadBackups = useCallback(async (pageToLoad = currentPage) => {
    setIsLoadingList(true);
    setActionErrorMessage(null);
    try {
      const options: FetchCloudBackupsOptions = {
        page: pageToLoad,
        pageSize,
        triggerType: triggerFilter,
        search,
        sortBy,
        dateFilter
      };
      const res = await fetchPaginatedCloudBackups(options);
      setBackups(res.snapshots);
      setTotalCount(res.totalCount);
      setTotalPages(res.totalPages);
      setCurrentPage(res.page);
      // Clear selections that are not on page
      setSelectedIds(new Set());
    } catch (e: any) {
      console.error('Error loading backups:', e);
      setActionErrorMessage(e?.message || 'Falha ao carregar lista de backups');
    } finally {
      setIsLoadingList(false);
    }
  }, [currentPage, pageSize, triggerFilter, search, sortBy, dateFilter]);

  // Initial load when modal opens
  useEffect(() => {
    if (isOpen) {
      refreshStats();
      loadBackups(1);
    }
  }, [isOpen, refreshStats, loadBackups]);

  // Handle page change
  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages || newPage === currentPage) return;
    setCurrentPage(newPage);
    loadBackups(newPage);
  };

  // Selection toggle
  const toggleSelectAllPage = () => {
    if (selectedIds.size === backups.length && backups.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(backups.map(b => b.id)));
    }
  };

  const toggleSelectItem = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  // Bulk delete selected
  const handleBulkDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    if (!window.confirm(`Tem certeza que deseja excluir ${count} backup(s) selecionado(s) e todos os seus dados do Supabase?`)) {
      return;
    }

    setIsProcessing(true);
    setProgressStatus(`Excluindo ${count} backups...`);
    try {
      const idsArray: string[] = Array.from(selectedIds);
      const res = await bulkDeleteCloudSnapshots(idsArray, (deleted, total) => {
        setProgressStatus(`Excluindo backups: ${deleted} de ${total}...`);
      });

      setActionSuccessMessage(`${res.deletedCount} backup(s) e todos os seus fragmentos foram excluídos com sucesso!`);
      setSelectedIds(new Set());
      await refreshStats();
      await loadBackups(1);
    } catch (e: any) {
      setActionErrorMessage(e?.message || 'Erro ao excluir backups selecionados.');
    } finally {
      setIsProcessing(false);
      setProgressStatus(null);
    }
  };

  // Quick Cleanup Trigger
  const triggerQuickCleanup = async (policy: QuickCleanupPolicy) => {
    setIsProcessing(true);
    setProgressStatus('Executando limpeza inteligente no banco de dados...');
    try {
      const res = await quickCleanupBackups(policy, (current, total) => {
        setProgressStatus(`Processando registros: ${current} de ${total}...`);
      });

      if (res.success) {
        setActionSuccessMessage(res.message);
      } else {
        setActionErrorMessage(res.message);
      }
      setCleanupModalPolicy(null);
      await refreshStats();
      await loadBackups(1);
    } catch (e: any) {
      setActionErrorMessage(e?.message || 'Erro durante a limpeza de backups.');
    } finally {
      setIsProcessing(false);
      setProgressStatus(null);
    }
  };

  // Single Item Delete
  const handleConfirmSingleDelete = async () => {
    if (!itemToDelete) return;
    setIsProcessing(true);
    setProgressStatus('Excluindo snapshot e liberando espaço no Supabase...');
    try {
      await deleteCloudSnapshot(itemToDelete.id);
      setActionSuccessMessage(`Snapshot "${itemToDelete.title}" excluído com sucesso!`);
      setItemToDelete(null);
      await refreshStats();
      await loadBackups(currentPage);
    } catch (e: any) {
      setActionErrorMessage(e?.message || 'Erro ao excluir backup.');
    } finally {
      setIsProcessing(false);
      setProgressStatus(null);
    }
  };

  // Purge orphan chunks
  const handlePurgeOrphans = async () => {
    setIsProcessing(true);
    setProgressStatus('Buscando e removendo fragmentos órfãos no Supabase...');
    try {
      const res = await purgeOrphanBackupChunks((purged, total) => {
        setProgressStatus(`Limpando fragmentos órfãos: ${purged} de ${total}...`);
      });
      if (res.purgedCount > 0) {
        setActionSuccessMessage(`${res.purgedCount} fragmentos órfãos foram excluídos com sucesso!`);
      } else {
        setActionSuccessMessage('Nenhum fragmento órfão encontrado. A integridade está perfeita.');
      }
      await refreshStats();
      await loadBackups(currentPage);
    } catch (e: any) {
      setActionErrorMessage(e?.message || 'Erro ao limpar órfãos.');
    } finally {
      setIsProcessing(false);
      setProgressStatus(null);
    }
  };

  if (!isOpen) return null;

  const isAllPageSelected = backups.length > 0 && selectedIds.size === backups.length;
  const percentUsed = stats?.percentQuotaUsed || 0;
  const isHighStorage = percentUsed >= 60;
  const isCriticalStorage = percentUsed >= 85;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 animate-fadeIn">
      <div
        id="backup-storage-manager-modal"
        className={`w-full max-w-6xl max-h-[95vh] flex flex-col rounded-2xl shadow-2xl border transition-colors overflow-hidden ${
          isLight
            ? 'bg-slate-50 border-slate-300 text-slate-900'
            : 'bg-slate-900 border-slate-800 text-slate-100'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b ${
            isLight
              ? 'bg-white border-slate-200'
              : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${
              isLight ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
            }`}>
              <Database className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className={`text-xl font-bold tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  Gerenciador & Limpeza de Armazenamento de Backups
                </h2>
                <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${
                  isLight ? 'bg-blue-100 text-blue-800 border-blue-200' : 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                }`}>
                  Supabase PostgreSQL
                </span>
              </div>
              <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-600 font-medium' : 'text-slate-400'}`}>
                Visualize 100% dos backups registrados, monitore o consumo de disco e libere espaço rapidamente.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                refreshStats();
                loadBackups(currentPage);
              }}
              disabled={isLoadingStats || isLoadingList}
              className={`p-2 rounded-lg border transition-all cursor-pointer ${
                isLight
                  ? 'bg-white border-slate-300 hover:bg-slate-100 text-slate-700'
                  : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300'
              }`}
              title="Atualizar dados"
            >
              <RefreshCw className={`w-4 h-4 ${(isLoadingStats || isLoadingList) ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className={`p-2 rounded-lg border transition-all cursor-pointer ${
                isLight
                  ? 'bg-white border-slate-300 hover:bg-slate-100 text-slate-700'
                  : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Top Alerts / Feedback Messages */}
        {actionSuccessMessage && (
          <div className={`mx-6 mt-4 p-3.5 rounded-xl border flex items-center justify-between text-sm ${
            isLight
              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
              : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
          }`}>
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <span className="font-medium">{actionSuccessMessage}</span>
            </div>
            <button onClick={() => setActionSuccessMessage(null)} className="p-1 hover:opacity-75 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {actionErrorMessage && (
          <div className={`mx-6 mt-4 p-3.5 rounded-xl border flex items-center justify-between text-sm ${
            isLight
              ? 'bg-rose-50 border-rose-300 text-rose-800'
              : 'bg-rose-500/15 border-rose-500/30 text-rose-400'
          }`}>
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span className="font-medium">{actionErrorMessage}</span>
            </div>
            <button onClick={() => setActionErrorMessage(null)} className="p-1 hover:opacity-75 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Scrollable Content Container */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Storage Metrics Panel */}
          <div
            className={`p-5 rounded-xl border ${
              isLight
                ? 'bg-white border-slate-200 shadow-sm'
                : 'bg-slate-800/60 border-slate-700/80'
            }`}
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <HardDrive className="w-5 h-5 text-indigo-500" />
                  <h3 className={`font-semibold text-base ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    Consumo de Espaço no Supabase
                  </h3>
                </div>
                <p className={`text-xs mt-1 ${isLight ? 'text-slate-600 font-medium' : 'text-slate-400'}`}>
                  Cota gratuita padrão do banco: <strong>500 MB</strong>. O volume excessivo pode pausar ou cobrar o projeto.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className={`text-xs uppercase tracking-wider font-semibold ${isLight ? 'text-slate-600' : 'text-slate-500'}`}>
                    Espaço Ocupado
                  </div>
                  <div className={`text-xl font-bold tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    {stats?.totalSizeFormatted || 'Calculando...'}
                    <span className={`text-xs font-normal ml-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>/ 500 MB</span>
                  </div>
                </div>
                <div
                  className={`px-3 py-1.5 rounded-lg text-sm font-bold border ${
                    isCriticalStorage
                      ? isLight ? 'bg-rose-100 text-rose-800 border-rose-300' : 'bg-rose-500/15 text-rose-500 border-rose-500/30'
                      : isHighStorage
                      ? isLight ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-amber-500/15 text-amber-500 border-amber-500/30'
                      : isLight ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                  }`}
                >
                  {percentUsed}% usado
                </div>
              </div>
            </div>

            {/* Storage Progress Bar */}
            <div className={`w-full h-3.5 rounded-full overflow-hidden mb-4 ${isLight ? 'bg-slate-200' : 'bg-slate-700/60'}`}>
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  isCriticalStorage
                    ? 'bg-gradient-to-r from-amber-500 to-rose-600'
                    : isHighStorage
                    ? 'bg-gradient-to-r from-blue-500 to-amber-500'
                    : 'bg-gradient-to-r from-emerald-500 to-blue-500'
                }`}
                style={{ width: `${Math.min(100, Math.max(3, percentUsed))}%` }}
              />
            </div>

            {/* 4 Metric Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div
                className={`p-3 rounded-lg border ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-slate-700/50'
                }`}
              >
                <div className={`text-xs font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                  Registros no Supabase
                </div>
                <div className={`text-lg font-bold mt-0.5 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  {stats ? stats.totalRows.toLocaleString('pt-BR') : '...'}
                  <span className={`text-xs font-normal ml-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>linhas</span>
                </div>
              </div>

              <div
                className={`p-3 rounded-lg border ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-slate-700/50'
                }`}
              >
                <div className={`text-xs font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                  Snapshots Mestres
                </div>
                <div className={`text-lg font-bold mt-0.5 ${
                  isLight ? 'text-blue-700' : 'text-blue-400'
                }`}>
                  {stats ? stats.masterSnapshotsCount.toLocaleString('pt-BR') : '...'}
                  <span className={`text-xs font-normal ml-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>backups</span>
                </div>
              </div>

              <div
                className={`p-3 rounded-lg border ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-slate-700/50'
                }`}
              >
                <div className={`text-xs font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                  Partes / Fragmentos
                </div>
                <div className={`text-lg font-bold mt-0.5 ${
                  isLight ? 'text-amber-700' : 'text-amber-400'
                }`}>
                  {stats ? stats.chunkRowsCount.toLocaleString('pt-BR') : '...'}
                  <span className={`text-xs font-normal ml-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>chunks</span>
                </div>
              </div>

              <div
                className={`p-3 rounded-lg border ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-slate-700/50'
                }`}
              >
                <div className={`text-xs font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                  Espaço Disponível
                </div>
                <div className={`text-lg font-bold mt-0.5 ${
                  isLight ? 'text-emerald-700' : 'text-emerald-400'
                }`}>
                  {stats
                    ? `${Math.max(0, 500 - Math.round(stats.totalSizeBytes / (1024 * 1024)))} MB`
                    : '...'}
                </div>
              </div>
            </div>
          </div>

          {/* 1-Click Fast Cleanup Presets */}
          <div
            className={`p-5 rounded-xl border ${
              isLight
                ? 'bg-amber-50/70 border-amber-300'
                : 'bg-amber-950/20 border-amber-800/40'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              <h3 className={`font-bold text-sm uppercase tracking-wider ${
                isLight ? 'text-amber-900' : 'text-amber-400'
              }`}>
                Ações Rápidas de Limpeza (1 Clique)
              </h3>
            </div>
            <p className={`text-xs mb-4 ${isLight ? 'text-slate-700 font-medium' : 'text-slate-300'}`}>
              Utilize os botões abaixo para liberar dezenas ou centenas de megabytes instantaneamente sem precisar selecionar um a um:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {/* Keep 5 latest */}
              <button
                disabled={isProcessing}
                onClick={() => {
                  setCleanupModalPolicy('keep_latest_5');
                  setCleanupModalTitle('Manter Apenas os 5 Mais Recentes');
                  setCleanupModalDescription(
                    'Esta ação manterá os 5 snapshots mais recentes e excluirá todos os demais backups e suas partes do Supabase.'
                  );
                }}
                className={`p-3 rounded-xl border text-left transition-all flex items-start gap-3 ${
                  isLight
                    ? 'bg-white hover:bg-slate-50 border-slate-300 hover:border-amber-400 text-slate-800'
                    : 'bg-slate-800/90 hover:bg-slate-800 border-slate-700 hover:border-amber-500/50 text-slate-200'
                }`}
              >
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500 mt-0.5">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-xs">Manter Últimos 5 Backups</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Elimina todos os anteriores, liberando a maior parte do espaço.
                  </div>
                </div>
              </button>

              {/* Keep 10 latest */}
              <button
                disabled={isProcessing}
                onClick={() => {
                  setCleanupModalPolicy('keep_latest_10');
                  setCleanupModalTitle('Manter os 10 Mais Recentes');
                  setCleanupModalDescription(
                    'Esta ação manterá os 10 snapshots mais recentes e excluirá todos os backups anteriores.'
                  );
                }}
                className={`p-3 rounded-xl border text-left transition-all flex items-start gap-3 ${
                  isLight
                    ? 'bg-white hover:bg-slate-50 border-slate-300 hover:border-amber-400 text-slate-800'
                    : 'bg-slate-800/90 hover:bg-slate-800 border-slate-700 hover:border-amber-500/50 text-slate-200'
                }`}
              >
                <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500 mt-0.5">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-xs">Manter Últimos 10 Backups</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Excelente equilíbrio entre segurança histórica e economia de disco.
                  </div>
                </div>
              </button>

              {/* Hourly Only */}
              <button
                disabled={isProcessing}
                onClick={() => {
                  setCleanupModalPolicy('hourly_only');
                  setCleanupModalTitle('Excluir Todos os Backups "Por Hora"');
                  setCleanupModalDescription(
                    'Exclui apenas os backups do tipo "hourly", preservando todos os backups manuais, diários e semanais.'
                  );
                }}
                className={`p-3 rounded-xl border text-left transition-all flex items-start gap-3 ${
                  isLight
                    ? 'bg-white hover:bg-slate-50 border-slate-300 hover:border-amber-400 text-slate-800'
                    : 'bg-slate-800/90 hover:bg-slate-800 border-slate-700 hover:border-amber-500/50 text-slate-200'
                }`}
              >
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500 mt-0.5">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-xs">Excluir Backups Por Hora</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Remove os snapshots rotativos frequentes sem perder os diários.
                  </div>
                </div>
              </button>

              {/* Older than 7 days */}
              <button
                disabled={isProcessing}
                onClick={() => {
                  setCleanupModalPolicy('older_than_7_days');
                  setCleanupModalTitle('Excluir Backups com Mais de 7 Dias');
                  setCleanupModalDescription(
                    'Exclui todos os backups gravados há mais de 7 dias.'
                  );
                }}
                className={`p-3 rounded-xl border text-left transition-all flex items-start gap-3 ${
                  isLight
                    ? 'bg-white hover:bg-slate-50 border-slate-300 hover:border-amber-400 text-slate-800'
                    : 'bg-slate-800/90 hover:bg-slate-800 border-slate-700 hover:border-amber-500/50 text-slate-200'
                }`}
              >
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500 mt-0.5">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-xs">Excluir Mais Antigos que 7 Dias</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Mantém apenas a semana corrente.
                  </div>
                </div>
              </button>

              {/* Purge Orphan Chunks */}
              <button
                disabled={isProcessing}
                onClick={handlePurgeOrphans}
                className={`p-3 rounded-xl border text-left transition-all flex items-start gap-3 ${
                  isLight
                    ? 'bg-white hover:bg-slate-50 border-slate-300 hover:border-amber-400 text-slate-800'
                    : 'bg-slate-800/90 hover:bg-slate-800 border-slate-700 hover:border-amber-500/50 text-slate-200'
                }`}
              >
                <div className="p-2 rounded-lg bg-teal-500/10 text-teal-500 mt-0.5">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-xs">Limpar Fragmentos Órfãos</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Varre e remove partes de backups que perderam o registro mestre.
                  </div>
                </div>
              </button>

              {/* Delete All (Full Wipe) */}
              <button
                disabled={isProcessing}
                onClick={() => {
                  setCleanupModalPolicy('delete_all');
                  setCleanupModalTitle('Limpeza Total (Zerar Todos os Backups)');
                  setCleanupModalDescription(
                    'ATENÇÃO: Isso excluirá TODOS os backups salvos no Supabase, liberando 100% dos ~400MB imediatamente. Requer confirmação por texto.'
                  );
                }}
                className={`p-3 rounded-xl border text-left transition-all flex items-start gap-3 ${
                  isLight
                    ? 'bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-900'
                    : 'bg-rose-950/30 hover:bg-rose-950/50 border-rose-800/40 text-rose-200'
                }`}
              >
                <div className="p-2 rounded-lg bg-rose-500/15 text-rose-500 mt-0.5">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-xs text-rose-500">Excluir Todos os Backups</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Zera completamente a tabela de backups para máxima liberação.
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Filters, Search & Bulk Actions Bar */}
          <div
            className={`p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-3 ${
              isLight ? 'bg-white border-slate-200' : 'bg-slate-800/60 border-slate-700/80'
            }`}
          >
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por ID, nome do arquivo ou gatilho..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    loadBackups(1);
                  }
                }}
                className={`w-full pl-9 pr-4 py-2 text-xs rounded-lg border outline-none transition-colors ${
                  isLight
                    ? 'bg-slate-50 border-slate-300 focus:border-amber-500 text-slate-900'
                    : 'bg-slate-900 border-slate-700 focus:border-amber-500 text-slate-100'
                }`}
              />
            </div>

            {/* Filter Selects */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Trigger Filter */}
              <select
                value={triggerFilter}
                onChange={(e) => {
                  setTriggerFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className={`px-3 py-2 text-xs rounded-lg border outline-none font-medium ${
                  isLight
                    ? 'bg-slate-50 border-slate-300 text-slate-700'
                    : 'bg-slate-900 border-slate-700 text-slate-200'
                }`}
              >
                <option value="all">Todos os Gatilhos</option>
                <option value="manual">Manuais (Sob Demanda)</option>
                <option value="hourly">Por Hora (hourly)</option>
                <option value="end_of_day">Fim de Expediente</option>
                <option value="weekly">Semanal</option>
                <option value="monthly">Mensal</option>
              </select>

              {/* Date Filter */}
              <select
                value={dateFilter}
                onChange={(e: any) => {
                  setDateFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className={`px-3 py-2 text-xs rounded-lg border outline-none font-medium ${
                  isLight
                    ? 'bg-slate-50 border-slate-300 text-slate-700'
                    : 'bg-slate-900 border-slate-700 text-slate-200'
                }`}
              >
                <option value="all">Todo o Período</option>
                <option value="today">Apenas Hoje</option>
                <option value="last7days">Últimos 7 dias</option>
                <option value="last30days">Últimos 30 dias</option>
                <option value="older30days">Mais de 30 dias</option>
              </select>

              {/* Sort Order */}
              <select
                value={sortBy}
                onChange={(e: any) => {
                  setSortBy(e.target.value);
                  setCurrentPage(1);
                }}
                className={`px-3 py-2 text-xs rounded-lg border outline-none font-medium ${
                  isLight
                    ? 'bg-slate-50 border-slate-300 text-slate-700'
                    : 'bg-slate-900 border-slate-700 text-slate-200'
                }`}
              >
                <option value="newest">Mais Recentes Primeiro</option>
                <option value="oldest">Mais Antigos Primeiro</option>
                <option value="largest">Maior Tamanho</option>
              </select>

              {/* Page Size */}
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className={`px-3 py-2 text-xs rounded-lg border outline-none font-medium ${
                  isLight
                    ? 'bg-slate-50 border-slate-300 text-slate-700'
                    : 'bg-slate-900 border-slate-700 text-slate-200'
                }`}
              >
                <option value={20}>20 / pág</option>
                <option value={25}>25 / pág</option>
                <option value={50}>50 / pág</option>
                <option value={100}>100 / pág</option>
              </select>
            </div>
          </div>

          {/* Bulk Action Selected Bar (Floats or shows when items are selected) */}
          {selectedIds.size > 0 && (
            <div
              className={`p-3.5 rounded-xl border flex items-center justify-between transition-all animate-fadeIn ${
                isLight
                  ? 'bg-amber-100/90 border-amber-300 text-amber-900'
                  : 'bg-amber-950/50 border-amber-800/60 text-amber-200'
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-semibold">
                <CheckSquare className="w-4 h-4 text-amber-500" />
                <span>
                  {selectedIds.size} de {backups.length} itens desta página selecionados
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className={`px-2.5 py-1.5 rounded-lg text-xs border transition-colors ${
                    isLight
                      ? 'bg-white border-amber-300 hover:bg-slate-50 text-slate-700'
                      : 'bg-slate-800 border-amber-700/60 hover:bg-slate-700 text-slate-200'
                  }`}
                >
                  Desmarcar
                </button>
                <button
                  disabled={isProcessing}
                  onClick={handleBulkDeleteSelected}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir Selecionados ({selectedIds.size})</span>
                </button>
              </div>
            </div>
          )}

          {/* Table Container */}
          <div
            className={`rounded-xl border overflow-hidden ${
              isLight
                ? 'bg-white border-slate-300 shadow-sm'
                : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr
                    className={`border-b uppercase font-bold tracking-wider text-[11px] ${
                      isLight
                        ? 'bg-slate-100 border-slate-300 text-slate-700'
                        : 'bg-slate-800/80 border-slate-700/70 text-slate-400'
                    }`}
                  >
                    <th className="p-3.5 w-10 text-center">
                      <button
                        onClick={toggleSelectAllPage}
                        className="flex items-center justify-center p-1 rounded hover:opacity-80 cursor-pointer"
                        title={isAllPageSelected ? 'Desmarcar todos' : 'Selecionar todos desta página'}
                      >
                        {isAllPageSelected ? (
                          <CheckSquare className="w-4 h-4 text-amber-500" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400" />
                        )}
                      </button>
                    </th>
                    <th className="p-3.5">Backup / Título</th>
                    <th className="p-3.5">Tipo / Gatilho</th>
                    <th className="p-3.5">Data & Hora</th>
                    <th className="p-3.5">Tamanho & Partes</th>
                    <th className="p-3.5">Autor / Operador</th>
                    <th className="p-3.5 text-right">Ações Rápidas</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isLight ? 'divide-slate-200' : 'divide-slate-800'}`}>
                  {isLoadingList ? (
                    <tr>
                      <td colSpan={7} className="p-12 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <RefreshCw className="w-6 h-6 animate-spin text-amber-500" />
                          <span className="font-medium text-xs">Carregando lista de backups do Supabase...</span>
                        </div>
                      </td>
                    </tr>
                  ) : backups.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-12 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Database className="w-8 h-8 text-slate-500" />
                          <span className="font-semibold text-sm">Nenhum backup encontrado</span>
                          <span className="text-xs text-slate-500">
                            Ajuste os filtros ou execute um novo backup no sistema.
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    backups.map((b) => {
                      const isSelected = selectedIds.has(b.id);
                      const isHourly = b.triggerType === 'hourly';
                      const isManual = b.triggerType === 'manual';

                      return (
                        <tr
                          key={b.id}
                          className={`transition-colors ${
                            isSelected
                              ? isLight
                                ? 'bg-amber-100/60'
                                : 'bg-amber-950/20'
                              : isLight
                              ? 'hover:bg-slate-50 bg-white'
                              : 'hover:bg-slate-800/40'
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="p-3.5 text-center">
                            <button
                              onClick={() => toggleSelectItem(b.id)}
                              className="flex items-center justify-center p-1 rounded hover:opacity-80 cursor-pointer"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-amber-500" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-400" />
                              )}
                            </button>
                          </td>

                          {/* Title & ID */}
                          <td className="p-3.5">
                            <div className={`font-bold text-sm flex items-center gap-1.5 ${
                              isLight ? 'text-slate-900' : 'text-slate-100'
                            }`}>
                              <span>{b.title}</span>
                            </div>
                            <div className={`text-[11px] font-mono mt-0.5 truncate max-w-xs ${
                              isLight ? 'text-slate-600 font-medium' : 'text-slate-400'
                            }`}>
                              ID: {b.id}
                            </div>
                          </td>

                          {/* Trigger Badge */}
                          <td className="p-3.5 whitespace-nowrap">
                            <span
                              className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                                isManual
                                  ? isLight
                                    ? 'bg-blue-50 text-blue-800 border-blue-300'
                                    : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                  : isHourly
                                  ? isLight
                                    ? 'bg-amber-50 text-amber-900 border-amber-300'
                                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                  : isLight
                                  ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              }`}
                            >
                              {b.triggerLabel || b.triggerType}
                            </span>
                          </td>

                          {/* Date */}
                          <td className={`p-3.5 whitespace-nowrap text-xs font-semibold ${
                            isLight ? 'text-slate-800' : 'text-slate-300'
                          }`}>
                            {b.createdAtFormatted}
                          </td>

                          {/* Size and chunks */}
                          <td className="p-3.5 whitespace-nowrap">
                            <span className={`font-bold text-xs ${
                              isLight ? 'text-slate-900' : 'text-slate-100'
                            }`}>
                              {b.fileSizeFormatted}
                            </span>
                            {b.chunked && (
                              <span className={`ml-2 px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                isLight
                                  ? 'bg-slate-200 text-slate-800 border-slate-300'
                                  : 'bg-slate-700 text-slate-200 border-slate-600'
                              }`}>
                                {b.totalChunks} partes
                              </span>
                            )}
                          </td>

                          {/* Author */}
                          <td className={`p-3.5 text-xs font-medium whitespace-nowrap ${
                            isLight ? 'text-slate-700' : 'text-slate-400'
                          }`}>
                            {b.createdBy?.name || b.createdBy?.email || 'Sistema'}
                          </td>

                          {/* Actions */}
                          <td className="p-3.5 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Download JSON */}
                              <button
                                onClick={async () => {
                                  try {
                                    await downloadCloudSnapshotAsJson(b);
                                  } catch (e: any) {
                                    alert(`Erro ao baixar: ${e.message}`);
                                  }
                                }}
                                title="Baixar arquivo JSON do backup"
                                className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                                  isLight
                                    ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                                }`}
                              >
                                <Download className="w-4 h-4" />
                              </button>

                              {/* Quick Delete Single */}
                              <button
                                onClick={() => setItemToDelete(b)}
                                title="Excluir este backup e liberar espaço"
                                className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                                  isLight
                                    ? 'bg-rose-50 hover:bg-rose-100 border-rose-300 text-rose-700'
                                    : 'bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/20 text-rose-400'
                                }`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls Footer */}
            <div
              className={`p-4 border-t flex flex-col sm:flex-row items-center justify-between gap-3 text-xs ${
                isLight
                  ? 'bg-slate-100 border-slate-200 text-slate-700'
                  : 'bg-slate-900/80 border-slate-800 text-slate-400'
              }`}
            >
              <div className={isLight ? 'text-slate-800' : 'text-slate-300'}>
                Mostrando{' '}
                <strong className={isLight ? 'text-slate-900 font-bold' : 'text-slate-100 font-bold'}>
                  {totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1}
                </strong>{' '}
                a{' '}
                <strong className={isLight ? 'text-slate-900 font-bold' : 'text-slate-100 font-bold'}>
                  {Math.min(currentPage * pageSize, totalCount)}
                </strong>{' '}
                de <strong className={isLight ? 'text-slate-900 font-bold' : 'text-slate-100 font-bold'}>{totalCount}</strong> backups
                mestres
              </div>

              {/* Page Buttons */}
              <div className="flex items-center gap-1.5">
                <button
                  disabled={currentPage <= 1 || isLoadingList}
                  onClick={() => handlePageChange(1)}
                  className={`p-1.5 rounded-md border disabled:opacity-30 transition-colors cursor-pointer ${
                    isLight
                      ? 'bg-white border-slate-300 hover:bg-slate-100 text-slate-800'
                      : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300'
                  }`}
                  title="Primeira página"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>
                <button
                  disabled={currentPage <= 1 || isLoadingList}
                  onClick={() => handlePageChange(currentPage - 1)}
                  className={`p-1.5 rounded-md border disabled:opacity-30 transition-colors cursor-pointer ${
                    isLight
                      ? 'bg-white border-slate-300 hover:bg-slate-100 text-slate-800'
                      : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300'
                  }`}
                  title="Página anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <span className={`px-3 py-1 font-bold text-xs ${
                  isLight ? 'text-slate-800' : 'text-slate-200'
                }`}>
                  Página {currentPage} de {totalPages}
                </span>

                <button
                  disabled={currentPage >= totalPages || isLoadingList}
                  onClick={() => handlePageChange(currentPage + 1)}
                  className={`p-1.5 rounded-md border disabled:opacity-30 transition-colors cursor-pointer ${
                    isLight
                      ? 'bg-white border-slate-300 hover:bg-slate-100 text-slate-800'
                      : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300'
                  }`}
                  title="Próxima página"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  disabled={currentPage >= totalPages || isLoadingList}
                  onClick={() => handlePageChange(totalPages)}
                  className={`p-1.5 rounded-md border disabled:opacity-30 transition-colors cursor-pointer ${
                    isLight
                      ? 'bg-white border-slate-300 hover:bg-slate-100 text-slate-800'
                      : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300'
                  }`}
                  title="Última página"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-t ${
            isLight
              ? 'bg-white border-slate-200 text-slate-700'
              : 'bg-slate-900 border-slate-800 text-slate-400'
          }`}
        >
          <div className="text-xs">
            💡 <strong>Dica Pro:</strong> Mantenha de 5 a 10 backups recentes. O sistema realiza backups automáticos seguros sem sobrecarregar sua cota.
          </div>
          <button
            onClick={onClose}
            className={`px-5 py-2 text-xs font-bold rounded-xl border transition-colors cursor-pointer ${
              isLight
                ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
            }`}
          >
            Fechar Janela
          </button>
        </div>
      </div>

      {/* Confirmation Modal for Quick Cleanup Rules */}
      {cleanupModalPolicy && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/85 animate-fadeIn">
          <div
            className={`w-full max-w-md p-6 rounded-2xl shadow-2xl border space-y-4 ${
              isLight
                ? 'bg-white border-slate-300 text-slate-900'
                : 'bg-slate-900 border-slate-800 text-slate-100'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base">{cleanupModalTitle}</h3>
                <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Confirmação de liberação de armazenamento</p>
              </div>
            </div>

            <p className={`text-xs leading-relaxed ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
              {cleanupModalDescription}
            </p>

            {cleanupModalPolicy === 'delete_all' && (
              <div className="space-y-2 pt-2">
                <label className="text-xs font-semibold text-rose-600 block">
                  Para confirmar a exclusão total, digite a palavra <strong>EXCLUIR</strong>:
                </label>
                <input
                  type="text"
                  placeholder="EXCLUIR"
                  value={confirmInputText}
                  onChange={(e) => setConfirmInputText(e.target.value)}
                  className={`w-full px-3 py-2 text-xs rounded-lg border uppercase outline-none font-bold tracking-widest ${
                    isLight
                      ? 'bg-slate-50 border-slate-300 focus:border-rose-500 text-slate-900'
                      : 'bg-slate-800 border-slate-700 focus:border-rose-500 text-slate-100'
                  }`}
                />
              </div>
            )}

            <div className={`flex items-center justify-end gap-3 pt-3 border-t ${
              isLight ? 'border-slate-200' : 'border-slate-800'
            }`}>
              <button
                disabled={isProcessing}
                onClick={() => {
                  setCleanupModalPolicy(null);
                  setConfirmInputText('');
                }}
                className={`px-4 py-2 text-xs rounded-xl border font-semibold transition-colors cursor-pointer ${
                  isLight
                    ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                }`}
              >
                Cancelar
              </button>

              <button
                disabled={isProcessing || (cleanupModalPolicy === 'delete_all' && confirmInputText !== 'EXCLUIR')}
                onClick={() => triggerQuickCleanup(cleanupModalPolicy)}
                className="px-4 py-2 text-xs rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Confirmar e Liberar Espaço</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Single Item Delete */}
      {itemToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/85 animate-fadeIn">
          <div
            className={`w-full max-w-md p-6 rounded-2xl shadow-2xl border space-y-4 ${
              isLight
                ? 'bg-white border-slate-300 text-slate-900'
                : 'bg-slate-900 border-slate-800 text-slate-100'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base">Excluir Snapshot de Backup</h3>
                <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Operação irreversível</p>
              </div>
            </div>

            <div className={`p-3 rounded-lg text-xs space-y-1 ${isLight ? 'bg-slate-100 border border-slate-200 text-slate-800' : 'bg-slate-800/80 text-slate-200'}`}>
              <div><strong>Título:</strong> {itemToDelete.title}</div>
              <div><strong>Data:</strong> {itemToDelete.createdAtFormatted}</div>
              <div><strong>Tamanho:</strong> {itemToDelete.fileSizeFormatted} ({itemToDelete.totalChunks} partes)</div>
            </div>

            <p className={`text-xs ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
              Tem certeza que deseja excluir permanentemente este backup e todas as suas partes vinculadas no banco de dados Supabase?
            </p>

            <div className={`flex items-center justify-end gap-3 pt-3 border-t ${
              isLight ? 'border-slate-200' : 'border-slate-800'
            }`}>
              <button
                disabled={isProcessing}
                onClick={() => setItemToDelete(null)}
                className={`px-4 py-2 text-xs rounded-xl border font-semibold transition-colors cursor-pointer ${
                  isLight
                    ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                }`}
              >
                Cancelar
              </button>

              <button
                disabled={isProcessing}
                onClick={handleConfirmSingleDelete}
                className="px-4 py-2 text-xs rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Excluir Permanentemente</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {isProcessing && (
        <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-black/85 animate-fadeIn">
          <div
            className={`w-full max-w-sm p-6 rounded-2xl shadow-2xl border text-center space-y-4 ${
              isLight
                ? 'bg-white border-slate-300 text-slate-900'
                : 'bg-slate-900 border-slate-800 text-slate-100'
            }`}
          >
            <RefreshCw className="w-8 h-8 animate-spin text-amber-500 mx-auto" />
            <div>
              <h4 className="font-bold text-sm">Processando Banco de Dados</h4>
              <p className="text-xs text-slate-500 mt-1">
                {progressStatus || 'Executando operações no Supabase...'}
              </p>
            </div>
            <div className="text-[11px] text-slate-400">
              Por favor, não feche a aba enquanto o armazenamento é liberado.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
