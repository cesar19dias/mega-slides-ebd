import type { EBDLessonPreparation } from '../types';

const DB_NAME = 'MegaEBD_Storage_v1';
const DB_VERSION = 1;
const STORE_NAME = 'app_state';
const LESSON_KEY = 'current_lesson';
const IMAGES_KEY = 'projector_slide_images';
const LAST_SAVED_KEY = 'last_saved_at';
const LOCAL_STORAGE_KEY = 'megaebd_lesson_data';

// Abre ou inicializa o banco de dados IndexedDB
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB não suportado neste ambiente.'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error('Erro ao abrir o banco IndexedDB.'));
    };
  });
}

// Solicita persistência permanente de dados ao navegador (evita que o browser limpe o storage)
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      const isPersisted = await navigator.storage.persist();
      console.log(`[Storage] Armazenamento persistente: ${isPersisted ? 'GARANTIDO' : 'PADRÃO'}`);
      return isPersisted;
    }
  } catch (err) {
    console.warn('[Storage] Não foi possível solicitar persistência:', err);
  }
  return false;
}

// Salva a lição completa no IndexedDB (sem limite de 5MB do localStorage)
export async function saveLessonToStorage(lesson: EBDLessonPreparation): Promise<boolean> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      store.put(lesson, LESSON_KEY);
      store.put(Date.now(), LAST_SAVED_KEY);

      if (lesson.projectorSlideImages) {
        store.put(lesson.projectorSlideImages, IMAGES_KEY);
      }

      transaction.oncomplete = () => {
        db.close();
        resolve(true);
      };

      transaction.onerror = () => {
        db.close();
        reject(transaction.error || new Error('Falha na transação ao salvar lição.'));
      };
    });
  } catch (err) {
    console.error('[Storage] Erro ao salvar lição no IndexedDB:', err);
    // Fallback: se o IndexedDB falhar por algum motivo, tenta localStorage
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(lesson));
      return true;
    } catch {
      return false;
    }
  }
}

// Carrega a lição salva no IndexedDB com fallback automático para localStorage e mesclagem de imagens
export async function loadLessonFromStorage(): Promise<EBDLessonPreparation | null> {
  let loadedLesson: EBDLessonPreparation | null = null;

  try {
    const db = await openDB();
    loadedLesson = await new Promise<EBDLessonPreparation | null>((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(LESSON_KEY);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        reject(request.error || new Error('Erro ao ler lição do IndexedDB.'));
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (err) {
    console.warn('[Storage] Não foi possível ler do IndexedDB, tentando localStorage:', err);
  }

  // Fallback e Migração: se não estava no IndexedDB, tenta recuperar do localStorage
  if (!loadedLesson) {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        loadedLesson = JSON.parse(saved);
      }
    } catch (err) {
      console.error('[Storage] Erro ao recuperar lição do localStorage:', err);
    }
  }

  // Recuperação de emergência: se a lição existe mas está sem imagens nos slides,
  // tenta verificar se há imagens salvas separadamente no IndexedDB ou localStorage
  if (loadedLesson) {
    if (!loadedLesson.projectorSlideImages || Object.keys(loadedLesson.projectorSlideImages).length === 0) {
      try {
        const separateImages = await loadSlideImagesFromStorage();
        if (separateImages && Object.keys(separateImages).length > 0) {
          loadedLesson.projectorSlideImages = separateImages;
        } else {
          // Tenta do localStorage
          const legacyImages = localStorage.getItem('mega_ebd_projector_slide_images') || localStorage.getItem('presentation_slide_images');
          if (legacyImages) {
            const parsed = JSON.parse(legacyImages);
            if (parsed && Object.keys(parsed).length > 0) {
              loadedLesson.projectorSlideImages = parsed;
            }
          }
        }
      } catch (err) {
        console.warn('[Storage] Tentativa de recuperação de imagens secundárias:', err);
      }
    }

    // Garante que a versão atualizada e unificada seja persistida no IndexedDB
    saveLessonToStorage(loadedLesson).catch(() => {});
    return loadedLesson;
  }

  return null;
}

// Salva imagens de slides separadamente para redundância máxima
export async function saveSlideImagesToStorage(images: Record<string | number, string>): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.put(images, IMAGES_KEY);

      transaction.oncomplete = () => {
        db.close();
        resolve();
      };

      transaction.onerror = () => {
        db.close();
        reject(transaction.error);
      };
    });
  } catch (err) {
    console.warn('[Storage] Erro ao salvar imagens no IndexedDB:', err);
  }
}

// Carrega imagens de slides salvas
export async function loadSlideImagesFromStorage(): Promise<Record<string | number, string> | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(IMAGES_KEY);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        reject(request.error);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch {
    return null;
  }
}

// Limpa os dados da lição ao clicar em "Nova Lição"
export async function clearLessonFromStorage(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.delete(LESSON_KEY);
      store.delete(IMAGES_KEY);
      store.delete(LAST_SAVED_KEY);

      transaction.oncomplete = () => {
        db.close();
        resolve();
      };

      transaction.onerror = () => {
        db.close();
        reject(transaction.error);
      };
    });
  } catch (err) {
    console.warn('[Storage] Erro ao limpar IndexedDB:', err);
  }

  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('mega_ebd_') || k.startsWith('megaebd_'))) {
        if (k !== 'mega_slides_gemini_key' && k !== 'megaebd_gemini_api_key') {
          keysToRemove.push(k);
        }
      }
    }
    keysToRemove.push('slide_highlights_v2', 'presentation_slide_images', 'mega_ebd_text_highlights_v2');
    keysToRemove.forEach(k => {
      try { localStorage.removeItem(k); } catch {}
    });
  } catch {}
}

// Exporta a aula completa para um arquivo físico .megaebd (para backup ou pendrive)
export function exportLessonToFile(lesson: EBDLessonPreparation): void {
  try {
    const jsonStr = JSON.stringify(lesson, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const sanitizedTitle = (lesson.metadata?.title || 'Aula_EBD')
      .replace(/[^a-zA-Z0-9_\u00C0-\u00FF-]/g, '_')
      .substring(0, 40);
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `${sanitizedTitle}_Backup_${dateStr}.megaebd`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('[Storage] Falha ao exportar arquivo da aula:', err);
    alert('Erro ao exportar o arquivo da aula.');
  }
}

// Importa um arquivo .megaebd ou .json previamente salvo
export function importLessonFromFile(file: File): Promise<EBDLessonPreparation> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) throw new Error('Arquivo vazio.');
        const parsed = JSON.parse(text);

        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Formato de arquivo inválido.');
        }

        if (!parsed.metadata && !parsed.visaoProfessor && !parsed.visaoProjetor) {
          throw new Error('Este arquivo não parece ser uma preparação de aula válida do MegaEBD.');
        }

        resolve(parsed as EBDLessonPreparation);
      } catch (err: any) {
        reject(new Error(`Falha ao ler o arquivo de aula: ${err.message || err}`));
      }
    };
    reader.onerror = () => reject(new Error('Erro ao ler o arquivo selecionado.'));
    reader.readAsText(file);
  });
}
