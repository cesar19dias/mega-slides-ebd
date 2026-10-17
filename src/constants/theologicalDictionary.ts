/**
 * Dicionário teológico e etimológico centralizado para palavras-chave da EBD
 */

export const THEOLOGICAL_KEYWORDS_FALLBACK: Record<string, string> = {
  FIDELIDADE: "No hebraico 'emûnāh (raiz 'āman, firmeza, verdade) e no grego pistis/pistos (confiança, lealdade), a fidelidade evoca a ideia de estabilidade inabalável, firmeza e verdade permanente, semelhante a uma rocha inabalável. A fidelidade não é apenas algo que Deus faz, mas a própria essência do Seu caráter imutável; Ele permanece constante e digno de confiança, independentemente das falhas ou circunstâncias humanas.",
};

export function getTheologicalKeywordExplanation(keyword: string | undefined, currentExplanation?: string): string {
  if (!keyword) return currentExplanation || '';
  const upper = keyword.trim().toUpperCase();
  const fallback = THEOLOGICAL_KEYWORDS_FALLBACK[upper];
  if (fallback && (!currentExplanation || currentExplanation.trim().length < 20 || !currentExplanation.includes('hebraico'))) {
    return fallback;
  }
  return currentExplanation || '';
}
