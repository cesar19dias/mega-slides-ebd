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
  // Remove emojis and characters jsPDF cannot render
  const sanitize = (s: string): string =>
    (s || '')
      // Strip emoji / non-BMP characters
      .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
      .replace(/[\u2600-\u27BF]/gu, '')
      // Normalize common accented letters to ASCII equivalents
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .trim();

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
  pdf.text(sanitize((lesson.metadata.title || 'ROTEIRO DO PROFESSOR EBD').toUpperCase()), margin, 12);

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(203, 213, 225);
  const subTitle = sanitize(`${lesson.metadata.lessonNumber || 'EBD'} - ${lesson.metadata.themeTopic || ''}`);
  pdf.text(subTitle, margin, 19);

  yPos = 36;

  const addSectionTitle = (title: string) => {
    checkPageBreak(12);
    pdf.setFillColor(30, 41, 59);
    pdf.roundedRect(margin, yPos, contentWidth, 7, 1.5, 1.5, 'F');
    pdf.setTextColor(248, 250, 252);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text(sanitize(title).toUpperCase(), margin + 3, yPos + 4.8);
    yPos += 11;
  };

  const addParagraph = (text: string, fontSize = 9.5, isBold = false, textColor = [51, 65, 85]) => {
    pdf.setFont('helvetica', isBold ? 'bold' : 'normal');
    pdf.setFontSize(fontSize);
    pdf.setTextColor(textColor[0], textColor[1], textColor[2]);
    const lines = pdf.splitTextToSize(sanitize(text), contentWidth);
    const blockHeight = lines.length * (fontSize * 0.42);
    checkPageBreak(blockHeight + 3);
    pdf.text(lines, margin, yPos);
    yPos += blockHeight + 3;
  };

  // Transição / Ponte Contextual (Se houver)
  if (lesson.introducao?.ponteContextual) {
    const bridge = lesson.introducao.ponteContextual;
    const textLicaoAnterior = bridge.naLicaoAnterior || bridge.ondeParou;
    const textIntervalo = bridge.ponteContextual || bridge.capitulosIntermediarios;

    if (textLicaoAnterior) {
      addSectionTitle('Na Lição Anterior');
      addParagraph(textLicaoAnterior, 9.5, false, [30, 41, 59]);
    }

    if (textIntervalo) {
      addSectionTitle('Intervalo Bíblico');
      addParagraph(textIntervalo, 9.5, false, [30, 41, 59]);
    }
  }

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
      pdf.text(sanitize(`TOPICO ${topico.number}: ${topico.title.toUpperCase()}`), margin, yPos);
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
        pdf.text(sanitize(`SUBTOPICO ${sub.number}`), margin, yPos);
        yPos += 4;

        pdf.setFontSize(10.5);
        pdf.setTextColor(15, 23, 42);
        pdf.text(sanitize(sub.title), margin, yPos);
        yPos += 3;

        pdf.setDrawColor(226, 232, 240);
        pdf.setLineWidth(0.3);
        pdf.line(margin, yPos, margin + contentWidth, yPos);
        yPos += 5;

        // Camada 1 — Texto da Revista / Projetor
        const txtProjetor = sub.projetor || ((sub.frasesExplicativas && sub.frasesExplicativas.length > 0)
          ? sub.frasesExplicativas.map(f => f.frase).filter(Boolean).join(' ')
          : '');

        if (txtProjetor) {
          checkPageBreak(10);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(8);
          pdf.setTextColor(30, 58, 138);
          pdf.text('TEXTO DA REVISTA / QUADRO:', margin, yPos);
          yPos += 4;

          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(8.5);
          const projLines = pdf.splitTextToSize(sanitize(`"${txtProjetor}"`), contentWidth - 8);
          const projHeight = projLines.length * 3.8;
          checkPageBreak(projHeight + 6);
          // Yellow highlight background
          pdf.setFillColor(255, 240, 100);
          pdf.roundedRect(margin, yPos - 3, contentWidth, projHeight + 5, 2, 2, 'F');
          // Dark amber border
          pdf.setDrawColor(217, 119, 6);
          pdf.setLineWidth(0.6);
          pdf.roundedRect(margin, yPos - 3, contentWidth, projHeight + 5, 2, 2, 'S');
          // Text in dark color over yellow
          pdf.setTextColor(30, 41, 59);
          pdf.text(projLines, margin + 4, yPos);
          yPos += projHeight + 8;
        }

        // Camada 2 — Explicação Didática do Professor (Explicação Linear)
        const expText = sub.explicacao || ((sub.frasesExplicativas && sub.frasesExplicativas.length > 0)
          ? sub.frasesExplicativas.map(f => {
              const label = f.frase ? `"${f.frase}" — ` : '';
              return `${label}${f.explicacao}`.trim();
            }).filter(Boolean).join('\n\n')
          : '');

        if (expText) {
          checkPageBreak(12);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(8.5);
          pdf.setTextColor(2, 132, 199);
          pdf.text('EXPLICAÇÃO DIDÁTICA DO PROFESSOR (EXPLICAÇÃO LINEAR)', margin, yPos);
          yPos += 5;

          pdf.setDrawColor(2, 132, 199);
          pdf.setLineWidth(0.8);
          const expLines = pdf.splitTextToSize(sanitize(expText), contentWidth - 7);
          const expHeight = expLines.length * 3.8;
          checkPageBreak(expHeight + 4);
          pdf.line(margin + 2, yPos - 1, margin + 2, yPos + expHeight - 2);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(8.5);
          pdf.setTextColor(51, 65, 85);
          pdf.text(expLines, margin + 6, yPos + 2);
          yPos += expHeight + 6;
        }

        // Versículos Bíblicos Relevantes
        if (sub.versiculos && sub.versiculos.length > 0) {
          checkPageBreak(10);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(8);
          pdf.setTextColor(16, 185, 129);
          pdf.text('TEXTOS BÍBLICOS RELEVANTES:', margin, yPos);
          yPos += 4;

          sub.versiculos.forEach(v => {
            const vText = `${v.reference}${v.text ? `: "${v.text}"` : ''}`;
            const vLines = pdf.splitTextToSize(sanitize(`- ${vText}`), contentWidth - 6);
            const vHeight = vLines.length * 3.6;
            checkPageBreak(vHeight + 2);
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8);
            pdf.setTextColor(51, 65, 85);
            pdf.text(vLines, margin + 4, yPos);
            yPos += vHeight + 2;
          });
          yPos += 2;
        }

        // Nota privada do Professor — Versiculos (somente no PDF)
        if (sub.notaVersiculos && sub.notaVersiculos.trim()) {
          checkPageBreak(8);
          pdf.setFont('helvetica', 'italic');
          pdf.setFontSize(7.5);
          pdf.setTextColor(146, 64, 14);
          const noteLines = pdf.splitTextToSize(sanitize(`Nota: ${sub.notaVersiculos.trim()}`), contentWidth - 8);
          const noteHeight = noteLines.length * 3.4;
          checkPageBreak(noteHeight + 4);
          pdf.setFillColor(254, 252, 232);
          pdf.roundedRect(margin + 2, yPos - 1, contentWidth - 4, noteHeight + 3, 1, 1, 'F');
          pdf.setDrawColor(217, 119, 6);
          pdf.setLineWidth(0.3);
          pdf.roundedRect(margin + 2, yPos - 1, contentWidth - 4, noteHeight + 3, 1, 1, 'S');
          pdf.text(noteLines, margin + 5, yPos + 2.5);
          yPos += noteHeight + 5;
        }

        // Aplicação Prática
        if (sub.aplicacao) {
          checkPageBreak(10);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(8);
          pdf.setTextColor(217, 119, 6);
          pdf.text('APLICACAO PRATICA:', margin, yPos);
          yPos += 4;

          const apLines = pdf.splitTextToSize(sanitize(sub.aplicacao), contentWidth - 6);
          const apHeight = apLines.length * 3.6;
          checkPageBreak(apHeight + 2);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(8);
          pdf.setTextColor(51, 65, 85);
          pdf.text(apLines, margin + 4, yPos);
          yPos += apHeight + 4;
        }

        // Nota privada do Professor — Aplicação Prática (somente no PDF)
        if (sub.notaAplicacao && sub.notaAplicacao.trim()) {
          checkPageBreak(8);
          pdf.setFont('helvetica', 'italic');
          pdf.setFontSize(7.5);
          pdf.setTextColor(146, 64, 14);
          const noteLines = pdf.splitTextToSize(sanitize(`Nota: ${sub.notaAplicacao.trim()}`), contentWidth - 8);
          const noteHeight = noteLines.length * 3.4;
          checkPageBreak(noteHeight + 4);
          pdf.setFillColor(254, 252, 232);
          pdf.roundedRect(margin + 2, yPos - 1, contentWidth - 4, noteHeight + 3, 1, 1, 'F');
          pdf.setDrawColor(217, 119, 6);
          pdf.setLineWidth(0.3);
          pdf.roundedRect(margin + 2, yPos - 1, contentWidth - 4, noteHeight + 3, 1, 1, 'S');
          pdf.text(noteLines, margin + 5, yPos + 2.5);
          yPos += noteHeight + 5;
        }

        // Ênfase para a Aula
        if (sub.enfase) {
          checkPageBreak(10);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(8);
          pdf.setTextColor(234, 88, 12);
          pdf.text('ENFASE PARA A AULA:', margin, yPos);
          yPos += 4;

          const enfLines = pdf.splitTextToSize(sanitize(sub.enfase), contentWidth - 6);
          const enfHeight = enfLines.length * 3.6;
          checkPageBreak(enfHeight + 2);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(8);
          pdf.setTextColor(51, 65, 85);
          pdf.text(enfLines, margin + 4, yPos);
          yPos += enfHeight + 4;
        }

        // Nota privada do Professor — Ênfase (somente no PDF)
        if (sub.notaEnfase && sub.notaEnfase.trim()) {
          checkPageBreak(8);
          pdf.setFont('helvetica', 'italic');
          pdf.setFontSize(7.5);
          pdf.setTextColor(146, 64, 14);
          const noteLines = pdf.splitTextToSize(sanitize(`Nota: ${sub.notaEnfase.trim()}`), contentWidth - 8);
          const noteHeight = noteLines.length * 3.4;
          checkPageBreak(noteHeight + 4);
          pdf.setFillColor(254, 252, 232);
          pdf.roundedRect(margin + 2, yPos - 1, contentWidth - 4, noteHeight + 3, 1, 1, 'F');
          pdf.setDrawColor(217, 119, 6);
          pdf.setLineWidth(0.3);
          pdf.roundedRect(margin + 2, yPos - 1, contentWidth - 4, noteHeight + 3, 1, 1, 'S');
          pdf.text(noteLines, margin + 5, yPos + 2.5);
          yPos += noteHeight + 5;
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
      addParagraph(`Oracao Final: "${lesson.conclusao.finalPrayer}"`, 9.5, true, [79, 70, 229]);
    }
  }

  const fileName = (lesson.metadata.title || 'roteiro-professor').toLowerCase().replace(/\s+/g, '-');
  pdf.save(`${fileName}-roteiro-professor.pdf`);
}

/**
 * Exporta o Roteiro do Professor como HTML colorido.
 * Abra o arquivo no navegador, selecione tudo (Ctrl+A) e cole no Google Docs — as cores são preservadas.
 */
export function exportTeacherGuideHTML(lesson: EBDLessonPreparation): void {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const sections: string[] = [];

  const sectionBox = (title: string, content: string, bg = '#1e2d3e', color = '#f8fafc') => `
    <div style="background:${bg};color:${color};font-weight:bold;font-size:11pt;padding:6px 10px;border-radius:5px;margin:18px 0 6px;">
      ${esc(title.toUpperCase())}
    </div>
    ${content}`;

  const yellowBox = (text: string) => `
    <div style="background:#fff176;border:1.5px solid #f59e0b;border-radius:6px;padding:8px 12px;margin:6px 0 10px;font-weight:bold;font-size:10.5pt;color:#1e293b;line-height:1.5;">
      📌 ${esc(text)}
    </div>`;

  const blueBlock = (label: string, text: string) => `
    <div style="margin:6px 0 4px;">
      <span style="color:#0284c7;font-weight:bold;font-size:8.5pt;">${esc(label)}</span>
    </div>
    <div style="border-left:3px solid #0284c7;padding-left:10px;margin:0 0 10px 2px;color:#334155;font-size:9pt;line-height:1.55;">
      ${esc(text)}
    </div>`;

  const greenVerses = (versiculos: { reference: string; text?: string }[]) => {
    const items = versiculos.map(v => {
      const ref = esc(v.reference);
      const txt = v.text ? `: <em>${esc(v.text)}</em>` : '';
      return `<li style="margin-bottom:4px;">✅ <strong>${ref}</strong>${txt}</li>`;
    }).join('');
    return `
    <div style="color:#059669;font-weight:bold;font-size:8.5pt;margin-top:8px;">📖 TEXTOS BÍBLICOS RELEVANTES:</div>
    <ul style="margin:4px 0 10px 14px;padding:0;color:#1e293b;font-size:9pt;line-height:1.5;">${items}</ul>`;
  };

  const aplicacaoBlock = (text: string) => `
    <div style="color:#7c3aed;font-weight:bold;font-size:8.5pt;margin-top:8px;">🙌 APLICAÇÃO PRÁTICA:</div>
    <div style="background:#f5f3ff;border-left:3px solid #7c3aed;padding:6px 10px;margin:4px 0 10px 2px;color:#3b0764;font-size:9pt;line-height:1.55;">
      ${esc(text)}
    </div>`;

  // ── Cabeçalho ──
  sections.push(`
    <div style="background:#0f172a;color:#fff;padding:14px 18px;border-radius:8px;margin-bottom:20px;">
      <div style="font-size:15pt;font-weight:bold;letter-spacing:1px;">
        ${esc((lesson.metadata.title || 'ROTEIRO DO PROFESSOR EBD').toUpperCase())}
      </div>
      <div style="font-size:9pt;color:#cbd5e1;margin-top:4px;">
        ${esc(lesson.metadata.lessonNumber || '')} • ${esc(lesson.metadata.themeTopic || '')}
      </div>
    </div>`);

  // ── Ponte Contextual ──
  const bridge = lesson.introducao?.ponteContextual;
  if (bridge) {
    const naLicao = bridge.naLicaoAnterior || bridge.ondeParou;
    const intervalo = bridge.ponteContextual || bridge.capitulosIntermediarios;
    if (naLicao) sections.push(sectionBox('Na Lição Anterior', `<p style="color:#1e293b;font-size:9.5pt;line-height:1.6;margin:4px 0 10px;">${esc(naLicao)}</p>`));
    if (intervalo) sections.push(sectionBox('Intervalo Bíblico', `<p style="color:#1e293b;font-size:9.5pt;line-height:1.6;margin:4px 0 10px;">${esc(intervalo)}</p>`));
  }

  // ── 1. Texto Áureo ──
  const taContent = `
    ${yellowBox(`${lesson.textAureo.text}${lesson.textAureo.reference ? ' — ' + lesson.textAureo.reference : ''}`)}`;
  sections.push(sectionBox('1. Texto Âncora', taContent));

  // ── 2. Verdade Prática ──
  if (lesson.verdadePratica?.text) {
    sections.push(sectionBox('2. Verdade Prática',
      `<p style="color:#1e293b;font-size:9.5pt;line-height:1.6;margin:4px 0 10px;font-style:italic;">"${esc(lesson.verdadePratica.text)}"</p>`
    ));
  }

  // ── 3. Leitura Bíblica ──
  if (lesson.biblicalText) {
    sections.push(sectionBox('3. Leitura Bíblica em Classe',
      `<p style="color:#334155;font-size:9pt;line-height:1.6;margin:4px 0 10px;">${esc(lesson.biblicalText)}</p>`
    ));
  }

  // ── 4. Tópicos ──
  if (lesson.topicos && lesson.topicos.length > 0) {
    sections.push(sectionBox('4. Desenvolvimento dos Tópicos', ''));

    lesson.topicos.forEach(topico => {
      sections.push(`
        <div style="color:#c2410c;font-weight:bold;font-size:12pt;margin:16px 0 4px;letter-spacing:0.5px;">
          TÓPICO ${esc(String(topico.number))}: ${esc(topico.title.toUpperCase())}
        </div>`);

      if (topico.sinopse) {
        sections.push(`<p style="color:#1e293b;font-size:9pt;margin:0 0 8px;font-style:italic;">${esc(topico.sinopse)}</p>`);
      }

      topico.subtopicos.forEach(sub => {
        sections.push(`
          <div style="border-top:1.5px solid #e2e8f0;margin:12px 0 4px;padding-top:8px;">
            <span style="color:#d97706;font-weight:bold;font-size:8pt;">SUBTÓPICO ${esc(String(sub.number))}</span><br>
            <span style="color:#0f172a;font-weight:bold;font-size:10.5pt;">${esc(sub.title)}</span>
          </div>`);

        // Camada 1 — Projetor / Revista (AMARELO)
        const txtProjetor = sub.projetor || ((sub.frasesExplicativas && sub.frasesExplicativas.length > 0)
          ? sub.frasesExplicativas.map(f => f.frase).filter(Boolean).join(' ') : '');
        if (txtProjetor) sections.push(yellowBox(txtProjetor));

        // Camada 2 — Explicação (AZUL)
        const expText = sub.explicacao || ((sub.frasesExplicativas && sub.frasesExplicativas.length > 0)
          ? sub.frasesExplicativas.map(f => {
              const label = f.frase ? `"${f.frase}" — ` : '';
              return `${label}${f.explicacao}`.trim();
            }).filter(Boolean).join('\n') : '');
        if (expText) sections.push(blueBlock('EXPLICAÇÃO DIDÁTICA DO PROFESSOR:', expText));

        // Versículos (VERDE)
        if (sub.versiculos && sub.versiculos.length > 0) sections.push(greenVerses(sub.versiculos));

        // Aplicação (ROXO)
        if (sub.aplicacao) sections.push(aplicacaoBlock(sub.aplicacao));
      });
    });
  }

  // ── 5. Conclusão ──
  if (lesson.conclusao) {
    const conclusaoContent = [
      lesson.conclusao.takeaway
        ? `<p style="color:#1e293b;font-size:9.5pt;line-height:1.6;margin:4px 0 8px;">${esc(lesson.conclusao.takeaway)}</p>`
        : '',
      lesson.conclusao.finalPrayer
        ? `<p style="color:#4f46e5;font-weight:bold;font-size:9.5pt;margin:4px 0;">🙏 Oração Final: "${esc(lesson.conclusao.finalPrayer)}"</p>`
        : '',
    ].join('');
    sections.push(sectionBox('5. Conclusão e Aplicação Final', conclusaoContent));
  }

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Roteiro do Professor - ${esc(lesson.metadata.title || 'EBD')}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; max-width: 780px; margin: 30px auto; padding: 0 20px; background: #fff; color: #1e293b; }
    p { margin: 0 0 6px; }
    ul { margin: 0; }
    * { box-sizing: border-box; }
  </style>
</head>
<body>
  ${sections.join('\n')}
  <div style="margin-top:40px;border-top:1px solid #e2e8f0;padding-top:10px;font-size:8pt;color:#94a3b8;text-align:center;">
    Gerado por Mega Slides EBD • ${new Date().toLocaleDateString('pt-BR')}
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(lesson.metadata.title || 'roteiro').toLowerCase().replace(/\s+/g, '-')}-roteiro-colorido.html`;
  a.click();
  URL.revokeObjectURL(url);
}
