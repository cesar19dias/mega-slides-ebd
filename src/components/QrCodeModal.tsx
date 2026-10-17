import { useState, useEffect } from 'react';
import { X, QrCode, Copy, Check, Download, Smartphone, Cloud, ShieldCheck } from 'lucide-react';
import type { EBDLessonPreparation } from '../types';
import { encodeLessonToUrl, generateQrCodeDataUrl, downloadLessonJson } from '../services/shareService';

interface QrCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  lesson: EBDLessonPreparation;
}

export function QrCodeModal({ isOpen, onClose, lesson }: QrCodeModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [shareUrl, setShareUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [isShortened, setIsShortened] = useState<boolean>(false);
  const [useCloudSync, setUseCloudSync] = useState<boolean>(true);

  useEffect(() => {
    if (isOpen && lesson) {
      setIsLoading(true);
      const fullUrl = encodeLessonToUrl(lesson);
      setShareUrl(fullUrl);

      generateQrCodeDataUrl(fullUrl, lesson, useCloudSync)
        .then((result) => {
          setQrDataUrl(result.dataUrl);
          setShareUrl(result.shareUrl);
          setIsShortened(result.isShortened);
          setIsLoading(false);
        })
        .catch((err) => {
          console.error('Falha ao gerar QR Code:', err);
          setIsLoading(false);
        });
    }
  }, [isOpen, lesson, useCloudSync]);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl space-y-6 relative text-slate-100">
        {/* Botão Fechar */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Cabeçalho */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-500/30 mb-1">
            <Smartphone className="w-7 h-7" />
          </div>
          <h3 className="text-xl md:text-2xl font-black text-white">
            Abrir no Celular (Sincronizado)
          </h3>
          <p className="text-xs md:text-sm text-slate-400 max-w-sm mx-auto">
            Aponta a câmera do seu celular para o QR Code abaixo para carregar esta <strong className="text-cyan-300">mesma aula exata</strong> na visão do professor!
          </p>
        </div>

        {/* Imagem do QR Code */}
        <div className="flex flex-col items-center justify-center p-4 bg-white rounded-2xl border-4 border-cyan-500/40 shadow-inner">
          {isLoading ? (
            <div className="h-64 flex items-center justify-center text-slate-700 font-bold gap-2">
              <QrCode className="w-6 h-6 animate-spin text-cyan-600" />
              <span>Gerando QR Code...</span>
            </div>
          ) : qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="QR Code da Lição"
              className="w-64 h-64 object-contain rounded-lg"
            />
          ) : (
            <div className="h-64 flex items-center justify-center text-red-500 text-sm font-semibold">
              Erro ao gerar QR Code. Tente copiar o link.
            </div>
          )}
        </div>

        {/* Controle de Privacidade / Nuvem */}
        <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/80 text-xs space-y-2">
          <label className="flex items-center justify-between cursor-pointer select-none">
            <span className="flex items-center gap-2 font-medium text-slate-200">
              <Cloud className={`w-4 h-4 ${useCloudSync ? 'text-cyan-400' : 'text-slate-500'}`} />
              Sincronização temporária na nuvem
            </span>
            <input
              type="checkbox"
              checked={useCloudSync}
              onChange={(e) => setUseCloudSync(e.target.checked)}
              className="w-4 h-4 rounded text-cyan-600 bg-slate-900 border-slate-600 focus:ring-cyan-500 cursor-pointer"
            />
          </label>
          <div className="text-[11px] text-slate-400 leading-relaxed flex items-start gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
            <span>
              {useCloudSync
                ? 'Armazena temporariamente os slides no Bytebin para gerar um link/QR Code curto com imagens completas.'
                : 'Modo 100% Local (Sem Nuvem): Nenhum dado é enviado a servidores de terceiros. Use o arquivo .megaebd para transferir offline com total privacidade.'}
            </span>
          </div>
        </div>

        {/* Ações */}
        <div className="space-y-3">
          <button
            onClick={handleCopyLink}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-600/30 transition-all cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-300" />
                <span>Link Copiado para a Área de Transferência!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copiar Link da Aula para Enviar no WhatsApp</span>
              </>
            )}
          </button>

          <button
            onClick={() => downloadLessonJson(lesson)}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-bold text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all cursor-pointer"
          >
            <Download className="w-4 h-4 text-cyan-400" />
            <span>Baixar Arquivo da Aula (.megaebd)</span>
          </button>
        </div>

        {/* Dica de rodapé */}
        <p className="text-[11px] text-center text-slate-400">
          {isShortened ? (
            <span>⚡ Aula 100% sincronizada com imagens, slides extras e anotações para leitura instantânea no celular.</span>
          ) : (
            <span>💡 A aula está codificada no link com imagens e slides extras, pronta para abrir no celular.</span>
          )}
        </p>
      </div>
    </div>
  );
}
