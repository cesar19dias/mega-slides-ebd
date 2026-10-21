import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { TextBox } from '../types';
import {
  RotateCw,
  Move,
  Type,
  RotateCcw,
  Plus,
  Minus,
} from 'lucide-react';

export const DEFAULT_TITLE_BOX: TextBox = {
  x: 13,
  y: 3,
  w: 90,
  rot: 0,
  scale: 1.0,
};

export const DEFAULT_BODY_BOX: TextBox = {
  x: 5,
  y: 20,
  w: 90,
  rot: 0,
  scale: 1.0,
};

export interface FreeTextBoxProps {
  box: TextBox;
  selected: boolean;
  editable: boolean;
  stageRef: React.RefObject<HTMLDivElement | null>;
  onSelect: () => void;
  onCommit: (box: TextBox) => void;
  onReset?: () => void;
  children: React.ReactNode;
  label?: string;
  accentColor?: string;
}

type HandleType = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | 'rot' | 'move';

export const FreeTextBox: React.FC<FreeTextBoxProps> = ({
  box,
  selected,
  editable,
  stageRef,
  onSelect,
  onCommit,
  onReset,
  children,
  label = 'Título',
  accentColor = '#f59e0b', // Amber padrão do título ou cyan para corpo
}) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Modo de edição de texto (duplo-clique/duplo-toque libera seleção de texto para grifar)
  const [isTextEditing, setIsTextEditing] = useState<boolean>(false);

  // Rastreamento de duplo toque para celulares e tablets (300ms)
  const lastTapRef = useRef<number>(0);

  // Estado local durante o arraste para garantir fluidez a 60fps
  const [activeDrag, setActiveDrag] = useState<{
    handle: HandleType;
    tempBox: TextBox;
  } | null>(null);

  const currentBox = activeDrag?.tempBox ?? box;

  // Quando desselecionado, sai automaticamente do modo de edição de texto
  useEffect(() => {
    if (!selected) {
      setIsTextEditing(false);
    }
  }, [selected]);

  // Bloqueio nativo do gesto de rolagem/pull-to-refresh no tablet/celular durante interação
  useEffect(() => {
    if (!editable) return;

    const preventTouchScroll = (e: TouchEvent) => {
      if ((selected && !isTextEditing) || (e.target as HTMLElement)?.closest('[data-text-handle]')) {
        if (e.cancelable) {
          e.preventDefault();
        }
      }
    };

    const boxEl = boxRef.current;
    if (boxEl) {
      boxEl.addEventListener('touchstart', preventTouchScroll, { passive: false });
      boxEl.addEventListener('touchmove', preventTouchScroll, { passive: false });
    }

    return () => {
      if (boxEl) {
        boxEl.removeEventListener('touchstart', preventTouchScroll);
        boxEl.removeEventListener('touchmove', preventTouchScroll);
      }
    };
  }, [editable, selected, isTextEditing]);

  // Guarda estado de início do ponteiro
  const dragStartRef = useRef<{
    handle: HandleType;
    startX: number;
    startY: number;
    startBox: TextBox;
    stageWidth: number;
    stageHeight: number;
    stageLeft: number;
    stageTop: number;
    contentHeightPct: number;
  } | null>(null);

  // Manipulação por teclado quando selecionado (Setas movem 0.5% ou 2% com Shift)
  useEffect(() => {
    if (!selected || !editable || isTextEditing) return;

    const handleKeyDown = (e: KeyboardEvent) => {
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

      const nextBox: TextBox = {
        ...box,
        x: Math.round((box.x + dx) * 10) / 10,
        y: Math.round((box.y + dy) * 10) / 10,
      };
      onCommit(nextBox);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [selected, editable, isTextEditing, box, onCommit]);

  const handlePointerDown = useCallback((e: React.PointerEvent, handle: HandleType) => {
    if (!editable) return;
    if (isTextEditing && handle === 'move') return;

    e.stopPropagation();
    e.preventDefault();

    onSelect();

    const stage = stageRef.current;
    if (!stage) return;
    const stageRect = stage.getBoundingClientRect();

    const currentContentH = contentRef.current ? contentRef.current.offsetHeight : 60;
    const contentHeightPct = (currentContentH / (stageRect.height || 450)) * 100;

    dragStartRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startBox: { ...box },
      stageWidth: stageRect.width,
      stageHeight: stageRect.height,
      stageLeft: stageRect.left,
      stageTop: stageRect.top,
      contentHeightPct,
    };

    setActiveDrag({ handle, tempBox: { ...box } });
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
  }, [editable, isTextEditing, box, onSelect, stageRef]);

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
      contentHeightPct,
    } = dragStartRef.current;

    const deltaXClient = e.clientX - startX;
    const deltaYClient = e.clientY - startY;

    const deltaXPct = (deltaXClient / stageWidth) * 100;
    const deltaYPct = (deltaYClient / stageHeight) * 100;

    // ── 1. MOVER CAIXA DE TEXTO (ARRASTE) ──
    if (handle === 'move') {
      const nextX = Math.round((startBox.x + deltaXPct) * 10) / 10;
      const nextY = Math.round((startBox.y + deltaYPct) * 10) / 10;
      setActiveDrag({
        handle,
        tempBox: { ...startBox, x: nextX, y: nextY },
      });
      return;
    }

    // ── 2. GIRAR ESTILO COREL DRAW ──
    if (handle === 'rot') {
      const boxCenterX = stageLeft + ((startBox.x + startBox.w / 2) / 100) * stageWidth;
      const boxCenterY = stageTop + ((startBox.y + contentHeightPct / 2) / 100) * stageHeight;

      const rad = Math.atan2(e.clientY - boxCenterY, e.clientX - boxCenterX);
      const isRotAtBottom = startBox.y < 8;
      let deg = (rad * 180) / Math.PI + (isRotAtBottom ? -90 : 90);
      if (deg < 0) deg += 360;
      deg = deg % 360;

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

    // ── 3. REDIMENSIONAR ESTILO COREL DRAW ──
    const isCorner = ['nw', 'ne', 'sw', 'se'].includes(handle);
    const isSideE = handle === 'e';
    const isSideW = handle === 'w';

    // A) COREL DRAW TEXTO ARTÍSTICO (CANTOS: ESCALA PROPORCIONAL DE LARGURA E FONTE)
    if (isCorner) {
      let dw = 0;
      if (handle === 'se' || handle === 'ne') dw = deltaXPct;
      if (handle === 'sw' || handle === 'nw') dw = -deltaXPct;

      const nextW = Math.max(20, Math.min(100, Math.round((startBox.w + dw) * 10) / 10));
      
      // Escala da fonte agora é baseada no deslocamento do arrasto (dw), permitindo crescer sem teto de 100% de largura
      const scaleDelta = (dw / 100) * 1.2;
      const nextScale = Math.max(0.4, Math.min(4.0, Math.round((startBox.scale + scaleDelta) * 100) / 100));

      let nextX = startBox.x;
      let nextY = startBox.y;

      if (handle === 'sw' || handle === 'nw') {
        nextX = Math.round((startBox.x + (startBox.w - nextW)) * 10) / 10;
      }
      if (handle === 'nw' || handle === 'ne') {
        nextY = Math.round((startBox.y + deltaYPct) * 10) / 10;
      }

      setActiveDrag({
        handle,
        tempBox: {
          ...startBox,
          x: nextX,
          y: nextY,
          w: nextW,
          scale: nextScale,
        },
      });
      return;
    }

    // B) COREL DRAW TEXTO DE PARÁGRAFO (LADOS: REFLUI O TEXTO SEM MUDAR A FONTE)
    if (isSideE) {
      const nextW = Math.max(15, Math.min(100, Math.round((startBox.w + deltaXPct) * 10) / 10));
      setActiveDrag({
        handle,
        tempBox: { ...startBox, w: nextW },
      });
      return;
    }

    if (isSideW) {
      const nextW = Math.max(15, Math.min(100, Math.round((startBox.w - deltaXPct) * 10) / 10));
      const nextX = Math.round((startBox.x + (startBox.w - nextW)) * 10) / 10;
      setActiveDrag({
        handle,
        tempBox: { ...startBox, x: nextX, w: nextW },
      });
      return;
    }

    // C) TOPO E BASE (AJUSTE FINO DE POSIÇÃO VERTICAL)
    if (handle === 'n') {
      const nextY = Math.round((startBox.y + deltaYPct) * 10) / 10;
      setActiveDrag({
        handle,
        tempBox: { ...startBox, y: nextY },
      });
      return;
    }
    if (handle === 's') {
      // No texto, arrastar 's' pode servir como micro-ajuste de escala vertical
      const scaleDelta = (deltaYPct / 100) * 0.8;
      const nextScale = Math.max(0.4, Math.min(3.5, Math.round((startBox.scale + scaleDelta) * 100) / 100));
      setActiveDrag({
        handle,
        tempBox: { ...startBox, scale: nextScale },
      });
      return;
    }
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

  // Gestor de toque duplo para mobile/tablet (300ms)
  const handleBoxTap = useCallback((_e: React.MouseEvent | React.TouchEvent) => {
    const now = Date.now();
    const timeSinceLast = now - lastTapRef.current;
    if (timeSinceLast < 320 && timeSinceLast > 40) {
      // Double tap detectado!
      setIsTextEditing(prev => !prev);
    }
    lastTapRef.current = now;
  }, []);

  const isNearTopEdge = currentBox.y < 8;
  const isRotAtBottom = isNearTopEdge;
  const isCyan = accentColor === 'cyan' || accentColor === '#06b6d4';
  const handleBorder = isCyan ? 'border-cyan-400' : 'border-amber-500';

  return (
    <div
      ref={boxRef}
      data-free-textbox="true"
      className={`absolute transition-shadow pointer-events-auto ${
        selected && editable
          ? isTextEditing
            ? isCyan
              ? 'ring-2 ring-dashed ring-cyan-400/80 rounded-xl'
              : 'ring-2 ring-dashed ring-amber-400/80 rounded-xl'
            : isCyan
            ? 'ring-2 ring-cyan-400 shadow-2xl rounded-xl'
            : 'ring-2 ring-amber-500 shadow-2xl rounded-xl'
          : editable
          ? isCyan
            ? 'hover:ring-2 hover:ring-cyan-400/70 cursor-pointer rounded-xl'
            : 'hover:ring-2 hover:ring-amber-400/70 cursor-pointer rounded-xl'
          : ''
      }`}
      style={{
        left: `${currentBox.x + currentBox.w / 2}%`,
        top: `${currentBox.y}%`,
        width: 'max-content',
        maxWidth: `${currentBox.w}%`,
        transform: `translateX(-50%) rotate(${currentBox.rot}deg)`,
        transformOrigin: 'center center',
        zIndex: selected ? 48 : 30,
        touchAction: selected && !isTextEditing ? 'none' : 'auto',
      }}
      onClick={(e) => {
        if (!selected && editable) {
          const sel = window.getSelection();
          if (sel && sel.toString().trim().length > 0) return; // está grifando texto: não seleciona a caixa
          e.stopPropagation();
          onSelect();
        }
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setIsTextEditing(true);
      }}
      onTouchEnd={handleBoxTap}
    >

      {/* ── BARRA FLUTUANTE DE COMANDO (QUANDO SELECIONADO) ── */}
      {selected && editable && (
        <div
          className={`absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-slate-950/95 border px-2.5 py-1 rounded-full shadow-2xl backdrop-blur-md z-60 pointer-events-auto whitespace-nowrap text-[11px] font-bold text-white transition-all select-none ${
            isCyan ? 'border-cyan-400/80' : 'border-amber-500/80'
          } ${isNearTopEdge ? '-bottom-11' : '-top-11'}`}
          style={{ transform: `translateX(-50%) rotate(-${currentBox.rot}deg)` }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <span className={`flex items-center gap-1 font-black ${isCyan ? 'text-cyan-300' : 'text-amber-400'}`}>
            <span>{isCyan ? '📄' : '👑'} {label}</span>
          </span>

          <div className="w-px h-3.5 bg-slate-700 mx-0.5" />

          {/* Alternador de Modo: Mover vs Grifar/Editar */}
          <button
            onClick={() => setIsTextEditing(prev => !prev)}
            className={`px-2 py-0.5 rounded-lg flex items-center gap-1 cursor-pointer transition-colors ${
              isTextEditing
                ? isCyan
                  ? 'bg-cyan-500 text-slate-950 font-black shadow-sm'
                  : 'bg-amber-500 text-slate-950 font-black shadow-sm'
                : 'bg-slate-800 text-slate-200 hover:text-white hover:bg-slate-700'
            }`}
            title={isTextEditing ? "Clique para voltar ao modo Mover" : "Clique para selecionar e grifar texto"}
          >
            {isTextEditing ? (
              <>
                <Type className="w-3 h-3 text-slate-950" />
                <span>✍️ Grifar Ativo</span>
              </>
            ) : (
              <>
                <Move className={`w-3 h-3 ${isCyan ? 'text-cyan-400' : 'text-amber-400'}`} />
                <span>🖐️ Mover</span>
              </>
            )}
          </button>

          {/* Controles Diretos de Aumentar / Diminuir Fonte (A- / A+) */}
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-700/80 px-1 py-0.5 rounded-lg">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const nextScale = Math.max(0.4, Math.round((currentBox.scale - 0.1) * 10) / 10);
                onCommit({ ...currentBox, scale: nextScale });
              }}
              className="px-1.5 py-0.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white font-black text-xs transition-colors cursor-pointer flex items-center gap-0.5"
              title="Diminuir tamanho da fonte (A-)"
            >
              <Minus className="w-2.5 h-2.5" />
              <span>A</span>
            </button>

            <span className={`text-[10px] font-mono font-black min-w-[28px] text-center ${isCyan ? 'text-cyan-300' : 'text-amber-400'}`}>
              {Math.round(currentBox.scale * 100)}%
            </span>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const nextScale = Math.min(4.0, Math.round((currentBox.scale + 0.1) * 10) / 10);
                onCommit({ ...currentBox, scale: nextScale });
              }}
              className="px-1.5 py-0.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white font-black text-xs transition-colors cursor-pointer flex items-center gap-0.5"
              title="Aumentar tamanho da fonte (A+)"
            >
              <span>A</span>
              <Plus className="w-2.5 h-2.5" />
            </button>
          </div>

          {/* Botão de Redefinir */}
          {onReset && (
            <button
              onClick={onReset}
              className={`p-1 rounded-lg text-slate-400 hover:bg-slate-800 cursor-pointer transition-colors ${
                isCyan ? 'hover:text-cyan-300' : 'hover:text-amber-300'
              }`}
              title="Redefinir posição, largura e tamanho original"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}

          {/* Medidas da caixa em tempo real */}
          <span className="text-[10px] text-slate-400 font-mono ml-0.5 hidden sm:inline">
            {Math.round(currentBox.w)}% larg
          </span>
        </div>
      )}

      {/* ── CONTEÚDO DO TEXTO COM ZOOM DA FONTE (COREL DRAW SCALING) ── */}
      <div
        ref={contentRef}
        className={`w-full relative ${
          isTextEditing || !selected ? 'select-text pointer-events-auto cursor-text' : 'select-none pointer-events-none'
        }`}
        style={{
          zoom: currentBox.scale,
          transformOrigin: 'center center',
          isolation: 'isolate',
          zIndex: 0,
          ...(selected && editable && !isTextEditing ? { pointerEvents: 'none' as const } : {}),
        }}
      >
        {children}
      </div>

      {/* ── ÁREA DE ARRASTE DO CORPO DA CAIXA (QUANDO NO MODO MOVER) ── */}
      {selected && editable && !isTextEditing && (
        <div
          className="absolute inset-0 cursor-grab active:cursor-grabbing pointer-events-auto"
          style={{ touchAction: 'none', zIndex: 40 }}
          onPointerDown={(e) => handlePointerDown(e, 'move')}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
      )}

      {/* ── ALÇAS E CONTROLE DE TRANSFORMAÇÃO (8 ALÇAS + PINO DE ROTAÇÃO) ── */}
      {selected && editable && !isTextEditing && (
        <>
          {/* Haste e Pino de Rotação (Giro no topo, ou inverte para baixo se encostado no topo) */}
          <div
            className={`absolute left-1/2 -translate-x-1/2 flex items-center pointer-events-auto cursor-grab active:cursor-grabbing select-none z-55 ${
              isRotAtBottom ? '-bottom-8 flex-col-reverse' : '-top-8 flex-col'
            }`}
            style={{ touchAction: 'none' }}
          >
            <div
              data-text-handle="rot"
              onPointerDown={(e) => handlePointerDown(e, 'rot')}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className="w-9 h-9 md:w-7 md:h-7 flex items-center justify-center p-0.5 cursor-grab active:cursor-grabbing"
              title="Girar texto livremente • Segure Shift para travar a cada 15°"
            >
              <div className="w-5.5 h-5.5 md:w-5 md:h-5 rounded-full bg-emerald-500 hover:bg-emerald-400 border-2 border-white shadow-xl flex items-center justify-center transition-transform hover:scale-125">
                <RotateCw className="w-3 h-3 md:w-2.5 md:h-2.5 text-slate-950" />
              </div>
            </div>
            <div className="w-0.5 h-2 bg-emerald-400" />
          </div>

          {/* 4 CANTOS (TEXTO ARTÍSTICO • ESCALA FONTE PROPORCIONAL) */}
          {/* NW */}
          <div
            data-text-handle="nw"
            onPointerDown={(e) => handlePointerDown(e, 'nw')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="absolute -top-3.5 -left-3.5 w-9 h-9 md:w-7 md:h-7 flex items-center justify-center pointer-events-auto cursor-nwse-resize z-50"
            style={{ touchAction: 'none' }}
            title="Redimensionar proporcionalmente • Altera o tamanho da fonte"
          >
            <div className={`w-3.5 h-3.5 bg-white border-2 ${handleBorder} rounded-sm shadow-md hover:scale-125 transition-transform`} />
          </div>

          {/* NE */}
          <div
            data-text-handle="ne"
            onPointerDown={(e) => handlePointerDown(e, 'ne')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="absolute -top-3.5 -right-3.5 w-9 h-9 md:w-7 md:h-7 flex items-center justify-center pointer-events-auto cursor-nesw-resize z-50"
            style={{ touchAction: 'none' }}
            title="Redimensionar proporcionalmente • Altera o tamanho da fonte"
          >
            <div className={`w-3.5 h-3.5 bg-white border-2 ${handleBorder} rounded-sm shadow-md hover:scale-125 transition-transform`} />
          </div>

          {/* SW */}
          <div
            data-text-handle="sw"
            onPointerDown={(e) => handlePointerDown(e, 'sw')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="absolute -bottom-3.5 -left-3.5 w-9 h-9 md:w-7 md:h-7 flex items-center justify-center pointer-events-auto cursor-nesw-resize z-50"
            style={{ touchAction: 'none' }}
            title="Redimensionar proporcionalmente • Altera o tamanho da fonte"
          >
            <div className={`w-3.5 h-3.5 bg-white border-2 ${handleBorder} rounded-sm shadow-md hover:scale-125 transition-transform`} />
          </div>

          {/* SE */}
          <div
            data-text-handle="se"
            onPointerDown={(e) => handlePointerDown(e, 'se')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="absolute -bottom-3.5 -right-3.5 w-9 h-9 md:w-7 md:h-7 flex items-center justify-center pointer-events-auto cursor-nwse-resize z-50"
            style={{ touchAction: 'none' }}
            title="Redimensionar proporcionalmente • Altera o tamanho da fonte"
          >
            <div className={`w-3.5 h-3.5 bg-white border-2 ${handleBorder} rounded-sm shadow-md hover:scale-125 transition-transform`} />
          </div>

          {/* 4 LADOS (TEXTO DE PARÁGRAFO • REFLUXO / LARGURA SEM ALTERAR FONTE) */}
          {/* E (Direita) */}
          <div
            data-text-handle="e"
            onPointerDown={(e) => handlePointerDown(e, 'e')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="absolute top-1/2 -right-3.5 -translate-y-1/2 w-9 h-9 md:w-7 md:h-7 flex items-center justify-center pointer-events-auto cursor-ew-resize z-50"
            style={{ touchAction: 'none' }}
            title="Ajustar largura da caixa de texto (o texto reflui sem mudar o tamanho da fonte)"
          >
            <div className={`w-2.5 h-5 bg-white border-2 ${handleBorder} rounded-sm shadow-md hover:scale-125 transition-transform`} />
          </div>

          {/* W (Esquerda) */}
          <div
            data-text-handle="w"
            onPointerDown={(e) => handlePointerDown(e, 'w')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="absolute top-1/2 -left-3.5 -translate-y-1/2 w-9 h-9 md:w-7 md:h-7 flex items-center justify-center pointer-events-auto cursor-ew-resize z-50"
            style={{ touchAction: 'none' }}
            title="Ajustar largura da caixa de texto (o texto reflui sem mudar o tamanho da fonte)"
          >
            <div className={`w-2.5 h-5 bg-white border-2 ${handleBorder} rounded-sm shadow-md hover:scale-125 transition-transform`} />
          </div>

          {/* N (Topo) */}
          <div
            data-text-handle="n"
            onPointerDown={(e) => handlePointerDown(e, 'n')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="absolute -top-3.5 left-1/2 -translate-x-1/2 w-9 h-9 md:w-7 md:h-7 flex items-center justify-center pointer-events-auto cursor-ns-resize z-50"
            style={{ touchAction: 'none' }}
            title="Ajustar posição vertical"
          >
            <div className={`w-5 h-2.5 bg-white border-2 ${handleBorder} rounded-sm shadow-md hover:scale-125 transition-transform`} />
          </div>

          {/* S (Base) */}
          <div
            data-text-handle="s"
            onPointerDown={(e) => handlePointerDown(e, 's')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="absolute -bottom-3.5 left-1/2 -translate-x-1/2 w-9 h-9 md:w-7 md:h-7 flex items-center justify-center pointer-events-auto cursor-ns-resize z-50"
            style={{ touchAction: 'none' }}
            title="Ajuste vertical fino"
          >
            <div className={`w-5 h-2.5 bg-white border-2 ${handleBorder} rounded-sm shadow-md hover:scale-125 transition-transform`} />
          </div>
        </>
      )}
    </div>
  );
};
