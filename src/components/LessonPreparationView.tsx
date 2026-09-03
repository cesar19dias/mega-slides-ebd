import React, { useState, useRef } from 'react';
import type { EBDLessonPreparation } from '../types';
import { RefreshCw, Check, ChevronDown, ChevronUp, Monitor, UserCheck, FileText, Bookmark, ArrowLeft, ArrowRight, Printer, Download, Copy, ImageDown, FileDown, LayoutTemplate } from 'lucide-react';
import { callGeminiRaw } from '../services/geminiService';
import { exportSingleSlidePDF, exportSingleSlidePNG, exportAllSlidesPDFFromStage, exportAllSlidesPNGZipFromStage } from '../services/exportService';

export interface BiblicalVerseSlideData {
  chapterHeader?: string;
  verseText: string;
}

export function splitBiblicalVersesIntoSlides(rawText: string): BiblicalVerseSlideData[] {
  if (!rawText || !rawText.trim()) return [];

  let text = rawText.trim();
  let mainHeader = '';
  let bodyText = text;

  // 1. Extrai a referência inteira do início (ex: "Atos 24.1-6, 10-16") antes do travessão
  const firstDash = text.indexOf('—');
  if (firstDash !== -1 && firstDash < 80) {
    mainHeader = text.substring(0, firstDash).trim();
    bodyText = text.substring(firstDash + 1).trim();
  } else {
    const headerMatch = text.match(/^([1-3]?\s*[A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+)?\s+[\d\.\:\,\s\-]+)(?:\n|$)/i);
    if (headerMatch) {
      mainHeader = headerMatch[1].trim();
    }
  }

  // 2. Procura todas as ocorrências de números de versículos (aceita palavras de 1+ letras como "1 E,", "6 o", "12 e", "3 ó")
  const verseRegex = /(?:^|\s+|\n)(\d{1,3})\s*(?:[—\-–\.]\s*)?(?=[A-Za-zÀ-ÿ"“'\[])/g;
  const matches: { number: string; index: number }[] = [];
  let m: RegExpExecArray | null;

  while ((m = verseRegex.exec(bodyText)) !== null) {
    const numStr = m[1];
    const numIndex = m.index + m[0].indexOf(numStr);
    matches.push({
      number: numStr,
      index: numIndex
    });
  }

  if (matches.length > 0) {
    const rawVerses: { number: string; body: string }[] = [];

    for (let i = 0; i < matches.length; i++) {
      const curr = matches[i];
      const next = matches[i + 1];
      const startIdx = curr.index + curr.number.length;
      const endIdx = next ? next.index : bodyText.length;
      let verseContent = bodyText.substring(startIdx, endIdx).trim();

      // Limpa pontuações/marcadores no início do versículo
      verseContent = verseContent.replace(/^[—\-–\.]\s*/, '').replace(/\[\.\.\.\]/g, '').trim();

      if (verseContent.length > 0) {
        rawVerses.push({
          number: curr.number,
          body: verseContent
        });
      }
    }

    if (rawVerses.length > 0) {
      // Divisão estrita de 2 versículos por slide para garantir legibilidade perfeita
      const slides: BiblicalVerseSlideData[] = [];
      const maxVersesPerSlide = 2;

      for (let i = 0; i < rawVerses.length; i += maxVersesPerSlide) {
        const chunk = rawVerses.slice(i, i + maxVersesPerSlide);
        const combinedVerseText = chunk.map(v => `${v.number} — ${v.body}`).join('\n');
        slides.push({
          chapterHeader: mainHeader || undefined,
          verseText: combinedVerseText
        });
      }

      return slides;
    }
  }

  // Fallback se não houver números de versículos no corpo
  return [{
    chapterHeader: mainHeader || undefined,
    verseText: bodyText
  }];
}

interface LessonPreparationViewProps {
  lessonData: EBDLessonPreparation;
  onReset: () => void;
  onUpdateLesson: (updated: EBDLessonPreparation) => void;
}

export const LessonPreparationView: React.FC<LessonPreparationViewProps> = ({
  lessonData,
  onReset,
  onUpdateLesson,
}) => {
  const [lesson, setLesson] = useState<EBDLessonPreparation>(lessonData);
  const [activeTab, setActiveTab] = useState<'professor' | 'projetor'>('professor');

  // Estado da Visão do Projetor (Slide atual no projetor)
  const [projectorIndex, setProjectorIndex] = useState(0);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const allSlidesRef = useRef<HTMLDivElement>(null);

  // Estados de Regeneração Seletiva e Notificações
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [copiedToast, setCopiedToast] = useState<boolean>(false);
  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>({
    'I': true,
    'II': true,
    'III': true
  });

  const projectorStageRef = useRef<HTMLDivElement>(null);
  const [projectorSlideImages, setProjectorSlideImages] = useState<Record<number, string>>({});
  const [customBg, setCustomBg] = useState<string | null>(() => {
    try {
      return localStorage.getItem('mega_ebd_custom_bg');
    } catch {
      return null;
    }
  });

  const handleSlideImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const d = ev.target?.result as string;
      if (d) {
        setProjectorSlideImages(prev => ({ ...prev, [projectorIndex]: d }));
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemoveSlideImage = () => {
    setProjectorSlideImages(prev => {
      const next = { ...prev };
      delete next[projectorIndex];
      return next;
    });
  };

  const handleCustomBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const d = ev.target?.result as string;
      if (d) {
        setCustomBg(d);
        try { localStorage.setItem('mega_ebd_custom_bg', d); } catch {}
      }
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  // Gerador de Texto Completo do Roteiro do Professor na Íntegra
  const generateTeacherTextContent = (data: EBDLessonPreparation): string => {
    let text = `========================================================================\n`;
    text += `ROTEIRO COMPLETO DO PROFESSOR - EBD NA ÍNTEGRA\n`;
    text += `${data.metadata.lessonNumber || 'LIÇÃO EBD'} - ${data.metadata.title}\n`;
    text += `Tema do Trimestre: ${data.metadata.themeTopic}\n`;
    text += `========================================================================\n\n`;

    text += `1. TEXTO ÁUREO\n`;
    text += `"${data.textAureo.text}" (${data.textAureo.reference})\n\n`;

    text += `2. VERDADE PRÁTICA\n`;
    text += `"${data.verdadePratica.text}"\n\n`;

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
      text += `\n`;

      topico.subtopicos.forEach((sub) => {
        text += `--- Subtópico ${sub.number}: ${sub.title} ---\n\n`;

        sub.ideias.forEach((ideia) => {
          text += `[Ideia ${ideia.letra.toUpperCase()}] ${ideia.titulo}\n`;
          text += `🖥️ CAMADA 1 - PROJETOR (ALUNOS):\n"${ideia.projetor}"\n\n`;

          text += `👨‍🏫 CAMADA 2 - EXPLICAÇÃO DIDÁTICA DO PROFESSOR:\n${ideia.professor.explicacao}\n\n`;

          if (ideia.professor.contexto) {
            text += `🏛️ CONTEXTO HISTÓRICO, CULTURAL E BÍBLICO:\n${ideia.professor.contexto}\n\n`;
          }

          if (ideia.professor.versiculos && ideia.professor.versiculos.length > 0) {
            text += `📖 TEXTOS BÍBLICOS RELEVANTES (ARC):\n`;
            ideia.professor.versiculos.forEach((v) => {
              text += `  • ${v.reference}: "${v.text}"\n`;
            });
            text += `\n`;
          }

          if (ideia.professor.aplicacao) {
            text += `🔥 APLICAÇÃO PRÁTICA & PENTECOSTAL:\n${ideia.professor.aplicacao}\n\n`;
          }

          if (ideia.professor.enfase) {
            text += `💡 ÊNFASE PARA A SALA:\n"${ideia.professor.enfase}"\n\n`;
          }

          if (ideia.professor.cuidadoDoutrinario) {
            text += `🔥 O QUE NÃO PODE SER DITO (CUIDADO DOUTRINÁRIO):\n⚠️ ${ideia.professor.cuidadoDoutrinario}\n\n`;
          }

          if (ideia.imagePrompt) {
            text += `🖼️ PROMPT VISUAL (CANVA / MIDJOURNEY):\n${ideia.imagePrompt}\n\n`;
          }

          text += `........................................................................\n\n`;
        });
      });
    });

    text += `========================================================================\n`;
    text += `CONCLUSÃO & APLICAÇÃO FINAL DA LIÇÃO\n`;
    text += `========================================================================\n`;
    text += `"${data.conclusao.takeaway}"\n\n`;

    if (data.conclusao.bulletPoints && data.conclusao.bulletPoints.length > 0) {
      text += `Pontos Principais:\n`;
      data.conclusao.bulletPoints.forEach((pt) => {
        text += `  • ${pt}\n`;
      });
      text += `\n`;
    }

    if (data.conclusao.finalPrayer) {
      text += `🙏 Sugestão de Oração Final com a Classe:\n"${data.conclusao.finalPrayer}"\n\n`;
    }

    text += `========================================================================\n`;
    text += `Fontes e Transcrições Cruzadas: ${data.sourcesSummary.transcriptionsCount} fonte(s) utilizadas (${data.sourcesSummary.sourcesUsed.join(', ')})\n`;
    text += `========================================================================\n`;

    return text;
  };

  // Funções de Exportação / Baixar / Imprimir / Copiar
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

  const handleDownloadTeacherTxt = () => {
    const textContent = generateTeacherTextContent(lesson);
    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const sanitizedTitle = lesson.metadata.title.replace(/[^a-zA-Z0-9-_\s]/g, '_').trim() || 'Roteiro_Professor';
    link.download = `Roteiro_Professor_${sanitizedTitle}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyTeacherGuide = () => {
    const textContent = generateTeacherTextContent(lesson);
    navigator.clipboard.writeText(textContent);
    setCopiedToast(true);
    setTimeout(() => setCopiedToast(false), 3000);
  };

  // Flattened items for Projector Mode
  const projectorItems = React.useMemo(() => {
    const items: Array<{
      type: 'cover' | 'aureo' | 'pratica' | 'leitura' | 'topic_synopsis' | 'subtopic' | 'conclusao' | 'verdades';
      title: string;
      subtitle?: string;
      bulletPoints?: string[];
      badgeText?: string;
      projetorText?: string;
      ideiaText?: string;
      reference?: string;
      imagePrompt?: string;
    }> = [];

    // Capa
    items.push({
      type: 'cover',
      title: lesson.metadata.title,
      subtitle: lesson.metadata.themeTopic,
      badgeText: lesson.metadata.lessonNumber || 'LIÇÃO EBD'
    });

    // Texto Áureo
    items.push({
      type: 'aureo',
      title: 'TEXTO ÁUREO',
      badgeText: 'TEXTO ÁUREO',
      projetorText: `“${lesson.textAureo.text}”`,
      reference: lesson.textAureo.reference
    });

    // Verdade Prática
    if (lesson.verdadePratica?.text) {
      items.push({
        type: 'pratica',
        title: 'VERDADE PRÁTICA',
        badgeText: 'VERDADE PRÁTICA',
        projetorText: `“${lesson.verdadePratica.text}”`
      });
    }

    // Leitura Bíblica em Classe NA ÍNTEGRA (SLIDES INDIVIDUAIS POR VERSÍCULO COMO NAS IMAGENS)
    if (lesson.biblicalText) {
      const verseSlides = splitBiblicalVersesIntoSlides(lesson.biblicalText);
      verseSlides.forEach((vSlide, vIdx) => {
        items.push({
          type: 'leitura',
          title: `LEITURA BÍBLICA EM CLASSE (${vIdx + 1}/${verseSlides.length})`,
          badgeText: 'LEITURA BÍBLICA EM CLASSE',
          reference: vSlide.chapterHeader,
          projetorText: vSlide.verseText
        });
      });
    }

    // Tópicos, Sinopse do Tópico (Revisão Rápida) e Subtópicos com Ideias a, b, c
    lesson.topicos.forEach((t) => {
      // 📌 CARD DE SINOPSE / REVISÃO DO TÓPICO (TÍTULO DO TÓPICO VAI NA TARJA LARANJA COMO NO PRINT)
      items.push({
        type: 'topic_synopsis',
        title: `TÓPICO ${t.number}: ${t.title}`,
        badgeText: `TÓPICO ${t.number}: ${t.title.toUpperCase()}`,
        ideiaText: `TÓPICO ${t.number}: ${t.title.toUpperCase()}`,
        projetorText: t.sinopse
      });

      t.subtopicos.forEach((s) => {
        s.ideias.forEach((ideia) => {
          items.push({
            type: 'subtopic',
            title: `${s.number}. ${s.title}`,
            badgeText: `SUBTÓPICO ${s.number}: ${s.title.toUpperCase()}`,
            ideiaText: `${ideia.letra}) ${ideia.titulo}`,
            projetorText: ideia.projetor,
            imagePrompt: ideia.imagePrompt || s.imagePrompt
          });
        });
      });
    });

    // Conclusão
    if (lesson.conclusao?.takeaway) {
      items.push({
        type: 'conclusao',
        title: 'CONCLUSÃO',
        badgeText: 'CONCLUSÃO',
        projetorText: lesson.conclusao.takeaway
      });
    }

    // Verdades que precisamos guardar (bulletPoints antes da oração)
    if (lesson.conclusao?.bulletPoints?.length) {
      items.push({
        type: 'verdades',
        title: 'VERDADES QUE PRECISAMOS GUARDAR',
        badgeText: 'VERDADES QUE PRECISAMOS GUARDAR',
        bulletPoints: lesson.conclusao.bulletPoints
      });
    }

    return items;
  }, [lesson]);

  const currentProjectorItem = projectorItems[projectorIndex] || projectorItems[0];

  const toggleTopicExpand = (topicNumber: string) => {
    setExpandedTopics(prev => ({
      ...prev,
      [topicNumber]: !prev[topicNumber]
    }));
  };

  // Regenerar Seção Específica (Explicação / Aplicação / Projetor)
  const handleRegenerateSection = async (
    targetType: 'explicacao' | 'aplicacao' | 'projetor',
    topicIdx: number,
    subIdx: number,
    ideiaIdx: number
  ) => {
    const uniqueId = `${topicIdx}-${subIdx}-${ideiaIdx}-${targetType}`;
    setRegeneratingId(uniqueId);

    try {
      const currentIdeia = lesson.topicos[topicIdx].subtopicos[subIdx].ideias[ideiaIdx];
      const prompt = `Como especialista em EBD, reescreva e aprimore somente o campo ${targetType.toUpperCase()} para a ideia: "${currentIdeia.titulo}".
Explicação atual: ${currentIdeia.professor.explicacao}.
Retorne APENAS o novo texto diretamente, claro, didático e bíblico.`;

      const newText = await callGeminiRaw(prompt, 'gemini-2.5-flash');

      const updated = { ...lesson };
      const targetIdeia = updated.topicos[topicIdx].subtopicos[subIdx].ideias[ideiaIdx];

      if (targetType === 'explicacao') {
        targetIdeia.professor.explicacao = newText.trim();
      } else if (targetType === 'aplicacao') {
        targetIdeia.professor.aplicacao = newText.trim();
      } else if (targetType === 'projetor') {
        targetIdeia.projetor = newText.trim();
      }

      setLesson(updated);
      onUpdateLesson(updated);
    } catch (err: any) {
      alert(`Erro ao regenerar seção: ${err.message}`);
    } finally {
      setRegeneratingId(null);
    }
  };

  return (
    <div className="preparation-view-container space-y-6 max-w-6xl mx-auto font-['Montserrat']">
      {/* Barra de Ferramentas Superior & Alternador de Visão */}
      <div className="bg-slate-900/90 border border-slate-700/90 p-4 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-4 backdrop-blur-md no-print">
        <div className="flex items-center gap-3">
          <button
            onClick={onReset}
            className="btn-secondary text-xs flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 py-2 rounded-xl border border-slate-600 font-extrabold transition-all cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
            Nova Lição EBD
          </button>
          <div className="text-white text-sm md:text-base font-black truncate max-w-xs md:max-w-sm">
            {lesson.metadata.title}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Botões de Ação para Baixar / Imprimir / Copiar a Parte do Professor */}
          {activeTab === 'professor' && (
            <div className="flex flex-wrap items-center gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
              <button
                onClick={handlePrintTeacherGuide}
                title="Salvar Roteiro em PDF ou Imprimir"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition-all cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-amber-400" />
                <span>PDF / Imprimir</span>
              </button>

              <button
                onClick={handleDownloadTeacherTxt}
                title="Baixar Roteiro em Arquivo de Texto (.txt)"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Baixar TXT</span>
              </button>

              <button
                onClick={handleCopyTeacherGuide}
                title="Copiar Roteiro Completo para Área de Transferência"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 transition-all cursor-pointer"
              >
                {copiedToast ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Copiar Roteiro</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Chave de Alternância: PROFESSOR vs PROJETOR */}
          <div className="flex items-center bg-slate-950 p-1 rounded-2xl border border-slate-800">
            <button
              onClick={() => setActiveTab('professor')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-extrabold text-xs transition-all cursor-pointer ${
                activeTab === 'professor'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <UserCheck className="w-4 h-4 text-amber-300" />
              <span>👨‍🏫 VISÃO DO PROFESSOR</span>
            </button>

            <button
              onClick={() => setActiveTab('projetor')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-extrabold text-xs transition-all cursor-pointer ${
                activeTab === 'projetor'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-purple-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Monitor className="w-4 h-4 text-cyan-300" />
              <span>🖥️ VISÃO DO PROJETOR</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 👨‍🏫 ABA 1: VISÃO DO PROFESSOR (PREPARAÇÃO DETALHADA E DIDÁTICA) */}
      {/* ========================================================= */}
      {activeTab === 'professor' && (
        <div className="space-y-6">
          {/* Cabeçalho da Preparação e Fontes Utilizadas */}
          <div className="bg-slate-900/80 border border-slate-700/80 p-6 rounded-3xl shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/60 pb-4">
              <div>
                <span className="text-xs font-black text-amber-400 uppercase tracking-widest block mb-1">
                  {lesson.metadata.lessonNumber || 'Escola Bíblica Dominical'}
                </span>
                <h1 className="text-2xl md:text-4xl font-black text-white font-['Montserrat']">
                  {lesson.metadata.title}
                </h1>
                <p className="text-xs md:text-sm text-slate-300 mt-1 font-semibold">
                  Tema: {lesson.metadata.themeTopic}
                </p>
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

              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrintTeacherGuide}
                  className="bg-amber-500 hover:bg-amber-600 text-slate-950 px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Baixar PDF / Imprimir</span>
                </button>

                <button
                  onClick={handleDownloadTeacherTxt}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar TXT</span>
                </button>

                <button
                  onClick={handleCopyTeacherGuide}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  {copiedToast ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-400">Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-cyan-400" />
                      <span>Copiar Roteiro</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Texto Áureo & Verdade Prática */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {/* Texto Áureo */}
              <div className="bg-[#091b2c] border-2 border-[#cbd5e1] p-5 rounded-2xl shadow-lg space-y-2">
                <span className="text-xs font-black text-amber-300 uppercase tracking-wider block">
                  TEXTO ÁUREO
                </span>
                <p className="text-sm md:text-base font-extrabold text-white leading-relaxed">
                  “{lesson.textAureo.text}” ({lesson.textAureo.reference}).
                </p>
              </div>

              {/* Verdade Prática */}
              <div className="bg-[#091b2c] border-2 border-[#cbd5e1] p-5 rounded-2xl shadow-lg space-y-2">
                <span className="text-xs font-black text-amber-300 uppercase tracking-wider block">
                  VERDADE PRÁTICA
                </span>
                <p className="text-sm md:text-base font-extrabold text-white leading-relaxed">
                  “{lesson.verdadePratica.text}”
                </p>
              </div>
            </div>
          </div>

          {/* CHECKLIST DE FIDELIDADE DAS FONTES */}

          <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
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
            <div key={topico.number} className="bg-slate-900/90 border border-slate-700/90 rounded-3xl overflow-hidden shadow-2xl space-y-4 p-6">
              {/* Cabeçalho do Tópico com Botão Recolher/Expandir */}
              <div
                onClick={() => toggleTopicExpand(topico.number)}
                className="flex items-center justify-between cursor-pointer border-b border-slate-700/80 pb-4 group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-600 text-white font-black text-lg flex items-center justify-center shadow-lg">
                    {topico.number}
                  </div>
                  <div>
                    <h2 className="text-xl md:text-2xl font-black text-white group-hover:text-amber-300 transition-colors">
                      {topico.title}
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {topico.subtopicos.length} Subtópicos • {topico.subtopicos.reduce((acc, s) => acc + s.ideias.length, 0)} Ideias do Mapa de Ensino
                    </p>
                  </div>
                </div>

                <button className="p-2 text-slate-400 group-hover:text-white">
                  {expandedTopics[topico.number] ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </button>
              </div>

              {/* Conteúdo Expandido do Tópico */}
              {expandedTopics[topico.number] && (
                <div className="space-y-6 pt-2">
                  {/* Sinopse & Frases de Ênfase do Tópico */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Sinopse para Revisão Rápida */}
                    <div className="md:col-span-2 bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                      <span className="text-xs font-black text-blue-400 uppercase tracking-wider block">
                        📌 SINOPSE DO TÓPICO (REVISÃO RÁPIDA)
                      </span>
                      <p className="text-xs md:text-sm text-slate-200 leading-relaxed font-medium">
                        {topico.sinopse}
                      </p>
                    </div>

                    {/* Frases para Ênfase */}
                    <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                      <span className="text-xs font-black text-amber-400 uppercase tracking-wider block">
                        🗣️ FRASES DE ÊNFASE PARA AULA
                      </span>
                      <ul className="space-y-1.5 text-xs text-slate-300 font-semibold">
                        {topico.frasesEnfase.map((frase, fIdx) => (
                          <li key={fIdx} className="flex items-start gap-1.5">
                            <span className="text-amber-400 font-bold">•</span>
                            <span>"{frase}"</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* SUBTÓPICOS COM IDEIAS a), b), c) */}
                  {topico.subtopicos.map((subtopico, subIdx) => (
                    <div key={subtopico.number} className="bg-slate-950/60 border border-slate-800/90 rounded-2xl p-5 space-y-5">
                      <div className="flex items-center gap-2 text-amber-300 font-black text-base md:text-lg border-b border-slate-800 pb-3">
                        <span className="bg-amber-500/20 text-amber-300 px-2.5 py-1 rounded-lg text-xs font-black">
                          SUBTÓPICO {subtopico.number}
                        </span>
                        <span>{subtopico.title}</span>
                      </div>

                      {/* IDEIAS a), b), c) DO SUBTÓPICO */}
                      {subtopico.ideias.map((ideia, ideiaIdx) => {
                        const sectionId = `${topicIdx}-${subIdx}-${ideiaIdx}`;

                        return (
                          <div key={ideia.letra} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                            {/* Título da Ideia a), b), c) */}
                            <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-2">
                              <div className="flex items-center gap-2">
                                <span className="w-7 h-7 rounded-lg bg-blue-600 text-white font-black text-xs flex items-center justify-center shadow-md">
                                  {ideia.letra})
                                </span>
                                <h3 className="font-extrabold text-white text-sm md:text-base">
                                  {ideia.titulo}
                                </h3>
                              </div>

                              <span className="text-[10px] font-bold text-slate-400 bg-slate-800 px-2.5 py-1 rounded-md">
                                Ideia {ideia.letra.toUpperCase()}
                              </span>
                            </div>

                            {/* CAMADA 1 — PROJETOR (ALUNOS) */}
                            <div className="bg-gradient-to-r from-indigo-950/60 to-purple-950/60 border border-purple-500/30 p-3.5 rounded-xl space-y-1">
                              <div className="flex items-center justify-between text-purple-300 font-extrabold text-[11px] uppercase">
                                <span className="flex items-center gap-1.5">
                                  <Monitor className="w-3.5 h-3.5 text-purple-400" />
                                  CAMADA 1 — PROJETOR (CONTEÚDO SÍNTESE PARA ALUNOS)
                                </span>
                                <button
                                  onClick={() => handleRegenerateSection('projetor', topicIdx, subIdx, ideiaIdx)}
                                  disabled={regeneratingId === `${sectionId}-projetor`}
                                  className="hover:text-white transition-colors cursor-pointer"
                                >
                                  {regeneratingId === `${sectionId}-projetor` ? 'Encurtando...' : '🔄 Encurtar Texto'}
                                </button>
                              </div>
                              <p className="text-xs md:text-sm font-bold text-white leading-relaxed">
                                “{ideia.projetor}”
                              </p>
                            </div>

                            {/* CAMADA 2 — PROFESSOR (EXPLICADA & DETALHADA) */}
                            <div className="space-y-4 pt-1">
                              {/* 1. Explicação Detalhada */}
                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-blue-400 font-black text-xs uppercase">
                                  <span className="flex items-center gap-1.5">
                                    <FileText className="w-4 h-4" />
                                    EXPLICAÇÃO DIDÁTICA (DAS TRANSCRIÇÕES)
                                  </span>
                                  <button
                                    onClick={() => handleRegenerateSection('explicacao', topicIdx, subIdx, ideiaIdx)}
                                    disabled={regeneratingId === `${sectionId}-explicacao`}
                                    className="hover:text-white transition-colors cursor-pointer text-[11px]"
                                  >
                                    {regeneratingId === `${sectionId}-explicacao` ? 'Regenerando...' : '🔄 Regenerar Explicação'}
                                  </button>
                                </div>
                                <p className="text-xs md:text-sm text-slate-200 leading-relaxed font-medium bg-slate-950 p-4 rounded-xl border border-slate-800/80">
                                  {ideia.professor.explicacao}
                                </p>
                              </div>

                              {/* 2. Contexto Histórico & Cultural */}
                              {ideia.professor.contexto && (
                                <div className="space-y-1.5 bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
                                  <span className="text-amber-400 font-extrabold text-xs uppercase block">
                                    🏛️ CONTEXTO HISTÓRICO, CULTURAL E BÍBLICO
                                  </span>
                                  <p className="text-xs text-slate-300 leading-relaxed font-medium">
                                    {ideia.professor.contexto}
                                  </p>
                                </div>
                              )}

                              {/* 3. Textos Bíblicos Relevantes (ARC) */}
                              {ideia.professor.versiculos && ideia.professor.versiculos.length > 0 && (
                                <div className="space-y-2">
                                  <span className="text-emerald-400 font-extrabold text-xs uppercase block">
                                    📖 TEXTOS BÍBLICOS RELEVANTES (ARC)
                                  </span>
                                  <div className="space-y-2">
                                    {ideia.professor.versiculos.map((v, vIdx) => (
                                      <div key={vIdx} className="bg-emerald-950/20 border border-emerald-500/30 p-3 rounded-xl">
                                        <span className="font-extrabold text-amber-300 text-xs block mb-1">
                                          {v.reference}
                                        </span>
                                        <p className="text-xs text-slate-200 leading-relaxed font-medium italic">
                                          “{v.text}”
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* 4. Aplicação Prática & Pentecostal */}
                              {ideia.professor.aplicacao && (
                                <div className="space-y-1.5 bg-gradient-to-r from-amber-950/30 to-purple-950/30 border border-amber-500/30 p-3.5 rounded-xl">
                                  <div className="flex items-center justify-between text-amber-400 font-extrabold text-xs uppercase">
                                    <span>🔥 APLICAÇÃO PRÁTICA & PENTECOSTAL</span>
                                    <button
                                      onClick={() => handleRegenerateSection('aplicacao', topicIdx, subIdx, ideiaIdx)}
                                      disabled={regeneratingId === `${sectionId}-aplicacao`}
                                      className="hover:text-white transition-colors cursor-pointer text-[11px]"
                                    >
                                      {regeneratingId === `${sectionId}-aplicacao` ? 'Regenerando...' : '🔄 Regenerar Aplicação'}
                                    </button>
                                  </div>
                                  <p className="text-xs text-slate-200 leading-relaxed font-semibold">
                                    {ideia.professor.aplicacao}
                                  </p>
                                </div>
                              )}

                              {/* 5. Frase de Ênfase para o Professor */}
                              {ideia.professor.enfase && (
                                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs font-bold text-slate-200 flex items-center gap-2">
                                  <span className="text-orange-400 font-black text-sm">💡</span>
                                  <span><strong className="text-orange-300">Ênfase para a Sala:</strong> "{ideia.professor.enfase}"</span>
                                </div>
                              )}

                              {/* 6. 🔥 O QUE NÃO PODE SER DITO / CUIDADO DOUTRINÁRIO */}
                              {ideia.professor.cuidadoDoutrinario && (
                                <div className="bg-gradient-to-r from-red-950/40 via-orange-950/30 to-slate-950 border border-red-500/40 p-4 rounded-xl space-y-1 shadow-lg">
                                  <span className="text-red-400 font-black text-xs uppercase tracking-wider flex items-center gap-1.5">
                                    <span>🔥 O QUE NÃO PODE SER DITO (CUIDADO DOUTRINÁRIO)</span>
                                  </span>
                                  <p className="text-xs font-bold text-red-200 leading-relaxed">
                                    ⚠️ {ideia.professor.cuidadoDoutrinario}
                                  </p>
                                </div>
                              )}

                              {/* 7. 🖼️ PROMPT VISUAL 16:9 PARA CANVA / MIDJOURNEY */}
                              {ideia.imagePrompt && (
                                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                                  <div className="flex items-center justify-between text-cyan-400 font-extrabold text-[11px] uppercase">
                                    <span className="flex items-center gap-1.5">
                                      <span>🖼️ PROMPT VISUAL 16:9 (CANVA / MIDJOURNEY)</span>
                                    </span>
                                    <button
                                      onClick={() => {
                                        navigator.clipboard.writeText(ideia.imagePrompt);
                                        alert('Prompt copiado para a área de transferência!');
                                      }}
                                      className="text-slate-400 hover:text-cyan-300 text-[10px] bg-slate-800 px-2 py-0.5 rounded cursor-pointer transition-colors"
                                    >
                                      📋 Copiar Prompt
                                    </button>
                                  </div>
                                  <p className="text-[11px] text-slate-300 font-mono italic bg-slate-900/90 p-2.5 rounded-lg border border-slate-800/80">
                                    {ideia.imagePrompt}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* CONCLUSÃO DA AULA */}
          <div className="bg-slate-900 border border-purple-500/40 p-6 rounded-3xl shadow-xl space-y-4">
            <h2 className="text-xl md:text-2xl font-black text-purple-300 flex items-center gap-2 border-b border-slate-800 pb-3">
              <Bookmark className="w-5 h-5 text-purple-400" />
              <span>CONCLUSÃO & APLICAÇÃO FINAL DA LIÇÃO</span>
            </h2>

            <div className="space-y-3">
              <p className="text-sm md:text-base font-extrabold text-white leading-relaxed">
                “{lesson.conclusao.takeaway}”
              </p>

              <ul className="space-y-2 text-xs md:text-sm text-slate-200 font-medium">
                {lesson.conclusao.bulletPoints.map((pt, idx) => (
                  <li key={idx} className="flex items-start gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <span className="text-purple-400 font-bold">•</span>
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>

              {lesson.conclusao.finalPrayer && (
                <div className="bg-purple-950/40 border border-purple-500/30 p-4 rounded-2xl text-xs md:text-sm text-purple-200 font-bold space-y-1 mt-3">
                  <span className="text-amber-300 uppercase tracking-wide block font-black">🙏 SUGESTÃO DE ORAÇÃO FINAL COM A CLASSE:</span>
                  <p className="italic">"{lesson.conclusao.finalPrayer}"</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 🖥️ ABA 2: VISÃO DO PROJETOR (TELA 16:9 LIMPA PARA OS ALUNOS) */}
      {/* ========================================================= */}
      {activeTab === 'projetor' && (
        <div className="space-y-5">
          {/* Barra de Navegação do Projetor */}
          <div className="flex items-center justify-between bg-slate-900 p-3.5 rounded-2xl border border-slate-700/80 shadow-lg">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setProjectorIndex(prev => Math.max(0, prev - 1))}
                disabled={projectorIndex === 0}
                className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-30 cursor-pointer font-bold flex items-center gap-1 text-xs"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Anterior</span>
              </button>

              <span className="text-xs text-slate-300 font-bold bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
                Slide {projectorIndex + 1} de {projectorItems.length}
              </span>

              <button
                onClick={() => setProjectorIndex(prev => Math.min(projectorItems.length - 1, prev + 1))}
                disabled={projectorIndex === projectorItems.length - 1}
                className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-30 cursor-pointer font-bold flex items-center gap-1 text-xs"
              >
                <span>Próximo</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-300 font-extrabold truncate max-w-sm">
              {currentProjectorItem.title}
            </div>

            {/* Upload Modelo Próprio + Botões de Exportação */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Botão de Adicionar/Remover Imagem Apenas Neste Slide */}
              <label
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600/40 hover:bg-purple-600/60 text-purple-200 border border-purple-400/40 text-xs font-bold cursor-pointer transition-all shadow-md"
                title="Adicionar imagem ilustrativa apenas a este slide"
              >
                <span>{projectorSlideImages[projectorIndex] ? '📷 Alterar Imagem' : '🖼️ +Imagem neste Slide'}</span>
                <input type="file" accept="image/*" onChange={handleSlideImageUpload} className="hidden" />
              </label>
              {projectorSlideImages[projectorIndex] && (
                <button
                  onClick={handleRemoveSlideImage}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-red-600/20 hover:bg-red-600/40 text-red-300 border border-red-500/30 text-xs font-bold cursor-pointer transition-all"
                  title="Remover imagem deste slide e voltar ao texto 100% cheio"
                >
                  ✕ Remover Imagem
                </button>
              )}

              {/* Upload do Meu Modelo */}
              <label
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-xs font-bold cursor-pointer border border-indigo-400/40 shadow-md transition-all"
                title="Enviar imagem como fundo de todos os slides do projetor"
              >
                <LayoutTemplate className="w-3.5 h-3.5 text-amber-300" />
                <span>📁 Meu Modelo</span>
                <input type="file" accept="image/*" onChange={handleCustomBgUpload} className="hidden" />
              </label>

              {/* 1 SLIDE PNG (Rápido para testes) */}
              <button
                onClick={async () => {
                  if (isExporting) return;
                  setIsExporting('single-png');
                  try {
                    const stage = projectorStageRef.current;
                    if (!stage) return;
                    await exportSingleSlidePNG(stage, lesson.metadata.title || 'mega-ebd', projectorIndex + 1);
                  } finally {
                    setIsExporting(null);
                  }
                }}
                disabled={!!isExporting}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold cursor-pointer disabled:opacity-50 transition-colors shadow-sm"
                title="Exportar apenas o slide atual visível como imagem PNG (mais rápido para testes)"
              >
                {isExporting === 'single-png' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ImageDown className="w-3.5 h-3.5" />}
                <span>{isExporting === 'single-png' ? 'Baixando...' : '1 Slide (PNG)'}</span>
              </button>

              {/* 1 SLIDE PDF (Rápido para testes) */}
              <button
                onClick={async () => {
                  if (isExporting) return;
                  setIsExporting('single-pdf');
                  try {
                    const stage = projectorStageRef.current;
                    if (!stage) return;
                    await exportSingleSlidePDF(stage, lesson.metadata.title || 'mega-ebd', projectorIndex + 1);
                  } finally {
                    setIsExporting(null);
                  }
                }}
                disabled={!!isExporting}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold cursor-pointer disabled:opacity-50 transition-colors shadow-sm"
                title="Exportar apenas o slide atual visível como PDF (mais rápido para testes)"
              >
                {isExporting === 'single-pdf' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                <span>{isExporting === 'single-pdf' ? 'Baixando...' : '1 Slide (PDF)'}</span>
              </button>

              {/* TODOS OS SLIDES - PDF */}
              <button
                onClick={async () => {
                  if (isExporting) return;
                  setIsExporting('pdf');
                  const origIdx = projectorIndex;
                  try {
                    await exportAllSlidesPDFFromStage(
                      projectorItems.length,
                      (i) => setProjectorIndex(i),
                      () => projectorStageRef.current,
                      lesson.metadata.title || 'mega-ebd'
                    );
                  } finally {
                    setProjectorIndex(origIdx);
                    setIsExporting(null);
                  }
                }}
                disabled={!!isExporting}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-red-700 hover:bg-red-600 text-white text-xs font-bold cursor-pointer disabled:opacity-50 transition-colors shadow-sm"
                title="Exportar todos os slides em um arquivo PDF"
              >
                {isExporting === 'pdf' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                <span>{isExporting === 'pdf' ? 'Gerando...' : 'Todos (PDF)'}</span>
              </button>

              {/* TODOS OS SLIDES - PNG/ZIP */}
              <button
                onClick={async () => {
                  if (isExporting) return;
                  setIsExporting('png');
                  const origIdx = projectorIndex;
                  try {
                    await exportAllSlidesPNGZipFromStage(
                      projectorItems.length,
                      (i) => setProjectorIndex(i),
                      () => projectorStageRef.current,
                      lesson.metadata.title || 'mega-ebd'
                    );
                  } finally {
                    setProjectorIndex(origIdx);
                    setIsExporting(null);
                  }
                }}
                disabled={!!isExporting}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold cursor-pointer disabled:opacity-50 transition-colors shadow-sm"
                title="Exportar todos os slides como ZIP com PNGs"
              >
                {isExporting === 'png' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ImageDown className="w-3.5 h-3.5" />}
                <span>{isExporting === 'png' ? 'Gerando...' : 'Todos (ZIP)'}</span>
              </button>
            </div>
          </div>

          {/* PALCO DO PROJETOR 16:9 GIGANTE LIMPO DEDICADO AOS ALUNOS (MODELO OFICIAL EXATO) */}
          <div
            ref={projectorStageRef}
            className="slide-stage-wrapper rounded-3xl overflow-hidden shadow-2xl border border-slate-300 relative min-h-[520px] text-slate-900 flex flex-col justify-between p-6 pt-3 pb-4"
            style={customBg ? { backgroundImage: `url(${customBg})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: 'transparent' } : { backgroundColor: 'white' }}
          >


            {/* Bloco Central do Slide */}
            {(() => {
              // 1. CAPA DA LIÇÃO (SLIDE 1)
              if (currentProjectorItem.type === 'cover') {
                const coverBadge = currentProjectorItem.badgeText || lesson.metadata.lessonNumber || 'LIÇÃO 10';
                const curSlideImg = projectorSlideImages[projectorIndex];
                return (
                  <div className="relative z-10 w-full h-full max-w-5xl mx-auto flex flex-col justify-between items-center my-auto py-2 font-gotham">
                    {/* Tarja Laranja no Topo: Escreve "LIÇÃO 10" */}
                    <div className="w-full shrink-0 flex flex-col items-center justify-center font-gotham font-bold h-20 md:h-24 mt-5 md:mt-6 pt-2 pl-[18%] pr-6">
                      <span className="text-xl md:text-3xl lg:text-4xl font-bold text-white tracking-wider block text-center drop-shadow-sm uppercase" style={{ fontFamily: "'Gotham', 'Gotham Medium', sans-serif", fontWeight: 700 }}>
                        {coverBadge}
                      </span>
                    </div>

                    {curSlideImg ? (
                      <div className="flex-1 w-full flex items-center justify-between gap-6 px-6 py-4 mt-12 md:mt-16 my-auto">
                        <div className="w-[58%] shrink-0 flex flex-col items-center justify-center text-center space-y-4">
                          <h1 className="text-xl md:text-3xl lg:text-4xl font-black text-yellow-400 uppercase tracking-tight leading-tight max-w-4xl font-sans drop-shadow-sm">
                            {currentProjectorItem.title}
                          </h1>
                          {currentProjectorItem.subtitle && (
                            <>
                              <div className="w-4/5 border-b border-slate-200/40 my-2 mx-auto" />
                              <p className="text-sm md:text-lg font-bold text-slate-200 max-w-3xl font-sans leading-relaxed">
                                {currentProjectorItem.subtitle}
                              </p>
                            </>
                          )}
                        </div>
                        <div className="w-[38%] shrink-0 flex items-center justify-center">
                              <img
                                src={curSlideImg}
                                alt="Ilustração do Slide"
                                className="max-h-[310px] max-w-full object-contain filter drop-shadow-[0_12px_24px_rgba(0,0,0,0.7)] transition-all"
                              />
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 w-full flex flex-col items-center justify-center text-center px-6 py-4 mt-12 md:mt-16 space-y-4 my-auto">
                        <h1 className="text-2xl md:text-4xl lg:text-5xl font-black text-yellow-400 uppercase tracking-tight leading-tight max-w-4xl font-sans drop-shadow-sm">
                          {currentProjectorItem.title}
                        </h1>
                        {currentProjectorItem.subtitle && (
                          <>
                            <div className="w-4/5 max-w-2xl border-b border-slate-200/40 my-3 mx-auto" />
                            <p className="text-base md:text-xl lg:text-2xl font-bold text-slate-200 max-w-3xl font-sans leading-relaxed">
                              {currentProjectorItem.subtitle}
                            </p>
                          </>
                        )}
                      </div>
                    )}

                    <div className="w-full shrink-0 h-8" />
                  </div>
                );
              }

              const PROPER_NOUNS = [
                'Deus', 'Jesus', 'Cristo', 'Espírito', 'Santo', 'Senhor', 'Pai', 'Filho',
                'Paulo', 'Pedro', 'João', 'Ananias', 'Félix', 'Tértulo', 'Festos', 'Agripa',
                'Sinédrio', 'Jerusalém', 'Israel', 'Evangelho', 'Bíblia', 'Trófimo', 'Ásia',
                'Roma', 'Lei', 'EBD', 'MegaEBD', 'Igreja'
              ];
              const toCaixaBaixa = (text: string) => {
                if (!text) return '';
                let res = text.trim();
                res = res.charAt(0).toUpperCase() + res.slice(1).toLowerCase();
                PROPER_NOUNS.forEach(noun => {
                  const regex = new RegExp(`\\b${noun}\\b`, 'gi');
                  res = res.replace(regex, noun);
                });
                return res;
              };
              const badgeText = currentProjectorItem.badgeText || 'MEGA EBD';
              const subMatch = badgeText.match(/^(SUBTÓPICO\s+[\d|A-Z]+|SUBT\.?)\s*[:\—\-]\s*(.+)$/i);
              const topMatch = badgeText.match(/^(TÓPICO\s+[I|V|X|\d]+)\s*[:\—\-]\s*(.+)$/i);
              
              let mainTitle = badgeText;
              let isSubtopic = false;

              if (subMatch) {
                mainTitle = subMatch[2].trim();
                isSubtopic = true;
              } else if (topMatch) {
                mainTitle = topMatch[2].trim();
                isSubtopic = false;
              } else if (badgeText.toUpperCase().includes('SUBT') || badgeText.toUpperCase().includes('SUBTÓPICO')) {
                isSubtopic = true;
              }

              // Remove qualquer prefixo tipo "Subtópico 1", "Subt.", "Subt 2" e referências do tipo (vv.1,2)
              let cleanTitle = mainTitle
                .replace(/^(subtópico\s*[\d|A-Z]*|subt\.?\s*[\d|A-Z]*)\s*[\:\.\—\-]?\s*/i, '')
                .replace(/\s*\(\s*v{1,2}\.?\s*[\d\s\,\–\-\.\;]+\)/gi, '')
                .trim();

              const displayText = isSubtopic ? toCaixaBaixa(cleanTitle) : cleanTitle.toUpperCase();

              return (
                <div className="relative z-10 w-full h-full max-w-5xl mx-auto flex flex-col justify-between items-center my-auto py-2 font-gotham">
                  {/* Título Principal no topo do slide (Centralizado a partir de 25% / 2/8, Fonte Montaser Arabic) */}
                  <div className="w-full shrink-0 flex flex-col items-center justify-center font-gotham font-bold h-20 md:h-24 mt-5 md:mt-6 pt-2 pl-[18%] pr-6 my-auto">
                    <span className={`text-xl md:text-3xl lg:text-4xl font-bold text-white tracking-wider block text-center drop-shadow-sm line-clamp-2 ${isSubtopic ? 'normal-case' : 'uppercase'}`} style={{ fontFamily: "'Gotham', 'Gotham Medium', sans-serif", fontWeight: 700 }}>
                      {displayText}
                    </span>
                  </div>

                  {/* CONTEÚDO CENTRALIZADO VERTICALMENTE NA TELA */}
                  {(() => {
                    const curSlideImg = projectorSlideImages[projectorIndex];
                    if (curSlideImg) {
                      return (
                        <div className="w-full flex-1 flex items-center justify-between gap-6 px-4 py-2 my-auto mt-[5%]">
                          {/* Coluna Esquerda: Texto adaptado (58%) */}
                          <div className="w-[58%] shrink-0 flex flex-col justify-center items-center text-center space-y-3">
                            {currentProjectorItem.type === 'leitura' ? (
                              <>
                                {currentProjectorItem.reference && (
                                  <h3 className="text-2xl md:text-3xl lg:text-4xl font-black text-yellow-400 tracking-wide font-sans text-center mb-2 w-full">
                                    {currentProjectorItem.reference}
                                  </h3>
                                )}
                                <div className="w-full space-y-3 text-left font-sans max-h-[280px] overflow-y-auto pr-1">
                                  {(currentProjectorItem.projetorText || '').split('\n').filter(l => l.trim()).map((line, idx) => {
                                    const match = line.match(/^(\d{1,3})\s*(?:[—\-–\.]\s*)?(.+)$/);
                                    if (match) {
                                      return (
                                        <div key={idx} className="flex items-start gap-3 text-left w-full py-1.5 border-b border-slate-200/40 last:border-0">
                                          <span className="shrink-0 font-black text-white text-2xl md:text-4xl lg:text-5xl leading-none mt-0.5">{match[1]}</span>
                                          <p className="font-extrabold text-white text-base md:text-xl lg:text-2xl leading-snug break-words flex-1">{match[2]}</p>
                                        </div>
                                      );
                                    }
                                    return <p key={idx} className="font-extrabold text-white text-base md:text-xl lg:text-2xl leading-snug break-words text-left">{line}</p>;
                                  })}
                                </div>
                              </>
                            ) : currentProjectorItem.type === 'conclusao' || currentProjectorItem.type === 'topic_synopsis' ? (
                              <p className="text-xl md:text-3xl lg:text-4xl font-extrabold leading-relaxed text-white text-center font-sans break-words">
                                "{currentProjectorItem.projetorText}"
                              </p>
                            ) : currentProjectorItem.type === 'verdades' ? (
                              <div className="w-full space-y-3 text-left font-sans">
                                {currentProjectorItem.bulletPoints?.map((point, idx) => (
                                  <div key={idx} className="flex items-start gap-3 py-1.5">
                                    <span className="mt-0.5 shrink-0 w-7 h-7 rounded-full bg-[#091b2c] flex items-center justify-center text-white text-xs font-black">{idx + 1}</span>
                                    <p className="text-base md:text-xl lg:text-2xl font-bold leading-snug text-white font-sans break-words">{point}</p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <>
                                {currentProjectorItem.ideiaText && (
                                  <h2 className="text-2xl md:text-4xl lg:text-5xl font-black text-yellow-400 tracking-wide font-sans text-center mb-1.5 break-words">
                                    {currentProjectorItem.ideiaText}
                                  </h2>
                                )}
                                {currentProjectorItem.reference && (
                                  <h3 className="text-2xl md:text-3xl lg:text-4xl font-black text-yellow-400 tracking-wide font-sans text-center mb-1.5 w-full">
                                    {currentProjectorItem.reference}
                                  </h3>
                                )}
                                {(currentProjectorItem.ideiaText || currentProjectorItem.reference) && currentProjectorItem.projetorText && (
                                  <div className="w-4/5 border-b border-slate-200/40 my-2 mx-auto" />
                                )}
                                {currentProjectorItem.projetorText && (
                                  <p className="text-xl md:text-3xl lg:text-4xl font-extrabold leading-relaxed font-sans text-white text-center break-words">
                                    {currentProjectorItem.projetorText}
                                  </p>
                                )}
                              </>
                            )}
                          </div>

                            <div className="w-[38%] shrink-0 flex items-center justify-center">
                              <img
                                src={curSlideImg}
                                alt="Ilustração do Slide"
                                className="max-h-[310px] max-w-full object-contain filter drop-shadow-[0_12px_24px_rgba(0,0,0,0.7)] transition-all"
                              />
                            </div>
                        </div>
                      );
                    }

                    // SE NÃO HOUVER IMAGEM (100% TEXTO CHEIO NORMAL)
                    return currentProjectorItem.type === 'leitura' ? (
                      <div className="w-full flex-1 flex flex-col justify-center items-center text-center space-y-4 py-4 my-auto mt-[5%]">
                        {currentProjectorItem.reference && (
                          <h3 className="text-2xl md:text-3xl lg:text-4xl font-black text-yellow-400 tracking-wide font-sans text-center mb-2 w-full">
                            {currentProjectorItem.reference}
                          </h3>
                        )}
                        <div className="w-full space-y-4 text-left font-sans">
                          {(currentProjectorItem.projetorText || '').split('\n').filter(l => l.trim()).map((line, idx) => {
                            const match = line.match(/^(\d{1,3})\s*(?:[—\-–\.]\s*)?(.+)$/);
                            if (match) {
                              return (
                                <div key={idx} className="flex items-start gap-4 text-left w-full py-2 border-b border-slate-200/60 last:border-0">
                                  <span className="shrink-0 font-black text-white text-3xl md:text-5xl lg:text-6xl leading-none mt-1">
                                    {match[1]}
                                  </span>
                                  <p className="font-extrabold text-white text-lg md:text-2xl lg:text-3xl leading-snug md:leading-normal break-words flex-1">
                                    {match[2]}
                                  </p>
                                </div>
                              );
                            }
                            return (
                              <p key={idx} className="font-extrabold text-white text-lg md:text-2xl lg:text-3xl leading-snug md:leading-normal break-words text-left">
                                {line}
                              </p>
                            );
                          })}
                        </div>
                      </div>
                    ) : currentProjectorItem.type === 'conclusao' ? (
                      <div className="w-full flex-1 flex flex-col justify-center items-center text-center py-4 my-auto mt-[5%]">
                        <p className="text-xl md:text-2xl lg:text-3xl font-extrabold leading-relaxed text-white text-center font-sans break-words max-w-4xl">
                          "{currentProjectorItem.projetorText}"
                        </p>
                      </div>
                    ) : currentProjectorItem.type === 'verdades' ? (
                      <div className="w-full flex-1 flex flex-col justify-center items-start py-4 my-auto mt-[5%]">
                        {currentProjectorItem.bulletPoints?.map((point, idx) => (
                          <div key={idx} className="w-full">
                            <div className="flex items-start gap-3 py-2.5">
                              <span className="mt-1 shrink-0 w-7 h-7 rounded-full bg-[#091b2c] flex items-center justify-center text-white text-xs font-black font-sans">{idx + 1}</span>
                              <p className="text-base md:text-xl lg:text-2xl font-bold leading-snug text-white font-sans text-left break-words">
                                {point}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      /* DEMAIS CARDS */
                      <div className="w-full flex-1 flex flex-col justify-center items-center text-center space-y-3 py-4 my-auto mt-[5%]">
                        {currentProjectorItem.type === 'topic_synopsis' ? (
                          <p className="text-xl md:text-2xl lg:text-3xl font-extrabold leading-relaxed text-white text-center font-sans break-words max-w-4xl">
                            "{currentProjectorItem.projetorText}"
                          </p>
                        ) : (
                          <>
                            {currentProjectorItem.ideiaText && (
                              <h2 className="text-2xl md:text-4xl lg:text-5xl font-black text-yellow-400 tracking-wide font-sans text-center mb-2 break-words">
                                {currentProjectorItem.ideiaText}
                              </h2>
                            )}
                            {currentProjectorItem.reference && (
                              <h3 className="text-2xl md:text-3xl lg:text-4xl font-black text-yellow-400 tracking-wide font-sans text-center mb-2 w-full">
                                {currentProjectorItem.reference}
                              </h3>
                            )}
                            {(currentProjectorItem.ideiaText || currentProjectorItem.reference) && currentProjectorItem.projetorText && (
                              <div className="w-4/5 max-w-2xl border-b border-slate-200/40 my-3 mx-auto" />
                            )}
                            {currentProjectorItem.projetorText && (
                              <p className="text-xl md:text-2xl lg:text-3xl font-extrabold leading-relaxed font-sans text-white text-center max-w-4xl break-words">
                                {currentProjectorItem.projetorText}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })()}

                  {/* Spacer inferior para equilibrar o título do topo */}
                  <div className="w-full shrink-0 h-8" />
                </div>
              );
            })()}

            {/* Rodapé do Projetor com Slide Number */}
            <div className="relative z-10 flex justify-between items-center text-xs font-bold text-slate-500 border-t border-slate-200 pt-3">
              <span>MegaEBD • {lesson.metadata.title}</span>
              <span>{projectorIndex + 1} / {projectorItems.length}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

