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
      const tempUrl = canvas.toDataURL();
      canvas.width = rect.width;
      canvas.height = rect.height;

      const img = new Image();
      img.onload = () => {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.drawImage(img, 0, 0);
      };
      img.src = tempUrl;
    }
  }, []);

  useEffect(() => {
    syncCanvasSize();
    window.addEventListener('resize', syncCanvasSize);
    return () => window.removeEventListener('resize', syncCanvasSize);
  }, [syncCanvasSize]);

  // Restaura o desenho salvo ao trocar de slide
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

  const saveCurrentSlideCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL();
    setSlideHistory(prev => ({ ...prev, [slideIndex]: dataUrl }));
  };

  const handleClearCanvas = useCallback(() => {
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
      saveCurrentSlideCanvas();
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
      className={`absolute inset-0 w-full h-full rounded-3xl ${
        isActive ? 'z-30 cursor-crosshair touch-none pointer-events-auto' : 'z-20 pointer-events-none'
      }`}
    />
  );
};
