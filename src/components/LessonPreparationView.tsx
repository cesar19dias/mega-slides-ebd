import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { EBDLessonPreparation, EBDTopicPreparation, EBDExtraSlide } from '../types';
import { RefreshCw, RotateCcw, Check, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Monitor, FileText, Bookmark, ArrowLeft, ArrowRight, Printer, Copy, ImageDown, FileDown, LayoutTemplate, Edit3, Trash2, Link2, Plus, ZoomIn, ZoomOut, Type, Move, PlusCircle, Download, Image as ImageIcon, Columns, Sparkles, Crop, Crosshair } from 'lucide-react';
import { callGeminiRaw } from '../services/geminiService';
import { exportAllSlidesPNGZipFromStage, exportTeacherGuideCleanPDF } from '../services/exportService';
import { exportProjectorItemsToPowerPoint } from '../services/pptxService';
import { THEMES } from '../constants/themes';
import { formatAllPromptsForExport, generateAllLessonPromptsWithAi } from '../services/promptGeneratorService';

import { TextHighlightToolbar, HIGHLIGHT_COLORS } from './TextHighlightToolbar';
import { QrCodeModal } from './QrCodeModal';
import { ImageCropModal } from './ImageCropModal';
import { optimizeImageBase64 } from '../services/shareService';

// ── Inline Text Highlight System ──────────────────────────────────
interface TextHighlightEntry {
  text: string;
  color: string;
  style?: 'fill' | 'outline' | 'text'; // default 'fill' for backward compat
}
type SlideHighlights = Record<number, TextHighlightEntry[]>;
const HL_STORAGE_KEY = 'mega_ebd_text_highlights_v2';

function loadSlideHighlights(): SlideHighlights {
  try {
    const s = localStorage.getItem(HL_STORAGE_KEY);
    return s ? JSON.parse(s) : {};
  } catch { return {}; }
}
function persistSlideHighlights(h: SlideHighlights) {
  localStorage.setItem(HL_STORAGE_KEY, JSON.stringify(h));
}

/**
 * Returns React nodes with highlight <mark> elements injected inline.
 * Matching is case-sensitive and marks ALL occurrences.
 */
function applyHighlightsToText(
  text: string,
  entries: TextHighlightEntry[],
  forcedTextColor: string = '#000000'
): React.ReactNode {
  if (!text) return text;
  if (!entries || !entries.length) return <span style={{ color: forcedTextColor }}>{text}</span>;

  // Build sorted, non-overlapping intervals
  const intervals: Array<{ s: number; e: number; color: string; style: 'fill' | 'outline' | 'text' }> = [];
  const lowerText = text.toLowerCase();
  for (const h of entries) {
    if (!h.text) continue;
    // O texto selecionado vem como exibido (ex.: CAIXA ALTA via CSS); compara sem diferenciar maiúsculas e espaços
    const needle = h.text.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!needle) continue;
    const pattern = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+'), 'gi');
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(lowerText)) !== null) {
      const idx = m.index;
      const len = m[0].length;
      const overlaps = intervals.some((iv) => idx < iv.e && idx + len > iv.s);
      if (!overlaps) intervals.push({ s: idx, e: idx + len, color: h.color, style: h.style ?? 'fill' });
      pattern.lastIndex = idx + 1;
    }
  }
  if (!intervals.length) return <span style={{ color: forcedTextColor }}>{text}</span>;
  intervals.sort((a, b) => a.s - b.s);

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  intervals.forEach((iv, i) => {
    if (cursor < iv.s) nodes.push(<span key={`t${i}`} style={{ color: forcedTextColor }}>{text.slice(cursor, iv.s)}</span>);
    
    if (iv.style === 'text') {
      nodes.push(
        <span
          key={`m${i}`}
          style={{
            color: iv.color,
            fontWeight: 'inherit',
            display: 'inline',
          }}
        >
          {text.slice(iv.s, iv.e)}
        </span>
      );
    } else {
      const isFill = iv.style !== 'outline';
      
      // Se o highlight for Preto (#000000), o texto interno fica branco. Se for Branco (#ffffff), o texto interno fica preto.
      let markTextColor = forcedTextColor;
      if (isFill) {
        if (iv.color.toLowerCase() === '#000000') {
          markTextColor = '#ffffff';
        } else if (iv.color.toLowerCase() === '#ffffff') {
          markTextColor = '#000000';
        }
      }

      nodes.push(
        <mark
          key={`m${i}`}
          style={isFill ? {
            background: iv.color,
            color: markTextColor,
            borderRadius: '3px',
            padding: '2px 5px',
            fontWeight: 'inherit',
            display: 'inline',
          } : {
            background: 'transparent',
            color: forcedTextColor,
            borderRadius: '3px',
            padding: '2px 5px',
            fontWeight: 'inherit',
            display: 'inline',
            outline: `4px solid ${iv.color}`,
            outlineOffset: '1px',
          }}
        >
          {text.slice(iv.s, iv.e)}
        </mark>,
      );
    }
    cursor = iv.e;
  });
  if (cursor < text.length) nodes.push(<span key="tend" style={{ color: forcedTextColor }}>{text.slice(cursor)}</span>);
  return <>{nodes}</>;
}

interface EditableTextProps {
  value: string;
  onChange: (val: string) => void;
  isEditMode: boolean;
  multiline?: boolean;
  className?: string;
  placeholder?: string;
  label?: string;
}

const EditableText: React.FC<EditableTextProps> = ({
  value,
  onChange,
  isEditMode,
  multiline = false,
  className = '',
  placeholder = 'Clique para editar...',
  label,
}) => {
  if (!isEditMode) {
    return <span className={className}>{value || placeholder}</span>;
  }

  return (
    <div className="w-full space-y-1 my-1">
      {label && <label className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block">{label}</label>}
      {multiline ? (
        <textarea
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={Math.max(2, (value || '').split('\n').length)}
          className={`w-full bg-slate-950/90 border-2 border-amber-500/60 focus:border-amber-400 text-white rounded-xl p-3 text-sm outline-none transition-all resize-y ${className}`}
        />
      ) : (
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full bg-slate-950/90 border-2 border-amber-500/60 focus:border-amber-400 text-white rounded-xl px-3 py-2 text-sm outline-none transition-all ${className}`}
        />
      )}
    </div>
  );
};




export interface BiblicalVerseSlideData {
  chapterHeader?: string;
  verseText: string;
}

export interface BiblicalVerseItem {
  number: string;
  text: string;
}

export interface BiblicalBookSection {
  bookHeader?: string;
  verses: BiblicalVerseItem[];
}

export interface ParsedBiblicalReading {
  reference?: string;
  sections: BiblicalBookSection[];
}

export function parseBiblicalTextSections(rawText: string): ParsedBiblicalReading {
  if (!rawText || !rawText.trim()) return { sections: [] };

  let text = rawText.trim();
  let reference = '';
  let bodyText = text;

  // 1. Extrai a referência geral do início antes do primeiro travessão "—"
  const firstDash = text.indexOf('—');
  if (firstDash !== -1 && firstDash < 140) {
    reference = text.substring(0, firstDash).trim();
    bodyText = text.substring(firstDash + 1).trim();
  } else {
    const headerMatch = text.match(/^([1-3]?\s*[A-Za-zÀ-ÿ\.]+(?:\s+[A-Za-zÀ-ÿ\.]+)?\s+[\d\.\:\,\s\;\-]+?)(?:\s*[\—\-\n]|\s+(?=[1-3]?\s*[A-Za-zÀ-ÿ\.]+\s+\d{1,3}))/i);
    if (headerMatch && headerMatch[1].length < 140) {
      reference = headerMatch[1].trim().replace(/[\;\.\:\-\—]+$/, '');
      bodyText = text.substring(headerMatch[0].length).trim();
    }
  }

  // 2. Extrai referências individuais (separadas por ;) se houver
  const subRefs = reference.split(';').map(s => s.trim().replace(/[\;\.]+$|^\;/, '')).filter(Boolean);

  // 3. Identifica marcos no texto: Títulos de Livro/Passagem e Versículos
  const bookNamePattern = '(?:Gên|Êx|Lv|Nm|Dt|Jos|Jz|Rt|1Sm|2Sm|1Rs|2Rs|1Cr|2Cr|Esd|Ne|Et|Jó|Sal|Sl|Pv|Ec|Ct|Is|Jer|Jr|Lam|Lm|Ez|Dn|Os|Jl|Am|Ob|Jon|Mq|Na|Hab|Zef|Zc|Ag|Zc|Mal|Ml|Mt|Mat|Mateus|Mc|Mar|Marcos|Lc|Luc|Lucas|Jo|João|At|Atos|Rm|Rom|Romanos|1Co|2Co|Gál|Gal|Gálatas|Ef|Efé|Efésios|Fp|Fil|Filipenses|Cl|Col|Colossenses|1Ts|2Ts|1Tm|2Tm|Tt|Tito|Fm|Heb|Hb|Hebreus|Tg|Tia|Tiago|1Pe|2Pe|1Jo|2Jo|3Jo|Jd|Jud|Judas|Ap|Apoc|Apocalipse|[1-3]?\\s*[A-Za-zÀ-ÿ]+)';

  const headerRegex = new RegExp(`(?:^|\\n|\\s{2,}|(?<=[\\.\\!\\?]"?\\s+)|(?<=\\s))(${bookNamePattern}\\.?\\s+\\d{1,3}(?:[\\.\\:\\,]\\d{1,3}(?:[\\-\\–\\—]\\d{1,3})?)?)(?=\\s*[:\\-\\—\\n]|\\s+\\d{1,3}|\\s*$)`, 'gi');
  const verseRegex = /(?:^|\s+|\n)(\d{1,3})\s*(?:[—\-–\.\:]\s*|\s+)(?=[A-Za-zÀ-ÿ"“'\(])/g;

  interface TokenLandmark {
    type: 'header' | 'verse';
    text: string;
    index: number;
    endIndex: number;
  }

  const landmarks: TokenLandmark[] = [];

  let hMatch: RegExpExecArray | null;
  while ((hMatch = headerRegex.exec(bodyText)) !== null) {
    const fullStr = hMatch[0];
    const headerStr = hMatch[1].trim();
    const idx = hMatch.index + fullStr.indexOf(headerStr);
    landmarks.push({
      type: 'header',
      text: headerStr,
      index: idx,
      endIndex: idx + headerStr.length
    });
  }

  let vMatch: RegExpExecArray | null;
  while ((vMatch = verseRegex.exec(bodyText)) !== null) {
    const fullStr = vMatch[0];
    const verseNum = vMatch[1];
    const idx = vMatch.index + fullStr.indexOf(verseNum);
    const isInsideHeader = landmarks.some(l => l.type === 'header' && idx >= l.index && idx < l.endIndex);
    if (!isInsideHeader) {
      landmarks.push({
        type: 'verse',
        text: verseNum,
        index: idx,
        endIndex: idx + verseNum.length
      });
    }
  }

  landmarks.sort((a, b) => a.index - b.index);

  // Fallback para texto simples sem marcos reconhecidos
  if (landmarks.length === 0) {
    const lines = bodyText.split('\n').map(l => l.trim()).filter(Boolean);
    const verses: BiblicalVerseItem[] = [];
    lines.forEach(line => {
      const match = line.match(/^(\d{1,3})\s*(?:[—\-–\.]\s*)?(.+)$/);
      if (match) {
        verses.push({ number: match[1], text: match[2].trim() });
      } else if (line.length > 0) {
        verses.push({ number: '', text: line });
      }
    });
    return { reference, sections: [{ bookHeader: subRefs[0], verses }] };
  }

  const sections: BiblicalBookSection[] = [];
  let currentSec: BiblicalBookSection = { verses: [] };

  for (let i = 0; i < landmarks.length; i++) {
    const curr = landmarks[i];
    const next = landmarks[i + 1];

    if (curr.type === 'header') {
      if (currentSec.verses.length > 0 || currentSec.bookHeader) {
        sections.push(currentSec);
      }
      currentSec = {
        bookHeader: curr.text,
        verses: []
      };
    } else if (curr.type === 'verse') {
      const contentStart = curr.endIndex;
      const contentEnd = next ? next.index : bodyText.length;
      let verseText = bodyText.substring(contentStart, contentEnd).trim();
      verseText = verseText.replace(/^[—\-–\.\:]\s*/, '').replace(/\[\.\.\.\]/g, '').trim();

      if (verseText.length > 0) {
        currentSec.verses.push({
          number: curr.text,
          text: verseText
        });
      }
    }
  }

  if (currentSec.verses.length > 0 || currentSec.bookHeader) {
    sections.push(currentSec);
  }

  // 4. Filtra seções válidas com versículos e associa os subRefs aos cabeçalhos
  const validSections = sections.filter(sec => sec.verses && sec.verses.length > 0);

  if (validSections.length > 0) {
    validSections.forEach((sec, idx) => {
      if (subRefs[idx]) {
        sec.bookHeader = subRefs[idx];
      }
    });
    return { reference, sections: validSections };
  }

  return { reference, sections };
}

export function splitBiblicalVersesIntoSlides(rawText: string): BiblicalVerseSlideData[] {
  if (!rawText || !rawText.trim()) return [];

  let text = rawText.trim();
  let mainHeader = '';
  let bodyText = text;

  // 1. Extrai a referência inteira do início (ex: "Atos 24.1-6, 10-16") antes do travessão
  const firstDash = text.indexOf('—');
  if (firstDash !== -1 && firstDash < 80) {
    mainHeader = text.substring(0, firstDash).trim();
    bodyText = text.substring(firstDash + 1).trim();
  } else {
    const headerMatch = text.match(/^([1-3]?\s*[A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+)?\s+[\d\.\:\,\s\-]+)(?:\n|$)/i);
    if (headerMatch) {
      mainHeader = headerMatch[1].trim();
    }
  }

  // 2. Procura todas as ocorrências de números de versículos (aceita palavras de 1+ letras como "1 E,", "6 o", "12 e", "3 ó")
  const verseRegex = /(?:^|\s+|\n)(\d{1,3})\s*(?:[—\-–\.]\s*)?(?=[A-Za-zÀ-ÿ"“'\[])/g;
  const matches: { number: string; index: number }[] = [];
  let m: RegExpExecArray | null;

  while ((m = verseRegex.exec(bodyText)) !== null) {
    const numStr = m[1];
    const numIndex = m.index + m[0].indexOf(numStr);
    matches.push({
      number: numStr,
      index: numIndex
    });
  }

  if (matches.length > 0) {
    const rawVerses: { number: string; body: string }[] = [];

    for (let i = 0; i < matches.length; i++) {
      const curr = matches[i];
      const next = matches[i + 1];
      const startIdx = curr.index + curr.number.length;
      const endIdx = next ? next.index : bodyText.length;
      let verseContent = bodyText.substring(startIdx, endIdx).trim();

      // Limpa pontuações/marcadores no início do versículo
      verseContent = verseContent.replace(/^[—\-–\.]\s*/, '').replace(/\[\.\.\.\]/g, '').trim();

      if (verseContent.length > 0) {
        rawVerses.push({
          number: curr.number,
          body: verseContent
        });
      }
    }

    if (rawVerses.length > 0) {
      // Divisão estrita de 2 versículos por slide para garantir legibilidade perfeita
      const slides: BiblicalVerseSlideData[] = [];
      const maxVersesPerSlide = 2;

      for (let i = 0; i < rawVerses.length; i += maxVersesPerSlide) {
        const chunk = rawVerses.slice(i, i + maxVersesPerSlide);
        const combinedVerseText = chunk.map(v => `${v.number} — ${v.body}`).join('\n');
        slides.push({
          chapterHeader: mainHeader || undefined,
          verseText: combinedVerseText
        });
      }

      return slides;
    }
  }

  // Fallback se não houver números de versículos no corpo
  return [{
    chapterHeader: mainHeader || undefined,
    verseText: bodyText
  }];
}

interface LessonPreparationViewProps {
  lessonData: EBDLessonPreparation;
  onReset: () => void;
  onUpdateLesson: (updated: EBDLessonPreparation) => void;
  activeTab?: 'professor' | 'projetor';
  setActiveTab?: (tab: 'professor' | 'projetor') => void;
}

export const LessonPreparationView: React.FC<LessonPreparationViewProps> = ({
  lessonData,
  onReset: _onReset,
  onUpdateLesson,
  activeTab: activeTabProp,
}) => {
  const [lesson, setLesson] = useState<EBDLessonPreparation>(() => {
    let initial = { ...lessonData };
    if (
      initial?.palavraChave?.palavra?.toUpperCase() === 'FIDELIDADE' &&
      initial.palavraChave.explicacao &&
      !initial.palavraChave.explicacao.includes('emûnāh')
    ) {
      initial = {
        ...initial,
        palavraChave: {
          ...initial.palavraChave,
          explicacao: "No hebraico 'emûnāh (raiz 'āman, firmeza, verdade) e no grego pistis/pistos (confiança, lealdade), a fidelidade evoca a ideia de estabilidade inabalável, firmeza e verdade permanente, semelhante a uma rocha inabalável. A fidelidade não é apenas algo que Deus faz, mas a própria essência do Seu caráter imutável; Ele permanece constante e digno de confiança, independentemente das falhas ou circunstâncias humanas."
        }
      };
    }
    return initial;
  });

  const updateLesson = useCallback((updater: (prev: EBDLessonPreparation) => EBDLessonPreparation) => {
    setLesson(prev => {
      const next = updater(prev);
      onUpdateLesson(next);
      return next;
    });
  }, [onUpdateLesson]);

  const [internalActiveTab] = useState<'professor' | 'projetor'>('projetor');
  const activeTab = activeTabProp ?? internalActiveTab;
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [isGeneratingAllPrompts, setIsGeneratingAllPrompts] = useState<boolean>(false);

  // Estado da Visão do Projetor (Slide atual e escala da fonte)
  const [projectorIndex, setProjectorIndex] = useState(0);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [projectorFontSizeScale, setProjectorFontSizeScale] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('mega_ebd_font_size_scale');
      return saved ? parseFloat(saved) : (lessonData.projectorFontSizeScale || 1.0);
    } catch {
      return lessonData.projectorFontSizeScale || 1.0;
    }
  });

  // Estado de escalas de fonte individuais por slide (indexadas pelo projectorIndex)
  const [slideFontScales, setSlideFontScales] = useState<Record<number, number>>(() => {
    if (lessonData.slideFontScales && Object.keys(lessonData.slideFontScales).length > 0) {
      return lessonData.slideFontScales;
    }
    try {
      const saved = localStorage.getItem('mega_ebd_slide_font_scales');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Escalas de fonte específicas para o TÍTULO de cada slide (indexadas pelo projectorIndex)
  const [slideTitleFontScales, setSlideTitleFontScales] = useState<Record<number, number>>(() => {
    if (lessonData.slideTitleFontScales && Object.keys(lessonData.slideTitleFontScales).length > 0) {
      return lessonData.slideTitleFontScales;
    }
    try {
      const saved = localStorage.getItem('mega_ebd_slide_title_font_scales');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [bodyTextColor, setBodyTextColor] = useState<'black' | 'white'>(() => {
    if (lessonData.bodyTextColor) return lessonData.bodyTextColor;
    try {
      return (localStorage.getItem('mega_ebd_body_text_color') as 'black' | 'white') || 'black';
    } catch {
      return 'black';
    }
  });

  const toggleBodyTextColor = useCallback(() => {
    setBodyTextColor(prev => {
      const next = prev === 'black' ? 'white' : 'black';
      try { localStorage.setItem('mega_ebd_body_text_color', next); } catch {}
      updateLesson(l => ({ ...l, bodyTextColor: next }));
      return next;
    });
  }, [updateLesson]);

  // Escalas de fonte específicas para o TEXTO / CORPO de cada slide (indexadas pelo projectorIndex)
  const [slideBodyFontScales, setSlideBodyFontScales] = useState<Record<number, number>>(() => {
    if (lessonData.slideBodyFontScales && Object.keys(lessonData.slideBodyFontScales).length > 0) {
      return lessonData.slideBodyFontScales;
    }
    try {
      const saved = localStorage.getItem('mega_ebd_slide_body_font_scales');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [slideTextOverrides, setSlideTextOverrides] = useState<Record<number, { title?: string; subtitle?: string; text?: string }>>(() => {
    if (lessonData.slideTextOverrides && Object.keys(lessonData.slideTextOverrides).length > 0) {
      return lessonData.slideTextOverrides;
    }
    try {
      const saved = localStorage.getItem('mega_ebd_slide_text_overrides');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Largura personalizada da caixa de texto por slide (30% a 100%)
  const [slideBodyWidths, setSlideBodyWidths] = useState<Record<number, number>>(() => {
    if (lessonData.slideBodyWidths && Object.keys(lessonData.slideBodyWidths).length > 0) {
      return lessonData.slideBodyWidths;
    }
    try {
      const saved = localStorage.getItem('mega_ebd_body_widths');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  const curBodyWidth = slideBodyWidths[projectorIndex] ?? 100;

  // Escala padrão proporcional à largura da caixa de texto (evita quebrar linhas e esconder texto quando a caixa encolhe)
  const defaultBodyScale = curBodyWidth <= 55 ? 1.05 : curBodyWidth <= 75 ? 1.3 : curBodyWidth <= 85 ? 1.45 : 1.7;
  const defaultTitleScale = curBodyWidth <= 65 ? 1.15 : 1.4;

  // Escalas efetivas da fonte do slide atual
  const currentSlideScale = slideFontScales[projectorIndex] !== undefined
    ? slideFontScales[projectorIndex]
    : projectorFontSizeScale;

  const rawTitleScale = slideTitleFontScales[projectorIndex];
  const currentTitleScale = rawTitleScale !== undefined
    ? rawTitleScale
    : defaultTitleScale;
  const isCurrentTitleCustom = rawTitleScale !== undefined;

  const rawBodyScale = slideBodyFontScales[projectorIndex];
  const currentBodyScale = rawBodyScale !== undefined
    ? rawBodyScale
    : defaultBodyScale;
  const isCurrentBodyCustom = rawBodyScale !== undefined;

  // Helper de classes responsivas para o corpo do texto de acordo com a densidade (tamanho do texto vs largura da caixa)
  const getResponsiveBodyTextClass = useCallback((text: string | undefined, isEnfase: boolean = false) => {
    if (!text) return '';
    const curW = slideBodyWidths[projectorIndex] ?? 100;
    const effectiveLen = text.length * (100 / curW);
    const colorClass = bodyTextColor === 'black' ? 'text-black font-black' : 'text-white font-extrabold';

    if (isEnfase) {
      if (effectiveLen > 250) {
        return `${bodyTextColor === 'black' ? 'italic text-black font-black text-sm md:text-base lg:text-lg' : 'italic text-yellow-100 font-extrabold text-sm md:text-base lg:text-lg'} leading-snug`;
      }
      return `${bodyTextColor === 'black' ? 'italic text-black font-black text-base md:text-xl lg:text-2xl' : 'italic text-yellow-100 font-extrabold text-base md:text-xl lg:text-2xl'} leading-normal`;
    }

    if (effectiveLen > 320) {
      return `${bodyTextColor === 'black' ? 'text-black font-black' : 'text-slate-100 font-extrabold'} text-sm md:text-base lg:text-lg leading-snug`;
    }
    if (effectiveLen > 180) {
      return `${bodyTextColor === 'black' ? 'text-black font-black' : 'text-slate-100 font-extrabold'} text-base md:text-lg lg:text-xl leading-normal`;
    }
    return `${colorClass} text-lg md:text-2xl lg:text-3xl leading-relaxed`;
  }, [slideBodyWidths, projectorIndex, bodyTextColor]);

  useEffect(() => {
    setLesson(lessonData);
    if (lessonData.slideFontScales) setSlideFontScales(lessonData.slideFontScales);
    if (lessonData.slideTitleFontScales) setSlideTitleFontScales(lessonData.slideTitleFontScales);
    if (lessonData.slideBodyFontScales) setSlideBodyFontScales(lessonData.slideBodyFontScales);
    if (lessonData.slideBodyWidths) setSlideBodyWidths(lessonData.slideBodyWidths);
    if (lessonData.slideTitlePositions) setSlideTitlePositions(lessonData.slideTitlePositions);
    if (lessonData.slideBodyPositions) setSlideBodyPositions(lessonData.slideBodyPositions);
    if (lessonData.slideImagePositions) setSlideImagePositions(lessonData.slideImagePositions);
    if (lessonData.slideImageScales) setSlideImageScales(lessonData.slideImageScales);
    if (lessonData.slideImageWidths) setSlideImageWidths(lessonData.slideImageWidths);
    if (lessonData.slideImageHeights) setSlideImageHeights(lessonData.slideImageHeights);
    if (lessonData.slideImageCrops) setSlideImageCrops(lessonData.slideImageCrops);
    if (lessonData.slideImageFits) setSlideImageFits(lessonData.slideImageFits);
    if (lessonData.slideImageBorders) setSlideImageBorders(lessonData.slideImageBorders);
    if (lessonData.slideTextOverrides) setSlideTextOverrides(lessonData.slideTextOverrides);
    if (lessonData.projectorSlideImages) setProjectorSlideImages(lessonData.projectorSlideImages);
    if (lessonData.projectorFontSizeScale) setProjectorFontSizeScale(lessonData.projectorFontSizeScale);
    if (lessonData.customBg !== undefined) setCustomBg(lessonData.customBg || null);
    if (lessonData.bodyTextColor) setBodyTextColor(lessonData.bodyTextColor);
  }, [lessonData]);

  // Define a escala de fonte específica para o TÍTULO do slide
  const setSingleTitleScale = useCallback((slideIdx: number, scale: number | null) => {
    setSlideTitleFontScales(prev => {
      const next = { ...prev };
      if (scale === null || scale === undefined) {
        delete next[slideIdx];
      } else {
        next[slideIdx] = Math.round(scale * 100) / 100;
      }
      try {
        localStorage.setItem('mega_ebd_slide_title_font_scales', JSON.stringify(next));
      } catch {}
      updateLesson(l => ({ ...l, slideTitleFontScales: next }));
      return next;
    });
  }, [updateLesson]);

  // Define a escala de fonte específica para o TEXTO/CORPO do slide
  const setSingleBodyScale = useCallback((slideIdx: number, scale: number | null) => {
    setSlideBodyFontScales(prev => {
      const next = { ...prev };
      if (scale === null || scale === undefined) {
        delete next[slideIdx];
      } else {
        next[slideIdx] = Math.round(scale * 100) / 100;
      }
      try {
        localStorage.setItem('mega_ebd_slide_body_font_scales', JSON.stringify(next));
      } catch {}
      updateLesson(l => ({ ...l, slideBodyFontScales: next }));
      return next;
    });
  }, [updateLesson]);

  // Aplica as escalas de título e texto deste slide a todos os slides
  const applyCurrentScalesToAllSlides = useCallback(() => {
    const totalSlides = 60;
    const nextTitles: Record<number, number> = {};
    const nextBodies: Record<number, number> = {};
    for (let i = 0; i < totalSlides; i++) {
      if (currentTitleScale !== defaultTitleScale) nextTitles[i] = currentTitleScale;
      if (currentBodyScale !== defaultBodyScale) nextBodies[i] = currentBodyScale;
    }
    setSlideTitleFontScales(nextTitles);
    setSlideBodyFontScales(nextBodies);
    try {
      localStorage.setItem('mega_ebd_slide_title_font_scales', JSON.stringify(nextTitles));
      localStorage.setItem('mega_ebd_slide_body_font_scales', JSON.stringify(nextBodies));
    } catch {}
    updateLesson(l => ({ ...l, slideTitleFontScales: nextTitles, slideBodyFontScales: nextBodies }));
  }, [currentTitleScale, currentBodyScale, defaultTitleScale, defaultBodyScale, updateLesson]);

  // ── POSICIONAMENTO LIVRE DE ELEMENTOS NO SLIDE ──────────────────────────────
  const [isLayoutEditMode, setIsLayoutEditMode] = useState(false);

  // ── LINHAS-GUIA DE ALINHAMENTO (HORIZONTAL E VERTICAL) ──────────────────────
  const [showAlignmentGuides, setShowAlignmentGuides] = useState<boolean>(() => {
    try {
      return localStorage.getItem('mega_ebd_show_guides') === 'true';
    } catch {
      return false;
    }
  });

  const [guideHPos, setGuideHPos] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('mega_ebd_guide_h');
      return saved !== null ? Number(saved) : 50;
    } catch {
      return 50;
    }
  });

  const [guideVPos, setGuideVPos] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('mega_ebd_guide_v');
      return saved !== null ? Number(saved) : 50;
    } catch {
      return 50;
    }
  });

  const toggleAlignmentGuides = useCallback(() => {
    setShowAlignmentGuides(prev => {
      const next = !prev;
      try { localStorage.setItem('mega_ebd_show_guides', String(next)); } catch {}
      return next;
    });
  }, []);

  const [slideTitlePositions, setSlideTitlePositions] = useState<Record<number, { x: number; y: number }>>(() => {
    if (lessonData.slideTitlePositions && Object.keys(lessonData.slideTitlePositions).length > 0) {
      return lessonData.slideTitlePositions;
    }
    try {
      const saved = localStorage.getItem('mega_ebd_title_positions');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  const [slideBodyPositions, setSlideBodyPositions] = useState<Record<number, { x: number; y: number }>>(() => {
    if (lessonData.slideBodyPositions && Object.keys(lessonData.slideBodyPositions).length > 0) {
      return lessonData.slideBodyPositions;
    }
    try {
      const saved = localStorage.getItem('mega_ebd_body_positions');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  const [slideImagePositions, setSlideImagePositions] = useState<Record<number, { x: number; y: number }>>(() => {
    if (lessonData.slideImagePositions && Object.keys(lessonData.slideImagePositions).length > 0) {
      return lessonData.slideImagePositions;
    }
    try {
      const saved = localStorage.getItem('mega_ebd_image_positions');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  const [slideImageScales, setSlideImageScales] = useState<Record<number, number>>(() => {
    if (lessonData.slideImageScales && Object.keys(lessonData.slideImageScales).length > 0) {
      return lessonData.slideImageScales;
    }
    try {
      const saved = localStorage.getItem('mega_ebd_image_scales');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  const [slideImageFits, setSlideImageFits] = useState<Record<number, 'cover' | 'contain'>>(() => {
    if (lessonData.slideImageFits && Object.keys(lessonData.slideImageFits).length > 0) {
      return lessonData.slideImageFits;
    }
    try {
      const saved = localStorage.getItem('mega_ebd_image_fits');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  // Largura e Altura do Recipiente da Imagem por slide (% da largura/altura do palco)
  const [slideImageWidths, setSlideImageWidths] = useState<Record<number, number>>(() => {
    if (lessonData.slideImageWidths && Object.keys(lessonData.slideImageWidths).length > 0) {
      return lessonData.slideImageWidths;
    }
    try {
      const saved = localStorage.getItem('mega_ebd_image_widths');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  const [slideImageHeights, setSlideImageHeights] = useState<Record<number, number>>(() => {
    if (lessonData.slideImageHeights && Object.keys(lessonData.slideImageHeights).length > 0) {
      return lessonData.slideImageHeights;
    }
    try {
      const saved = localStorage.getItem('mega_ebd_image_heights');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  // Corte Fluido Estilo Canva por slide (panX, panY em %, zoom de 1.0 a 3.0)
  const [slideImageCrops, setSlideImageCrops] = useState<Record<number, { panX: number; panY: number; zoom: number }>>(() => {
    if (lessonData.slideImageCrops && Object.keys(lessonData.slideImageCrops).length > 0) {
      return lessonData.slideImageCrops;
    }
    try {
      const saved = localStorage.getItem('mega_ebd_image_crops');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  const [slideImageBorders, setSlideImageBorders] = useState<Record<number, 'white' | 'thin' | 'thick' | 'none'>>(() => {
    if (lessonData.slideImageBorders && Object.keys(lessonData.slideImageBorders).length > 0) {
      return lessonData.slideImageBorders;
    }
    try {
      const saved = localStorage.getItem('mega_ebd_image_borders');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  // Modo de Recorte Ativo no Slide (Estilo Canva)
  const [isCanvaCropping, setIsCanvaCropping] = useState<boolean>(false);

  // Menus suspensos de opções consolidadas
  const [isSlideMenuOpen, setIsSlideMenuOpen] = useState<boolean>(false);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState<boolean>(false);
  const [isImageMenuOpen, setIsImageMenuOpen] = useState<boolean>(false);
  const slideMenuRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const imageMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (slideMenuRef.current && !slideMenuRef.current.contains(event.target as Node)) {
        setIsSlideMenuOpen(false);
      }
      if (modelMenuRef.current && !modelMenuRef.current.contains(event.target as Node)) {
        setIsModelMenuOpen(false);
      }
      if (imageMenuRef.current && !imageMenuRef.current.contains(event.target as Node)) {
        setIsImageMenuOpen(false);
      }
    }
    const handleOpenQr = () => setIsQrModalOpen(true);
    window.addEventListener('mega-ebd-open-qr', handleOpenQr);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('mega-ebd-open-qr', handleOpenQr);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const titlePos = slideTitlePositions[projectorIndex] ?? { x: 0, y: 0 };
  const bodyPos  = slideBodyPositions[projectorIndex]  ?? { x: 0, y: 0 };
  const imagePos = slideImagePositions[projectorIndex] ?? { x: 0, y: 0 };
  const imageScale = slideImageScales[projectorIndex] ?? 1.0;
  const imageFit = slideImageFits[projectorIndex] ?? 'cover';
  const isTitleMoved = slideTitlePositions[projectorIndex] !== undefined;
  const isBodyMoved  = slideBodyPositions[projectorIndex]  !== undefined;
  const isImageMoved = slideImagePositions[projectorIndex] !== undefined;
  const isImageScaled = slideImageScales[projectorIndex] !== undefined && slideImageScales[projectorIndex] !== 1.0;

  const curBodyW = slideBodyWidths[projectorIndex] ?? 100;
  const isSideBySideActive = curBodyW <= 65 && Math.abs(slideBodyPositions[projectorIndex]?.x ?? 0) > 5;
  const imageWidth = slideImageWidths[projectorIndex] ?? (isSideBySideActive ? 48 : 92);
  const imageHeight = slideImageHeights[projectorIndex] ?? (isSideBySideActive ? 92 : 78);
  const imageCrop = slideImageCrops[projectorIndex] ?? { panX: 0, panY: 0, zoom: 1.0 };
  const isImageWidthCustom = slideImageWidths[projectorIndex] !== undefined;
  const isImageHeightCustom = slideImageHeights[projectorIndex] !== undefined;
  const isImageCropCustom = slideImageCrops[projectorIndex] !== undefined && (imageCrop.panX !== 0 || imageCrop.panY !== 0 || imageCrop.zoom !== 1.0);

  // Ref de redimensionamento interativo de largura do bloco de texto
  const bodyResizeStateRef = useRef<{
    active: boolean;
    side: 'left' | 'right';
    startClientX: number;
    startWidth: number;
    stageWidth: number;
  } | null>(null);

  const handleBodyResizeStart = useCallback((e: React.MouseEvent | React.TouchEvent, side: 'left' | 'right') => {
    if (!isLayoutEditMode) return;
    if ('touches' in e) {
      if (e.cancelable) e.preventDefault();
    } else {
      e.preventDefault();
    }
    e.stopPropagation();

    const stage = projectorStageRef.current;
    const stageW = stage?.clientWidth || 800;

    let clientX = 0;
    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
    } else if ('clientX' in e) {
      clientX = (e as React.MouseEvent).clientX;
    } else {
      return;
    }

    const currentWidth = slideBodyWidths[projectorIndex] ?? 100;

    bodyResizeStateRef.current = {
      active: true,
      side,
      startClientX: clientX,
      startWidth: currentWidth,
      stageWidth: stageW,
    };
  }, [isLayoutEditMode, projectorIndex, slideBodyWidths]);

  // Ref de redimensionamento da largura do recipiente da imagem
  const imageWidthResizeStateRef = useRef<{
    active: boolean;
    side: 'left' | 'right';
    startClientX: number;
    startWidth: number;
    stageWidth: number;
  } | null>(null);

  const handleImageWidthResizeStart = useCallback((e: React.MouseEvent | React.TouchEvent, side: 'left' | 'right') => {
    if (!isLayoutEditMode) return;
    if ('touches' in e) {
      if (e.cancelable) e.preventDefault();
    } else {
      e.preventDefault();
    }
    e.stopPropagation();

    const stage = projectorStageRef.current;
    const stageW = stage?.clientWidth || 800;

    let clientX = 0;
    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
    } else if ('clientX' in e) {
      clientX = (e as React.MouseEvent).clientX;
    } else {
      return;
    }

    const curBodyW = slideBodyWidths[projectorIndex] ?? 100;
    const isSideBySideActive = curBodyW <= 65 && Math.abs(slideBodyPositions[projectorIndex]?.x ?? 0) > 5;
    const currentW = slideImageWidths[projectorIndex] ?? (isSideBySideActive ? 48 : 92);

    imageWidthResizeStateRef.current = {
      active: true,
      side,
      startClientX: clientX,
      startWidth: currentW,
      stageWidth: stageW,
    };
  }, [isLayoutEditMode, projectorIndex, slideBodyWidths, slideBodyPositions, slideImageWidths]);

  // Ref de redimensionamento da altura e limites (superior/inferior) do recipiente da imagem
  const imageHeightResizeStateRef = useRef<{
    active: boolean;
    side: 'top' | 'bottom';
    startClientY: number;
    startHeight: number;
    startPosY: number;
    stageHeight: number;
  } | null>(null);

  const handleImageHeightResizeStart = useCallback((e: React.MouseEvent | React.TouchEvent, side: 'top' | 'bottom') => {
    if (!isLayoutEditMode) return;
    if ('touches' in e) {
      if (e.cancelable) e.preventDefault();
    } else {
      e.preventDefault();
    }
    e.stopPropagation();

    const stage = projectorStageRef.current;
    const stageH = stage?.clientHeight || 450;

    let clientY = 0;
    if ('touches' in e && e.touches.length > 0) {
      clientY = e.touches[0].clientY;
    } else if ('clientX' in e) {
      clientY = (e as React.MouseEvent).clientY;
    } else {
      return;
    }

    const curBodyW = slideBodyWidths[projectorIndex] ?? 100;
    const isSideBySideActive = curBodyW <= 65 && Math.abs(slideBodyPositions[projectorIndex]?.x ?? 0) > 5;
    const currentH = slideImageHeights[projectorIndex] ?? (isSideBySideActive ? 92 : 78);
    const currentPosY = slideImagePositions[projectorIndex]?.y ?? (isSideBySideActive ? 0 : 7.0);

    imageHeightResizeStateRef.current = {
      active: true,
      side,
      startClientY: clientY,
      startHeight: currentH,
      startPosY: currentPosY,
      stageHeight: stageH,
    };
  }, [isLayoutEditMode, projectorIndex, slideBodyWidths, slideBodyPositions, slideImageHeights, slideImagePositions]);

  const resetSlideImageHeight = useCallback(() => {
    setSlideImageHeights(prev => {
      const next = { ...prev };
      delete next[projectorIndex];
      try { localStorage.setItem('mega_ebd_image_heights', JSON.stringify(next)); } catch {}
      updateLesson(l => ({ ...l, slideImageHeights: next }));
      return next;
    });
  }, [projectorIndex, updateLesson]);

  // Ref de arraste / pan da imagem dentro do quadro no modo Canva
  const cropPanStateRef = useRef<{
    active: boolean;
    startClientX: number;
    startClientY: number;
    startPanX: number;
    startPanY: number;
    containerWidth: number;
    containerHeight: number;
  } | null>(null);

  const handleCropPanStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if ('touches' in e) {
      if (e.cancelable) e.preventDefault();
    } else {
      e.preventDefault();
    }
    e.stopPropagation();

    const imgContainer = (e.currentTarget as HTMLElement).closest('.slide-image-frame');
    const rect = imgContainer?.getBoundingClientRect() || { width: 400, height: 300 };

    let clientX = 0;
    let clientY = 0;
    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('clientX' in e) {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    } else {
      return;
    }

    const curCrop = slideImageCrops[projectorIndex] ?? { panX: 0, panY: 0, zoom: 1.0 };
    cropPanStateRef.current = {
      active: true,
      startClientX: clientX,
      startClientY: clientY,
      startPanX: curCrop.panX,
      startPanY: curCrop.panY,
      containerWidth: rect.width || 400,
      containerHeight: rect.height || 300,
    };
  }, [projectorIndex, slideImageCrops]);

  const resetSlideImageWidth = useCallback(() => {
    setSlideImageWidths(prev => {
      const next = { ...prev };
      delete next[projectorIndex];
      try { localStorage.setItem('mega_ebd_image_widths', JSON.stringify(next)); } catch {}
      updateLesson(l => ({ ...l, slideImageWidths: next }));
      return next;
    });
  }, [projectorIndex, updateLesson]);

  const setSingleImageCrop = useCallback((slideIdx: number, crop: { panX: number; panY: number; zoom: number }) => {
    setSlideImageCrops(prev => {
      const next = { ...prev, [slideIdx]: crop };
      try { localStorage.setItem('mega_ebd_image_crops', JSON.stringify(next)); } catch {}
      updateLesson(l => ({ ...l, slideImageCrops: next }));
      return next;
    });
  }, [updateLesson]);

  const resetSlideImageCrop = useCallback(() => {
    setSlideImageCrops(prev => {
      const next = { ...prev };
      delete next[projectorIndex];
      try { localStorage.setItem('mega_ebd_image_crops', JSON.stringify(next)); } catch {}
      updateLesson(l => ({ ...l, slideImageCrops: next }));
      return next;
    });
  }, [projectorIndex, updateLesson]);

  // Força a imagem a ocupar 100% da área branca do slide (estritamente abaixo do cabeçalho)
  const occupyFullArea = useCallback(() => {
    // 1. Posiciona no centro horizontal (x: 0) e centro Y deslocado para baixo (y: 7.0) para encaixar na área branca abaixo do cabeçalho (topo: 18%, base: 96%)
    setSlideImagePositions(prev => {
      const next = { ...prev, [projectorIndex]: { x: 0, y: 7.0 } };
      try { localStorage.setItem('mega_ebd_image_positions', JSON.stringify(next)); } catch {}
      updateLesson(l => ({ ...l, slideImagePositions: next }));
      return next;
    });

    // 2. Define largura para 92% (encaixe exato na área branca da moldura)
    setSlideImageWidths(prev => {
      const next = { ...prev, [projectorIndex]: 92 };
      try { localStorage.setItem('mega_ebd_image_widths', JSON.stringify(next)); } catch {}
      updateLesson(l => ({ ...l, slideImageWidths: next }));
      return next;
    });

    // 3. Define altura para 78% (encaixa perfeitamente da linha inferior do cabeçalho ~18% até ~96%)
    setSlideImageHeights(prev => {
      const next = { ...prev, [projectorIndex]: 78 };
      try { localStorage.setItem('mega_ebd_image_heights', JSON.stringify(next)); } catch {}
      updateLesson(l => ({ ...l, slideImageHeights: next }));
      return next;
    });

    // 4. Define escala para 1.0 (100%)
    setSlideImageScales(prev => {
      const next = { ...prev, [projectorIndex]: 1.0 };
      try { localStorage.setItem('mega_ebd_image_scales', JSON.stringify(next)); } catch {}
      updateLesson(l => ({ ...l, slideImageScales: next }));
      return next;
    });

    // 5. Define ajuste para 'cover' (preencher completamente sem faixas brancas)
    setSlideImageFits(prev => {
      const next: Record<number, 'cover' | 'contain'> = { ...prev, [projectorIndex]: 'cover' };
      try { localStorage.setItem('mega_ebd_image_fits', JSON.stringify(next)); } catch {}
      updateLesson(l => ({ ...l, slideImageFits: next }));
      return next;
    });

    // 6. Reseta pan e zoom do corte para centralizado
    setSlideImageCrops(prev => {
      const next = { ...prev, [projectorIndex]: { panX: 0, panY: 0, zoom: 1.0 } };
      try { localStorage.setItem('mega_ebd_image_crops', JSON.stringify(next)); } catch {}
      updateLesson(l => ({ ...l, slideImageCrops: next }));
      return next;
    });
  }, [projectorIndex, updateLesson]);

  // Encaixe total na tela inteira (caso queira tela inteira sem respeitar cabeçalho)
  const occupyEntireStage = useCallback(() => {
    setSlideImagePositions(prev => {
      const next = { ...prev };
      delete next[projectorIndex];
      try { localStorage.setItem('mega_ebd_image_positions', JSON.stringify(next)); } catch {}
      updateLesson(l => ({ ...l, slideImagePositions: next }));
      return next;
    });
    setSlideImageWidths(prev => {
      const next = { ...prev, [projectorIndex]: 100 };
      try { localStorage.setItem('mega_ebd_image_widths', JSON.stringify(next)); } catch {}
      updateLesson(l => ({ ...l, slideImageWidths: next }));
      return next;
    });
    setSlideImageHeights(prev => {
      const next = { ...prev, [projectorIndex]: 100 };
      try { localStorage.setItem('mega_ebd_image_heights', JSON.stringify(next)); } catch {}
      updateLesson(l => ({ ...l, slideImageHeights: next }));
      return next;
    });
    setSlideImageScales(prev => {
      const next = { ...prev, [projectorIndex]: 1.0 };
      try { localStorage.setItem('mega_ebd_image_scales', JSON.stringify(next)); } catch {}
      updateLesson(l => ({ ...l, slideImageScales: next }));
      return next;
    });
    setSlideImageFits(prev => {
      const next: Record<number, 'cover' | 'contain'> = { ...prev, [projectorIndex]: 'cover' };
      try { localStorage.setItem('mega_ebd_image_fits', JSON.stringify(next)); } catch {}
      updateLesson(l => ({ ...l, slideImageFits: next }));
      return next;
    });
  }, [projectorIndex, updateLesson]);

  // Ref de redimensionamento interativo por alças nos cantos da imagem
  const resizeStateRef = useRef<{
    active: boolean;
    corner: 'nw' | 'ne' | 'se' | 'sw';
    startClientX: number;
    startClientY: number;
    startCenterX: number;
    startCenterY: number;
    startDist: number;
    startScale: number;
  } | null>(null);

  const handleImageResizeStart = useCallback((e: React.MouseEvent | React.TouchEvent, corner: 'nw' | 'ne' | 'se' | 'sw') => {
    if (!isLayoutEditMode) return;
    if ('touches' in e) {
      if (e.cancelable) e.preventDefault();
    } else {
      e.preventDefault();
    }
    e.stopPropagation();

    const stage = projectorStageRef.current;
    if (!stage) return;

    let clientX = 0;
    let clientY = 0;
    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('clientX' in e) {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    } else {
      return;
    }

    const imgContainer = (e.currentTarget as HTMLElement).closest('.slide-image-container');
    const rect = imgContainer ? imgContainer.getBoundingClientRect() : stage.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const startDist = Math.max(10, Math.hypot(clientX - centerX, clientY - centerY));
    const currentScale = slideImageScales[projectorIndex] ?? 1.0;

    resizeStateRef.current = {
      active: true,
      corner,
      startClientX: clientX,
      startClientY: clientY,
      startCenterX: centerX,
      startCenterY: centerY,
      startDist,
      startScale: currentScale,
    };
  }, [isLayoutEditMode, projectorIndex, slideImageScales]);

  // Ref de drag responsivo (suporta mouse e touch com posições em porcentagem)
  const dragStateRef = useRef<{
    active: boolean;
    kind: 'title' | 'body' | 'image';
    startClientX: number;
    startClientY: number;
    startOffsetXPct: number;
    startOffsetYPct: number;
    stageWidth: number;
    stageHeight: number;
  } | null>(null);

  const handleElementDragStart = useCallback((e: React.MouseEvent | React.TouchEvent, kind: 'title' | 'body' | 'image') => {
    if (!isLayoutEditMode) return;
    if ('touches' in e) {
      if (e.cancelable) e.preventDefault();
    } else {
      e.preventDefault();
    }
    e.stopPropagation();

    const stage = projectorStageRef.current;
    const stageRect = stage ? stage.getBoundingClientRect() : { width: 800, height: 450 };
    const stageW = stageRect.width || 800;
    const stageH = stageRect.height || 450;

    let clientX = 0;
    let clientY = 0;
    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('clientX' in e) {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    } else {
      return;
    }

    const rawPos = kind === 'title'
      ? (slideTitlePositions[projectorIndex] ?? { x: 0, y: 0 })
      : kind === 'body'
      ? (slideBodyPositions[projectorIndex]  ?? { x: 0, y: 0 })
      : (slideImagePositions[projectorIndex] ?? { x: 0, y: 0 });

    let startXPct = rawPos.x;
    let startYPct = rawPos.y;
    // Converte pixels legados (>100px) para porcentagem responsiva do palco
    if (Math.abs(startXPct) > 100) startXPct = (startXPct / stageW) * 100;
    if (Math.abs(startYPct) > 100) startYPct = (startYPct / stageH) * 100;

    dragStateRef.current = {
      active: true,
      kind,
      startClientX: clientX,
      startClientY: clientY,
      startOffsetXPct: startXPct,
      startOffsetYPct: startYPct,
      stageWidth: stageW,
      stageHeight: stageH,
    };
  }, [isLayoutEditMode, projectorIndex, slideTitlePositions, slideBodyPositions, slideImagePositions]);

  // Ref e handler para arrastar as Linhas Guia (Horizontal e Vertical)
  const guideDragRef = useRef<{
    active: boolean;
    axis: 'h' | 'v';
  } | null>(null);

  const handleGuideDragStart = useCallback((e: React.MouseEvent | React.TouchEvent, axis: 'h' | 'v') => {
    if ('touches' in e) {
      if (e.cancelable) e.preventDefault();
    } else {
      e.preventDefault();
    }
    e.stopPropagation();

    guideDragRef.current = {
      active: true,
      axis,
    };
  }, []);

  // Listeners globais de mouse/touch para o drag responsivo e resize
  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      // -1. Arraste interativo das Linhas Guia (Horizontal e Vertical)
      if (guideDragRef.current?.active) {
        let clientX = 0;
        let clientY = 0;
        if ('touches' in e && e.touches.length > 0) {
          clientX = e.touches[0].clientX;
          clientY = e.touches[0].clientY;
          if (e.cancelable) e.preventDefault();
        } else if ('clientX' in e) {
          clientX = (e as MouseEvent).clientX;
          clientY = (e as MouseEvent).clientY;
        } else {
          return;
        }

        const stage = projectorStageRef.current;
        if (!stage) return;
        const rect = stage.getBoundingClientRect();
        const stageW = rect.width || 800;
        const stageH = rect.height || 450;

        if (guideDragRef.current.axis === 'h') {
          const relY = clientY - rect.top;
          const pct = Math.max(3, Math.min(97, Math.round((relY / stageH) * 1000) / 10));
          setGuideHPos(pct);
        } else {
          const relX = clientX - rect.left;
          const pct = Math.max(3, Math.min(97, Math.round((relX / stageW) * 1000) / 10));
          setGuideVPos(pct);
        }
        return;
      }

      // 0. Pan/Arraste fluido da foto no modo Canva Crop
      if (cropPanStateRef.current?.active) {
        let clientX = 0;
        let clientY = 0;
        if ('touches' in e && e.touches.length > 0) {
          clientX = e.touches[0].clientX;
          clientY = e.touches[0].clientY;
          if (e.cancelable) e.preventDefault();
        } else if ('clientX' in e) {
          clientX = (e as MouseEvent).clientX;
          clientY = (e as MouseEvent).clientY;
        } else {
          return;
        }

        const { startClientX, startClientY, startPanX, startPanY, containerWidth, containerHeight } = cropPanStateRef.current;
        const dx = clientX - startClientX;
        const dy = clientY - startClientY;
        const deltaPanX = (dx / (containerWidth || 400)) * 100;
        const deltaPanY = (dy / (containerHeight || 300)) * 100;

        const curCrop = slideImageCrops[projectorIndex] ?? { panX: 0, panY: 0, zoom: 1.0 };
        const newPanX = Math.max(-100, Math.min(100, Math.round((startPanX + deltaPanX) * 10) / 10));
        const newPanY = Math.max(-100, Math.min(100, Math.round((startPanY + deltaPanY) * 10) / 10));

        setSlideImageCrops(prev => ({
          ...prev,
          [projectorIndex]: {
            ...curCrop,
            panX: newPanX,
            panY: newPanY,
          }
        }));
        return;
      }

      // 1. Redimensionamento interativo da imagem (puxando os cantos)
      if (resizeStateRef.current?.active) {
        let clientX = 0;
        let clientY = 0;
        if ('touches' in e && e.touches.length > 0) {
          clientX = e.touches[0].clientX;
          clientY = e.touches[0].clientY;
          if (e.cancelable) e.preventDefault();
        } else if ('clientX' in e) {
          clientX = (e as MouseEvent).clientX;
          clientY = (e as MouseEvent).clientY;
        } else {
          return;
        }

        const { startCenterX, startCenterY, startDist, startScale } = resizeStateRef.current;
        const currentDist = Math.hypot(clientX - startCenterX, clientY - startCenterY);
        const factor = currentDist / startDist;
        const rawScale = startScale * factor;
        const clampedScale = Math.min(3.0, Math.max(0.2, Math.round(rawScale * 100) / 100));

        setSlideImageScales(prev => ({ ...prev, [projectorIndex]: clampedScale }));
        return;
      }

      // Redimensionamento interativo da largura do recipiente da imagem
      if (imageWidthResizeStateRef.current?.active) {
        let clientX = 0;
        if ('touches' in e && e.touches.length > 0) {
          clientX = e.touches[0].clientX;
          if (e.cancelable) e.preventDefault();
        } else if ('clientX' in e) {
          clientX = (e as MouseEvent).clientX;
        } else {
          return;
        }

        const { startClientX, startWidth, stageWidth, side } = imageWidthResizeStateRef.current;
        const dxPx = clientX - startClientX;
        const deltaPct = (dxPx / stageWidth) * 100;
        const factor = side === 'left' ? -deltaPct * 2 : deltaPct * 2;
        const newW = Math.min(100, Math.max(20, Math.round(startWidth + factor)));

        setSlideImageWidths(prev => ({ ...prev, [projectorIndex]: newW }));
        return;
      }

      // Redimensionamento interativo da altura e limites do topo/base do recipiente da imagem
      if (imageHeightResizeStateRef.current?.active) {
        let clientY = 0;
        if ('touches' in e && e.touches.length > 0) {
          clientY = e.touches[0].clientY;
          if (e.cancelable) e.preventDefault();
        } else if ('clientX' in e) {
          clientY = (e as MouseEvent).clientY;
        } else {
          return;
        }

        const { startClientY, startHeight, startPosY, stageHeight, side } = imageHeightResizeStateRef.current;
        const dyPx = clientY - startClientY;
        const deltaPct = (dyPx / stageHeight) * 100;

        if (side === 'top') {
          const newH = Math.min(100, Math.max(20, Math.round(startHeight - deltaPct)));
          const newPosY = Math.round((startPosY + deltaPct / 2) * 10) / 10;
          setSlideImageHeights(prev => ({ ...prev, [projectorIndex]: newH }));
          setSlideImagePositions(prev => ({ ...prev, [projectorIndex]: { ...(prev[projectorIndex] ?? { x: 0 }), y: newPosY } }));
        } else {
          const newH = Math.min(100, Math.max(20, Math.round(startHeight + deltaPct)));
          const newPosY = Math.round((startPosY + deltaPct / 2) * 10) / 10;
          setSlideImageHeights(prev => ({ ...prev, [projectorIndex]: newH }));
          setSlideImagePositions(prev => ({ ...prev, [projectorIndex]: { ...(prev[projectorIndex] ?? { x: 0 }), y: newPosY } }));
        }
        return;
      }

      // Redimensionamento interativo da largura do bloco de texto
      if (bodyResizeStateRef.current?.active) {
        let clientX = 0;
        if ('touches' in e && e.touches.length > 0) {
          clientX = e.touches[0].clientX;
          if (e.cancelable) e.preventDefault();
        } else if ('clientX' in e) {
          clientX = (e as MouseEvent).clientX;
        } else {
          return;
        }

        const { startClientX, startWidth, stageWidth, side } = bodyResizeStateRef.current;
        const dxPx = clientX - startClientX;
        const deltaPct = (dxPx / stageWidth) * 100;
        const factor = side === 'right' ? deltaPct * 2 : -deltaPct * 2;
        const newW = Math.min(100, Math.max(30, Math.round(startWidth + factor)));

        setSlideBodyWidths(prev => ({ ...prev, [projectorIndex]: newW }));
        return;
      }

      // 2. Movimento dos elementos no slide
      if (!dragStateRef.current?.active) return;

      let clientX = 0;
      let clientY = 0;
      if ('touches' in e && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
        if (e.cancelable) e.preventDefault();
      } else if ('clientX' in e) {
        clientX = (e as MouseEvent).clientX;
        clientY = (e as MouseEvent).clientY;
      } else {
        return;
      }

      const { startClientX, startClientY, startOffsetXPct, startOffsetYPct, stageWidth, stageHeight, kind } = dragStateRef.current;
      const dxPx = clientX - startClientX;
      const dyPx = clientY - startClientY;

      const dxPct = (dxPx / stageWidth) * 100;
      const dyPct = (dyPx / stageHeight) * 100;

      const newXPct = Math.round((startOffsetXPct + dxPct) * 10) / 10;
      const newYPct = Math.round((startOffsetYPct + dyPct) * 10) / 10;

      if (kind === 'title') {
        setSlideTitlePositions(prev => ({ ...prev, [projectorIndex]: { x: newXPct, y: newYPct } }));
      } else if (kind === 'body') {
        setSlideBodyPositions(prev => ({ ...prev, [projectorIndex]: { x: newXPct, y: newYPct } }));
      } else {
        setSlideImagePositions(prev => ({ ...prev, [projectorIndex]: { x: newXPct, y: newYPct } }));
      }
    };

    const handleEnd = () => {
      if (cropPanStateRef.current?.active) {
        cropPanStateRef.current = null;
        setSlideImageCrops(prev => {
          try { localStorage.setItem('mega_ebd_image_crops', JSON.stringify(prev)); } catch {}
          updateLesson(l => ({ ...l, slideImageCrops: prev }));
          return prev;
        });
      }

      if (imageWidthResizeStateRef.current?.active) {
        imageWidthResizeStateRef.current = null;
        setSlideImageWidths(prev => {
          try { localStorage.setItem('mega_ebd_image_widths', JSON.stringify(prev)); } catch {}
          updateLesson(l => ({ ...l, slideImageWidths: prev }));
          return prev;
        });
      }

      if (imageHeightResizeStateRef.current?.active) {
        imageHeightResizeStateRef.current = null;
        setSlideImageHeights(prev => {
          try { localStorage.setItem('mega_ebd_image_heights', JSON.stringify(prev)); } catch {}
          updateLesson(l => ({ ...l, slideImageHeights: prev }));
          return prev;
        });
        setSlideImagePositions(prev => {
          try { localStorage.setItem('mega_ebd_image_positions', JSON.stringify(prev)); } catch {}
          updateLesson(l => ({ ...l, slideImagePositions: prev }));
          return prev;
        });
      }

      if (resizeStateRef.current?.active) {
        resizeStateRef.current.active = false;
        setSlideImageScales(prev => {
          try { localStorage.setItem('mega_ebd_image_scales', JSON.stringify(prev)); } catch {}
          updateLesson(l => ({ ...l, slideImageScales: prev }));
          return prev;
        });
      }

      if (guideDragRef.current?.active) {
        const axis = guideDragRef.current.axis;
        guideDragRef.current = null;
        if (axis === 'h') {
          setGuideHPos(cur => {
            try { localStorage.setItem('mega_ebd_guide_h', String(cur)); } catch {}
            return cur;
          });
        } else {
          setGuideVPos(cur => {
            try { localStorage.setItem('mega_ebd_guide_v', String(cur)); } catch {}
            return cur;
          });
        }
        return;
      }

      if (bodyResizeStateRef.current?.active) {
        bodyResizeStateRef.current.active = false;
        setSlideBodyWidths(prev => {
          try { localStorage.setItem('mega_ebd_body_widths', JSON.stringify(prev)); } catch {}
          updateLesson(l => ({ ...l, slideBodyWidths: prev }));
          return prev;
        });
      }

      if (!dragStateRef.current?.active) return;
      dragStateRef.current.active = false;
      setSlideTitlePositions(prev => {
        try { localStorage.setItem('mega_ebd_title_positions', JSON.stringify(prev)); } catch {}
        updateLesson(l => ({ ...l, slideTitlePositions: prev }));
        return prev;
      });
      setSlideBodyPositions(prev => {
        try { localStorage.setItem('mega_ebd_body_positions', JSON.stringify(prev)); } catch {}
        updateLesson(l => ({ ...l, slideBodyPositions: prev }));
        return prev;
      });
      setSlideImagePositions(prev => {
        try { localStorage.setItem('mega_ebd_image_positions', JSON.stringify(prev)); } catch {}
        updateLesson(l => ({ ...l, slideImagePositions: prev }));
        return prev;
      });
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd);
    window.addEventListener('touchcancel', handleEnd);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
      window.removeEventListener('touchcancel', handleEnd);
    };
  }, [projectorIndex, updateLesson]);

  // Modificação direta de escala da imagem (botões de zoom)
  const setSingleImageScale = useCallback((idx: number, scale: number | null) => {
    setSlideImageScales(prev => {
      const next = { ...prev };
      if (scale === null || scale === 1.0) {
        delete next[idx];
      } else {
        next[idx] = Math.round(scale * 100) / 100;
      }
      try { localStorage.setItem('mega_ebd_image_scales', JSON.stringify(next)); } catch {}
      updateLesson(l => ({ ...l, slideImageScales: next }));
      return next;
    });
  }, [updateLesson]);

  // Alternador de ajuste da imagem (Preencher/Cover vs Ajustar Inteira/Contain)
  const toggleImageFit = useCallback((idx: number) => {
    setSlideImageFits(prev => {
      const current = prev[idx] ?? 'cover';
      const nextFit: 'cover' | 'contain' = current === 'cover' ? 'contain' : 'cover';
      const next = { ...prev, [idx]: nextFit };
      try { localStorage.setItem('mega_ebd_image_fits', JSON.stringify(next)); } catch {}
      updateLesson(l => ({ ...l, slideImageFits: next }));
      return next;
    });
  }, [updateLesson]);

  // Reset de escala da imagem no slide atual
  const resetSlideImageScale = useCallback(() => {
    setSlideImageScales(prev => {
      const next = { ...prev };
      delete next[projectorIndex];
      try { localStorage.setItem('mega_ebd_image_scales', JSON.stringify(next)); } catch {}
      updateLesson(l => ({ ...l, slideImageScales: next }));
      return next;
    });
  }, [projectorIndex, updateLesson]);

  // Reset da posição de um elemento no slide atual
  const resetSlidePosition = useCallback((kind: 'title' | 'body' | 'image') => {
    if (kind === 'title') {
      setSlideTitlePositions(prev => {
        const next = { ...prev };
        delete next[projectorIndex];
        try { localStorage.setItem('mega_ebd_title_positions', JSON.stringify(next)); } catch {}
        updateLesson(l => ({ ...l, slideTitlePositions: next }));
        return next;
      });
    } else if (kind === 'body') {
      setSlideBodyPositions(prev => {
        const next = { ...prev };
        delete next[projectorIndex];
        try { localStorage.setItem('mega_ebd_body_positions', JSON.stringify(next)); } catch {}
        updateLesson(l => ({ ...l, slideBodyPositions: next }));
        return next;
      });
    } else {
      setSlideImagePositions(prev => {
        const next = { ...prev };
        delete next[projectorIndex];
        try { localStorage.setItem('mega_ebd_image_positions', JSON.stringify(next)); } catch {}
        updateLesson(l => ({ ...l, slideImagePositions: next }));
        return next;
      });
    }
  }, [projectorIndex, updateLesson]);

  // Modificação de largura do corpo do texto (botões)
  const setSingleBodyWidth = useCallback((idx: number, width: number | null) => {
    setSlideBodyWidths(prev => {
      const next = { ...prev };
      if (width === null || width >= 100) {
        delete next[idx];
      } else {
        next[idx] = Math.max(30, Math.min(100, Math.round(width)));
      }
      try { localStorage.setItem('mega_ebd_body_widths', JSON.stringify(next)); } catch {}
      updateLesson(l => ({ ...l, slideBodyWidths: next }));
      return next;
    });
  }, [updateLesson]);

  // Reset da largura do corpo do slide atual
  const resetSlideBodyWidth = useCallback(() => {
    setSlideBodyWidths(prev => {
      const next = { ...prev };
      delete next[projectorIndex];
      try { localStorage.setItem('mega_ebd_body_widths', JSON.stringify(next)); } catch {}
      updateLesson(l => ({ ...l, slideBodyWidths: next }));
      return next;
    });
  }, [projectorIndex, updateLesson]);

  // Alternador inteligente de layout Lado a Lado (Texto de um lado, Imagem do outro)
  const toggleSideBySideLayout = useCallback(() => {
    const curWidth = slideBodyWidths[projectorIndex] ?? 100;
    const curBodyPos = slideBodyPositions[projectorIndex] ?? { x: 0, y: 0 };

    if (curWidth <= 65 && curBodyPos.x < -10) {
      // Inverte: Imagem na Esquerda, Texto na Direita
      setSlideBodyWidths(prev => {
        const next = { ...prev, [projectorIndex]: 48 };
        try { localStorage.setItem('mega_ebd_body_widths', JSON.stringify(next)); } catch {}
        updateLesson(l => ({ ...l, slideBodyWidths: next }));
        return next;
      });
      setSlideBodyPositions(prev => {
        const next = { ...prev, [projectorIndex]: { x: 25, y: 0 } };
        try { localStorage.setItem('mega_ebd_body_positions', JSON.stringify(next)); } catch {}
        updateLesson(l => ({ ...l, slideBodyPositions: next }));
        return next;
      });
      setSlideImageWidths(prev => {
        const next = { ...prev, [projectorIndex]: 48 };
        try { localStorage.setItem('mega_ebd_image_widths', JSON.stringify(next)); } catch {}
        updateLesson(l => ({ ...l, slideImageWidths: next }));
        return next;
      });
      setSlideImagePositions(prev => {
        const next = { ...prev, [projectorIndex]: { x: -25, y: 0 } };
        try { localStorage.setItem('mega_ebd_image_positions', JSON.stringify(next)); } catch {}
        updateLesson(l => ({ ...l, slideImagePositions: next }));
        return next;
      });
      setSlideImageScales(prev => {
        const next = { ...prev, [projectorIndex]: 1.0 };
        try { localStorage.setItem('mega_ebd_image_scales', JSON.stringify(next)); } catch {}
        updateLesson(l => ({ ...l, slideImageScales: next }));
        return next;
      });
      setSlideImageFits(prev => {
        const next: Record<number, 'cover' | 'contain'> = { ...prev, [projectorIndex]: 'cover' };
        try { localStorage.setItem('mega_ebd_image_fits', JSON.stringify(next)); } catch {}
        updateLesson(l => ({ ...l, slideImageFits: next }));
        return next;
      });
    } else if (curWidth <= 65 && curBodyPos.x > 10) {
      // Restaura centralizado
      resetSlideBodyWidth();
      resetSlidePosition('body');
      resetSlidePosition('image');
      resetSlideImageScale();
      resetSlideImageWidth();
    } else {
      // Ativa: Texto na Esquerda (48%), Imagem na Direita (48%)
      setSlideBodyWidths(prev => {
        const next = { ...prev, [projectorIndex]: 48 };
        try { localStorage.setItem('mega_ebd_body_widths', JSON.stringify(next)); } catch {}
        updateLesson(l => ({ ...l, slideBodyWidths: next }));
        return next;
      });
      setSlideBodyPositions(prev => {
        const next = { ...prev, [projectorIndex]: { x: -25, y: 0 } };
        try { localStorage.setItem('mega_ebd_body_positions', JSON.stringify(next)); } catch {}
        updateLesson(l => ({ ...l, slideBodyPositions: next }));
        return next;
      });
      setSlideImageWidths(prev => {
        const next = { ...prev, [projectorIndex]: 48 };
        try { localStorage.setItem('mega_ebd_image_widths', JSON.stringify(next)); } catch {}
        updateLesson(l => ({ ...l, slideImageWidths: next }));
        return next;
      });
      setSlideImagePositions(prev => {
        const next = { ...prev, [projectorIndex]: { x: 25, y: 0 } };
        try { localStorage.setItem('mega_ebd_image_positions', JSON.stringify(next)); } catch {}
        updateLesson(l => ({ ...l, slideImagePositions: next }));
        return next;
      });
      setSlideImageScales(prev => {
        const next = { ...prev, [projectorIndex]: 1.0 };
        try { localStorage.setItem('mega_ebd_image_scales', JSON.stringify(next)); } catch {}
        updateLesson(l => ({ ...l, slideImageScales: next }));
        return next;
      });
      setSlideImageFits(prev => {
        const next: Record<number, 'cover' | 'contain'> = { ...prev, [projectorIndex]: 'cover' };
        try { localStorage.setItem('mega_ebd_image_fits', JSON.stringify(next)); } catch {}
        updateLesson(l => ({ ...l, slideImageFits: next }));
        return next;
      });
    }
  }, [projectorIndex, slideBodyWidths, slideBodyPositions, updateLesson, resetSlideBodyWidth, resetSlidePosition, resetSlideImageScale, resetSlideImageWidth]);

  // Estilos do wrapper de drag para cada elemento (suporta pixels legados e porcentagem responsiva)
  const makeDragStyle = (pos: { x: number; y: number }, kind: 'title' | 'body' | 'image'): React.CSSProperties => {
    const stage = projectorStageRef.current;
    const stageW = stage?.clientWidth || 800;
    const stageH = stage?.clientHeight || 450;

    const curBodyW = slideBodyWidths[projectorIndex] ?? 100;
    const isSideBySideActive = curBodyW <= 65 && Math.abs(slideBodyPositions[projectorIndex]?.x ?? 0) > 5;

    let offsetX = pos.x;
    let offsetY = pos.y;

    // Se a posição Y da imagem ainda não foi personalizada e não é modo lado a lado, posiciona na área branca abaixo do cabeçalho
    if (kind === 'image' && slideImagePositions[projectorIndex] === undefined && !isSideBySideActive) {
      offsetY = 7.0;
    }

    // Se o valor estiver entre -100 e 100, trata como porcentagem da largura/altura do palco
    if (Math.abs(offsetX) <= 100) {
      offsetX = (offsetX / 100) * stageW;
    }
    if (Math.abs(offsetY) <= 100) {
      offsetY = (offsetY / 100) * stageH;
    }

    const outlineColor = kind === 'title' ? '#f59e0b' : kind === 'body' ? '#06b6d4' : '#8b5cf6';
    const zIndexVal = kind === 'image' ? (isCanvaCropping ? 60 : 0) : 50;

    if (kind === 'image') {
      const curScale = slideImageScales[projectorIndex] ?? 1.0;
      const curWidth = slideImageWidths[projectorIndex] ?? (isSideBySideActive ? 48 : 92);
      const curHeight = slideImageHeights[projectorIndex] ?? (isSideBySideActive ? 92 : 78);

      return {
        position: 'absolute',
        width: `${curWidth}%`,
        height: `${curHeight}%`,
        left: '50%',
        top: '50%',
        transform: `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px) scale(${curScale})`,
        zIndex: zIndexVal,
        ...(isLayoutEditMode ? {
          cursor: isCanvaCropping ? 'default' : 'grab',
          borderRadius: '16px',
          userSelect: 'none',
          touchAction: 'none',
        } : {}),
      };
    }

    if (kind === 'body') {
      const curWidth = slideBodyWidths[projectorIndex] ?? 100;
      return {
        transform: `translate(${offsetX}px, ${offsetY}px)`,
        width: `${curWidth}%`,
        maxWidth: `${curWidth}%`,
        margin: '0 auto',
        position: 'relative',
        zIndex: isLayoutEditMode ? 45 : 30,
        ...(isLayoutEditMode ? {
          cursor: 'grab',
          outline: `2px dashed ${outlineColor}`,
          outlineOffset: '4px',
          borderRadius: '12px',
          userSelect: 'none',
          touchAction: 'none',
        } : {}),
      };
    }

    return {
      transform: `translate(${offsetX}px, ${offsetY}px)`,
      position: 'relative',
      zIndex: isLayoutEditMode ? 50 : 30,
      ...(isLayoutEditMode ? {
        cursor: 'grab',
        outline: `2px dashed ${outlineColor}`,
        outlineOffset: '2px',
        borderRadius: '10px',
        userSelect: 'none',
        touchAction: 'none',
      } : {}),
    };
  };

  const updateMetadata = (field: keyof EBDLessonPreparation['metadata'], val: string) => {
    updateLesson(prev => ({
      ...prev,
      metadata: { ...prev.metadata, [field]: val }
    }));
  };

  const updateTextAureo = (field: keyof EBDLessonPreparation['textAureo'], val: string) => {
    updateLesson(prev => ({
      ...prev,
      textAureo: { ...prev.textAureo, [field]: val }
    }));
  };

  const updateVerdadePratica = (val: string) => {
    updateLesson(prev => ({
      ...prev,
      verdadePratica: { ...prev.verdadePratica, text: val }
    }));
  };

  const updateVerdadePraticaPrompt = (val: string) => {
    updateLesson(prev => ({
      ...prev,
      verdadePratica: { ...prev.verdadePratica, imagePrompt: val }
    }));
  };

  const updatePalavraChave = (field: 'palavra' | 'explicacao' | 'imagePrompt', val: string) => {
    updateLesson(prev => ({
      ...prev,
      palavraChave: {
        palavra: prev.palavraChave?.palavra || '',
        explicacao: prev.palavraChave?.explicacao || '',
        imagePrompt: prev.palavraChave?.imagePrompt || '',
        [field]: val
      }
    }));
  };

  const updatePonteContextualField = (field: string, val: string) => {
    updateLesson(prev => {
      const pc = {
        ...prev.introducao?.ponteContextual,
        enabled: true,
        [field]: val
      };
      if (field === 'naLicaoAnterior') pc.ondeParou = val;
      if (field === 'ondeParou') pc.naLicaoAnterior = val;
      if (field === 'ponteContextual') pc.capitulosIntermediarios = val;
      if (field === 'capitulosIntermediarios') pc.ponteContextual = val;
      return {
        ...prev,
        introducao: {
          ...prev.introducao,
          ponteContextual: pc
        }
      };
    });
  };

  const updateTopicTitle = (topicIdx: number, val: string) => {
    updateLesson(prev => {
      const topicos = [...prev.topicos];
      topicos[topicIdx] = { ...topicos[topicIdx], title: val };
      return { ...prev, topicos };
    });
  };

  const updateTopicPrompt = (topicIdx: number, val: string) => {
    updateLesson(prev => {
      const topicos = [...prev.topicos];
      topicos[topicIdx] = { ...topicos[topicIdx], imagePrompt: val };
      return { ...prev, topicos };
    });
  };

  const updateTopicSinopse = (topicIdx: number, val: string) => {
    updateLesson(prev => {
      const topicos = [...prev.topicos];
      topicos[topicIdx] = { ...topicos[topicIdx], sinopse: val };
      return { ...prev, topicos };
    });
  };

  const addTopicFraseEnfase = (topicIdx: number) => {
    updateLesson(prev => {
      const topicos = [...prev.topicos];
      const frases = [...(topicos[topicIdx].frasesEnfase || []), 'Nova frase para ênfase na aula'];
      topicos[topicIdx] = { ...topicos[topicIdx], frasesEnfase: frases };
      return { ...prev, topicos };
    });
  };

  const updateTopicFraseEnfase = (topicIdx: number, fIdx: number, val: string) => {
    updateLesson(prev => {
      const topicos = [...prev.topicos];
      const frases = [...(topicos[topicIdx].frasesEnfase || [])];
      frases[fIdx] = val;
      topicos[topicIdx] = { ...topicos[topicIdx], frasesEnfase: frases };
      return { ...prev, topicos };
    });
  };

  const removeTopicFraseEnfase = (topicIdx: number, fIdx: number) => {
    updateLesson(prev => {
      const topicos = [...prev.topicos];
      const frases = (topicos[topicIdx].frasesEnfase || []).filter((_, idx) => idx !== fIdx);
      topicos[topicIdx] = { ...topicos[topicIdx], frasesEnfase: frases };
      return { ...prev, topicos };
    });
  };

  const addSubtopicToTopic = (topicIdx: number) => {
    updateLesson(prev => {
      const topicos = [...prev.topicos];
      const subList = [...topicos[topicIdx].subtopicos];
      const newNum = String(subList.length + 1);
      subList.push({
        number: newNum,
        title: 'Novo Subtópico',
        projetor: 'Frase de destaque para o projetor',
        explicacao: 'Explicação didática do professor...',
        imagePrompt: '',
        frasesExplicativas: [
          { frase: 'Frase principal do texto', explicacao: 'Explicação detalhada para a classe', exemplo: '' }
        ],
        versiculos: []
      });
      topicos[topicIdx] = { ...topicos[topicIdx], subtopicos: subList };
      return { ...prev, topicos };
    });
  };

  const removeSubtopicFromTopic = (topicIdx: number, subIdx: number) => {
    updateLesson(prev => {
      const topicos = [...prev.topicos];
      const subList = topicos[topicIdx].subtopicos.filter((_, idx) => idx !== subIdx);
      topicos[topicIdx] = { ...topicos[topicIdx], subtopicos: subList };
      return { ...prev, topicos };
    });
  };

  const addNewTopic = () => {
    updateLesson(prev => {
      const numerals = ['I', 'II', 'III', 'IV', 'V', 'VI'];
      const nextNum = numerals[prev.topicos.length] || `Tópico ${prev.topicos.length + 1}`;
      const newTopic: EBDTopicPreparation = {
        number: nextNum,
        title: 'Novo Tópico',
        sinopse: 'Sinopse do novo tópico...',
        explicacao: '',
        frasesEnfase: ['Frase de ênfase para os alunos'],
        imagePrompt: '',
        subtopicos: [
          {
            number: '1',
            title: 'Subtópico 1',
            projetor: 'Texto de resumo para o slide',
            explicacao: 'Explicação didática...',
            imagePrompt: '',
            frasesExplicativas: [],
            versiculos: []
          }
        ]
      };
      return { ...prev, topicos: [...prev.topicos, newTopic] };
    });
  };

  const removeTopic = (topicIdx: number) => {
    updateLesson(prev => ({
      ...prev,
      topicos: prev.topicos.filter((_, idx) => idx !== topicIdx)
    }));
  };

  const updateSubtopicField = (topicIdx: number, subIdx: number, field: string, val: any) => {
    updateLesson(prev => {
      const topicos = [...prev.topicos];
      const subList = [...topicos[topicIdx].subtopicos];
      const updatedSub = { ...subList[subIdx], [field]: val };
      if (field === 'explicacao' || field === 'projetor') {
        delete updatedSub.frasesExplicativas;
      }
      subList[subIdx] = updatedSub;
      topicos[topicIdx] = { ...topicos[topicIdx], subtopicos: subList };
      return { ...prev, topicos };
    });
  };


  const addVersiculoSubtopic = (topicIdx: number, subIdx: number) => {
    updateLesson(prev => {
      const topicos = [...prev.topicos];
      const sub = { ...topicos[topicIdx].subtopicos[subIdx] };
      const list = [...(sub.versiculos || [])];
      list.push({ reference: 'Referência Bíblica (ex: João 3.16)', text: 'Texto do versículo...', explicacao: 'Breve explicação didática do versículo...' });
      sub.versiculos = list;
      topicos[topicIdx].subtopicos[subIdx] = sub;
      return { ...prev, topicos };
    });
  };

  const updateVersiculoSubtopic = (topicIdx: number, subIdx: number, vIdx: number, field: 'reference' | 'text' | 'explicacao', val: string) => {
    updateLesson(prev => {
      const topicos = [...prev.topicos];
      const sub = { ...topicos[topicIdx].subtopicos[subIdx] };
      const list = [...(sub.versiculos || [])];
      list[vIdx] = { ...list[vIdx], [field]: val };
      sub.versiculos = list;
      topicos[topicIdx].subtopicos[subIdx] = sub;
      return { ...prev, topicos };
    });
  };

  const removeVersiculoSubtopic = (topicIdx: number, subIdx: number, vIdx: number) => {
    updateLesson(prev => {
      const topicos = [...prev.topicos];
      const sub = { ...topicos[topicIdx].subtopicos[subIdx] };
      sub.versiculos = (sub.versiculos || []).filter((_, idx) => idx !== vIdx);
      topicos[topicIdx].subtopicos[subIdx] = sub;
      return { ...prev, topicos };
    });
  };

  const updateConclusaoField = (field: keyof EBDLessonPreparation['conclusao'], val: any) => {
    updateLesson(prev => ({
      ...prev,
      conclusao: { ...prev.conclusao, [field]: val }
    }));
  };

  const addConclusaoBullet = () => {
    updateLesson(prev => ({
      ...prev,
      conclusao: {
        ...prev.conclusao,
        bulletPoints: [...(prev.conclusao.bulletPoints || []), 'Novo ponto principal da aula']
      }
    }));
  };

  const updateConclusaoBullet = (bIdx: number, val: string) => {
    updateLesson(prev => {
      const list = [...(prev.conclusao.bulletPoints || [])];
      list[bIdx] = val;
      return {
        ...prev,
        conclusao: { ...prev.conclusao, bulletPoints: list }
      };
    });
  };

  const removeConclusaoBullet = (bIdx: number) => {
    updateLesson(prev => ({
      ...prev,
      conclusao: {
        ...prev.conclusao,
        bulletPoints: (prev.conclusao.bulletPoints || []).filter((_, idx) => idx !== bIdx)
      }
    }));
  };



  // ── Inline Text Highlight State ──────────────────────────────────
  const [slideHighlights, setSlideHighlights] = useState<SlideHighlights>(loadSlideHighlights);
  const [hlToolbar, setHlToolbar] = useState<{ x: number; y: number; text: string } | null>(null);
  void HIGHLIGHT_COLORS; // keep import used

  const [slideImageOpacity, setSlideImageOpacity] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('mega_ebd_slide_image_opacity');
      return saved !== null ? parseInt(saved, 10) : 100;
    } catch {
      return 100;
    }
  });

  const changeSlideImageOpacity = useCallback((val: number) => {
    setSlideImageOpacity(val);
    try { localStorage.setItem('mega_ebd_slide_image_opacity', String(val)); } catch {}
  }, []);

  const saveHighlights = useCallback((next: SlideHighlights) => {
    setSlideHighlights(next);
    persistSlideHighlights(next);
  }, []);

  /** Wraps text with inline highlight marks for the current projector slide. */
  const renderHL = useCallback((text: string | undefined, forcedColor?: string): React.ReactNode => {
    if (!text) return text;
    const entries = slideHighlights[projectorIndex] || [];
    return applyHighlightsToText(text, entries, forcedColor ?? (bodyTextColor === 'black' ? '#000000' : '#ffffff'));
  }, [slideHighlights, projectorIndex, bodyTextColor]);

  const applyHighlight = useCallback((color: string, hlStyle: 'fill' | 'outline' | 'text' = 'fill') => {
    if (!hlToolbar) return;
    const current = slideHighlights[projectorIndex] || [];
    const filtered = current.filter((h) => h.text !== hlToolbar.text);
    saveHighlights({ ...slideHighlights, [projectorIndex]: [...filtered, { text: hlToolbar.text, color, style: hlStyle }] });
    setHlToolbar(null);
    window.getSelection()?.removeAllRanges();
  }, [hlToolbar, slideHighlights, projectorIndex, saveHighlights]);

  const removeHighlight = useCallback(() => {
    if (!hlToolbar) return;
    const current = slideHighlights[projectorIndex] || [];
    saveHighlights({ ...slideHighlights, [projectorIndex]: current.filter((h) => h.text !== hlToolbar.text) });
    setHlToolbar(null);
    window.getSelection()?.removeAllRanges();
  }, [hlToolbar, slideHighlights, projectorIndex, saveHighlights]);

  const handleSlideMouseUp = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { setHlToolbar(null); return; }
    const text = sel.toString().trim();
    if (!text) { setHlToolbar(null); return; }
    const range = sel.getRangeAt(0);
    const stageEl = projectorStageRef.current;
    if (!stageEl || !stageEl.contains(range.commonAncestorContainer)) { setHlToolbar(null); return; }
    const rect = range.getBoundingClientRect();
    setHlToolbar({ text, x: rect.left + rect.width / 2, y: rect.bottom });
  }, []);


  // Estados de Regeneração Seletiva e Notificações
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [copiedToast, setCopiedToast] = useState<'clean' | 'full' | null>(null);
  const [isQrModalOpen, setIsQrModalOpen] = useState<boolean>(false);
  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>({
    'I': true,
    'II': true,
    'III': true
  });

  const projectorStageRef = useRef<HTMLDivElement>(null);

  const [projectorSlideImages, setProjectorSlideImages] = useState<Record<number, string>>(() => {
    if (lessonData.projectorSlideImages && Object.keys(lessonData.projectorSlideImages).length > 0) {
      return lessonData.projectorSlideImages;
    }
    try {
      const saved = localStorage.getItem('mega_ebd_projector_slide_images');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [customBg, setCustomBg] = useState<string | null>(() => {
    if (lessonData.customBg) return lessonData.customBg;
    try {
      return localStorage.getItem('mega_ebd_custom_bg');
    } catch {
      return null;
    }
  });


  // ── Controle de Recorte de Imagem (Crop) ──
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [cropModalImage, setCropModalImage] = useState<string | null>(null);
  const [cropTarget, setCropTarget] = useState<'slide' | 'bg'>('slide');

  const handleOpenCropForSlide = (imgUrl?: string) => {
    const url = imgUrl || projectorSlideImages[projectorIndex] || currentProjectorItem?.imageUrl;
    if (!url) {
      alert('Nenhuma imagem disponível neste slide para recortar.');
      return;
    }
    setCropModalImage(url);
    setCropTarget('slide');
    setCropModalOpen(true);
  };

  const handleOpenCropForBg = () => {
    if (!customBg) return;
    setCropModalImage(customBg);
    setCropTarget('bg');
    setCropModalOpen(true);
  };

  const handleApplyCrop = async (croppedDataUrl: string) => {
    const opt = await optimizeImageBase64(croppedDataUrl, 1280, 0.85);
    if (cropTarget === 'slide') {
      setProjectorSlideImages(prev => {
        const next = { ...prev, [projectorIndex]: opt };
        try { localStorage.setItem('mega_ebd_projector_slide_images', JSON.stringify(next)); } catch {}
        updateLesson(l => ({ ...l, projectorSlideImages: next }));
        return next;
      });
    } else if (cropTarget === 'bg') {
      setCustomBg(opt);
      try { localStorage.setItem('mega_ebd_custom_bg', opt); } catch {}
      updateLesson(l => ({ ...l, customBg: opt }));
    }
    setCropModalOpen(false);
    setCropModalImage(null);
  };

  const handleSlideImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      const raw = ev.target?.result as string;
      if (raw) {
        const d = await optimizeImageBase64(raw, 1280, 0.82);
        setProjectorSlideImages(prev => {
          const next = { ...prev, [projectorIndex]: d };
          try { localStorage.setItem('mega_ebd_projector_slide_images', JSON.stringify(next)); } catch {}
          updateLesson(l => ({ ...l, projectorSlideImages: next }));
          return next;
        });
        // Abre o modal de recorte para que o usuário possa definir o enquadramento ideal
        setCropModalImage(d);
        setCropTarget('slide');
        setCropModalOpen(true);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemoveSlideImage = () => {
    setProjectorSlideImages(prev => {
      const next = { ...prev };
      delete next[projectorIndex];
      try { localStorage.setItem('mega_ebd_projector_slide_images', JSON.stringify(next)); } catch {}
      updateLesson(l => ({ ...l, projectorSlideImages: next }));
      return next;
    });
  };

  const handleCustomBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      const raw = ev.target?.result as string;
      if (raw) {
        const d = await optimizeImageBase64(raw, 1280, 0.80);
        setCustomBg(d);
        try { localStorage.setItem('mega_ebd_custom_bg', d); } catch {}
        updateLesson(l => ({ ...l, customBg: d }));
      }
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  // Gerenciamento e Exportação de Prompts Visuais 16:9
  const handleCopyAllPrompts = () => {
    const text = formatAllPromptsForExport(lesson);
    navigator.clipboard.writeText(text);
    alert('📋 Todos os prompts visuais 16:9 foram copiados com sucesso!\nCole no Canva, Midjourney, DALL-E 3 ou Bing Image Creator.');
  };

  const handleGenerateAllPrompts = async () => {
    setIsGeneratingAllPrompts(true);
    try {
      const updated = await generateAllLessonPromptsWithAi(lesson);
      updateLesson(() => updated);
      alert('✨ Prompts visuais 16:9 gerados com sucesso para o Título da Lição, Texto Áureo, Verdade Prática, Palavra-Chave, Tópicos e Subtópicos!');
    } catch (err: any) {
      alert('Aviso: ' + (err.message || 'Erro ao gerar prompts com IA.'));
    } finally {
      setIsGeneratingAllPrompts(false);
    }
  };

  // Gerador de Texto Completo do Roteiro do Professor na Íntegra
  const generateTeacherTextContent = (data: EBDLessonPreparation): string => {
    let text = `========================================================================\n`;
    text += `ROTEIRO COMPLETO DO PROFESSOR - EBD NA ÍNTEGRA\n`;
    text += `${data.metadata.lessonNumber || 'LIÇÃO EBD'} - ${data.metadata.title}\n`;
    text += `Tema do Trimestre: ${data.metadata.themeTopic}\n`;
    text += `========================================================================\n\n`;

    if (data.metadata.imagePrompt) {
      text += `🖼️ PROMPT VISUAL (CAPA / TÍTULO DA LIÇÃO - 16:9):\n${data.metadata.imagePrompt}\n\n`;
    }

    text += `1. TEXTO ÁUREO\n`;
    text += `"${data.textAureo.text}" (${data.textAureo.reference})\n\n`;
    if (data.textAureo.imagePrompt) {
      text += `🖼️ PROMPT VISUAL (TEXTO ÁUREO - 16:9):\n${data.textAureo.imagePrompt}\n\n`;
    }

    text += `2. VERDADE PRÁTICA\n`;
    text += `"${data.verdadePratica.text}"\n\n`;
    if (data.verdadePratica.imagePrompt) {
      text += `🖼️ PROMPT VISUAL (VERDADE PRÁTICA - 16:9):\n${data.verdadePratica.imagePrompt}\n\n`;
    }

    if (data.palavraChave?.palavra) {
      text += `🔑 PALAVRA-CHAVE DA LIÇÃO: ${data.palavraChave.palavra.toUpperCase()}\n`;
      if (data.palavraChave.explicacao) {
        text += `💡 Explicação Didática & Teológica:\n${data.palavraChave.explicacao}\n`;
      }
      if (data.palavraChave.imagePrompt) {
        text += `🖼️ PROMPT VISUAL (PALAVRA-CHAVE - 16:9):\n${data.palavraChave.imagePrompt}\n`;
      }
      text += `\n`;
    }

    if (data.introducao?.ponteContextual?.enabled) {
      const bridge = data.introducao.ponteContextual;
      const licaoAnt = bridge.naLicaoAnterior || bridge.ondeParou;
      const interv = bridge.ponteContextual || bridge.capitulosIntermediarios;
      text += `--- PONTE CONTEXTUAL & TRANSIÇÃO BÍBLICA ---\n`;
      if (licaoAnt) text += `📌 Na lição anterior: ${licaoAnt}\n`;
      if (interv) text += `📜 O que aconteceu no intervalo: ${interv}\n`;
      if (bridge.ganchoAulaAtual) text += `👉 Transição para hoje: ${bridge.ganchoAulaAtual}\n`;
      if (bridge.projetor) text += `🖥️ Síntese no Projetor: "${bridge.projetor}"\n`;
      text += `\n`;
    }

    if (data.biblicalText) {
      text += `3. LEITURA BÍBLICA EM CLASSE\n`;
      text += `${data.biblicalText}\n\n`;
    }

    text += `========================================================================\n`;
    text += `CHECKLIST DE FIDELIDADE DAS FONTES EBD\n`;
    text += `========================================================================\n`;
    data.checklist.forEach((c) => {
      text += `[✓] ${c.item}\n`;
    });
    text += `\n`;

    text += `========================================================================\n`;
    text += `DESENVOLVIMENTO DIDÁTICO DOS TÓPICOS (I, II, III)\n`;
    text += `========================================================================\n\n`;

    data.topicos.forEach((topico) => {
      text += `------------------------------------------------------------------------\n`;
      text += `TÓPICO ${topico.number}: ${topico.title.toUpperCase()}\n`;
      text += `------------------------------------------------------------------------\n`;
      text += `📌 Sinopse: ${topico.sinopse}\n`;
      if (topico.frasesEnfase && topico.frasesEnfase.length > 0) {
        text += `🗣️ Frases de Ênfase para a Aula:\n`;
        topico.frasesEnfase.forEach((f) => {
          text += `  • "${f}"\n`;
        });
      }
      if (topico.imagePrompt) {
        text += `🖼️ PROMPT VISUAL DO TÓPICO (16:9):\n${topico.imagePrompt}\n`;
      }
      text += `\n`;

      topico.subtopicos.forEach((sub) => {
        text += `--- Subtópico ${sub.number}: ${sub.title} ---\n\n`;

        const txtProjetor = sub.projetor || ((sub.frasesExplicativas && sub.frasesExplicativas.length > 0)
          ? sub.frasesExplicativas.map(f => f.frase).filter(Boolean).join(' ')
          : '');

        if (txtProjetor) {
          text += `🖥️ CAMADA 1 - PROJETOR (TEXTO DA REVISTA PARA O QUADRO AZUL):\n"${txtProjetor}"\n\n`;
        }

        if (sub.explicacao) {
          text += `👨‍🏫 CAMADA 2 - EXPLICAÇÃO DIDÁTICA DO PROFESSOR (EXPLICAÇÃO LINEAR):\n${sub.explicacao}\n\n`;
        } else if (sub.frasesExplicativas && sub.frasesExplicativas.length > 0) {
          text += `👨‍🏫 CAMADA 2 - EXPLICAÇÃO DIDÁTICA DO PROFESSOR (EXPLICAÇÃO LINEAR):\n`;
          const linhasLinear = sub.frasesExplicativas
            .map(f => {
              const label = f.frase ? `"${f.frase}" — ` : '';
              return `${label}${f.explicacao}`.trim();
            })
            .filter(Boolean);
          text += linhasLinear.join('\n\n') + '\n\n';
        }


        if (sub.versiculos && sub.versiculos.length > 0) {
          text += `📖 TEXTOS BÍBLICOS RELEVANTES (ARC):\n`;
          sub.versiculos.forEach((v) => {
            text += `  • ${v.reference}: "${v.text}"\n`;
            if (v.explicacao) {
              text += `    💡 Explicação Breve: ${v.explicacao}\n`;
            }
          });
          text += `\n`;
        }

        if (sub.aplicacao) {
          text += `🔥 APLICAÇÃO PRÁTICA & PENTECOSTAL:\n${sub.aplicacao}\n\n`;
        }


        if (sub.cuidadoDoutrinario) {
          text += `🔥 O QUE NÃO PODE SER DITO (CUIDADO DOUTRINÁRIO):\n⚠️ ${sub.cuidadoDoutrinario}\n\n`;
        }

        if (sub.palavrasOriginais && sub.palavrasOriginais.length > 0) {
          text += `🏛️ VOCABULÁRIO EXEGÉTICO NO GREGO / HEBRAICO:\n`;
          sub.palavrasOriginais.forEach((p) => {
            text += `  • ${p.termo} (${p.transliteracao} - ${p.idioma}): ${p.significado}\n    ${p.explicacao}\n`;
          });
          text += `\n`;
        }

        if (sub.imagePrompt) {
          text += `🖼️ PROMPT VISUAL (CANVA / MIDJOURNEY):\n${sub.imagePrompt}\n\n`;
        }

        if (sub.ideias && sub.ideias.length > 0) {
          sub.ideias.forEach((ideia) => {
            text += `[Ideia ${ideia.letra.toUpperCase()}] ${ideia.titulo}\n`;
            text += `🖥️ CAMADA 1 - PROJETOR (ALUNOS):\n"${ideia.projetor}"\n\n`;
            text += `👨‍🏫 CAMADA 2 - EXPLICAÇÃO DIDÁTICA:\n${ideia.professor.explicacao}\n\n`;
            if (ideia.professor.contexto) {
              text += `🏛️ CONTEXTO HISTÓRICO:\n${ideia.professor.contexto}\n\n`;
            }
          });
        }

        text += `........................................................................\n\n`;
      });
    });

    text += `========================================================================\n`;
    text += `CONCLUSÃO & APLICAÇÃO FINAL DA LIÇÃO\n`;
    text += `========================================================================\n`;
    text += `"${data.conclusao.takeaway}"\n\n`;

    if (data.conclusao.bulletPoints && data.conclusao.bulletPoints.length > 0) {
      text += `Pontos Principais:\n`;
      data.conclusao.bulletPoints.forEach((pt) => {
        text += `  • ${pt}\n`;
      });
      text += `\n`;
    }

    if (data.conclusao.finalPrayer) {
      text += `🙏 Sugestão de Oração Final com a Classe:\n"${data.conclusao.finalPrayer}"\n\n`;
    }

    text += `========================================================================\n`;
    text += `Fontes e Transcrições Cruzadas: ${data.sourcesSummary.transcriptionsCount} fonte(s) utilizadas (${data.sourcesSummary.sourcesUsed.join(', ')})\n`;
    text += `========================================================================\n`;

    return text;
  };



  // Funções de Exportação / Baixar / Imprimir / Copiar
  const handlePrintTeacherGuide = () => {
    const allExpanded: Record<string, boolean> = {};
    lesson.topicos.forEach((t) => {
      allExpanded[t.number] = true;
    });
    setExpandedTopics(allExpanded);

    setTimeout(() => {
      window.print();
    }, 200);
  };



  const handleCopyTeacherGuide = () => {
    const textContent = generateTeacherTextContent(lesson);
    navigator.clipboard.writeText(textContent);
    setCopiedToast('full');
    setTimeout(() => setCopiedToast(null), 3000);
  };

  // ── MANIPULAÇÃO DE SLIDES EXTRAS E REORDENAÇÃO ─────────────────────────────
  const handleAddExtraSlide = () => {
    const newId = `extra-${Date.now()}`;
    const newSlide: EBDExtraSlide = {
      id: newId,
      type: 'extra',
      title: 'SLIDE EXTRA PERSONALIZADO',
      badgeText: 'SLIDE EXTRA',
      projetorText: 'Digite aqui o conteúdo do seu novo slide extra...',
      subtitle: '',
      reference: ''
    };

    const updatedExtraSlides = [...(lesson.extraSlides || []), newSlide];
    const currentOrder = projectorItems.map(item => item.id);
    let newOrder = [...currentOrder];
    const insertIdx = Math.min(projectorIndex + 1, newOrder.length);
    newOrder.splice(insertIdx, 0, newId);

    updateLesson(prev => ({
      ...prev,
      extraSlides: updatedExtraSlides,
      customSlideOrder: newOrder
    }));

    setProjectorIndex(insertIdx);
    setIsEditMode(true);
  };

  const handleDuplicateSlide = () => {
    if (!currentProjectorItem) return;
    const newId = `extra-${Date.now()}`;
    const duplicatedSlide: EBDExtraSlide = {
      id: newId,
      type: 'extra',
      title: `${currentProjectorItem.title} (Cópia)`,
      badgeText: currentProjectorItem.badgeText || 'SLIDE EXTRA',
      projetorText: currentProjectorItem.projetorText || '',
      subtitle: currentProjectorItem.subtitle || '',
      reference: currentProjectorItem.reference || '',
      bulletPoints: currentProjectorItem.bulletPoints ? [...currentProjectorItem.bulletPoints] : undefined
    };

    const updatedExtraSlides = [...(lesson.extraSlides || []), duplicatedSlide];
    const currentOrder = projectorItems.map(item => item.id);
    let newOrder = [...currentOrder];
    const insertIdx = Math.min(projectorIndex + 1, newOrder.length);
    newOrder.splice(insertIdx, 0, newId);

    updateLesson(prev => ({
      ...prev,
      extraSlides: updatedExtraSlides,
      customSlideOrder: newOrder
    }));

    setProjectorIndex(insertIdx);
    setIsEditMode(true);
  };

  const handleMoveSlideLeft = () => {
    if (projectorIndex <= 0) return;
    const currentOrder = projectorItems.map(item => item.id);
    const newOrder = [...currentOrder];
    const temp = newOrder[projectorIndex];
    newOrder[projectorIndex] = newOrder[projectorIndex - 1];
    newOrder[projectorIndex - 1] = temp;

    updateLesson(prev => ({
      ...prev,
      customSlideOrder: newOrder
    }));
    setProjectorIndex(projectorIndex - 1);
  };

  const handleMoveSlideRight = () => {
    if (projectorIndex >= projectorItems.length - 1) return;
    const currentOrder = projectorItems.map(item => item.id);
    const newOrder = [...currentOrder];
    const temp = newOrder[projectorIndex];
    newOrder[projectorIndex] = newOrder[projectorIndex + 1];
    newOrder[projectorIndex + 1] = temp;

    updateLesson(prev => ({
      ...prev,
      customSlideOrder: newOrder
    }));
    setProjectorIndex(projectorIndex + 1);
  };

  const handleDeleteSlide = () => {
    if (projectorItems.length <= 1 || !currentProjectorItem) return;
    if (!window.confirm(`Deseja remover o slide "${currentProjectorItem.title}"?`)) return;

    const currId = currentProjectorItem.id;
    const updatedExtraSlides = (lesson.extraSlides || []).filter(s => s.id !== currId);
    const currentOrder = projectorItems.map(item => item.id);
    const newOrder = currentOrder.filter(id => id !== currId);

    updateLesson(prev => ({
      ...prev,
      extraSlides: updatedExtraSlides,
      customSlideOrder: newOrder
    }));

    setProjectorIndex(prev => Math.min(prev, Math.max(0, newOrder.length - 1)));
  };

  // Flattened items for Projector Mode
  const projectorItems = React.useMemo(() => {
    const items: Array<{
      id: string;
      type: 'cover' | 'aureo' | 'pratica' | 'palavra_chave' | 'na_licao_anterior' | 'ponte_contextual' | 'leitura' | 'topic_synopsis' | 'subtopic' | 'subtopic_explanation' | 'subtopic_verses' | 'subtopic_aplicacao' | 'enfase_palavra' | 'conclusao' | 'verdades' | 'extra';
      title: string;
      subtitle?: string;
      bulletPoints?: string[];
      badgeText?: string;
      projetorText?: string;
      ideiaText?: string;
      reference?: string;
      imagePrompt?: string;
      imageUrl?: string;
      onUpdateText?: (val: string) => void;
      onUpdateTitle?: (val: string) => void;
      onUpdateSubtitle?: (val: string) => void;
      onUpdateReference?: (val: string) => void;
      onUpdateBulletPoint?: (idx: number, val: string) => void;
    }> = [];

    // 1. Transição entre Lições (NA LIÇÃO ANTERIOR = Slide 1, INTERVALO BÍBLICO = Slide 2)
    if (lesson.introducao?.ponteContextual?.enabled) {
      const bridge = lesson.introducao.ponteContextual;
      const textLicaoAnterior = bridge.naLicaoAnterior || bridge.ondeParou;
      const textPonteContextual = bridge.ponteContextual || bridge.capitulosIntermediarios;

      if (textLicaoAnterior) {
        items.push({
          id: 'na_licao_anterior',
          type: 'na_licao_anterior',
          title: 'NA LIÇÃO ANTERIOR',
          badgeText: 'NA LIÇÃO ANTERIOR',
          projetorText: textLicaoAnterior,
          onUpdateText: (val: string) => updatePonteContextualField(bridge.naLicaoAnterior ? 'naLicaoAnterior' : 'ondeParou', val)
        });
      }

      if (textPonteContextual) {
        items.push({
          id: 'ponte_contextual',
          type: 'ponte_contextual',
          title: 'INTERVALO BÍBLICO',
          badgeText: 'INTERVALO BÍBLICO',
          projetorText: textPonteContextual,
          onUpdateText: (val: string) => updatePonteContextualField(bridge.ponteContextual ? 'ponteContextual' : 'capitulosIntermediarios', val)
        });
      }
    }

    // 3. Capa (Lição 11 / Título)
    items.push({
      id: 'cover',
      type: 'cover',
      title: lesson.metadata.title,
      subtitle: lesson.metadata.themeTopic,
      badgeText: lesson.metadata.lessonNumber || 'LIÇÃO EBD',
      imagePrompt: lesson.metadata.imagePrompt,
      onUpdateTitle: (val: string) => updateMetadata('title', val),
      onUpdateSubtitle: (val: string) => updateMetadata('themeTopic', val),
      onUpdateText: (val: string) => updateMetadata('title', val)
    });

    // 4. Texto Áureo
    items.push({
      id: 'aureo',
      type: 'aureo',
      title: 'TEXTO ÁUREO',
      badgeText: 'TEXTO ÁUREO',
      projetorText: `“${lesson.textAureo.text}”`,
      reference: lesson.textAureo.reference,
      imagePrompt: lesson.textAureo.imagePrompt,
      onUpdateText: (val: string) => updateTextAureo('text', val.replace(/^["'“]/, '').replace(/["'”]$/, '')),
      onUpdateReference: (val: string) => updateTextAureo('reference', val)
    });

    // 5. Verdade Prática
    if (lesson.verdadePratica?.text) {
      items.push({
        id: 'pratica',
        type: 'pratica',
        title: 'VERDADE PRÁTICA',
        badgeText: 'VERDADE PRÁTICA',
        projetorText: `“${lesson.verdadePratica.text}”`,
        imagePrompt: lesson.verdadePratica.imagePrompt,
        onUpdateText: (val: string) => updateVerdadePratica(val.replace(/^["'“]/, '').replace(/["'”]$/, ''))
      });
    }

    // 5.1 Palavra-Chave da Lição
    if (lesson.palavraChave?.palavra) {
      items.push({
        id: 'palavra_chave',
        type: 'palavra_chave',
        title: 'PALAVRA-CHAVE',
        badgeText: 'PALAVRA-CHAVE DA LIÇÃO',
        ideiaText: lesson.palavraChave.palavra.toUpperCase(),
        projetorText: lesson.palavraChave.explicacao || '',
        imagePrompt: lesson.palavraChave.imagePrompt,
        onUpdateTitle: (val: string) => updatePalavraChave('palavra', val),
        onUpdateText: (val: string) => updatePalavraChave('explicacao', val)
      });
    }

    // Leitura Bíblica em Classe NA ÍNTEGRA (EM APENAS 1 ÚNICO CARD COM SCROLL)
    if (lesson.biblicalText) {
      items.push({
        id: 'leitura',
        type: 'leitura',
        title: 'LEITURA BÍBLICA EM CLASSE',
        badgeText: 'LEITURA BÍBLICA EM CLASSE',
        projetorText: lesson.biblicalText,
        onUpdateText: (val: string) => {
          updateLesson(prev => ({ ...prev, biblicalText: val }));
        },
        onUpdateReference: (val: string) => {
          updateLesson(prev => {
            const text = prev.biblicalText || '';
            const parts = text.split('—');
            const body = parts.length > 1 ? parts.slice(1).join('—') : text;
            return { ...prev, biblicalText: `${val} — ${body}` };
          });
        }
      });
    }

    // Tópicos, Sinopse do Tópico (Revisão Rápida) e Subtópicos com Ideias a, b, c
    const parseTopicNum = (val: string | number | undefined, idx: number): string => {
      if (!val) return String(idx + 1);
      const str = String(val).trim().toUpperCase();
      if (str === 'I' || str === '1') return '1';
      if (str === 'II' || str === '2') return '2';
      if (str === 'III' || str === '3') return '3';
      if (str === 'IV' || str === '4') return '4';
      if (str === 'V' || str === '5') return '5';
      if (str === 'VI' || str === '6') return '6';
      const num = parseInt(str, 10);
      return isNaN(num) ? String(idx + 1) : String(num);
    };

    // Tópicos, Sinopse do Tópico (Revisão Rápida) e Subtópicos com Ideias a, b, c
    lesson.topicos.forEach((t, tIdx) => {
      const topicNum = parseTopicNum(t.number, tIdx);

      // 📌 CARD DE SINOPSE / REVISÃO DO TÓPICO
      items.push({
        id: `topic_synopsis_${tIdx}`,
        type: 'topic_synopsis',
        title: `${topicNum}. ${t.title}`,
        badgeText: `TÓPICO ${topicNum}: ${t.title.toUpperCase()}`,
        ideiaText: `TÓPICO ${topicNum}: ${t.title.toUpperCase()}`,
        projetorText: t.sinopse,
        imagePrompt: t.imagePrompt,
        onUpdateTitle: (val: string) => updateTopicTitle(tIdx, val.replace(/^TÓPICO\s*[I|V|X|\d]+\s*:\s*/i, '')),
        onUpdateText: (val: string) => updateTopicSinopse(tIdx, val)
      });

      t.subtopicos.forEach((s, sIdx) => {
        const subNumStr = s.number || String(sIdx + 1);
        const subtopicBadge = `TÓPICO ${topicNum} - SUBTÓPICO ${subNumStr}: ${s.title.toUpperCase()}`;
        const subtopicTitle = `${topicNum}.${subNumStr}. ${s.title}`;
        const numPrefix = `${subNumStr}. `;

        // 1. SLIDE DO TEXTO OFICIAL DA REVISTA (QUADRO AZUL)
        let textoQuadroAzul = s.projetor || '';
        if (!textoQuadroAzul && s.frasesExplicativas && s.frasesExplicativas.length > 0) {
          textoQuadroAzul = s.frasesExplicativas.map(f => f.frase).filter(Boolean).join(' ');
        }
        if (!textoQuadroAzul) {
          textoQuadroAzul = s.explicacao || '';
        }
        if (textoQuadroAzul && !textoQuadroAzul.startsWith(numPrefix) && !textoQuadroAzul.startsWith(`${subNumStr} `) && !textoQuadroAzul.startsWith(`Subtópico ${subNumStr}`)) {
          textoQuadroAzul = `${numPrefix}${textoQuadroAzul}`;
        }

        if (textoQuadroAzul) {
          items.push({
            id: `subtopic_${tIdx}_${sIdx}`,
            type: 'subtopic',
            title: subtopicTitle,
            badgeText: subtopicBadge,
            ideiaText: `${subNumStr}. ${s.title}`,
            projetorText: textoQuadroAzul,
            imagePrompt: s.imagePrompt,
            onUpdateTitle: (val: string) => updateSubtopicField(tIdx, sIdx, 'title', val.replace(/^\d+(\.\d+)?\.\s*/, '')),
            onUpdateText: (val: string) => updateSubtopicField(tIdx, sIdx, 'projetor', val)
          });
        }

        // 2. SLIDE DE BASE BÍBLICA DE APOIO (VAMOS LER A BÍBLIA - APENAS OS VERSÍCULOS NO PROJETOR)
        if (s.versiculos && s.versiculos.length > 0) {
          const textoApenasVersiculos = s.versiculos
            .map(v => v.reference ? `📖 ${v.reference.replace(/^[📖\s*-]+/, '').trim()}` : '')
            .filter(Boolean)
            .join('\n');
          if (textoApenasVersiculos) {
            items.push({
              id: `subtopic_verses_${tIdx}_${sIdx}`,
              type: 'subtopic_verses',
              title: 'VAMOS LER A BÍBLIA',
              badgeText: 'VAMOS LER A BÍBLIA',
              ideiaText: '📖 VAMOS LER A BÍBLIA',
              projetorText: textoApenasVersiculos,
              imagePrompt: s.imagePrompt,
              onUpdateText: (val: string) => {
                const refs = val.split('\n').filter(Boolean);
                const currentVerses = s.versiculos || [];
                const newVerses = refs.map((r, i) => ({
                  reference: r.replace(/^[📖\s*-]+/, '').trim(),
                  text: currentVerses[i]?.text || '',
                  explicacao: currentVerses[i]?.explicacao || ''
                }));
                updateSubtopicField(tIdx, sIdx, 'versiculos', newVerses);
              }
            });
          }
        }

        // 3. SLIDE DE APLICAÇÃO (QUAL O ENSINAMENTO PRA MINHA VIDA?)
        if (s.aplicacao) {
          items.push({
            id: `subtopic_aplicacao_${tIdx}_${sIdx}`,
            type: 'subtopic_aplicacao',
            title: 'QUAL O ENSINAMENTO PRA MINHA VIDA?',
            badgeText: 'QUAL O ENSINAMENTO PRA MINHA VIDA?',
            ideiaText: 'QUAL O ENSINAMENTO PRA MINHA VIDA?',
            projetorText: s.aplicacao,
            imagePrompt: s.imagePrompt,
            onUpdateText: (val: string) => updateSubtopicField(tIdx, sIdx, 'aplicacao', val)
          });
        }


        // FALLBACK PARA DADOS LEGADOS COM ARRAY DE IDEIAS
        if (!textoQuadroAzul && s.ideias && s.ideias.length > 0) {
          s.ideias.forEach((ideia, iIdx) => {
            items.push({
              id: `subtopic_legacy_${tIdx}_${sIdx}_${iIdx}`,
              type: 'subtopic',
              title: subtopicTitle,
              badgeText: subtopicBadge,
              ideiaText: `${ideia.letra}) ${ideia.titulo}`,
              projetorText: ideia.projetor,
              imagePrompt: ideia.imagePrompt || s.imagePrompt,
              onUpdateTitle: (val: string) => updateSubtopicField(tIdx, sIdx, 'title', val.replace(/^\d+(\.\d+)?\.\s*/, '')),
              onUpdateText: (val: string) => {
                updateLesson(prev => {
                  const topicos = [...prev.topicos];
                  const sub = { ...topicos[tIdx].subtopicos[sIdx] };
                  if (sub.ideias && sub.ideias[iIdx]) {
                    const ideias = [...sub.ideias];
                    ideias[iIdx] = { ...ideias[iIdx], projetor: val };
                    sub.ideias = ideias;
                    topicos[tIdx].subtopicos[sIdx] = sub;
                  }
                  return { ...prev, topicos };
                });
              }
            });
            if (ideia.professor?.explicacao) {
              items.push({
                id: `explanation_${tIdx}_${sIdx}_${iIdx}`,
                type: 'subtopic_explanation',
                title: subtopicTitle,
                badgeText: subtopicBadge,
                ideiaText: `EXPLICAÇÃO — IDEIA ${ideia.letra.toUpperCase()}`,
                projetorText: ideia.professor.explicacao,
                imagePrompt: ideia.imagePrompt || s.imagePrompt,
                onUpdateTitle: (val: string) => updateSubtopicField(tIdx, sIdx, 'title', val.replace(/^\d+(\.\d+)?\.\s*/, '')),
                onUpdateText: (val: string) => {
                  updateLesson(prev => {
                    const topicos = [...prev.topicos];
                    const sub = { ...topicos[tIdx].subtopicos[sIdx] };
                    if (sub.ideias && sub.ideias[iIdx]) {
                      const ideias = [...sub.ideias];
                      ideias[iIdx] = {
                        ...ideias[iIdx],
                        professor: { ...ideias[iIdx].professor, explicacao: val }
                      };
                      sub.ideias = ideias;
                      topicos[tIdx].subtopicos[sIdx] = sub;
                    }
                    return { ...prev, topicos };
                  });
                }
              });
            }
          });
        }
      });
    });

    // Conclusão
    if (lesson.conclusao?.takeaway) {
      items.push({
        id: 'conclusao',
        type: 'conclusao',
        title: 'CONCLUSÃO',
        badgeText: 'CONCLUSÃO',
        projetorText: lesson.conclusao.takeaway,
        onUpdateText: (val: string) => updateConclusaoField('takeaway', val)
      });
    }

    // Verdades que precisamos guardar (bulletPoints antes da oração)
    if (lesson.conclusao?.bulletPoints?.length) {
      items.push({
        id: 'verdades',
        type: 'verdades',
        title: 'VERDADES QUE PRECISAMOS GUARDAR',
        badgeText: 'VERDADES QUE PRECISAMOS GUARDAR',
        bulletPoints: lesson.conclusao.bulletPoints,
        onUpdateBulletPoint: (bIdx: number, val: string) => updateConclusaoBullet(bIdx, val)
      });
    }

    // Slides Extras adicionados pelo usuário
    (lesson.extraSlides || []).forEach((extra) => {
      items.push({
        id: extra.id,
        type: 'extra',
        title: extra.title,
        badgeText: extra.badgeText || 'SLIDE EXTRA',
        projetorText: extra.projetorText || '',
        subtitle: extra.subtitle || '',
        reference: extra.reference || '',
        bulletPoints: extra.bulletPoints,
        imagePrompt: extra.imagePrompt,
        imageUrl: extra.imageUrl,
        onUpdateTitle: (val: string) => {
          updateLesson(prev => ({
            ...prev,
            extraSlides: (prev.extraSlides || []).map(s => s.id === extra.id ? { ...s, title: val } : s)
          }));
        },
        onUpdateSubtitle: (val: string) => {
          updateLesson(prev => ({
            ...prev,
            extraSlides: (prev.extraSlides || []).map(s => s.id === extra.id ? { ...s, subtitle: val, reference: val } : s)
          }));
        },
        onUpdateReference: (val: string) => {
          updateLesson(prev => ({
            ...prev,
            extraSlides: (prev.extraSlides || []).map(s => s.id === extra.id ? { ...s, reference: val, subtitle: val } : s)
          }));
        },
        onUpdateText: (val: string) => {
          updateLesson(prev => ({
            ...prev,
            extraSlides: (prev.extraSlides || []).map(s => s.id === extra.id ? { ...s, projetorText: val } : s)
          }));
        }
      });
    });

    // Aplica a reordenação personalizada se existir
    if (lesson.customSlideOrder && lesson.customSlideOrder.length > 0) {
      const orderMap = new Map<string, number>();
      lesson.customSlideOrder.forEach((id, idx) => orderMap.set(id, idx));

      items.sort((a, b) => {
        const orderA = orderMap.has(a.id) ? orderMap.get(a.id)! : 999;
        const orderB = orderMap.has(b.id) ? orderMap.get(b.id)! : 999;
        return orderA - orderB;
      });
    }

    return items;
  }, [lesson]);

  const currentProjectorItem = projectorItems[projectorIndex] || projectorItems[0];

  // Atalhos de Teclado no Modo Projetor (Seta Esquerda / Direita e Escape para Sair do Recorte Canva)
  useEffect(() => {
    if (activeTab !== 'projetor') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isCanvaCropping && e.key === 'Escape') {
        setIsCanvaCropping(false);
        return;
      }
      if (e.key === 'ArrowLeft') {
        setProjectorIndex(prev => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight') {
        setProjectorIndex(prev => Math.min(projectorItems.length - 1, prev + 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, projectorItems.length, isCanvaCropping]);

  // Reseta o modo de recorte ao mudar de slide
  useEffect(() => {
    setIsCanvaCropping(false);
  }, [projectorIndex]);

  const toggleTopicExpand = (topicNumber: string) => {
    setExpandedTopics(prev => ({
      ...prev,
      [topicNumber]: !prev[topicNumber]
    }));
  };

  // Regenerar Seção Específica (Explicação / Aplicação / Projetor)
  const handleRegenerateSection = async (
    targetType: 'explicacao' | 'aplicacao' | 'projetor',
    topicIdx: number,
    subIdx: number,
    ideiaIdx?: number
  ) => {
    const uniqueId = `${topicIdx}-${subIdx}-${ideiaIdx ?? 'sub'}-${targetType}`;
    setRegeneratingId(uniqueId);

    try {
      const sub = lesson.topicos[topicIdx].subtopicos[subIdx];
      const targetTitle = (ideiaIdx !== undefined && sub.ideias?.[ideiaIdx]) 
        ? sub.ideias[ideiaIdx].titulo 
        : sub.title;
      const currentExp = (ideiaIdx !== undefined && sub.ideias?.[ideiaIdx]) 
        ? sub.ideias[ideiaIdx].professor.explicacao 
        : sub.explicacao;

      const prompt = `Como especialista em EBD, reescreva e aprimore somente o campo ${targetType.toUpperCase()} para o subtópico: "${targetTitle}".
Explicação atual: ${currentExp}.
Retorne APENAS o novo texto diretamente, claro, didático e bíblico.`;

      const newText = await callGeminiRaw(prompt, 'gemini-2.5-flash');

      const updated = { ...lesson };
      const targetSub = updated.topicos[topicIdx].subtopicos[subIdx];

      if (ideiaIdx !== undefined && targetSub.ideias?.[ideiaIdx]) {
        if (targetType === 'explicacao') targetSub.ideias[ideiaIdx].professor.explicacao = newText.trim();
        else if (targetType === 'aplicacao') targetSub.ideias[ideiaIdx].professor.aplicacao = newText.trim();
        else if (targetType === 'projetor') targetSub.ideias[ideiaIdx].projetor = newText.trim();
      } else {
        if (targetType === 'explicacao') targetSub.explicacao = newText.trim();
        else if (targetType === 'aplicacao') targetSub.aplicacao = newText.trim();
        else if (targetType === 'projetor') targetSub.projetor = newText.trim();
      }

      setLesson(updated);
      onUpdateLesson(updated);
    } catch (err: any) {
      alert(`Erro ao regenerar seção: ${err.message}`);
    } finally {
      setRegeneratingId(null);
    }
  };

  const fullSyncedLesson = React.useMemo<EBDLessonPreparation>(() => ({
    ...lesson,
    extraSlides: lesson.extraSlides || [],
    customSlideOrder: lesson.customSlideOrder || [],
    slideTitlePositions,
    slideBodyPositions,
    slideBodyWidths,
    slideImagePositions,
    slideImageScales,
    slideImageWidths,
    slideImageHeights,
    slideImageCrops,
    slideImageFits,
    slideImageBorders,
    slideFontScales,
    slideTitleFontScales,
    slideBodyFontScales,
    slideTextOverrides,
    projectorSlideImages,
    projectorFontSizeScale,
    customBg,
    bodyTextColor,
  }), [
    lesson,
    slideTitlePositions,
    slideBodyPositions,
    slideBodyWidths,
    slideImagePositions,
    slideImageScales,
    slideImageWidths,
    slideImageHeights,
    slideImageCrops,
    slideImageFits,
    slideImageBorders,
    slideFontScales,
    slideTitleFontScales,
    slideBodyFontScales,
    slideTextOverrides,
    projectorSlideImages,
    projectorFontSizeScale,
    customBg,
    bodyTextColor,
  ]);

  return (
    <div className="preparation-view-container space-y-6 max-w-[1600px] w-full mx-auto font-['Montserrat']">
      {/* Barra de Ferramentas da Lição */}
      <div className="bg-slate-900/90 border border-slate-700/90 p-3.5 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-4 backdrop-blur-md no-print">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-[11px] uppercase tracking-wider font-extrabold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg shrink-0">
            {activeTab === 'projetor' ? 'Projetor' : 'Roteiro'}
          </span>
          <div className="text-white text-sm md:text-base font-black truncate max-w-sm md:max-w-md">
            {lesson.metadata.title}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Botões de Ação para Baixar / Imprimir / Copiar a Parte do Professor */}
          {activeTab === 'professor' && (
            <div className="flex flex-wrap items-center gap-2.5 bg-slate-950 p-2 rounded-2xl border border-slate-800">
              <button
                onClick={() => exportTeacherGuideCleanPDF(lesson)}
                title="Baixar Roteiro Limpo do Professor em PDF para ler no celular"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-sm bg-red-600 hover:bg-red-500 text-white border border-red-400/40 shadow-md transition-all cursor-pointer min-h-[42px] active:scale-95"
              >
                <FileDown className="w-4 h-4 text-white" />
                <span>📄 Roteiro PDF</span>
              </button>


              <button
                onClick={() => setIsEditMode(!isEditMode)}
                title="Ativar/desativar modo de edição livre de texto"
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-sm transition-all cursor-pointer border min-h-[42px] active:scale-95 ${
                  isEditMode
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-extrabold shadow-lg shadow-amber-500/30'
                    : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40'
                }`}
              >
                <Edit3 className="w-4 h-4" />
                <span>{isEditMode ? '✓ Concluir Edição' : '✏️ Editar Conteúdo'}</span>
              </button>
            </div>
          )}

          {/* Botões de Ação do Projetor: Imagem (1 Botão), Slide Extra, QR Code, Modelo, PPTX, ZIP, Editar, Mover */}
          {activeTab === 'projetor' && (
            <div className="flex flex-wrap items-center gap-2.5 bg-slate-950 p-2 rounded-2xl border border-slate-800">
              {/* 1 BOTÃO UNIFICADO: IMAGEM DO SLIDE */}
              <div className="relative inline-block" ref={imageMenuRef}>
                <div className="inline-flex items-center rounded-xl shadow-md border border-purple-400/50 bg-purple-700 overflow-hidden min-h-[42px]">
                  <label
                    className="hover:bg-purple-600 text-white font-black px-4 py-2.5 flex items-center gap-2 text-sm cursor-pointer transition-all active:scale-95"
                    title="Adicionar ou alterar imagem ilustrativa neste slide"
                  >
                    <ImageIcon className="w-4.5 h-4.5 text-purple-200" />
                    <span>{(projectorSlideImages[projectorIndex] || currentProjectorItem?.imageUrl) ? '📷 Imagem' : '🖼️ + Imagem'}</span>
                    <input type="file" accept="image/*" onChange={handleSlideImageUpload} className="hidden" />
                  </label>
                  {(projectorSlideImages[projectorIndex] || currentProjectorItem?.imageUrl) && (
                    <button
                      onClick={() => setIsImageMenuOpen(prev => !prev)}
                      className="hover:bg-purple-600 text-white font-black px-3 py-2.5 border-l border-purple-500/80 flex items-center justify-center cursor-pointer transition-all min-h-[42px]"
                      title="Mais opções da imagem (Recortar, Remover)"
                    >
                      <ChevronDown className={`w-4 h-4 text-purple-100 transition-transform duration-200 ${isImageMenuOpen ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                </div>

                {isImageMenuOpen && (projectorSlideImages[projectorIndex] || currentProjectorItem?.imageUrl) && (
                  <div className="absolute left-0 top-full mt-2 z-50 w-56 bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-2 text-sm space-y-1 backdrop-blur-xl animate-in fade-in duration-150">
                    <label className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-left text-purple-200 hover:bg-purple-950/60 font-bold transition-colors cursor-pointer">
                      <ImageIcon className="w-4 h-4 text-purple-400" />
                      <span>📷 Alterar Imagem</span>
                      <input type="file" accept="image/*" onChange={(e) => { handleSlideImageUpload(e); setIsImageMenuOpen(false); }} className="hidden" />
                    </label>

                    <button
                      onClick={() => { handleOpenCropForSlide(); setIsImageMenuOpen(false); }}
                      className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-left text-pink-300 hover:bg-pink-950/60 font-bold transition-colors cursor-pointer"
                    >
                      <Crop className="w-4 h-4 text-pink-400" />
                      <span>✂️ Recortar (Crop)</span>
                    </button>

                    <div className="border-t border-slate-800 my-1" />

                    <button
                      onClick={() => { handleRemoveSlideImage(); setIsImageMenuOpen(false); }}
                      className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-left text-red-400 hover:bg-red-950/60 font-bold transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                      <span>🗑️ Remover Imagem</span>
                    </button>
                  </div>
                )}
              </div>

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
                      onClick={() => { handleAddExtraSlide(); setIsSlideMenuOpen(false); }}
                      className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-left text-emerald-300 hover:bg-emerald-950/60 font-bold transition-colors cursor-pointer"
                    >
                      <PlusCircle className="w-4 h-4 text-emerald-400" />
                      <span>➕ Novo Slide Extra</span>
                    </button>

                    <button
                      onClick={() => { handleDuplicateSlide(); setIsSlideMenuOpen(false); }}
                      className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-left text-slate-200 hover:bg-slate-800 font-bold transition-colors cursor-pointer"
                    >
                      <Copy className="w-4 h-4 text-cyan-400" />
                      <span>📋 Duplicar Slide Atual</span>
                    </button>

                    <div className="border-t border-slate-800 my-1" />

                    <button
                      onClick={() => { handleMoveSlideLeft(); setIsSlideMenuOpen(false); }}
                      disabled={projectorIndex === 0}
                      className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-left text-slate-200 hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none font-bold transition-colors cursor-pointer"
                    >
                      <ArrowLeft className="w-4 h-4 text-amber-400" />
                      <span>⬅️ Mover para Esquerda</span>
                    </button>

                    <button
                      onClick={() => { handleMoveSlideRight(); setIsSlideMenuOpen(false); }}
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
                          onClick={() => { handleDeleteSlide(); setIsSlideMenuOpen(false); }}
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

              {/* Exportar PPTX com todos os slides */}
              <button
                onClick={() => {
                  const theme = THEMES[0];
                  const itemsWithImages = projectorItems.map((item, idx) => ({
                    ...item,
                    imageUrl: projectorSlideImages[idx] || item.imageUrl,
                    imageScale: slideImageScales[idx] ?? 1.0,
                    imageFit: slideImageFits[idx] ?? 'cover',
                  }));
                  exportProjectorItemsToPowerPoint(itemsWithImages, lesson.metadata.title, theme, customBg);
                }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-sm font-extrabold cursor-pointer border border-emerald-400/40 shadow-md transition-all hover:scale-105 active:scale-95 min-h-[42px]"
                title="Exportar apresentação completa (.pptx) com todos os slides e edições"
              >
                <Download className="w-4 h-4 text-white" />
                <span>PowerPoint (.pptx)</span>
              </button>

              {/* TODOS OS SLIDES - PNG/ZIP */}
              <button
                onClick={async () => {
                  if (isExporting) return;
                  setIsExporting('png');
                  const origIdx = projectorIndex;
                  try {
                    await exportAllSlidesPNGZipFromStage(
                      projectorItems.length,
                      (i) => setProjectorIndex(i),
                      () => projectorStageRef.current,
                      lesson.metadata.title || 'mega-ebd'
                    );
                  } finally {
                    setProjectorIndex(origIdx);
                    setIsExporting(null);
                  }
                }}
                disabled={!!isExporting}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-bold cursor-pointer disabled:opacity-50 transition-all shadow-sm hover:scale-105 active:scale-95 min-h-[42px]"
                title="Exportar todos os slides como ZIP com PNGs"
              >
                {isExporting === 'png' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ImageDown className="w-4 h-4" />}
                <span>{isExporting === 'png' ? 'Gerando...' : 'Todos (ZIP)'}</span>
              </button>

              {/* BOTÃO DE EDITAR SLIDE (MODO PROJETOR) */}
              <button
                onClick={() => setIsEditMode(!isEditMode)}
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
                onClick={() => setIsLayoutEditMode(prev => !prev)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black cursor-pointer transition-all shadow-md border min-h-[42px] ${
                  isLayoutEditMode
                    ? 'bg-purple-600 hover:bg-purple-500 text-white border-purple-400 ring-2 ring-purple-400/50'
                    : 'bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border-purple-500/40'
                }`}
                title="Arrastar título e texto livremente no slide para reposicioná-los"
              >
                <Move className="w-4 h-4 text-current" />
                <span>{isLayoutEditMode ? '✅ Pronto' : '🎯 Mover'}</span>
              </button>

              {/* BOTÃO DE LINHAS GUIA HORIZONTAL E VERTICAL */}
              <button
                onClick={toggleAlignmentGuides}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black cursor-pointer transition-all shadow-md border min-h-[42px] ${
                  showAlignmentGuides
                    ? 'bg-cyan-600 hover:bg-cyan-500 text-white border-cyan-300 ring-2 ring-cyan-400/50 shadow-cyan-600/30'
                    : 'bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border-cyan-500/40'
                }`}
                title="Linhas-guia de alinhamento: exibe réguas e guias na horizontal e vertical para posicionar textos com perfeição"
              >
                <Crosshair className="w-4 h-4 text-current" />
                <span>{showAlignmentGuides ? '📐 Ocultar Guias' : '📐 Guias H/V'}</span>
              </button>
            </div>
          )}


        </div>
      </div>

      {/* Banner de Modo Edição Ativo */}
      {isEditMode && (
        <div className="bg-amber-950/80 border-2 border-amber-500/70 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-amber-200 text-xs md:text-sm font-bold shadow-xl no-print">
          <div className="flex items-center gap-2">
            <Edit3 className="w-5 h-5 text-amber-400 shrink-0" />
            <span>
              ✏️ <strong>Modo Edição Livre Ativo:</strong> Altere qualquer texto diretamente na tela, ou use os botões <strong>"+ Adicionar"</strong> para incluir novas frases, versículos e tópicos!
            </span>
          </div>
          <button
            onClick={() => setIsEditMode(false)}
            className="bg-amber-500 text-slate-950 px-4 py-1.5 rounded-xl font-black text-xs hover:bg-amber-400 transition-colors shadow-md cursor-pointer"
          >
            ✓ Concluir Edição
          </button>
        </div>
      )}


      {/* ========================================================= */}
      {/* 👨‍🏫 ABA 1: VISÃO DO PROFESSOR (PREPARAÇÃO DETALHADA E DIDÁTICA) */}
      {/* ========================================================= */}
      {activeTab === 'professor' && (
        <div className="space-y-6">
          {/* Cabeçalho da Preparação e Fontes Utilizadas */}
          <div className="bg-slate-900/80 border border-slate-700/80 p-6 rounded-3xl shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/60 pb-4">
              <div className="flex-1">
                <span className="text-xs font-black text-amber-400 uppercase tracking-widest block mb-1">
                  <EditableText
                    value={lesson.metadata.lessonNumber || 'Escola Bíblica Dominical'}
                    onChange={v => updateMetadata('lessonNumber', v)}
                    isEditMode={isEditMode}
                    placeholder="Número da Lição (ex: LIÇÃO 11)"
                  />
                </span>
                <h1 className="text-2xl md:text-4xl font-black text-white font-['Montserrat']">
                  <EditableText
                    value={lesson.metadata.title}
                    onChange={v => updateMetadata('title', v)}
                    isEditMode={isEditMode}
                    placeholder="Título da Lição"
                  />
                </h1>
                <p className="text-xs md:text-sm text-slate-300 mt-1 font-semibold flex items-center gap-1">
                  <span>Tema:</span>
                  <EditableText
                    value={lesson.metadata.themeTopic}
                    onChange={v => updateMetadata('themeTopic', v)}
                    isEditMode={isEditMode}
                    placeholder="Tema do Trimestre"
                  />
                </p>

                {/* 🖼️ PROMPT VISUAL 16:9 DA CAPA / TÍTULO DA LIÇÃO */}
                {(lesson.metadata.imagePrompt || isEditMode) && (
                  <div className="mt-3 bg-slate-950/90 p-3.5 rounded-2xl border border-slate-800 space-y-1.5 no-print">
                    <div className="flex items-center justify-between text-cyan-400 font-extrabold text-[11px] uppercase">
                      <span className="flex items-center gap-1.5">
                        <span>🖼️ PROMPT VISUAL 16:9 (CAPA / CANVA / MIDJOURNEY)</span>
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(lesson.metadata.imagePrompt || '');
                          alert('Prompt da Capa copiado para a área de transferência!');
                        }}
                        className="text-slate-400 hover:text-cyan-300 text-[10px] bg-slate-800 px-2 py-0.5 rounded cursor-pointer transition-colors"
                      >
                        📋 Copiar Prompt
                      </button>
                    </div>
                    <EditableText
                      value={lesson.metadata.imagePrompt || ''}
                      onChange={v => updateMetadata('imagePrompt', v)}
                      isEditMode={isEditMode}
                      multiline
                      placeholder="Prompt visual 16:9 cinematográfico para o Título da Lição e Capa dos Slides..."
                      className="text-[11px] text-slate-300 font-mono italic bg-slate-900/90 p-2.5 rounded-lg border border-slate-800/80 block w-full"
                    />
                  </div>
                )}
              </div>

              {/* Status das Transcrições Cruzadas */}
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-right space-y-1">
                <span className="text-[11px] text-emerald-400 font-extrabold block">
                  ✓ {lesson.sourcesSummary.transcriptionsCount} Transcrições Cruzadas
                </span>
                <div className="text-[10px] text-slate-400 truncate max-w-xs">
                  Fontes: {lesson.sourcesSummary.sourcesUsed.join(', ')}
                </div>
              </div>
            </div>

            {/* BARRA DE EXPORTAÇÃO RÁPIDA DA PARTE DO PROFESSOR */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800/90 flex flex-wrap items-center justify-between gap-3 no-print">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-400" />
                <div>
                  <span className="text-xs font-extrabold text-white block">
                    Roteiro do Professor na Íntegra
                  </span>
                  <span className="text-[11px] text-slate-400 font-medium">
                    Baixe em PDF, arquivo de texto ou copie todo o conteúdo didático e teológico.
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handlePrintTeacherGuide}
                  title="Imprimir roteiro da lição ou abrir janela de impressão do navegador"
                  className="bg-amber-500 hover:bg-amber-600 text-slate-950 px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>🖨️ Imprimir Roteiro</span>
                </button>

                <button
                  onClick={handleCopyAllPrompts}
                  title="Copiar todos os prompts visuais 16:9 da lição (Canva / Midjourney / DALL-E)"
                  className="bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/50 px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
                >
                  <Copy className="w-4 h-4 text-purple-300" />
                  <span>📋 Copiar Todos os Prompts</span>
                </button>

                <button
                  onClick={handleGenerateAllPrompts}
                  disabled={isGeneratingAllPrompts}
                  title="Gerar ou regenerar todos os prompts visuais da lição com IA"
                  className="bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-200 border border-cyan-500/50 px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-md cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className={`w-4 h-4 text-cyan-300 ${isGeneratingAllPrompts ? 'animate-spin' : ''}`} />
                  <span>{isGeneratingAllPrompts ? 'Gerando Prompts...' : '✨ Gerar Prompts com IA'}</span>
                </button>

                <button
                  onClick={handleCopyTeacherGuide}
                  title="Copiar Roteiro Completo com Prompts e Fontes"
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  {copiedToast === 'full' ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-400">Copiado Completo!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-slate-400" />
                      <span>Copiar Completo</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Transição entre Lições (Se ativada ou com conteúdo - PRIMEIROS CARDS) */}
            {(isEditMode ||
              lesson.introducao?.ponteContextual?.enabled ||
              lesson.introducao?.ponteContextual?.naLicaoAnterior ||
              lesson.introducao?.ponteContextual?.ondeParou ||
              lesson.introducao?.ponteContextual?.ponteContextual ||
              lesson.introducao?.ponteContextual?.capitulosIntermediarios) && (
              <div className="space-y-4 pt-2">
                {/* CARD 1: NA LIÇÃO ANTERIOR */}
                {(isEditMode || lesson.introducao?.ponteContextual?.naLicaoAnterior || lesson.introducao?.ponteContextual?.ondeParou) && (
                  <div className="bg-gradient-to-r from-amber-950/80 via-slate-900 to-amber-950/60 border-2 border-amber-500/40 p-5 rounded-2xl shadow-xl space-y-2">
                    <div className="flex items-center gap-2 text-amber-400 font-extrabold text-sm md:text-base border-b border-amber-500/20 pb-2">
                      <Bookmark className="w-5 h-5 text-amber-400" />
                      <span>NA LIÇÃO ANTERIOR</span>
                    </div>
                    <EditableText
                      value={lesson.introducao?.ponteContextual?.naLicaoAnterior || lesson.introducao?.ponteContextual?.ondeParou || ''}
                      onChange={v => updatePonteContextualField('naLicaoAnterior', v)}
                      isEditMode={isEditMode}
                      multiline
                      placeholder="Resumo bem breve do que aconteceu na lição anterior..."
                      className="text-sm md:text-base font-extrabold text-white leading-relaxed"
                    />
                  </div>
                )}

                {/* CARD 2: INTERVALO BÍBLICO */}
                {(isEditMode || lesson.introducao?.ponteContextual?.ponteContextual || lesson.introducao?.ponteContextual?.capitulosIntermediarios) && (
                  <div className="bg-gradient-to-r from-emerald-950/80 via-slate-900 to-teal-950/80 border-2 border-emerald-500/40 p-5 rounded-2xl shadow-xl space-y-2">
                    <div className="flex items-center gap-2 text-emerald-400 font-extrabold text-sm md:text-base border-b border-emerald-500/20 pb-2">
                      <Link2 className="w-5 h-5 text-emerald-400" />
                      <span>INTERVALO BÍBLICO</span>
                    </div>
                    <EditableText
                      value={lesson.introducao?.ponteContextual?.ponteContextual || lesson.introducao?.ponteContextual?.capitulosIntermediarios || ''}
                      onChange={v => updatePonteContextualField('ponteContextual', v)}
                      isEditMode={isEditMode}
                      multiline
                      placeholder="Capítulos intermediários ou contexto bíblico de transição..."
                      className="text-sm md:text-base font-extrabold text-white leading-relaxed"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Texto Áureo & Verdade Prática */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Texto Áureo */}
              <div className="bg-[#091b2c] border-2 border-[#cbd5e1] p-5 rounded-2xl shadow-lg space-y-3">
                <span className="text-xs font-black text-amber-300 uppercase tracking-wider block">
                  TEXTO ÁUREO
                </span>
                <div className="space-y-2">
                  <EditableText
                    value={lesson.textAureo.text}
                    onChange={v => updateTextAureo('text', v)}
                    isEditMode={isEditMode}
                    multiline
                    placeholder="Texto bíblico áureo..."
                    className="text-sm md:text-base font-extrabold text-white leading-relaxed"
                  />
                  <EditableText
                    value={lesson.textAureo.reference}
                    onChange={v => updateTextAureo('reference', v)}
                    isEditMode={isEditMode}
                    placeholder="Referência (ex: Salmos 119.105)"
                    label={isEditMode ? 'Referência Bíblica' : undefined}
                    className="text-xs text-amber-300 font-bold"
                  />
                </div>

                {/* 🖼️ Prompt Visual 16:9 do Texto Áureo */}
                {(lesson.textAureo.imagePrompt || isEditMode) && (
                  <div className="bg-slate-950/90 p-3 rounded-xl border border-slate-800 space-y-1.5 no-print">
                    <div className="flex items-center justify-between text-cyan-400 font-extrabold text-[11px] uppercase">
                      <span className="flex items-center gap-1.5">
                        <span>🖼️ PROMPT VISUAL 16:9 (TEXTO ÁUREO)</span>
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(lesson.textAureo.imagePrompt || '');
                          alert('Prompt do Texto Áureo copiado!');
                        }}
                        className="text-slate-400 hover:text-cyan-300 text-[10px] bg-slate-800 px-2 py-0.5 rounded cursor-pointer transition-colors"
                      >
                        📋 Copiar Prompt
                      </button>
                    </div>
                    <EditableText
                      value={lesson.textAureo.imagePrompt || ''}
                      onChange={v => updateTextAureo('imagePrompt', v)}
                      isEditMode={isEditMode}
                      multiline
                      placeholder="Prompt visual 16:9 cinematográfico para o Texto Áureo..."
                      className="text-[11px] text-slate-300 font-mono italic bg-slate-900/90 p-2.5 rounded-lg border border-slate-800/80 block w-full"
                    />
                  </div>
                )}
              </div>

              {/* Verdade Prática */}
              <div className="bg-[#091b2c] border-2 border-[#cbd5e1] p-5 rounded-2xl shadow-lg space-y-3">
                <span className="text-xs font-black text-amber-300 uppercase tracking-wider block">
                  VERDADE PRÁTICA
                </span>
                <EditableText
                  value={lesson.verdadePratica.text}
                  onChange={v => updateVerdadePratica(v)}
                  isEditMode={isEditMode}
                  multiline
                  placeholder="Verdade Prática da lição..."
                  className="text-sm md:text-base font-extrabold text-white leading-relaxed"
                />

                {/* 🖼️ Prompt Visual 16:9 da Verdade Prática */}
                {(lesson.verdadePratica.imagePrompt || isEditMode) && (
                  <div className="bg-slate-950/90 p-3 rounded-xl border border-slate-800 space-y-1.5 no-print">
                    <div className="flex items-center justify-between text-cyan-400 font-extrabold text-[11px] uppercase">
                      <span className="flex items-center gap-1.5">
                        <span>🖼️ PROMPT VISUAL 16:9 (VERDADE PRÁTICA)</span>
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(lesson.verdadePratica.imagePrompt || '');
                          alert('Prompt da Verdade Prática copiado!');
                        }}
                        className="text-slate-400 hover:text-cyan-300 text-[10px] bg-slate-800 px-2 py-0.5 rounded cursor-pointer transition-colors"
                      >
                        📋 Copiar Prompt
                      </button>
                    </div>
                    <EditableText
                      value={lesson.verdadePratica.imagePrompt || ''}
                      onChange={v => updateVerdadePraticaPrompt(v)}
                      isEditMode={isEditMode}
                      multiline
                      placeholder="Prompt visual 16:9 cinematográfico para a Verdade Prática..."
                      className="text-[11px] text-slate-300 font-mono italic bg-slate-900/90 p-2.5 rounded-lg border border-slate-800/80 block w-full"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Palavra-Chave da Lição com Explicação */}
            {(lesson.palavraChave || isEditMode) && (
              <div className="bg-[#091b2c] border-2 border-amber-500/40 p-5 rounded-2xl shadow-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                    🔑 PALAVRA-CHAVE DA LIÇÃO
                  </span>
                  {isEditMode && !lesson.palavraChave && (
                    <button
                      onClick={() => updatePalavraChave('palavra', 'NOVA PALAVRA')}
                      className="text-xs bg-amber-600/30 text-amber-300 border border-amber-500/50 px-2.5 py-1 rounded-lg hover:bg-amber-600/50 font-bold cursor-pointer"
                    >
                      + Adicionar Palavra-Chave
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  <EditableText
                    value={lesson.palavraChave?.palavra || ''}
                    onChange={v => updatePalavraChave('palavra', v.toUpperCase())}
                    isEditMode={isEditMode}
                    placeholder="Palavra-Chave (ex: AUTORIA, INSPIRAÇÃO, REVELAÇÃO)"
                    label={isEditMode ? 'Palavra-Chave' : undefined}
                    className="text-lg md:text-xl font-black text-amber-400 tracking-wider uppercase"
                  />
                  <EditableText
                    value={lesson.palavraChave?.explicacao || ''}
                    onChange={v => updatePalavraChave('explicacao', v)}
                    isEditMode={isEditMode}
                    multiline
                    placeholder="Explicação teológica e didática da Palavra-Chave para a aula..."
                    label={isEditMode ? 'Explicação Didática / Teológica' : undefined}
                    className="text-sm md:text-base font-medium text-slate-200 leading-relaxed"
                  />
                </div>

                {/* 🖼️ Prompt Visual 16:9 da Palavra-Chave */}
                {(lesson.palavraChave?.imagePrompt || isEditMode) && (
                  <div className="bg-slate-950/90 p-3 rounded-xl border border-slate-800 space-y-1.5 no-print">
                    <div className="flex items-center justify-between text-cyan-400 font-extrabold text-[11px] uppercase">
                      <span className="flex items-center gap-1.5">
                        <span>🖼️ PROMPT VISUAL 16:9 (PALAVRA-CHAVE)</span>
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(lesson.palavraChave?.imagePrompt || '');
                          alert('Prompt da Palavra-Chave copiado!');
                        }}
                        className="text-slate-400 hover:text-cyan-300 text-[10px] bg-slate-800 px-2 py-0.5 rounded cursor-pointer transition-colors"
                      >
                        📋 Copiar Prompt
                      </button>
                    </div>
                    <EditableText
                      value={lesson.palavraChave?.imagePrompt || ''}
                      onChange={v => updatePalavraChave('imagePrompt', v)}
                      isEditMode={isEditMode}
                      multiline
                      placeholder="Prompt visual 16:9 cinematográfico para a Palavra-Chave..."
                      className="text-[11px] text-slate-300 font-mono italic bg-slate-900/90 p-2.5 rounded-lg border border-slate-800/80 block w-full"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* CHECKLIST DE FIDELIDADE DAS FONTES */}

          <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs no-print">
            <span className="font-extrabold text-slate-300 flex items-center gap-1.5">
              <Check className="w-4 h-4 text-emerald-400" />
              Checklist de Fidelidade EBD:
            </span>
            <div className="flex flex-wrap items-center gap-3">
              {lesson.checklist.map((c, i) => (
                <span key={i} className="bg-slate-950 px-2.5 py-1 rounded-lg text-slate-300 border border-slate-800 flex items-center gap-1">
                  <span className="text-emerald-400 font-bold">✓</span> {c.item}
                </span>
              ))}
            </div>
          </div>

          {/* DESENVOLVIMENTO DOS TÓPICOS I, II, III */}
          {lesson.topicos.map((topico, topicIdx) => (
            <div key={topico.number || topicIdx} className="bg-slate-900/90 border border-slate-700/90 rounded-3xl overflow-hidden shadow-2xl space-y-4 p-6">
              {/* Cabeçalho do Tópico com Botão Recolher/Expandir */}
              <div
                onClick={() => toggleTopicExpand(topico.number)}
                className="flex items-center justify-between cursor-pointer border-b border-slate-700/80 pb-4 group"
              >
                <div className="flex items-center gap-3 flex-1">
                  <div className="w-10 h-10 rounded-xl bg-orange-600 text-white font-black text-lg flex items-center justify-center shadow-lg shrink-0">
                    {topico.number}
                  </div>
                  <div className="flex-1">
                    <h2 className="text-xl md:text-2xl font-black text-white group-hover:text-amber-300 transition-colors">
                      <EditableText
                        value={topico.title}
                        onChange={v => updateTopicTitle(topicIdx, v)}
                        isEditMode={isEditMode}
                        placeholder="Título do Tópico"
                      />
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {topico.subtopicos.length} Subtópicos Oficiais (Mapa de Ensino)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isEditMode && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeTopic(topicIdx);
                      }}
                      title="Excluir este Tópico"
                      className="p-2 bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white rounded-xl border border-red-500/30 transition-all cursor-pointer text-xs flex items-center gap-1 font-bold no-print"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Excluir Tópico</span>
                    </button>
                  )}
                  <button className="p-2 text-slate-400 group-hover:text-white">
                    {expandedTopics[topico.number] ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Conteúdo Expandido do Tópico */}
              {expandedTopics[topico.number] && (
                <div className="space-y-6 pt-2">
                  {/* Sinopse, Frases de Ênfase e Prompt Visual do Tópico */}
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Sinopse para Revisão Rápida */}
                      <div className="md:col-span-2 bg-slate-950/90 p-5 rounded-2xl border border-blue-500/40 space-y-2.5 shadow-md">
                        <span className="text-sm md:text-base font-black text-blue-400 uppercase tracking-wider block">
                          📌 SINOPSE DO TÓPICO (REVISÃO RÁPIDA)
                        </span>
                        <EditableText
                          value={topico.sinopse}
                          onChange={v => updateTopicSinopse(topicIdx, v)}
                          isEditMode={isEditMode}
                          multiline
                          placeholder="Sinopse do tópico..."
                          className="text-base md:text-lg lg:text-xl text-slate-100 leading-relaxed font-semibold"
                        />
                      </div>

                      {/* Frases para Ênfase */}
                      <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-2.5 no-print">
                        <span className="text-sm md:text-base font-black text-amber-400 uppercase tracking-wider block">
                          🗣️ FRASES DE ÊNFASE PARA AULA
                        </span>
                        <ul className="space-y-2 text-xs md:text-sm text-slate-200 font-semibold">
                          {(topico.frasesEnfase || []).map((frase, fIdx) => (
                            <li key={fIdx} className="flex items-center gap-1.5">
                              <span className="text-amber-400 font-bold shrink-0">•</span>
                              <div className="flex-1">
                                <EditableText
                                  value={frase}
                                  onChange={v => updateTopicFraseEnfase(topicIdx, fIdx, v)}
                                  isEditMode={isEditMode}
                                  placeholder="Frase de ênfase..."
                                />
                              </div>
                              {isEditMode && (
                                <button
                                  onClick={() => removeTopicFraseEnfase(topicIdx, fIdx)}
                                  className="p-1 text-red-400 hover:text-red-300 shrink-0"
                                  title="Remover esta frase"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                        {isEditMode && (
                          <button
                            onClick={() => addTopicFraseEnfase(topicIdx)}
                            className="w-full mt-2 py-1.5 px-3 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-all"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>+ Adicionar Frase de Ênfase</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 🖼️ Prompt Visual 16:9 do Tópico */}
                    {(topico.imagePrompt || isEditMode) && (
                      <div className="bg-slate-950/90 p-4 rounded-2xl border border-slate-800 space-y-1.5 no-print shadow-md">
                        <div className="flex items-center justify-between text-cyan-400 font-extrabold text-[11px] uppercase">
                          <span className="flex items-center gap-1.5">
                            <span>🖼️ PROMPT VISUAL 16:9 DO {topico.number}: {topico.title.toUpperCase()}</span>
                          </span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(topico.imagePrompt || '');
                              alert(`Prompt do ${topico.number} copiado!`);
                            }}
                            className="text-slate-400 hover:text-cyan-300 text-[10px] bg-slate-800 px-2 py-0.5 rounded cursor-pointer transition-colors"
                          >
                            📋 Copiar Prompt
                          </button>
                        </div>
                        <EditableText
                          value={topico.imagePrompt || ''}
                          onChange={v => updateTopicPrompt(topicIdx, v)}
                          isEditMode={isEditMode}
                          multiline
                          placeholder={`Prompt visual 16:9 cinematográfico para o ${topico.number}...`}
                          className="text-[11px] text-slate-300 font-mono italic bg-slate-900/90 p-2.5 rounded-lg border border-slate-800/80 block w-full"
                        />
                      </div>
                    )}
                  </div>

                  {/* SUBTÓPICOS COM EXPLICAÇÃO ÚNICA & CONTEXTO HISTÓRICO INTEGRADO */}
                  {topico.subtopicos.map((subtopico, subIdx) => {
                    const sectionId = `${topicIdx}-${subIdx}`;

                    return (
                      <div key={subtopico.number || subIdx} className="subtopic-card bg-slate-900/90 border border-slate-700/80 rounded-2xl p-5 md:p-6 space-y-5 shadow-xl transition-all">
                        {/* Cabeçalho do Subtópico */}
                        <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
                          <div className="flex-1">
                            <span className="text-amber-400 font-bold text-xs uppercase tracking-wider block mb-1">
                              SUBTÓPICO {subtopico.number}
                            </span>
                            <h3 className="text-lg md:text-xl font-extrabold text-white leading-tight">
                              <EditableText
                                value={subtopico.title}
                                onChange={v => updateSubtopicField(topicIdx, subIdx, 'title', v)}
                                isEditMode={isEditMode}
                                placeholder="Título do Subtópico"
                              />
                            </h3>
                          </div>
                          {isEditMode && (
                            <button
                              onClick={() => removeSubtopicFromTopic(topicIdx, subIdx)}
                              className="p-2 bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white rounded-xl border border-red-500/30 text-xs font-bold flex items-center gap-1 transition-all shrink-0 cursor-pointer ml-2"
                              title="Remover este subtópico"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Remover</span>
                            </button>
                          )}
                        </div>

                        {/* CAMADA 1 — PROJETOR (TEXTO OFICIAL DA LIÇÃO PARA ALUNOS - QUADRO AZUL) */}
                        {(() => {
                          let textoQuadroAzul = subtopico.projetor;
                          if (textoQuadroAzul === undefined || textoQuadroAzul === null || (textoQuadroAzul === '' && !isEditMode)) {
                            textoQuadroAzul = (subtopico.frasesExplicativas && subtopico.frasesExplicativas.length > 0)
                              ? subtopico.frasesExplicativas.map(f => f.frase).filter(Boolean).join(' ')
                              : (subtopico.explicacao || '');
                          }

                          if (!textoQuadroAzul && !isEditMode) return null;

                          return (
                            <div className="camada-1-box bg-blue-950/40 border border-blue-400/50 rounded-xl p-5 space-y-2.5 shadow-sm no-print">
                              <div className="flex items-center justify-between text-blue-400 font-extrabold text-xs tracking-wider uppercase">
                                <span className="flex items-center gap-2">
                                  <Monitor className="w-4 h-4 text-blue-400" />
                                  CAMADA 1 — PROJETOR (TEXTO LITERAL DA REVISTA - IPSIS LITTERIS)
                                </span>
                                {!isEditMode && (
                                  <button
                                    onClick={() => handleRegenerateSection('projetor', topicIdx, subIdx)}
                                    disabled={regeneratingId === `${sectionId}-projetor`}
                                    className="no-print hover:text-white transition-colors cursor-pointer text-xs font-bold"
                                  >
                                    {regeneratingId === `${sectionId}-projetor` ? 'Regenerando...' : '🔄 Regenerar Texto'}
                                  </button>
                                )}
                              </div>
                              <EditableText
                                value={subtopico.projetor ?? textoQuadroAzul ?? ''}
                                onChange={v => updateSubtopicField(topicIdx, subIdx, 'projetor', v)}
                                isEditMode={isEditMode}
                                multiline
                                placeholder="Texto de destaque para o projetor..."
                                className="text-base md:text-lg font-bold text-slate-100 leading-relaxed"
                              />
                            </div>
                          );
                        })()}

                        {/* CAMADA 2 — PROFESSOR (EXPLICAÇÃO CONSTANTE FRASE POR FRASE) */}
                        <div className="space-y-4 pt-1">
                          {/* Explicação Didática Frase por Frase */}
                          <div className="space-y-3">
                            <div className="flex items-center justify-between text-blue-400 font-extrabold text-xs md:text-sm uppercase tracking-wider">
                              <span className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-blue-400" />
                                EXPLICAÇÃO DIDÁTICA DO PROFESSOR (EXPLICAÇÃO LINEAR)
                              </span>
                              {!isEditMode && (
                                <button
                                  onClick={() => handleRegenerateSection('explicacao', topicIdx, subIdx)}
                                  disabled={regeneratingId === `${sectionId}-explicacao`}
                                  className="no-print hover:text-white transition-colors cursor-pointer text-xs font-bold"
                                >
                                  {regeneratingId === `${sectionId}-explicacao` ? 'Regenerando...' : '🔄 Regenerar Explicação'}
                                </button>
                              )}
                            </div>

                            {/* Exibição Linear: usa explicacao de texto corrido.
                                Compatibilidade legada: se existir frasesExplicativas, funde em linear */}
                            {(() => {
                              let textoLinear = subtopico.explicacao;
                              if (textoLinear === undefined || textoLinear === null || (textoLinear === '' && !isEditMode)) {
                                textoLinear = (subtopico.frasesExplicativas && subtopico.frasesExplicativas.length > 0)
                                  ? subtopico.frasesExplicativas
                                      .map(f => {
                                        const label = f.frase ? `"${f.frase}" — ` : '';
                                        return `${label}${f.explicacao}`.trim();
                                      })
                                      .filter(Boolean)
                                      .join('\n\n')
                                  : '';
                              }
                              return (
                                <div className="bg-slate-950 p-5 rounded-xl border border-slate-800">
                                  <EditableText
                                    value={subtopico.explicacao ?? textoLinear ?? ''}
                                    onChange={v => updateSubtopicField(topicIdx, subIdx, 'explicacao', v)}
                                    isEditMode={isEditMode}
                                    multiline
                                    placeholder="Explicação didática linear do professor..."
                                    className="text-sm md:text-base text-slate-200 leading-relaxed font-normal whitespace-pre-line"
                                  />
                                </div>
                              );
                            })()}


                          </div>

                          {/* 2. Textos Bíblicos Relevantes (ARC) */}
                          {(isEditMode || (subtopico.versiculos && subtopico.versiculos.length > 0)) && (
                            <div className="space-y-2">
                              <span className="text-emerald-400 font-extrabold text-xs uppercase block">
                                📖 TEXTOS BÍBLICOS RELEVANTES (ARC)
                              </span>
                              <div className="space-y-2">
                                {(subtopico.versiculos || []).map((v, vIdx) => (
                                  <div key={vIdx} className="bg-emerald-950/20 border border-emerald-500/30 p-3 rounded-xl relative space-y-1.5">
                                    {isEditMode && (
                                      <button
                                        onClick={() => removeVersiculoSubtopic(topicIdx, subIdx, vIdx)}
                                        className="absolute top-2 right-2 p-1 text-red-400 hover:text-red-300"
                                        title="Remover versículo"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                    <EditableText
                                      value={v.reference}
                                      onChange={val => updateVersiculoSubtopic(topicIdx, subIdx, vIdx, 'reference', val)}
                                      isEditMode={isEditMode}
                                      placeholder="Referência Bíblica"
                                      className="font-extrabold text-amber-300 text-xs block mb-1"
                                    />
                                    <EditableText
                                      value={v.text}
                                      onChange={val => updateVersiculoSubtopic(topicIdx, subIdx, vIdx, 'text', val)}
                                      isEditMode={isEditMode}
                                      multiline
                                      placeholder="Texto do versículo..."
                                      className="text-xs text-slate-200 leading-relaxed font-medium italic"
                                    />
                                    {(v.explicacao || isEditMode) && (
                                      <div className="mt-2 pt-2 border-t border-emerald-500/20 bg-emerald-950/40 p-2.5 rounded-lg">
                                        <span className="text-[11px] font-bold text-emerald-400 block mb-0.5">
                                          💡 Breve Explicação do Versículo:
                                        </span>
                                        <EditableText
                                          value={v.explicacao || ''}
                                          onChange={val => updateVersiculoSubtopic(topicIdx, subIdx, vIdx, 'explicacao', val)}
                                          isEditMode={isEditMode}
                                          multiline
                                          placeholder="Breve explicação teológica e didática do versículo para a aula..."
                                          className="text-xs text-emerald-100 leading-snug font-normal"
                                        />
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                              {isEditMode && (
                                <button
                                  onClick={() => addVersiculoSubtopic(topicIdx, subIdx)}
                                  className="w-full py-1.5 px-3 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-all"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>+ Adicionar Versículo</span>
                                </button>
                              )}
                            </div>
                          )}

                          {/* Nota privada — Versículos (só aparece no PDF) */}
                          <div className="flex items-start gap-1.5 mt-1">
                            <span className="text-slate-500 text-xs mt-0.5 shrink-0" title="Nota privada — só aparece no PDF">✏️</span>
                            <textarea
                              value={subtopico.notaVersiculos || ''}
                              onChange={e => updateSubtopicField(topicIdx, subIdx, 'notaVersiculos', e.target.value)}
                              placeholder="Nota pessoal sobre os versículos (só no PDF)..."
                              rows={2}
                              className="w-full bg-yellow-950/20 border border-dashed border-yellow-600/30 rounded-lg px-2.5 py-1.5 text-xs text-yellow-200/70 placeholder-yellow-700/50 resize-none focus:outline-none focus:border-yellow-500/50 transition-colors"
                            />
                          </div>

                          {/* 3. Aplicação Prática & Pentecostal */}
                          {(isEditMode || subtopico.aplicacao) && (
                            <div className="space-y-1.5 bg-gradient-to-r from-amber-950/30 to-purple-950/30 border border-amber-500/30 p-3.5 rounded-xl no-print">
                              <div className="flex items-center justify-between text-amber-400 font-extrabold text-xs uppercase">
                                <span>🔥 APLICAÇÃO PRÁTICA & PENTECOSTAL</span>
                                {!isEditMode && (
                                  <button
                                    onClick={() => handleRegenerateSection('aplicacao', topicIdx, subIdx)}
                                    disabled={regeneratingId === `${sectionId}-aplicacao`}
                                    className="hover:text-white transition-colors cursor-pointer text-[11px]"
                                  >
                                    {regeneratingId === `${sectionId}-aplicacao` ? 'Regenerando...' : '🔄 Regenerar Aplicação'}
                                  </button>
                                )}
                              </div>
                              <EditableText
                                value={subtopico.aplicacao || ''}
                                onChange={v => updateSubtopicField(topicIdx, subIdx, 'aplicacao', v)}
                                isEditMode={isEditMode}
                                multiline
                                placeholder="Aplicação prática para a vida dos alunos..."
                                className="text-xs text-slate-200 leading-relaxed font-semibold"
                              />
                            </div>
                          )}

                          {/* Nota privada — Aplicação Prática (só aparece no PDF) */}
                          <div className="flex items-start gap-1.5 mt-1">
                            <span className="text-slate-500 text-xs mt-0.5 shrink-0" title="Nota privada — só aparece no PDF">✏️</span>
                            <textarea
                              value={subtopico.notaAplicacao || ''}
                              onChange={e => updateSubtopicField(topicIdx, subIdx, 'notaAplicacao', e.target.value)}
                              placeholder="Nota pessoal sobre a aplicação prática (só no PDF)..."
                              rows={2}
                              className="w-full bg-yellow-950/20 border border-dashed border-yellow-600/30 rounded-lg px-2.5 py-1.5 text-xs text-yellow-200/70 placeholder-yellow-700/50 resize-none focus:outline-none focus:border-yellow-500/50 transition-colors"
                            />
                          </div>


                          {/* 5. 🔥 O QUE NÃO PODE SER DITO / CUIDADO DOUTRINÁRIO */}
                          {(isEditMode || subtopico.cuidadoDoutrinario) && (
                            <div className="bg-gradient-to-r from-red-950/40 via-orange-950/30 to-slate-950 border border-red-500/40 p-4 rounded-xl space-y-1 shadow-lg no-print">
                              <span className="text-red-400 font-black text-xs uppercase tracking-wider block">
                                🔥 O QUE NÃO PODE SER DITO (CUIDADO DOUTRINÁRIO)
                              </span>
                              <EditableText
                                value={subtopico.cuidadoDoutrinario || ''}
                                onChange={v => updateSubtopicField(topicIdx, subIdx, 'cuidadoDoutrinario', v)}
                                isEditMode={isEditMode}
                                multiline
                                placeholder="Alerta ou cuidado doutrinário..."
                                className="text-xs font-bold text-red-200 leading-relaxed"
                              />
                            </div>
                          )}

                          {/* 6. 🏛️ VOCABULÁRIO EXEGÉTICO NO GREGO / HEBRAICO */}
                          {subtopico.palavrasOriginais && subtopico.palavrasOriginais.length > 0 && (
                            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 no-print">
                              <span className="text-cyan-400 font-black text-xs uppercase tracking-wider block">
                                🏛️ EXEGESE BÍBLICA: VOCABULÁRIO NO ORIGINAL ({subtopico.palavrasOriginais[0].idioma})
                              </span>
                              <div className="space-y-2">
                                {subtopico.palavrasOriginais.map((p, pIdx) => (
                                  <div key={pIdx} className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                                    <div className="flex items-center gap-2 text-xs font-bold text-amber-300 mb-1">
                                      <span className="text-sm font-mono">{p.termo}</span>
                                      <span className="text-slate-400">({p.transliteracao})</span>
                                      <span className="bg-cyan-950 text-cyan-400 px-2 py-0.5 rounded text-[10px]">{p.idioma}</span>
                                    </div>
                                    <p className="text-xs text-slate-300 font-medium"><strong>Significado:</strong> {p.significado}</p>
                                    <p className="text-xs text-slate-400 mt-1 italic">{p.explicacao}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 7. 🖼️ PROMPT VISUAL 16:9 PARA CANVA / MIDJOURNEY */}
                          {(subtopico.imagePrompt || isEditMode) && (
                            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1.5 no-print">
                              <div className="flex items-center justify-between text-cyan-400 font-extrabold text-[11px] uppercase">
                                <span className="flex items-center gap-1.5">
                                  <span>🖼️ PROMPT VISUAL 16:9 (CANVA / MIDJOURNEY)</span>
                                </span>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(subtopico.imagePrompt || '');
                                    alert('Prompt copiado para a área de transferência!');
                                  }}
                                  className="text-slate-400 hover:text-cyan-300 text-[10px] bg-slate-800 px-2 py-0.5 rounded cursor-pointer transition-colors"
                                >
                                  📋 Copiar Prompt
                                </button>
                              </div>
                              <EditableText
                                value={subtopico.imagePrompt || ''}
                                onChange={v => updateSubtopicField(topicIdx, subIdx, 'imagePrompt', v)}
                                isEditMode={isEditMode}
                                multiline
                                placeholder="Prompt visual 16:9 cinematográfico para este subtópico..."
                                className="text-[11px] text-slate-300 font-mono italic bg-slate-900/90 p-2.5 rounded-lg border border-slate-800/80 block w-full"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {isEditMode && (
                    <button
                      onClick={() => addSubtopicToTopic(topicIdx)}
                      className="w-full py-3 px-4 bg-orange-600/20 hover:bg-orange-600/30 text-orange-300 border-2 border-dashed border-orange-500/50 rounded-2xl font-black text-sm flex items-center justify-center gap-2 cursor-pointer transition-all shadow-md"
                    >
                      <Plus className="w-4 h-4" />
                      <span>+ Adicionar Novo Subtópico ao {topico.number}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}

          {isEditMode && (
            <button
              onClick={addNewTopic}
              className="w-full py-4 px-6 bg-gradient-to-r from-amber-600/20 to-orange-600/20 hover:from-amber-600/30 hover:to-orange-600/30 text-amber-300 border-2 border-dashed border-amber-500/60 rounded-3xl font-black text-base flex items-center justify-center gap-2 cursor-pointer transition-all shadow-xl"
            >
              <Plus className="w-5 h-5" />
              <span>+ Adicionar Novo Tópico (Tópico {lesson.topicos.length + 1})</span>
            </button>
          )}

          {/* CONCLUSÃO DA AULA */}
          <div className="bg-slate-900 border border-purple-500/40 p-6 rounded-3xl shadow-xl space-y-4">
            <h2 className="text-xl md:text-2xl font-black text-purple-300 flex items-center gap-2 border-b border-slate-800 pb-3">
              <Bookmark className="w-5 h-5 text-purple-400" />
              <span>CONCLUSÃO & APLICAÇÃO FINAL DA LIÇÃO</span>
            </h2>

            <div className="space-y-3">
              <EditableText
                value={lesson.conclusao.takeaway}
                onChange={v => updateConclusaoField('takeaway', v)}
                isEditMode={isEditMode}
                multiline
                placeholder="Síntese da conclusão..."
                className="text-sm md:text-base font-extrabold text-white leading-relaxed"
              />

              <ul className="space-y-2 text-xs md:text-sm text-slate-200 font-medium">
                {(lesson.conclusao.bulletPoints || []).map((pt, idx) => (
                  <li key={idx} className="flex items-center gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <span className="text-purple-400 font-bold shrink-0">•</span>
                    <div className="flex-1">
                      <EditableText
                        value={pt}
                        onChange={v => updateConclusaoBullet(idx, v)}
                        isEditMode={isEditMode}
                        placeholder="Ponto principal..."
                      />
                    </div>
                    {isEditMode && (
                      <button
                        onClick={() => removeConclusaoBullet(idx)}
                        className="p-1 text-red-400 hover:text-red-300 shrink-0"
                        title="Remover ponto"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {isEditMode && (
                <button
                  onClick={addConclusaoBullet}
                  className="w-full py-2 px-3 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Adicionar Ponto Chave na Conclusão</span>
                </button>
              )}

              {(isEditMode || lesson.conclusao.finalPrayer) && (
                <div className="bg-purple-950/40 border border-purple-500/30 p-4 rounded-2xl text-xs md:text-sm text-purple-200 font-bold space-y-1 mt-3">
                  <span className="text-amber-300 uppercase tracking-wide block font-black">🙏 SUGESTÃO DE ORAÇÃO FINAL COM A CLASSE:</span>
                  <EditableText
                    value={lesson.conclusao.finalPrayer || ''}
                    onChange={v => updateConclusaoField('finalPrayer', v)}
                    isEditMode={isEditMode}
                    multiline
                    placeholder="Sugestão de oração final..."
                    className="italic text-purple-100"
                  />
                </div>
              )}
            </div>
          </div>

          {/* SLIDES EXTRAS ADICIONADOS PELO PROFESSOR */}
          {(lesson.extraSlides && lesson.extraSlides.length > 0) && (
            <div className="bg-slate-900 border border-amber-500/40 p-6 rounded-3xl shadow-xl space-y-4">
              <h2 className="text-xl md:text-2xl font-black text-amber-300 flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                  <span>SLIDES EXTRAS PERSONALIZADOS ({lesson.extraSlides.length})</span>
                </div>
                <span className="text-xs font-bold text-amber-400/80 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/30">
                  Visíveis no Projetor e Celular
                </span>
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {lesson.extraSlides.map((slide, sIdx) => (
                  <div key={slide.id || sIdx} className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        {slide.badgeText || `Slide Extra ${sIdx + 1}`}
                      </span>
                      {slide.reference && (
                        <span className="text-[10px] font-bold text-slate-400">
                          {slide.reference}
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-bold text-white">
                      {slide.title}
                    </h3>
                    {slide.subtitle && (
                      <p className="text-xs text-slate-400">{slide.subtitle}</p>
                    )}
                    {slide.projetorText && (
                      <p className="text-xs md:text-sm text-slate-200 leading-relaxed whitespace-pre-line border-t border-slate-800/80 pt-2">
                        {slide.projetorText}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* 🖥️ ABA 2: VISÃO DO PROJETOR (TELA 16:9 LIMPA PARA OS ALUNOS) */}
      {/* ========================================================= */}
      {activeTab === 'projetor' && (
        <div className="space-y-5">
          {/* Barra de Ajustes Finos do Slide (Fontes, Larguras e Posicionamentos) */}
          <div className="bg-slate-900 p-2.5 rounded-2xl border border-slate-700/80 shadow-lg">

          {/* ── CONTROLES SEPARADOS DE TAMANHO DE FONTE: TÍTULO vs TEXTO ── */}
          <div className="flex items-center gap-2 flex-wrap">
                {/* Fonte do Título */}
                <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-amber-500/40 shadow-sm min-h-[40px]" title="Ajustar tamanho da fonte do TÍTULO deste slide">
                  <Type className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-xs font-black text-amber-300 uppercase tracking-wider">Título:</span>
                  <button
                    onClick={() => {
                      const next = Math.max(0.5, Math.round((currentTitleScale - 0.05) * 100) / 100);
                      setSingleTitleScale(projectorIndex, next);
                    }}
                    disabled={currentTitleScale <= 0.5}
                    className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 disabled:opacity-30 font-black text-sm cursor-pointer transition-all active:scale-90"
                    title="Diminuir fonte do título (A-)"
                  >
                    <ZoomOut className="w-4 h-4 text-amber-400" />
                  </button>
                  <span className={`text-sm font-black px-1 min-w-[42px] text-center font-mono ${isCurrentTitleCustom ? 'text-yellow-300 font-black' : 'text-amber-300'}`}>
                    {Math.round(currentTitleScale * 100)}%
                  </span>
                  <button
                    onClick={() => {
                      const next = Math.min(3.0, Math.round((currentTitleScale + 0.05) * 100) / 100);
                      setSingleTitleScale(projectorIndex, next);
                    }}
                    disabled={currentTitleScale >= 3.0}
                    className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 disabled:opacity-30 font-black text-sm cursor-pointer transition-all active:scale-90"
                    title="Aumentar fonte do título (A+)"
                  >
                    <ZoomIn className="w-4 h-4 text-amber-400" />
                  </button>
                  {isCurrentTitleCustom && (
                    <button
                      onClick={() => setSingleTitleScale(projectorIndex, null)}
                      className="text-xs font-black text-amber-400 hover:text-white px-2 py-1 rounded-lg bg-amber-950 border border-amber-500/40 transition-colors cursor-pointer"
                      title={`Restaurar tamanho padrão do título (${Math.round(defaultTitleScale * 100)}%)`}
                    >
                      ↺ {Math.round(defaultTitleScale * 100)}%
                    </button>
                  )}
                </div>

                {/* Fonte do Texto */}
                <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-cyan-500/40 shadow-sm min-h-[40px]" title="Ajustar tamanho da fonte do TEXTO / CORPO deste slide">
                  <Type className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span className="text-xs font-black text-cyan-300 uppercase tracking-wider">Texto:</span>
                  <button
                    onClick={() => {
                      const next = Math.max(0.5, Math.round((currentBodyScale - 0.05) * 100) / 100);
                      setSingleBodyScale(projectorIndex, next);
                    }}
                    disabled={currentBodyScale <= 0.5}
                    className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 disabled:opacity-30 font-black text-sm cursor-pointer transition-all active:scale-90"
                    title="Diminuir fonte do texto (A-)"
                  >
                    <ZoomOut className="w-4 h-4 text-cyan-400" />
                  </button>
                  <span className={`text-sm font-black px-1 min-w-[42px] text-center font-mono ${isCurrentBodyCustom ? 'text-cyan-200 font-black' : 'text-cyan-300'}`}>
                    {Math.round(currentBodyScale * 100)}%
                  </span>
                  <button
                    onClick={() => {
                      const next = Math.min(3.0, Math.round((currentBodyScale + 0.05) * 100) / 100);
                      setSingleBodyScale(projectorIndex, next);
                    }}
                    disabled={currentBodyScale >= 3.0}
                    className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 disabled:opacity-30 font-black text-sm cursor-pointer transition-all active:scale-90"
                    title="Aumentar fonte do texto (A+)"
                  >
                    <ZoomIn className="w-4 h-4 text-cyan-400" />
                  </button>
                  {isCurrentBodyCustom && (
                    <button
                      onClick={() => setSingleBodyScale(projectorIndex, null)}
                      className="text-xs font-black text-cyan-400 hover:text-white px-2 py-1 rounded-lg bg-cyan-950 border border-cyan-500/40 transition-colors cursor-pointer"
                      title={`Restaurar tamanho padrão do texto (${Math.round(defaultBodyScale * 100)}%)`}
                    >
                      ↺ {Math.round(defaultBodyScale * 100)}%
                    </button>
                  )}
                </div>

                {/* Largura da Caixa de Texto */}
                <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-sky-500/40 shadow-sm min-h-[40px]" title="Ajustar largura da caixa de texto (permite colocar texto de um lado e imagem do outro)">
                  <Columns className="w-4 h-4 text-sky-400 shrink-0" />
                  <span className="text-xs font-black text-sky-300 uppercase tracking-wider">Largura:</span>
                  <button
                    onClick={() => {
                      const cur = slideBodyWidths[projectorIndex] ?? 100;
                      setSingleBodyWidth(projectorIndex, Math.max(30, cur - 10));
                    }}
                    disabled={(slideBodyWidths[projectorIndex] ?? 100) <= 30}
                    className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 disabled:opacity-30 font-black text-sm cursor-pointer transition-all active:scale-90"
                    title="Diminuir largura do texto (-10%)"
                  >
                    <ZoomOut className="w-4 h-4 text-sky-400" />
                  </button>
                  <span className={`text-sm font-black px-1 min-w-[42px] text-center font-mono ${(slideBodyWidths[projectorIndex] ?? 100) < 100 ? 'text-sky-200 font-black' : 'text-sky-300'}`}>
                    {slideBodyWidths[projectorIndex] ?? 100}%
                  </span>
                  <button
                    onClick={() => {
                      const cur = slideBodyWidths[projectorIndex] ?? 100;
                      setSingleBodyWidth(projectorIndex, Math.min(100, cur + 10));
                    }}
                    disabled={(slideBodyWidths[projectorIndex] ?? 100) >= 100}
                    className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 disabled:opacity-30 font-black text-sm cursor-pointer transition-all active:scale-90"
                    title="Aumentar largura do texto (+10%)"
                  >
                    <ZoomIn className="w-4 h-4 text-sky-400" />
                  </button>
                  {(slideBodyWidths[projectorIndex] ?? 100) < 100 && (
                    <button
                      onClick={resetSlideBodyWidth}
                      className="text-xs font-black text-sky-400 hover:text-white px-2 py-1 rounded-lg bg-sky-950 border border-sky-500/40 transition-colors cursor-pointer"
                      title="Restaurar largura inteira (100%)"
                    >
                      ↺ 100%
                    </button>
                  )}
                </div>

                {/* Atalho Rápido: Lado a Lado (Texto de um lado, imagem do outro) */}
                <button
                  onClick={toggleSideBySideLayout}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-sky-900/60 to-purple-900/60 hover:from-sky-800/80 hover:to-purple-800/80 text-sky-200 border border-sky-400/50 text-xs md:text-sm font-black cursor-pointer transition-all shadow-sm min-h-[40px] active:scale-95"
                  title="Alternar layout inteligente: divide o slide com Texto de um lado e Imagem do outro"
                >
                  <Columns className="w-4 h-4 text-sky-300" />
                  <span>🌓 Lado a Lado</span>
                </button>

                {/* Atalho Rápido: Linhas Guia H / V */}
                <button
                  onClick={toggleAlignmentGuides}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs md:text-sm font-black cursor-pointer transition-all shadow-sm min-h-[40px] border active:scale-95 ${
                    showAlignmentGuides
                      ? 'bg-cyan-600 hover:bg-cyan-500 text-white border-cyan-300 ring-2 ring-cyan-400/50 shadow-cyan-600/30'
                      : 'bg-slate-900 hover:bg-slate-800 text-cyan-300 border-cyan-500/40'
                  }`}
                  title="Exibir réguas e linhas-guia na horizontal e vertical para posicionar e alinhar textos e títulos"
                >
                  <Crosshair className="w-4 h-4 text-cyan-300" />
                  <span>{showAlignmentGuides ? '📐 Ocultar Guias' : '📐 Guias H/V'}</span>
                </button>

                {/* Redimensionamento e Ajuste da Imagem deste Slide */}
                {(projectorSlideImages[projectorIndex] || currentProjectorItem?.imageUrl) && (
                  <>
                    <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-purple-500/40 shadow-sm min-h-[40px]" title="Ajustar tamanho da imagem deste slide (ou arraste as alças nos 4 cantos no modo 'Mover')">
                      <ImageIcon className="w-4 h-4 text-purple-400 shrink-0" />
                      <span className="text-xs font-black text-purple-300 uppercase tracking-wider">Imagem:</span>
                      <button
                        onClick={() => {
                          const next = Math.max(0.2, Math.round((imageScale - 0.05) * 100) / 100);
                          setSingleImageScale(projectorIndex, next);
                        }}
                        disabled={imageScale <= 0.2}
                        className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 disabled:opacity-30 font-black text-sm cursor-pointer transition-all active:scale-90"
                        title="Diminuir imagem (-)"
                      >
                        <ZoomOut className="w-4 h-4 text-purple-400" />
                      </button>
                      <span className={`text-sm font-black px-1 min-w-[42px] text-center font-mono ${isImageScaled ? 'text-purple-200 font-black' : 'text-purple-300'}`}>
                        {Math.round(imageScale * 100)}%
                      </span>
                      <button
                        onClick={() => {
                          const next = Math.min(3.0, Math.round((imageScale + 0.05) * 100) / 100);
                          setSingleImageScale(projectorIndex, next);
                        }}
                        disabled={imageScale >= 3.0}
                        className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 disabled:opacity-30 font-black text-sm cursor-pointer transition-all active:scale-90"
                        title="Aumentar imagem (+)"
                      >
                        <ZoomIn className="w-4 h-4 text-purple-400" />
                      </button>
                      {isImageScaled && (
                        <button
                          onClick={resetSlideImageScale}
                          className="text-xs font-black text-purple-400 hover:text-white px-2 py-1 rounded-lg bg-purple-950 border border-purple-500/40 transition-colors cursor-pointer"
                          title="Restaurar tamanho original (100%)"
                        >
                          ↺ 100%
                        </button>
                      )}
                    </div>

                    <button
                      onClick={() => toggleImageFit(projectorIndex)}
                      className={`px-3.5 py-2 rounded-xl text-xs md:text-sm font-black transition-all flex items-center gap-1.5 cursor-pointer border min-h-[40px] active:scale-95 ${
                        imageFit === 'contain'
                          ? 'bg-purple-900/60 text-purple-200 border-purple-400 shadow-sm'
                          : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                      }`}
                      title="Alternar entre Preencher o slide (Cover) ou Ajustar inteira sem cortar (Contain)"
                    >
                      {imageFit === 'contain' ? '🔍 Ajustar Inteira' : '🖼️ Preencher'}
                    </button>
                  </>
                )}

                {/* Reset de Posições e Enquadramentos (quando arrastado livremente) */}
                {(isTitleMoved || isBodyMoved || isImageMoved || isImageWidthCustom || isImageHeightCustom || isImageCropCustom) && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {isTitleMoved && (
                      <button
                        onClick={() => resetSlidePosition('title')}
                        className="text-xs font-black text-amber-300 hover:text-white px-3 py-1.5 rounded-xl bg-amber-950/80 border border-amber-500/40 cursor-pointer min-h-[38px] active:scale-95"
                        title="Restaurar posição original do título"
                      >
                        ↺ Pos. Título
                      </button>
                    )}
                    {isBodyMoved && (
                      <button
                        onClick={() => resetSlidePosition('body')}
                        className="text-xs font-black text-cyan-300 hover:text-white px-3 py-1.5 rounded-xl bg-cyan-950/80 border border-cyan-500/40 cursor-pointer min-h-[38px] active:scale-95"
                        title="Restaurar posição original do texto"
                      >
                        ↺ Pos. Texto
                      </button>
                    )}
                    {isImageMoved && (
                      <button
                        onClick={() => resetSlidePosition('image')}
                        className="text-xs font-black text-purple-300 hover:text-white px-3 py-1.5 rounded-xl bg-purple-950/80 border border-purple-500/40 cursor-pointer min-h-[38px] active:scale-95"
                        title="Restaurar posição original da imagem"
                      >
                        ↺ Pos. Img
                      </button>
                    )}
                    {(isImageWidthCustom || isImageHeightCustom) && (
                      <button
                        onClick={() => {
                          resetSlideImageWidth();
                          resetSlideImageHeight();
                        }}
                        className="text-xs font-black text-purple-300 hover:text-white px-3 py-1.5 rounded-xl bg-purple-950/80 border border-purple-500/40 cursor-pointer min-h-[38px] active:scale-95"
                        title="Restaurar tamanho padrão do quadro da imagem"
                      >
                        ↺ Quadro
                      </button>
                    )}
                    {isImageCropCustom && (
                      <button
                        onClick={resetSlideImageCrop}
                        className="text-xs font-black text-cyan-300 hover:text-white px-3 py-1.5 rounded-xl bg-cyan-950/80 border border-cyan-500/40 cursor-pointer min-h-[38px] active:scale-95"
                        title="Restaurar enquadramento e corte original da imagem"
                      >
                        ↺ Recorte
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

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
                <span className="text-amber-300 font-extrabold text-xs uppercase flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-amber-400" />
                  <span>✏️ Editor de Texto do Slide ({projectorIndex + 1} / {projectorItems.length}) — {currentProjectorItem.title}</span>
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




          {/* PALCO DO PROJETOR 16:9 GIGANTE LIMPO DEDICADO AOS ALUNOS (MODELO OFICIAL EXATO) */}
          <div
            ref={projectorStageRef}
            className={`slide-stage-wrapper ${isLayoutEditMode ? 'layout-mode' : ''} rounded-3xl overflow-hidden shadow-2xl border border-slate-300 relative min-h-[520px] text-slate-900 flex flex-col justify-between p-6 pt-3 pb-4`}
            style={customBg ? { backgroundImage: `url(${customBg})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: 'transparent' } : { backgroundColor: 'white' }}
            onMouseUp={handleSlideMouseUp}
            onTouchEnd={handleSlideMouseUp}
          >



            {/* Toolbar de Destaque de Texto (aparece ao selecionar texto no slide) */}
            {hlToolbar && (
              <TextHighlightToolbar
                x={hlToolbar.x}
                y={hlToolbar.y}
                onApply={applyHighlight}
                onRemove={removeHighlight}
                onClose={() => { setHlToolbar(null); window.getSelection()?.removeAllRanges(); }}
              />
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

            {/* Bloco Central do Slide */}
            {(() => {
              // Função auxiliar para renderizar o recipiente da imagem com recorte fluido estilo Canva
              const renderSlideImageElement = () => {
                const curSlideImg = projectorSlideImages[projectorIndex] || currentProjectorItem?.imageUrl;
                if (!curSlideImg) return null;

                const curCrop = slideImageCrops[projectorIndex] ?? { panX: 0, panY: 0, zoom: 1.0 };

                // Zoom com scroll do mouse no modo Canva
                const handleWheelZoom = (e: React.WheelEvent) => {
                  if (!isCanvaCropping) return;
                  e.stopPropagation();
                  e.preventDefault();
                  const delta = e.deltaY < 0 ? 0.05 : -0.05;
                  const nextZ = Math.min(3.0, Math.max(1.0, Math.round((curCrop.zoom + delta) * 100) / 100));
                  setSingleImageCrop(projectorIndex, { ...curCrop, zoom: nextZ });
                };

                return (
                  <>
                    {/* Ghost unclipped da imagem no modo Canva mostrando o que está além do quadro */}
                    {isCanvaCropping && (
                      <div
                        className="slide-image-ghost absolute pointer-events-none select-none z-10 transition-opacity duration-150"
                        style={{
                          ...makeDragStyle(imagePos, 'image'),
                          opacity: 0.3,
                          filter: 'brightness(0.9) grayscale(15%)',
                        }}
                      >
                        <div className="w-full h-full flex items-center justify-center overflow-visible">
                          <img
                            src={curSlideImg}
                            alt="Visualização estendida da foto"
                            draggable={false}
                            className={`w-full h-full ${imageFit === 'contain' ? 'object-contain' : 'object-cover'} pointer-events-none select-none`}
                            style={{
                              transform: `scale(${curCrop.zoom}) translate(${curCrop.panX}%, ${curCrop.panY}%)`,
                              transformOrigin: 'center center',
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Recipiente / Quadro da Imagem */}
                    <div
                      className={`slide-image-container absolute select-none transition-all duration-150 group ${
                        isCanvaCropping ? 'z-40 ring-4 ring-cyan-400/80 rounded-2xl shadow-2xl' : 'z-0'
                      }`}
                      style={{
                        ...makeDragStyle(imagePos, 'image'),
                        opacity: slideImageOpacity / 100,
                        pointerEvents: (isLayoutEditMode || isCanvaCropping) ? 'auto' : 'none',
                      }}
                      onMouseDown={!isCanvaCropping && isLayoutEditMode ? (e) => handleElementDragStart(e, 'image') : undefined}
                      onTouchStart={!isCanvaCropping && isLayoutEditMode ? (e) => handleElementDragStart(e, 'image') : undefined}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setIsCanvaCropping(true);
                      }}
                      onWheel={handleWheelZoom}
                    >
                      {/* Quadro delimitador com corte interno da imagem */}
                      <div
                        className={`slide-image-frame w-full h-full relative rounded-2xl overflow-hidden flex items-center justify-center transition-all ${
                          isCanvaCropping
                            ? 'cursor-grab active:cursor-grabbing border-2 border-cyan-300 bg-black/20'
                            : imageFit === 'contain' ? '' : 'rounded-2xl'
                        }`}
                        onMouseDown={isCanvaCropping ? handleCropPanStart : undefined}
                        onTouchStart={isCanvaCropping ? handleCropPanStart : undefined}
                        title={isCanvaCropping ? 'Arraste a foto para enquadrar ou use o scroll para zoom' : undefined}
                      >
                        <img
                          src={curSlideImg}
                          alt="Ilustração do Slide"
                          draggable={false}
                          className={`${
                            imageFit === 'contain' ? 'max-w-full max-h-full object-contain rounded-2xl' : 'w-full h-full object-cover'
                          } pointer-events-none select-none transition-transform duration-75`}
                          style={{
                            transform: `scale(${curCrop.zoom}) translate(${curCrop.panX}%, ${curCrop.panY}%)`,
                            transformOrigin: 'center center',
                          }}
                        />

                        {/* Grade 3x3 e Cantoneiras do Modo Canva */}
                        {isCanvaCropping && (
                          <div className="absolute inset-0 pointer-events-none z-20">
                            {/* Linhas verticais */}
                            <div className="absolute top-0 bottom-0 left-1/3 w-[1.5px] bg-white/45 shadow-sm" />
                            <div className="absolute top-0 bottom-0 left-2/3 w-[1.5px] bg-white/45 shadow-sm" />
                            {/* Linhas horizontais */}
                            <div className="absolute left-0 right-0 top-1/3 h-[1.5px] bg-white/45 shadow-sm" />
                            <div className="absolute left-0 right-0 top-2/3 h-[1.5px] bg-white/45 shadow-sm" />

                            {/* Cantoneiras L do Canva */}
                            <div className="absolute top-1 left-1 w-4 h-4 border-t-2 border-l-2 border-white drop-shadow-md rounded-tl-sm" />
                            <div className="absolute top-1 right-1 w-4 h-4 border-t-2 border-r-2 border-white drop-shadow-md rounded-tr-sm" />
                            <div className="absolute bottom-1 left-1 w-4 h-4 border-b-2 border-l-2 border-white drop-shadow-md rounded-bl-sm" />
                            <div className="absolute bottom-1 right-1 w-4 h-4 border-b-2 border-r-2 border-white drop-shadow-md rounded-br-sm" />

                            {/* Dica flutuante */}
                            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-30 bg-slate-950/85 text-cyan-200 border border-cyan-400/40 px-3 py-1 rounded-full text-[10px] font-black shadow-xl backdrop-blur-md pointer-events-none flex items-center gap-1.5 whitespace-nowrap">
                              <span>✋ Arraste a foto para enquadrar</span>
                              <span className="opacity-50">•</span>
                              <span>Scroll do mouse para zoom</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Botões de Ação Rápida no Modo Mover */}
                      {isLayoutEditMode && !isCanvaCropping && (
                        <div className="absolute top-2 right-2 z-50 pointer-events-auto flex items-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              occupyFullArea();
                            }}
                            className="bg-emerald-700/90 hover:bg-emerald-600 text-white px-2.5 py-1 rounded-xl text-[10px] font-black border border-emerald-400/50 shadow-xl flex items-center gap-1 backdrop-blur-md cursor-pointer transition-all hover:scale-105"
                            title="Encaixar na área branca abaixo do cabeçalho"
                          >
                            <span>📐 Área Branca</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsCanvaCropping(true);
                            }}
                            className="bg-slate-950/90 hover:bg-cyan-600 text-cyan-200 hover:text-white px-2.5 py-1 rounded-xl text-[10px] font-black border border-cyan-400/50 shadow-xl flex items-center gap-1 backdrop-blur-md cursor-pointer transition-all hover:scale-105"
                            title="Recorte Fluido Estilo Canva (reposicionar e dar zoom diretamente no slide)"
                          >
                            <Crop className="w-3 h-3 text-cyan-300" />
                            <span>✂️ Recortar (Canva)</span>
                          </button>
                        </div>
                      )}

                      {/* No modo "Mover": Badges e Alças do Recipiente */}
                      {isLayoutEditMode && !isCanvaCropping && (
                        <>
                          {/* Badge superior */}
                          <div
                            className="absolute -top-7 left-1/2 -translate-x-1/2 text-[9px] font-black px-2.5 py-0.5 rounded-full z-50 pointer-events-none shadow-md flex items-center gap-1.5 whitespace-nowrap"
                            style={{
                              backgroundColor: '#8b5cf6',
                              color: '#ffffff',
                              transform: `translateX(-50%) scale(${Math.max(0.65, Math.min(1.3, 1 / imageScale))})`,
                              transformOrigin: 'bottom center',
                            }}
                          >
                            <span>🖼️ Quadro ({imageWidth}% × {imageHeight}%) • Zoom {Math.round(imageScale * 100)}%</span>
                            <span className="opacity-80">• Duplo clique para Recorte Canva</span>
                          </div>

                          {/* Alça Superior para Redimensionar Altura do Recipiente (Topo) */}
                          <div
                            onMouseDown={(e) => handleImageHeightResizeStart(e, 'top')}
                            onTouchStart={(e) => handleImageHeightResizeStart(e, 'top')}
                            onDoubleClick={(e) => { e.stopPropagation(); resetSlideImageHeight(); }}
                            className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 h-4 w-12 bg-white border-2 border-purple-500 rounded-full shadow-lg z-50 cursor-ns-resize hover:scale-125 transition-transform flex items-center justify-center group pointer-events-auto"
                            title="Arrastar para ajustar limite superior da foto (altura) • Duplo clique para padrão"
                          >
                            <div className="h-0.5 w-5 bg-purple-600 rounded-full" />
                          </div>

                          {/* Alça Inferior para Redimensionar Altura do Recipiente (Base) */}
                          <div
                            onMouseDown={(e) => handleImageHeightResizeStart(e, 'bottom')}
                            onTouchStart={(e) => handleImageHeightResizeStart(e, 'bottom')}
                            onDoubleClick={(e) => { e.stopPropagation(); resetSlideImageHeight(); }}
                            className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 h-4 w-12 bg-white border-2 border-purple-500 rounded-full shadow-lg z-50 cursor-ns-resize hover:scale-125 transition-transform flex items-center justify-center group pointer-events-auto"
                            title="Arrastar para ajustar limite inferior da foto (altura) • Duplo clique para padrão"
                          >
                            <div className="h-0.5 w-5 bg-purple-600 rounded-full" />
                          </div>

                          {/* Alça Esquerda para Redimensionar Largura do Recipiente */}
                          <div
                            onMouseDown={(e) => handleImageWidthResizeStart(e, 'left')}
                            onTouchStart={(e) => handleImageWidthResizeStart(e, 'left')}
                            onDoubleClick={(e) => { e.stopPropagation(); resetSlideImageWidth(); }}
                            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-12 bg-white border-2 border-purple-500 rounded-full shadow-lg z-50 cursor-ew-resize hover:scale-125 transition-transform flex items-center justify-center group pointer-events-auto"
                            title="Arrastar para ajustar largura do quadro • Duplo clique para padrão"
                          >
                            <div className="w-0.5 h-5 bg-purple-600 rounded-full" />
                          </div>

                          {/* Alça Direita para Redimensionar Largura do Recipiente */}
                          <div
                            onMouseDown={(e) => handleImageWidthResizeStart(e, 'right')}
                            onTouchStart={(e) => handleImageWidthResizeStart(e, 'right')}
                            onDoubleClick={(e) => { e.stopPropagation(); resetSlideImageWidth(); }}
                            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-4 h-12 bg-white border-2 border-purple-500 rounded-full shadow-lg z-50 cursor-ew-resize hover:scale-125 transition-transform flex items-center justify-center group pointer-events-auto"
                            title="Arrastar para ajustar largura do quadro • Duplo clique para padrão"
                          >
                            <div className="w-0.5 h-5 bg-purple-600 rounded-full" />
                          </div>

                          {/* Alça Noroeste (Top-Left) */}
                          <div
                            onMouseDown={(e) => handleImageResizeStart(e, 'nw')}
                            onTouchStart={(e) => handleImageResizeStart(e, 'nw')}
                            onDoubleClick={(e) => { e.stopPropagation(); setSingleImageScale(projectorIndex, 1.0); }}
                            className="absolute top-0 left-0 w-4 h-4 bg-white border-2 border-purple-600 rounded-full shadow-lg z-50 cursor-nwse-resize hover:scale-125 transition-transform pointer-events-auto"
                            style={{
                              transform: `translate(-50%, -50%) scale(${Math.max(0.65, Math.min(1.4, 1 / imageScale))})`,
                            }}
                            title="Arrastar para redimensionar • Duplo clique para 100%"
                          />

                          {/* Alça Nordeste (Top-Right) */}
                          <div
                            onMouseDown={(e) => handleImageResizeStart(e, 'ne')}
                            onTouchStart={(e) => handleImageResizeStart(e, 'ne')}
                            onDoubleClick={(e) => { e.stopPropagation(); setSingleImageScale(projectorIndex, 1.0); }}
                            className="absolute top-0 right-0 w-4 h-4 bg-white border-2 border-purple-600 rounded-full shadow-lg z-50 cursor-nesw-resize hover:scale-125 transition-transform pointer-events-auto"
                            style={{
                              transform: `translate(50%, -50%) scale(${Math.max(0.65, Math.min(1.4, 1 / imageScale))})`,
                            }}
                            title="Arrastar para redimensionar • Duplo clique para 100%"
                          />

                          {/* Alça Sudoeste (Bottom-Left) */}
                          <div
                            onMouseDown={(e) => handleImageResizeStart(e, 'sw')}
                            onTouchStart={(e) => handleImageResizeStart(e, 'sw')}
                            onDoubleClick={(e) => { e.stopPropagation(); setSingleImageScale(projectorIndex, 1.0); }}
                            className="absolute bottom-0 left-0 w-4 h-4 bg-white border-2 border-purple-600 rounded-full shadow-lg z-50 cursor-nesw-resize hover:scale-125 transition-transform pointer-events-auto"
                            style={{
                              transform: `translate(-50%, 50%) scale(${Math.max(0.65, Math.min(1.4, 1 / imageScale))})`,
                            }}
                            title="Arrastar para redimensionar • Duplo clique para 100%"
                          />

                          {/* Alça Sudeste (Bottom-Right) */}
                          <div
                            onMouseDown={(e) => handleImageResizeStart(e, 'se')}
                            onTouchStart={(e) => handleImageResizeStart(e, 'se')}
                            onDoubleClick={(e) => { e.stopPropagation(); setSingleImageScale(projectorIndex, 1.0); }}
                            className="absolute bottom-0 right-0 w-4 h-4 bg-white border-2 border-purple-600 rounded-full shadow-lg z-50 cursor-nwse-resize hover:scale-125 transition-transform pointer-events-auto"
                            style={{
                              transform: `translate(50%, 50%) scale(${Math.max(0.65, Math.min(1.4, 1 / imageScale))})`,
                            }}
                            title="Arrastar para redimensionar • Duplo clique para 100%"
                          />
                        </>
                      )}
                    </div>
                  </>
                );
              };

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

              // 1. CAPA DA LIÇÃO (SLIDE 1)
              if (currentProjectorItem.type === 'cover') {
                const coverBadge = currentProjectorItem.badgeText || lesson.metadata.lessonNumber || 'LIÇÃO 10';
                return (
                  <div className="relative z-10 w-full h-full max-w-full px-3 md:px-6 mx-auto flex flex-col justify-between items-center my-auto py-2 font-gotham" style={{ zoom: currentSlideScale } as React.CSSProperties}>
                    {renderSlideImageElement()}

                    {/* ── CAPA: TÍTULO (ARRASTÁVEL) ── */}
                    <div
                      style={makeDragStyle(titlePos, 'title')}
                      onMouseDown={isLayoutEditMode ? (e) => handleElementDragStart(e, 'title') : undefined}
                      onTouchStart={isLayoutEditMode ? (e) => handleElementDragStart(e, 'title') : undefined}
                      className="w-full shrink-0 relative"
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
                      <div className={`text-layer w-full relative z-30 flex flex-col items-center justify-center text-center px-6 py-4 mt-12 md:mt-16 space-y-4 my-auto`}>
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
                    </div>{/* /body drag wrapper */}

                    <div className="w-full shrink-0 h-8" />
                  </div>
                );
              }

              // 2. SLIDE EXTRA PERSONALIZADO
              if (currentProjectorItem.type === 'extra') {
                return (
                  <div className="relative z-10 w-full h-full max-w-full px-3 md:px-6 mx-auto flex flex-col justify-between items-center my-auto py-2 font-gotham" style={{ zoom: currentSlideScale } as React.CSSProperties}>
                    {renderSlideImageElement()}

                    {/* ── EXTRA: TÍTULO (ARRASTÁVEL) ── */}
                    <div
                      style={makeDragStyle(titlePos, 'title')}
                      onMouseDown={isLayoutEditMode ? (e) => handleElementDragStart(e, 'title') : undefined}
                      onTouchStart={isLayoutEditMode ? (e) => handleElementDragStart(e, 'title') : undefined}
                      className="w-full shrink-0 relative"
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
                    </div>{/* /body drag wrapper */}

                    <div className="w-full shrink-0 h-8" />
                  </div>
                );
              }

              const PROPER_NOUNS = [
                'Deus', 'Jesus', 'Cristo', 'Espírito', 'Santo', 'Senhor', 'Pai', 'Filho',
                'Paulo', 'Pedro', 'João', 'Ananias', 'Félix', 'Tértulo', 'Festos', 'Agripa',
                'Sinédrio', 'Jerusalém', 'Israel', 'Evangelho', 'Bíblia', 'Trófimo', 'Ásia',
                'Roma', 'Lei', 'EBD', 'MegaEBD', 'Igreja'
              ];
              const toCaixaBaixa = (text: string) => {
                if (!text) return '';
                let res = text.trim();
                res = res.charAt(0).toUpperCase() + res.slice(1).toLowerCase();
                PROPER_NOUNS.forEach(noun => {
                  const regex = new RegExp(`\\b${noun}\\b`, 'gi');
                  res = res.replace(regex, noun);
                });
                return res;
              };
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

              const parseRomanToNum = (val: string): string => {
                if (!val) return '';
                const s = val.trim().toUpperCase();
                if (s === 'I') return '1';
                if (s === 'II') return '2';
                if (s === 'III') return '3';
                if (s === 'IV') return '4';
                if (s === 'V') return '5';
                if (s === 'VI') return '6';
                return val;
              };
              const formattedTopicNum = parseRomanToNum(topicNumStr);

              // Remove qualquer prefixo legado tipo "Tópico 1", "Subtópico 1", "Subt.", e referências do tipo (vv.1,2) ou numerações duplicadas
              let cleanTitle = mainTitle
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
                <div className="relative z-10 w-full h-full max-w-full px-3 md:px-6 mx-auto flex flex-col justify-between items-center my-auto py-2 font-gotham" style={{ zoom: currentSlideScale } as React.CSSProperties}>
                  {renderSlideImageElement()}

                  {/* ── TÍTULO PRINCIPAL (ARRASTÁVEL) ── */}
                  <div
                    style={makeDragStyle(titlePos, 'title')}
                    onMouseDown={isLayoutEditMode ? (e) => handleElementDragStart(e, 'title') : undefined}
                    onTouchStart={isLayoutEditMode ? (e) => handleElementDragStart(e, 'title') : undefined}
                    className="w-full shrink-0 relative"
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
                                  <h3 className="text-2xl md:text-3xl lg:text-4xl font-black text-[#0052cc] tracking-wide font-sans text-center mb-2 w-full shrink-0 sticky top-0 bg-slate-900/95 py-2.5 backdrop-blur-md z-20 rounded-2xl shadow-lg border border-amber-500/30" style={{ zoom: currentTitleScale } as React.CSSProperties}>
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

                                      {/* Título do Livro / Passagem (ex: "Mateus 28.18-20", "Atos 1.8", "Efésios 2.13-18") */}
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
                    </div>{/* /body drag wrapper */}

                  {/* Spacer inferior para equilibrar o título do topo */}
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
        </div>
      )}

      {/* Modal do QR Code para Sincronização com o Celular */}
      <QrCodeModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        lesson={fullSyncedLesson}
      />

      {/* Modal Interativo de Recorte de Imagem (Crop) */}
      <ImageCropModal
        isOpen={cropModalOpen}
        imageUrl={cropModalImage || ''}
        onClose={() => {
          setCropModalOpen(false);
          setCropModalImage(null);
        }}
        onCropComplete={handleApplyCrop}
        title={cropTarget === 'bg' ? 'Recortar Fundo do Modelo' : `Recortar Imagem do Slide ${projectorIndex + 1}`}
        initialAspectRatio={cropTarget === 'bg' ? '16:9' : '16:9'}
      />
    </div>
  );
};

