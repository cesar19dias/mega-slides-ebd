import React, { useState } from 'react';
import { Upload, FileText, Sparkles, BookOpen, FileCheck, Layers, Cpu, Plus, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';
import type { TranscriptionSource, PreparationOptions, DepthControl } from '../types';
import { extractTextFromPDF } from '../services/pdfService';

interface ContentInputProps {
  onGenerate: (revistaText: string, transcriptions: TranscriptionSource[], options: PreparationOptions) => void;
  isLoading: boolean;
  hasApiKey: boolean;
  onOpenApiKeyModal: () => void;
}

export const ContentInput: React.FC<ContentInputProps> = ({
  onGenerate,
  isLoading,
  hasApiKey,
  onOpenApiKeyModal,
}) => {
  // 1. REVISTA DA EBD (Texto ou PDF/DOCX)
  const [revistaInputType, setRevistaInputType] = useState<'text' | 'file'>('text');
  const [revistaTextContent, setRevistaTextContent] = useState('');
  const [revistaFile, setRevistaFile] = useState<File | null>(null);
  const [isReadingRevista, setIsReadingRevista] = useState(false);

  // 2. TRANSCRIÇÕES (Mínimo 2 Obrigatórias)
  const [transcriptions, setTranscriptions] = useState<TranscriptionSource[]>([
    { id: '1', title: 'Transcrição 1 (Ex: Pr. Priscilo / Pregação)', content: '' },
    { id: '2', title: 'Transcrição 2 (Ex: Pr. EBD / Comentário)', content: '' }
  ]);

  // 3. OPÇÕES DE PREPARAÇÃO
  const [options, setOptions] = useState<PreparationOptions>({
    depth: 'detalhada',
    selectedAiModel: 'gemini-3.6-flash',
    bibleVersion: 'ARC',
    includePentecostalApplication: true
  });

  // Handler para Upload da Revista em PDF
  const handleRevistaFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setRevistaFile(file);
    setIsReadingRevista(true);

    try {
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        const extracted = await extractTextFromPDF(file);
        setRevistaTextContent(extracted);
      } else {
        const text = await file.text();
        setRevistaTextContent(text);
      }
    } catch (err: any) {
      alert(`Erro ao ler arquivo da revista: ${err.message}`);
    } finally {
      setIsReadingRevista(false);
    }
  };

  // Handler para Upload de Arquivo de Transcrição
  const handleTranscriptionFileChange = async (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      let content = '';
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        content = await extractTextFromPDF(file);
      } else {
        content = await file.text();
      }

      setTranscriptions(prev => prev.map(t => {
        if (t.id === id) {
          return {
            ...t,
            title: t.title.includes('Ex:') ? file.name : t.title,
            fileName: file.name,
            content: content
          };
        }
        return t;
      }));
    } catch (err: any) {
      alert(`Erro ao ler arquivo da transcrição: ${err.message}`);
    }
  };

  // Adicionar Nova Transcrição
  const addTranscriptionField = () => {
    const newId = String(transcriptions.length + 1);
    setTranscriptions(prev => [
      ...prev,
      { id: newId, title: `Transcrição ${newId}`, content: '' }
    ]);
  };

  // Remover Transcrição
  const removeTranscriptionField = (id: string) => {
    if (transcriptions.length <= 2) {
      alert('O sistema exige no mínimo 2 transcrições para realizar o cruzamento de fontes.');
      return;
    }
    setTranscriptions(prev => prev.filter(t => t.id !== id));
  };

  // Atualizar Conteúdo de uma Transcrição
  const updateTranscriptionContent = (id: string, content: string) => {
    setTranscriptions(prev => prev.map(t => t.id === id ? { ...t, content } : t));
  };

  // Atualizar Título de uma Transcrição
  const updateTranscriptionTitle = (id: string, title: string) => {
    setTranscriptions(prev => prev.map(t => t.id === id ? { ...t, title } : t));
  };

  // Transcrições válidas preenchidas
  const validTranscriptions = transcriptions.filter(t => t.content && t.content.trim().length > 30);
  const isValidToSubmit = revistaTextContent.trim().length > 30 && validTranscriptions.length >= 2;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!hasApiKey) {
      onOpenApiKeyModal();
      return;
    }

    if (!revistaTextContent || revistaTextContent.trim().length < 30) {
      alert('Por favor, forneça o texto ou arquivo da Revista da EBD.');
      return;
    }

    if (validTranscriptions.length < 2) {
      alert('Atenção: É obrigatório fornecer pelo menos 2 TRANSCRIÇÕES com conteúdo para que o MegaEBD possa realizar o cruzamento de fontes!');
      return;
    }

    onGenerate(revistaTextContent, validTranscriptions, options);
  };

  return (
    <form onSubmit={handleSubmit} className="input-card-container space-y-6 max-w-5xl mx-auto font-['Montserrat']">
      {/* Banner Informativo do Princípio Fundamental */}
      <div className="bg-gradient-to-r from-blue-900/40 via-indigo-900/40 to-slate-900/80 border border-blue-500/30 p-4 rounded-2xl flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-300 font-black text-lg">
            📖
          </div>
          <div>
            <h3 className="font-extrabold text-white text-sm">PROJETO MEGA EBD — PREPARADOR INTELIGENTE DE AULAS</h3>
            <p className="text-xs text-slate-300 mt-0.5">
              Revista EBD + Mínimo 2 Transcrições → Cruzamento Teológico & Dupla Camada (Professor x Projetor)
            </p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 bg-slate-950/60 px-3 py-1.5 rounded-xl border border-slate-700/80 text-[11px] font-bold text-slate-300">
          <span>Bíblia</span> ➔ <span>Revista</span> ➔ <span>Transcrições</span>
        </div>
      </div>

      {/* SEÇÃO 1: REVISTA DA EBD */}
      <div className="bg-slate-900/80 border border-slate-700/80 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
          <div className="flex items-center gap-2.5 text-white font-extrabold text-base">
            <BookOpen className="w-5 h-5 text-amber-400" />
            <span>1. REVISTA DA EBD (Estrutura Oficial da Lição)</span>
          </div>

          <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setRevistaInputType('text')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${revistaInputType === 'text' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Colar Texto
            </button>
            <button
              type="button"
              onClick={() => setRevistaInputType('file')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${revistaInputType === 'file' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Enviar PDF/DOCX
            </button>
          </div>
        </div>

        {revistaInputType === 'text' ? (
          <textarea
            placeholder="Cole aqui o texto oficial da lição da Revista EBD (Texto Áureo, Verdade Prática, Leitura Bíblica em Classe, Tópicos I, II, III...)"
            value={revistaTextContent}
            onChange={(e) => setRevistaTextContent(e.target.value)}
            rows={6}
            className="text-area-input font-['Montserrat'] text-xs md:text-sm leading-relaxed"
          />
        ) : (
          <div className="file-dropzone border-2 border-dashed border-slate-700 hover:border-blue-500 rounded-xl p-6 text-center cursor-pointer transition-colors bg-slate-950/40">
            <input
              type="file"
              accept=".pdf,.txt,.docx"
              onChange={handleRevistaFileChange}
              id="revista-file-input"
              className="hidden"
            />
            <label htmlFor="revista-file-input" className="cursor-pointer block">
              <Upload className="w-8 h-8 text-amber-400 mx-auto mb-2" />
              {revistaFile ? (
                <div>
                  <p className="font-bold text-white text-sm">{revistaFile.name}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {(revistaFile.size / 1024 / 1024).toFixed(2)} MB • {isReadingRevista ? 'Lendo revista...' : 'Texto extraído com sucesso!'}
                  </p>
                </div>
              ) : (
                <div>
                  <p className="font-bold text-slate-200 text-sm">Clique para selecionar o PDF da Revista EBD</p>
                  <p className="text-xs text-slate-400 mt-1">Suporta arquivos PDF, DOCX e TXT da CPAD / EBD</p>
                </div>
              )}
            </label>
          </div>
        )}
      </div>

      {/* SEÇÃO 2: TRANSCRIÇÕES DE APOIO (MÍNIMO 2 OBRIGATÓRIAS) */}
      <div className="bg-slate-900/80 border border-slate-700/80 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/60 pb-3">
          <div className="flex items-center gap-2.5 text-white font-extrabold text-base">
            <FileText className="w-5 h-5 text-indigo-400" />
            <span>2. TRANSCRIÇÕES DE APOIO (Mínimo 2 Obrigatórias)</span>
          </div>

          <div className="flex items-center gap-2">
            {validTranscriptions.length >= 2 ? (
              <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                {validTranscriptions.length} Transcrições Prontas
              </span>
            ) : (
              <span className="text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" />
                Adicione no mínimo 2 transcrições ({validTranscriptions.length}/2)
              </span>
            )}

            <button
              type="button"
              onClick={addTranscriptionField}
              className="bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Adicionar Transcrição</span>
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-300">
          As transcrições são a base principal que a IA usará para explicar os versículos e desenvolver os subtópicos.
        </p>

        {/* Lista de Transcrições */}
        <div className="space-y-4">
          {transcriptions.map((t, index) => (
            <div key={t.id} className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <input
                  type="text"
                  value={t.title}
                  onChange={(e) => updateTranscriptionTitle(t.id, e.target.value)}
                  placeholder={`Título da Transcrição ${index + 1}`}
                  className="bg-slate-900 border border-slate-700 text-white font-bold text-xs md:text-sm px-3 py-1.5 rounded-lg outline-none focus:border-indigo-400 flex-1"
                />

                <div className="flex items-center gap-2">
                  <label className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all flex items-center gap-1">
                    <Upload className="w-3.5 h-3.5 text-blue-400" />
                    <span>{t.fileName ? 'Alterar Arquivo' : 'Enviar Arquivo'}</span>
                    <input
                      type="file"
                      accept=".pdf,.txt,.docx"
                      onChange={(e) => handleTranscriptionFileChange(t.id, e)}
                      className="hidden"
                    />
                  </label>

                  {transcriptions.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeTranscriptionField(t.id)}
                      className="text-red-400 hover:text-red-300 p-1.5 rounded-lg hover:bg-red-500/10 transition-all cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <textarea
                placeholder={`Cole aqui o texto completo da Transcrição ${index + 1} (Vídeo do YouTube, áudio transcrito, estudo em áudio)...`}
                value={t.content}
                onChange={(e) => updateTranscriptionContent(t.id, e.target.value)}
                rows={4}
                className="text-area-input font-['Montserrat'] text-xs leading-relaxed"
              />

              {t.content && t.content.trim().length > 30 && (
                <div className="flex items-center gap-2 text-[11px] text-emerald-400 font-semibold">
                  <FileCheck className="w-3.5 h-3.5" />
                  <span>{t.content.length.toLocaleString()} caracteres lidos com sucesso.</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* SEÇÃO 3: CONTROLE DE PROFUNDIDADE & CONFIGURAÇÕES */}
      <div className="bg-slate-900/80 border border-slate-700/80 rounded-2xl p-5 space-y-4">
        <h3 className="font-extrabold text-white text-base flex items-center gap-2 border-b border-slate-700/60 pb-3">
          <Layers className="w-5 h-5 text-purple-400" />
          <span>3. CONTROLE DE PROFUNDIDADE DA AULA</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Seletor de Profundidade */}
          <div className="option-card">
            <label className="option-title">
              <Layers className="w-4 h-4 text-purple-400" />
              <span>Nível de Profundidade</span>
            </label>
            <select
              value={options.depth}
              onChange={(e) => setOptions({ ...options, depth: e.target.value as DepthControl })}
              className="select-input"
            >
              <option value="resumida">Resumida (Mais direta)</option>
              <option value="detalhada">Detalhada (Recomendado)</option>
              <option value="aprofundada">Aprofundada (Máxima riqueza bíblica)</option>
            </select>
          </div>

          {/* Modelo de IA */}
          <div className="option-card">
            <label className="option-title">
              <Cpu className="w-4 h-4 text-cyan-400" />
              <span>Modelo de IA (Gemini)</span>
            </label>
            <select
              value={options.selectedAiModel}
              onChange={(e) => setOptions({ ...options, selectedAiModel: e.target.value })}
              className="select-input"
            >
              <option value="gemini-3.6-flash">Gemini 3.6 Flash (Mais Recente e Rápido)</option>
              <option value="gemini-3.6-pro">Gemini 3.6 Pro (Máxima Precisão Teológica)</option>
              <option value="gemini-2.5-flash">Gemini 2.5 Flash (Equilibrado)</option>
              <option value="gemini-2.0-flash">Gemini 2.0 Flash (Ultra Rápido)</option>
            </select>
          </div>

          {/* Aplicação Pentecostal */}
          <div className="option-card">
            <label className="option-title">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Ênfase Doutrinária</span>
            </label>
            <select
              value={options.includePentecostalApplication ? 'yes' : 'no'}
              onChange={(e) => setOptions({ ...options, includePentecostalApplication: e.target.value === 'yes' })}
              className="select-input"
            >
              <option value="yes">Incluir Aplicação Pentecostal</option>
              <option value="no">Geral Cristã</option>
            </select>
          </div>
        </div>
      </div>

      {/* BOTÃO DE GERAÇÃO INTELIGENTE DA AULA */}
      <button
        type="submit"
        disabled={isLoading || !isValidToSubmit}
        className={`generate-btn w-full font-black py-4 px-6 rounded-2xl shadow-xl flex items-center justify-center gap-3 transition-all cursor-pointer ${
          isValidToSubmit 
            ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-blue-600/30 hover:scale-[1.01]' 
            : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
        }`}
      >
        {isLoading ? (
          <>
            <div className="spinner" />
            <span className="animate-pulse text-base md:text-lg">Cruzando Revista + Transcrições e Gerando Preparação...</span>
          </>
        ) : (
          <>
            <Sparkles className="w-6 h-6 text-amber-300" />
            <span className="text-base md:text-lg font-black tracking-wide">
              {isValidToSubmit ? '🧠 PREPARAR AULA EBD COMPLETA' : '⚠️ ADICIONE A REVISTA + 2 TRANSCRIÇÕES PARA ATIVAR'}
            </span>
          </>
        )}
      </button>
    </form>
  );
};
