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
  ShieldCheck
} from 'lucide-react';
import {
  getSupabaseClient,
  getSupabaseConfig,
  saveSupabaseConfig,
  extractSupabaseProjectRef,
  testSupabaseConnection,
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
  persistSystemIntegrationsToCloud
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
  const [isSavingDb, setIsSavingDb] = useState<boolean>(false);
  const [dbSaveSuccess, setDbSaveSuccess] = useState<boolean>(false);
  const [dbSaveError, setDbSaveError] = useState<string | null>(null);
  const [dbSaveWarning, setDbSaveWarning] = useState<string | null>(null);

  // Cloudinary settings state
  const [cloudinaryConfig, setCloudinaryConfig] = useState<CloudinaryConfig>(() => getCloudinaryConfig());
  const [cloudNameInput, setCloudNameInput] = useState<string>(cloudinaryConfig.cloudName);
  const [uploadPresetInput, setUploadPresetInput] = useState<string>(cloudinaryConfig.uploadPreset);
  const [isSavingCloudinary, setIsSavingCloudinary] = useState<boolean>(false);
  const [cloudinarySaveSuccess, setCloudinarySaveSuccess] = useState<boolean>(false);
  const [cloudinarySaveError, setCloudinarySaveError] = useState<string | null>(null);
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
      const res = await testSupabaseConnection();
      const endTime = performance.now();
      const latency = Math.round(endTime - startTime);

      if (!res.connected) {
        setConnectionStatus('error');
        setConnectionErrorMsg(res.message || 'Falha ao comunicar com o banco de dados.');
      } else {
        setConnectionStatus('online');
        setConnectionLatency(latency);
        if (!res.tablesCreated) {
          setConnectionErrorMsg('Conectado ao Supabase, porém as tabelas ainda não foram criadas. Execute o Script SQL fornecido abaixo.');
        }
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

  useEffect(() => {
    if (isOpen) {
      const currentConfig = getSupabaseConfig();
      setSupaConfig(currentConfig);
      setNewDbUrl(currentConfig.url);
      setNewDbAnonKey(currentConfig.anonKey);
      setDbSaveError(null);
      setDbSaveWarning(null);
      setDbSaveSuccess(false);
      
      const currentCloudinary = getCloudinaryConfig();
      setCloudinaryConfig(currentCloudinary);
      setCloudNameInput(currentCloudinary.cloudName);
      setUploadPresetInput(currentCloudinary.uploadPreset);
      setCloudinarySaveError(null);
      setCloudinarySaveSuccess(false);

      testDatabaseConnection();
      refreshCloudinaryMetrics();
    }
  }, [isOpen]);

  // Handle switching database with live connection test & credential validation
  const handleSaveDatabaseConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    let cleanUrl = newDbUrl.trim().replace(/^["']|["']$/g, '').trim();
    let cleanAnonKey = newDbAnonKey.trim().replace(/^["']|["']$/g, '').trim();
    cleanAnonKey = cleanAnonKey.replace(/^Bearer\s+/i, '').trim();
    
    if (!cleanUrl || !cleanAnonKey) {
      setDbSaveError('Preencha a URL do Projeto e a Anon Key pública.');
      return;
    }

    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = `https://${cleanUrl}`;
    }
    cleanUrl = cleanUrl.replace(/\/+$/, '');

    setDbSaveError(null);
    setDbSaveWarning(null);
    setIsSavingDb(true);

    try {
      // 1. Live test with new credentials before saving or purging
      const testResult = await testSupabaseConnection({ url: cleanUrl, anonKey: cleanAnonKey });

      if (!testResult.connected) {
        setDbSaveError(testResult.message || 'Falha ao conectar com o novo banco de dados. Verifique a URL e a Anon Key.');
        setIsSavingDb(false);
        return;
      }

      if (!testResult.tablesCreated) {
        setDbSaveWarning('Conectado ao Supabase! Note que as tabelas ainda não foram criadas neste banco. Use o Script SQL fornecido abaixo no SQL Editor.');
      }

      const currentConfig = getSupabaseConfig();
      const newConfig: SupabaseConfig = { 
        url: cleanUrl, 
        anonKey: cleanAnonKey,
        personalAccessToken: currentConfig.personalAccessToken
      };
      saveSupabaseConfig(newConfig);
      setSupaConfig(newConfig);
      setDbSaveSuccess(true);

      // Clear local app cache so data from old database does not mix with the new one
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
    } catch (err: any) {
      setDbSaveError(err?.message || 'Erro inesperado ao conectar com o novo banco.');
      setIsSavingDb(false);
    }
  };

  // Handle saving Cloudinary settings
  const handleSaveCloudinary = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingCloudinary(true);
    setCloudinarySaveError(null);

    const cleanCloudName = cloudNameInput.trim().replace(/^["']|["']$/g, '');
    const cleanPreset = uploadPresetInput.trim().replace(/^["']|["']$/g, '');

    try {
      const updated = saveCloudinaryConfig({
        cloudName: cleanCloudName,
        uploadPreset: cleanPreset,
        enabled: Boolean(cleanCloudName && cleanPreset)
      });

      setCloudinaryConfig(updated);
      setCloudinarySaveSuccess(true);
      setTimeout(() => setCloudinarySaveSuccess(false), 3500);

      // Persist to central database config
      persistSystemIntegrationsToCloud({ cloudinaryConfig: updated }).catch(() => {});
      refreshCloudinaryMetrics();
    } catch (err: any) {
      setCloudinarySaveError(err?.message || 'Erro ao salvar configuração do Cloudinary.');
    } finally {
      setIsSavingCloudinary(false);
    }
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
                Alterne a conexão do PostgreSQL (Supabase) e gerencie o armazenamento de fotos (Cloudinary CDN).
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
          <div id="db-connection-status-card" className="p-4 bg-[#161616] border border-[#262626] rounded-xl space-y-3">
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

          {/* Section 2: Change / Configure Supabase Database Form */}
          <div id="db-supabase-config-card" className="p-4 sm:p-5 bg-[#171717] border border-[#282828] rounded-xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-[#3ecf8e]" />
                  <span>Configurar Banco de Dados (Supabase)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Para migrar ou conectar a outro projeto Supabase, insira as novas credenciais abaixo. A aplicação validará a conexão com segurança, salvará os dados e reiniciará.
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveDatabaseConfig} noValidate className="space-y-3.5 pt-1">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  Project URL (Supabase)
                </label>
                <input
                  type="text"
                  inputMode="url"
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

              {dbSaveWarning && (
                <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>{dbSaveWarning}</span>
                </div>
              )}

              {dbSaveSuccess && (
                <div className="p-2.5 bg-[#1b3326] border border-[#2e5d42] rounded-lg text-xs text-[#3ecf8e] flex items-center gap-2">
                  <Check className="w-4 h-4 text-[#3ecf8e] shrink-0" />
                  <span>Banco de dados conectado e validado com sucesso! Reiniciando a aplicação...</span>
                </div>
              )}

              <div className="flex items-center justify-end pt-1">
                <button
                  type="submit"
                  id="btn-save-db-config"
                  disabled={!newDbUrl.trim() || !newDbAnonKey.trim() || isSavingDb || dbSaveSuccess}
                  className="px-4 py-2.5 bg-[#3ecf8e] hover:bg-[#34b67c] disabled:opacity-50 text-slate-950 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-2 shadow-lg shadow-[#3ecf8e]/10"
                >
                  {isSavingDb ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                      <span>Validando e Conectando...</span>
                    </>
                  ) : dbSaveSuccess ? (
                    <>
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>Conectado com Sucesso!</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>Salvar e Conectar Novo Banco</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Section 3: Configure Cloudinary CDN & Media Storage */}
          <div 
            id="db-cloudinary-config-card"
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
                      Configuração do Cloudinary (Armazenamento de Fotos)
                    </h3>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded bg-sky-950/80 text-sky-400 border border-sky-800/80">
                      <ShieldCheck className="w-3 h-3 text-sky-400" />
                      {isCloudinaryActive() ? 'CDN Ativa' : 'Pendente de Configuração'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Todas as fotos de produtos, triagem e caixas são salvas diretamente no Cloudinary em alta resolução.
                  </p>
                </div>
              </div>

              {cloudinaryMetrics && cloudinaryMetrics.totalCloudinaryImages > 0 && (
                <span className="text-[11px] font-mono text-sky-300 bg-sky-950/80 border border-sky-800/60 px-2.5 py-1 rounded-lg">
                  {isLoadingCloudinaryMetrics ? '...' : `${cloudinaryMetrics.totalCloudinaryImages} fotos na CDN`}
                </span>
              )}
            </div>

            {/* Cloudinary Form */}
            <form onSubmit={handleSaveCloudinary} noValidate id="form-cloudinary-config" className="p-4 bg-slate-950/90 border border-sky-900/70 rounded-xl space-y-3">
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
                    Cloud Name *
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
                    Upload Preset (Unsigned) *
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

              {cloudinarySaveError && (
                <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{cloudinarySaveError}</span>
                </div>
              )}

              {cloudinarySaveSuccess && (
                <div className="p-2 bg-[#1b3326] border border-[#2e5d42] rounded-lg text-xs text-[#3ecf8e] flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-[#3ecf8e] shrink-0" />
                  <span>Configuração do Cloudinary atualizada com sucesso!</span>
                </div>
              )}

              <div className="flex items-center justify-end pt-1">
                <button
                  type="submit"
                  id="btn-save-cloudinary-config"
                  disabled={isSavingCloudinary}
                  className="px-4 py-2.5 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-md shadow-sky-500/10"
                >
                  {isSavingCloudinary ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-950" />
                      <span>Salvando...</span>
                    </>
                  ) : cloudinarySaveSuccess ? (
                    <>
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                      <span>Salvo com Sucesso!</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                      <span>Salvar Configuração do Cloudinary</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Section 4: SQL Schema for Technical Reference (New Databases) */}
          <div id="db-sql-schema-section" className="pt-2 border-t border-[#262626]">
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
