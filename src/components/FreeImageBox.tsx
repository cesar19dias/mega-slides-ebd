import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { ImageBox } from '../types';
import {
  RotateCw,
  FlipHorizontal,
  Layers,
  Trash2,
  Check,
  AlignCenter,
  Ratio,
  Move,
  Maximize,
  Image as ImageIcon,
  Copy,
} from 'lucide-react';

export const DEFAULT_IMAGE_BOX: ImageBox = {
  x: 5,
  y: 24,
  w: 90,
  h: 71,
  rot: 0,
  fit: 'cover',
  layer: 'back',
  flipX: false,
};

export const GENERIC_BLUE_FRAME_SVG = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><rect width="800" height="600" rx="16" fill="%231e3a8a"/><rect x="12" y="12" width="776" height="576" rx="12" fill="%232563eb" stroke="%2360a5fa" stroke-width="6"/><circle cx="400" cy="240" r="70" fill="%233b82f6" opacity="0.8"/><path d="M360 260 L400 200 L440 260 Z" fill="%2393c5fd"/><text x="400" y="370" font-size="36" font-family="sans-serif" font-weight="900" fill="white" text-anchor="middle" letter-spacing="2">QUADRO AZUL</text><text x="400" y="415" font-size="22" font-family="sans-serif" font-weight="bold" fill="%2393c5fd" text-anchor="middle">Enquadramento Perfeito (90% x 71% • X: 5% • Y: 24%)</text></svg>';

export interface FreeImageBoxProps {
  src: string;
  box: ImageBox;
  selected: boolean;
  editable: boolean;
  stageRef: React.RefObject<HTMLDivElement | null>;
  onSelect: () => void;
  onCommit: (box: ImageBox) => void;
  onUploadImage?: (file: File) => void;
}

type HandleType = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | 'rot' | 'move';

export const FreeImageBox: React.FC<FreeImageBoxProps> = ({
  src,
  box,
  selected,
  editable,
  stageRef,
  onSelect,
  onCommit,
  onUploadImage,
}) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estado local durante o arraste para garantir fluidez a 60fps
  const [activeDrag, setActiveDrag] = useState<{
    handle: HandleType;
    tempBox: ImageBox;
  } | null>(null);

  const currentBox = activeDrag?.tempBox ?? box;

  // Bloqueio nativo do gesto de rolagem/pull-to-refresh no tablet/celular
  useEffect(() => {
    if (!editable) return;

    const preventTouchScroll = (e: TouchEvent) => {
      if (selected || (e.target as HTMLElement)?.closest('[data-image-box]')) {
        if (e.cancelable) {
          e.preventDefault();
        }
      }
    };

    const boxEl = boxRef.current;
    const imgEl = imgRef.current;

    if (boxEl) {
      boxEl.addEventListener('touchstart', preventTouchScroll, { passive: false });
      boxEl.addEventListener('touchmove', preventTouchScroll, { passive: false });
    }
    if (imgEl) {
      imgEl.addEventListener('touchstart', preventTouchScroll, { passive: false });
      imgEl.addEventListener('touchmove', preventTouchScroll, { passive: false });
    }

    return () => {
      if (boxEl) {
        boxEl.removeEventListener('touchstart', preventTouchScroll);
        boxEl.removeEventListener('touchmove', preventTouchScroll);
      }
      if (imgEl) {
        imgEl.removeEventListener('touchstart', preventTouchScroll);
        imgEl.removeEventListener('touchmove', preventTouchScroll);
      }
    };
  }, [editable, selected]);

  // Guarda estado de início do ponteiro
  const dragStartRef = useRef<{
    handle: HandleType;
    startX: number;
    startY: number;
    startBox: ImageBox;
    stageWidth: number;
    stageHeight: number;
    stageLeft: number;
    stageTop: number;
    aspectRatio: number;
  } | null>(null);

  // Manipulação por teclado quando selecionado (Setas movem 0.5% ou 2% com Shift)
  useEffect(() => {
    if (!selected || !editable) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignora se o foco estiver dentro de um input/textarea
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      const step = e.shiftKey ? 2.0 : 0.5;
      let dx = 0;
      let dy = 0;

      if (e.key === 'ArrowLeft') dx = -step;
      else if (e.key === 'ArrowRight') dx = step;
      else if (e.key === 'ArrowUp') dy = -step;
      else if (e.key === 'ArrowDown') dy = step;
      else return;

      e.preventDefault();
      e.stopPropagation();

      const nextBox: ImageBox = {
        ...box,
        x: Math.round((box.x + dx) * 10) / 10,
        y: Math.round((box.y + dy) * 10) / 10,
      };
      onCommit(nextBox);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [selected, editable, box, onCommit]);

  const handlePointerDown = useCallback((e: React.PointerEvent, handle: HandleType) => {
    if (!editable) return;
    e.stopPropagation();
    e.preventDefault();

    onSelect();

    const stage = stageRef.current;
    if (!stage) return;
    const stageRect = stage.getBoundingClientRect();

    dragStartRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startBox: { ...box },
      stageWidth: stageRect.width,
      stageHeight: stageRect.height,
      stageLeft: stageRect.left,
      stageTop: stageRect.top,
      aspectRatio: box.w / (box.h || 1),
    };

    setActiveDrag({ handle, tempBox: { ...box } });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [editable, box, onSelect, stageRef]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStartRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const {
      handle,
      startX,
      startY,
      startBox,
      stageWidth,
      stageHeight,
      stageLeft,
      stageTop,
      aspectRatio
    } = dragStartRef.current;

    const deltaXClient = e.clientX - startX;
    const deltaYClient = e.clientY - startY;

    // Converte delta para % do palco
    const deltaXPct = (deltaXClient / stageWidth) * 100;
    const deltaYPct = (deltaYClient / stageHeight) * 100;

    // ── 1. MOVER CAIXA INTEIRA ──
    if (handle === 'move') {
      const nextX = Math.round((startBox.x + deltaXPct) * 10) / 10;
      const nextY = Math.round((startBox.y + deltaYPct) * 10) / 10;
      setActiveDrag({
        handle,
        tempBox: { ...startBox, x: nextX, y: nextY },
      });
      return;
    }

    // ── 2. GIRAR (ROTAÇÃO ESTILO COREL) ──
    if (handle === 'rot') {
      // Centro da caixa em coordenadas do viewport
      const boxCenterX = stageLeft + ((startBox.x + startBox.w / 2) / 100) * stageWidth;
      const boxCenterY = stageTop + ((startBox.y + startBox.h / 2) / 100) * stageHeight;

      const rad = Math.atan2(e.clientY - boxCenterY, e.clientX - boxCenterX);
      const isRotAtBottom = startBox.y < 9 && (startBox.y + startBox.h) <= 90;
      let deg = (rad * 180) / Math.PI + (isRotAtBottom ? -90 : 90);
      if (deg < 0) deg += 360;
      deg = deg % 360;

      // Shift trava em passos de 15°
      if (e.shiftKey) {
        deg = Math.round(deg / 15) * 15;
      } else {
        deg = Math.round(deg);
      }

      setActiveDrag({
        handle,
        tempBox: { ...startBox, rot: deg },
      });
      return;
    }

    // ── 3. REDIMENSIONAR PELAS ALÇAS ──
    const { x, y } = startBox;
    const isAlt = e.altKey; // Alt redimensiona a partir do centro
    const isShift = e.shiftKey; // Shift deixa proporção livre nos cantos

    // Vetores locais de redimensionamento
    let dw = 0;
    let dh = 0;

    if (handle.includes('e')) dw += deltaXPct;
    if (handle.includes('w')) dw -= deltaXPct;
    if (handle.includes('s')) dh += deltaYPct;
    if (handle.includes('n')) dh -= deltaYPct;

    let nextW = Math.max(10, startBox.w + dw);
    let nextH = Math.max(8, startBox.h + dh);

    // Se for canto (nw, ne, sw, se) e NÃO estiver segurando Shift: trava proporção
    const isCorner = ['nw', 'ne', 'sw', 'se'].includes(handle);
    if (isCorner && !isShift) {
      // Ajusta altura proporcionalmente à largura
      nextH = nextW / aspectRatio;
    }

    // Calcula novas posições X e Y dependendo da alça puxada
    let nextX = x;
    let nextY = y;

    if (isAlt) {
      // A partir do centro: expande/contrai simetricamente
      nextX = x - (nextW - startBox.w) / 2;
      nextY = y - (nextH - startBox.h) / 2;
    } else {
      if (handle.includes('w')) {
        nextX = x + (startBox.w - nextW);
      }
      if (handle.includes('n')) {
        nextY = y + (startBox.h - nextH);
      }
    }

    setActiveDrag({
      handle,
      tempBox: {
        ...startBox,
        x: Math.round(nextX * 10) / 10,
        y: Math.round(nextY * 10) / 10,
        w: Math.round(nextW * 10) / 10,
        h: Math.round(nextH * 10) / 10,
      },
    });
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (activeDrag) {
      onCommit(activeDrag.tempBox);
      setActiveDrag(null);
      dragStartRef.current = null;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  }, [activeDrag, onCommit]);

  const isFront = currentBox.layer === 'front';
  const isNearTopEdge = currentBox.y < 8;
  const isNearBottomEdge = (currentBox.y + currentBox.h) > 92;
  const isNearLeftEdge = currentBox.x < 3;
  const isNearRightEdge = (currentBox.x + currentBox.w) > 97;
  const isRotAtBottom = isNearTopEdge && !isNearBottomEdge;

  return (
    <>
      {/* 🖼️ CAMADA DA IMAGEM: Z-Index dinâmico (Frente = 35, Atrás = 5). Atualiza na hora na tela sem delay */}
      <div
        ref={imgRef}
        data-image-box="true"
        className={`absolute transition-shadow select-none ${
          !selected && editable ? 'cursor-pointer hover:ring-2 hover:ring-cyan-400/50' : ''
        }`}
        style={{
          left: `${currentBox.x}%`,
          top: `${currentBox.y}%`,
          width: `${currentBox.w}%`,
          height: `${currentBox.h}%`,
          transform: `rotate(${currentBox.rot}deg) ${currentBox.flipX ? 'scaleX(-1)' : ''}`,
          transformOrigin: 'center center',
          zIndex: isFront ? 35 : 5,
          touchAction: 'none',
          WebkitTouchCallout: 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none',
        }}
        onPointerDown={(e) => {
          if (editable && !selected) {
            e.stopPropagation();
            onSelect();
          }
        }}
        onDoubleClick={() => {
          if (editable && onUploadImage) {
            fileInputRef.current?.click();
          }
        }}
        title={editable ? 'Clique para selecionar • Duplo-clique para trocar de foto' : undefined}
      >
        {/* Input oculto para troca direta de arquivo */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && onUploadImage) {
              onUploadImage(file);
              e.target.value = '';
            }
          }}
          className="hidden"
        />

        {/* Imagem propriamente dita com corte/ajuste */}
        <div className="w-full h-full relative overflow-hidden rounded-xl pointer-events-none">
          <img
            src={src}
            alt="Ilustração do slide"
            draggable={false}
            className="w-full h-full pointer-events-none select-none"
            style={{ objectFit: currentBox.fit }}
          />
        </div>
      </div>

      {/* 🛠️ ALÇAS E CONTROLE DE TRANSFORMAÇÃO (Apenas quando selecionado): Fica sempre no topo (z-50) */}
      {selected && editable && (
        <div
          ref={boxRef}
          data-image-box="true"
          className="absolute select-none touch-none ring-2 ring-cyan-400 ring-offset-2 ring-offset-slate-900/50 rounded-xl"
          style={{
            left: `${currentBox.x}%`,
            top: `${currentBox.y}%`,
            width: `${currentBox.w}%`,
            height: `${currentBox.h}%`,
            transform: `rotate(${currentBox.rot}deg) ${currentBox.flipX ? 'scaleX(-1)' : ''}`,
            transformOrigin: 'center center',
            zIndex: 50,
            cursor: activeDrag?.handle === 'move' ? 'grabbing' : 'grab',
            touchAction: 'none',
            WebkitTouchCallout: 'none',
            WebkitUserSelect: 'none',
            userSelect: 'none',
          }}
          onPointerDown={(e) => {
            handlePointerDown(e, 'move');
          }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* Caixa de contorno suave estilo vetor Corel */}
          <div className="absolute inset-0 border-2 border-dashed border-cyan-400/90 pointer-events-none rounded-xl" />

          {/* Badge flutuante com medidas ao vivo durante o arraste */}
          {activeDrag && (
            <div
              className={`absolute left-1/2 -translate-x-1/2 bg-slate-950/90 border border-cyan-400 text-cyan-200 text-[10px] font-black font-mono px-2.5 py-0.5 rounded-full shadow-2xl pointer-events-none whitespace-nowrap z-50 flex items-center gap-1.5 ${
                isNearTopEdge ? '-bottom-9' : '-top-9'
              }`}
              style={{ transform: `translateX(-50%) rotate(-${currentBox.rot}deg)` }}
            >
              {activeDrag.handle === 'rot' ? (
                <span>Giro: {currentBox.rot}°</span>
              ) : activeDrag.handle === 'move' ? (
                <span>X: {currentBox.x}% | Y: {currentBox.y}%</span>
              ) : (
                <span>L: {currentBox.w}% | A: {currentBox.h}%</span>
              )}
            </div>
          )}

          {/* Haste e Bolinha de Giro (Inverte para baixo se encostada no topo) */}
          <div
            className={`absolute left-1/2 -translate-x-1/2 flex items-center pointer-events-auto cursor-grab active:cursor-grabbing select-none z-50 ${
              isRotAtBottom ? '-bottom-8 flex-col-reverse' : '-top-8 flex-col'
            }`}
            style={{ touchAction: 'none' }}
          >
            <div
              onPointerDown={(e) => handlePointerDown(e, 'rot')}
              className="w-8 h-8 md:w-6 md:h-6 flex items-center justify-center p-0.5 cursor-grab active:cursor-grabbing"
              title="Girar imagem livremente • Segure Shift para travar a cada 15°"
            >
              <div className="w-5.5 h-5.5 md:w-5 md:h-5 rounded-full bg-emerald-500 hover:bg-emerald-400 border-2 border-white shadow-xl flex items-center justify-center transition-transform hover:scale-125">
                <RotateCw className="w-3 h-3 md:w-2.5 md:h-2.5 text-slate-950" />
              </div>
            </div>
            <div className="w-0.5 h-2 bg-emerald-400" />
          </div>

          {/* 4 Cantos (Proporcionais • Alças ampliadas para toque e presas dentro da tela) */}
          <div
            onPointerDown={(e) => handlePointerDown(e, 'nw')}
            className="absolute w-8 h-8 md:w-6 md:h-6 flex items-center justify-center pointer-events-auto cursor-nwse-resize z-45"
            style={{
              top: isNearTopEdge ? '0px' : '-10px',
              left: isNearLeftEdge ? '0px' : '-10px',
              touchAction: 'none',
            }}
            title="Redimensionar canto • Segure Shift para livre • Alt pelo centro"
          >
            <div className="w-4 h-4 md:w-3.5 md:h-3.5 bg-white border-2 border-cyan-500 rounded-sm shadow-md hover:scale-125 transition-transform" />
          </div>

          <div
            onPointerDown={(e) => handlePointerDown(e, 'ne')}
            className="absolute w-8 h-8 md:w-6 md:h-6 flex items-center justify-center pointer-events-auto cursor-nesw-resize z-45"
            style={{
              top: isNearTopEdge ? '0px' : '-10px',
              right: isNearRightEdge ? '0px' : '-10px',
              touchAction: 'none',
            }}
            title="Redimensionar canto • Segure Shift para livre • Alt pelo centro"
          >
            <div className="w-4 h-4 md:w-3.5 md:h-3.5 bg-white border-2 border-cyan-500 rounded-sm shadow-md hover:scale-125 transition-transform" />
          </div>

          <div
            onPointerDown={(e) => handlePointerDown(e, 'sw')}
            className="absolute w-8 h-8 md:w-6 md:h-6 flex items-center justify-center pointer-events-auto cursor-nesw-resize z-45"
            style={{
              bottom: isNearBottomEdge ? '0px' : '-10px',
              left: isNearLeftEdge ? '0px' : '-10px',
              touchAction: 'none',
            }}
            title="Redimensionar canto • Segure Shift para livre • Alt pelo centro"
          >
            <div className="w-4 h-4 md:w-3.5 md:h-3.5 bg-white border-2 border-cyan-500 rounded-sm shadow-md hover:scale-125 transition-transform" />
          </div>

          <div
            onPointerDown={(e) => handlePointerDown(e, 'se')}
            className="absolute w-8 h-8 md:w-6 md:h-6 flex items-center justify-center pointer-events-auto cursor-nwse-resize z-45"
            style={{
              bottom: isNearBottomEdge ? '0px' : '-10px',
              right: isNearRightEdge ? '0px' : '-10px',
              touchAction: 'none',
            }}
            title="Redimensionar canto • Segure Shift para livre • Alt pelo centro"
          >
            <div className="w-4 h-4 md:w-3.5 md:h-3.5 bg-white border-2 border-cyan-500 rounded-sm shadow-md hover:scale-125 transition-transform" />
          </div>

          {/* 4 Laterais (Esticam largura ou altura) */}
          <div
            onPointerDown={(e) => handlePointerDown(e, 'n')}
            className="absolute left-1/2 -translate-x-1/2 w-8 h-8 md:w-6 md:h-6 flex items-center justify-center pointer-events-auto cursor-ns-resize z-45"
            style={{
              top: isNearTopEdge ? '0px' : '-10px',
              touchAction: 'none',
            }}
            title="Ajustar altura (topo)"
          >
            <div className="w-4 h-4 md:w-3.5 md:h-3.5 bg-white border-2 border-indigo-500 rounded-sm shadow-md hover:scale-125 transition-transform" />
          </div>

          <div
            onPointerDown={(e) => handlePointerDown(e, 's')}
            className="absolute left-1/2 -translate-x-1/2 w-8 h-8 md:w-6 md:h-6 flex items-center justify-center pointer-events-auto cursor-ns-resize z-45"
            style={{
              bottom: isNearBottomEdge ? '0px' : '-10px',
              touchAction: 'none',
            }}
            title="Ajustar altura (base)"
          >
            <div className="w-4 h-4 md:w-3.5 md:h-3.5 bg-white border-2 border-indigo-500 rounded-sm shadow-md hover:scale-125 transition-transform" />
          </div>

          <div
            onPointerDown={(e) => handlePointerDown(e, 'w')}
            className="absolute top-1/2 -translate-y-1/2 w-8 h-8 md:w-6 md:h-6 flex items-center justify-center pointer-events-auto cursor-ew-resize z-45"
            style={{
              left: isNearLeftEdge ? '0px' : '-10px',
              touchAction: 'none',
            }}
            title="Ajustar largura (esquerda)"
          >
            <div className="w-4 h-4 md:w-3.5 md:h-3.5 bg-white border-2 border-indigo-500 rounded-sm shadow-md hover:scale-125 transition-transform" />
          </div>

          <div
            onPointerDown={(e) => handlePointerDown(e, 'e')}
            className="absolute top-1/2 -translate-y-1/2 w-8 h-8 md:w-6 md:h-6 flex items-center justify-center pointer-events-auto cursor-ew-resize z-45"
            style={{
              right: isNearRightEdge ? '0px' : '-10px',
              touchAction: 'none',
            }}
            title="Ajustar largura (direita)"
          >
            <div className="w-4 h-4 md:w-3.5 md:h-3.5 bg-white border-2 border-indigo-500 rounded-sm shadow-md hover:scale-125 transition-transform" />
          </div>
        </div>
      )}
    </>
  );
};

export interface ImageBoxToolbarProps {
  box: ImageBox;
  src: string;
  stageRef?: React.RefObject<HTMLDivElement | null>;
  onChange: (box: ImageBox) => void;
  onRemove: () => void;
  onDone: () => void;
  onUploadImage?: (file: File) => void;
  onCopy?: () => void;
  onOpenReplicateModal?: () => void;
}

export const ImageBoxToolbar: React.FC<ImageBoxToolbarProps> = ({
  box,
  src,
  onChange,
  onRemove,
  onDone,
  onUploadImage,
  onCopy,
  onOpenReplicateModal,
}) => {
  // Ajusta proporção original baseada nos pixels naturais da imagem
  const handleResetNaturalRatio = () => {
    const img = new Image();
    img.src = src;
    img.onload = () => {
      const natW = img.naturalWidth || 1;
      const natH = img.naturalHeight || 1;
      // No palco 16:9, a proporção de aspecto em % é (natW / natH) * (9 / 16)
      const stageAspect = 16 / 9;
      const naturalAspect = natW / natH;
      const calculatedHeight = Math.min(90, Math.max(10, Math.round((box.w / (naturalAspect / stageAspect)) * 10) / 10));
      onChange({ ...box, h: calculatedHeight });
    };
  };

  const handleCenter = () => {
    const nextX = Math.round(((100 - box.w) / 2) * 10) / 10;
    const nextY = Math.round(((100 - box.h) / 2) * 10) / 10;
    onChange({ ...box, x: nextX, y: nextY });
  };

  const handleFitSlide = () => {
    onChange({ ...DEFAULT_IMAGE_BOX });
  };

  const handleRotate90 = () => {
    onChange({ ...box, rot: (box.rot + 90) % 360 });
  };

  const handleToggleFlipX = () => {
    onChange({ ...box, flipX: !box.flipX });
  };

  const handleToggleLayer = () => {
    onChange({ ...box, layer: box.layer === 'front' ? 'back' : 'front' });
  };

  return (
    <div
      data-image-box="true"
      className="bg-slate-950/95 border border-cyan-500/50 rounded-2xl p-2 px-3 shadow-2xl backdrop-blur-md flex flex-wrap items-center gap-2.5 text-xs text-white z-[70] animate-in fade-in"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1.5 text-cyan-300 font-black pr-2 border-r border-slate-800">
        <Move className="w-4 h-4 text-cyan-400" />
        <span>IMAGEM</span>
      </div>

      {/* Botão Copiar Imagem */}
      {onCopy && (
        <button
          type="button"
          onClick={onCopy}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700/80 font-bold text-[11px] cursor-pointer shadow-sm transition-all active:scale-95"
          title="Copiar esta imagem e enquadramento para a memória (Ctrl+C)"
        >
          <Copy className="w-3.5 h-3.5 text-cyan-400" />
          <span>Copiar</span>
        </button>
      )}

      {/* Botão Replicar em Slides Selecionados */}
      {onOpenReplicateModal && (
        <button
          type="button"
          onClick={onOpenReplicateModal}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-black text-[11px] cursor-pointer shadow-md shadow-cyan-600/30 transition-all active:scale-95"
          title="Escolher slides específicos para colar esta imagem (com a mesma posição e tamanho)"
        >
          <Copy className="w-3.5 h-3.5" />
          <span>📑 Replicar nos Slides...</span>
        </button>
      )}

      {/* Botão Trocar Foto Direto na Barra de Ferramentas */}
      {onUploadImage && (
        <label
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-[11px] cursor-pointer shadow-md transition-all active:scale-95"
          title="Escolher uma foto do seu computador ou celular para substituir esta imagem"
        >
          <ImageIcon className="w-3.5 h-3.5 text-purple-100" />
          <span>Trocar Foto</span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                onUploadImage(file);
                e.target.value = '';
              }
            }}
            className="hidden"
          />
        </label>
      )}

      {/* Posição X e Y */}
      <div className="flex items-center gap-1 bg-slate-900 border border-slate-700/80 rounded-xl px-2 py-1">
        <span className="text-[10px] font-bold text-slate-400">X:</span>
        <input
          type="number"
          value={Math.round(box.x)}
          onChange={(e) => onChange({ ...box, x: Number(e.target.value) || 0 })}
          className="w-10 bg-transparent text-white font-mono font-bold text-xs outline-none text-center"
        />
        <span className="text-[10px] font-bold text-slate-400">Y:</span>
        <input
          type="number"
          value={Math.round(box.y)}
          onChange={(e) => onChange({ ...box, y: Number(e.target.value) || 0 })}
          className="w-10 bg-transparent text-white font-mono font-bold text-xs outline-none text-center"
        />
      </div>

      {/* Largura e Altura */}
      <div className="flex items-center gap-1 bg-slate-900 border border-slate-700/80 rounded-xl px-2 py-1">
        <span className="text-[10px] font-bold text-slate-400">L:</span>
        <input
          type="number"
          value={Math.round(box.w)}
          onChange={(e) => onChange({ ...box, w: Math.max(5, Number(e.target.value) || 10) })}
          className="w-10 bg-transparent text-white font-mono font-bold text-xs outline-none text-center"
        />
        <span className="text-[10px] font-bold text-slate-400">A:</span>
        <input
          type="number"
          value={Math.round(box.h)}
          onChange={(e) => onChange({ ...box, h: Math.max(5, Number(e.target.value) || 10) })}
          className="w-10 bg-transparent text-white font-mono font-bold text-xs outline-none text-center"
        />
      </div>

      {/* Modo de Ajuste: Preencher vs Inteira vs Esticar */}
      <div className="flex items-center bg-slate-900 p-0.5 rounded-xl border border-slate-700/80">
        <button
          type="button"
          onClick={() => onChange({ ...box, fit: 'cover' })}
          className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
            box.fit === 'cover' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
          title="Preencher o quadro (corta excessos)"
        >
          Preencher
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...box, fit: 'contain' })}
          className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
            box.fit === 'contain' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
          title="Inteira (sem cortes, mantendo todo o conteúdo visível)"
        >
          Inteira
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...box, fit: 'fill' })}
          className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
            box.fit === 'fill' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
          title="Esticar (preenche sem manter proporção)"
        >
          Esticar
        </button>
      </div>

      {/* Ações Rápidas */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={handleResetNaturalRatio}
          className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 cursor-pointer transition-all"
          title="Restaurar proporção original natural da foto"
        >
          <Ratio className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={handleCenter}
          className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 cursor-pointer transition-all"
          title="Centralizar no palco 16:9"
        >
          <AlignCenter className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={handleFitSlide}
          className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-cyan-300 hover:text-white border border-cyan-500/40 cursor-pointer transition-all"
          title="Enquadrar perfeitamente no corpo do slide (Abaixo do título)"
        >
          <Maximize className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={handleRotate90}
          className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 cursor-pointer transition-all"
          title="Girar +90 graus"
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={handleToggleFlipX}
          className={`p-1.5 rounded-xl border cursor-pointer transition-all ${
            box.flipX
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
              : 'bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-700/80'
          }`}
          title="Espelhar horizontalmente"
        >
          <FlipHorizontal className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={handleToggleLayer}
          className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-black flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 shadow-sm ${
            box.layer === 'front'
              ? 'bg-purple-600 hover:bg-purple-500 text-white border-purple-300 shadow-purple-600/30 ring-1 ring-purple-300'
              : 'bg-slate-900 hover:bg-slate-800 text-amber-300 border-amber-500/40 hover:text-amber-200'
          }`}
          title="Alternar camada: Frente do texto ou Atrás do texto"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>{box.layer === 'front' ? 'À Frente' : 'Atrás'}</span>
        </button>
      </div>

      <div className="h-4 w-px bg-slate-800 mx-0.5" />

      {/* Remover Imagem */}
      <button
        type="button"
        onClick={onRemove}
        className="p-1.5 rounded-xl bg-red-950/60 hover:bg-red-900 text-red-300 border border-red-800/80 cursor-pointer transition-all"
        title="Remover esta foto do slide"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>

      {/* Concluir Seleção */}
      <button
        type="button"
        onClick={onDone}
        className="px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-black text-xs shadow-lg shadow-cyan-600/30 border border-cyan-300 flex items-center gap-1 cursor-pointer transition-all hover:scale-105 active:scale-95"
        title="Concluir edição da imagem"
      >
        <Check className="w-3.5 h-3.5" />
        <span>Concluir</span>
      </button>
    </div>
  );
};
