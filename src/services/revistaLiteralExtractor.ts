/**
 * EXTRATOR DETERMINÍSTICO DO TEXTO LITERAL DA REVISTA (IPSIS LITTERIS)
 *
 * A IA não é confiável para copiar parágrafos longos palavra por palavra:
 * ela tende a resumir ou cortar o texto. Este módulo lê o conteúdo bruto da
 * revista e extrai, por código, o parágrafo completo de cada subtópico, que
 * então substitui o campo "projetor" gerado pela IA.
 *
 * Formato esperado (padrão Lições Bíblicas CPAD):
 *   I. O AMOR QUE SUSTENTA OS MANDAMENTOS
 *   1. O propósito dos mandamentos. Deuteronômio 6 apresenta ...
 *   2. O chamado ao amor exclusivo a Deus. A resposta de Israel ...
 *   SINOPSE I
 */

import type { EBDLessonPreparation, EBDSubtopicPreparation } from '../types';

export interface ExtractedSubtopic {
  number: string;
  title: string; // Título em negrito do subtópico (ex: "O propósito dos mandamentos")
  body: string; // Parágrafo completo sem o título
  full: string; // Título + parágrafo, exatamente como na revista
}

export interface ExtractedTopic {
  number: string; // "I", "II", "III"
  title: string;
  subtopicos: ExtractedSubtopic[];
}

const TOPIC_RE = /^(I{1,3}|IV|V|VI)\s*[.\-–—]\s+(.{3,})$/;
const SUB_RE = /^(\d{1,2})\s*[.)\-–—]\s+(.+)$/;
// Blocos que encerram a área de subtópicos de um tópico (mas não o tópico)
const SUB_AREA_END_RE = /^(SINOPSE|AUX[IÍ]LIO|AMPLIANDO|VOCABUL[AÁ]RIO|PONTO\s+CENTRAL|PARA\s+REFLETIR|SAIBA\s+MAIS|PENSE|RESUMO\s+DO\s+T[OÓ]PICO|PALAVRA[\s-]+CHAVE)/i;
// Blocos que encerram toda a região de tópicos
const TOPICS_END_RE = /^(CONCLUS[AÃ]O|REVISANDO|SUBS[IÍ]DIOS?\s+ENSINADOR|QUESTION[AÁ]RIO|EXERC[IÍ]CIOS?)\b/i;

function isMostlyUppercase(text: string): boolean {
  const letters = text.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (letters.length < 3) return false;
  const upper = letters.replace(/[^A-ZÀ-ÞÇ]/g, '').length;
  return upper / letters.length >= 0.7;
}

function joinLines(lines: string[]): string {
  return lines.reduce((acc, line) => {
    if (!acc) return line;
    // Palavra hifenizada pela quebra de linha do PDF: "obedi-" + "ência"
    if (/[A-Za-zÀ-ÿ]-$/.test(acc) && /^[a-zà-ÿ]/.test(line)) {
      return acc.slice(0, -1) + line;
    }
    return `${acc} ${line}`;
  }, '').replace(/\s+/g, ' ').trim();
}

function splitTitleAndBody(text: string): { title: string; body: string } {
  // O título termina no primeiro ponto (ou ?/!) seguido de espaço e letra maiúscula / aspas
  const match = text.match(/^(.{3,140}?[.?!][”"’]?)\s+(?=[A-ZÀ-ÞÇ“"‘(])/);
  if (!match) return { title: '', body: text };
  const title = match[1].replace(/[.]$/, '').trim();
  const body = text.slice(match[0].length).trim();
  if (!body || body.length < 20) return { title: '', body: text };
  return { title, body };
}

export function extractRevistaTopics(revistaContent: string): ExtractedTopic[] {
  if (!revistaContent) return [];

  const lines = revistaContent
    .replace(/\r/g, '')
    .split('\n')
    .map(l => l.replace(/[\u00a0\u2007\u202f]/g, ' ').trim());

  const topics: ExtractedTopic[] = [];
  let currentTopic: ExtractedTopic | null = null;
  let currentSubLines: string[] | null = null;
  let currentSubNumber = '';
  let inSubArea = false;
  let pendingBreak = false;

  const closeSub = () => {
    if (currentTopic && currentSubLines && currentSubLines.length) {
      const full = joinLines(currentSubLines);
      const { title, body } = splitTitleAndBody(full);
      currentTopic.subtopicos.push({ number: currentSubNumber, title, body, full });
    }
    currentSubLines = null;
  };

  for (const line of lines) {
    if (!line) {
      pendingBreak = true;
      continue;
    }

    const topicMatch = line.match(TOPIC_RE);
    if (topicMatch && isMostlyUppercase(topicMatch[2])) {
      closeSub();
      currentTopic = { number: topicMatch[1], title: topicMatch[2].trim(), subtopicos: [] };
      topics.push(currentTopic);
      inSubArea = true;
      pendingBreak = false;
      continue;
    }

    if (!currentTopic) continue;

    if (TOPICS_END_RE.test(line)) {
      closeSub();
      break;
    }

    if (SUB_AREA_END_RE.test(line)) {
      closeSub();
      inSubArea = false;
      pendingBreak = false;
      continue;
    }

    if (!inSubArea) continue;

    const subMatch = line.match(SUB_RE);
    if (subMatch) {
      closeSub();
      currentSubNumber = subMatch[1];
      currentSubLines = [subMatch[2].trim()];
      pendingBreak = false;
      continue;
    }

    if (currentSubLines) {
      // Após linha em branco, só continua o parágrafo se for claramente uma quebra (começa minúscula)
      if (pendingBreak && !/^[a-zà-ÿ]/.test(line)) {
        closeSub();
      } else {
        currentSubLines.push(line);
      }
    }
    pendingBreak = false;
  }

  closeSub();
  return topics.filter(t => t.subtopicos.length > 0);
}

function normalizeRoman(value: string): string {
  const m = (value || '').toUpperCase().match(/\b(VI|IV|V|I{1,3})\b/);
  return m ? m[1] : '';
}

/**
 * Substitui o "projetor" de cada subtópico pelo parágrafo literal e completo da revista.
 * Subtópicos que a IA omitiu são criados (sem explicação, que será gerada pelo auto-reparo).
 * Retorna quantos subtópicos receberam o texto literal.
 */
export function applyRevistaLiteralText(lesson: EBDLessonPreparation, revistaContent: string): number {
  const extracted = extractRevistaTopics(revistaContent);
  if (!extracted.length) return 0;

  let applied = 0;

  extracted.forEach((exTopic, exIdx) => {
    let topic = lesson.topicos.find(t => normalizeRoman(t.number) === exTopic.number);
    if (!topic) topic = lesson.topicos[exIdx];
    if (!topic) return;

    exTopic.subtopicos.forEach((exSub, exSubIdx) => {
      let sub: EBDSubtopicPreparation | undefined =
        topic!.subtopicos.find(s => String(s.number).replace(/\D/g, '') === exSub.number) ||
        topic!.subtopicos[exSubIdx];

      if (!sub) {
        sub = {
          number: exSub.number,
          title: exSub.title || `Subtópico ${exSub.number}`,
          projetor: '',
          explicacao: '',
          versiculos: [],
          imagePrompt: '',
        };
        topic!.subtopicos.push(sub);
      }

      const body = exSub.title ? exSub.body : exSub.full;
      sub.projetor = `${exSub.number}. ${body}`;
      if (exSub.title) sub.title = exSub.title;
      applied++;
    });
  });

  return applied;
}
