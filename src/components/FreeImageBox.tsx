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
  Move
} from 'lucide-react';

export const DEFAULT_IMAGE_BOX: ImageBox = {
  x: 25,
  y: 18,
  w: 50,
  h: 64,
  rot: 0,
  fit: 'cover',
  layer: 'back',
  flipX: false,
};

export interface FreeImageBoxProps {
  src: string;
  box: ImageBox;
  selected: boolean;
  editable: boolean;
  stageRef: React.RefObject<HTMLDivElement | null>;
  onSelect: () => void;
  onCommit: (box: ImageBox) => void;
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
}) => {
  // Estado local durante o arraste para garantir fluidez a 60fps
  const [activeDrag, setActiveDrag] = useState<{
    handle: HandleType;
    tempBox: ImageBox;
  } | null>(null);

  const currentBox = activeDrag?.tempBox ?? box;

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
      let deg = (rad * 180) / Math.PI + 90; // O handle está acima (-90°)
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

  return (
    <div
      data-image-box="true"
      className={`absolute transition-shadow select-none ${
        selected ? 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-slate-900/50' : ''
      }`}
      style={{
        left: `${currentBox.x}%`,
        top: `${currentBox.y}%`,
        width: `${currentBox.w}%`,
        height: `${currentBox.h}%`,
        transform: `rotate(${currentBox.rot}deg) ${currentBox.flipX ? 'scaleX(-1)' : ''}`,
        transformOrigin: 'center center',
        zIndex: selected ? 45 : currentBox.layer === 'front' ? 42 : 8,
        cursor: editable ? (activeDrag?.handle === 'move' ? 'grabbing' : 'grab') : 'default',
      }}
      onPointerDown={(e) => {
        if (editable && !selected) {
          onSelect();
        } else if (editable && selected) {
          handlePointerDown(e, 'move');
        }
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
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

      {/* Alças de Redimensionamento e Giro (Ativas apenas quando selecionado) */}
      {selected && editable && (
        <div className="absolute inset-0 pointer-events-none select-none">
          {/* Caixa de contorno suave estilo vetor Corel */}
          <div className="absolute inset-0 border-2 border-dashed border-cyan-400/90 pointer-events-none rounded-xl" />

          {/* Badge flutuante com medidas ao vivo durante o arraste */}
          {activeDrag && (
            <div
              className="absolute -top-9 left-1/2 -translate-x-1/2 bg-slate-950/90 border border-cyan-400 text-cyan-200 text-[10px] font-black font-mono px-2.5 py-0.5 rounded-full shadow-2xl pointer-events-none whitespace-nowrap z-50 flex items-center gap-1.5"
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

          {/* Haste e Bolinha de Giro Superior */}
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto cursor-grab active:cursor-grabbing">
            <div
              onPointerDown={(e) => handlePointerDown(e, 'rot')}
              className="w-4.5 h-4.5 rounded-full bg-emerald-500 hover:bg-emerald-400 border-2 border-white shadow-xl flex items-center justify-center transition-transform hover:scale-125"
              title="Girar imagem livremente • Segure Shift para travar a cada 15°"
            >
              <RotateCw className="w-2.5 h-2.5 text-slate-950" />
            </div>
            <div className="w-0.5 h-2 bg-emerald-400" />
          </div>

          {/* 4 Cantos (Proporcionais • Shift deixa livre • Alt pelo centro) */}
          <div
            onPointerDown={(e) => handlePointerDown(e, 'nw')}
            className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-cyan-500 rounded-sm shadow-md pointer-events-auto cursor-nwse-resize hover:scale-125 transition-transform"
            title="Redimensionar canto • Segure Shift para livre • Alt pelo centro"
          />
          <div
            onPointerDown={(e) => handlePointerDown(e, 'ne')}
            className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-cyan-500 rounded-sm shadow-md pointer-events-auto cursor-nesw-resize hover:scale-125 transition-transform"
            title="Redimensionar canto • Segure Shift para livre • Alt pelo centro"
          />
          <div
            onPointerDown={(e) => handlePointerDown(e, 'sw')}
            className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-cyan-500 rounded-sm shadow-md pointer-events-auto cursor-nesw-resize hover:scale-125 transition-transform"
            title="Redimensionar canto • Segure Shift para livre • Alt pelo centro"
          />
          <div
            onPointerDown={(e) => handlePointerDown(e, 'se')}
            className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-cyan-500 rounded-sm shadow-md pointer-events-auto cursor-nwse-resize hover:scale-125 transition-transform"
            title="Redimensionar canto • Segure Shift para livre • Alt pelo centro"
          />

          {/* 4 Laterais (Esticam apenas largura ou altura) */}
          <div
            onPointerDown={(e) => handlePointerDown(e, 'n')}
            className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-white border-2 border-indigo-500 rounded-sm shadow-md pointer-events-auto cursor-ns-resize hover:scale-125 transition-transform"
            title="Ajustar altura (topo)"
          />
          <div
            onPointerDown={(e) => handlePointerDown(e, 's')}
            className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-white border-2 border-indigo-500 rounded-sm shadow-md pointer-events-auto cursor-ns-resize hover:scale-125 transition-transform"
            title="Ajustar altura (base)"
          />
          <div
            onPointerDown={(e) => handlePointerDown(e, 'w')}
            className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3.5 h-3.5 bg-white border-2 border-indigo-500 rounded-sm shadow-md pointer-events-auto cursor-ew-resize hover:scale-125 transition-transform"
            title="Ajustar largura (esquerda)"
          />
          <div
            onPointerDown={(e) => handlePointerDown(e, 'e')}
            className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3.5 h-3.5 bg-white border-2 border-indigo-500 rounded-sm shadow-md pointer-events-auto cursor-ew-resize hover:scale-125 transition-transform"
            title="Ajustar largura (direita)"
          />
        </div>
      )}
    </div>
  );
};

export interface ImageBoxToolbarProps {
  box: ImageBox;
  src: string;
  stageRef?: React.RefObject<HTMLDivElement | null>;
  onChange: (box: ImageBox) => void;
  onRemove: () => void;
  onDone: () => void;
}

export const ImageBoxToolbar: React.FC<ImageBoxToolbarProps> = ({
  box,
  src,
  onChange,
  onRemove,
  onDone,
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
          className={`px-2 py-1 rounded-xl border text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-all ${
            box.layer === 'front'
              ? 'bg-purple-600/30 text-purple-200 border-purple-400'
              : 'bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-700/80'
          }`}
          title="Alternar camada: Frente do texto ou Atrás do texto"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>{box.layer === 'front' ? 'Frente' : 'Atrás'}</span>
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
