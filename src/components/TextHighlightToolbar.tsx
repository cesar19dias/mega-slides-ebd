import React from 'react';
import { X } from 'lucide-react';

export const HIGHLIGHT_COLORS = [
  { name: 'Amarelo', hex: '#facc15', textDark: true },
  { name: 'Laranja', hex: '#fb923c', textDark: true },
  { name: 'Vermelho', hex: '#f87171', textDark: false },
  { name: 'Verde', hex: '#4ade80', textDark: true },
  { name: 'Azul', hex: '#60a5fa', textDark: false },
  { name: 'Roxo', hex: '#c084fc', textDark: false },
];

interface TextHighlightToolbarProps {
  x: number;
  y: number;
  onApply: (color: string, style: 'fill' | 'outline') => void;
  onRemove: () => void;
  onClose: () => void;
}

export const TextHighlightToolbar: React.FC<TextHighlightToolbarProps> = ({
  x,
  y,
  onApply,
  onRemove,
  onClose,
}) => {
  return (
    <div
      style={{
        position: 'fixed',
        left: x,
        top: y + 12,
        transform: 'translateX(-50%)',
        zIndex: 99999,
      }}
      className="flex flex-col gap-1.5 bg-slate-900/97 backdrop-blur-md border border-slate-600/80 rounded-2xl px-3 py-2.5 shadow-2xl min-w-max"
      onMouseDown={(e) => e.preventDefault()}
      onTouchStart={(e) => e.preventDefault()}
    >
      {/* Caret / seta apontando para CIMA (toolbar está abaixo da seleção) */}
      <div
        style={{
          position: 'absolute',
          top: -6,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 12,
          height: 6,
          background: 'rgb(15 23 42 / 0.97)',
          clipPath: 'polygon(50% 0, 100% 100%, 0 100%)',
        }}
      />

      {/* Linha 1 — Preenchido */}
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest w-16 shrink-0 select-none">
          🖍 Cheio
        </span>
        {HIGHLIGHT_COLORS.map((c) => (
          <button
            key={`fill-${c.hex}`}
            title={`${c.name} — preenchido`}
            onClick={() => onApply(c.hex, 'fill')}
            className="w-5 h-5 rounded-sm transition-transform hover:scale-125 ring-2 ring-transparent hover:ring-white/70 flex-shrink-0"
            style={{ background: c.hex }}
          />
        ))}
        <div className="w-px h-4 bg-slate-700 mx-0.5" />
        <button
          title="Remover destaque"
          onClick={onRemove}
          className="w-5 h-5 rounded bg-slate-700 hover:bg-rose-600 flex items-center justify-center transition-colors text-slate-400 hover:text-white flex-shrink-0"
        >
          <X className="w-3 h-3" />
        </button>
        <button
          title="Fechar"
          onClick={onClose}
          className="w-4 h-4 rounded bg-slate-800 hover:bg-slate-600 flex items-center justify-center transition-colors text-slate-600 hover:text-white flex-shrink-0"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      </div>

      {/* Divider */}
      <div className="w-full border-t border-slate-700/80" />

      {/* Linha 2 — Só contorno */}
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest w-16 shrink-0 select-none">
          ⬜ Contorno
        </span>
        {HIGHLIGHT_COLORS.map((c) => (
          <button
            key={`outline-${c.hex}`}
            title={`${c.name} — contorno`}
            onClick={() => onApply(c.hex, 'outline')}
            className="w-5 h-5 rounded-sm transition-transform hover:scale-125 flex-shrink-0"
            style={{
              background: 'transparent',
              border: `2px solid ${c.hex}`,
              boxSizing: 'border-box',
            }}
          />
        ))}
        {/* spacers to align with row 1 */}
        <div className="w-px h-4 bg-slate-700 mx-0.5 opacity-0" />
        <div className="w-5 h-5 opacity-0 flex-shrink-0" />
        <div className="w-4 h-4 opacity-0 flex-shrink-0" />
      </div>
    </div>
  );
};
