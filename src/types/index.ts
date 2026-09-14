export type DepthControl = 'resumida' | 'detalhada' | 'aprofundada';
export type BibleVersion = 'ARC' | 'NVI' | 'NAA';

export interface TranscriptionSource {
  id: string;
  title: string;
  content: string;
  fileName?: string;
}

export interface EBDPalavraOriginal {
  termo: string; // Grafia no alfabeto original (ex: λοιμός ou שָׁלוֹם)
  transliteracao: string; // Pronúncia/transliteração legível em português (ex: Loimós)
  idioma: 'Grego' | 'Hebraico';
  significado: string; // Significado literal e etimológico
  explicacao: string; // Aplicação exegética e teológica para o ensino do professor
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
    palavrasOriginais?: EBDPalavraOriginal[]; // 🏛️ EXEGESE BÍBLICA: VOCABULÁRIO NO ORIGINAL (GREGO / HEBRAICO)
  };
  imagePrompt: string; // Prompt de imagem 16:9 contextual para Canva / AI
}

export interface EBDFraseExplicativa {
  frase: string; // A frase/afirmação relevante extraída do texto do subtópico da lição
  explicacao: string; // Explicação didática e histórica direta para ministrar essa frase específica
  exemplo?: string; // 💡 Exemplo prático / Ilustração / Alusão do dia a dia ou analógica para a sala de aula
}

export interface EBDSubtopicPreparation {
  number: string; // "1", "2", "3"
  title: string;
  projetor: string; // O que vai escrito no slide para os alunos (frase central do subtópico)
  explicacao: string; // Explicação didática do professor (texto corrido)
  frasesExplicativas?: EBDFraseExplicativa[]; // Explicação frase por frase (constante)
  exemploAlusao?: string; // 💡 Exemplo / Alusão prática do subtópico para ilustrar na aula
  contexto?: string; // Mantido como opcional por compatibilidade
  versiculos?: Array<{ reference: string; text: string }>; // Base Bíblica (ARC)
  aplicacao?: string; // Aplicação cristã e pentecostal
  enfase?: string; // Frase de destaque ("Aprenda com a Palavra...")
  cuidadoDoutrinario?: string; // 🔥 O QUE NÃO PODE SER DITO (Cuidado Doutrinário)
  palavrasOriginais?: EBDPalavraOriginal[]; // 🏛️ EXEGESE BÍBLICA: GREGO / HEBRAICO
  imagePrompt: string; // Prompt de imagem 16:9 contextual
  ideias?: EBDIdeia[]; // Mantido como opcional para compatibilidade com dados legados
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
    ponteContextual?: {
      enabled: boolean;
      naLicaoAnterior?: string; // 1- NA LIÇÃO ANTERIOR: resumo bem breve da lição anterior
      ponteContextual?: string; // 2- PONTE CONTEXTUAL: resumo breve dos capítulos entre a lição anterior e a atual
      ondeParou?: string;
      capitulosIntermediarios?: string;
      ganchoAulaAtual?: string;
      projetor?: string;
    };
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
  hasContextualBridge?: boolean;
  previousLessonContext?: string;
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
