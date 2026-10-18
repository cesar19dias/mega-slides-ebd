import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Crop,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Check,
  Crosshair,
  Eraser,
} from 'lucide-react';
import type { ImageBox, EBDLessonPreparation, ProjectorItem } from '../types';
import { TextHighlightToolbar } from './TextHighlightToolbar';
import { FreeImageBox } from './FreeImageBox';
import { parseBiblicalTextSections } from '../services/biblicalTextParser';

export interface ProjectorStageProps {
  projectorStageRef: React.RefObject<HTMLDivElement | null>;
  isLayoutEditMode: boolean;
  customBg: string | null;
  imageSelected: boolean;
  setImageSelected: (val: boolean) => void;
  handleSlideMouseUp: () => void;

  hlToolbar: { x: number; y: number; text: string } | null;
  setHlToolbar: (val: { x: number; y: number; text: string } | null) => void;
  applyHighlight: (color: string, hlStyle?: 'fill' | 'outline' | 'text' | 'underline' | 'dotted') => void;
  removeHighlight: () => void;
  hasSlideHighlights: boolean;
  clearCurrentSlideHighlights: () => void;

  isExporting: string | null;
  projectorIndex: number;
  setProjectorIndex: (idx: number | ((prev: number) => number)) => void;
  projectorItems: ProjectorItem[];
  currentProjectorItem?: ProjectorItem;

  isCanvaCropping: boolean;
  setIsCanvaCropping: (val: boolean) => void;
  occupyFullArea: () => void;
  occupyEntireStage: () => void;
  slideImageCrops: Record<string | number, { panX: number; panY: number; zoom: number }>;
  setSingleImageCrop: (idx: number, crop: { panX: number; panY: number; zoom: number }) => void;
  toggleImageFit: (idx: number) => void;
  imageFit: 'cover' | 'contain';
  resetSlideImageCrop: () => void;

  showAlignmentGuides: boolean;
  guideHPos: number;
  setGuideHPos: (val: number | ((prev: number) => number)) => void;
  guideVPos: number;
  setGuideVPos: (val: number | ((prev: number) => number)) => void;
  handleGuideDragStart: (e: React.MouseEvent | React.TouchEvent, axis: 'h' | 'v') => void;
  toggleAlignmentGuides: () => void;

  curImageSrc?: string | null;
  curBox: ImageBox;
  commitBox: (b: ImageBox) => void;

  slideBodyWidths: Record<string | number, number>;
  handleBodyResizeStart: (e: React.MouseEvent | React.TouchEvent, side: 'left' | 'right') => void;
  resetSlideBodyWidth: () => void;

  currentSlideScale: number;
  currentTitleScale: number;
  currentBodyScale: number;
  titlePos: { x: number; y: number };
  bodyPos: { x: number; y: number };
  makeDragStyle: (pos: { x: number; y: number }, kind: 'title' | 'body' | 'image') => React.CSSProperties;
  handleElementDragStart: (e: React.MouseEvent | React.TouchEvent, kind: 'title' | 'body' | 'image') => void;

  renderHL: (text: string | undefined, forcedColor?: string) => React.ReactNode;
  bodyTextColor: 'black' | 'white';
  lesson: EBDLessonPreparation;
  getResponsiveBodyTextClass: (text: string | undefined, isEnfase?: boolean) => string;
}

const PROPER_NOUNS = [
  'Deus', 'Jesus', 'Cristo', 'Espírito', 'Santo', 'Senhor', 'Pai', 'Filho',
  'Paulo', 'Pedro', 'João', 'Ananias', 'Félix', 'Tértulo', 'Festos', 'Agripa',
  'Sinédrio', 'Jerusalém', 'Israel', 'Evangelho', 'Bíblia', 'Trófimo', 'Ásia',
  'Roma', 'Lei', 'EBD', 'MegaEBD', 'Igreja'
];

function toCaixaBaixa(text: string) {
  if (!text) return '';
  let res = text.trim();
  res = res.charAt(0).toUpperCase() + res.slice(1).toLowerCase();
  PROPER_NOUNS.forEach(noun => {
    const regex = new RegExp(`\\b${noun}\\b`, 'gi');
    res = res.replace(regex, noun);
  });
  return res;
}

function parseRomanToNum(val: string): string {
  if (!val) return '';
  const s = val.trim().toUpperCase();
  if (s === 'I') return '1';
  if (s === 'II') return '2';
  if (s === 'III') return '3';
  if (s === 'IV') return '4';
  if (s === 'V') return '5';
  if (s === 'VI') return '6';
  return val;
}

export const ProjectorStage: React.FC<ProjectorStageProps> = ({
  projectorStageRef,
  isLayoutEditMode,
  customBg,
  imageSelected,
  setImageSelected,
  handleSlideMouseUp,

  hlToolbar,
  setHlToolbar,
  applyHighlight,
  removeHighlight,
  hasSlideHighlights,
  clearCurrentSlideHighlights,

  isExporting,
  projectorIndex,
  setProjectorIndex,
  projectorItems,
  currentProjectorItem,

  isCanvaCropping,
  setIsCanvaCropping,
  occupyFullArea,
  occupyEntireStage,
  slideImageCrops,
  setSingleImageCrop,
  toggleImageFit,
  imageFit,
  resetSlideImageCrop,

  showAlignmentGuides,
  guideHPos,
  setGuideHPos,
  guideVPos,
  setGuideVPos,
  handleGuideDragStart,
  toggleAlignmentGuides,

  curImageSrc,
  curBox,
  commitBox,

  slideBodyWidths,
  handleBodyResizeStart,
  resetSlideBodyWidth,

  currentSlideScale,
  currentTitleScale,
  currentBodyScale,
  titlePos,
  bodyPos,
  makeDragStyle,
  handleElementDragStart,

  renderHL,
  bodyTextColor,
  lesson,
  getResponsiveBodyTextClass,
}) => {
  if (!currentProjectorItem) return null;

  // Função auxiliar para renderizar as alças de largura e badge do texto no modo "Mover"
  const renderBodyResizeHandles = () => {
    if (!isLayoutEditMode) return null;
    const curW = slideBodyWidths[projectorIndex] ?? 100;
    return (
      <>
        {/* Badge superior informando largura da caixa de texto */}
        <div
          className="absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] font-black px-2.5 py-0.5 rounded-full z-50 pointer-events-none shadow-md flex items-center gap-1.5 whitespace-nowrap"
          style={{ backgroundColor: '#06b6d4', color: '#0f172a' }}
        >
          <span>📄 Texto ({curW}%)</span>
          <span className="opacity-75">• arraste ou puxe as laterais</span>
        </div>

        {/* Alça Esquerda para Redimensionar Largura */}
        <div
          onMouseDown={(e) => handleBodyResizeStart(e, 'left')}
          onTouchStart={(e) => handleBodyResizeStart(e, 'left')}
          onDoubleClick={(e) => { e.stopPropagation(); resetSlideBodyWidth(); }}
          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-12 bg-white border-2 border-cyan-500 rounded-full shadow-lg z-50 cursor-ew-resize hover:scale-125 transition-transform flex items-center justify-center group"
          title="Arrastar para ajustar largura do texto • Duplo clique para 100%"
        >
          <div className="w-0.5 h-5 bg-cyan-600 rounded-full" />
        </div>

        {/* Alça Direita para Redimensionar Largura */}
        <div
          onMouseDown={(e) => handleBodyResizeStart(e, 'right')}
          onTouchStart={(e) => handleBodyResizeStart(e, 'right')}
          onDoubleClick={(e) => { e.stopPropagation(); resetSlideBodyWidth(); }}
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-4 h-12 bg-white border-2 border-cyan-500 rounded-full shadow-lg z-50 cursor-ew-resize hover:scale-125 transition-transform flex items-center justify-center group"
          title="Arrastar para ajustar largura do texto • Duplo clique para 100%"
        >
          <div className="w-0.5 h-5 bg-cyan-600 rounded-full" />
        </div>
      </>
    );
  };

  return (
    <div
      ref={projectorStageRef}
      className={`slide-stage-wrapper ${isLayoutEditMode ? 'layout-mode' : ''} rounded-3xl overflow-hidden shadow-2xl border border-slate-300 relative min-h-[520px] text-slate-900 flex flex-col justify-between p-6 pt-3 pb-4`}
      style={customBg ? { backgroundImage: `url(${customBg})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: 'transparent' } : { backgroundColor: 'white' }}
      onPointerDown={(e) => {
        if (!(e.target as HTMLElement).closest('[data-image-box]')) {
          setImageSelected(false);
        }
      }}
      onMouseUp={handleSlideMouseUp}
      onTouchEnd={handleSlideMouseUp}
    >
      {/* Toolbar de Destaque de Texto (aparece ao selecionar texto no slide) */}
      {hlToolbar && (
        <TextHighlightToolbar
          x={hlToolbar.x}
          y={hlToolbar.y}
          selectedText={hlToolbar.text}
          onApply={applyHighlight}
          onRemove={removeHighlight}
          onClose={() => { setHlToolbar(null); window.getSelection()?.removeAllRanges(); }}
          onClearSlide={hasSlideHighlights ? clearCurrentSlideHighlights : undefined}
        />
      )}

      {/* Botão Flutuante Rápido de Limpar Cores deste Slide no Palco */}
      {!isExporting && hasSlideHighlights && (
        <button
          onClick={clearCurrentSlideHighlights}
          className="absolute top-4 right-4 z-40 bg-rose-950/90 hover:bg-rose-900 text-rose-200 hover:text-white px-3 py-1.5 rounded-xl border border-rose-500/70 shadow-2xl backdrop-blur-md text-xs font-black transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5 cursor-pointer group"
          title={`Limpar todas as cores e destaques exclusivamente deste slide (${projectorIndex + 1})`}
        >
          <Eraser className="w-3.5 h-3.5 text-rose-400 group-hover:text-rose-200" />
          <span>🧹 Limpar Cores do Slide</span>
        </button>
      )}

      {/* Setas Laterais de Navegação no Próprio Slide (Modo Projetor) */}
      {!isExporting && (
        <>
          <button
            onClick={() => setProjectorIndex(prev => Math.max(0, prev - 1))}
            disabled={projectorIndex === 0}
            title="Slide Anterior (Seta Esquerda)"
            className="absolute left-3 top-1/2 -translate-y-1/2 z-40 bg-slate-950/60 hover:bg-slate-900/90 text-white p-3 rounded-full shadow-2xl border border-white/20 backdrop-blur-md transition-all duration-200 hover:scale-110 active:scale-95 disabled:opacity-0 disabled:pointer-events-none group cursor-pointer"
          >
            <ChevronLeft className="w-6 h-6 text-white group-hover:text-yellow-400 transition-colors" />
          </button>

          <button
            onClick={() => setProjectorIndex(prev => Math.min(projectorItems.length - 1, prev + 1))}
            disabled={projectorIndex === projectorItems.length - 1}
            title="Próximo Slide (Seta Direita)"
            className="absolute right-3 top-1/2 -translate-y-1/2 z-40 bg-slate-950/60 hover:bg-slate-900/90 text-white p-3 rounded-full shadow-2xl border border-white/20 backdrop-blur-md transition-all duration-200 hover:scale-110 active:scale-95 disabled:opacity-0 disabled:pointer-events-none group cursor-pointer"
          >
            <ChevronRight className="w-6 h-6 text-white group-hover:text-yellow-400 transition-colors" />
          </button>
        </>
      )}

      {/* Barra Flutuante de Recorte Fluido Estilo Canva no Palco */}
      {isCanvaCropping && (
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-950/95 border-2 border-cyan-400 shadow-2xl shadow-cyan-500/30 rounded-2xl px-4 py-2 backdrop-blur-xl flex flex-wrap items-center gap-3 text-white animate-in fade-in slide-in-from-top-2 duration-200 pointer-events-auto"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 pr-2 border-r border-slate-700">
            <Crop className="w-4 h-4 text-cyan-400 animate-pulse" />
            <span className="text-xs font-black text-cyan-300 uppercase tracking-wider">Recorte Canva</span>
          </div>

          {/* Botão de Encaixe na Área Branca */}
          <button
            onClick={occupyFullArea}
            className="text-xs font-black text-white px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 shadow-md border border-emerald-400 transition-all cursor-pointer flex items-center gap-1.5 hover:scale-105 active:scale-95"
            title="Encaixar a imagem perfeitamente na área branca abaixo do cabeçalho"
          >
            <span>📐 Área Branca (Embaixo)</span>
          </button>
          <button
            onClick={occupyEntireStage}
            className="text-xs font-bold text-slate-300 hover:text-white px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 hover:bg-slate-800 transition-all cursor-pointer flex items-center gap-1"
            title="Cobrir a tela inteira (100% de todo o slide)"
          >
            <span>🖥️ Tela Toda</span>
          </button>

          {/* Slider de Zoom no Quadro */}
          <div className="flex items-center gap-1.5 bg-slate-900/90 px-2.5 py-1 rounded-xl border border-cyan-500/40">
            <span className="text-[10px] font-bold text-slate-300 uppercase">Zoom:</span>
            <button
              onClick={() => {
                const curCrop = slideImageCrops[projectorIndex] ?? { panX: 0, panY: 0, zoom: 1.0 };
                const nextZ = Math.max(1.0, Math.round((curCrop.zoom - 0.1) * 10) / 10);
                setSingleImageCrop(projectorIndex, { ...curCrop, zoom: nextZ });
              }}
              className="p-1 rounded bg-slate-800 text-cyan-400 hover:bg-slate-700 text-xs font-bold cursor-pointer"
              title="Reduzir zoom (-)"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <input
              type="range"
              min="100"
              max="300"
              step="5"
              value={Math.round((slideImageCrops[projectorIndex]?.zoom ?? 1.0) * 100)}
              onChange={(e) => {
                const zVal = parseFloat(e.target.value) / 100;
                const curCrop = slideImageCrops[projectorIndex] ?? { panX: 0, panY: 0, zoom: 1.0 };
                setSingleImageCrop(projectorIndex, { ...curCrop, zoom: zVal });
              }}
              className="w-20 md:w-28 accent-cyan-400 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
              title="Ajuste o zoom da imagem no enquadramento"
            />
            <button
              onClick={() => {
                const curCrop = slideImageCrops[projectorIndex] ?? { panX: 0, panY: 0, zoom: 1.0 };
                const nextZ = Math.min(3.0, Math.round((curCrop.zoom + 0.1) * 10) / 10);
                setSingleImageCrop(projectorIndex, { ...curCrop, zoom: nextZ });
              }}
              className="p-1 rounded bg-slate-800 text-cyan-400 hover:bg-slate-700 text-xs font-bold cursor-pointer"
              title="Aumentar zoom (+)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-mono font-black text-cyan-200 min-w-[36px] text-center">
              {Math.round((slideImageCrops[projectorIndex]?.zoom ?? 1.0) * 100)}%
            </span>
          </div>

          {/* Preencher vs Ajustar */}
          <button
            onClick={() => toggleImageFit(projectorIndex)}
            className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer border ${
              imageFit === 'contain'
                ? 'bg-purple-900/60 text-purple-200 border-purple-400'
                : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
            }`}
            title="Alternar entre Preencher o quadro ou Ajustar foto inteira"
          >
            {imageFit === 'contain' ? '🔍 Inteira' : '🖼️ Preencher'}
          </button>

          {/* Resetar Recorte */}
          <button
            onClick={resetSlideImageCrop}
            className="text-xs font-bold text-slate-300 hover:text-white px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-700 hover:bg-slate-800 transition-all cursor-pointer flex items-center gap-1"
            title="Restaurar enquadramento original (centralizado)"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span>Resetar</span>
          </button>

          {/* Concluir Recorte */}
          <button
            onClick={() => setIsCanvaCropping(false)}
            className="text-xs font-black text-white px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 shadow-lg shadow-cyan-600/30 border border-cyan-300 transition-all cursor-pointer flex items-center gap-1.5 hover:scale-105 active:scale-95"
            title="Concluir e fixar o recorte da imagem (ou pressione ESC)"
          >
            <Check className="w-4 h-4 text-white" />
            <span>Concluir</span>
          </button>
        </div>
      )}

      {/* LINHAS-GUIA DE ALINHAMENTO HORIZONTAL E VERTICAL (TEXTOS E TÍTULOS) */}
      {!isExporting && (showAlignmentGuides || isLayoutEditMode) && (
        <div className="absolute inset-0 pointer-events-none z-35 overflow-hidden no-print select-none">
          {/* Linhas centrais de referência sutis (50% X e 50% Y) */}
          <div
            className="absolute left-0 right-0 border-t border-dashed border-cyan-400/20 pointer-events-none"
            style={{ top: '50%' }}
          />
          <div
            className="absolute top-0 bottom-0 border-l border-dashed border-amber-400/20 pointer-events-none"
            style={{ left: '50%' }}
          />

          {/* Margem Segura do Projetor (Safe Margin 8%) */}
          <div
            className="absolute inset-[8%] border border-dashed border-slate-400/20 rounded-2xl pointer-events-none"
          />

          {/* LINHA GUIA HORIZONTAL (EIXO Y) */}
          <div
            className="absolute left-0 right-0 z-40 transition-none pointer-events-none"
            style={{ top: `${guideHPos}%` }}
          >
            <div className="w-full border-t-2 border-dashed border-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.9)]" />

            {/* Alça arrastável interativa da Linha Horizontal */}
            <div
              onMouseDown={(e) => handleGuideDragStart(e, 'h')}
              onTouchStart={(e) => handleGuideDragStart(e, 'h')}
              onDoubleClick={() => setGuideHPos(50)}
              className="absolute left-4 -translate-y-1/2 pointer-events-auto bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] md:text-xs font-black px-2.5 py-1 rounded-full shadow-lg border border-cyan-300 flex items-center gap-1.5 cursor-ns-resize backdrop-blur-md active:scale-95 group transition-transform"
              title="Arrastar Guia Horizontal (Y) para cima/baixo • Duplo clique para 50%"
            >
              <span>↔ Guia H: {guideHPos}%</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setGuideHPos(50); }}
                className="opacity-75 hover:opacity-100 hover:text-cyan-200 text-[9px] bg-cyan-800/80 px-1 rounded cursor-pointer"
                title="Centralizar em 50%"
              >
                50%
              </button>
            </div>
          </div>

          {/* LINHA GUIA VERTICAL (EIXO X) */}
          <div
            className="absolute top-0 bottom-0 z-40 transition-none pointer-events-none"
            style={{ left: `${guideVPos}%` }}
          >
            <div className="h-full border-l-2 border-dashed border-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.9)]" />

            {/* Alça arrastável interativa da Linha Vertical */}
            <div
              onMouseDown={(e) => handleGuideDragStart(e, 'v')}
              onTouchStart={(e) => handleGuideDragStart(e, 'v')}
              onDoubleClick={() => setGuideVPos(50)}
              className="absolute top-4 -translate-x-1/2 pointer-events-auto bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] md:text-xs font-black px-2.5 py-1 rounded-full shadow-lg border border-amber-300 flex items-center gap-1.5 cursor-ew-resize backdrop-blur-md active:scale-95 group transition-transform"
              title="Arrastar Guia Vertical (X) para esquerda/direita • Duplo clique para 50%"
            >
              <span>↕ Guia V: {guideVPos}%</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setGuideVPos(50); }}
                className="opacity-75 hover:opacity-100 hover:text-amber-900 text-[9px] bg-amber-600/60 px-1 rounded cursor-pointer font-bold"
                title="Centralizar em 50%"
              >
                50%
              </button>
            </div>
          </div>

          {/* Mini Menu Flutuante de Alinhamento Rápido das Guias */}
          <div
            className="absolute bottom-3 left-4 pointer-events-auto z-45 bg-slate-950/90 border border-cyan-500/50 rounded-2xl px-3 py-1.5 shadow-2xl backdrop-blur-md flex items-center gap-2 text-white text-[11px] font-bold"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <span className="text-cyan-300 font-black flex items-center gap-1">
              <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
              <span>Guias:</span>
            </span>
            <button
              onClick={() => { setGuideHPos(50); setGuideVPos(50); }}
              className="hover:text-cyan-300 bg-slate-900 hover:bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-700 cursor-pointer transition-colors"
              title="Centralizar ambas as guias no meio exato do slide"
            >
              Centro (50%)
            </button>
            <button
              onClick={() => setGuideHPos(22)}
              className="hover:text-cyan-300 bg-slate-900 hover:bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-700 cursor-pointer transition-colors"
              title="Posicionar guia horizontal na altura típica do Título (22%)"
            >
              Topo (22%)
            </button>
            <button
              onClick={() => setGuideHPos(48)}
              className="hover:text-cyan-300 bg-slate-900 hover:bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-700 cursor-pointer transition-colors"
              title="Posicionar guia horizontal no Corpo de Texto (48%)"
            >
              Texto (48%)
            </button>
            <button
              onClick={toggleAlignmentGuides}
              className="text-slate-400 hover:text-rose-400 px-1.5 py-0.5 cursor-pointer text-xs"
              title="Ocultar guias"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* 🖼️ Imagem Livre estilo Corel Draw (alças nos 8 cantos, rotação, proporção, camadas) */}
      {curImageSrc && (
        <FreeImageBox
          src={curImageSrc}
          box={curBox}
          selected={imageSelected && !isExporting}
          editable={!isExporting && (isLayoutEditMode || imageSelected)}
          stageRef={projectorStageRef}
          onSelect={() => setImageSelected(true)}
          onCommit={commitBox}
        />
      )}

      {/* Bloco Central do Slide */}
      {(() => {
        // 1. CAPA DA LIÇÃO (SLIDE 1)
        if (currentProjectorItem.type === 'cover') {
          const coverBadge = currentProjectorItem.badgeText || lesson.metadata.lessonNumber || 'LIÇÃO 10';
          return (
            <div className="relative z-10 w-full h-full max-w-full px-3 md:px-6 mx-auto flex flex-col justify-between items-center my-auto py-2 font-gotham pointer-events-none" style={{ zoom: currentSlideScale } as React.CSSProperties}>
              {/* ── CAPA: TÍTULO (ARRASTÁVEL) ── */}
              <div
                style={makeDragStyle(titlePos, 'title')}
                onMouseDown={isLayoutEditMode ? (e) => handleElementDragStart(e, 'title') : undefined}
                onTouchStart={isLayoutEditMode ? (e) => handleElementDragStart(e, 'title') : undefined}
                className="w-full shrink-0 relative pointer-events-auto"
              >
                {isLayoutEditMode && (
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-black px-2 py-0.5 rounded-full z-50 pointer-events-none"
                    style={{ backgroundColor: '#f59e0b', color: '#0f172a', whiteSpace: 'nowrap' }}>
                    👑 Título — arraste
                  </div>
                )}
                <div className="w-full flex flex-col items-center justify-center font-gotham font-bold min-h-20 md:min-h-24 h-auto py-2 mt-5 md:mt-6 pt-2 pl-[18%] pr-6">
                  <span className="text-xl md:text-3xl lg:text-4xl font-bold text-white tracking-wider block text-center drop-shadow-sm uppercase" style={{ fontFamily: "'Gotham', 'Gotham Medium', sans-serif", fontWeight: 700, zoom: currentTitleScale } as React.CSSProperties}>
                    {coverBadge}
                  </span>
                </div>
              </div>

              {/* ── CAPA: CORPO (ARRASTÁVEL) ── */}
              <div
                style={makeDragStyle(bodyPos, 'body')}
                onMouseDown={isLayoutEditMode ? (e) => handleElementDragStart(e, 'body') : undefined}
                onTouchStart={isLayoutEditMode ? (e) => handleElementDragStart(e, 'body') : undefined}
                className="flex-1 w-full relative"
              >
                {renderBodyResizeHandles()}
                <div className="text-layer w-full relative z-30 flex flex-col items-center justify-center text-center px-6 py-4 mt-12 md:mt-16 space-y-4 my-auto">
                  <h1 className="text-2xl md:text-4xl lg:text-5xl font-black text-yellow-400 uppercase tracking-tight leading-tight w-full max-w-full font-sans drop-shadow-sm" style={{ zoom: currentTitleScale } as React.CSSProperties}>
                    {renderHL(currentProjectorItem.title, '#facc15')}
                  </h1>
                  {currentProjectorItem.subtitle && (
                    <>
                      <div className="w-4/5 max-w-2xl border-b border-slate-200/40 my-3 mx-auto" />
                      <p className="text-base md:text-xl lg:text-2xl font-bold text-slate-200 w-full max-w-full font-sans leading-relaxed" style={{ zoom: currentBodyScale } as React.CSSProperties}>
                        {renderHL(currentProjectorItem.subtitle, '#e2e8f0')}
                      </p>
                    </>
                  )}
                </div>
              </div>

              <div className="w-full shrink-0 h-8" />
            </div>
          );
        }

        // 2. SLIDE EXTRA PERSONALIZADO
        if (currentProjectorItem.type === 'extra') {
          return (
            <div className="relative z-10 w-full h-full max-w-full px-3 md:px-6 mx-auto flex flex-col justify-between items-center my-auto py-2 font-gotham pointer-events-none" style={{ zoom: currentSlideScale } as React.CSSProperties}>
              {/* ── EXTRA: TÍTULO (ARRASTÁVEL) ── */}
              <div
                style={makeDragStyle(titlePos, 'title')}
                onMouseDown={isLayoutEditMode ? (e) => handleElementDragStart(e, 'title') : undefined}
                onTouchStart={isLayoutEditMode ? (e) => handleElementDragStart(e, 'title') : undefined}
                className="w-full shrink-0 relative pointer-events-auto"
              >
                {isLayoutEditMode && (
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-black px-2 py-0.5 rounded-full z-50 pointer-events-none"
                    style={{ backgroundColor: '#f59e0b', color: '#0f172a', whiteSpace: 'nowrap' }}>
                    👑 Título — arraste
                  </div>
                )}
                <div className="w-full flex flex-col items-center justify-center font-gotham font-bold min-h-14 h-auto py-2 mt-5 md:mt-6 pt-2 pl-[18%] pr-6">
                  {currentProjectorItem.title && (
                    <span className="text-xl md:text-3xl lg:text-4xl font-bold text-white tracking-wider block text-center drop-shadow-sm uppercase" style={{ fontFamily: "'Gotham', 'Gotham Medium', sans-serif", fontWeight: 700, zoom: currentTitleScale } as React.CSSProperties}>
                      {renderHL(currentProjectorItem.title, '#ffffff')}
                    </span>
                  )}
                  {currentProjectorItem.reference && (
                    <span className="text-base md:text-xl lg:text-2xl font-bold text-yellow-400 tracking-wider block text-center mt-1" style={{ zoom: currentTitleScale } as React.CSSProperties}>
                      {renderHL(currentProjectorItem.reference, '#facc15')}
                    </span>
                  )}
                </div>
              </div>

              {/* ── EXTRA: CORPO (ARRASTÁVEL) ── */}
              <div
                style={makeDragStyle(bodyPos, 'body')}
                onMouseDown={isLayoutEditMode ? (e) => handleElementDragStart(e, 'body') : undefined}
                onTouchStart={isLayoutEditMode ? (e) => handleElementDragStart(e, 'body') : undefined}
                className="w-full flex-1 flex flex-col min-h-0 relative"
              >
                {renderBodyResizeHandles()}
                <div className="w-full flex-1 flex flex-col justify-center items-center relative min-h-0">
                  <div className="text-layer w-full relative z-30 flex-1 flex flex-col justify-center items-center min-h-0 px-4 py-4 space-y-3 text-center max-h-[460px] overflow-y-auto custom-scrollbar">
                    {currentProjectorItem.projetorText ? (
                      <p className={`font-sans text-center w-full max-w-full break-words whitespace-pre-line ${getResponsiveBodyTextClass(currentProjectorItem.projetorText)}`} style={{ zoom: currentBodyScale, textWrap: 'pretty', wordBreak: 'break-word' } as React.CSSProperties}>
                        {renderHL(currentProjectorItem.projetorText)}
                      </p>
                    ) : (
                      !currentProjectorItem.title && (
                        <p className="text-2xl md:text-3xl font-extrabold text-slate-500 text-center italic">
                          Slide em branco — edite o título e texto acima ✏️
                        </p>
                      )
                    )}
                  </div>
                </div>
              </div>

              <div className="w-full shrink-0 h-8" />
            </div>
          );
        }

        const badgeText = currentProjectorItem.badgeText || 'MEGA EBD';

        // Suporta: TÓPICO X - SUBTÓPICO Y: TÍTULO ou SUBTÓPICO Y: TÍTULO ou TÓPICO X: TÍTULO
        const fullTopicSubMatch = badgeText.match(/^(?:TÓPICO\s*([I|V|X|\d]+)\s*[\:\-\—\–]?\s*)?(?:SUBTÓPICO\s*([\d|A-Z]+)|SUBT\.?\s*([\d|A-Z]+))\s*[:\—\-]?\s*(.+)$/i);
        const topMatch = badgeText.match(/^(?:TÓPICO\s*([I|V|X|\d]+))\s*[:\—\-]?\s*(.+)$/i);

        let mainTitle = badgeText;
        let isSubtopic = false;
        let topicNumStr = '';
        let subNumStr = '';

        if (fullTopicSubMatch) {
          topicNumStr = fullTopicSubMatch[1] || '';
          subNumStr = fullTopicSubMatch[2] || fullTopicSubMatch[3] || '';
          mainTitle = fullTopicSubMatch[4].trim();
          isSubtopic = true;
        } else if (topMatch) {
          topicNumStr = topMatch[1] || '';
          mainTitle = topMatch[2].trim();
          isSubtopic = false;
        } else if (badgeText.toUpperCase().includes('SUBT') || badgeText.toUpperCase().includes('SUBTÓPICO')) {
          isSubtopic = true;
        }

        if (!topicNumStr) {
          const mTop = badgeText.match(/tÓpico\s*([I|V|X|\d]+)/i);
          if (mTop) topicNumStr = mTop[1];
        }
        if (isSubtopic && !subNumStr) {
          const mSub = badgeText.match(/subtÓpico\s*([\d|A-Z]+)/i) || badgeText.match(/subt\.?\s*([\d|A-Z]+)/i);
          if (mSub) subNumStr = mSub[1];
        }

        const formattedTopicNum = parseRomanToNum(topicNumStr);

        // Remove qualquer prefixo legado tipo "Tópico 1", "Subtópico 1", "Subt.", e referências do tipo (vv.1,2) ou numerações duplicadas
        const cleanTitle = mainTitle
          .replace(/^(tÓpico\s*[\d|I|V|X]*\s*[\:\–\—\-]?\s*subtópico\s*[\d|A-Z]*|subtópico\s*[\d|A-Z]*|subt\.?\s*[\d|A-Z]*|tópico\s*[\d|I|V|X]*)\s*[\:\.\—\-]?\s*/i, '')
          .replace(/\s*\(\s*v{1,2}\.?\s*[\d\s\,\–\-\.\;]+\)/gi, '')
          .replace(/^\d+(\.\d+)?[\.\s\-\:]+\s*/, '')
          .trim();

        let formattedTitle = isSubtopic ? toCaixaBaixa(cleanTitle) : cleanTitle.toUpperCase();

        if (isSubtopic) {
          if (formattedTopicNum && subNumStr) {
            formattedTitle = `${formattedTopicNum}.${subNumStr}. ${formattedTitle}`;
          } else if (subNumStr) {
            formattedTitle = `${subNumStr}. ${formattedTitle}`;
          }
        } else if (formattedTopicNum) {
          formattedTitle = `${formattedTopicNum}. ${formattedTitle}`;
        }

        return (
          <div className="relative z-10 w-full h-full max-w-full px-3 md:px-6 mx-auto flex flex-col justify-between items-center my-auto py-2 font-gotham pointer-events-none" style={{ zoom: currentSlideScale } as React.CSSProperties}>
            {/* ── TÍTULO PRINCIPAL (ARRASTÁVEL) ── */}
            <div
              style={makeDragStyle(titlePos, 'title')}
              onMouseDown={isLayoutEditMode ? (e) => handleElementDragStart(e, 'title') : undefined}
              onTouchStart={isLayoutEditMode ? (e) => handleElementDragStart(e, 'title') : undefined}
              className="w-full shrink-0 relative pointer-events-auto"
            >
              {isLayoutEditMode && (
                <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-black px-2 py-0.5 rounded-full z-50 pointer-events-none"
                  style={{ backgroundColor: '#f59e0b', color: '#0f172a', whiteSpace: 'nowrap' }}>
                  👑 Título — arraste
                </div>
              )}
              <div className="w-full flex flex-col items-center justify-center font-gotham font-bold min-h-16 md:min-h-20 h-auto py-1 mt-1 md:mt-2 pt-1 pl-[18%] pr-6 my-auto">
                <span className={`text-base md:text-2xl lg:text-3xl font-bold text-white tracking-wider block text-center drop-shadow-sm ${isSubtopic ? 'normal-case' : 'uppercase'}`} style={{ fontFamily: "'Gotham', 'Gotham Medium', sans-serif", fontWeight: 700, textWrap: 'balance', WebkitTextWrap: 'balance', zoom: currentTitleScale } as React.CSSProperties}>
                  {renderHL(formattedTitle, '#ffffff')}
                </span>
              </div>
            </div>

            {/* ── CONTEÚDO / CORPO (ARRASTÁVEL) ── */}
            <div
              style={makeDragStyle(bodyPos, 'body')}
              onMouseDown={isLayoutEditMode ? (e) => handleElementDragStart(e, 'body') : undefined}
              onTouchStart={isLayoutEditMode ? (e) => handleElementDragStart(e, 'body') : undefined}
              className="w-full flex-1 flex flex-col min-h-0 relative"
            >
              {renderBodyResizeHandles()}
              <div className="w-full flex-1 flex flex-col justify-center items-center relative min-h-0">
                <div className="text-layer w-full relative z-30 flex-1 flex flex-col justify-start items-center min-h-0">
                  {currentProjectorItem.type === 'leitura' ? (() => {
                    const parsed = parseBiblicalTextSections(currentProjectorItem.projetorText || '');
                    const displayRef = currentProjectorItem.reference || parsed.reference;
                    const showSectionHeaders = parsed.sections.length > 1 || (displayRef && displayRef.includes(';'));

                    return (
                      <div
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                        className="w-full flex-1 flex flex-col justify-start items-center text-center space-y-3 py-2 min-h-0 h-[340px] md:h-[400px] lg:h-[440px] max-h-[440px] overflow-y-auto custom-scrollbar pr-2 select-text touch-pan-y"
                      >
                        {displayRef && (
                          <h3 className="text-2xl md:text-3xl lg:text-4xl font-black text-[#0052cc] tracking-wide font-sans text-center mb-2 w-full shrink-0" style={{ zoom: currentTitleScale } as React.CSSProperties}>
                            {renderHL(displayRef, '#0052cc')}
                          </h3>
                        )}

                        <div className="w-full space-y-4 text-left font-sans pr-1" style={{ zoom: currentBodyScale } as React.CSSProperties}>
                          {parsed.sections.map((section, sIdx) => (
                            <div key={sIdx} className="w-full space-y-3">
                              {/* Risco Laranja de Separação entre Livros */}
                              {sIdx > 0 && (
                                <div className="w-full flex items-center justify-center my-6">
                                  <div className="w-full border-b-2 border-amber-500/90 shadow-[0_0_12px_rgba(245,158,11,0.8)]" />
                                </div>
                              )}

                              {/* Título do Livro / Passagem */}
                              {showSectionHeaders && section.bookHeader && (
                                <div className="w-full text-center mt-4 mb-3">
                                  <h4 className="text-xl md:text-3xl font-black text-amber-400 tracking-wide font-sans inline-block px-5 py-1.5 bg-amber-500/10 rounded-xl border border-amber-500/40 shadow-sm">
                                    {renderHL(section.bookHeader, '#fbbf24')}
                                  </h4>
                                </div>
                              )}

                              {/* Versículos do Livro */}
                              <div className="w-full space-y-3">
                                {section.verses.map((v, vIdx) => {
                                  if (v.number) {
                                    return (
                                      <div key={vIdx} className="flex items-start gap-3.5 text-left w-full py-2.5 border-b border-slate-200/20 last:border-0">
                                        <span className="shrink-0 font-black text-white text-3xl md:text-5xl lg:text-6xl leading-none mt-1 drop-shadow-sm">
                                          {v.number}
                                        </span>
                                        <span className="shrink-0 font-extrabold text-amber-400 text-xl md:text-3xl mt-1">—</span>
                                        <p className="font-extrabold text-white text-lg md:text-2xl lg:text-3xl leading-snug md:leading-normal break-words flex-1 italic md:not-italic">
                                          {renderHL(v.text)}
                                        </p>
                                      </div>
                                    );
                                  }
                                  return (
                                    <p key={vIdx} className="font-extrabold text-white text-lg md:text-2xl lg:text-3xl leading-snug md:leading-normal break-words text-left py-1">
                                      {renderHL(v.text)}
                                    </p>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })() : currentProjectorItem.type === 'conclusao' ? (
                    <div className="w-full flex-1 flex flex-col justify-center items-center text-center py-4 my-auto mt-2" style={{ zoom: currentBodyScale } as React.CSSProperties}>
                      <p className={`font-extrabold text-center font-sans break-words w-full max-w-full px-2 ${getResponsiveBodyTextClass(currentProjectorItem.projetorText)}`} style={{ textWrap: 'pretty', wordBreak: 'break-word' }}>
                        "{renderHL(currentProjectorItem.projetorText)}"
                      </p>
                    </div>
                  ) : currentProjectorItem.type === 'verdades' ? (
                    <div className="w-full flex-1 flex flex-col justify-center items-start py-4 my-auto mt-2" style={{ zoom: currentBodyScale } as React.CSSProperties}>
                      {currentProjectorItem.bulletPoints?.map((point, idx) => (
                        <div key={idx} className="w-full">
                          <div className="flex items-start gap-3 py-2.5">
                            <span className="mt-1 shrink-0 w-7 h-7 rounded-full bg-[#091b2c] flex items-center justify-center text-white text-xs font-black font-sans">{idx + 1}</span>
                            <p className={`text-base md:text-xl lg:text-2xl font-bold leading-snug font-sans text-left break-words ${bodyTextColor === 'black' ? 'text-black font-black' : 'text-white'}`} style={{ textWrap: 'pretty', wordBreak: 'break-word' }}>
                              {renderHL(point)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* DEMAIS CARDS */
                    <div className="w-full flex-1 flex flex-col justify-center items-center text-center space-y-2.5 py-2 my-auto mt-1 md:mt-2">
                      {currentProjectorItem.type === 'palavra_chave' ? (
                        <div className="max-h-[460px] overflow-y-auto custom-scrollbar w-full px-4 flex flex-col items-center justify-center my-auto py-2" style={{ zoom: currentBodyScale } as React.CSSProperties}>
                          <h2 className={`text-4xl md:text-6xl lg:text-7xl font-black tracking-wider font-sans text-center mb-3 drop-shadow-sm ${bodyTextColor === 'black' ? 'text-black font-black' : 'text-white'}`}>
                            {renderHL(currentProjectorItem.ideiaText || '')}
                          </h2>
                          <div className="w-48 h-1.5 bg-amber-400 rounded-full mb-6 mx-auto shadow-sm" />
                          <p className={`font-sans text-center w-full max-w-4xl px-2 break-words leading-relaxed font-bold md:font-extrabold ${getResponsiveBodyTextClass(currentProjectorItem.projetorText)}`} style={{ textWrap: 'pretty', wordBreak: 'break-word' }}>
                            {renderHL(currentProjectorItem.projetorText)}
                          </p>
                        </div>
                      ) : currentProjectorItem.type === 'topic_synopsis' ? (
                        <p className={`font-extrabold text-center font-sans break-words w-full max-w-full px-2 m-auto ${getResponsiveBodyTextClass(currentProjectorItem.projetorText)}`} style={{ zoom: currentBodyScale, textWrap: 'pretty', wordBreak: 'break-word' } as React.CSSProperties}>
                          "{renderHL(currentProjectorItem.projetorText)}"
                        </p>
                      ) : currentProjectorItem.type === 'na_licao_anterior' ? (
                        <div className="max-h-[460px] overflow-y-auto custom-scrollbar w-full px-4 flex flex-col items-center justify-start my-auto py-2" style={{ zoom: currentBodyScale } as React.CSSProperties}>
                          <p className={`font-sans text-center w-full max-w-full px-2 break-words ${getResponsiveBodyTextClass(currentProjectorItem.projetorText)}`} style={{ textWrap: 'pretty', wordBreak: 'break-word' }}>
                            {renderHL(currentProjectorItem.projetorText)}
                          </p>
                        </div>
                      ) : currentProjectorItem.type === 'ponte_contextual' ? (
                        <div className="max-h-[460px] overflow-y-auto custom-scrollbar w-full px-4 flex flex-col items-center justify-start my-auto py-2" style={{ zoom: currentBodyScale } as React.CSSProperties}>
                          <p className={`font-sans text-center w-full max-w-full px-2 break-words ${getResponsiveBodyTextClass(currentProjectorItem.projetorText)}`} style={{ textWrap: 'pretty', wordBreak: 'break-word' }}>
                            {renderHL(currentProjectorItem.projetorText)}
                          </p>
                        </div>
                      ) : currentProjectorItem.type === 'subtopic_verses' ? (
                        <div className="max-h-[460px] overflow-y-auto custom-scrollbar w-full px-4 flex flex-col items-center justify-center my-auto py-2">
                          <p className={`tracking-wider font-sans text-center drop-shadow-md whitespace-pre-line ${getResponsiveBodyTextClass(currentProjectorItem.projetorText)}`} style={{ zoom: currentBodyScale, textWrap: 'pretty', wordBreak: 'break-word' } as React.CSSProperties}>
                            {renderHL(
                              (currentProjectorItem.projetorText || '')
                                .split('\n')
                                .filter(line => !line.trim().startsWith('💡'))
                                .join('\n')
                            )}
                          </p>
                        </div>
                      ) : currentProjectorItem.type === 'subtopic_aplicacao' ? (
                        <div className="max-h-[460px] overflow-y-auto custom-scrollbar w-full px-4 flex flex-col items-center justify-center my-auto py-2">
                          <p className={`font-sans text-center w-full max-w-full px-2 break-words ${getResponsiveBodyTextClass(currentProjectorItem.projetorText)}`} style={{ zoom: currentBodyScale, textWrap: 'pretty', wordBreak: 'break-word' } as React.CSSProperties}>
                            {renderHL(currentProjectorItem.projetorText)}
                          </p>
                        </div>
                      ) : currentProjectorItem.type === 'subtopic' ? (
                        <div className="max-h-[460px] overflow-y-auto custom-scrollbar w-full px-4 flex flex-col items-center justify-start my-auto py-2" style={{ zoom: currentBodyScale } as React.CSSProperties}>
                          <p className={`font-sans text-center w-full max-w-full px-2 break-words ${getResponsiveBodyTextClass(currentProjectorItem.projetorText)}`} style={{ textWrap: 'pretty', wordBreak: 'break-word' }}>
                            {renderHL(currentProjectorItem.projetorText)}
                          </p>
                        </div>
                      ) : (
                        <div className="w-full max-h-[460px] overflow-y-auto custom-scrollbar px-4 flex flex-col items-center justify-start py-2 space-y-2 my-auto">
                          {currentProjectorItem.ideiaText && (
                            <h2 className="text-xl md:text-3xl lg:text-4xl font-black text-[#0052cc] tracking-wide font-sans text-center mb-1 break-words shrink-0" style={{ zoom: currentTitleScale } as React.CSSProperties}>
                              {currentProjectorItem.ideiaText}
                            </h2>
                          )}
                          {currentProjectorItem.reference && (
                            <h3 className={`${(slideBodyWidths[projectorIndex] ?? 100) <= 65 ? 'text-lg md:text-xl lg:text-2xl' : 'text-xl md:text-2xl lg:text-3xl'} font-black text-[#0052cc] tracking-wide font-sans text-center mb-1 w-full shrink-0`} style={{ zoom: currentTitleScale } as React.CSSProperties}>
                              {currentProjectorItem.reference}
                            </h3>
                          )}
                          {(currentProjectorItem.ideiaText || currentProjectorItem.reference) && currentProjectorItem.projetorText && (
                            <div className="w-4/5 max-w-2xl border-b border-slate-200/40 my-1 mx-auto shrink-0" />
                          )}
                          {currentProjectorItem.projetorText && (
                            <p className={`font-sans text-center w-full max-w-full px-2 break-words whitespace-pre-line ${getResponsiveBodyTextClass(currentProjectorItem.projetorText, currentProjectorItem.type === 'enfase_palavra')}`} style={{ zoom: currentBodyScale, textWrap: 'pretty', wordBreak: 'break-word' } as React.CSSProperties}>
                              {renderHL(currentProjectorItem.projetorText)}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="w-full shrink-0 h-8" />
          </div>
        );
      })()}

      {/* Rodapé do Projetor com Slide Number */}
      <div className="relative z-10 flex justify-between items-center text-xs font-bold text-slate-500 border-t border-slate-200 pt-3">
        <span>MegaEBD • {lesson.metadata.title}</span>
        <span>{projectorIndex + 1} / {projectorItems.length}</span>
      </div>
    </div>
  );
};
