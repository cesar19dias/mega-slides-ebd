/**
 * SERVIÇO DE EXPORTAÇÃO DE SLIDES (PDF e PNG/ZIP)
 * Captura cada slide do projetor via html-to-image (SVG foreignObject nativo do navegador)
 * para garantir 100% de fidelidade visual sem sobreposição de texto ou letras amontoadas.
 */

import { toCanvas } from 'html-to-image';
import jsPDF from 'jspdf';
import JSZip from 'jszip';

export type ExportFormat = 'pdf' | 'png-zip';

/**
 * Captura um elemento DOM como canvas usando o renderizador nativo do navegador (html-to-image)
 */
async function captureElement(el: HTMLElement): Promise<HTMLCanvasElement> {
  await document.fonts.ready;
  return toCanvas(el, {
    quality: 0.95,
    pixelRatio: 2,
    fontEmbedCSS: '',
  });
}

/**
 * Exporta todos os slides como um PDF 16:9
 */
export async function exportSlidesPDF(
  slideElements: HTMLElement[],
  fileName: string = 'mega-ebd-slides'
): Promise<void> {
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [297, 167.0625], // 16:9 em mm
  });

  for (let i = 0; i < slideElements.length; i++) {
    const canvas = await captureElement(slideElements[i]);
    const imgData = canvas.toDataURL('image/jpeg', 0.92);

    if (i > 0) pdf.addPage();
    pdf.addImage(imgData, 'JPEG', 0, 0, 297, 167.0625);
  }

  pdf.save(`${fileName}.pdf`);
}

/**
 * Exporta todos os slides como PNGs num arquivo ZIP
 */
export async function exportSlidesPNGZip(
  slideElements: HTMLElement[],
  fileName: string = 'mega-ebd-slides'
): Promise<void> {
  const zip = new JSZip();
  const folder = zip.folder('slides')!;

  for (let i = 0; i < slideElements.length; i++) {
    const canvas = await captureElement(slideElements[i]);
    const base64 = canvas.toDataURL('image/png').split(',')[1];
    const slideNum = String(i + 1).padStart(2, '0');
    folder.file(`slide_${slideNum}.png`, base64, { base64: true });
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Exporta apenas 1 slide atual como PDF (16:9) - Mais rápido para testes
 */
export async function exportSingleSlidePDF(
  slideElement: HTMLElement,
  fileName: string = 'mega-ebd-slide',
  slideIndex: number = 1
): Promise<void> {
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [297, 167.0625],
  });

  const canvas = await captureElement(slideElement);
  const imgData = canvas.toDataURL('image/jpeg', 0.95);
  pdf.addImage(imgData, 'JPEG', 0, 0, 297, 167.0625);
  pdf.save(`${fileName}_Slide_${slideIndex}.pdf`);
}

/**
 * Exporta apenas 1 slide atual como imagem PNG - Mais rápido para testes
 */
export async function exportSingleSlidePNG(
  slideElement: HTMLElement,
  fileName: string = 'mega-ebd-slide',
  slideIndex: number = 1
): Promise<void> {
  const canvas = await captureElement(slideElement);
  const dataUrl = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `${fileName}_Slide_${slideIndex}.png`;
  a.click();
}


