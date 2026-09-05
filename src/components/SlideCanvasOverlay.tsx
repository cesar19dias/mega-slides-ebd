import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Edit3, Eraser, Trash2, X, Sparkles } from 'lucide-react';

export type DrawingTool = 'pen' | 'highlighter' | 'eraser';

interface SlideCanvasOverlayProps {
  slideIndex: number;
  isExporting?: boolean;
}

const COLORS = [
  { name: 'Amarelo Neon', hex: '#facc15' },
  { name: 'Ciano', hex: '#06b6d4' },
  { name: 'Vermelho', hex: '#ef4444' },
  { name: 'Verde Neon', hex: '#22c55e' },
  { name: 'Branco', hex: '#ffffff' },
];

const STROKE_SIZES = [
  { name: 'Fino', val: 4 },
  { name: 'Médio', val: 8 },
  { name: 'Grosso', val: 16 },
];

export const SlideCanvasOverlay: React.FC<SlideCanvasOverlayProps> = ({
  slideIndex,
  isExporting = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const [isActive, setIsActive] = useState(false);
  const [selectedTool, setSelectedTool] = useState<DrawingTool>('pen');
  const [selectedColor, setSelectedColor] = useState('#facc15');
  const [strokeSize, setStrokeSize] = useState(8);

  // Armazena histórico de desenhos indexado pelo slideIndex
  const [slideHistory, setSlideHistory] = useState<Record<number, string>>({});

  // Redimensiona o canvas para bater exatamente com a largura/altura real do contêiner
  const syncCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const rect = parent.getBoundingClientRect();
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
      // Salva a imagem atual antes de redimensionar
      const tempUrl = canvas.toDataURL();
      canvas.width = rect.width;
      canvas.height = rect.height;

      // Restaura a imagem salva
      const img = new Image();
      img.onload = () => {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.drawImage(img, 0, 0);
      };
      img.src = tempUrl;
    }
  }, []);

  // Sincroniza tamanho do canvas ao carregar ou mudar o tamanho da janela
  useEffect(() => {
    syncCanvasSize();
    window.addEventListener('resize', syncCanvasSize);
    return () => window.removeEventListener('resize', syncCanvasSize);
  }, [syncCanvasSize]);

  // Carrega / Restaura o desenho salvo ao trocar de slide
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const savedData = slideHistory[slideIndex];
    if (savedData) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
      };
      img.src = savedData;
    }
  }, [slideIndex, slideHistory]);

  // Salva estado do canvas para o slide atual
  const saveCurrentSlideCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL();
    setSlideHistory(prev => ({ ...prev, [slideIndex]: dataUrl }));
  };

  // Limpa o canvas do slide atual
  const handleClearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSlideHistory(prev => {
      const next = { ...prev };
      delete next[slideIndex];
      return next;
    });
  };

  // Coordenadas relativas do evento (mouse ou touch)
  const getCoordinates = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();

    let clientX = 0;
    let clientY = 0;

    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('clientX' in e) {
      clientX = (e as MouseEvent).clientX;
      clientY = (e as MouseEvent).clientY;
    } else {
      return null;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isActive) return;
    // Evita scroll da tela no tablet/celular enquanto desenha
    if ('touches' in e) {
      e.stopPropagation();
    }

    const coords = getCoordinates(e);
    if (!coords) return;

    isDrawingRef.current = true;
    lastPointRef.current = coords;

    // Desenha um ponto inicial
    drawPoint(coords.x, coords.y);
  };

  const drawPoint = (x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    ctx.lineCap = selectedTool === 'highlighter' ? 'square' : 'round';
    ctx.lineJoin = 'round';

    if (selectedTool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = strokeSize * 2.5;
    } else if (selectedTool === 'highlighter') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = selectedColor;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = strokeSize * 2.2;
    } else {
      // Pen
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = selectedColor;
      ctx.globalAlpha = 1.0;
      ctx.lineWidth = strokeSize;
    }

    ctx.moveTo(x, y);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const drawMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isActive || !isDrawingRef.current) return;
    if ('touches' in e) {
      e.stopPropagation();
    }

    const coords = getCoordinates(e);
    if (!coords || !lastPointRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    ctx.lineCap = selectedTool === 'highlighter' ? 'square' : 'round';
    ctx.lineJoin = 'round';

    if (selectedTool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = strokeSize * 2.5;
    } else if (selectedTool === 'highlighter') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = selectedColor;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = strokeSize * 2.2;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = selectedColor;
      ctx.globalAlpha = 1.0;
      ctx.lineWidth = strokeSize;
    }

    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();

    lastPointRef.current = coords;
  };

  const stopDrawing = () => {
    if (isDrawingRef.current) {
      isDrawingRef.current = false;
      lastPointRef.current = null;
      saveCurrentSlideCanvas();
    }
  };

  return (
    <>
      {/* ── Tela do Canvas Interativo ── */}
      <canvas
        ref={canvasRef}
        onMouseDown={startDrawing}
        onMouseMove={drawMove}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={drawMove}
        onTouchEnd={stopDrawing}
        className={`absolute inset-0 w-full h-full ${
          isActive ? 'z-30 cursor-crosshair touch-none pointer-events-auto' : 'z-20 pointer-events-none'
        }`}
      />

      {/* ── Painel Flutuante da Lousa Interativa (Oculto em Exportações) ── */}
      {!isExporting && (
        <div className="absolute top-3 right-3 z-50 flex items-center gap-2 font-['Gotham']">
          {!isActive ? (
            <button
              onClick={() => setIsActive(true)}
              className="bg-slate-900/95 hover:bg-slate-800 text-yellow-400 border border-yellow-500/50 px-3.5 py-2 rounded-2xl flex items-center gap-2 text-xs font-black shadow-2xl backdrop-blur-md transition-all hover:scale-105 cursor-pointer"
              title="Ativar Lousa Interativa (Desenhar / Anotar no Slide)"
            >
              <Edit3 className="w-4 h-4 text-yellow-400" />
              <span>✏️ Lousa Interativa</span>
            </button>
          ) : (
            <div className="bg-slate-950/95 border border-purple-500/60 p-2.5 rounded-2xl shadow-2xl backdrop-blur-xl flex flex-wrap items-center gap-3 animate-in fade-in zoom-in duration-200">
              {/* Status Lousa Ativa */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-purple-900/40 border border-purple-500/40 text-purple-300 text-[11px] font-bold">
                <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                <span>Lousa Ativa</span>
              </div>

              {/* Ferramentas: Caneta / Marca-Texto / Borracha */}
              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                <button
                  onClick={() => setSelectedTool('pen')}
                  className={`p-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                    selectedTool === 'pen' ? 'bg-yellow-500 text-slate-950 font-black shadow-md' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                  title="Caneta (Desenho Livre)"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Caneta</span>
                </button>

                <button
                  onClick={() => setSelectedTool('highlighter')}
                  className={`p-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                    selectedTool === 'highlighter' ? 'bg-amber-400 text-slate-950 font-black shadow-md' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                  title="Marca-Texto (Grifar trechos de texto)"
                >
                  <span className="text-sm">🖍️</span>
                  <span className="hidden sm:inline">Grifar</span>
                </button>

                <button
                  onClick={() => setSelectedTool('eraser')}
                  className={`p-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                    selectedTool === 'eraser' ? 'bg-rose-600 text-white font-black shadow-md' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                  title="Borracha"
                >
                  <Eraser className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Borracha</span>
                </button>
              </div>

              {/* Paleta de Cores */}
              {selectedTool !== 'eraser' && (
                <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                  {COLORS.map(c => (
                    <button
                      key={c.hex}
                      onClick={() => setSelectedColor(c.hex)}
                      className={`w-5 h-5 rounded-full transition-transform cursor-pointer border border-white/20 ${
                        selectedColor === c.hex ? 'scale-125 ring-2 ring-white shadow-lg' : 'hover:scale-110 opacity-80'
                      }`}
                      style={{ backgroundColor: c.hex }}
                      title={c.name}
                    />
                  ))}
                </div>
              )}

              {/* Espessura do Traço */}
              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                {STROKE_SIZES.map(s => (
                  <button
                    key={s.val}
                    onClick={() => setStrokeSize(s.val)}
                    className={`px-2 py-0.5 text-[10px] font-extrabold rounded-md transition-all cursor-pointer ${
                      strokeSize === s.val ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>

              {/* Limpar Slide Atual */}
              <button
                onClick={handleClearCanvas}
                className="bg-slate-900 hover:bg-red-900/60 text-red-300 border border-red-500/40 p-1.5 rounded-xl transition-all cursor-pointer"
                title="Limpar todos os desenhos deste slide"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
              </button>

              {/* Fechar / Desativar Lousa */}
              <button
                onClick={() => setIsActive(false)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-1.5 rounded-xl transition-all cursor-pointer border border-slate-700"
                title="Concluir e Desativar Lousa"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
};
