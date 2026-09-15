/**
 * SERVIÇO DE EXPORTAÇÃO DE SLIDES (PDF e PNG/ZIP)
 * Captura cada slide do projetor via html-to-image (SVG foreignObject nativo do navegador)
 * para garantir 100% de fidelidade visual sem sobreposição de texto ou letras amontoadas.
 */

import { toCanvas } from 'html-to-image';
import jsPDF from 'jspdf';
import JSZip from 'jszip';
import type { EBDLessonPreparation } from '../types';

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
 * Exporta todos os slides capturando o palco ao vivo a cada índice (Garante 100% de fidelidade ao slide visível)
 */
export async function exportAllSlidesPDFFromStage(
  totalSlides: number,
  setIndex: (i: number) => void,
  getStageEl: () => HTMLElement | null,
  fileName: string = 'mega-ebd-slides'
): Promise<void> {
  const stage = getStageEl();
  if (!stage) return;
  await document.fonts.ready;

  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [297, 167.0625],
  });

  for (let i = 0; i < totalSlides; i++) {
    setIndex(i);
    await new Promise(r => setTimeout(r, 250));
    const currentStage = getStageEl() || stage;
    const canvas = await captureElement(currentStage);
    const imgData = canvas.toDataURL('image/jpeg', 0.95);

    if (i > 0) pdf.addPage();
    pdf.addImage(imgData, 'JPEG', 0, 0, 297, 167.0625);
  }

  pdf.save(`${fileName}.pdf`);
}

/**
 * Exporta todos os slides como ZIP/PNGs capturando o palco ao vivo a cada índice
 */
export async function exportAllSlidesPNGZipFromStage(
  totalSlides: number,
  setIndex: (i: number) => void,
  getStageEl: () => HTMLElement | null,
  fileName: string = 'mega-ebd-slides'
): Promise<void> {
  const stage = getStageEl();
  if (!stage) return;
  await document.fonts.ready;

  const zip = new JSZip();
  const folder = zip.folder('slides')!;

  for (let i = 0; i < totalSlides; i++) {
    setIndex(i);
    await new Promise(r => setTimeout(r, 250));
    const currentStage = getStageEl() || stage;
    const canvas = await captureElement(currentStage);
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

/**
 * Exporta o Roteiro Limpo do Professor em formato PDF A4 limpo e bem formatado
 */
export function exportTeacherGuideCleanPDF(lesson: EBDLessonPreparation): void {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let yPos = 18;

  const checkPageBreak = (neededHeight: number) => {
    if (yPos + neededHeight > pageHeight - 18) {
      pdf.addPage();
      yPos = 18;
    }
  };

  // Faixa de Cabeçalho do Roteiro
  pdf.setFillColor(15, 23, 42);
  pdf.rect(0, 0, pageWidth, 28, 'F');

  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.text((lesson.metadata.title || 'ROTEIRO DO PROFESSOR EBD').toUpperCase(), margin, 12);

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(203, 213, 225);
  const subTitle = `${lesson.metadata.lessonNumber || 'EBD'} • ${lesson.metadata.themeTopic || ''}`;
  pdf.text(subTitle, margin, 19);

  yPos = 36;

  const addSectionTitle = (title: string) => {
    checkPageBreak(12);
    pdf.setFillColor(30, 41, 59);
    pdf.roundedRect(margin, yPos, contentWidth, 7, 1.5, 1.5, 'F');
    pdf.setTextColor(248, 250, 252);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text(title.toUpperCase(), margin + 3, yPos + 4.8);
    yPos += 11;
  };

  const addParagraph = (text: string, fontSize = 9.5, isBold = false, textColor = [51, 65, 85]) => {
    pdf.setFont('helvetica', isBold ? 'bold' : 'normal');
    pdf.setFontSize(fontSize);
    pdf.setTextColor(textColor[0], textColor[1], textColor[2]);
    const lines = pdf.splitTextToSize(text, contentWidth);
    const blockHeight = lines.length * (fontSize * 0.42);
    checkPageBreak(blockHeight + 3);
    pdf.text(lines, margin, yPos);
    yPos += blockHeight + 3;
  };

  // 1. Texto Áureo
  addSectionTitle('1. Texto Áureo');
  addParagraph(`"${lesson.textAureo.text}"`, 10, true, [15, 23, 42]);
  if (lesson.textAureo.reference) {
    addParagraph(`— ${lesson.textAureo.reference}`, 9, true, [37, 99, 235]);
  }

  // 2. Verdade Prática
  if (lesson.verdadePratica?.text) {
    addSectionTitle('2. Verdade Prática');
    addParagraph(`"${lesson.verdadePratica.text}"`, 10, false, [30, 41, 59]);
  }

  // 3. Leitura Bíblica em Classe
  if (lesson.biblicalText) {
    addSectionTitle('3. Leitura Bíblica em Classe');
    addParagraph(lesson.biblicalText, 9, false, [51, 65, 85]);
  }

  // 4. Desenvolvimento dos Tópicos
  if (lesson.topicos && lesson.topicos.length > 0) {
    addSectionTitle('4. Desenvolvimento dos Tópicos');

    lesson.topicos.forEach((topico) => {
      checkPageBreak(12);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(194, 65, 12);
      pdf.text(`TÓPICO ${topico.number}: ${topico.title.toUpperCase()}`, margin, yPos);
      yPos += 6;

      if (topico.sinopse) {
        addParagraph(`Sinopse: ${topico.sinopse}`, 9.5, true, [30, 41, 59]);
      }

      topico.subtopicos.forEach((sub) => {
        checkPageBreak(8);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10);
        pdf.setTextColor(15, 23, 42);
        pdf.text(`Subtópico ${sub.number}: ${sub.title}`, margin, yPos);
        yPos += 5;

        let explicacaoTexto = '';
        if (sub.frasesExplicativas && sub.frasesExplicativas.length > 0) {
          explicacaoTexto = sub.frasesExplicativas
            .map(f => `• ${f.frase}\n  ${f.explicacao}${f.exemplo ? `\n  💡 Exemplo: ${f.exemplo}` : ''}`)
            .join('\n\n');
        } else if (sub.explicacao) {
          explicacaoTexto = sub.explicacao;
        }

        if (explicacaoTexto) {
          addParagraph(explicacaoTexto, 9, false, [51, 65, 85]);
        }

        if (sub.aplicacao) {
          addParagraph(`🌱 Aplicação Prática: ${sub.aplicacao}`, 9, true, [16, 185, 129]);
        }

        yPos += 2;
      });

      yPos += 3;
    });
  }

  // 5. Conclusão
  if (lesson.conclusao) {
    addSectionTitle('5. Conclusão e Aplicação Final');
    if (lesson.conclusao.takeaway) {
      addParagraph(lesson.conclusao.takeaway, 9.5, false, [30, 41, 59]);
    }
    if (lesson.conclusao.finalPrayer) {
      addParagraph(`🙏 Oração Final: "${lesson.conclusao.finalPrayer}"`, 9.5, true, [79, 70, 229]);
    }
  }

  const fileName = (lesson.metadata.title || 'roteiro-professor').toLowerCase().replace(/\s+/g, '-');
  pdf.save(`${fileName}-roteiro-professor.pdf`);
}



