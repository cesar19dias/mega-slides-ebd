export type DepthControl = 'resumida' | 'detalhada' | 'aprofundada';
export type BibleVersion = 'ARC' | 'NVI' | 'NAA';

export interface TranscriptionSource {
  id: string;
  title: string;
  content: string;
  fileName?: string;
}

export interface EBDIdeia {
  letra: string; // 'a', 'b', 'c', 'd', etc.
  titulo: string;
  projetor: string; // Ideia Central (Frase curta para os alunos lerem no projetor)
  professor: {
    explicacao: string; // Desenho detalhado do conteúdo baseado nas transcrições
    contexto: string; // Contexto histórico, cultural e bíblico
    versiculos: Array<{ reference: string; text: string }>; // Base Bíblica (ARC)
    aplicacao: string; // Aplicação cristã e pentecostal
    enfase: string; // Frase de destaque para o professor enfatizar na aula
    cuidadoDoutrinario?: string; // 🔥 O QUE NÃO PODE SER DITO (Cuidado Doutrinário / Alerta)
  };
  imagePrompt: string; // Prompt de imagem 16:9 contextual para Canva / AI
}

export interface EBDSubtopicPreparation {
  number: string; // "1", "2", "3"
  title: string;
  projetor: string;
  ideias: EBDIdeia[];
  imagePrompt: string;
}

export interface EBDTopicPreparation {
  number: string; // "I", "II", "III"
  title: string;
  explicacao: string;
  sinopse: string; // Resumo rápido do tópico para o professor
  frasesEnfase: string[]; // Frases curtas para destacar durante a aula
  subtopicos: EBDSubtopicPreparation[];
  imagePrompt: string;
}

export interface EBDLessonPreparation {
  metadata: {
    lessonNumber?: string;
    title: string;
    subtitle?: string;
    themeTopic: string;
    date?: string;
    targetAudience?: string;
    depth: DepthControl;
  };
  textAureo: {
    text: string;
    reference: string;
  };
  verdadePratica: {
    text: string;
  };
  leituraDiaria?: Array<{
    day: string;
    reference: string;
    text: string;
  }>;
  biblicalText?: string; // Leitura Bíblica em Classe
  introducao: {
    text: string;
    projetor: string;
  };
  topicos: EBDTopicPreparation[];
  conclusao: {
    takeaway: string;
    bulletPoints: string[];
    finalPrayer?: string;
    projetor: string;
  };
  sourcesSummary: {
    revistaDetected: boolean;
    transcriptionsCount: number;
    sourcesUsed: string[];
  };
  checklist: Array<{
    item: string;
    status: boolean;
  }>;
}

export interface PreparationOptions {
  depth: DepthControl;
  selectedAiModel: string;
  bibleVersion: BibleVersion;
  includePentecostalApplication: boolean;
}

// Compatibilidade para Slides (Opcional/V3)
export type SlideLayout = 
  | 'title'
  | 'standard'
  | 'verse'
  | 'two-column'
  | 'image-left'
  | 'image-right'
  | 'banner-top'
  | 'question'
  | 'conclusion';

export interface Slide {
  id: string;
  title: string;
  subtitle?: string;
  bulletPoints?: string[];
  keyVerse?: {
    reference: string;
    text: string;
  };
  questions?: string[];
  takeaway?: string;
  layout: SlideLayout;
  speakerNotes?: string;
  topicBadge?: string;
  imageUrl?: string;
  imagePrompt?: string;
  imageSource?: 'ai' | 'user' | 'placeholder';
}

export interface PresentationData {
  title: string;
  subtitle: string;
  lessonNumber?: string;
  themeTopic: string;
  biblicalText?: string;
  practicalTruth?: string;
  targetAudience: string;
  slides: Slide[];
}

export interface ThemeConfig {
  id: string;
  name: string;
  description: string;
  bgColor: string;
  cardBgColor: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  textColor: string;
  subtextColor: string;
  fontHeader: string;
  fontBody: string;
  cssBg: string;
  cssCard: string;
  cssPrimary: string;
  cssText: string;
}

export type StylePreset = 'biblico' | 'historico' | 'moderno' | 'sobrio' | 'kids';
export type ImageProvider = 'ai' | 'upload' | 'none';

export interface GenerationOptions {
  numberOfSlides: number;
  slideCountMode: 'auto' | 10 | 20 | 30 | 40;
  audience: string;
  themeId: string;
  stylePreset: StylePreset;
  imageProvider: ImageProvider;
  bibleVersion: BibleVersion;
  includeQuestions: boolean;
  includeReferences: boolean;
  includeApplications: boolean;
  selectedAiModel: string;
}
