import { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { ContentInput } from './components/ContentInput';
import { LessonPreparationView } from './components/LessonPreparationView';
import { ApiKeyModal } from './components/ApiKeyModal';
import type { EBDLessonPreparation, TranscriptionSource, PreparationOptions } from './types';
import { runLessonPreparerEngine } from './services/ebdLessonPreparerEngine';
import { setStoredApiKey, getStoredApiKey } from './services/geminiService';
import { decodeLessonFromUrl, loadSharedLessonFromUrlAsync } from './services/shareService';
import { AlertCircle, RefreshCw } from 'lucide-react';

const LESSON_STORAGE_KEY = 'megaebd_lesson_data';

export function App() {
  const [apiKey, setApiKey] = useState<string>('');
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSyncingSharedLesson, setIsSyncingSharedLesson] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return (
        window.location.search.includes('share=') ||
        window.location.search.includes('id=') ||
        window.location.hash.includes('share=')
      );
    }
    return false;
  });
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'professor' | 'projetor'>('projetor');
  
  const [lessonData, setLessonData] = useState<EBDLessonPreparation | null>(() => {
    // 🔗 Tenta primeiro carregar lição recebida via URL direta/QR Code
    const fromUrl = decodeLessonFromUrl();
    if (fromUrl) return fromUrl;

    // 🔄 Fallback: carrega preparação salva no navegador
    try {
      const saved = localStorage.getItem(LESSON_STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // 💾 Salva automaticamente toda vez que lessonData mudar
  useEffect(() => {
    if (lessonData) {
      try {
        localStorage.setItem(LESSON_STORAGE_KEY, JSON.stringify(lessonData));
      } catch {
        // Se localStorage estiver cheio, ignora silenciosamente
      }
    }
  }, [lessonData]);

  // Carrega lição da URL se a página for aberta via QR Code ou quando a URL mudar
  useEffect(() => {
    const handleUrlChange = async () => {
      const fromUrl = decodeLessonFromUrl();
      if (fromUrl) {
        setLessonData(fromUrl);
        return;
      }

      // Se houver parâmetro de compartilhamento na nuvem, busca assincronamente com todas as imagens
      const hasShare = (
        window.location.search.includes('share=') ||
        window.location.search.includes('id=') ||
        window.location.hash.includes('share=')
      );
      if (hasShare) {
        setIsSyncingSharedLesson(true);
        try {
          const remote = await loadSharedLessonFromUrlAsync();
          if (remote) {
            setLessonData(remote);
          }
        } finally {
          setIsSyncingSharedLesson(false);
        }
      }
    };

    handleUrlChange();
    window.addEventListener('hashchange', handleUrlChange);
    window.addEventListener('popstate', handleUrlChange);
    return () => {
      window.removeEventListener('hashchange', handleUrlChange);
      window.removeEventListener('popstate', handleUrlChange);
    };
  }, []);

  // Carrega a chave do localStorage ao iniciar
  useEffect(() => {
    const savedKey = getStoredApiKey() || localStorage.getItem('mega_slides_gemini_key') || '';
    if (savedKey) {
      setApiKey(savedKey);
      setStoredApiKey(savedKey);
    } else {
      setIsApiKeyModalOpen(true);
    }
  }, []);

  const handleSaveApiKey = (key: string) => {
    setApiKey(key);
    setStoredApiKey(key);
    localStorage.setItem('mega_slides_gemini_key', key);
  };

  const handleGeneratePreparation = async (
    revistaText: string,
    transcriptions: TranscriptionSource[],
    options: PreparationOptions
  ) => {
    if (!apiKey) {
      setIsApiKeyModalOpen(true);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      setStoredApiKey(apiKey);
      const data = await runLessonPreparerEngine(revistaText, transcriptions, options);
      setLessonData(data);
    } catch (err: any) {
      setError(err.message || 'Ocorreu um erro ao realizar a preparação inteligente da aula.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setLessonData(null);
    setError(null);
    // 🗑️ Limpa a preparação salva ao recomeçar
    localStorage.removeItem(LESSON_STORAGE_KEY);
    localStorage.removeItem('mega_ebd_text_highlights_v2');
  };

  return (
    <div className="app-container font-['Gotham'] font-medium">
      <Header
        hasApiKey={Boolean(apiKey)}
        onOpenApiKeyModal={() => setIsApiKeyModalOpen(true)}
        hasLesson={Boolean(lessonData)}
        onReset={handleReset}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      <main>
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-xl mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p className="text-sm font-medium">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-xs bg-red-500/20 hover:bg-red-500/30 px-3 py-1.5 rounded-lg font-semibold cursor-pointer"
            >
              Fechar
            </button>
          </div>
        )}

        {!lessonData ? (
          <ContentInput
            onGenerate={handleGeneratePreparation}
            isLoading={isLoading}
            hasApiKey={Boolean(apiKey)}
            onOpenApiKeyModal={() => setIsApiKeyModalOpen(true)}
          />
        ) : (
          <LessonPreparationView
            lessonData={lessonData}
            onReset={handleReset}
            onUpdateLesson={(updated) => setLessonData(updated)}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
          />
        )}
        {isSyncingSharedLesson && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/80 backdrop-blur-md text-white p-4 animate-in fade-in">
            <div className="flex flex-col items-center gap-4 p-6 sm:p-8 bg-slate-900 border border-cyan-500/30 rounded-3xl shadow-2xl max-w-sm text-center">
              <div className="w-14 h-14 rounded-2xl bg-cyan-600/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                <RefreshCw className="w-7 h-7 animate-spin" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black text-white">Carregando Lição Sincronizada</h3>
                <p className="text-xs text-slate-400">
                  Baixando todos os slides, imagens e anotações do professor...
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        onSaveKey={handleSaveApiKey}
        currentKey={apiKey}
      />
    </div>
  );
}

export default App;
