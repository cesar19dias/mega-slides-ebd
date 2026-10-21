import React, { useState } from 'react';
import { Copy, X, Eraser, Check } from 'lucide-react';

export interface HighlightColor {
  name: string;
  hex: string;
  textDark?: boolean;
}

export const HIGHLIGHT_COLORS: HighlightColor[] = [
  { name: 'Preto', hex: '#000000', textDark: false },
  { name: 'Branco', hex: '#ffffff', textDark: true },
  { name: 'Amarelo', hex: '#ffe600', textDark: true },
  { name: 'Dourado', hex: '#f59e0b', textDark: true },
  { name: 'Laranja', hex: '#ff6b00', textDark: true },
  { name: 'Vermelho', hex: '#ef4444', textDark: false },
  { name: 'Rosa Choque', hex: '#ff2a6d', textDark: false },
  { name: 'Verde', hex: '#22c55e', textDark: true },
  { name: 'Ciano', hex: '#00e5ff', textDark: true },
  { name: 'Azul Celeste', hex: '#00a2ff', textDark: false },
  { name: 'Roxo', hex: '#a855f7', textDark: false },
];

export interface TextHighlightToolbarProps {
  x: number;
  y: number;
  selectedText?: string;
  onApply: (color: string, style: 'fill' | 'outline' | 'text', opacity?: number) => void;
  onRemove: () => void;
  onClose: () => void;
  onClearSlide?: () => void;
}

export const TextHighlightToolbar: React.FC<TextHighlightToolbarProps> = ({
  x,
  y,
  selectedText,
  onApply,
  onRemove,
  onClose,
  onClearSlide,
}) => {
  const [copied, setCopied] = useState(false);
  const [fillOpacity, setFillOpacity] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('mega_ebd_hl_fill_opacity');
      return saved ? parseInt(saved, 10) : 75;
    } catch {
      return 75;
    }
  });

  const handleCopy = async () => {
    if (selectedText) {
      try {
        await navigator.clipboard.writeText(selectedText);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    }
  };

  // Posicionamento inteligente na viewport
  const clampedX = Math.max(220, Math.min(window.innerWidth - 220, x));
  const isNearTop = y < 150;
  const topPos = isNearTop ? y + 20 : Math.max(20, y - 115);

  return (
    <div
      style={{
        position: 'fixed',
        left: clampedX,
        top: topPos,
        transform: 'translateX(-50%)',
        zIndex: 99999,
      }}
      className="flex flex-col gap-2.5 bg-[#090e17]/97 backdrop-blur-xl border border-slate-700/80 rounded-2xl px-4 py-3 shadow-2xl shadow-black/90 min-w-max select-none animate-in fade-in zoom-in-95 duration-150 pointer-events-auto"
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      {/* Seta indicadora apontando para a seleção */}
      <div
        style={{
          position: 'absolute',
          [isNearTop ? 'top' : 'bottom']: -6,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 14,
          height: 6,
          background: 'rgb(9 14 23 / 0.97)',
          clipPath: isNearTop ? 'polygon(50% 0, 100% 100%, 0 100%)' : 'polygon(0 0, 100% 0, 50% 100%)',
        }}
      />

      {/* ── LINHA 1: COR DA LETRA (20% MAIOR) ── */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-black text-amber-400 uppercase tracking-widest w-18 shrink-0 flex items-center gap-1">
          <span>🔤</span>
          <span>Letra</span>
        </span>

        <div className="flex items-center gap-1.5">
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={`text-${c.hex}`}
              type="button"
              title={`Mudar cor da letra para ${c.name}`}
              onClick={() => onApply(c.hex, 'text')}
              className="w-7 h-7 rounded-lg transition-transform hover:scale-120 active:scale-95 flex items-center justify-center font-black text-xs shrink-0 border border-slate-700/80 hover:border-white shadow-sm cursor-pointer"
              style={{ background: '#0f172a', color: c.hex }}
            >
              A
            </button>
          ))}
        </div>

        <div className="w-px h-6 bg-slate-700/80 mx-1 shrink-0" />

        {/* Botão Copiar */}
        {selectedText && (
          <button
            type="button"
            title="Copiar texto selecionado"
            onClick={handleCopy}
            className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-all text-slate-300 hover:text-white shrink-0 cursor-pointer border border-slate-700"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        )}

        {/* Botão Borracha (Remover estilo do trecho) */}
        <button
          type="button"
          title="Remover cor e destaque deste trecho"
          onClick={onRemove}
          className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-rose-900/80 text-slate-300 hover:text-rose-200 flex items-center justify-center transition-all shrink-0 cursor-pointer border border-slate-700 hover:border-rose-500/60"
        >
          <Eraser className="w-3.5 h-3.5" />
        </button>

        {/* Botão Limpar Slide */}
        {onClearSlide && (
          <button
            type="button"
            title="Limpar todas as cores exclusivamente deste slide"
            onClick={onClearSlide}
            className="px-2.5 h-7 rounded-lg bg-rose-950/80 hover:bg-rose-900 text-rose-300 hover:text-white flex items-center gap-1 text-[11px] font-black transition-all shrink-0 border border-rose-500/60 cursor-pointer"
          >
            <span>Limpar</span>
          </button>
        )}

        {/* Fechar */}
        <button
          type="button"
          title="Fechar barra"
          onClick={onClose}
          className="w-6 h-6 rounded-md bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-all text-slate-400 hover:text-white shrink-0 cursor-pointer ml-1"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Divisor */}
      <div className="w-full border-t border-slate-800" />

      {/* ── LINHA 2: COR DO FUNDO / MARCADOR (COM CONTROLE DE TRANSPARÊNCIA) ── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-black text-cyan-400 uppercase tracking-widest flex items-center gap-1">
            <span>🖍</span>
            <span>Fundo</span>
          </span>

          {/* Slider de Transparência / Opacidade */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700/80 px-2 py-0.5 rounded-lg">
            <span className="text-[10px] font-bold text-slate-400">Opacidade:</span>
            <input
              type="range"
              min="10"
              max="100"
              step="5"
              value={fillOpacity}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                setFillOpacity(val);
                try { localStorage.setItem('mega_ebd_hl_fill_opacity', String(val)); } catch {}
              }}
              className="w-16 accent-cyan-400 h-1 bg-slate-800 rounded cursor-pointer"
              title="Ajustar opacidade/transparência do fundo marcado"
            />
            <span className="text-[10px] font-mono font-black text-cyan-300 min-w-[28px] text-right">
              {fillOpacity}%
            </span>

            {/* Presets rápidos de transparência */}
            <div className="flex items-center gap-0.5 ml-1 border-l border-slate-700 pl-1">
              {[50, 75, 100].map(pct => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => {
                    setFillOpacity(pct);
                    try { localStorage.setItem('mega_ebd_hl_fill_opacity', String(pct)); } catch {}
                  }}
                  className={`px-1 py-0.2 text-[9px] font-bold rounded cursor-pointer transition-colors ${
                    fillOpacity === pct ? 'bg-cyan-500 text-slate-950 font-black' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={`fill-${c.hex}`}
              type="button"
              title={`Marcar fundo com ${c.name} (${fillOpacity}% opacidade)`}
              onClick={() => onApply(c.hex, 'fill', fillOpacity)}
              className="w-7 h-7 rounded-lg transition-transform hover:scale-120 active:scale-95 ring-2 ring-transparent hover:ring-white/80 shrink-0 border border-slate-700/80 shadow-md cursor-pointer relative overflow-hidden"
              style={{
                background: `linear-gradient(45deg, #1e293b 25%, transparent 25%), linear-gradient(-45deg, #1e293b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1e293b 75%), linear-gradient(-45deg, transparent 75%, #1e293b 75%)`,
                backgroundSize: '8px 8px',
                backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px'
              }}
            >
              <div
                className="w-full h-full"
                style={{
                  backgroundColor: c.hex,
                  opacity: fillOpacity / 100
                }}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
