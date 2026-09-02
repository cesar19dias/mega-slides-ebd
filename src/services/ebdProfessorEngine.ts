/**
 * MOTOR 1 — PROFESSOR EBD
 * Responsável por ler o conteúdo bruto da lição e produzir uma estrutura pedagógica e teológica organizada.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { GenerationOptions } from '../types';

export interface StructuredEBDLesson {
  title: string;
  subtitle: string;
  lessonNumber: string;
  themeTopic: string;
  biblicalText: string;
  keyVerse: {
    reference: string;
    text: string;
  };
  practicalTruth: string;
  introduction: string;
  topics: Array<{
    number: string;
    title: string;
    subtopics: Array<{
      letter: string;
      title: string;
      content: string[];
    }>;
  }>;
  conclusion: {
    summary: string;
    takeaway: string;
    bulletPoints: string[];
  };
  questions: string[];
}

export async function runProfessorEngine(
  apiKey: string,
  rawContent: string,
  options: GenerationOptions
): Promise<StructuredEBDLesson> {
  const cleanApiKey = (apiKey || '').trim().replace(/^["']|["']$/g, '');
  if (!cleanApiKey) {
    throw new Error('Chave de API do Gemini não informada.');
  }

  const genAI = new GoogleGenerativeAI(cleanApiKey);
  const selectedModel = options.selectedAiModel || 'gemini-3.5-flash-lite';

  const prompt = `
Você é o MOTOR 1: PROFESSOR EBD — Um doutor em Teologia e Pedagogia especialista em revistas da Escola Bíblica Dominical (CPAD).
Sua ÚNICA função é extrair e estruturar pedagogicamente o texto da lição fornecida.

CONFIGURAÇÕES DA LIÇÃO:
- Público-Alvo: ${options.audience}
- Versão Bíblica: ${options.bibleVersion || 'ARC'}

FORMATO JSON DE SAÍDA EXIGIDO (Apenas o JSON puro):
{
  "title": "Título Principal da Lição",
  "subtitle": "Tema Geral do Trimestre",
  "lessonNumber": "Lição X",
  "themeTopic": "Eixo Teológico Central",
  "biblicalText": "Leitura Bíblica em Classe (ex: Atos 21.27-30)",
  "keyVerse": {
    "reference": "Atos 21:28",
    "text": "Texto Áureo completo aqui..."
  },
  "practicalTruth": "Verdade Prática da lição para a vida diária dos crentes.",
  "introduction": "Resumo introdutório da lição (2 frases claras).",
  "topics": [
    {
      "number": "I",
      "title": "Título do Primeiro Tópico",
      "subtopics": [
        {
          "letter": "A",
          "title": "Subtópico A",
          "content": [
            "Ponto explicativo 1.",
            "Ponto explicativo 2 com versículo."
          ]
        },
        {
          "letter": "B",
          "title": "Subtópico B",
          "content": [
            "Ponto explicativo 1.",
            "Ponto explicativo 2."
          ]
        }
      ]
    },
    {
      "number": "II",
      "title": "Título do Segundo Tópico",
      "subtopics": [
        {
          "letter": "A",
          "title": "Subtópico A",
          "content": ["Ideia central 1", "Ideia central 2"]
        }
      ]
    },
    {
      "number": "III",
      "title": "Título do Terceiro Tópico",
      "subtopics": [
        {
          "letter": "A",
          "title": "Subtópico A",
          "content": ["Ideia 1", "Ideia 2"]
        }
      ]
    }
  ],
  "conclusion": {
    "summary": "Resumo final teológico da lição.",
    "takeaway": "Aplicação Prática para a vida diária dos alunos.",
    "bulletPoints": [
      "Decisão prática 1",
      "Decisão prática 2"
    ]
  },
  "questions": [
    "1. Qual o aprendizado principal desta lição?",
    "2. Como aplicar este ensinamento durante a semana?",
    "3. Qual a relação do tema com o Texto Áureo?"
  ]
}

CONTEÚDO DA LIÇÃO DE EBD / TEXTO FORNECIDO:
"""
${rawContent.substring(0, 30000)}
"""
`;

  // Modelos suportados prioritários
  const modelsToTry = [
    selectedModel,
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash',
    'gemini-3.0-flash',
    'gemini-2.5-flash',
    'gemini-1.5-flash'
  ];

  let rawJson: string | null = null;
  let lastErr: any = null;

  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { responseMimeType: 'application/json' }
      });
      const result = await model.generateContent(prompt);
      if (result?.response?.text()) {
        rawJson = result.response.text();
        break;
      }
    } catch (e: any) {
      lastErr = e;
      console.warn(`Motor 1 (${modelName}) indisponível, tentando próximo...`);
    }
  }

  if (!rawJson) {
    throw lastErr || new Error('O Motor 1 (Professor) não conseguiu processar o texto da lição.');
  }

  const start = rawJson.indexOf('{');
  const end = rawJson.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return JSON.parse(rawJson.substring(start, end + 1));
  }

  throw new Error('Falha ao interpretar a estrutura didática gerada pelo Motor 1.');
}
