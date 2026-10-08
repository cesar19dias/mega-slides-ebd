/**
 * Servidor/Serviço de Extração e Transcrição por IA de Vídeos do YouTube para MegaEBD
 * Extrai legendas oficiais/automáticas OU faz transcrição de áudio via IA Gemini (Speech-to-Text)
 */

import { getStoredApiKey } from './geminiService';

export interface YouTubeTranscriptResult {
  videoId: string;
  title: string;
  transcript: string;
  language?: string;
  charCount: number;
  hasSubtitles: boolean;
  isAiAudioTranscribed?: boolean;
}

/**
 * Extrai o ID de 11 caracteres de um link do YouTube
 */
export function extractYouTubeVideoId(urlOrId: string): string | null {
  if (!urlOrId) return null;
  const trimmed = urlOrId.trim();

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/.*[?&]v=([a-zA-Z0-9_-]{11})/
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Descodifica entidades HTML em texto
 */
function decodeHTMLEntities(text: string): string {
  if (!text) return '';
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#10;/g, '\n')
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]*>/g, '');
}

/**
 * Obtém o título do vídeo do YouTube via NoEmbed
 */
async function fetchVideoTitle(videoId: string): Promise<string> {
  try {
    const res = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.title) {
        return data.title;
      }
    }
  } catch (e) {
    console.warn('Erro ao obter título via NoEmbed:', e);
  }
  return `Vídeo do YouTube (${videoId})`;
}

/**
 * Converte ArrayBuffer para Base64 em chunks de 32KB para evitar estouro de pilha
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  const chunkSize = 0x8000;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk as any);
  }
  return btoa(binary);
}

/**
 * Transcreve o áudio de um vídeo do YouTube usando a IA Gemini (Speech-to-Text)
 * quando o vídeo não possui legendas no YouTube.
 */
async function transcribeAudioWithGeminiAI(videoId: string): Promise<string | null> {
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    console.warn('Chave Gemini API não encontrada para transcrição de áudio.');
    return null;
  }

  const pipedInstances = [
    `https://pipedapi.kavin.rocks/streams/${videoId}`,
    `https://api.piped.yt/streams/${videoId}`,
    `https://pipedapi.tokhmi.xyz/streams/${videoId}`,
    `https://pipedapi.drgns.space/streams/${videoId}`
  ];

  let audioUrl: string | null = null;
  let mimeType = 'audio/mp4';

  for (const instanceUrl of pipedInstances) {
    try {
      const res = await fetch(instanceUrl);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.audioStreams) && data.audioStreams.length > 0) {
          const stream = data.audioStreams[0];
          audioUrl = stream.url;
          if (stream.mimeType) {
            mimeType = stream.mimeType.split(';')[0];
          }
          break;
        }
      }
    } catch (e) {
      console.warn(`Piped instance ${instanceUrl} falhou:`, e);
    }
  }

  if (!audioUrl) {
    return null;
  }

  try {
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) return null;

    const audioBuffer = await audioRes.arrayBuffer();
    // Limita até ~18MB para caber na requisição REST base64
    const slicedBuffer = audioBuffer.slice(0, 18 * 1024 * 1024);
    const base64Audio = arrayBufferToBase64(slicedBuffer);

    const candidateModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

    for (const model of candidateModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: "Você é um transcritor profissional de áudio de alta precisão. Ouça o áudio a seguir e transcreva integralmente todo o texto falado em português do Brasil pelo professor/preletor da EBD. Escreva a transcrição completa palavra por palavra:"
                  },
                  {
                    inlineData: {
                      mimeType: mimeType || 'audio/mp4',
                      data: base64Audio
                    }
                  }
                ]
              }
            ]
          })
        });

        if (response.ok) {
          const data = await response.json();
          const transcribedText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (transcribedText && transcribedText.length > 50) {
            return transcribedText;
          }
        }
      } catch (e) {
        console.warn(`Transcrição Gemini Audio (${model}) falhou:`, e);
      }
    }
  } catch (err) {
    console.warn('Erro ao processar áudio para transcrição via Gemini:', err);
  }

  return null;
}

/**
 * Tenta buscar o conteúdo via proxies CORS simples
 */
async function fetchViaCorsProxy(targetUrl: string): Promise<string> {
  const proxies = [
    (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
    (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`
  ];

  let lastErr: any = null;

  for (const proxyFn of proxies) {
    try {
      const proxyUrl = proxyFn(targetUrl);
      const res = await fetch(proxyUrl);
      if (res.ok) {
        const text = await res.text();
        if (text && text.length > 50) {
          return text;
        }
      }
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr || new Error('Falha de conexão com os servidores do YouTube.');
}

/**
 * Busca legendas JSON3 diretamente da API oficial de timedtext do YouTube
 */
async function fetchTimedTextJson(videoId: string, lang: string = 'pt'): Promise<string | null> {
  try {
    const targetUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}&fmt=json3`;
    const jsonString = await fetchViaCorsProxy(targetUrl);

    if (jsonString.startsWith('{')) {
      const data = JSON.parse(jsonString);
      if (Array.isArray(data.events)) {
        const parts: string[] = [];
        let prev = '';
        for (const ev of data.events) {
          if (Array.isArray(ev.segs)) {
            for (const seg of ev.segs) {
              const text = decodeHTMLEntities(seg.utf8 || '').trim();
              if (text && text !== '\n' && text !== '[Música]' && text !== '[Aplausos]' && text !== prev) {
                parts.push(text);
                prev = text;
              }
            }
          }
        }
        const full = parts.join(' ');
        if (full.length > 50) return full;
      }
    }
  } catch (e) {
    console.warn(`[TimedText JSON3 ${lang}] falhou:`, e);
  }
  return null;
}

/**
 * Analisa o HTML do YouTube via proxy CORS para encontrar captionTracks
 */
async function fetchHtmlCaptionTracks(videoId: string): Promise<{ title?: string; transcript: string } | null> {
  try {
    const youtubeWatchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const htmlContent = await fetchViaCorsProxy(youtubeWatchUrl);

    let playerResponse: any = null;
    const playerResponseMatch = htmlContent.match(/ytInitialPlayerResponse\s*=\s*({.+?});(?:var\s+|<\/script>)/s)
      || htmlContent.match(/ytInitialPlayerResponse\s*=\s*({.+?});/s);

    if (playerResponseMatch && playerResponseMatch[1]) {
      try {
        playerResponse = JSON.parse(playerResponseMatch[1]);
      } catch (e) {}
    }

    const title = playerResponse?.videoDetails?.title;
    const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

    if (!Array.isArray(captionTracks) || captionTracks.length === 0) {
      return null;
    }

    let selectedTrack = captionTracks.find((t: any) => 
      t.languageCode === 'pt' || t.languageCode === 'pt-BR' || t.vssId?.includes('pt')
    ) || captionTracks[0];

    if (!selectedTrack?.baseUrl) return null;

    const xmlContent = await fetchViaCorsProxy(selectedTrack.baseUrl);
    const textMatches = Array.from(xmlContent.matchAll(/<text[^>]*>(.*?)<\/text>/gs));

    const lines: string[] = [];
    let prevLine = '';

    for (const match of textMatches) {
      let cleanText = decodeHTMLEntities(match[1] || '').trim();
      if (!cleanText || cleanText === '[Música]' || cleanText === '[Aplausos]') continue;
      if (cleanText !== prevLine) {
        lines.push(cleanText);
        prevLine = cleanText;
      }
    }

    const transcript = lines.join(' ');
    if (transcript.length > 50) {
      return { title, transcript };
    }
  } catch (e) {
    console.warn('[HTML CaptionTracks] falhou:', e);
  }

  return null;
}

/**
 * Função principal para extrair transcrição de vídeos do YouTube.
 * 1. Tenta legendas oficiais/automáticas do YouTube.
 * 2. Se não houver legendas no YouTube, transcreve o áudio do vídeo usando IA Gemini (Speech-to-Text).
 */
export async function fetchYouTubeTranscript(urlOrId: string): Promise<YouTubeTranscriptResult> {
  const videoId = extractYouTubeVideoId(urlOrId);

  if (!videoId) {
    throw new Error('Link do YouTube inválido. Cole a URL completa (ex: https://www.youtube.com/watch?v=...)');
  }

  const titlePromise = fetchVideoTitle(videoId);

  // 1. Tenta extrair legendas salvas/automáticas em Português
  let transcript = await fetchTimedTextJson(videoId, 'pt');

  if (!transcript) {
    transcript = await fetchTimedTextJson(videoId, 'pt-BR');
  }

  let parsedTitle: string | undefined;
  if (!transcript) {
    const htmlResult = await fetchHtmlCaptionTracks(videoId);
    if (htmlResult) {
      transcript = htmlResult.transcript;
      parsedTitle = htmlResult.title;
    }
  }

  const finalTitle = parsedTitle || await titlePromise;

  // Se encontrou legendas do YouTube
  if (transcript && transcript.length >= 30) {
    return {
      videoId,
      title: finalTitle,
      transcript,
      language: 'Português',
      charCount: transcript.length,
      hasSubtitles: true,
      isAiAudioTranscribed: false
    };
  }

  // 2. Se o vídeo NÃO tem legendas no YouTube -> Transcreve o áudio falado usando a IA Gemini (Speech-to-Text)!
  console.log('[YouTube Service] Vídeo sem legendas no YouTube. Iniciando transcrição de áudio por IA Gemini (Speech-to-Text)...');
  const aiTranscribedText = await transcribeAudioWithGeminiAI(videoId);

  if (aiTranscribedText && aiTranscribedText.length >= 30) {
    return {
      videoId,
      title: finalTitle,
      transcript: aiTranscribedText,
      language: 'Português (Transcrito por IA Gemini)',
      charCount: aiTranscribedText.length,
      hasSubtitles: true,
      isAiAudioTranscribed: true
    };
  }

  throw new Error(
    `Não foi possível extrair nem transcrever o áudio do vídeo "${finalTitle}". Verifique sua chave da API do Gemini no topo do aplicativo ou tente outro vídeo.`
  );
}
