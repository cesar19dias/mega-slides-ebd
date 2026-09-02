import React, { useState, useEffect } from 'react';
import { Key, ShieldCheck, ExternalLink, X, Save } from 'lucide-react';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveKey: (key: string) => void;
  currentKey: string;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
  onSaveKey,
  currentKey,
}) => {
  const [apiKeyInput, setApiKeyInput] = useState(currentKey);

  useEffect(() => {
    setApiKeyInput(currentKey);
  }, [currentKey]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveKey(apiKeyInput.trim());
    onClose();
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-600/20 text-blue-400">
              <Key className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-white">Chave de API do Gemini</h2>
          </div>
          <button onClick={onClose} className="close-btn">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="modal-body">
          <p className="text-slate-300 text-sm mb-4">
            Sua chave é armazenada com segurança diretamente no seu navegador local e nunca é enviada para servidores de terceiros.
          </p>

          <div className="input-group mb-4">
            <label className="label-text">Cole sua API Key do Google Gemini:</label>
            <input
              type="password"
              placeholder="AIzaSy..."
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              className="text-input font-mono text-sm"
              required
            />
          </div>

          <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700 text-xs text-slate-400 flex items-start gap-2 mb-6">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-200">Como obter sua chave gratuita:</p>
              <p className="mt-1">
                Acesse o Google AI Studio e clique em <span className="text-blue-400">"Get API key"</span>.
              </p>
              <a
                href="https://aistudio.google.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-400 hover:underline mt-2 font-medium"
              >
                Abrir Google AI Studio <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancelar
            </button>
            <button type="submit" className="btn-primary">
              <Save className="w-4 h-4" />
              Salvar Chave
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
