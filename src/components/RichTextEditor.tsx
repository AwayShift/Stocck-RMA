import React, { useRef, useEffect, useState } from 'react';
import { 
  Bold, 
  Italic, 
  Underline, 
  Strikethrough, 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  AlignJustify,
  List, 
  ListOrdered, 
  Minus, 
  Palette, 
  Highlighter, 
  RemoveFormatting, 
  Trash2,
  Indent,
  Outdent,
  Type
} from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: string;
  maxHeight?: string;
  id?: string;
  label?: string;
}

const PRESET_TEXT_COLORS = [
  { name: 'Branco', color: '#f8fafc' },
  { name: 'Cinza', color: '#94a3b8' },
  { name: 'Azul', color: '#38bdf8' },
  { name: 'Verde', color: '#34d399' },
  { name: 'Amarelo', color: '#fbbf24' },
  { name: 'Vermelho', color: '#f43f5e' },
  { name: 'Roxo', color: '#c084fc' },
];

const PRESET_BG_COLORS = [
  { name: 'Transparente', color: 'transparent' },
  { name: 'Amarelo Claro', color: '#713f12' },
  { name: 'Verde Escuro', color: '#064e3b' },
  { name: 'Vermelho Escuro', color: '#881337' },
  { name: 'Azul Escuro', color: '#0c4a6e' },
];

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  placeholder = 'Insira o texto...',
  minHeight = '150px',
  maxHeight = '300px',
  id = 'rich-text-editor',
  label,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [currentBlock, setCurrentBlock] = useState('p');

  // Sync state with editor DOM
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || '';
    }
  }, [value]);

  const exec = (command: string, value: string | undefined = undefined) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, value);
    onChange(editorRef.current.innerHTML);
  };

  const handleBlockChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setCurrentBlock(val);
    if (val === 'p' || val === 'h1' || val === 'h2' || val === 'h3' || val === 'pre') {
      exec('formatBlock', `<${val}>`);
    } else if (val === 'small') {
      exec('fontSize', '2');
    } else if (val === 'large') {
      exec('fontSize', '5');
    }
  };

  const handleClearAll = () => {
    onChange('');
    if (editorRef.current) {
      editorRef.current.innerHTML = '';
    }
  };

  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
          {label}
        </label>
      )}

      <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        {/* Toolbar */}
        <div className="bg-slate-900 border-b border-slate-800 p-2 flex items-center gap-1 flex-wrap text-xs select-none">
          {/* Style / Size Dropdown */}
          <div className="flex items-center gap-1 mr-1 border-r border-slate-800 pr-2">
            <Type className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={currentBlock}
              onChange={handleBlockChange}
              className="bg-slate-950 border border-slate-800 text-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-sky-500 cursor-pointer"
            >
              <option value="p">Texto Normal</option>
              <option value="small">Texto Pequeno</option>
              <option value="large">Texto Grande</option>
              <option value="h1">Título 1 (H1)</option>
              <option value="h2">Título 2 (H2)</option>
              <option value="h3">Título 3 (H3)</option>
              <option value="pre">Código / Monospaced</option>
            </select>
          </div>

          {/* Basic Text Formatting */}
          <div className="flex items-center gap-0.5 border-r border-slate-800 pr-1.5">
            <button
              type="button"
              onClick={() => exec('bold')}
              className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded cursor-pointer transition-colors"
              title="Negrito (Ctrl+B)"
            >
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => exec('italic')}
              className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded cursor-pointer transition-colors"
              title="Itálico (Ctrl+I)"
            >
              <Italic className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => exec('underline')}
              className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded cursor-pointer transition-colors"
              title="Sublinhado (Ctrl+U)"
            >
              <Underline className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => exec('strikeThrough')}
              className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded cursor-pointer transition-colors"
              title="Tachado / Riscado"
            >
              <Strikethrough className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Color & Highlight Pickers */}
          <div className="flex items-center gap-1 border-r border-slate-800 pr-1.5 relative">
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowColorPicker(!showColorPicker);
                  setShowBgPicker(false);
                }}
                className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded cursor-pointer transition-colors flex items-center gap-1"
                title="Cor do Texto"
              >
                <Palette className="w-3.5 h-3.5 text-sky-400" />
              </button>
              {showColorPicker && (
                <div className="absolute left-0 top-full mt-1 p-2 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-30 flex gap-1.5">
                  {PRESET_TEXT_COLORS.map(c => (
                    <button
                      key={c.color}
                      type="button"
                      onClick={() => {
                        exec('foreColor', c.color);
                        setShowColorPicker(false);
                      }}
                      className="w-5 h-5 rounded-full border border-slate-600 hover:scale-110 transition-transform cursor-pointer"
                      style={{ backgroundColor: c.color }}
                      title={c.name}
                    />
                  ))}
                  <input
                    type="color"
                    onChange={(e) => {
                      exec('foreColor', e.target.value);
                      setShowColorPicker(false);
                    }}
                    className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
                    title="Cor Personalizada"
                  />
                </div>
              )}
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowBgPicker(!showBgPicker);
                  setShowColorPicker(false);
                }}
                className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded cursor-pointer transition-colors flex items-center gap-1"
                title="Cor de Fundo / Destaque"
              >
                <Highlighter className="w-3.5 h-3.5 text-amber-400" />
              </button>
              {showBgPicker && (
                <div className="absolute left-0 top-full mt-1 p-2 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-30 flex gap-1.5">
                  {PRESET_BG_COLORS.map(c => (
                    <button
                      key={c.color}
                      type="button"
                      onClick={() => {
                        exec('hiliteColor', c.color);
                        setShowBgPicker(false);
                      }}
                      className="w-5 h-5 rounded-full border border-slate-600 hover:scale-110 transition-transform cursor-pointer"
                      style={{ backgroundColor: c.color }}
                      title={c.name}
                    />
                  ))}
                  <input
                    type="color"
                    onChange={(e) => {
                      exec('hiliteColor', e.target.value);
                      setShowBgPicker(false);
                    }}
                    className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
                    title="Cor Personalizada"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Alignment */}
          <div className="flex items-center gap-0.5 border-r border-slate-800 pr-1.5">
            <button
              type="button"
              onClick={() => exec('justifyLeft')}
              className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded cursor-pointer transition-colors"
              title="Alinhar à Esquerda"
            >
              <AlignLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => exec('justifyCenter')}
              className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded cursor-pointer transition-colors"
              title="Centralizar"
            >
              <AlignCenter className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => exec('justifyRight')}
              className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded cursor-pointer transition-colors"
              title="Alinhar à Direita"
            >
              <AlignRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => exec('justifyFull')}
              className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded cursor-pointer transition-colors"
              title="Justificar"
            >
              <AlignJustify className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Lists & Line dividers */}
          <div className="flex items-center gap-0.5 border-r border-slate-800 pr-1.5">
            <button
              type="button"
              onClick={() => exec('insertUnorderedList')}
              className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded cursor-pointer transition-colors"
              title="Lista de Tópicos (•)"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => exec('insertOrderedList')}
              className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded cursor-pointer transition-colors"
              title="Lista Numerada (1.)"
            >
              <ListOrdered className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => exec('insertHorizontalRule')}
              className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded cursor-pointer transition-colors"
              title="Linha Divisória / Separador"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => exec('outdent')}
              className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded cursor-pointer transition-colors"
              title="Diminuir Recuo"
            >
              <Outdent className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => exec('indent')}
              className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded cursor-pointer transition-colors"
              title="Aumentar Recuo"
            >
              <Indent className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Remove format & Clear */}
          <div className="flex items-center gap-1 ml-auto">
            <button
              type="button"
              onClick={() => exec('removeFormat')}
              className="px-2 py-1 bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded border border-slate-800 flex items-center gap-1 cursor-pointer transition-colors text-[11px]"
              title="Limpar Formatação do Texto Selecionado"
            >
              <RemoveFormatting className="w-3 h-3" />
              <span>Sem Formato</span>
            </button>
            <button
              type="button"
              onClick={handleClearAll}
              className="px-2 py-1 bg-slate-950 hover:bg-rose-500/20 text-rose-400 rounded border border-slate-800 flex items-center gap-1 cursor-pointer transition-colors text-[11px] font-medium"
              title="Limpar Todo o Conteúdo"
            >
              <Trash2 className="w-3 h-3" />
              <span>Limpar</span>
            </button>
          </div>
        </div>

        {/* Editable Content Container */}
        <div className="relative">
          <div
            ref={editorRef}
            contentEditable
            onInput={() => {
              if (editorRef.current) {
                onChange(editorRef.current.innerHTML);
              }
            }}
            onBlur={() => {
              if (editorRef.current) {
                onChange(editorRef.current.innerHTML);
              }
            }}
            className="w-full bg-slate-950 p-3.5 text-sm text-slate-100 focus:outline-none overflow-y-auto leading-relaxed"
            style={{
              minHeight,
              maxHeight,
              outline: 'none'
            }}
            id={id}
          />
          {(!value || value === '<br>') && (
            <div className="absolute top-3.5 left-3.5 pointer-events-none text-slate-500 text-sm italic">
              {placeholder}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
