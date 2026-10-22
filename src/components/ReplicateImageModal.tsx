import React, { useState, useMemo } from 'react';
import { X, Copy, Check, CheckSquare, Square, Layers, Sparkles } from 'lucide-react';
import type { ProjectorItem } from '../types';

export interface ReplicateImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSlideIndex: number;
  projectorItems: ProjectorItem[];
  currentImageSrc: string;
  projectorSlideImages: Record<string | number, string>;
  onConfirmReplicate: (targetIndices: number[]) => void;
}

export const ReplicateImageModal: React.FC<ReplicateImageModalProps> = ({
  isOpen,
  onClose,
  currentSlideIndex,
  projectorItems,
  currentImageSrc,
  projectorSlideImages,
  onConfirmReplicate,
}) => {
  // Estado com os índices selecionados (por padrão vazio ou sugerindo outros slides)
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [searchFilter, setSearchFilter] = useState('');

  // Limpa seleção quando abre
  React.useEffect(() => {
    if (isOpen) {
      setSelectedIndices([]);
      setSearchFilter('');
    }
  }, [isOpen]);

  // Lista de slides elegíveis (todos exceto o slide de origem atual)
  const candidateSlides = useMemo(() => {
    return projectorItems.map((item, index) => {
      const slideId = item.id || String(index);
      const hasImage = Boolean(projectorSlideImages[slideId] || projectorSlideImages[index] || item.imageUrl);
      return {
        index,
        slideId,
        item,
        isCurrent: index === currentSlideIndex,
        hasImage,
      };
    });
  }, [projectorItems, currentSlideIndex, projectorSlideImages]);

  // Filtragem por busca (título, número ou tipo)
  const filteredSlides = useMemo(() => {
    if (!searchFilter.trim()) return candidateSlides;
    const q = searchFilter.toLowerCase();
    return candidateSlides.filter(s => {
      const title = (s.item.title || '').toLowerCase();
      const badge = (s.item.badgeText || '').toLowerCase();
      const num = String(s.index + 1);
      return title.includes(q) || badge.includes(q) || num.includes(q);
    });
  }, [candidateSlides, searchFilter]);

  if (!isOpen) return null;

  const toggleIndex = (idx: number) => {
    if (idx === currentSlideIndex) return; // não faz sentido replicar para o próprio slide
    setSelectedIndices(prev =>
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    );
  };

  const handleSelectAll = () => {
    const allExceptCurrent = candidateSlides
      .filter(s => !s.isCurrent)
      .map(s => s.index);
    setSelectedIndices(allExceptCurrent);
  };

  const handleSelectNone = () => {
    setSelectedIndices([]);
  };

  const handleSelectSubtopics = () => {
    const subtopicIndices = candidateSlides
      .filter(s => !s.isCurrent && (s.item.type === 'subtopic' || s.item.type === 'subtopic_verses' || s.item.type === 'subtopic_aplicacao'))
      .map(s => s.index);
    setSelectedIndices(subtopicIndices);
  };

  const handleSelectTopicsOnly = () => {
    const topicIndices = candidateSlides
      .filter(s => !s.isCurrent && (s.item.type === 'cover' || s.item.type === 'topic_synopsis' || s.item.type === 'palavra_chave' || s.item.type === 'conclusao'))
      .map(s => s.index);
    setSelectedIndices(topicIndices);
  };

  const handleConfirm = () => {
    if (selectedIndices.length === 0) return;
    onConfirmReplicate(selectedIndices);
    onClose();
  };

  const currentSlide = projectorItems[currentSlideIndex];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 md:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-white"
        onClick={e => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between p-4 md:p-5 border-b border-slate-800 bg-slate-900/90 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300">
              <Copy className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base md:text-lg font-black tracking-wide text-white flex items-center gap-2">
                <span>Replicar Imagem em Slides Específicos</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold">
                  Copiar & Colar
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-medium">
                Escolha exatamente quais slides receberão esta foto com as mesmas coordenadas e tamanho.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Miniatura do Slide de Origem */}
        <div className="p-4 bg-slate-950/60 border-b border-slate-800/80 flex items-center gap-3 shrink-0">
          <div className="w-16 h-12 rounded-xl overflow-hidden border border-cyan-500/50 bg-slate-900 shrink-0 shadow-inner flex items-center justify-center">
            <img src={currentImageSrc} alt="Preview da imagem" className="w-full h-full object-cover" />
          </div>
          <div className="min-w-0 flex-1 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-cyan-400">Origem: Slide {currentSlideIndex + 1}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                {currentSlide?.badgeText || 'Slide Atual'}
              </span>
            </div>
            <p className="text-slate-300 truncate font-semibold mt-0.5">
              {currentSlide?.title || 'Sem título'}
            </p>
          </div>
        </div>

        {/* Barra de Filtros e Seleção Rápida */}
        <div className="p-3 px-4 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={handleSelectAll}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <CheckSquare className="w-3.5 h-3.5 text-cyan-400" />
              <span>Todos</span>
            </button>
            <button
              type="button"
              onClick={handleSelectNone}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 text-slate-400" />
              <span>Nenhum</span>
            </button>
            <div className="h-4 w-px bg-slate-800 mx-0.5" />
            <button
              type="button"
              onClick={handleSelectSubtopics}
              className="px-2.5 py-1 rounded-lg bg-purple-950/60 hover:bg-purple-900/60 border border-purple-500/30 text-xs font-bold text-purple-200 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5 text-purple-400" />
              <span>Só Subtópicos</span>
            </button>
            <button
              type="button"
              onClick={handleSelectTopicsOnly}
              className="px-2.5 py-1 rounded-lg bg-amber-950/60 hover:bg-amber-900/60 border border-amber-500/30 text-xs font-bold text-amber-200 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Só Tópicos / Capa</span>
            </button>
          </div>

          <input
            type="text"
            placeholder="Filtrar slides..."
            value={searchFilter}
            onChange={e => setSearchFilter(e.target.value)}
            className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-500 w-36 md:w-44 transition-colors"
          />
        </div>

        {/* Lista de Slides Selecionáveis */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 md:p-4 space-y-2">
          {filteredSlides.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-sm">
              Nenhum slide encontrado com este filtro.
            </div>
          ) : (
            filteredSlides.map(({ index, item, isCurrent, hasImage }) => {
              const isSelected = selectedIndices.includes(index);
              return (
                <div
                  key={index}
                  onClick={() => !isCurrent && toggleIndex(index)}
                  className={`flex items-center justify-between p-3 rounded-2xl border transition-all select-none ${
                    isCurrent
                      ? 'bg-slate-950/40 border-slate-800 opacity-50 cursor-not-allowed'
                      : isSelected
                      ? 'bg-cyan-950/40 border-cyan-500/80 shadow-md cursor-pointer hover:bg-cyan-900/40'
                      : 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800 cursor-pointer'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${
                        isCurrent
                          ? 'border border-slate-700 bg-slate-800 text-slate-500'
                          : isSelected
                          ? 'bg-cyan-500 border border-cyan-400 text-slate-950 shadow-sm'
                          : 'border border-slate-600 bg-slate-900'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-black text-cyan-400">
                          Slide {index + 1}
                        </span>
                        {item.badgeText && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-slate-700/80 text-slate-200 uppercase">
                            {item.badgeText}
                          </span>
                        )}
                        {isCurrent && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            Origem Atual
                          </span>
                        )}
                        {!isCurrent && hasImage && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30" title="Este slide já possui uma imagem que será substituída">
                            Substituirá imagem atual
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-200 truncate font-semibold mt-0.5">
                        {item.title || item.projetorText?.slice(0, 50) || 'Slide sem texto'}
                      </p>
                    </div>
                  </div>

                  <span className="text-[11px] font-bold text-slate-400 shrink-0">
                    {isSelected ? '✓ Selecionado' : 'Clique para marcar'}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Rodapé com Contador e Botão de Aplicar */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-300">
            <span className="font-black text-cyan-300 text-sm">{selectedIndices.length}</span> slide{selectedIndices.length === 1 ? '' : 's'} selecionado{selectedIndices.length === 1 ? '' : 's'}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={selectedIndices.length === 0}
              className={`px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 shadow-lg transition-all cursor-pointer ${
                selectedIndices.length > 0
                  ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-500/30 hover:scale-105 active:scale-95'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              <Copy className="w-4 h-4" />
              <span>Aplicar nos {selectedIndices.length} Slides</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
