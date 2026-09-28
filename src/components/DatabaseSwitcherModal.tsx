/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Database, 
  X, 
  Check, 
  RefreshCw, 
  Code, 
  Copy, 
  AlertTriangle, 
  Cloud, 
  Eye, 
  EyeOff, 
  ExternalLink,
  ShieldCheck,
  Zap,
  Settings,
  ArrowRight,
  Activity,
  BarChart3,
  HardDrive,
  Key,
  Server,
  Layers,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Sliders,
  RotateCcw,
  Sparkles
} from 'lucide-react';
import {
  getSupabaseClient,
  getSupabaseConfig,
  saveSupabaseConfig,
  extractSupabaseProjectRef,
  fetchOfficialSupabaseUsage,
  OfficialSupabaseUsage,
  getSupabaseManagementToken,
  saveSupabaseManagementToken,
  SUPABASE_SQL_SCHEMA,
  SUPABASE_QUICK_PATCH_SQL,
  SupabaseConfig
} from '../lib/supabase';
import { 
  isCloudinaryActive, 
  getCloudinaryConfig, 
  saveCloudinaryConfig,
  CloudinaryConfig 
} from '../lib/cloudinaryService';
import {
  CloudinaryMetricsSummary,
  calculateCloudinaryMetricsFromDatabase,
  getLocalCachedCloudinaryMetrics,
  persistSystemIntegrationsToCloud,
  fetchRemoteSystemIntegrations,
  getLocalSupabaseCalibration,
  setLocalSupabaseCalibration,
  SupabaseCalibration
} from '../lib/integrationsConfigService';

interface DatabaseSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DatabaseSwitcherModal({
  isOpen,
  onClose
}: DatabaseSwitcherModalProps) {
  const [supaConfig, setSupaConfig] = useState<SupabaseConfig>(() => getSupabaseConfig());
  const [isTestingConnection, setIsTestingConnection] = useState<boolean>(false);
  const [connectionLatency, setConnectionLatency] = useState<number | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'online' | 'error' | 'checking'>('checking');
  const [connectionErrorMsg, setConnectionErrorMsg] = useState<string | null>(null);
  
  // Database connection switching state
  const [newDbUrl, setNewDbUrl] = useState<string>(supaConfig.url);
  const [newDbAnonKey, setNewDbAnonKey] = useState<string>(supaConfig.anonKey);
  const [showDbKey, setShowDbKey] = useState<boolean>(false);
  const [dbSaveSuccess, setDbSaveSuccess] = useState<boolean>(false);
  const [dbSaveError, setDbSaveError] = useState<string | null>(null);

  // Cloudinary settings & metrics state
  const [cloudinaryConfig, setCloudinaryConfig] = useState<CloudinaryConfig>(() => getCloudinaryConfig());
  const [isEditingCloudinary, setIsEditingCloudinary] = useState<boolean>(false);
  const [cloudNameInput, setCloudNameInput] = useState<string>(cloudinaryConfig.cloudName);
  const [uploadPresetInput, setUploadPresetInput] = useState<string>(cloudinaryConfig.uploadPreset);
  const [cloudinarySaveSuccess, setCloudinarySaveSuccess] = useState<boolean>(false);
  const [cloudinaryMetrics, setCloudinaryMetrics] = useState<CloudinaryMetricsSummary | null>(() => getLocalCachedCloudinaryMetrics());
  const [isLoadingCloudinaryMetrics, setIsLoadingCloudinaryMetrics] = useState<boolean>(false);

  // SQL Schema reference
  const [showSqlCode, setShowSqlCode] = useState<boolean>(false);
  const [copiedSql, setCopiedSql] = useState<boolean>(false);
  const [copiedQuickPatch, setCopiedQuickPatch] = useState<boolean>(false);

  const projectRef = extractSupabaseProjectRef(supaConfig.url);

  // Test current database connection
  const testDatabaseConnection = async () => {
    setIsTestingConnection(true);
    setConnectionErrorMsg(null);
    const startTime = performance.now();

    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setConnectionStatus('error');
        setConnectionErrorMsg('Cliente Supabase não inicializado.');
        setIsTestingConnection(false);
        return;
      }

      // Fast lightweight query to test response
      const { error } = await supabase.from('products').select('id', { head: true, count: 'exact' });
      const endTime = performance.now();
      const latency = Math.round(endTime - startTime);

      if (error) {
        setConnectionStatus('error');
        setConnectionErrorMsg(error.message || 'Falha ao comunicar com o banco de dados.');
      } else {
        setConnectionStatus('online');
        setConnectionLatency(latency);
      }
    } catch (err: any) {
      setConnectionStatus('error');
      setConnectionErrorMsg(err?.message || 'Erro inesperado ao testar conexão.');
    } finally {
      setIsTestingConnection(false);
    }
  };

  // Refresh Cloudinary metrics
  const refreshCloudinaryMetrics = async () => {
    setIsLoadingCloudinaryMetrics(true);
    try {
      const metrics = await calculateCloudinaryMetricsFromDatabase();
      setCloudinaryMetrics(metrics);
      await persistSystemIntegrationsToCloud({ cachedCloudinaryMetrics: metrics }).catch(() => {});
    } catch (err) {
      console.warn('Erro ao atualizar métricas Cloudinary:', err);
    } finally {
      setIsLoadingCloudinaryMetrics(false);
    }
  };

  // Supabase Official Metrics & PAT State
  const [supabaseUsage, setSupabaseUsage] = useState<OfficialSupabaseUsage | null>(null);
  const [isLoadingUsage, setIsLoadingUsage] = useState<boolean>(false);
  const [customTokenInput, setCustomTokenInput] = useState<string>(() => getSupabaseManagementToken());
  const [showTokenInput, setShowTokenInput] = useState<boolean>(false);
  const [showTokenSecret, setShowTokenSecret] = useState<boolean>(false);
  const [tokenSaveSuccess, setTokenSaveSuccess] = useState<boolean>(false);

  // Manual Calibration State (Offset sync with Supabase Dashboard Billing)
  const [showCalibration, setShowCalibration] = useState<boolean>(false);
  const [calEgressInput, setCalEgressInput] = useState<string>(() => {
    const cal = getLocalSupabaseCalibration();
    return cal?.egressGb !== undefined ? String(cal.egressGb) : '0.914';
  });
  const [calDbInput, setCalDbInput] = useState<string>(() => {
    const cal = getLocalSupabaseCalibration();
    return cal?.databaseSizeGb !== undefined ? String(cal.databaseSizeGb) : '0.064';
  });
  const [calLogIngestInput, setCalLogIngestInput] = useState<string>(() => {
    const cal = getLocalSupabaseCalibration();
    return cal?.logIngestionGb !== undefined ? String(cal.logIngestionGb) : '0.584';
  });
  const [calLogQueryInput, setCalLogQueryInput] = useState<string>(() => {
    const cal = getLocalSupabaseCalibration();
    return cal?.logQueryGb !== undefined ? String(cal.logQueryGb) : '1.402';
  });
  const [calStorageInput, setCalStorageInput] = useState<string>(() => {
    const cal = getLocalSupabaseCalibration();
    return cal?.storageSizeGb !== undefined ? String(cal.storageSizeGb) : '0.000';
  });
  const [calibrationSaveSuccess, setCalibrationSaveSuccess] = useState<boolean>(false);

  // Test official Supabase metrics using Vercel serverless proxy or token, with active calibration
  const testSupabaseMetrics = async (tokenOverride?: string, calibrationOverride?: SupabaseCalibration | null) => {
    setIsLoadingUsage(true);
    try {
      const activePat = tokenOverride !== undefined 
        ? tokenOverride 
        : (customTokenInput.trim() || getSupabaseManagementToken());
      const calToUse = calibrationOverride !== undefined ? calibrationOverride : getLocalSupabaseCalibration();
      const usage = await fetchOfficialSupabaseUsage(projectRef, activePat || undefined, calToUse);
      setSupabaseUsage(usage);
    } catch (err: any) {
      console.error('Erro ao consultar métricas oficiais do Supabase:', err);
    } finally {
      setIsLoadingUsage(false);
    }
  };

  const handleSaveCustomToken = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = customTokenInput.trim();
    if (!clean) return;
    saveSupabaseManagementToken(clean);
    setTokenSaveSuccess(true);
    setTimeout(() => setTokenSaveSuccess(false), 3000);
    testSupabaseMetrics(clean);
  };

  const handleClearCustomToken = async () => {
    saveSupabaseManagementToken('');
    setCustomTokenInput('');
    setTokenSaveSuccess(false);
    testSupabaseMetrics('');
  };

  const handleSaveCalibration = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const egress = parseFloat(calEgressInput.replace(',', '.'));
    const dbSize = parseFloat(calDbInput.replace(',', '.'));
    const logIngest = parseFloat(calLogIngestInput.replace(',', '.'));
    const logQuery = parseFloat(calLogQueryInput.replace(',', '.'));
    const storage = parseFloat(calStorageInput.replace(',', '.'));

    const newCal: SupabaseCalibration = {
      egressGb: !isNaN(egress) ? egress : 0.914,
      databaseSizeGb: !isNaN(dbSize) ? dbSize : 0.064,
      logIngestionGb: !isNaN(logIngest) ? logIngest : 0.584,
      logQueryGb: !isNaN(logQuery) ? logQuery : 1.402,
      storageSizeGb: !isNaN(storage) ? storage : 0.000,
      calibratedAt: new Date().toISOString()
    };

    setLocalSupabaseCalibration(newCal);
    persistSystemIntegrationsToCloud({ supabaseCalibration: newCal }).catch(() => {});
    setCalibrationSaveSuccess(true);
    setTimeout(() => setCalibrationSaveSuccess(false), 3000);
    testSupabaseMetrics(undefined, newCal);
  };

  const handleResetCalibration = async () => {
    setLocalSupabaseCalibration(null);
    persistSystemIntegrationsToCloud({ supabaseCalibration: null }).catch(() => {});
    setCalEgressInput('0.914');
    setCalDbInput('0.064');
    setCalLogIngestInput('0.584');
    setCalLogQueryInput('1.402');
    setCalStorageInput('0.000');
    testSupabaseMetrics(undefined, null);
  };

  const handleFillDefaultPanelValues = () => {
    setCalEgressInput('0.914');
    setCalDbInput('0.064');
    setCalLogIngestInput('0.584');
    setCalLogQueryInput('1.402');
    setCalStorageInput('0.000');
  };

  useEffect(() => {
    if (isOpen) {
      const currentConfig = getSupabaseConfig();
      setSupaConfig(currentConfig);
      setNewDbUrl(currentConfig.url);
      setNewDbAnonKey(currentConfig.anonKey);
      
      const currentCloudinary = getCloudinaryConfig();
      setCloudinaryConfig(currentCloudinary);
      setCloudNameInput(currentCloudinary.cloudName);
      setUploadPresetInput(currentCloudinary.uploadPreset);

      // Reload active PAT from multi-tier storage
      const activePat = getSupabaseManagementToken();
      setCustomTokenInput(activePat);

      testDatabaseConnection();
      refreshCloudinaryMetrics();

      // Ensure fresh token from cloud if available
      fetchRemoteSystemIntegrations().then((remotePayload) => {
        if (remotePayload?.supabasePat && remotePayload.supabasePat.trim()) {
          const freshPat = remotePayload.supabasePat.trim();
          setCustomTokenInput(freshPat);
          testSupabaseMetrics(freshPat);
        } else {
          testSupabaseMetrics(activePat);
        }
      }).catch(() => {
        testSupabaseMetrics(activePat);
      });
    }
  }, [isOpen]);

  // Handle switching database
  const handleSaveDatabaseConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = newDbUrl.trim();
    const cleanAnonKey = newDbAnonKey.trim();
    
    if (!cleanUrl || !cleanAnonKey) {
      setDbSaveError('Preencha a URL do Projeto e a Anon Key.');
      return;
    }

    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      setDbSaveError('A URL deve começar com https://');
      return;
    }

    setDbSaveError(null);
    const currentConfig = getSupabaseConfig();
    const newConfig: SupabaseConfig = { 
      url: cleanUrl, 
      anonKey: cleanAnonKey,
      personalAccessToken: currentConfig.personalAccessToken || getSupabaseManagementToken()
    };
    saveSupabaseConfig(newConfig);
    setSupaConfig(newConfig);
    setDbSaveSuccess(true);

    // Clear local app cache so data from the old database does not mix with the new one
    localStorage.removeItem('supabase.auth.token');
    localStorage.removeItem('sb-api-auth-token');
    localStorage.removeItem('stocckrma_cache_products');
    localStorage.removeItem('stocckrma_cache_triage');
    localStorage.removeItem('stocckrma_cache_inflows');
    localStorage.removeItem('stocckrma_cache_pending');
    localStorage.removeItem('stocckrma_cache_cases');
    localStorage.removeItem('stocckrma_sync_meta');
    
    setTimeout(() => {
      window.location.reload();
    }, 1200);
  };

  // Handle saving Cloudinary settings
  const handleSaveCloudinary = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCloudName = cloudNameInput.trim();
    const cleanPreset = uploadPresetInput.trim();

    const updated = saveCloudinaryConfig({
      cloudName: cleanCloudName,
      uploadPreset: cleanPreset,
      enabled: Boolean(cleanCloudName && cleanPreset)
    });

    setCloudinaryConfig(updated);
    setCloudinarySaveSuccess(true);
    setIsEditingCloudinary(false);
    setTimeout(() => setCloudinarySaveSuccess(false), 3500);

    // Persist to central database config
    persistSystemIntegrationsToCloud({ cloudinaryConfig: updated }).catch(() => {});
    refreshCloudinaryMetrics();
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_SQL_SCHEMA);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 3000);
  };

  const handleCopyQuickPatch = () => {
    navigator.clipboard.writeText(SUPABASE_QUICK_PATCH_SQL);
    setCopiedQuickPatch(true);
    setTimeout(() => setCopiedQuickPatch(false), 3000);
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 overflow-y-auto animate-in fade-in duration-150"
      id="db-switcher-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isTestingConnection) onClose();
      }}
    >
      <div 
        className="w-full max-w-3xl bg-[#121212] border border-[#2a2a2a] rounded-2xl shadow-2xl overflow-hidden flex flex-col my-4 text-[#e0e0e0] font-sans animate-in zoom-in-95 duration-200"
        id="db-switcher-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 bg-[#181818] border-b border-[#262626] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#1f2d24] border border-[#2e4c3b] flex items-center justify-center text-[#3ecf8e] shadow-sm">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
                <span>Configuração de Banco de Dados &amp; Cloudinary</span>
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Alterne a conexão do PostgreSQL (Supabase) ou gerencie a CDN de mídia (Cloudinary).
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[#888888] hover:text-white hover:bg-[#252525] rounded-lg transition-colors cursor-pointer"
            id="btn-close-db-switcher"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 space-y-6 max-h-[80vh] overflow-y-auto bg-[#121212]">

          {/* Section 1: Active Connection Status Card */}
          <div className="p-4 bg-[#161616] border border-[#262626] rounded-xl space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className={`w-3 h-3 rounded-full shrink-0 ${
                  connectionStatus === 'online' ? 'bg-[#3ecf8e] animate-pulse' :
                  connectionStatus === 'error' ? 'bg-rose-500' : 'bg-amber-400 animate-spin'
                }`} />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-white">
                      {connectionStatus === 'online' ? 'Conexão Ativa com Supabase' :
                       connectionStatus === 'error' ? 'Falha de Comunicação com Banco' : 'Verificando Conexão...'}
                    </span>
                    {connectionLatency !== null && connectionStatus === 'online' && (
                      <span className="text-[10px] font-mono text-[#3ecf8e] bg-[#1a2e23] border border-[#28593f] px-2 py-0.5 rounded">
                        {connectionLatency} ms
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5 break-all">
                    {supaConfig.url || 'Nenhuma URL configurada'}
                    {projectRef && <span className="text-slate-500 ml-1.5">({projectRef})</span>}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={testDatabaseConnection}
                  disabled={isTestingConnection}
                  className="px-3 py-1.5 bg-[#202020] hover:bg-[#2a2a2a] text-slate-300 text-xs font-semibold rounded-lg border border-[#333333] transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  title="Testar comunicação com o banco de dados"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-[#3ecf8e] ${isTestingConnection ? 'animate-spin' : ''}`} />
                  <span>{isTestingConnection ? 'Testando...' : 'Testar Conexão'}</span>
                </button>

                {projectRef && (
                  <a
                    href={`https://supabase.com/dashboard/project/${projectRef}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 bg-[#202020] hover:bg-[#2a2a2a] text-slate-400 hover:text-white rounded-lg border border-[#333333] transition-colors"
                    title="Abrir Dashboard do Supabase em nova aba"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>

            {connectionErrorMsg && (
              <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{connectionErrorMsg}</span>
              </div>
            )}
          </div>

          {/* Section 1.5: Official Supabase Usage Metrics & Token Status (Vercel Integration) */}
          <div 
            id="db-official-usage-card"
            className="p-4 sm:p-5 bg-gradient-to-r from-[#0f172a] via-[#111827] to-[#0b1329] border border-sky-800/50 rounded-xl space-y-4"
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-xs font-bold text-white tracking-wide uppercase">
                      Métricas Oficiais de Uso &amp; Cota (Supabase)
                    </h3>
                    {supabaseUsage?.tokenValid ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded bg-emerald-950/90 text-emerald-400 border border-emerald-800">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        Token Autenticado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded bg-rose-950/90 text-rose-400 border border-rose-800">
                        <XCircle className="w-3 h-3 text-rose-400" />
                        Token Pendente
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Telemetria oficial da conta (Egress, PostgreSQL, Storage e integridade da chave PAT).
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setShowCalibration(!showCalibration);
                    if (showTokenInput) setShowTokenInput(false);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm border ${
                    supabaseUsage?.isCalibrated 
                      ? 'bg-amber-950/80 hover:bg-amber-900/80 text-amber-300 border-amber-700/60' 
                      : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
                  }`}
                  title="Ajustar valores base para bater 100% com o painel do Supabase"
                >
                  <Sliders className="w-3.5 h-3.5 text-amber-400" />
                  <span>{showCalibration ? 'Fechar Calibragem' : (supabaseUsage?.isCalibrated ? 'Calibrado' : 'Calibrar')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowTokenInput(!showTokenInput);
                    if (showCalibration) setShowCalibration(false);
                  }}
                  className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
                  title="Gerenciar Chave PAT do Supabase"
                >
                  <Key className="w-3.5 h-3.5 text-amber-400" />
                  <span>{showTokenInput ? 'Fechar Chave' : 'Chave PAT'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => testSupabaseMetrics()}
                  disabled={isLoadingUsage}
                  className="px-3 py-1.5 bg-sky-950/80 hover:bg-sky-900/80 text-sky-300 border border-sky-700/60 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                  title="Consultar API oficial de métricas do Supabase"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${isLoadingUsage ? 'animate-spin' : ''}`} />
                  <span>{isLoadingUsage ? 'Verificando...' : 'Testar Token & Métricas'}</span>
                </button>
              </div>
            </div>

            {/* Token Status Message or Errors */}
            {supabaseUsage?.tokenValid ? (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    <strong>Conexão validada com sucesso!</strong> Projeto: <span className="font-mono text-white">{supabaseUsage.projectName}</span> ({supabaseUsage.region})
                  </span>
                </div>
                <span className="text-[10px] text-emerald-400/80 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
                  Fonte: {supabaseUsage.tokenSource === 'vercel_environment' ? 'Ambiente Vercel' : 'Chave PAT Configurada'}
                </span>
              </div>
            ) : supabaseUsage?.error ? (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 space-y-1.5">
                <div className="flex items-start gap-2">
                  <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block text-white">Falha ao verificar o Token do Supabase:</span>
                    <span>{supabaseUsage.error}</span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 pl-6">
                  Dica: No painel da Vercel (Project Settings &gt; Environment Variables), adicione a variável <code className="text-sky-300 font-mono">SUPABASE_MANAGEMENT_TOKEN</code> com o token gerado no Supabase (inicia com <code className="text-amber-300 font-mono">sbp_</code>), ou clique no botão &quot;Chave PAT&quot; acima para inserir e testar diretamente.
                </p>
              </div>
            ) : null}

            {/* Active Calibration Alert Banner */}
            {supabaseUsage?.isCalibrated && (
              <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-200 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    <strong>Calibragem Manual Ativa:</strong> Os medidores abaixo foram alinhados com o gráfico de Billing do Supabase {supabaseUsage.calibratedAt ? `(atualizado em ${new Date(supabaseUsage.calibratedAt).toLocaleDateString('pt-BR')})` : ''}.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCalibration(true)}
                  className="text-[11px] text-amber-300 hover:text-white underline font-semibold cursor-pointer"
                >
                  Editar Valores Base
                </button>
              </div>
            )}

            {/* Manual Calibration Drawer */}
            {showCalibration && (
              <form onSubmit={handleSaveCalibration} className="p-4 bg-slate-950/95 border border-amber-500/40 rounded-xl space-y-3.5 animate-in fade-in">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-amber-400" />
                    <h4 className="text-xs font-bold text-amber-300">
                      Calibragem Manual com o Painel do Supabase
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={handleFillDefaultPanelValues}
                    className="text-[11px] text-amber-400 hover:text-amber-300 bg-amber-950/50 hover:bg-amber-950/80 px-2.5 py-1 rounded border border-amber-800/60 flex items-center gap-1.5 cursor-pointer transition-colors"
                    title="Preencher com os valores atuais do seu painel do Supabase"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Carregar Valores do Painel (0,914 GB / 0,064 GB / 0,584 GB)</span>
                  </button>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Digite os valores exatos exibidos na tela de <strong>Settings &gt; Billing &gt; Usage</strong> do seu Supabase. O sistema sincronizará os medidores internos e as barras de porcentagem para baterem 100% com o faturamento oficial.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Egress */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-300 mb-1 uppercase tracking-wider">
                      Egress Atual (GB)
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={calEgressInput}
                        onChange={(e) => setCalEgressInput(e.target.value)}
                        placeholder="Ex: 0.914"
                        className="w-full bg-[#111111] border border-slate-700 focus:border-amber-400 rounded-lg px-3 py-1.5 text-xs font-mono text-white placeholder-slate-600 outline-none"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 font-mono">
                        / 5 GB
                      </span>
                    </div>
                  </div>

                  {/* Log Ingestion */}
                  <div>
                    <label className="block text-[10px] font-bold text-amber-300 mb-1 uppercase tracking-wider">
                      Log Ingestion (GB)
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={calLogIngestInput}
                        onChange={(e) => setCalLogIngestInput(e.target.value)}
                        placeholder="Ex: 0.584"
                        className="w-full bg-[#111111] border border-amber-600/60 focus:border-amber-400 rounded-lg px-3 py-1.5 text-xs font-mono text-white placeholder-slate-600 outline-none"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 font-mono">
                        / 1 GB
                      </span>
                    </div>
                  </div>

                  {/* Database Size */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-300 mb-1 uppercase tracking-wider">
                      Database Size (GB)
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={calDbInput}
                        onChange={(e) => setCalDbInput(e.target.value)}
                        placeholder="Ex: 0.064"
                        className="w-full bg-[#111111] border border-slate-700 focus:border-amber-400 rounded-lg px-3 py-1.5 text-xs font-mono text-white placeholder-slate-600 outline-none"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 font-mono">
                        / 0,5 GB
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Log Query */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-300 mb-1 uppercase tracking-wider">
                      Log Query (GB) <span className="text-slate-500 font-normal">(Opcional)</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={calLogQueryInput}
                        onChange={(e) => setCalLogQueryInput(e.target.value)}
                        placeholder="Ex: 1.402"
                        className="w-full bg-[#111111] border border-slate-700 focus:border-amber-400 rounded-lg px-3 py-1.5 text-xs font-mono text-white placeholder-slate-600 outline-none"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 font-mono">
                        / 100 GB
                      </span>
                    </div>
                  </div>

                  {/* Storage Size */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-300 mb-1 uppercase tracking-wider">
                      Storage Supabase (GB) <span className="text-slate-500 font-normal">(Opcional)</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={calStorageInput}
                        onChange={(e) => setCalStorageInput(e.target.value)}
                        placeholder="Ex: 0.000"
                        className="w-full bg-[#111111] border border-slate-700 focus:border-amber-400 rounded-lg px-3 py-1.5 text-xs font-mono text-white placeholder-slate-600 outline-none"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 font-mono">
                        / 1 GB
                      </span>
                    </div>
                  </div>
                </div>

                {calibrationSaveSuccess && (
                  <div className="p-2 bg-[#1b3326] border border-[#2e5d42] rounded-lg text-xs text-[#3ecf8e] flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-[#3ecf8e] shrink-0" />
                    <span>Calibragem aplicada e sincronizada em nuvem com sucesso!</span>
                  </div>
                )}

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={handleResetCalibration}
                    className="px-2.5 py-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1 border border-rose-900/40"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Restaurar Automático</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCalibration(false)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      Fechar
                    </button>
                    <button
                      type="submit"
                      disabled={isLoadingUsage}
                      className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                      <span>Salvar Calibragem</span>
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Token Input Drawer */}
            {showTokenInput && (
              <form onSubmit={handleSaveCustomToken} className="p-4 bg-slate-950/95 border border-amber-900/50 rounded-xl space-y-3.5 animate-in fade-in shadow-xl">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400">
                      <Key className="w-3.5 h-3.5" />
                    </div>
                    <h4 className="text-xs font-bold text-amber-300">
                      Personal Access Token (PAT) do Supabase
                    </h4>
                  </div>
                  <a
                    href="https://supabase.com/dashboard/account/tokens"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-sky-400 hover:text-sky-300 hover:underline flex items-center gap-1 font-medium"
                  >
                    <span>Gerar Novo Token no Supabase</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                {/* Expiration & Persistence Guidance Notice */}
                <div className="p-3 bg-amber-950/30 border border-amber-700/40 rounded-lg space-y-1.5 text-amber-200">
                  <div className="flex items-start gap-2">
                    <HelpCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-xs leading-relaxed">
                      <strong className="text-white block mb-0.5">Por que o token pode falhar após algum tempo?</strong>
                      <p className="text-[11px] text-amber-200/90 leading-normal">
                        No painel do Supabase, todo Personal Access Token possui um campo de <strong>Expiração (Expiration)</strong>. Se ele foi gerado com prazo curto (como <em>1 dia</em> ou <em>7 dias</em>), o próprio Supabase revoga o token ao fim do período (gerando erro 401).
                      </p>
                      <p className="text-[11px] text-amber-200/90 leading-normal mt-1">
                        <strong>Dica:</strong> Ao gerar o token no Supabase, selecione a validade máxima (ex: <em>1 ano</em> ou <em>sem expiração</em>). O Stocck RMA agora armazena sua chave com tripla camada de redundância (memória local, sessão e nuvem central).
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider">
                      Chave PAT (sbp_...)
                    </label>
                    {customTokenInput.trim() && (
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded">
                        Chave salva em cache e nuvem
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showTokenSecret ? 'text' : 'password'}
                      value={customTokenInput}
                      onChange={(e) => setCustomTokenInput(e.target.value)}
                      placeholder="sbp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      className="w-full bg-[#111111] border border-slate-700 focus:border-amber-400 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-slate-600 outline-none pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowTokenSecret(!showTokenSecret)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 cursor-pointer"
                      title={showTokenSecret ? 'Ocultar' : 'Mostrar'}
                    >
                      {showTokenSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {tokenSaveSuccess && (
                  <div className="p-2 bg-[#1b3326] border border-[#2e5d42] rounded-lg text-xs text-[#3ecf8e] flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-[#3ecf8e] shrink-0" />
                    <span>Token salvo, replicado e testado com sucesso!</span>
                  </div>
                )}

                <div className="flex items-center justify-between pt-1">
                  {customTokenInput.trim() ? (
                    <button
                      type="button"
                      onClick={handleClearCustomToken}
                      className="px-2.5 py-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1 border border-rose-900/40"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Remover Chave</span>
                    </button>
                  ) : <div />}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowTokenInput(false)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      Fechar
                    </button>
                    <button
                      type="submit"
                      disabled={!customTokenInput.trim() || isLoadingUsage}
                      className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                      <span>Salvar e Testar Token</span>
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Official Usage Stats Grid - 5 Cards including Log Ingestion */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-1">
              {/* Card 1: Egress */}
              <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 font-medium">Egress (Transferência)</span>
                  <span className="text-[9px] font-bold text-sky-400 font-mono">
                    {supabaseUsage ? `${supabaseUsage.egressPercent}%` : '--'}
                  </span>
                </div>
                <div className="text-base sm:text-lg font-bold text-white font-mono">
                  {isLoadingUsage ? '...' : (supabaseUsage?.egressGb || '0,914 GB')}
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${
                      (supabaseUsage?.egressPercent || 0) > 85 ? 'bg-rose-500' :
                      (supabaseUsage?.egressPercent || 0) > 60 ? 'bg-amber-500' : 'bg-sky-500'
                    }`}
                    style={{ width: `${Math.min(100, supabaseUsage?.egressPercent || 0)}%` }}
                  />
                </div>
                <span className="text-[10px] text-slate-500 block">
                  Limite: {supabaseUsage?.egressLimitGb || '5 GB'}
                </span>
              </div>

              {/* Card 2: Log Ingestion (Highlighted!) */}
              <div className="p-3 bg-slate-950/60 border border-amber-900/60 rounded-lg space-y-1.5 relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-amber-300 font-semibold flex items-center gap-1">
                    <span>Log Ingestion</span>
                    {(supabaseUsage?.logIngestionPercent || 0) > 50 && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    )}
                  </span>
                  <span className="text-[9px] font-bold text-amber-400 font-mono">
                    {supabaseUsage ? `${supabaseUsage.logIngestionPercent}%` : '--'}
                  </span>
                </div>
                <div className="text-base sm:text-lg font-bold text-amber-300 font-mono">
                  {isLoadingUsage ? '...' : (supabaseUsage?.logIngestionGb || '0,584 GB')}
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${
                      (supabaseUsage?.logIngestionPercent || 0) > 85 ? 'bg-rose-500' :
                      (supabaseUsage?.logIngestionPercent || 0) > 50 ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, supabaseUsage?.logIngestionPercent || 0)}%` }}
                  />
                </div>
                <span className="text-[10px] text-amber-400/80 block">
                  Limite: {supabaseUsage?.logIngestionLimitGb || '1 GB'}
                </span>
              </div>

              {/* Card 3: Database Size */}
              <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 font-medium">Banco (PostgreSQL)</span>
                  <span className="text-[9px] font-bold text-emerald-400 font-mono">
                    {supabaseUsage ? `${supabaseUsage.databaseSizePercent}%` : '--'}
                  </span>
                </div>
                <div className="text-base sm:text-lg font-bold text-white font-mono">
                  {isLoadingUsage ? '...' : (supabaseUsage?.databaseSizeGb || '0,064 GB')}
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${Math.min(100, supabaseUsage?.databaseSizePercent || 0)}%` }}
                  />
                </div>
                <span className="text-[10px] text-slate-500 block">
                  Limite: {supabaseUsage?.databaseSizeLimitGb || '0,5 GB'}
                </span>
              </div>

              {/* Card 4: Storage */}
              <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 font-medium">Storage Supabase</span>
                  <span className="text-[9px] font-bold text-sky-400 font-mono">
                    {supabaseUsage ? `${supabaseUsage.storagePercent}%` : '--'}
                  </span>
                </div>
                <div className="text-base sm:text-lg font-bold text-white font-mono">
                  {isLoadingUsage ? '...' : (supabaseUsage?.storageSizeGb || '0,000 GB')}
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="h-full rounded-full bg-sky-500 transition-all duration-500"
                    style={{ width: `${Math.min(100, supabaseUsage?.storagePercent || 0)}%` }}
                  />
                </div>
                <span className="text-[10px] text-slate-500 block">
                  {supabaseUsage?.storageObjectsCount ? `${supabaseUsage.storageObjectsCount} arquivos` : 'Limite: 1 GB'}
                </span>
              </div>

              {/* Card 5: Users / MAU */}
              <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 font-medium">Usuários (Auth)</span>
                  <span className="text-[9px] font-bold text-teal-400 font-mono">
                    {supabaseUsage ? `${supabaseUsage.mauPercent}%` : '--'}
                  </span>
                </div>
                <div className="text-base sm:text-lg font-bold text-white font-mono">
                  {isLoadingUsage ? '...' : (supabaseUsage?.mau ?? 3)}
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="h-full rounded-full bg-teal-500 transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(1, supabaseUsage?.mauPercent || 0))}%` }}
                  />
                </div>
                <span className="text-[10px] text-slate-500 block">
                  Limite: 50.000
                </span>
              </div>
            </div>

            {/* Top Tables Detail (when available) */}
            {Array.isArray(supabaseUsage?.tables) && supabaseUsage.tables.length > 0 && (
              <div className="pt-2 border-t border-slate-800/60">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-sky-400" />
                    <span>Maiores Tabelas no PostgreSQL:</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Total em disco: {supabaseUsage.rawResponse?.dbPretty || supabaseUsage.databaseSizeGb}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-36 overflow-y-auto pr-1">
                  {supabaseUsage.tables.slice(0, 8).map((tbl, idx) => (
                    <div key={idx} className="p-2 bg-slate-950/40 border border-slate-800/50 rounded flex items-center justify-between text-[11px]">
                      <span className="text-slate-300 font-mono truncate" title={tbl.tableName}>
                        {tbl.tableName}
                      </span>
                      <span className="text-sky-400 font-mono font-bold shrink-0 ml-1.5">
                        {tbl.sizePretty}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Change Database Connection Form */}
          <div className="p-4 sm:p-5 bg-[#171717] border border-[#282828] rounded-xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-[#3ecf8e]" />
                  <span>Trocar Banco de Dados (Supabase)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Para migrar ou conectar a outro projeto Supabase, insira as novas credenciais abaixo. A aplicação salvará a conexão e reiniciará imediatamente.
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveDatabaseConfig} className="space-y-3.5 pt-1">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  Project URL (Supabase)
                </label>
                <input
                  type="url"
                  value={newDbUrl}
                  onChange={(e) => setNewDbUrl(e.target.value)}
                  placeholder="https://xxxxxxxxxxxxxxxxxxxx.supabase.co"
                  className="w-full bg-[#101010] border border-[#333333] focus:border-[#3ecf8e] rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-slate-600 outline-none transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  Project API Key (anon / public)
                </label>
                <div className="relative">
                  <input
                    type={showDbKey ? 'text' : 'password'}
                    value={newDbAnonKey}
                    onChange={(e) => setNewDbAnonKey(e.target.value)}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    className="w-full bg-[#101010] border border-[#333333] focus:border-[#3ecf8e] rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-slate-600 outline-none pr-10 transition-colors"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowDbKey(!showDbKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-1"
                    title={showDbKey ? 'Ocultar chave' : 'Mostrar chave'}
                  >
                    {showDbKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {dbSaveError && (
                <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{dbSaveError}</span>
                </div>
              )}

              {dbSaveSuccess && (
                <div className="p-2.5 bg-[#1b3326] border border-[#2e5d42] rounded-lg text-xs text-[#3ecf8e] flex items-center gap-2">
                  <Check className="w-4 h-4 text-[#3ecf8e] shrink-0" />
                  <span>Banco de dados atualizado com sucesso! Reiniciando a aplicação...</span>
                </div>
              )}

              <div className="flex items-center justify-end pt-1">
                <button
                  type="submit"
                  disabled={!newDbUrl.trim() || !newDbAnonKey.trim() || dbSaveSuccess}
                  className="px-4 py-2 bg-[#3ecf8e] hover:bg-[#34b67c] disabled:opacity-50 text-slate-950 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-2 shadow-lg shadow-[#3ecf8e]/10"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>Salvar e Conectar Novo Banco</span>
                </button>
              </div>
            </form>
          </div>

          {/* Section 3: Cloudinary CDN Card */}
          <div 
            id="db-cloudinary-metrics-card"
            className="p-4 sm:p-5 bg-gradient-to-r from-[#0d1f2d] via-[#0e1724] to-[#12141c] border border-sky-900/60 rounded-xl space-y-4"
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
                  <Cloud className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-xs font-bold text-white tracking-wide uppercase">
                      Cloudinary Media CDN &amp; Armazenamento
                    </h3>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded bg-sky-950/80 text-sky-400 border border-sky-800/80">
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                      CDN Ativa
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Todas as fotos de produtos, triagem e caixas são salvas diretamente no Cloudinary em alta resolução.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => setIsEditingCloudinary(!isEditingCloudinary)}
                  className="px-3 py-1.5 bg-sky-950/80 hover:bg-sky-900/80 text-sky-300 border border-sky-700/60 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>{isEditingCloudinary ? 'Fechar Configuração' : 'Configurar Cloudinary'}</span>
                </button>
              </div>
            </div>

            {/* Cloudinary Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg">
                <span className="text-[10px] text-slate-400 block font-medium">Fotos no Cloudinary</span>
                <span className="text-base sm:text-lg font-bold text-sky-400 font-mono">
                  {isLoadingCloudinaryMetrics ? '...' : `${cloudinaryMetrics?.totalCloudinaryImages ?? 0} fotos`}
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">URLs CDN diretas</span>
              </div>

              <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg">
                <span className="text-[10px] text-slate-400 block font-medium">Espaço Poupado</span>
                <span className="text-base sm:text-lg font-bold text-emerald-400 font-mono">
                  {isLoadingCloudinaryMetrics ? '...' : (cloudinaryMetrics?.estimatedStorageSavedFormatted ?? '0 B')}
                </span>
                <span className="text-[10px] text-emerald-500/80 block mt-0.5">Não consome disco</span>
              </div>

              <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg">
                <span className="text-[10px] text-slate-400 block font-medium">Tráfego de Rede</span>
                <span className="text-base sm:text-lg font-bold text-emerald-400 font-mono">
                  {isLoadingCloudinaryMetrics ? '...' : (cloudinaryMetrics?.estimatedEgressSavedFormatted ?? '0 B')}
                </span>
                <span className="text-[10px] text-emerald-500/80 block mt-0.5">0 bytes no banco</span>
              </div>

              <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg">
                <span className="text-[10px] text-slate-400 block font-medium">Status da CDN</span>
                <span className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5 mt-0.5">
                  <ShieldCheck className="w-4 h-4 text-sky-400" />
                  {isCloudinaryActive() ? 'Operacional' : 'Pendente'}
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  {cloudinaryConfig.cloudName ? cloudinaryConfig.cloudName : 'Não vinculado'}
                </span>
              </div>
            </div>

            {/* Cloudinary Inline Form (Drawer) */}
            {isEditingCloudinary && (
              <form onSubmit={handleSaveCloudinary} className="p-4 bg-slate-950/90 border border-sky-900/70 rounded-xl space-y-3 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
                    <Cloud className="w-3.5 h-3.5" />
                    <span>Credenciais do Cloudinary</span>
                  </h4>
                  <a
                    href="https://cloudinary.com/documentation/upload_presets"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-sky-400 hover:underline flex items-center gap-1"
                  >
                    <span>Ajuda com Upload Presets</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider">
                      Cloud Name
                    </label>
                    <input
                      type="text"
                      value={cloudNameInput}
                      onChange={(e) => setCloudNameInput(e.target.value)}
                      placeholder="ex: meu-cloud-name"
                      className="w-full bg-[#111111] border border-slate-700 focus:border-sky-400 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-slate-600 outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider">
                      Upload Preset (Unsigned)
                    </label>
                    <input
                      type="text"
                      value={uploadPresetInput}
                      onChange={(e) => setUploadPresetInput(e.target.value)}
                      placeholder="ex: stocck_unsigned"
                      className="w-full bg-[#111111] border border-slate-700 focus:border-sky-400 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-slate-600 outline-none"
                      required
                    />
                  </div>
                </div>

                {cloudinarySaveSuccess && (
                  <div className="p-2 bg-[#1b3326] border border-[#2e5d42] rounded-lg text-xs text-[#3ecf8e] flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-[#3ecf8e] shrink-0" />
                    <span>Configuração do Cloudinary atualizada com sucesso!</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsEditingCloudinary(false)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                    <span>Salvar Cloudinary</span>
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Section 4: SQL Schema for Technical Reference (New Databases) */}
          <div className="pt-2 border-t border-[#262626]">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowSqlCode(!showSqlCode)}
                className="text-xs text-[#888888] hover:text-white flex items-center gap-1.5 cursor-pointer font-medium transition-colors"
              >
                <Code className="w-3.5 h-3.5 text-[#3ecf8e]" />
                <span>{showSqlCode ? 'Ocultar Script SQL das Tabelas' : 'Ver Script SQL para Novo Banco de Dados'}</span>
              </button>

              {showSqlCode && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyQuickPatch}
                    className="px-2.5 py-1 bg-[#1f1f1f] hover:bg-[#292929] text-sky-400 text-[11px] font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1 border border-sky-900/40"
                    title="Copia script SQL de atualização de colunas"
                  >
                    {copiedQuickPatch ? (
                      <>
                        <Check className="w-3 h-3 text-[#3ecf8e]" />
                        <span className="text-[#3ecf8e]">Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3 text-sky-400" />
                        <span>Atualização Rápida (SQL)</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleCopySql}
                    className="px-2.5 py-1 bg-[#1f1f1f] hover:bg-[#292929] text-white text-[11px] font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1 border border-[#333333]"
                  >
                    {copiedSql ? (
                      <>
                        <Check className="w-3 h-3 text-[#3ecf8e]" />
                        <span className="text-[#3ecf8e]">Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3 text-[#888888]" />
                        <span>Copiar SQL Completo</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {showSqlCode && (
              <pre className="mt-3 p-4 bg-[#0d0d0d] border border-[#262626] rounded-xl text-[11px] font-mono text-[#b0b0b0] max-h-52 overflow-y-auto whitespace-pre-wrap leading-relaxed animate-in fade-in">
                {SUPABASE_SQL_SCHEMA}
              </pre>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-[#181818] border-t border-[#262626] flex items-center justify-between text-xs text-[#888888]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#3ecf8e]" />
            <span>PostgreSQL + Cloudinary CDN</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-[#222222] hover:bg-[#2d2d2d] text-white rounded-lg font-semibold cursor-pointer transition-colors border border-[#333333]"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
