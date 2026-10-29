/**
 * SERVIÇO DE GERAÇÃO E GERENCIAMENTO DE PROMPTS VISUAIS (MEGAEBD)
 * 
 * Cria prompts 16:9 ultra-elaborados, cinematográficos e contextuais para:
 * - Título da Lição (Capa)
 * - Texto Áureo
 * - Verdade Prática
 * - Palavra-Chave
 * - Tópicos (I, II, III)
 * - Subtópicos (1, 2, 3)
 * 
 * Compatível com Midjourney, Canva, DALL-E 3, Bing Image Creator e gerador nativo MegaEBD.
 */

import type { EBDLessonPreparation } from '../types';
import { callGeminiRaw, getStoredApiKey } from './geminiService';
import { jsonrepair } from 'jsonrepair';

/**
 * Gera um prompt fotográfico e cinematográfico padrão 16:9 baseado no contexto bíblico/histórico
 */
export function generateDefaultPrompt(
  type: 'title' | 'aureo' | 'pratica' | 'palavra_chave' | 'topic' | 'subtopic',
  mainText: string,
  extraContext?: string
): string {
  const cleanMain = (mainText || '').trim();
  const cleanContext = (extraContext || '').trim();

  switch (type) {
    case 'title':
      return `Cinematic wide-angle 16:9 film still depicting the biblical theme "${cleanMain}${cleanContext ? ` - ${cleanContext}` : ''}". 1st-century ancient Mediterranean landscape, majestic limestone architecture, dramatic golden hour sunbeams breaking through atmospheric clouds, historically authentic textured linen garments, realistic depth of field, photorealistic, 8k resolution, shot on 35mm Panavision lens, no modern items, no text, no letters --ar 16:9 --style raw --v 6.0`;

    case 'aureo':
      return `Cinematic historical 16:9 biblical illustration capturing the solemn spiritual essence of the sacred verse: "${cleanMain}" (${cleanContext || 'Holy Scriptures'}). Dramatic Rembrandt chiaroscuro lighting, warm candlelight and natural morning dust particles, ancient parchment and biblical environment, profound reverence, 8k photorealistic detail, 35mm lens, no modern objects, no text overlay --ar 16:9 --style raw`;

    case 'pratica':
      return `Cinematic 16:9 conceptual depiction of Christian faith and practical living in action: "${cleanMain}". Meaningful emotional connection, warm natural ambient illumination, atmospheric lighting, inspiring and uplifting spiritual ambiance, fine art photography style, depth of field, high detail, no text, no watermarks --ar 16:9 --style raw`;

    case 'palavra_chave':
      return `Cinematic 16:9 symbolic and monumental visual representing the theological concept of "${cleanMain.toUpperCase()}": ${cleanContext || 'faith, divine truth and enduring spiritual substance'}. Dramatic volumetric light beams, timeless ancient stone and natural organic elements, majestic composition, fine art realism, 8k resolution, clean visual composition, no typography, no letters --ar 16:9 --style raw`;

    case 'topic':
      return `Cinematic 16:9 historical wide-shot setting the scene for "${cleanMain}"${cleanContext ? ` (${cleanContext})` : ''}. Authentic 1st-century biblical setting, massive ancient architecture, people in period-accurate woven tunics in lively discussion, dramatic cinematic lighting, deep shadows, atmospheric perspective, photorealistic 8k, no text, no captions --ar 16:9 --style raw`;

    case 'subtopic':
    default:
      return `Cinematic 16:9 historical scene capturing the biblical narrative moment of "${cleanMain}". ${cleanContext ? `Key scene: ${cleanContext.slice(0, 150)}. ` : ''}Authentic 1st-century Mediterranean setting, textured linen garments, expressive emotional faces, dramatic chiaroscuro lighting, natural sun rays, photorealistic 8k, Panavision 35mm lens, no modern items, no text, no subtitles --ar 16:9 --style raw`;
  }
}

/**
 * Garante que todos os campos de prompt visual estejam preenchidos na lição
 */
export function fillMissingLessonPrompts(lesson: EBDLessonPreparation): EBDLessonPreparation {
  const updated: EBDLessonPreparation = {
    ...lesson,
    metadata: {
      ...lesson.metadata,
      imagePrompt: lesson.metadata.imagePrompt?.trim() || generateDefaultPrompt(
        'title',
        lesson.metadata.title,
        lesson.metadata.themeTopic
      )
    },
    textAureo: {
      ...lesson.textAureo,
      imagePrompt: lesson.textAureo.imagePrompt?.trim() || generateDefaultPrompt(
        'aureo',
        lesson.textAureo.text,
        lesson.textAureo.reference
      )
    },
    verdadePratica: {
      ...lesson.verdadePratica,
      imagePrompt: lesson.verdadePratica.imagePrompt?.trim() || generateDefaultPrompt(
        'pratica',
        lesson.verdadePratica.text,
        lesson.metadata.title
      )
    },
    palavraChave: lesson.palavraChave ? {
      ...lesson.palavraChave,
      imagePrompt: lesson.palavraChave.imagePrompt?.trim() || generateDefaultPrompt(
        'palavra_chave',
        lesson.palavraChave.palavra,
        lesson.palavraChave.explicacao
      )
    } : undefined,
    topicos: (lesson.topicos || []).map((t, tIdx) => {
      const topicNum = t.number || `TÓPICO ${tIdx + 1}`;
      const topicPrompt = t.imagePrompt?.trim() || generateDefaultPrompt(
        'topic',
        `${topicNum}: ${t.title}`,
        t.sinopse || lesson.metadata.title
      );

      return {
        ...t,
        imagePrompt: topicPrompt,
        subtopicos: (t.subtopicos || []).map((sub, sIdx) => {
          const subNum = sub.number || `${sIdx + 1}`;
          const subPrompt = sub.imagePrompt?.trim() || generateDefaultPrompt(
            'subtopic',
            `${subNum}. ${sub.title}`,
            sub.projetor || sub.explicacao
          );

          return {
            ...sub,
            imagePrompt: subPrompt
          };
        })
      };
    })
  };

  return updated;
}

/**
 * Gera prompts hiperdetalhados e sob medida usando o modelo Gemini
 */
export async function generateAllLessonPromptsWithAi(
  lesson: EBDLessonPreparation,
  apiKey?: string,
  modelName: string = 'gemini-2.5-flash'
): Promise<EBDLessonPreparation> {
  const effectiveKey = apiKey || getStoredApiKey() || localStorage.getItem('mega_slides_gemini_key') || '';
  if (!effectiveKey) {
    // Se não tiver chave disponível, aplica o gerador inteligente local
    return fillMissingLessonPrompts(lesson);
  }

  const promptStructureSummary = {
    title: lesson.metadata.title,
    theme: lesson.metadata.themeTopic,
    textAureo: `${lesson.textAureo.text} (${lesson.textAureo.reference})`,
    verdadePratica: lesson.verdadePratica.text,
    palavraChave: lesson.palavraChave ? `${lesson.palavraChave.palavra}: ${lesson.palavraChave.explicacao}` : undefined,
    topicos: lesson.topicos.map(t => ({
      number: t.number,
      title: t.title,
      sinopse: t.sinopse,
      subtopicos: t.subtopicos.map(s => ({
        number: s.number,
        title: s.title,
        resumo: s.projetor || s.explicacao?.slice(0, 150)
      }))
    }))
  };

  const aiInstructions = `
Você é um Especialista em Direção de Arte e Engenharia de Prompts Visuais para o Midjourney e DALL-E 3 especializado em narrativas bíblicas, históricas e teológicas da Escola Bíblica Dominical (MegaEBD).

Sua missão é gerar PROMPTS VISUAIS CINEMATOGRÁFICOS 16:9 em INGLÊS (Midjourney standard) para TODOS os componentes da lição:
1. "titlePrompt": Capa da lição (cena cinematográfica majestosa que resume o tema central).
2. "aureoPrompt": Ilustração bíblica profunda da passagem do Texto Áureo.
3. "verdadePraticaPrompt": Cena ilustrativa/conceitual expressando a Verdade Prática na vida de fé.
4. "palavraChavePrompt": Composição simbólica e monumental expressando a Palavra-Chave da lição.
5. "topics": Array com um prompt para cada Tópico.
6. "subtopics": Prompts para cada um dos Subtópicos dos tópicos.

REGRAS DOS PROMPTS:
- Formato 16:9 (--ar 16:9).
- Estilo: Cinematic wide-angle film still, Rembrandt chiaroscuro lighting, 1st-century authentic garments, photorealistic, 8k, shot on 35mm lens.
- Sem texto, sem letras, sem marcas d'água (--no text typography letters captions).
- Idioma dos prompts: Inglês descritivo de alta qualidade.

DADOS DA LIÇÃO:
${JSON.stringify(promptStructureSummary, null, 2)}

RESPONDA EXCLUSIVAMENTE COM O JSON NESTE FORMATO:
{
  "titlePrompt": "Cinematic wide-angle 16:9 film still...",
  "aureoPrompt": "Cinematic 16:9 biblical illustration...",
  "verdadePraticaPrompt": "Cinematic 16:9 scene...",
  "palavraChavePrompt": "Cinematic 16:9 symbolic visual...",
  "topics": [
    {
      "number": "I",
      "imagePrompt": "Cinematic 16:9 scene for Topic I...",
      "subtopics": [
        { "number": "1", "imagePrompt": "Cinematic 16:9 scene for Subtopic 1..." },
        { "number": "2", "imagePrompt": "Cinematic 16:9 scene for Subtopic 2..." },
        { "number": "3", "imagePrompt": "Cinematic 16:9 scene for Subtopic 3..." }
      ]
    }
  ]
}
`;

  try {
    const rawAiResult = await callGeminiRaw(aiInstructions, modelName, true);
    const cleanedJson = rawAiResult.replace(/```json\s*/gi, '').replace(/```\s*$/gi, '').trim();
    const parsed = JSON.parse(jsonrepair(cleanedJson));

    const updated: EBDLessonPreparation = {
      ...lesson,
      metadata: {
        ...lesson.metadata,
        imagePrompt: parsed.titlePrompt || lesson.metadata.imagePrompt || generateDefaultPrompt('title', lesson.metadata.title, lesson.metadata.themeTopic)
      },
      textAureo: {
        ...lesson.textAureo,
        imagePrompt: parsed.aureoPrompt || lesson.textAureo.imagePrompt || generateDefaultPrompt('aureo', lesson.textAureo.text, lesson.textAureo.reference)
      },
      verdadePratica: {
        ...lesson.verdadePratica,
        imagePrompt: parsed.verdadePraticaPrompt || lesson.verdadePratica.imagePrompt || generateDefaultPrompt('pratica', lesson.verdadePratica.text, lesson.metadata.title)
      },
      palavraChave: lesson.palavraChave ? {
        ...lesson.palavraChave,
        imagePrompt: parsed.palavraChavePrompt || lesson.palavraChave.imagePrompt || generateDefaultPrompt('palavra_chave', lesson.palavraChave.palavra, lesson.palavraChave.explicacao)
      } : undefined,
      topicos: lesson.topicos.map((topico, tIdx) => {
        const aiTopic = parsed.topics?.[tIdx] || parsed.topics?.find((pt: any) => pt.number === topico.number);
        const topicPrompt = aiTopic?.imagePrompt || topico.imagePrompt || generateDefaultPrompt('topic', `${topico.number}: ${topico.title}`, topico.sinopse);

        return {
          ...topico,
          imagePrompt: topicPrompt,
          subtopicos: topico.subtopicos.map((sub, sIdx) => {
            const aiSub = aiTopic?.subtopics?.[sIdx] || aiTopic?.subtopics?.find((ps: any) => ps.number === sub.number);
            const subPrompt = aiSub?.imagePrompt || sub.imagePrompt || generateDefaultPrompt('subtopic', `${sub.number}. ${sub.title}`, sub.projetor || sub.explicacao);

            return {
              ...sub,
              imagePrompt: subPrompt
            };
          })
        };
      })
    };

    return updated;
  } catch (err) {
    console.warn('Falha na chamada de IA para prompts, aplicando fallback automático:', err);
    return fillMissingLessonPrompts(lesson);
  }
}

/**
 * Formata todos os prompts gerados em um bloco de texto organizado pronto para copiar e colar
 */
export function formatAllPromptsForExport(lesson: EBDLessonPreparation): string {
  const l = fillMissingLessonPrompts(lesson);
  let out = `========================================================================\n`;
  out += `🖼️ PROMPTS VISUAIS 16:9 (CANVA / MIDJOURNEY / DALL-E) — MEGAEBD\n`;
  out += `${l.metadata.lessonNumber || 'LIÇÃO EBD'}: ${l.metadata.title}\n`;
  out += `Tema: ${l.metadata.themeTopic}\n`;
  out += `========================================================================\n\n`;

  // 1. TÍTULO / CAPA
  out += `--- 1. TÍTULO DA LIÇÃO (SLIDE DE CAPA) ---\n`;
  out += `${l.metadata.imagePrompt}\n\n`;

  // 2. TEXTO ÁUREO
  out += `--- 2. TEXTO ÁUREO (${l.textAureo.reference}) ---\n`;
  out += `${l.textAureo.imagePrompt}\n\n`;

  // 3. VERDADE PRÁTICA
  out += `--- 3. VERDADE PRÁTICA ---\n`;
  out += `${l.verdadePratica.imagePrompt}\n\n`;

  // 4. PALAVRA-CHAVE
  if (l.palavraChave?.palavra) {
    out += `--- 4. PALAVRA-CHAVE: ${l.palavraChave.palavra.toUpperCase()} ---\n`;
    out += `${l.palavraChave.imagePrompt}\n\n`;
  }

  // 5. TÓPICOS (APENAS OS 3 TÓPICOS PRINCIPAIS)
  l.topicos.forEach((topico) => {
    out += `------------------------------------------------------------------------\n`;
    out += `--- TÓPICO ${topico.number}: ${topico.title.toUpperCase()} ---\n`;
    out += `------------------------------------------------------------------------\n`;
    out += `Prompt do Tópico:\n${topico.imagePrompt}\n\n`;
  });

  out += `========================================================================\n`;
  out += `Dica: Cole no Midjourney, Canva Magic Media, DALL-E 3 ou Leonardo.ai\n`;
  out += `========================================================================\n`;

  return out;
}
