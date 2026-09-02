import { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { ContentInput } from './components/ContentInput';
import { LessonPreparationView } from './components/LessonPreparationView';
import { ApiKeyModal } from './components/ApiKeyModal';
import type { EBDLessonPreparation, TranscriptionSource, PreparationOptions } from './types';
import { runLessonPreparerEngine } from './services/ebdLessonPreparerEngine';
import { setStoredApiKey, getStoredApiKey } from './services/geminiService';
import { AlertCircle } from 'lucide-react';

const LESSON_STORAGE_KEY = 'megaebd_lesson_data';

export function App() {
  const [apiKey, setApiKey] = useState<string>('');
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  const [lessonData, setLessonData] = useState<EBDLessonPreparation | null>(() => {
    // 🔄 Carrega preparação salva ao iniciar o app
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
  };

  return (
    <div className="app-container font-['Gotham'] font-medium">
      <Header
        hasApiKey={Boolean(apiKey)}
        onOpenApiKeyModal={() => setIsApiKeyModalOpen(true)}
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
          />
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
