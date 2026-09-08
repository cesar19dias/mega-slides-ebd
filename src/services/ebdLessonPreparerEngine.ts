/**
 * MOTOR DE PREPARAÇÃO INTELIGENTE DE AULAS EBD (MEGAEBD)
 * 
 * Princípio Fundamental:
 * REVISTA DA EBD + TRANSCRIÇÕES (NO MÍNIMO 2) → PREPARAÇÃO COMPLETA DA AULA
 */

import type { EBDLessonPreparation, TranscriptionSource, PreparationOptions } from '../types';
import { callGeminiRaw } from './geminiService';
import { jsonrepair } from 'jsonrepair';

function normalizeLessonData(raw: any): EBDLessonPreparation {
  return {
    metadata: {
      lessonNumber: raw.metadata?.lessonNumber || 'Lição EBD',
      title: raw.metadata?.title || 'Preparação da Lição',
      subtitle: raw.metadata?.subtitle || '',
      themeTopic: raw.metadata?.themeTopic || 'Estudo Dominical',
      date: raw.metadata?.date || '',
      targetAudience: raw.metadata?.targetAudience || 'Adultos / EBD',
      depth: raw.metadata?.depth || 'detalhada',
    },
    textAureo: {
      text: raw.textAureo?.text || '',
      reference: raw.textAureo?.reference || '',
    },
    verdadePratica: {
      text: raw.verdadePratica?.text || '',
    },
    leituraDiaria: Array.isArray(raw.leituraDiaria) ? raw.leituraDiaria : [],
    biblicalText: raw.biblicalText || '',
    introducao: {
      text: raw.introducao?.text || '',
      projetor: raw.introducao?.projetor || '',
    },
    topicos: Array.isArray(raw.topicos)
      ? raw.topicos.map((topico: any, tIdx: number) => ({
          number: topico.number || `TÓPICO ${tIdx + 1}`,
          title: topico.title || `Tópico ${tIdx + 1}`,
          explicacao: topico.explicacao || '',
          sinopse: topico.sinopse || topico.explicacao || '',
          frasesEnfase: Array.isArray(topico.frasesEnfase) ? topico.frasesEnfase : [],
          imagePrompt: topico.imagePrompt || '',
          subtopicos: Array.isArray(topico.subtopicos)
            ? topico.subtopicos.map((sub: any, sIdx: number) => ({
                number: sub.number || `${sIdx + 1}`,
                title: sub.title || `Subtópico ${sIdx + 1}`,
                projetor: sub.projetor || '',
                imagePrompt: sub.imagePrompt || '',
                ideias: Array.isArray(sub.ideias)
                  ? sub.ideias.map((ideia: any, iIdx: number) => ({
                      letra: ideia.letra || String.fromCharCode(97 + iIdx),
                      titulo: ideia.titulo || `Ideia ${String.fromCharCode(97 + iIdx)}`,
                      projetor: ideia.projetor || '',
                      professor: {
                        explicacao: ideia.professor?.explicacao || '',
                        contexto: ideia.professor?.contexto || '',
                        versiculos: Array.isArray(ideia.professor?.versiculos)
                          ? ideia.professor.versiculos
                          : [],
                        aplicacao: ideia.professor?.aplicacao || '',
                        enfase: ideia.professor?.enfase || '',
                        cuidadoDoutrinario: ideia.professor?.cuidadoDoutrinario || '',
                        palavrasOriginais: Array.isArray(ideia.professor?.palavrasOriginais)
                          ? ideia.professor.palavrasOriginais.map((p: any) => ({
                              termo: p.termo || '',
                              transliteracao: p.transliteracao || '',
                              idioma: p.idioma === 'Hebraico' ? 'Hebraico' : 'Grego',
                              significado: p.significado || '',
                              explicacao: p.explicacao || '',
                            }))
                          : [],
                      },
                      imagePrompt: ideia.imagePrompt || '',
                    }))
                  : [],
              }))
            : [],
        }))
      : [],
    conclusao: {
      takeaway: raw.conclusao?.takeaway || '',
      bulletPoints: Array.isArray(raw.conclusao?.bulletPoints) ? raw.conclusao.bulletPoints : [],
      finalPrayer: raw.conclusao?.finalPrayer || '',
      projetor: raw.conclusao?.projetor || '',
    },
    sourcesSummary: {
      revistaDetected: raw.sourcesSummary?.revistaDetected ?? true,
      transcriptionsCount: raw.sourcesSummary?.transcriptionsCount || 2,
      sourcesUsed: Array.isArray(raw.sourcesSummary?.sourcesUsed) ? raw.sourcesSummary.sourcesUsed : [],
    },
    checklist: Array.isArray(raw.checklist) ? raw.checklist : [],
  };
}

function repairAndParseTruncatedJSON(rawInput: string): EBDLessonPreparation {
  let cleaned = rawInput.trim();

  // Remove markdown code fences
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

  const firstBrace = cleaned.indexOf('{');
  if (firstBrace !== -1) {
    cleaned = cleaned.substring(firstBrace);
  }

  // 1. Tenta parse direto se o JSON já veio limpo
  try {
    const parsed = JSON.parse(cleaned);
    return normalizeLessonData(parsed);
  } catch {
    // Prossegue para reparo com jsonrepair
  }

  // 2. Tenta o jsonrepair profissional diretamente
  try {
    const repaired = jsonrepair(cleaned);
    const parsed = JSON.parse(repaired);
    return normalizeLessonData(parsed);
  } catch (err1) {
    console.warn('[JSON Repair] Falha no jsonrepair inicial, tentando sanitização prévia...', err1);
  }

  // 3. Sanitização de quebras de linha e caracteres de controle dentro de aspas
  let sanitized = cleaned.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (match) => {
    return match
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
  });

  try {
    const repaired = jsonrepair(sanitized);
    const parsed = JSON.parse(repaired);
    return normalizeLessonData(parsed);
  } catch (err2) {
    console.warn('[JSON Repair] Falha na segunda tentativa de jsonrepair:', err2);
  }

  // 4. Fallback de truncamento progressivo:
  // Se o JSON foi cortado no meio de uma propriedade ou objeto incompleto,
  // recua até o último fechamento de objeto/array e repara
  for (let cutPos = cleaned.length - 1; cutPos > 500; cutPos--) {
    const char = cleaned[cutPos];
    if (char === '}' || char === ']') {
      const candidate = cleaned.substring(0, cutPos + 1);
      try {
        const repaired = jsonrepair(candidate);
        const parsed = JSON.parse(repaired);
        console.log('[JSON Repair] Recuperado com sucesso via truncamento seguro na posição', cutPos);
        return normalizeLessonData(parsed);
      } catch {
        // Continua buscando o ponto anterior de fechamento válido
      }
    }
  }

  throw new Error(`Não foi possível ler a resposta da IA. O conteúdo gerado ultrapassou o limite ou foi corrompido.`);
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
- REGRA MANDATÓRIA INEGOCIÁVEL DOS 3 TÓPICOS OFICIAIS (I, II E III):
  A Lição da EBD é composta OBRIGATORIAMENTE por 3 TÓPICOS:
  1. TÓPICO I
  2. TÓPICO II
  3. TÓPICO III
  É EXPRESSAMENTE PROIBIDO parar no Tópico I ou omitir o Tópico II e o Tópico III!
  A array "topicos" no JSON DEVE CONTER OBRIGATORIAMENTE 3 OBJETOS: um para o Tópico I, um para o Tópico II e um para o Tópico III.

- REGRA MANDATÓRIA DOS SUBTÓPICOS (1, 2 E 3) — NUNCA GERE APENAS O PRIMEIRO:
  Cada Tópico da revista possui seus SUBTÓPICOS OFICIAIS (geralmente Subtópico 1, Subtópico 2 e Subtópico 3, ou conforme a divisão da lição).
  É EXPRESSAMENTE PROIBIDO gerar apenas o primeiro subtópico de cada tópico!
  A array "subtopicos" de CADA Tópico DEVE CONTER TODOS OS SUBTÓPICOS DA REVISTA (1, 2, 3...):
  - Subtópico 1: Título da revista + Ideias a) e b)
  - Subtópico 2: Título da revista + Ideias a) e b)
  - Subtópico 3: Título da revista + Ideias a) e b) (se houver na revista)

- CONCISÃO INTELIGENTE PARA GARANTIR TODOS OS TÓPICOS E SUBTÓPICOS:
  Para que a aula completa (todos os tópicos e subtópicos) caiba com perfeição na resposta da IA:
  * "explicacao": 1 parágrafo denso e direto de 3 a 5 frases ricas, sem repetições.
  * "contexto": 2 a 3 frases de contexto histórico/cultural verídico do século I.
  * "versiculos": 2 versículos de apoio com texto direto ARC que conversem com a aplicação prática.
  * "aplicacao": 2 a 3 frases práticas e pentecostais para a vida diária.
  * "enfase": 1 frase de alto impacto ("Aprenda com a Palavra...").
  * "cuidadoDoutrinario": 1 frase de alerta teológico.
  * "imagePrompt": 1 descrição cinematográfica nobre de 2 a 3 frases.

- REGRA DE DIVISÃO EM LETRAS a), b): DESMEMBRE CADA SUBTÓPICO EM APENAS 2 IDEIAS PRINCIPAIS: a) e b) (Gere obrigatoriamente EXATAMENTE 2 ideias principais por subtópico, focando no essencial com profundidade didática sem fragmentar demais).
- CADA IDEIA (a, b) DO MAPA DE ENSINO DEVE CONTER OBRIGATORIAMENTE OS 8 ELEMENTOS CHAVE:
  1. IDEIA CENTRAL ("projetor"): Frase curta e marcante para o aluno ler no projetor.
  2. EXPLICAÇÃO DO PROFESSOR ("explicacao"): O conteúdo desenvolvido estritamente a partir do cruzamento das duas transcrições.
  3. CONTEXTO HISTÓRICO/CULTURAL ("contexto"): Contexto histórico, cultural e arqueológico verídico do primeiro século que ilumina a passagem bíblica.
  4. BASE BÍBLICA ("versiculos"): 
     * REGRA OBRIGATÓRIA DE DIÁLOGO PRÁTICO: Os versículos bíblicos DEVEM CONVERSAR DIRETAMENTE com a APLICAÇÃO PRÁTICA ("aplicacao") da ideia, dando fundamento escriturístico para a conduta do crente.
     * VERSÍCULOS DIFERENTES DA LEITURA EM CLASSE: Selecione PREFERENCIALMENTE versículos de apoio DIFERENTES daqueles lidos na "Leitura Bíblica em Classe" (buscando passagens correlatas em Epístolas, Evangelhos, Tiago, Provérbios, etc., para enriquecer o repertório da turma e mostrar a coerência de toda a Bíblia). Forneça referência e texto completo na versão ARC oficial.
  5. APLICAÇÃO PRÁTICA ("aplicacao"): Como essa verdade bíblica e os versículos de apoio se aplicam de forma concreta, viva e pentecostal à vida espiritual, familiar e diária do aluno.
  6. APRENDA COM A PALAVRA... ("enfase"): Frase forte de destaque pedagógico e espiritual para a classe guardar ("Aprenda com a Palavra...").
  7. 🔥 O QUE NÃO PODE SER DITO / CUIDADO DOUTRINÁRIO ("cuidadoDoutrinario"): Alerta teológico/pastoral identificando explicitamente equívocos, generalizações ou afirmações falsas que o professor NÃO DEVE cometer na sala de aula.
  8. 🏛️ VOCABULÁRIO EXEGÉTICO NO GREGO / HEBRAICO ("palavrasOriginais"): Sugira a explicação exegética no Grego (Novo Testamento) ou Hebraico (Antigo Testamento) de palavras diferentes, marcantes ou de grande peso teológico que apareçam no texto da lição. Forneça:
     * "termo": Grafia original no alfabeto grego ou hebraico (ex: "λοιμός" ou "שָׁלוֹם").
     * "transliteracao": Pronúncia em português (ex: "Loimós" ou "Shalom").
     * "idioma": "Grego" ou "Hebraico".
     * "significado": Significado literal e etimológico.
     * "explicacao": 1 a 2 frases exegéticas explicando como essa nuance do original aprofunda o texto bíblico para o professor ministrar.

- DIRETRIZ RIGOROSA PARA PROMPTS VISUAIS 16:9 ("imagePrompt"):
  JAMAIS gere prompts genéricos ou curtos (são expressamente proibidos prompts do tipo "Cena bíblica", "Homem pregando", "Pessoas conversando").
  Cada prompt DEVE ser uma descrição cinematográfica profissional, hiperdetalhada e imersiva para geração no Midjourney / Canva / DALL-E 3 / Leonardo.ai, estruturada obrigatoriamente com:
  a) Sujeito e Ação Específica: Personagens históricos (ex: Apóstolo Paulo perante o governador Félix no Pretório Romano), expressões faciais carregadas de solenidade e firmeza, gestos autênticos da cena.
  b) Rigor Histórico e Arqueológico: Vestimentas autênticas do século I (túnicas de linho cru com texturas rústicas, mantos de lã tecida, soldados romanos com armadura lorica segmentata de ferro polido, capacete com crista e escudo scutum, arquitetura com pedras herodianas desgastadas e colunatas romanas).
  c) Iluminação Cinematográfica Chiaroscuro: Iluminação dramática estilo Caravaggio / Rembrandt, raios solares dourados cortando o ambiente (golden hour sunlight), partículas de poeira suspensas nos feixes de luz, sombras profundas e texturas ricas.
  d) Especificações de Câmera: "Cinematic wide-angle film still, shot on 35mm Panavision lens, shallow depth of field f/1.8, 8k resolution, photorealistic, intricate historical textures, award-winning cinematography".
  e) Limpeza Visual: "No modern objects, no text, no typography, no watermarks, aspect ratio 16:9, --ar 16:9 --style raw --v 6.0".

- LEITURA BÍBLICA EM CLASSE NA ÍNTEGRA ("biblicalText"): Forneça OBRIGATORIAMENTE o texto bíblico COMPLETO NA ÍNTEGRA de TODOS os versículos lidos em classe na versão ARC. A primeira linha deve conter a referência COMPLETA (ex: "Atos 24.1-6, 10-16") seguida de travessão ("—") e em seguida CADA um dos versículos numerados sem omitir nenhum versículo e sem colocar reticências (ex: "Atos 24.1-6, 10-16 — 1 E, cinco dias depois, o sumo sacerdote Ananias desceu com os anciãos... 2 E, sendo chamado...").

--- CONTEÚDO DA REVISTA ---
${revistaContent}

--- TRANSCRIÇÕES DE APOIO (${transcriptions.length} FONTES) ---
${transcriptionsText}

--- REGRA MANDATÓRIA DE INTEGRIDADE DO JSON ---
1. Responda EXCLUSIVAMENTE com o objeto JSON estruturado.
2. IMPORTANTE PARA STRINGS: NUNCA coloque aspas duplas soltas dentro de explicações, versículos ou citações. Se precisar citar algo dentro de um texto, USE ASPAS SIMPLES (') ou escape obrigatoriamente com \" (ex: 'palavra' ou \"palavra\"). Isso garante que a sintaxe do JSON seja sempre 100% válida.
3. Não use quebras de linha cruas dentro dos valores de texto.

--- FORMATO DE RESPOSTA OBRIGATÓRIO (JSON APENAS COM TODOS OS TÓPICOS E SUBTÓPICOS) ---
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
      "title": "NOME DO TÓPICO I (CONFORME A REVISTA)",
      "explicacao": "Explicação geral do Tópico I baseada nas transcrições.",
      "sinopse": "Resumo rápido para o professor revisar antes da aula.",
      "frasesEnfase": [
        "Frase de impacto 1 para aula",
        "Frase de impacto 2 para aula"
      ],
      "imagePrompt": "A highly detailed cinematic 16:9 film still of an ancient 1st-century Roman tribunal in Caesarea Maritima, massive carved limestone Corinthian columns, Roman flags, warm golden hour sunlight slicing through dust-filled air, authentic historical costumes with textured fabrics, dramatic Rembrandt chiaroscuro lighting, photorealistic, 8k, shot on 35mm lens, no modern items, no text, no typography --ar 16:9 --style raw --v 6.0",
      "subtopicos": [
        {
          "number": "1",
          "title": "Título do Subtópico 1 da Revista",
          "projetor": "Frase síntese do subtópico 1 para o projetor.",
          "imagePrompt": "Cinematic historical wide shot of a 1st-century Mediterranean Roman courtroom, Roman magistrate seated on a raised stone curule chair with ornate iron armrests, solemn atmosphere, dust particles dancing in directional sunlight, authentic linen and wool tunics, hyper-realistic, 8k resolution, cinematic lighting, no text, no watermarks --ar 16:9 --style raw",
          "ideias": [
            {
              "letra": "a",
              "titulo": "Primeira Ideia Principal do Subtópico 1",
              "projetor": "Ideia Central para o Projetor (Frase curta que o aluno consegue ler facilmente).",
              "professor": {
                "explicacao": "Explicação do Professor desenvolvida estritamente a partir do cruzamento das transcrições.",
                "contexto": "Contexto histórico e cultural verídico do primeiro século que ilumina a passagem, detalhando o ambiente jurídico, os costumes e o pano de fundo histórico.",
                "versiculos": [
                  { "reference": "1 Pedro 4.14", "text": "Se pelo nome de Cristo sois vituperados, bem-aventurados sois, porque sobre vós repousa o Espírito da glória de Deus." },
                  { "reference": "Mateus 5.11", "text": "Bem-aventurados sois vós quando vos injuriarem, e perseguirem, e, mentindo, disserem todo o mal contra vós, por minha causa." }
                ],
                "aplicacao": "Aplicação prática e pentecostal viva: o crente diante de calúnias ou oposições no trabalho e na sociedade deve manter serenidade, oração e testemunho irrepreensível, sabendo que a aprovação de Deus supera qualquer acusação humana.",
                "enfase": "A resposta do servo de Deus diante da calúnia não é o revide carnal, mas uma consciência pura e a firmeza da fé.",
                "cuidadoDoutrinario": "🔥 Cuidado Doutrinário: Não afirmar que toda oposição é perseguição por causa da fé; discernir acusações pejorativas de falhas pessoais.",
                "palavrasOriginais": [
                  {
                    "termo": "λοιμός",
                    "transliteracao": "Loimós",
                    "idioma": "Grego",
                    "significado": "Peste, praga; indivíduo ou movimento causador de contágio ou dano público.",
                    "explicacao": "Tértulo empregou o termo grego 'loimós' para estigmatizar Paulo perante o tribunal romano, retratando o cristianismo como uma praga social contagiosa e sediciosa contra Roma."
                  }
                ]
              },
              "imagePrompt": "Cinematic 16:9 portrait of Apostle Paul in 1st-century Caesarea, standing with dignity and peaceful determination before Roman officials, wearing a textured coarse woven linen mantle, hands bound with authentic iron chain links, atmospheric golden sunbeam illuminating his serene face, chiaroscuro lighting, depth of field, photorealistic, 8k, shot on 35mm lens, no modern elements, no text, no watermarks --ar 16:9 --style raw --v 6.0"
            },
            {
              "letra": "b",
              "titulo": "Segunda Ideia Principal do Subtópico 1",
              "projetor": "Ideia Central b para o Projetor.",
              "professor": {
                "explicacao": "Explicação do Professor para a segunda ideia principal...",
                "contexto": "Contexto histórico e arqueológico sobre o funcionamento dos tribunais romanos provinciais e o direito de defesa...",
                "versiculos": [
                  { "reference": "Romanos 12.18", "text": "Se for possível, quanto estiver em vós, tende paz com todos os homens." },
                  { "reference": "Provérbios 15.1", "text": "A resposta branda desvia o furor, mas a palavra dura suscita a ira." }
                ],
                "aplicacao": "Aplicação prática cotidiana: em momentos de conflito e injustiça, o crente deve exercer a prudência cristã e a moderação, defendendo a verdade com mansidão e respeito.",
                "enfase": "A sabedoria bíblica nos ensina que a verdade de Cristo resplandece com mais força quando defendida com mansidão e integridade.",
                "cuidadoDoutrinario": "🔥 Cuidado Doutrinário: Evitar generalizações doutrinárias sem respaldo no texto bíblico."
              },
              "imagePrompt": "Cinematic wide-angle composition of a 1st-century assembly in an ancient Roman praetorium, Roman guards in authentic lorica segmentata holding spears, warm sunlight streaming through high stone arches, rich shadows, hyper-realistic, photorealistic 8k, dramatic historical cinematography, no text, no typography --ar 16:9 --style raw"
            }
          ]
        },
        {
          "number": "2",
          "title": "Título do Subtópico 2 da Revista",
          "projetor": "Frase síntese do subtópico 2 para o projetor.",
          "imagePrompt": "Cinematic historical 16:9 scene...",
          "ideias": [
            {
              "letra": "a",
              "titulo": "Primeira Ideia do Subtópico 2",
              "projetor": "Ideia Central para o Projetor.",
              "professor": {
                "explicacao": "Explicação do conteúdo do subtópico 2...",
                "contexto": "Contexto histórico e cultural...",
                "versiculos": [
                  { "reference": "Texto Bíblico 1 (ARC)", "text": "Versículo ARC..." },
                  { "reference": "Texto Bíblico 2 (ARC)", "text": "Versículo ARC..." }
                ],
                "aplicacao": "Aplicação prática para a vida diária dos crentes...",
                "enfase": "Aprenda com a Palavra: ensinamento de destaque...",
                "cuidadoDoutrinario": "🔥 Cuidado Doutrinário para a sala de aula..."
              },
              "imagePrompt": "Cinematic 16:9 visual prompt..."
            },
            {
              "letra": "b",
              "titulo": "Segunda Ideia do Subtópico 2",
              "projetor": "Ideia Central b para o Projetor.",
              "professor": {
                "explicacao": "Explicação do conteúdo da ideia b...",
                "contexto": "Contexto histórico...",
                "versiculos": [
                  { "reference": "Texto Bíblico 1 (ARC)", "text": "Versículo ARC..." },
                  { "reference": "Texto Bíblico 2 (ARC)", "text": "Versículo ARC..." }
                ],
                "aplicacao": "Aplicação prática...",
                "enfase": "Aprenda com a Palavra...",
                "cuidadoDoutrinario": "🔥 Cuidado Doutrinário..."
              },
              "imagePrompt": "Cinematic 16:9 visual prompt..."
            }
          ]
        },
        {
          "number": "3",
          "title": "Título do Subtópico 3 da Revista",
          "projetor": "Frase síntese do subtópico 3 para o projetor.",
          "imagePrompt": "Cinematic historical 16:9 scene...",
          "ideias": [
            {
              "letra": "a",
              "titulo": "Primeira Ideia do Subtópico 3",
              "projetor": "Ideia Central para o Projetor.",
              "professor": {
                "explicacao": "Explicação do conteúdo do subtópico 3...",
                "contexto": "Contexto histórico e cultural...",
                "versiculos": [
                  { "reference": "Texto Bíblico 1 (ARC)", "text": "Versículo ARC..." },
                  { "reference": "Texto Bíblico 2 (ARC)", "text": "Versículo ARC..." }
                ],
                "aplicacao": "Aplicação prática para a vida cristã...",
                "enfase": "Aprenda com a Palavra: ensinamento de destaque...",
                "cuidadoDoutrinario": "🔥 Cuidado Doutrinário para a sala de aula..."
              },
              "imagePrompt": "Cinematic 16:9 visual prompt..."
            },
            {
              "letra": "b",
              "titulo": "Segunda Ideia do Subtópico 3",
              "projetor": "Ideia Central b para o Projetor.",
              "professor": {
                "explicacao": "Explicação do conteúdo da ideia b...",
                "contexto": "Contexto histórico...",
                "versiculos": [
                  { "reference": "Texto Bíblico 1 (ARC)", "text": "Versículo ARC..." },
                  { "reference": "Texto Bíblico 2 (ARC)", "text": "Versículo ARC..." }
                ],
                "aplicacao": "Aplicação prática...",
                "enfase": "Aprenda com a Palavra...",
                "cuidadoDoutrinario": "🔥 Cuidado Doutrinário..."
              },
              "imagePrompt": "Cinematic 16:9 visual prompt..."
            }
          ]
        }
      ]
    },
    {
      "number": "II",
      "title": "NOME DO TÓPICO II (CONFORME A REVISTA)",
      "explicacao": "Explicação didática do Tópico II baseada nas transcrições.",
      "sinopse": "Resumo do Tópico II para o professor revisar antes da aula.",
      "frasesEnfase": [
        "Frase de impacto do Tópico II"
      ],
      "imagePrompt": "Cinematic wide-angle 16:9 film still of 1st-century setting related to Topic II, authentic textures, dramatic lighting, 8k, no text --ar 16:9 --style raw",
      "subtopicos": [
        {
          "number": "1",
          "title": "Título do Subtópico 1 do Tópico II",
          "projetor": "Frase síntese do subtópico 1 para o projetor.",
          "imagePrompt": "Cinematic historical 16:9 scene...",
          "ideias": [
            {
              "letra": "a",
              "titulo": "Primeira Ideia do Subtópico 1",
              "projetor": "Ideia Central para o Projetor.",
              "professor": {
                "explicacao": "Explicação do conteúdo da ideia...",
                "contexto": "Contexto histórico e cultural...",
                "versiculos": [
                  { "reference": "Referência 1 (ARC)", "text": "Texto bíblico..." },
                  { "reference": "Referência 2 (ARC)", "text": "Texto bíblico..." }
                ],
                "aplicacao": "Aplicação prática para a vida diária dos crentes...",
                "enfase": "Aprenda com a Palavra: ensinamento de destaque...",
                "cuidadoDoutrinario": "🔥 Cuidado Doutrinário para a sala de aula..."
              },
              "imagePrompt": "Cinematic 16:9 visual prompt..."
            },
            {
              "letra": "b",
              "titulo": "Segunda Ideia do Subtópico 1",
              "projetor": "Ideia Central b para o Projetor.",
              "professor": {
                "explicacao": "Explicação do conteúdo da ideia b...",
                "contexto": "Contexto histórico...",
                "versiculos": [
                  { "reference": "Referência 1 (ARC)", "text": "Texto bíblico..." },
                  { "reference": "Referência 2 (ARC)", "text": "Texto bíblico..." }
                ],
                "aplicacao": "Aplicação prática...",
                "enfase": "Aprenda com a Palavra...",
                "cuidadoDoutrinario": "🔥 Cuidado Doutrinário..."
              },
              "imagePrompt": "Cinematic 16:9 visual prompt..."
            }
          ]
        },
        {
          "number": "2",
          "title": "Título do Subtópico 2 do Tópico II",
          "projetor": "Frase síntese do subtópico 2 para o projetor.",
          "imagePrompt": "Cinematic historical 16:9 scene...",
          "ideias": [
            {
              "letra": "a",
              "titulo": "Primeira Ideia do Subtópico 2",
              "projetor": "Ideia Central para o Projetor.",
              "professor": {
                "explicacao": "Explicação do subtópico 2...",
                "contexto": "Contexto histórico...",
                "versiculos": [
                  { "reference": "Referência 1", "text": "Versículo ARC..." },
                  { "reference": "Referência 2", "text": "Versículo ARC..." }
                ],
                "aplicacao": "Aplicação prática...",
                "enfase": "Aprenda com a Palavra...",
                "cuidadoDoutrinario": "Cuidado doutrinário..."
              },
              "imagePrompt": "Cinematic 16:9 prompt..."
            },
            {
              "letra": "b",
              "titulo": "Segunda Ideia do Subtópico 2",
              "projetor": "Ideia Central b.",
              "professor": {
                "explicacao": "Explicação...",
                "contexto": "Contexto...",
                "versiculos": [
                  { "reference": "Referência 1", "text": "Texto..." },
                  { "reference": "Referência 2", "text": "Texto..." }
                ],
                "aplicacao": "Aplicação...",
                "enfase": "Aprenda com a Palavra...",
                "cuidadoDoutrinario": "Alerta..."
              },
              "imagePrompt": "Cinematic 16:9 prompt..."
            }
          ]
        },
        {
          "number": "3",
          "title": "Título do Subtópico 3 do Tópico II",
          "projetor": "Frase síntese do subtópico 3 para o projetor.",
          "imagePrompt": "Cinematic historical 16:9 scene...",
          "ideias": [
            {
              "letra": "a",
              "titulo": "Primeira Ideia do Subtópico 3",
              "projetor": "Ideia Central para o Projetor.",
              "professor": {
                "explicacao": "Explicação do subtópico 3...",
                "contexto": "Contexto histórico...",
                "versiculos": [
                  { "reference": "Referência 1", "text": "Versículo ARC..." },
                  { "reference": "Referência 2", "text": "Versículo ARC..." }
                ],
                "aplicacao": "Aplicação prática...",
                "enfase": "Aprenda com a Palavra...",
                "cuidadoDoutrinario": "Cuidado doutrinário..."
              },
              "imagePrompt": "Cinematic 16:9 prompt..."
            },
            {
              "letra": "b",
              "titulo": "Segunda Ideia do Subtópico 3",
              "projetor": "Ideia Central b.",
              "professor": {
                "explicacao": "Explicação...",
                "contexto": "Contexto...",
                "versiculos": [
                  { "reference": "Referência 1", "text": "Texto..." },
                  { "reference": "Referência 2", "text": "Texto..." }
                ],
                "aplicacao": "Aplicação...",
                "enfase": "Aprenda com a Palavra...",
                "cuidadoDoutrinario": "Alerta..."
              },
              "imagePrompt": "Cinematic 16:9 prompt..."
            }
          ]
        }
      ]
    },
    {
      "number": "III",
      "title": "NOME DO TÓPICO III (CONFORME A REVISTA)",
      "explicacao": "Explicação didática do Tópico III baseada nas transcrições.",
      "sinopse": "Resumo do Tópico III para o professor revisar antes da aula.",
      "frasesEnfase": [
        "Frase de impacto do Tópico III"
      ],
      "imagePrompt": "Cinematic wide-angle 16:9 film still of 1st-century setting related to Topic III, authentic textures, dramatic lighting, 8k, no text --ar 16:9 --style raw",
      "subtopicos": [
        {
          "number": "1",
          "title": "Título do Subtópico 1 do Tópico III",
          "projetor": "Frase síntese do subtópico 1 para o projetor.",
          "imagePrompt": "Cinematic historical 16:9 scene...",
          "ideias": [
            {
              "letra": "a",
              "titulo": "Primeira Ideia do Subtópico 1",
              "projetor": "Ideia Central para o Projetor.",
              "professor": {
                "explicacao": "Explicação do conteúdo da ideia...",
                "contexto": "Contexto histórico e cultural...",
                "versiculos": [
                  { "reference": "Referência 1 (ARC)", "text": "Texto bíblico..." },
                  { "reference": "Referência 2 (ARC)", "text": "Texto bíblico..." }
                ],
                "aplicacao": "Aplicação prática para a vida cristã...",
                "enfase": "Aprenda com a Palavra: ensinamento de destaque...",
                "cuidadoDoutrinario": "🔥 Cuidado Doutrinário para a sala de aula..."
              },
              "imagePrompt": "Cinematic 16:9 visual prompt..."
            },
            {
              "letra": "b",
              "titulo": "Segunda Ideia do Subtópico 1",
              "projetor": "Ideia Central b para o Projetor.",
              "professor": {
                "explicacao": "Explicação do conteúdo da ideia b...",
                "contexto": "Contexto histórico...",
                "versiculos": [
                  { "reference": "Referência 1 (ARC)", "text": "Texto bíblico..." },
                  { "reference": "Referência 2 (ARC)", "text": "Texto bíblico..." }
                ],
                "aplicacao": "Aplicação prática...",
                "enfase": "Aprenda com a Palavra...",
                "cuidadoDoutrinario": "🔥 Cuidado Doutrinário..."
              },
              "imagePrompt": "Cinematic 16:9 visual prompt..."
            }
          ]
        },
        {
          "number": "2",
          "title": "Título do Subtópico 2 do Tópico III",
          "projetor": "Frase síntese do subtópico 2 para o projetor.",
          "imagePrompt": "Cinematic historical 16:9 scene...",
          "ideias": [
            {
              "letra": "a",
              "titulo": "Primeira Ideia do Subtópico 2",
              "projetor": "Ideia Central para o Projetor.",
              "professor": {
                "explicacao": "Explicação do subtópico 2...",
                "contexto": "Contexto histórico...",
                "versiculos": [
                  { "reference": "Referência 1", "text": "Versículo ARC..." },
                  { "reference": "Referência 2", "text": "Versículo ARC..." }
                ],
                "aplicacao": "Aplicação prática...",
                "enfase": "Aprenda com a Palavra...",
                "cuidadoDoutrinario": "Cuidado doutrinário..."
              },
              "imagePrompt": "Cinematic 16:9 prompt..."
            },
            {
              "letra": "b",
              "titulo": "Segunda Ideia do Subtópico 2",
              "projetor": "Ideia Central b.",
              "professor": {
                "explicacao": "Explicação...",
                "contexto": "Contexto...",
                "versiculos": [
                  { "reference": "Referência 1", "text": "Texto..." },
                  { "reference": "Referência 2", "text": "Texto..." }
                ],
                "aplicacao": "Aplicação...",
                "enfase": "Aprenda com a Palavra...",
                "cuidadoDoutrinario": "Alerta..."
              },
              "imagePrompt": "Cinematic 16:9 prompt..."
            }
          ]
        },
        {
          "number": "3",
          "title": "Título do Subtópico 3 do Tópico III",
          "projetor": "Frase síntese do subtópico 3 para o projetor.",
          "imagePrompt": "Cinematic historical 16:9 scene...",
          "ideias": [
            {
              "letra": "a",
              "titulo": "Primeira Ideia do Subtópico 3",
              "projetor": "Ideia Central para o Projetor.",
              "professor": {
                "explicacao": "Explicação do subtópico 3...",
                "contexto": "Contexto histórico...",
                "versiculos": [
                  { "reference": "Referência 1", "text": "Versículo ARC..." },
                  { "reference": "Referência 2", "text": "Versículo ARC..." }
                ],
                "aplicacao": "Aplicação prática...",
                "enfase": "Aprenda com a Palavra...",
                "cuidadoDoutrinario": "Cuidado doutrinário..."
              },
              "imagePrompt": "Cinematic 16:9 prompt..."
            },
            {
              "letra": "b",
              "titulo": "Segunda Ideia do Subtópico 3",
              "projetor": "Ideia Central b.",
              "professor": {
                "explicacao": "Explicação...",
                "contexto": "Contexto...",
                "versiculos": [
                  { "reference": "Referência 1", "text": "Texto..." },
                  { "reference": "Referência 2", "text": "Texto..." }
                ],
                "aplicacao": "Aplicação...",
                "enfase": "Aprenda com a Palavra...",
                "cuidadoDoutrinario": "Alerta..."
              },
              "imagePrompt": "Cinematic 16:9 prompt..."
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
    { "item": "Todos os 3 Tópicos Oficiais desenvolvidos (I, II e III)", "status": true },
    { "item": "Todos os subtópicos da revista gerados (1, 2 e 3 de cada tópico)", "status": true },
    { "item": "Estrutura da revista preservada (Nível 1)", "status": true },
    { "item": "Transcrições cruzadas e âncora teológica (Níveis 2 e 3)", "status": true },
    { "item": "Versículos de apoio conectados à aplicação prática (distintos da leitura)", "status": true },
    { "item": "Contexto Histórico, Cultural e Bíblico aprofundado", "status": true },
    { "item": "Card Aprenda com a Palavra estruturado", "status": true },
    { "item": "Prompts Visuais 16:9 ultra-elaborados e cinematográficos", "status": true },
    { "item": "O Que Não Pode Ser Dito / Cuidado Doutrinário incluído", "status": true },
    { "item": "Vocabulário original no Grego/Hebraico sugerido e explicado", "status": true }
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
