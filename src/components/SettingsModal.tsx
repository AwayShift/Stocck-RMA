/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
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
  Layers,
  Sparkles,
  HardDriveDownload,
  HardDriveUpload,
  Download,
  RotateCcw,
  Sun,
  Moon,
  Palette
} from 'lucide-react';
import { ThemeMode } from '../lib/theme';

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
