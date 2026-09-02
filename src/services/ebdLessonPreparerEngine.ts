/**
 * MOTOR DE PREPARAÇÃO INTELIGENTE DE AULAS EBD (MEGAEBD)
 * 
 * Princípio Fundamental:
 * REVISTA DA EBD + TRANSCRIÇÕES (NO MÍNIMO 2) → PREPARAÇÃO COMPLETA DA AULA
 */

import type { EBDLessonPreparation, TranscriptionSource, PreparationOptions } from '../types';
import { callGeminiRaw } from './geminiService';

function repairAndParseTruncatedJSON(rawInput: string): any {
  let cleaned = rawInput.trim();

  // Remove markdown code fences
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

  const firstBrace = cleaned.indexOf('{');
  if (firstBrace !== -1) {
    cleaned = cleaned.substring(firstBrace);
  }

  // 1. Tenta parse direto
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Prossegue para o mecanismo de reparo
  }

  // 2. Sanitização de quebras de linha dentro de aspas
  let sanitized = cleaned.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (match) => {
    return match
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
  });

  try {
    return JSON.parse(sanitized);
  } catch (e) {
    // Prossegue para a reconstrução de estrutura cortada
  }

  // 3. Algoritmo de Reparo de JSON Cortado
  let stack: string[] = [];
  let inString = false;
  let isEscaped = false;
  let repaired = '';

  for (let i = 0; i < sanitized.length; i++) {
    const char = sanitized[i];

    if (inString) {
      repaired += char;
      if (isEscaped) {
        isEscaped = false;
      } else if (char === '\\') {
        isEscaped = true;
      } else if (char === '"') {
        inString = false;
      }
    } else {
      if (char === '"') {
        inString = true;
        repaired += char;
      } else if (char === '{' || char === '[') {
        stack.push(char === '{' ? '}' : ']');
        repaired += char;
      } else if (char === '}' || char === ']') {
        if (stack.length > 0 && stack[stack.length - 1] === char) {
          stack.pop();
        }
        repaired += char;
      } else {
        repaired += char;
      }
    }
  }

  // Se o JSON foi cortado no meio de uma string, fecha aspas
  if (inString) {
    repaired += '"';
  }

  // Remove vírgulas sobressalentes no final de listas/objetos antes de fechar
  repaired = repaired.replace(/,\s*([\}\]])/g, '$1').replace(/,\s*$/g, '');

  // Fecha todas as chaves e colchetes pendentes
  while (stack.length > 0) {
    repaired += stack.pop();
  }

  try {
    return JSON.parse(repaired);
  } catch (finalErr: any) {
    console.error('[JSON Repair] Erro final no parse do JSON:', finalErr);
    throw new Error(`Não foi possível ler a resposta da IA: ${finalErr.message}`);
  }
}

export async function runLessonPreparerEngine(
  revistaContent: string,
  transcriptions: TranscriptionSource[],
  options: PreparationOptions
): Promise<EBDLessonPreparation> {
  if (!transcriptions || transcriptions.length < 2) {
    throw new Error('O sistema exige no mínimo 2 transcrições para realizar o cruzamento de fontes e a preparação completa da aula.');
  }

  // Prepara o texto das transcrições formatado
  const transcriptionsText = transcriptions
    .map((t, idx) => `=== TRANSCRIÇÃO ${idx + 1}: ${t.title || `Fonte ${idx + 1}`} ===\n${t.content}`)
    .join('\n\n');

  const prompt = `
Você é o Assistente Especialista de Preparação de Aulas da Escola Bíblica Dominical (MegaEBD).
Sua missão é realizar a PREPARAÇÃO COMPLETA E DIDÁTICA DA AULA cruzando o conteúdo da REVISTA OFICIAL com as TRANSCRIÇÕES enviadas.

--- HIERARQUIA DE FONTES & TRAVA TEOLÓGICA/EDITORIAL ---
NÍVEL 1 — REVISTA DA EBD: Determina Tema, Texto Áureo, Verdade Prática, Tópicos (I, II, III), Subtópicos (1, 2, 3) e sequência oficial.
NÍVEL 2 — TRANSCRIÇÃO 1: Extrai a linha explicativa principal.
NÍVEL 3 — TRANSCRIÇÃO 2: Cruzamento obrigatório para complementar, esclarecer e aprofundar a explicação.
NÍVEL 4 — EXPANSÃO CONTROLADA (TRAVA EDITORIAL ANTI-ALUCINAÇÃO):
  - A IA só pode adicionar contexto histórico/cultural, textos bíblicos de apoio e aplicações SE estritamente coerentes com o argumento central das transcrições.
  - REGRA ANTI-ALUCINAÇÃO: JAMAIS crie teorias, interpretações ou suposições históricas/jurídicas não sustentadas pela revista ou pelas transcrições. A IA não tem permissão para inventar fatos ou especulações livres.

--- ETAPA OBRIGATÓRIA: REVISÃO BÍBLICA E LINGUÍSTICA (HIGIENIZAÇÃO DE OCR/TRANSCRIÇÃO) ---
Antes de responder, você DEVE higienizar e revisar todo o conteúdo:
1. Corrija erros de ortografia de OCR/Transcrição (ex: "fujiram" -> "fugiram", "conciências" -> "consciências", "estos" -> "estes", palavras truncadas).
2. Valide as referências bíblicas no texto bíblico ARC oficial (Almeida Revista e Corrigida).
3. Garanta que a linguagem seja culta, clara e teologicamente precisa.

--- REGRAS DE CONSTRUÇÃO DO "MAPA DE ENSINO" ---
- REGRA DE DIVISÃO EM LETRAS a), b), c), d): DESMEMBRE CADA SUBTÓPICO EM IDEIAS SEQUENCIAIS DISTINTAS: a), b), c), d) (Gere obrigatoriamente entre 3 e 4 ideias separadas por subtópico).
- CADA IDEIA (a, b, c, d) DO MAPA DE ENSINO DEVE CONTER OBRIGATORIAMENTE OS 7 ELEMENTOS CHAVE:
  1. IDEIA CENTRAL ("projetor"): Frase curta e marcante para o aluno ler no projetor.
  2. EXPLICAÇÃO DO PROFESSOR ("explicacao"): O conteúdo desenvolvido estritamente a partir do cruzamento das duas transcrições.
  3. CONTEXTO HISTÓRICO/CULTURAL ("contexto"): Apenas quando realmente contribuir para entender o texto bíblico, sem invenções.
  4. BASE BÍBLICA ("versiculos"): Versículo principal + no mínimo 1 texto bíblico de apoio em português ARC.
  5. APLICAÇÃO PRÁTICA ("aplicacao"): Como isso se aplica à vida prática e espiritual do aluno hoje.
  6. ÊNFASE PARA O PROFESSOR ("enfase"): Frase forte para ele destacar verbalmente durante a aula.
  7. 🔥 O QUE NÃO PODE SER DITO / CUIDADO DOUTRINÁRIO ("cuidadoDoutrinario"): Alerta teológico/pastoral identificando explicitamente equívocos, generalizações ou afirmações falsas que o professor NÃO DEVE cometer na sala de aula.
- PROMPT VISUAL 16:9 ("imagePrompt"): Prompt cinematográfico detalhado do século I sem texto para geração visual no Canva/Midjourney/DALL-E.

- LEITURA BÍBLICA EM CLASSE NA ÍNTEGRA ("biblicalText"): Forneça OBRIGATORIAMENTE o texto bíblico COMPLETO NA ÍNTEGRA de TODOS os versículos lidos em classe na versão ARC. A primeira linha deve conter a referência COMPLETA (ex: "Atos 24.1-6, 10-16") seguida de travessão ("—") e em seguida CADA um dos versículos numerados sem omitir nenhum versículo e sem colocar reticências (ex: "Atos 24.1-6, 10-16 — 1 E, cinco dias depois, o sumo sacerdote Ananias desceu com os anciãos... 2 E, sendo chamado...").

--- CONTEÚDO DA REVISTA ---
${revistaContent}

--- TRANSCRIÇÕES DE APOIO (${transcriptions.length} FONTES) ---
${transcriptionsText}

--- FORMATO DE RESPOSTA OBRIGATÓRIO (JSON APENAS) ---
Responda EXCLUSIVAMENTE em formato JSON com esta estrutura exata:

{
  "metadata": {
    "lessonNumber": "Lição EBD",
    "title": "Título da Lição",
    "subtitle": "Subtítulo da Lição",
    "themeTopic": "Tema Geral da Lição",
    "date": "Trimestre Atual",
    "targetAudience": "Adultos / EBD",
    "depth": "${options.depth}"
  },
  "textAureo": {
    "text": "Texto do Texto Áureo",
    "reference": "Atos 22.15"
  },
  "verdadePratica": {
    "text": "Texto da Verdade Prática"
  },
  "leituraDiaria": [
    { "day": "Segunda", "reference": "Atos 21.27", "text": "Resumo" }
  ],
  "biblicalText": "Atos 24.1-6 — 1 E, cinco dias depois, o sumo sacerdote Ananias desceu com os anciãos e com um certo orador, Tértulo, os quais compareceram perante o presidente contra Paulo. 2 E, sendo chamado, Tértulo começou a acusá-lo, dizendo: Visto que por ti gozamos de grande paz... 3 Tudo isto aceitamos sempre e em todo o lugar, ó excelentíssimo Félix... 4 Mas, para que não te detenha muito, rogo-te que... 5 Temos achado que este homem é uma peste... 6 O qual intentou também profanar o templo...",
  "introducao": {
    "text": "Explicação detalhada da introdução para o professor.",
    "projetor": "Frase de introdução para o projetor dos alunos."
  },
  "topicos": [
    {
      "number": "I",
      "title": "NOME DO TÓPICO I",
      "explicacao": "Explicação geral do Tópico I baseada nas transcrições.",
      "sinopse": "Resumo rápido para o professor revisar antes da aula.",
      "frasesEnfase": [
        "Frase de impacto 1 para aula",
        "Frase de impacto 2 para aula"
      ],
      "imagePrompt": "Prompt visual 16:9 detalhado para geração de cena bíblica/histórica sem texto.",
      "subtopicos": [
        {
          "number": "1",
          "title": "Nome do Subtópico 1",
          "projetor": "Frase síntese do subtópico para o projetor.",
          "imagePrompt": "Prompt visual 16:9 contextual para o subtópico.",
          "ideias": [
            {
              "letra": "a",
              "titulo": "Primeira Ideia do Mapa de Ensino",
              "projetor": "Ideia Central para o Projetor (Frase curta que o aluno consegue ler facilmente).",
              "professor": {
                "explicacao": "Explicação do Professor desenvolvida estritamente a partir do cruzamento das transcrições.",
                "contexto": "Contexto histórico e cultural verídico do primeiro século que ilumina a passagem.",
                "versiculos": [
                  { "reference": "Atos 24.5", "text": "Temos achado que este homem é uma peste e promotor de sedições..." },
                  { "reference": "Atos 17.6", "text": "Estes que têm alvoroçado o mundo chegaram também aqui..." }
                ],
                "aplicacao": "Aplicação prática e pentecostal viva para a vida cristã.",
                "enfase": "Ênfaise para o Professor: Frase forte para destacar na aula.",
                "cuidadoDoutrinario": "🔥 Cuidado Doutrinário: Não afirmar que toda oposição é perseguição por causa da fé; discernir acusações pejorativas de falhas pessoais."
              },
              "imagePrompt": "Prompt visual 16:9 para a ideia a (cena cinematográfica do primeiro século, sem texto)."
            },
            {
              "letra": "b",
              "titulo": "Segunda Ideia do Mapa de Ensino",
              "projetor": "Ideia Central b para o Projetor.",
              "professor": {
                "explicacao": "Explicação do Professor para a segunda ideia...",
                "contexto": "Contexto histórico/cultural...",
                "versiculos": [
                  { "reference": "Atos 24.10", "text": "Versículo ARC 1" },
                  { "reference": "Lucas 23.2", "text": "Versículo ARC 2 de apoio" }
                ],
                "aplicacao": "Aplicação prática...",
                "enfase": "Ênfase para a sala...",
                "cuidadoDoutrinario": "🔥 Cuidado Doutrinário: Evitar generalizações doutrinárias sem respaldo no texto bíblico."
              },
              "imagePrompt": "Prompt visual 16:9 para a ideia b."
            },
            {
              "letra": "c",
              "titulo": "Terceira Ideia do Mapa de Ensino",
              "projetor": "Ideia Central c para o Projetor.",
              "professor": {
                "explicacao": "Explicação do Professor...",
                "contexto": "Contexto...",
                "versiculos": [
                  { "reference": "Atos 24.14", "text": "Versículo ARC 1" },
                  { "reference": "2 Timóteo 3.12", "text": "Versículo ARC 2" }
                ],
                "aplicacao": "Aplicação...",
                "enfase": "Ênfase...",
                "cuidadoDoutrinario": "🔥 Cuidado Doutrinário: O que o professor não deve afirmar nesta lição."
              },
              "imagePrompt": "Prompt..."
            },
            {
              "letra": "d",
              "titulo": "Quarta Ideia do Mapa de Ensino",
              "projetor": "Ideia Central d para o Projetor.",
              "professor": {
                "explicacao": "Explicação do Professor...",
                "contexto": "Contexto...",
                "versiculos": [
                  { "reference": "Atos 24.16", "text": "Versículo ARC 1" },
                  { "reference": "1 Pedro 3.16", "text": "Versículo ARC 2" }
                ],
                "aplicacao": "Aplicação...",
                "enfase": "Ênfase...",
                "cuidadoDoutrinario": "🔥 Cuidado Doutrinário: Cuidado para não distorcer a aplicação pastoral."
              },
              "imagePrompt": "Prompt..."
            }
          ]
        }
      ]
    }
  ],
  "conclusao": {
    "takeaway": "Verdade central da conclusão",
    "bulletPoints": [
      "Ponto de fixação 1",
      "Ponto de fixação 2"
    ],
    "finalPrayer": "Sugestão de oração de encerramento com a classe.",
    "projetor": "Frase conclusiva marcante para os alunos no projetor."
  },
  "sourcesSummary": {
    "revistaDetected": true,
    "transcriptionsCount": ${transcriptions.length},
    "sourcesUsed": [${transcriptions.map(t => `"${t.title.replace(/"/g, '')}"`).join(', ')}]
  },
  "checklist": [
    { "item": "Estrutura da revista preservada (Nível 1)", "status": true },
    { "item": "Transcrições cruzadas e âncora teológica (Níveis 2 e 3)", "status": true },
    { "item": "Mapa de Ensino com Nível 4 controlado (Anti-alucinação)", "status": true },
    { "item": "Higienização linguística e bíblica (Sem erros de OCR)", "status": true },
    { "item": "O Que Não Pode Ser Dito / Cuidado Doutrinário incluído", "status": true },
    { "item": "Prompts Visuais 16:9 sem texto gerados", "status": true }
  ]
}
`;

  try {
    // Solicita com responseMimeType: "application/json" ativado
    const rawResult = await callGeminiRaw(prompt, options.selectedAiModel || 'gemini-2.5-flash', true);
    const parsedData: EBDLessonPreparation = repairAndParseTruncatedJSON(rawResult);
    return parsedData;
  } catch (err: any) {
    console.error('Erro ao processar lição no Motor Preparador:', err);
    throw new Error(`Falha no processamento do Motor Inteligente: ${err.message || 'Erro de formato na resposta da IA.'}`);
  }
}
