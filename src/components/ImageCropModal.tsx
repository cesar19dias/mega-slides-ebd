import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Crop,
  RotateCw,
  FlipHorizontal,
  Check,
  X,
  Undo2,
  Maximize2,
  Sparkles,
  Square,
  RectangleHorizontal,
  Monitor,
  Smartphone,
} from 'lucide-react';

export type AspectRatioOption = 'free' | '16:9' | '4:3' | '1:1' | '3:2' | '9:16';

interface ImageCropModalProps {
  isOpen: boolean;
  imageUrl: string;
  onClose: () => void;
  onCropComplete: (croppedDataUrl: string) => void;
  title?: string;
  initialAspectRatio?: AspectRatioOption;
}

interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MIN_CROP_SIZE = 28;

const ASPECT_RATIO_VALUES: Record<AspectRatioOption, number | null> = {
  free: null,
  '16:9': 16 / 9,
  '4:3': 4 / 3,
  '1:1': 1,
  '3:2': 3 / 2,
  '9:16': 9 / 16,
};

export const ImageCropModal: React.FC<ImageCropModalProps> = ({
  isOpen,
  imageUrl,
  onClose,
  onCropComplete,
  title = 'Recortar Imagem do Slide',
  initialAspectRatio = '16:9',
}) => {
  const [currentImageUrl, setCurrentImageUrl] = useState<string>(imageUrl);
  const [originalImageUrl, setOriginalImageUrl] = useState<string>(imageUrl);
  const [aspectRatio, setAspectRatio] = useState<AspectRatioOption>(initialAspectRatio);
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, width: 100, height: 100 });
  const [isReady, setIsReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragInfoRef = useRef<{
    type: 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | null;
    startX: number;
    startY: number;
    initialCrop: CropRect;
  }>({
    type: null,
    startX: 0,
    startY: 0,
    initialCrop: { x: 0, y: 0, width: 0, height: 0 },
  });

  // Reset when modal opens or input changes
  useEffect(() => {
    if (isOpen && imageUrl) {
      setCurrentImageUrl(imageUrl);
      setOriginalImageUrl(imageUrl);
      setAspectRatio(initialAspectRatio);
      setIsReady(false);
    }
  }, [isOpen, imageUrl, initialAspectRatio]);

  // Recalculate crop rect according to aspect ratio and displayed image dimensions
  const initCropForAspect = useCallback(
    (ratio: AspectRatioOption, dispW: number, dispH: number) => {
      const numRatio = ASPECT_RATIO_VALUES[ratio];
      if (!numRatio) {
        // Free: use full image or generous 90% box
        return {
          x: 0,
          y: 0,
          width: dispW,
          height: dispH,
        };
      }

      let w = dispW;
      let h = dispW / numRatio;
      if (h > dispH) {
        h = dispH;
        w = dispH * numRatio;
      }

      // Add a tiny padding margin (94%) for great visual framing
      w = Math.max(MIN_CROP_SIZE, Math.floor(w * 0.96));
      h = Math.max(MIN_CROP_SIZE, Math.floor(h * 0.96));

      const x = Math.max(0, Math.floor((dispW - w) / 2));
      const y = Math.max(0, Math.floor((dispH - h) / 2));

      return { x, y, width: w, height: h };
    },
    []
  );

  const handleImageLoad = () => {
    if (!imgRef.current) return;
    const dispW = imgRef.current.clientWidth;
    const dispH = imgRef.current.clientHeight;
    if (dispW > 0 && dispH > 0) {
      setCrop(initCropForAspect(aspectRatio, dispW, dispH));
      setIsReady(true);
    }
  };

  const handleSelectAspectRatio = (ratio: AspectRatioOption) => {
    setAspectRatio(ratio);
    if (!imgRef.current) return;
    const dispW = imgRef.current.clientWidth;
    const dispH = imgRef.current.clientHeight;
    setCrop(initCropForAspect(ratio, dispW, dispH));
  };

  // Rotation clockwise via canvas
  const handleRotate = async () => {
    if (!imgRef.current || isProcessing) return;
    setIsProcessing(true);
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = currentImageUrl;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
      });

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalHeight;
      canvas.height = img.naturalWidth;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((90 * Math.PI) / 180);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

      const rotatedUrl = canvas.toDataURL('image/jpeg', 0.95);
      setIsReady(false);
      setCurrentImageUrl(rotatedUrl);
    } catch (e) {
      console.error('Falha ao girar imagem:', e);
    } finally {
      setIsProcessing(false);
    }
  };

  // Flip horizontal via canvas
  const handleFlipHorizontal = async () => {
    if (!imgRef.current || isProcessing) return;
    setIsProcessing(true);
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = currentImageUrl;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
      });

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0);

      const flippedUrl = canvas.toDataURL('image/jpeg', 0.95);
      setIsReady(false);
      setCurrentImageUrl(flippedUrl);
    } catch (e) {
      console.error('Falha ao espelhar imagem:', e);
    } finally {
      setIsProcessing(false);
    }
  };

  // Reset to original
  const handleReset = () => {
    setIsReady(false);
    setCurrentImageUrl(originalImageUrl);
    setAspectRatio(initialAspectRatio);
  };

  // Drag logic using Pointer Events
  const handlePointerDown = (
    e: React.PointerEvent,
    type: 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w'
  ) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    dragInfoRef.current = {
      type,
      startX: e.clientX,
      startY: e.clientY,
      initialCrop: { ...crop },
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const { type, startX, startY, initialCrop } = dragInfoRef.current;
    if (!type || !imgRef.current) return;

    const dispW = imgRef.current.clientWidth;
    const dispH = imgRef.current.clientHeight;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const numRatio = ASPECT_RATIO_VALUES[aspectRatio];

    let newCrop = { ...initialCrop };

    if (type === 'move') {
      const maxX = Math.max(0, dispW - initialCrop.width);
      const maxY = Math.max(0, dispH - initialCrop.height);
      newCrop.x = Math.max(0, Math.min(maxX, initialCrop.x + dx));
      newCrop.y = Math.max(0, Math.min(maxY, initialCrop.y + dy));
    } else {
      let nx = initialCrop.x;
      let ny = initialCrop.y;
      let nw = initialCrop.width;
      let nh = initialCrop.height;

      if (type.includes('e')) {
        nw = Math.max(MIN_CROP_SIZE, Math.min(dispW - nx, initialCrop.width + dx));
      }
      if (type.includes('s')) {
        nh = Math.max(MIN_CROP_SIZE, Math.min(dispH - ny, initialCrop.height + dy));
      }
      if (type.includes('w')) {
        const potentialW = initialCrop.width - dx;
        if (potentialW >= MIN_CROP_SIZE) {
          const maxLeftShift = initialCrop.x + initialCrop.width - MIN_CROP_SIZE;
          nx = Math.max(0, Math.min(maxLeftShift, initialCrop.x + dx));
          nw = initialCrop.x + initialCrop.width - nx;
        }
      }
      if (type.includes('n')) {
        const potentialH = initialCrop.height - dy;
        if (potentialH >= MIN_CROP_SIZE) {
          const maxTopShift = initialCrop.y + initialCrop.height - MIN_CROP_SIZE;
          ny = Math.max(0, Math.min(maxTopShift, initialCrop.y + dy));
          nh = initialCrop.y + initialCrop.height - ny;
        }
      }

      // If ratio is locked, preserve it
      if (numRatio) {
        if (type === 'se' || type === 'e' || type === 's') {
          nh = nw / numRatio;
          if (ny + nh > dispH) {
            nh = dispH - ny;
            nw = nh * numRatio;
          }
        } else if (type === 'nw') {
          nh = nw / numRatio;
          ny = initialCrop.y + initialCrop.height - nh;
          if (ny < 0) {
            ny = 0;
            nh = initialCrop.y + initialCrop.height;
            nw = nh * numRatio;
            nx = initialCrop.x + initialCrop.width - nw;
          }
        } else if (type === 'ne') {
          nh = nw / numRatio;
          ny = initialCrop.y + initialCrop.height - nh;
          if (ny < 0) {
            ny = 0;
            nh = initialCrop.y + initialCrop.height;
            nw = nh * numRatio;
          }
        } else if (type === 'sw') {
          nh = nw / numRatio;
          if (ny + nh > dispH) {
            nh = dispH - ny;
            nw = nh * numRatio;
            nx = initialCrop.x + initialCrop.width - nw;
          }
        }
      }

      newCrop = {
        x: Math.max(0, Math.floor(nx)),
        y: Math.max(0, Math.floor(ny)),
        width: Math.max(MIN_CROP_SIZE, Math.floor(nw)),
        height: Math.max(MIN_CROP_SIZE, Math.floor(nh)),
      };
    }

    setCrop(newCrop);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragInfoRef.current.type) {
      dragInfoRef.current.type = null;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  // Perform canvas crop and return final cropped image dataUrl
  const handleApplyCrop = async () => {
    if (!imgRef.current || isProcessing) return;
    setIsProcessing(true);

    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = currentImageUrl;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
      });

      const dispW = imgRef.current.clientWidth;
      const dispH = imgRef.current.clientHeight;
      if (dispW === 0 || dispH === 0) return;

      const scaleX = img.naturalWidth / dispW;
      const scaleY = img.naturalHeight / dispH;

      const sx = Math.max(0, Math.floor(crop.x * scaleX));
      const sy = Math.max(0, Math.floor(crop.y * scaleY));
      const sWidth = Math.min(img.naturalWidth - sx, Math.floor(crop.width * scaleX));
      const sHeight = Math.min(img.naturalHeight - sy, Math.floor(crop.height * scaleY));

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, sWidth);
      canvas.height = Math.max(1, sHeight);

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);

      const croppedResult = canvas.toDataURL('image/jpeg', 0.95);
      onCropComplete(croppedResult);
      onClose();
    } catch (err) {
      console.error('Erro ao recortar imagem:', err);
      alert('Não foi possível concluir o recorte da imagem.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-5 animate-in fade-in duration-200 select-none"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl flex flex-col max-w-4xl w-full max-h-[94vh] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-600/30 border border-purple-500/40 flex items-center justify-center text-purple-300">
              <Crop className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white flex items-center gap-2">{title}</h3>
              <p className="text-[11px] text-slate-400">
                Arraste os cantos ou o centro para recortar a imagem exatamente como deseja no slide.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Fechar sem salvar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar: Proporções & Ferramentas de Transformação */}
        <div className="px-5 py-2.5 bg-slate-950/50 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2.5">
          {/* Proporções */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mr-1">
              Proporção:
            </span>
            <button
              onClick={() => handleSelectAspectRatio('16:9')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 border ${
                aspectRatio === '16:9'
                  ? 'bg-purple-600 text-white border-purple-400 shadow-sm'
                  : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border-slate-700'
              }`}
              title="16:9 - Perfeito para slides, telão e projetor widescreen"
            >
              <Monitor className="w-3.5 h-3.5 text-cyan-300" />
              <span>16:9 (Slide)</span>
            </button>
            <button
              onClick={() => handleSelectAspectRatio('4:3')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 border ${
                aspectRatio === '4:3'
                  ? 'bg-purple-600 text-white border-purple-400 shadow-sm'
                  : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border-slate-700'
              }`}
              title="4:3 - Formato clássico"
            >
              <RectangleHorizontal className="w-3.5 h-3.5" />
              <span>4:3</span>
            </button>
            <button
              onClick={() => handleSelectAspectRatio('1:1')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 border ${
                aspectRatio === '1:1'
                  ? 'bg-purple-600 text-white border-purple-400 shadow-sm'
                  : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border-slate-700'
              }`}
              title="1:1 - Quadrado perfeito"
            >
              <Square className="w-3.5 h-3.5" />
              <span>1:1</span>
            </button>
            <button
              onClick={() => handleSelectAspectRatio('3:2')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 border ${
                aspectRatio === '3:2'
                  ? 'bg-purple-600 text-white border-purple-400 shadow-sm'
                  : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border-slate-700'
              }`}
              title="3:2 - Fotografia padrão"
            >
              <span>3:2</span>
            </button>
            <button
              onClick={() => handleSelectAspectRatio('9:16')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 border ${
                aspectRatio === '9:16'
                  ? 'bg-purple-600 text-white border-purple-400 shadow-sm'
                  : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border-slate-700'
              }`}
              title="9:16 - Vertical / Stories / Celular"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>9:16</span>
            </button>
            <button
              onClick={() => handleSelectAspectRatio('free')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 border ${
                aspectRatio === 'free'
                  ? 'bg-purple-600 text-white border-purple-400 shadow-sm'
                  : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border-slate-700'
              }`}
              title="Livre - Sem proporção fixa, corte qualquer retângulo"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Livre</span>
            </button>
          </div>

          {/* Rotação / Espelhamento / Reset */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleRotate}
              disabled={isProcessing}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-40"
              title="Girar 90° no sentido horário"
            >
              <RotateCw className="w-3.5 h-3.5 text-indigo-400" />
              <span>Girar 90°</span>
            </button>
            <button
              onClick={handleFlipHorizontal}
              disabled={isProcessing}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-40"
              title="Espelhar horizontalmente"
            >
              <FlipHorizontal className="w-3.5 h-3.5 text-cyan-400" />
              <span>Espelhar</span>
            </button>
            <button
              onClick={handleReset}
              disabled={isProcessing}
              className="px-2.5 py-1 rounded-lg bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700/60 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-40"
              title="Restaurar imagem original sem alterações"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Viewport de Corte com Imagem e Máscara Interativa */}
        <div
          ref={containerRef}
          className="relative flex-1 flex items-center justify-center p-4 bg-slate-950 overflow-hidden min-h-[340px] max-h-[58vh] select-none"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.05) 1px, transparent 0)',
            backgroundSize: '16px 16px',
          }}
        >
          <div className="relative inline-block max-w-full max-h-full">
            <img
              ref={imgRef}
              src={currentImageUrl}
              alt="Imagem para recorte"
              onLoad={handleImageLoad}
              crossOrigin="anonymous"
              className="max-h-[54vh] max-w-full object-contain pointer-events-none rounded-lg shadow-2xl block mx-auto"
            />

            {/* Máscara de Corte Escurecida (4 retângulos ao redor da caixa ativa) */}
            {isReady && imgRef.current && (
              <>
                {/* Top Mask */}
                <div
                  className="absolute left-0 top-0 right-0 bg-black/65 pointer-events-none transition-none"
                  style={{ height: `${crop.y}px` }}
                />
                {/* Bottom Mask */}
                <div
                  className="absolute left-0 right-0 bottom-0 bg-black/65 pointer-events-none transition-none"
                  style={{ top: `${crop.y + crop.height}px` }}
                />
                {/* Left Mask */}
                <div
                  className="absolute left-0 bg-black/65 pointer-events-none transition-none"
                  style={{
                    top: `${crop.y}px`,
                    height: `${crop.height}px`,
                    width: `${crop.x}px`,
                  }}
                />
                {/* Right Mask */}
                <div
                  className="absolute right-0 bg-black/65 pointer-events-none transition-none"
                  style={{
                    top: `${crop.y}px`,
                    height: `${crop.height}px`,
                    left: `${crop.x + crop.width}px`,
                  }}
                />

                {/* Caixa Ativa de Recorte */}
                <div
                  className="absolute border-2 border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.4)] cursor-move select-none"
                  style={{
                    left: `${crop.x}px`,
                    top: `${crop.y}px`,
                    width: `${crop.width}px`,
                    height: `${crop.height}px`,
                  }}
                  onPointerDown={(e) => handlePointerDown(e, 'move')}
                >
                  {/* Grid Regra dos Terços (3x3) */}
                  <div className="w-full h-full grid grid-cols-3 grid-rows-3 pointer-events-none opacity-40">
                    <div className="border-r border-b border-cyan-200/50" />
                    <div className="border-r border-b border-cyan-200/50" />
                    <div className="border-b border-cyan-200/50" />
                    <div className="border-r border-b border-cyan-200/50" />
                    <div className="border-r border-b border-cyan-200/50" />
                    <div className="border-b border-cyan-200/50" />
                    <div className="border-r border-cyan-200/50" />
                    <div className="border-r border-cyan-200/50" />
                    <div />
                  </div>

                  {/* Badge de Dimensões Central / Flutuante */}
                  <div className="absolute top-2 left-2 bg-slate-950/80 text-cyan-300 border border-cyan-500/40 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded shadow pointer-events-none">
                    {aspectRatio.toUpperCase()}
                  </div>

                  {/* Alça Noroeste (Top-Left) */}
                  <div
                    onPointerDown={(e) => handlePointerDown(e, 'nw')}
                    className="absolute -top-2.5 -left-2.5 w-5 h-5 bg-white border-2 border-cyan-500 rounded-full shadow-lg cursor-nwse-resize hover:scale-125 transition-transform"
                    title="Arrastar para recortar canto superior esquerdo"
                  />
                  {/* Alça Nordeste (Top-Right) */}
                  <div
                    onPointerDown={(e) => handlePointerDown(e, 'ne')}
                    className="absolute -top-2.5 -right-2.5 w-5 h-5 bg-white border-2 border-cyan-500 rounded-full shadow-lg cursor-nesw-resize hover:scale-125 transition-transform"
                    title="Arrastar para recortar canto superior direito"
                  />
                  {/* Alça Sudoeste (Bottom-Left) */}
                  <div
                    onPointerDown={(e) => handlePointerDown(e, 'sw')}
                    className="absolute -bottom-2.5 -left-2.5 w-5 h-5 bg-white border-2 border-cyan-500 rounded-full shadow-lg cursor-nesw-resize hover:scale-125 transition-transform"
                    title="Arrastar para recortar canto inferior esquerdo"
                  />
                  {/* Alça Sudeste (Bottom-Right) */}
                  <div
                    onPointerDown={(e) => handlePointerDown(e, 'se')}
                    className="absolute -bottom-2.5 -right-2.5 w-5 h-5 bg-white border-2 border-cyan-500 rounded-full shadow-lg cursor-nwse-resize hover:scale-125 transition-transform"
                    title="Arrastar para recortar canto inferior direito"
                  />

                  {/* Alças Laterais (se proporção Livre) */}
                  {aspectRatio === 'free' && (
                    <>
                      <div
                        onPointerDown={(e) => handlePointerDown(e, 'n')}
                        className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-6 h-3 bg-white border border-cyan-600 rounded-full cursor-ns-resize shadow"
                      />
                      <div
                        onPointerDown={(e) => handlePointerDown(e, 's')}
                        className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-6 h-3 bg-white border border-cyan-600 rounded-full cursor-ns-resize shadow"
                      />
                      <div
                        onPointerDown={(e) => handlePointerDown(e, 'w')}
                        className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-6 bg-white border border-cyan-600 rounded-full cursor-ew-resize shadow"
                      />
                      <div
                        onPointerDown={(e) => handlePointerDown(e, 'e')}
                        className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-6 bg-white border border-cyan-600 rounded-full cursor-ew-resize shadow"
                      />
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer com Ações */}
        <div className="px-5 py-3 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between gap-3">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>O recorte será aplicado com alta resolução diretamente no slide.</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all cursor-pointer border border-slate-700"
            >
              Cancelar
            </button>
            <button
              onClick={handleApplyCrop}
              disabled={isProcessing || !isReady}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-extrabold transition-all cursor-pointer shadow-lg shadow-emerald-950/50 flex items-center gap-1.5 disabled:opacity-40"
            >
              <Check className="w-4 h-4 text-white" />
              <span>{isProcessing ? 'Processando...' : 'Aplicar Recorte'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
