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
      ponteContextual: raw.introducao?.ponteContextual ? {
        enabled: raw.introducao.ponteContextual.enabled !== false && Boolean(
          raw.introducao.ponteContextual.enabled ||
          raw.introducao.ponteContextual.naLicaoAnterior ||
          raw.introducao.ponteContextual.ondeParou ||
          raw.introducao.ponteContextual.ponteContextual ||
          raw.introducao.ponteContextual.capitulosIntermediarios
        ),
        naLicaoAnterior: raw.introducao.ponteContextual.naLicaoAnterior || raw.introducao.ponteContextual.ondeParou || '',
        ponteContextual: raw.introducao.ponteContextual.ponteContextual || raw.introducao.ponteContextual.capitulosIntermediarios || '',
        ondeParou: raw.introducao.ponteContextual.ondeParou || raw.introducao.ponteContextual.naLicaoAnterior || '',
        capitulosIntermediarios: raw.introducao.ponteContextual.capitulosIntermediarios || raw.introducao.ponteContextual.ponteContextual || '',
        ganchoAulaAtual: raw.introducao.ponteContextual.ganchoAulaAtual || '',
        projetor: raw.introducao.ponteContextual.projetor || '',
      } : undefined
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
            ? topico.subtopicos.map((sub: any, sIdx: number) => {
                const hasIdeias = Array.isArray(sub.ideias) && sub.ideias.length > 0;

                let frasesExplicativas = Array.isArray(sub.frasesExplicativas)
                  ? sub.frasesExplicativas.map((f: any) => ({
                      frase: f.frase || '',
                      explicacao: f.explicacao || '',
                      exemplo: f.exemplo || f.alusao || f.ilustracao || '',
                    })).filter((f: any) => Boolean(f.frase || f.explicacao))
                  : [];

                let projetor = sub.projetor || sub.textoRevista || '';
                if (!projetor && frasesExplicativas.length > 0) {
                  projetor = frasesExplicativas.map((f: any) => f.frase).filter(Boolean).join(' ');
                }

                const numStr = sub.number || `${sIdx + 1}`;
                const numPrefix = `${numStr}. `;
                if (projetor && !projetor.startsWith(numPrefix) && !projetor.startsWith(`${numStr} `) && !projetor.startsWith(`Subtópico ${numStr}`)) {
                  projetor = `${numPrefix}${projetor}`;
                }

                let explicacao = sub.explicacao || sub.professor?.explicacao || sub.descricao || sub.conteudo || '';

                if (!explicacao && frasesExplicativas.length > 0) {
                  explicacao = frasesExplicativas
                    .map((f: any) => `📌 "${f.frase}"\n👉 ${f.explicacao}`)
                    .join('\n\n');
                }

                let versiculos = Array.isArray(sub.versiculos) ? sub.versiculos : [];
                let aplicacao = sub.aplicacao || '';
                let enfase = (sub.enfase || '')
                  .replace(/^["'“]?\s*Aprenda\s+com\s+a\s+Palavra\s*[\:\–\—\-]?\s*/i, '')
                  .replace(/^["'“]?\s*Ênfase\s*(?:para\s+a\s+sala)?\s*[\:\–\—\-]?\s*/i, '')
                  .replace(/^["'“]?\s*📌\s*/, '')
                  .replace(/^["'“]?\s*💡\s*/, '')
                  .replace(/["'”]?\s*$/, '')
                  .trim();
                let cuidadoDoutrinario = sub.cuidadoDoutrinario || '';
                let palavrasOriginais = Array.isArray(sub.palavrasOriginais)
                  ? sub.palavrasOriginais.map((p: any) => ({
                      termo: p.termo || '',
                      transliteracao: p.transliteracao || '',
                      idioma: p.idioma === 'Hebraico' ? 'Hebraico' : 'Grego',
                      significado: p.significado || '',
                      explicacao: p.explicacao || '',
                    }))
                  : [];
                let imagePrompt = sub.imagePrompt || '';

                if (hasIdeias && !explicacao) {
                  // Fallback de compatibilidade para JSONs legados com array de ideias
                  const firstIdeia = sub.ideias[0];
                  const explicacoes = sub.ideias.map((i: any) => {
                    const ctx = i.professor?.contexto ? `Contexto Histórico: ${i.professor.contexto}\n\n` : '';
                    return `${ctx}${i.professor?.explicacao || ''}`.trim();
                  }).filter(Boolean);
                  
                  explicacao = explicacoes.join('\n\n');
                  projetor = firstIdeia?.projetor || sub.projetor || '';
                  if (!versiculos.length && firstIdeia?.professor?.versiculos) {
                    versiculos = firstIdeia.professor.versiculos;
                  }
                  if (!aplicacao && firstIdeia?.professor?.aplicacao) {
                    aplicacao = firstIdeia.professor.aplicacao;
                  }
                  if (!enfase && firstIdeia?.professor?.enfase) {
                    enfase = firstIdeia.professor.enfase;
                  }
                  if (!cuidadoDoutrinario && firstIdeia?.professor?.cuidadoDoutrinario) {
                    cuidadoDoutrinario = firstIdeia.professor.cuidadoDoutrinario;
                  }
                  if (!palavrasOriginais.length && firstIdeia?.professor?.palavrasOriginais) {
                    palavrasOriginais = firstIdeia.professor.palavrasOriginais;
                  }
                  if (!imagePrompt && firstIdeia?.imagePrompt) {
                    imagePrompt = firstIdeia.imagePrompt;
                  }
                } else if (sub.contexto && !explicacao.toLowerCase().includes('contexto')) {
                  // Se o contexto histórico veio separado, funde na explicação
                  explicacao = `Contexto Histórico: ${sub.contexto}\n\n${explicacao}`.trim();
                }

                return {
                  number: sub.number || `${sIdx + 1}`,
                  title: sub.title || `Subtópico ${sIdx + 1}`,
                  projetor: projetor,
                  explicacao: explicacao,
                  frasesExplicativas: frasesExplicativas.length > 0 ? frasesExplicativas : undefined,
                  versiculos: versiculos,
                  aplicacao: aplicacao,
                  enfase: enfase,
                  cuidadoDoutrinario: cuidadoDoutrinario,
                  palavrasOriginais: palavrasOriginais,
                  imagePrompt: imagePrompt,
                  ideias: hasIdeias ? sub.ideias : undefined,
                };
              })
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

  const bridgePromptInstruction = options.hasContextualBridge
    ? `
--- 🔗 REQUISITO ESPECIAL: TRANSIÇÃO E PONTE CONTEXTUAL ENTRE LIÇÕES (DETALHADA & RICA) ---
O professor ATIVOU a transição da lição anterior para a lição atual.
Informações fornecidas pelo professor sobre a transição:
"${options.previousLessonContext || 'Reconstrua o resumo da lição passada e o intervalo de capítulos até a aula de hoje.'}"

Você DEVE obrigatoriamente preencher o objeto "ponteContextual" dentro de "introducao" com DOIS BLOCOS DETALHADOS E BEM ESTRUTURADOS:

1. "naLicaoAnterior": Forneça uma síntese explicativa DETALHADA E RICA (de 2 a 3 parágrafos bem desenvolvidos) sobre o que foi ministrado na LIÇÃO ANTERIOR: o tema principal, os personagens, as lições teológicas/espirituais aprendidas, os acontecimentos chave e onde a aula passada encerrou. Evite resumos genéricos ou de 1 frase!
2. "ponteContextual": Forneça uma explicação bíblica DETALHADA (de 2 a 3 parágrafos bem desenvolvidos) abrangendo os capítulos e eventos bíblicos no INTERVALO entre a lição passada e a aula de hoje: descreva a sequência dos fatos bíblicos, o deslocamento dos personagens, o contexto geopolítico/religioso e a transição até o ponto inicial da lição atual.

Estrutura esperada:
"ponteContextual": {
  "enabled": true,
  "naLicaoAnterior": "Explicação detalhada, rica e profunda sobre o término e os ensinamentos da lição anterior...",
  "ponteContextual": "Explicação detalhada e rica sobre todos os acontecimentos e capítulos bíblicos no intervalo entre as duas lições..."
}
`
    : `
--- PONTE CONTEXTUAL DESATIVADA ---
Na propriedade "introducao", preencha "ponteContextual": { "enabled": false }.
`;

  const prompt = `
Você é o Assistente Especialista de Preparação de Aulas da Escola Bíblica Dominical (MegaEBD).
Sua missão é realizar a PREPARAÇÃO COMPLETA E DIDÁTICA DA AULA cruzando o conteúdo da REVISTA OFICIAL com as TRANSCRIÇÕES enviadas.

${bridgePromptInstruction}

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
  A array "topicos" no JSON DEVE CONTER OBRIGATORIAMENTE 3 OBJETOS.

- REGRA MANDATÓRIA DOS SUBTÓPICOS (1, 2 E 3) — NÚMERO + PARÁGRAFO LITERAL DA REVISTA NO SLIDE + EXPLICAÇÃO CONSTANTE:
  Cada Tópico da revista possui seus SUBTÓPICOS OFICIAIS (Subtópico 1, Subtópico 2 e Subtópico 3).
  1. TEXTO DO SLIDE DO QUADRO AZUL ("projetor"): Comece OBRIGATORIAMENTE com o número do subtópico (ex: "1. ", "2. ", "3. ") e em seguida transcreva O PARÁGRAFO LITERAL, COMPLETO E INTEGRAL DA REVISTA para esse subtópico, exatamente como consta na lição impressa (ipsis litteris), sem paráfrases, sem resumos de 1 frase e sem alterar nenhuma palavra.
  2. EXPLICAÇÃO CONSTANTE FRASE A FRASE ("frasesExplicativas"): A cada frase/afirmação do texto literal do subtópico da revista, forneça IMEDIATAMENTE a sua explicação didática e histórica detalhada baseada nas transcrições e no contexto do século I.
  3. TEXTO CONTINUO ("explicacao"): A explicação didática completa do professor combinada de forma fluida.

- CONCISÃO INTELIGENTE PARA GARANTIR TODOS OS TÓPICOS E SUBTÓPICOS:
  Para que a aula completa (todos os 3 tópicos e seus subtópicos) caiba com perfeição sem truncar:
  * "projetor": "1. " + O parágrafo literal e integral do subtópico copiado ipsis litteris da lição da revista.
  * "frasesExplicativas": As frases literais da revista com suas respectivas explicações didáticas e históricas.
  * "versiculos": 2 versículos de apoio com texto direto ARC que conversem com a aplicação prática.
  * "aplicacao": 2 a 3 frases práticas e pentecostais para a vida diária.
  * "enfase": 1 frase de alto impacto ("Aprenda com a Palavra...").
  * "cuidadoDoutrinario": 1 frase de alerta teológico.
  * "imagePrompt": 1 descrição cinematográfica nobre de 2 a 3 frases.

- CADA SUBTÓPICO DO MAPA DE ENSINO DEVE CONTER OBRIGATORIAMENTE OS SEGUINTES ELEMENTOS CHAVE:
  1. NÚMERO + TEXTO LITERAL DA REVISTA PARA O SLIDE ("projetor"): "1. " seguido do parágrafo original e exato (ipsis litteris) do subtópico da lição para os alunos lerem no quadro azul.
  2. EXPLICAÇÃO CONSTANTE FRASE POR FRASE ("frasesExplicativas"): Array com objetos contendo "frase" (afirmação do texto da revista), "explicacao" (explicação didática/histórica para o professor) e "exemplo" (exemplo prático do dia a dia ou alusão ilustrativa simples para ministrar essa frase em sala).
  3. EXPLICAÇÃO COMPLETA ("explicacao"): Texto didático completo do subtópico.
  4. BASE BÍBLICA ("versiculos"): 
     * REGRA OBRIGATÓRIA DE DIÁLOGO PRÁTICO: Os versículos bíblicos DEVEM CONVERSAR DIRETAMENTE com a APLICAÇÃO PRÁTICA ("aplicacao"), dando fundamento escriturístico para a conduta do crente.
     * VERSÍCULOS DIFERENTES DA LEITURA EM CLASSE: Selecione PREFERENCIALMENTE versículos de apoio DIFERENTES daqueles lidos na "Leitura Bíblica em Classe". Forneça referência e texto completo na versão ARC oficial.
  5. APLICAÇÃO PRÁTICA ("aplicacao"): Como essa verdade bíblica e os versículos de apoio se aplicam de forma concreta à vida espiritual e diária do aluno.
  6. APRENDA COM A PALAVRA... ("enfase"): Frase forte de destaque pedagógico e espiritual ("Aprenda com a Palavra...").
  7. 🔥 O QUE NÃO PODE SER DITO / CUIDADO DOUTRINÁRIO ("cuidadoDoutrinario"): Alerta teológico/pastoral identificando explicitamente equívocos que o professor NÃO DEVE cometer.
  8. 🏛️ VOCABULÁRIO EXEGÉTICO NO GREGO / HEBRAICO ("palavrasOriginais"): Sugira a explicação exegética no Grego ou Hebraico de palavras marcantes. Forneça "termo", "transliteracao", "idioma", "significado" e "explicacao".
  9. PROMPT VISUAL 16:9 ("imagePrompt"): Descrição cinematográfica hiperdetalhada 16:9 para Midjourney / DALL-E / Canva.

- LEITURA BÍBLICA EM CLASSE NA ÍNTEGRA ("biblicalText"): Forneça OBRIGATORIAMENTE o texto bíblico COMPLETO NA ÍNTEGRA de TODOS os versículos lidos em classe na versão ARC. A primeira linha deve conter a referência COMPLETA (ex: "Atos 24.1-6, 10-16") seguida de travessão ("—") e em seguida CADA um dos versículos numerados sem omitir nenhum versículo e sem colocar reticências.

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
  "biblicalText": "Atos 24.1-6 — 1 E, cinco dias depois...",
  "introducao": {
    "text": "Explicação detalhada da introdução para o professor.",
    "projetor": "Frase de introdução para o projetor dos alunos.",
    "ponteContextual": {
      "enabled": true,
      "ondeParou": "Onde a lição anterior parou...",
      "capitulosIntermediarios": "Resumo bíblico dos capítulos pulados...",
      "ganchoAulaAtual": "Conexão direta com o estudo de hoje...",
      "projetor": "Frase síntese para o projetor sobre a transição."
    }
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
      "imagePrompt": "Cinematic 16:9 prompt for Topic I...",
      "subtopicos": [
        {
          "number": "1",
          "title": "A conspiração judaica contra Paulo (vv.1,2)",
          "projetor": "Interesses religiosos e políticos uniram-se em uma trama orquestrada para silenciar o Evangelho de Cristo.",
          "frasesExplicativas": [
            {
              "frase": "E, cinco dias depois, o sumo sacerdote Ananias desceu com os anciãos e com um certo orador, Tértulo.",
              "explicacao": "No primeiro século, a elite sacerdotal do Sinédrio deslocou-se de Jerusalém a Cesareia. A presença de Tértulo, um orador treinado no direito romano provincial, demonstra que a acusação buscou dar roupagem política de sedição contra Roma.",
              "exemplo": "É como uma grande corporação contratando advogados renomados para sufocar um trabalhador simples em um tribunal distante."
            },
            {
              "frase": "Os quais compareceram perante o presidente contra Paulo.",
              "explicacao": "O 'presidente' refere-se ao procurador romano Antônio Félix. A acusação formal visava obter uma sentença sumária contra Paulo.",
              "exemplo": "Como alguém que tenta pressionar a autoridade pública a assinar uma demissão sem dar direito de resposta ao acusado."
            }
          ],
          "explicacao": "📌 'E, cinco dias depois, o sumo sacerdote Ananias desceu com os anciãos e com um certo orador, Tértulo.'\n👉 No primeiro século, a elite sacerdotal do Sinédrio deslocou-se de Jerusalém a Cesareia...\n\n📌 'Os quais compareceram perante o presidente contra Paulo.'\n👉 O 'presidente' refere-se ao procurador romano Antônio Félix...",
          "versiculos": [
            { "reference": "1 Pedro 4.14", "text": "Se pelo nome de Cristo sois vituperados, bem-aventurados sois..." }
          ],
          "aplicacao": "O crente diante de calúnias no trabalho deve manter serenidade, oração e testemunho irrepreensível.",
          "enfase": "A resposta do servo de Deus diante da calúnia não é o revide carnal, mas uma consciência pura.",
          "cuidadoDoutrinario": "🔥 Cuidado Doutrinário: Não afirmar que toda oposição é perseguição por causa da fé.",
          "palavrasOriginais": [
            {
              "termo": "λοιμός",
              "transliteracao": "Loimós",
              "idioma": "Grego",
              "significado": "Peste, praga; indivíduo causador de contágio.",
              "explicacao": "Tértulo empregou o termo grego 'loimós' para estigmatizar Paulo perante o tribunal romano."
            }
          ],
          "imagePrompt": "Cinematic historical wide shot of a 1st-century Mediterranean Roman courtroom..."
        },
        {
          "number": "2",
          "title": "Título do Subtópico 2 da Revista",
          "projetor": "Frase síntese do subtópico 2 para o projetor.",
          "explicacao": "Explicação didática do subtópico 2 integrando o contexto histórico do século I...",
          "versiculos": [
            { "reference": "Texto Bíblico 1 (ARC)", "text": "Versículo ARC..." }
          ],
          "aplicacao": "Aplicação prática para a vida cristã...",
          "enfase": "Aprenda com a Palavra: ensinamento de destaque...",
          "cuidadoDoutrinario": "🔥 Cuidado Doutrinário para a sala de aula...",
          "imagePrompt": "Cinematic 16:9 visual prompt..."
        },
        {
          "number": "3",
          "title": "Título do Subtópico 3 da Revista",
          "projetor": "Frase síntese do subtópico 3 para o projetor.",
          "explicacao": "Explicação didática do subtópico 3 integrando o contexto histórico...",
          "versiculos": [
            { "reference": "Texto Bíblico 1 (ARC)", "text": "Versículo ARC..." }
          ],
          "aplicacao": "Aplicação prática para a vida cristã...",
          "enfase": "Aprenda com a Palavra...",
          "cuidadoDoutrinario": "🔥 Cuidado Doutrinário...",
          "imagePrompt": "Cinematic 16:9 visual prompt..."
        }
      ]
    },
    {
      "number": "II",
      "title": "NOME DO TÓPICO II (CONFORME A REVISTA)",
      "explicacao": "Explicação geral do Tópico II baseada nas transcrições.",
      "sinopse": "Resumo do Tópico II para o professor revisar antes da aula.",
      "frasesEnfase": [ "Frase de impacto do Tópico II" ],
      "imagePrompt": "Cinematic wide-angle 16:9 film still of 1st-century setting related to Topic II...",
      "subtopicos": [
        {
          "number": "1",
          "title": "Título do Subtópico 1 do Tópico II",
          "projetor": "Frase síntese do subtópico 1 para o projetor.",
          "explicacao": "Explicação didática com contexto histórico integrado...",
          "versiculos": [ { "reference": "Texto (ARC)", "text": "Versículo..." } ],
          "aplicacao": "Aplicação prática...",
          "enfase": "Aprenda com a Palavra...",
          "cuidadoDoutrinario": "Cuidado doutrinário...",
          "imagePrompt": "Cinematic 16:9 prompt..."
        },
        {
          "number": "2",
          "title": "Título do Subtópico 2 do Tópico II",
          "projetor": "Frase síntese...",
          "explicacao": "Explicação didática com contexto histórico...",
          "versiculos": [ { "reference": "Texto (ARC)", "text": "Versículo..." } ],
          "aplicacao": "Aplicação...",
          "enfase": "Ênfase...",
          "cuidadoDoutrinario": "Cuidado...",
          "imagePrompt": "Prompt..."
        },
        {
          "number": "3",
          "title": "Título do Subtópico 3 do Tópico II",
          "projetor": "Frase síntese...",
          "explicacao": "Explicação didática...",
          "versiculos": [ { "reference": "Texto (ARC)", "text": "Versículo..." } ],
          "aplicacao": "Aplicação...",
          "enfase": "Ênfase...",
          "cuidadoDoutrinario": "Cuidado...",
          "imagePrompt": "Prompt..."
        }
      ]
    },
    {
      "number": "III",
      "title": "NOME DO TÓPICO III (CONFORME A REVISTA)",
      "explicacao": "Explicação geral do Tópico III baseada nas transcrições.",
      "sinopse": "Resumo do Tópico III...",
      "frasesEnfase": [ "Frase de impacto do Tópico III" ],
      "imagePrompt": "Cinematic wide-angle 16:9 film still...",
      "subtopicos": [
        {
          "number": "1",
          "title": "Título do Subtópico 1 do Tópico III",
          "projetor": "Frase síntese...",
          "explicacao": "Explicação didática com contexto histórico...",
          "versiculos": [ { "reference": "Texto (ARC)", "text": "Versículo..." } ],
          "aplicacao": "Aplicação...",
          "enfase": "Ênfase...",
          "cuidadoDoutrinario": "Cuidado...",
          "imagePrompt": "Prompt..."
        },
        {
          "number": "2",
          "title": "Título do Subtópico 2 do Tópico III",
          "projetor": "Frase síntese...",
          "explicacao": "Explicação didática...",
          "versiculos": [ { "reference": "Texto (ARC)", "text": "Versículo..." } ],
          "aplicacao": "Aplicação...",
          "enfase": "Ênfase...",
          "cuidadoDoutrinario": "Cuidado...",
          "imagePrompt": "Prompt..."
        },
        {
          "number": "3",
          "title": "Título do Subtópico 3 do Tópico III",
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
