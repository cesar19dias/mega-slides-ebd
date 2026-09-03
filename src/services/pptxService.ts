import pptxgen from 'pptxgenjs';
import type { PresentationData, ThemeConfig, Slide } from '../types';

export function exportToPowerPoint(data: PresentationData, theme: ThemeConfig, customTemplateBg?: string | null): void {
  const pptx = new pptxgen();

  // Configurações Globais da Apresentação MegaEBD
  pptx.author = 'MegaEBD Slides AI';
  pptx.company = 'Escola Bíblica Dominical';
  pptx.title = data.title;
  pptx.layout = 'LAYOUT_16x9';

  data.slides.forEach((slideData: Slide, index: number) => {
    const slide = pptx.addSlide();
    
    const isOfficial = theme.id === 'modelo-oficial-ebd' || !!customTemplateBg;
    const isWhiteSlide = isOfficial && (
      slideData.layout === 'verse' || 
      slideData.title.toLowerCase().includes('leitura')
    );

    // Se houver modelo personalizado carregado pelo usuário, aplica a imagem no fundo de todos os slides
    if (customTemplateBg) {
      if (customTemplateBg.startsWith('data:image')) {
        slide.addImage({ data: customTemplateBg, x: 0, y: 0, w: 13.33, h: 7.5 });
      } else {
        slide.addImage({ path: customTemplateBg, x: 0, y: 0, w: 13.33, h: 7.5 });
      }
    } else {
      slide.background = { color: isWhiteSlide ? 'FFFFFF' : (isOfficial ? '0D2238' : theme.bgColor) };
    }

    if (slideData.speakerNotes) {
      slide.addNotes(slideData.speakerNotes);
    }

    // Desenha formas decorativas nos cantos para o modelo oficial
    if (isOfficial && slideData.layout !== 'title') {
      // Top Left Accent
      slide.addShape('rect', {
        x: 0,
        y: 0,
        w: 2.5,
        h: 0.3,
        fill: { color: '0052CC' }
      });

      // Bottom Right Polygon Card com o número do slide (ex: 6/9)
      slide.addShape('roundRect', {
        x: 10.8,
        y: 6.5,
        w: 2.5,
        h: 1.0,
        fill: { color: '0077FF' },
        rectRadius: 0.2
      });

      slide.addText(`${index + 1} / ${data.slides.length}`, {
        x: 10.8,
        y: 6.5,
        w: 2.5,
        h: 1.0,
        align: 'center',
        valign: 'middle',
        fontSize: 14,
        bold: true,
        color: 'FFFFFF'
      });
    }

    // Renderiza o conteúdo do slide
    if (slideData.layout === 'title') {
      buildTitleSlide(slide, slideData, theme, data, isOfficial);
    } else if (slideData.layout === 'verse') {
      buildVerseSlide(slide, slideData, theme, isOfficial);
    } else if (slideData.title.toLowerCase().includes('leitura')) {
      buildReadingSlide(slide, slideData, data);
    } else {
      buildTopicSlide(slide, slideData, theme, isOfficial);
    }

    // Rodapé discreto no canto esquerdo
    if (index > 0 && !isOfficial) {
      slide.addText(`MegaEBD Slides AI • ${data.title}`, {
        x: 0.5,
        y: 7.1,
        w: 8.0,
        h: 0.3,
        fontSize: 10,
        color: isWhiteSlide ? '475569' : '94A3B8',
        fontFace: theme.fontBody,
      });

      slide.addText(`${index + 1}`, {
        x: 12.0,
        y: 7.1,
        w: 0.8,
        h: 0.3,
        align: 'right',
        fontSize: 10,
        color: isWhiteSlide ? '475569' : '94A3B8',
        fontFace: theme.fontBody,
      });
    }
  });

  const sanitizedTitle = data.title.replace(/[^a-zA-Z0-9-_\s]/g, '').trim() || 'Licao_EBD';
  pptx.writeFile({ fileName: `${sanitizedTitle}_ModeloOficial_MegaEBD.pptx` });
}

function toCaixaBaixa(text: string): string {
  if (!text) return '';
  let str = text.trim();
  if (str === str.toUpperCase()) {
    str = str.toLowerCase();
    str = str.charAt(0).toUpperCase() + str.slice(1);
    const properNouns = [
      'Paulo', 'Cristo', 'Deus', 'Jesus', 'Pedro', 'João', 'Sinédrio',
      'Jerusalém', 'Israel', 'Evangelho', 'Trófimo', 'Ásia', 'Lei', 'Subt', 'Subtópico'
    ];
    properNouns.forEach(noun => {
      const regex = new RegExp(`\\b${noun}\\b`, 'gi');
      str = str.replace(regex, noun);
    });
  }
  return str;
}

// Desenha o título principal da EBD no topo (Centralizado a partir do recuo de 25% / 2/8, Fonte Fredoka)
function drawEbdHeaderBadge(slide: any, label: string) {
  const subMatch = label.match(/^(SUBTÓPICO\s+[\d|A-Z]+|SUBT\.?)\s*[\:\—\-]\s*(.+)$/i);
  const topMatch = label.match(/^(TÓPICO\s+[I|V|X|\d]+)\s*[\:\—\-]\s*(.+)$/i);

  let mainTitle = label;
  let isSubtopic = false;

  if (subMatch) {
    mainTitle = subMatch[2].trim();
    isSubtopic = true;
  } else if (topMatch) {
    mainTitle = topMatch[2].trim();
    isSubtopic = false;
  } else if (label.toUpperCase().includes('SUBT') || label.toUpperCase().includes('SUBTÓPICO')) {
    isSubtopic = true;
  }

  // Remove qualquer prefixo tipo "Subtópico 1", "Subt.", "Subt 2"
  let cleanTitle = mainTitle.replace(/^(subtópico\s*[\d|A-Z]*|subt\.?\s*[\d|A-Z]*)\s*[\:\.\—\-]?\s*/i, '').trim();

  const displayText = isSubtopic ? toCaixaBaixa(cleanTitle) : cleanTitle.toUpperCase();

  slide.addText(displayText, {
    x: 2.66,
    y: 0.55,
    w: 10.0,
    h: 1.2,
    align: 'center',
    valign: 'middle',
    fontSize: 34,
    bold: true,
    color: 'FFFFFF',
    fontFace: 'Arial',
    shrinkText: true
  });
}

// Handler para Slide de Capa
function buildTitleSlide(slide: any, slideData: Slide, theme: ThemeConfig, presentation: PresentationData, isOfficial: boolean) {
  if (slideData.imageUrl) {
    if (slideData.imageUrl.startsWith('data:image')) {
      slide.addImage({ data: slideData.imageUrl, x: 0, y: 0, w: 13.33, h: 7.5 });
    } else {
      slide.addImage({ path: slideData.imageUrl, x: 0, y: 0, w: 13.33, h: 7.5 });
    }
  }

  // Overlay Gradiente de Fundo
  slide.addShape('rect', {
    x: 0,
    y: 0,
    w: 13.33,
    h: 7.5,
    fill: { color: isOfficial ? '0D2238' : theme.bgColor, transparency: 30 }
  });

  // Título Principal (MANTIDO TAMANHO ORIGINAL NO SLIDE 1)
  slide.addText(slideData.title || presentation.title, {
    x: 1.0,
    y: 2.2,
    w: 11.33,
    h: 2.5,
    fontSize: 36,
    bold: true,
    color: 'FFFFFF',
    fontFace: 'Arial',
    align: 'center',
    valign: 'middle'
  });

  // Badge da Lição no canto inferior
  if (isOfficial) {
    drawEbdHeaderBadge(slide, presentation.lessonNumber || 'LIÇÃO EBD');
  }
}

// Handler para Texto Áureo & Verdade Prática (Fundo Branco, Sem Card, Fonte Dobrada)
function buildVerseSlide(slide: any, slideData: Slide, theme: ThemeConfig, isOfficial: boolean) {
  if (isOfficial) {
    const badgeText = slideData.topicBadge || slideData.title || 'TEXTO ÁUREO';
    drawEbdHeaderBadge(slide, badgeText);

    const verseText = slideData.keyVerse?.text || slideData.takeaway || slideData.subtitle || '';
    const verseRef = slideData.keyVerse?.reference || '';

    // Texto Principal no Centro da Tela (Fonte Dobrada: 44)
    slide.addText(`"${verseText}"`, {
      x: 0.8,
      y: 1.6,
      w: 11.8,
      h: verseRef ? 4.5 : 5.2,
      fontSize: 44,
      bold: true,
      color: 'FFFFFF',
      fontFace: 'Arial',
      align: 'center',
      valign: 'middle',
      shrinkText: true
    });

    if (verseRef) {
      slide.addText(`(${verseRef}).`, {
        x: 0.8,
        y: 6.1,
        w: 11.8,
        h: 0.6,
        fontSize: 32,
        bold: true,
        color: 'FACC15',
        fontFace: 'Arial',
        align: 'center'
      });
    }
  } else {
    slide.addText(slideData.title || 'TEXTO ÁUREO', {
      x: 0.8,
      y: 0.8,
      w: 11.5,
      h: 0.8,
      fontSize: 36,
      bold: true,
      color: theme.secondaryColor,
      align: 'center'
    });
  }
}

// Handler para Leitura Bíblica em Classe
function buildReadingSlide(slide: any, slideData: Slide, presentation: PresentationData) {
  drawEbdHeaderBadge(slide, 'LEITURA BÍBLICA EM CLASSE');

  const readingText = slideData.subtitle || (slideData.bulletPoints?.join(' ') ?? '') || presentation.biblicalText || 'Leitura bíblica dos versículos...';

  // Título (livro/capítulo)
  if (presentation.biblicalText) {
    slide.addText(presentation.biblicalText, {
      x: 0.8,
      y: 1.4,
      w: 11.8,
      h: 0.6,
      fontSize: 32,
      bold: true,
      color: 'FACC15',
      fontFace: 'Arial',
      align: 'center'
    });
  }

  slide.addText(readingText, {
    x: 0.8,
    y: presentation.biblicalText ? 2.1 : 1.6,
    w: 11.8,
    h: presentation.biblicalText ? 4.8 : 5.2,
    fontSize: 32,
    bold: false,
    color: 'FFFFFF',
    fontFace: 'Arial',
    align: 'center',
    valign: 'middle',
    autoFit: true,
    shrinkText: true
  });
}

// Handler para Tópico Normal (Fundo Branco, Sem Card, Fonte Dobrada)
function buildTopicSlide(slide: any, slideData: Slide, theme: ThemeConfig, isOfficial: boolean) {
  if (isOfficial) {
    const badgeLabel = slideData.topicBadge || slideData.title;
    drawEbdHeaderBadge(slide, badgeLabel);

    let contentY = 1.8;
    const contentH = 5.0;

    const isSubtopic = slideData.topicBadge?.toUpperCase().includes('SUBTÓPICO');

    // Sub-título do slide (Aumentado em 70%: 36 -> 60)
    if (slideData.topicBadge && slideData.title) {
      const topicTitleText = isSubtopic ? slideData.title : slideData.title.toUpperCase();
      slide.addText(topicTitleText, {
        x: 0.8,
        y: contentY,
        w: 11.8,
        h: 1.2,
        fontSize: 60,
        bold: true,
        color: 'FACC15',
        fontFace: 'Fredoka',
        align: 'center'
      });
      contentY += 1.25;
    }

    if (slideData.bulletPoints && slideData.bulletPoints.length > 0) {
      const bulletCount = slideData.bulletPoints.length;
      const availableH = contentH - (contentY - 1.8);
      const itemH = Math.min(availableH / bulletCount, 1.4);
      const fontSize = bulletCount > 4 ? 26 : bulletCount > 3 ? 30 : 36;

      slideData.bulletPoints.forEach((pt, i) => {
        const yPos = contentY + i * itemH;

        slide.addText(`${i + 1}`, {
          x: 0.8,
          y: yPos,
          w: 0.5,
          h: itemH,
          fontSize: fontSize - 4,
          bold: true,
          color: 'FFFFFF',
          fontFace: 'Arial',
          align: 'center',
          valign: 'middle'
        });

        slide.addText(pt, {
          x: 1.35,
          y: yPos,
          w: 10.8,
          h: itemH,
          fontSize: fontSize,
          bold: true,
          color: 'FFFFFF',
          fontFace: 'Arial',
          align: 'left',
          valign: 'middle',
          shrinkText: true
        });
      });
    } else {
      const bodyText = slideData.subtitle || '';
      slide.addText(bodyText, {
        x: 0.8,
        y: contentY,
        w: 11.8,
        h: contentH - (contentY - 1.8),
        fontSize: 44,
        bold: true,
        color: 'FFFFFF',
        fontFace: 'Arial',
        align: 'center',
        valign: 'middle',
        shrinkText: true
      });
    }
  } else {
    slide.addText(slideData.title, {
      x: 0.8,
      y: 0.6,
      w: 11.5,
      h: 0.8,
      fontSize: 36,
      bold: true,
      color: theme.textColor
    });
  }
}
