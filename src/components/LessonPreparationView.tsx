import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { EBDLessonPreparation, EBDTopicPreparation } from '../types';
import { RefreshCw, Check, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Monitor, UserCheck, FileText, Bookmark, ArrowLeft, ArrowRight, Printer, Download, Copy, ImageDown, FileDown, LayoutTemplate, Edit3, Trash2, Link2, Smartphone, Plus, ZoomIn, ZoomOut, Type, Move } from 'lucide-react';
import { callGeminiRaw } from '../services/geminiService';
import { exportAllSlidesPNGZipFromStage, exportTeacherGuideCleanPDF, exportTeacherGuideHTML } from '../services/exportService';

import { TextHighlightToolbar, HIGHLIGHT_COLORS } from './TextHighlightToolbar';
import { QrCodeModal } from './QrCodeModal';

// ── Inline Text Highlight System ──────────────────────────────────
interface TextHighlightEntry {
  text: string;
  color: string;
  style?: 'fill' | 'outline'; // default 'fill' for backward compat
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
): React.ReactNode {
  if (!entries.length || !text) return text;

  const LIGHT = new Set(['#facc15', '#fb923c', '#4ade80']);

  // Build sorted, non-overlapping intervals
  const intervals: Array<{ s: number; e: number; color: string; style: 'fill' | 'outline' }> = [];
  for (const h of entries) {
    if (!h.text) continue;
    let pos = 0;
    while (pos <= text.length - h.text.length) {
      const idx = text.indexOf(h.text, pos);
      if (idx === -1) break;
      const overlaps = intervals.some((iv) => idx < iv.e && idx + h.text.length > iv.s);
      if (!overlaps) intervals.push({ s: idx, e: idx + h.text.length, color: h.color, style: h.style ?? 'fill' });
      pos = idx + 1;
    }
  }
  if (!intervals.length) return text;
  intervals.sort((a, b) => a.s - b.s);

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  intervals.forEach((iv, i) => {
    if (cursor < iv.s) nodes.push(<React.Fragment key={`t${i}`}>{text.slice(cursor, iv.s)}</React.Fragment>);
    const isFill = iv.style !== 'outline';
    const isDark = LIGHT.has(iv.color);
    nodes.push(
      <mark
        key={`m${i}`}
        style={isFill ? {
          background: iv.color,
          color: isDark ? '#1e293b' : '#fff',
          borderRadius: '3px',
          padding: '2px 5px',
          fontWeight: 'inherit',
          display: 'inline',
        } : {
          background: 'transparent',
          color: 'inherit',
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
    cursor = iv.e;
  });
  if (cursor < text.length) nodes.push(<React.Fragment key="tend">{text.slice(cursor)}</React.Fragment>);
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

  // 2. Identifica marcos no texto: Títulos de Livro/Passagem (ex: "Mt 28.18-20", "At. 1.8", "Ef. 2.13-18") e Versículos (ex: "18 —", "19 —")
  const bookNamePattern = '(?:Gên|Êx|Lv|Nm|Dt|Jos|Jz|Rt|1Sm|2Sm|1Rs|2Rs|1Cr|2Cr|Esd|Ne|Et|Jó|Sal|Sl|Pv|Ec|Ct|Is|Jer|Jr|Lam|Lm|Ez|Dn|Os|Jl|Am|Ob|Jon|Mq|Na|Hab|Zef|Zc|Ag|Zc|Mal|Ml|Mt|Mat|Mateus|Mc|Mar|Marcos|Lc|Luc|Lucas|Jo|João|At|Atos|Rm|Rom|Romanos|1Co|2Co|Gál|Gal|Gálatas|Ef|Efé|Efésios|Fp|Fil|Filipenses|Cl|Col|Colossenses|1Ts|2Ts|1Tm|2Tm|Tt|Tito|Fm|Heb|Hb|Hebreus|Tg|Tia|Tiago|1Pe|2Pe|1Jo|2Jo|3Jo|Jd|Jud|Judas|Ap|Apoc|Apocalipse|[1-3]?\\s*[A-Za-zÀ-ÿ]+)';

  const headerRegex = new RegExp(`(?:^|\\n|\\s{2,}|(?<=[\\.\\!\\?]"?\\s+))(${bookNamePattern}\\.?\\s+\\d{1,3}(?:[\\.\\:\\,]\\d{1,3}(?:[\\-\\–\\—]\\d{1,3})?)?)(?=\\s*[:\\-\\—\\n]|\\s+\\d{1,3}\\s*[—\\-–\\.]|\\s*$)`, 'gi');
  const verseRegex = /(?:^|\s+|\n)(\d{1,3})\s*(?:[—\-–\.]\s*)(?=[A-Za-zÀ-ÿ"“'\[])/g;

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
    return { reference, sections: [{ verses }] };
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
      verseText = verseText.replace(/^[—\-–\.]\s*/, '').replace(/\[\.\.\.\]/g, '').trim();

      currentSec.verses.push({
        number: curr.text,
        text: verseText
      });
    }
  }

  if (currentSec.verses.length > 0 || currentSec.bookHeader) {
    sections.push(currentSec);
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
}

export const LessonPreparationView: React.FC<LessonPreparationViewProps> = ({
  lessonData,
  onReset,
  onUpdateLesson,
}) => {
  const [lesson, setLesson] = useState<EBDLessonPreparation>(lessonData);
  const [activeTab, setActiveTab] = useState<'professor' | 'projetor'>('professor');
  const [isEditMode, setIsEditMode] = useState<boolean>(false);

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

  // Escalas efetivas da fonte do slide atual
  const currentSlideScale = slideFontScales[projectorIndex] !== undefined
    ? slideFontScales[projectorIndex]
    : projectorFontSizeScale;

  const currentTitleScale = slideTitleFontScales[projectorIndex] !== undefined
    ? slideTitleFontScales[projectorIndex]
    : 1.4;
  const isCurrentTitleCustom = slideTitleFontScales[projectorIndex] !== undefined;

  const currentBodyScale = slideBodyFontScales[projectorIndex] !== undefined
    ? slideBodyFontScales[projectorIndex]
    : 1.7;
  const isCurrentBodyCustom = slideBodyFontScales[projectorIndex] !== undefined;

  useEffect(() => {
    setLesson(lessonData);
    if (lessonData.slideFontScales) {
      setSlideFontScales(lessonData.slideFontScales);
    }
    if (lessonData.slideTitleFontScales) {
      setSlideTitleFontScales(lessonData.slideTitleFontScales);
    }
    if (lessonData.slideBodyFontScales) {
      setSlideBodyFontScales(lessonData.slideBodyFontScales);
    }
    if (lessonData.projectorFontSizeScale) {
      setProjectorFontSizeScale(lessonData.projectorFontSizeScale);
    }
  }, [lessonData]);

  const updateLesson = useCallback((updater: (prev: EBDLessonPreparation) => EBDLessonPreparation) => {
    setLesson(prev => {
      const next = updater(prev);
      onUpdateLesson(next);
      return next;
    });
  }, [onUpdateLesson]);

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
      if (currentTitleScale !== 1.4) nextTitles[i] = currentTitleScale;
      if (currentBodyScale !== 1.7) nextBodies[i] = currentBodyScale;
    }
    setSlideTitleFontScales(nextTitles);
    setSlideBodyFontScales(nextBodies);
    try {
      localStorage.setItem('mega_ebd_slide_title_font_scales', JSON.stringify(nextTitles));
      localStorage.setItem('mega_ebd_slide_body_font_scales', JSON.stringify(nextBodies));
    } catch {}
    updateLesson(l => ({ ...l, slideTitleFontScales: nextTitles, slideBodyFontScales: nextBodies }));
  }, [currentTitleScale, currentBodyScale, updateLesson]);

  // ── POSICIONAMENTO LIVRE DE ELEMENTOS NO SLIDE ──────────────────────────────
  const [isLayoutEditMode, setIsLayoutEditMode] = useState(false);

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

  const titlePos = slideTitlePositions[projectorIndex] ?? { x: 0, y: 0 };
  const bodyPos  = slideBodyPositions[projectorIndex]  ?? { x: 0, y: 0 };
  const isTitleMoved = slideTitlePositions[projectorIndex] !== undefined;
  const isBodyMoved  = slideBodyPositions[projectorIndex]  !== undefined;

  // Ref de drag responsivo (suporta mouse e touch com posições em porcentagem)
  const dragStateRef = useRef<{
    active: boolean;
    kind: 'title' | 'body';
    startClientX: number;
    startClientY: number;
    startOffsetXPct: number;
    startOffsetYPct: number;
    stageWidth: number;
    stageHeight: number;
  } | null>(null);

  const handleElementDragStart = useCallback((e: React.MouseEvent | React.TouchEvent, kind: 'title' | 'body') => {
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
      : (slideBodyPositions[projectorIndex]  ?? { x: 0, y: 0 });

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
  }, [isLayoutEditMode, projectorIndex, slideTitlePositions, slideBodyPositions]);

  // Listeners globais de mouse/touch para o drag responsivo
  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
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
      } else {
        setSlideBodyPositions(prev => ({ ...prev, [projectorIndex]: { x: newXPct, y: newYPct } }));
      }
    };

    const handleEnd = () => {
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

  // Reset da posição de um elemento no slide atual
  const resetSlidePosition = useCallback((kind: 'title' | 'body') => {
    if (kind === 'title') {
      setSlideTitlePositions(prev => {
        const next = { ...prev };
        delete next[projectorIndex];
        try { localStorage.setItem('mega_ebd_title_positions', JSON.stringify(next)); } catch {}
        updateLesson(l => ({ ...l, slideTitlePositions: next }));
        return next;
      });
    } else {
      setSlideBodyPositions(prev => {
        const next = { ...prev };
        delete next[projectorIndex];
        try { localStorage.setItem('mega_ebd_body_positions', JSON.stringify(next)); } catch {}
        updateLesson(l => ({ ...l, slideBodyPositions: next }));
        return next;
      });
    }
  }, [projectorIndex, updateLesson]);

  // Estilos do wrapper de drag para cada elemento (suporta pixels legados e porcentagem responsiva)
  const makeDragStyle = (pos: { x: number; y: number }, kind: 'title' | 'body'): React.CSSProperties => {
    const stage = projectorStageRef.current;
    const stageW = stage?.clientWidth || 800;
    const stageH = stage?.clientHeight || 450;

    let offsetX = pos.x;
    let offsetY = pos.y;
    // Se o valor estiver entre -100 e 100, trata como porcentagem da largura/altura do palco
    if (Math.abs(offsetX) <= 100) {
      offsetX = (offsetX / 100) * stageW;
    }
    if (Math.abs(offsetY) <= 100) {
      offsetY = (offsetY / 100) * stageH;
    }

    return {
      transform: `translate(${offsetX}px, ${offsetY}px)`,
      ...(isLayoutEditMode ? {
        cursor: 'grab',
        outline: kind === 'title' ? '2px dashed #f59e0b' : '2px dashed #06b6d4',
        outlineOffset: '2px',
        borderRadius: '10px',
        userSelect: 'none',
        touchAction: 'none',
        position: 'relative',
        zIndex: 50,
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
      list.push({ reference: 'Referência Bíblica (ex: João 3.16)', text: 'Texto do versículo...' });
      sub.versiculos = list;
      topicos[topicIdx].subtopicos[subIdx] = sub;
      return { ...prev, topicos };
    });
  };

  const updateVersiculoSubtopic = (topicIdx: number, subIdx: number, vIdx: number, field: 'reference' | 'text', val: string) => {
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

  const saveHighlights = useCallback((next: SlideHighlights) => {
    setSlideHighlights(next);
    persistSlideHighlights(next);
  }, []);

  /** Wraps text with inline highlight marks for the current projector slide. */
  const renderHL = useCallback((text: string | undefined): React.ReactNode => {
    if (!text) return text;
    const entries = slideHighlights[projectorIndex] || [];
    return applyHighlightsToText(text, entries);
  }, [slideHighlights, projectorIndex]);

  const applyHighlight = useCallback((color: string, hlStyle: 'fill' | 'outline' = 'fill') => {
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

  const [projectorSlideImages, setProjectorSlideImages] = useState<Record<number, string>>({});
  const [customBg, setCustomBg] = useState<string | null>(() => {
    try {
      return localStorage.getItem('mega_ebd_custom_bg');
    } catch {
      return null;
    }
  });

  const handleSlideImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const d = ev.target?.result as string;
      if (d) {
        setProjectorSlideImages(prev => ({ ...prev, [projectorIndex]: d }));
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemoveSlideImage = () => {
    setProjectorSlideImages(prev => {
      const next = { ...prev };
      delete next[projectorIndex];
      return next;
    });
  };

  const handleCustomBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const d = ev.target?.result as string;
      if (d) {
        setCustomBg(d);
        try { localStorage.setItem('mega_ebd_custom_bg', d); } catch {}
      }
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  // Gerador de Texto Completo do Roteiro do Professor na Íntegra
  const generateTeacherTextContent = (data: EBDLessonPreparation): string => {
    let text = `========================================================================\n`;
    text += `ROTEIRO COMPLETO DO PROFESSOR - EBD NA ÍNTEGRA\n`;
    text += `${data.metadata.lessonNumber || 'LIÇÃO EBD'} - ${data.metadata.title}\n`;
    text += `Tema do Trimestre: ${data.metadata.themeTopic}\n`;
    text += `========================================================================\n\n`;

    text += `1. TEXTO ÁUREO\n`;
    text += `"${data.textAureo.text}" (${data.textAureo.reference})\n\n`;

    text += `2. VERDADE PRÁTICA\n`;
    text += `"${data.verdadePratica.text}"\n\n`;

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
          });
          text += `\n`;
        }

        if (sub.aplicacao) {
          text += `🔥 APLICAÇÃO PRÁTICA & PENTECOSTAL:\n${sub.aplicacao}\n\n`;
        }

        if (sub.enfase) {
          text += `💡 ÊNFASE PARA A SALA:\n"${sub.enfase}"\n\n`;
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

  // Gerador de Texto Limpo do Roteiro (sem prompts de imagem, sem checklist de fontes, sem divisores pesados e sem rótulos de engenharia)
  const generateCleanTeacherTextContent = (data: EBDLessonPreparation): string => {
    let text = `ROTEIRO DO PROFESSOR - EBD\n`;
    text += `${data.metadata.lessonNumber || 'LIÇÃO EBD'}: ${data.metadata.title}\n`;
    text += `Tema: ${data.metadata.themeTopic}\n\n`;

    text += `1. TEXTO ÁUREO\n`;
    text += `"${data.textAureo.text}" (${data.textAureo.reference})\n\n`;

    text += `2. VERDADE PRÁTICA\n`;
    text += `"${data.verdadePratica.text}"\n\n`;

    if (data.introducao?.ponteContextual?.enabled) {
      const bridge = data.introducao.ponteContextual;
      const licaoAnt = bridge.naLicaoAnterior || bridge.ondeParou;
      const interv = bridge.ponteContextual || bridge.capitulosIntermediarios;
      text += `TRANSIÇÃO BÍBLICA & CONTEXTO\n`;
      if (licaoAnt) text += `📌 Na lição anterior: ${licaoAnt}\n`;
      if (interv) text += `📜 Intervalo bíblico: ${interv}\n`;
      if (bridge.ganchoAulaAtual) text += `👉 Transição para hoje: ${bridge.ganchoAulaAtual}\n`;
      if (bridge.projetor) text += `🖥️ Síntese no Projetor: "${bridge.projetor}"\n`;
      text += `\n`;
    }

    if (data.biblicalText) {
      text += `3. LEITURA BÍBLICA EM CLASSE\n`;
      text += `${data.biblicalText}\n\n`;
    }

    text += `DESENVOLVIMENTO DIDÁTICO DOS TÓPICOS\n\n`;

    data.topicos.forEach((topico) => {
      text += `TÓPICO ${topico.number}: ${topico.title.toUpperCase()}\n`;
      text += `Sinopse: ${topico.sinopse}\n`;
      if (topico.frasesEnfase && topico.frasesEnfase.length > 0) {
        text += `Frases de Ênfase:\n`;
        topico.frasesEnfase.forEach((f) => {
          text += `  • "${f}"\n`;
        });
      }
      text += `\n`;

      topico.subtopicos.forEach((sub) => {
        text += `--- Subtópico ${sub.number}: ${sub.title} ---\n\n`;

        const txtProjetor = sub.projetor || ((sub.frasesExplicativas && sub.frasesExplicativas.length > 0)
          ? sub.frasesExplicativas.map(f => f.frase).filter(Boolean).join(' ')
          : '');

        if (txtProjetor) {
          text += `Texto da Revista / Quadro:\n"${txtProjetor}"\n\n`;
        }

        if (sub.explicacao) {
          text += `Explicação Didática do Professor:\n${sub.explicacao}\n\n`;
        } else if (sub.frasesExplicativas && sub.frasesExplicativas.length > 0) {
          text += `Explicação Didática do Professor:\n`;
          const linhasLinear = sub.frasesExplicativas
            .map(f => {
              const label = f.frase ? `"${f.frase}" — ` : '';
              return `${label}${f.explicacao}`.trim();
            })
            .filter(Boolean);
          text += linhasLinear.join('\n\n') + '\n\n';
        }


        if (sub.versiculos && sub.versiculos.length > 0) {
          text += `📖 Textos Bíblicos Relevantes:\n`;
          sub.versiculos.forEach((v) => {
            text += `  • ${v.reference}: "${v.text}"\n`;
          });
          text += `\n`;
        }

        if (sub.aplicacao) {
          text += `🔥 Aplicação Prática:\n${sub.aplicacao}\n\n`;
        }

        if (sub.enfase) {
          text += `💡 Ênfaise para a Sala:\n"${sub.enfase}"\n\n`;
        }

        if (sub.cuidadoDoutrinario) {
          text += `⚠️ Cuidado Doutrinário:\n${sub.cuidadoDoutrinario}\n\n`;
        }

        if (sub.palavrasOriginais && sub.palavrasOriginais.length > 0) {
          text += `🏛️ Vocabulário Exegético (Grego / Hebraico):\n`;
          sub.palavrasOriginais.forEach((p) => {
            text += `  • ${p.termo} (${p.transliteracao} - ${p.idioma}): ${p.significado}\n    ${p.explicacao}\n`;
          });
          text += `\n`;
        }

        if (sub.ideias && sub.ideias.length > 0) {
          sub.ideias.forEach((ideia) => {
            text += `[Ideia ${ideia.letra.toUpperCase()}] ${ideia.titulo}\n`;
            text += `Projetor: "${ideia.projetor}"\n`;
            text += `Explicação: ${ideia.professor.explicacao}\n`;
            if (ideia.professor.contexto) {
              text += `Contexto Histórico: ${ideia.professor.contexto}\n`;
            }
            text += `\n`;
          });
        }
      });
    });

    text += `CONCLUSÃO & APLICAÇÃO FINAL\n`;
    text += `"${data.conclusao.takeaway}"\n\n`;

    if (data.conclusao.bulletPoints && data.conclusao.bulletPoints.length > 0) {
      text += `Pontos Principais:\n`;
      data.conclusao.bulletPoints.forEach((pt) => {
        text += `  • ${pt}\n`;
      });
      text += `\n`;
    }

    if (data.conclusao.finalPrayer) {
      text += `🙏 Sugestão de Oração Final:\n"${data.conclusao.finalPrayer}"\n\n`;
    }

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

  const handleDownloadTeacherTxt = () => {
    const textContent = generateCleanTeacherTextContent(lesson);
    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const sanitizedTitle = lesson.metadata.title.replace(/[^a-zA-Z0-9-_\s]/g, '_').trim() || 'Roteiro_Professor';
    link.download = `Roteiro_Professor_${sanitizedTitle}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyCleanTeacherGuide = () => {
    const textContent = generateCleanTeacherTextContent(lesson);
    navigator.clipboard.writeText(textContent);
    setCopiedToast('clean');
    setTimeout(() => setCopiedToast(null), 3000);
  };

  const handleCopyTeacherGuide = () => {
    const textContent = generateTeacherTextContent(lesson);
    navigator.clipboard.writeText(textContent);
    setCopiedToast('full');
    setTimeout(() => setCopiedToast(null), 3000);
  };

  // Flattened items for Projector Mode
  const projectorItems = React.useMemo(() => {
    const items: Array<{
      type: 'cover' | 'aureo' | 'pratica' | 'na_licao_anterior' | 'ponte_contextual' | 'leitura' | 'topic_synopsis' | 'subtopic' | 'subtopic_explanation' | 'subtopic_verses' | 'subtopic_aplicacao' | 'enfase_palavra' | 'conclusao' | 'verdades';
      title: string;
      subtitle?: string;
      bulletPoints?: string[];
      badgeText?: string;
      projetorText?: string;
      ideiaText?: string;
      reference?: string;
      imagePrompt?: string;
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
          type: 'na_licao_anterior',
          title: 'NA LIÇÃO ANTERIOR',
          badgeText: 'NA LIÇÃO ANTERIOR',
          projetorText: textLicaoAnterior,
          onUpdateText: (val: string) => updatePonteContextualField(bridge.naLicaoAnterior ? 'naLicaoAnterior' : 'ondeParou', val)
        });
      }

      if (textPonteContextual) {
        items.push({
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
      type: 'cover',
      title: lesson.metadata.title,
      subtitle: lesson.metadata.themeTopic,
      badgeText: lesson.metadata.lessonNumber || 'LIÇÃO EBD',
      onUpdateTitle: (val: string) => updateMetadata('title', val),
      onUpdateSubtitle: (val: string) => updateMetadata('themeTopic', val),
      onUpdateText: (val: string) => updateMetadata('title', val)
    });

    // 4. Texto Áureo
    items.push({
      type: 'aureo',
      title: 'TEXTO ÁUREO',
      badgeText: 'TEXTO ÁUREO',
      projetorText: `“${lesson.textAureo.text}”`,
      reference: lesson.textAureo.reference,
      onUpdateText: (val: string) => updateTextAureo('text', val.replace(/^["'“]/, '').replace(/["'”]$/, '')),
      onUpdateReference: (val: string) => updateTextAureo('reference', val)
    });

    // 5. Verdade Prática
    if (lesson.verdadePratica?.text) {
      items.push({
        type: 'pratica',
        title: 'VERDADE PRÁTICA',
        badgeText: 'VERDADE PRÁTICA',
        projetorText: `“${lesson.verdadePratica.text}”`,
        onUpdateText: (val: string) => updateVerdadePratica(val.replace(/^["'“]/, '').replace(/["'”]$/, ''))
      });
    }

    // Leitura Bíblica em Classe NA ÍNTEGRA (EM APENAS 1 ÚNICO CARD COM SCROLL)
    if (lesson.biblicalText) {
      items.push({
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

      // 📌 CARD DE SINOPSE / REVISÃO DO TÓPICO (TÍTULO DO TÓPICO VAI NA TARJA LARANJA COMO NO PRINT)
      items.push({
        type: 'topic_synopsis',
        title: `${topicNum}. ${t.title}`,
        badgeText: `TÓPICO ${topicNum}: ${t.title.toUpperCase()}`,
        ideiaText: `TÓPICO ${topicNum}: ${t.title.toUpperCase()}`,
        projetorText: t.sinopse,
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

        // 2. SLIDE DE BASE BÍBLICA DE APOIO (VAMOS LER A BÍBLIA - APENAS REFERÊNCIAS)
        if (s.versiculos && s.versiculos.length > 0) {
          const textoReferencias = s.versiculos
            .map(v => v.reference)
            .filter(Boolean)
            .join('\n');
          if (textoReferencias) {
            items.push({
              type: 'subtopic_verses',
              title: subtopicTitle,
              badgeText: subtopicBadge,
              ideiaText: '📖 VAMOS LER A BÍBLIA',
              projetorText: textoReferencias,
              imagePrompt: s.imagePrompt,
              onUpdateTitle: (val: string) => updateSubtopicField(tIdx, sIdx, 'title', val.replace(/^\d+(\.\d+)?\.\s*/, '')),
              onUpdateText: (val: string) => {
                const refs = val.split('\n').filter(Boolean);
                const newVerses = refs.map(r => ({ reference: r.trim(), text: '' }));
                updateSubtopicField(tIdx, sIdx, 'versiculos', newVerses);
              }
            });
          }
        }

        // 3. SLIDE DE APLICAÇÃO (QUAL O ENSINAMENTO PRA MINHA VIDA?)
        if (s.aplicacao) {
          items.push({
            type: 'subtopic_aplicacao',
            title: subtopicTitle,
            badgeText: subtopicBadge,
            ideiaText: 'QUAL O ENSINAMENTO PRA MINHA VIDA?',
            projetorText: s.aplicacao,
            imagePrompt: s.imagePrompt,
            onUpdateTitle: (val: string) => updateSubtopicField(tIdx, sIdx, 'title', val.replace(/^\d+(\.\d+)?\.\s*/, '')),
            onUpdateText: (val: string) => updateSubtopicField(tIdx, sIdx, 'aplicacao', val)
          });
        }

        // 5. SLIDE DE ÊNFASE / APRENDA COM A PALAVRA (SE HOUVER)
        if (s.enfase) {
          const cleanEnfaseText = s.enfase
            .replace(/^["'“]?\s*Aprenda\s+com\s+a\s+Palavra\s*[\:\–\—\-]?\s*/i, '')
            .replace(/^["'“]?\s*Ênfase\s*(?:para\s+a\s+sala)?\s*[\:\–\—\-]?\s*/i, '')
            .replace(/^["'“]?\s*📌\s*/, '')
            .replace(/^["'“]?\s*💡\s*/, '')
            .replace(/["'”]?\s*$/, '')
            .trim();

          items.push({
            type: 'enfase_palavra',
            title: subtopicTitle,
            badgeText: subtopicBadge,
            ideiaText: 'APRENDA COM A PALAVRA...',
            projetorText: cleanEnfaseText ? `“${cleanEnfaseText}”` : s.enfase,
            imagePrompt: s.imagePrompt,
            onUpdateTitle: (val: string) => updateSubtopicField(tIdx, sIdx, 'title', val.replace(/^\d+(\.\d+)?\.\s*/, '')),
            onUpdateText: (val: string) => updateSubtopicField(tIdx, sIdx, 'enfase', val.replace(/^["'“]/, '').replace(/["'”]$/, ''))
          });
        }

        // FALLBACK PARA DADOS LEGADOS COM ARRAY DE IDEIAS
        if (!textoQuadroAzul && s.ideias && s.ideias.length > 0) {
          s.ideias.forEach((ideia, iIdx) => {
            items.push({
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
        type: 'verdades',
        title: 'VERDADES QUE PRECISAMOS GUARDAR',
        badgeText: 'VERDADES QUE PRECISAMOS GUARDAR',
        bulletPoints: lesson.conclusao.bulletPoints,
        onUpdateBulletPoint: (bIdx: number, val: string) => updateConclusaoBullet(bIdx, val)
      });
    }

    return items;
  }, [lesson]);

  const currentProjectorItem = projectorItems[projectorIndex] || projectorItems[0];

  // Atalhos de Teclado no Modo Projetor (Seta Esquerda / Direita)
  useEffect(() => {
    if (activeTab !== 'projetor') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        setProjectorIndex(prev => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight') {
        setProjectorIndex(prev => Math.min(projectorItems.length - 1, prev + 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, projectorItems.length]);

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

  return (
    <div className="preparation-view-container space-y-6 max-w-[1600px] w-full mx-auto font-['Montserrat']">
      {/* Barra de Ferramentas Superior & Alternador de Visão */}
      <div className="bg-slate-900/90 border border-slate-700/90 p-4 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-4 backdrop-blur-md no-print">
        <div className="flex items-center gap-3">
          <button
            onClick={onReset}
            className="btn-secondary text-xs flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 py-2 rounded-xl border border-slate-600 font-extrabold transition-all cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
            Nova Lição EBD
          </button>
          <div className="text-white text-sm md:text-base font-black truncate max-w-xs md:max-w-sm">
            {lesson.metadata.title}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Botões de Ação para Baixar / Imprimir / Copiar a Parte do Professor */}
          {activeTab === 'professor' && (
            <div className="flex flex-wrap items-center gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
              <button
                onClick={() => exportTeacherGuideCleanPDF(lesson)}
                title="Baixar Roteiro Limpo do Professor em PDF para ler no celular"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs bg-red-600 hover:bg-red-500 text-white border border-red-400/40 shadow-md transition-all cursor-pointer"
              >
                <FileDown className="w-3.5 h-3.5 text-white" />
                <span>📄 Roteiro PDF</span>
              </button>

              <button
                onClick={() => exportTeacherGuideHTML(lesson)}
                title="Baixar Roteiro Colorido para colar no Google Docs (abre o .html no navegador, Ctrl+A, Ctrl+C, cola no Docs)"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400/40 shadow-md transition-all cursor-pointer"
              >
                <FileDown className="w-3.5 h-3.5 text-white" />
                <span>🎨 Google Docs</span>
              </button>

              <button
                onClick={handlePrintTeacherGuide}
                title="Salvar Roteiro em PDF ou Imprimir"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition-all cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-amber-400" />
                <span>Imprimir</span>
              </button>

              <button
                onClick={() => setIsQrModalOpen(true)}
                title="Abrir esta mesma aula no Celular via QR Code (sincronizada)"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white border border-purple-400/40 shadow-md transition-all cursor-pointer"
              >
                <Smartphone className="w-3.5 h-3.5 text-cyan-300" />
                <span>📱 QR Code Celular</span>
              </button>

              <button
                onClick={handleDownloadTeacherTxt}
                title="Baixar Roteiro em Arquivo de Texto (.txt)"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Baixar TXT</span>
              </button>

              <button
                onClick={handleCopyCleanTeacherGuide}
                title="Copiar Roteiro Limpo (somente texto da lição e explicações)"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 transition-all cursor-pointer"
              >
                {copiedToast === 'clean' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Limpo Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Copiar Limpo</span>
                  </>
                )}
              </button>

              <button
                onClick={handleCopyTeacherGuide}
                title="Copiar Roteiro Completo (com Prompts e Metadados)"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all cursor-pointer"
              >
                {copiedToast === 'full' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Completo Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                    <span>Copiar Completo</span>
                  </>
                )}
              </button>

              <button
                onClick={() => setIsEditMode(!isEditMode)}
                title="Ativar/desativar modo de edição livre de texto"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer border ${
                  isEditMode
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-extrabold shadow-lg shadow-amber-500/30'
                    : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{isEditMode ? '✓ Concluir Edição' : '✏️ Editar Conteúdo'}</span>
              </button>
            </div>
          )}

          {/* Chave de Alternância: PROFESSOR vs PROJETOR */}
          <div className="flex items-center bg-slate-950 p-1 rounded-2xl border border-slate-800">
            <button
              onClick={() => setActiveTab('professor')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-extrabold text-xs transition-all cursor-pointer ${
                activeTab === 'professor'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <UserCheck className="w-4 h-4 text-amber-300" />
              <span>👨‍🏫 VISÃO DO PROFESSOR</span>
            </button>

            <button
              onClick={() => setActiveTab('projetor')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-extrabold text-xs transition-all cursor-pointer ${
                activeTab === 'projetor'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-purple-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Monitor className="w-4 h-4 text-cyan-300" />
              <span>🖥️ VISÃO DO PROJETOR</span>
            </button>
          </div>
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

              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrintTeacherGuide}
                  className="bg-amber-500 hover:bg-amber-600 text-slate-950 px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Baixar PDF / Imprimir</span>
                </button>

                <button
                  onClick={handleDownloadTeacherTxt}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar TXT</span>
                </button>

                <button
                  onClick={handleCopyCleanTeacherGuide}
                  title="Copiar Roteiro Limpo para uso direto na aula"
                  className="bg-cyan-600 hover:bg-cyan-500 text-slate-950 px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
                >
                  {copiedToast === 'clean' ? (
                    <>
                      <Check className="w-4 h-4 text-slate-950" />
                      <span>Copiado Limpo!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-slate-950" />
                      <span>Copiar Roteiro Limpo</span>
                    </>
                  )}
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
              <div className="bg-[#091b2c] border-2 border-[#cbd5e1] p-5 rounded-2xl shadow-lg space-y-2">
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
              </div>

              {/* Verdade Prática */}
              <div className="bg-[#091b2c] border-2 border-[#cbd5e1] p-5 rounded-2xl shadow-lg space-y-2">
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
              </div>
            </div>
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
                  {/* Sinopse & Frases de Ênfase do Tópico */}
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
                                  <div key={vIdx} className="bg-emerald-950/20 border border-emerald-500/30 p-3 rounded-xl relative">
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

                          {/* 4. Frase de Ênfase para o Professor */}
                          {(isEditMode || subtopico.enfase) && (
                            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs font-bold text-slate-200 flex items-center gap-2 no-print">
                              <span className="text-orange-400 font-black text-sm shrink-0">💡</span>
                              <div className="flex-1">
                                <EditableText
                                  value={subtopico.enfase || ''}
                                  onChange={v => updateSubtopicField(topicIdx, subIdx, 'enfase', v)}
                                  isEditMode={isEditMode}
                                  placeholder="Frase de ênfase para a sala..."
                                  label={isEditMode ? 'Ênfase para a Sala' : undefined}
                                />
                              </div>
                            </div>
                          )}

                          {/* Nota privada — Ênfase (só aparece no PDF) */}
                          <div className="flex items-start gap-1.5 mt-1">
                            <span className="text-slate-500 text-xs mt-0.5 shrink-0" title="Nota privada — só aparece no PDF">✏️</span>
                            <textarea
                              value={subtopico.notaEnfase || ''}
                              onChange={e => updateSubtopicField(topicIdx, subIdx, 'notaEnfase', e.target.value)}
                              placeholder="Nota pessoal sobre a ênfase (só no PDF)..."
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
                          {subtopico.imagePrompt && (
                            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1.5 no-print">
                              <div className="flex items-center justify-between text-cyan-400 font-extrabold text-[11px] uppercase">
                                <span className="flex items-center gap-1.5">
                                  <span>🖼️ PROMPT VISUAL 16:9 (CANVA / MIDJOURNEY)</span>
                                </span>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(subtopico.imagePrompt);
                                    alert('Prompt copiado para a área de transferência!');
                                  }}
                                  className="text-slate-400 hover:text-cyan-300 text-[10px] bg-slate-800 px-2 py-0.5 rounded cursor-pointer transition-colors"
                                >
                                  📋 Copiar Prompt
                                </button>
                              </div>
                              <p className="text-[11px] text-slate-300 font-mono italic bg-slate-900/90 p-2.5 rounded-lg border border-slate-800/80">
                                {subtopico.imagePrompt}
                              </p>
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
        </div>
      )}

      {/* ========================================================= */}
      {/* 🖥️ ABA 2: VISÃO DO PROJETOR (TELA 16:9 LIMPA PARA OS ALUNOS) */}
      {/* ========================================================= */}
      {activeTab === 'projetor' && (
        <div className="space-y-5">
          {/* Barra de Navegação do Projetor */}
          <div className="flex items-center justify-between bg-slate-900 p-3.5 rounded-2xl border border-slate-700/80 shadow-lg">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setProjectorIndex(prev => Math.max(0, prev - 1))}
                disabled={projectorIndex === 0}
                className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-30 cursor-pointer font-bold flex items-center gap-1 text-xs"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Anterior</span>
              </button>

              <span className="text-xs text-slate-300 font-bold bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
                Slide {projectorIndex + 1} de {projectorItems.length}
              </span>

              <button
                onClick={() => setProjectorIndex(prev => Math.min(projectorItems.length - 1, prev + 1))}
                disabled={projectorIndex === projectorItems.length - 1}
                className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-30 cursor-pointer font-bold flex items-center gap-1 text-xs"
              >
                <span>Próximo</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-300 font-extrabold truncate max-w-sm">
              {currentProjectorItem.title}
            </div>

            {/* Upload Modelo Próprio + Botões de Exportação */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Botão de Adicionar/Remover Imagem Apenas Neste Slide */}
              <label
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600/40 hover:bg-purple-600/60 text-purple-200 border border-purple-400/40 text-xs font-bold cursor-pointer transition-all shadow-md"
                title="Adicionar imagem ilustrativa apenas a este slide"
              >
                <span>{projectorSlideImages[projectorIndex] ? '📷 Alterar Imagem' : '🖼️ +Imagem neste Slide'}</span>
                <input type="file" accept="image/*" onChange={handleSlideImageUpload} className="hidden" />
              </label>
              {projectorSlideImages[projectorIndex] && (
                <button
                  onClick={handleRemoveSlideImage}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-red-600/20 hover:bg-red-600/40 text-red-300 border border-red-500/30 text-xs font-bold cursor-pointer transition-all"
                  title="Remover imagem deste slide e voltar ao texto 100% cheio"
                >
                  ✕ Remover Imagem
                </button>
              )}

              {/* QR Code Celular */}
              <button
                onClick={() => setIsQrModalOpen(true)}
                title="Abrir esta mesma aula no Celular via QR Code (sincronizada)"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold cursor-pointer border border-purple-400/40 shadow-md transition-all"
              >
                <Smartphone className="w-3.5 h-3.5 text-cyan-300" />
                <span>📱 QR Code Celular</span>
              </button>

              {/* Upload do Meu Modelo */}
              <label
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-xs font-bold cursor-pointer border border-indigo-400/40 shadow-md transition-all"
                title="Enviar imagem como fundo de todos os slides do projetor"
              >
                <LayoutTemplate className="w-3.5 h-3.5 text-amber-300" />
                <span>📁 Meu Modelo</span>
                <input type="file" accept="image/*" onChange={handleCustomBgUpload} className="hidden" />
              </label>




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
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold cursor-pointer disabled:opacity-50 transition-colors shadow-sm"
                title="Exportar todos os slides como ZIP com PNGs"
              >
                {isExporting === 'png' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ImageDown className="w-3.5 h-3.5" />}
                <span>{isExporting === 'png' ? 'Gerando...' : 'Todos (ZIP)'}</span>
              </button>



              {/* ── BOTÃO DE EDITAR SLIDE (MODO PROJETOR) ── */}
              <button
                onClick={() => setIsEditMode(!isEditMode)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black cursor-pointer transition-all shadow-md border ${
                  isEditMode
                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-400 ring-2 ring-amber-400/50'
                    : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40'
                }`}
                title="Ativar/desativar modo de edição livre de texto do slide"
              >
                <Edit3 className="w-3.5 h-3.5 text-current" />
                <span>{isEditMode ? '✓ Concluir Edição' : '✏️ Editar Slide'}</span>
              </button>

              {/* ── BOTÃO DE MOVER ELEMENTOS (MODO LAYOUT) ── */}
              <button
                onClick={() => setIsLayoutEditMode(prev => !prev)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black cursor-pointer transition-all shadow-md border ${
                  isLayoutEditMode
                    ? 'bg-purple-600 hover:bg-purple-500 text-white border-purple-400 ring-2 ring-purple-400/50'
                    : 'bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border-purple-500/40'
                }`}
                title="Arrastar título e texto livremente no slide para reposicioná-los"
              >
                <Move className="w-3.5 h-3.5 text-current" />
                <span>{isLayoutEditMode ? '✅ Pronto' : '🎯 Mover'}</span>
              </button>

              {/* ── CONTROLES SEPARADOS DE TAMANHO DE FONTE: TÍTULO vs TEXTO ── */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Fonte do Título */}
                <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded-xl border border-amber-500/40 shadow-sm" title="Ajustar tamanho da fonte do TÍTULO deste slide">
                  <Type className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="text-[10px] font-black text-amber-300 uppercase tracking-wider">Título:</span>
                  <button
                    onClick={() => {
                      const next = Math.max(0.5, Math.round((currentTitleScale - 0.05) * 100) / 100);
                      setSingleTitleScale(projectorIndex, next);
                    }}
                    disabled={currentTitleScale <= 0.5}
                    className="p-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 disabled:opacity-30 font-black text-xs cursor-pointer transition-all"
                    title="Diminuir fonte do título (A-)"
                  >
                    <ZoomOut className="w-3.5 h-3.5 text-amber-400" />
                  </button>
                  <span className={`text-xs font-black px-1 min-w-[36px] text-center font-mono ${isCurrentTitleCustom ? 'text-yellow-300 font-black' : 'text-amber-300'}`}>
                    {Math.round(currentTitleScale * 100)}%
                  </span>
                  <button
                    onClick={() => {
                      const next = Math.min(2.5, Math.round((currentTitleScale + 0.05) * 100) / 100);
                      setSingleTitleScale(projectorIndex, next);
                    }}
                    disabled={currentTitleScale >= 2.5}
                    className="p-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 disabled:opacity-30 font-black text-xs cursor-pointer transition-all"
                    title="Aumentar fonte do título (A+)"
                  >
                    <ZoomIn className="w-3.5 h-3.5 text-amber-400" />
                  </button>
                  {isCurrentTitleCustom && (
                    <button
                      onClick={() => setSingleTitleScale(projectorIndex, null)}
                      className="text-[9px] font-extrabold text-amber-400 hover:text-white px-1.5 py-0.5 rounded bg-amber-950 border border-amber-500/40 transition-colors cursor-pointer"
                      title="Restaurar tamanho padrão do título (140%)"
                    >
                      ↺ 140%
                    </button>
                  )}
                </div>

                {/* Fonte do Texto */}
                <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded-xl border border-cyan-500/40 shadow-sm" title="Ajustar tamanho da fonte do TEXTO / CORPO deste slide">
                  <Type className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span className="text-[10px] font-black text-cyan-300 uppercase tracking-wider">Texto:</span>
                  <button
                    onClick={() => {
                      const next = Math.max(0.5, Math.round((currentBodyScale - 0.05) * 100) / 100);
                      setSingleBodyScale(projectorIndex, next);
                    }}
                    disabled={currentBodyScale <= 0.5}
                    className="p-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 disabled:opacity-30 font-black text-xs cursor-pointer transition-all"
                    title="Diminuir fonte do texto (A-)"
                  >
                    <ZoomOut className="w-3.5 h-3.5 text-cyan-400" />
                  </button>
                  <span className={`text-xs font-black px-1 min-w-[36px] text-center font-mono ${isCurrentBodyCustom ? 'text-cyan-200 font-black' : 'text-cyan-300'}`}>
                    {Math.round(currentBodyScale * 100)}%
                  </span>
                  <button
                    onClick={() => {
                      const next = Math.min(2.5, Math.round((currentBodyScale + 0.05) * 100) / 100);
                      setSingleBodyScale(projectorIndex, next);
                    }}
                    disabled={currentBodyScale >= 2.5}
                    className="p-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 disabled:opacity-30 font-black text-xs cursor-pointer transition-all"
                    title="Aumentar fonte do texto (A+)"
                  >
                    <ZoomIn className="w-3.5 h-3.5 text-cyan-400" />
                  </button>
                  {isCurrentBodyCustom && (
                    <button
                      onClick={() => setSingleBodyScale(projectorIndex, null)}
                      className="text-[9px] font-extrabold text-cyan-400 hover:text-white px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-500/40 transition-colors cursor-pointer"
                      title="Restaurar tamanho padrão do texto (170%)"
                    >
                      ↺ 170%
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Painel de Edição Direta do Slide Atual (Modo Projetor) ── */}
          {isEditMode && currentProjectorItem && !isExporting && (
            <div className="bg-amber-950/90 border-2 border-amber-500/80 p-4 rounded-2xl shadow-2xl space-y-3 mb-3 text-left animate-in fade-in duration-200">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/40 pb-2">
                <span className="text-amber-300 font-extrabold text-xs uppercase flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-amber-400" />
                  <span>✏️ Editor de Texto do Slide ({projectorIndex + 1} / {projectorItems.length}) — {currentProjectorItem.title}</span>
                </span>

                {/* Controles de Tamanho Separados: Título e Texto */}
                <div className="flex flex-wrap items-center gap-3">
                  {/* Fonte do Título */}
                  <div className="flex items-center gap-1 bg-slate-950/90 px-2 py-1 rounded-xl border border-amber-500/50">
                    <span className="text-[10px] font-black text-amber-300 uppercase">Fonte Título:</span>
                    <button
                      onClick={() => setSingleTitleScale(projectorIndex, Math.max(0.5, Math.round((currentTitleScale - 0.05) * 100) / 100))}
                      disabled={currentTitleScale <= 0.5}
                      className="p-1 rounded bg-slate-900 text-amber-400 hover:bg-slate-800 text-xs font-black cursor-pointer"
                      title="Diminuir fonte do título"
                    >
                      <ZoomOut className="w-3 h-3 text-amber-400" />
                    </button>
                    <span className={`text-xs font-mono font-black min-w-[36px] text-center ${isCurrentTitleCustom ? 'text-yellow-300' : 'text-amber-300'}`}>
                      {Math.round(currentTitleScale * 100)}%
                    </span>
                    <button
                      onClick={() => setSingleTitleScale(projectorIndex, Math.min(2.5, Math.round((currentTitleScale + 0.05) * 100) / 100))}
                      disabled={currentTitleScale >= 2.5}
                      className="p-1 rounded bg-slate-900 text-amber-400 hover:bg-slate-800 text-xs font-black cursor-pointer"
                      title="Aumentar fonte do título"
                    >
                      <ZoomIn className="w-3 h-3 text-amber-400" />
                    </button>
                    {isCurrentTitleCustom && (
                      <button
                        onClick={() => setSingleTitleScale(projectorIndex, null)}
                        className="text-[9px] font-bold text-amber-400 hover:text-white px-1.5 py-0.5 rounded bg-amber-950 border border-amber-500/40 cursor-pointer"
                        title="Restaurar tamanho padrão do título (140%)"
                      >
                        ↺ 140%
                      </button>
                    )}
                  </div>

                  {/* Fonte do Texto */}
                  <div className="flex items-center gap-1 bg-slate-950/90 px-2 py-1 rounded-xl border border-cyan-500/50">
                    <span className="text-[10px] font-black text-cyan-300 uppercase">Fonte Texto:</span>
                    <button
                      onClick={() => setSingleBodyScale(projectorIndex, Math.max(0.5, Math.round((currentBodyScale - 0.05) * 100) / 100))}
                      disabled={currentBodyScale <= 0.5}
                      className="p-1 rounded bg-slate-900 text-cyan-400 hover:bg-slate-800 text-xs font-black cursor-pointer"
                      title="Diminuir fonte do texto"
                    >
                      <ZoomOut className="w-3 h-3 text-cyan-400" />
                    </button>
                    <span className={`text-xs font-mono font-black min-w-[36px] text-center ${isCurrentBodyCustom ? 'text-cyan-200' : 'text-cyan-300'}`}>
                      {Math.round(currentBodyScale * 100)}%
                    </span>
                    <button
                      onClick={() => setSingleBodyScale(projectorIndex, Math.min(2.5, Math.round((currentBodyScale + 0.05) * 100) / 100))}
                      disabled={currentBodyScale >= 2.5}
                      className="p-1 rounded bg-slate-900 text-cyan-400 hover:bg-slate-800 text-xs font-black cursor-pointer"
                      title="Aumentar fonte do texto"
                    >
                      <ZoomIn className="w-3 h-3 text-cyan-400" />
                    </button>
                    {isCurrentBodyCustom && (
                      <button
                        onClick={() => setSingleBodyScale(projectorIndex, null)}
                        className="text-[9px] font-bold text-cyan-400 hover:text-white px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-500/40 cursor-pointer"
                        title="Restaurar tamanho padrão do texto (170%)"
                      >
                        ↺ 170%
                      </button>
                    )}
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

                  {/* Reset de Posição dos Elementos */}
                  {(isTitleMoved || isBodyMoved) && (
                    <div className="flex items-center gap-1.5">
                      {isTitleMoved && (
                        <button
                          onClick={() => resetSlidePosition('title')}
                          className="text-[10px] font-bold text-amber-300 hover:text-white px-2 py-0.5 rounded-lg bg-amber-950/80 border border-amber-500/40 cursor-pointer"
                          title="Restaurar posição original do título"
                        >
                          ↺ Pos. Título
                        </button>
                      )}
                      {isBodyMoved && (
                        <button
                          onClick={() => resetSlidePosition('body')}
                          className="text-[10px] font-bold text-cyan-300 hover:text-white px-2 py-0.5 rounded-lg bg-cyan-950/80 border border-cyan-500/40 cursor-pointer"
                          title="Restaurar posição original do texto"
                        >
                          ↺ Pos. Texto
                        </button>
                      )}
                    </div>
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
            className="slide-stage-wrapper rounded-3xl overflow-hidden shadow-2xl border border-slate-300 relative min-h-[520px] text-slate-900 flex flex-col justify-between p-6 pt-3 pb-4"
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


            {/* Bloco Central do Slide */}
            {(() => {
              // 1. CAPA DA LIÇÃO (SLIDE 1)
              if (currentProjectorItem.type === 'cover') {
                const coverBadge = currentProjectorItem.badgeText || lesson.metadata.lessonNumber || 'LIÇÃO 10';
                const curSlideImg = projectorSlideImages[projectorIndex];
                return (
                  <div className="relative z-10 w-full h-full max-w-full px-3 md:px-6 mx-auto flex flex-col justify-between items-center my-auto py-2 font-gotham" style={{ zoom: currentSlideScale } as React.CSSProperties}>
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
                      {isLayoutEditMode && (
                        <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-black px-2 py-0.5 rounded-full z-50 pointer-events-none"
                          style={{ backgroundColor: '#06b6d4', color: '#0f172a', whiteSpace: 'nowrap' }}>
                          📄 Texto — arraste
                        </div>
                      )}
                      {curSlideImg && (
                        <div className="absolute inset-0 w-full h-full rounded-2xl overflow-hidden pointer-events-none z-0 opacity-25 md:opacity-30">
                          <img
                            src={curSlideImg}
                            alt="Ilustração do Slide"
                            className="w-full h-full object-cover filter drop-shadow-[0_12px_24px_rgba(0,0,0,0.8)]"
                          />
                        </div>
                      )}
                      <div className="w-full relative z-10 flex flex-col items-center justify-center text-center px-6 py-4 mt-12 md:mt-16 space-y-4 my-auto">
                        <h1 className="text-2xl md:text-4xl lg:text-5xl font-black text-yellow-400 uppercase tracking-tight leading-tight w-full max-w-full font-sans drop-shadow-sm" style={{ zoom: currentTitleScale } as React.CSSProperties}>
                          {currentProjectorItem.title}
                        </h1>
                        {currentProjectorItem.subtitle && (
                          <>
                            <div className="w-4/5 max-w-2xl border-b border-slate-200/40 my-3 mx-auto" />
                            <p className="text-base md:text-xl lg:text-2xl font-bold text-slate-200 w-full max-w-full font-sans leading-relaxed" style={{ zoom: currentBodyScale } as React.CSSProperties}>
                              {currentProjectorItem.subtitle}
                            </p>
                          </>
                        )}
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
                  {/* ── TÍTULO PRINCIPAL (ARRASTÁVEL) ── */}
                  <div
                    style={makeDragStyle(titlePos, 'title')}
                    onMouseDown={isLayoutEditMode ? (e) => handleElementDragStart(e, 'title') : undefined}
                    onTouchStart={isLayoutEditMode ? (e) => handleElementDragStart(e, 'title') : undefined}
                    className="w-full shrink-0"
                  >
                    {isLayoutEditMode && (
                      <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-black px-2 py-0.5 rounded-full z-50 pointer-events-none"
                        style={{ backgroundColor: '#f59e0b', color: '#0f172a', whiteSpace: 'nowrap' }}>
                        👑 Título — arraste
                      </div>
                    )}
                    <div className="w-full flex flex-col items-center justify-center font-gotham font-bold min-h-20 md:min-h-24 h-auto py-2 mt-5 md:mt-6 pt-2 pl-[18%] pr-6 my-auto">
                      <span className={`text-xl md:text-3xl lg:text-4xl font-bold text-white tracking-wider block text-center drop-shadow-sm ${isSubtopic ? 'normal-case' : 'uppercase'}`} style={{ fontFamily: "'Gotham', 'Gotham Medium', sans-serif", fontWeight: 700, textWrap: 'balance', WebkitTextWrap: 'balance', zoom: currentTitleScale } as React.CSSProperties}>
                        {formattedTitle}
                      </span>
                    </div>
                  </div>

                  {/* ── CONTEÚDO / CORPO (ARRASTÁVEL) ── */}
                  <div
                    style={makeDragStyle(bodyPos, 'body')}
                    onMouseDown={isLayoutEditMode ? (e) => handleElementDragStart(e, 'body') : undefined}
                    onTouchStart={isLayoutEditMode ? (e) => handleElementDragStart(e, 'body') : undefined}
                    className="w-full flex-1 flex flex-col"
                  >
                    {isLayoutEditMode && (
                      <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-black px-2 py-0.5 rounded-full z-50 pointer-events-none"
                        style={{ backgroundColor: '#06b6d4', color: '#0f172a', whiteSpace: 'nowrap' }}>
                        📄 Texto — arraste
                      </div>
                    )}
                  {(() => {
                    const curSlideImg = projectorSlideImages[projectorIndex];
                    return (
                      <div className="w-full flex-1 flex flex-col justify-center items-center relative">
                        {curSlideImg && (
                          <div className="absolute inset-0 w-full h-full rounded-2xl overflow-hidden pointer-events-none z-0 opacity-25 md:opacity-30 select-none">
                            <img
                              src={curSlideImg}
                              alt="Ilustração do Slide"
                              className="w-full h-full object-cover filter drop-shadow-[0_12px_24px_rgba(0,0,0,0.8)]"
                            />
                          </div>
                        )}
                        <div className="w-full relative z-10 flex-1 flex flex-col justify-center items-center">
                          {currentProjectorItem.type === 'leitura' ? (() => {
                            const parsed = parseBiblicalTextSections(currentProjectorItem.projetorText || '');
                            const displayRef = currentProjectorItem.reference || parsed.reference;

                            return (
                              <div className="w-full flex-1 flex flex-col justify-start items-center text-center space-y-3 py-2 my-auto max-h-[380px] md:max-h-[460px] overflow-y-auto custom-scrollbar pr-2 select-text touch-pan-y">
                                {displayRef && (
                                  <h3 className="text-2xl md:text-3xl lg:text-4xl font-black text-yellow-400 tracking-wide font-sans text-center mb-2 w-full shrink-0 sticky top-0 bg-slate-900/95 py-2.5 backdrop-blur-md z-20 rounded-2xl shadow-lg border border-amber-500/30" style={{ zoom: currentTitleScale } as React.CSSProperties}>
                                    {displayRef}
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

                                      {/* Título do Livro / Capítulo (ex: "Mateus 28", "Atos 1", "Efésios 2") */}
                                      {section.bookHeader && (
                                        <div className="w-full text-center mt-4 mb-3">
                                          <h4 className="text-xl md:text-3xl font-black text-amber-400 tracking-wide font-sans inline-block px-5 py-1.5 bg-amber-500/10 rounded-xl border border-amber-500/40 shadow-sm">
                                            {section.bookHeader}
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
                            <div className="w-full flex-1 flex flex-col justify-center items-center text-center py-4 my-auto mt-[5%]" style={{ zoom: currentBodyScale } as React.CSSProperties}>
                              <p className="text-xl md:text-2xl lg:text-3xl font-extrabold leading-relaxed text-white text-center font-sans break-words w-full max-w-full px-2">
                                "{currentProjectorItem.projetorText}"
                              </p>
                            </div>
                          ) : currentProjectorItem.type === 'verdades' ? (
                            <div className="w-full flex-1 flex flex-col justify-center items-start py-4 my-auto mt-[5%]" style={{ zoom: currentBodyScale } as React.CSSProperties}>
                              {currentProjectorItem.bulletPoints?.map((point, idx) => (
                                <div key={idx} className="w-full">
                                  <div className="flex items-start gap-3 py-2.5">
                                    <span className="mt-1 shrink-0 w-7 h-7 rounded-full bg-[#091b2c] flex items-center justify-center text-white text-xs font-black font-sans">{idx + 1}</span>
                                    <p className="text-base md:text-xl lg:text-2xl font-bold leading-snug text-white font-sans text-left break-words">
                                      {point}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            /* DEMAIS CARDS */
                            <div className="w-full flex-1 flex flex-col justify-center items-center text-center space-y-3 py-2 my-auto mt-[4%]">
                              {currentProjectorItem.type === 'topic_synopsis' ? (
                                <p className="text-xl md:text-2xl lg:text-3xl font-extrabold leading-relaxed text-white text-center font-sans break-words w-full max-w-full px-2 m-auto" style={{ zoom: currentBodyScale } as React.CSSProperties}>
                                  "{currentProjectorItem.projetorText}"
                                </p>
                              ) : currentProjectorItem.type === 'na_licao_anterior' ? (
                                <div className="max-h-[408px] overflow-y-auto no-scrollbar w-full px-4 flex flex-col items-center justify-start my-auto py-2" style={{ zoom: currentBodyScale } as React.CSSProperties}>
                                  <p className="font-sans text-center w-full max-w-full px-2 break-words leading-relaxed text-white font-extrabold text-lg md:text-2xl lg:text-3xl">
                                    {renderHL(currentProjectorItem.projetorText)}
                                  </p>
                                </div>
                              ) : currentProjectorItem.type === 'ponte_contextual' ? (
                                <div className="max-h-[408px] overflow-y-auto no-scrollbar w-full px-4 flex flex-col items-center justify-start my-auto py-2" style={{ zoom: currentBodyScale } as React.CSSProperties}>
                                  <p className={`font-sans text-center w-full max-w-full px-2 break-words leading-relaxed ${
                                    (currentProjectorItem.projetorText || '').length > 200
                                      ? 'text-base md:text-lg lg:text-2xl text-slate-100 font-extrabold'
                                      : 'text-xl md:text-2xl lg:text-3xl text-white font-extrabold'
                                  }`}>
                                    {renderHL(currentProjectorItem.projetorText)}
                                  </p>
                                </div>
                              ) : currentProjectorItem.type === 'subtopic_verses' ? (
                                <div className="max-h-[408px] overflow-y-auto no-scrollbar w-full px-4 flex flex-col items-center justify-start my-auto space-y-2 py-2">
                                  <h2 className="text-xl md:text-3xl lg:text-4xl font-black text-yellow-400 tracking-wide font-sans text-center mb-1 shrink-0" style={{ zoom: currentTitleScale } as React.CSSProperties}>
                                    📖 VAMOS LER A BÍBLIA
                                  </h2>
                                  <div className="w-4/5 max-w-2xl border-b border-slate-200/40 my-1 mx-auto shrink-0" />
                                  <p className="text-lg md:text-2xl lg:text-3xl font-black text-white tracking-wider font-sans text-center drop-shadow-md whitespace-pre-line leading-relaxed" style={{ zoom: currentBodyScale } as React.CSSProperties}>
                                    {renderHL(currentProjectorItem.projetorText)}
                                  </p>
                                </div>
                              ) : currentProjectorItem.type === 'subtopic_aplicacao' ? (
                                <div className="max-h-[408px] overflow-y-auto no-scrollbar w-full px-4 flex flex-col items-center justify-start my-auto space-y-2 py-2">
                                  <h2 className="text-xl md:text-3xl lg:text-4xl font-black text-yellow-400 tracking-wide font-sans text-center mb-1 shrink-0" style={{ zoom: currentTitleScale } as React.CSSProperties}>
                                    QUAL O ENSINAMENTO PRA MINHA VIDA?
                                  </h2>
                                  <div className="w-4/5 max-w-2xl border-b border-slate-200/40 my-1 mx-auto shrink-0" />
                                  <p className={`font-sans text-center w-full max-w-full px-2 break-words leading-relaxed ${
                                    (currentProjectorItem.projetorText || '').length > 180
                                      ? 'text-base md:text-xl lg:text-2xl text-slate-100 font-extrabold'
                                      : 'text-xl md:text-2xl lg:text-3xl text-white font-extrabold'
                                  }`} style={{ zoom: currentBodyScale } as React.CSSProperties}>
                                    {renderHL(currentProjectorItem.projetorText)}
                                  </p>
                                </div>
                              ) : currentProjectorItem.type === 'subtopic' ? (
                                <div className="max-h-[408px] overflow-y-auto no-scrollbar w-full px-4 flex flex-col items-center justify-start my-auto py-2" style={{ zoom: currentBodyScale } as React.CSSProperties}>
                                  <p className={`font-sans text-center w-full max-w-full px-2 break-words leading-relaxed ${
                                    (currentProjectorItem.projetorText || '').length > 200
                                      ? 'text-base md:text-lg lg:text-2xl text-slate-100 font-extrabold'
                                      : 'text-xl md:text-2xl lg:text-3xl text-white font-extrabold'
                                  }`}>
                                    {renderHL(currentProjectorItem.projetorText)}
                                  </p>
                                </div>
                              ) : (
                                <div className="w-full max-h-[408px] overflow-y-auto no-scrollbar px-4 flex flex-col items-center justify-start py-2 space-y-2 my-auto">
                                  {currentProjectorItem.ideiaText && (
                                    <h2 className="text-xl md:text-3xl lg:text-4xl font-black text-yellow-400 tracking-wide font-sans text-center mb-1 break-words shrink-0" style={{ zoom: currentTitleScale } as React.CSSProperties}>
                                      {currentProjectorItem.ideiaText}
                                    </h2>
                                  )}
                                  {currentProjectorItem.reference && (
                                    <h3 className="text-xl md:text-2xl lg:text-3xl font-black text-yellow-400 tracking-wide font-sans text-center mb-1 w-full shrink-0" style={{ zoom: currentTitleScale } as React.CSSProperties}>
                                      {currentProjectorItem.reference}
                                    </h3>
                                  )}
                                  {(currentProjectorItem.ideiaText || currentProjectorItem.reference) && currentProjectorItem.projetorText && (
                                    <div className="w-4/5 max-w-2xl border-b border-slate-200/40 my-1 mx-auto shrink-0" />
                                  )}
                                  {currentProjectorItem.projetorText && (
                                    <p className={`font-sans text-center w-full max-w-full px-2 break-words leading-relaxed whitespace-pre-line ${
                                      currentProjectorItem.type === 'enfase_palavra'
                                        ? 'italic text-yellow-100 text-lg md:text-2xl font-extrabold'
                                        : (currentProjectorItem.projetorText.length > 200
                                            ? 'text-base md:text-lg lg:text-xl text-slate-100 font-extrabold'
                                            : 'text-xl md:text-2xl lg:text-3xl text-white font-extrabold')
                                    }`} style={{ zoom: currentBodyScale } as React.CSSProperties}>
                                      {currentProjectorItem.type === 'enfase_palavra' ? <>“{renderHL(currentProjectorItem.projetorText)}”</> : renderHL(currentProjectorItem.projetorText)}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
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
        lesson={lesson}
      />
    </div>
  );
};

