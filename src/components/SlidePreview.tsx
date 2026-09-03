import React, { useState, useRef } from 'react';
import type { PresentationData, Slide } from '../types';
import { THEMES } from '../constants/themes';
import { exportToPowerPoint } from '../services/pptxService';
import { generateAiImage, BIBLICAL_IMAGE_GALLERY } from '../services/imageService';
import { Download, ChevronLeft, ChevronRight, MessageSquare, RefreshCw, RefreshCcw, Upload, Trash2, Edit3, Image as ImageIcon, Sparkles, X, CheckCircle2, FileImage, LayoutTemplate } from 'lucide-react';
import { toPng } from 'html-to-image';
import confetti from 'canvas-confetti';
import { exportSingleSlidePDF } from '../services/exportService';
import { SmartText } from './SmartText';

interface SlidePreviewProps {
  data: PresentationData;
  selectedThemeId: string;
  onReset: () => void;
}

// ─── Função Auxiliar para Caixa Baixa (Sentence Case) ─────────────────────────
function toCaixaBaixa(text: string): string {
  if (!text) return '';
  let str = text.trim();
  // Se o texto fornecido estiver inteiramente em MAIÚSCULAS (ALL CAPS), converte para caixa baixa inteligente
  if (str === str.toUpperCase()) {
    str = str.toLowerCase();
    str = str.charAt(0).toUpperCase() + str.slice(1);
    const properNouns = [
      'Paulo', 'Cristo', 'Deus', 'Jesus', 'Pedro', 'João', 'Sinédrio',
      'Jerusalém', 'Israel', 'Evangelho', 'Trófimo', 'Ásia', 'Lei', 'Subt', 'Subtópico'
    ];
    properNouns.forEach(noun => {
      const regex = new RegExp(`\\b${noun}\\b`, 'gi');
      str = str.replace(regex, noun);
    });
  }
  return str;
}

// ─── Header de Título da EBD (Nome Principal no Topo - Centralizado a partir do recuo de 2/8, Fonte Gotham Medium) ──────────────────────────
const EbdHeaderBadge: React.FC<{ label: string }> = ({ label }) => {
  const subMatch = label.match(/^(SUBTÓPICO\s+[\d|A-Z]+|SUBT\.?)\s*[:\—\-]\s*(.+)$/i);
  const topMatch = label.match(/^(TÓPICO\s+[I|V|X|\d]+)\s*[:\—\-]\s*(.+)$/i);

  let mainTitle = label;
  let isSubtopic = false;

  if (subMatch) {
    mainTitle = subMatch[2].trim();
    isSubtopic = true;
  } else if (topMatch) {
    mainTitle = topMatch[2].trim();
    isSubtopic = false;
  } else if (label.toUpperCase().includes('SUBT') || label.toUpperCase().includes('SUBTÓPICO')) {
    isSubtopic = true;
  }

  // Remove qualquer prefixo tipo "Subtópico 1", "Subt.", "Subt 2", "SUBTÓPICO"
  let cleanTitle = mainTitle.replace(/^(subtópico\s*[\d|A-Z]*|subt\.?\s*[\d|A-Z]*)\s*[\:\.\—\-]?\s*/i, '').trim();

  // Subtópicos em caixa baixa (Sentence Case: ex "A conspiração judaica contra Paulo (vv.1,2)")
  // Tópicos principais em Caixa Alta (UPPERCASE)
  const displayText = isSubtopic ? toCaixaBaixa(cleanTitle) : cleanTitle.toUpperCase();

  return (
    <div
      className="w-full flex flex-col items-center justify-center z-20 font-sans font-medium h-20 md:h-24 my-auto"
      style={{ paddingLeft: '20%', paddingRight: '5%', paddingTop: '5.5%' }}
    >
      <SmartText
        text={displayText}
        maxFontSize={52}
        minFontSize={18}
        maxLines={2}
        className={`font-medium text-white text-center w-full drop-shadow-sm tracking-wide ${isSubtopic ? 'normal-case' : 'uppercase'}`}
        style={{ fontFamily: "'Gotham', 'Gotham Medium', sans-serif", fontWeight: 700, letterSpacing: isSubtopic ? '0.01em' : '0.04em' }}
      />
    </div>
  );
};

const TopLeftPolygons = () => null;

const BottomRightPolygonBadge: React.FC<{ current: number; total: number }> = ({ current, total }) => (
  <div className="absolute bottom-0 right-0 z-20 pointer-events-none">
    <div className="w-44 h-24 bg-[#0052cc] transform -skew-x-12 translate-x-4 translate-y-4 rounded-tl-3xl shadow-2xl border-t-2 border-l-2 border-cyan-400/40" />
    <div className="absolute bottom-0 right-0 w-36 h-20 bg-[#0077ff] transform -skew-x-12 translate-x-2 translate-y-2 rounded-tl-3xl shadow-2xl flex items-center justify-center border-t-2 border-l-2 border-cyan-300/50">
      <span className="transform skew-x-12 text-white font-black tracking-widest drop-shadow-lg" style={{ fontSize: 'clamp(8px, 1.2%, 14px)', fontFamily: "'Gotham', 'Gotham Medium', sans-serif" }}>
        {current} / {total}
      </span>
    </div>
  </div>
);

// ─── Card azul escuro com borda prateada ─────────────────────────────────────
export const SlideCard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className="relative z-10 bg-[#091b2c] text-white rounded-2xl shadow-2xl border-4 border-[#cbd5e1] w-full flex-1 flex flex-col justify-center items-center overflow-hidden"
    style={{ padding: '2.5% 4%', margin: '0.5% 0' }}
  >
    {children}
  </div>
);

// ─── Componente principal ─────────────────────────────────────────────────────
export const SlidePreview: React.FC<SlidePreviewProps> = ({ data, selectedThemeId, onReset }) => {
  const [presentation, setPresentation] = useState<PresentationData>(data);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isRegeneratingImage, setIsRegeneratingImage] = useState(false);
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [isExportingPng, setIsExportingPng] = useState(false);
  const [customPromptInput, setCustomPromptInput] = useState('');
  const [customTemplateBg, setCustomTemplateBg] = useState<string | null>(null);

  const slideStageRef = useRef<HTMLDivElement>(null);
  const theme = THEMES.find(t => t.id === selectedThemeId) || THEMES[0];
  const isOfficialEbdTheme = theme.id === 'modelo-oficial-ebd';
  const slides = presentation.slides;
  const currentSlide: Slide = slides[currentSlideIndex] || slides[0];

  const isVerseOrReading =
    currentSlide.layout === 'verse' ||
    currentSlide.title.toLowerCase().includes('leitura') ||
    !!currentSlide.topicBadge?.includes('VERDADE') ||
    !!currentSlide.topicBadge?.includes('ÁUREO') ||
    !!currentSlide.topicBadge?.includes('LEITURA');

  const updateCurrentSlide = (updatedFields: Partial<Slide>) => {
    const updatedSlides = [...slides];
    updatedSlides[currentSlideIndex] = { ...currentSlide, ...updatedFields };
    setPresentation({ ...presentation, slides: updatedSlides });
  };

  const handleDownload = () => {
    exportToPowerPoint(presentation, theme, customTemplateBg);
    confetti({ particleCount: 100, spread: 80, origin: { y: 0.5 } });
  };

  const handleDownloadPngCurrent = async () => {
    if (!slideStageRef.current) return;
    setIsExportingPng(true);
    try {
      await document.fonts.ready;
      await new Promise(r => setTimeout(r, 200));
      const dataUrl = await toPng(slideStageRef.current, { quality: 0.95, pixelRatio: 2 });
      const link = document.createElement('a');
      const sanitizedTitle = presentation.title.replace(/[^a-zA-Z0-9-_\s]/g, '').trim() || 'Slide_EBD';
      link.download = `${sanitizedTitle}_Slide_${currentSlideIndex + 1}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Erro ao exportar PNG:', err);
      alert('Erro ao gerar a imagem em PNG.');
    } finally {
      setIsExportingPng(false);
    }
  };

  const handleDownloadPdfCurrent = async () => {
    if (!slideStageRef.current) return;
    setIsExportingPng(true);
    try {
      await exportSingleSlidePDF(
        slideStageRef.current,
        presentation.title.replace(/[^a-zA-Z0-9-_\s]/g, '').trim() || 'Slide_EBD',
        currentSlideIndex + 1
      );
    } catch (err) {
      console.error('Erro ao exportar PDF:', err);
      alert('Erro ao gerar o PDF do slide.');
    } finally {
      setIsExportingPng(false);
    }
  };

  const handleDownloadPngAll = async () => {
    if (!slideStageRef.current) return;
    setIsExportingPng(true);
    try {
      await document.fonts.ready;
      const originalIndex = currentSlideIndex;
      const sanitizedTitle = presentation.title.replace(/[^a-zA-Z0-9-_\s]/g, '').trim() || 'Slide_EBD';
      for (let i = 0; i < slides.length; i++) {
        setCurrentSlideIndex(i);
        await new Promise(r => setTimeout(r, 450)); // aguarda SmartText
        if (slideStageRef.current) {
          const dataUrl = await toPng(slideStageRef.current, { quality: 0.95, pixelRatio: 2 });
          const link = document.createElement('a');
          link.download = `${sanitizedTitle}_Slide_${i + 1}.png`;
          link.href = dataUrl;
          link.click();
          await new Promise(r => setTimeout(r, 200));
        }
      }
      setCurrentSlideIndex(originalIndex);
    } catch (err) {
      console.error('Erro ao exportar PNG:', err);
    } finally {
      setIsExportingPng(false);
    }
  };

  const nextSlide = () => { if (currentSlideIndex < slides.length - 1) setCurrentSlideIndex(currentSlideIndex + 1); };
  const prevSlide = () => { if (currentSlideIndex > 0) setCurrentSlideIndex(currentSlideIndex - 1); };

  const handleRegenerateImage = async () => {
    setIsRegeneratingImage(true);
    try {
      const promptToUse = customPromptInput.trim() || currentSlide.imagePrompt || `Cena bíblica histórica para ${currentSlide.title}`;
      const newUrl = await generateAiImage(promptToUse, currentSlide.title);
      updateCurrentSlide({ imageUrl: newUrl, imagePrompt: promptToUse, imageSource: 'ai' });
      setIsEditingPrompt(false);
    } catch {
      alert('Erro ao gerar imagem por IA.');
    } finally {
      setIsRegeneratingImage(false);
    }
  };

  const handleLocalImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { const d = ev.target?.result as string; if (d) updateCurrentSlide({ imageUrl: d, imageSource: 'user' }); };
    reader.readAsDataURL(file);
  };

  const handleCustomTemplateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { const d = ev.target?.result as string; if (d) setCustomTemplateBg(d); };
    reader.readAsDataURL(file);
  };

  const handleSelectGalleryImage = (url: string, title: string) => {
    updateCurrentSlide({ imageUrl: url, imagePrompt: `Imagem selecionada: ${title}`, imageSource: 'user' });
    setIsGalleryOpen(false);
  };

  const handleRemoveImage = () => updateCurrentSlide({ imageUrl: undefined, imageSource: undefined });

  return (
    <div className="preview-container space-y-5 max-w-6xl mx-auto font-['Gotham']">

      {/* ── Toolbar ── */}
      <div className="preview-toolbar flex flex-wrap items-center justify-between bg-slate-900/90 backdrop-blur-md border border-slate-700/80 p-4 rounded-2xl shadow-xl gap-4">
        <div className="flex items-center gap-3">
          <button onClick={onReset} className="btn-secondary text-xs flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 py-2 rounded-xl border border-slate-600 font-semibold transition-all">
            <RefreshCw className="w-3.5 h-3.5 text-blue-400" /> Nova Lição EBD
          </button>
          <div className="text-white text-sm font-extrabold truncate max-w-md tracking-tight">{presentation.title}</div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-slate-400 font-semibold bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
            Slide {currentSlideIndex + 1} de {slides.length}
          </span>
          <button onClick={handleDownloadPngCurrent} disabled={isExportingPng} className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold px-3.5 py-2 rounded-xl border border-slate-600 flex items-center gap-1.5 text-xs transition-all cursor-pointer">
            <FileImage className="w-4 h-4 text-amber-400" />
            {isExportingPng ? 'Baixando...' : 'Baixar PNG (Este Slide)'}
          </button>
          <button onClick={handleDownloadPdfCurrent} disabled={isExportingPng} className="bg-slate-800 hover:bg-slate-700 text-orange-300 font-bold px-3.5 py-2 rounded-xl border border-orange-600/40 flex items-center gap-1.5 text-xs transition-all cursor-pointer">
            <FileImage className="w-4 h-4 text-orange-400" />
            {isExportingPng ? 'Baixando...' : 'Baixar PDF (Este Slide)'}
          </button>
          <button onClick={handleDownloadPngAll} disabled={isExportingPng} className="bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold px-3.5 py-2 rounded-xl border border-amber-500/40 flex items-center gap-1.5 text-xs transition-all cursor-pointer">
            <FileImage className="w-4 h-4 text-amber-400" />
            {isExportingPng ? 'Baixando...' : 'Baixar Todos (PNG)'}
          </button>
          <button onClick={handleDownload} className="download-pptx-btn bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-400 text-white font-extrabold px-4 py-2 rounded-xl flex items-center gap-2 text-xs shadow-lg cursor-pointer transition-all hover:scale-105">
            <Download className="w-4 h-4" /> PowerPoint (.pptx)
          </button>
        </div>
      </div>

      {/* ── Controle de imagens ── */}
      <div className="bg-slate-900/90 border border-slate-700/90 rounded-2xl p-3.5 shadow-lg flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5 text-slate-300">
          <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30"><ImageIcon className="w-4 h-4" /></div>
          <div>
            <span className="font-bold text-white block">Controle Visual &amp; Modelo:</span>
            <span className="text-slate-400 text-[11px] truncate max-w-md block">
              {customTemplateBg ? '✨ Usando Modelo Customizado' : (currentSlide.imagePrompt || 'Modelo Oficial MegaEBD')}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white border border-indigo-400/40 px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 font-extrabold cursor-pointer transition-all shadow-md">
            <LayoutTemplate className="w-4 h-4 text-amber-300" /> 📁 Upload do Meu Modelo
            <input type="file" accept="image/*" onChange={handleCustomTemplateUpload} className="hidden" />
          </label>
          {customTemplateBg && (
            <button onClick={() => setCustomTemplateBg(null)} className="bg-red-600/20 hover:bg-red-600/40 text-red-300 border border-red-500/30 px-2.5 py-1.5 rounded-xl font-bold transition-all text-[11px]">
              Restaurar Padrão
            </button>
          )}
          <button onClick={handleRegenerateImage} disabled={isRegeneratingImage} className="bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 border border-blue-500/40 px-3 py-1.5 rounded-xl flex items-center gap-1.5 font-bold transition-all cursor-pointer">
            <RefreshCcw className={`w-3.5 h-3.5 ${isRegeneratingImage ? 'animate-spin' : ''}`} />
            {isRegeneratingImage ? 'Gerando...' : '🔄 Gerar por IA'}
          </button>
          <button onClick={() => setIsGalleryOpen(true)} className="bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 border border-purple-500/40 px-3 py-1.5 rounded-xl flex items-center gap-1.5 font-bold transition-all cursor-pointer">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" /> 🖼️ Galeria Bíblica
          </button>
          <label className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 px-3 py-1.5 rounded-xl flex items-center gap-1.5 font-bold cursor-pointer transition-all">
            <Upload className="w-3.5 h-3.5 text-emerald-400" /> 📁 Minha Imagem
            <input type="file" accept="image/*" onChange={handleLocalImageUpload} className="hidden" />
          </label>
          <button onClick={() => { setCustomPromptInput(currentSlide.imagePrompt || ''); setIsEditingPrompt(!isEditingPrompt); }} className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 px-3 py-1.5 rounded-xl flex items-center gap-1.5 font-bold transition-all cursor-pointer">
            <Edit3 className="w-3.5 h-3.5" /> ✏️ Prompt
          </button>
          {currentSlide.imageUrl && (
            <button onClick={handleRemoveImage} className="bg-red-600/20 hover:bg-red-600/40 text-red-300 border border-red-500/30 px-2.5 py-1.5 rounded-xl flex items-center gap-1 font-bold transition-all cursor-pointer">
              <Trash2 className="w-3.5 h-3.5" /> Remover
            </button>
          )}
        </div>
      </div>

      {/* ── Editor de prompt ── */}
      {isEditingPrompt && (
        <div className="bg-slate-900 p-3.5 rounded-2xl border border-purple-500/50 flex items-center gap-3 shadow-xl">
          <input type="text" placeholder="Digite o prompt da cena bíblica..." value={customPromptInput} onChange={e => setCustomPromptInput(e.target.value)}
            className="flex-1 bg-slate-800 border border-slate-700 text-white text-xs px-3.5 py-2.5 rounded-xl outline-none focus:border-purple-400" />
          <button onClick={handleRegenerateImage} disabled={isRegeneratingImage} className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-extrabold px-4 py-2.5 rounded-xl transition-all cursor-pointer">
            Gerar com este Prompt
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          ESTÁGIO DO SLIDE  (aspect-ratio 16:9 — SmartText em tudo)
          SmartText mede o DOM real e NUNCA comprime horizontalmente.
      ══════════════════════════════════════════════════════════════════════ */}
      <div
        ref={slideStageRef}
        style={customTemplateBg ? { backgroundImage: `url(${customTemplateBg})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
        className={`slide-stage-wrapper rounded-3xl overflow-hidden shadow-2xl border border-slate-700/80 relative font-['Gotham'] ${
          customTemplateBg ? 'text-white' : 'bg-[#0d2238] text-white'
        }`}
      >
        {/* ── Background Imagem se o Usuário Carregar o Próprio Modelo ── */}
        {customTemplateBg && (
          <img src={customTemplateBg} alt="Modelo Personalizado" className="absolute inset-0 w-full h-full object-cover z-0" />
        )}

        {/* ── Conteúdo Oficial do Modelo EBD ── */}
        {(isOfficialEbdTheme || customTemplateBg) ? (
          /* ── Oficial EBD / Modelo Personalizado do Usuário ── */
          <div className={`absolute inset-0 flex flex-col justify-between overflow-hidden text-white ${customTemplateBg ? 'bg-transparent' : 'bg-white'}`} style={{ padding: '2% 3%' }}>
            {!customTemplateBg && currentSlide.layout !== 'title' && <TopLeftPolygons />}
            {currentSlide.layout !== 'title' && <BottomRightPolygonBadge current={currentSlideIndex + 1} total={slides.length} />}

            {/* ── CAPA ── */}
            {currentSlide.layout === 'title' && (
              <div className="absolute inset-0 flex flex-col justify-between overflow-hidden">
                <img src={currentSlide.imageUrl || BIBLICAL_IMAGE_GALLERY[0].url} alt={currentSlide.title} className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/60 to-transparent" />
                <TopLeftPolygons />
                <div className="relative z-10 flex-1 flex items-center justify-center px-[8%] py-[4%]">
                  <SmartText
                    text={presentation.title}
                    maxFontSize={52}
                    minFontSize={14}
                    className="font-black text-white uppercase tracking-tight drop-shadow-[0_6px_12px_rgba(0,0,0,0.9)] text-center"
                    style={{ fontFamily: "'Gotham', 'Gotham Medium', sans-serif" }}
                  />
                </div>
                <div className="relative z-10 w-full pb-3">
                  <EbdHeaderBadge label={presentation.lessonNumber || 'LIÇÃO EBD'} />
                </div>
              </div>
            )}

            {/* ── TEXTO ÁUREO / VERDADE PRÁTICA / LEITURA BÍBLICA ── */}
            {isVerseOrReading && currentSlide.layout !== 'title' && (
              <div className="relative z-10 h-full w-full flex flex-col justify-between items-center py-2 px-4">
                <div className="w-full shrink-0 pt-1">
                  <EbdHeaderBadge label={currentSlide.topicBadge || currentSlide.title || 'TEXTO ÁUREO'} />
                </div>

                {/* Conteúdo perfeitamente centralizado na vertical em toda a tela (FONTES DOBRADAS) */}
                <div className="flex-1 w-full flex flex-col items-center justify-center text-center px-[4%] my-auto">
                  {currentSlide.keyVerse ? (
                    <div className="w-full space-y-4 flex flex-col justify-center items-center">
                      <SmartText text={`"${currentSlide.keyVerse.text}"`} maxFontSize={72} minFontSize={20} className="font-extrabold text-white text-center leading-relaxed w-full" />
                      <SmartText text={`(${currentSlide.keyVerse.reference}).`} maxFontSize={48} minFontSize={18} className="font-black text-yellow-400 text-center tracking-wide" />
                    </div>
                  ) : currentSlide.takeaway ? (
                    <div className="w-full flex flex-col justify-center items-center">
                      <SmartText text={`"${currentSlide.takeaway}"`} maxFontSize={72} minFontSize={20} className="font-extrabold text-white text-center w-full leading-relaxed" />
                    </div>
                  ) : (
                    <div className="w-full space-y-4 flex flex-col justify-center items-center">
                      {presentation.biblicalText && (
                        <SmartText text={presentation.biblicalText} maxFontSize={40} minFontSize={18} className="font-extrabold text-yellow-400 uppercase tracking-wider text-center" />
                      )}
                      <SmartText
                        text={currentSlide.subtitle || (currentSlide.bulletPoints || []).join(' ') || 'Leitura bíblica...'}
                        maxFontSize={40}
                        minFontSize={18}
                        className="font-semibold text-white text-center leading-relaxed w-full"
                        style={{ lineHeight: 1.5 }}
                      />
                    </div>
                  )}
                </div>

                <div className="w-full shrink-0 h-8" />
              </div>
            )}

            {/* ── TÓPICOS ── */}
            {!isVerseOrReading && currentSlide.layout !== 'title' && (
              <div className="relative z-10 h-full w-full flex flex-col justify-between items-center py-2 px-4">
                <div className="w-full shrink-0 pt-1">
                  <EbdHeaderBadge label={currentSlide.topicBadge || currentSlide.title || 'TÓPICO DA LIÇÃO'} />
                </div>

                {/* Conteúdo: flex-1 centralizado na vertical (FONTES DOBRADAS) */}
                <div className="flex-1 w-full flex flex-col items-center justify-center text-center px-[4%] my-auto">
                  {currentSlide.topicBadge && currentSlide.title && (
                    <SmartText
                      text={currentSlide.topicBadge.toUpperCase().includes('SUBTÓPICO') || currentSlide.topicBadge.toUpperCase().includes('SUBT') ? currentSlide.title : currentSlide.title.toUpperCase()}
                      maxFontSize={108}
                      minFontSize={24}
                      maxLines={2}
                      className={`font-black text-yellow-400 text-center tracking-wide mb-3 w-full ${currentSlide.topicBadge.toUpperCase().includes('SUBT') ? 'normal-case' : 'uppercase'}`}
                      style={{ fontFamily: "'Gotham', 'Gotham Medium', sans-serif" }}
                    />
                  )}
                  {currentSlide.bulletPoints && currentSlide.bulletPoints.length > 0 ? (
                    <div className="w-full space-y-4 overflow-hidden">
                      {currentSlide.bulletPoints.map((pt, i) => (
                        <div key={i} className="flex items-start justify-center gap-3">
                          <span
                            className="shrink-0 rounded-full bg-[#091b2c] flex items-center justify-center font-black text-white leading-none"
                            style={{ width: 'clamp(28px, 5%, 44px)', height: 'clamp(28px, 5%, 44px)', fontSize: 'clamp(14px, 2.5%, 26px)', marginTop: '0.15em' }}
                          >
                            {i + 1}
                          </span>
                          <SmartText text={pt} maxFontSize={64} minFontSize={18} className="font-bold text-white text-left leading-relaxed" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <SmartText text={currentSlide.subtitle || currentSlide.speakerNotes || ''} maxFontSize={80} minFontSize={20} className="font-extrabold text-white text-center w-full leading-relaxed" />
                  )}
                </div>

                <div className="w-full shrink-0 h-8" />
              </div>
            )}

            {/* Rodapé */}
            {currentSlide.layout !== 'title' && (
              <div className="absolute bottom-0 left-0 right-16 flex items-center px-3 pb-1 z-30 pointer-events-none" style={{ height: '5%' }}>
                <span className="text-slate-400 font-medium truncate" style={{ fontSize: 'clamp(5px, 0.9%, 9px)', fontFamily: "'Gotham', 'Gotham Medium', sans-serif" }}>
                  MegaEBD • {presentation.title}
                </span>
              </div>
            )}
          </div>

        ) : (
          /* ── Outros temas ── */
          <div className="absolute inset-0 p-8 flex flex-col justify-between text-white">
            <SmartText text={currentSlide.title} maxFontSize={32} minFontSize={10} className="font-bold" />
            <SmartText text={currentSlide.subtitle || ''} maxFontSize={22} minFontSize={8} className="font-medium" />
          </div>
        )}
      </div>

      {/* ── Miniaturas ── */}
      <div className="slides-navigation-bar flex items-center gap-3 bg-slate-900/90 p-3.5 rounded-2xl border border-slate-700/80 shadow-lg">
        <button onClick={prevSlide} disabled={currentSlideIndex === 0} className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-30 cursor-pointer">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="thumbnails-scroll flex-1 flex items-center gap-2.5 overflow-x-auto py-1">
          {slides.map((slide, idx) => (
            <button
              key={slide.id || idx}
              onClick={() => setCurrentSlideIndex(idx)}
              className={`thumbnail-card px-3.5 py-2.5 rounded-xl text-xs font-semibold border text-left truncate min-w-[130px] max-w-[160px] transition-all cursor-pointer font-['Gotham'] ${
                idx === currentSlideIndex ? 'bg-orange-600 text-white border-orange-400 shadow-lg shadow-orange-500/40 scale-105' : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              <span className="block text-[10px] opacity-75 font-bold uppercase">Slide {idx + 1}</span>
              <span className="truncate block font-extrabold mt-0.5">{slide.topicBadge || slide.title || `Slide ${idx + 1}`}</span>
            </button>
          ))}
        </div>
        <button onClick={nextSlide} disabled={currentSlideIndex === slides.length - 1} className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-30 cursor-pointer">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* ── Notas pedagógicas ── */}
      {currentSlide.speakerNotes && (
        <div className="speaker-notes-card bg-slate-900/90 border border-blue-500/40 p-4 rounded-2xl shadow-lg">
          <div className="notes-header flex items-center gap-2 text-blue-400 font-extrabold text-xs uppercase mb-2">
            <MessageSquare className="w-4 h-4" />
            <span>Notas Pedagógicas para o Professor (EBD)</span>
          </div>
          <p className="notes-text text-xs text-slate-300 leading-relaxed">{currentSlide.speakerNotes}</p>
        </div>
      )}

      {/* ── Modal Galeria ── */}
      {isGalleryOpen && (
        <div className="modal-backdrop font-['Gotham']">
          <div className="modal-card max-w-2xl bg-slate-900 border border-purple-500/40 rounded-2xl p-6 shadow-2xl">
            <div className="modal-header flex justify-between items-center border-b border-slate-700 pb-3 mb-4">
              <div className="flex items-center gap-2 text-white font-bold text-lg">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <span>Galeria de Imagens Bíblicas em Alta Definição (4K)</span>
              </div>
              <button onClick={() => setIsGalleryOpen(false)} className="close-btn text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-slate-300 mb-4">Clique em qualquer imagem abaixo para aplicar ao Slide {currentSlideIndex + 1}:</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3.5 max-h-[380px] overflow-y-auto pr-1">
              {BIBLICAL_IMAGE_GALLERY.map((img) => (
                <div key={img.id} onClick={() => handleSelectGalleryImage(img.url, img.displayTitle)} className="rounded-xl overflow-hidden border border-slate-700 hover:border-amber-400 cursor-pointer group relative bg-slate-950 transition-all hover:scale-105">
                  <img src={img.url} alt={img.displayTitle} className="w-full h-28 object-cover group-hover:opacity-90 transition-opacity" />
                  <div className="p-2 text-[11px] font-bold text-white bg-slate-900/90 truncate">{img.displayTitle}</div>
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-amber-500 text-slate-950 p-1 rounded-full shadow-md transition-opacity"><CheckCircle2 className="w-4 h-4" /></div>
                </div>
              ))}
            </div>
            <div className="mt-5 flex justify-end">
              <button onClick={() => setIsGalleryOpen(false)} className="btn-secondary text-xs">Fechar Galeria</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
