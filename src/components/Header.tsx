import React from 'react';
import { BookOpen, Key, RefreshCw, UserCheck, Monitor } from 'lucide-react';

const AuthenticQrCodeIcon: React.FC<{ className?: string }> = ({ className = 'w-8 h-8' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    {/* Top-Left Finder */}
    <path d="M2 2h7v7H2V2zm1.8 1.8v3.4h3.4V3.8H3.8z" />
    <rect x="4.4" y="4.4" width="2.2" height="2.2" />

    {/* Top-Right Finder */}
    <path d="M15 2h7v7h-7V2zm1.8 1.8v3.4h3.4V3.8h-3.4z" />
    <rect x="17.4" y="4.4" width="2.2" height="2.2" />

    {/* Bottom-Left Finder */}
    <path d="M2 15h7v7H2v-7zm1.8 1.8v3.4h3.4v-3.4H3.8z" />
    <rect x="4.4" y="17.4" width="2.2" height="2.2" />

    {/* Timing patterns & Data matrix */}
    <rect x="10.5" y="2" width="1.5" height="1.5" />
    <rect x="10.5" y="5" width="1.5" height="1.5" />
    <rect x="10.5" y="8" width="1.5" height="1.5" />
    <rect x="2" y="10.5" width="1.5" height="1.5" />
    <rect x="5" y="10.5" width="1.5" height="1.5" />
    <rect x="8" y="10.5" width="1.5" height="1.5" />
    
    <rect x="10.5" y="10.5" width="2" height="2" />
    <rect x="13.5" y="10.5" width="1.5" height="1.5" />
    <rect x="16.5" y="10.5" width="2" height="1.5" />
    <rect x="19.5" y="10.5" width="2.5" height="1.5" />

    <rect x="10.5" y="13.5" width="1.5" height="1.5" />
    <rect x="10.5" y="16.5" width="1.5" height="2" />
    <rect x="10.5" y="19.5" width="2" height="2.5" />

    <rect x="13.5" y="13.5" width="2.5" height="2.5" />
    <rect x="17.5" y="13.5" width="1.5" height="1.5" />
    <rect x="20" y="13.5" width="2" height="1.5" />
    <rect x="14" y="17" width="2" height="2" />
    <rect x="17" y="16.5" width="2" height="2.5" />
    <rect x="20" y="16.5" width="2" height="2" />
    <rect x="13.5" y="20" width="2.5" height="2" />
    <rect x="17" y="20" width="2" height="2" />
    <rect x="20" y="19.5" width="2" height="2.5" />
  </svg>
);

interface HeaderProps {
  hasApiKey: boolean;
  onOpenApiKeyModal: () => void;
  hasLesson?: boolean;
  onReset?: () => void;
  onOpenQrCode?: () => void;
  activeTab?: 'professor' | 'projetor';
  onTabChange?: (tab: 'professor' | 'projetor') => void;
}

export const Header: React.FC<HeaderProps> = ({
  hasApiKey,
  onOpenApiKeyModal,
  hasLesson,
  onReset,
  onOpenQrCode,
  activeTab,
  onTabChange,
}) => {
  return (
    <header className="header-container font-['Gotham']">
      <div className="header-content flex flex-wrap items-center justify-between gap-4">
        <div className="logo-brand flex items-center gap-3">
          <div className="logo-icon bg-gradient-to-tr from-blue-600 via-indigo-600 to-amber-500 p-2.5 rounded-xl shadow-lg shadow-blue-500/20 shrink-0">
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

        {/* Centro: Nova Lição EBD + Botão Quadrado de QR Code */}
        {hasLesson && (
          <div className="header-center-actions flex items-center gap-3">
            {onReset && (
              <button
                onClick={onReset}
                className="flex items-center gap-2 bg-slate-800/90 hover:bg-slate-700 text-slate-200 px-4.5 py-2.5 rounded-xl border border-slate-600 hover:border-slate-400 font-extrabold text-sm transition-all shadow-md cursor-pointer active:scale-95 min-h-[42px]"
                title="Iniciar uma nova lição EBD"
              >
                <RefreshCw className="w-4 h-4 text-blue-400" />
                <span>Nova Lição EBD</span>
              </button>
            )}

            {/* Símbolo QR Code Quadrado Autêntico */}
            <button
              onClick={() => {
                if (onOpenQrCode) onOpenQrCode();
                window.dispatchEvent(new CustomEvent('mega-ebd-open-qr'));
              }}
              className="w-12 h-12 min-w-[48px] min-h-[48px] p-2 flex items-center justify-center rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white border-2 border-purple-300/60 shadow-xl shadow-purple-500/30 transition-all cursor-pointer active:scale-95 hover:scale-105 shrink-0"
              title="Abrir esta mesma aula no Celular via QR Code (sincronizada)"
            >
              <AuthenticQrCodeIcon className="w-8 h-8 text-white drop-shadow-sm" />
            </button>
          </div>
        )}

        {/* Direita: Visão Professor/Projetor + Configurar Chave */}
        <div className="header-actions flex flex-wrap items-center gap-3">
          {hasLesson && activeTab && onTabChange && (
            <div className="flex items-center bg-slate-950 p-1.5 rounded-2xl border border-slate-800 shadow-inner">
              <button
                onClick={() => onTabChange('professor')}
                className={`flex items-center gap-2 px-4.5 py-2.5 rounded-xl font-black text-sm transition-all cursor-pointer ${
                  activeTab === 'professor'
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <UserCheck className="w-4 h-4 text-amber-300" />
                <span>PROFESSOR</span>
              </button>

              <button
                onClick={() => onTabChange('projetor')}
                className={`flex items-center gap-2 px-4.5 py-2.5 rounded-xl font-black text-sm transition-all cursor-pointer ${
                  activeTab === 'projetor'
                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-purple-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Monitor className="w-4 h-4 text-cyan-300" />
                <span>PROJETOR</span>
              </button>
            </div>
          )}

          <button
            onClick={onOpenApiKeyModal}
            className={`api-key-btn !py-2.5 !px-4 !text-sm ${hasApiKey ? 'api-configured' : 'api-missing'} font-['Gotham']`}
          >
            <Key className="w-4.5 h-4.5" />
            <span>{hasApiKey ? 'Chave Gemini Configurada' : 'Configurar Chave Gemini'}</span>
            {!hasApiKey && <span className="pulse-dot"></span>}
          </button>
        </div>
      </div>
    </header>
  );
};
