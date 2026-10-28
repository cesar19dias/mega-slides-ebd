/**
 * MOTOR DE PREPARAÇÃO INTELIGENTE DE AULAS EBD (MEGAEBD)
 * 
 * Princípio Fundamental:
 * REVISTA DA EBD + TRANSCRIÇÕES (NO MÍNIMO 2) → PREPARAÇÃO COMPLETA DA AULA
 */

import type { EBDLessonPreparation, TranscriptionSource, PreparationOptions } from '../types';
import { callGeminiRaw } from './geminiService';
import { jsonrepair } from 'jsonrepair';
import { fillMissingLessonPrompts } from './promptGeneratorService';
import { getTheologicalKeywordExplanation } from '../constants/theologicalDictionary';
import { applyRevistaLiteralText } from './revistaLiteralExtractor';

export function isCopyOrEmptyExplanation(explicacao?: string, projetor?: string): boolean {
  if (!explicacao || explicacao.trim().length < 25) return true;
  if (!projetor) return false;

  const cleanExp = explicacao.replace(/^\d+[\.\)\-]?\s*/, '').trim().toLowerCase();
  const cleanProj = projetor.replace(/^\d+[\.\)\-]?\s*/, '').trim().toLowerCase();

  if (cleanExp === cleanProj) return true;

  // Se a explicação for quase idêntica ao projetor (diferença insignificante)
  const lenDiff = Math.abs(cleanExp.length - cleanProj.length);
  if (lenDiff < 40 && (cleanExp.includes(cleanProj) || cleanProj.includes(cleanExp))) {
    return true;
  }

  return false;
}

function normalizeLessonData(raw: any): EBDLessonPreparation {
  const result: EBDLessonPreparation = {
    metadata: {
      lessonNumber: raw.metadata?.lessonNumber || 'Lição EBD',
      title: raw.metadata?.title || 'Preparação da Lição',
      subtitle: raw.metadata?.subtitle || '',
      themeTopic: raw.metadata?.themeTopic || 'Estudo Dominical',
      date: raw.metadata?.date || '',
      targetAudience: raw.metadata?.targetAudience || 'Adultos / EBD',
      depth: raw.metadata?.depth || 'detalhada',
      imagePrompt: raw.metadata?.imagePrompt || '',
    },
    textAureo: {
      text: raw.textAureo?.text || '',
      reference: raw.textAureo?.reference || '',
      imagePrompt: raw.textAureo?.imagePrompt || '',
    },
    verdadePratica: {
      text: raw.verdadePratica?.text || '',
      imagePrompt: raw.verdadePratica?.imagePrompt || '',
    },
    palavraChave: raw.palavraChave ? {
      palavra: raw.palavraChave.palavra || '',
      explicacao: getTheologicalKeywordExplanation(raw.palavraChave.palavra, raw.palavraChave.explicacao),
      imagePrompt: raw.palavraChave.imagePrompt || '',
    } : undefined,
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
                  // Funde frasesExplicativas legados em texto linear, sem marcações de exemplo
                  explicacao = frasesExplicativas
                    .map((f: any) => {
                      const fraseLabel = f.frase ? `"${f.frase}" — ` : '';
                      return `${fraseLabel}${f.explicacao}`.trim();
                    })
                    .join('\n\n');
                }

                let versiculos = Array.isArray(sub.versiculos)
                  ? sub.versiculos.map((v: any) => ({
                      reference: v.reference || '',
                      text: v.text || '',
                      explicacao: v.explicacao || '',
                    }))
                  : [];
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

  return fillMissingLessonPrompts(result);
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
  // recua até o último fechamento de objeto/array e repara com limite de tentativas (evita O(n²))
  let repairAttempts = 0;
  const maxRepairAttempts = 15;
  for (let cutPos = cleaned.length - 1; cutPos > 500 && repairAttempts < maxRepairAttempts; cutPos--) {
    const char = cleaned[cutPos];
    if (char === '}' || char === ']') {
      repairAttempts++;
      const candidate = cleaned.substring(0, cutPos + 1);
      try {
        const repaired = jsonrepair(candidate);
        const parsed = JSON.parse(repaired);
        console.log('[JSON Repair] Recuperado com sucesso via truncamento seguro na posição', cutPos, `(tentativa ${repairAttempts})`);
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

  const bibleVersionLabel = options.bibleVersion === 'NVI'
    ? 'Nova Versão Internacional (NVI)'
    : options.bibleVersion === 'NAA'
    ? 'Nova Almeida Atualizada (NAA)'
    : 'Almeida Revista e Corrigida (ARC)';

  const depthInstruction = {
    resumida: 'NÍVEL RESUMIDO: Ultra-objetivo e direto ao ponto (1 parágrafo conciso de 40 a 70 palavras por subtópico, destacando o cerne bíblico e a lição imediata).',
    detalhada: 'NÍVEL DETALHADO (PADRÃO — OBJETIVO PARA GESTÃO DO TEMPO DE AULA): Explicação didática límpida, direta e objetiva para não estourar o tempo de aula da EBD (1 parágrafo bem estruturado ou 2 parágrafos curtos, entre 60 e 100 palavras por subtópico). Deve sintetizar a verdade espiritual, a raiz exegética/teológica essencial e a conexão bíblica sem divagações prolixas.',
    aprofundada: 'NÍVEL APROFUNDADO: Alta densidade teológica e exegética com rigorosa objetividade pedagógica (1 a 2 parágrafos sólidos de 90 a 140 palavras por subtópico, aprofundando o original e a história sem prolixidade que comprometa o tempo da EBD).'
  }[options.depth] || 'Explicação didática objetiva e clara de 60 a 100 palavras por subtópico para gestão do tempo de aula da EBD.';

  const pentecostalInstruction = options.includePentecostalApplication
    ? 'ÊNFASE PENTECOSTAL ATIVADA: Destaque ativamente a atuação e o poder do Espírito Santo, a atualidade dos dons espirituais, a oração fervorosa, a consagração e o agir sobrenatural de Deus tanto na aplicação prática quanto nas explicações teológicas da lição.'
    : 'ÊNFASE PENTECOSTAL PADRÃO: Mantenha uma aplicação prática bíblica equilibrada e sólida, adequada para classes gerais de EBD.';

  const professorConfigBlock = `
--- ⚙️ CONFIGURAÇÕES ESCOLHIDAS PELO PROFESSOR ---
1. VERSÃO BÍBLICA: Utilize OBRIGATORIAMENTE o texto na versão ${bibleVersionLabel} para todos os versículos citados (Texto Áureo, Leitura Bíblica em Classe e Versículos de apoio).
2. PROFUNDIDADE DO CONTEÚDO ("${(options.depth || 'detalhada').toUpperCase()}"):
   ${depthInstruction}
3. APLICAÇÃO PENTECOSTAL:
   ${pentecostalInstruction}
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
2. Valide as referências bíblicas no texto bíblico na versão oficial escolhida (${bibleVersionLabel}).
3. Garanta que a linguagem seja culta, clara e teologicamente precisa.

--- REGRAS DE CONSTRUÇÃO DO "MAPA DE ENSINO" ---
- REGRA MANDATÓRIA INEGOCIÁVEL DOS 3 TÓPICOS OFICIAIS (I, II E III):
  A Lição da EBD é composta OBRIGATORIAMENTE por 3 TÓPICOS:
  1. TÓPICO I
  2. TÓPICO II
  3. TÓPICO III
  É EXPRESSAMENTE PROIBIDO parar no Tópico I ou omitir o Tópico II e o Tópico III!
  A array "topicos" no JSON DEVE CONTER OBRIGATORIAMENTE 3 OBJETOS.

--- 🛑 REGRA MANDATÓRIA INEGOCIÁVEL: DISTINÇÃO ENTRE "projetor" E "explicacao" (PROIBIDO COPIAR) ---
O erro mais grave e inaceitável é copiar o texto da revista ou do "projetor" para o campo "explicacao".
Eles possuem fontes, propósitos, tamanhos e linguagens COMPLETAMENTE DIFERENTES:

1. CAMADA 1 — SLIDE DO PROJETOR DOS ALUNOS ("projetor"):
   * Origem: REVISTA DA EBD.
   * Conteúdo: Inicie OBRIGATORIAMENTE com o número do subtópico (ex: "1. ", "2. ", "3. ") e transcreva O PARÁGRAFO LITERAL DA REVISTA daquele subtópico (texto da lição impressa para os alunos lerem no slide azul).
   * Função: Ficar projetado na tela para leitura pública da classe.

2. CAMADA 2 — EXPLICAÇÃO DIDÁTICA DO PROFESSOR ("explicacao"):
   * Origem: TRANSCRIÇÕES 1 e 2 (Estudos e falas dos pastores/pregadores nas transcrições).
   * Conteúdo: A AULA MINISTRADA PELO PROFESSOR.
   * ⏱️ REGRA DE GESTÃO DO TEMPO DE AULA DA EBD (OBJETIVIDADE OBRIGATÓRIA):
     - A aula dominical possui tempo escasso (45 a 60 minutos para toda a lição, cerca de 4 a 5 minutos por subtópico). Logo, a explicação do professor DEVE SER OBJETIVA, DIRETA, LÍMPIDA E PEDAGÓGICA (cerca de 60 a 100 palavras por subtópico — 1 parágrafo bem estruturado ou no máximo 2 parágrafos curtos).
     - NÃO crie explicações prolixas, cansativas ou com parágrafos excessivamente longos que estourem o tempo da aula.
     - Vá direto ao cerne: conecte a verdade espiritual, a raiz teológica/exegética (Hebraico/Grego quando aplicável) e a correlação bíblica com objetividade e clareza cristalina.
   * 🌟 PADRÃO DE OURO A SEGUIR (EXEMPLO MODELO IDEAL DE ESTRUTURA E CONCISÃO DIDÁTICA):
     "Moisés apresenta três etapas da vida espiritual: ouvir, aprender e praticar. Ouvir (shema) é atender à Palavra com disposição para obedecer; aprender (lamad) é internalizar o ensino divino; e guardar (shamar) é colocá-lo em prática. Diferentemente da geração que falhou em obedecer, o cristão deve ser praticante da Palavra, e não apenas ouvinte (Tg 1.22-25)."
     Observe como o exemplo acima é profundo, claro, exegético, cita a correlação bíblica e cabe perfeitamente no tempo real da classe!
   * 🛑 REGRA ANTI-CÓPIA ABSOLUTA:
     - O campo "explicacao" NUNCA, SOB HIPÓTESE ALGUMA, DEVE SER IGUAL OU COPIADO DO "projetor" NEM DO PARÁGRAFO DA REVISTA!
     - Se o campo "explicacao" contiver o mesmo texto da revista/'projetor', o sistema falhará, pois o professor precisa de conteúdo explicativo NOVO extraído das transcrições, e não de uma cópia do slide!
     - Se as transcrições forem sucintas sobre determinado ponto, use a teologia bíblica para enriquecer a explicação com profundidade histórica e pedagógica, mas NUNCA repita o texto do projetor!

- CADA SUBTÓPICO DO MAPA DE ENSINO DEVE CONTER OBRIGATORIAMENTE OS SEGUINTES ELEMENTOS CHAVE:
  1. NÚMERO + TEXTO LITERAL DA REVISTA PARA O SLIDE ("projetor"): "1. " seguido do parágrafo original e exato (ipsis litteris) do subtópico da lição para os alunos lerem no quadro azul.
  2. EXPLICAÇÃO DIDÁTICA DO PROFESSOR ("explicacao"): Texto objetivo, límpido e pedagógico (60 a 100 palavras), no estilo do Padrão de Ouro. NUNCA copie o projetor.
  3. BASE BÍBLICA ("versiculos") — MÍNIMO DE 2 A 3 VERSÍCULOS CORROBORATIVOS OBRIGATÓRIOS:
     * 🛑 REGRA MANDATÓRIA DE QUANTIDADE: É EXPRESSAMENTE PROIBIDO colocar apenas 1 versículo! Cada subtópico DEVE conter OBRIGATORIAMENTE no mínimo 2 a 3 versículos corroborativos/de apoio ("versiculos": [ {...}, {...} ]).
     * REGRA OBRIGATÓRIA DE DIÁLOGO PRÁTICO: Os versículos bíblicos DEVEM CONVERSAR DIRETAMENTE com o ensino do subtópico e com a APLICAÇÃO PRÁTICA ("aplicacao"), dando fundamento escriturístico sólido para a conduta do crente.
     * VERSÍCULOS DIFERENTES DA LEITURA EM CLASSE: Selecione PREFERENCIALMENTE versículos de apoio DIFERENTES daqueles lidos na "Leitura Bíblica em Classe". Forneça referência completa e texto bíblico completo na versão escolhida (${bibleVersionLabel}).
     * EXPLICAÇÃO BREVE DO VERSÍCULO ("explicacao"): Para CADA versículo de apoio inserido, forneça uma explicação BREVE e concisa (1 a 2 frases) explicando o sentido bíblico e como corrobora o ensino. ATENÇÃO: Esta explicação é destinada EXCLUSIVAMENTE ao ROTEIRO DO PROFESSOR (o slide do projetor exibirá o versículo bíblico literal na íntegra para leitura da classe).
  4. APLICAÇÃO PRÁTICA ("aplicacao"): Como essa verdade bíblica e os versículos de apoio se aplicam de forma concreta à vida espiritual e diária do aluno.
  5. 🔥 O QUE NÃO PODE SER DITO / CUIDADO DOUTRINÁRIO ("cuidadoDoutrinario"): Alerta teológico/pastoral identificando explicitamente equívocos que o professor NÃO DEVE cometer.
  6. 🏛️ VOCABULÁRIO EXEGÉTICO NO GREGO / HEBRAICO ("palavrasOriginais"): Sugira a explicação exegética no Grego ou Hebraico de palavras marcantes. Forneça "termo", "transliteracao", "idioma", "significado" e "explicacao".
  7. PROMPT VISUAL 16:9 ("imagePrompt"): Descrição cinematográfica hiperdetalhada 16:9 para Midjourney / DALL-E / Canva.

--- 🖼️ REQUISITO MANDATÓRIO DE GERAÇÃO DE PROMPTS VISUAIS 16:9 ("imagePrompt") ---
Você DEVE gerar obrigatoriamente um prompt visual cinematográfico hiperdetalhado em formato 16:9 ("imagePrompt") para:
1. TÍTULO DA LIÇÃO ("metadata.imagePrompt"): Cena ampla e cinematográfica em formato 16:9 capturando o tema principal da lição e o contexto histórico bíblico para o slide de capa (sem texto, iluminação nobre, fotorrealista).
2. TEXTO ÁUREO ("textAureo.imagePrompt"): Ilustração bíblica 16:9 que capture com reverência e profundidade espiritual a cena descrita no Texto Áureo.
3. VERDADE PRÁTICA ("verdadePratica.imagePrompt"): Representação visual/conceitual 16:9 da Verdade Prática aplicada à vida diária de fé do cristão.
4. PALAVRA-CHAVE ("palavraChave.imagePrompt"): Composição simbólica, monumental e marcante em 16:9 expressando o conceito teológico central da Palavra-Chave.
5. CADA UM DOS TÓPICOS ("topicos[].imagePrompt"): Prompt 16:9 cinematográfico e imersivo para o Tópico I, Tópico II e Tópico III.
6. CADA UM DOS SUBTÓPICOS ("topicos[].subtopicos[].imagePrompt"): Cena detalhada 16:9 ilustrando com precisão histórica o subtópico específico.

- PALAVRA-CHAVE DA LIÇÃO COM ORIGEM NO HEBRAICO E NO GREGO ("palavraChave"):
  Identifique a PALAVRA-CHAVE oficial da lição informada na revista (ou a palavra teológica/conceitual mais central da lição, ex: "AUTORIA", "INSPIRAÇÃO", "FIDELIDADE").
  Na EXPLICAÇÃO ("explicacao"), OBRIGATORIAMENTE INCLUA A ORIGEM ETIMOLÓGICA NO HEBRAICO (se for contexto do AT) E/OU NO GREGO (se for NT) sempre que houver essa raiz bíblica, indicando o termo transliterado e seu sentido literal original (ex: 'No hebraico 'emûnāh [raiz 'āman, firmeza, estabilidade] e no grego pistis/pistos'). Forneça uma explicação clara, bíblica e didática (2 a 3 frases) conectando essa raiz no original à mensagem da lição.

- LEITURA BÍBLICA EM CLASSE NA ÍNTEGRA ("biblicalText"): Forneça OBRIGATORIAMENTE o texto bíblico COMPLETO NA ÍNTEGRA de TODOS os versículos lidos em classe na versão oficial (${bibleVersionLabel}). A primeira linha deve conter a referência COMPLETA (ex: "Mateus 28.18-20; Atos 1.8; Efésios 2.13-18.") seguida de travessão ("—"). Caso haja múltiplos livros ou capítulos, separe cada livro/capítulo em sua própria linha como título (ex: "Mateus 28", "Atos 1", "Efésios 2") seguido de cada versículo numerado.

${professorConfigBlock}

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
    "depth": "${options.depth}",
    "imagePrompt": "Cinematic wide-angle 16:9 film still depicting the lesson theme and title. 1st-century ancient Mediterranean landscape, majestic limestone architecture, dramatic golden hour sunbeams, photorealistic, 8k --ar 16:9"
  },
  "textAureo": {
    "text": "Texto do Texto Áureo",
    "reference": "Atos 22.15",
    "imagePrompt": "Cinematic historical 16:9 biblical illustration capturing the solemn spiritual essence of the key verse, Rembrandt chiaroscuro lighting, ancient textured garments, 8k --ar 16:9"
  },
  "verdadePratica": {
    "text": "Texto da Verdade Prática",
    "imagePrompt": "Cinematic 16:9 conceptual depiction illustrating practical Christian faith in everyday life, warm natural sunlight, uplifting atmosphere, fine art photography, 8k --ar 16:9"
  },
  "palavraChave": {
    "palavra": "FIDELIDADE",
    "explicacao": "No hebraico 'emûnāh (raiz 'āman, firmeza, estabilidade) e no grego pistis/pistos (confiança, lealdade), a palavra evoca solidez inabalável. A fidelidade é a essência do caráter imutável de Deus, que permanece verdadeiro às Suas promessas mesmo diante das fraquezas humanas.",
    "imagePrompt": "Cinematic 16:9 symbolic visual representing the theological concept of FIDELIDADE, volumetric god rays, timeless ancient stone, monumental composition, 8k --ar 16:9"
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
          "projetor": "1. [Parágrafo literal, COMPLETO e integral da revista correspondente ao subtópico 1 — do início ao fim, com TODAS as frases e referências bíblicas, sem resumir nem cortar]",
          "explicacao": "A elite sacerdotal do Sinédrio aliou-se ao poder romano em Cesareia, contratando o orador Tértulo para rotular Paulo como agitador político (loimós). Diante de perseguições disfarçadas de legalidade, a Igreja não recua: o mensageiro da verdade mantém serenidade e firmeza, confiando na soberania divina que prevalece sobre qualquer tribunal humano (1Pe 4.14; Mt 5.11-12).",
          "versiculos": [
            { "reference": "1 Pedro 4.14", "text": "Se pelo nome de Cristo sois vituperados, bem-aventurados sois, porque sobre vós repousa o Espírito da glória e de Deus...", "explicacao": "Corrobora que a oposição por amor a Cristo não é derrota, mas sinal da presença do Espírito de Deus sobre a vida do crente." },
            { "reference": "Mateus 5.11-12", "text": "Bem-aventurados sois vós, quando vos injuriarem e perseguirem e, mentindo, disserem todo o mal contra vós por minha causa. Exultai e alegrai-vos, porque é grande o vosso galardão nos céus...", "explicacao": "Confirma a instrução de Cristo de perseverar com alegria mesmo diante de acusações injustas e calúnias." }
          ],
          "aplicacao": "O crente diante de calúnias no trabalho deve manter serenidade, oração e testemunho irrepreensível.",
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
          "projetor": "2. [Parágrafo literal e integral da revista correspondente ao subtópico 2 para o slide do projetor]",
          "explicacao": "[EXPLICAÇÃO DIDÁTICA DO PROFESSOR: 1 parágrafo bem estruturado ou 2 parágrafos curtos de 60 a 100 palavras. Seja objetivo e didático para a gestão do tempo de aula da EBD, unindo contexto bíblico, o sentido exegético e a aplicação espiritual conforme o Padrão de Ouro. NUNCA copie o texto do projetor.]",
          "versiculos": [
            { "reference": "Texto Bíblico 1 (ARC)", "text": "Versículo 1 na versão oficial...", "explicacao": "Breve nota bíblica de como este versículo corrobora o primeiro ponto da explicação..." },
            { "reference": "Texto Bíblico 2 (ARC)", "text": "Versículo 2 na versão oficial...", "explicacao": "Breve nota bíblica de como este versículo fundamenta a aplicação prática..." }
          ],
          "aplicacao": "Aplicação prática para a vida cristã...",
          "cuidadoDoutrinario": "🔥 Cuidado Doutrinário para a sala de aula...",
          "imagePrompt": "Cinematic 16:9 visual prompt..."
        },
        {
          "number": "3",
          "title": "Título do Subtópico 3 da Revista",
          "projetor": "3. [Parágrafo literal e integral da revista correspondente ao subtópico 3 para o slide do projetor]",
          "explicacao": "[EXPLICAÇÃO DIDÁTICA DO PROFESSOR: 1 parágrafo bem estruturado ou 2 curtos de 60 a 100 palavras. Didático, direto e límpido para não estourar o tempo da classe. NUNCA copie o texto do projetor.]",
          "versiculos": [
            { "reference": "Texto Bíblico 1 (ARC)", "text": "Versículo 1 na versão oficial...", "explicacao": "Explicação bíblica corroborativa 1..." },
            { "reference": "Texto Bíblico 2 (ARC)", "text": "Versículo 2 na versão oficial...", "explicacao": "Explicação bíblica corroborativa 2..." }
          ],
          "aplicacao": "Aplicação prática para a vida cristã...",
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
          "projetor": "1. [Parágrafo literal da revista para o subtópico 1 do Tópico II]",
          "explicacao": "[EXPLICAÇÃO DIDÁTICA DO PROFESSOR: 60 a 100 palavras objetivas e diretas para o tempo de aula. NUNCA copie o texto do projetor.]",
          "versiculos": [
            { "reference": "Texto Bíblico 1 (ARC)", "text": "Versículo 1...", "explicacao": "Explicação do versículo 1..." },
            { "reference": "Texto Bíblico 2 (ARC)", "text": "Versículo 2...", "explicacao": "Explicação do versículo 2..." }
          ],
          "aplicacao": "Aplicação prática...",
          "cuidadoDoutrinario": "Cuidado doutrinário...",
          "imagePrompt": "Cinematic 16:9 prompt..."
        },
        {
          "number": "2",
          "title": "Título do Subtópico 2 do Tópico II",
          "projetor": "2. [Parágrafo literal da revista para o subtópico 2 do Tópico II]",
          "explicacao": "[EXPLICAÇÃO DIDÁTICA DO PROFESSOR: 60 a 100 palavras objetivas e diretas para o tempo de aula. NUNCA copie o texto do projetor.]",
          "versiculos": [
            { "reference": "Texto Bíblico 1 (ARC)", "text": "Versículo 1...", "explicacao": "Explicação do versículo 1..." },
            { "reference": "Texto Bíblico 2 (ARC)", "text": "Versículo 2...", "explicacao": "Explicação do versículo 2..." }
          ],
          "aplicacao": "Aplicação...",
          "cuidadoDoutrinario": "Cuidado...",
          "imagePrompt": "Prompt..."
        },
        {
          "number": "3",
          "title": "Título do Subtópico 3 do Tópico II",
          "projetor": "3. [Parágrafo literal da revista para o subtópico 3 do Tópico II]",
          "explicacao": "[EXPLICAÇÃO DIDÁTICA DO PROFESSOR: 60 a 100 palavras objetivas e diretas para o tempo de aula. NUNCA copie o texto do projetor.]",
          "versiculos": [
            { "reference": "Texto Bíblico 1 (ARC)", "text": "Versículo 1...", "explicacao": "Explicação do versículo 1..." },
            { "reference": "Texto Bíblico 2 (ARC)", "text": "Versículo 2...", "explicacao": "Explicação do versículo 2..." }
          ],
          "aplicacao": "Aplicação...",
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
          "projetor": "1. [Parágrafo literal da revista para o subtópico 1 do Tópico III]",
          "explicacao": "[EXPLICAÇÃO DIDÁTICA DO PROFESSOR: 60 a 100 palavras objetivas e diretas para o tempo de aula. NUNCA copie o texto do projetor.]",
          "versiculos": [
            { "reference": "Texto Bíblico 1 (ARC)", "text": "Versículo 1...", "explicacao": "Explicação do versículo 1..." },
            { "reference": "Texto Bíblico 2 (ARC)", "text": "Versículo 2...", "explicacao": "Explicação do versículo 2..." }
          ],
          "aplicacao": "Aplicação...",
          "cuidadoDoutrinario": "Cuidado...",
          "imagePrompt": "Prompt..."
        },
        {
          "number": "2",
          "title": "Título do Subtópico 2 do Tópico III",
          "projetor": "2. [Parágrafo literal da revista para o subtópico 2 do Tópico III]",
          "explicacao": "[EXPLICAÇÃO DIDÁTICA DO PROFESSOR: 60 a 100 palavras objetivas e diretas para o tempo de aula. NUNCA copie o texto do projetor.]",
          "versiculos": [
            { "reference": "Texto Bíblico 1 (ARC)", "text": "Versículo 1...", "explicacao": "Explicação do versículo 1..." },
            { "reference": "Texto Bíblico 2 (ARC)", "text": "Versículo 2...", "explicacao": "Explicação do versículo 2..." }
          ],
          "aplicacao": "Aplicação...",
          "cuidadoDoutrinario": "Cuidado...",
          "imagePrompt": "Prompt..."
        },
        {
          "number": "3",
          "title": "Título do Subtópico 3 do Tópico III",
          "projetor": "3. [Parágrafo literal da revista para o subtópico 3 do Tópico III]",
          "explicacao": "[EXPLICAÇÃO DIDÁTICA DO PROFESSOR: 60 a 100 palavras objetivas e diretas para o tempo de aula. NUNCA copie o texto do projetor.]",
          "versiculos": [
            { "reference": "Texto Bíblico 1 (ARC)", "text": "Versículo 1...", "explicacao": "Explicação do versículo 1..." },
            { "reference": "Texto Bíblico 2 (ARC)", "text": "Versículo 2...", "explicacao": "Explicação do versículo 2..." }
          ],
          "aplicacao": "Aplicação...",
          "cuidadoDoutrinario": "Alerta...",
          "imagePrompt": "Cinematic 16:9 prompt..."
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
    { "item": "Absolutamente todas as referências e alusões das transcrições integradas na Explicação Linear", "status": true },
    { "item": "Mínimo de 2 a 3 Versículos de Apoio por Subtópico conectados à aplicação prática", "status": true },
    { "item": "Explicação Didática do Professor objetiva e concisa (60 a 100 palavras por subtópico)", "status": true },
    { "item": "Prompts Visuais 16:9 ultra-elaborados e cinematográficos", "status": true },
    { "item": "O Que Não Pode Ser Dito / Cuidado Doutrinário incluído", "status": true },
    { "item": "Vocabulário original no Grego/Hebraico sugerido e explicado", "status": true }
  ]
}
`;

  try {
    // Solicita com responseMimeType: "application/json" ativado e temperature 0.6 para síntese didática
    const rawResult = await callGeminiRaw(prompt, options.selectedAiModel || 'gemini-2.5-flash', true, 0.6);
    const parsedData: EBDLessonPreparation = repairAndParseTruncatedJSON(rawResult);

    // 📖 TEXTO LITERAL DA REVISTA: a IA costuma resumir/cortar o parágrafo do subtópico.
    // Substituímos o "projetor" pelo parágrafo completo extraído por código diretamente da revista.
    try {
      const literalCount = applyRevistaLiteralText(parsedData, revistaContent);
      console.log(`[Motor Preparador] Texto literal da revista aplicado em ${literalCount} subtópico(s).`);
    } catch (literalErr) {
      console.warn('[Motor Preparador] Falha ao extrair texto literal da revista, mantendo texto da IA:', literalErr);
    }

    // 🛡️ VALIDAÇÃO E AUTO-REPARO DE EXPLICAÇÕES DIDÁTICAS
    // Se a IA tiver copiado o texto do projetor para a explicação em algum subtópico,
    // garantimos a geração das explicações reais profundas a partir das transcrições!
    const problematicSubtopics: Array<{ tIdx: number; sIdx: number; topicTitle: string; subTitle: string; projetor: string }> = [];

    parsedData.topicos.forEach((t, tIdx) => {
      t.subtopicos.forEach((s, sIdx) => {
        if (isCopyOrEmptyExplanation(s.explicacao, s.projetor)) {
          problematicSubtopics.push({
            tIdx,
            sIdx,
            topicTitle: t.title,
            subTitle: s.title,
            projetor: s.projetor
          });
        }
      });
    });

    if (problematicSubtopics.length > 0) {
      console.warn(`[Motor Preparador] Detectados ${problematicSubtopics.length} subtópicos com explicação copiada do projetor ou vazia. Executando síntese didática a partir das transcrições...`);
      try {
        const maxPerSource = Math.floor(25000 / Math.max(1, transcriptions.length));
        const balancedTranscriptionsText = transcriptions
          .map((t, idx) => `=== TRANSCRIÇÃO ${idx + 1}: ${t.title || `Fonte ${idx + 1}`} ===\n${(t.content || '').substring(0, maxPerSource)}`)
          .join('\n\n');

        const repairPrompt = `Você é um Doutor em Teologia e Pedagogia especialista na Escola Bíblica Dominical (EBD).
O professor precisa da EXPLICAÇÃO DIDÁTICA DO PROFESSOR (o que o professor vai falar para dar a aula) para ${problematicSubtopics.length} subtópico(s) da lição "${parsedData.metadata.title}".

${problematicSubtopics.map((p, idx) => `
--- SUBTÓPICO ${idx + 1} ---
Tópico: ${p.topicTitle}
Subtópico: ${p.subTitle}
Texto do slide do projetor (parágrafo da revista): "${p.projetor}"
`).join('\n')}

TRANSCRIÇÕES DE APOIO DOS PASTORES/ESTUDOS:
${balancedTranscriptionsText}

REGRAS MANDATÓRIAS INEGOCIÁVEIS:
1. 🛑 NUNCA COPIE OU REPITA O TEXTO DO PROJETOR! O projetor é o parágrafo da revista que fica na tela para os alunos.
2. Para CADA subtópico, gere uma EXPLICAÇÃO DIDÁTICA DO PROFESSOR OBJETIVA, LÍMPIDA e PEDAGÓGICA (1 parágrafo bem estruturado de 60 a 100 palavras) para respeitar o tempo de aula da EBD (45 a 60 min total).
   Padrão modelo: "Moisés apresenta três etapas da vida espiritual: ouvir, aprender e praticar. Ouvir (shema) é atender à Palavra com disposição para obedecer; aprender (lamad) é internalizar o ensino divino; e guardar (shamar) é colocá-lo em prática. Diferentemente da geração que falhou em obedecer, o cristão deve ser praticante da Palavra, e não apenas ouvinte (Tg 1.22-25)."
3. Integre a essência teológica das transcrições, a raiz no hebraico/grego se houver e a lição espiritual sem divagações prolixas.
4. Responda em JSON puro neste formato exato:
{
  "explicacoes": [
    {
      "index": 0,
      "explicacao": "Texto objetivo, didático e límpido da aula do professor..."
    }
  ]
}
`;
        const repairResult = await callGeminiRaw(repairPrompt, options.selectedAiModel || 'gemini-2.5-flash', true, 0.6);
        const parsedRepair = JSON.parse(repairResult.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim());
        if (Array.isArray(parsedRepair.explicacoes)) {
          parsedRepair.explicacoes.forEach((item: any) => {
            const prob = problematicSubtopics[item.index];
            if (prob && item.explicacao && item.explicacao.trim().length > 30) {
              parsedData.topicos[prob.tIdx].subtopicos[prob.sIdx].explicacao = item.explicacao.trim();
              console.log(`[Motor Preparador] Explicação do subtópico "${prob.subTitle}" reparada e gerada com sucesso!`);
            }
          });
        }
      } catch (repairErr) {
        console.warn('[Motor Preparador] Falha no auto-reparo de explicações, mantendo fallback:', repairErr);
      }
    }

    parsedData.revistaRawContent = revistaContent;
    return parsedData;
  } catch (err: any) {
    console.error('Erro ao processar lição no Motor Preparador:', err);
    throw new Error(`Falha no processamento do Motor Inteligente: ${err.message || 'Erro de formato na resposta da IA.'}`);
  }
}
