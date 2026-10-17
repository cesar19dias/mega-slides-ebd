import React, { useState } from 'react';
import {
  FileText,
  Printer,
  Copy,
  Check,
  Sparkles,
  Bookmark,
  Link2,
  BookOpen,
  Trash2,
  Plus,
  Monitor,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import type { EBDLessonPreparation } from '../types';
import { generateAllLessonPromptsWithAi, formatAllPromptsForExport } from '../services/promptGeneratorService';

export interface EditableTextProps {
  value: string;
  onChange: (val: string) => void;
  isEditMode: boolean;
  multiline?: boolean;
  className?: string;
  placeholder?: string;
  label?: string;
}

export const EditableText: React.FC<EditableTextProps> = ({
  value,
  onChange,
  isEditMode,
  multiline = false,
  className = '',
  placeholder = 'Clique para editar...',
  label,
}) => {
  if (!isEditMode) {
    return <span className={className}>{value || placeholder}</span>;
  }

  return (
    <div className="w-full space-y-1 my-1">
      {label && <label className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block">{label}</label>}
      {multiline ? (
        <textarea
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={Math.max(2, (value || '').split('\n').length)}
          className={`w-full bg-slate-950/90 border-2 border-amber-500/60 focus:border-amber-400 text-white rounded-xl p-3 text-sm outline-none transition-all resize-y ${className}`}
        />
      ) : (
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full bg-slate-950/90 border-2 border-amber-500/60 focus:border-amber-400 text-white rounded-xl px-3 py-2 text-sm outline-none transition-all ${className}`}
        />
      )}
    </div>
  );
};

export interface TeacherPreparationViewProps {
  lesson: EBDLessonPreparation;
  updateLesson: (updater: (prev: EBDLessonPreparation) => EBDLessonPreparation) => void;
  isEditMode: boolean;
  setIsEditMode?: (val: boolean) => void;
  handleRegenerateSection: (
    targetType: 'explicacao' | 'aplicacao' | 'projetor',
    topicIdx: number,
    subIdx: number,
    ideiaIdx?: number
  ) => Promise<void>;
  regeneratingId: string | null;
}

export const TeacherPreparationView: React.FC<TeacherPreparationViewProps> = ({
  lesson,
  updateLesson,
  isEditMode,
  setIsEditMode: _setIsEditMode,
  handleRegenerateSection,
  regeneratingId,
}) => {
  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>({});
  const [copiedToast, setCopiedToast] = useState<string | null>(null);
  const [isGeneratingAllPrompts, setIsGeneratingAllPrompts] = useState<boolean>(false);

  const toggleTopicExpand = (topicNumber: string) => {
    setExpandedTopics((prev) => ({
      ...prev,
      [topicNumber]: !prev[topicNumber]
    }));
  };

  const updateMetadata = (field: keyof EBDLessonPreparation['metadata'], val: any) => {
    updateLesson(prev => ({
      ...prev,
      metadata: { ...prev.metadata, [field]: val }
    }));
  };

  const updateTextAureo = (field: keyof EBDLessonPreparation['textAureo'], val: string) => {
    updateLesson(prev => ({
      ...prev,
      textAureo: { ...prev.textAureo, [field]: val }
    }));
  };

  const updateVerdadePratica = (val: string) => {
    updateLesson(prev => ({
      ...prev,
      verdadePratica: { ...prev.verdadePratica, text: val }
    }));
  };

  const updateVerdadePraticaPrompt = (val: string) => {
    updateLesson(prev => ({
      ...prev,
      verdadePratica: { ...prev.verdadePratica, imagePrompt: val }
    }));
  };

  const updatePalavraChave = (field: 'palavra' | 'explicacao' | 'imagePrompt', val: string) => {
    updateLesson(prev => ({
      ...prev,
      palavraChave: {
        palavra: prev.palavraChave?.palavra || '',
        explicacao: prev.palavraChave?.explicacao || '',
        imagePrompt: prev.palavraChave?.imagePrompt || '',
        [field]: val
      }
    }));
  };

  const updatePonteContextualField = (field: string, val: string) => {
    updateLesson(prev => {
      const pc = {
        ...prev.introducao?.ponteContextual,
        enabled: true,
        [field]: val
      };
      if (field === 'naLicaoAnterior') pc.ondeParou = val;
      if (field === 'ondeParou') pc.naLicaoAnterior = val;
      if (field === 'ponteContextual') pc.capitulosIntermediarios = val;
      if (field === 'capitulosIntermediarios') pc.ponteContextual = val;
      return {
        ...prev,
        introducao: {
          ...prev.introducao,
          ponteContextual: pc
        }
      };
    });
  };

  const updateTopicTitle = (topicIdx: number, val: string) => {
    updateLesson(prev => {
      const topicos = [...prev.topicos];
      topicos[topicIdx] = { ...topicos[topicIdx], title: val };
      return { ...prev, topicos };
    });
  };

  const updateTopicPrompt = (topicIdx: number, val: string) => {
    updateLesson(prev => {
      const topicos = [...prev.topicos];
      topicos[topicIdx] = { ...topicos[topicIdx], imagePrompt: val };
      return { ...prev, topicos };
    });
  };

  const updateTopicSinopse = (topicIdx: number, val: string) => {
    updateLesson(prev => {
      const topicos = [...prev.topicos];
      topicos[topicIdx] = { ...topicos[topicIdx], sinopse: val };
      return { ...prev, topicos };
    });
  };

  const addTopicFraseEnfase = (topicIdx: number) => {
    updateLesson(prev => {
      const topicos = [...prev.topicos];
      const frases = [...(topicos[topicIdx].frasesEnfase || []), 'Nova frase para ênfase na aula'];
      topicos[topicIdx] = { ...topicos[topicIdx], frasesEnfase: frases };
      return { ...prev, topicos };
    });
  };

  const updateTopicFraseEnfase = (topicIdx: number, fIdx: number, val: string) => {
    updateLesson(prev => {
      const topicos = [...prev.topicos];
      const frases = [...(topicos[topicIdx].frasesEnfase || [])];
      frases[fIdx] = val;
      topicos[topicIdx] = { ...topicos[topicIdx], frasesEnfase: frases };
      return { ...prev, topicos };
    });
  };

  const removeTopicFraseEnfase = (topicIdx: number, fIdx: number) => {
    updateLesson(prev => {
      const topicos = [...prev.topicos];
      const frases = (topicos[topicIdx].frasesEnfase || []).filter((_, idx) => idx !== fIdx);
      topicos[topicIdx] = { ...topicos[topicIdx], frasesEnfase: frases };
      return { ...prev, topicos };
    });
  };

  const removeTopic = (topicIdx: number) => {
    updateLesson(prev => ({
      ...prev,
      topicos: prev.topicos.filter((_, idx) => idx !== topicIdx)
    }));
  };

  const updateSubtopicField = (topicIdx: number, subIdx: number, field: string, val: any) => {
    updateLesson(prev => {
      const topicos = [...prev.topicos];
      const subList = [...topicos[topicIdx].subtopicos];
      const updatedSub = { ...subList[subIdx], [field]: val };
      if (field === 'explicacao' || field === 'projetor') {
        delete updatedSub.frasesExplicativas;
      }
      subList[subIdx] = updatedSub;
      topicos[topicIdx] = { ...topicos[topicIdx], subtopicos: subList };
      return { ...prev, topicos };
    });
  };

  const removeSubtopicFromTopic = (topicIdx: number, subIdx: number) => {
    updateLesson(prev => {
      const topicos = [...prev.topicos];
      const subList = topicos[topicIdx].subtopicos.filter((_, idx) => idx !== subIdx);
      topicos[topicIdx] = { ...topicos[topicIdx], subtopicos: subList };
      return { ...prev, topicos };
    });
  };

  const addVersiculoSubtopic = (topicIdx: number, subIdx: number) => {
    updateLesson(prev => {
      const topicos = prev.topicos.map((top, tIdx) => {
        if (tIdx !== topicIdx) return top;
        const subtopicos = top.subtopicos.map((sub, sIdx) => {
          if (sIdx !== subIdx) return sub;
          return {
            ...sub,
            versiculos: [
              ...(sub.versiculos || []),
              { reference: 'Referência Bíblica (ex: João 3.16)', text: 'Texto do versículo...', explicacao: 'Breve explicação didática do versículo...' }
            ]
          };
        });
        return { ...top, subtopicos };
      });
      return { ...prev, topicos };
    });
  };

  const updateVersiculoSubtopic = (topicIdx: number, subIdx: number, vIdx: number, field: 'reference' | 'text' | 'explicacao', val: string) => {
    updateLesson(prev => {
      const topicos = prev.topicos.map((top, tIdx) => {
        if (tIdx !== topicIdx) return top;
        const subtopicos = top.subtopicos.map((sub, sIdx) => {
          if (sIdx !== subIdx) return sub;
          const versiculos = [...(sub.versiculos || [])];
          versiculos[vIdx] = { ...versiculos[vIdx], [field]: val };
          return { ...sub, versiculos };
        });
        return { ...top, subtopicos };
      });
      return { ...prev, topicos };
    });
  };

  const removeVersiculoSubtopic = (topicIdx: number, subIdx: number, vIdx: number) => {
    updateLesson(prev => {
      const topicos = prev.topicos.map((top, tIdx) => {
        if (tIdx !== topicIdx) return top;
        const subtopicos = top.subtopicos.map((sub, sIdx) => {
          if (sIdx !== subIdx) return sub;
          return {
            ...sub,
            versiculos: (sub.versiculos || []).filter((_, idx) => idx !== vIdx)
          };
        });
        return { ...top, subtopicos };
      });
      return { ...prev, topicos };
    });
  };

  const updateConclusaoField = (field: keyof EBDLessonPreparation['conclusao'], val: any) => {
    updateLesson(prev => ({
      ...prev,
      conclusao: { ...prev.conclusao, [field]: val }
    }));
  };

  const generateTeacherTextContent = (data: EBDLessonPreparation): string => {
    let text = `========================================================================\n`;
    text += `ROTEIRO COMPLETO DO PROFESSOR - EBD NA ÍNTEGRA\n`;
    text += `${data.metadata.lessonNumber || 'LIÇÃO EBD'} - ${data.metadata.title}\n`;
    text += `Tema do Trimestre: ${data.metadata.themeTopic}\n`;
    text += `========================================================================\n\n`;

    if (data.metadata.imagePrompt) {
      text += `🖼️ PROMPT VISUAL (CAPA / TÍTULO DA LIÇÃO - 16:9):\n${data.metadata.imagePrompt}\n\n`;
    }

    text += `1. TEXTO ÁUREO\n`;
    text += `"${data.textAureo.text}" (${data.textAureo.reference})\n\n`;
    if (data.textAureo.imagePrompt) {
      text += `🖼️ PROMPT VISUAL (TEXTO ÁUREO - 16:9):\n${data.textAureo.imagePrompt}\n\n`;
    }

    text += `2. VERDADE PRÁTICA\n`;
    text += `"${data.verdadePratica.text}"\n\n`;
    if (data.verdadePratica.imagePrompt) {
      text += `🖼️ PROMPT VISUAL (VERDADE PRÁTICA - 16:9):\n${data.verdadePratica.imagePrompt}\n\n`;
    }

    if (data.palavraChave?.palavra) {
      text += `🔑 PALAVRA-CHAVE DA LIÇÃO: ${data.palavraChave.palavra.toUpperCase()}\n`;
      if (data.palavraChave.explicacao) {
        text += `💡 Explicação Didática & Teológica:\n${data.palavraChave.explicacao}\n`;
      }
      if (data.palavraChave.imagePrompt) {
        text += `🖼️ PROMPT VISUAL (PALAVRA-CHAVE - 16:9):\n${data.palavraChave.imagePrompt}\n`;
      }
      text += `\n`;
    }

    if (data.introducao?.ponteContextual?.enabled) {
      const bridge = data.introducao.ponteContextual;
      const licaoAnt = bridge.naLicaoAnterior || bridge.ondeParou;
      const interv = bridge.ponteContextual || bridge.capitulosIntermediarios;
      text += `--- PONTE CONTEXTUAL & TRANSIÇÃO BÍBLICA ---\n`;
      if (licaoAnt) text += `📌 Na lição anterior: ${licaoAnt}\n`;
      if (interv) text += `📜 O que aconteceu no intervalo: ${interv}\n`;
      if (bridge.ganchoAulaAtual) text += `👉 Transição para hoje: ${bridge.ganchoAulaAtual}\n`;
      if (bridge.projetor) text += `🖥️ Síntese no Projetor: "${bridge.projetor}"\n`;
      text += `\n`;
    }

    if (data.biblicalText) {
      text += `3. LEITURA BÍBLICA EM CLASSE\n`;
      text += `${data.biblicalText}\n\n`;
    }

    text += `========================================================================\n`;
    text += `CHECKLIST DE FIDELIDADE DAS FONTES EBD\n`;
    text += `========================================================================\n`;
    data.checklist.forEach((c) => {
      text += `[✓] ${c.item}\n`;
    });
    text += `\n`;

    text += `========================================================================\n`;
    text += `DESENVOLVIMENTO DIDÁTICO DOS TÓPICOS (I, II, III)\n`;
    text += `========================================================================\n\n`;

    data.topicos.forEach((topico) => {
      text += `------------------------------------------------------------------------\n`;
      text += `TÓPICO ${topico.number}: ${topico.title.toUpperCase()}\n`;
      text += `------------------------------------------------------------------------\n`;
      text += `📌 Sinopse: ${topico.sinopse}\n`;
      if (topico.frasesEnfase && topico.frasesEnfase.length > 0) {
        text += `🗣️ Frases de Ênfase para a Aula:\n`;
        topico.frasesEnfase.forEach((f) => {
          text += `  • "${f}"\n`;
        });
      }
      if (topico.imagePrompt) {
        text += `🖼️ PROMPT VISUAL DO TÓPICO (16:9):\n${topico.imagePrompt}\n`;
      }
      text += `\n`;

      topico.subtopicos.forEach((sub) => {
        text += `--- Subtópico ${sub.number}: ${sub.title} ---\n\n`;

        if (sub.projetor) {
          text += `🖥️ Texto Oficial do Projetor (Revista):\n"${sub.projetor}"\n\n`;
        }

        if (sub.explicacao) {
          text += `💡 Explicação Didática do Professor:\n${sub.explicacao}\n\n`;
        } else if (sub.frasesExplicativas && sub.frasesExplicativas.length > 0) {
          text += `💡 Explicação Didática do Professor:\n`;
          sub.frasesExplicativas.forEach((f) => {
            if (f.frase) text += `"${f.frase}" — `;
            text += `${f.explicacao}\n`;
          });
          text += `\n`;
        }

        if (sub.versiculos && sub.versiculos.length > 0) {
          text += `📖 Textos Bíblicos de Apoio:\n`;
          sub.versiculos.forEach((v) => {
            text += `  • ${v.reference}: "${v.text}"\n`;
            if (v.explicacao) text += `    💡 ${v.explicacao}\n`;
          });
          text += `\n`;
        }

        if (sub.aplicacao) {
          text += `🔥 Aplicação Prática & Pentecostal:\n${sub.aplicacao}\n\n`;
        }

        if (sub.cuidadoDoutrinario) {
          text += `⚠️ Cuidado Doutrinário / O Que Não Dizer:\n${sub.cuidadoDoutrinario}\n\n`;
        }

        if (sub.palavrasOriginais && sub.palavrasOriginais.length > 0) {
          text += `🏛️ Exegese Bíblica no Original:\n`;
          sub.palavrasOriginais.forEach((p) => {
            text += `  • ${p.termo} (${p.transliteracao}) [${p.idioma}]: ${p.significado} - ${p.explicacao}\n`;
          });
          text += `\n`;
        }

        if (sub.imagePrompt) {
          text += `🖼️ Prompt Visual (16:9):\n${sub.imagePrompt}\n\n`;
        }
      });
    });

    if (data.perguntasFixacao && data.perguntasFixacao.length > 0) {
      text += `========================================================================\n`;
      text += `PERGUNTAS DE FIXAÇÃO E DEBATE EM CLASSE\n`;
      text += `========================================================================\n`;
      data.perguntasFixacao.forEach((p, idx) => {
        text += `${idx + 1}. ${p.pergunta}\n`;
        if (p.respostaEsperada) text += `   👉 Resposta Sugerida: ${p.respostaEsperada}\n`;
      });
      text += `\n`;
    }

    if (data.conclusao) {
      text += `========================================================================\n`;
      text += `CONCLUSÃO & APLICAÇÃO FINAL\n`;
      text += `========================================================================\n`;
      if (data.conclusao.takeaway) text += `🎯 Mensagem Central: ${data.conclusao.takeaway}\n\n`;
      if (data.conclusao.bulletPoints && data.conclusao.bulletPoints.length > 0) {
        text += `📌 Pontos Principais:\n`;
        data.conclusao.bulletPoints.forEach(b => { text += `  • ${b}\n`; });
        text += `\n`;
      }
      if (data.conclusao.finalPrayer) text += `🙏 Oração Final: ${data.conclusao.finalPrayer}\n\n`;
    }

    return text;
  };

  const handlePrintTeacherGuide = () => {
    const allExpanded: Record<string, boolean> = {};
    lesson.topicos.forEach((t) => {
      allExpanded[t.number] = true;
    });
    setExpandedTopics(allExpanded);

    setTimeout(() => {
      window.print();
    }, 200);
  };

  const handleCopyTeacherGuide = () => {
    const textContent = generateTeacherTextContent(lesson);
    navigator.clipboard.writeText(textContent);
    setCopiedToast('full');
    setTimeout(() => setCopiedToast(null), 3000);
  };

  const handleCopyAllPrompts = () => {
    const text = formatAllPromptsForExport(lesson);
    navigator.clipboard.writeText(text);
    alert('📋 Todos os prompts visuais 16:9 foram copiados com sucesso!\nCole no Canva, Midjourney, DALL-E 3 ou Bing Image Creator.');
  };

  const handleGenerateAllPrompts = async () => {
    setIsGeneratingAllPrompts(true);
    try {
      const updated = await generateAllLessonPromptsWithAi(lesson);
      updateLesson(() => updated);
      alert('✨ Prompts visuais 16:9 gerados com sucesso para o Título da Lição, Texto Áureo, Verdade Prática, Palavra-Chave, Tópicos e Subtópicos!');
    } catch (err: any) {
      alert('Aviso: ' + (err.message || 'Erro ao gerar prompts com IA.'));
    } finally {
      setIsGeneratingAllPrompts(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Preparação e Fontes Utilizadas */}
      <div className="bg-slate-900/80 border border-slate-700/80 p-6 rounded-3xl shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/60 pb-4">
          <div className="flex-1">
            <span className="text-xs font-black text-amber-400 uppercase tracking-widest block mb-1">
              <EditableText
                value={lesson.metadata.lessonNumber || 'Escola Bíblica Dominical'}
                onChange={v => updateMetadata('lessonNumber', v)}
                isEditMode={isEditMode}
                placeholder="Número da Lição (ex: LIÇÃO 11)"
              />
            </span>
            <h1 className="text-2xl md:text-4xl font-black text-white font-['Montserrat']">
              <EditableText
                value={lesson.metadata.title}
                onChange={v => updateMetadata('title', v)}
                isEditMode={isEditMode}
                placeholder="Título da Lição"
              />
            </h1>
            <p className="text-xs md:text-sm text-slate-300 mt-1 font-semibold flex items-center gap-1">
              <span>Tema:</span>
              <EditableText
                value={lesson.metadata.themeTopic}
                onChange={v => updateMetadata('themeTopic', v)}
                isEditMode={isEditMode}
                placeholder="Tema do Trimestre"
              />
            </p>

            {/* 🖼️ PROMPT VISUAL 16:9 DA CAPA / TÍTULO DA LIÇÃO */}
            {(lesson.metadata.imagePrompt || isEditMode) && (
              <div className="mt-3 bg-slate-950/90 p-3.5 rounded-2xl border border-slate-800 space-y-1.5 no-print">
                <div className="flex items-center justify-between text-cyan-400 font-extrabold text-[11px] uppercase">
                  <span className="flex items-center gap-1.5">
                    <span>🖼️ PROMPT VISUAL 16:9 (CAPA / CANVA / MIDJOURNEY)</span>
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(lesson.metadata.imagePrompt || '');
                      alert('Prompt da Capa copiado para a área de transferência!');
                    }}
                    className="text-slate-400 hover:text-cyan-300 text-[10px] bg-slate-800 px-2 py-0.5 rounded cursor-pointer transition-colors"
                  >
                    📋 Copiar Prompt
                  </button>
                </div>
                <EditableText
                  value={lesson.metadata.imagePrompt || ''}
                  onChange={v => updateMetadata('imagePrompt', v)}
                  isEditMode={isEditMode}
                  multiline
                  placeholder="Prompt visual 16:9 cinematográfico para o Título da Lição e Capa dos Slides..."
                  className="text-[11px] text-slate-300 font-mono italic bg-slate-900/90 p-2.5 rounded-lg border border-slate-800/80 block w-full"
                />
              </div>
            )}
          </div>

          {/* Status das Transcrições Cruzadas */}
          <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-right space-y-1">
            <span className="text-[11px] text-emerald-400 font-extrabold block">
              ✓ {lesson.sourcesSummary.transcriptionsCount} Transcrições Cruzadas
            </span>
            <div className="text-[10px] text-slate-400 truncate max-w-xs">
              Fontes: {lesson.sourcesSummary.sourcesUsed.join(', ')}
            </div>
          </div>
        </div>

        {/* BARRA DE EXPORTAÇÃO RÁPIDA DA PARTE DO PROFESSOR */}
        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800/90 flex flex-wrap items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-amber-400" />
            <div>
              <span className="text-xs font-extrabold text-white block">
                Roteiro do Professor na Íntegra
              </span>
              <span className="text-[11px] text-slate-400 font-medium">
                Baixe em PDF, arquivo de texto ou copie todo o conteúdo didático e teológico.
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handlePrintTeacherGuide}
              title="Imprimir roteiro da lição ou abrir janela de impressão do navegador"
              className="bg-amber-500 hover:bg-amber-600 text-slate-950 px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>🖨️ Imprimir Roteiro</span>
            </button>

            <button
              onClick={handleCopyAllPrompts}
              title="Copiar todos os prompts visuais 16:9 da lição (Canva / Midjourney / DALL-E)"
              className="bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/50 px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
            >
              <Copy className="w-4 h-4 text-purple-300" />
              <span>📋 Copiar Todos os Prompts</span>
            </button>

            <button
              onClick={handleGenerateAllPrompts}
              disabled={isGeneratingAllPrompts}
              title="Gerar ou regenerar todos os prompts visuais da lição com IA"
              className="bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-200 border border-cyan-500/50 px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-md cursor-pointer disabled:opacity-50"
            >
              <Sparkles className={`w-4 h-4 text-cyan-300 ${isGeneratingAllPrompts ? 'animate-spin' : ''}`} />
              <span>{isGeneratingAllPrompts ? 'Gerando Prompts...' : '✨ Gerar Prompts com IA'}</span>
            </button>

            <button
              onClick={handleCopyTeacherGuide}
              title="Copiar Roteiro Completo com Prompts e Fontes"
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer"
            >
              {copiedToast === 'full' ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400">Copiado Completo!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-slate-400" />
                  <span>Copiar Completo</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Transição entre Lições (Se ativada ou com conteúdo - PRIMEIROS CARDS) */}
        {(isEditMode ||
          lesson.introducao?.ponteContextual?.enabled ||
          lesson.introducao?.ponteContextual?.naLicaoAnterior ||
          lesson.introducao?.ponteContextual?.ondeParou ||
          lesson.introducao?.ponteContextual?.ponteContextual ||
          lesson.introducao?.ponteContextual?.capitulosIntermediarios) && (
          <div className="space-y-4 pt-2">
            {/* CARD 1: NA LIÇÃO ANTERIOR */}
            {(isEditMode || lesson.introducao?.ponteContextual?.naLicaoAnterior || lesson.introducao?.ponteContextual?.ondeParou) && (
              <div className="bg-gradient-to-r from-amber-950/80 via-slate-900 to-amber-950/60 border-2 border-amber-500/40 p-5 rounded-2xl shadow-xl space-y-2">
                <div className="flex items-center gap-2 text-amber-400 font-extrabold text-sm md:text-base border-b border-amber-500/20 pb-2">
                  <Bookmark className="w-5 h-5 text-amber-400" />
                  <span>NA LIÇÃO ANTERIOR</span>
                </div>
                <EditableText
                  value={lesson.introducao?.ponteContextual?.naLicaoAnterior || lesson.introducao?.ponteContextual?.ondeParou || ''}
                  onChange={v => updatePonteContextualField('naLicaoAnterior', v)}
                  isEditMode={isEditMode}
                  multiline
                  placeholder="Resumo bem breve do que aconteceu na lição anterior..."
                  className="text-sm md:text-base font-extrabold text-white leading-relaxed"
                />
              </div>
            )}

            {/* CARD 2: INTERVALO BÍBLICO */}
            {(isEditMode || lesson.introducao?.ponteContextual?.ponteContextual || lesson.introducao?.ponteContextual?.capitulosIntermediarios) && (
              <div className="bg-gradient-to-r from-emerald-950/80 via-slate-900 to-teal-950/80 border-2 border-emerald-500/40 p-5 rounded-2xl shadow-xl space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 font-extrabold text-sm md:text-base border-b border-emerald-500/20 pb-2">
                  <Link2 className="w-5 h-5 text-emerald-400" />
                  <span>INTERVALO BÍBLICO</span>
                </div>
                <EditableText
                  value={lesson.introducao?.ponteContextual?.ponteContextual || lesson.introducao?.ponteContextual?.capitulosIntermediarios || ''}
                  onChange={v => updatePonteContextualField('ponteContextual', v)}
                  isEditMode={isEditMode}
                  multiline
                  placeholder="Capítulos intermediários ou contexto bíblico de transição..."
                  className="text-sm md:text-base font-extrabold text-white leading-relaxed"
                />
              </div>
            )}
          </div>
        )}

        {/* Texto Áureo & Verdade Prática */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Texto Áureo */}
          <div className="bg-[#091b2c] border-2 border-[#cbd5e1] p-5 rounded-2xl shadow-lg space-y-3">
            <span className="text-xs font-black text-amber-300 uppercase tracking-wider block">
              TEXTO ÁUREO
            </span>
            <div className="space-y-2">
              <EditableText
                value={lesson.textAureo.text}
                onChange={v => updateTextAureo('text', v)}
                isEditMode={isEditMode}
                multiline
                placeholder="Texto bíblico áureo..."
                className="text-sm md:text-base font-extrabold text-white leading-relaxed"
              />
              <EditableText
                value={lesson.textAureo.reference}
                onChange={v => updateTextAureo('reference', v)}
                isEditMode={isEditMode}
                placeholder="Referência (ex: Salmos 119.105)"
                label={isEditMode ? 'Referência Bíblica' : undefined}
                className="text-xs text-amber-300 font-bold"
              />
            </div>

            {/* 🖼️ Prompt Visual 16:9 do Texto Áureo */}
            {(lesson.textAureo.imagePrompt || isEditMode) && (
              <div className="bg-slate-950/90 p-3 rounded-xl border border-slate-800 space-y-1.5 no-print">
                <div className="flex items-center justify-between text-cyan-400 font-extrabold text-[11px] uppercase">
                  <span className="flex items-center gap-1.5">
                    <span>🖼️ PROMPT VISUAL 16:9 (TEXTO ÁUREO)</span>
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(lesson.textAureo.imagePrompt || '');
                      alert('Prompt do Texto Áureo copiado!');
                    }}
                    className="text-slate-400 hover:text-cyan-300 text-[10px] bg-slate-800 px-2 py-0.5 rounded cursor-pointer transition-colors"
                  >
                    📋 Copiar Prompt
                  </button>
                </div>
                <EditableText
                  value={lesson.textAureo.imagePrompt || ''}
                  onChange={v => updateTextAureo('imagePrompt', v)}
                  isEditMode={isEditMode}
                  multiline
                  placeholder="Prompt visual 16:9 cinematográfico para o Texto Áureo..."
                  className="text-[11px] text-slate-300 font-mono italic bg-slate-900/90 p-2.5 rounded-lg border border-slate-800/80 block w-full"
                />
              </div>
            )}
          </div>

          {/* Verdade Prática */}
          <div className="bg-[#091b2c] border-2 border-[#cbd5e1] p-5 rounded-2xl shadow-lg space-y-3">
            <span className="text-xs font-black text-amber-300 uppercase tracking-wider block">
              VERDADE PRÁTICA
            </span>
            <EditableText
              value={lesson.verdadePratica.text}
              onChange={v => updateVerdadePratica(v)}
              isEditMode={isEditMode}
              multiline
              placeholder="Verdade Prática da lição..."
              className="text-sm md:text-base font-extrabold text-white leading-relaxed"
            />

            {/* 🖼️ Prompt Visual 16:9 da Verdade Prática */}
            {(lesson.verdadePratica.imagePrompt || isEditMode) && (
              <div className="bg-slate-950/90 p-3 rounded-xl border border-slate-800 space-y-1.5 no-print">
                <div className="flex items-center justify-between text-cyan-400 font-extrabold text-[11px] uppercase">
                  <span className="flex items-center gap-1.5">
                    <span>🖼️ PROMPT VISUAL 16:9 (VERDADE PRÁTICA)</span>
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(lesson.verdadePratica.imagePrompt || '');
                      alert('Prompt da Verdade Prática copiado!');
                    }}
                    className="text-slate-400 hover:text-cyan-300 text-[10px] bg-slate-800 px-2 py-0.5 rounded cursor-pointer transition-colors"
                  >
                    📋 Copiar Prompt
                  </button>
                </div>
                <EditableText
                  value={lesson.verdadePratica.imagePrompt || ''}
                  onChange={v => updateVerdadePraticaPrompt(v)}
                  isEditMode={isEditMode}
                  multiline
                  placeholder="Prompt visual 16:9 cinematográfico para a Verdade Prática..."
                  className="text-[11px] text-slate-300 font-mono italic bg-slate-900/90 p-2.5 rounded-lg border border-slate-800/80 block w-full"
                />
              </div>
            )}
          </div>
        </div>

        {/* Palavra-Chave da Lição com Explicação */}
        {(lesson.palavraChave || isEditMode) && (
          <div className="bg-[#091b2c] border-2 border-amber-500/40 p-5 rounded-2xl shadow-lg space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                🔑 PALAVRA-CHAVE DA LIÇÃO
              </span>
              {isEditMode && !lesson.palavraChave && (
                <button
                  onClick={() => updatePalavraChave('palavra', 'NOVA PALAVRA')}
                  className="text-xs bg-amber-600/30 text-amber-300 border border-amber-500/50 px-2.5 py-1 rounded-lg hover:bg-amber-600/50 font-bold cursor-pointer"
                >
                  + Adicionar Palavra-Chave
                </button>
              )}
            </div>
            <div className="space-y-2">
              <EditableText
                value={lesson.palavraChave?.palavra || ''}
                onChange={v => updatePalavraChave('palavra', v.toUpperCase())}
                isEditMode={isEditMode}
                placeholder="Palavra-Chave (ex: AUTORIA, INSPIRAÇÃO, REVELAÇÃO)"
                label={isEditMode ? 'Palavra-Chave' : undefined}
                className="text-lg md:text-xl font-black text-amber-400 tracking-wider uppercase"
              />
              <EditableText
                value={lesson.palavraChave?.explicacao || ''}
                onChange={v => updatePalavraChave('explicacao', v)}
                isEditMode={isEditMode}
                multiline
                placeholder="Explicação teológica e didática da Palavra-Chave para a aula..."
                label={isEditMode ? 'Explicação Didática / Teológica' : undefined}
                className="text-sm md:text-base font-medium text-slate-200 leading-relaxed"
              />
            </div>

            {/* 🖼️ Prompt Visual 16:9 da Palavra-Chave */}
            {(lesson.palavraChave?.imagePrompt || isEditMode) && (
              <div className="bg-slate-950/90 p-3 rounded-xl border border-slate-800 space-y-1.5 no-print">
                <div className="flex items-center justify-between text-cyan-400 font-extrabold text-[11px] uppercase">
                  <span className="flex items-center gap-1.5">
                    <span>🖼️ PROMPT VISUAL 16:9 (PALAVRA-CHAVE)</span>
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(lesson.palavraChave?.imagePrompt || '');
                      alert('Prompt da Palavra-Chave copiado!');
                    }}
                    className="text-slate-400 hover:text-cyan-300 text-[10px] bg-slate-800 px-2 py-0.5 rounded cursor-pointer transition-colors"
                  >
                    📋 Copiar Prompt
                  </button>
                </div>
                <EditableText
                  value={lesson.palavraChave?.imagePrompt || ''}
                  onChange={v => updatePalavraChave('imagePrompt', v)}
                  isEditMode={isEditMode}
                  multiline
                  placeholder="Prompt visual 16:9 cinematográfico para a Palavra-Chave..."
                  className="text-[11px] text-slate-300 font-mono italic bg-slate-900/90 p-2.5 rounded-lg border border-slate-800/80 block w-full"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* CHECKLIST DE FIDELIDADE DAS FONTES */}
      <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs no-print">
        <span className="font-extrabold text-slate-300 flex items-center gap-1.5">
          <Check className="w-4 h-4 text-emerald-400" />
          Checklist de Fidelidade EBD:
        </span>
        <div className="flex flex-wrap items-center gap-3">
          {lesson.checklist.map((c, i) => (
            <span key={i} className="bg-slate-950 px-2.5 py-1 rounded-lg text-slate-300 border border-slate-800 flex items-center gap-1">
              <span className="text-emerald-400 font-bold">✓</span> {c.item}
            </span>
          ))}
        </div>
      </div>

      {/* DESENVOLVIMENTO DOS TÓPICOS I, II, III */}
      {lesson.topicos.map((topico, topicIdx) => (
        <div key={topico.number || topicIdx} className="bg-slate-900/90 border border-slate-700/90 rounded-3xl overflow-hidden shadow-2xl space-y-4 p-6">
          {/* Cabeçalho do Tópico com Botão Recolher/Expandir */}
          <div
            onClick={() => toggleTopicExpand(topico.number)}
            className="flex items-center justify-between cursor-pointer border-b border-slate-700/80 pb-4 group"
          >
            <div className="flex items-center gap-3 flex-1">
              <div className="w-10 h-10 rounded-xl bg-orange-600 text-white font-black text-lg flex items-center justify-center shadow-lg shrink-0">
                {topico.number}
              </div>
              <div className="flex-1">
                <h2 className="text-xl md:text-2xl font-black text-white group-hover:text-amber-300 transition-colors">
                  <EditableText
                    value={topico.title}
                    onChange={v => updateTopicTitle(topicIdx, v)}
                    isEditMode={isEditMode}
                    placeholder="Título do Tópico"
                  />
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {topico.subtopicos.length} Subtópicos Oficiais (Mapa de Ensino)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isEditMode && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeTopic(topicIdx);
                  }}
                  title="Excluir este Tópico"
                  className="p-2 bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white rounded-xl border border-red-500/30 transition-all cursor-pointer text-xs flex items-center gap-1 font-bold no-print"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir Tópico</span>
                </button>
              )}
              <button className="p-2 text-slate-400 group-hover:text-white">
                {expandedTopics[topico.number] ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Conteúdo Expandido do Tópico */}
          {expandedTopics[topico.number] && (
            <div className="space-y-6 pt-2">
              {/* Sinopse, Frases de Ênfase e Prompt Visual do Tópico */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Sinopse para Revisão Rápida */}
                  <div className="md:col-span-2 bg-slate-950/90 p-5 rounded-2xl border border-blue-500/40 space-y-2.5 shadow-md">
                    <span className="text-sm md:text-base font-black text-blue-400 uppercase tracking-wider block">
                      📌 SINOPSE DO TÓPICO (REVISÃO RÁPIDA)
                    </span>
                    <EditableText
                      value={topico.sinopse}
                      onChange={v => updateTopicSinopse(topicIdx, v)}
                      isEditMode={isEditMode}
                      multiline
                      placeholder="Sinopse do tópico..."
                      className="text-base md:text-lg lg:text-xl text-slate-100 leading-relaxed font-semibold"
                    />
                  </div>

                  {/* Frases para Ênfase */}
                  <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-2.5 no-print">
                    <span className="text-sm md:text-base font-black text-amber-400 uppercase tracking-wider block">
                      🗣️ FRASES DE ÊNFASE PARA AULA
                    </span>
                    <ul className="space-y-2 text-xs md:text-sm text-slate-200 font-semibold">
                      {(topico.frasesEnfase || []).map((frase, fIdx) => (
                        <li key={fIdx} className="flex items-center gap-1.5">
                          <span className="text-amber-400 font-bold shrink-0">•</span>
                          <div className="flex-1">
                            <EditableText
                              value={frase}
                              onChange={v => updateTopicFraseEnfase(topicIdx, fIdx, v)}
                              isEditMode={isEditMode}
                              placeholder="Frase de ênfase..."
                            />
                          </div>
                          {isEditMode && (
                            <button
                              onClick={() => removeTopicFraseEnfase(topicIdx, fIdx)}
                              className="p-1 text-red-400 hover:text-red-300 shrink-0"
                              title="Remover esta frase"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                    {isEditMode && (
                      <button
                        onClick={() => addTopicFraseEnfase(topicIdx)}
                        className="w-full mt-2 py-1.5 px-3 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+ Adicionar Frase de Ênfase</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* 🖼️ Prompt Visual 16:9 do Tópico */}
                {(topico.imagePrompt || isEditMode) && (
                  <div className="bg-slate-950/90 p-4 rounded-2xl border border-slate-800 space-y-1.5 no-print shadow-md">
                    <div className="flex items-center justify-between text-cyan-400 font-extrabold text-[11px] uppercase">
                      <span className="flex items-center gap-1.5">
                        <span>🖼️ PROMPT VISUAL 16:9 DO {topico.number}: {topico.title.toUpperCase()}</span>
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(topico.imagePrompt || '');
                          alert(`Prompt do ${topico.number} copiado!`);
                        }}
                        className="text-slate-400 hover:text-cyan-300 text-[10px] bg-slate-800 px-2 py-0.5 rounded cursor-pointer transition-colors"
                      >
                        📋 Copiar Prompt
                      </button>
                    </div>
                    <EditableText
                      value={topico.imagePrompt || ''}
                      onChange={v => updateTopicPrompt(topicIdx, v)}
                      isEditMode={isEditMode}
                      multiline
                      placeholder={`Prompt visual 16:9 cinematográfico para o ${topico.number}...`}
                      className="text-[11px] text-slate-300 font-mono italic bg-slate-900/90 p-2.5 rounded-lg border border-slate-800/80 block w-full"
                    />
                  </div>
                )}
              </div>

              {/* SUBTÓPICOS COM EXPLICAÇÃO ÚNICA & CONTEXTO HISTÓRICO INTEGRADO */}
              {topico.subtopicos.map((subtopico, subIdx) => {
                const sectionId = `${topicIdx}-${subIdx}`;

                return (
                  <div key={subtopico.number || subIdx} className="subtopic-card bg-slate-900/90 border border-slate-700/80 rounded-2xl p-5 md:p-6 space-y-5 shadow-xl transition-all">
                    {/* Cabeçalho do Subtópico */}
                    <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
                      <div className="flex-1">
                        <span className="text-amber-400 font-bold text-xs uppercase tracking-wider block mb-1">
                          SUBTÓPICO {subtopico.number}
                        </span>
                        <h3 className="text-lg md:text-xl font-extrabold text-white leading-tight">
                          <EditableText
                            value={subtopico.title}
                            onChange={v => updateSubtopicField(topicIdx, subIdx, 'title', v)}
                            isEditMode={isEditMode}
                            placeholder="Título do Subtópico"
                          />
                        </h3>
                      </div>
                      {isEditMode && (
                        <button
                          onClick={() => removeSubtopicFromTopic(topicIdx, subIdx)}
                          className="p-2 bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white rounded-xl border border-red-500/30 text-xs font-bold flex items-center gap-1 transition-all shrink-0 cursor-pointer ml-2"
                          title="Remover este subtópico"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remover</span>
                        </button>
                      )}
                    </div>

                    {/* CAMADA 1 — PROJETOR (TEXTO OFICIAL DA LIÇÃO PARA ALUNOS - QUADRO AZUL) */}
                    {(() => {
                      let textoQuadroAzul = subtopico.projetor;
                      if (textoQuadroAzul === undefined || textoQuadroAzul === null || (textoQuadroAzul === '' && !isEditMode)) {
                        textoQuadroAzul = (subtopico.frasesExplicativas && subtopico.frasesExplicativas.length > 0)
                          ? subtopico.frasesExplicativas.map(f => f.frase).filter(Boolean).join(' ')
                          : '';
                      }

                      if (!textoQuadroAzul && !isEditMode) return null;

                      return (
                        <div className="camada-1-box bg-blue-950/40 border border-blue-400/50 rounded-xl p-5 space-y-2.5 shadow-sm no-print">
                          <div className="flex items-center justify-between text-blue-400 font-extrabold text-xs tracking-wider uppercase">
                            <span className="flex items-center gap-2">
                              <Monitor className="w-4 h-4 text-blue-400" />
                              CAMADA 1 — PROJETOR (TEXTO LITERAL DA REVISTA - IPSIS LITTERIS)
                            </span>
                            {!isEditMode && (
                              <button
                                onClick={() => handleRegenerateSection('projetor', topicIdx, subIdx)}
                                disabled={regeneratingId === `${sectionId}-projetor`}
                                className="no-print hover:text-white transition-colors cursor-pointer text-xs font-bold"
                              >
                                {regeneratingId === `${sectionId}-projetor` ? 'Regenerando...' : '🔄 Regenerar Texto'}
                              </button>
                            )}
                          </div>
                          <EditableText
                            value={subtopico.projetor ?? textoQuadroAzul ?? ''}
                            onChange={v => updateSubtopicField(topicIdx, subIdx, 'projetor', v)}
                            isEditMode={isEditMode}
                            multiline
                            placeholder="Texto de destaque para o projetor..."
                            className="text-base md:text-lg font-bold text-slate-100 leading-relaxed"
                          />
                        </div>
                      );
                    })()}

                    {/* CAMADA 2 — PROFESSOR (EXPLICAÇÃO CONSTANTE FRASE POR FRASE) */}
                    <div className="space-y-4 pt-1">
                      {/* Explicação Didática Frase por Frase */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-blue-400 font-extrabold text-xs md:text-sm uppercase tracking-wider">
                          <span className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-blue-400" />
                            EXPLICAÇÃO DIDÁTICA DO PROFESSOR (EXPLICAÇÃO LINEAR)
                          </span>
                          {!isEditMode && (
                            <button
                              onClick={() => handleRegenerateSection('explicacao', topicIdx, subIdx)}
                              disabled={regeneratingId === `${sectionId}-explicacao`}
                              className="no-print hover:text-white transition-colors cursor-pointer text-xs font-bold"
                            >
                              {regeneratingId === `${sectionId}-explicacao` ? 'Regenerando...' : '🔄 Regenerar Explicação'}
                            </button>
                          )}
                        </div>

                        {/* Exibição Linear: usa explicacao de texto corrido. */}
                        {(() => {
                          let textoLinear = subtopico.explicacao;
                          if (textoLinear === undefined || textoLinear === null || (textoLinear === '' && !isEditMode)) {
                            textoLinear = (subtopico.frasesExplicativas && subtopico.frasesExplicativas.length > 0)
                              ? subtopico.frasesExplicativas
                                  .map(f => {
                                    const label = f.frase ? `"${f.frase}" — ` : '';
                                    return `${label}${f.explicacao}`.trim();
                                  })
                                  .filter(Boolean)
                                  .join('\n\n')
                              : '';
                          }
                          return (
                            <div className="bg-slate-950 p-5 rounded-xl border border-slate-800">
                              <EditableText
                                value={subtopico.explicacao ?? textoLinear ?? ''}
                                onChange={v => updateSubtopicField(topicIdx, subIdx, 'explicacao', v)}
                                isEditMode={isEditMode}
                                multiline
                                placeholder="Explicação didática linear do professor..."
                                className="text-sm md:text-base text-slate-200 leading-relaxed font-normal whitespace-pre-line"
                              />
                            </div>
                          );
                        })()}
                      </div>

                      {/* 2. Textos Bíblicos Relevantes (ARC) */}
                      {(isEditMode || (subtopico.versiculos && subtopico.versiculos.length > 0)) && (
                        <div className="space-y-2">
                          <span className="text-emerald-400 font-extrabold text-xs uppercase block">
                            📖 TEXTOS BÍBLICOS RELEVANTES (ARC)
                          </span>
                          <div className="space-y-2">
                            {(subtopico.versiculos || []).map((v, vIdx) => (
                              <div key={vIdx} className="bg-emerald-950/20 border border-emerald-500/30 p-3 rounded-xl relative space-y-1.5">
                                {isEditMode && (
                                  <button
                                    onClick={() => removeVersiculoSubtopic(topicIdx, subIdx, vIdx)}
                                    className="absolute top-2 right-2 p-1 text-red-400 hover:text-red-300"
                                    title="Remover versículo"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <EditableText
                                  value={v.reference}
                                  onChange={val => updateVersiculoSubtopic(topicIdx, subIdx, vIdx, 'reference', val)}
                                  isEditMode={isEditMode}
                                  placeholder="Referência Bíblica"
                                  className="font-extrabold text-amber-300 text-xs block mb-1"
                                />
                                <EditableText
                                  value={v.text}
                                  onChange={val => updateVersiculoSubtopic(topicIdx, subIdx, vIdx, 'text', val)}
                                  isEditMode={isEditMode}
                                  multiline
                                  placeholder="Texto do versículo..."
                                  className="text-xs text-slate-200 leading-relaxed font-medium italic"
                                />
                                {(v.explicacao || isEditMode) && (
                                  <div className="mt-2 pt-2 border-t border-emerald-500/20 bg-emerald-950/40 p-2.5 rounded-lg">
                                    <span className="text-[11px] font-bold text-emerald-400 block mb-0.5">
                                      💡 Breve Explicação do Versículo:
                                    </span>
                                    <EditableText
                                      value={v.explicacao || ''}
                                      onChange={val => updateVersiculoSubtopic(topicIdx, subIdx, vIdx, 'explicacao', val)}
                                      isEditMode={isEditMode}
                                      multiline
                                      placeholder="Breve explicação teológica e didática do versículo para a aula..."
                                      className="text-xs text-emerald-100 leading-snug font-normal"
                                    />
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                          {isEditMode && (
                            <button
                              onClick={() => addVersiculoSubtopic(topicIdx, subIdx)}
                              className="w-full py-1.5 px-3 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-all"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>+ Adicionar Versículo</span>
                            </button>
                          )}
                        </div>
                      )}

                      {/* Nota privada — Versículos (só aparece no PDF) */}
                      <div className="flex items-start gap-1.5 mt-1">
                        <span className="text-slate-500 text-xs mt-0.5 shrink-0" title="Nota privada — só aparece no PDF">✏️</span>
                        <textarea
                          value={subtopico.notaVersiculos || ''}
                          onChange={e => updateSubtopicField(topicIdx, subIdx, 'notaVersiculos', e.target.value)}
                          placeholder="Nota pessoal sobre os versículos (só no PDF)..."
                          rows={2}
                          className="w-full bg-yellow-950/20 border border-dashed border-yellow-600/30 rounded-lg px-2.5 py-1.5 text-xs text-yellow-200/70 placeholder-yellow-700/50 resize-none focus:outline-none focus:border-yellow-500/50 transition-colors"
                        />
                      </div>

                      {/* 3. Aplicação Prática & Pentecostal */}
                      {(isEditMode || subtopico.aplicacao) && (
                        <div className="space-y-1.5 bg-gradient-to-r from-amber-950/30 to-purple-950/30 border border-amber-500/30 p-3.5 rounded-xl no-print">
                          <div className="flex items-center justify-between text-amber-400 font-extrabold text-xs uppercase">
                            <span>🔥 APLICAÇÃO PRÁTICA & PENTECOSTAL</span>
                            {!isEditMode && (
                              <button
                                onClick={() => handleRegenerateSection('aplicacao', topicIdx, subIdx)}
                                disabled={regeneratingId === `${sectionId}-aplicacao`}
                                className="hover:text-white transition-colors cursor-pointer text-[11px]"
                              >
                                {regeneratingId === `${sectionId}-aplicacao` ? 'Regenerando...' : '🔄 Regenerar Aplicação'}
                              </button>
                            )}
                          </div>
                          <EditableText
                            value={subtopico.aplicacao || ''}
                            onChange={v => updateSubtopicField(topicIdx, subIdx, 'aplicacao', v)}
                            isEditMode={isEditMode}
                            multiline
                            placeholder="Aplicação prática para a vida dos alunos..."
                            className="text-xs text-slate-200 leading-relaxed font-semibold"
                          />
                        </div>
                      )}

                      {/* Nota privada — Aplicação Prática (só aparece no PDF) */}
                      <div className="flex items-start gap-1.5 mt-1">
                        <span className="text-slate-500 text-xs mt-0.5 shrink-0" title="Nota privada — só aparece no PDF">✏️</span>
                        <textarea
                          value={subtopico.notaAplicacao || ''}
                          onChange={e => updateSubtopicField(topicIdx, subIdx, 'notaAplicacao', e.target.value)}
                          placeholder="Nota pessoal sobre a aplicação prática (só no PDF)..."
                          rows={2}
                          className="w-full bg-yellow-950/20 border border-dashed border-yellow-600/30 rounded-lg px-2.5 py-1.5 text-xs text-yellow-200/70 placeholder-yellow-700/50 resize-none focus:outline-none focus:border-yellow-500/50 transition-colors"
                        />
                      </div>

                      {/* 5. 🔥 O QUE NÃO PODE SER DITO / CUIDADO DOUTRINÁRIO */}
                      {(isEditMode || subtopico.cuidadoDoutrinario) && (
                        <div className="bg-gradient-to-r from-red-950/40 via-orange-950/30 to-slate-950 border border-red-500/40 p-4 rounded-xl space-y-1 shadow-lg no-print">
                          <span className="text-red-400 font-black text-xs uppercase tracking-wider block">
                            🔥 O QUE NÃO PODE SER DITO (CUIDADO DOUTRINÁRIO)
                          </span>
                          <EditableText
                            value={subtopico.cuidadoDoutrinario || ''}
                            onChange={v => updateSubtopicField(topicIdx, subIdx, 'cuidadoDoutrinario', v)}
                            isEditMode={isEditMode}
                            multiline
                            placeholder="Alerta ou cuidado doutrinário..."
                            className="text-xs font-bold text-red-200 leading-relaxed"
                          />
                        </div>
                      )}

                      {/* 6. 🏛️ VOCABULÁRIO EXEGÉTICO NO GREGO / HEBRAICO */}
                      {subtopico.palavrasOriginais && subtopico.palavrasOriginais.length > 0 && (
                        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 no-print">
                          <span className="text-cyan-400 font-black text-xs uppercase tracking-wider block">
                            🏛️ EXEGESE BÍBLICA: VOCABULÁRIO NO ORIGINAL ({subtopico.palavrasOriginais[0].idioma})
                          </span>
                          <div className="space-y-2">
                            {subtopico.palavrasOriginais.map((p, pIdx) => (
                              <div key={pIdx} className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                                <div className="flex items-center gap-2 text-xs font-bold text-amber-300 mb-1">
                                  <span className="text-sm font-mono">{p.termo}</span>
                                  <span className="text-slate-400">({p.transliteracao})</span>
                                  <span className="bg-cyan-950 text-cyan-400 px-2 py-0.5 rounded text-[10px]">{p.idioma}</span>
                                </div>
                                <p className="text-xs text-slate-300 font-medium"><strong>Significado:</strong> {p.significado}</p>
                                <p className="text-xs text-slate-400 mt-1 italic">{p.explicacao}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 7. 🖼️ PROMPT VISUAL 16:9 PARA CANVA / MIDJOURNEY */}
                      {(subtopico.imagePrompt || isEditMode) && (
                        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1.5 no-print">
                          <div className="flex items-center justify-between text-cyan-400 font-extrabold text-[11px] uppercase">
                            <span className="flex items-center gap-1.5">
                              <span>🖼️ PROMPT VISUAL 16:9 (CANVA / MIDJOURNEY)</span>
                            </span>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(subtopico.imagePrompt || '');
                                alert('Prompt copiado para a área de transferência!');
                              }}
                              className="text-slate-400 hover:text-cyan-300 text-[10px] bg-slate-800 px-2 py-0.5 rounded cursor-pointer transition-colors"
                            >
                              📋 Copiar Prompt
                            </button>
                          </div>
                          <EditableText
                            value={subtopico.imagePrompt || ''}
                            onChange={v => updateSubtopicField(topicIdx, subIdx, 'imagePrompt', v)}
                            isEditMode={isEditMode}
                            multiline
                            placeholder="Prompt visual 16:9 cinematográfico para o subtópico..."
                            className="text-[11px] text-slate-300 font-mono italic bg-slate-900/90 p-2.5 rounded-lg border border-slate-800/80 block w-full"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {/* PERGUNTAS DE FIXAÇÃO & APLICAÇÃO GERAL */}
      {(lesson.perguntasFixacao && lesson.perguntasFixacao.length > 0) && (
        <div className="bg-slate-900/80 border border-slate-700/80 p-6 rounded-3xl shadow-xl space-y-4">
          <h2 className="text-xl md:text-2xl font-black text-white flex items-center gap-2 border-b border-slate-700/60 pb-3">
            <BookOpen className="w-5 h-5 text-amber-400" />
            <span>PERGUNTAS PARA DEBATE E FIXAÇÃO</span>
          </h2>

          <div className="space-y-3">
            {lesson.perguntasFixacao.map((p, idx) => (
              <div key={idx} className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                <span className="text-xs font-black text-amber-400 uppercase tracking-wider block">
                  Pergunta {idx + 1}:
                </span>
                <p className="text-sm md:text-base font-bold text-white">
                  {p.pergunta}
                </p>
                {p.respostaEsperada && (
                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed border-t border-slate-800/80 pt-2">
                    <strong className="text-amber-300">Resposta / Ponto-chave:</strong> {p.respostaEsperada}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CONCLUSÃO DA LIÇÃO */}
      {lesson.conclusao && (
        <div className="bg-slate-900/80 border border-slate-700/80 p-6 rounded-3xl shadow-xl space-y-4">
          <h2 className="text-xl md:text-2xl font-black text-white flex items-center gap-2 border-b border-slate-700/60 pb-3">
            <span>🎯 CONCLUSÃO & TAKEAWAY DA AULA</span>
          </h2>

          <div className="space-y-3">
            {lesson.conclusao.takeaway && (
              <div className="bg-slate-950 p-5 rounded-2xl border border-amber-500/40">
                <span className="text-xs font-black text-amber-400 uppercase tracking-wider block mb-1">
                  MENSAGEM CENTRAL (TAKEAWAY):
                </span>
                <EditableText
                  value={lesson.conclusao.takeaway}
                  onChange={v => updateConclusaoField('takeaway', v)}
                  isEditMode={isEditMode}
                  multiline
                  placeholder="Mensagem central de conclusão..."
                  className="text-base md:text-lg font-bold text-slate-100 leading-relaxed"
                />
              </div>
            )}

            {isEditMode && (
              <button
                onClick={() => {
                  const pts = [...(lesson.conclusao.bulletPoints || []), 'Novo ponto de conclusão'];
                  updateConclusaoField('bulletPoints', pts);
                }}
                className="py-1 px-3 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded-lg text-xs font-bold cursor-pointer transition-all"
              >
                + Adicionar Ponto de Conclusão
              </button>
            )}

            {(isEditMode || lesson.conclusao.finalPrayer) && (
              <div className="bg-purple-950/40 border border-purple-500/30 p-4 rounded-2xl text-xs md:text-sm text-purple-200 font-bold space-y-1 mt-3">
                <span className="text-amber-300 uppercase tracking-wide block font-black">🙏 SUGESTÃO DE ORAÇÃO FINAL COM A CLASSE:</span>
                <EditableText
                  value={lesson.conclusao.finalPrayer || ''}
                  onChange={v => updateConclusaoField('finalPrayer', v)}
                  isEditMode={isEditMode}
                  multiline
                  placeholder="Sugestão de oração final..."
                  className="italic text-purple-100"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* SLIDES EXTRAS ADICIONADOS PELO PROFESSOR */}
      {(lesson.extraSlides && lesson.extraSlides.length > 0) && (
        <div className="bg-slate-900 border border-amber-500/40 p-6 rounded-3xl shadow-xl space-y-4">
          <h2 className="text-xl md:text-2xl font-black text-amber-300 flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              <span>SLIDES EXTRAS PERSONALIZADOS ({lesson.extraSlides.length})</span>
            </div>
            <span className="text-xs font-bold text-amber-400/80 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/30">
              Visíveis no Projetor e Celular
            </span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {lesson.extraSlides.map((slide, sIdx) => (
              <div key={slide.id || sIdx} className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {slide.badgeText || `Slide Extra ${sIdx + 1}`}
                  </span>
                  {slide.reference && (
                    <span className="text-[10px] font-bold text-slate-400">
                      {slide.reference}
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold text-white">
                  {slide.title}
                </h3>
                {slide.subtitle && (
                  <p className="text-xs text-slate-400">{slide.subtitle}</p>
                )}
                {slide.projetorText && (
                  <p className="text-xs md:text-sm text-slate-200 leading-relaxed whitespace-pre-line border-t border-slate-800/80 pt-2">
                    {slide.projetorText}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
