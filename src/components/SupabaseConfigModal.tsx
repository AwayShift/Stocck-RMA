/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Database, 
  X, 
  Check, 
  AlertCircle, 
  Key, 
  Globe, 
  ExternalLink, 
  Eye, 
  EyeOff, 
  Sparkles,
  ShieldCheck
} from 'lucide-react';
import { 
  getSupabaseConfig, 
  saveSupabaseConfig, 
  testSupabaseConnection, 
  SupabaseConfig 
} from '../lib/supabase';

interface SupabaseConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export default function SupabaseConfigModal({
  isOpen,
  onClose,
  onSaved
}: SupabaseConfigModalProps) {
  const [url, setUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const current = getSupabaseConfig();
      setUrl(current.url || '');
      setAnonKey(current.anonKey || '');
      setTestResult(null);
      setSaveSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTest = async () => {
    if (!url.trim() || !anonKey.trim()) {
      setTestResult({
        success: false,
        message: 'Por favor, preencha a URL do projeto e a Chave Anônima antes de testar.'
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await testSupabaseConnection({
        url: url.trim(),
        anonKey: anonKey.trim()
      });
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || 'Falha ao conectar ao Supabase. Verifique a URL e a Chave.'
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || !anonKey.trim()) {
      setTestResult({
        success: false,
        message: 'URL e Chave Anônima são obrigatórias.'
      });
      return;
    }

    saveSupabaseConfig({
      url: url.trim(),
      anonKey: anonKey.trim()
    });

    setSaveSuccess(true);
    setTestResult({
      success: true,
      message: 'Configurações do Supabase salvas com sucesso no navegador!'
    });

    setTimeout(() => {
      onSaved?.();
      onClose();
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 font-sans" id="supabase-config-modal-backdrop">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" id="supabase-config-modal-card">
        
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-850 bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shadow-md shadow-emerald-500/10">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Conectar Banco Supabase
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  PostgreSQL + Auth
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Defina a URL do seu projeto e a chave anônima pública
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            id="btn-close-supabase-config"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Helper Guide */}
          <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-2xl text-xs space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold">
              <Sparkles className="w-4 h-4" />
              <span>Onde encontrar suas credenciais no Supabase:</span>
            </div>
            <ol className="list-decimal list-inside text-slate-300 space-y-1 pl-1 text-[11px] leading-relaxed">
              <li>Acesse o painel do seu projeto em <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-emerald-400 underline inline-flex items-center gap-0.5">supabase.com <ExternalLink className="w-2.5 h-2.5" /></a></li>
              <li>Acesse <strong>Project Settings &gt; API</strong></li>
              <li>Copie a <strong>Project URL</strong> (ex: <code className="text-slate-400 bg-slate-900 px-1 rounded">https://xyz.supabase.co</code>)</li>
              <li>Copie a <strong>Project API key (anon public)</strong></li>
            </ol>
          </div>

          {/* Test & Save Status Messages */}
          {testResult && (
            <div className={`p-3.5 rounded-xl border flex items-start gap-2.5 text-xs font-semibold ${
              testResult.success 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
            }`}>
              {testResult.success ? (
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <span className="leading-relaxed">{testResult.message}</span>
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-4" id="form-supabase-config">
            {/* Project URL */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-300 flex items-center justify-between">
                <span>URL do Projeto Supabase (Project URL)</span>
                <span className="text-emerald-400 lowercase font-normal">https://[id].supabase.co</span>
              </label>
              <div className="relative">
                <Globe className="absolute left-3.5 top-3.5 w-4.5 h-4.5 text-slate-500" />
                <input
                  type="url"
                  placeholder="https://seu-projeto.supabase.co"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-mono"
                  id="input-supabase-url"
                  required
                />
              </div>
            </div>

            {/* Anon Public Key */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-300 flex items-center justify-between">
                <span>Chave Pública Anon (anon public key)</span>
                <span className="text-slate-400 font-normal">JWT Token</span>
              </label>
              <div className="relative">
                <Key className="absolute left-3.5 top-3.5 w-4.5 h-4.5 text-slate-500" />
                <input
                  type={showKey ? "text" : "password"}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  value={anonKey}
                  onChange={(e) => setAnonKey(e.target.value)}
                  className="w-full pl-10 pr-11 py-3 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-mono"
                  id="input-supabase-anon-key"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3.5 top-3.5 text-slate-500 hover:text-white transition-colors cursor-pointer"
                  tabIndex={-1}
                >
                  {showKey ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                </button>
              </div>
            </div>

            {/* GitHub Actions CI note */}
            <div className="p-3 bg-slate-950/40 border border-slate-850 rounded-xl text-[11px] text-slate-400">
              💡 <strong>Dica para Deploy no GitHub Pages:</strong> Para que novos usuários acessem automaticamente sem precisar preencher este modal, adicione os segredos <code className="text-emerald-400 bg-slate-900 px-1 py-0.5 rounded">VITE_SUPABASE_URL</code> e <code className="text-emerald-400 bg-slate-900 px-1 py-0.5 rounded">VITE_SUPABASE_ANON_KEY</code> em <em>Settings &gt; Secrets and variables &gt; Actions</em> no GitHub.
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={handleTest}
                disabled={isTesting || !url.trim() || !anonKey.trim()}
                className="flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-750 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs transition-colors border border-slate-700 flex items-center justify-center gap-2 cursor-pointer"
                id="btn-test-supabase-config"
              >
                {isTesting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    <span>Testando Conexão...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Testar Conexão</span>
                  </>
                )}
              </button>

              <button
                type="submit"
                disabled={isTesting || saveSuccess || !url.trim() || !anonKey.trim()}
                className="flex-1 py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer"
                id="btn-save-supabase-config"
              >
                {saveSuccess ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Salvo com Sucesso!</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Salvar &amp; Conectar</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-slate-950 border-t border-slate-850 flex items-center justify-between text-[11px] text-slate-500">
          <span>Armazenado localmente com segurança</span>
          <button
            type="button"
            onClick={onClose}
            className="hover:text-slate-300 font-medium cursor-pointer"
          >
            Cancelar
          </button>
        </div>

      </div>
    </div>
  );
}
