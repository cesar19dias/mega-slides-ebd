import React from 'react';
import {
  ImageIcon,
  Eraser,
  Edit3,
  Move,
  PlusCircle,
  ChevronDown,
  Copy,
  ArrowLeft,
  ArrowRight,
  Trash2,
  LayoutTemplate,
  Crop,
  ImageDown,
  RefreshCw,
  Square,
} from 'lucide-react';
import type { ImageBox, EBDLessonPreparation, ProjectorItem } from '../types';
import { ImageBoxToolbar } from './FreeImageBox';

export interface ProjectorHeaderActionsProps {
  projectorSlideImages: Record<string | number, string>;
  projectorIndex: number;
  currentProjectorItem?: ProjectorItem;
  handleSlideImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleInsertSampleImage?: () => void;
  isImageMenuOpen: boolean;
  setIsImageMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setImageSelected: (val: boolean) => void;
  handleOpenCropForSlide: () => void;
  handleRemoveSlideImage: () => void;
  imageMenuRef: React.RefObject<HTMLDivElement | null>;

  handleAddExtraSlide: () => void;
  isSlideMenuOpen: boolean;
  setIsSlideMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleDuplicateSlide: () => void;
  handleMoveSlideLeft: () => void;
  handleMoveSlideRight: () => void;
  handleDeleteSlide: () => void;
  projectorItems: ProjectorItem[];
  slideMenuRef: React.RefObject<HTMLDivElement | null>;

  customBg: string | null;
  handleCustomBgUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isModelMenuOpen: boolean;
  setIsModelMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleOpenCropForBg: () => void;
  setCustomBg: (bg: string | null) => void;
  updateLesson: (updater: (prev: EBDLessonPreparation) => EBDLessonPreparation) => void;
  modelMenuRef: React.RefObject<HTMLDivElement | null>;

  onExportPowerPoint: () => void;
  onExportPngZip: () => void;
  isExporting: string | null;

  isEditMode: boolean;
  setIsEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  isLayoutEditMode: boolean;
  setIsLayoutEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  showAlignmentGuides: boolean;
  toggleAlignmentGuides: () => void;
  titleSelected?: boolean;
  setTitleSelected?: React.Dispatch<React.SetStateAction<boolean>>;
  bodySelected?: boolean;
  setBodySelected?: React.Dispatch<React.SetStateAction<boolean>>;
  testStageAspect?: '16:9' | '4:3';
  toggleTestStageAspect?: () => void;
}

export const ProjectorHeaderActions: React.FC<ProjectorHeaderActionsProps> = ({
  projectorSlideImages,
  projectorIndex,
  currentProjectorItem,
  handleSlideImageUpload,
  handleInsertSampleImage,
  isImageMenuOpen,
  setIsImageMenuOpen,
  setImageSelected,
  handleOpenCropForSlide,
  handleRemoveSlideImage,
  imageMenuRef,

  handleAddExtraSlide,
  isSlideMenuOpen,
  setIsSlideMenuOpen,
  handleDuplicateSlide,
  handleMoveSlideLeft,
  handleMoveSlideRight,
  handleDeleteSlide,
  projectorItems,
  slideMenuRef,

  customBg,
  handleCustomBgUpload,
  isModelMenuOpen,
  setIsModelMenuOpen,
  handleOpenCropForBg,
  setCustomBg,
  updateLesson,
  modelMenuRef,

  onExportPngZip,
  isExporting,

  isEditMode,
  setIsEditMode,
  isLayoutEditMode,
  setIsLayoutEditMode,
  setTitleSelected,
  setBodySelected,
  testStageAspect = '16:9',
  toggleTestStageAspect,
}) => {
  const hasSlideImage = Boolean(projectorSlideImages[projectorIndex] || currentProjectorItem?.imageUrl);

  return (
    <div className="flex flex-wrap items-center gap-2.5 bg-slate-950 p-2 rounded-2xl border border-slate-800 relative z-30">
      {/* 1 BOTÃO UNIFICADO: IMAGEM DO SLIDE */}
      <div className="relative inline-block" ref={imageMenuRef}>
        <div className="inline-flex items-center rounded-xl shadow-md border border-purple-400/50 bg-purple-700 overflow-hidden min-h-[42px]">
          <label
            className="hover:bg-purple-600 text-white font-black px-4 py-2.5 flex items-center gap-2 text-sm cursor-pointer transition-all active:scale-95"
            title="Adicionar ou alterar imagem ilustrativa neste slide"
          >
            <ImageIcon className="w-4.5 h-4.5 text-purple-200" />
            <span>{hasSlideImage ? '📷 Imagem' : '🖼️ + Imagem'}</span>
            <input type="file" accept="image/*" onChange={handleSlideImageUpload} className="hidden" />
          </label>
          {hasSlideImage && (
            <button
              onClick={() => setIsImageMenuOpen(prev => !prev)}
              className="hover:bg-purple-600 text-white font-black px-3 py-2.5 border-l border-purple-500/80 flex items-center justify-center cursor-pointer transition-all min-h-[42px]"
              title="Mais opções da imagem (Recortar, Remover)"
            >
              <ChevronDown className={`w-4 h-4 text-purple-100 transition-transform duration-200 ${isImageMenuOpen ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>

        {isImageMenuOpen && hasSlideImage && (
          <div className="absolute left-0 top-full mt-2 z-50 w-56 bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-2 text-sm space-y-1 backdrop-blur-xl animate-in fade-in duration-150">
            <label className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-left text-purple-200 hover:bg-purple-950/60 font-bold transition-colors cursor-pointer">
              <ImageIcon className="w-4 h-4 text-purple-400" />
              <span>📷 Alterar Imagem</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  handleSlideImageUpload(e);
                  setIsImageMenuOpen(false);
                }}
                className="hidden"
              />
            </label>

            <button
              onClick={() => {
                setImageSelected(true);
                setIsImageMenuOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-left text-cyan-300 hover:bg-cyan-950/60 font-bold transition-colors cursor-pointer"
            >
              <Move className="w-4 h-4 text-cyan-400" />
              <span>🎯 Redimensionar / Mover Imagem</span>
            </button>

            <button
              onClick={() => {
                handleOpenCropForSlide();
                setIsImageMenuOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-left text-pink-300 hover:bg-pink-950/60 font-bold transition-colors cursor-pointer"
            >
              <Crop className="w-4 h-4 text-pink-400" />
              <span>✂️ Recortar (Crop)</span>
            </button>

            {handleInsertSampleImage && (
              <button
                onClick={() => {
                  handleInsertSampleImage();
                  setIsImageMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-left text-blue-300 hover:bg-blue-950/60 font-bold transition-colors cursor-pointer"
              >
                <Square className="w-4 h-4 text-blue-400 fill-blue-500/30" />
                <span>🟦 Trocar por Quadro Azul</span>
              </button>
            )}

            <div className="border-t border-slate-800 my-1" />

            <button
              onClick={() => {
                handleRemoveSlideImage();
                setIsImageMenuOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-left text-red-400 hover:bg-red-950/60 font-bold transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4 text-red-400" />
              <span>🗑️ Remover Imagem</span>
            </button>
          </div>
        )}
      </div>

      {/* 🟦 Botão de Inserir Quadro Azul Centralizado (Teste Rápido) */}
      {handleInsertSampleImage && (
        <button
          type="button"
          onClick={handleInsertSampleImage}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white border border-blue-400/50 text-sm font-black cursor-pointer transition-all shadow-md active:scale-95 min-h-[42px]"
          title="Inserir um quadro azul demonstrativo centralizado neste slide (X: 5% • Y: 24% • L: 90% • A: 71%)"
        >
          <Square className="w-4 h-4 text-blue-200 fill-blue-300/40" />
          <span>🟦 {hasSlideImage ? 'Restaurar Quadro Azul' : '+ Quadro Azul (Teste)'}</span>
        </button>
      )}

      {/* Botão Unificado: Slide Extra e Ações Relacionadas */}
      <div className="relative inline-block" ref={slideMenuRef}>
        <div className="inline-flex items-center rounded-xl shadow-md border border-emerald-400/50 bg-emerald-600 overflow-hidden min-h-[42px]">
          <button
            onClick={handleAddExtraSlide}
            className="hover:bg-emerald-500 text-white font-black px-4 py-2.5 flex items-center gap-2 text-sm cursor-pointer transition-all active:scale-95"
            title="Adicionar um novo slide extra personalizado nesta lição"
          >
            <PlusCircle className="w-4.5 h-4.5 text-emerald-100" />
            <span>➕ Adicionar Slide Extra</span>
          </button>
          <button
            onClick={() => setIsSlideMenuOpen(prev => !prev)}
            className="hover:bg-emerald-500 text-white font-black px-3 py-2.5 border-l border-emerald-500/80 flex items-center justify-center cursor-pointer transition-all min-h-[42px]"
            title="Mais ações do slide (Duplicar, Mover, Excluir)"
          >
            <ChevronDown className={`w-4 h-4 text-emerald-100 transition-transform duration-200 ${isSlideMenuOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {isSlideMenuOpen && (
          <div className="absolute left-0 top-full mt-2 z-50 w-60 bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-2 text-sm space-y-1 backdrop-blur-xl animate-in fade-in duration-150">
            <button
              onClick={() => {
                handleAddExtraSlide();
                setIsSlideMenuOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-left text-emerald-300 hover:bg-emerald-950/60 font-bold transition-colors cursor-pointer"
            >
              <PlusCircle className="w-4 h-4 text-emerald-400" />
              <span>➕ Novo Slide Extra</span>
            </button>

            <button
              onClick={() => {
                handleDuplicateSlide();
                setIsSlideMenuOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-left text-slate-200 hover:bg-slate-800 font-bold transition-colors cursor-pointer"
            >
              <Copy className="w-4 h-4 text-cyan-400" />
              <span>📋 Duplicar Slide Atual</span>
            </button>

            <div className="border-t border-slate-800 my-1" />

            <button
              onClick={() => {
                handleMoveSlideLeft();
                setIsSlideMenuOpen(false);
              }}
              disabled={projectorIndex === 0}
              className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-left text-slate-200 hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none font-bold transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 text-amber-400" />
              <span>⬅️ Mover para Esquerda</span>
            </button>

            <button
              onClick={() => {
                handleMoveSlideRight();
                setIsSlideMenuOpen(false);
              }}
              disabled={projectorIndex === projectorItems.length - 1}
              className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-left text-slate-200 hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none font-bold transition-colors cursor-pointer"
            >
              <ArrowRight className="w-4 h-4 text-amber-400" />
              <span>➡️ Mover para Direita</span>
            </button>

            {projectorItems.length > 1 && (
              <>
                <div className="border-t border-slate-800 my-1" />
                <button
                  onClick={() => {
                    handleDeleteSlide();
                    setIsSlideMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-left text-red-400 hover:bg-red-950/60 font-bold transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4 text-red-400" />
                  <span>🗑️ Excluir Slide Atual</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Upload do Meu Modelo / Gerenciador de Modelo */}
      <div className="relative inline-block" ref={modelMenuRef}>
        {!customBg ? (
          <label
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-sm font-bold cursor-pointer border border-indigo-400/40 shadow-md transition-all hover:scale-105 active:scale-95 min-h-[42px]"
            title="Enviar imagem como fundo de todos os slides do projetor"
          >
            <LayoutTemplate className="w-4 h-4 text-amber-300" />
            <span>📁 Meu Modelo</span>
            <input type="file" accept="image/*" onChange={handleCustomBgUpload} className="hidden" />
          </label>
        ) : (
          <>
            <button
              onClick={() => setIsModelMenuOpen(prev => !prev)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-sm font-bold cursor-pointer border border-indigo-400/40 shadow-md transition-all hover:scale-105 active:scale-95 min-h-[42px]"
              title="Gerenciar imagem de fundo do modelo (Trocar, Recortar, Remover)"
            >
              <LayoutTemplate className="w-4 h-4 text-amber-300" />
              <span>📁 Modelo de Fundo</span>
              <ChevronDown className={`w-4 h-4 text-indigo-200 transition-transform duration-200 ${isModelMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {isModelMenuOpen && (
              <div className="absolute left-0 top-full mt-2 z-50 w-56 bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-2 text-sm space-y-1 backdrop-blur-xl animate-in fade-in duration-150">
                <label className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-left text-slate-200 hover:bg-slate-800 font-bold transition-colors cursor-pointer">
                  <LayoutTemplate className="w-4 h-4 text-indigo-400" />
                  <span>📁 Trocar Modelo</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      handleCustomBgUpload(e);
                      setIsModelMenuOpen(false);
                    }}
                    className="hidden"
                  />
                </label>

                <button
                  onClick={() => {
                    handleOpenCropForBg();
                    setIsModelMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-left text-pink-300 hover:bg-pink-950/60 font-bold transition-colors cursor-pointer"
                >
                  <Crop className="w-4 h-4 text-pink-400" />
                  <span>✂️ Recortar Fundo (16:9)</span>
                </button>

                <div className="border-t border-slate-800 my-1" />

                <button
                  onClick={() => {
                    setCustomBg(null);
                    try { localStorage.removeItem('mega_ebd_custom_bg'); } catch {}
                    updateLesson(l => ({ ...l, customBg: null }));
                    setIsModelMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-left text-red-400 hover:bg-red-950/60 font-bold transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4 text-red-400" />
                  <span>✕ Remover Modelo</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* TODOS OS SLIDES - PNG/ZIP */}
      <button
        onClick={onExportPngZip}
        disabled={!!isExporting}
        className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-bold cursor-pointer disabled:opacity-50 transition-all shadow-sm hover:scale-105 active:scale-95 min-h-[42px]"
        title="Exportar todos os slides como ZIP com PNGs"
      >
        {isExporting === 'png' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ImageDown className="w-4 h-4" />}
        <span>{isExporting === 'png' ? 'Gerando...' : 'Todos (ZIP)'}</span>
      </button>

      {/* BOTÃO DE EDITAR SLIDE (MODO PROJETOR) */}
      <button
        onClick={() => setIsEditMode(prev => !prev)}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black cursor-pointer transition-all shadow-md border min-h-[42px] ${
          isEditMode
            ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-400 ring-2 ring-amber-400/50'
            : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40'
        }`}
        title="Ativar/desativar modo de edição livre de texto do slide"
      >
        <Edit3 className="w-4 h-4 text-current" />
        <span>{isEditMode ? '✓ Concluir Edição' : '✏️ Editar Slide'}</span>
      </button>

      {/* BOTÃO DE MOVER ELEMENTOS (MODO LAYOUT) */}
      <button
        onClick={() => {
          setIsLayoutEditMode(prev => {
            const next = !prev;
            if (next) {
              if (setTitleSelected) setTitleSelected(true);
            } else {
              if (setTitleSelected) setTitleSelected(false);
              if (setBodySelected) setBodySelected(false);
            }
            return next;
          });
        }}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black cursor-pointer transition-all shadow-md border min-h-[42px] ${
          isLayoutEditMode
            ? 'bg-purple-600 hover:bg-purple-500 text-white border-purple-400 ring-2 ring-purple-400/50'
            : 'bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border-purple-500/40'
        }`}
        title="Arrastar título e texto livremente no slide para reposicioná-los (Estilo CorelDRAW)"
      >
        <Move className="w-4 h-4 text-current" />
        <span>{isLayoutEditMode ? '✅ Concluir Mover' : '🎯 Mover'}</span>
      </button>

      {/* BOTÃO DE TESTE DE PROPORÇÃO (16:9 / 4:3) */}
      {toggleTestStageAspect && (
        <button
          type="button"
          onClick={toggleTestStageAspect}
          className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-black cursor-pointer transition-all shadow-md border min-h-[42px] ${
            testStageAspect === '4:3'
              ? 'bg-cyan-500 text-slate-950 border-cyan-300 ring-2 ring-cyan-400/50'
              : 'bg-slate-800 hover:bg-slate-700 text-cyan-300 border-cyan-500/30'
          }`}
          title="Alternar entre a proporção 16:9 (Widescreen padrão) e 4:3 (Tradicional de Igreja) neste slide para testar o visual"
        >
          <span className="text-sm">📐</span>
          <span>{testStageAspect === '4:3' ? '4:3 (Ativo)' : 'Testar 4:3'}</span>
        </button>
      )}

    </div>
  );
};

export interface ProjectorToolbarProps {
  projectorIndex: number;
  setProjectorIndex: (idx: number | ((prev: number) => number)) => void;
  projectorItems: ProjectorItem[];
  currentProjectorItem?: ProjectorItem;

  currentTitleScale: number;
  defaultTitleScale: number;
  isCurrentTitleCustom: boolean;
  setSingleTitleScale: (slideIdx: number, scale: number | null) => void;

  currentBodyScale: number;
  defaultBodyScale: number;
  isCurrentBodyCustom: boolean;
  setSingleBodyScale: (slideIdx: number, scale: number | null) => void;

  slideBodyWidths: Record<string | number, number>;
  setSingleBodyWidth: (slideIdx: number, width: number | null) => void;
  resetSlideBodyWidth: () => void;

  toggleSideBySideLayout: () => void;
  showAlignmentGuides: boolean;
  toggleAlignmentGuides: () => void;

  curImageSrc?: string | null;
  curBox: ImageBox;
  imageSelected: boolean;
  setImageSelected: (val: boolean) => void;
  projectorStageRef: React.RefObject<HTMLDivElement | null>;
  commitBox: (b: ImageBox) => void;
  handleRemoveSlideImage: () => void;
  handleInsertSampleImage?: () => void;
  onUploadImage?: (file: File) => void;

  isTitleMoved: boolean;
  isBodyMoved: boolean;
  isImageMoved: boolean;
  isImageWidthCustom: boolean;
  isImageHeightCustom: boolean;
  isImageCropCustom: boolean;
  hasSlideHighlights: boolean;
  clearCurrentSlideHighlights: () => void;
  resetSlidePosition: (kind: 'title' | 'body' | 'image') => void;
  resetSlideImageWidth: () => void;
  resetSlideImageHeight: () => void;
  resetSlideImageCrop: () => void;

  isEditMode: boolean;
  isExporting: string | null;
  isIpsisLitterisVerified: boolean | null;
  bodyTextColor: 'black' | 'white';
  toggleBodyTextColor: () => void;
  slideImageOpacity: number;
  changeSlideImageOpacity: (val: number) => void;
  applyCurrentScalesToAllSlides: () => void;
  titleSelected?: boolean;
  setTitleSelected?: React.Dispatch<React.SetStateAction<boolean>>;
  bodySelected?: boolean;
  setBodySelected?: React.Dispatch<React.SetStateAction<boolean>>;
}

export const ProjectorToolbar: React.FC<ProjectorToolbarProps> = ({
  projectorIndex,
  setProjectorIndex,
  projectorItems,
  currentProjectorItem,

  curImageSrc,
  curBox,
  imageSelected,
  setImageSelected,
  projectorStageRef,
  commitBox,
  handleRemoveSlideImage,
  handleInsertSampleImage,
  onUploadImage,

  hasSlideHighlights,
  clearCurrentSlideHighlights,

  isEditMode,
  isExporting,
  isIpsisLitterisVerified,
  bodyTextColor,
  toggleBodyTextColor,
  slideImageOpacity,
  changeSlideImageOpacity,
  isCurrentTitleCustom,
  isCurrentBodyCustom,
  applyCurrentScalesToAllSlides,
}) => {
  return (
    <>
      {/* Barra de Ferramentas de Imagem (apenas quando houver imagem no slide ou demonstrativo) */}
      {(curImageSrc || handleInsertSampleImage) && (
        <div className="bg-slate-900 p-2.5 rounded-2xl border border-slate-700/80 shadow-lg relative z-10 animate-in fade-in duration-200">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Controle e Barra de Ferramentas de Imagem Estilo Corel Draw */}
            {curImageSrc && imageSelected && (
              <ImageBoxToolbar
                box={curBox}
                src={curImageSrc}
                stageRef={projectorStageRef}
                onChange={commitBox}
                onRemove={() => {
                  handleRemoveSlideImage();
                  setImageSelected(false);
                }}
                onDone={() => setImageSelected(false)}
                onUploadImage={onUploadImage}
              />
            )}

            {curImageSrc && !imageSelected && (
              <button
                onClick={() => setImageSelected(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-900/40 hover:bg-purple-900/70 text-purple-200 border border-purple-500/40 text-xs md:text-sm font-black cursor-pointer transition-all shadow-sm min-h-[40px] active:scale-95"
                title="Selecionar imagem para redimensionar, girar ou mover livremente no palco"
              >
                <ImageIcon className="w-4 h-4 text-purple-400" />
                <span>🎯 Mover / Redimensionar Imagem</span>
              </button>
            )}

            {!curImageSrc && handleInsertSampleImage && (
              <button
                onClick={handleInsertSampleImage}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-900/40 hover:bg-blue-900/70 text-blue-200 border border-blue-500/40 text-xs md:text-sm font-black cursor-pointer transition-all shadow-sm min-h-[40px] active:scale-95"
                title="Inserir um quadro azul demonstrativo centralizado (90% x 71% • X: 5% • Y: 24%) para testar o enquadramento"
              >
                <Square className="w-4 h-4 text-blue-400 fill-blue-500/30" />
                <span>🟦 Inserir Quadro Azul</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── BARRA DE MINIATURAS VISUAIS DOS SLIDES ── */}
      <div className="slides-navigation-bar flex items-center gap-2 bg-slate-950 p-2 rounded-xl border border-slate-800 overflow-x-auto custom-scrollbar">
        {projectorItems.map((item, idx) => (
          <button
            key={item.id || idx}
            onClick={() => setProjectorIndex(idx)}
            className={`px-3 py-2 rounded-xl text-xs font-semibold border text-left truncate min-w-[130px] max-w-[170px] transition-all cursor-pointer font-sans shrink-0 ${
              idx === projectorIndex
                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg font-black scale-105 ring-2 ring-amber-400/50'
                : 'bg-slate-900/90 text-slate-300 border-slate-800 hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-[10px] opacity-80 font-bold uppercase mb-0.5">
              <span>Slide {idx + 1}</span>
              {item.type === 'extra' && <span className="text-[9px] bg-emerald-950 text-emerald-300 border border-emerald-500/50 px-1 rounded font-black">EXTRA</span>}
            </div>
            <span className="truncate block font-extrabold">{item.badgeText || item.title || `Slide ${idx + 1}`}</span>
          </button>
        ))}
      </div>

      {/* ── Painel de Edição Direta do Slide Atual (Modo Projetor) ── */}
      {isEditMode && currentProjectorItem && !isExporting && (
        <div className="bg-amber-950/90 border-2 border-amber-500/80 p-4 rounded-2xl shadow-2xl space-y-3 mb-3 text-left animate-in fade-in duration-200">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/40 pb-2">
            <span className="text-amber-300 font-extrabold text-xs uppercase flex items-center gap-2 flex-wrap">
              <Edit3 className="w-4 h-4 text-amber-400" />
              <span>✏️ Editor de Texto do Slide ({projectorIndex + 1} / {projectorItems.length}) — {currentProjectorItem.title}</span>
              {isIpsisLitterisVerified !== null && (
                isIpsisLitterisVerified ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 normal-case" title="Texto confirmado 100% literal da revista enviada">
                    ✓ Ipsis litteris (Revista)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 normal-case" title="Atenção: este parágrafo pode ter sido adaptado ou resumido em vez de ser cópia literal da revista">
                    ⚠️ Texto adaptado
                  </span>
                )
              )}
            </span>

            {/* Controles do Editor de Texto */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Cor das Letras do Corpo */}
              <div className="flex items-center gap-1 bg-slate-950/90 px-2 py-1 rounded-xl border border-cyan-500/50">
                <span className="text-[10px] font-black text-cyan-300 uppercase">Cor Letras:</span>
                <button
                  onClick={toggleBodyTextColor}
                  className="px-2 py-0.5 rounded text-xs font-black transition-all flex items-center gap-1 cursor-pointer border"
                  style={{
                    backgroundColor: bodyTextColor === 'black' ? '#0f172a' : '#ffffff',
                    color: bodyTextColor === 'black' ? '#38bdf8' : '#0f172a',
                    borderColor: bodyTextColor === 'black' ? '#38bdf8' : '#cbd5e1'
                  }}
                  title="Alternar cor das letras do corpo entre Preto e Branco"
                >
                  {bodyTextColor === 'black' ? '⚫ Letras Pretas' : '⚪ Letras Brancas'}
                </button>
              </div>

              {/* Limpar Cores deste Slide */}
              {hasSlideHighlights && (
                <button
                  onClick={clearCurrentSlideHighlights}
                  className="text-xs font-black text-rose-300 hover:text-white px-2.5 py-1 rounded-xl bg-rose-950/90 border border-rose-500/60 hover:bg-rose-900 transition-all cursor-pointer flex items-center gap-1 shrink-0"
                  title={`Limpar todas as cores e destaques exclusivamente deste slide (${projectorIndex + 1})`}
                >
                  <Eraser className="w-3.5 h-3.5 text-rose-400" />
                  <span>Limpar Cores deste Slide</span>
                </button>
              )}

              {/* Opacidade da Imagem do Slide */}
              <div className="flex items-center gap-1.5 bg-slate-950/90 px-2 py-1 rounded-xl border border-indigo-500/50">
                <span className="text-[10px] font-black text-indigo-300 uppercase shrink-0">Opacidade Imagem:</span>
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="5"
                  value={slideImageOpacity}
                  onChange={(e) => changeSlideImageOpacity(parseInt(e.target.value, 10))}
                  className="w-16 accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  title="Ajustar nitidez/transparência da imagem de fundo do slide"
                />
                <span className="text-xs font-mono font-black min-w-[32px] text-center text-indigo-200">
                  {slideImageOpacity}%
                </span>
              </div>

              {(isCurrentTitleCustom || isCurrentBodyCustom) && (
                <button
                  onClick={applyCurrentScalesToAllSlides}
                  className="text-[10px] font-bold text-amber-300 hover:text-white px-2.5 py-1 rounded-xl bg-amber-950/80 border border-amber-500/50 hover:bg-amber-900 transition-all cursor-pointer flex items-center gap-1 shrink-0"
                  title="Aplicar tamanhos de título e texto deste slide a todos os slides da lição"
                >
                  <span>🔗 Aplicar tamanhos a todos</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Título do Slide */}
            {(currentProjectorItem.onUpdateTitle || currentProjectorItem.type === 'cover') && (
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-amber-300 uppercase block">Título / Rótulo do Slide</label>
                <input
                  type="text"
                  value={currentProjectorItem.title || ''}
                  onChange={(e) => {
                    if (currentProjectorItem.onUpdateTitle) currentProjectorItem.onUpdateTitle(e.target.value);
                  }}
                  placeholder="Título do slide..."
                  className="w-full bg-slate-950 border border-amber-500/50 focus:border-amber-400 text-white rounded-xl px-3 py-2 text-xs outline-none"
                />
              </div>
            )}

            {/* Subtítulo / Referência */}
            {(currentProjectorItem.subtitle !== undefined || currentProjectorItem.reference !== undefined) && (
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-amber-300 uppercase block">
                  {currentProjectorItem.reference !== undefined ? 'Referência Bíblica' : 'Subtítulo do Slide'}
                </label>
                <input
                  type="text"
                  value={currentProjectorItem.reference || currentProjectorItem.subtitle || ''}
                  onChange={(e) => {
                    if (currentProjectorItem.onUpdateReference) currentProjectorItem.onUpdateReference(e.target.value);
                    else if (currentProjectorItem.onUpdateSubtitle) currentProjectorItem.onUpdateSubtitle(e.target.value);
                  }}
                  placeholder="Subtítulo ou referência..."
                  className="w-full bg-slate-950 border border-amber-500/50 focus:border-amber-400 text-white rounded-xl px-3 py-2 text-xs outline-none"
                />
              </div>
            )}
          </div>

          {/* Texto Principal do Slide */}
          {currentProjectorItem.projetorText !== undefined && (
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-amber-300 uppercase block">Texto Principal do Slide (Projetor)</label>
              <textarea
                rows={3}
                value={currentProjectorItem.projetorText || ''}
                onChange={(e) => {
                  if (currentProjectorItem.onUpdateText) currentProjectorItem.onUpdateText(e.target.value);
                }}
                placeholder="Digite ou cole o texto para exibir no projetor..."
                className="w-full bg-slate-950 border border-amber-500/50 focus:border-amber-400 text-white rounded-xl p-3 text-xs outline-none resize-y font-sans"
              />
            </div>
          )}

          {/* Pontos Principais (se slide de verdades) */}
          {currentProjectorItem.type === 'verdades' && currentProjectorItem.bulletPoints && (
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-amber-300 uppercase block">Pontos Principais (Verdades para Guardar)</label>
              {currentProjectorItem.bulletPoints.map((pt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-amber-400 font-bold text-xs shrink-0">{idx + 1}.</span>
                  <input
                    type="text"
                    value={pt}
                    onChange={(e) => {
                      if (currentProjectorItem.onUpdateBulletPoint) currentProjectorItem.onUpdateBulletPoint(idx, e.target.value);
                    }}
                    placeholder={`Ponto ${idx + 1}...`}
                    className="flex-1 bg-slate-950 border border-amber-500/50 focus:border-amber-400 text-white rounded-xl px-3 py-1.5 text-xs outline-none"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
};
