import React, { useRef, useEffect, useState, useCallback } from 'react';

interface SmartTextProps {
  text: string;
  maxFontSize?: number;   // em px
  minFontSize?: number;   // em px
  maxLines?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * SmartText — renderiza texto sem jamais comprimir horizontalmente as letras.
 *
 * Algoritmo:
 *  1. Renderiza com a fonte máxima (maxFontSize).
 *  2. Mede se o conteúdo vazou da caixa (scrollHeight > clientHeight OU scrollWidth > clientWidth).
 *  3. Se vazou, reduz a fonte em 1px e repete.
 *  4. Para quando cabe OU quando atingiu minFontSize.
 *
 * NUNCA usa scaleX, textLength, lengthAdjust ou qualquer compressão horizontal.
 */
export const SmartText: React.FC<SmartTextProps> = ({
  text,
  maxFontSize = 32,
  minFontSize = 10,
  maxLines,
  className = '',
  style = {},
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState(maxFontSize);
  const [ready, setReady] = useState(false);

  const fit = useCallback(() => {
    const el = ref.current;
    if (!el) return;

    // Começa do máximo e vai reduzindo
    let size = maxFontSize;
    el.style.fontSize = `${size}px`;

    const hasOverflow = () => {
      // Verifica transbordamento em qualquer direção
      const overflowsH = el.scrollWidth > el.clientWidth + 1;
      const overflowsV = el.scrollHeight > el.clientHeight + 1;
      return overflowsH || overflowsV;
    };

    // Binário para ser mais rápido (evita loop de 1px em 1px para fonts grandes)
    let lo = minFontSize;
    let hi = maxFontSize;

    while (lo < hi - 1) {
      const mid = Math.floor((lo + hi) / 2);
      el.style.fontSize = `${mid}px`;
      if (hasOverflow()) {
        hi = mid;
      } else {
        lo = mid;
      }
    }

    // Refinamento final linear (±1px)
    size = lo;
    el.style.fontSize = `${size}px`;
    while (size > minFontSize && hasOverflow()) {
      size -= 1;
      el.style.fontSize = `${size}px`;
    }

    setFontSize(size);
    setReady(true);
  }, [maxFontSize, minFontSize]);

  useEffect(() => {
    setReady(false);
    // Aguarda o layout estabilizar antes de medir
    const raf = requestAnimationFrame(() => {
      fit();
    });
    return () => cancelAnimationFrame(raf);
  }, [text, fit]);

  // Re-fit quando o container redimensionar
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(() => {
      setReady(false);
      fit();
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [fit]);

  const lineClampStyle: React.CSSProperties = maxLines
    ? {
        display: '-webkit-box',
        WebkitLineClamp: maxLines,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }
    : {};

  return (
    <div
      ref={ref}
      className={className}
      style={{
        // NUNCA comprimir horizontalmente
        fontStretch: 'normal',
        letterSpacing: 'normal',
        wordSpacing: 'normal',
        whiteSpace: 'normal',
        wordBreak: 'break-word',
        overflowWrap: 'break-word',
        hyphens: 'auto',
        lineHeight: 1.3,
        // Layout
        width: '100%',
        overflow: 'hidden',
        fontSize: `${fontSize}px`,
        opacity: ready ? 1 : 0,
        transition: 'opacity 0.1s',
        ...lineClampStyle,
        ...style,
      }}
    >
      {text}
    </div>
  );
};
