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

  const text = rawText.trim();
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
    landmarks.push({
      type: 'verse',
      text: verseNum,
      index: idx,
      endIndex: idx + verseNum.length
    });
  }

  landmarks.sort((a, b) => a.index - b.index);

  const sections: BiblicalBookSection[] = [];
  let currentSec: BiblicalBookSection = {
    bookHeader: subRefs[0] || (reference && !reference.includes(';') ? reference : undefined),
    verses: []
  };

  for (let i = 0; i < landmarks.length; i++) {
    const curr = landmarks[i];
    const next = landmarks[i + 1];

    if (curr.type === 'header') {
      if (currentSec.verses.length > 0 || (currentSec.bookHeader && currentSec.bookHeader !== curr.text)) {
        sections.push(currentSec);
      }
      currentSec = {
        bookHeader: curr.text,
        verses: []
      };
    } else if (curr.type === 'verse') {
      const startIdx = curr.endIndex;
      const endIdx = next ? next.index : bodyText.length;
      let verseText = bodyText.substring(startIdx, endIdx).trim();

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

  const text = rawText.trim();
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

  // 2. Procura todas as ocorrências de números de versículos
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

      verseContent = verseContent.replace(/^[—\-–\.]\s*/, '').replace(/\[\.\.\.\]/g, '').trim();

      if (verseContent.length > 0) {
        rawVerses.push({
          number: curr.number,
          body: verseContent
        });
      }
    }

    if (rawVerses.length > 0) {
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

  return [{
    chapterHeader: mainHeader || undefined,
    verseText: bodyText
  }];
}
