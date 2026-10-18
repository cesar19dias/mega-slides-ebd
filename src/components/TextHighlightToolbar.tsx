import React, { useState } from 'react';
import { Copy, X, Eraser, Check } from 'lucide-react';

export type HighlightStyle = 'fill' | 'outline' | 'text' | 'underline' | 'dotted';

export interface MarkerColor {
  id: string;
  name: string;
  hex: string;
}

export const MARKER_COLORS: MarkerColor[] = [
  { id: 'pink', name: 'Rosa Choque', hex: '#ff2a6d' },
  { id: 'purple', name: 'Roxo / Índigo', hex: '#6366f1' },
  { id: 'blue', name: 'Azul Celeste', hex: '#00a2ff' },
  { id: 'cyan', name: 'Ciano Neon', hex: '#00e5ff' },
  { id: 'teal', name: 'Verde-Água / Teal', hex: '#00b894' },
  { id: 'green', name: 'Verde Claro', hex: '#2ecc71' },
  { id: 'yellow', name: 'Amarelo Sol', hex: '#ffe600' },
  { id: 'amber', name: 'Dourado / Âmbar', hex: '#f59e0b' },
  { id: 'orange', name: 'Laranja Vibrante', hex: '#ff6b00' },
];

export const HIGHLIGHT_COLORS = MARKER_COLORS.map(c => ({
  name: c.name,
  hex: c.hex,
  textDark: c.hex === '#ffe600' || c.hex === '#00e5ff' || c.hex === '#2ecc71'
}));

/**
 * Ícone SVG de Caneta Marca-texto com ponta chanfrada estilizada
 * fiel ao design moderno de aplicativos de leitura bíblica.
 */
export const MarkerPenIcon: React.FC<{
  color: string;
  size?: number;
  className?: string;
  active?: boolean;
}> = ({ color, size = 22, className = '', active = false }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`transition-transform duration-150 shrink-0 ${className} ${active ? 'scale-115 drop-shadow-[0_0_6px_rgba(255,255,255,0.4)]' : 'hover:scale-120'}`}
  >
    {/* Tampa / Topo da caneta */}
    <path
      d="M17.5 2.5C18.3 1.7 19.7 1.7 20.5 2.5L21.5 3.5C22.3 4.3 22.3 5.7 21.5 6.5L16.2 11.8L12.2 7.8L17.5 2.5Z"
      stroke={color}
      strokeWidth="1.8"
      strokeLinejoin="round"
      fill={color}
      fillOpacity={active ? 0.35 : 0.15}
    />
    {/* Corpo do Marcador chanfrado */}
    <path
      d="M12.2 7.8L6.8 13.2C6.4 13.6 6.2 14.2 6.2 14.8V16.8L9.2 16.8C9.8 16.8 10.4 16.6 10.8 16.2L16.2 11.8L12.2 7.8Z"
      stroke={color}
      strokeWidth="1.8"
      strokeLinejoin="round"
      fill={color}
      fillOpacity={0.3}
    />
    {/* Ponta Chanfrada de Marca-texto */}
    <path
      d="M6.2 16.8L3.2 19.8C2.8 20.2 2.8 20.8 3.2 21.2L3.8 21.8C4.2 22.2 4.8 22.2 5.2 21.8L8.2 18.8L6.2 16.8Z"
      fill={color}
      stroke={color}
      strokeWidth="1.2"
    />
    {/* Traço de tinta chanfrado desenhado */}
    <path
      d="M1.5 22.5C2.2 22.5 3.2 22.2 4 21.5"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
    />
  </svg>
);

export interface TextHighlightToolbarProps {
  x: number;
  y: number;
  selectedText?: string;
  onApply: (color: string, style: HighlightStyle) => void;
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
  // Cor ativa do marcador (persistida no localStorage)
  const [activeColor, setActiveColor] = useState<string>(() => {
    try {
      return localStorage.getItem('mega_ebd_active_highlight_color') || '#ffe600';
    } catch {
      return '#ffe600';
    }
  });

  // Estilo ativo (padrão 'fill' para marca-texto)
  const [activeStyle, setActiveStyle] = useState<HighlightStyle>('fill');
  const [copied, setCopied] = useState(false);

  // Salva a cor favorita no localStorage
  const handleSelectColor = (colorHex: string) => {
    setActiveColor(colorHex);
    try {
      localStorage.setItem('mega_ebd_active_highlight_color', colorHex);
    } catch {}
    // Ao clicar na caneta colorida do topo, aplica imediatamente com o estilo ativo!
    onApply(colorHex, activeStyle);
  };

  // Copia o texto selecionado para a área de transferência
  const handleCopy = async () => {
    if (selectedText) {
      try {
        await navigator.clipboard.writeText(selectedText);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        // Fallback para seleção padrão do navegador
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    }
  };

  // Cálculo de posicionamento seguro na viewport
  const clampedX = Math.max(180, Math.min(window.innerWidth - 180, x));
  const isNearTop = y < 140;
  const topPos = isNearTop ? y + 16 : Math.max(20, y - 110);

  return (
    <div
      style={{
        position: 'fixed',
        left: clampedX,
        top: topPos,
        transform: 'translateX(-50%)',
        zIndex: 99999,
      }}
      className="flex flex-col items-center gap-2 select-none animate-in fade-in zoom-in-95 duration-150 pointer-events-auto"
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      {/* ── CAMADA 1: PALETA HORIZONTAL DE CANETAS MARCA-TEXTO ── */}
      <div className="flex items-center gap-2.5 md:gap-3.5 bg-[#090e17]/95 backdrop-blur-xl border border-slate-700/80 rounded-full px-4 py-2 shadow-2xl shadow-black/90">
        {MARKER_COLORS.map((marker) => {
          const isSelected = activeColor === marker.hex;
          return (
            <button
              key={marker.id}
              onClick={() => handleSelectColor(marker.hex)}
              title={`${marker.name} • Clique para marcar`}
              className={`relative flex items-center justify-center p-1 rounded-full transition-all cursor-pointer ${
                isSelected ? 'scale-125' : 'hover:scale-115 opacity-90 hover:opacity-100'
              }`}
            >
              <MarkerPenIcon color={marker.hex} active={isSelected} size={22} />
              {isSelected && (
                <span
                  className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full shadow-[0_0_6px_currentColor]"
                  style={{ backgroundColor: marker.hex, color: marker.hex }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* ── CAMADA 2: MINI-MENU PÍLULA DE AÇÕES E ESTILOS (EXATO AO PRINT) ── */}
      <div className="flex items-center gap-2 bg-[#090e17]/95 backdrop-blur-xl border border-slate-700/80 rounded-full px-3 py-1.5 shadow-2xl shadow-black/90 relative">
        {/* 1. Botão Marca-texto (Fundo preenchido) */}
        <div className="relative group">
          <button
            onClick={() => {
              setActiveStyle('fill');
              onApply(activeColor, 'fill');
            }}
            className={`flex items-center justify-center p-1.5 rounded-full transition-all cursor-pointer ${
              activeStyle === 'fill' ? 'bg-slate-800 ring-1 ring-slate-600' : 'hover:bg-slate-800/80'
            }`}
            title="Marcar texto (fundo colorido)"
          >
            <MarkerPenIcon color={activeColor} active={true} size={21} />
          </button>
          {/* Badge 'Marcar' estilo pill fiel ao print */}
          <div className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 bg-slate-200 text-slate-900 text-[10px] font-black px-2 py-0.5 rounded-full shadow-lg border border-slate-300 pointer-events-none whitespace-nowrap animate-in fade-in duration-100">
            Marcar
          </div>
        </div>

        {/* 2. Botão Sublinhado (U) */}
        <button
          onClick={() => {
            setActiveStyle('underline');
            onApply(activeColor, 'underline');
          }}
          className={`flex flex-col items-center justify-center w-8 h-8 rounded-full transition-all cursor-pointer ${
            activeStyle === 'underline' ? 'bg-slate-800 ring-1 ring-slate-600' : 'hover:bg-slate-800/80'
          }`}
          title="Sublinhar com linha contínua"
        >
          <span className="text-sm font-black text-white leading-none">U</span>
          <span
            className="w-3.5 h-[2.5px] rounded-full mt-0.5"
            style={{ backgroundColor: activeColor }}
          />
        </button>

        {/* 3. Botão Cor da Letra (T) */}
        <button
          onClick={() => {
            setActiveStyle('text');
            onApply(activeColor, 'text');
          }}
          className={`flex items-center justify-center w-8 h-8 rounded-full transition-all cursor-pointer ${
            activeStyle === 'text' ? 'bg-slate-800 ring-1 ring-slate-600' : 'hover:bg-slate-800/80'
          }`}
          title="Mudar apenas a cor das letras"
        >
          <span
            className="text-base font-black leading-none drop-shadow-sm"
            style={{ color: activeColor }}
          >
            T
          </span>
        </button>

        {/* 4. Botão Copiar */}
        <button
          onClick={handleCopy}
          className="flex items-center justify-center w-8 h-8 rounded-full text-slate-300 hover:text-white hover:bg-slate-800/80 transition-all cursor-pointer"
          title="Copiar trecho selecionado"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
        </button>

        {/* 5. Botão Contorno / Sublinhado Tracejado (Pontilhado) */}
        <button
          onClick={() => {
            setActiveStyle('dotted');
            onApply(activeColor, 'dotted');
          }}
          className={`flex items-center justify-center w-8 h-8 rounded-full transition-all cursor-pointer ${
            activeStyle === 'dotted' ? 'bg-slate-800 ring-1 ring-slate-600' : 'hover:bg-slate-800/80'
          }`}
          title="Sublinhado pontilhado / tracejado"
        >
          <div
            className="w-4 h-4 rounded-sm border-2 border-dashed transition-colors"
            style={{ borderColor: activeColor }}
          />
        </button>

        {/* Divisor sutil */}
        <div className="w-px h-4 bg-slate-700/80 mx-0.5" />

        {/* 6. Botão Borracha (Remover Destaque do Trecho) */}
        <button
          onClick={onRemove}
          className="flex items-center justify-center w-8 h-8 rounded-full text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition-all cursor-pointer"
          title="Remover marcação deste trecho"
        >
          <Eraser className="w-4 h-4" />
        </button>

        {/* 7. Limpar Todo o Slide (Opcional) */}
        {onClearSlide && (
          <button
            onClick={onClearSlide}
            className="px-2 py-0.5 rounded-full text-[10px] font-bold text-rose-300 hover:text-white bg-rose-950/60 hover:bg-rose-900 border border-rose-500/40 cursor-pointer transition-colors"
            title="Limpar todas as cores deste slide"
          >
            Limpar
          </button>
        )}

        {/* 8. Botão Fechar */}
        <button
          onClick={onClose}
          className="flex items-center justify-center w-6 h-6 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          title="Fechar"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
