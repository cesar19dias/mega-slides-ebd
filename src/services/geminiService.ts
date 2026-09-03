/**
 * Servidor REST Gemini API para MegaEBD
 * Gerencia chamadas brutas ao Gemini com suporte a modelos atuais (gemini-3.5-flash-lite, gemini-3.5-flash, gemini-1.5-pro)
 */

import type { PresentationData, GenerationOptions } from '../types';
import { runProfessorEngine } from './ebdProfessorEngine';
import { runDesignerEngine } from './ebdDesignerEngine';

// Chave da API no localStorage
const GEMINI_API_KEY_STORAGE_KEY = 'megaebd_gemini_api_key';

export function getStoredApiKey(): string {
  return localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY) || (import.meta.env.VITE_GEMINI_API_KEY as string) || '';
}

export function setStoredApiKey(key: string): void {
  localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, key.trim());
}

// Cache para modelos suportados pela chave do usuário
let cachedAvailableModels: string[] | null = null;

async function getAvailableModels(apiKey: string): Promise<string[]> {
  if (cachedAvailableModels && cachedAvailableModels.length > 0) {
    return cachedAvailableModels;
  }

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.models)) {
        const valid = data.models
          .filter((m: any) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
          .map((m: any) => m.name.replace(/^models\//, ''));
        
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
  modelName: string = 'gemini-3.6-flash',
  isJsonResponse: boolean = true
): Promise<string> {
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    throw new Error('Chave da API do Google Gemini não encontrada. Por favor, configure sua chave no botão no topo.');
  }

  // Busca dinamicamente os modelos ativos e suportados pela chave do usuário
  const activeModels = await getAvailableModels(apiKey);

  // Lista ordenada de tentativas: modelo solicitado -> variações -latest -> modelos disponíveis na conta
  const candidateModels = Array.from(new Set([
    modelName,
    `${modelName}-latest`,
    'gemini-3.6-flash',
    'gemini-3.6-pro',
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    ...activeModels,
    'gemini-2.0-flash',
    'gemini-1.5-flash-latest'
  ]));

  let lastError: Error | null = null;

  for (const model of candidateModels) {
    try {
      // Endpoint REST v1beta do Google AI Studio
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const generationConfig: any = {
        temperature: 0.3,
        maxOutputTokens: 65536,
      };

      if (isJsonResponse) {
        generationConfig.responseMimeType = "application/json";
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
        throw new Error(`Modelo ${model}: ${message}`);
      }

      const data = await response.json();
      const textResult = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (textResult) {
        return textResult;
      }
    } catch (err: any) {
      console.warn(`[Gemini REST Fallback] Falha no modelo ${model}:`, err.message);
      lastError = err;
    }
  }

  throw new Error(`Nenhum modelo Gemini respondeu com sucesso. Detalhes do último erro: ${lastError?.message || 'Erro desconhecido'}`);
}

export async function generatePresentationWithGemini(
  apiKey: string,
  rawContent: string,
  options: GenerationOptions
): Promise<PresentationData> {
  if (apiKey) setStoredApiKey(apiKey);
  const structuredLesson = await runProfessorEngine(apiKey, rawContent, options);
  const presentationData = await runDesignerEngine(structuredLesson, options);
  return presentationData;
}
