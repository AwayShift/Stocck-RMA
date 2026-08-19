import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  X, 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  Maximize2, 
  Minimize2, 
  Move,
  ChevronLeft,
  ChevronRight,
  ExternalLink
} from 'lucide-react';

interface ImageZoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string | null;
  imageTitle?: string;
  imagesList?: string[];
  currentIndex?: number;
  onNavigate?: (newIndex: number) => void;
}

export const ImageZoomModal: React.FC<ImageZoomModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  imageTitle,
  imagesList = [],
  currentIndex = 0,
  onNavigate,
}) => {
  const [scale, setScale] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);

  // Reset transform whenever the image changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setScale(1);
      setRotation(0);
      setPosition({ x: 0, y: 0 });
      setIsDragging(false);
    }
  }, [isOpen, imageUrl]);

  const handleZoomIn = useCallback(() => {
    setScale(prev => Math.min(prev + 0.4, 5));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale(prev => {
      const next = Math.max(prev - 0.4, 1);
      if (next === 1) setPosition({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const handleReset = useCallback(() => {
    setScale(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  }, []);

  const handleRotate = useCallback(() => {
    setRotation(prev => (prev + 90) % 360);
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        handleZoomIn();
      } else if (e.key === '-' || e.key === '_') {
        handleZoomOut();
      } else if (e.key === '0') {
        handleReset();
      } else if (e.key === 'r' || e.key === 'R') {
        handleRotate();
      } else if (e.key === 'ArrowRight' && imagesList.length > 1 && onNavigate) {
        onNavigate((currentIndex + 1) % imagesList.length);
      } else if (e.key === 'ArrowLeft' && imagesList.length > 1 && onNavigate) {
        onNavigate((currentIndex - 1 + imagesList.length) % imagesList.length);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, imagesList, currentIndex, onNavigate, onClose, handleZoomIn, handleZoomOut, handleReset, handleRotate]);

  // Mouse wheel handler for smooth zooming
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.25 : -0.25;
    setScale(prev => {
      const next = Math.min(Math.max(prev + delta, 1), 5);
      if (next === 1) setPosition({ x: 0, y: 0 });
      return next;
    });
  };

  // Mouse move handler for dragging when zoomed
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging && scale > 1) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1) {
      e.preventDefault();
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleDoubleClick = () => {
    if (scale > 1) {
      handleReset();
    } else {
      setScale(2);
    }
  };

  if (!isOpen || !imageUrl) return null;

  return (
    <div 
      className="fixed inset-0 z-[120] bg-black/92 backdrop-blur-md flex flex-col justify-between select-none animate-in fade-in duration-200"
      id="modal-image-zoom-viewer"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => setIsDragging(false)}
    >
      {/* Top Header Bar */}
      <div className="w-full flex items-center justify-between px-6 py-3 bg-slate-950/80 border-b border-slate-800/80 backdrop-blur-md z-30">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white truncate">
              {imageTitle || 'Visualizador de Imagem'}
            </h3>
            <p className="text-[11px] text-slate-400 flex items-center gap-2">
              <span>Role o mouse ou clique duplo para dar zoom</span>
              {scale > 1 && (
                <>
                  <span>&bull;</span>
                  <span className="text-sky-400">Clique e arraste para mover</span>
                </>
              )}
              {imagesList.length > 1 && (
                <>
                  <span>&bull;</span>
                  <span className="text-sky-400 font-mono font-semibold">
                    {currentIndex + 1} de {imagesList.length}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Action buttons on Top Right */}
        <div className="flex items-center gap-2 shrink-0">
          <a 
            href={imageUrl} 
            target="_blank" 
            rel="noreferrer" 
            className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-slate-800 transition-colors cursor-pointer"
            title="Abrir imagem original em nova aba"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
          <button 
            type="button"
            onClick={onClose}
            className="p-2 bg-slate-900 hover:bg-rose-950/80 hover:text-rose-300 text-slate-300 rounded-xl border border-slate-800 hover:border-rose-500/40 transition-colors cursor-pointer"
            title="Fechar (Esc)"
            id="btn-close-image-zoom"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Center Image Stage (Large screen space: 94vw and 82vh) */}
      <div 
        ref={containerRef}
        onWheel={handleWheel}
        className="w-full flex-1 flex items-center justify-center overflow-hidden relative p-3 sm:p-6"
        style={{ cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
      >
        {/* Navigation Arrows for gallery */}
        {imagesList.length > 1 && onNavigate && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNavigate((currentIndex - 1 + imagesList.length) % imagesList.length);
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-3 rounded-2xl bg-slate-900/80 hover:bg-slate-850 text-white border border-slate-700/60 shadow-2xl backdrop-blur-sm transition-all hover:scale-105 cursor-pointer"
              title="Foto Anterior (Seta Esquerda)"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNavigate((currentIndex + 1) % imagesList.length);
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-3 rounded-2xl bg-slate-900/80 hover:bg-slate-850 text-white border border-slate-700/60 shadow-2xl backdrop-blur-sm transition-all hover:scale-105 cursor-pointer"
              title="Próxima Foto (Seta Direita)"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}

        {/* Base Image Container (Occupies large screen space: up to 94vw and 82vh) */}
        <div 
          className="relative max-w-[94vw] max-h-[82vh] flex items-center justify-center transition-transform duration-100 ease-out"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
          }}
          onMouseDown={handleMouseDown}
          onDoubleClick={handleDoubleClick}
        >
          <img 
            src={imageUrl} 
            alt={imageTitle || 'Visualização ampliada'} 
            className="max-w-[92vw] max-h-[80vh] w-auto h-auto object-contain rounded-xl shadow-2xl border border-slate-800 pointer-events-auto select-none"
            draggable={false}
          />
        </div>
      </div>

      {/* Bottom Floating Controls Bar */}
      <div className="w-full pb-4 px-4 flex justify-center items-center z-30">
        <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-2 px-3 shadow-2xl backdrop-blur-lg flex items-center gap-2 flex-wrap">
          
          {/* Zoom Out */}
          <button 
            type="button"
            onClick={handleZoomOut}
            disabled={scale <= 1}
            className="p-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-slate-300 hover:text-white rounded-xl transition-colors cursor-pointer"
            title="Reduzir Zoom (-)"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          {/* Current Zoom Percent / Reset */}
          <button 
            type="button"
            onClick={handleReset}
            className="px-2.5 py-1 bg-slate-900 hover:bg-slate-850 text-slate-200 rounded-xl font-mono text-xs font-bold transition-colors cursor-pointer min-w-[58px] text-center"
            title="Ajustar à Tela (0)"
          >
            {Math.round(scale * 100)}%
          </button>

          {/* Zoom In */}
          <button 
            type="button"
            onClick={handleZoomIn}
            disabled={scale >= 5}
            className="p-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-slate-300 hover:text-white rounded-xl transition-colors cursor-pointer"
            title="Ampliar Zoom (+)"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <div className="w-px h-5 bg-slate-800" />

          {/* Rotate 90 deg */}
          <button 
            type="button"
            onClick={handleRotate}
            className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl transition-colors cursor-pointer"
            title="Girar Imagem 90° (R)"
          >
            <RotateCw className="w-4 h-4" />
          </button>

          {/* Reset button when modified */}
          {(scale !== 1 || rotation !== 0) && (
            <button 
              type="button"
              onClick={handleReset}
              className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              Resetar
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
