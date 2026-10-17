export type DepthControl = 'resumida' | 'detalhada' | 'aprofundada';
export type BibleVersion = 'ARC' | 'NVI' | 'NAA';

export interface TranscriptionSource {
  id: string;
  title: string;
  content: string;
  fileName?: string;
  youtubeUrl?: string;
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

/** @deprecated Usar `explicacao` linear no EBDSubtopicPreparation em vez de frase a frase */
export interface EBDFraseExplicativa {
  frase: string; // A frase/afirmação relevante extraída do texto do subtópico da lição
  explicacao: string; // Explicação didática e histórica direta para ministrar essa frase específica
  /** @deprecated Não utilizado mais — exemplos foram removidos do sistema */
  exemplo?: string;
}

export interface EBDSubtopicPreparation {
  number: string; // "1", "2", "3"
  title: string;
  projetor: string; // O que vai escrito no slide para os alunos (parágrafo literal ipsis litteris da revista)
  explicacao: string; // ✅ EXPLICAÇÃO DIDÁTICA LINEAR DO PROFESSOR: texto corrido fluido em parágrafos, com todas as referências das transcrições integradas
  /** @deprecated Dados legados. A nova geração usa apenas `explicacao` linear */
  frasesExplicativas?: EBDFraseExplicativa[];
  /** @deprecated Exemplos foram removidos do sistema */
  exemploAlusao?: string;
  contexto?: string; // Mantido como opcional por compatibilidade
  versiculos?: Array<{ reference: string; text: string; explicacao?: string }>; // Base Bíblica (ARC) com breve explicação
  aplicacao?: string; // Aplicação cristã e pentecostal
  enfase?: string; // Frase de destaque ("Aprenda com a Palavra...")
  cuidadoDoutrinario?: string; // 🔥 O QUE NÃO PODE SER DITO (Cuidado Doutrinário)
  palavrasOriginais?: EBDPalavraOriginal[]; // 🏛️ EXEGESE BÍBLICA: GREGO / HEBRAICO
  imagePrompt: string; // Prompt de imagem 16:9 contextual
  ideias?: EBDIdeia[]; // Mantido como opcional para compatibilidade com dados legados
  // 📝 NOTAS PRIVADAS DO PROFESSOR — aparecem apenas no Roteiro PDF
  notaVersiculos?: string;
  notaAplicacao?: string;
  notaEnfase?: string;
}

export interface ImageBox {
  x: number; // Posição horizontal (% do palco 16:9)
  y: number; // Posição vertical (% do palco 16:9)
  w: number; // Largura (% do palco 16:9)
  h: number; // Altura (% do palco 16:9)
  rot: number; // Rotação em graus (0 a 360)
  fit: 'fill' | 'cover' | 'contain';
  layer: 'back' | 'front';
  flipX?: boolean;
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
    imagePrompt?: string; // 🖼️ Prompt de imagem 16:9 para o Título da Lição (Capa dos Slides / Canva / AI)
  };
  textAureo: {
    text: string;
    reference: string;
    imagePrompt?: string; // 🖼️ Prompt de imagem 16:9 para o Texto Áureo
  };
  verdadePratica: {
    text: string;
    imagePrompt?: string; // 🖼️ Prompt de imagem 16:9 para a Verdade Prática
  };
  palavraChave?: {
    palavra: string; // 🔑 PALAVRA-CHAVE DA LIÇÃO (ex: "AUTORIA", "INSPIRAÇÃO")
    explicacao: string; // Explicação didática e teológica da palavra-chave para a aula
    imagePrompt?: string; // 🖼️ Prompt de imagem 16:9 para a Palavra-Chave
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
  perguntasFixacao?: Array<{
    pergunta: string;
    respostaEsperada?: string;
  }>;
  extraSlides?: EBDExtraSlide[];
  customSlideOrder?: string[];
  slideFontScales?: Record<string | number, number>;
  slideTitleFontScales?: Record<string | number, number>;
  slideBodyFontScales?: Record<string | number, number>;
  slideTextOverrides?: Record<string | number, { title?: string; subtitle?: string; text?: string }>;
  slideTitlePositions?: Record<string | number, { x: number; y: number }>;
  slideBodyPositions?: Record<string | number, { x: number; y: number }>;
  slideBodyWidths?: Record<string | number, number>;
  slideImagePositions?: Record<string | number, { x: number; y: number }>;
  slideImageScales?: Record<string | number, number>;
  slideImageWidths?: Record<string | number, number>;
  slideImageHeights?: Record<string | number, number>;
  slideImageCrops?: Record<string | number, { panX: number; panY: number; zoom: number }>;
  slideImageFits?: Record<string | number, 'cover' | 'contain'>;
  slideImageBorders?: Record<string | number, 'white' | 'thin' | 'thick' | 'none'>;
  slideImageBoxes?: Record<string, ImageBox>;
  projectorSlideImages?: Record<string | number, string>;
  projectorFontSizeScale?: number;
  customBg?: string | null;
  bodyTextColor?: 'black' | 'white';
  textHighlights?: Record<string, any>;
  revistaRawContent?: string;
}

export interface EBDExtraSlide {
  id: string;
  type: 'extra';
  title: string;
  badgeText?: string;
  projetorText?: string;
  subtitle?: string;
  reference?: string;
  bulletPoints?: string[];
  imagePrompt?: string;
  imageUrl?: string;
  imageScale?: number;
  imageFit?: 'cover' | 'contain';
  imageBorder?: 'white' | 'thin' | 'thick' | 'none';
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
  fontSizeScale?: number;
  imageScale?: number;
  imageFit?: 'cover' | 'contain';
  imageBorder?: 'white' | 'thin' | 'thick' | 'none';
  imageBox?: ImageBox;
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

export type ProjectorItemType =
  | 'cover'
  | 'aureo'
  | 'pratica'
  | 'palavra_chave'
  | 'na_licao_anterior'
  | 'ponte_contextual'
  | 'leitura'
  | 'topic_synopsis'
  | 'subtopic'
  | 'subtopic_explanation'
  | 'subtopic_verses'
  | 'subtopic_aplicacao'
  | 'enfase_palavra'
  | 'conclusao'
  | 'verdades'
  | 'extra';

export interface ProjectorItem {
  id: string;
  type: ProjectorItemType;
  title: string;
  subtitle?: string;
  bulletPoints?: string[];
  badgeText?: string;
  projetorText?: string;
  ideiaText?: string;
  reference?: string;
  imagePrompt?: string;
  imageUrl?: string;
  imageScale?: number;
  imageFit?: 'cover' | 'contain';
  imageBox?: ImageBox;
  onUpdateText?: (val: string) => void;
  onUpdateTitle?: (val: string) => void;
  onUpdateSubtitle?: (val: string) => void;
  onUpdateReference?: (val: string) => void;
  onUpdateBulletPoint?: (idx: number, val: string) => void;
}

