import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Edit3, Eraser, Trash2, X, Sparkles, Square, ArrowRight } from 'lucide-react';

export type DrawingTool = 'pen' | 'highlighter' | 'rectangle' | 'arrow' | 'eraser';

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
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const snapshotRef = useRef<ImageData | null>(null);

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

  // Função para desenhar seta estilizada com ponta moderna preenchida
  const drawStylizedArrow = (
    ctx: CanvasRenderingContext2D,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    color: string,
    width: number
  ) => {
    const angle = Math.atan2(toY - fromY, toX - fromX);
    const distance = Math.hypot(toX - fromX, toY - fromY);
    if (distance < 3) return;

    // Tamanho proporcional da ponta da seta
    const headLength = Math.max(width * 2.8, 16);
    const headAngle = Math.PI / 6; // 30 graus

    // Coordenadas das barbatanas da ponta
    const x1 = toX - headLength * Math.cos(angle - headAngle);
    const y1 = toY - headLength * Math.sin(angle - headAngle);
    const x2 = toX - headLength * Math.cos(angle + headAngle);
    const y2 = toY - headLength * Math.sin(angle + headAngle);

    // Ponto central de encaixe recortado (design moderno e pontiagudo)
    const xCenter = toX - headLength * 0.7 * Math.cos(angle);
    const yCenter = toY - headLength * 0.7 * Math.sin(angle);

    // Desenha a haste da seta
    ctx.beginPath();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = color;
    ctx.globalAlpha = 1.0;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(xCenter, yCenter);
    ctx.stroke();

    // Desenha a ponta estilo flecha/ponteiro preenchida
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(x1, y1);
    ctx.lineTo(xCenter, yCenter);
    ctx.lineTo(x2, y2);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.globalAlpha = 1.0;
    ctx.fill();
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
    startPointRef.current = coords;
    lastPointRef.current = coords;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (selectedTool === 'rectangle' || selectedTool === 'arrow') {
      // Salva snapshot do canvas antes de arrastar a forma
      snapshotRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } else {
      snapshotRef.current = null;
      // Desenha um ponto inicial
      drawPoint(coords.x, coords.y);
    }
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

    if (selectedTool === 'rectangle') {
      if (!snapshotRef.current || !startPointRef.current) return;
      // Restaura o canvas para o estado antes de arrastar
      ctx.putImageData(snapshotRef.current, 0, 0);

      const x = Math.min(startPointRef.current.x, coords.x);
      const y = Math.min(startPointRef.current.y, coords.y);
      const w = Math.abs(coords.x - startPointRef.current.x);
      const h = Math.abs(coords.y - startPointRef.current.y);

      ctx.beginPath();
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = selectedColor;
      ctx.globalAlpha = 1.0;
      ctx.lineWidth = strokeSize;
      ctx.lineCap = 'square';
      ctx.lineJoin = 'miter';
      ctx.strokeRect(x, y, w, h);
    } else if (selectedTool === 'arrow') {
      if (!snapshotRef.current || !startPointRef.current) return;
      // Restaura o canvas para o estado antes de arrastar
      ctx.putImageData(snapshotRef.current, 0, 0);

      drawStylizedArrow(
        ctx,
        startPointRef.current.x,
        startPointRef.current.y,
        coords.x,
        coords.y,
        selectedColor,
        strokeSize
      );
    } else {
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
    }
  };

  const stopDrawing = () => {
    if (isDrawingRef.current) {
      isDrawingRef.current = false;
      lastPointRef.current = null;
      startPointRef.current = null;
      snapshotRef.current = null;
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

              {/* Ferramentas: Caneta / Marca-Texto / Retângulo / Seta / Borracha */}
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
                  onClick={() => setSelectedTool('rectangle')}
                  className={`p-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                    selectedTool === 'rectangle' ? 'bg-cyan-500 text-slate-950 font-black shadow-md' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                  title="Retângulo Vazado (Destacar e emoldurar áreas)"
                >
                  <Square className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Retângulo</span>
                </button>

                <button
                  onClick={() => setSelectedTool('arrow')}
                  className={`p-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                    selectedTool === 'arrow' ? 'bg-emerald-500 text-slate-950 font-black shadow-md' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                  title="Seta Estilizada (Apontar para tópicos e itens importantes)"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Seta</span>
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
