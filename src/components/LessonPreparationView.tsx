import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { EBDLessonPreparation, EBDExtraSlide, ImageBox, TextBox } from '../types';
import { DEFAULT_IMAGE_BOX, GENERIC_BLUE_FRAME_SVG } from './FreeImageBox';
import { DEFAULT_TITLE_BOX, DEFAULT_BODY_BOX } from './FreeTextBox';
import { FileText, FileDown, Edit3 } from 'lucide-react';
import { callGeminiRaw } from '../services/geminiService';
import { exportAllSlidesPNGZipFromStage, exportTeacherGuideCleanPDF, exportTeacherGuideHTML } from '../services/exportService';
import { exportProjectorItemsToPowerPoint } from '../services/pptxService';
import { THEMES } from '../constants/themes';

import { QrCodeModal } from './QrCodeModal';
import { ImageCropModal } from './ImageCropModal';
import { ReplicateImageModal } from './ReplicateImageModal';
import { TeacherPreparationView } from './TeacherPreparationView';
import { ProjectorHeaderActions, ProjectorToolbar } from './ProjectorToolbar';
import { ProjectorStage } from './ProjectorStage';
import { optimizeImageBase64 } from '../services/shareService';
import { saveSlideImagesToStorage } from '../services/storageService';
import { getTheologicalKeywordExplanation } from '../constants/theologicalDictionary';
import { fetchVerseTextIfMissing } from '../services/biblicalTextParser';

interface TextHighlightEntry {
  text: string;
  color: string;
  style?: 'fill' | 'outline' | 'text' | 'underline' | 'dotted'; // default 'fill' for backward compat
  opacity?: number; // 0 to 100
  occurrenceIndex?: number; // índice da ocorrência selecionada para evitar pintar repetições
}

function hexToRgba(hex: string, opacityPercent: number = 100): string {
  if (!hex) return 'transparent';
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex;
  const cleanHex = hex.replace('#', '');
  let r = 0, g = 0, b = 0;
  if (cleanHex.length === 3) {
    r = parseInt(cleanHex[0] + cleanHex[0], 16) || 0;
    g = parseInt(cleanHex[1] + cleanHex[1], 16) || 0;
    b = parseInt(cleanHex[2] + cleanHex[2], 16) || 0;
  } else if (cleanHex.length === 6) {
    r = parseInt(cleanHex.slice(0, 2), 16) || 0;
    g = parseInt(cleanHex.slice(2, 4), 16) || 0;
    b = parseInt(cleanHex.slice(4, 6), 16) || 0;
  }
  const alpha = Math.max(0, Math.min(1, opacityPercent / 100));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
type SlideHighlights = Record<number, TextHighlightEntry[]>;
const HL_STORAGE_KEY = 'mega_ebd_text_highlights_v2';

function getLessonHighlightKey(lesson?: EBDLessonPreparation | null): string {
  if (!lesson) return HL_STORAGE_KEY;
  const idOrTitle = lesson.metadata?.title || lesson.metadata?.lessonNumber || 'active_lesson';
  return `mega_ebd_hl_${idOrTitle.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
}

function loadSlideHighlights(lesson?: EBDLessonPreparation | null): SlideHighlights {
  // 1. Prioridade absoluta: textHighlights embutido no próprio objeto da lição
  if (lesson?.textHighlights && typeof lesson.textHighlights === 'object' && Object.keys(lesson.textHighlights).length > 0) {
    return lesson.textHighlights as SlideHighlights;
  }
  // 2. Storage local específico da lição (não compartilhado com outras lições)
  try {
    const key = getLessonHighlightKey(lesson);
    const s = localStorage.getItem(key);
    if (s) return JSON.parse(s);
  } catch { /* ignore */ }
  // 3. Fallback controlado do storage legado apenas se for a lição ativa e tiver chave legada
  try {
    const s = localStorage.getItem(HL_STORAGE_KEY);
    return s ? JSON.parse(s) : {};
  } catch { return {}; }
}

function persistSlideHighlights(h: SlideHighlights, lesson?: EBDLessonPreparation | null) {
  try {
    const key = getLessonHighlightKey(lesson);
    localStorage.setItem(key, JSON.stringify(h));
  } catch {}
  try {
    localStorage.setItem(HL_STORAGE_KEY, JSON.stringify(h));
  } catch {}
}

/**
 * Returns React nodes with highlight <mark> elements injected inline.
 * Matching marks occurrences safely, avoiding fragmentation of words for short needles.
 */
function applyHighlightsToText(
  text: string,
  entries: TextHighlightEntry[],
  forcedTextColor: string = '#000000'
): React.ReactNode {
  if (!text) return text;
  if (!entries || !entries.length) return <span style={{ color: forcedTextColor }}>{text}</span>;

  // Build sorted, non-overlapping intervals
  const intervals: Array<{ s: number; e: number; color: string; style: 'fill' | 'outline' | 'text' | 'underline' | 'dotted'; opacity?: number }> = [];
  const lowerText = text.toLowerCase();
  for (const h of entries) {
    if (!h.text) continue;
    // O texto selecionado vem como exibido (ex.: CAIXA ALTA via CSS); compara sem diferenciar maiúsculas e espaços
    const needle = h.text.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!needle) continue;

    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
    // Se for uma única palavra curta (ex: 'a', 'da', 'd', 'no' <= 4 letras sem espaços),
    // usa limites de palavras unicode para NÃO fatiar letras dentro de outras palavras (ex: 'incredulidade' virando 'incre[d]uli[da][d]e')
    let pattern: RegExp;
    const isSingleWord = !needle.includes(' ');
    if (isSingleWord && needle.length <= 4) {
      // Evita lookbehind para compatibilidade total com Safari/iOS < 16.4
      pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])(${escaped})(?=$|[^\\p{L}\\p{N}_])`, 'gui');
    } else {
      pattern = new RegExp(escaped, 'gi');
    }

    let m: RegExpExecArray | null;
    let matchIdx = 0;
    while ((m = pattern.exec(lowerText)) !== null) {
      const prefixOffset = isSingleWord && needle.length <= 4 && m[1] ? m[1].length : 0;
      const matchedText = isSingleWord && needle.length <= 4 && m[2] ? m[2] : m[0];
      const idx = m.index + prefixOffset;
      const len = matchedText.length;

      // Se h.occurrenceIndex estiver definido, aplica APENAS nessa ocorrência exata!
      if (h.occurrenceIndex === undefined || h.occurrenceIndex === matchIdx) {
        const overlaps = intervals.some((iv) => idx < iv.e && idx + len > iv.s);
        if (!overlaps) intervals.push({ s: idx, e: idx + len, color: h.color, style: h.style ?? 'fill', opacity: h.opacity });
      }

      matchIdx++;
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
    } else if (iv.style === 'underline') {
      nodes.push(
        <span
          key={`m${i}`}
          style={{
            color: forcedTextColor,
            textDecoration: 'underline',
            textDecorationColor: iv.color,
            textDecorationThickness: '3.5px',
            textUnderlineOffset: '4px',
            fontWeight: 'inherit',
            display: 'inline',
          }}
        >
          {text.slice(iv.s, iv.e)}
        </span>
      );
    } else if (iv.style === 'dotted') {
      nodes.push(
        <span
          key={`m${i}`}
          style={{
            color: forcedTextColor,
            textDecoration: 'underline',
            textDecorationStyle: 'dashed',
            textDecorationColor: iv.color,
            textDecorationThickness: '2.5px',
            textUnderlineOffset: '5px',
            fontWeight: 'inherit',
            display: 'inline',
          }}
        >
          {text.slice(iv.s, iv.e)}
        </span>
      );
    } else if (iv.style === 'outline') {
      nodes.push(
        <mark
          key={`m${i}`}
          style={{
            background: 'transparent',
            color: forcedTextColor,
            borderRadius: '4px',
            padding: '1px 4px',
            fontWeight: 'inherit',
            display: 'inline',
            outline: `3px solid ${iv.color}`,
            outlineOffset: '1px',
          }}
        >
          {text.slice(iv.s, iv.e)}
        </mark>
      );
    } else {
      const isDark = (() => {
        const hex = iv.color.replace('#', '');
        if (hex.length === 3) {
          const r = parseInt(hex[0] + hex[0], 16) || 0;
          const g = parseInt(hex[1] + hex[1], 16) || 0;
          const b = parseInt(hex[2] + hex[2], 16) || 0;
          return (0.299 * r + 0.587 * g + 0.114 * b) < 145;
        }
        if (hex.length === 6) {
          const r = parseInt(hex.slice(0, 2), 16) || 0;
          const g = parseInt(hex.slice(2, 4), 16) || 0;
          const b = parseInt(hex.slice(4, 6), 16) || 0;
          return (0.299 * r + 0.587 * g + 0.114 * b) < 145;
        }
        return false;
      })();
      const effectiveOpacity = (iv as any).opacity ?? 100;
      const bgRgba = hexToRgba(iv.color, effectiveOpacity);
      const markTextColor = isDark ? '#ffffff' : '#000000';

      nodes.push(
        <mark
          key={`m${i}`}
          style={{
            background: bgRgba,
            color: markTextColor,
            borderRadius: '6px',
            padding: '2px 6px',
            fontWeight: 'inherit',
            display: 'inline',
          }}
        >
          {text.slice(iv.s, iv.e)}
        </mark>
      );
    }
    cursor = iv.e;
  });
  if (cursor < text.length) nodes.push(<span key="tend" style={{ color: forcedTextColor }}>{text.slice(cursor)}</span>);
  return <>{nodes}</>;
}





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

  // Reescreve sem lookbehind para total compatibilidade com Safari/iOS < 16.4
  const headerRegex = new RegExp(`(^|\\n|\\s{2,}|[\\.\\!\\?]"?\\s+|\\s)(${bookNamePattern}\\.?\\s+\\d{1,3}(?:[\\.\\:\\,]\\d{1,3}(?:[\\-\\–\\—]\\d{1,3})?)?)(?=\\s*[:\\-\\—\\n]|\\s+\\d{1,3}|\\s*$)`, 'gi');
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
    const headerStr = (hMatch[2] || hMatch[1]).trim();
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
    if (initial?.palavraChave?.palavra) {
      const exp = getTheologicalKeywordExplanation(initial.palavraChave.palavra, initial.palavraChave.explicacao);
      if (exp && exp !== initial.palavraChave.explicacao) {
        initial = {
          ...initial,
          palavraChave: {
            ...initial.palavraChave,
            explicacao: exp
          }
        };
      }
    }
    return initial;
  });

  const lastSyncedRef = useRef<EBDLessonPreparation | null>(null);

  const updateLesson = useCallback((updater: (prev: EBDLessonPreparation) => EBDLessonPreparation) => {
    setLesson(prev => {
      const next = updater(prev);
      lastSyncedRef.current = next;
      queueMicrotask(() => {
        onUpdateLesson(next);
      });
      return next;
    });
  }, [onUpdateLesson]);

  const [internalActiveTab] = useState<'professor' | 'projetor'>('projetor');
  const activeTab = activeTabProp ?? internalActiveTab;
  const [isEditMode, setIsEditMode] = useState<boolean>(false);

  // Garante que todos os versículos de apoio tenham o texto bíblico literal preenchido para exibição no slide
  useEffect(() => {
    let isCancelled = false;
    const ensureVerseTexts = async () => {
      if (!lesson.topicos || lesson.topicos.length === 0) return;
      let hasMissing = false;

      for (const t of lesson.topicos) {
        for (const s of t.subtopicos || []) {
          for (const v of s.versiculos || []) {
            if (v.reference && (!v.text || !v.text.trim())) {
              hasMissing = true;
              break;
            }
          }
          if (hasMissing) break;
        }
        if (hasMissing) break;
      }

      if (!hasMissing) return;

      const updatedTopicos = await Promise.all(
        lesson.topicos.map(async (topico) => {
          const updatedSubs = await Promise.all(
            (topico.subtopicos || []).map(async (sub) => {
              if (!sub.versiculos || sub.versiculos.length === 0) return sub;
              let subChanged = false;
              const updatedVerses = await Promise.all(
                sub.versiculos.map(async (v) => {
                  if (v.reference && (!v.text || !v.text.trim())) {
                    const fetchedText = await fetchVerseTextIfMissing(v.reference);
                    if (fetchedText) {
                      subChanged = true;
                      return { ...v, text: fetchedText };
                    }
                  }
                  return v;
                })
              );
              return subChanged ? { ...sub, versiculos: updatedVerses } : sub;
            })
          );
          return { ...topico, subtopicos: updatedSubs };
        })
      );

      if (!isCancelled) {
        updateLesson(prev => ({ ...prev, topicos: updatedTopicos }));
      }
    };

    ensureVerseTexts();
    return () => { isCancelled = true; };
  }, [lesson.topicos, updateLesson]);

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

  // Estado de escalas de fonte individuais por slide (indexadas pelo projectorIndex ou item.id)
  const [slideFontScales, setSlideFontScales] = useState<Record<string | number, number>>(() => {
    return lessonData.slideFontScales || {};
  });

  // Escalas de fonte específicas para o TÍTULO de cada slide
  const [slideTitleFontScales, setSlideTitleFontScales] = useState<Record<string | number, number>>(() => {
    return lessonData.slideTitleFontScales || {};
  });

  const [bodyTextColor, setBodyTextColor] = useState<'black' | 'white'>(() => {
    return lessonData.bodyTextColor || 'black';
  });

  const toggleBodyTextColor = useCallback(() => {
    setBodyTextColor(prev => {
      const next = prev === 'black' ? 'white' : 'black';
      updateLesson(l => ({ ...l, bodyTextColor: next }));
      return next;
    });
  }, [updateLesson]);

  // Escalas de fonte específicas para o TEXTO / CORPO de cada slide
  const [slideBodyFontScales, setSlideBodyFontScales] = useState<Record<string | number, number>>(() => {
    return lessonData.slideBodyFontScales || {};
  });

  const [slideTextOverrides, setSlideTextOverrides] = useState<Record<string | number, { title?: string; subtitle?: string; text?: string }>>(() => {
    return lessonData.slideTextOverrides || {};
  });

  // Largura personalizada da caixa de texto por slide (30% a 100%)
  const [slideBodyWidths, setSlideBodyWidths] = useState<Record<string | number, number>>(() => {
    return lessonData.slideBodyWidths || {};
  });

  // Escala padrão: sincronizada com a padronização oficial da caixa de texto
  const defaultBodyScale = DEFAULT_BODY_BOX.scale;
  const defaultTitleScale = DEFAULT_TITLE_BOX.scale;

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
    const textLen = text.length;
    const colorClass = bodyTextColor === 'black' ? 'text-black font-black' : 'text-white font-extrabold';

    if (isEnfase) {
      if (textLen > 280) {
        return `${bodyTextColor === 'black' ? 'italic text-black font-black text-base md:text-lg lg:text-xl' : 'italic text-yellow-100 font-extrabold text-base md:text-lg lg:text-xl'} leading-snug`;
      }
      return `${bodyTextColor === 'black' ? 'italic text-black font-black text-base md:text-xl lg:text-2xl' : 'italic text-yellow-100 font-extrabold text-base md:text-xl lg:text-2xl'} leading-normal`;
    }

    if (textLen > 480) {
      return `${bodyTextColor === 'black' ? 'text-black font-black' : 'text-slate-100 font-extrabold'} text-sm md:text-lg lg:text-xl leading-snug md:leading-normal`;
    }
    if (textLen > 200) {
      return `${bodyTextColor === 'black' ? 'text-black font-black' : 'text-slate-100 font-extrabold'} text-base md:text-xl lg:text-2xl leading-relaxed`;
    }
    return `${colorClass} text-lg md:text-2xl lg:text-3xl leading-relaxed`;
  }, [bodyTextColor]);

  // Caixas delimitadoras livres de imagens estilo Corel Draw (x, y, w, h, rot, fit, layer, flipX)
  const [slideImageBoxes, setSlideImageBoxes] = useState<Record<string, ImageBox>>(() => {
    return lessonData.slideImageBoxes || {};
  });

  const [imageSelected, setImageSelected] = useState<boolean>(false);
  const currentSlideIdRef = useRef<string>(String(projectorIndex));

  const commitBox = useCallback((b: ImageBox) => {
    const key = String(projectorIndex);
    const slideId = currentSlideIdRef.current;
    setSlideImageBoxes(prev => {
      const next = { ...prev, [key]: b };
      if (slideId) next[slideId] = b;
      try { localStorage.setItem('mega_ebd_slide_image_boxes', JSON.stringify(next)); } catch {}
      return next;
    });
    updateLesson(l => {
      const prevBoxes = l.slideImageBoxes ?? {};
      const nextBoxes = { ...prevBoxes, [key]: b };
      if (slideId) nextBoxes[slideId] = b;
      return {
        ...l,
        slideImageBoxes: nextBoxes,
      };
    });
  }, [projectorIndex, updateLesson]);

  // Estado de Imagem Copiada para Copiar e Colar entre slides
  const [copiedImage, setCopiedImage] = useState<{
    src: string;
    box: ImageBox;
    crop?: any;
  } | null>(null);
  const [isReplicateModalOpen, setIsReplicateModalOpen] = useState<boolean>(false);
  const [imageToast, setImageToast] = useState<string | null>(null);

  // Caixas delimitadoras livres de títulos estilo Corel Draw (x, y, w, rot, scale)
  const [slideTitleBoxes, setSlideTitleBoxes] = useState<Record<string, TextBox>>(() => {
    try {
      const saved = localStorage.getItem('mega_ebd_slide_title_boxes');
      const fromLocal = saved ? JSON.parse(saved) : {};
      return { ...fromLocal, ...((lessonData.slideTitleBoxes as Record<string, TextBox>) || {}) };
    } catch {
      return (lessonData.slideTitleBoxes as Record<string, TextBox>) || {};
    }
  });
  const [titleSelected, setTitleSelected] = useState<boolean>(false);

  // Caixas delimitadoras livres de texto/corpo estilo Corel Draw (x, y, w, rot, scale)
  const [slideBodyBoxes, setSlideBodyBoxes] = useState<Record<string, TextBox>>(() => {
    try {
      const saved = localStorage.getItem('mega_ebd_slide_body_boxes');
      const fromLocal = saved ? JSON.parse(saved) : {};
      return { ...fromLocal, ...((lessonData.slideBodyBoxes as Record<string, TextBox>) || {}) };
    } catch {
      return (lessonData.slideBodyBoxes as Record<string, TextBox>) || {};
    }
  });
  const [bodySelected, setBodySelected] = useState<boolean>(false);
  const [subSelected, setSubSelected] = useState<boolean>(false);

  useEffect(() => {
    setImageSelected(false);
    setTitleSelected(false);
    setBodySelected(false);
    setSubSelected(false);
  }, [projectorIndex]);


  useEffect(() => {
    if (lastSyncedRef.current === lessonData) return;
    lastSyncedRef.current = lessonData;

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
    if (lessonData.slideImageBoxes) setSlideImageBoxes(lessonData.slideImageBoxes);
    if (lessonData.slideTitleBoxes) setSlideTitleBoxes(lessonData.slideTitleBoxes as Record<string, TextBox>);
    if (lessonData.slideBodyBoxes) setSlideBodyBoxes(lessonData.slideBodyBoxes as Record<string, TextBox>);
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

  // ── POSICIONAMENTO LIVRE DE ELEMENTOS NO SLIDE ──────────────────────────────
  const [isLayoutEditMode, setIsLayoutEditMode] = useState(false);

  // ── TESTE DE PROPORÇÃO DE SLIDE (16:9 PADRÃO vs 4:3 TESTE) ─────────────────
  const [testStageAspect, setTestStageAspect] = useState<'16:9' | '4:3'>('16:9');
  const toggleTestStageAspect = useCallback(() => {
    setTestStageAspect(prev => (prev === '16:9' ? '4:3' : '16:9'));
  }, []);

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

  const [slideTitlePositions, setSlideTitlePositions] = useState<Record<string | number, { x: number; y: number }>>(() => {
    return lessonData.slideTitlePositions || {};
  });

  const [slideBodyPositions, setSlideBodyPositions] = useState<Record<string | number, { x: number; y: number }>>(() => {
    return lessonData.slideBodyPositions || {};
  });

  const [slideImagePositions, setSlideImagePositions] = useState<Record<string | number, { x: number; y: number }>>(() => {
    return lessonData.slideImagePositions || {};
  });

  const [slideImageScales, setSlideImageScales] = useState<Record<string | number, number>>(() => {
    return lessonData.slideImageScales || {};
  });

  const [slideImageFits, setSlideImageFits] = useState<Record<string | number, 'cover' | 'contain'>>(() => {
    return lessonData.slideImageFits || {};
  });

  // Largura e Altura do Recipiente da Imagem por slide (% da largura/altura do palco)
  const [slideImageWidths, setSlideImageWidths] = useState<Record<string | number, number>>(() => {
    return lessonData.slideImageWidths || {};
  });

  const [slideImageHeights, setSlideImageHeights] = useState<Record<string | number, number>>(() => {
    return lessonData.slideImageHeights || {};
  });

  // Corte Fluido Estilo Canva por slide (panX, panY em %, zoom de 1.0 a 3.0)
  const [slideImageCrops, setSlideImageCrops] = useState<Record<string | number, { panX: number; panY: number; zoom: number }>>(() => {
    return lessonData.slideImageCrops || {};
  });

  const [slideImageBorders, setSlideImageBorders] = useState<Record<string | number, 'white' | 'thin' | 'thick' | 'none'>>(() => {
    return lessonData.slideImageBorders || {};
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
  const imageFit = slideImageFits[projectorIndex] ?? 'cover';
  const isTitleMoved = slideTitlePositions[projectorIndex] !== undefined || slideTitleBoxes[String(projectorIndex)] !== undefined || (currentSlideIdRef.current ? slideTitleBoxes[currentSlideIdRef.current] !== undefined : false);
  const isBodyMoved  = slideBodyPositions[projectorIndex]  !== undefined;
  const isImageMoved = slideImagePositions[projectorIndex] !== undefined || slideImageBoxes[String(projectorIndex)] !== undefined || (currentSlideIdRef.current ? slideImageBoxes[currentSlideIdRef.current] !== undefined : false);

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

  // Ref de redimensionamento da altura e limites (superior/inferior) do recipiente da imagem
  const imageHeightResizeStateRef = useRef<{
    active: boolean;
    side: 'top' | 'bottom';
    startClientY: number;
    startHeight: number;
    startPosY: number;
    stageHeight: number;
  } | null>(null);

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

        const newPanX = Math.max(-100, Math.min(100, Math.round((startPanX + deltaPanX) * 10) / 10));
        const newPanY = Math.max(-100, Math.min(100, Math.round((startPanY + deltaPanY) * 10) / 10));

        setSlideImageCrops(prev => {
          const curCrop = prev[projectorIndex] ?? { panX: 0, panY: 0, zoom: 1.0 };
          return {
            ...prev,
            [projectorIndex]: {
              ...curCrop,
              panX: newPanX,
              panY: newPanY,
            }
          };
        });
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
      resetTitleBox();
    } else if (kind === 'body') {
      setSlideBodyPositions(prev => {
        const next = { ...prev };
        delete next[projectorIndex];
        try { localStorage.setItem('mega_ebd_body_positions', JSON.stringify(next)); } catch {}
        updateLesson(l => ({ ...l, slideBodyPositions: next }));
        return next;
      });
    } else {
      const key = String(projectorIndex);
      const slideId = currentSlideIdRef.current;
      setSlideImagePositions(prev => {
        const next = { ...prev };
        delete next[projectorIndex];
        try { localStorage.setItem('mega_ebd_image_positions', JSON.stringify(next)); } catch {}
        updateLesson(l => ({ ...l, slideImagePositions: next }));
        return next;
      });
      setSlideImageBoxes(prev => {
        const next = { ...prev };
        delete next[key];
        if (slideId) delete next[slideId];
        try { localStorage.setItem('mega_ebd_slide_image_boxes', JSON.stringify(next)); } catch {}
        return next;
      });
      updateLesson(l => {
        const nextBoxes = { ...(l.slideImageBoxes ?? {}) };
        delete nextBoxes[key];
        if (slideId) delete nextBoxes[slideId];
        return { ...l, slideImageBoxes: nextBoxes };
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
      commitBox({ x: 3, y: 18, w: 46, h: 78, rot: 0, fit: 'cover', layer: 'front', flipX: false });
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
      commitBox(DEFAULT_IMAGE_BOX);
      resetSlideBodyWidth();
      resetSlidePosition('body');
      resetSlidePosition('image');
      resetSlideImageScale();
      resetSlideImageWidth();
    } else {
      // Ativa: Texto na Esquerda (48%), Imagem na Direita (48%)
      commitBox({ x: 51, y: 18, w: 46, h: 78, rot: 0, fit: 'cover', layer: 'front', flipX: false });
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
  }, [projectorIndex, slideBodyWidths, slideBodyPositions, updateLesson, resetSlideBodyWidth, resetSlidePosition, resetSlideImageScale, resetSlideImageWidth, commitBox]);

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
        pointerEvents: 'auto',
        userSelect: isLayoutEditMode ? 'none' : 'text',
        ...(isLayoutEditMode ? {
          cursor: 'grab',
          outline: `2px dashed ${outlineColor}`,
          outlineOffset: '4px',
          borderRadius: '12px',
          touchAction: 'none',
        } : {}),
      };
    }

    return {
      transform: `translate(${offsetX}px, ${offsetY}px)`,
      position: 'relative',
      zIndex: isLayoutEditMode ? 50 : 30,
      pointerEvents: 'auto',
      userSelect: isLayoutEditMode ? 'none' : 'text',
      ...(isLayoutEditMode ? {
        cursor: 'grab',
        outline: `2px dashed ${outlineColor}`,
        outlineOffset: '2px',
        borderRadius: '10px',
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

  const updateTopicSinopse = (topicIdx: number, val: string) => {
    updateLesson(prev => {
      const topicos = [...prev.topicos];
      topicos[topicIdx] = { ...topicos[topicIdx], sinopse: val };
      return { ...prev, topicos };
    });
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
  const updateConclusaoField = (field: keyof EBDLessonPreparation['conclusao'], val: any) => {
    updateLesson(prev => ({
      ...prev,
      conclusao: { ...prev.conclusao, [field]: val }
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



  // ── Inline Text Highlight State ──────────────────────────────────
  const [slideHighlights, setSlideHighlights] = useState<SlideHighlights>(() => loadSlideHighlights(lessonData));
  const [hlToolbar, setHlToolbar] = useState<{ x: number; y: number; text: string; occurrenceIndex?: number } | null>(null);

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
    persistSlideHighlights(next, lessonData);
    updateLesson(prev => ({
      ...prev,
      textHighlights: next,
    }));
  }, [lessonData, updateLesson]);

  // Sincroniza se a lição mudar externamente ou carregar com textHighlights
  useEffect(() => {
    if (lessonData?.textHighlights && typeof lessonData.textHighlights === 'object') {
      setSlideHighlights(lessonData.textHighlights as SlideHighlights);
    }
  }, [lessonData]);

  /** Wraps text with inline highlight marks for the current projector slide. */
  const renderHL = useCallback((text: string | undefined, forcedColor?: string): React.ReactNode => {
    if (!text) return text;
    const entries = slideHighlights[projectorIndex] || [];
    return applyHighlightsToText(text, entries, forcedColor ?? (bodyTextColor === 'black' ? '#000000' : '#ffffff'));
  }, [slideHighlights, projectorIndex, bodyTextColor]);

  const applyHighlight = useCallback((color: string, hlStyle: 'fill' | 'outline' | 'text' | 'underline' | 'dotted' = 'fill', opacity: number = 100) => {
    if (!hlToolbar) return;
    const current = slideHighlights[projectorIndex] || [];
    const occ = hlToolbar.occurrenceIndex;
    const filtered = current.filter((h) => !(h.text.toLowerCase() === hlToolbar.text.toLowerCase() && h.occurrenceIndex === occ));
    saveHighlights({ ...slideHighlights, [projectorIndex]: [...filtered, { text: hlToolbar.text, color, style: hlStyle, opacity, occurrenceIndex: occ }] });
    setHlToolbar(null);
    window.getSelection()?.removeAllRanges();
  }, [hlToolbar, slideHighlights, projectorIndex, saveHighlights]);

  const removeHighlight = useCallback(() => {
    if (!hlToolbar) return;
    const current = slideHighlights[projectorIndex] || [];
    const occ = hlToolbar.occurrenceIndex;
    saveHighlights({
      ...slideHighlights,
      [projectorIndex]: current.filter((h) => !(h.text.toLowerCase() === hlToolbar.text.toLowerCase() && (occ === undefined || h.occurrenceIndex === occ)))
    });
    setHlToolbar(null);
    window.getSelection()?.removeAllRanges();
  }, [hlToolbar, slideHighlights, projectorIndex, saveHighlights]);

  /**
   * Limpa TODAS as cores e marcações de texto exclusivamente do slide atual.
   * Não altera nem limpa nenhum dos outros slides da lição.
   */
  const clearCurrentSlideHighlights = useCallback(() => {
    const next = { ...slideHighlights };
    delete next[projectorIndex];
    saveHighlights(next);

    // Limpa também do storage legado para não reaparecer
    try {
      const legacy = localStorage.getItem(HL_STORAGE_KEY);
      if (legacy) {
        const parsed = JSON.parse(legacy);
        delete parsed[projectorIndex];
        localStorage.setItem(HL_STORAGE_KEY, JSON.stringify(parsed));
      }
    } catch {}

    setHlToolbar(null);
    window.getSelection()?.removeAllRanges();
  }, [slideHighlights, projectorIndex, saveHighlights]);

  const hasSlideHighlights = Boolean(slideHighlights[projectorIndex] && slideHighlights[projectorIndex].length > 0);

  const handleSlideMouseUp = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { setHlToolbar(null); return; }
    const text = sel.toString().trim();
    if (!text) { setHlToolbar(null); return; }
    const range = sel.getRangeAt(0);
    const stageEl = projectorStageRef.current;
    if (!stageEl || !stageEl.contains(range.commonAncestorContainer)) { setHlToolbar(null); return; }
    const rect = range.getBoundingClientRect();

    // 🎯 Calcula exatamente qual ocorrência daquela palavra foi selecionada
    let occurrenceIndex = 0;
    try {
      const preRange = range.cloneRange();
      const parentBlock = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? (range.commonAncestorContainer as HTMLElement)
        : range.commonAncestorContainer.parentElement;
      const rootContainer = parentBlock?.closest('.text-layer') || parentBlock?.closest('[data-text-box]') || stageEl;

      preRange.selectNodeContents(rootContainer);
      preRange.setEnd(range.startContainer, range.startOffset);
      const textBefore = preRange.toString().toLowerCase();
      const needle = text.toLowerCase().replace(/\s+/g, ' ').trim();

      if (needle) {
        const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
        const isSingleWord = !needle.includes(' ');
        let pattern: RegExp;
        if (isSingleWord && needle.length <= 4) {
          pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])(${escaped})(?=$|[^\\p{L}\\p{N}_])`, 'gui');
        } else {
          pattern = new RegExp(escaped, 'gi');
        }

        let m: RegExpExecArray | null;
        let count = 0;
        while ((m = pattern.exec(textBefore)) !== null) {
          const prefixOffset = isSingleWord && needle.length <= 4 && m[1] ? m[1].length : 0;
          const idx = m.index + prefixOffset;
          count++;
          pattern.lastIndex = idx + 1;
        }
        occurrenceIndex = count;
      }
    } catch {
      occurrenceIndex = 0;
    }

    setHlToolbar({ text, occurrenceIndex, x: rect.left + rect.width / 2, y: rect.top });
  }, []);


  // Estados de Regeneração Seletiva e Notificações
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [isQrModalOpen, setIsQrModalOpen] = useState<boolean>(false);

  const projectorStageRef = useRef<HTMLDivElement>(null);

  const [projectorSlideImages, setProjectorSlideImages] = useState<Record<string | number, string>>(() => {
    return lessonData.projectorSlideImages || {};
  });
  const [customBg, setCustomBg] = useState<string | null>(() => {
    return lessonData.customBg || null;
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
      const key = String(projectorIndex);
      const slideId = currentSlideIdRef.current;
      setProjectorSlideImages(prev => {
        const next = { ...prev, [projectorIndex]: opt, [key]: opt };
        if (slideId) next[slideId] = opt;
        try { localStorage.setItem('mega_ebd_projector_slide_images', JSON.stringify(next)); } catch {}
        saveSlideImagesToStorage(next).catch(() => {});
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

  const handleProcessImageFile = useCallback(async (file: File) => {
    const reader = new FileReader();
    reader.onload = async ev => {
      const raw = ev.target?.result as string;
      if (raw) {
        const d = await optimizeImageBase64(raw, 1280, 0.82);
        const key = String(projectorIndex);
        const slideId = currentSlideIdRef.current;
        setProjectorSlideImages(prev => {
          const next = { ...prev, [projectorIndex]: d, [key]: d };
          if (slideId) next[slideId] = d;
          try { localStorage.setItem('mega_ebd_projector_slide_images', JSON.stringify(next)); } catch {}
          saveSlideImagesToStorage(next).catch(() => {});
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
  }, [projectorIndex, updateLesson]);

  const handleSlideImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleProcessImageFile(file);
    e.target.value = '';
  };

  const handleRemoveSlideImage = () => {
    const key = String(projectorIndex);
    const slideId = currentSlideIdRef.current;
    setProjectorSlideImages(prev => {
      const next = { ...prev };
      delete next[projectorIndex];
      delete next[key];
      if (slideId) delete next[slideId];
      try { localStorage.setItem('mega_ebd_projector_slide_images', JSON.stringify(next)); } catch {}
      saveSlideImagesToStorage(next).catch(() => {});
      updateLesson(l => ({ ...l, projectorSlideImages: next }));
      return next;
    });
    setSlideImageBoxes(prev => {
      const next = { ...prev };
      delete next[key];
      if (slideId) delete next[slideId];
      try { localStorage.setItem('mega_ebd_slide_image_boxes', JSON.stringify(next)); } catch {}
      return next;
    });
    updateLesson(l => {
      const nextBoxes = { ...(l.slideImageBoxes ?? {}) };
      delete nextBoxes[key];
      if (slideId) delete nextBoxes[slideId];
      return { ...l, slideImageBoxes: nextBoxes };
    });
  };

  const handleInsertSampleImage = useCallback(() => {
    const key = String(projectorIndex);
    const slideId = currentSlideIdRef.current;
    setProjectorSlideImages(prev => {
      const next = { ...prev, [projectorIndex]: GENERIC_BLUE_FRAME_SVG, [key]: GENERIC_BLUE_FRAME_SVG };
      if (slideId) next[slideId] = GENERIC_BLUE_FRAME_SVG;
      try { localStorage.setItem('mega_ebd_projector_slide_images', JSON.stringify(next)); } catch {}
      saveSlideImagesToStorage(next).catch(() => {});
      updateLesson(l => ({ ...l, projectorSlideImages: next }));
      return next;
    });
    commitBox(DEFAULT_IMAGE_BOX);
    setImageSelected(true);
  }, [projectorIndex, commitBox, updateLesson]);

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

        // 2. SLIDE DE BASE BÍBLICA DE APOIO (VAMOS LER A BÍBLIA - REFERÊNCIA + TEXTO LITERAL DO VERSÍCULO)
        if (s.versiculos && s.versiculos.length > 0) {
          const textoVersiculosFormatado = s.versiculos
            .map(v => {
              const ref = v.reference ? `📖 ${v.reference.replace(/^[📖\s*-]+/, '').trim()}` : '';
              const cleanTxt = (v.text || '').replace(/^[“"']+|[”"']+$/g, '').trim();
              if (ref && cleanTxt) {
                return `${ref}\n"${cleanTxt}"`;
              }
              return ref || (cleanTxt ? `"${cleanTxt}"` : '');
            })
            .filter(Boolean)
            .join('\n\n');

          if (textoVersiculosFormatado) {
            items.push({
              id: `subtopic_verses_${tIdx}_${sIdx}`,
              type: 'subtopic_verses',
              title: 'VAMOS LER A BÍBLIA',
              badgeText: 'VAMOS LER A BÍBLIA',
              ideiaText: '📖 VAMOS LER A BÍBLIA',
              projetorText: textoVersiculosFormatado,
              imagePrompt: s.imagePrompt,
              onUpdateText: (val: string) => {
                const currentVerses = s.versiculos || [];
                if (currentVerses.length > 0) {
                  const lines = val.split('\n').map(l => l.trim()).filter(Boolean);
                  const firstRef = lines.find(l => l.startsWith('📖'))?.replace(/^📖\s*/, '') || currentVerses[0].reference;
                  const bodyLines = lines.filter(l => !l.startsWith('📖')).join(' ').replace(/^[“"']+|[”"']+$/g, '').trim();
                  const updated = [...currentVerses];
                  updated[0] = {
                    ...updated[0],
                    reference: firstRef || updated[0].reference,
                    text: bodyLines || updated[0].text
                  };
                  updateSubtopicField(tIdx, sIdx, 'versiculos', updated);
                }
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
  const currentSlideId = currentProjectorItem?.id || String(projectorIndex);
  currentSlideIdRef.current = currentSlideId;

  // ── 1. CAIXA LIVRE DE TÍTULO PRINCIPAL (COREL DRAW) ──
  const curTitleBox: TextBox = React.useMemo(() => {
    const byId = currentSlideId ? slideTitleBoxes[currentSlideId] : undefined;
    if (byId) return byId;

    const byIdx = slideTitleBoxes[String(projectorIndex)] || slideTitleBoxes[projectorIndex];
    if (byIdx) return byIdx;

    const legacyScale = slideTitleFontScales[currentSlideId] ?? slideTitleFontScales[projectorIndex] ?? DEFAULT_TITLE_BOX.scale;
    return { ...DEFAULT_TITLE_BOX, scale: legacyScale };
  }, [slideTitleBoxes, currentSlideId, projectorIndex, slideTitleFontScales]);

  const commitTitleBox = useCallback((b: TextBox) => {
    const key = String(projectorIndex);
    const slideId = currentSlideId;
    setSlideTitleBoxes(prev => {
      const next = { ...prev, [key]: b };
      if (slideId) next[slideId] = b;
      try { localStorage.setItem('mega_ebd_slide_title_boxes', JSON.stringify(next)); } catch {}
      return next;
    });
    setSlideTitleFontScales(prev => {
      const next = { ...prev, [projectorIndex]: b.scale };
      if (slideId) (next as any)[slideId] = b.scale;
      try { localStorage.setItem('mega_ebd_slide_title_font_scales', JSON.stringify(next)); } catch {}
      return next;
    });
    updateLesson(l => {
      const prevBoxes = l.slideTitleBoxes ?? {};
      const nextBoxes = { ...prevBoxes, [key]: b };
      if (slideId) nextBoxes[slideId] = b;
      const nextScales = { ...(l.slideTitleFontScales ?? {}), [projectorIndex]: b.scale };
      if (slideId) (nextScales as any)[slideId] = b.scale;
      return {
        ...l,
        slideTitleBoxes: nextBoxes,
        slideTitleFontScales: nextScales,
      };
    });
  }, [projectorIndex, currentSlideId, updateLesson]);

  const resetTitleBox = useCallback(() => {
    const key = String(projectorIndex);
    const slideId = currentSlideId;
    setSlideTitleBoxes(prev => {
      const next = { ...prev };
      delete next[key];
      delete next[projectorIndex];
      if (slideId) delete next[slideId];
      try { localStorage.setItem('mega_ebd_slide_title_boxes', JSON.stringify(next)); } catch {}
      return next;
    });
    setSlideTitlePositions(prev => {
      const next = { ...prev };
      delete next[projectorIndex];
      try { localStorage.setItem('mega_ebd_title_positions', JSON.stringify(next)); } catch {}
      return next;
    });
    setSlideTitleFontScales(prev => {
      const next = { ...prev };
      delete next[projectorIndex];
      if (slideId) delete (next as any)[slideId];
      try { localStorage.setItem('mega_ebd_slide_title_font_scales', JSON.stringify(next)); } catch {}
      return next;
    });
    updateLesson(l => {
      const nextBoxes = { ...(l.slideTitleBoxes ?? {}) };
      delete nextBoxes[key];
      if (slideId) delete nextBoxes[slideId];
      const nextPos = { ...(l.slideTitlePositions ?? {}) };
      delete nextPos[projectorIndex];
      const nextScales = { ...(l.slideTitleFontScales ?? {}) };
      delete nextScales[projectorIndex];
      if (slideId) delete (nextScales as any)[slideId];
      return {
        ...l,
        slideTitleBoxes: nextBoxes,
        slideTitlePositions: nextPos,
        slideTitleFontScales: nextScales,
      };
    });
  }, [projectorIndex, currentSlideId, updateLesson]);

  const applyTitleBoxToAll = useCallback(() => {
    const boxToApply = curTitleBox;
    setSlideTitleBoxes(prev => {
      const nextBoxes: Record<string, TextBox> = { ...prev };
      for (let idx = 0; idx < 45; idx++) {
        nextBoxes[String(idx)] = { ...boxToApply };
      }
      try { localStorage.setItem('mega_ebd_slide_title_boxes', JSON.stringify(nextBoxes)); } catch {}
      return nextBoxes;
    });
    setSlideTitleFontScales(prev => {
      const nextScales: Record<number, number> = { ...prev };
      for (let idx = 0; idx < 45; idx++) {
        nextScales[idx] = boxToApply.scale;
      }
      try { localStorage.setItem('mega_ebd_slide_title_font_scales', JSON.stringify(nextScales)); } catch {}
      return nextScales;
    });
    updateLesson(l => {
      const nextBoxes: Record<string, TextBox> = { ...(l.slideTitleBoxes ?? {}) };
      const nextScales: Record<number, number> = { ...(l.slideTitleFontScales ?? {}) };
      for (let idx = 0; idx < 45; idx++) {
        nextBoxes[String(idx)] = { ...boxToApply };
        nextScales[idx] = boxToApply.scale;
      }
      return {
        ...l,
        slideTitleBoxes: nextBoxes,
        slideTitleFontScales: nextScales,
      };
    });
  }, [curTitleBox, updateLesson]);

  // ── 2. CAIXA LIVRE DE CORPO / TEXTO (COREL DRAW) ──
  const curBodyBox: TextBox = React.useMemo(() => {
    const byId = currentSlideId ? slideBodyBoxes[currentSlideId] : undefined;
    if (byId) return byId;

    const byIdx = slideBodyBoxes[String(projectorIndex)] || slideBodyBoxes[projectorIndex];
    if (byIdx) return byIdx;

    const legacyScale = slideBodyFontScales[currentSlideId] ?? slideBodyFontScales[projectorIndex];
    const legacyWidth = slideBodyWidths[currentSlideId] ?? slideBodyWidths[projectorIndex];

    if (currentProjectorItem?.type === 'palavra_chave') {
      return { ...DEFAULT_BODY_BOX, x: 4, y: 54, w: legacyWidth || 92, scale: legacyScale || 1.0 };
    }

    if (legacyScale !== undefined || legacyWidth !== undefined) {
      return {
        ...DEFAULT_BODY_BOX,
        w: legacyWidth ?? DEFAULT_BODY_BOX.w,
        scale: legacyScale ?? DEFAULT_BODY_BOX.scale,
      };
    }

    return DEFAULT_BODY_BOX;
  }, [slideBodyBoxes, currentSlideId, projectorIndex, slideBodyFontScales, slideBodyWidths, currentProjectorItem]);

  const commitBodyBox = useCallback((b: TextBox) => {
    const key = String(projectorIndex);
    const slideId = currentSlideId;
    setSlideBodyBoxes(prev => {
      const next = { ...prev, [key]: b };
      if (slideId) next[slideId] = b;
      try { localStorage.setItem('mega_ebd_slide_body_boxes', JSON.stringify(next)); } catch {}
      return next;
    });
    setSlideBodyFontScales(prev => {
      const next = { ...prev, [projectorIndex]: b.scale };
      if (slideId) (next as any)[slideId] = b.scale;
      try { localStorage.setItem('mega_ebd_slide_body_font_scales', JSON.stringify(next)); } catch {}
      return next;
    });
    setSlideBodyWidths(prev => {
      const next = { ...prev, [projectorIndex]: b.w };
      if (slideId) (next as any)[slideId] = b.w;
      try { localStorage.setItem('mega_ebd_body_widths', JSON.stringify(next)); } catch {}
      return next;
    });
    updateLesson(l => {
      const prevBoxes = l.slideBodyBoxes ?? {};
      const nextBoxes = { ...prevBoxes, [key]: b };
      if (slideId) nextBoxes[slideId] = b;
      const nextScales = { ...(l.slideBodyFontScales ?? {}), [projectorIndex]: b.scale };
      if (slideId) (nextScales as any)[slideId] = b.scale;
      const nextWidths = { ...(l.slideBodyWidths ?? {}), [projectorIndex]: b.w };
      if (slideId) (nextWidths as any)[slideId] = b.w;
      return {
        ...l,
        slideBodyBoxes: nextBoxes,
        slideBodyFontScales: nextScales,
        slideBodyWidths: nextWidths,
      };
    });
  }, [projectorIndex, currentSlideId, updateLesson]);

  const resetBodyBox = useCallback(() => {
    const key = String(projectorIndex);
    const slideId = currentSlideId;
    setSlideBodyBoxes(prev => {
      const next = { ...prev };
      delete next[key];
      delete next[projectorIndex];
      if (slideId) delete next[slideId];
      try { localStorage.setItem('mega_ebd_slide_body_boxes', JSON.stringify(next)); } catch {}
      return next;
    });
    setSlideBodyPositions(prev => {
      const next = { ...prev };
      delete next[projectorIndex];
      try { localStorage.setItem('mega_ebd_body_positions', JSON.stringify(next)); } catch {}
      return next;
    });
    setSlideBodyFontScales(prev => {
      const next = { ...prev };
      delete next[projectorIndex];
      if (slideId) delete (next as any)[slideId];
      try { localStorage.setItem('mega_ebd_slide_body_font_scales', JSON.stringify(next)); } catch {}
      return next;
    });
    setSlideBodyWidths(prev => {
      const next = { ...prev };
      delete next[projectorIndex];
      if (slideId) delete (next as any)[slideId];
      try { localStorage.setItem('mega_ebd_body_widths', JSON.stringify(next)); } catch {}
      return next;
    });
    updateLesson(l => {
      const nextBoxes = { ...(l.slideBodyBoxes ?? {}) };
      delete nextBoxes[key];
      if (slideId) delete nextBoxes[slideId];
      const nextScales = { ...(l.slideBodyFontScales ?? {}) };
      delete nextScales[projectorIndex];
      if (slideId) delete (nextScales as any)[slideId];
      const nextWidths = { ...(l.slideBodyWidths ?? {}) };
      delete nextWidths[projectorIndex];
      if (slideId) delete (nextWidths as any)[slideId];
      return {
        ...l,
        slideBodyBoxes: nextBoxes,
        slideBodyFontScales: nextScales,
        slideBodyWidths: nextWidths,
      };
    });
  }, [projectorIndex, currentSlideId, updateLesson]);

  const applyBodyBoxToAll = useCallback(() => {
    const boxToApply = curBodyBox;
    setSlideBodyBoxes(prev => {
      const nextBoxes: Record<string, TextBox> = { ...prev };
      for (let idx = 0; idx < 45; idx++) {
        nextBoxes[String(idx)] = { ...boxToApply };
      }
      try { localStorage.setItem('mega_ebd_slide_body_boxes', JSON.stringify(nextBoxes)); } catch {}
      return nextBoxes;
    });
    setSlideBodyFontScales(prev => {
      const nextScales: Record<number, number> = { ...prev };
      for (let idx = 0; idx < 45; idx++) {
        nextScales[idx] = boxToApply.scale;
      }
      try { localStorage.setItem('mega_ebd_slide_body_font_scales', JSON.stringify(nextScales)); } catch {}
      return nextScales;
    });
    setSlideBodyWidths(prev => {
      const nextWidths: Record<number, number> = { ...prev };
      for (let idx = 0; idx < 45; idx++) {
        nextWidths[idx] = boxToApply.w;
      }
      try { localStorage.setItem('mega_ebd_body_widths', JSON.stringify(nextWidths)); } catch {}
      return nextWidths;
    });
    updateLesson(l => {
      const nextBoxes = { ...(l.slideBodyBoxes ?? {}) };
      const nextScales: Record<number, number> = { ...(l.slideBodyFontScales ?? {}) };
      const nextWidths: Record<number, number> = { ...(l.slideBodyWidths ?? {}) };
      for (let idx = 0; idx < 45; idx++) {
        nextBoxes[String(idx)] = { ...boxToApply };
        nextScales[idx] = boxToApply.scale;
        nextWidths[idx] = boxToApply.w;
      }
      return {
        ...l,
        slideBodyBoxes: nextBoxes,
        slideBodyFontScales: nextScales,
        slideBodyWidths: nextWidths,
      };
    });
  }, [curBodyBox, updateLesson]);

  // Capa: título e subtítulo viram caixas independentes (escala própria, sem herdar o zoom do corpo)
  const curCoverTitleBox: TextBox = React.useMemo(() => {
    return slideBodyBoxes[currentSlideId] || slideBodyBoxes[String(projectorIndex)]
      || { ...DEFAULT_BODY_BOX, x: 10, y: 24, w: 80, scale: 1.0 };
  }, [slideBodyBoxes, currentSlideId, projectorIndex]);

  const curSubBox: TextBox = React.useMemo(() => {
    const isPalavraChave = currentProjectorItem?.type === 'palavra_chave';
    const defaultBox = isPalavraChave
      ? { ...DEFAULT_BODY_BOX, x: 4, y: 22, w: 92, scale: 1.2 }
      : { ...DEFAULT_BODY_BOX, x: 10, y: 52, w: 80, scale: 1.4 };

    return slideBodyBoxes[`${currentSlideId}:sub`] || slideBodyBoxes[`${projectorIndex}:sub`]
      || defaultBox;
  }, [slideBodyBoxes, currentSlideId, projectorIndex, currentProjectorItem]);

  const commitSubBox = useCallback((b: TextBox) => {
    const kIdx = `${projectorIndex}:sub`;
    const kId = `${currentSlideId}:sub`;
    setSlideBodyBoxes(prev => {
      const next = { ...prev, [kIdx]: b, [kId]: b };
      try { localStorage.setItem('mega_ebd_slide_body_boxes', JSON.stringify(next)); } catch {}
      return next;
    });
    updateLesson(l => ({
      ...l,
      slideBodyBoxes: { ...(l.slideBodyBoxes ?? {}), [kIdx]: b, [kId]: b },
    }));
  }, [projectorIndex, currentSlideId, updateLesson]);

  const resetSubBox = useCallback(() => {
    const kIdx = `${projectorIndex}:sub`;
    const kId = `${currentSlideId}:sub`;
    setSlideBodyBoxes(prev => {
      const next = { ...prev };
      delete next[kIdx];
      delete next[kId];
      try { localStorage.setItem('mega_ebd_slide_body_boxes', JSON.stringify(next)); } catch {}
      return next;
    });
    updateLesson(l => {
      const nb = { ...(l.slideBodyBoxes ?? {}) };
      delete nb[kIdx];
      delete nb[kId];
      return { ...l, slideBodyBoxes: nb };
    });
  }, [projectorIndex, currentSlideId, updateLesson]);



  // Aplica as escalas de título e texto deste slide a todos os slides da lição (iterando sobre todos os projectorItems)
  const applyCurrentScalesToAllSlides = useCallback(() => {
    const nextTitles: Record<string | number, number> = {};
    const nextBodies: Record<string | number, number> = {};
    projectorItems.forEach((item, idx) => {
      const key = item.id || idx;
      if (currentTitleScale !== defaultTitleScale) {
        nextTitles[key] = currentTitleScale;
        nextTitles[idx] = currentTitleScale;
      }
      if (currentBodyScale !== defaultBodyScale) {
        nextBodies[key] = currentBodyScale;
        nextBodies[idx] = currentBodyScale;
      }
    });
    setSlideTitleFontScales(nextTitles);
    setSlideBodyFontScales(nextBodies);
    updateLesson(l => ({ ...l, slideTitleFontScales: nextTitles, slideBodyFontScales: nextBodies }));
  }, [projectorItems, currentTitleScale, currentBodyScale, defaultTitleScale, defaultBodyScale, updateLesson]);

  // Verificação Ipsis Litteris do Slide de Subtópico atual contra o Conteúdo da Revista
  const isIpsisLitterisVerified = React.useMemo(() => {
    if (!lesson.revistaRawContent || !currentProjectorItem) return null;
    if (currentProjectorItem.type !== 'subtopic') return null;
    const slideText = currentProjectorItem.projetorText || '';
    if (!slideText || slideText.trim().length < 15) return null;

    const norm = (str: string) => str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/^\s*\d+(\.\d+)*\.?\s*/g, '')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const normalizedRevista = norm(lesson.revistaRawContent);
    const normalizedSlide = norm(slideText);

    if (normalizedSlide.length < 15) return null;

    if (normalizedRevista.includes(normalizedSlide)) return true;

    return false;
  }, [lesson.revistaRawContent, currentProjectorItem]);

  // ── CAIXA DELIMITADORA LIVRE DA IMAGEM DO SLIDE ATUAL ──
  const curImageSrc = projectorSlideImages[currentSlideId] || projectorSlideImages[projectorIndex] || currentProjectorItem?.imageUrl;
  const curBox: ImageBox = slideImageBoxes[currentSlideId] ?? slideImageBoxes[String(projectorIndex)] ?? DEFAULT_IMAGE_BOX;

  // ── COPIAR, COLAR E REPLICAR IMAGEM ENTRE SLIDES ──
  const handleCopyImage = useCallback(() => {
    if (!curImageSrc) return;
    const currentCrop = slideImageCrops[currentSlideIdRef.current] || slideImageCrops[projectorIndex];
    setCopiedImage({
      src: curImageSrc,
      box: { ...curBox },
      crop: currentCrop,
    });
    setImageToast('📋 Imagem copiada! Vá para qualquer slide e clique em "Colar Imagem" ou use Ctrl+V.');
    setTimeout(() => setImageToast(null), 3500);
  }, [curImageSrc, curBox, slideImageCrops, projectorIndex]);

  const handlePasteImage = useCallback((targetIndex?: number) => {
    if (!copiedImage) return;
    const targetIdx = targetIndex ?? projectorIndex;
    const targetItem = projectorItems[targetIdx];
    const targetSlideId = targetItem?.id || String(targetIdx);
    const key = String(targetIdx);

    setProjectorSlideImages(prev => {
      const next = { ...prev, [targetIdx]: copiedImage.src, [key]: copiedImage.src };
      if (targetSlideId) next[targetSlideId] = copiedImage.src;
      try { localStorage.setItem('mega_ebd_projector_slide_images', JSON.stringify(next)); } catch {}
      saveSlideImagesToStorage(next).catch(() => {});
      return next;
    });

    setSlideImageBoxes(prev => {
      const next = { ...prev, [key]: { ...copiedImage.box } };
      if (targetSlideId) next[targetSlideId] = { ...copiedImage.box };
      try { localStorage.setItem('mega_ebd_slide_image_boxes', JSON.stringify(next)); } catch {}
      return next;
    });

    if (copiedImage.crop) {
      setSlideImageCrops(prev => {
        const next = { ...prev, [targetIdx]: copiedImage.crop, [key]: copiedImage.crop };
        if (targetSlideId) next[targetSlideId] = copiedImage.crop;
        try { localStorage.setItem('mega_ebd_slide_image_crops', JSON.stringify(next)); } catch {}
        return next;
      });
    }

    updateLesson(l => {
      const nextImages = { ...(l.projectorSlideImages ?? {}), [targetIdx]: copiedImage.src, [key]: copiedImage.src };
      if (targetSlideId) nextImages[targetSlideId] = copiedImage.src;

      const nextBoxes = { ...(l.slideImageBoxes ?? {}), [key]: { ...copiedImage.box } };
      if (targetSlideId) nextBoxes[targetSlideId] = { ...copiedImage.box };

      const nextCrops = copiedImage.crop ? { ...(l.slideImageCrops ?? {}), [targetIdx]: copiedImage.crop, [key]: copiedImage.crop } : l.slideImageCrops;
      if (targetSlideId && copiedImage.crop && nextCrops) nextCrops[targetSlideId] = copiedImage.crop;

      return {
        ...l,
        projectorSlideImages: nextImages,
        slideImageBoxes: nextBoxes,
        slideImageCrops: nextCrops,
      };
    });

    setImageToast(`✅ Imagem colada com sucesso no Slide ${targetIdx + 1}!`);
    setTimeout(() => setImageToast(null), 3000);
  }, [copiedImage, projectorIndex, projectorItems, updateLesson]);

  const handleReplicateImageToSlides = useCallback((targetIndices: number[]) => {
    if (!curImageSrc || targetIndices.length === 0) return;
    const boxToCopy = { ...curBox };
    const currentCrop = slideImageCrops[currentSlideIdRef.current] || slideImageCrops[projectorIndex];
    const srcToCopy = curImageSrc;

    setProjectorSlideImages(prev => {
      const next = { ...prev };
      targetIndices.forEach(idx => {
        const item = projectorItems[idx];
        const slideId = item?.id || String(idx);
        next[idx] = srcToCopy;
        next[String(idx)] = srcToCopy;
        if (slideId) next[slideId] = srcToCopy;
      });
      try { localStorage.setItem('mega_ebd_projector_slide_images', JSON.stringify(next)); } catch {}
      saveSlideImagesToStorage(next).catch(() => {});
      return next;
    });

    setSlideImageBoxes(prev => {
      const next = { ...prev };
      targetIndices.forEach(idx => {
        const item = projectorItems[idx];
        const slideId = item?.id || String(idx);
        next[String(idx)] = { ...boxToCopy };
        if (slideId) next[slideId] = { ...boxToCopy };
      });
      try { localStorage.setItem('mega_ebd_slide_image_boxes', JSON.stringify(next)); } catch {}
      return next;
    });

    if (currentCrop) {
      setSlideImageCrops(prev => {
        const next = { ...prev };
        targetIndices.forEach(idx => {
          const item = projectorItems[idx];
          const slideId = item?.id || String(idx);
          next[idx] = currentCrop;
          next[String(idx)] = currentCrop;
          if (slideId) next[slideId] = currentCrop;
        });
        try { localStorage.setItem('mega_ebd_slide_image_crops', JSON.stringify(next)); } catch {}
        return next;
      });
    }

    updateLesson(l => {
      const nextImages = { ...(l.projectorSlideImages ?? {}) };
      const nextBoxes = { ...(l.slideImageBoxes ?? {}) };
      const nextCrops = { ...(l.slideImageCrops ?? {}) };

      targetIndices.forEach(idx => {
        const item = projectorItems[idx];
        const slideId = item?.id || String(idx);
        nextImages[idx] = srcToCopy;
        nextImages[String(idx)] = srcToCopy;
        if (slideId) nextImages[slideId] = srcToCopy;

        nextBoxes[String(idx)] = { ...boxToCopy };
        if (slideId) nextBoxes[slideId] = { ...boxToCopy };

        if (currentCrop) {
          nextCrops[idx] = currentCrop;
          nextCrops[String(idx)] = currentCrop;
          if (slideId) nextCrops[slideId] = currentCrop;
        }
      });

      return {
        ...l,
        projectorSlideImages: nextImages,
        slideImageBoxes: nextBoxes,
        slideImageCrops: nextCrops,
      };
    });

    setImageToast(`🎉 Imagem replicada com sucesso em ${targetIndices.length} slide${targetIndices.length === 1 ? '' : 's'}!`);
    setTimeout(() => setImageToast(null), 3500);
  }, [curImageSrc, curBox, slideImageCrops, projectorIndex, projectorItems, updateLesson]);

  // Atalhos de Teclado no Modo Projetor (Seta Esquerda / Direita, Escape para Sair do Recorte e Ctrl+C para Copiar Imagem)
  useEffect(() => {
    if (activeTab !== 'projetor') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      if (isCanvaCropping && e.key === 'Escape') {
        setIsCanvaCropping(false);
        return;
      }

      if (!isInput) {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
          if (imageSelected && curImageSrc) {
            e.preventDefault();
            handleCopyImage();
            return;
          }
        }
        if (e.key === 'ArrowLeft') {
          setProjectorIndex(prev => Math.max(0, prev - 1));
        } else if (e.key === 'ArrowRight') {
          setProjectorIndex(prev => Math.min(projectorItems.length - 1, prev + 1));
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, projectorItems.length, isCanvaCropping, imageSelected, curImageSrc, handleCopyImage]);

  // Colar imagem da área de transferência ou imagem copiada no app (Ctrl+V)
  useEffect(() => {
    if (activeTab !== 'projetor') return;
    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      const items = e.clipboardData?.items;
      if (items && items.length > 0) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.startsWith('image/')) {
            const file = items[i].getAsFile();
            if (file) {
              e.preventDefault();
              handleProcessImageFile(file);
              return;
            }
          }
        }
      }

      // Se não colou arquivo novo do sistema operacional, mas temos imagem copiada no app:
      if (copiedImage) {
        e.preventDefault();
        handlePasteImage();
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [activeTab, handleProcessImageFile, copiedImage, handlePasteImage]);

  // Reseta o modo de recorte ao mudar de slide
  useEffect(() => {
    setIsCanvaCropping(false);
  }, [projectorIndex]);
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

      let prompt = '';
      if (targetType === 'explicacao') {
        const projContext = sub.projetor ? `\nTexto oficial do slide do projetor (resumo da revista): "${sub.projetor}".` : '';
        prompt = `Você é um doutor em Teologia e Pedagogia especialista na Escola Bíblica Dominical (EBD).
Sua missão é gerar a EXPLICAÇÃO DIDÁTICA DO PROFESSOR (o roteiro falado e pedagógico para ministrar a aula aos alunos) para o subtópico:
Título do Subtópico: "${targetTitle}" (dentro da lição "${lesson.metadata?.title || 'Lição da EBD'}").${projContext}

REGRAS MANDATÓRIAS INEGOCIÁVEIS:
1. 🛑 NUNCA COPIE OU REPITA O TEXTO DO PROJETOR OU DO PARÁGRAFO DA REVISTA!
2. O projetor é para os alunos lerem no slide. A sua resposta é a AULA DO PROFESSOR: produza uma explicação didática OBJETIVA, DIRETA e CLARA para respeitar a gestão do tempo de aula da EBD (1 parágrafo bem estruturado ou no máximo 2 curtos, entre 60 e 100 palavras).
3. Padrão modelo a seguir: "Moisés apresenta três etapas da vida espiritual: ouvir, aprender e praticar. Ouvir (shema) é atender à Palavra com disposição para obedecer; aprender (lamad) é internalizar o ensino divino; e guardar (shamar) é colocá-lo em prática. Diferentemente da geração que falhou em obedecer, o cristão deve ser praticante da Palavra, e não apenas ouvinte (Tg 1.22-25)."
4. Conecte o sentido espiritual, a raiz exegética/teológica essencial e a correlação bíblica sem prolixidade.
5. Escreva em texto corrido pedagógico e fluido, sem marcadores ou tópicos com bullets.
6. Retorne DIRETAMENTE apenas o texto da explicação didática.`;
      } else if (targetType === 'projetor') {
        prompt = `Você é um especialista em EBD. Reescreva o TEXTO DO SLIDE DO PROJETOR (Quadro Azul) para o subtópico: "${targetTitle}".
O texto deve ser uma síntese clara, impactante e direta para ser projetada na tela para os alunos lerem durante a aula.
Texto atual: "${sub.projetor || currentExp}".
Retorne DIRETAMENTE apenas o novo texto para o slide do projetor.`;
      } else {
        prompt = `Como especialista em EBD, escreva uma aplicação prática e pentecostal impactante para o subtópico: "${targetTitle}".
Retorne DIRETAMENTE apenas o texto da aplicação.`;
      }

      const newText = await callGeminiRaw(prompt, 'gemini-2.5-flash', false, 0.6);

      updateLesson(prev => {
        const topicos = prev.topicos.map((top, tIdx) => {
          if (tIdx !== topicIdx) return top;
          const subtopicos = top.subtopicos.map((sub, sIdx) => {
            if (sIdx !== subIdx) return sub;
            if (ideiaIdx !== undefined && sub.ideias?.[ideiaIdx]) {
              const ideias = sub.ideias.map((ideia, iIdx) => {
                if (iIdx !== ideiaIdx) return ideia;
                if (targetType === 'explicacao') {
                  return { ...ideia, professor: { ...ideia.professor, explicacao: newText.trim() } };
                } else if (targetType === 'aplicacao') {
                  return { ...ideia, professor: { ...ideia.professor, aplicacao: newText.trim() } };
                } else {
                  return { ...ideia, projetor: newText.trim() };
                }
              });
              return { ...sub, ideias };
            } else {
              return {
                ...sub,
                ...(targetType === 'explicacao' ? { explicacao: newText.trim() } : {}),
                ...(targetType === 'aplicacao' ? { aplicacao: newText.trim() } : {}),
                ...(targetType === 'projetor' ? { projetor: newText.trim() } : {}),
              };
            }
          });
          return { ...top, subtopicos };
        });
        return { ...prev, topicos };
      });
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
    slideTitleBoxes,
    slideBodyBoxes,
    slideImageBoxes,
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
    slideTitleBoxes,
    slideBodyBoxes,
    slideImageBoxes,
  ]);

  const handleExportPowerPoint = () => {
    const theme = THEMES[0];
    const itemsWithImages = projectorItems.map((item, idx) => {
      const id = item.id;
      return {
        ...item,
        imageUrl: (id ? projectorSlideImages[id] : undefined) || projectorSlideImages[idx] || item.imageUrl,
        imageScale: (id && slideImageScales[id] !== undefined ? slideImageScales[id] : slideImageScales[idx]) ?? 1.0,
        imageFit: (id && slideImageFits[id] !== undefined ? slideImageFits[id] : slideImageFits[idx]) ?? 'cover',
        imageBox: (id && slideImageBoxes[id] !== undefined ? slideImageBoxes[id] : slideImageBoxes[String(idx)]),
      };
    });
    exportProjectorItemsToPowerPoint(itemsWithImages, lesson.metadata.title, theme, customBg);
  };

  const handleExportPngZip = async () => {
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
  };

  return (
    <div className="preparation-view-container space-y-6 max-w-[1600px] w-full mx-auto font-['Montserrat']">
      {/* Barra de Ferramentas da Lição */}
      <div className="bg-slate-900/90 border border-slate-700/90 p-3.5 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-4 backdrop-blur-md no-print relative z-40">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-[11px] uppercase tracking-wider font-extrabold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg shrink-0">
            {activeTab === 'projetor' ? 'Projetor' : 'Roteiro'}
          </span>
          <div className="text-white text-sm md:text-base font-black truncate max-w-sm md:max-w-md">
            {lesson.metadata.title}
          </div>
          {activeTab === 'projetor' && isIpsisLitterisVerified !== null && (
            isIpsisLitterisVerified ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shrink-0" title="Texto do slide verificado: 100% literal da revista enviada">
                ✓ Ipsis litteris (Revista)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0" title="Atenção: este texto pode ter sido adaptado ou resumido pela IA em relação à revista">
                ⚠️ Texto adaptado
              </span>
            )
          )}
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
                onClick={() => exportTeacherGuideHTML(lesson)}
                title="Exportar Roteiro do Professor em formato formatado para Word ou Google Docs"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-sm bg-blue-600 hover:bg-blue-500 text-white border border-blue-400/40 shadow-md transition-all cursor-pointer min-h-[42px] active:scale-95"
              >
                <FileText className="w-4 h-4 text-white" />
                <span>📝 Roteiro Docs</span>
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
            <ProjectorHeaderActions
              projectorSlideImages={projectorSlideImages}
              projectorIndex={projectorIndex}
              currentProjectorItem={currentProjectorItem}
              handleSlideImageUpload={handleSlideImageUpload}
              handleInsertSampleImage={handleInsertSampleImage}
              isImageMenuOpen={isImageMenuOpen}
              setIsImageMenuOpen={setIsImageMenuOpen}
              setImageSelected={setImageSelected}
              handleOpenCropForSlide={handleOpenCropForSlide}
              handleRemoveSlideImage={handleRemoveSlideImage}
              imageMenuRef={imageMenuRef}
              handleAddExtraSlide={handleAddExtraSlide}
              isSlideMenuOpen={isSlideMenuOpen}
              setIsSlideMenuOpen={setIsSlideMenuOpen}
              handleDuplicateSlide={handleDuplicateSlide}
              handleMoveSlideLeft={handleMoveSlideLeft}
              handleMoveSlideRight={handleMoveSlideRight}
              handleDeleteSlide={handleDeleteSlide}
              projectorItems={projectorItems}
              slideMenuRef={slideMenuRef}
              customBg={customBg}
              handleCustomBgUpload={handleCustomBgUpload}
              isModelMenuOpen={isModelMenuOpen}
              setIsModelMenuOpen={setIsModelMenuOpen}
              handleOpenCropForBg={handleOpenCropForBg}
              setCustomBg={setCustomBg}
              updateLesson={updateLesson}
              modelMenuRef={modelMenuRef}
              onExportPowerPoint={handleExportPowerPoint}
              onExportPngZip={handleExportPngZip}
              isExporting={isExporting}
              isEditMode={isEditMode}
              setIsEditMode={setIsEditMode}
              isLayoutEditMode={isLayoutEditMode}
              setIsLayoutEditMode={setIsLayoutEditMode}
              titleSelected={titleSelected}
              setTitleSelected={setTitleSelected}
              bodySelected={bodySelected}
              setBodySelected={setBodySelected}
              showAlignmentGuides={showAlignmentGuides}
              toggleAlignmentGuides={toggleAlignmentGuides}
              testStageAspect={testStageAspect}
              toggleTestStageAspect={toggleTestStageAspect}
              onCopyImage={handleCopyImage}
              onOpenReplicateModal={() => setIsReplicateModalOpen(true)}
              hasCopiedImage={Boolean(copiedImage)}
              onPasteImage={() => handlePasteImage()}
            />
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
        <TeacherPreparationView
          lesson={lesson}
          updateLesson={updateLesson}
          isEditMode={isEditMode}
          setIsEditMode={setIsEditMode}
          handleRegenerateSection={handleRegenerateSection}
          regeneratingId={regeneratingId}
        />
      )}

      {/* ========================================================= */}
      {/* 🖥️ ABA 2: VISÃO DO PROJETOR (TELA 16:9 LIMPA PARA OS ALUNOS) */}
      {/* ========================================================= */}
      {activeTab === 'projetor' && (
        <div className="space-y-5">
          <ProjectorToolbar
            projectorIndex={projectorIndex}
            setProjectorIndex={setProjectorIndex}
            projectorItems={projectorItems}
            currentProjectorItem={currentProjectorItem}
            currentTitleScale={currentTitleScale}
            defaultTitleScale={defaultTitleScale}
            isCurrentTitleCustom={isCurrentTitleCustom}
            setSingleTitleScale={setSingleTitleScale}
            currentBodyScale={currentBodyScale}
            defaultBodyScale={defaultBodyScale}
            isCurrentBodyCustom={isCurrentBodyCustom}
            setSingleBodyScale={setSingleBodyScale}
            slideBodyWidths={slideBodyWidths}
            setSingleBodyWidth={setSingleBodyWidth}
            resetSlideBodyWidth={resetSlideBodyWidth}
            toggleSideBySideLayout={toggleSideBySideLayout}
            showAlignmentGuides={showAlignmentGuides}
            toggleAlignmentGuides={toggleAlignmentGuides}
            curImageSrc={curImageSrc}
            curBox={curBox}
            imageSelected={imageSelected}
            setImageSelected={setImageSelected}
            projectorStageRef={projectorStageRef}
            commitBox={commitBox}
            handleRemoveSlideImage={handleRemoveSlideImage}
            handleInsertSampleImage={handleInsertSampleImage}
            onUploadImage={handleProcessImageFile}
            isTitleMoved={isTitleMoved}
            isBodyMoved={isBodyMoved}
            isImageMoved={isImageMoved}
            isImageWidthCustom={isImageWidthCustom}
            isImageHeightCustom={isImageHeightCustom}
            isImageCropCustom={isImageCropCustom}
            hasSlideHighlights={hasSlideHighlights}
            clearCurrentSlideHighlights={clearCurrentSlideHighlights}
            resetSlidePosition={resetSlidePosition}
            resetSlideImageWidth={resetSlideImageWidth}
            resetSlideImageHeight={resetSlideImageHeight}
            resetSlideImageCrop={resetSlideImageCrop}
            isEditMode={isEditMode}
            isExporting={isExporting}
            isIpsisLitterisVerified={isIpsisLitterisVerified}
            bodyTextColor={bodyTextColor}
            toggleBodyTextColor={toggleBodyTextColor}
            slideImageOpacity={slideImageOpacity}
            changeSlideImageOpacity={changeSlideImageOpacity}
            applyCurrentScalesToAllSlides={applyCurrentScalesToAllSlides}
            titleSelected={titleSelected}
            setTitleSelected={setTitleSelected}
            bodySelected={bodySelected}
            setBodySelected={setBodySelected}
            onCopyImage={handleCopyImage}
            onOpenReplicateModal={() => setIsReplicateModalOpen(true)}
            hasCopiedImage={Boolean(copiedImage)}
            onPasteImage={() => handlePasteImage()}
          />

          <ProjectorStage
            projectorStageRef={projectorStageRef}
            isLayoutEditMode={isLayoutEditMode}
            stageAspect={testStageAspect}
            customBg={customBg}
            imageSelected={imageSelected}
            setImageSelected={setImageSelected}
            curTitleBox={curTitleBox}
            titleSelected={titleSelected}
            setTitleSelected={setTitleSelected}
            commitTitleBox={commitTitleBox}
            resetTitleBox={resetTitleBox}
            applyTitleBoxToAll={applyTitleBoxToAll}
            curBodyBox={curBodyBox}
            bodySelected={bodySelected}
            setBodySelected={setBodySelected}
            commitBodyBox={commitBodyBox}
            resetBodyBox={resetBodyBox}
            applyBodyBoxToAll={applyBodyBoxToAll}
            curCoverTitleBox={curCoverTitleBox}
            curSubBox={curSubBox}
            subSelected={subSelected}
            setSubSelected={setSubSelected}
            commitSubBox={commitSubBox}
            resetSubBox={resetSubBox}
            handleSlideMouseUp={handleSlideMouseUp}
            hlToolbar={hlToolbar}
            setHlToolbar={setHlToolbar}
            applyHighlight={applyHighlight}
            removeHighlight={removeHighlight}
            hasSlideHighlights={hasSlideHighlights}
            clearCurrentSlideHighlights={clearCurrentSlideHighlights}
            isExporting={isExporting}
            projectorIndex={projectorIndex}
            setProjectorIndex={setProjectorIndex}
            projectorItems={projectorItems}
            currentProjectorItem={currentProjectorItem}
            isCanvaCropping={isCanvaCropping}
            setIsCanvaCropping={setIsCanvaCropping}
            occupyFullArea={occupyFullArea}
            occupyEntireStage={occupyEntireStage}
            slideImageCrops={slideImageCrops}
            setSingleImageCrop={setSingleImageCrop}
            toggleImageFit={toggleImageFit}
            imageFit={imageFit}
            resetSlideImageCrop={resetSlideImageCrop}
            showAlignmentGuides={showAlignmentGuides}
            guideHPos={guideHPos}
            setGuideHPos={setGuideHPos}
            guideVPos={guideVPos}
            setGuideVPos={setGuideVPos}
            handleGuideDragStart={handleGuideDragStart}
            toggleAlignmentGuides={toggleAlignmentGuides}
            curImageSrc={curImageSrc}
            curBox={curBox}
            commitBox={commitBox}
            onUploadImage={handleProcessImageFile}
            slideBodyWidths={slideBodyWidths}
            handleBodyResizeStart={handleBodyResizeStart}
            resetSlideBodyWidth={resetSlideBodyWidth}
            currentSlideScale={currentSlideScale}
            currentTitleScale={currentTitleScale}
            currentBodyScale={currentBodyScale}
            titlePos={titlePos}
            bodyPos={bodyPos}
            makeDragStyle={makeDragStyle}
            handleElementDragStart={handleElementDragStart}
            renderHL={renderHL}
            bodyTextColor={bodyTextColor}
            lesson={lesson}
            getResponsiveBodyTextClass={getResponsiveBodyTextClass}
          />
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

      {/* Modal de Replicar Imagem em Slides Selecionados */}
      {curImageSrc && (
        <ReplicateImageModal
          isOpen={isReplicateModalOpen}
          onClose={() => setIsReplicateModalOpen(false)}
          currentSlideIndex={projectorIndex}
          projectorItems={projectorItems}
          currentImageSrc={curImageSrc}
          projectorSlideImages={projectorSlideImages}
          onConfirmReplicate={handleReplicateImageToSlides}
        />
      )}

      {/* Toast flutuante de feedback de imagem */}
      {imageToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[110] bg-slate-900 border border-cyan-400 text-white text-xs font-bold px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2 backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 select-none">
          <span>✨</span>
          <span>{imageToast}</span>
        </div>
      )}
    </div>
  );
};

