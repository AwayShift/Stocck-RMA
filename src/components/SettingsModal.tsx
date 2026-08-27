/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  X, 
  FileSpreadsheet, 
  Check, 
  Sliders, 
  Database, 
  ShieldCheck, 
  Sparkles, 
  HardDriveDownload, 
  RotateCcw, 
  Sun, 
  Moon, 
  Palette, 
  Cloud, 
  ExternalLink, 
  RefreshCw, 
  AlertTriangle, 
  ChevronDown, 
  ChevronUp, 
  ImageIcon,
  UserCheck,
  Download,
  LogOut
} from 'lucide-react';
import { ThemeMode } from '../lib/theme';
import { 
  getCloudinaryConfig, 
  saveCloudinaryConfig, 
  testCloudinaryConnection,
  CloudinaryConfig 
} from '../lib/cloudinaryService';
import {
  persistSystemIntegrationsToCloud,
  fetchRemoteSystemIntegrations,
  calculateCloudinaryMetricsFromDatabase,
  CloudinaryMetricsSummary,
  getLocalCachedCloudinaryMetrics
} from '../lib/integrationsConfigService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  enableSpreadsheetImport: boolean;
  onToggleSpreadsheetImport: (enabled: boolean) => void;
  enableSpreadsheetExport: boolean;
  onToggleSpreadsheetExport: (enabled: boolean) => void;
  themeMode?: ThemeMode;
  onSelectTheme?: (theme: ThemeMode) => void;
  onOpenBackupModal?: (tab?: 'export' | 'restore') => void;
  onOpenDbSwitcherModal?: () => void;
  onLogout?: () => void;
  userRole?: 'admin' | 'operator' | null;
  userEmail?: string;
}

type SettingsTab = 'general' | 'cloudinary' | 'database' | 'session';

export default function SettingsModal({
  isOpen,
  onClose,
  enableSpreadsheetImport,
  onToggleSpreadsheetImport,
  enableSpreadsheetExport,
  onToggleSpreadsheetExport,
  themeMode = 'dark',
  onSelectTheme,
  onOpenBackupModal,
  onOpenDbSwitcherModal,
  onLogout,
  userRole,
  userEmail
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  // Cloudinary State
  const [cloudinaryConfig, setCloudinaryConfig] = useState<CloudinaryConfig>(() => getCloudinaryConfig());
  const [cloudNameInput, setCloudNameInput] = useState<string>(() => getCloudinaryConfig().cloudName);
  const [uploadPresetInput, setUploadPresetInput] = useState<string>(() => getCloudinaryConfig().uploadPreset);
  const [showCloudinaryGuide, setShowCloudinaryGuide] = useState<boolean>(false);
  const [isTestingCloudinary, setIsTestingCloudinary] = useState<boolean>(false);
  const [cloudinaryTestResult, setCloudinaryTestResult] = useState<{ success: boolean; message: string; testUrl?: string } | null>(null);
  const [cloudinarySaveSuccess, setCloudinarySaveSuccess] = useState<boolean>(false);
  const [cloudinaryMetrics, setCloudinaryMetrics] = useState<CloudinaryMetricsSummary | null>(() => getLocalCachedCloudinaryMetrics());

  useEffect(() => {
    if (isOpen) {
      const cfg = getCloudinaryConfig();
      setCloudinaryConfig(cfg);
      setCloudNameInput(cfg.cloudName || '');
      setUploadPresetInput(cfg.uploadPreset || '');
      setCloudinaryTestResult(null);
      setCloudinarySaveSuccess(false);

      fetchRemoteSystemIntegrations().then((remotePayload) => {
        if (remotePayload?.cloudinaryConfig?.cloudName) {
          setCloudinaryConfig(remotePayload.cloudinaryConfig);
          setCloudNameInput(remotePayload.cloudinaryConfig.cloudName || '');
          setUploadPresetInput(remotePayload.cloudinaryConfig.uploadPreset || '');
        }
      }).catch(() => {});

      calculateCloudinaryMetricsFromDatabase().then((m) => {
        setCloudinaryMetrics(m);
      }).catch(() => {});
    }
  }, [isOpen]);

  const handleTestCloudinary = async () => {
    if (!cloudNameInput.trim() || !uploadPresetInput.trim()) {
      setCloudinaryTestResult({
        success: false,
        message: 'Preencha o Cloud Name e o Upload Preset antes de testar.'
      });
      return;
    }

    setIsTestingCloudinary(true);
    setCloudinaryTestResult(null);
    try {
      const result = await testCloudinaryConnection(cloudNameInput, uploadPresetInput);
      setCloudinaryTestResult(result);
      if (result.success) {
        const saved = saveCloudinaryConfig({
          cloudName: cloudNameInput,
          uploadPreset: uploadPresetInput,
          enabled: true
        });
        setCloudinaryConfig(saved);
        setCloudinarySaveSuccess(true);

        await persistSystemIntegrationsToCloud({
          cloudinaryConfig: saved,
          userEmail
        });
      }
    } catch (err: any) {
      setCloudinaryTestResult({
        success: false,
        message: err.message || 'Erro ao testar conexão com o Cloudinary.'
      });
    } finally {
      setIsTestingCloudinary(false);
    }
  };

  const handleSaveCloudinary = async (e: React.FormEvent) => {
    e.preventDefault();
    const saved = saveCloudinaryConfig({
      cloudName: cloudNameInput,
      uploadPreset: uploadPresetInput,
      enabled: true
    });
    setCloudinaryConfig(saved);
    setCloudinarySaveSuccess(true);
    setTimeout(() => setCloudinarySaveSuccess(false), 3500);

    await persistSystemIntegrationsToCloud({
      cloudinaryConfig: saved,
      userEmail
    });
  };

  const isConfigured = Boolean(cloudinaryConfig.cloudName && cloudinaryConfig.uploadPreset);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
      id="settings-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        id="settings-modal"
      >
        {/* Header Compacto */}
        <div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight leading-none">
                Configurações
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Preferências e conexões do sistema
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            id="btn-close-settings-modal"
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Compact Navigation Tabs Bar */}
        <div className="flex items-center border-b border-slate-800 bg-slate-950/60 px-3 pt-2 gap-1 overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg transition-all cursor-pointer border-b-2 whitespace-nowrap ${
              activeTab === 'general'
                ? 'text-sky-400 border-sky-400 bg-slate-900'
                : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/40'
            }`}
            id="tab-btn-general"
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Geral & Tema</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('cloudinary')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg transition-all cursor-pointer border-b-2 whitespace-nowrap ${
              activeTab === 'cloudinary'
                ? 'text-sky-400 border-sky-400 bg-slate-900'
                : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/40'
            }`}
            id="tab-btn-cloudinary"
          >
            <Cloud className="w-3.5 h-3.5" />
            <span>Cloudinary</span>
            <span className={`w-1.5 h-1.5 rounded-full ${isConfigured ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('database')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg transition-all cursor-pointer border-b-2 whitespace-nowrap ${
              activeTab === 'database'
                ? 'text-sky-400 border-sky-400 bg-slate-900'
                : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/40'
            }`}
            id="tab-btn-database"
          >
            <Database className="w-3.5 h-3.5" />
            <span>Banco & Backup</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('session')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg transition-all cursor-pointer border-b-2 whitespace-nowrap ${
              activeTab === 'session'
                ? 'text-sky-400 border-sky-400 bg-slate-900'
                : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/40'
            }`}
            id="tab-btn-session"
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Sessão</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 space-y-4 max-h-[62vh] overflow-y-auto">
          
          {/* TAB 1: GERAL & TEMA */}
          {activeTab === 'general' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Theme Picker Compact */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-sky-400" />
                  Tema da Interface
                </label>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => onSelectTheme?.('dark')}
                    className={`p-3 rounded-xl border flex items-center gap-2.5 transition-all cursor-pointer text-left ${
                      themeMode === 'dark'
                        ? 'bg-sky-500/15 border-sky-500 text-white shadow-sm ring-1 ring-sky-500/40'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                    id="btn-theme-dark"
                  >
                    <Moon className={`w-4 h-4 ${themeMode === 'dark' ? 'text-sky-400' : 'text-slate-500'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold flex items-center justify-between">
                        <span>Modo Escuro</span>
                        {themeMode === 'dark' && <Check className="w-3.5 h-3.5 text-sky-400" />}
                      </div>
                      <span className="text-[10px] text-slate-400">Padrão escuro</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => onSelectTheme?.('light')}
                    className={`p-3 rounded-xl border flex items-center gap-2.5 transition-all cursor-pointer text-left ${
                      themeMode === 'light'
                        ? 'bg-amber-500/15 border-amber-500 text-white shadow-sm ring-1 ring-amber-500/40'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                    id="btn-theme-light"
                  >
                    <Sun className={`w-4 h-4 ${themeMode === 'light' ? 'text-amber-400' : 'text-slate-500'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold flex items-center justify-between">
                        <span>Modo Claro</span>
                        {themeMode === 'light' && <Check className="w-3.5 h-3.5 text-amber-400" />}
                      </div>
                      <span className="text-[10px] text-slate-400">Alto contraste</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Spreadsheet Import Toggle Compact */}
              <div className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className={`p-2 rounded-lg border ${
                    enableSpreadsheetImport 
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' 
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}>
                    <FileSpreadsheet className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>Importação de Planilhas (Excel)</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                        enableSpreadsheetImport 
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' 
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}>
                        {enableSpreadsheetImport ? 'Ativo' : 'Oculto'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Exibe botões de importação .xlsx nas abas
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={enableSpreadsheetImport}
                  onClick={() => onToggleSpreadsheetImport(!enableSpreadsheetImport)}
                  className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    enableSpreadsheetImport ? 'bg-emerald-500' : 'bg-slate-700'
                  }`}
                  id="toggle-spreadsheet-import"
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                      enableSpreadsheetImport ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Spreadsheet Export Toggle Compact */}
              <div className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className={`p-2 rounded-lg border ${
                    enableSpreadsheetExport 
                      ? 'bg-sky-500/15 border-sky-500/30 text-sky-400' 
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}>
                    <Download className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>Exportação de Planilhas (Excel)</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                        enableSpreadsheetExport 
                          ? 'bg-sky-500/15 text-sky-400 border-sky-500/30' 
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}>
                        {enableSpreadsheetExport ? 'Ativo' : 'Oculto'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Exibe botões de exportação .xlsx nas abas
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={enableSpreadsheetExport}
                  onClick={() => onToggleSpreadsheetExport(!enableSpreadsheetExport)}
                  className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    enableSpreadsheetExport ? 'bg-sky-500' : 'bg-slate-700'
                  }`}
                  id="toggle-spreadsheet-export"
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                      enableSpreadsheetExport ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: CLOUDINARY CDN */}
          {activeTab === 'cloudinary' && (
            <div className="space-y-3.5 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-sky-400" />
                  <span className="text-xs font-bold text-slate-200">CDN & Armazenamento de Fotos</span>
                </div>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                  isConfigured 
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' 
                    : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                }`}>
                  {isConfigured ? 'Conectado' : 'Pendente'}
                </span>
              </div>

              <form onSubmit={handleSaveCloudinary} className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Cloud Name
                    </label>
                    <input
                      type="text"
                      value={cloudNameInput}
                      onChange={(e) => setCloudNameInput(e.target.value)}
                      placeholder="ex: dxyz12345"
                      className="w-full bg-slate-900 border border-slate-700 focus:border-sky-400 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white placeholder-slate-600 outline-none"
                      id="input-cloudinary-cloud-name"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Upload Preset (Unsigned)
                    </label>
                    <input
                      type="text"
                      value={uploadPresetInput}
                      onChange={(e) => setUploadPresetInput(e.target.value)}
                      placeholder="ex: stocck_imagens"
                      className="w-full bg-slate-900 border border-slate-700 focus:border-sky-400 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white placeholder-slate-600 outline-none"
                      id="input-cloudinary-upload-preset"
                    />
                  </div>
                </div>

                {/* Optional Instructions accordion */}
                <div>
                  <button
                    type="button"
                    onClick={() => setShowCloudinaryGuide(!showCloudinaryGuide)}
                    className="text-[11px] text-sky-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>Como obter essas chaves no Cloudinary?</span>
                    {showCloudinaryGuide ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  {showCloudinaryGuide && (
                    <div className="mt-2 p-2.5 bg-slate-900 rounded-lg border border-slate-800 text-[11px] text-slate-300 space-y-1 animate-in fade-in">
                      <p>1. Crie uma conta gratuita em <a href="https://cloudinary.com" target="_blank" rel="noreferrer" className="text-sky-400 underline">cloudinary.com</a>.</p>
                      <p>2. Copie seu <strong>Cloud Name</strong> no painel principal.</p>
                      <p>3. Em <strong>Settings &gt; Upload presets</strong>, adicione um preset com modo <strong>Unsigned</strong>.</p>
                    </div>
                  )}
                </div>

                {/* Metrics */}
                {cloudinaryMetrics && cloudinaryMetrics.totalCloudinaryImages > 0 && (
                  <div className="p-2 bg-sky-950/30 border border-sky-900/50 rounded-lg flex items-center justify-between text-[11px]">
                    <span className="text-sky-300 font-medium">
                      {cloudinaryMetrics.totalCloudinaryImages} fotos no CDN
                    </span>
                    <span className="text-slate-400">
                      Economia: {cloudinaryMetrics.estimatedStorageSavedFormatted}
                    </span>
                  </div>
                )}

                {/* Test Result Feedback */}
                {cloudinaryTestResult && (
                  <div className={`p-2 rounded-lg text-xs flex items-center gap-1.5 border ${
                    cloudinaryTestResult.success 
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}>
                    {cloudinaryTestResult.success ? <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                    <span className="truncate">{cloudinaryTestResult.message}</span>
                  </div>
                )}

                {cloudinarySaveSuccess && (
                  <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-300 flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Salvo e sincronizado com a nuvem!</span>
                  </div>
                )}

                {/* Buttons */}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleTestCloudinary}
                    disabled={isTestingCloudinary || !cloudNameInput.trim() || !uploadPresetInput.trim()}
                    className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-slate-300 text-xs font-semibold rounded-lg border border-slate-700 transition-colors cursor-pointer flex items-center gap-1"
                    id="btn-test-cloudinary"
                  >
                    {isTestingCloudinary ? <RefreshCw className="w-3 h-3 animate-spin text-sky-400" /> : <Sparkles className="w-3 h-3 text-sky-400" />}
                    <span>Testar</span>
                  </button>

                  <button
                    type="submit"
                    disabled={!cloudNameInput.trim() || !uploadPresetInput.trim()}
                    className="px-3.5 py-1.5 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                    id="btn-save-cloudinary"
                  >
                    <Check className="w-3 h-3" />
                    <span>Salvar</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 3: BANCO & BACKUP */}
          {activeTab === 'database' && (
            <div className="space-y-3 animate-in fade-in duration-150">
              {/* Supabase Status Card */}
              <div className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                    <Database className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>Supabase (PostgreSQL)</span>
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Ativo
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">Métricas de dados, latência e registros</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenDbSwitcherModal?.();
                  }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap"
                  id="btn-settings-open-db-switcher"
                >
                  Ver Métricas
                </button>
              </div>

              {/* Backup & Contingency Card */}
              <div className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-400">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>Central de Backup & Snapshots</span>
                    </div>
                    <p className="text-[11px] text-slate-400">Pontos de restauração e exportação offline</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenBackupModal?.('export');
                    }}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white border border-slate-700 rounded-lg text-xs font-bold transition-all cursor-pointer"
                    id="btn-settings-open-export-backup"
                  >
                    <HardDriveDownload className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Novo Backup</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenBackupModal?.('restore');
                    }}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700 rounded-lg text-xs font-bold transition-all cursor-pointer"
                    id="btn-settings-open-restore-backup"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-sky-400" />
                    <span>Restaurar</span>
                  </button>
                </div>
              </div>

              {/* PRD Document & System Specs Card */}
              <div className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-teal-500/15 border border-teal-500/30 text-teal-400">
                    <Download className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>Especificação do Sistema (PRD)</span>
                    </div>
                    <p className="text-[11px] text-slate-400">Diretrizes arquitetônicas e fluxo de RMA (.md)</p>
                  </div>
                </div>

                <a
                  href="./PRD_RMA_FLOW.md"
                  download="PRD_RMA_FLOW.md"
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap"
                  title="Baixar PRD para testes e QA"
                  id="btn-settings-download-prd"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar PRD</span>
                </a>
              </div>
            </div>
          )}

          {/* TAB 4: SESSÃO & CONTA */}
          {activeTab === 'session' && (
            <div className="space-y-3 animate-in fade-in duration-150">
              <div className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800 space-y-2.5 text-xs text-slate-300">
                <div className="flex justify-between items-center py-1 border-b border-slate-800">
                  <span className="text-slate-400">Email:</span>
                  <span className="font-mono font-bold text-white truncate max-w-[200px]">{userEmail || 'Não identificado'}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-800">
                  <span className="text-slate-400">Função:</span>
                  <span className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                    userRole === 'admin' 
                      ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30' 
                      : 'bg-slate-800 text-slate-300'
                  }`}>
                    {userRole === 'admin' ? 'Administrador' : 'Operador'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-400">Status:</span>
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" />
                    Sessão Ativa
                  </span>
                </div>
              </div>

              {/* Botão Sair / Logout */}
              {onLogout && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onLogout();
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/30 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
                  id="btn-settings-logout"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Encerrar Sessão e Sair</span>
                </button>
              )}
            </div>
          )}

        </div>

        {/* Footer Compacto */}
        <div className="px-5 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 flex items-center gap-1">
            <Check className="w-3 h-3 text-emerald-400" />
            Configurações sincronizadas
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-sky-500 hover:bg-sky-400 text-white font-bold rounded-lg text-xs transition-all shadow-sm cursor-pointer"
            id="btn-done-settings"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
}
