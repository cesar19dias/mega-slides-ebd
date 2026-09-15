import LZString from 'lz-string';
import QRCode from 'qrcode';
import type { EBDLessonPreparation } from '../types';

/**
 * Converte um objeto EBDLessonPreparation em uma URL comprimida pronta para compartilhamento
 */
export function encodeLessonToUrl(lesson: EBDLessonPreparation): string {
  try {
    const jsonStr = JSON.stringify(lesson);
    const compressed = LZString.compressToEncodedURIComponent(jsonStr);
    const baseUrl = window.location.origin + window.location.pathname;
    return `${baseUrl}#lesson=${compressed}`;
  } catch (err) {
    console.error('Erro ao comprimir lição para URL:', err);
    return window.location.href;
  }
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

    const parsed = JSON.parse(jsonStr) as EBDLessonPreparation;
    if (parsed && parsed.metadata && parsed.topicos) {
      return parsed;
    }
  } catch (err) {
    console.error('Erro ao decodificar lição da URL:', err);
  }

  return null;
}

/**
 * Gera uma imagem DataURL (PNG) de QR Code a partir de um texto ou URL
 */
export async function generateQrCodeDataUrl(text: string): Promise<string> {
  try {
    return await QRCode.toDataURL(text, {
      width: 380,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'L',
    });
  } catch (err) {
    console.error('Erro ao gerar imagem de QR Code:', err);
    throw err;
  }
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
