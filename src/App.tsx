import { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { ContentInput } from './components/ContentInput';
import { LessonPreparationView } from './components/LessonPreparationView';
import { ApiKeyModal } from './components/ApiKeyModal';
import type { EBDLessonPreparation, TranscriptionSource, PreparationOptions } from './types';
import { runLessonPreparerEngine } from './services/ebdLessonPreparerEngine';
import { setStoredApiKey, getStoredApiKey } from './services/geminiService';
import { decodeLessonFromUrl, loadSharedLessonFromUrlAsync } from './services/shareService';
import {
  saveLessonToStorage,
  loadLessonFromStorage,
  clearLessonFromStorage,
  requestPersistentStorage,
  exportLessonToFile,
  importLessonFromFile,
} from './services/storageService';
import { AlertCircle, RefreshCw } from 'lucide-react';

const LESSON_STORAGE_KEY = 'megaebd_lesson_data';

export function App() {
  const [apiKey, setApiKey] = useState<string>('');
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
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

    // 🔄 Fallback síncrono rápido enquanto IndexedDB carrega
    try {
      const saved = localStorage.getItem(LESSON_STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // 🚀 Carregamento robusto e recuperação de imagens via IndexedDB ao iniciar
  useEffect(() => {
    // Solicita persistência incondicional no navegador
    requestPersistentStorage();

    // Carrega do IndexedDB (que não tem limitação de 5MB)
    const loadFromDb = async () => {
      try {
        const stored = await loadLessonFromStorage();
        if (stored) {
          setLessonData((prev) => {
            // Se já tem dados de URL, não sobrescreve
            if (decodeLessonFromUrl()) return prev;
            // Se o que veio do banco tem mais dados ou imagens, adota
            return stored;
          });
        }
      } catch (err) {
        console.error('[App] Erro ao carregar lição do banco:', err);
      }
    };

    loadFromDb();
  }, []);

  // 💾 Salva automaticamente toda vez que lessonData mudar (com debounce e IndexedDB)
  const saveTimeoutRef = useRef<any>(null);
  useEffect(() => {
    if (lessonData) {
      setSaveStatus('saving');
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      saveTimeoutRef.current = setTimeout(async () => {
        try {
          await saveLessonToStorage(lessonData);
          setSaveStatus('saved');
        } catch {
          setSaveStatus('idle');
        }
      }, 350);
    } else {
      setSaveStatus('idle');
    }

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
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

  const handleReset = async () => {
    setLessonData(null);
    setError(null);
    setSaveStatus('idle');
    await clearLessonFromStorage();
  };

  const handleExportLesson = () => {
    if (lessonData) {
      exportLessonToFile(lessonData);
    }
  };

  const handleImportLessonFile = async (file: File) => {
    try {
      setIsLoading(true);
      setError(null);
      const imported = await importLessonFromFile(file);
      setLessonData(imported);
      await saveLessonToStorage(imported);
      setSaveStatus('saved');
    } catch (err: any) {
      setError(err.message || 'Erro ao importar arquivo de aula.');
    } finally {
      setIsLoading(false);
    }
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
        saveStatus={saveStatus}
        onExportLesson={handleExportLesson}
        onImportLesson={handleImportLessonFile}
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
            onImportLesson={handleImportLessonFile}
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
