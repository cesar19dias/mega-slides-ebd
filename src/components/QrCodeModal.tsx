import { useState, useEffect } from 'react';
import { X, QrCode, Copy, Check, Download, Smartphone } from 'lucide-react';
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

  useEffect(() => {
    if (isOpen && lesson) {
      setIsLoading(true);
      const fullUrl = encodeLessonToUrl(lesson);
      setShareUrl(fullUrl);

      generateQrCodeDataUrl(fullUrl, lesson)
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
  }, [isOpen, lesson]);

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
        <p className="text-[11px] text-center text-slate-500">
          {isShortened ? (
            <span>⚡ Link otimizado e encurtado para leitura instantânea no celular.</span>
          ) : (
            <span>💡 A aula é codificada diretamente no link, permitindo abrir instantaneamente em qualquer aparelho.</span>
          )}
        </p>
      </div>
    </div>
  );
}
