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
  Package, 
  Boxes, 
  ShieldCheck, 
  Info,
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
  Image as ImageIcon
} from 'lucide-react';
import { ThemeMode } from '../lib/theme';
import { 
  getCloudinaryConfig, 
  saveCloudinaryConfig, 
  isCloudinaryActive, 
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
  themeMode?: ThemeMode;
  onSelectTheme?: (theme: ThemeMode) => void;
  onOpenBackupModal?: (tab?: 'export' | 'restore') => void;
  onOpenDbSwitcherModal?: () => void;
  userRole?: 'admin' | 'operator' | null;
  userEmail?: string;
}

export default function SettingsModal({
  isOpen,
  onClose,
  enableSpreadsheetImport,
  onToggleSpreadsheetImport,
  themeMode = 'dark',
  onSelectTheme,
  onOpenBackupModal,
  onOpenDbSwitcherModal,
  userRole,
  userEmail
}: SettingsModalProps) {
  // Cloudinary State
  const [cloudinaryConfig, setCloudinaryConfig] = useState<CloudinaryConfig>(() => getCloudinaryConfig());
  const [cloudNameInput, setCloudNameInput] = useState<string>(() => getCloudinaryConfig().cloudName);
  const [uploadPresetInput, setUploadPresetInput] = useState<string>(() => getCloudinaryConfig().uploadPreset);
  const [isCloudinaryDrawerOpen, setIsCloudinaryDrawerOpen] = useState<boolean>(false);
  const [isTestingCloudinary, setIsTestingCloudinary] = useState<boolean>(false);
  const [cloudinaryTestResult, setCloudinaryTestResult] = useState<{ success: boolean; message: string; testUrl?: string } | null>(null);
  const [cloudinarySaveSuccess, setCloudinarySaveSuccess] = useState<boolean>(false);

  const [cloudinaryMetrics, setCloudinaryMetrics] = useState<CloudinaryMetricsSummary | null>(() => getLocalCachedCloudinaryMetrics());

  useEffect(() => {
    if (isOpen) {
      const cfg = getCloudinaryConfig();
      setCloudinaryConfig(cfg);
      setCloudinaryInputSync(cfg);
      setCloudinaryTestResult(null);
      setCloudinarySaveSuccess(false);

      // Check remote cloud configuration if local is empty
      fetchRemoteSystemIntegrations().then((remotePayload) => {
        if (remotePayload?.cloudinaryConfig?.cloudName) {
          setCloudinaryConfig(remotePayload.cloudinaryConfig);
          setCloudinaryInputSync(remotePayload.cloudinaryConfig);
        }
      }).catch(() => {});

      // Calculate fresh Cloudinary metrics
      calculateCloudinaryMetricsFromDatabase().then((m) => {
        setCloudinaryMetrics(m);
      }).catch(() => {});
    }
  }, [isOpen]);

  const setCloudinaryInputSync = (cfg: CloudinaryConfig) => {
    setCloudNameInput(cfg.cloudName || '');
    setUploadPresetInput(cfg.uploadPreset || '');
  };

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
        // Auto-save on successful test and persist to cloud database for all devices
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
        message: err.message || 'Erro inesperado ao testar conexão com o Cloudinary.'
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
    setTimeout(() => setCloudinarySaveSuccess(false), 4000);

    // Persist to central cloud database so all devices/browsers inherit the config
    await persistSystemIntegrationsToCloud({
      cloudinaryConfig: saved,
      userEmail
    });
  };

  const isConfigured = Boolean(cloudinaryConfig.cloudName && cloudinaryConfig.uploadPreset);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-150"
      id="settings-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-6 animate-in zoom-in-95 duration-200"
        id="settings-modal"
      >
        {/* Header */}
        <div className="px-6 py-5 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Settings className="w-5 h-5 animate-[spin_8s_linear_infinite]" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white tracking-tight flex items-center gap-2">
                Configurações do Sistema
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Preferências de interface, temas e módulos operacionais
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            id="btn-close-settings-modal"
            title="Fechar configurações"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          
          {/* Section: Theme & Appearance (Modo Claro / Escuro) */}
          <div className="space-y-3" id="section-theme-settings">
            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4 text-sky-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Aparência & Tema da Interface
              </h3>
            </div>

            <div className="p-4 bg-slate-950/70 rounded-xl border border-slate-800/80 space-y-3">
              <p className="text-xs text-slate-400 leading-relaxed">
                Alterne entre o tema escuro corporativo e o tema claro de alto contraste preservando a mesma estrutura e disposição gráfica.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Dark Mode Option Card */}
                <button
                  type="button"
                  onClick={() => onSelectTheme?.('dark')}
                  className={`p-3.5 rounded-xl border text-left flex items-start gap-3 transition-all cursor-pointer ${
                    themeMode === 'dark'
                      ? 'bg-sky-500/10 border-sky-500/60 ring-2 ring-sky-500/30'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                  }`}
                  id="btn-theme-dark"
                >
                  <div className={`p-2 rounded-lg mt-0.5 border ${
                    themeMode === 'dark'
                      ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}>
                    <Moon className="w-4 h-4" />
                  </div>
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">Modo Escuro</span>
                      {themeMode === 'dark' && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-sky-400 bg-sky-500/15 px-1.5 py-0.5 rounded-md">
                          <Check className="w-3 h-3" /> Ativo
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-normal">
                      Fundo escuro profundo para operações prolongadas e menor fadiga visual.
                    </p>
                  </div>
                </button>

                {/* Light Mode Option Card */}
                <button
                  type="button"
                  onClick={() => onSelectTheme?.('light')}
                  className={`p-3.5 rounded-xl border text-left flex items-start gap-3 transition-all cursor-pointer ${
                    themeMode === 'light'
                      ? 'bg-amber-500/10 border-amber-500/60 ring-2 ring-amber-500/30'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                  }`}
                  id="btn-theme-light"
                >
                  <div className={`p-2 rounded-lg mt-0.5 border ${
                    themeMode === 'light'
                      ? 'bg-amber-500/20 border-amber-500/40 text-amber-500'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}>
                    <Sun className="w-4 h-4" />
                  </div>
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">Modo Claro</span>
                      {themeMode === 'light' && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-amber-500 bg-amber-500/15 px-1.5 py-0.5 rounded-md">
                          <Check className="w-3 h-3" /> Ativo
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-normal">
                      Fundo claro suave com tipografia de alto contraste para ambientes iluminados.
                    </p>
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* Section: Feature Toggles */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-sky-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Módulos de Importação e Dados
              </h3>
            </div>

            {/* Toggle Card: Importação de Planilhas */}
            <div className="p-4 bg-slate-950/70 rounded-xl border border-slate-800/80 space-y-3.5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className={`p-2.5 rounded-xl border mt-0.5 transition-colors ${
                    enableSpreadsheetImport 
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                      : 'bg-slate-850 border-slate-750 text-slate-400'
                  }`}>
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white">
                        Habilitar Importação de Planilhas (Excel / XLSX)
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        enableSpreadsheetImport 
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' 
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}>
                        {enableSpreadsheetImport ? 'Habilitado' : 'Desabilitado'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Controla a visibilidade dos botões e janelas de importação de arquivos Excel (.xlsx) nas abas que possuem essa funcionalidade.
                    </p>
                  </div>
                </div>

                {/* Switch Toggle */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={enableSpreadsheetImport}
                  onClick={() => onToggleSpreadsheetImport(!enableSpreadsheetImport)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${
                    enableSpreadsheetImport ? 'bg-emerald-500' : 'bg-slate-700'
                  }`}
                  id="toggle-spreadsheet-import"
                >
                  <span className="sr-only">Habilitar importação de planilhas</span>
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      enableSpreadsheetImport ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Impacted Tabs indicator */}
              <div className="pt-2 border-t border-slate-850 space-y-2">
                <span className="text-[11px] font-semibold text-slate-400 block">
                  {enableSpreadsheetImport 
                    ? 'Abas com importação ativa no momento:' 
                    : 'A importação está oculta nas seguintes abas:'}
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div className={`p-2 rounded-lg border flex items-center gap-2 ${
                    enableSpreadsheetImport 
                      ? 'bg-slate-900/90 border-slate-800 text-slate-200' 
                      : 'bg-slate-900/40 border-slate-850 text-slate-500 line-through opacity-70'
                  }`}>
                    <Database className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span className="truncate">Catálogo Base</span>
                  </div>
                  
                  <div className={`p-2 rounded-lg border flex items-center gap-2 ${
                    enableSpreadsheetImport 
                      ? 'bg-slate-900/90 border-slate-800 text-slate-200' 
                      : 'bg-slate-900/40 border-slate-850 text-slate-500 line-through opacity-70'
                  }`}>
                    <Package className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span className="truncate">Estoque Físico</span>
                  </div>

                  <div className={`p-2 rounded-lg border flex items-center gap-2 ${
                    enableSpreadsheetImport 
                      ? 'bg-slate-900/90 border-slate-800 text-slate-200' 
                      : 'bg-slate-900/40 border-slate-850 text-slate-500 line-through opacity-70'
                  }`}>
                    <Boxes className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span className="truncate">Fluxo Entradas</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section: Cloudinary Image Storage & CDN */}
          <div className="space-y-3" id="section-cloudinary-settings">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cloud className="w-4 h-4 text-sky-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Armazenamento de Imagens Cloudinary (CDN & Storage)
                </h3>
              </div>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                isConfigured 
                  ? 'bg-sky-500/15 text-sky-300 border-sky-500/30' 
                  : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
              }`}>
                {isConfigured ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                    Cloudinary Ativo
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-3 h-3 text-amber-400" />
                    Pendente de Configuração
                  </>
                )}
              </span>
            </div>

            <div className="p-4 bg-slate-950/70 rounded-xl border border-sky-500/20 space-y-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400 mt-0.5 shrink-0">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <span className="text-sm font-bold text-white flex items-center gap-1.5">
                      Upload Direto de Fotos com CDN Global
                    </span>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      As imagens de produtos e triagens são enviadas diretamente ao Cloudinary. O Supabase armazena apenas as URLs HTTPS, economizando 100% do tráfego e armazenamento do banco.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsCloudinaryDrawerOpen(!isCloudinaryDrawerOpen)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                    isConfigured
                      ? 'bg-slate-900 hover:bg-slate-800 text-sky-300 border-sky-500/40'
                      : 'bg-sky-500 hover:bg-sky-400 text-white font-bold border-sky-400 shadow-md shadow-sky-500/20'
                  }`}
                  id="btn-toggle-cloudinary-config"
                >
                  <Cloud className="w-3.5 h-3.5" />
                  <span>{isConfigured ? 'Editar Parâmetros' : 'Configurar Agora'}</span>
                  {isCloudinaryDrawerOpen ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
                </button>
              </div>

              {/* Cloudinary Configuration Drawer */}
              {isCloudinaryDrawerOpen && (
                <form onSubmit={handleSaveCloudinary} className="mt-3 pt-3 border-t border-slate-800/80 space-y-3.5 animate-in fade-in duration-150">
                  
                  {/* Step-by-Step Instructions Box */}
                  <div className="p-3 bg-slate-900/90 rounded-lg border border-slate-800 text-xs space-y-2 text-slate-300">
                    <div className="font-bold text-white flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                      Como Configurar o Cloudinary (Passo a Passo):
                    </div>
                    <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-400 leading-relaxed">
                      <li>Crie sua conta gratuita em <a href="https://cloudinary.com" target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">cloudinary.com</a>.</li>
                      <li>No Dashboard inicial, copie seu <strong className="text-slate-200 font-mono">Cloud Name</strong>.</li>
                      <li>Acesse <strong className="text-slate-200">Settings &gt; Upload &gt; Upload presets</strong> e clique em <strong className="text-slate-200">Add upload preset</strong>.</li>
                      <li>Mude a opção <strong className="text-amber-300 font-semibold">Signing Mode para Unsigned</strong> (obrigatório para uploads pelo frontend).</li>
                      <li>Defina o nome do preset (ex: <span className="text-sky-300 font-mono">stocck_imagens</span>) e salve as alterações no Cloudinary.</li>
                    </ol>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                        Cloud Name (Nome da Nuvem)
                      </label>
                      <input
                        type="text"
                        value={cloudNameInput}
                        onChange={(e) => setCloudNameInput(e.target.value)}
                        placeholder="ex: dxyz12345"
                        className="w-full bg-slate-900 border border-slate-700 focus:border-sky-400 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-slate-600 outline-none"
                        id="input-cloudinary-cloud-name"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                        Upload Preset Name (Modo Unsigned)
                      </label>
                      <input
                        type="text"
                        value={uploadPresetInput}
                        onChange={(e) => setUploadPresetInput(e.target.value)}
                        placeholder="ex: stocck_imagens"
                        className="w-full bg-slate-900 border border-slate-700 focus:border-sky-400 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-slate-600 outline-none"
                        id="input-cloudinary-upload-preset"
                      />
                    </div>
                  </div>

                  {/* Live Metrics of Cloudinary usage */}
                  {cloudinaryMetrics && cloudinaryMetrics.totalCloudinaryImages > 0 && (
                    <div className="p-3 bg-sky-950/40 border border-sky-900/60 rounded-lg flex items-center justify-between text-xs">
                      <div>
                        <span className="text-sky-300 font-bold block">
                          {cloudinaryMetrics.totalCloudinaryImages} imagens ativas no CDN
                        </span>
                        <span className="text-[11px] text-slate-400">
                          Economia: {cloudinaryMetrics.estimatedStorageSavedFormatted} de Storage no Supabase
                        </span>
                      </div>
                      <span className="px-2 py-0.5 bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded text-[10px] font-semibold">
                        Sincronizado na Nuvem
                      </span>
                    </div>
                  )}

                  {/* Feedback Results */}
                  {cloudinaryTestResult && (
                    <div className={`p-2.5 rounded-lg text-xs flex items-start gap-2 border ${
                      cloudinaryTestResult.success 
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                    }`}>
                      {cloudinaryTestResult.success ? (
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      )}
                      <div className="space-y-0.5 flex-1">
                        <span className="font-semibold">{cloudinaryTestResult.message}</span>
                        {cloudinaryTestResult.testUrl && (
                          <div className="text-[10px] text-slate-400 truncate max-w-full font-mono">
                            URL de teste: {cloudinaryTestResult.testUrl}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {cloudinarySaveSuccess && (
                    <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-300 flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Configurações salvas e sincronizadas na nuvem para todos os dispositivos e navegadores!</span>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-1">
                    <a
                      href="https://cloudinary.com/console/settings/upload"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-sky-400 hover:underline flex items-center gap-1"
                    >
                      <span>Abrir Configurações de Upload no Cloudinary</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>

                    <div className="flex items-center gap-2 self-end">
                      <button
                        type="button"
                        onClick={handleTestCloudinary}
                        disabled={isTestingCloudinary || !cloudNameInput.trim() || !uploadPresetInput.trim()}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-colors cursor-pointer flex items-center gap-1.5"
                        id="btn-test-cloudinary"
                      >
                        {isTestingCloudinary ? <RefreshCw className="w-3 h-3 animate-spin text-sky-400" /> : <Sparkles className="w-3 h-3 text-sky-400" />}
                        <span>Testar Conexão</span>
                      </button>

                      <button
                        type="submit"
                        disabled={!cloudNameInput.trim() || !uploadPresetInput.trim()}
                        className="px-4 py-1.5 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                        id="btn-save-cloudinary"
                      >
                        <Check className="w-3 h-3" />
                        <span>Salvar Parâmetros</span>
                      </button>
                    </div>
                  </div>

                </form>
              )}

            </div>
          </div>

          {/* Section: Supabase PostgreSQL Database Status */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Banco de Dados Supabase (PostgreSQL)
              </h3>
            </div>

            <div className="p-4 bg-slate-950/70 rounded-xl border border-emerald-500/20 space-y-3.5">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 mt-0.5">
                  <Database className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">
                      Status do Banco de Dados & Uso em Tempo Real
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      Supabase Ativo
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Monitore o volume de dados por tabela, contagem total de registros em tempo real, latência de conexão e integridade dos serviços do Supabase.
                  </p>
                </div>
              </div>

              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenDbSwitcherModal?.();
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
                  id="btn-settings-open-db-switcher"
                >
                  <Database className="w-4 h-4" />
                  <span>Ver Métricas de Uso do Supabase</span>
                </button>
              </div>
            </div>
          </div>

          {/* Section: Local Backup & Restore */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Central de Contingência & Backup (Plano B)
              </h3>
            </div>

            <div className="p-4 bg-slate-950/70 rounded-xl border border-emerald-500/20 space-y-3.5">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 mt-0.5">
                  <HardDriveDownload className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">
                      Snapshots em Nuvem & Backups Automáticos
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      Blindagem Imutável
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Pontos de restauração online protegidos contra exclusão, agendamentos automáticos (por hora, fim do expediente, semanal e mensal) e download de cópias offline em JSON.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenBackupModal?.('export');
                  }}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
                  id="btn-settings-open-export-backup"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Abrir Central de Backup</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenBackupModal?.('restore');
                  }}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white border border-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  id="btn-settings-open-restore-backup"
                >
                  <RotateCcw className="w-4 h-4 text-emerald-400" />
                  <span>Restaurar Sistema</span>
                </button>
              </div>
            </div>
          </div>

          {/* Section: Environment & Account Info */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-sky-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Informações da Sessão
              </h3>
            </div>

            <div className="p-4 bg-slate-950/70 rounded-xl border border-slate-800/80 space-y-2.5 text-xs text-slate-300">
              <div className="flex justify-between items-center py-1 border-b border-slate-850">
                <span className="text-slate-400">Usuário Conectado:</span>
                <span className="font-mono font-bold text-white truncate max-w-[240px]">{userEmail || 'Não identificado'}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-850">
                <span className="text-slate-400">Nível de Permissão:</span>
                <span className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                  userRole === 'admin' 
                    ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30' 
                    : 'bg-slate-800 text-slate-300'
                }`}>
                  {userRole === 'admin' ? 'Administrador Geral' : 'Operador de Triagem'}
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-400">Persistência das Configurações:</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  Salvas no Navegador
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-500 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" />
            As alterações são aplicadas instantaneamente.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-sky-500 hover:bg-sky-400 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-sky-500/15 cursor-pointer"
            id="btn-done-settings"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
}
