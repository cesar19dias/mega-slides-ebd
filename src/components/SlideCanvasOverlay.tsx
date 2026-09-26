import React, { useRef, useState, useEffect, useCallback } from 'react';

export type DrawingTool = 'pen' | 'highlighter' | 'rectangle' | 'arrow' | 'eraser';

export interface SlideCanvasOverlayProps {
  slideIndex: number;
  isActive?: boolean;
  selectedTool?: DrawingTool;
  selectedColor?: string;
  strokeSize?: number;
  clearTrigger?: number;
  isExporting?: boolean;
}

const LOUSA_STORAGE_KEY = 'mega_ebd_lousa_history';

const getStoredHistory = (): Record<number, string> => {
  try {
    const saved = localStorage.getItem(LOUSA_STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
};

export const SlideCanvasOverlay: React.FC<SlideCanvasOverlayProps> = ({
  slideIndex,
  isActive = false,
  selectedTool = 'pen',
  selectedColor = '#facc15',
  strokeSize = 8,
  clearTrigger = 0,
  isExporting = false,
}) => {
  void isExporting;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const snapshotRef = useRef<ImageData | null>(null);

  // Histórico de marcações persistido por slideIndex
  const [slideHistory, setSlideHistory] = useState<Record<number, string>>(getStoredHistory);

  // Refs para rastrear estado atual e anterior sem causar re-renders desnecessários
  const prevSlideIndexRef = useRef<number>(slideIndex);
  const slideHistoryRef = useRef<Record<number, string>>(slideHistory);

  // Mantém slideHistoryRef sempre sincronizado
  useEffect(() => {
    slideHistoryRef.current = slideHistory;
  }, [slideHistory]);

  // Salva o canvas atual para o slide fornecido
  const saveCurrentSlideCanvas = useCallback((targetIndex: number) => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0 || canvas.height === 0) return;

    try {
      const dataUrl = canvas.toDataURL();
      setSlideHistory(prev => {
        const next = { ...prev, [targetIndex]: dataUrl };
        slideHistoryRef.current = next;
        try {
          localStorage.setItem(LOUSA_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignora cota de localStorage excedida
        }
        return next;
      });
    } catch {
      // ignora erro de canvas
    }
  }, []);

  // Redimensiona o canvas para ajustar perfeitamente ao tamanho total (incluindo scrollHeight) do elemento pai
  const syncCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const parentRect = parent.getBoundingClientRect();
    if (parentRect.width === 0 || parentRect.height === 0) return;

    const targetWidth = parent.clientWidth || Math.round(parentRect.width);
    const targetHeight = Math.max(parent.scrollHeight, parent.clientHeight, Math.round(parentRect.height));

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      const tempUrl = canvas.toDataURL();
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      if (tempUrl && tempUrl !== 'data:,') {
        const img = new Image();
        img.onload = () => {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          }
        };
        img.src = tempUrl;
      }
    }
  }, []);

  useEffect(() => {
    syncCanvasSize();
    window.addEventListener('resize', syncCanvasSize);
    return () => window.removeEventListener('resize', syncCanvasSize);
  }, [syncCanvasSize]);

  // Renderiza a imagem salva no canvas
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const savedData = slideHistoryRef.current[slideIndex];
    if (!savedData) return;

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = savedData;
  }, [slideIndex]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Restaura o desenho salvo ao trocar de slide e salva o slide anterior
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const prevIndex = prevSlideIndexRef.current;

    // Se o índice do slide realmente mudou
    if (prevIndex !== slideIndex) {
      // 1. Salva a tela do slide anterior antes de trocar
      const currentCanvasData = canvas.toDataURL();
      if (currentCanvasData && currentCanvasData !== 'data:,') {
        const next = { ...slideHistoryRef.current, [prevIndex]: currentCanvasData };
        slideHistoryRef.current = next;
        setSlideHistory(next);
        try {
          localStorage.setItem(LOUSA_STORAGE_KEY, JSON.stringify(next));
        } catch {}
      }

      // Atualiza a referência para o novo slideIndex
      prevSlideIndexRef.current = slideIndex;
    }

    renderCanvas();
  }, [slideIndex, renderCanvas]);

  const handleClearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    setSlideHistory(prev => {
      const next = { ...prev };
      delete next[slideIndex];
      slideHistoryRef.current = next;
      try {
        localStorage.setItem(LOUSA_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, [slideIndex]);

  // Responde ao gatilho de limpeza externa
  useEffect(() => {
    if (clearTrigger > 0) {
      handleClearCanvas();
    }
  }, [clearTrigger, handleClearCanvas]);

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

    const headLength = Math.max(width * 2.8, 16);
    const headAngle = Math.PI / 6;

    const x1 = toX - headLength * Math.cos(angle - headAngle);
    const y1 = toY - headLength * Math.sin(angle - headAngle);
    const x2 = toX - headLength * Math.cos(angle + headAngle);
    const y2 = toY - headLength * Math.sin(angle + headAngle);

    const xCenter = toX - headLength * 0.7 * Math.cos(angle);
    const yCenter = toY - headLength * 0.7 * Math.sin(angle);

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
      snapshotRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } else {
      snapshotRef.current = null;
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
      saveCurrentSlideCanvas(slideIndex);
    }
  };

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={startDrawing}
      onMouseMove={drawMove}
      onMouseUp={stopDrawing}
      onMouseLeave={stopDrawing}
      onTouchStart={startDrawing}
      onTouchMove={drawMove}
      onTouchEnd={stopDrawing}
      className={`absolute top-0 left-0 w-full ${
        isActive ? 'z-30 cursor-crosshair touch-none pointer-events-auto' : 'z-20 pointer-events-none'
      }`}
      style={{
        height: canvasRef.current?.height ? `${canvasRef.current.height}px` : '100%',
      }}
    />
  );
};
