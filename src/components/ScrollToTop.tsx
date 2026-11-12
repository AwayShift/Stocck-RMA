/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';

export interface ScrollToTopProps {
  /**
   * Distância de rolagem em pixels necessária para o botão aparecer.
   * Padrão aumentado para 1400px (o dobro da margem anterior) para aparecer apenas em rolagens longas.
   */
  threshold?: number;
  /**
   * Posição customizada ou classes adicionais se necessário.
   */
  className?: string;
}

export const ScrollToTop: React.FC<ScrollToTopProps> = ({
  threshold = 1400,
  className = ''
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const checkScrollPosition = () => {
      const scrollY = 
        window.pageYOffset || 
        document.documentElement.scrollTop || 
        document.body.scrollTop || 
        0;

      if (scrollY > threshold) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    // Checa posição inicial
    checkScrollPosition();

    window.addEventListener('scroll', checkScrollPosition, { passive: true });
    return () => {
      window.removeEventListener('scroll', checkScrollPosition);
    };
  }, [threshold]);

  const handleScrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  return (
    <button
      type="button"
      onClick={handleScrollToTop}
      className={`fixed bottom-6 right-6 z-40 flex items-center gap-1.5 px-3 py-2 rounded-full bg-slate-900/85 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700/80 hover:border-slate-500 shadow-lg shadow-black/40 transition-all duration-300 ease-out cursor-pointer group backdrop-blur-md active:scale-95 ${
        isVisible
          ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto'
          : 'opacity-0 translate-y-4 scale-90 pointer-events-none'
      } ${className}`}
      title="Retornar ao topo da página"
      aria-label="Voltar ao topo da página"
      id="btn-scroll-to-top"
    >
      <ArrowUp className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-200 group-hover:-translate-y-0.5 transition-transform duration-200 shrink-0" />
      <span className="text-xs font-medium text-slate-300 group-hover:text-slate-100 select-none">Topo</span>
    </button>
  );
};
