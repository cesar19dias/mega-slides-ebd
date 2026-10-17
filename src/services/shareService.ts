import LZString from 'lz-string';
import QRCode from 'qrcode';
import type { EBDLessonPreparation } from '../types';
import { fillMissingLessonPrompts } from './promptGeneratorService';

/**
 * Otimiza uma imagem base64 reduzindo resolução e comprimindo para JPEG com qualidade balanceada
 */
export function optimizeImageBase64(dataUrl: string, maxDim = 1280, quality = 0.82): Promise<string> {
  return new Promise((resolve) => {
    if (!dataUrl || !dataUrl.startsWith('data:image')) {
      return resolve(dataUrl);
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let { width, height } = img;
      if (width <= maxDim && height <= maxDim && dataUrl.length < 120000) {
        return resolve(dataUrl);
      }
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(dataUrl);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const res = canvas.toDataURL('image/jpeg', quality);
      resolve(res);
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Otimiza todas as imagens de uma lição (slides, extras e fundo) para tamanho ideal
 */
export async function optimizeLessonImages(lesson: EBDLessonPreparation): Promise<EBDLessonPreparation> {
  if (!lesson) return lesson;
  try {
    const clone = JSON.parse(JSON.stringify(lesson)) as EBDLessonPreparation;

    if (clone.projectorSlideImages && typeof clone.projectorSlideImages === 'object') {
      const optimizedMap: Record<number, string> = {};
      for (const [k, v] of Object.entries(clone.projectorSlideImages)) {
        if (typeof v === 'string') {
          if (v.startsWith('data:image')) {
            optimizedMap[Number(k)] = await optimizeImageBase64(v, 1280, 0.82);
          } else {
            optimizedMap[Number(k)] = v;
          }
        }
      }
      clone.projectorSlideImages = optimizedMap;
    }

    if (clone.customBg && typeof clone.customBg === 'string' && clone.customBg.startsWith('data:image')) {
      clone.customBg = await optimizeImageBase64(clone.customBg, 1280, 0.80);
    }

    if (Array.isArray(clone.extraSlides)) {
      clone.extraSlides = await Promise.all(
        clone.extraSlides.map(async (s) => {
          if (s.imageUrl && s.imageUrl.startsWith('data:image')) {
            const opt = await optimizeImageBase64(s.imageUrl, 1280, 0.82);
            return { ...s, imageUrl: opt };
          }
          return s;
        })
      );
    }

    return clone;
  } catch {
    return lesson;
  }
}

/**
 * Remove metadados temporários de interface e campos vazios para otimizar o tamanho do compartilhamento
 * Preserva 100% de todas as imagens, slides extras e customizações visuais.
 */
export function pruneLessonForSharing(lesson: EBDLessonPreparation): EBDLessonPreparation {
  if (!lesson) return lesson;
  try {
    const clone = JSON.parse(JSON.stringify(lesson)) as any;
    
    // Remove apenas metadados pesados de análise e checklist interno
    delete clone.checklist;
    delete clone.sourcesSummary;

    // Preserva todas as imagens de slides
    if (clone.projectorSlideImages && typeof clone.projectorSlideImages === 'object') {
      const cleanedImages: Record<number, string> = {};
      for (const [k, v] of Object.entries(clone.projectorSlideImages)) {
        if (typeof v === 'string' && v.trim()) {
          cleanedImages[Number(k)] = v;
        }
      }
      clone.projectorSlideImages = cleanedImages;
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
        projetor: sub.projetor || '',
        explicacao: sub.explicacao || '',
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
            explicacao: sub.e || sub.p || '',
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

/**
 * Publica a lição na nuvem para compartilhamento rápido, retornando uma chave curta de sincronização
 * Otimiza e inclui 100% de todas as imagens, slides extras e personalizações.
 */
export async function publishLessonForSharing(lesson: EBDLessonPreparation): Promise<string | null> {
  try {
    const optimized = await optimizeLessonImages(lesson);
    const pruned = pruneLessonForSharing(optimized);
    const jsonStr = JSON.stringify(pruned);

    // 1. Tenta Bytebin (suporta até 10MB, alta performance via Cloudflare e CORS aberto)
    const res = await fetch('https://bytebin.lucko.me/post', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: jsonStr,
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.key) {
        return data.key;
      }
    }
  } catch (err) {
    console.warn('Erro ao publicar lição na nuvem (Bytebin):', err);
  }

  return null;
}

/**
 * Busca uma lição completa na nuvem a partir de sua chave curta de sincronização
 */
export async function fetchSharedLesson(key: string): Promise<EBDLessonPreparation | null> {
  if (!key) return null;
  const cleanKey = key.trim().replace(/[^a-zA-Z0-9_-]/g, '');
  if (!cleanKey) return null;

  try {
    const res = await fetch(`https://bytebin.lucko.me/${cleanKey}`);
    if (res.ok) {
      const raw = await res.json();
      if (raw && (raw.metadata || raw.topicos || raw.t)) {
        return sanitizeLessonData(raw);
      }
    }
  } catch (err) {
    console.error('Erro ao buscar lição compartilhada na nuvem:', err);
  }

  return null;
}

/**
 * Carrega lição assíncrona da nuvem se a URL tiver ?share=KEY ou ?id=KEY ou #share=KEY
 */
export async function loadSharedLessonFromUrlAsync(): Promise<EBDLessonPreparation | null> {
  try {
    let key = '';
    if (window.location.search) {
      const params = new URLSearchParams(window.location.search);
      key = params.get('share') || params.get('id') || '';
    }
    if (!key && window.location.hash) {
      const hashStr = window.location.hash.substring(1);
      if (hashStr.includes('share=')) {
        key = hashStr.split('share=')[1]?.split('&')[0] || '';
      } else if (hashStr.includes('id=')) {
        key = hashStr.split('id=')[1]?.split('&')[0] || '';
      }
    }

    if (!key) return null;
    return await fetchSharedLesson(key);
  } catch (err) {
    console.error('Erro ao resolver parâmetro de compartilhamento da URL:', err);
    return null;
  }
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

  return longUrl;
}

export interface QrCodeResult {
  dataUrl: string;
  shareUrl: string;
  isShortened: boolean;
}

/**
 * Gera uma imagem DataURL (PNG) de QR Code a partir da lição,
 * priorizando a sincronização em nuvem para garantir todas as imagens e extras com URL ultra-curta.
 */
export async function generateQrCodeDataUrl(
  fullUrl: string,
  lesson?: EBDLessonPreparation
): Promise<QrCodeResult> {
  const baseUrl = getBaseShareUrl();

  // 1. Prioridade Máxima: Sincronização em nuvem completa
  // Gera uma URL curta (~45 caracteres) contendo 100% de todas as imagens e slides extras
  if (lesson) {
    try {
      const shareKey = await publishLessonForSharing(lesson);
      if (shareKey) {
        const cloudUrl = `${baseUrl}?share=${shareKey}`;
        const dataUrl = await QRCode.toDataURL(cloudUrl, {
          width: 380,
          margin: 2,
          color: { dark: '#0f172a', light: '#ffffff' },
          errorCorrectionLevel: 'L',
        });
        return { dataUrl, shareUrl: cloudUrl, isShortened: true };
      }
    } catch (err) {
      console.warn('Falha na sincronização em nuvem, tentando encurtamento tradicional:', err);
    }
  }

  // 2. Se a URL direta for razoavelmente curta (< 2400 chars)
  if (fullUrl.length < 2400) {
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

  // 3. Se a URL for grande, tenta encurtar via API
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

  // 4. Fallback Offline: Se estiver sem internet, cria payload compacto preservando imagens e slides extras
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
            p: sub.projetor || '',
            e: sub.explicacao || '',
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
          u: s.imageUrl,
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
        psi: lesson.projectorSlideImages || {},
        bg: lesson.customBg || null,
        tc: lesson.bodyTextColor,
      };

      const compactJson = JSON.stringify(compactLesson);
      const compactCompressed = LZString.compressToEncodedURIComponent(compactJson);
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
