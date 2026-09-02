import React from 'react';
import { BookOpen, Key } from 'lucide-react';

interface HeaderProps {
  hasApiKey: boolean;
  onOpenApiKeyModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({ hasApiKey, onOpenApiKeyModal }) => {
  return (
    <header className="header-container font-['Gotham']">
      <div className="header-content">
        <div className="logo-brand">
          <div className="logo-icon bg-gradient-to-tr from-blue-600 via-indigo-600 to-amber-500 p-2.5 rounded-xl shadow-lg shadow-blue-500/20">
            <BookOpen className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="logo-title text-xl md:text-2xl font-black text-white tracking-tight font-['Gotham']">
                MegaEBD <span className="highlight text-amber-400">Preparador</span>
              </h1>
              <span className="text-[10px] uppercase font-black bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/30">
                PRO 3.0
              </span>
            </div>
            <p className="logo-subtitle text-xs text-slate-300 font-medium">
              Revista + Transcrições → Preparação Completa (Visão Professor x Visão Projetor)
            </p>
          </div>
        </div>

        <div className="header-actions">
          <button
            onClick={onOpenApiKeyModal}
            className={`api-key-btn ${hasApiKey ? 'api-configured' : 'api-missing'} font-['Gotham']`}
          >
            <Key className="w-4 h-4" />
            <span>{hasApiKey ? 'Chave Gemini Configurada' : 'Configurar Chave Gemini'}</span>
            {!hasApiKey && <span className="pulse-dot"></span>}
          </button>
        </div>
      </div>
    </header>
  );
};
