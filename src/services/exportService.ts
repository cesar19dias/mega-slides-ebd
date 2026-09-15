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
        checkPageBreak(25);

        // Cabeçalho do Subtópico
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8.5);
        pdf.setTextColor(217, 119, 6);
        pdf.text(`SUBTÓPICO ${sub.number}`, margin, yPos);
        yPos += 4;

        pdf.setFontSize(10.5);
        pdf.setTextColor(15, 23, 42);
        pdf.text(sub.title, margin, yPos);
        yPos += 3;

        pdf.setDrawColor(226, 232, 240);
        pdf.setLineWidth(0.3);
        pdf.line(margin, yPos, margin + contentWidth, yPos);
        yPos += 5;

        // Camada 2 — Explicação Didática do Professor (Frase a Frase)
        if (sub.frasesExplicativas && sub.frasesExplicativas.length > 0) {
          checkPageBreak(12);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(8.5);
          pdf.setTextColor(2, 132, 199);
          pdf.text('EXPLICAÇÃO DIDÁTICA DO PROFESSOR (CONSTANTE FRASE A FRASE)', margin, yPos);
          yPos += 5;

          sub.frasesExplicativas.forEach((f) => {
            // Frase do Texto
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(8.5);
            pdf.setTextColor(217, 119, 6);
            pdf.text('📌 Frase do Texto:', margin, yPos);

            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(9);
            pdf.setTextColor(30, 41, 59);
            const fraseLines = pdf.splitTextToSize(`“${f.frase}”`, contentWidth - 32);
            pdf.text(fraseLines, margin + 30, yPos);
            const fraseHeight = Math.max(4, fraseLines.length * 4);
            yPos += fraseHeight + 2;

            // Explicação Didática & Histórica com linha azul vertical
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(8);
            pdf.setTextColor(2, 132, 199);
            pdf.text('👉 Explicação Didática & Histórica:', margin + 3, yPos);
            yPos += 4;

            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8.5);
            pdf.setTextColor(51, 65, 85);
            const expLines = pdf.splitTextToSize(f.explicacao, contentWidth - 7);
            const expHeight = expLines.length * 3.8;

            checkPageBreak(expHeight + 4);

            // Linha vertical azul de destaque
            pdf.setDrawColor(2, 132, 199);
            pdf.setLineWidth(0.8);
            pdf.line(margin + 2, yPos - 1, margin + 2, yPos + expHeight - 2);

            pdf.text(expLines, margin + 6, yPos + 2);
            yPos += expHeight + 4;

            // Exemplo / Alusão Prática
            if (f.exemplo) {
              const exLines = pdf.splitTextToSize(`💡 EXEMPLO: "${f.exemplo}"`, contentWidth - 8);
              const exHeight = exLines.length * 3.6 + 4;
              checkPageBreak(exHeight + 2);

              pdf.setFillColor(254, 243, 199);
              pdf.setDrawColor(252, 211, 77);
              pdf.setLineWidth(0.3);
              pdf.roundedRect(margin + 3, yPos, contentWidth - 6, exHeight, 1.5, 1.5, 'FD');

              pdf.setFont('helvetica', 'bold');
              pdf.setFontSize(8);
              pdf.setTextColor(146, 64, 14);
              pdf.text(exLines, margin + 6, yPos + 4);

              yPos += exHeight + 4;
            }
          });
        } else if (sub.explicacao) {
          addParagraph(sub.explicacao, 8.5, false, [51, 65, 85]);
        }

        yPos += 4;
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



