import LZString from 'lz-string';
import QRCode from 'qrcode';
import type { EBDLessonPreparation } from '../types';
import { fillMissingLessonPrompts } from './promptGeneratorService';

/**
 * Remove metadados temporários de interface e campos vazios para otimizar o tamanho do compartilhamento
 */
export function pruneLessonForSharing(lesson: EBDLessonPreparation): EBDLessonPreparation {
  if (!lesson) return lesson;
  try {
    const clone = JSON.parse(JSON.stringify(lesson)) as any;
    
    // Remove apenas metadados pesados de análise e checklist interno
    delete clone.checklist;
    delete clone.sourcesSummary;

    // Filtra imagens base64 muito gigantes (> 60KB) para não estourar limite de URL,
    // mas PRESERVA URLs web (http/https) e imagens compactas
    if (clone.projectorSlideImages && typeof clone.projectorSlideImages === 'object') {
      const cleanedImages: Record<number, string> = {};
      for (const [k, v] of Object.entries(clone.projectorSlideImages)) {
        if (typeof v === 'string') {
          if (v.startsWith('http://') || v.startsWith('https://')) {
            cleanedImages[Number(k)] = v;
          } else if (v.startsWith('data:') && v.length < 60000) {
            cleanedImages[Number(k)] = v;
          }
        }
      }
      clone.projectorSlideImages = cleanedImages;
    }

    if (clone.customBg && typeof clone.customBg === 'string') {
      if (!clone.customBg.startsWith('http') && clone.customBg.length >= 60000) {
        delete clone.customBg;
      }
    }

    // Filtra imagens base64 muito gigantes em extraSlides (> 60KB)
    if (Array.isArray(clone.extraSlides)) {
      clone.extraSlides = clone.extraSlides.map((s: any) => {
        const item = { ...s };
        if (item.imageUrl && item.imageUrl.startsWith('data:') && item.imageUrl.length >= 60000) {
          delete item.imageUrl;
        }
        return item;
      });
    }

    // Limpa arrays e strings vazios em tópicos e subtópicos para economizar espaço
    if (Array.isArray(clone.topicos)) {
      clone.topicos.forEach((topic: any) => {
        if (!topic.sinopse) delete topic.sinopse;
        if (!topic.frasesEnfase || topic.frasesEnfase.length === 0) delete topic.frasesEnfase;
        if (!topic.imagePrompt) delete topic.imagePrompt;

        if (Array.isArray(topic.subtopicos)) {
          topic.subtopicos.forEach((sub: any) => {
            if (!sub.frasesExplicativas || sub.frasesExplicativas.length === 0) delete sub.frasesExplicativas;
            if (!sub.ideias || sub.ideias.length === 0) delete sub.ideias;
            if (!sub.palavrasOriginais || sub.palavrasOriginais.length === 0) delete sub.palavrasOriginais;
            if (!sub.versiculos || sub.versiculos.length === 0) delete sub.versiculos;
            if (!sub.notaVersiculos) delete sub.notaVersiculos;
            if (!sub.notaAplicacao) delete sub.notaAplicacao;
            if (!sub.notaEnfase) delete sub.notaEnfase;
            if (!sub.cuidadoDoutrinario) delete sub.cuidadoDoutrinario;
            if (!sub.aplicacao) delete sub.aplicacao;
            if (!sub.enfase) delete sub.enfase;
            if (!sub.imagePrompt) delete sub.imagePrompt;
          });
        }
      });
    }

    return clone;
  } catch {
    return lesson;
  }
}

/**
 * Retorna a URL base adequada para compartilhamento (com fallback para domínio público se rodando localmente)
 */
export function getBaseShareUrl(): string {
  let baseUrl = window.location.origin + window.location.pathname;
  if (!baseUrl.endsWith('/')) baseUrl += '/';

  // Se estiver rodando no computador local (localhost / 127.0.0.1 / IP local),
  // utiliza o domínio público de produção para que a câmera de qualquer celular consiga abrir a aula
  if (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname.startsWith('192.168.') ||
    window.location.hostname.startsWith('10.')
  ) {
    baseUrl = 'https://mega-slides-ebd.vercel.app/';
  }

  return baseUrl;
}

/**
 * Converte um objeto EBDLessonPreparation em uma URL comprimida pronta para compartilhamento
 */
export function encodeLessonToUrl(lesson: EBDLessonPreparation): string {
  try {
    const pruned = pruneLessonForSharing(lesson);
    const jsonStr = JSON.stringify(pruned);
    const compressed = LZString.compressToEncodedURIComponent(jsonStr);
    const baseUrl = getBaseShareUrl();
    return `${baseUrl}#lesson=${compressed}`;
  } catch (err) {
    console.error('Erro ao comprimir lição para URL:', err);
    return window.location.href;
  }
}

/**
 * Sanitiza a lição carregada garantindo que todos os campos obrigatórios e coleções existam
 */
export function sanitizeLessonData(raw: any): EBDLessonPreparation {
  if (!raw) return raw;
  const result: EBDLessonPreparation = {
    metadata: {
      lessonNumber: raw.metadata?.lessonNumber || '',
      title: raw.metadata?.title || 'Lição da EBD',
      subtitle: raw.metadata?.subtitle || '',
      themeTopic: raw.metadata?.themeTopic || raw.metadata?.title || 'EBD',
      date: raw.metadata?.date || '',
      targetAudience: raw.metadata?.targetAudience || 'Adultos',
      depth: raw.metadata?.depth || 'detalhada',
      imagePrompt: raw.metadata?.imagePrompt || '',
    },
    textAureo: {
      text: raw.textAureo?.text || '',
      reference: raw.textAureo?.reference || '',
      imagePrompt: raw.textAureo?.imagePrompt || '',
    },
    verdadePratica: {
      text: raw.verdadePratica?.text || '',
      imagePrompt: raw.verdadePratica?.imagePrompt || '',
    },
    palavraChave: raw.palavraChave ? {
      palavra: raw.palavraChave.palavra || '',
      explicacao: (raw.palavraChave.palavra?.toUpperCase() === 'FIDELIDADE' && raw.palavraChave.explicacao && !raw.palavraChave.explicacao.includes('emûnāh'))
        ? "No hebraico 'emûnāh (raiz 'āman, firmeza, verdade) e no grego pistis/pistos (confiança, lealdade), a fidelidade evoca a ideia de estabilidade inabalável, firmeza e verdade permanente, semelhante a uma rocha inabalável. A fidelidade não é apenas algo que Deus faz, mas a própria essência do Seu caráter imutável; Ele permanece constante e digno de confiança, independentemente das falhas ou circunstâncias humanas."
        : (raw.palavraChave.explicacao || ''),
      imagePrompt: raw.palavraChave.imagePrompt || '',
    } : undefined,
    leituraDiaria: raw.leituraDiaria || [],
    biblicalText: raw.biblicalText || '',
    introducao: {
      text: raw.introducao?.text || '',
      projetor: raw.introducao?.projetor || raw.introducao?.text || '',
      ponteContextual: raw.introducao?.ponteContextual,
    },
    topicos: (raw.topicos || []).map((t: any) => ({
      number: t.number || '',
      title: t.title || '',
      explicacao: t.explicacao || '',
      sinopse: t.sinopse || '',
      frasesEnfase: t.frasesEnfase || [],
      imagePrompt: t.imagePrompt || '',
      subtopicos: (t.subtopicos || []).map((sub: any) => ({
        number: sub.number || '',
        title: sub.title || '',
        projetor: sub.projetor || sub.explicacao || '',
        explicacao: sub.explicacao || sub.projetor || '',
        frasesExplicativas: sub.frasesExplicativas || [],
        ideias: sub.ideias || [],
        versiculos: sub.versiculos || [],
        aplicacao: sub.aplicacao || '',
        enfase: sub.enfase || '',
        cuidadoDoutrinario: sub.cuidadoDoutrinario || '',
        palavrasOriginais: sub.palavrasOriginais || [],
        imagePrompt: sub.imagePrompt || '',
      })),
    })),
    conclusao: {
      takeaway: raw.conclusao?.takeaway || '',
      bulletPoints: raw.conclusao?.bulletPoints || [],
      finalPrayer: raw.conclusao?.finalPrayer || '',
      projetor: raw.conclusao?.projetor || raw.conclusao?.takeaway || '',
    },
    sourcesSummary: raw.sourcesSummary || { revistaDetected: true, transcriptionsCount: 0, sourcesUsed: [] },
    checklist: raw.checklist || [],
    extraSlides: Array.isArray(raw.extraSlides || raw.xs)
      ? (raw.extraSlides || raw.xs).map((s: any) => ({
          id: s.id || `extra-${Math.random().toString(36).substring(2, 9)}`,
          type: 'extra' as const,
          title: s.title || s.t || '',
          badgeText: s.badgeText || s.b || 'SLIDE EXTRA',
          projetorText: s.projetorText || s.p || '',
          subtitle: s.subtitle || s.s || '',
          reference: s.reference || s.r || '',
          imageUrl: s.imageUrl || s.u,
          imagePrompt: s.imagePrompt,
          bulletPoints: Array.isArray(s.bulletPoints || s.bp) ? (s.bulletPoints || s.bp) : undefined,
        }))
      : [],
    customSlideOrder: Array.isArray(raw.customSlideOrder || raw.so) ? (raw.customSlideOrder || raw.so) : [],
    slideFontScales: raw.slideFontScales || {},
    slideTitleFontScales: raw.slideTitleFontScales || {},
    slideBodyFontScales: raw.slideBodyFontScales || {},
    slideTextOverrides: raw.slideTextOverrides || {},
    slideTitlePositions: raw.slideTitlePositions || {},
    slideBodyPositions: raw.slideBodyPositions || {},
    slideBodyWidths: raw.slideBodyWidths || {},
    slideImagePositions: raw.slideImagePositions || {},
    slideImageScales: raw.slideImageScales || {},
    slideImageWidths: raw.slideImageWidths || {},
    slideImageHeights: raw.slideImageHeights || {},
    slideImageCrops: raw.slideImageCrops || {},
    slideImageFits: raw.slideImageFits || {},
    slideImageBorders: raw.slideImageBorders || {},
    projectorSlideImages: raw.projectorSlideImages || {},
    projectorFontSizeScale: typeof raw.projectorFontSizeScale === 'number' ? raw.projectorFontSizeScale : 1.0,
    customBg: raw.customBg || null,
    bodyTextColor: raw.bodyTextColor === 'white' ? 'white' : 'black',
    textHighlights: raw.textHighlights || {},
  };

  return fillMissingLessonPrompts(result);
}

/**
 * Tenta decodificar uma lição a partir da URL (hash #lesson= ou query ?lesson=)
 */
export function decodeLessonFromUrl(): EBDLessonPreparation | null {
  try {
    let compressedStr = '';

    // Procura no hash (#lesson=...)
    if (window.location.hash && window.location.hash.includes('lesson=')) {
      compressedStr = window.location.hash.split('lesson=')[1];
    } 
    // Fallback: procura na query string (?lesson=...)
    else if (window.location.search && window.location.search.includes('lesson=')) {
      const params = new URLSearchParams(window.location.search);
      compressedStr = params.get('lesson') || '';
    }

    if (!compressedStr) return null;

    // Remove parâmetros extras se houver
    compressedStr = compressedStr.split('&')[0];

    const jsonStr = LZString.decompressFromEncodedURIComponent(compressedStr);
    if (!jsonStr) return null;

    const parsed = JSON.parse(jsonStr);

    // Formato normal
    if (parsed && parsed.metadata && parsed.topicos) {
      return sanitizeLessonData(parsed);
    }

    // Formato compacto para offline / fallback de QR Code
    if (parsed && parsed.m && parsed.t) {
      return sanitizeLessonData({
        metadata: {
          title: parsed.m.t || 'Lição da EBD',
          subtitle: parsed.m.s || '',
          themeTopic: parsed.m.t || 'EBD',
          depth: parsed.m.d || 'detalhada'
        },
        textAureo: parsed.ta || { text: '', reference: '' },
        verdadePratica: parsed.vp || { text: '' },
        introducao: { text: parsed.i?.p || '', projetor: parsed.i?.p || '' },
        topicos: (parsed.t || []).map((tp: any) => ({
          number: tp.n,
          title: tp.t,
          explicacao: tp.e || '',
          sinopse: '',
          frasesEnfase: [],
          imagePrompt: '',
          subtopicos: (tp.s || []).map((sub: any) => ({
            number: sub.n,
            title: sub.t,
            projetor: sub.p || '',
            explicacao: sub.p || '',
            imagePrompt: ''
          }))
        })),
        conclusao: {
          takeaway: parsed.c?.p || '',
          bulletPoints: [],
          projetor: parsed.c?.p || ''
        },
        extraSlides: (parsed.xs || []).map((s: any) => ({
          id: s.id || `extra-${Math.random()}`,
          type: 'extra' as const,
          title: s.t || '',
          badgeText: s.b || 'SLIDE EXTRA',
          projetorText: s.p || '',
          subtitle: s.s || '',
          reference: s.r || '',
          imageUrl: s.u,
          bulletPoints: s.bp,
        })),
        customSlideOrder: parsed.so || [],
        slideTitlePositions: parsed.tp || {},
        slideBodyPositions: parsed.bp || {},
        slideBodyWidths: parsed.bw || {},
        slideImagePositions: parsed.ip || {},
        slideImageWidths: parsed.iw || {},
        slideImageHeights: parsed.ih || {},
        slideImageScales: parsed.is || {},
        slideImageCrops: parsed.ic || {},
        slideImageFits: parsed.if || {},
        slideFontScales: parsed.fs || {},
        slideTitleFontScales: parsed.tfs || {},
        slideBodyFontScales: parsed.bfs || {},
        slideTextOverrides: parsed.to || {},
        projectorSlideImages: parsed.psi || {},
        customBg: parsed.bg || null,
        bodyTextColor: parsed.tc || 'black',
      });
    }
  } catch (err) {
    console.error('Erro ao decodificar lição da URL:', err);
  }

  return null;
}

export async function shortenUrl(longUrl: string): Promise<string> {
  const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs = 3000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(id);
      return response;
    } catch (err) {
      clearTimeout(id);
      throw err;
    }
  };

  // 1. Tenta TinyURL via POST
  try {
    const res = await fetchWithTimeout('https://tinyurl.com/api-create.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ url: longUrl })
    });
    if (res.ok) {
      const shortUrl = (await res.text()).trim();
      if (shortUrl && (shortUrl.startsWith('http://') || shortUrl.startsWith('https://')) && shortUrl.length > 12) {
        return shortUrl;
      }
    }
  } catch (e) {
    console.warn('Falha no encurtador TinyURL:', e);
  }

  // 2. Tenta spoo.me
  try {
    const res = await fetchWithTimeout('https://spoo.me', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: new URLSearchParams({ url: longUrl })
    });
    if (res.ok) {
      const json = await res.json();
      if (json.short_url && (json.short_url.startsWith('http://') || json.short_url.startsWith('https://')) && json.short_url.length > 12) {
        return json.short_url;
      }
    }
  } catch (e) {
    console.warn('Falha no encurtador spoo.me:', e);
  }

  // 3. Tenta is.gd
  try {
    const res = await fetchWithTimeout(`https://is.gd/create.php?format=json&url=${encodeURIComponent(longUrl)}`, {
      method: 'GET'
    });
    if (res.ok) {
      const data = await res.json();
      if (data.shorturl && data.shorturl.startsWith('http')) {
        return data.shorturl;
      }
    }
  } catch (e) {
    console.warn('Falha no encurtador is.gd:', e);
  }

  return longUrl;
}

export interface QrCodeResult {
  dataUrl: string;
  shareUrl: string;
  isShortened: boolean;
}

/**
 * Gera uma imagem DataURL (PNG) de QR Code a partir da URL da lição,
 * encurtando a URL se necessário para caber no limite físico do QR Code.
 */
export async function generateQrCodeDataUrl(
  fullUrl: string,
  lesson?: EBDLessonPreparation
): Promise<QrCodeResult> {
  // 1. Tenta primeiro com a URL direta se for razoavelmente curta (< 2200 chars)
  if (fullUrl.length < 2200) {
    try {
      const dataUrl = await QRCode.toDataURL(fullUrl, {
        width: 380,
        margin: 2,
        color: { dark: '#0f172a', light: '#ffffff' },
        errorCorrectionLevel: 'L',
      });
      return { dataUrl, shareUrl: fullUrl, isShortened: false };
    } catch {
      // Se falhou por limite de dados, continua para encurtamento
    }
  }

  // 2. Se a URL for grande, tenta encurtar via API
  const shortUrl = await shortenUrl(fullUrl);
  if (shortUrl !== fullUrl && (shortUrl.startsWith('http://') || shortUrl.startsWith('https://'))) {
    try {
      const dataUrl = await QRCode.toDataURL(shortUrl, {
        width: 380,
        margin: 2,
        color: { dark: '#0f172a', light: '#ffffff' },
        errorCorrectionLevel: 'L',
      });
      return { dataUrl, shareUrl: shortUrl, isShortened: true };
    } catch (err) {
      console.warn('Erro ao gerar QR Code para URL encurtada:', err);
    }
  }

  // 3. Fallback Offline: Se o encurtador falhar (ex: sem internet), cria payload super compacto preservando slides extras e visual
  if (lesson) {
    try {
      const compactLesson = {
        m: {
          t: lesson.metadata.title,
          s: lesson.metadata.subtitle,
          d: lesson.metadata.depth,
        },
        ta: lesson.textAureo,
        vp: lesson.verdadePratica,
        i: { p: lesson.introducao.projetor || lesson.introducao.text },
        t: lesson.topicos.map((tp) => ({
          n: tp.number,
          t: tp.title,
          s: (tp.subtopicos || []).map((sub) => ({
            n: sub.number,
            t: sub.title,
            p: sub.projetor || sub.explicacao?.slice(0, 150),
          })),
        })),
        c: { p: lesson.conclusao.projetor || lesson.conclusao.takeaway },
        xs: (lesson.extraSlides || []).map((s) => ({
          id: s.id,
          t: s.title,
          b: s.badgeText,
          p: s.projetorText,
          s: s.subtitle,
          r: s.reference,
          u: (s.imageUrl && (s.imageUrl.startsWith('http://') || s.imageUrl.startsWith('https://'))) ? s.imageUrl : undefined,
          bp: s.bulletPoints,
        })),
        so: lesson.customSlideOrder,
        tp: lesson.slideTitlePositions,
        bp: lesson.slideBodyPositions,
        bw: lesson.slideBodyWidths,
        ip: lesson.slideImagePositions,
        iw: lesson.slideImageWidths,
        ih: lesson.slideImageHeights,
        is: lesson.slideImageScales,
        ic: lesson.slideImageCrops,
        if: lesson.slideImageFits,
        fs: lesson.slideFontScales,
        tfs: lesson.slideTitleFontScales,
        bfs: lesson.slideBodyFontScales,
        to: lesson.slideTextOverrides,
        psi: Object.fromEntries(
          Object.entries(lesson.projectorSlideImages || {}).filter(([_, v]) => typeof v === 'string' && (v.startsWith('http://') || v.startsWith('https://')))
        ),
        bg: (lesson.customBg && (lesson.customBg.startsWith('http://') || lesson.customBg.startsWith('https://'))) ? lesson.customBg : null,
        tc: lesson.bodyTextColor,
      };

      const compactJson = JSON.stringify(compactLesson);
      const compactCompressed = LZString.compressToEncodedURIComponent(compactJson);
      const baseUrl = getBaseShareUrl();
      const compactUrl = `${baseUrl}#lesson=${compactCompressed}`;

      const dataUrl = await QRCode.toDataURL(compactUrl, {
        width: 380,
        margin: 2,
        color: { dark: '#0f172a', light: '#ffffff' },
        errorCorrectionLevel: 'L',
      });

      return { dataUrl, shareUrl: compactUrl, isShortened: true };
    } catch (compactErr) {
      console.error('Erro ao gerar QR Code em modo compacto offline:', compactErr);
    }
  }

  // 4. Última tentativa com a URL original
  const dataUrl = await QRCode.toDataURL(fullUrl, {
    width: 380,
    margin: 2,
    color: { dark: '#0f172a', light: '#ffffff' },
    errorCorrectionLevel: 'L',
  });

  return { dataUrl, shareUrl: fullUrl, isShortened: false };
}



/**
 * Baixar arquivo JSON da lição
 */
export function downloadLessonJson(lesson: EBDLessonPreparation): void {
  const jsonStr = JSON.stringify(lesson, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const fileName = (lesson.metadata?.title || 'licao-ebd').toLowerCase().replace(/\s+/g, '-');
  a.download = `${fileName}.megaebd`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Carregar arquivo JSON de lição
 */
export function readLessonJsonFile(file: File): Promise<EBDLessonPreparation> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content) as EBDLessonPreparation;
        if (parsed && parsed.metadata && parsed.topicos) {
          resolve(parsed);
        } else {
          reject(new Error('Formato de arquivo de lição inválido.'));
        }
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsText(file);
  });
}
