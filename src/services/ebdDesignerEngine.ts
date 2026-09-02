/**
 * MOTOR 2 — DESIGNER EBD
 * Responsável por pegar a estrutura didática do Motor 1 e transformá-la em slides 16:9 
 * com layouts dinâmicos, textos limpos e prompts de imagens bíblicas/históricas contextuais.
 */

import type { StructuredEBDLesson } from './ebdProfessorEngine';
import type { PresentationData, Slide, GenerationOptions } from '../types';
import { generateAiImage } from './imageService';

export async function runDesignerEngine(
  lesson: StructuredEBDLesson,
  options: GenerationOptions
): Promise<PresentationData> {
  const slides: Slide[] = [];

  // 1. Slide 1 — Capa Principal (Layout "title" com Imagem de Fundo/Banner)
  const coverImagePrompt = `Capa bíblica majestosa sobre o tema: ${lesson.title}. Estilo ${options.stylePreset || 'bíblico clássico'}, alta definição, iluminação dramática.`;
  const coverImageUrl = options.imageProvider === 'ai' 
    ? await generateAiImage(coverImagePrompt, lesson.title)
    : undefined;

  slides.push({
    id: 'slide-1',
    layout: 'title',
    title: lesson.title,
    subtitle: lesson.subtitle || lesson.themeTopic,
    keyVerse: lesson.keyVerse,
    speakerNotes: `Bem-vindos à aula da EBD! Hoje estudaremos a ${lesson.lessonNumber}: "${lesson.title}". O texto central é ${lesson.keyVerse.reference}.`,
    imageUrl: coverImageUrl,
    imagePrompt: coverImagePrompt,
    imageSource: coverImageUrl ? 'ai' : 'placeholder'
  });

  // 2. Slide 2 — Texto Áureo
  slides.push({
    id: 'slide-2',
    layout: 'verse',
    title: 'TEXTO ÁUREO',
    topicBadge: 'TEXTO ÁUREO',
    keyVerse: lesson.keyVerse,
    speakerNotes: `Recite o Texto Áureo com a classe: "${lesson.keyVerse.text}" (${lesson.keyVerse.reference}).`,
  });

  // 3. Slide 3 — Verdade Prática
  if (lesson.practicalTruth) {
    slides.push({
      id: 'slide-3',
      layout: 'verse',
      title: 'VERDADE PRÁTICA',
      topicBadge: 'VERDADE PRÁTICA',
      takeaway: lesson.practicalTruth,
      speakerNotes: `Enfatize a Verdade Prática para a vida diária dos alunos: ${lesson.practicalTruth}`,
    });
  }

  // 4. Slide 4 — Leitura Bíblica em Classe
  slides.push({
    id: 'slide-4',
    layout: 'question',
    title: 'LEITURA BÍBLICA EM CLASSE',
    topicBadge: 'LEITURA BÍBLICA EM CLASSE',
    subtitle: lesson.biblicalText || '',
    bulletPoints: [lesson.biblicalText || 'Leitura dos versículos da lição.'],
    speakerNotes: `Faça a leitura responsiva dos versículos em classe com os alunos.`,
  });

  // 5. Slides dos Tópicos (I, II, III) com Alternância Dinâmica de Layouts
  let slideCounter = 5;

  for (const topic of lesson.topics) {
    // Para cada subtópico
    for (let subIdx = 0; subIdx < topic.subtopics.length; subIdx++) {
      const sub = topic.subtopics[subIdx];
      const topicBadgeText = `${topic.number}. ${topic.title.toUpperCase()}`;
      const subtopicTitleText = `${sub.letter}. ${sub.title}`;
      
      // Escolhe o layout alternado: image-left, image-right ou two-column
      const isEven = slideCounter % 2 === 0;
      const layoutType = isEven ? 'image-left' : 'image-right';

      // Gera prompt contextual bíblico/histórico
      const promptContext = `Cena bíblica histórica realista representando: ${sub.title} no contexto de ${lesson.title}. Detalhes históricos do primeiro século, vestimentas da época, iluminação profissional.`;
      
      let imageUrl: string | undefined = undefined;
      if (options.imageProvider === 'ai') {
        imageUrl = await generateAiImage(promptContext, sub.title);
      }

      slides.push({
        id: `slide-${slideCounter}`,
        layout: layoutType,
        title: subtopicTitleText,
        topicBadge: topicBadgeText,
        subtitle: `Leitura: ${lesson.biblicalText || ''}`,
        bulletPoints: sub.content && sub.content.length > 0 ? sub.content : ['Aprofundamento teológico do tópico.'],
        speakerNotes: `Explique o subtópico ${sub.letter} (${sub.title}). Conecte o ensinamento bíblico com a aplicação diária dos alunos.`,
        imageUrl: imageUrl,
        imagePrompt: promptContext,
        imageSource: imageUrl ? 'ai' : 'placeholder'
      });

      slideCounter++;
    }
  }

  // 4. Slide de Perguntas de Fixação (se habilitado)
  if (options.includeQuestions && lesson.questions && lesson.questions.length > 0) {
    slides.push({
      id: `slide-${slideCounter}`,
      layout: 'question',
      title: 'PERGUNTAS DE FIXAÇÃO & DEBATE',
      questions: lesson.questions,
      speakerNotes: 'Abra espaço para a participação dos alunos. Incentive-os a responder com base no que aprenderam durante a lição.',
    });
    slideCounter++;
  }

  // 5. Slide de Conclusão & Aplicação Prática (Layout "conclusion")
  const conclusionPrompt = `Ilustração inspiradora de aplicação cristã e fé no cotidiano moderno, iluminação suave e acolhedora.`;
  let conclusionImageUrl: string | undefined = undefined;
  if (options.imageProvider === 'ai') {
    conclusionImageUrl = await generateAiImage(conclusionPrompt, 'Conclusão');
  }

  slides.push({
    id: `slide-${slideCounter}`,
    layout: 'conclusion',
    title: 'CONCLUSÃO & APLICAÇÃO PRÁTICA',
    takeaway: lesson.conclusion.takeaway || lesson.practicalTruth,
    bulletPoints: lesson.conclusion.bulletPoints && lesson.conclusion.bulletPoints.length > 0
      ? lesson.conclusion.bulletPoints
      : ['Leve este ensinamento para a sua semana.', 'Pratique a Palavra de Deus continuadamente.'],
    speakerNotes: 'Faça o resumo final da lição, ore com a classe e encerre a aula.',
    imageUrl: conclusionImageUrl,
    imagePrompt: conclusionPrompt,
    imageSource: conclusionImageUrl ? 'ai' : 'placeholder'
  });

  return {
    title: lesson.title,
    subtitle: lesson.subtitle,
    lessonNumber: lesson.lessonNumber,
    themeTopic: lesson.themeTopic,
    biblicalText: lesson.biblicalText,
    practicalTruth: lesson.practicalTruth,
    targetAudience: options.audience,
    slides: slides
  };
}
