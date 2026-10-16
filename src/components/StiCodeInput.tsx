import React, { useId } from 'react';
import { Hash, Check, X } from 'lucide-react';
import { extractStiDigits, isValidStiCode } from '../utils/stiFormatter';

export interface StiCodeInputProps {
  value: string;
  onChange: (formattedValue: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  id?: string;
  autoFocus?: boolean;
  required?: boolean;
  disabled?: boolean;
  error?: string | boolean | null;
  variant?: 'amber' | 'indigo' | 'slate' | 'sky';
  size?: 'sm' | 'md';
  className?: string;
  isLight?: boolean;
  showHelper?: boolean;
}

export const StiCodeInput: React.FC<StiCodeInputProps> = ({
  value,
  onChange,
  onKeyDown,
  placeholder = '1234',
  id,
  autoFocus = false,
  required = false,
  disabled = false,
  error = null,
  variant = 'amber',
  size = 'md',
  className = '',
  isLight = false,
  showHelper = true,
}) => {
  const generatedId = useId();
  const inputId = id || generatedId;

  // Extrai exclusivamente os 4 números
  const digits = extractStiDigits(value);
  const isValid = isValidStiCode(digits);
  const hasError = Boolean(error);

  const handleDigitsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const cleanDigits = extractStiDigits(raw);
    onChange(cleanDigits);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    const cleanDigits = extractStiDigits(pastedText);
    onChange(cleanDigits);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onChange('');
  };

  // Color schemes based on variant and light/dark theme
  const getVariantStyles = () => {
    if (variant === 'indigo') {
      return {
        prefixBg: isLight ? 'bg-indigo-100 text-indigo-950 border-indigo-300' : 'bg-indigo-950/80 text-indigo-300 border-indigo-500/40',
        prefixIcon: isLight ? 'text-indigo-700' : 'text-indigo-400',
        containerBorder: isValid
          ? isLight ? 'border-emerald-500 ring-emerald-500/20' : 'border-emerald-500/80 ring-emerald-500/20'
          : hasError
          ? isLight ? 'border-rose-500 ring-rose-500/20' : 'border-rose-500/80 ring-rose-500/20'
          : isLight ? 'border-indigo-300 focus-within:border-indigo-600 focus-within:ring-indigo-500/20' : 'border-indigo-500/40 focus-within:border-indigo-400 focus-within:ring-indigo-400/30',
        inputBg: isLight ? 'bg-white text-slate-900 placeholder-slate-400' : 'bg-slate-950 text-indigo-100 placeholder-indigo-400/30',
      };
    }

    if (variant === 'sky') {
      return {
        prefixBg: isLight ? 'bg-sky-100 text-sky-950 border-sky-300' : 'bg-sky-950/80 text-sky-300 border-sky-500/40',
        prefixIcon: isLight ? 'text-sky-700' : 'text-sky-400',
        containerBorder: isValid
          ? isLight ? 'border-emerald-500 ring-emerald-500/20' : 'border-emerald-500/80 ring-emerald-500/20'
          : hasError
          ? isLight ? 'border-rose-500 ring-rose-500/20' : 'border-rose-500/80 ring-rose-500/20'
          : isLight ? 'border-sky-300 focus-within:border-sky-600 focus-within:ring-sky-500/20' : 'border-sky-500/40 focus-within:border-sky-400 focus-within:ring-sky-400/30',
        inputBg: isLight ? 'bg-white text-slate-900 placeholder-slate-400' : 'bg-slate-950 text-sky-100 placeholder-sky-400/30',
      };
    }

    if (variant === 'slate') {
      return {
        prefixBg: isLight ? 'bg-slate-200 text-slate-800 border-slate-300' : 'bg-slate-900 text-slate-300 border-slate-700',
        prefixIcon: isLight ? 'text-slate-600' : 'text-slate-400',
        containerBorder: isValid
          ? isLight ? 'border-emerald-500 ring-emerald-500/20' : 'border-emerald-500/80 ring-emerald-500/20'
          : hasError
          ? isLight ? 'border-rose-500 ring-rose-500/20' : 'border-rose-500/80 ring-rose-500/20'
          : isLight ? 'border-slate-300 focus-within:border-sky-500 focus-within:ring-sky-500/20' : 'border-slate-700 focus-within:border-sky-400 focus-within:ring-sky-400/30',
        inputBg: isLight ? 'bg-white text-slate-900 placeholder-slate-400' : 'bg-slate-950 text-slate-100 placeholder-slate-500',
      };
    }

    // Default: 'amber' (Openbox standard)
    return {
      prefixBg: isLight ? 'bg-amber-100 text-amber-950 border-amber-300' : 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      prefixIcon: isLight ? 'text-amber-700' : 'text-amber-400',
      containerBorder: isValid
        ? isLight ? 'border-emerald-500 ring-emerald-500/20' : 'border-emerald-500/80 ring-emerald-500/20'
        : hasError
        ? isLight ? 'border-rose-500 ring-rose-500/20' : 'border-rose-500/80 ring-rose-500/20'
        : isLight ? 'border-amber-400 focus-within:border-amber-600 focus-within:ring-amber-500/20' : 'border-amber-500/50 focus-within:border-amber-400 focus-within:ring-amber-400/30',
      inputBg: isLight ? 'bg-white text-slate-900 placeholder-slate-400' : 'bg-slate-950 text-amber-100 placeholder-amber-500/30',
    };
  };

  const styles = getVariantStyles();
  const heightClass = size === 'sm' ? 'h-[34px]' : 'h-[38px]';

  return (
    <div className={`space-y-1 ${className}`}>
      <div 
        className={`flex items-stretch rounded-lg border transition-all focus-within:ring-2 focus-within:ring-offset-0 overflow-hidden ${styles.containerBorder} ${heightClass} ${
          isLight ? 'shadow-2xs' : ''
        }`}
      >
        {/* Badge numérico de 4 dígitos (sem STI) */}
        <div 
          className={`flex items-center gap-1 px-2.5 border-r font-mono font-bold text-xs select-none shrink-0 ${styles.prefixBg}`}
          title="Código numérico de 4 dígitos"
        >
          <Hash className={`w-3.5 h-3.5 ${styles.prefixIcon}`} />
          <span className="font-mono text-[11px] tracking-wider">#</span>
        </div>

        {/* Campo de entrada de 4 dígitos */}
        <div className="relative flex-1 flex items-center min-w-0">
          <input
            id={inputId}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            value={digits}
            onChange={handleDigitsChange}
            onPaste={handlePaste}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            autoFocus={autoFocus}
            required={required}
            disabled={disabled}
            className={`w-full h-full px-3 text-sm font-mono font-bold tracking-widest focus:outline-none transition-colors ${styles.inputBg}`}
          />

          {/* Indicadores de status e botão de limpar */}
          <div className="flex items-center gap-1.5 pr-2.5 shrink-0 pointer-events-auto">
            {digits.length > 0 && (
              <button
                type="button"
                onClick={handleClear}
                tabIndex={-1}
                className={`p-0.5 rounded-full transition-colors cursor-pointer ${
                  isLight ? 'hover:bg-slate-200 text-slate-400 hover:text-slate-700' : 'hover:bg-slate-800 text-slate-500 hover:text-white'
                }`}
                title="Limpar código"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {digits.length === 4 ? (
              <span 
                className="flex items-center gap-1 text-[10px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 rounded select-none"
                title="Código completo com 4 números"
              >
                <Check className="w-3 h-3 stroke-[3]" />
                <span>4/4</span>
              </span>
            ) : digits.length > 0 ? (
              <span 
                className="text-[10px] font-mono font-bold text-amber-600 dark:text-amber-400/90 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded select-none"
                title={`${digits.length} de 4 dígitos preenchidos`}
              >
                {digits.length}/4
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {showHelper && (
        <div className="flex items-center justify-between text-[10.5px]">
          <span className={`${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            Digite apenas os <strong className="font-semibold">4 números</strong> do código (Ex: <span className="font-mono">{placeholder}</span>).
          </span>
          {digits.length > 0 && (
            <span className="font-mono font-bold text-sky-600 dark:text-sky-400">
              #{digits}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
