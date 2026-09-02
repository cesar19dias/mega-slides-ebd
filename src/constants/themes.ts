import type { ThemeConfig } from '../types';

export const THEMES: ThemeConfig[] = [
  {
    id: 'modelo-oficial-ebd',
    name: 'Modelo Oficial EBD (Laranja & Azul)',
    description: 'Design oficial da EBD com insígnias de seta laranja, cartões Azul Marinho e formas geométricas azuis.',
    bgColor: '0D2238',         // Navy Dark
    cardBgColor: '0F2942',     // Dark Card
    primaryColor: 'FF5500',    // Orange Badge
    secondaryColor: '0077FF',  // Electric Blue Accent
    accentColor: 'FFFFFF',     // White
    textColor: 'FFFFFF',       // Text White
    subtextColor: '94A3B8',    // Muted
    fontHeader: 'Gotham',
    fontBody: 'Gotham',
    cssBg: '#0d2238',
    cssCard: '#0f2942',
    cssPrimary: '#ff5500',
    cssText: '#ffffff'
  },
  {
    id: 'teologico-classico',
    name: 'Teológico Clássico',
    description: 'Estilo nobre com tons de Azul Marinho, Ouro e Branco. Ideal para aulas de adultos da CPAD.',
    bgColor: '0F172A',
    cardBgColor: '1E293B',
    primaryColor: '3B82F6',
    secondaryColor: 'F59E0B',
    accentColor: 'E2E8F0',
    textColor: 'F8FAFC',
    subtextColor: '94A3B8',
    fontHeader: 'Georgia',
    fontBody: 'Calibri',
    cssBg: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
    cssCard: 'rgba(30, 41, 59, 0.8)',
    cssPrimary: '#3b82f6',
    cssText: '#f8fafc'
  },
  {
    id: 'clean-moderno',
    name: 'Clean & Moderno',
    description: 'Design minimalista, limpo com fundo claro e tipografia nítida.',
    bgColor: 'FFFFFF',
    cardBgColor: 'F1F5F9',
    primaryColor: '0284C7',
    secondaryColor: '0F172A',
    accentColor: 'E2E8F0',
    textColor: '0F172A',
    subtextColor: '475569',
    fontHeader: 'Arial',
    fontBody: 'Arial',
    cssBg: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
    cssCard: '#f1f5f9',
    cssPrimary: '#0284c7',
    cssText: '#0f172a'
  },
  {
    id: 'vibrante-jovem',
    name: 'Vibrante & Jovem',
    description: 'Cores modernas com gradientes de Roxo e Ciano. Perfeito para Jovens.',
    bgColor: '110E29',
    cardBgColor: '1F1947',
    primaryColor: '8B5CF6',
    secondaryColor: '06B6D4',
    accentColor: 'EC4899',
    textColor: 'FFFFFF',
    subtextColor: 'A78BFA',
    fontHeader: 'Trebuchet MS',
    fontBody: 'Calibri',
    cssBg: 'linear-gradient(135deg, #110e29 0%, #2a1b54 100%)',
    cssCard: 'rgba(31, 25, 71, 0.85)',
    cssPrimary: '#8b5cf6',
    cssText: '#ffffff'
  }
];
