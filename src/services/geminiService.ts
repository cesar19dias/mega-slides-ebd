/**
 * Servidor REST Gemini API para MegaEBD
 * Gerencia chamadas brutas ao Gemini com suporte a modelos atuais (gemini-3.5-flash-lite, gemini-3.5-flash, gemini-1.5-pro)
 */

// Chaves da API no localStorage (unificando e mantendo compatibilidade)
const PRIMARY_GEMINI_KEY = 'megaebd_gemini_api_key';
const LEGACY_GEMINI_KEY = 'mega_slides_gemini_key';

export function getStoredApiKey(): string {
  const key = localStorage.getItem(PRIMARY_GEMINI_KEY) || localStorage.getItem(LEGACY_GEMINI_KEY) || (import.meta.env.VITE_GEMINI_API_KEY as string) || '';
  if (key && !localStorage.getItem(PRIMARY_GEMINI_KEY)) {
    try { localStorage.setItem(PRIMARY_GEMINI_KEY, key.trim()); } catch {}
  }
  return key;
}

export function setStoredApiKey(key: string): void {
  const trimmed = key.trim();
  localStorage.setItem(PRIMARY_GEMINI_KEY, trimmed);
  try { localStorage.setItem(LEGACY_GEMINI_KEY, trimmed); } catch {}
}

// Cache para modelos suportados pela chave do usuário
let cachedAvailableModels: string[] | null = null;

// Modelos que NÃO geram texto (TTS, imagem, áudio, embeddings etc.) — nunca devem ser usados para gerar lições
const NON_TEXT_MODEL_PATTERN = /(tts|image|imagen|audio|live|embed|veo|lyria|aqa|robotics|computer-use|learnlm|thinking-exp)/i;

function isTextModel(model: string): boolean {
  return !!model && !NON_TEXT_MODEL_PATTERN.test(model);
}

async function getAvailableModels(apiKey: string): Promise<string[]> {
  if (cachedAvailableModels && cachedAvailableModels.length > 0) {
    return cachedAvailableModels;
  }

  try {
    const proxyBase = (import.meta.env.VITE_GEMINI_PROXY_URL as string) || '';
    const endpoint = proxyBase 
      ? `${proxyBase.replace(/\/$/, '')}/models`
      : 'https://generativelanguage.googleapis.com/v1beta/models';

    const res = await fetch(endpoint, {
      headers: {
        'x-goog-api-key': apiKey,
      }
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.models)) {
        const valid = data.models
          .filter((m: any) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
          .map((m: any) => m.name.replace(/^models\//, ''))
          .filter(isTextModel);
        
        if (valid.length > 0) {
          cachedAvailableModels = valid;
          console.log('[Gemini API] Modelos disponíveis detectados na sua chave:', valid);
          return valid;
        }
      }
    }
  } catch (e) {
    console.warn('[Gemini API] Falha ao consultar ListModels dinâmico:', e);
  }

  return [
    'gemini-3.8-flash',
    'gemini-3.6-flash',
    'gemini-3.6-pro',
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.0-flash',
    'gemini-1.5-flash-latest'
  ];
}

export async function callGeminiRaw(
  prompt: string, 
  modelName: string = 'gemini-3.8-flash',
  isJsonResponse: boolean = true,
  temperature: number = 0.5
): Promise<string> {
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    throw new Error('Chave da API do Google Gemini não encontrada. Por favor, configure sua chave no botão no topo.');
  }

  // Busca dinamicamente os modelos ativos e suportados pela chave do usuário
  const activeModels = await getAvailableModels(apiKey);

  // Lista ordenada e enxuta de tentativas
  const candidateModels = Array.from(new Set([
    modelName,
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
    'gemini-2.5-pro',
    ...activeModels.filter(m => m.includes('flash') || m.includes('pro')),
    'gemini-1.5-flash-latest'
  ])).filter(isTextModel);

  let lastError: Error | null = null;
  let quotaErrorCount = 0;
  const proxyBase = (import.meta.env.VITE_GEMINI_PROXY_URL as string) || '';

  for (const model of candidateModels) {
    try {
      // Endpoint REST v1beta do Google AI Studio (ou proxy serverless se configurado)
      const url = proxyBase 
        ? `${proxyBase.replace(/\/$/, '')}/models/${model}:generateContent`
        : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

      // Modelos 2.5 e 3.x aceitam até 65536 tokens; modelos 1.5 e 2.0 aceitam 8192
      const isHighCapacity = /gemini-(2\.5|3\.)/i.test(model);
      const maxTokens = isHighCapacity ? 65536 : 8192;

      const generationConfig: any = {
        temperature: temperature,
        maxOutputTokens: maxTokens,
      };

      if (isJsonResponse) {
        generationConfig.responseMimeType = "application/json";
      }

      // Passa a chave no header x-goog-api-key para proteção de segurança (evita vazamento em logs de URL, histórico e proxy)
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }]
            }
          ],
          generationConfig
        })
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        const message = errJson?.error?.message || `HTTP ${response.status}`;
        const status = response.status;

        // Erro definitivo apenas para problemas de chave/permissão (afetam todos os modelos)
        const isFatalError = 
          (status === 400 && /API key/i.test(message)) ||
          status === 401 || 
          status === 403 || 
          /API[ _]?key not valid/i.test(message);

        if (isFatalError) {
          throw new Error(`Erro definitivo na API Gemini (${status}): ${message}`);
        }

        // Cota/rate limit é POR MODELO no plano gratuito: tenta o próximo modelo
        const isQuotaError =
          status === 429 ||
          /quota/i.test(message) ||
          /resource has been exhausted/i.test(message) ||
          /rate limit/i.test(message);

        if (isQuotaError) {
          quotaErrorCount++;
          throw new Error(`Cota esgotada no modelo ${model}: ${message}`);
        }

        throw new Error(`Modelo ${model}: ${message}`);
      }

      const data = await response.json();
      const textResult = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (textResult) {
        return textResult;
      }
    } catch (err: any) {
      if (err.message && err.message.startsWith('Erro definitivo na API Gemini')) {
        throw err;
      }
      console.warn(`[Gemini REST Fallback] Falha no modelo ${model}:`, err.message);
      lastError = err;
    }
  }

  if (quotaErrorCount > 0 && quotaErrorCount === candidateModels.length) {
    throw new Error('A cota gratuita da sua chave Gemini foi esgotada em todos os modelos disponíveis. Aguarde alguns minutos (ou até o reset diário) e tente novamente, ou ative o faturamento em https://ai.dev.');
  }

  throw new Error(`Nenhum modelo Gemini respondeu com sucesso. Detalhes do último erro: ${lastError?.message || 'Erro desconhecido'}`);
}

